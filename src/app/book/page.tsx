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
      <main className="shell py-4 sm:py-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_320px]">
          <BookingForm
            dateOptions={dateOptions}
            devPrefill={devPrefill}
            services={serializedServices}
          />
          <aside className="panel hidden h-fit p-6 xl:block">
            <p className="badge">Preline info panel</p>
            <h2 className="mt-4 text-xl font-semibold tracking-tight text-slate-950">
              Before you reserve
            </h2>
            <div className="mt-5 space-y-4 text-sm text-muted">
              <div className="panel-muted px-4 py-4">
                Open slots are rechecked server-side before a booking hold is created.
              </div>
              <div className="panel-muted px-4 py-4">
                Deposit checkout reserves the appointment while the remaining balance stays due until service day.
              </div>
              <div className="panel-muted px-4 py-4">
                After payment, a secure manage link is emailed so customers can review or cancel their reservation.
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
