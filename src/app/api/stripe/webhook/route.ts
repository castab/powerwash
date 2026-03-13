import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { BookingEventType, BookingStatus, PaymentStatus } from "@prisma/client";
import { ensureInitialManageBookingEmail } from "@/lib/booking-management";
import { createBookingEvent, pickBookingEventState } from "@/lib/booking-events";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

function getCheckoutPurpose(session: { metadata?: Record<string, string | undefined> | null }) {
  return session.metadata?.checkoutPurpose === "balance" ? "balance" : "deposit";
}

function getBalanceRequestVersion(session: { metadata?: Record<string, string | undefined> | null }) {
  const raw = session.metadata?.balanceRequestVersion;
  const version = raw ? Number(raw) : NaN;
  return Number.isInteger(version) ? version : null;
}

export async function POST(request: Request) {
  const env = getEnv();
  const stripe = getStripe();
  const body = await request.text();
  const signature = (await headers()).get("stripe-signature");

  if (!signature || !env.stripeWebhookSecret) {
    return NextResponse.json({ error: "Missing webhook signature." }, { status: 400 });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, env.stripeWebhookSecret);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook signature error." },
      { status: 400 },
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const bookingId = session.metadata?.bookingId;
    const checkoutPurpose = getCheckoutPurpose(session);

    if (bookingId) {
      const before = await prisma.booking.findUnique({
        where: { id: bookingId },
      });

      if (before) {
        if (checkoutPurpose === "deposit") {
          const updated = await prisma.booking.update({
            where: { id: bookingId },
            data: {
              status: BookingStatus.CONFIRMED,
              paymentStatus: PaymentStatus.PARTIALLY_PAID,
              confirmedAt: new Date(),
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId:
                typeof session.payment_intent === "string" ? session.payment_intent : null,
            },
          });

          await createBookingEvent({
            bookingId,
            type: BookingEventType.PAYMENT_CONFIRMED,
            actorLabel: "stripe-webhook",
            beforeState: pickBookingEventState(before),
            afterState: pickBookingEventState(updated),
          });

          await ensureInitialManageBookingEmail(bookingId);
        } else {
          const version = getBalanceRequestVersion(session);
          const isActiveRequest =
            version !== null &&
            before.balanceRequestVersion === version &&
            before.balanceCheckoutSessionId === session.id &&
            before.paymentStatus === PaymentStatus.PARTIALLY_PAID;

          if (isActiveRequest) {
            const updated = await prisma.booking.update({
              where: { id: bookingId },
              data: {
                paymentStatus: PaymentStatus.PAID,
                balanceDue: 0,
                balancePaymentIntentId:
                  typeof session.payment_intent === "string" ? session.payment_intent : null,
                balancePaidAt: new Date(),
              },
            });

            await createBookingEvent({
              bookingId,
              type: BookingEventType.BALANCE_PAYMENT_CONFIRMED,
              actorLabel: "stripe-webhook",
              beforeState: pickBookingEventState(before),
              afterState: pickBookingEventState(updated),
            });
          }
        }
      }
    }
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object;
    const bookingId = session.metadata?.bookingId;
    const checkoutPurpose = getCheckoutPurpose(session);

    if (bookingId) {
      const before = await prisma.booking.findUnique({
        where: { id: bookingId },
      });

      if (before) {
        if (checkoutPurpose === "deposit") {
          const updated = await prisma.booking.update({
            where: { id: bookingId },
            data: {
              status: BookingStatus.CANCELLED,
              paymentStatus: PaymentStatus.FAILED,
              cancelledAt: new Date(),
            },
          });

          await createBookingEvent({
            bookingId,
            type: BookingEventType.PAYMENT_FAILED,
            actorLabel: "stripe-webhook",
            beforeState: pickBookingEventState(before),
            afterState: pickBookingEventState(updated),
          });
        } else {
          const version = getBalanceRequestVersion(session);
          const isActiveRequest =
            version !== null &&
            before.balanceRequestVersion === version &&
            before.balanceCheckoutSessionId === session.id &&
            before.paymentStatus === PaymentStatus.PARTIALLY_PAID;

          if (isActiveRequest) {
            const updated = await prisma.booking.update({
              where: { id: bookingId },
              data: {
                balanceCheckoutSessionId: null,
              },
            });

            await createBookingEvent({
              bookingId,
              type: BookingEventType.BALANCE_PAYMENT_FAILED,
              actorLabel: "stripe-webhook",
              beforeState: pickBookingEventState(before),
              afterState: pickBookingEventState(updated),
            });
          }
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
