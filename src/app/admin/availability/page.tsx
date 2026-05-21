import { prisma } from "@/lib/prisma";
import { AdminShell } from "@/components/admin/admin-shell";
import { saveAvailabilityRuleAction } from "@/server/actions/admin";
import { SubmitButton } from "@/components/ui/submit-button";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const dynamic = "force-dynamic";

export default async function AdminAvailabilityPage() {
  const rules = await prisma.availabilityRule.findMany({
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });

  return (
    <AdminShell
      title="Weekly Availability"
      description="Define recurring appointment windows. Public booking only exposes slots that fit inside active availability rules."
    >
      <section className="panel p-5">
        <h2 className="text-lg font-semibold text-slate-950">Add rule</h2>
        <form action={saveAvailabilityRuleAction} className="mt-4 grid gap-4 md:grid-cols-4">
          <select className="field" name="dayOfWeek">
            {days.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </select>
          <input className="field" name="startTime" type="time" />
          <input className="field" name="endTime" type="time" />
          <label className="flex items-center gap-3 text-sm font-medium">
            <input defaultChecked name="isActive" type="checkbox" />
            Active
          </label>
          <SubmitButton>Add rule</SubmitButton>
        </form>
      </section>

      <section className="grid gap-4">
        {rules.map((rule) => (
          <form action={saveAvailabilityRuleAction} className="panel grid gap-4 p-5 md:grid-cols-5" key={rule.id}>
            <input name="id" type="hidden" value={rule.id} />
            <select className="field" defaultValue={rule.dayOfWeek} name="dayOfWeek">
              {days.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
            <input className="field" defaultValue={rule.startTime} name="startTime" type="time" />
            <input className="field" defaultValue={rule.endTime} name="endTime" type="time" />
            <label className="flex items-center gap-3 text-sm font-medium">
              <input defaultChecked={rule.isActive} name="isActive" type="checkbox" />
              Active
            </label>
            <SubmitButton>Save rule</SubmitButton>
          </form>
        ))}
      </section>
    </AdminShell>
  );
}
