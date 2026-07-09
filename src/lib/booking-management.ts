import { BookingEventType, BookingStatus, PaymentStatus, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { createBookingEvent, pickBookingEventState } from "@/lib/booking-events";
import { createManageToken, verifyManageToken, type ManageTokenPayload } from "@/lib/manage-token";
import { shouldSendDepositRecoveryEmail } from "@/lib/stripe-reconciliation-decisions";
import { formatCurrency } from "@/lib/utils";

const AUTO_REFUND_WINDOW_HOURS = 24;
const ARCHIVED_CUSTOMER_ACCESS_MONTHS = 18;

const bookingManagementInclude = {
  service: true,
} satisfies Prisma.BookingInclude;

export type ManagedBooking = Prisma.BookingGetPayload<{
  include: typeof bookingManagementInclude;
}>;

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function formatBookingDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

function getManagePayloadForBooking(booking: Pick<ManagedBooking, "id" | "manageTokenVersion" | "manageTokenRotatedAt">): ManageTokenPayload {
  return {
    bookingId: booking.id,
    version: booking.manageTokenVersion,
    rotatedAt: booking.manageTokenRotatedAt?.getTime() ?? 0,
  };
}

export function getManagementUrl(token: string) {
  const env = getEnv();
  const url = new URL("/booking/manage", env.appUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export function getManagementTokenForBooking(
  booking: Pick<ManagedBooking, "id" | "manageTokenVersion" | "manageTokenRotatedAt">,
) {
  if (booking.manageTokenVersion < 1 || !booking.manageTokenRotatedAt) {
    return null;
  }

  return createManageToken(getManagePayloadForBooking(booking), getEnv().manageLinkSecret);
}

export function getManagementUrlForBooking(
  booking: Pick<ManagedBooking, "id" | "manageTokenVersion" | "manageTokenRotatedAt">,
) {
  const token = getManagementTokenForBooking(booking);
  return token ? getManagementUrl(token) : null;
}

function getSupportCopy() {
  const env = getEnv();
  return env.supportEmail
    ? `Please reply to ${env.supportEmail} if you need help with your booking.`
    : "Please contact the business directly if you need help with your booking.";
}

export function canAutoRefundBooking(startAt: Date, now = new Date()) {
  return startAt.getTime() - now.getTime() >= AUTO_REFUND_WINDOW_HOURS * 60 * 60 * 1000;
}

export function getArchivedCustomerAccessEndsAt(archivedAt: Date) {
  return addMonths(archivedAt, ARCHIVED_CUSTOMER_ACCESS_MONTHS);
}

export function isArchivedCustomerAccessExpired(
  booking: Pick<ManagedBooking, "archivedAt" | "customerAccessEndsAt">,
  now = new Date(),
) {
  return Boolean(
    booking.archivedAt &&
      booking.customerAccessEndsAt &&
      booking.customerAccessEndsAt.getTime() <= now.getTime(),
  );
}

export function getBookingManagementMessageCode(
  booking: Pick<ManagedBooking, "status" | "paymentStatus" | "startAt">,
) {
  if (booking.status === BookingStatus.CANCELLED) {
    return booking.paymentStatus === PaymentStatus.REFUNDED
      ? "already_cancelled_refunded"
      : "already_cancelled";
  }

  if (booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.NO_SHOW) {
    return "cannot_cancel_terminal";
  }

  if (booking.paymentStatus === PaymentStatus.PAID) {
    return "cannot_cancel_terminal";
  }

  return canAutoRefundBooking(booking.startAt) ? "auto_refund_available" : "manual_refund_only";
}

export async function getManagedBookingByToken(token: string) {
  const payload = verifyManageToken(token, getEnv().manageLinkSecret);

  if (!payload) {
    return null;
  }

  const booking = await prisma.booking.findUnique({
    where: { id: payload.bookingId },
    include: bookingManagementInclude,
  });

  if (!booking || booking.manageTokenVersion < 1 || !booking.manageTokenRotatedAt) {
    return null;
  }

  if (isArchivedCustomerAccessExpired(booking)) {
    return null;
  }

  const currentPayload = getManagePayloadForBooking(booking);

  if (
    currentPayload.version !== payload.version ||
    currentPayload.rotatedAt !== payload.rotatedAt
  ) {
    return null;
  }

  return booking;
}

function buildManageEmail(booking: ManagedBooking, manageUrl: string) {
  const serviceDate = formatBookingDateTime(booking.startAt);
  const supportCopy = getSupportCopy();
  const balanceCopy =
    booking.paymentStatus === PaymentStatus.PAID
      ? `Paid in full: ${formatCurrency(booking.totalPrice)}`
      : `Remaining balance: ${formatCurrency(booking.balanceDue)}`;

  return {
    subject: `Manage your ${booking.service.name} booking`,
    text: [
      `Hi ${booking.firstName},`,
      "",
      `Your ${booking.service.name} booking for ${serviceDate} is confirmed.`,
      `Deposit paid: ${formatCurrency(booking.depositAmount)}`,
      balanceCopy,
      "",
      "Use the secure link below to view or cancel your booking:",
      manageUrl,
      "",
      "Cancellations made at least 24 hours before the appointment receive an automatic refund of the deposit.",
      `Cancellations inside 24 hours are not automatically refunded. ${supportCopy}`,
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
        <p>Hi ${booking.firstName},</p>
        <p>Your <strong>${booking.service.name}</strong> booking for <strong>${serviceDate}</strong> is confirmed.</p>
        <p>Deposit paid: <strong>${formatCurrency(booking.depositAmount)}</strong><br />${balanceCopy}</p>
        <p>Use the secure link below to view or cancel your booking:</p>
        <p><a href="${manageUrl}">${manageUrl}</a></p>
        <p>Cancellations made at least 24 hours before the appointment receive an automatic refund of the deposit.</p>
        <p>Cancellations inside 24 hours are not automatically refunded. ${supportCopy}</p>
      </div>
    `,
  };
}

function buildRefundedCancellationEmail(booking: ManagedBooking) {
  const serviceDate = formatBookingDateTime(booking.startAt);

  return {
    subject: `Your ${booking.service.name} booking was canceled`,
    text: [
      `Hi ${booking.firstName},`,
      "",
      `Your ${booking.service.name} booking for ${serviceDate} has been canceled.`,
      `Stripe has been asked to refund your deposit of ${formatCurrency(booking.refundAmount ?? booking.depositAmount)}.`,
      "Depending on your bank, it may take a few business days for the refund to appear.",
      "",
      getSupportCopy(),
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
        <p>Hi ${booking.firstName},</p>
        <p>Your <strong>${booking.service.name}</strong> booking for <strong>${serviceDate}</strong> has been canceled.</p>
        <p>Stripe has been asked to refund your deposit of <strong>${formatCurrency(booking.refundAmount ?? booking.depositAmount)}</strong>.</p>
        <p>Depending on your bank, it may take a few business days for the refund to appear.</p>
        <p>${getSupportCopy()}</p>
      </div>
    `,
  };
}

function buildAdminRefundedCancellationEmail(booking: ManagedBooking) {
  const serviceDate = formatBookingDateTime(booking.startAt);

  return {
    subject: `Your ${booking.service.name} deposit refund was issued`,
    text: [
      `Hi ${booking.firstName},`,
      "",
      `The deposit refund for your canceled ${booking.service.name} booking on ${serviceDate} has been issued.`,
      `Refund amount: ${formatCurrency(booking.refundAmount ?? booking.depositAmount)}`,
      "Depending on your bank, it may take a few business days for the refund to appear.",
      "",
      getSupportCopy(),
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
        <p>Hi ${booking.firstName},</p>
        <p>The deposit refund for your canceled <strong>${booking.service.name}</strong> booking on <strong>${serviceDate}</strong> has been issued.</p>
        <p>Refund amount: <strong>${formatCurrency(booking.refundAmount ?? booking.depositAmount)}</strong></p>
        <p>Depending on your bank, it may take a few business days for the refund to appear.</p>
        <p>${getSupportCopy()}</p>
      </div>
    `,
  };
}

function buildAdminCancelledRefundedEmail(booking: ManagedBooking) {
  const serviceDate = formatBookingDateTime(booking.startAt);

  return {
    subject: `Your ${booking.service.name} booking was administratively canceled`,
    text: [
      `Hi ${booking.firstName},`,
      "",
      `Your ${booking.service.name} booking for ${serviceDate} was administratively canceled.`,
      `Your deposit refund of ${formatCurrency(booking.refundAmount ?? booking.depositAmount)} has been issued.`,
      "Depending on your bank, it may take a few business days for the refund to appear.",
      "",
      getSupportCopy(),
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
        <p>Hi ${booking.firstName},</p>
        <p>Your <strong>${booking.service.name}</strong> booking for <strong>${serviceDate}</strong> was administratively canceled.</p>
        <p>Your deposit refund of <strong>${formatCurrency(booking.refundAmount ?? booking.depositAmount)}</strong> has been issued.</p>
        <p>Depending on your bank, it may take a few business days for the refund to appear.</p>
        <p>${getSupportCopy()}</p>
      </div>
    `,
  };
}

function buildAdminFullRefundEmail(booking: ManagedBooking) {
  const serviceDate = formatBookingDateTime(booking.startAt);

  return {
    subject: `Your ${booking.service.name} booking was fully refunded`,
    text: [
      `Hi ${booking.firstName},`,
      "",
      `A full refund has been issued for your ${booking.service.name} booking on ${serviceDate}.`,
      `Refund amount: ${formatCurrency(booking.refundAmount ?? booking.totalPrice)}`,
      "This includes your deposit and remaining balance payment.",
      "Depending on your bank, it may take a few business days for the refund to appear.",
      "",
      getSupportCopy(),
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
        <p>Hi ${booking.firstName},</p>
        <p>A full refund has been issued for your <strong>${booking.service.name}</strong> booking on <strong>${serviceDate}</strong>.</p>
        <p>Refund amount: <strong>${formatCurrency(booking.refundAmount ?? booking.totalPrice)}</strong></p>
        <p>This includes your deposit and remaining balance payment.</p>
        <p>Depending on your bank, it may take a few business days for the refund to appear.</p>
        <p>${getSupportCopy()}</p>
      </div>
    `,
  };
}

function buildManualCancellationEmail(booking: ManagedBooking) {
  const serviceDate = formatBookingDateTime(booking.startAt);
  const env = getEnv();
  const supportLine = env.supportEmail
    ? `For refund help, please contact ${env.supportEmail}.`
    : "For refund help, please contact the business directly.";

  return {
    subject: `Your ${booking.service.name} booking was canceled`,
    text: [
      `Hi ${booking.firstName},`,
      "",
      `Your ${booking.service.name} booking for ${serviceDate} has been canceled.`,
      "Because the cancellation happened inside 24 hours of the appointment, no automatic refund was issued.",
      supportLine,
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
        <p>Hi ${booking.firstName},</p>
        <p>Your <strong>${booking.service.name}</strong> booking for <strong>${serviceDate}</strong> has been canceled.</p>
        <p>Because the cancellation happened inside 24 hours of the appointment, no automatic refund was issued.</p>
        <p>${supportLine}</p>
      </div>
    `,
  };
}

async function setManageTokenState(
  bookingId: string,
  tokenVersion: number,
  eventType: BookingEventType,
) {
  const before = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!before) {
    throw new Error("Booking not found.");
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      manageTokenVersion: tokenVersion,
      manageTokenRotatedAt: new Date(),
    },
    include: bookingManagementInclude,
  });

  await createBookingEvent({
    bookingId: updated.id,
    type: eventType,
    actorLabel: "system",
    beforeState: pickBookingEventState(before),
    afterState: pickBookingEventState(updated),
  });

  return updated;
}

export async function rotateAndSendManageBookingEmail(bookingId: string) {
  const current = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!current) {
    throw new Error("Booking not found.");
  }

  const nextVersion = Math.max(current.manageTokenVersion, 0) + 1;
  const booking = await setManageTokenState(bookingId, nextVersion, BookingEventType.MANAGE_LINK_ROTATED);
  const manageUrl = getManagementUrlForBooking(booking);

  if (!manageUrl) {
    throw new Error("Unable to generate management link.");
  }

  const email = buildManageEmail(booking, manageUrl);
  await sendEmail({
    to: booking.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      manageLinkSentAt: new Date(),
    },
  });

  return getManagementTokenForBooking(booking);
}

export async function ensureInitialManageBookingEmail(bookingId: string) {
  const current = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingManagementInclude,
  });

  if (!current) {
    throw new Error("Booking not found.");
  }

  if (current.manageLinkSentAt && current.manageTokenVersion > 0 && current.manageTokenRotatedAt) {
    return getManagementTokenForBooking(current);
  }

  const booking =
    current.manageTokenVersion > 0 && current.manageTokenRotatedAt
      ? current
      : await setManageTokenState(bookingId, 1, BookingEventType.MANAGE_LINK_ISSUED);

  const manageUrl = getManagementUrlForBooking(booking);

  if (!manageUrl) {
    throw new Error("Unable to generate management link.");
  }

  // Claim the send atomically before delivering the email. Reconciliation can run
  // concurrently (Stripe webhook + confirmation-page fallback, or a webhook retry
  // racing a slow first send); claiming ensures only one caller sends the email.
  const claim = await prisma.booking.updateMany({
    where: { id: booking.id, manageLinkSentAt: null },
    data: { manageLinkSentAt: new Date() },
  });

  if (claim.count === 0) {
    // Another concurrent reconciliation already claimed (or completed) the send.
    return getManagementTokenForBooking(booking);
  }

  const email = buildManageEmail(booking, manageUrl);

  try {
    await sendEmail({
      to: booking.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  } catch (error) {
    // Release the claim so a later attempt (resend or webhook retry) can send again.
    await prisma.booking.updateMany({
      where: { id: booking.id, manageLinkSentAt: { not: null } },
      data: { manageLinkSentAt: null },
    });
    throw error;
  }

  return getManagementTokenForBooking(booking);
}

function buildDepositRecoveryEmail(booking: ManagedBooking) {
  const serviceDate = formatBookingDateTime(booking.startAt);
  const env = getEnv();
  const bookAgainUrl = new URL("/book", env.appUrl);
  bookAgainUrl.searchParams.set("serviceId", booking.serviceId);
  const supportCopy = env.supportEmail
    ? `If you had trouble paying, or believe you were charged, please reply to ${env.supportEmail} and we will sort it out.`
    : "If you had trouble paying, or believe you were charged, please contact the business directly and we will sort it out.";

  return {
    subject: `Your ${booking.service.name} booking wasn't completed`,
    text: [
      `Hi ${booking.firstName},`,
      "",
      `Your ${booking.service.name} booking for ${serviceDate} wasn't completed because the deposit payment didn't go through in time, so the time slot has been released.`,
      "No charge was made.",
      "",
      "You can pick a new time here:",
      bookAgainUrl.toString(),
      "",
      supportCopy,
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
        <p>Hi ${booking.firstName},</p>
        <p>Your <strong>${booking.service.name}</strong> booking for <strong>${serviceDate}</strong> wasn't completed because the deposit payment didn't go through in time, so the time slot has been released.</p>
        <p><strong>No charge was made.</strong></p>
        <p>You can pick a new time here:</p>
        <p><a href="${bookAgainUrl.toString()}">${bookAgainUrl.toString()}</a></p>
        <p>${supportCopy}</p>
      </div>
    `,
  };
}

// One-shot "your booking wasn't completed" email for holds that expired without
// payment. Uses the same atomic-claim pattern as the manage-link email: the
// webhook, confirmation-page reconcile, and sweeper can all race here, and only
// the caller that wins the `recoveryEmailSentAt` claim sends.
export async function ensureDepositRecoveryEmail(bookingId: string, actorLabel = "system") {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingManagementInclude,
  });

  if (!booking) {
    throw new Error("Booking not found.");
  }

  if (!shouldSendDepositRecoveryEmail(booking)) {
    return false;
  }

  const claim = await prisma.booking.updateMany({
    where: { id: booking.id, recoveryEmailSentAt: null },
    data: { recoveryEmailSentAt: new Date() },
  });

  if (claim.count === 0) {
    // Another concurrent caller already claimed (or completed) the send.
    return false;
  }

  const email = buildDepositRecoveryEmail(booking);

  try {
    await sendEmail({
      to: booking.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  } catch (error) {
    // Release the claim so the sweeper's next run can retry the send.
    await prisma.booking.updateMany({
      where: { id: booking.id, recoveryEmailSentAt: { not: null } },
      data: { recoveryEmailSentAt: null },
    });
    throw error;
  }

  await createBookingEvent({
    bookingId: booking.id,
    type: BookingEventType.PAYMENT_RECOVERY_EMAIL_SENT,
    actorLabel,
  });

  return true;
}

export function getSupportEmail() {
  return getEnv().supportEmail;
}

export async function sendCancellationOutcomeEmail(
  bookingId: string,
  outcome:
    | "cancelled_refunded"
    | "cancelled_contact_admin"
    | "admin_refunded"
    | "admin_cancelled_refunded"
    | "admin_full_refunded",
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingManagementInclude,
  });

  if (!booking) {
    throw new Error("Booking not found.");
  }

  let email: ReturnType<typeof buildRefundedCancellationEmail>;

  if (outcome === "cancelled_refunded") {
    email = buildRefundedCancellationEmail(booking);
  } else if (outcome === "admin_cancelled_refunded") {
    email = buildAdminCancelledRefundedEmail(booking);
  } else if (outcome === "admin_full_refunded") {
    email = buildAdminFullRefundEmail(booking);
  } else if (outcome === "admin_refunded") {
    email = buildAdminRefundedCancellationEmail(booking);
  } else {
    email = buildManualCancellationEmail(booking);
  }

  await sendEmail({
    to: booking.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}
