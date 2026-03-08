import { createHash, randomBytes } from "node:crypto";
import { BookingStatus, PaymentStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { formatCurrency } from "@/lib/utils";

const AUTO_REFUND_WINDOW_HOURS = 24;

const bookingManagementInclude = {
  service: true,
  customer: true,
  vehicle: true,
} satisfies Prisma.BookingInclude;

export type ManagedBooking = Prisma.BookingGetPayload<{
  include: typeof bookingManagementInclude;
}>;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createRawToken() {
  return randomBytes(32).toString("base64url");
}

function formatBookingDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

function getManagementUrl(token: string) {
  const env = getEnv();
  const url = new URL("/booking/manage", env.appUrl);
  url.searchParams.set("token", token);
  return url.toString();
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

  return canAutoRefundBooking(booking.startAt) ? "auto_refund_available" : "manual_refund_only";
}

export async function getManagedBookingByToken(token: string) {
  return prisma.booking.findUnique({
    where: { manageTokenHash: hashToken(token) },
    include: bookingManagementInclude,
  });
}

async function rotateManageTokenHash(bookingId: string, nextHash: string, rotatedAt: Date) {
  return prisma.booking.update({
    where: { id: bookingId },
    data: {
      manageTokenHash: nextHash,
      manageTokenRotatedAt: rotatedAt,
    },
  });
}

function buildManageEmail(booking: ManagedBooking, manageUrl: string) {
  const serviceDate = formatBookingDateTime(booking.startAt);
  const supportCopy = getSupportCopy();

  return {
    subject: `Manage your ${booking.service.name} booking`,
    text: [
      `Hi ${booking.customer.firstName},`,
      "",
      `Your ${booking.service.name} booking for ${serviceDate} is confirmed.`,
      `Deposit paid: ${formatCurrency(booking.depositAmount)}`,
      "",
      "Use the secure link below to view or cancel your booking:",
      manageUrl,
      "",
      "Cancellations made at least 24 hours before the appointment receive an automatic refund of the deposit.",
      `Cancellations inside 24 hours are not automatically refunded. ${supportCopy}`,
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
        <p>Hi ${booking.customer.firstName},</p>
        <p>Your <strong>${booking.service.name}</strong> booking for <strong>${serviceDate}</strong> is confirmed.</p>
        <p>Deposit paid: <strong>${formatCurrency(booking.depositAmount)}</strong></p>
        <p>Use the secure link below to view or cancel your booking:</p>
        <p><a href="${manageUrl}">${manageUrl}</a></p>
        <p>Cancellations made at least 24 hours before the appointment receive an automatic refund of the deposit.</p>
        <p>Cancellations inside 24 hours are not automatically refunded. ${supportCopy}</p>
      </div>
    `,
  };
}

export async function rotateAndSendManageBookingEmail(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingManagementInclude,
  });

  if (!booking) {
    throw new Error("Booking not found.");
  }

  const previousHash = booking.manageTokenHash;
  const previousRotatedAt = booking.manageTokenRotatedAt;
  const rawToken = createRawToken();
  const nextHash = hashToken(rawToken);
  const rotatedAt = new Date();

  await rotateManageTokenHash(booking.id, nextHash, rotatedAt);

  try {
    const email = buildManageEmail(booking, getManagementUrl(rawToken));
    await sendEmail({
      to: booking.customer.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  } catch (error) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        manageTokenHash: previousHash,
        manageTokenRotatedAt: previousRotatedAt,
      },
    });
    throw error;
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      manageLinkSentAt: new Date(),
    },
  });

  return rawToken;
}

export async function ensureInitialManageBookingEmail(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      manageLinkSentAt: true,
    },
  });

  if (!booking) {
    throw new Error("Booking not found.");
  }

  if (booking.manageLinkSentAt) {
    return null;
  }

  return rotateAndSendManageBookingEmail(bookingId);
}

export function getSupportEmail() {
  return getEnv().supportEmail;
}
