"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addMinutes } from "date-fns";
import { BookingStatus, PaymentStatus } from "@prisma/client";
import { createAdminSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  adminLoginSchema,
  availabilitySchema,
  blackoutSchema,
  bookingAdminUpdateSchema,
  serviceSchema,
} from "@/lib/validators";
import { slugify, toMoneyDecimal } from "@/lib/utils";

export async function loginAdminAction(_state: { error?: string }, formData: FormData) {
  const parsed = adminLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid login." };
  }

  const admin = await prisma.adminUser.findUnique({
    where: { email: parsed.data.email },
  });

  if (!admin || !admin.isActive) {
    return { error: "Invalid credentials." };
  }

  const validPassword = await verifyPassword(parsed.data.password, admin.passwordHash);
  if (!validPassword) {
    return { error: "Invalid credentials." };
  }

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  await createAdminSession({
    adminId: admin.id,
    email: admin.email,
    name: admin.name,
  });

  redirect("/admin/bookings");
}

export async function saveServiceAction(formData: FormData) {
  const parsed = serviceSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description"),
    durationMinutes: formData.get("durationMinutes"),
    basePrice: formData.get("basePrice"),
    depositAmount: formData.get("depositAmount"),
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid service.");
  }

  const basePrice = toMoneyDecimal(parsed.data.basePrice);
  const depositAmount = toMoneyDecimal(parsed.data.depositAmount);

  if (depositAmount.gt(basePrice)) {
    throw new Error("Deposit cannot exceed the total price.");
  }

  const payload = {
    name: parsed.data.name,
    description: parsed.data.description,
    durationMinutes: parsed.data.durationMinutes,
    basePrice,
    depositAmount,
    isActive: parsed.data.isActive,
    slug: slugify(parsed.data.name),
  };

  if (parsed.data.id) {
    await prisma.service.update({
      where: { id: parsed.data.id },
      data: payload,
    });
  } else {
    await prisma.service.create({ data: payload });
  }

  revalidatePath("/admin/services");
  revalidatePath("/");
  revalidatePath("/book");
}

export async function saveAvailabilityRuleAction(formData: FormData) {
  const parsed = availabilitySchema.safeParse({
    id: formData.get("id"),
    dayOfWeek: formData.get("dayOfWeek"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid availability rule.");
  }

  if (parsed.data.startTime >= parsed.data.endTime) {
    throw new Error("Availability end must be after start.");
  }

  if (parsed.data.id) {
    await prisma.availabilityRule.update({
      where: { id: parsed.data.id },
      data: {
        dayOfWeek: parsed.data.dayOfWeek,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        isActive: parsed.data.isActive,
      },
    });
  } else {
    await prisma.availabilityRule.create({
      data: {
        dayOfWeek: parsed.data.dayOfWeek,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        isActive: parsed.data.isActive,
      },
    });
  }

  revalidatePath("/admin/availability");
  revalidatePath("/book");
}

export async function saveBlackoutAction(formData: FormData) {
  const parsed = blackoutSchema.safeParse({
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid blackout.");
  }

  await prisma.blackoutDate.create({
    data: {
      startsAt: new Date(parsed.data.startsAt),
      endsAt: new Date(parsed.data.endsAt),
      reason: parsed.data.reason,
    },
  });

  revalidatePath("/admin/blackouts");
  revalidatePath("/book");
}

export async function updateBookingAction(formData: FormData) {
  const parsed = bookingAdminUpdateSchema.safeParse({
    bookingId: formData.get("bookingId"),
    status: formData.get("status"),
    startAt: formData.get("startAt"),
    adminNotes: formData.get("adminNotes"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid booking update.");
  }

  const booking = await prisma.booking.findUnique({
    where: { id: parsed.data.bookingId },
    include: { service: true },
  });

  if (!booking) {
    throw new Error("Booking not found.");
  }

  const data: {
    status?: BookingStatus;
    startAt?: Date;
    endAt?: Date;
    cancelledAt?: Date | null;
    adminNotes?: string;
    paymentStatus?: PaymentStatus;
  } = {};

  if (parsed.data.status) {
    data.status = parsed.data.status;
    if (parsed.data.status === BookingStatus.CANCELLED) {
      data.cancelledAt = new Date();
      if (booking.paymentStatus === PaymentStatus.PENDING) {
        data.paymentStatus = PaymentStatus.FAILED;
      }
    }
  }

  if (parsed.data.startAt) {
    const startAt = new Date(parsed.data.startAt);
    data.startAt = startAt;
    data.endAt = addMinutes(startAt, booking.service.durationMinutes);
  }

  if (parsed.data.adminNotes !== undefined) {
    data.adminNotes = parsed.data.adminNotes;
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data,
  });

  revalidatePath("/admin/bookings");
  revalidatePath("/booking/confirmation");
}
