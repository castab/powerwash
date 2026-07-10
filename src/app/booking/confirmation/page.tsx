import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingStatus, PaymentStatus } from "@/generated/prisma/browser";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { getManagementUrlForBooking, getSupportEmail } from "@/lib/booking-management";
import { formatBusinessDateLong, formatBusinessTime, formatCurrency } from "@/lib/utils";
import { ConfirmationFinalizer } from "./confirmation-finalizer";

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
  const supportEmail = getSupportEmail() ?? null;
  const isDepositFlow = checkoutPurpose === "deposit";
  const sessionCompleted = session.status === "complete" && session.payment_status === "paid";
  const sessionExpired = session.status === "expired";
  // The hold ended without payment — every expiry path lands on this pair.
  const depositExpired =
    isDepositFlow &&
    booking.status === BookingStatus.CANCELLED &&
    booking.paymentStatus === PaymentStatus.FAILED;
  // Payment state is still syncing (webhook not landed yet, or the manage link
  // isn't ready). The finalizer polls until this resolves one way or the other.
  const isFinalizing =
    isDepositFlow &&
    !depositExpired &&
    (booking.status === BookingStatus.PENDING_PAYMENT || !manageUrl);
  const needsBalanceSync =
    !isDepositFlow &&
    sessionCompleted &&
    booking.paymentStatus !== PaymentStatus.PAID;
  const balanceLinkExpired =
    !isDepositFlow && sessionExpired && booking.paymentStatus !== PaymentStatus.PAID;
  const showFinalizer = isFinalizing || needsBalanceSync;

  const title = depositExpired
    ? "Payment not completed"
    : isFinalizing
      ? "Finalizing your payment"
      : isDepositFlow
        ? "Deposit received"
        : balanceLinkExpired
          ? "Payment link expired"
          : needsBalanceSync
            ? "Finalizing your balance payment"
            : booking.paymentStatus === PaymentStatus.PAID
              ? "Balance payment received"
              : "Payment received";
  const description = depositExpired
    ? "The deposit payment didn't go through in time, so the time slot has been released and no charge was made. You can pick a new time below."
    : isFinalizing
      ? "Stripe is confirming your payment. This page updates automatically — you don't need to do anything."
      : isDepositFlow
        ? `Your booking is held for ${booking.firstName}. We also emailed a secure booking management link and Stripe sent the payment receipt. Remaining balance is still outstanding until service day.`
        : balanceLinkExpired
          ? "This balance payment link is no longer active. Use the most recent payment email we sent, or contact us to request a new one."
          : needsBalanceSync
            ? `Stripe completed the balance checkout for ${booking.firstName}. This page updates automatically once the booking reflects it.`
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
              {formatBusinessDateLong(booking.startAt)} at {formatBusinessTime(booking.startAt)}
            </p>
            <p className="mt-1 text-sm text-muted">Vehicle: {booking.vehicleDescription}</p>
          </div>
          <div className="soft-surface p-5">
            <p className="text-sm text-muted">Payment summary</p>
            {depositExpired ? (
              <p className="mt-2 text-sm">No payment was collected.</p>
            ) : (
              <>
                <p className="mt-2 text-sm">Deposit paid: {formatCurrency(booking.depositAmount)}</p>
                <p className="mt-1 text-sm">
                  {booking.paymentStatus === PaymentStatus.PAID
                    ? `Paid in full: ${formatCurrency(booking.totalPrice)}`
                    : `Balance outstanding: ${formatCurrency(booking.balanceDue)}`}
                </p>
              </>
            )}
            <p className="mt-1 text-sm">Booking status: {booking.status.replaceAll("_", " ")}</p>
          </div>
        </div>

        {showFinalizer ? (
          <ConfirmationFinalizer sessionId={sessionId} supportEmail={supportEmail} />
        ) : depositExpired ? (
          <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-semibold">Your card was not charged</p>
            <p className="mt-2">
              The reserved time slot has been released so someone else can book it.
              {supportEmail
                ? ` If you had trouble paying, or believe you were charged, contact ${supportEmail}.`
                : " If you had trouble paying, or believe you were charged, please contact the business directly."}
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
          {depositExpired ? (
            <Link className="button-primary" href={`/book?serviceId=${booking.serviceId}`}>
              Pick a new time
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
