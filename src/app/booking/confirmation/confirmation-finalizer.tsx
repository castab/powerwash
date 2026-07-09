"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { pollConfirmationReconcileAction } from "@/server/actions/booking";

const POLL_INTERVAL_MS = 3_000;
const POLL_WINDOW_MS = 60_000;
// The server action debounces reconciles at 30s per session, so two fires 30s
// apart both pass it. These are the only on-page Stripe re-checks; the status
// polls in between are DB-only.
const RECONCILE_AT_MS = [5_000, 35_000];

type Props = {
  sessionId: string;
  supportEmail: string | null;
};

// Client-side companion to the confirmation page while a payment is still
// syncing: polls a cheap DB-only status endpoint and refreshes the
// server-rendered page once the booking reaches a terminal state. If nothing
// resolves within the polling window, it hands off to email — the background
// sweeper guarantees the outcome email either way.
export function ConfirmationFinalizer({ sessionId, supportEmail }: Props) {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();
    const firedReconciles = new Set<number>();

    async function tick() {
      if (cancelled) {
        return;
      }

      const elapsed = Date.now() - startedAt;

      if (elapsed >= POLL_WINDOW_MS) {
        setTimedOut(true);
        return;
      }

      for (const fireAt of RECONCILE_AT_MS) {
        if (elapsed >= fireAt && !firedReconciles.has(fireAt)) {
          firedReconciles.add(fireAt);
          // Fire-and-forget: the next status poll picks up any state change.
          pollConfirmationReconcileAction(sessionId).catch(() => {});
        }
      }

      try {
        const response = await fetch(
          `/api/booking/confirmation-status?session_id=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" },
        );

        if (response.ok) {
          const payload = (await response.json()) as { state?: string };

          if (!cancelled && payload.state && payload.state !== "finalizing") {
            router.refresh();
            return;
          }
        }
      } catch {
        // Transient network error — keep polling.
      }

      if (!cancelled) {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    }

    timer = setTimeout(tick, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [router, sessionId]);

  if (timedOut) {
    return (
      <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-semibold">You can safely close this page</p>
        <p className="mt-2">
          We&apos;ll email your booking link the moment the payment is confirmed. If it didn&apos;t
          go through, we&apos;ll email you about that too, with a link to try again.
          {supportEmail
            ? ` If you don't hear from us within an hour, contact ${supportEmail}.`
            : " If you don't hear from us within an hour, please contact the business directly."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      <p className="flex items-center gap-3 font-semibold">
        <span
          aria-hidden
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-900/30 border-t-amber-900"
        />
        Confirming your payment&hellip;
      </p>
      <p className="mt-2">
        This usually takes a few seconds. The page updates automatically &mdash; no need to refresh.
      </p>
    </div>
  );
}
