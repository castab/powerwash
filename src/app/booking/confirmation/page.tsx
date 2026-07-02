import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { BookingStatus, PaymentStatus } from "@prisma/client";
import { SubmitButton } from "@/components/ui/submit-button";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { getManagementUrlForBooking } from "@/lib/booking-management";
import { formatCurrency } from "@/lib/utils";
import { reconcileBookingConfirmationAction } from "@/server/actions/booking";

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
  const checkoutPurpose = session.metadata?.checkoutPurpose ?? "deposit";

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
  const isDepositFlow = checkoutPurpose === "deposit";
  const sessionCompleted = session.status === "complete" && session.payment_status === "paid";
  const sessionExpired = session.status === "expired";
  const isFinalizing = isDepositFlow && (booking.status === BookingStatus.PENDING_PAYMENT || !manageUrl);
  const needsBalanceSync =
    !isDepositFlow &&
    sessionCompleted &&
    booking.paymentStatus !== PaymentStatus.PAID;
  const canRetryReconciliation =
    (sessionCompleted && (isFinalizing || needsBalanceSync)) ||
    (sessionExpired &&
      ((isDepositFlow && booking.status === BookingStatus.PENDING_PAYMENT) ||
        (!isDepositFlow &&
          booking.paymentStatus === PaymentStatus.PARTIALLY_PAID &&
          booking.balanceCheckoutSessionId === session.id)));
  const title = isFinalizing
    ? "Payment processing"
    : isDepositFlow
      ? "Deposit received"
      : needsBalanceSync
        ? "Balance payment processing"
      : booking.paymentStatus === PaymentStatus.PAID
        ? "Balance payment received"
        : "Payment received";
  const description = isFinalizing
    ? "Stripe completed the checkout, but your booking is still processing. Use the button below to check whether the payment has been applied yet."
    : isDepositFlow
      ? `Your booking is held for ${booking.firstName}. We also emailed a secure booking management link and Stripe sent the payment receipt. Remaining balance is still outstanding until service day.`
      : needsBalanceSync
        ? `Stripe completed the balance checkout for ${booking.firstName}, but the booking has not updated yet. Use the button below to check for the latest payment status.`
      : booking.paymentStatus === PaymentStatus.PAID
        ? `Stripe accepted the remaining balance for ${booking.firstName}. Your booking is now paid in full.`
        : `Stripe accepted the payment for ${booking.firstName}. Refresh this page if the booking has not updated yet.`;

  return (
    <main className="shell py-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <p className="eyebrow">Booking confirmation</p>
        <h1 className="page-title mt-4">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted">{description}</p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="soft-surface p-5">
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
          <div className="soft-surface p-5">
            <p className="text-sm text-muted">Payment summary</p>
            <p className="mt-2 text-sm">Deposit paid: {formatCurrency(booking.depositAmount)}</p>
            <p className="mt-1 text-sm">
              {booking.paymentStatus === PaymentStatus.PAID
                ? `Paid in full: ${formatCurrency(booking.totalPrice)}`
                : `Balance outstanding: ${formatCurrency(booking.balanceDue)}`}
            </p>
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
        ) : manageUrl ? (
          <div className="surface-block mt-6">
            <p className="text-sm font-semibold">Bookmark your management link</p>
            <p className="mt-2 text-sm text-muted">
              This is the same secure link sent by email. Save it if you want direct access to manage the booking later.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Link className="button-primary" href={manageUrl}>
                Manage booking
              </Link>
            </div>
            <p className="mt-4 break-all rounded-2xl bg-white/70 px-4 py-3 text-sm ring-1 ring-foreground/10">
              {manageUrl}
            </p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {canRetryReconciliation ? (
            <form action={reconcileBookingConfirmationAction}>
              <input name="sessionId" type="hidden" value={sessionId} />
              <SubmitButton>Check payment status</SubmitButton>
            </form>
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
