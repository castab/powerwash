import { AdminShell } from "@/components/admin/admin-shell";
import { BusinessSettingsForm } from "@/components/admin/business-settings-form";
import { PasswordSettingsForm } from "@/components/admin/password-settings-form";
import { getBusinessSettings } from "@/lib/service-area";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const settings = await getBusinessSettings();

  return (
    <AdminShell
      title="Settings"
      description="Configure the service area and manage security settings for the currently signed-in admin account."
    >
      <div className="grid gap-6">
        <BusinessSettingsForm
          settings={{
            originAddress: settings.originFormattedAddress ?? "",
            originPlaceId: settings.originPlaceId ?? "",
            originLat: settings.originLat !== null ? String(settings.originLat) : "",
            originLng: settings.originLng !== null ? String(settings.originLng) : "",
            maxTravelMinutes:
              settings.maxTravelMinutes !== null ? String(settings.maxTravelMinutes) : "",
          }}
        />
        <PasswordSettingsForm />
      </div>
    </AdminShell>
  );
}
