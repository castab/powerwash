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
    <div className="flow-page">
      <header className="shell py-1">
        <div className="flex flex-col gap-4 px-1 py-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link className="text-lg font-semibold tracking-tight" href="/admin/bookings">
                Powerwash Admin
              </Link>
              <p className="mt-1 text-sm text-muted">Manage the same booking experience customers see.</p>
            </div>
            <form action={signOut}>
              <SubmitButton className="w-full justify-center bg-foreground text-background hover:bg-brand-strong sm:w-auto">
                Sign out
              </SubmitButton>
            </form>
          </div>

          <nav className="flex flex-wrap gap-2 rounded-[2rem] bg-surface-strong/60 p-2 ring-1 ring-foreground/5">
            {links.map((link) => (
              <Link
                className="rounded-full px-4 py-2 text-sm font-semibold text-foreground/75 hover:bg-white/55 hover:text-foreground"
                href={link.href}
                key={link.href}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="shell pb-12 pt-4 sm:pt-6">
        <section className="relative mb-8 overflow-hidden rounded-[3rem] bg-surface-strong/70 p-6 ring-1 ring-foreground/5 sm:p-8">
          <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-accent/20 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-brand/15 blur-3xl" />
          <div className="relative max-w-3xl">
            <p className="eyebrow">Admin dashboard</p>
            <h1 className="page-title mt-4">{title}</h1>
            <p className="mt-4 text-sm leading-6 text-muted sm:text-base">{description}</p>
          </div>
        </section>

        <div className="stack min-w-0">
          {children}
        </div>
      </main>
    </div>
  );
}
