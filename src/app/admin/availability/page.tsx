import { prisma } from "@/lib/prisma";
import { AdminShell } from "@/components/admin/admin-shell";
import { AvailabilityRuleForm } from "@/components/admin/availability-rule-form";

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
      <section className="surface-block">
        <h2 className="text-lg font-semibold">Add rule</h2>
        <div className="mt-4">
          <AvailabilityRuleForm />
        </div>
      </section>

      <section className="grid gap-4">
        {rules.map((rule) => (
          <div className="surface-block" key={rule.id}>
            <AvailabilityRuleForm
              rule={{
                id: rule.id,
                dayOfWeek: rule.dayOfWeek,
                startTime: rule.startTime,
                endTime: rule.endTime,
                isActive: rule.isActive,
              }}
            />
          </div>
        ))}
      </section>
    </AdminShell>
  );
}
