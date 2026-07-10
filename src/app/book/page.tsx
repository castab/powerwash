import { addDays, format, startOfDay } from "date-fns";
import { getPublicServices } from "@/lib/booking";
import { getDevBookingPrefill } from "@/lib/env";
import { SiteHeader } from "@/components/layout/site-header";
import { BookingForm } from "@/components/booking/booking-form";

export const metadata = {
  title: "Book a Wash",
};

export const dynamic = "force-dynamic";

export default async function BookPage() {
  const services = await getPublicServices();
  const devPrefill = getDevBookingPrefill();
  const dateOptions = Array.from({ length: 14 }, (_, index) =>
    format(addDays(startOfDay(new Date()), index), "yyyy-MM-dd"),
  );
  const serializedServices = services.map((service) => ({
    id: service.id,
    name: service.name,
    durationMinutes: service.durationMinutes,
    basePrice: service.basePrice.toString(),
    depositAmount: service.depositAmount.toString(),
  }));

  return (
    <div className="flow-page">
      <SiteHeader />
      <main className="shell pb-10 pt-0 sm:pb-12 sm:pt-2">
        <section className="mb-8 max-w-3xl">
          <p className="eyebrow">Book a wash</p>
          <h1 className="page-title mt-4">Book your wash in four quick steps.</h1>
          <p className="mt-4 text-sm leading-6 text-muted sm:text-base">
            Reserve with a deposit today. The remaining balance is collected after the service is complete.
          </p>
        </section>
        <BookingForm dateOptions={dateOptions} devPrefill={devPrefill} services={serializedServices} />
      </main>
    </div>
  );
}
