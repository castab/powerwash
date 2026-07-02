import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="shell py-1">
      <div className="flex items-center justify-between gap-4 px-1 py-2">
        <Link className="text-lg font-semibold tracking-tight" href="/">
          Powerwash Booking
        </Link>
        <nav className="flex items-center gap-2 text-sm font-semibold">
          <Link className="rounded-full px-3 py-2 text-foreground/75 hover:bg-white/40 hover:text-foreground" href="/#services">
            Services
          </Link>
          <Link className="rounded-full bg-foreground px-4 py-2 text-background hover:bg-brand-strong" href="/book">
            Book
          </Link>
        </nav>
      </div>
    </header>
  );
}
