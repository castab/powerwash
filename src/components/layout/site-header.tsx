import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="shell py-4">
      <div className="panel flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link className="text-lg font-semibold tracking-tight text-gray-900" href="/">
          Powerwash Booking
        </Link>
        <nav className="flex items-center gap-2 text-sm font-medium">
          <Link className="rounded-lg px-3 py-2 text-muted hover:bg-surface hover:text-foreground" href="/#services">
            Services
          </Link>
          <Link className="rounded-lg px-3 py-2 text-muted hover:bg-surface hover:text-foreground" href="/book">
            Book
          </Link>
        </nav>
      </div>
    </header>
  );
}
