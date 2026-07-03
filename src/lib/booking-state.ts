import { BookingStatus, PaymentStatus } from "@/generated/prisma/client";

export function isImmutableBookingState(booking: {
  status: BookingStatus;
  paymentStatus: PaymentStatus;
}) {
  if (booking.status === BookingStatus.NO_SHOW) {
    return true;
  }

  if (booking.status === BookingStatus.COMPLETED) {
    return (
      booking.paymentStatus === PaymentStatus.PAID ||
      booking.paymentStatus === PaymentStatus.REFUNDED
    );
  }

  if (booking.status === BookingStatus.CANCELLED) {
    return (
      booking.paymentStatus === PaymentStatus.REFUNDED ||
      booking.paymentStatus === PaymentStatus.FAILED
    );
  }

  return false;
}
