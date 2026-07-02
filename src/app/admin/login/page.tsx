"use client";

import { useActionState } from "react";
import { loginAdminAction } from "@/server/actions/admin";
import { SiteHeader } from "@/components/layout/site-header";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState = { error: "" };

export default function AdminLoginPage() {
  const [state, formAction] = useActionState(loginAdminAction, initialState);

  return (
    <div className="flow-page min-h-screen">
      <SiteHeader />
      <main className="shell pb-12 pt-4 sm:pt-10">
        <div className="flex min-h-[calc(100vh-7rem)] items-center justify-center">
          <form action={formAction} className="surface-block stack w-full max-w-md sm:p-8">
            <div>
              <p className="eyebrow">Sign in</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">Continue to admin</h2>
            </div>

            <label className="stack">
              <span className="text-sm font-medium">Email</span>
              <input className="field" name="email" required type="email" />
            </label>
            <label className="stack">
              <span className="text-sm font-medium">Password</span>
              <input className="field" name="password" required type="password" />
            </label>

            {state.error ? (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {state.error}
              </p>
            ) : null}

            <SubmitButton className="w-full justify-center">Sign in</SubmitButton>
          </form>
        </div>
      </main>
    </div>
  );
}
