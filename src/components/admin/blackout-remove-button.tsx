"use client";

import { useActionState } from "react";
import { deactivateBlackoutAction } from "@/server/actions/admin";
import { ActionMessages } from "@/components/admin/action-messages";
import { SubmitButton } from "@/components/ui/submit-button";

export function BlackoutRemoveButton({ id }: { id: string }) {
  const [state, formAction] = useActionState(deactivateBlackoutAction, {});

  return (
    <form action={formAction} className="grid gap-2">
      <input name="id" type="hidden" value={id} />
      <ActionMessages state={state} />
      <SubmitButton className="button-secondary justify-self-start">Remove</SubmitButton>
    </form>
  );
}
