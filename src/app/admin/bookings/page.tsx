import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminBookings, type AdminBooking } from "@/lib/booking";
import {
  formatCurrency,
  formatInBusinessTimeZone,
  parseBusinessDateTimeLocalValue,
  toBusinessDateTimeLocalValue,
} from "@/lib/utils";
import {
  archiveBookingAction,
  issueBookingRefundAction,
  requestBookingBalanceAction,
  unarchiveBookingAction,
  updateBookingAction,
} from "@/server/actions/admin";
import { SubmitButton } from "@/components/ui/submit-button";

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
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-950">History</p>
      <div className="mt-4">
        {booking.events.map((event) => (
          <div className="flex gap-x-3" key={event.id}>
            <div className="relative">
              <div className="relative z-10 mt-1 size-3 rounded-full bg-brand" />
              <div className="absolute left-1.5 top-4 h-[calc(100%-0.25rem)] border-l border-slate-200 last:hidden" />
            </div>
            <div className="grow pb-4">
              <p className="font-medium text-slate-900">
                {formatEventType(event.type)}{" "}
                <span className="text-muted">on {formatBusinessDateTime(event.createdAt)}</span>
              </p>
              <p className="text-sm text-muted">
                {event.actorAdminUser?.email ?? event.actorLabel ?? "system"}
              </p>
            </div>
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
  const accordionId = `booking-${booking.id}`;
  const collapseId = `${accordionId}-details`;
  const summary = (
    <>
      <div className="min-w-0 space-y-1 text-sm">
        <p className="font-semibold text-slate-950">
          {formatBusinessTime(booking.startAt)} - {booking.service.name}
        </p>
        <p className="text-muted">
          {booking.firstName} {booking.lastName} | {booking.vehicleMake} {booking.vehicleModel}
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
        <span className="inline-flex items-center gap-x-2 rounded-full border border-slate-200 bg-white px-3 py-1 font-medium">
          Details
        </span>
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
            <p className="text-muted">
              {booking.vehicleYear ? `${booking.vehicleYear} ` : ""}
              {booking.vehicleMake} {booking.vehicleModel}
            </p>
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
          {!archived ? (
            <form action={updateBookingAction} className="grid gap-3">
              <input name="bookingId" type="hidden" value={booking.id} />
              <input
                className="field"
                defaultValue={toBusinessDateTimeLocalValue(booking.startAt)}
                name="startAt"
                type="datetime-local"
              />
              <select className="field" defaultValue={booking.status} name="status">
                <option value="CONFIRMED">Confirmed</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="COMPLETED">Completed</option>
                <option value="NO_SHOW">No show</option>
              </select>
              <textarea
                className="field min-h-24 resize-y"
                defaultValue={booking.adminNotes ?? ""}
                name="adminNotes"
                placeholder="Admin notes"
              />
              <SubmitButton className="w-full justify-center">Save booking</SubmitButton>
            </form>
          ) : null}

          {!archived &&
          booking.status === "CONFIRMED" &&
          booking.paymentStatus === "PARTIALLY_PAID" &&
          booking.balanceDue.gt(0) ? (
            <form action={requestBookingBalanceAction} className="grid gap-3">
              <input name="bookingId" type="hidden" value={booking.id} />
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
              <SubmitButton className="w-full justify-center">
                {booking.balanceRequestedAt ? "Resend payment request" : "Request remaining balance"}
              </SubmitButton>
            </form>
          ) : null}

          {booking.status === "CANCELLED" &&
          booking.paymentStatus === "PARTIALLY_PAID" &&
          booking.refundReason === "CUSTOMER_CANCELLED_INSIDE_24_HOURS" &&
          booking.stripePaymentIntentId &&
          !archived ? (
            <form action={issueBookingRefundAction}>
              <input name="bookingId" type="hidden" value={booking.id} />
              <SubmitButton className="w-full justify-center">Issue deposit refund</SubmitButton>
            </form>
          ) : null}

          {!archived &&
          ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(booking.status) ? (
            <form action={archiveBookingAction}>
              <input name="bookingId" type="hidden" value={booking.id} />
              <SubmitButton className="w-full justify-center">Archive booking</SubmitButton>
            </form>
          ) : null}

          {archived ? (
            <form action={unarchiveBookingAction}>
              <input name="bookingId" type="hidden" value={booking.id} />
              <SubmitButton className="w-full justify-center">Restore booking</SubmitButton>
            </form>
          ) : null}
        </div>
      </div>

      <BookingEvents booking={booking} />
    </>
  );

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4" key={booking.id}>
      {booking.status === "CANCELLED" &&
      booking.paymentStatus === "PARTIALLY_PAID" &&
      booking.refundReason === "CUSTOMER_CANCELLED_INSIDE_24_HOURS" ? (
        <div className="alert-warning mb-4">
          <p className="font-semibold">Late cancellation awaiting refund decision</p>
          <p className="mt-1">
            This booking was canceled inside 24 hours. The deposit is still marked as paid until an
            admin issues the refund.
          </p>
        </div>
      ) : null}

      <div className="hs-accordion" id={accordionId}>
        <button
          aria-controls={collapseId}
          className="hs-accordion-toggle flex w-full items-start justify-between gap-3 rounded-[20px] text-left"
          type="button"
        >
          {summary}
        </button>
        <div
          className="hs-accordion-content hidden w-full overflow-hidden transition-[height] duration-300"
          id={collapseId}
          role="region"
        >
          <div className="mt-4 border-t border-slate-200 pt-4">{details}</div>
        </div>
      </div>
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
          <div className="panel min-w-0 p-5" key={day}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">
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

      <section className="panel min-w-0 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="badge">Archived</p>
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
