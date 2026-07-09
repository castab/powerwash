"use client";

import { useActionState } from "react";
import { saveServiceAction } from "@/server/actions/admin";
import { ActionMessages } from "@/components/admin/action-messages";
import { SubmitButton } from "@/components/ui/submit-button";

export type ServiceFormValues = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  basePrice: string;
  depositAmount: string;
  isActive: boolean;
};

export function ServiceForm({ service }: { service?: ServiceFormValues }) {
  const [state, formAction] = useActionState(saveServiceAction, {});
  const isEdit = Boolean(service);

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      {service ? <input name="id" type="hidden" value={service.id} /> : null}

      <label className="stack md:col-span-2">
        <span className="text-sm font-medium">Service name</span>
        <input
          className="field"
          defaultValue={service?.name}
          name="name"
          placeholder="Interior refresh"
        />
      </label>
      <label className="stack md:col-span-2">
        <span className="text-sm font-medium">Description</span>
        <textarea
          className="field min-h-28 resize-y"
          defaultValue={service?.description}
          name="description"
          placeholder="Service description"
        />
      </label>
      <label className="stack">
        <span className="text-sm font-medium">Duration (minutes)</span>
        <input
          className="field"
          defaultValue={service?.durationMinutes}
          min="15"
          name="durationMinutes"
          placeholder="90"
          type="number"
        />
      </label>
      <label className="stack">
        <span className="text-sm font-medium">Base price (USD)</span>
        <input
          className="field"
          defaultValue={service?.basePrice}
          inputMode="decimal"
          min="0"
          name="basePrice"
          placeholder="85.00"
          step="0.01"
          type="number"
        />
        <span className="text-xs text-muted">Enter the full service price in dollars.</span>
      </label>
      <label className="stack">
        <span className="text-sm font-medium">Required deposit (USD)</span>
        <input
          className="field"
          defaultValue={service?.depositAmount}
          inputMode="decimal"
          min="0"
          name="depositAmount"
          placeholder="25.00"
          step="0.01"
          type="number"
        />
        <span className="text-xs text-muted">Must be less than or equal to the base price.</span>
      </label>
      <label className="flex items-center gap-3 text-sm font-medium">
        <input defaultChecked={service?.isActive ?? true} name="isActive" type="checkbox" />
        Active service
      </label>

      <ActionMessages className="md:col-span-2" state={state} />

      <SubmitButton>{isEdit ? "Save changes" : "Create service"}</SubmitButton>
    </form>
  );
}
