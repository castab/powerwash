import { addMinutes, areIntervalsOverlapping, format, isBefore, set, startOfDay } from "date-fns";
import { BookingEventType, BookingStatus, PaymentStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createBookingEvent, pickBookingEventState } from "@/lib/booking-events";
import { subtractMoney } from "@/lib/utils";

const SLOT_INTERVAL_MINUTES = 15;
const HOLD_MINUTES = 30;

export type AvailableSlot = {
  startAt: string;
  endAt: string;
  label: string;
};

const adminBookingInclude = {
  service: true,
  archivedByAdminUser: true,
  events: {
    orderBy: { createdAt: "desc" as const },
    include: {
      actorAdminUser: true,
    },
  },
} satisfies Prisma.BookingInclude;

export type AdminBooking = Prisma.BookingGetPayload<{
  include: typeof adminBookingInclude;
}>;

function getDayBounds(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return set(date, {
    hours,
    minutes,
    seconds: 0,
    milliseconds: 0,
  });
}

export async function getPublicServices() {
  return prisma.service.findMany({
    where: { isActive: true },
    orderBy: { basePrice: "asc" },
  });
}

export async function getAvailableSlots(serviceId: string, dateInput: string) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
  });

  if (!service || !service.isActive) return [];

  const date = startOfDay(new Date(`${dateInput}T00:00:00`));
  const dayOfWeek = date.getDay();

  const [rules, bookings, blackouts] = await Promise.all([
    prisma.availabilityRule.findMany({
      where: { dayOfWeek, isActive: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        startAt: {
          gte: date,
          lt: addMinutes(date, 60 * 24),
        },
        OR: [
          {
            status: {
              in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.NO_SHOW],
            },
          },
          {
            status: BookingStatus.PENDING_PAYMENT,
            paymentExpiresAt: { gt: new Date() },
          },
        ],
      },
      select: { startAt: true, endAt: true },
    }),
    prisma.blackoutDate.findMany({
      where: {
        isActive: true,
        startsAt: { lt: addMinutes(date, 60 * 24) },
        endsAt: { gt: date },
      },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  const now = new Date();
  const slots: AvailableSlot[] = [];

  for (const rule of rules) {
    const windowStart = getDayBounds(date, rule.startTime);
    const windowEnd = getDayBounds(date, rule.endTime);

    for (
      let slotStart = new Date(windowStart);
      addMinutes(slotStart, service.durationMinutes) <= windowEnd;
      slotStart = addMinutes(slotStart, SLOT_INTERVAL_MINUTES)
    ) {
      const slotEnd = addMinutes(slotStart, service.durationMinutes);

      if (isBefore(slotStart, addMinutes(now, 60))) continue;

      const overlapsBooking = bookings.some((booking) =>
        areIntervalsOverlapping(
          { start: slotStart, end: slotEnd },
          { start: booking.startAt, end: booking.endAt },
          { inclusive: false },
        ),
      );

      if (overlapsBooking) continue;

      const overlapsBlackout = blackouts.some((blackout) =>
        areIntervalsOverlapping(
          { start: slotStart, end: slotEnd },
          { start: blackout.startsAt, end: blackout.endsAt },
          { inclusive: false },
        ),
      );

      if (overlapsBlackout) continue;

      slots.push({
        startAt: slotStart.toISOString(),
        endAt: slotEnd.toISOString(),
        label: format(slotStart, "h:mm a"),
      });
    }
  }

  return slots;
}

export async function ensureBookableSlot(serviceId: string, dateInput: string, startAtIso: string) {
  const slots = await getAvailableSlots(serviceId, dateInput);
  return slots.some((slot) => slot.startAt === startAtIso);
}

export async function createHeldBooking(input: {
  serviceId: string;
  date: string;
  startAtIso: string;
  startAt: Date;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  vehicleDescription: string;
  color?: string;
  licensePlate?: string;
  notes?: string;
}) {
  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
  });

  if (!service || !service.isActive) {
    throw new Error("Service is no longer available.");
  }

  const slotIsAvailable = await ensureBookableSlot(input.serviceId, input.date, input.startAtIso);
  if (!slotIsAvailable) {
    throw new Error("Selected time is no longer available.");
  }

  const endAt = addMinutes(input.startAt, service.durationMinutes);

  return prisma.$transaction(
    async (tx) => {
      const overlap = await tx.booking.findFirst({
        where: {
          startAt: { lt: endAt },
          endAt: { gt: input.startAt },
          OR: [
            {
              status: {
                in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.NO_SHOW],
              },
            },
            {
              status: BookingStatus.PENDING_PAYMENT,
              paymentExpiresAt: { gt: new Date() },
            },
          ],
        },
      });

      if (overlap) {
        throw new Error("That appointment window was just taken.");
      }

      try {
        const booking = await tx.booking.create({
          data: {
            serviceId: service.id,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            phone: input.phone,
            vehicleDescription: input.vehicleDescription,
            vehicleColor: input.color,
            vehicleLicensePlate: input.licensePlate,
            customerNotes: input.notes,
            startAt: input.startAt,
            endAt,
            totalPrice: service.basePrice,
            depositAmount: service.depositAmount,
            balanceDue: subtractMoney(service.basePrice, service.depositAmount),
            status: BookingStatus.PENDING_PAYMENT,
            paymentStatus: PaymentStatus.PENDING,
            paymentExpiresAt: addMinutes(new Date(), HOLD_MINUTES),
          },
          include: {
            service: true,
          },
        });

        await createBookingEvent({
          db: tx,
          bookingId: booking.id,
          type: BookingEventType.BOOKING_CREATED,
          actorLabel: "customer",
          afterState: pickBookingEventState(booking),
        });

        return booking;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError ||
          error instanceof Prisma.PrismaClientUnknownRequestError
        ) {
          throw new Error("That appointment window was just taken.");
        }
        throw error;
      }
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

export async function getAdminBookings() {
  const baseWhere = {
    OR: [
      { startAt: { gte: startOfDay(new Date()) } },
      {
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] },
        paymentStatus: PaymentStatus.PAID,
      },
    ],
    status: {
      in: [
        BookingStatus.PENDING_PAYMENT,
        BookingStatus.CONFIRMED,
        BookingStatus.CANCELLED,
        BookingStatus.COMPLETED,
        BookingStatus.NO_SHOW,
      ],
    },
  } satisfies Prisma.BookingWhereInput;

  const [active, archived] = await Promise.all([
    prisma.booking.findMany({
      where: {
        ...baseWhere,
        archivedAt: null,
      },
      include: adminBookingInclude,
      orderBy: { startAt: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        ...baseWhere,
        archivedAt: { not: null },
      },
      include: adminBookingInclude,
      orderBy: [{ archivedAt: "desc" }, { startAt: "asc" }],
    }),
  ]);

  return { active, archived };
}
