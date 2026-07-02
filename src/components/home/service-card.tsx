import Link from "next/link";
import { Service } from "@/generated/prisma/browser";
import { formatCurrency } from "@/lib/utils";

export function ServiceCard({ service }: { service: Service }) {
  return (
    <article className="group flex h-full flex-col gap-5 rounded-[2rem] bg-white/45 p-5 ring-1 ring-foreground/5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            {service.durationMinutes} min service
          </p>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight">{service.name}</h3>
        </div>
        <div className="rounded-full bg-surface/80 px-4 py-2 text-right">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Deposit</p>
          <p className="text-base font-semibold">{formatCurrency(service.depositAmount)}</p>
        </div>
      </div>
      <p className="text-sm leading-6 text-muted sm:text-base">{service.description}</p>
      <div className="mt-auto flex items-end justify-between gap-3 border-t border-foreground/10 pt-5">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Total service price</p>
          <p className="text-lg font-semibold">{formatCurrency(service.basePrice)}</p>
        </div>
        <Link
          className="inline-flex items-center justify-center rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background hover:bg-brand-strong"
          href={`/book?serviceId=${service.id}`}
        >
          Book now
        </Link>
      </div>
    </article>
  );
}
