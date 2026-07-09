"use client";

import { useActionState, type ReactNode } from "react";
import type { AdminActionState } from "@/server/actions/admin";
import { ActionMessages } from "@/components/admin/action-messages";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: AdminActionState = {};

// Client wrapper for the single-purpose admin booking actions (balance request,
// archive/restore, refunds). Each carries a hidden `bookingId` and renders the
// action's returned error/success inline via `useActionState`, matching the
// booking update and password forms.
export function AdminActionForm({
  action,
  bookingId,
  submitLabel,
  children,
  className = "grid gap-3",
  submitClassName = "w-full justify-center",
}: {
  action: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  bookingId: string;
  submitLabel: ReactNode;
  children?: ReactNode;
  className?: string;
  submitClassName?: string;
}) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className={className}>
      <input name="bookingId" type="hidden" value={bookingId} />
      {children}
      <ActionMessages state={state} />
      <SubmitButton className={submitClassName}>{submitLabel}</SubmitButton>
    </form>
  );
}
