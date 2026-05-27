import Link from "next/link";
import { Service } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";

export function ServiceCard({ service }: { service: Service }) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="mb-3 inline-flex rounded-sm bg-cyan-100 px-2.5 py-0.5 text-xs font-medium text-cyan-800">
            Duration {service.durationMinutes} min
          </span>
          <h3 className="text-xl font-semibold text-gray-900">{service.name}</h3>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-right">
          <p className="text-xs uppercase tracking-wider text-gray-500">Deposit</p>
          <p className="text-base font-semibold text-gray-900">{formatCurrency(service.depositAmount)}</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-gray-600">{service.description}</p>
      <div className="mt-auto flex items-end justify-between gap-3 border-t border-gray-200 pt-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500">Total service price</p>
          <p className="text-lg font-semibold text-gray-900">{formatCurrency(service.basePrice)}</p>
        </div>
        <Link
          className="inline-flex items-center rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-800 focus:outline-none focus:ring-4 focus:ring-cyan-300"
          href={`/book?serviceId=${service.id}`}
        >
          Book now
        </Link>
      </div>
    </article>
  );
}
