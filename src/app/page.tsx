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
    <div className="flow-page">
      <SiteHeader />
      <main>
        <section className="shell relative pb-14 pt-0 sm:pb-20 sm:pt-2">
          <div className="absolute -right-24 top-6 -z-10 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
          <div className="absolute -left-28 top-32 -z-10 h-80 w-80 rounded-full bg-brand/15 blur-3xl" />

          <div className="grid items-end gap-10 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-strong">
                Mobile car wash
              </p>
              <h1 className="mt-5 max-w-3xl text-5xl font-semibold tracking-[-0.05em] sm:text-6xl lg:text-7xl">
                A better wash day, without the drive.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-muted sm:text-lg">
                We bring a premium clean to your driveway, office, or parking spot. Pick a
                service, choose an open time, and keep your day moving while your car gets bright.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link className="button-primary" href="/book">
                  Book your wash
                </Link>
                <Link className="button-secondary border-foreground/10 bg-white/40" href="#services">
                  See services
                </Link>
              </div>
            </div>

            <div className="relative hidden min-h-[320px] rounded-[3rem] bg-surface-strong/70 p-6 sm:p-8 lg:block">
              <div className="relative flex h-full min-h-[270px] flex-col justify-between rounded-[2.5rem] bg-background/55 p-6">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">
                    Reserve online
                  </p>
                  <p className="mt-4 text-4xl font-semibold tracking-tight">{typicalDeposit}</p>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Typical deposit to lock in your appointment. The remaining balance is collected
                    in person after service.
                  </p>
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  <div>
                    <p className="font-semibold">Live times</p>
                    <p className="mt-1 text-muted">Open slots update before checkout.</p>
                  </div>
                  <div>
                    <p className="font-semibold">{services.length} services</p>
                    <p className="mt-1 text-muted">Choose the right wash for the day.</p>
                  </div>
                  <div>
                    <p className="font-semibold">Mobile arrival</p>
                    <p className="mt-1 text-muted">We come to your location.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="soft-band flow-section">
          <div className="shell grid gap-8 md:grid-cols-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Choose a service</h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Start with a simple menu instead of guessing what your car needs.
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Pick an open time</h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Availability is checked before payment so the schedule stays reliable.
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">We&apos;ll handle the rest</h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Make sure service is allowed at your location and we handle the clean from there.
              </p>
            </div>
          </div>
        </section>

        <section className="shell py-14 sm:py-20" id="services">
          <div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-strong">
                Service menu
              </p>
              <h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                Pick the clean that fits your car today.
              </h2>
            </div>
          </div>

          <div className="mt-10 rounded-[3rem] bg-surface-strong/60 p-3 sm:p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {services.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          </div>
        </section>

        <section className="shell pb-12">
          <div className="rounded-[3rem] bg-foreground px-6 py-10 text-background sm:px-10 sm:py-12">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-background/60">
                  Ready when you are
                </p>
                <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
                  Book the wash, keep the rest of your day.
                </h2>
              </div>
              <Link
                className="inline-flex w-fit items-center justify-center rounded-full bg-background px-5 py-3 text-sm font-semibold text-foreground hover:bg-surface-strong"
                href="/book"
              >
                Start booking
              </Link>
            </div>
          </div>
        </section>

        <footer className="shell text-center text-sm text-muted">
          <Link className="hover:text-foreground" href="/admin">
            Admin Console
          </Link>
        </footer>
      </main>
    </div>
  );
}
