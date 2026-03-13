import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { getManagementUrlForBooking } from "@/lib/booking-management";
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
    },
  });

  if (!booking) {
    notFound();
  }

  const manageUrl = getManagementUrlForBooking(booking);
  const isFinalizing = booking.status === BookingStatus.PENDING_PAYMENT || !manageUrl;

  return (
    <main className="shell py-8">
      <div className="panel mx-auto max-w-3xl p-6 sm:p-8">
        <p className="badge">Booking confirmation</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          {isFinalizing ? "Payment received, finalizing booking" : "Deposit received"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          {isFinalizing
            ? "Stripe accepted the payment. We are waiting for the confirmation webhook to finish creating your management link."
            : `Your booking is held for ${booking.firstName}. We also emailed a secure booking management link and Stripe sent the payment receipt. Remaining balance is due in person at check-in.`}
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] bg-surface p-5">
            <p className="text-sm text-muted">Service</p>
            <p className="mt-2 text-lg font-semibold">{booking.service.name}</p>
            <p className="mt-1 text-sm text-muted">
              {format(booking.startAt, "EEEE, MMMM d")} at {format(booking.startAt, "h:mm a")}
            </p>
            <p className="mt-1 text-sm text-muted">
              Vehicle: {booking.vehicleYear ? `${booking.vehicleYear} ` : ""}
              {booking.vehicleMake} {booking.vehicleModel}
            </p>
          </div>
          <div className="rounded-[24px] bg-surface p-5">
            <p className="text-sm text-muted">Payment summary</p>
            <p className="mt-2 text-sm">Deposit paid: {formatCurrency(booking.depositAmount)}</p>
            <p className="mt-1 text-sm">Balance due in person: {formatCurrency(booking.balanceDue)}</p>
            <p className="mt-1 text-sm">Booking status: {booking.status.replaceAll("_", " ")}</p>
          </div>
        </div>

        {isFinalizing ? (
          <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-semibold">Manage link still syncing</p>
            <p className="mt-2">
              Refresh this page in a few seconds to reveal the booking link, or use the email once it arrives.
            </p>
          </div>
        ) : (
          <div className="mt-6 rounded-[24px] border border-line bg-surface p-5">
            <p className="text-sm font-semibold">Bookmark your management link</p>
            <p className="mt-2 text-sm text-muted">
              This is the same secure link sent by email. Save it if you want direct access to manage the booking later.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Link className="button-primary" href={manageUrl}>
                Manage booking
              </Link>
            </div>
            <p className="mt-4 break-all rounded-2xl border border-line bg-white px-4 py-3 text-sm">
              {manageUrl}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {isFinalizing ? (
            <Link className="button-primary" href={`/booking/confirmation?session_id=${encodeURIComponent(sessionId)}`}>
              Refresh confirmation
            </Link>
          ) : null}
          <Link className="button-secondary" href="/">
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
