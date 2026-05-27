import Link from "next/link";
import { getPublicServices } from "@/lib/booking";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

const BOOKING_STEPS = [
  {
    title: "Choose your service",
    description: "Pick the package that matches your vehicle and desired level of detail.",
  },
  {
    title: "Select an open time",
    description: "Check live availability and reserve a slot that fits your day.",
  },
  {
    title: "Confirm with a deposit",
    description: "Pay only the deposit online and settle the balance during your appointment.",
  },
];

export default async function HomePage() {
  const services = await getPublicServices();
  const typicalDeposit = services[0] ? formatCurrency(services[0].depositAmount) : "$0.00";

  return (
    <div className="pb-10">
      <header className="shell sticky top-4 z-40 py-4">
        <div className="panel flex items-center justify-between gap-4 px-5 py-4 backdrop-blur-sm">
          <Link className="text-lg font-semibold tracking-tight" href="/">
            Powerwash Booking
          </Link>
          <nav className="flex items-center gap-3 text-sm font-medium">
            <Link className="text-muted hover:text-foreground" href="/#process">
              How it works
            </Link>
            <Link className="text-muted hover:text-foreground" href="/#services">
              Services
            </Link>
            <Link className="button-secondary px-4 py-2" href="/book">
              Book now
            </Link>
          </nav>
        </div>
      </header>

      <main className="shell stack py-4 sm:py-8">
        <section className="overflow-hidden rounded-[32px] border border-line bg-gradient-to-br from-cyan-900 via-cyan-800 to-slate-900 px-6 py-12 text-white shadow-[0_30px_90px_rgba(21,33,41,0.28)] sm:px-10 sm:py-16">
          <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
            Mobile car wash
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Premium vehicle care that comes directly to you.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-cyan-50/90 sm:text-base">
            Skip the drive and reclaim your time. Book your wash in minutes, choose a convenient
            time, and let our crew deliver a spotless finish at your home, office, or parking spot.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="button-primary bg-white text-cyan-900 hover:bg-cyan-100" href="/book">
              Start booking
            </Link>
            <Link className="button-secondary border-white/30 bg-white/10 text-white hover:bg-white/20" href="/#services">
              View service menu
            </Link>
          </div>
          <p className="mt-8 text-sm text-cyan-100/90">
            Reserve with only a {typicalDeposit} deposit and pay the remainder at the appointment.
          </p>
        </section>

        <section className="stack pt-4" id="process">
          <div>
            <p className="badge">Simple process</p>
            <h2 className="section-title mt-3">Booking a wash is fast and straightforward.</h2>
          </div>

          <ol className="grid gap-4 md:grid-cols-3">
            {BOOKING_STEPS.map((step, index) => (
              <li key={step.title} className="rounded-3xl border border-line bg-white/70 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
                  Step {index + 1}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{step.description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="stack pt-2" id="services">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="badge">Featured services</p>
              <h2 className="section-title mt-3">Find the right wash for your vehicle.</h2>
            </div>
            <Link className="button-secondary" href="/book">
              Book from live schedule
            </Link>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-line bg-white">
            {services.map((service, index) => (
              <article
                key={service.id}
                className="grid gap-4 border-b border-line px-5 py-5 last:border-b-0 md:grid-cols-[1.4fr_auto_auto] md:items-center md:px-8"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    {service.durationMinutes} min service
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-foreground">{service.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{service.description}</p>
                </div>
                <div className="rounded-2xl bg-surface px-4 py-3 text-sm md:text-right">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">Pricing</p>
                  <p className="mt-1 font-semibold text-foreground">{formatCurrency(service.basePrice)}</p>
                  <p className="text-xs text-muted">Deposit {formatCurrency(service.depositAmount)}</p>
                </div>
                <div className="md:justify-self-end">
                  <Link className={index === 0 ? "button-primary" : "button-secondary"} href={`/book?serviceId=${service.id}`}>
                    Book {service.name}
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <p className="text-xs leading-5 text-muted">
            Please make sure service is allowed at your location. If the vehicle is on private
            property, including many business parking lots, customer approval or property
            permission may be required before the appointment.
          </p>
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
