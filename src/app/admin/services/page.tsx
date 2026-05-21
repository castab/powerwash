import { prisma } from "@/lib/prisma";
import { AdminShell } from "@/components/admin/admin-shell";
import { saveServiceAction } from "@/server/actions/admin";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatMoneyInput } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminServicesPage() {
  const services = await prisma.service.findMany({
    orderBy: { createdAt: "asc" },
  });

  return (
    <AdminShell
      title="Services"
      description="Create, edit, and deactivate service definitions. Each service keeps a fixed duration, base price, and required booking deposit."
    >
      <section className="panel p-5">
        <h2 className="text-lg font-semibold text-slate-950">Create service</h2>
        <form action={saveServiceAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="stack md:col-span-2">
            <span className="text-sm font-medium">Service name</span>
            <input className="field" name="name" placeholder="Interior refresh" />
          </label>
          <label className="stack md:col-span-2">
            <span className="text-sm font-medium">Description</span>
            <textarea
              className="field min-h-28 resize-y"
              name="description"
              placeholder="Service description"
            />
          </label>
          <label className="stack">
            <span className="text-sm font-medium">Duration (minutes)</span>
            <input className="field" min="15" name="durationMinutes" placeholder="90" type="number" />
          </label>
          <label className="stack">
            <span className="text-sm font-medium">Base price (USD)</span>
            <input
              className="field"
              inputMode="decimal"
              min="0"
              name="basePrice"
              placeholder="85.00"
              step="0.01"
              type="number"
            />
            <span className="text-xs text-muted">Enter the full service price in dollars.</span>
          </label>
          <label className="stack">
            <span className="text-sm font-medium">Required deposit (USD)</span>
            <input
              className="field"
              inputMode="decimal"
              min="0"
              name="depositAmount"
              placeholder="25.00"
              step="0.01"
              type="number"
            />
            <span className="text-xs text-muted">Deposit is charged online; balance is paid in person.</span>
          </label>
          <label className="flex items-center gap-3 text-sm font-medium">
            <input defaultChecked name="isActive" type="checkbox" />
            Active service
          </label>
          <SubmitButton>Create service</SubmitButton>
        </form>
      </section>

      <section className="grid gap-4">
        {services.map((service) => (
          <form action={saveServiceAction} className="panel grid gap-4 p-5 md:grid-cols-2" key={service.id}>
            <input name="id" type="hidden" value={service.id} />
            <label className="stack md:col-span-2">
              <span className="text-sm font-medium">Service name</span>
              <input className="field" defaultValue={service.name} name="name" />
            </label>
            <label className="stack md:col-span-2">
              <span className="text-sm font-medium">Description</span>
              <textarea
                className="field min-h-24 resize-y"
                defaultValue={service.description ?? ""}
                name="description"
              />
            </label>
            <label className="stack">
              <span className="text-sm font-medium">Duration (minutes)</span>
              <input className="field" defaultValue={service.durationMinutes} name="durationMinutes" type="number" />
            </label>
            <label className="stack">
              <span className="text-sm font-medium">Base price (USD)</span>
              <input
                className="field"
                defaultValue={formatMoneyInput(service.basePrice)}
                inputMode="decimal"
                min="0"
                name="basePrice"
                step="0.01"
                type="number"
              />
              <span className="text-xs text-muted">Stored in dollars and rounded to the nearest cent.</span>
            </label>
            <label className="stack">
              <span className="text-sm font-medium">Required deposit (USD)</span>
              <input
                className="field"
                defaultValue={formatMoneyInput(service.depositAmount)}
                inputMode="decimal"
                min="0"
                name="depositAmount"
                step="0.01"
                type="number"
              />
              <span className="text-xs text-muted">Must be less than or equal to the base price.</span>
            </label>
            <label className="flex items-center gap-3 text-sm font-medium">
              <input defaultChecked={service.isActive} name="isActive" type="checkbox" />
              Active
            </label>
            <SubmitButton>Save changes</SubmitButton>
          </form>
        ))}
      </section>
    </AdminShell>
  );
}
