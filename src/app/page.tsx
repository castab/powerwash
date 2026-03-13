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
        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="panel flex h-full flex-col overflow-hidden p-6 sm:p-8">
            <div>
              <p className="badge">Mobile car wash</p>
              <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
                Book a premium wash that comes to you.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted sm:text-base">
                Skip the drive and let the clean come to your driveway, office, or parking spot.
                Choose a time, book in minutes, and get that fresh-off-the-lot shine without
                changing your day.
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:mt-auto">
              <Link className="button-primary" href="/book">
                Book your wash
              </Link>
            </div>
          </div>

          <div className="panel p-6 sm:p-7">
            <p className="badge">Booking details</p>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight">Everything upfront.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
              See open times, choose from {services.length} services, and reserve your appointment
              with a {typicalDeposit} deposit.
            </p>

            <div className="mt-6 space-y-3 text-sm">
              <div className="rounded-[24px] bg-surface px-4 py-3">
                <p className="font-semibold">Live scheduling</p>
                <p className="mt-1 text-muted">Choose an open time that fits your day.</p>
              </div>
              <div className="rounded-[24px] bg-surface px-4 py-3">
                <p className="font-semibold">Deposit only online</p>
                <p className="mt-1 text-muted">Pay the remaining balance in person at the appointment.</p>
              </div>
              <div className="rounded-[24px] bg-surface px-4 py-3">
                <p className="font-semibold">Mobile arrival</p>
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

        <footer className="border-t border-line pt-6 text-center text-sm text-muted">
          <Link className="hover:text-foreground" href="/admin">
            Admin Console
          </Link>
        </footer>
      </main>
    </div>
  );
}
