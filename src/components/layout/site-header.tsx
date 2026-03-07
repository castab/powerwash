import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="shell py-4">
      <div className="panel flex items-center justify-between gap-4 px-5 py-4">
        <Link className="text-lg font-semibold tracking-tight" href="/">
          Powerwash Booking
        </Link>
        <nav className="flex items-center gap-3 text-sm font-medium">
          <Link className="text-muted hover:text-foreground" href="/#services">
            Services
          </Link>
          <Link className="text-muted hover:text-foreground" href="/book">
            Book
          </Link>
          <Link className="button-secondary px-4 py-2" href="/admin">
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
