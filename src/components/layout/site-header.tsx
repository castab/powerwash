"use client";

import Link from "next/link";
import { useState } from "react";

export function SiteHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="shell py-4 sm:py-5">
      <div className="panel relative">
        <nav className="relative flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Link
              aria-label="Powerwash Booking"
              className="shrink-0 flex items-center gap-x-3 text-slate-900 transition hover:opacity-90"
              href="/"
              onClick={() => setIsMenuOpen(false)}
            >
              <span className="flex size-10 items-center justify-center rounded-2xl bg-brand text-sm font-bold uppercase tracking-[0.22em] text-white">
                PW
              </span>
              <span>
                <span className="block text-[11px] font-semibold uppercase tracking-[0.28em] text-brand">
                  Mobile Detailing
                </span>
                <span className="block text-lg font-semibold tracking-tight">Powerwash Booking</span>
              </span>
            </Link>

            <div className="sm:hidden">
              <button
                aria-controls="site-header-dropdown-nav"
                aria-expanded={isMenuOpen}
                aria-label="Toggle navigation"
                className="inline-flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-slate-200"
                id="site-header-dropdown-nav-toggle"
                onClick={() => setIsMenuOpen((current) => !current)}
                type="button"
              >
                <svg
                  className={`size-4 shrink-0 ${isMenuOpen ? "hidden" : "block"}`}
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
                  className={`size-4 shrink-0 ${isMenuOpen ? "block" : "hidden"}`}
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
          </div>

          <div
            aria-labelledby="site-header-dropdown-nav-toggle"
            className={`${isMenuOpen ? "block" : "hidden"} w-full overflow-visible transition-all duration-300 sm:block sm:w-auto sm:max-w-none`}
            id="site-header-dropdown-nav"
            role="region"
          >
            <div className="mt-2 max-h-[75vh] overflow-visible overflow-y-auto border-t border-slate-200 pt-4 sm:mt-0 sm:max-h-none sm:border-t-0 sm:pt-0">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-end sm:gap-1">
                <Link
                  aria-current="page"
                  className="inline-flex items-center rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-950 focus:outline-hidden focus:bg-slate-50"
                  href="/"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Home
                </Link>
                <Link
                  className="inline-flex items-center rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-950 focus:outline-hidden focus:bg-slate-50"
                  href="/book"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Book
                </Link>

                <Link
                  className="button-primary mt-3 px-4 py-2.5 sm:mt-0 sm:ms-4"
                  href="/book"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Reserve now
                </Link>
              </div>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}
