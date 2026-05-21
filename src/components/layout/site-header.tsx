import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="shell py-4 sm:py-5">
      <div className="panel relative flex flex-wrap sm:justify-start sm:flex-nowrap">
        <nav className="w-full px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <Link
              aria-label="Powerwash Booking"
              className="flex items-center gap-x-3 text-slate-900 transition hover:opacity-90"
              href="/"
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
                aria-controls="site-header-nav"
                aria-expanded="false"
                aria-label="Toggle navigation"
                className="hs-collapse-toggle inline-flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-slate-200"
                data-hs-collapse="#site-header-nav"
                id="site-header-nav-toggle"
                type="button"
              >
                <svg
                  className="hs-collapse-open:hidden size-4 shrink-0"
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
                  className="hs-collapse-open:block hidden size-4 shrink-0"
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
            aria-labelledby="site-header-nav-toggle"
            className="hs-collapse hidden basis-full overflow-hidden transition-all duration-300 sm:block"
            id="site-header-nav"
            role="region"
          >
            <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:mt-0 sm:flex-row sm:items-center sm:justify-end sm:border-t-0 sm:pt-0">
              <Link className="eyebrow-link" href="/#services">
                Services
              </Link>
              <Link className="eyebrow-link" href="/book">
                Book
              </Link>
              <Link className="button-primary px-4 py-2.5" href="/book">
                Reserve now
              </Link>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}
