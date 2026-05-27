import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <nav className="mx-auto flex w-full max-w-screen-xl items-center justify-between p-4" aria-label="Main navigation">
        <Link className="flex items-center text-xl font-semibold text-gray-900" href="/">
          Powerwash Booking
        </Link>
        <div className="flex items-center gap-6 text-sm font-medium text-gray-700">
          <Link className="hover:text-cyan-700" href="/#services">
            Services
          </Link>
          <Link className="hover:text-cyan-700" href="/book">
            Book
          </Link>
        </div>
      </nav>
    </header>
  );
}
