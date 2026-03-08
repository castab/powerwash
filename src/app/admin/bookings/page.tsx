import { format } from "date-fns";
import { AdminShell } from "@/components/admin/admin-shell";
import { getUpcomingBookings } from "@/lib/booking";
import { formatCurrency } from "@/lib/utils";
import { issueBookingRefundAction, updateBookingAction } from "@/server/actions/admin";
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

export default async function AdminBookingsPage() {
  const bookings = await getUpcomingBookings();
  const grouped = groupByDay(bookings);

  return (
    <AdminShell
      title="Bookings"
      description="See upcoming reservations in a list plus a grouped, calendar-friendly agenda view. Admins can cancel, reschedule, and track payment state from here."
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
                {bookings.map((booking) => (
                  <tr className="border-t border-line" key={booking.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium">
                        {booking.customer.firstName} {booking.customer.lastName}
                      </p>
                      <p className="text-muted">{booking.customer.phone}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium">{booking.service.name}</p>
                      <p className="text-muted">
                        {booking.vehicle.make} {booking.vehicle.model}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      {format(booking.startAt, "MMM d, h:mm a")}
                    </td>
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
                <div
                  className="rounded-[24px] border border-line bg-surface p-4"
                  key={booking.id}
                >
                  {booking.status === "CANCELLED" &&
                  booking.paymentStatus === "PAID" &&
                  booking.refundReason === "CUSTOMER_CANCELLED_INSIDE_24_HOURS" ? (
                    <div className="mb-4 rounded-[20px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      <p className="font-semibold">Late cancellation awaiting refund decision</p>
                      <p className="mt-1">
                        This booking was canceled inside 24 hours. The deposit is still marked as
                        paid until an admin issues the refund.
                      </p>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-1 text-sm">
                      <p className="font-semibold">
                        {format(booking.startAt, "h:mm a")} - {booking.service.name}
                      </p>
                      <p className="text-muted">
                        {booking.customer.firstName} {booking.customer.lastName} |{" "}
                        {booking.vehicle.make} {booking.vehicle.model}
                      </p>
                      <p className="text-muted">
                        Deposit {formatCurrency(booking.depositAmount)}, balance due{" "}
                        {formatCurrency(booking.balanceDue)}
                      </p>
                      {booking.paymentStatus === "REFUNDED" && booking.refundedAt ? (
                        <p className="text-muted">
                          Refund issued {formatCurrency(booking.refundAmount ?? 0)} on{" "}
                          {format(booking.refundedAt, "MMM d, h:mm a")}
                        </p>
                      ) : null}
                    </div>
                    <div className="grid min-w-0 gap-3 lg:min-w-80">
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

                      {booking.status === "CANCELLED" &&
                      booking.paymentStatus === "PAID" &&
                      booking.refundReason === "CUSTOMER_CANCELLED_INSIDE_24_HOURS" &&
                      booking.stripePaymentIntentId ? (
                        <form action={issueBookingRefundAction}>
                          <input name="bookingId" type="hidden" value={booking.id} />
                          <SubmitButton className="w-full justify-center">
                            Issue deposit refund
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </AdminShell>
  );
}
