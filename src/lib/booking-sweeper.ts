import { BookingStatus, PaymentStatus, type Prisma } from "@/generated/prisma/client";
import { releaseHeldBooking } from "@/lib/booking";
import {
  ensureDepositRecoveryEmail,
  ensureInitialManageBookingEmail,
} from "@/lib/booking-management";
import { prisma } from "@/lib/prisma";
import { reconcileCheckoutSession } from "@/lib/stripe-reconciliation";

// Scheduled safety net behind the Stripe webhook and the confirmation-page
// poll. Every mutation goes through the idempotent reconciler or a claim-based
// email sender, so runs are safe concurrently with webhooks and with each
// other. Invoked by `scripts/sweep-stuck-bookings.ts` (Railway cron service).

// Leave fresh checkouts alone: the webhook or the confirmation page almost
// always lands within seconds, so only bookings older than this are "stuck".
export const SWEEP_GRACE_MINUTES = 2;
// Per-phase cap so one run stays small; the next run picks up the remainder.
export const SWEEP_BATCH_LIMIT = 25;
// Only recover holds that expired recently — keeps the first deploy (where
// every historical CANCELLED/FAILED row has an unclaimed recoveryEmailSentAt)
// from emailing old customers, without needing a data backfill.
export const SWEEP_RECOVERY_LOOKBACK_HOURS = 24;
// Stop early so a slow Stripe API can't outlive the 5-minute cron cadence.
export const SWEEP_SOFT_DEADLINE_MS = 4 * 60 * 1000;

function minutesAgo(now: Date, minutes: number) {
  return new Date(now.getTime() - minutes * 60 * 1000);
}

// Deposit holds whose checkout session exists but whose fate (paid or expired)
// never reached us — a missed `completed` or `expired` webhook.
export function buildStuckDepositSessionFilter(now: Date): Prisma.BookingWhereInput {
  return {
    status: BookingStatus.PENDING_PAYMENT,
    paymentStatus: PaymentStatus.PENDING,
    stripeCheckoutSessionId: { not: null },
    createdAt: { lt: minutesAgo(now, SWEEP_GRACE_MINUTES) },
  };
}

// Holds where checkout creation failed and the inline release also failed —
// there is no Stripe session to reconcile, only a lapsed hold to cancel.
export function buildOrphanedHoldFilter(now: Date): Prisma.BookingWhereInput {
  return {
    status: BookingStatus.PENDING_PAYMENT,
    paymentStatus: PaymentStatus.PENDING,
    stripeCheckoutSessionId: null,
    paymentExpiresAt: { lt: now },
  };
}

// Confirmed bookings whose magic-link email never went out (e.g. Resend outage
// during reconciliation released the claim).
export function buildUnsentManageEmailFilter(): Prisma.BookingWhereInput {
  return {
    status: BookingStatus.CONFIRMED,
    manageLinkSentAt: null,
  };
}

// Recently expired holds still owed a recovery email (initial send failed, or
// the hold was cancelled by lazy cleanup and no expiry webhook ever arrived).
export function buildUnsentRecoveryEmailFilter(now: Date): Prisma.BookingWhereInput {
  return {
    status: BookingStatus.CANCELLED,
    paymentStatus: PaymentStatus.FAILED,
    recoveryEmailSentAt: null,
    stripeCheckoutSessionId: { not: null },
    cancelledAt: { gt: new Date(now.getTime() - SWEEP_RECOVERY_LOOKBACK_HOURS * 60 * 60 * 1000) },
  };
}

// Outstanding balance checkout sessions — reconciles missed balance payments;
// still-open sessions no-op, and Stripe expires them after 24h.
export function buildStuckBalanceSessionFilter(now: Date): Prisma.BookingWhereInput {
  return {
    paymentStatus: PaymentStatus.PARTIALLY_PAID,
    balanceCheckoutSessionId: { not: null },
    balanceRequestedAt: { lt: minutesAgo(now, SWEEP_GRACE_MINUTES) },
  };
}

export type SweepPhaseSummary = {
  phase: string;
  processed: number;
  failed: number;
};

export type SweepSummary = {
  phases: SweepPhaseSummary[];
  failedCount: number;
  deadlineHit: boolean;
};

type SweepItem = {
  bookingId: string;
  run: () => Promise<string>;
};

async function runPhase(
  summary: SweepSummary,
  phase: string,
  items: SweepItem[],
  deadlineAt: number,
) {
  const phaseSummary: SweepPhaseSummary = { phase, processed: 0, failed: 0 };
  summary.phases.push(phaseSummary);

  for (const item of items) {
    if (Date.now() >= deadlineAt) {
      console.warn(`[sweeper] phase=${phase} soft deadline reached, deferring remaining items`);
      summary.deadlineHit = true;
      return;
    }

    try {
      const outcome = await item.run();
      phaseSummary.processed += 1;
      console.log(`[sweeper] phase=${phase} booking=${item.bookingId} outcome=${outcome}`);
    } catch (error) {
      phaseSummary.failed += 1;
      summary.failedCount += 1;
      console.error(`[sweeper] phase=${phase} booking=${item.bookingId} failed:`, error);
    }
  }
}

function describeReconciliation(result: { outcome: string; stateChanged: boolean }) {
  return result.stateChanged ? `${result.outcome}+state-changed` : result.outcome;
}

export async function sweepStuckBookings(now = new Date()): Promise<SweepSummary> {
  const deadlineAt = Date.now() + SWEEP_SOFT_DEADLINE_MS;
  const summary: SweepSummary = { phases: [], failedCount: 0, deadlineHit: false };

  const stuckDeposits = await prisma.booking.findMany({
    where: buildStuckDepositSessionFilter(now),
    orderBy: { createdAt: "asc" },
    take: SWEEP_BATCH_LIMIT,
    select: { id: true, stripeCheckoutSessionId: true },
  });
  await runPhase(
    summary,
    "deposit-sessions",
    stuckDeposits.map((booking) => ({
      bookingId: booking.id,
      run: async () =>
        describeReconciliation(
          await reconcileCheckoutSession({
            // Non-null by filter; assert for the type system.
            sessionId: booking.stripeCheckoutSessionId as string,
            trigger: "sweeper",
          }),
        ),
    })),
    deadlineAt,
  );

  const orphanedHolds = await prisma.booking.findMany({
    where: buildOrphanedHoldFilter(now),
    orderBy: { createdAt: "asc" },
    take: SWEEP_BATCH_LIMIT,
    select: { id: true },
  });
  await runPhase(
    summary,
    "orphaned-holds",
    orphanedHolds.map((booking) => ({
      bookingId: booking.id,
      run: async () => {
        await releaseHeldBooking(booking.id, "sweeper");
        return "released";
      },
    })),
    deadlineAt,
  );

  const unsentManageEmails = await prisma.booking.findMany({
    where: buildUnsentManageEmailFilter(),
    orderBy: { confirmedAt: "asc" },
    take: SWEEP_BATCH_LIMIT,
    select: { id: true },
  });
  await runPhase(
    summary,
    "manage-emails",
    unsentManageEmails.map((booking) => ({
      bookingId: booking.id,
      run: async () => {
        await ensureInitialManageBookingEmail(booking.id);
        return "sent";
      },
    })),
    deadlineAt,
  );

  const unsentRecoveryEmails = await prisma.booking.findMany({
    where: buildUnsentRecoveryEmailFilter(now),
    orderBy: { cancelledAt: "asc" },
    take: SWEEP_BATCH_LIMIT,
    select: { id: true },
  });
  await runPhase(
    summary,
    "recovery-emails",
    unsentRecoveryEmails.map((booking) => ({
      bookingId: booking.id,
      run: async () => ((await ensureDepositRecoveryEmail(booking.id, "sweeper")) ? "sent" : "skipped"),
    })),
    deadlineAt,
  );

  const stuckBalances = await prisma.booking.findMany({
    where: buildStuckBalanceSessionFilter(now),
    orderBy: { balanceRequestedAt: "asc" },
    take: SWEEP_BATCH_LIMIT,
    select: { id: true, balanceCheckoutSessionId: true },
  });
  await runPhase(
    summary,
    "balance-sessions",
    stuckBalances.map((booking) => ({
      bookingId: booking.id,
      run: async () =>
        describeReconciliation(
          await reconcileCheckoutSession({
            sessionId: booking.balanceCheckoutSessionId as string,
            trigger: "sweeper",
          }),
        ),
    })),
    deadlineAt,
  );

  return summary;
}
