import { addMinutes, startOfDay } from "date-fns";
import { BookingEventType, BookingStatus, PaymentStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getBusinessDayWindow, getDayOfWeekForDateValue } from "@/lib/business-time";
import { computeAvailableSlots } from "@/lib/booking-slots";
import { createBookingEvent, pickBookingEventState } from "@/lib/booking-events";
import { subtractMoney } from "@/lib/utils";

export const HOLD_MINUTES = 35;

export type { AvailableSlot } from "@/lib/booking-slots";

const adminBookingInclude = {
  service: true,
  customer: true,
  vehicle: true,
  serviceAddress: true,
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

  const dayWindow = getBusinessDayWindow(dateInput);
  const dayOfWeek = getDayOfWeekForDateValue(dateInput);

  const [rules, bookings, blackouts] = await Promise.all([
    prisma.availabilityRule.findMany({
      where: { dayOfWeek, isActive: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        // Range overlap (start < dayEnd AND end > dayStart) rather than "starts
        // within the day", so a booking that begins the previous day and runs
        // past midnight into this one still masks its slots. Symmetric with the
        // blackout query below and with the DB exclusion constraint.
        startAt: { lt: dayWindow.end },
        endAt: { gt: dayWindow.start },
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
        startsAt: { lt: dayWindow.end },
        endsAt: { gt: dayWindow.start },
      },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  return computeAvailableSlots({
    dateValue: dateInput,
    durationMinutes: service.durationMinutes,
    rules,
    bookings,
    blackouts,
  });
}

export async function ensureBookableSlot(serviceId: string, dateInput: string, startAtIso: string) {
  const slots = await getAvailableSlots(serviceId, dateInput);
  return slots.some((slot) => slot.startAt === startAtIso);
}

export type OverlappingBooking = {
  id: string;
  startAt: Date;
  endAt: Date;
  customer: { firstName: string; lastName: string };
  service: { name: string };
};

// Returns an active booking whose range overlaps [startAt, endAt), excluding the
// booking being moved. Uses the same active-conflict definition as
// `createHeldBooking` so admin reschedules honor the same overlap semantics the
// customer flow and the `booking_no_overlap` exclusion constraint enforce.
export async function findOverlappingActiveBooking(input: {
  startAt: Date;
  endAt: Date;
  excludeBookingId?: string;
}): Promise<OverlappingBooking | null> {
  return prisma.booking.findFirst({
    where: {
      ...(input.excludeBookingId ? { id: { not: input.excludeBookingId } } : {}),
      startAt: { lt: input.endAt },
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
    select: {
      id: true,
      startAt: true,
      endAt: true,
      customer: { select: { firstName: true, lastName: true } },
      service: { select: { name: true } },
    },
  });
}

export function normalizeCustomerEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeMatchText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Pure matchers so the find-or-create identity rules are unit-testable without
// a database. Existing rows are never mutated on a mismatch — historic bookings
// keep their exact vehicle/address via foreign key.
export function findMatchingVehicle<
  T extends { description: string; color: string | null; licensePlate: string | null },
>(
  vehicles: T[],
  input: { description: string; color?: string | null; licensePlate?: string | null },
): T | null {
  return (
    vehicles.find(
      (vehicle) =>
        normalizeMatchText(vehicle.description) === normalizeMatchText(input.description) &&
        normalizeMatchText(vehicle.color) === normalizeMatchText(input.color) &&
        normalizeMatchText(vehicle.licensePlate) === normalizeMatchText(input.licensePlate),
    ) ?? null
  );
}

export function findMatchingAddress<
  T extends { googlePlaceId: string | null; formattedAddress: string },
>(
  addresses: T[],
  input: { placeId?: string | null; formattedAddress: string },
): T | null {
  if (input.placeId) {
    const byPlaceId = addresses.find((address) => address.googlePlaceId === input.placeId);
    if (byPlaceId) return byPlaceId;
  }

  return (
    addresses.find(
      (address) =>
        normalizeMatchText(address.formattedAddress) ===
        normalizeMatchText(input.formattedAddress),
    ) ?? null
  );
}

// Re-booking fast path for canonical address resolution: a validated stored row
// for this placeId already holds Google's canonical formatted address, so the
// booking action can skip the Place Details call (createHeldBooking matches the
// same row by placeId and never rewrites its formattedAddress).
export async function findValidatedAddressByPlaceId(email: string, placeId: string) {
  const customer = await prisma.customer.findUnique({
    where: { email: normalizeCustomerEmail(email) },
    include: { addresses: true },
  });

  return (
    customer?.addresses.find(
      (address) => address.googlePlaceId === placeId && address.validated,
    ) ?? null
  );
}

export type CreateHeldBookingInput = {
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
  address: string;
  addressPlaceId?: string;
  addressLat?: number;
  addressLng?: number;
  addressComponents?: Prisma.InputJsonValue;
  addressValidated: boolean;
  // Result of the service-area gate; null when the gate was skipped because the
  // service area is unconfigured. Persisted onto the address row as a memo so
  // re-bookings with a known address skip the Routes API call.
  eligibility?: { travelDurationSeconds: number; checkedAt: Date } | null;
};

export async function createHeldBooking(input: CreateHeldBookingInput) {
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

  const runTransaction = () => prisma.$transaction(
    async (tx) => {
      // The exclusion constraint blocks every PENDING_PAYMENT row regardless of
      // paymentExpiresAt, so lapsed holds must be released before inserting.
      const expiredHolds = await tx.booking.findMany({
        where: {
          startAt: { lt: endAt },
          endAt: { gt: input.startAt },
          status: BookingStatus.PENDING_PAYMENT,
          paymentStatus: PaymentStatus.PENDING,
          paymentExpiresAt: { lte: new Date() },
        },
      });

      for (const hold of expiredHolds) {
        const released = await tx.booking.update({
          where: { id: hold.id },
          data: {
            status: BookingStatus.CANCELLED,
            paymentStatus: PaymentStatus.FAILED,
            cancelledAt: hold.cancelledAt ?? new Date(),
          },
        });

        await createBookingEvent({
          db: tx,
          bookingId: hold.id,
          type: BookingEventType.PAYMENT_FAILED,
          actorLabel: "hold-expiry-cleanup",
          beforeState: pickBookingEventState(hold),
          afterState: pickBookingEventState(released),
        });
      }

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

      // Latest contact info wins on the customer record; the manage-token state
      // is untouched so existing customer links stay valid across new bookings.
      const customer = await tx.customer.upsert({
        where: { email: normalizeCustomerEmail(input.email) },
        create: {
          email: normalizeCustomerEmail(input.email),
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
        },
        update: {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
        },
        include: { vehicles: true, addresses: true },
      });

      const vehicle =
        findMatchingVehicle(customer.vehicles, {
          description: input.vehicleDescription,
          color: input.color,
          licensePlate: input.licensePlate,
        }) ??
        (await tx.vehicle.create({
          data: {
            customerId: customer.id,
            description: input.vehicleDescription.trim(),
            color: input.color?.trim() || null,
            licensePlate: input.licensePlate?.trim() || null,
          },
        }));

      const matchedAddress = findMatchingAddress(customer.addresses, {
        placeId: input.addressPlaceId,
        formattedAddress: input.address,
      });

      const eligibilityMemo = input.eligibility
        ? {
            travelDurationSeconds: input.eligibility.travelDurationSeconds,
            serviceEligible: true,
            eligibilityCheckedAt: input.eligibility.checkedAt,
          }
        : {};

      const serviceAddress = matchedAddress
        ? await tx.customerAddress.update({
            where: { id: matchedAddress.id },
            data: {
              // Enrich a previously manual row when this submission carries a
              // verified Places selection; never downgrade a validated row.
              ...(input.addressValidated && input.addressPlaceId
                ? {
                    googlePlaceId: input.addressPlaceId,
                    lat: input.addressLat,
                    lng: input.addressLng,
                    rawComponents: input.addressComponents,
                    validated: true,
                  }
                : {}),
              ...eligibilityMemo,
            },
          })
        : await tx.customerAddress.create({
            data: {
              customerId: customer.id,
              formattedAddress: input.address.trim(),
              googlePlaceId: input.addressPlaceId || null,
              lat: input.addressLat,
              lng: input.addressLng,
              rawComponents: input.addressComponents,
              validated: input.addressValidated && Boolean(input.addressPlaceId),
              ...eligibilityMemo,
            },
          });

      try {
        const booking = await tx.booking.create({
          data: {
            serviceId: service.id,
            customerId: customer.id,
            vehicleId: vehicle.id,
            serviceAddressId: serviceAddress.id,
            customerNotes: input.notes,
            startAt: input.startAt,
            endAt,
            totalPrice: service.basePrice,
            depositAmount: service.depositAmount,
            balanceDue: subtractMoney(service.basePrice, service.depositAmount),
            travelDurationSecondsAtBooking: input.eligibility?.travelDurationSeconds ?? null,
            status: BookingStatus.PENDING_PAYMENT,
            paymentStatus: PaymentStatus.PENDING,
            paymentExpiresAt: addMinutes(new Date(), HOLD_MINUTES),
          },
          include: {
            service: true,
            customer: true,
            vehicle: true,
            serviceAddress: true,
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

  try {
    return await runTransaction();
  } catch (error) {
    // Two concurrent first-time bookings can race on the Customer.email unique
    // constraint (or hit a serializable write conflict on the shared customer/
    // vehicle/address rows). The loser retries once and finds the winner's rows.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return runTransaction();
    }
    throw error;
  }
}

export async function releaseHeldBooking(bookingId: string, actorLabel: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (
    !booking ||
    booking.status !== BookingStatus.PENDING_PAYMENT ||
    booking.paymentStatus !== PaymentStatus.PENDING
  ) {
    return;
  }

  const released = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: BookingStatus.CANCELLED,
      paymentStatus: PaymentStatus.FAILED,
      cancelledAt: booking.cancelledAt ?? new Date(),
    },
  });

  await createBookingEvent({
    bookingId,
    type: BookingEventType.PAYMENT_FAILED,
    actorLabel,
    beforeState: pickBookingEventState(booking),
    afterState: pickBookingEventState(released),
  });
}

export async function getAdminBookings() {
  // A booking stays on the active dashboard until it is terminal *and* its
  // payment state is settled (at which point archiving is the intended exit).
  // Keeping unresolved bookings visible ensures past appointments that still owe
  // a balance, await a refund decision, or need a service-status update never
  // age out simply because their appointment date has passed.
  const baseWhere = {
    OR: [
      // Upcoming bookings, whatever their state.
      { startAt: { gte: startOfDay(new Date()) } },
      // Past but service state unresolved (still needs mark completed/no-show).
      { status: BookingStatus.CONFIRMED },
      // Balance still outstanding or a deposit refund still pending.
      { paymentStatus: PaymentStatus.PARTIALLY_PAID },
      // Completed and paid: kept for the manual full-refund window until archived.
      { status: BookingStatus.COMPLETED, paymentStatus: PaymentStatus.PAID },
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
