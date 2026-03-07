import { getPublicServices } from "@/lib/booking";
import { SiteHeader } from "@/components/layout/site-header";
import { BookingForm } from "@/components/booking/booking-form";

export const metadata = {
  title: "Book a Wash",
};

export const dynamic = "force-dynamic";

export default async function BookPage() {
  const services = await getPublicServices();

  return (
    <div className="pb-10">
      <SiteHeader />
      <main className="shell py-4 sm:py-8">
        <BookingForm services={services} />
      </main>
    </div>
  );
}
