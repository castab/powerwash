"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BookingEventType, BookingStatus, PaymentStatus, type Prisma } from "@/generated/prisma/client";
import { createHeldBooking, findValidatedAddressByPlaceId, releaseHeldBooking } from "@/lib/booking";
import { fetchPlaceDetails } from "@/lib/google-places";
import { createBookingEvent, pickBookingEventState } from "@/lib/booking-events";
import { verifyBookingFormToken } from "@/lib/booking-form-token";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { getEnv } from "@/lib/env";
import {
  canAutoRefundBooking,
  getManagedCustomerByToken,
  rotateAndSendManageCustomerEmail,
  sendCancellationOutcomeEmail,
} from "@/lib/booking-management";
import { reconcileCheckoutSession } from "@/lib/stripe-reconciliation";
import { getStripe } from "@/lib/stripe";
import { bookingSchema } from "@/lib/validators";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";
import {
  checkServiceEligibility,
  findFreshEligibleAddressMemo,
  getBusinessSettings,
  isServiceAreaConfigured,
} from "@/lib/service-area";
import { getClientIp } from "@/lib/request-ip";
import { getRequestOrigin } from "@/lib/request-origin";
import { formatCurrency, toStripeCents } from "@/lib/utils";

export type BookingActionState = {
  // "success" is only ever a *feigned* completion returned to a detected bot
  // (honeypot filled / impossibly fast submit); genuine customers are redirected
  // to Stripe and never see it. It creates no booking, hold, or Stripe session.
  status: "idle" | "error" | "success";
  message: string;
  // Address-related rejections carry a code so the wizard can jump the customer
  // back to the address field instead of leaving the error on the review step.
  code?: "out_of_area" | "address_not_found" | "service_area_unavailable" | "address_not_verified";
};

// Anti-bot bounds for the signed booking-form token: a booking that reaches the
// review step took far longer than a few seconds to fill, so a submit younger
// than MIN is scripted; MAX bounds how long a rendered form stays valid.
const BOOKING_FORM_TOKEN_MIN_AGE_MS = 3_000;
const BOOKING_FORM_TOKEN_MAX_AGE_MS = 3 * 60 * 60 * 1000;

// Returned to a detected bot so the automated flow "succeeds" without touching
// the DB or Stripe — no slot is held and no signal is given that it was caught.
const FEIGNED_SUCCESS: BookingActionState = {
  status: "success",
  message:
    "Thanks! Your request has been received. Check your email for confirmation details.",
};

// Per-instance, in-memory debounce for confirmation-page reconciliation. This is
// NOT a global lock: on a multi-instance deploy (e.g. Vercel, where each lambda
// has its own module memory) the debounce is per-instance, so two instances can
// each reconcile the same session once. That is harmless — reconciliation is
// idempotent and the Stripe webhook is the source of truth; this map only trims
// redundant confirmation-page re-checks on a single instance.
const recentConfirmationReconciliations = new Map<string, number>();

function getConfirmationReconcileConfig() {
  const env = getEnv();

  return {
    debounceMs: env.confirmationReconcileDebounceMs,
    mapMaxSize: env.confirmationReconcileMapMaxSize,
  };
}

function pruneRecentConfirmationReconciliations(
  now: number,
  config: ReturnType<typeof getConfirmationReconcileConfig>,
) {
  for (const [sessionId, attemptedAt] of recentConfirmationReconciliations) {
    if (now - attemptedAt >= config.debounceMs) {
      recentConfirmationReconciliations.delete(sessionId);
    }
  }

  if (recentConfirmationReconciliations.size < config.mapMaxSize) {
    return;
  }

  const entries = [...recentConfirmationReconciliations.entries()].sort((a, b) => a[1] - b[1]);
  const overflowCount = recentConfirmationReconciliations.size - config.mapMaxSize + 1;

  for (const [sessionId] of entries.slice(0, overflowCount)) {
    recentConfirmationReconciliations.delete(sessionId);
  }
}

// The client posts Places addressComponents as a JSON string; anything
// unparseable is dropped rather than failing the booking.
function parseAddressComponents(raw: string | undefined) {
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

function buildManageRedirect(token: string, params: Record<string, string>) {
  const searchParams = new URLSearchParams({ token, ...params });
  return `/booking/manage?${searchParams.toString()}`;
}

function isRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

async function cancelManagedBooking(token: string, bookingId: string, confirmedInsideWindow: boolean) {
  const customer = await getManagedCustomerByToken(token);

  if (!customer) {
    redirect("/booking/manage?error=invalid_link");
  }

  // The customerId predicate is the authorization check: a valid token can only
  // reach bookings owned by the customer it was issued to.
  const booking = bookingId
    ? await prisma.booking.findFirst({
        where: { id: bookingId, customerId: customer.id },
      })
    : null;

  if (!booking) {
    redirect(buildManageRedirect(token, { error: "booking_not_found" }));
  }

  if (booking.status === BookingStatus.CANCELLED) {
    const result =
      booking.paymentStatus === PaymentStatus.REFUNDED
        ? "already_cancelled_refunded"
        : "already_cancelled";
    redirect(buildManageRedirect(token, { result }));
  }

  if (booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.NO_SHOW) {
    redirect(buildManageRedirect(token, { error: "cannot_cancel_terminal" }));
  }

  if (booking.archivedAt) {
    redirect(buildManageRedirect(token, { error: "archived_view_only" }));
  }

  if (
    booking.status !== BookingStatus.CONFIRMED ||
    booking.paymentStatus !== PaymentStatus.PARTIALLY_PAID
  ) {
    redirect(buildManageRedirect(token, { error: "not_cancellable" }));
  }

  const beforeState = pickBookingEventState(booking);

  if (!canAutoRefundBooking(booking.startAt)) {
    if (!confirmedInsideWindow) {
      redirect(buildManageRedirect(token, { error: "confirm_required" }));
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        refundReason: "CUSTOMER_CANCELLED_INSIDE_24_HOURS",
      },
    });

    await createBookingEvent({
      bookingId: booking.id,
      type: BookingEventType.BOOKING_CANCELLED,
      actorLabel: "customer",
      beforeState,
      afterState: pickBookingEventState(updated),
    });

    try {
      await sendCancellationOutcomeEmail(booking.id, "cancelled_contact_admin");
    } catch (error) {
      console.error("Failed to send no-auto-refund cancellation email", error);
    }

    revalidatePath("/admin/bookings");
    redirect(buildManageRedirect(token, { result: "cancelled_contact_admin" }));
  }

  if (!booking.stripePaymentIntentId) {
    redirect(buildManageRedirect(token, { error: "refund_unavailable" }));
  }

  const stripe = getStripe();
  const refund = await stripe.refunds.create(
    {
      payment_intent: booking.stripePaymentIntentId,
      amount: toStripeCents(booking.depositAmount),
      reason: "requested_by_customer",
      metadata: {
        bookingId: booking.id,
      },
    },
    {
      idempotencyKey: `booking-cancel-refund-${booking.id}`,
    },
  );

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: BookingStatus.CANCELLED,
      paymentStatus: PaymentStatus.REFUNDED,
      cancelledAt: new Date(),
      refundedAt: new Date(),
      refundAmount: booking.depositAmount,
      refundReason: "CUSTOMER_CANCELLED_24_HOURS_PLUS",
      stripeRefundId: refund.id,
    },
  });

  await createBookingEvent({
    bookingId: booking.id,
    type: BookingEventType.REFUND_ISSUED,
    actorLabel: "customer",
    beforeState,
    afterState: pickBookingEventState(updated),
  });

  try {
    await sendCancellationOutcomeEmail(booking.id, "cancelled_refunded");
  } catch (error) {
    console.error("Failed to send refunded cancellation email", error);
  }

  revalidatePath("/admin/bookings");
  redirect(buildManageRedirect(token, { result: "cancelled_refunded" }));
}

export async function createBookingCheckoutAction(
  _prevState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  // Anti-bot gate — runs before any validation, hold, or Stripe session so a
  // detected bot never blocks a slot. Layers: (1) honeypot decoy field, (2) a
  // signed proof-of-render token that also enforces a minimum fill time, and
  // (3) Cloudflare Turnstile (checked after the rate limit, below). Naive bots
  // are fed a feigned success so they don't learn they were caught.
  const honeypot = formData.get("company");
  if (typeof honeypot === "string" && honeypot.trim().length > 0) {
    return FEIGNED_SUCCESS;
  }

  const tokenResult = verifyBookingFormToken(
    formData.get("formToken"),
    getEnv().bookingFormSecret,
    {
      minAgeMs: BOOKING_FORM_TOKEN_MIN_AGE_MS,
      maxAgeMs: BOOKING_FORM_TOKEN_MAX_AGE_MS,
    },
  );
  if (!tokenResult.ok) {
    // An impossibly fast submit is a bot — feign success. Missing/forged/expired
    // tokens are more likely a stale tab or a crafted request; ask to refresh.
    if (tokenResult.reason === "too_fast") {
      return FEIGNED_SUCCESS;
    }
    return {
      status: "error",
      message: "Your booking session expired. Please refresh the page and try again.",
    };
  }

  const parsed = bookingSchema.safeParse({
    serviceId: formData.get("serviceId"),
    date: formData.get("date"),
    startAt: formData.get("startAt"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    vehicleDescription: formData.get("vehicleDescription"),
    color: formData.get("color"),
    licensePlate: formData.get("licensePlate"),
    notes: formData.get("notes"),
    address: formData.get("address"),
    addressPlaceId: formData.get("addressPlaceId") ?? undefined,
    addressLat: formData.get("addressLat") ?? undefined,
    addressLng: formData.get("addressLng") ?? undefined,
    addressComponents: formData.get("addressComponents") ?? undefined,
    addressValidated: formData.get("addressValidated"),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    // Address-field failures (missing placeId, unvalidated entry) get a code so
    // the wizard bounces the customer back to the address step.
    const isAddressIssue =
      typeof firstIssue?.path[0] === "string" && firstIssue.path[0].startsWith("address");
    return {
      status: "error",
      ...(isAddressIssue ? { code: "address_not_verified" as const } : {}),
      message: firstIssue?.message ?? "Please review the form.",
    };
  }

  // Throttle checkout creation: each attempt places a DB hold and opens a Stripe
  // Checkout session, so this is the expensive public path worth protecting.
  const ip = await getClientIp();
  const rate = consumeRateLimit(`booking-checkout:ip:${ip}`, RATE_LIMITS.bookingCheckout);
  if (!rate.ok) {
    return {
      status: "error",
      message: "Too many booking attempts. Please wait a moment and try again.",
    };
  }

  // Cloudflare Turnstile — the final bot gate before the paid service-area check
  // and the DB hold. Skipped automatically when no secret is configured.
  const turnstile = await verifyTurnstileToken(formData.get("turnstileToken"), ip);
  if (!turnstile.ok) {
    return {
      status: "error",
      message: "We couldn't verify that you're human. Please complete the check and try again.",
    };
  }

  // Service-area gate. Runs before the DB hold and the Stripe session so an
  // out-of-area customer is turned away before any money or slot is involved.
  // Policy: unconfigured settings skip the check (first-run friendly); a
  // Routes API failure blocks with a retry message (never admit unverified
  // addresses); a fresh per-address memo skips the paid Routes call entirely.
  let eligibility: { travelDurationSeconds: number; checkedAt: Date } | null = null;

  const settings = await getBusinessSettings();

  if (!isServiceAreaConfigured(settings)) {
    console.warn("Service area is not configured; skipping the travel-time check for this booking.");
  } else {
    const memo = await findFreshEligibleAddressMemo({
      email: parsed.data.email,
      address: parsed.data.address,
      placeId: parsed.data.addressPlaceId,
    });

    if (memo && memo.travelDurationSeconds !== null && memo.eligibilityCheckedAt !== null) {
      eligibility = {
        travelDurationSeconds: memo.travelDurationSeconds,
        checkedAt: memo.eligibilityCheckedAt,
      };
    } else {
      const decision = await checkServiceEligibility({
        address: parsed.data.address,
        placeId: parsed.data.addressPlaceId,
        lat: parsed.data.addressLat,
        lng: parsed.data.addressLng,
      });

      if (decision.status === "ineligible") {
        return {
          status: "error",
          code: "out_of_area",
          message:
            "Unfortunately, that address is outside our current service area, so we aren't able to book this appointment. We're sorry we can't come to you this time!",
        };
      }

      if (decision.status === "address_not_found") {
        return {
          status: "error",
          code: "address_not_found",
          message: "We couldn't find that address. Please double-check it and try again.",
        };
      }

      if (decision.status === "unavailable") {
        return {
          status: "error",
          code: "service_area_unavailable",
          message:
            "We couldn't verify your service address just now. Please try again in a minute — your appointment time hasn't been taken.",
        };
      }

      if (decision.status === "eligible") {
        eligibility = {
          travelDurationSeconds: decision.travelDurationSeconds,
          checkedAt: new Date(),
        };
      }
      // "unconfigured" here means the settings were cleared mid-request; treat
      // it the same as the skip path above.
    }
  }

  // Canonical address resolution. The client-supplied address text is never
  // trusted for persistence: a spoofed client could pair a valid in-area
  // placeId with arbitrary text. Resolve the placeId through Place Details and
  // persist Google's canonical address instead — unless a validated stored row
  // for this placeId already holds it (re-booking fast path, no API call).
  let canonicalAddress = {
    address: parsed.data.address,
    lat: parsed.data.addressLat,
    lng: parsed.data.addressLng,
    components: parseAddressComponents(parsed.data.addressComponents),
  };

  const storedCanonical = await findValidatedAddressByPlaceId(
    parsed.data.email,
    parsed.data.addressPlaceId,
  );

  if (!storedCanonical) {
    const details = await fetchPlaceDetails(parsed.data.addressPlaceId);

    if (details.status === "not_found") {
      return {
        status: "error",
        code: "address_not_found",
        message: "We couldn't find that address. Please double-check it and try again.",
      };
    }

    if (details.status === "error") {
      // Same policy as the service-area gate: never admit an unverified
      // address; ask the customer to retry instead.
      return {
        status: "error",
        code: "service_area_unavailable",
        message:
          "We couldn't verify your service address just now. Please try again in a minute — your appointment time hasn't been taken.",
      };
    }

    canonicalAddress = {
      address: details.formattedAddress,
      lat: details.lat,
      lng: details.lng,
      components: details.components as Prisma.InputJsonValue | undefined,
    };
  }

  let heldBookingId: string | null = null;

  try {
    const env = getEnv();
    const appOrigin = await getRequestOrigin(env.appUrl);
    const startAt = new Date(parsed.data.startAt);
    const booking = await createHeldBooking({
      ...parsed.data,
      address: canonicalAddress.address,
      addressLat: canonicalAddress.lat,
      addressLng: canonicalAddress.lng,
      addressComponents: canonicalAddress.components,
      startAtIso: parsed.data.startAt,
      startAt,
      eligibility,
    });
    heldBookingId = booking.id;

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Deferred payment methods (ACH and friends) settle over days, which is
      // incompatible with the short slot hold — keep Checkout to instant methods.
      payment_method_types: ["card"],
      customer_email: booking.customer.email,
      // Expire the Checkout session together with the hold so a lapsed hold
      // can neither block the slot nor be paid for after it is released.
      expires_at: booking.paymentExpiresAt
        ? Math.floor(booking.paymentExpiresAt.getTime() / 1000)
        : undefined,
      metadata: {
        bookingId: booking.id,
        checkoutPurpose: "deposit",
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: toStripeCents(booking.depositAmount),
            product_data: {
              name: `${booking.service.name} deposit`,
              description: `Remaining balance outstanding after deposit: ${formatCurrency(booking.balanceDue)}`,
            },
          },
        },
      ],
      success_url: `${appOrigin}/booking/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/book?serviceId=${booking.serviceId}`,
    });

    await prisma.booking.update({
      where: { id: booking.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    redirect(session.url ?? `${appOrigin}/booking/confirmation`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    if (heldBookingId) {
      try {
        await releaseHeldBooking(heldBookingId, "checkout-setup-failed");
      } catch (releaseError) {
        console.error("Failed to release held booking after checkout error", releaseError);
      }
    }

    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unable to start checkout. Please try again.",
    };
  }
}

export async function cancelManagedBookingAction(token: string, formData: FormData) {
  const bookingId = formData.get("bookingId");

  try {
    await cancelManagedBooking(
      token,
      typeof bookingId === "string" ? bookingId : "",
      formData.get("confirmInsideWindow") === "true",
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(buildManageRedirect(token, { error: "cancel_failed" }));
  }
}

export async function resendManagedBookingLinkAction(token: string) {
  try {
    const customer = await getManagedCustomerByToken(token);

    if (!customer) {
      redirect("/booking/manage?error=invalid_link");
    }

    const nextToken = await rotateAndSendManageCustomerEmail(customer.id);
    if (!nextToken) {
      redirect(buildManageRedirect(token, { error: "resend_failed" }));
    }
    redirect(buildManageRedirect(nextToken, { result: "resent" }));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(buildManageRedirect(token, { error: "resend_failed" }));
  }
}

// Invoked by the confirmation page's poll loop while a payment is finalizing.
// The webhook remains the fast path; this is the on-page fallback that pulls
// the session state from Stripe when the webhook is late or lost. The debounce
// keeps a polling tab from hammering Stripe — the client fires this at most a
// couple of times per polling window, spaced wider than the debounce.
export async function pollConfirmationReconcileAction(sessionId: string): Promise<{ ok: boolean }> {
  if (typeof sessionId !== "string" || sessionId.length === 0 || sessionId.length > 500) {
    return { ok: false };
  }

  const now = Date.now();
  const config = getConfirmationReconcileConfig();
  pruneRecentConfirmationReconciliations(now, config);
  const lastAttemptAt = recentConfirmationReconciliations.get(sessionId) ?? 0;

  if (now - lastAttemptAt < config.debounceMs) {
    return { ok: true };
  }

  recentConfirmationReconciliations.set(sessionId, now);

  try {
    const result = await reconcileCheckoutSession({
      sessionId,
      trigger: "booking-confirmation",
    });

    if (result.stateChanged) {
      revalidatePath("/booking/confirmation");
      revalidatePath("/booking/manage");
      revalidatePath("/admin/bookings");
    }

    return { ok: true };
  } catch (error) {
    console.error("Failed to reconcile checkout session from confirmation poll", error);
    return { ok: false };
  }
}
