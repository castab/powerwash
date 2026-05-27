import Link from "next/link";
import { redirect } from "next/navigation";
import { clearAdminSession, requireAdmin } from "@/lib/auth";
import { SubmitButton } from "@/components/ui/submit-button";

const links = [
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/services", label: "Services" },
  { href: "/admin/availability", label: "Availability" },
  { href: "/admin/blackouts", label: "Blackouts" },
];

export async function AdminShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  await requireAdmin();

  async function signOut() {
    "use server";
    await clearAdminSession();
    redirect("/admin/login");
  }

  return (
    <div className="mx-auto w-full max-w-screen-xl overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="h-fit min-w-0 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-lg font-semibold">Powerwash Admin</p>
          <nav className="mt-5 flex flex-col gap-2">
            {links.map((link) => (
              <Link
                className="rounded-2xl px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                href={link.href}
                key={link.href}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <form action={signOut} className="mt-6">
            <SubmitButton className="w-full justify-center">Sign out</SubmitButton>
          </form>
        </aside>
        <main className="min-w-0 space-y-5">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <p className="mb-3 inline-flex rounded-sm bg-cyan-100 px-2.5 py-0.5 text-xs font-medium text-cyan-800">Admin dashboard</p>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">{description}</p>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
