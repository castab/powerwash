import { NextResponse } from "next/server";
import { BookingStatus, PaymentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";

export const dynamic = "force-dynamic";

// Cheap DB-only status probe for the confirmation page's poll loop. It never
// talks to Stripe (the webhook and the page's throttled reconcile action do
// that) and never returns the manage URL — the poller only learns whether to
// refresh the server-rendered page, which owns all sensitive rendering.
type ConfirmationState = "finalizing" | "confirmed" | "expired" | "unknown";

function getDepositState(booking: { status: BookingStatus; paymentStatus: PaymentStatus }): ConfirmationState {
  if (booking.status === BookingStatus.PENDING_PAYMENT) {
    return "finalizing";
  }

  if (
    booking.status === BookingStatus.CANCELLED &&
    booking.paymentStatus === PaymentStatus.FAILED
  ) {
    return "expired";
  }

  return "confirmed";
}

function getBalanceState(booking: { paymentStatus: PaymentStatus }): ConfirmationState {
  return booking.paymentStatus === PaymentStatus.PARTIALLY_PAID ? "finalizing" : "confirmed";
}

export async function GET(request: Request) {
  const ip = await getClientIp();
  const rate = consumeRateLimit(`confirmation-status:ip:${ip}`, RATE_LIMITS.confirmationStatus);

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  const sessionId = new URL(request.url).searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing session_id." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const select = { status: true, paymentStatus: true };

  const depositBooking = await prisma.booking.findUnique({
    where: { stripeCheckoutSessionId: sessionId },
    select,
  });

  let state: ConfirmationState;

  if (depositBooking) {
    state = getDepositState(depositBooking);
  } else {
    const balanceBooking = await prisma.booking.findUnique({
      where: { balanceCheckoutSessionId: sessionId },
      select,
    });
    state = balanceBooking ? getBalanceState(balanceBooking) : "unknown";
  }

  return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store" } });
}
