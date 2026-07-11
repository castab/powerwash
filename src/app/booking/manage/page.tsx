import Link from "next/link";
import { BookingStatus, PaymentStatus } from "@/generated/prisma/browser";
import {
  canAutoRefundBooking,
  getManagedCustomerByToken,
  getSupportEmail,
  type ManagedCustomerBooking,
} from "@/lib/booking-management";
import {
  formatBusinessDateLong,
  formatBusinessDateTimeLong,
  formatBusinessTime,
  formatCurrency,
} from "@/lib/utils";
import {
  cancelManagedBookingAction,
  resendManagedBookingLinkAction,
} from "@/server/actions/booking";
import { SubmitButton } from "@/components/ui/submit-button";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    token?: string;
    result?: string;
    error?: string;
    confirm?: string;
  }>;
};

function getResultMessage(result: string | undefined, supportEmail: string) {
  switch (result) {
    case "cancelled_refunded":
      return "Your booking was canceled and the deposit refund has been submitted to Stripe.";
    case "cancelled_contact_admin":
      return supportEmail
        ? `Your booking was canceled. Because it is inside the 24-hour window, the deposit was not refunded automatically. Please email ${supportEmail} for help.`
        : "Your booking was canceled. Because it is inside the 24-hour window, the deposit was not refunded automatically. Please contact the business for help.";
    case "resent":
      return "A new management link has been emailed and this page is now using the rotated link.";
    case "already_cancelled":
      return "This booking has already been canceled.";
    case "already_cancelled_refunded":
      return "This booking has already been canceled and refunded.";
    default:
      return "";
  }
}

function getErrorMessage(error: string | undefined) {
  switch (error) {
    case "invalid_link":
      return "This management link is invalid or has been replaced by a newer email.";
    case "booking_not_found":
      return "That booking is no longer available from this link.";
    case "cannot_cancel_terminal":
      return "This booking can no longer be canceled online.";
    case "not_cancellable":
      return "This booking is not in a state that can be canceled online.";
    case "refund_unavailable":
      return "We could not find the Stripe payment for this booking. Please contact the business directly.";
    case "cancel_failed":
      return "We could not cancel this booking right now. Please try again or contact the business.";
    case "resend_failed":
      return "We could not send a new management link right now. Please try again.";
    case "confirm_required":
      return "Please review and confirm the inside-24-hour cancellation warning before canceling this booking.";
    case "archived_view_only":
      return "This booking has been archived and is now view-only.";
    default:
      return "";
  }
}

function splitBookingsByTime(bookings: ManagedCustomerBooking[]) {
  const now = Date.now();

  return {
    upcoming: bookings.filter((booking) => booking.startAt.getTime() >= now),
    past: bookings.filter((booking) => booking.startAt.getTime() < now),
  };
}

function BookingCard({
  booking,
  token,
  confirm,
  supportEmail,
}: {
  booking: ManagedCustomerBooking;
  token: string;
  confirm: string | undefined;
  supportEmail: string;
}) {
  const cancelAction = cancelManagedBookingAction.bind(null, token);
  const autoRefundEligible = canAutoRefundBooking(booking.startAt);
  const showCancellationWarning = !autoRefundEligible && confirm === booking.id;
  const canCancel =
    booking.status === BookingStatus.CONFIRMED &&
    booking.paymentStatus === PaymentStatus.PARTIALLY_PAID;
  const manageBase = `/booking/manage?token=${encodeURIComponent(token)}`;

  return (
    <article className="soft-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">{booking.service.name}</h3>
        <p className="text-sm text-muted">
          {booking.status.replaceAll("_", " ")} · {booking.paymentStatus.replaceAll("_", " ")}
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-sm text-muted">Appointment</p>
          <p className="mt-1 text-sm font-medium">
            {formatBusinessDateLong(booking.startAt)} at {formatBusinessTime(booking.startAt)}
          </p>
          <p className="mt-3 text-sm text-muted">Vehicle</p>
          <p className="mt-1 text-sm font-medium">{booking.vehicle.description}</p>
          <p className="mt-1 text-sm text-muted">
            {booking.vehicle.color || "Color not provided"}
            {booking.vehicle.licensePlate ? ` | Plate ${booking.vehicle.licensePlate}` : ""}
          </p>
          <p className="mt-3 text-sm text-muted">Service address</p>
          <p className="mt-1 text-sm font-medium">{booking.serviceAddress.formattedAddress}</p>
        </div>

        <div>
          <p className="text-sm text-muted">Payment</p>
          <p className="mt-1 text-sm">Deposit paid: {formatCurrency(booking.depositAmount)}</p>
          <p className="mt-1 text-sm">
            {booking.paymentStatus === PaymentStatus.PAID
              ? `Paid in full: ${formatCurrency(booking.totalPrice)}`
              : `Balance outstanding: ${formatCurrency(booking.balanceDue)}`}
          </p>
          {booking.balanceRequestedAt ? (
            <p className="mt-1 text-sm">
              Payment link sent on {formatBusinessDateTimeLong(booking.balanceRequestedAt)}
            </p>
          ) : null}
          {booking.balancePaidAt ? (
            <p className="mt-1 text-sm">
              Balance paid on {formatBusinessDateTimeLong(booking.balancePaidAt)}
            </p>
          ) : null}
          {booking.refundedAt ? (
            <p className="mt-1 text-sm">
              Refunded {formatCurrency(booking.refundAmount ?? 0)} on{" "}
              {formatBusinessDateTimeLong(booking.refundedAt)}
            </p>
          ) : null}
        </div>
      </div>

      {canCancel ? (
        <div className="mt-5 border-t border-foreground/10 pt-4">
          {!autoRefundEligible ? (
            showCancellationWarning ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
                  <p className="font-semibold">Cancel this booking now?</p>
                  <p className="mt-2">
                    This booking will be canceled immediately. The deposit may be forfeited and no
                    automatic refund will be issued.
                  </p>
                  <p className="mt-2">
                    {supportEmail
                      ? `For refund support, please contact ${supportEmail}.`
                      : "For refund support, please contact the business directly."}
                  </p>
                </div>
                <form action={cancelAction} className="flex flex-col gap-3 sm:flex-row">
                  <input name="bookingId" type="hidden" value={booking.id} />
                  <input name="confirmInsideWindow" type="hidden" value="true" />
                  <SubmitButton className="bg-red-600 hover:bg-red-700">
                    Confirm cancellation
                  </SubmitButton>
                  <Link className="button-secondary justify-center" href={manageBase}>
                    Keep booking
                  </Link>
                </form>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                  Canceling inside 24 hours may forfeit the deposit and requires an extra
                  confirmation step.
                </div>
                <Link
                  className="button-primary inline-flex justify-center"
                  href={`${manageBase}&confirm=${encodeURIComponent(booking.id)}`}
                >
                  Review cancellation warning
                </Link>
              </div>
            )
          ) : (
            <form action={cancelAction} className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input name="bookingId" type="hidden" value={booking.id} />
              <SubmitButton className="bg-red-600 hover:bg-red-700">Cancel booking</SubmitButton>
              <p className="text-sm text-muted">
                Canceling now will automatically refund the deposit.
              </p>
            </form>
          )}
        </div>
      ) : null}
    </article>
  );
}

export default async function BookingManagePage({ searchParams }: Props) {
  const { token, result, error, confirm } = await searchParams;
  const supportEmail = getSupportEmail();

  if (!token) {
    return (
      <main className="shell py-8">
        <div className="surface-block mx-auto max-w-3xl">
          <p className="eyebrow">Manage bookings</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Invalid management link</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            This link is missing the secure token needed to view your bookings.
          </p>
          <div className="mt-6">
            <Link className="button-primary" href="/">
              Back to home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const customer = await getManagedCustomerByToken(token);

  if (!customer) {
    return (
      <main className="shell py-8">
        <div className="surface-block mx-auto max-w-3xl">
          <p className="eyebrow">Manage bookings</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Link no longer valid</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            This link is invalid or has been replaced by a newer email. Use the latest management
            email sent to you.
          </p>
          <div className="mt-6">
            <Link className="button-primary" href="/">
              Back to home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const resendAction = resendManagedBookingLinkAction.bind(null, token);
  const resultMessage = getResultMessage(result, supportEmail);
  const errorMessage = getErrorMessage(error);
  const { upcoming: upcomingBookings, past: pastBookings } = splitBookingsByTime(
    customer.bookings,
  );

  return (
    <main className="shell py-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <p className="eyebrow">Manage bookings</p>
        <h1 className="page-title mt-4">Your bookings</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Hi {customer.firstName} — review your reservations, cancel a booking, or resend this
          secure link.
        </p>

        {resultMessage ? (
          <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {resultMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}

        {!customer.bookings.length ? (
          <div className="surface-block mt-6">
            <p className="text-sm text-muted">
              You don&apos;t have any active bookings. Book a new appointment any time.
            </p>
            <div className="mt-4">
              <Link className="button-primary" href="/book">
                Book an appointment
              </Link>
            </div>
          </div>
        ) : null}

        {upcomingBookings.length ? (
          <section className="mt-8">
            <h2 className="text-xl font-semibold tracking-tight">Upcoming</h2>
            <div className="mt-4 grid gap-4">
              {upcomingBookings.map((booking) => (
                <BookingCard
                  booking={booking}
                  confirm={confirm}
                  key={booking.id}
                  supportEmail={supportEmail}
                  token={token}
                />
              ))}
            </div>
          </section>
        ) : null}

        {pastBookings.length ? (
          <section className="mt-8">
            <h2 className="text-xl font-semibold tracking-tight">Past</h2>
            <div className="mt-4 grid gap-4">
              {pastBookings.map((booking) => (
                <BookingCard
                  booking={booking}
                  confirm={confirm}
                  key={booking.id}
                  supportEmail={supportEmail}
                  token={token}
                />
              ))}
            </div>
          </section>
        ) : null}

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <form action={resendAction} className="surface-block">
            <h2 className="text-lg font-semibold">Resend secure link</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Email a fresh management link and invalidate older links.
            </p>
            <div className="mt-4">
              <SubmitButton>Email new link</SubmitButton>
            </div>
          </form>

          <div className="surface-block">
            <h2 className="text-lg font-semibold">Cancellation policy</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Confirmed bookings canceled at least 24 hours before the appointment receive an
              automatic refund of the deposit. Cancellations inside 24 hours are not refunded
              automatically.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <Link className="button-secondary" href="/">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
