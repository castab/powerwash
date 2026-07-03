import { BookingEventType, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type EventPayload = Prisma.InputJsonValue | null | undefined;

export function serializeEventState<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function pickBookingEventState(
  booking: {
    id: string;
    serviceId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    vehicleMake: string;
    vehicleModel: string;
    vehicleYear: number | null;
    vehicleColor: string | null;
    vehicleLicensePlate: string | null;
    customerNotes: string | null;
    startAt: Date;
    endAt: Date;
    status: string;
    paymentStatus: string;
    totalPrice: Prisma.Decimal | number | string;
    depositAmount: Prisma.Decimal | number | string;
    balanceDue: Prisma.Decimal | number | string;
    adminNotes: string | null;
    paymentExpiresAt: Date | null;
    confirmedAt: Date | null;
    cancelledAt: Date | null;
    manageTokenVersion: number;
    manageTokenRotatedAt: Date | null;
    manageLinkSentAt: Date | null;
    refundAmount: Prisma.Decimal | number | string | null;
    refundReason: string | null;
    refundedAt: Date | null;
    stripeBalanceRefundId: string | null;
    balanceRequestVersion: number;
    balanceRequestedAt: Date | null;
    balanceRequestDeliveryChannel: string | null;
    balanceRequestDestination: string | null;
    balanceCheckoutSessionId: string | null;
    balancePaymentIntentId: string | null;
    balancePaidAt: Date | null;
    archivedAt: Date | null;
    archivedByAdminUserId: string | null;
    customerAccessEndsAt: Date | null;
  },
) {
  return serializeEventState(booking);
}

export async function createBookingEvent(input: {
  db?: Prisma.TransactionClient | typeof prisma;
  bookingId: string;
  type: BookingEventType;
  actorAdminUserId?: string | null;
  actorLabel?: string | null;
  beforeState?: EventPayload;
  afterState?: EventPayload;
}) {
  const db = input.db ?? prisma;

  return db.bookingEvent.create({
    data: {
      bookingId: input.bookingId,
      type: input.type,
      actorAdminUserId: input.actorAdminUserId ?? null,
      actorLabel: input.actorLabel ?? null,
      beforeState: input.beforeState ?? undefined,
      afterState: input.afterState ?? undefined,
    },
  });
}
