"use client";

import { useActionState } from "react";
import { updateBookingAction, type BookingUpdateState } from "@/server/actions/admin";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: BookingUpdateState = {};

export function BookingUpdateForm({
  bookingId,
  defaultStartAt,
  defaultStatus,
  defaultAdminNotes,
}: {
  bookingId: string;
  defaultStartAt: string;
  defaultStatus: string;
  defaultAdminNotes: string;
}) {
  const [state, formAction] = useActionState(updateBookingAction, initialState);

  return (
    <form action={formAction} className="grid gap-3">
      <input name="bookingId" type="hidden" value={bookingId} />
      <input
        className="field"
        defaultValue={defaultStartAt}
        name="startAt"
        type="datetime-local"
      />
      <select className="field" defaultValue={defaultStatus} name="status">
        <option value="CONFIRMED">Confirmed</option>
        <option value="CANCELLED">Cancelled</option>
        <option value="COMPLETED">Completed</option>
        <option value="NO_SHOW">No show</option>
      </select>
      <textarea
        className="field min-h-24 resize-y"
        defaultValue={defaultAdminNotes}
        name="adminNotes"
        placeholder="Admin notes"
      />

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

      <SubmitButton className="w-full justify-center">Save booking</SubmitButton>
    </form>
  );
}
