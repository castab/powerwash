import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { AdminShell } from "@/components/admin/admin-shell";
import { saveBlackoutAction } from "@/server/actions/admin";
import { SubmitButton } from "@/components/ui/submit-button";

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
      <section className="panel p-5">
        <h2 className="text-lg font-semibold text-slate-950">Add blackout</h2>
        <form action={saveBlackoutAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <input className="field" name="startsAt" type="datetime-local" />
          <input className="field" name="endsAt" type="datetime-local" />
          <input className="field md:col-span-2" name="reason" placeholder="Reason" />
          <SubmitButton>Create blackout</SubmitButton>
        </form>
      </section>

      <section className="grid gap-4">
        {blackouts.map((blackout) => (
          <div className="panel p-5" key={blackout.id}>
            <p className="text-sm font-semibold">
              {format(blackout.startsAt, "MMM d, yyyy h:mm a")} -{" "}
              {format(blackout.endsAt, "MMM d, yyyy h:mm a")}
            </p>
            <p className="mt-2 text-sm text-muted">{blackout.reason || "No reason provided."}</p>
          </div>
        ))}
      </section>
    </AdminShell>
  );
}
