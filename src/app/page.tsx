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
    <div className="min-h-screen bg-gray-50 pb-10">
      <SiteHeader />
      <main className="mx-auto w-full max-w-screen-xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
            <span className="inline-flex rounded-sm bg-cyan-100 px-2.5 py-0.5 text-xs font-medium text-cyan-800">Mobile car wash</span>
            <h1 className="mt-4 max-w-xl text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
              Book a premium wash that comes to you.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-600 sm:text-base">
              Skip the drive and let the clean come to your driveway, office, or parking spot.
              Choose a time, book in minutes, and get that fresh-off-the-lot shine without
              changing your day.
            </p>
            <div className="mt-6">
              <Link className="inline-flex items-center rounded-lg bg-cyan-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-cyan-800 focus:outline-none focus:ring-4 focus:ring-cyan-300" href="/book">
                Book your wash
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm sm:p-7">
            <span className="inline-flex rounded-sm bg-cyan-100 px-2.5 py-0.5 text-xs font-medium text-cyan-800">Booking details</span>
            <h2 className="mt-4 text-2xl font-bold text-gray-900">Everything upfront.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-gray-600">
              See open times, choose from {services.length} services, and reserve your appointment
              with a {typicalDeposit} deposit.
            </p>
            <div className="mt-6 space-y-3 text-sm">
              {[
                ["Live scheduling", "Choose an open time that fits your day."],
                ["Deposit only online", "Pay the remaining balance in person at the appointment."],
                ["Mobile arrival", "Your wash is performed at your location."],
              ].map(([title, text]) => (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3" key={title}>
                  <p className="font-semibold text-gray-900">{title}</p>
                  <p className="mt-1 text-gray-600">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-4" id="services">
          <div className="flex items-end justify-between gap-4">
            <div>
              <span className="inline-flex rounded-sm bg-cyan-100 px-2.5 py-0.5 text-xs font-medium text-cyan-800">Service menu</span>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-900">Browse active services</h2>
            </div>
            <Link className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-100" href="/book">
              Book from schedule
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {services.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        </section>

        <footer className="border-t border-gray-200 pt-6 text-center text-sm text-gray-500">
          <Link className="hover:text-cyan-700" href="/admin">
            Admin Console
          </Link>
        </footer>
      </main>
    </div>
  );
}
