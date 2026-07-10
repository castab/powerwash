import { AdminShell } from "@/components/admin/admin-shell";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { BookingUpdateForm } from "@/components/admin/booking-update-form";
import { getAdminBookings, type AdminBooking } from "@/lib/booking";
import { isImmutableBookingState } from "@/lib/booking-state";
import {
  formatCurrency,
  formatInBusinessTimeZone,
  parseBusinessDateTimeLocalValue,
  toBusinessDateTimeLocalValue,
} from "@/lib/utils";
import {
  archiveBookingAction,
  issueFullBookingRefundAction,
  issueBookingRefundAction,
  requestBookingBalanceAction,
  unarchiveBookingAction,
} from "@/server/actions/admin";

export const dynamic = "force-dynamic";

function groupByDay<T extends { startAt: Date }>(items: T[]) {
  return items.reduce<Record<string, T[]>>((accumulator, item) => {
    const key = toBusinessDateTimeLocalValue(item.startAt).slice(0, 10);
    accumulator[key] ??= [];
    accumulator[key].push(item);
    return accumulator;
  }, {});
}

function formatEventType(type: string) {
  return type.replaceAll("_", " ").toLowerCase();
}

function formatBusinessDate(date: Date) {
  return formatInBusinessTimeZone(date, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatBusinessDateTime(date: Date) {
  return formatInBusinessTimeZone(date, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatBusinessTime(date: Date) {
  return formatInBusinessTimeZone(date, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDeliveryChannel(channel: string | null) {
  if (!channel) {
    return null;
  }

  return channel === "EMAIL" ? "Email on file" : channel.replaceAll("_", " ").toLowerCase();
}

function BookingEvents({ booking }: { booking: AdminBooking }) {
  if (!booking.events.length) {
    return null;
  }

  return (
    <div className="mt-4 rounded-[20px] border border-line bg-white p-4">
      <p className="text-sm font-semibold">History</p>
      <div className="mt-3 grid gap-3 text-sm">
        {booking.events.map((event) => (
          <div className="border-t border-line pt-3 first:border-t-0 first:pt-0" key={event.id}>
            <p className="font-medium">
              {formatEventType(event.type)}{" "}
              <span className="text-muted">on {formatBusinessDateTime(event.createdAt)}</span>
            </p>
            <p className="text-muted">
              {event.actorAdminUser?.email ?? event.actorLabel ?? "system"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BookingCard({
  booking,
  archived = false,
}: {
  booking: AdminBooking;
  archived?: boolean;
}) {
  const isImmutableBooking = isImmutableBookingState(booking);
  const canIssueFullRefund =
    (booking.status === "CONFIRMED" || booking.status === "COMPLETED") &&
    booking.paymentStatus === "PAID" &&
    Boolean(booking.stripePaymentIntentId) &&
    (!booking.totalPrice.gt(booking.depositAmount) || Boolean(booking.balancePaymentIntentId));

  const summary = (
    <>
      <div className="min-w-0 space-y-1 text-sm">
        <p className="font-semibold">
          {formatBusinessTime(booking.startAt)} - {booking.service.name}
        </p>
        <p className="text-muted">
          {booking.firstName} {booking.lastName} | {booking.vehicleDescription}
        </p>
        <p className="text-muted">
          Status {booking.status} / Payment {booking.paymentStatus}
        </p>
        {booking.balanceRequestedAt ? (
          <p className="text-muted">
            Balance request sent {formatBusinessDateTime(booking.balanceRequestedAt)}
          </p>
        ) : null}
        {archived && booking.archivedAt ? (
          <p className="text-muted">
            Archived {formatBusinessDateTime(booking.archivedAt)} by{" "}
            {booking.archivedByAdminUser?.email ?? "unknown admin"}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 text-right text-sm text-muted">
        <span className="group-open:hidden">View details</span>
        <span className="hidden group-open:inline">Hide details</span>
      </div>
    </>
  );

  const details = (
    <>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="grid min-w-0 gap-4 text-sm sm:grid-cols-2">
          <div className="space-y-1">
            <p className="font-semibold">Contact</p>
            <p className="text-muted">{booking.phone}</p>
            <p className="text-muted break-all">{booking.email}</p>
          </div>

          <div className="space-y-1">
            <p className="font-semibold">Vehicle</p>
            <p className="text-muted">{booking.vehicleDescription}</p>
            <p className="text-muted">
              {booking.vehicleColor || "Color not provided"}
              {booking.vehicleLicensePlate ? ` | Plate ${booking.vehicleLicensePlate}` : ""}
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-semibold">Payment</p>
            <p className="text-muted">Deposit {formatCurrency(booking.depositAmount)}</p>
            <p className="text-muted">
              {booking.paymentStatus === "PAID"
                ? `Paid in full ${formatCurrency(booking.totalPrice)}`
                : `Balance due ${formatCurrency(booking.balanceDue)}`}
            </p>
            {booking.balanceRequestedAt ? (
              <p className="text-muted">
                Requested via {formatDeliveryChannel(booking.balanceRequestDeliveryChannel) ?? "Unknown"} on{" "}
                {formatBusinessDateTime(booking.balanceRequestedAt)}
              </p>
            ) : null}
            {booking.balanceRequestDestination ? (
              <p className="text-muted break-all">{booking.balanceRequestDestination}</p>
            ) : null}
            {booking.balancePaidAt ? (
              <p className="text-muted">
                Balance paid {formatBusinessDateTime(booking.balancePaidAt)}
              </p>
            ) : null}
          </div>

          {booking.paymentStatus === "REFUNDED" && booking.refundedAt ? (
            <div className="space-y-1">
              <p className="font-semibold">Refund</p>
              <p className="text-muted">
                {formatCurrency(booking.refundAmount ?? 0)} issued on{" "}
                {formatBusinessDateTime(booking.refundedAt)}
              </p>
            </div>
          ) : null}

          {archived && booking.archivedAt ? (
            <div className="space-y-1">
              <p className="font-semibold">Archive</p>
              <p className="text-muted">
                Archived {formatBusinessDateTime(booking.archivedAt)} by{" "}
                {booking.archivedByAdminUser?.email ?? "unknown admin"}
              </p>
            </div>
          ) : null}

          {archived && booking.customerAccessEndsAt ? (
            <div className="space-y-1">
              <p className="font-semibold">Customer access</p>
              <p className="text-muted">
                Ends{" "}
                {formatInBusinessTimeZone(booking.customerAccessEndsAt, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          ) : null}

          {booking.adminNotes ? (
            <div className="space-y-1 sm:col-span-2">
              <p className="font-semibold">Admin notes</p>
              <p className="whitespace-pre-wrap text-muted">{booking.adminNotes}</p>
            </div>
          ) : null}
        </div>

        <div className="grid min-w-0 gap-3 lg:min-w-80">
          {!archived && !isImmutableBooking ? (
            <BookingUpdateForm
              bookingId={booking.id}
              defaultAdminNotes={booking.adminNotes ?? ""}
              defaultStartAt={toBusinessDateTimeLocalValue(booking.startAt)}
              defaultStatus={booking.status}
            />
          ) : null}

          {!archived && isImmutableBooking ? (
            <div className="rounded-[20px] border border-line bg-white p-4 text-sm text-muted">
              <p className="font-semibold text-foreground">Booking locked</p>
              <p className="mt-1">
                This booking is in a final state. Status, schedule, and admin notes are locked; if
                service is still needed, the customer must create a new booking.
              </p>
            </div>
          ) : null}

          {!archived &&
          booking.status === "CONFIRMED" &&
          booking.paymentStatus === "PARTIALLY_PAID" &&
          booking.balanceDue.gt(0) ? (
            <AdminActionForm
              action={requestBookingBalanceAction}
              bookingId={booking.id}
              submitLabel={
                booking.balanceRequestedAt ? "Resend payment request" : "Request remaining balance"
              }
            >
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Send payment link by</span>
                <select
                  className="field"
                  defaultValue="EMAIL"
                  name="deliveryChannel"
                >
                  <option value="EMAIL">Email on file</option>
                </select>
              </label>
            </AdminActionForm>
          ) : null}

          {booking.status === "CANCELLED" &&
          booking.paymentStatus === "PARTIALLY_PAID" &&
          booking.refundReason === "CUSTOMER_CANCELLED_INSIDE_24_HOURS" &&
          booking.stripePaymentIntentId &&
          !archived ? (
            <AdminActionForm
              action={issueBookingRefundAction}
              bookingId={booking.id}
              submitLabel="Issue deposit refund"
            />
          ) : null}

          {canIssueFullRefund ? (
            <AdminActionForm
              action={issueFullBookingRefundAction}
              bookingId={booking.id}
              submitLabel="Issue full refund"
            />
          ) : null}

          {!archived &&
          ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(booking.status) ? (
            <AdminActionForm
              action={archiveBookingAction}
              bookingId={booking.id}
              submitLabel="Archive booking"
            />
          ) : null}

          {archived ? (
            <AdminActionForm
              action={unarchiveBookingAction}
              bookingId={booking.id}
              submitLabel="Restore booking"
            />
          ) : null}
        </div>
      </div>

      <BookingEvents booking={booking} />
    </>
  );

  return (
    <div className="rounded-[24px] bg-surface/80 p-4 ring-1 ring-foreground/5" key={booking.id}>
      {booking.status === "CANCELLED" &&
      booking.paymentStatus === "PARTIALLY_PAID" &&
      booking.refundReason === "CUSTOMER_CANCELLED_INSIDE_24_HOURS" ? (
        <div className="mb-4 rounded-[20px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Late cancellation awaiting refund decision</p>
          <p className="mt-1">
            This booking was canceled inside 24 hours. The deposit is still marked as paid until an
            admin issues the refund.
          </p>
        </div>
      ) : null}

      <details className="group">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-[20px] text-left marker:hidden">
          {summary}
        </summary>
        <div className="mt-4 border-t border-foreground/10 pt-4">{details}</div>
      </details>
    </div>
  );
}

export default async function AdminBookingsPage() {
  const { active, archived } = await getAdminBookings();
  const grouped = groupByDay(active);

  return (
    <AdminShell
      title="Bookings"
      description="See current reservations, archive finished work out of the default view, and keep a visible event history for each booking."
    >
      <section className="stack">
        {Object.entries(grouped).map(([day, dayBookings]) => (
          <div className="surface-block min-w-0" key={day}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Calendar view</p>
                <h2 className="mt-2 text-xl font-semibold">
                  {formatBusinessDate(parseBusinessDateTimeLocalValue(`${day}T12:00`))}
                </h2>
              </div>
              <p className="text-sm text-muted">{dayBookings.length} bookings</p>
            </div>

            <div className="grid gap-4">
              {dayBookings.map((booking) => (
                <BookingCard booking={booking} key={booking.id} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="surface-block min-w-0">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Archived</p>
            <h2 className="mt-2 text-xl font-semibold">Archived bookings</h2>
          </div>
          <p className="text-sm text-muted">{archived.length} archived</p>
        </div>
        {archived.length ? (
          <div className="grid gap-4">
            {archived.map((booking) => (
              <BookingCard archived booking={booking} key={booking.id} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No archived bookings yet.</p>
        )}
      </section>
    </AdminShell>
  );
}
