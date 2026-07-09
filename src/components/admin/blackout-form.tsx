"use client";

import { useActionState } from "react";
import { saveBlackoutAction } from "@/server/actions/admin";
import { ActionMessages } from "@/components/admin/action-messages";
import { SubmitButton } from "@/components/ui/submit-button";

export type BlackoutFormValues = {
  id: string;
  // datetime-local values already rendered in the business time zone.
  startsAt: string;
  endsAt: string;
  reason: string;
};

export function BlackoutForm({ blackout }: { blackout?: BlackoutFormValues }) {
  const [state, formAction] = useActionState(saveBlackoutAction, {});
  const isEdit = Boolean(blackout);

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      {blackout ? <input name="id" type="hidden" value={blackout.id} /> : null}
      <input
        className="field"
        name="startsAt"
        type="datetime-local"
        defaultValue={blackout?.startsAt}
      />
      <input
        className="field"
        name="endsAt"
        type="datetime-local"
        defaultValue={blackout?.endsAt}
      />
      <input
        className="field md:col-span-2"
        name="reason"
        placeholder="Reason"
        defaultValue={blackout?.reason}
      />

      <ActionMessages className="md:col-span-2" state={state} />

      <SubmitButton>{isEdit ? "Save blackout" : "Create blackout"}</SubmitButton>
    </form>
  );
}
