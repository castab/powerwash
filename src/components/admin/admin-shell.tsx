import { redirect } from "next/navigation";
import { clearAdminSession, requireAdmin } from "@/lib/auth";
import { AdminNav } from "@/components/admin/admin-nav";

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
      <div className="stack">
        <AdminNav links={links} signOutAction={signOut} />
        <main className="stack min-w-0">
          <div className="panel p-6">
            <div className="max-w-3xl">
              <p className="badge mb-3">Admin dashboard</p>
              <h1 className="section-title">{title}</h1>
              <p className="mt-3 text-sm leading-6 text-muted sm:text-base">{description}</p>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
