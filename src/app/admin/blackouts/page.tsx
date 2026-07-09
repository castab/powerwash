import { prisma } from "@/lib/prisma";
import { toBusinessDateTimeLocalValue } from "@/lib/utils";
import { AdminShell } from "@/components/admin/admin-shell";
import { BlackoutForm } from "@/components/admin/blackout-form";
import { BlackoutRemoveButton } from "@/components/admin/blackout-remove-button";

export const dynamic = "force-dynamic";

export default async function AdminBlackoutsPage() {
  const blackouts = await prisma.blackoutDate.findMany({
    where: { isActive: true },
    orderBy: { startsAt: "asc" },
  });

  return (
    <AdminShell
      title="Blackout Dates"
      description="Block one-off closures, events, or maintenance windows. Slot generation excludes any interval that overlaps an active blackout."
    >
      <section className="surface-block">
        <h2 className="text-lg font-semibold">Add blackout</h2>
        <div className="mt-4">
          <BlackoutForm />
        </div>
      </section>

      <section className="grid gap-4">
        {blackouts.length === 0 ? (
          <p className="text-sm text-muted">No active blackouts.</p>
        ) : null}
        {blackouts.map((blackout) => (
          <div className="surface-block grid gap-4" key={blackout.id}>
            <BlackoutForm
              blackout={{
                id: blackout.id,
                startsAt: toBusinessDateTimeLocalValue(blackout.startsAt),
                endsAt: toBusinessDateTimeLocalValue(blackout.endsAt),
                reason: blackout.reason ?? "",
              }}
            />
            <BlackoutRemoveButton id={blackout.id} />
          </div>
        ))}
      </section>
    </AdminShell>
  );
}
