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
    <div className="pb-10">
      <SiteHeader />
      <main className="mx-auto w-full max-w-screen-xl px-4 py-4 sm:px-6 sm:py-8 lg:px-8">
        <BookingForm dateOptions={dateOptions} devPrefill={devPrefill} services={serializedServices} />
      </main>
    </div>
  );
}
