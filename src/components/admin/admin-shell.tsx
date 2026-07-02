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
    <div className="shell overflow-x-hidden py-6">
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="surface-block h-fit min-w-0">
          <p className="text-lg font-semibold">Powerwash Admin</p>
          <nav className="mt-5 flex flex-col gap-2">
            {links.map((link) => (
              <Link
                className="rounded-2xl px-4 py-3 text-sm font-medium text-muted hover:bg-surface hover:text-foreground"
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
        <main className="stack min-w-0">
          <div className="surface-block">
            <p className="eyebrow mb-3">Admin dashboard</p>
            <h1 className="section-title">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
