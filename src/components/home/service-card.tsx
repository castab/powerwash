import Link from "next/link";
import { Service } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";

export function ServiceCard({ service }: { service: Service }) {
  return (
    <article className="panel flex h-full flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="badge mb-3">Duration {service.durationMinutes} min</p>
          <h3 className="text-xl font-semibold">{service.name}</h3>
        </div>
        <div className="rounded-lg bg-surface px-3 py-2 text-right">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Deposit</p>
          <p className="text-base font-semibold">{formatCurrency(service.depositAmount)}</p>
        </div>
      </div>
      <p className="text-sm leading-6 text-muted">{service.description}</p>
      <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Total service price</p>
          <p className="text-lg font-semibold">{formatCurrency(service.basePrice)}</p>
        </div>
        <Link className="button-primary" href={`/book?serviceId=${service.id}`}>
          Book now
        </Link>
      </div>
    </article>
  );
}
