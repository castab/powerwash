import Link from "next/link";
import { format } from "date-fns";
import { BookingStatus, PaymentStatus } from "@prisma/client";
import {
  canAutoRefundBooking,
  getManagedBookingByToken,
  getSupportEmail,
} from "@/lib/booking-management";
import { formatCurrency } from "@/lib/utils";
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

export default async function BookingManagePage({ searchParams }: Props) {
  const { token, result, error, confirm } = await searchParams;
  const supportEmail = getSupportEmail();

  if (!token) {
    return (
      <main className="shell py-8">
        <div className="panel mx-auto max-w-3xl p-6 sm:p-8">
          <p className="badge">Manage booking</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Invalid management link</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            This link is missing the secure token needed to view the booking.
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

  const booking = await getManagedBookingByToken(token);

  if (!booking) {
    return (
      <main className="shell py-8">
        <div className="panel mx-auto max-w-3xl p-6 sm:p-8">
          <p className="badge">Manage booking</p>
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

  const cancelAction = cancelManagedBookingAction.bind(null, token);
  const resendAction = resendManagedBookingLinkAction.bind(null, token);
  const resultMessage = getResultMessage(result, supportEmail);
  const errorMessage = getErrorMessage(error);
  const autoRefundEligible = canAutoRefundBooking(booking.startAt);
  const showCancellationWarning = !autoRefundEligible && confirm === "1";
  const canCancel =
    !booking.archivedAt &&
    booking.status === BookingStatus.CONFIRMED &&
    booking.paymentStatus === PaymentStatus.PAID;
  const isArchived = Boolean(booking.archivedAt);

  return (
    <main className="shell py-8">
      <div className="panel mx-auto max-w-4xl p-6 sm:p-8">
        <p className="badge">Manage booking</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          {booking.service.name} booking
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Review the reservation details, resend this secure link, or cancel the booking.
        </p>

        {isArchived ? (
          <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This booking has been archived. You can still view the details, but management actions
            are disabled. Customer access remains available until{" "}
            {booking.customerAccessEndsAt
              ? format(booking.customerAccessEndsAt, "MMMM d, yyyy")
              : "the retention window ends"}
            .
          </p>
        ) : null}

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

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] bg-surface p-5">
            <p className="text-sm text-muted">Appointment</p>
            <p className="mt-2 text-lg font-semibold">
              {format(booking.startAt, "EEEE, MMMM d")} at {format(booking.startAt, "h:mm a")}
            </p>
            <p className="mt-1 text-sm text-muted">{booking.service.name}</p>
            <p className="mt-4 text-sm text-muted">Vehicle</p>
            <p className="mt-1 text-sm font-medium">
              {booking.vehicleYear ? `${booking.vehicleYear} ` : ""}
              {booking.vehicleMake} {booking.vehicleModel}
            </p>
            <p className="mt-1 text-sm text-muted">
              {booking.vehicleColor || "Color not provided"}
              {booking.vehicleLicensePlate ? ` | Plate ${booking.vehicleLicensePlate}` : ""}
            </p>
          </div>

          <div className="rounded-[24px] bg-surface p-5">
            <p className="text-sm text-muted">Payment and status</p>
            <p className="mt-2 text-sm">Status: {booking.status.replaceAll("_", " ")}</p>
            <p className="mt-1 text-sm">Payment: {booking.paymentStatus.replaceAll("_", " ")}</p>
            <p className="mt-1 text-sm">Deposit paid: {formatCurrency(booking.depositAmount)}</p>
            <p className="mt-1 text-sm">Balance due in person: {formatCurrency(booking.balanceDue)}</p>
            {booking.refundedAt ? (
              <p className="mt-1 text-sm">
                Refunded {formatCurrency(booking.refundAmount ?? 0)} on{" "}
                {format(booking.refundedAt, "MMM d, yyyy h:mm a")}
              </p>
            ) : null}
            <div className="mt-4 rounded-2xl border border-line bg-white px-4 py-3 text-sm text-muted">
              {autoRefundEligible
                ? "Canceling now will automatically refund the deposit."
                : supportEmail
                  ? `Canceling now will not refund the deposit automatically. Email ${supportEmail} for help.`
                  : "Canceling now will not refund the deposit automatically. Contact the business for help."}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <form action={resendAction} className="rounded-[24px] border border-line p-5">
            <h2 className="text-lg font-semibold">Resend secure link</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Email a fresh management link and invalidate older links.
            </p>
            <div className="mt-4">
              <SubmitButton disabled={isArchived}>Email new link</SubmitButton>
            </div>
            {isArchived ? (
              <p className="mt-3 text-sm text-muted">
                Archived bookings cannot issue new customer links.
              </p>
            ) : null}
          </form>

          <form action={cancelAction} className="rounded-[24px] border border-line p-5">
            <h2 className="text-lg font-semibold">Cancel booking</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Confirmed bookings canceled at least 24 hours before the appointment receive an
              automatic refund of the deposit.
            </p>
            {canCancel && !autoRefundEligible ? (
              <div className="mt-4 space-y-4">
                {showCancellationWarning ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
                    <p className="font-semibold">Cancel this booking now?</p>
                    <p className="mt-2">
                      This booking will be canceled immediately. The deposit may be forfeited and
                      no automatic refund will be issued.
                    </p>
                    <p className="mt-2">
                      {supportEmail
                        ? `For refund support, please contact ${supportEmail}.`
                        : "For refund support, please contact the business directly."}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                    Canceling inside 24 hours may forfeit the deposit and requires an extra
                    confirmation step.
                  </div>
                )}

                {showCancellationWarning ? (
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input name="confirmInsideWindow" type="hidden" value="true" />
                    <SubmitButton className="bg-red-600 hover:bg-red-700">
                      Confirm cancellation
                    </SubmitButton>
                    <Link
                      className="button-secondary justify-center"
                      href={`/booking/manage?token=${encodeURIComponent(token)}`}
                    >
                      Keep booking
                    </Link>
                  </div>
                ) : (
                  <Link
                    className="button-primary inline-flex justify-center"
                    href={`/booking/manage?token=${encodeURIComponent(token)}&confirm=1`}
                  >
                    Review cancellation warning
                  </Link>
                )}
              </div>
            ) : (
              <div className="mt-4">
                <SubmitButton
                  className="bg-red-600 hover:bg-red-700 disabled:bg-red-300"
                  disabled={!canCancel}
                >
                  {canCancel ? "Cancel booking" : "Cancellation unavailable"}
                </SubmitButton>
              </div>
            )}
            {!canCancel ? (
              <p className="mt-3 text-sm text-muted">
                This booking is not currently eligible for online cancellation.
              </p>
            ) : null}
          </form>
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
