import Link from "next/link";
import { getPublicServices } from "@/lib/booking";
import { formatCurrency } from "@/lib/utils";
import { SiteHeader } from "@/components/layout/site-header";
import { ServiceCard } from "@/components/home/service-card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const services = await getPublicServices();

  return (
    <div className="pb-10">
      <SiteHeader />
      <main className="shell stack py-4 sm:py-8">
        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="panel overflow-hidden p-6 sm:p-8">
            <p className="badge">Mobile-first booking</p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Reserve a premium car wash in under two minutes.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted sm:text-base">
              Customers book from open availability, pay only the required deposit online, and
              finish the remaining balance in person. Admins manage services, schedules, blackout
              windows, and booking updates from one monolithic dashboard.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link className="button-primary" href="/book">
                Start booking
              </Link>
              <Link className="button-secondary" href="/admin">
                Open admin dashboard
              </Link>
            </div>
          </div>

          <div className="panel p-6">
            <p className="badge">Booking terms</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3 sm:gap-3">
              <div className="rounded-[24px] bg-surface p-4">
                <p className="text-sm text-muted">Services</p>
                <p className="mt-2 text-2xl font-semibold">{services.length}</p>
              </div>
              <div className="rounded-[24px] bg-surface p-4">
                <p className="text-sm text-muted">Typical deposit</p>
                <p className="mt-2 text-2xl font-semibold">
                  {services[0] ? formatCurrency(services[0].depositAmount) : "$0.00"}
                </p>
              </div>
              <div className="rounded-[24px] bg-surface p-4">
                <p className="text-sm text-muted">Balance collection</p>
                <p className="mt-2 text-2xl font-semibold">In person</p>
              </div>
            </div>
            <div className="mt-6 rounded-[28px] border border-dashed border-line bg-white p-5">
              <p className="text-sm font-semibold">What this starter includes</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-muted">
                <li>Next.js App Router with server actions and route handlers</li>
                <li>PostgreSQL + Prisma with overlap protection in SQL and logic</li>
                <li>Stripe Checkout deposit flow plus webhook confirmation</li>
                <li>Secure admin login and operational dashboard</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="stack" id="services">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="badge">Service menu</p>
              <h2 className="section-title mt-3">Browse active services</h2>
            </div>
            <Link className="button-secondary" href="/book">
              Book from schedule
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {services.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
