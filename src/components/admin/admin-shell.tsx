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
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="panel h-fit min-w-0 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-bold uppercase tracking-[0.22em] text-white">
              PW
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand">
                Admin Console
              </p>
              <p className="text-lg font-semibold text-slate-950">Powerwash</p>
            </div>
          </div>
          <nav className="mt-6 flex flex-col gap-2">
            {links.map((link) => (
              <Link
                className="rounded-2xl border border-transparent px-4 py-3 text-sm font-medium text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950"
                href={link.href}
                key={link.href}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="panel-muted mt-6 px-4 py-4 text-sm text-muted">
            Use this dashboard to keep booking inventory, availability, and payment follow-up in sync.
          </div>
          <form action={signOut} className="mt-6">
            <SubmitButton className="w-full justify-center bg-slate-950 hover:bg-slate-800">
              Sign out
            </SubmitButton>
          </form>
        </aside>
        <main className="stack min-w-0">
          <div className="panel p-6">
            <p className="badge mb-3">Admin dashboard</p>
            <h1 className="section-title">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
