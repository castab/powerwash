import { prisma } from "@/lib/prisma";
import { AdminShell } from "@/components/admin/admin-shell";
import { saveServiceAction } from "@/server/actions/admin";
import { SubmitButton } from "@/components/ui/submit-button";

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
        <h2 className="text-lg font-semibold">Create service</h2>
        <form action={saveServiceAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <input className="field md:col-span-2" name="name" placeholder="Interior refresh" />
          <textarea
            className="field min-h-28 resize-y md:col-span-2"
            name="description"
            placeholder="Service description"
          />
          <input className="field" min="15" name="durationMinutes" placeholder="Duration (minutes)" type="number" />
          <input className="field" min="500" name="basePrice" placeholder="Base price in cents" type="number" />
          <input className="field" min="100" name="depositAmount" placeholder="Deposit in cents" type="number" />
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
            <input className="field md:col-span-2" defaultValue={service.name} name="name" />
            <textarea className="field min-h-24 resize-y md:col-span-2" defaultValue={service.description ?? ""} name="description" />
            <input className="field" defaultValue={service.durationMinutes} name="durationMinutes" type="number" />
            <input className="field" defaultValue={service.basePrice} name="basePrice" type="number" />
            <input className="field" defaultValue={service.depositAmount} name="depositAmount" type="number" />
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
