import { getPublicServices } from "@/lib/booking";
import { addDaysToDateValue, getBusinessDateValue } from "@/lib/business-time";
import { createBookingFormToken } from "@/lib/booking-form-token";
import { getDevBookingPrefill, getEnv } from "@/lib/env";
import { SiteHeader } from "@/components/layout/site-header";
import { BookingForm } from "@/components/booking/booking-form";

export const metadata = {
  title: "Book a Wash",
};

export const dynamic = "force-dynamic";

export default async function BookPage() {
  const services = await getPublicServices();
  const devPrefill = getDevBookingPrefill();
  const businessToday = getBusinessDateValue(new Date());
  const dateOptions = Array.from({ length: 14 }, (_, index) =>
    addDaysToDateValue(businessToday, index),
  );
  const serializedServices = services.map((service) => ({
    id: service.id,
    name: service.name,
    durationMinutes: service.durationMinutes,
    basePrice: service.basePrice.toString(),
    depositAmount: service.depositAmount.toString(),
  }));

  // Anti-bot: mint a fresh signed token on every render (the page is
  // force-dynamic) and expose the public Turnstile site key. Turnstile is
  // optional — an empty key means the widget and server check are skipped.
  const formToken = createBookingFormToken(getEnv().bookingFormSecret);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

  return (
    <div className="flow-page">
      <SiteHeader />
      <main className="shell pb-10 pt-0 sm:pb-12 sm:pt-2">
        <section className="mb-8 max-w-3xl">
          <p className="eyebrow">Book a wash</p>
          <h1 className="page-title mt-4">Book your wash in five quick steps.</h1>
          <p className="mt-4 text-sm leading-6 text-muted sm:text-base">
            Reserve with a deposit today. The remaining balance is collected after the service is complete.
          </p>
        </section>
        <BookingForm
          dateOptions={dateOptions}
          devPrefill={devPrefill}
          formToken={formToken}
          services={serializedServices}
          turnstileSiteKey={turnstileSiteKey}
        />
      </main>
    </div>
  );
}
