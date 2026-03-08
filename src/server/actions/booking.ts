"use server";

import { redirect } from "next/navigation";
import { createHeldBooking } from "@/lib/booking";
import { env } from "@/lib/env";
import { getStripe } from "@/lib/stripe";
import { bookingSchema } from "@/lib/validators";
import { prisma } from "@/lib/prisma";
import { formatCurrency, toStripeCents } from "@/lib/utils";

export type BookingActionState = {
  status: "idle" | "error";
  message: string;
};

export async function createBookingCheckoutAction(
  _prevState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const parsed = bookingSchema.safeParse({
    serviceId: formData.get("serviceId"),
    startAt: formData.get("startAt"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    make: formData.get("make"),
    model: formData.get("model"),
    year: formData.get("year"),
    color: formData.get("color"),
    licensePlate: formData.get("licensePlate"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please review the form.",
    };
  }

  try {
    const startAt = new Date(parsed.data.startAt);
    const booking = await createHeldBooking({
      ...parsed.data,
      startAt,
    });

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: booking.customer.email,
      metadata: {
        bookingId: booking.id,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: toStripeCents(booking.depositAmount),
            product_data: {
              name: `${booking.service.name} deposit`,
              description: `Remaining balance due in person: ${formatCurrency(booking.balanceDue)}`,
            },
          },
        },
      ],
      success_url: `${env.appUrl}/booking/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.appUrl}/book?serviceId=${booking.serviceId}`,
    });

    await prisma.booking.update({
      where: { id: booking.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    redirect(session.url ?? `${env.appUrl}/booking/confirmation`);
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Unable to start checkout. Please try again.",
    };
  }
}
