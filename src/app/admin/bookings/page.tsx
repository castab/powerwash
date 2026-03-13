import { format } from "date-fns";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminBookings, type AdminBooking } from "@/lib/booking";
import { formatCurrency } from "@/lib/utils";
import {
  archiveBookingAction,
  issueBookingRefundAction,
  unarchiveBookingAction,
  updateBookingAction,
} from "@/server/actions/admin";
import { SubmitButton } from "@/components/ui/submit-button";

export const dynamic = "force-dynamic";

function groupByDay<T extends { startAt: Date }>(items: T[]) {
  return items.reduce<Record<string, T[]>>((accumulator, item) => {
    const key = format(item.startAt, "yyyy-MM-dd");
    accumulator[key] ??= [];
    accumulator[key].push(item);
    return accumulator;
  }, {});
}

function formatEventType(type: string) {
  return type.replaceAll("_", " ").toLowerCase();
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
              <span className="text-muted">on {format(event.createdAt, "MMM d, h:mm a")}</span>
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
  return (
    <div className="rounded-[24px] border border-line bg-surface p-4" key={booking.id}>
      {booking.status === "CANCELLED" &&
      booking.paymentStatus === "PAID" &&
      booking.refundReason === "CUSTOMER_CANCELLED_INSIDE_24_HOURS" ? (
        <div className="mb-4 rounded-[20px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Late cancellation awaiting refund decision</p>
          <p className="mt-1">
            This booking was canceled inside 24 hours. The deposit is still marked as paid until an
            admin issues the refund.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1 text-sm">
          <p className="font-semibold">
            {format(booking.startAt, "h:mm a")} - {booking.service.name}
          </p>
          <p className="text-muted">
            {booking.firstName} {booking.lastName} | {booking.vehicleMake} {booking.vehicleModel}
          </p>
          <p className="text-muted">{booking.phone}</p>
          <p className="text-muted">
            Deposit {formatCurrency(booking.depositAmount)}, balance due{" "}
            {formatCurrency(booking.balanceDue)}
          </p>
          <p className="text-muted">
            Status {booking.status} / Payment {booking.paymentStatus}
          </p>
          {booking.paymentStatus === "REFUNDED" && booking.refundedAt ? (
            <p className="text-muted">
              Refund issued {formatCurrency(booking.refundAmount ?? 0)} on{" "}
              {format(booking.refundedAt, "MMM d, h:mm a")}
            </p>
          ) : null}
          {archived && booking.archivedAt ? (
            <p className="text-muted">
              Archived {format(booking.archivedAt, "MMM d, h:mm a")} by{" "}
              {booking.archivedByAdminUser?.email ?? "unknown admin"}
            </p>
          ) : null}
          {archived && booking.customerAccessEndsAt ? (
            <p className="text-muted">
              Customer link access ends {format(booking.customerAccessEndsAt, "MMM d, yyyy")}
            </p>
          ) : null}
        </div>

        <div className="grid min-w-0 gap-3 lg:min-w-80">
          {!archived ? (
            <form action={updateBookingAction} className="grid gap-3">
              <input name="bookingId" type="hidden" value={booking.id} />
              <input
                className="field"
                defaultValue={booking.startAt.toISOString().slice(0, 16)}
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

          {booking.status === "CANCELLED" &&
          booking.paymentStatus === "PAID" &&
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
      <section className="panel min-w-0 overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold">Upcoming list</h2>
        </div>
        <div className="p-3 sm:p-5">
          <div className="overflow-x-auto rounded-[22px] border border-line bg-surface">
            <table className="min-w-[720px] text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-5 py-3 font-medium">Time</th>
                  <th className="px-5 py-3 font-medium">Deposit</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {active.map((booking) => (
                  <tr className="border-t border-line" key={booking.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium">
                        {booking.firstName} {booking.lastName}
                      </p>
                      <p className="text-muted">{booking.phone}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium">{booking.service.name}</p>
                      <p className="text-muted">
                        {booking.vehicleMake} {booking.vehicleModel}
                      </p>
                    </td>
                    <td className="px-5 py-4">{format(booking.startAt, "MMM d, h:mm a")}</td>
                    <td className="px-5 py-4">
                      {formatCurrency(booking.depositAmount)} / {booking.paymentStatus}
                    </td>
                    <td className="px-5 py-4">{booking.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="stack">
        {Object.entries(grouped).map(([day, dayBookings]) => (
          <div className="panel min-w-0 p-5" key={day}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="badge">Calendar view</p>
                <h2 className="mt-2 text-xl font-semibold">{format(new Date(day), "EEEE, MMMM d")}</h2>
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
