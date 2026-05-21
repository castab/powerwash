"use client";

import { useActionState } from "react";
import { loginAdminAction } from "@/server/actions/admin";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState = { error: "" };

export default function AdminLoginPage() {
  const [state, formAction] = useActionState(loginAdminAction, initialState);

  return (
    <main className="shell flex min-h-screen items-center justify-center py-8">
      <form action={formAction} className="panel stack w-full max-w-md p-6 sm:p-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            Secure dashboard access
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Sign in with an admin user seeded in PostgreSQL. Sessions are stored in a signed
            HTTP-only cookie.
          </p>
        </div>

        <label className="stack">
          <span className="text-sm font-medium text-slate-800">Email</span>
          <input className="field" name="email" required type="email" />
        </label>
        <label className="stack">
          <span className="text-sm font-medium text-slate-800">Password</span>
          <input className="field" name="password" required type="password" />
        </label>

        {state.error ? <p className="alert-error">{state.error}</p> : null}

        <SubmitButton className="w-full justify-center">Sign in</SubmitButton>
      </form>
    </main>
  );
}
