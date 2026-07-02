"use client";

import { useActionState } from "react";
import { updateAdminPasswordAction, type AdminPasswordUpdateState } from "@/server/actions/admin";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: AdminPasswordUpdateState = {};

export function PasswordSettingsForm() {
  const [state, formAction] = useActionState(updateAdminPasswordAction, initialState);

  return (
    <form action={formAction} className="surface-block grid gap-4 md:max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">Change password</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Confirm your current password before choosing a new admin password.
        </p>
      </div>

      <label className="stack">
        <span className="text-sm font-medium">Current password</span>
        <input
          autoComplete="current-password"
          className="field"
          name="currentPassword"
          required
          type="password"
        />
      </label>

      <label className="stack">
        <span className="text-sm font-medium">New password</span>
        <input
          autoComplete="new-password"
          className="field"
          minLength={8}
          name="newPassword"
          required
          type="password"
        />
        <span className="text-xs text-muted">Use at least 8 characters.</span>
      </label>

      <label className="stack">
        <span className="text-sm font-medium">Confirm new password</span>
        <input
          autoComplete="new-password"
          className="field"
          minLength={8}
          name="confirmPassword"
          required
          type="password"
        />
      </label>

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

      <SubmitButton className="w-full justify-center sm:w-auto">Update password</SubmitButton>
    </form>
  );
}
