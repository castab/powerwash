import Link from "next/link";
import { getPublicServices } from "@/lib/booking";
import { formatCurrency } from "@/lib/utils";
import { SiteHeader } from "@/components/layout/site-header";
import { ServiceCard } from "@/components/home/service-card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const services = await getPublicServices();
  const typicalDeposit = services[0] ? formatCurrency(services[0].depositAmount) : "$0.00";

  return (
    <div className="pb-10">
      <SiteHeader />
      <main className="shell stack py-4 sm:py-8">
        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="panel hero-panel relative overflow-hidden p-6 sm:p-8">
            <div className="relative flex h-full flex-col">
              <div>
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                  Premium mobile detailing with a calmer booking flow.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-muted sm:text-base">
                Skip the drive and let the clean come to your driveway, office, or parking spot.
                Choose a time, book in minutes, and get that fresh-off-the-lot shine without
                changing your day.
              </p>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="panel-muted px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Live schedule
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-900">Real-time slot lookup</p>
                </div>
                <div className="panel-muted px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Online today
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-900">{typicalDeposit} deposit hold</p>
                </div>
                <div className="panel-muted px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    On arrival
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-900">Remaining balance in person</p>
                </div>
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:mt-auto">
                <Link className="button-primary" href="/book">
                  Book your wash
                </Link>
                <Link className="button-secondary" href="/#services">
                  Explore services
                </Link>
              </div>
            </div>
          </div>

          <div className="panel p-6 sm:p-7">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              Everything upfront.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
              See open times, choose from {services.length} services, and reserve your appointment
              with a {typicalDeposit} deposit.
            </p>

            <div className="mt-6 space-y-3 text-sm">
              <div className="panel-muted px-4 py-4">
                <p className="font-semibold text-slate-950">Live scheduling</p>
                <p className="mt-1 text-muted">Choose an open time that fits your day.</p>
              </div>
              <div className="panel-muted px-4 py-4">
                <p className="font-semibold text-slate-950">Deposit only online</p>
                <p className="mt-1 text-muted">Pay the remaining balance in person at the appointment.</p>
              </div>
              <div className="panel-muted px-4 py-4">
                <p className="font-semibold text-slate-950">Mobile arrival</p>
                <p className="mt-1 text-muted">Your wash is performed at your location.</p>
              </div>
            </div>

            <p className="mt-5 text-xs leading-5 text-muted">
              Please make sure service is allowed at your location. If the vehicle is on private
              property, including many business parking lots, customer approval or property
              permission may be required before the appointment.
            </p>
          </div>
        </section>

        <section className="stack" id="services">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="section-title">Browse active services</h2>
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

        <footer className="border-t border-slate-200 pt-6 text-center text-sm text-muted">
          <Link className="hover:text-foreground" href="/admin">
            Admin Console
          </Link>
        </footer>
      </main>
    </div>
  );
}
