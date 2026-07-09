"use client";

import { useEffect } from "react";
import Link from "next/link";

// Error boundary for the /admin segment. Expected validation and precondition
// failures are returned inline by the server actions; this boundary only
// catches genuinely unexpected failures (DB down, Stripe 5xx) so the admin
// keeps a styled shell and a retry path instead of the default full-page crash.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin route error", error);
  }, [error]);

  return (
    <div className="flow-page min-h-screen">
      <main className="shell pb-12 pt-10">
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="surface-block stack w-full max-w-lg text-center sm:p-8">
            <div>
              <p className="eyebrow">Something went wrong</p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight">
                This action could not be completed
              </h1>
              <p className="mt-4 text-sm leading-6 text-muted">
                An unexpected error occurred. You are still signed in. Try again, and if the problem
                continues, check the server logs for details.
              </p>
              {error.digest ? (
                <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button className="button-primary" onClick={reset} type="button">
                Try again
              </button>
              <Link className="button-secondary" href="/admin/bookings">
                Back to bookings
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
