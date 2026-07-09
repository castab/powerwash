export const BUSINESS_TIME_ZONE = "America/Los_Angeles";

function formatBusinessDateParts(
  date: Date,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    hourCycle: "h23",
    ...options,
  }).formatToParts(date);
}

export function formatInBusinessTimeZone(
  date: Date,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    ...options,
  }).format(date);
}

export function formatBusinessDateTimeLong(date: Date) {
  return formatInBusinessTimeZone(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatBusinessDateLong(date: Date) {
  return formatInBusinessTimeZone(date, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatBusinessTime(date: Date) {
  return formatInBusinessTimeZone(date, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getBusinessTimeZoneOffsetMinutes(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const value = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";

  if (value === "GMT" || value === "UTC") {
    return 0;
  }

  const match = value.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) {
    throw new Error(`Unable to determine timezone offset for ${value}.`);
  }

  const [, sign, hours, minutes = "00"] = match;
  const totalMinutes = Number(hours) * 60 + Number(minutes);
  return sign === "-" ? -totalMinutes : totalMinutes;
}

export function toBusinessDateTimeLocalValue(date: Date) {
  const parts = formatBusinessDateParts(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  return `${lookup.get("year")}-${lookup.get("month")}-${lookup.get("day")}T${lookup.get("hour")}:${lookup.get("minute")}`;
}

export function parseBusinessDateTimeLocalValue(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);

  if (!match) {
    return new Date(value);
  }

  const [, yearValue, monthValue, dayValue, hourValue, minuteValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  let utcMs = Date.UTC(year, month - 1, day, hour, minute);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offsetMinutes = getBusinessTimeZoneOffsetMinutes(new Date(utcMs));
    const nextUtcMs = Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes * 60_000;

    if (nextUtcMs === utcMs) {
      break;
    }

    utcMs = nextUtcMs;
  }

  return new Date(utcMs);
}

export function getBusinessDateValue(date: Date) {
  const parts = formatBusinessDateParts(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  return `${lookup.get("year")}-${lookup.get("month")}-${lookup.get("day")}`;
}

export function addDaysToDateValue(value: string, days: number) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error(`Invalid date value: ${value}`);
  }

  const [, year, month, day] = match;
  const shifted = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + days));

  return shifted.toISOString().slice(0, 10);
}

export function getDayOfWeekForDateValue(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error(`Invalid date value: ${value}`);
  }

  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay();
}

export function getBusinessDayWindow(value: string) {
  return {
    start: parseBusinessDateTimeLocalValue(`${value}T00:00`),
    end: parseBusinessDateTimeLocalValue(`${addDaysToDateValue(value, 1)}T00:00`),
  };
}
