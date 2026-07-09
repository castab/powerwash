import { addMinutes, areIntervalsOverlapping, isBefore } from "date-fns";
import { formatBusinessTime, parseBusinessDateTimeLocalValue } from "./business-time.ts";

export const SLOT_INTERVAL_MINUTES = 15;
export const MIN_BOOKING_LEAD_MINUTES = 60;

export type AvailableSlot = {
  startAt: string;
  endAt: string;
  label: string;
};

export type SlotRule = {
  startTime: string;
  endTime: string;
};

export type SlotBookingConflict = {
  startAt: Date;
  endAt: Date;
};

export type SlotBlackoutConflict = {
  startsAt: Date;
  endsAt: Date;
};

// All wall-clock math is anchored to the business time zone so slot output is
// identical regardless of the server's local time zone.
export function computeAvailableSlots(input: {
  dateValue: string;
  durationMinutes: number;
  rules: SlotRule[];
  bookings: SlotBookingConflict[];
  blackouts: SlotBlackoutConflict[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const earliestStart = addMinutes(now, MIN_BOOKING_LEAD_MINUTES);
  const slots: AvailableSlot[] = [];
  // Two overlapping availability rules on the same weekday would emit the same
  // slot start twice; de-dupe so callers never render duplicate options (which
  // would also collide as React keys).
  const seenStarts = new Set<string>();

  for (const rule of input.rules) {
    const windowStart = parseBusinessDateTimeLocalValue(`${input.dateValue}T${rule.startTime}`);
    const windowEnd = parseBusinessDateTimeLocalValue(`${input.dateValue}T${rule.endTime}`);

    for (
      let slotStart = new Date(windowStart);
      addMinutes(slotStart, input.durationMinutes) <= windowEnd;
      slotStart = addMinutes(slotStart, SLOT_INTERVAL_MINUTES)
    ) {
      const slotEnd = addMinutes(slotStart, input.durationMinutes);

      if (isBefore(slotStart, earliestStart)) continue;

      const overlapsBooking = input.bookings.some((booking) =>
        areIntervalsOverlapping(
          { start: slotStart, end: slotEnd },
          { start: booking.startAt, end: booking.endAt },
          { inclusive: false },
        ),
      );

      if (overlapsBooking) continue;

      const overlapsBlackout = input.blackouts.some((blackout) =>
        areIntervalsOverlapping(
          { start: slotStart, end: slotEnd },
          { start: blackout.startsAt, end: blackout.endsAt },
          { inclusive: false },
        ),
      );

      if (overlapsBlackout) continue;

      const startAt = slotStart.toISOString();
      if (seenStarts.has(startAt)) continue;
      seenStarts.add(startAt);

      slots.push({
        startAt,
        endAt: slotEnd.toISOString(),
        label: formatBusinessTime(slotStart),
      });
    }
  }

  // Keep chronological order even when overlapping rules interleave their slots.
  slots.sort((a, b) => a.startAt.localeCompare(b.startAt));

  return slots;
}
