import Link from "next/link";
import { Service } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";

export function ServiceCard({ service }: { service: Service }) {
  return (
    <article className="panel flex h-full flex-col gap-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="badge mb-3">Duration {service.durationMinutes} min</p>
          <h3 className="text-xl font-semibold text-slate-950">{service.name}</h3>
        </div>
        <div className="rounded-2xl border border-brand/10 bg-brand-soft px-3 py-2 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">Deposit</p>
          <p className="text-base font-semibold text-slate-950">{formatCurrency(service.depositAmount)}</p>
        </div>
      </div>
      <p className="text-sm leading-6 text-muted">{service.description}</p>
      <div className="mt-auto flex items-end justify-between gap-3 border-t border-slate-200 pt-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Total service price
          </p>
          <p className="text-lg font-semibold text-slate-950">{formatCurrency(service.basePrice)}</p>
        </div>
        <Link className="button-primary" href={`/book?serviceId=${service.id}`}>
          Book now
        </Link>
      </div>
    </article>
  );
}
