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
        <div className="grid min-h-[calc(100vh-7rem)] items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="relative overflow-hidden rounded-[3rem] bg-surface-strong/70 p-6 ring-1 ring-foreground/5 sm:p-8 lg:p-10">
            <div className="absolute -right-20 top-8 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
            <div className="absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-brand/15 blur-3xl" />
            <div className="relative">
              <p className="eyebrow">Admin login</p>
              <h1 className="page-title mt-4">Secure dashboard access.</h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted sm:text-base">
                Sign in with an admin user seeded in PostgreSQL. Sessions are stored in a signed
                HTTP-only cookie.
              </p>
              <div className="mt-8 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <div className="rounded-[2rem] bg-background/50 p-4">
                  <p className="font-semibold">Bookings</p>
                  <p className="mt-1 text-muted">Review and update reservations.</p>
                </div>
                <div className="rounded-[2rem] bg-background/50 p-4">
                  <p className="font-semibold">Schedule</p>
                  <p className="mt-1 text-muted">Shape availability and blackouts.</p>
                </div>
                <div className="rounded-[2rem] bg-background/50 p-4">
                  <p className="font-semibold">Services</p>
                  <p className="mt-1 text-muted">Keep pricing and deposits aligned.</p>
                </div>
              </div>
            </div>
          </section>

          <form action={formAction} className="surface-block stack w-full sm:p-8">
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
