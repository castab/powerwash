import { AdminShell } from "@/components/admin/admin-shell";
import { PasswordSettingsForm } from "@/components/admin/password-settings-form";

export const dynamic = "force-dynamic";

export default function AdminSettingsPage() {
  return (
    <AdminShell
      title="Settings"
      description="Manage security settings for the currently signed-in admin account."
    >
      <PasswordSettingsForm />
    </AdminShell>
  );
}
