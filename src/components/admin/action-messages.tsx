import type { AdminActionState } from "@/server/actions/admin";
import { cn } from "@/lib/utils";

// Shared inline banner for admin action results. Renders the returned
// validation/precondition error (or success confirmation) next to the form so
// expected outcomes are visible even in production, where Next.js redacts
// thrown server-action errors.
export function ActionMessages({
  state,
  className,
}: {
  state: AdminActionState;
  className?: string;
}) {
  if (!state.error && !state.success) {
    return null;
  }

  return (
    <div className={cn("grid gap-2", className)}>
      {state.error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {state.success}
        </p>
      ) : null}
    </div>
  );
}
