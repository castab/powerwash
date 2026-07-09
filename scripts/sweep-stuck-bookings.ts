// Cron entry point for the booking sweeper (see src/lib/booking-sweeper.ts).
// Runs as a Railway cron service via `scripts/sweep.sh`, or locally with
// `npm run sweep`. Exit codes: 0 clean, 1 some items failed (retried on the
// next run), 2 fatal (e.g. database unreachable).
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { sweepStuckBookings } from "@/lib/booking-sweeper";

async function main() {
  const startedAt = Date.now();
  const summary = await sweepStuckBookings();
  const elapsedMs = Date.now() - startedAt;

  for (const phase of summary.phases) {
    console.log(
      `[sweeper] summary phase=${phase.phase} processed=${phase.processed} failed=${phase.failed}`,
    );
  }
  console.log(
    `[sweeper] done in ${elapsedMs}ms failed=${summary.failedCount} deadlineHit=${summary.deadlineHit}`,
  );

  process.exitCode = summary.failedCount > 0 ? 1 : 0;
}

main()
  .catch((error) => {
    console.error("[sweeper] Fatal error:", error);
    process.exitCode = 2;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
