"use client";

import { useActionState } from "react";
import { saveAvailabilityRuleAction } from "@/server/actions/admin";
import { ActionMessages } from "@/components/admin/action-messages";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type AvailabilityRuleFormValues = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
};

export function AvailabilityRuleForm({ rule }: { rule?: AvailabilityRuleFormValues }) {
  const [state, formAction] = useActionState(saveAvailabilityRuleAction, {});
  const isEdit = Boolean(rule);

  return (
    <form
      action={formAction}
      className={cn("grid gap-4", isEdit ? "md:grid-cols-5" : "md:grid-cols-4")}
    >
      {rule ? <input name="id" type="hidden" value={rule.id} /> : null}
      <select className="field" defaultValue={rule?.dayOfWeek ?? 0} name="dayOfWeek">
        {days.map((day, index) => (
          <option key={day} value={index}>
            {day}
          </option>
        ))}
      </select>
      <input className="field" defaultValue={rule?.startTime} name="startTime" type="time" />
      <input className="field" defaultValue={rule?.endTime} name="endTime" type="time" />
      <label className="flex items-center gap-3 text-sm font-medium">
        <input defaultChecked={rule?.isActive ?? true} name="isActive" type="checkbox" />
        Active
      </label>

      <ActionMessages className="md:col-span-full" state={state} />

      <SubmitButton>{isEdit ? "Save rule" : "Add rule"}</SubmitButton>
    </form>
  );
}
