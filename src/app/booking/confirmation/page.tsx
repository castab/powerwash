import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    session_id?: string;
  }>;
};

export default async function BookingConfirmationPage({ searchParams }: Props) {
  const { session_id: sessionId } = await searchParams;

  if (!sessionId) {
    notFound();
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const bookingId = session.metadata?.bookingId;

  if (!bookingId) {
    notFound();
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      service: true,
      customer: true,
      vehicle: true,
    },
  });

  if (!booking) {
    notFound();
  }

  return (
    <main className="shell py-8">
      <div className="panel mx-auto max-w-3xl p-6 sm:p-8">
        <p className="badge">Booking confirmation</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Deposit received</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Your booking is held for {booking.customer.firstName}. We also sent the payment receipt
          through Stripe. Remaining balance is due in person at check-in.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] bg-surface p-5">
            <p className="text-sm text-muted">Service</p>
            <p className="mt-2 text-lg font-semibold">{booking.service.name}</p>
            <p className="mt-1 text-sm text-muted">
              {format(booking.startAt, "EEEE, MMMM d")} at {format(booking.startAt, "h:mm a")}
            </p>
            <p className="mt-1 text-sm text-muted">
              Vehicle: {booking.vehicle.year ? `${booking.vehicle.year} ` : ""}
              {booking.vehicle.make} {booking.vehicle.model}
            </p>
          </div>
          <div className="rounded-[24px] bg-surface p-5">
            <p className="text-sm text-muted">Payment summary</p>
            <p className="mt-2 text-sm">Deposit paid: {formatCurrency(booking.depositAmount)}</p>
            <p className="mt-1 text-sm">Balance due in person: {formatCurrency(booking.balanceDue)}</p>
            <p className="mt-1 text-sm">Booking status: {booking.status.replaceAll("_", " ")}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link className="button-primary" href="/">
            Back to home
          </Link>
          <Link className="button-secondary" href="/book">
            Book another appointment
          </Link>
        </div>
      </div>
    </main>
  );
}
