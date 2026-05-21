"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

type AdminNavLink = {
  href: string;
  label: string;
};

export function AdminNav({
  links,
  signOutAction,
}: {
  links: AdminNavLink[];
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="panel">
      <nav className="flex flex-col gap-4 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between gap-3">
          <Link
            aria-label="Powerwash admin dashboard"
            className="flex shrink-0 items-center gap-x-3 text-slate-900 transition hover:opacity-90"
            href="/admin/bookings"
            onClick={() => setIsMenuOpen(false)}
          >
            <span className="flex size-10 items-center justify-center rounded-2xl bg-slate-950 text-sm font-bold uppercase tracking-[0.22em] text-white">
              PW
            </span>
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.28em] text-brand">
                Admin Console
              </span>
              <span className="block text-lg font-semibold tracking-tight">Powerwash</span>
            </span>
          </Link>

          <button
            aria-controls="admin-header-nav"
            aria-expanded={isMenuOpen}
            aria-label="Toggle admin navigation"
            className="inline-flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-slate-200 lg:hidden"
            onClick={() => setIsMenuOpen((current) => !current)}
            type="button"
          >
            <svg
              className={cn("size-4 shrink-0", isMenuOpen ? "hidden" : "block")}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <line x1="3" x2="21" y1="6" y2="6" />
              <line x1="3" x2="21" y1="12" y2="12" />
              <line x1="3" x2="21" y1="18" y2="18" />
            </svg>
            <svg
              className={cn("size-4 shrink-0", isMenuOpen ? "block" : "hidden")}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
            <span className="sr-only">Toggle navigation</span>
          </button>
        </div>

        <div
          className={cn(
            "w-full overflow-hidden border-t border-slate-200 pt-4 transition-all duration-300 lg:w-auto lg:border-t-0 lg:pt-0",
            isMenuOpen ? "block" : "hidden lg:block",
          )}
          id="admin-header-nav"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-center">
              {links.map((link) => {
                const isActive =
                  pathname === link.href || (link.href !== "/admin/bookings" && pathname.startsWith(link.href));

                return (
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "inline-flex items-center rounded-xl border px-4 py-2.5 text-sm font-medium transition focus:outline-hidden",
                      isActive
                        ? "border-brand/15 bg-brand-soft text-brand shadow-sm"
                        : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950",
                    )}
                    href={link.href}
                    key={link.href}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>

            <form action={signOutAction} className="lg:ms-2">
              <SubmitButton className="w-full justify-center bg-slate-950 hover:bg-slate-800 lg:w-auto">
                Sign out
              </SubmitButton>
            </form>
          </div>
        </div>
      </nav>
    </header>
  );
}
