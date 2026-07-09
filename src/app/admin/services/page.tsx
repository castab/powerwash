import { prisma } from "@/lib/prisma";
import { AdminShell } from "@/components/admin/admin-shell";
import { ServiceForm } from "@/components/admin/service-form";
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
      <section className="surface-block">
        <h2 className="text-lg font-semibold">Create service</h2>
        <div className="mt-4">
          <ServiceForm />
        </div>
      </section>

      <section className="grid gap-4">
        {services.map((service) => (
          <div className="surface-block" key={service.id}>
            <ServiceForm
              service={{
                id: service.id,
                name: service.name,
                description: service.description ?? "",
                durationMinutes: service.durationMinutes,
                basePrice: formatMoneyInput(service.basePrice),
                depositAmount: formatMoneyInput(service.depositAmount),
                isActive: service.isActive,
              }}
            />
          </div>
        ))}
      </section>
    </AdminShell>
  );
}
