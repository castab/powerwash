import { type BalanceRequestDeliveryChannel, type Prisma } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { formatCurrency } from "@/lib/utils";

const balancePaymentInclude = {
  service: true,
} satisfies Prisma.BookingInclude;

const EMAIL_CHANNEL: BalanceRequestDeliveryChannel = "EMAIL";

export type BalancePaymentBooking = Prisma.BookingGetPayload<{
  include: typeof balancePaymentInclude;
}>;

type DeliveryPayload = {
  booking: BalancePaymentBooking;
  checkoutUrl: string;
};

type DeliveryResult = {
  destination: string;
};

function formatBookingDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

function buildBalancePaymentEmail(booking: BalancePaymentBooking, checkoutUrl: string) {
  const env = getEnv();
  const serviceDate = formatBookingDateTime(booking.startAt);
  const supportCopy = env.supportEmail
    ? `If you need help, reply to ${env.supportEmail}.`
    : "If you need help, contact the business directly.";

  return {
    subject: `Pay the remaining balance for your ${booking.service.name} booking`,
    text: [
      `Hi ${booking.firstName},`,
      "",
      `Your ${booking.service.name} booking for ${serviceDate} still has a remaining balance of ${formatCurrency(booking.balanceDue)}.`,
      "Use the secure payment link below to complete the rest of the payment:",
      checkoutUrl,
      "",
      `Deposit already received: ${formatCurrency(booking.depositAmount)}`,
      `Total booking price: ${formatCurrency(booking.totalPrice)}`,
      "",
      supportCopy,
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
        <p>Hi ${booking.firstName},</p>
        <p>Your <strong>${booking.service.name}</strong> booking for <strong>${serviceDate}</strong> still has a remaining balance of <strong>${formatCurrency(booking.balanceDue)}</strong>.</p>
        <p>Use the secure payment link below to complete the rest of the payment:</p>
        <p><a href="${checkoutUrl}">${checkoutUrl}</a></p>
        <p>Deposit already received: <strong>${formatCurrency(booking.depositAmount)}</strong><br />Total booking price: <strong>${formatCurrency(booking.totalPrice)}</strong></p>
        <p>${supportCopy}</p>
      </div>
    `,
  };
}

async function sendBalancePaymentEmail({
  booking,
  checkoutUrl,
}: DeliveryPayload): Promise<DeliveryResult> {
  const email = buildBalancePaymentEmail(booking, checkoutUrl);

  await sendEmail({
    to: booking.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  return {
    destination: booking.email,
  };
}

const deliveryHandlers: Partial<
  Record<BalanceRequestDeliveryChannel, (payload: DeliveryPayload) => Promise<DeliveryResult>>
> = {
  [EMAIL_CHANNEL]: sendBalancePaymentEmail,
};

export async function sendBalancePaymentRequest(input: {
  booking: BalancePaymentBooking;
  deliveryChannel: BalanceRequestDeliveryChannel;
  checkoutUrl: string;
}) {
  const sender = deliveryHandlers[input.deliveryChannel];

  if (!sender) {
    throw new Error(`Delivery channel ${input.deliveryChannel} is not available.`);
  }

  return sender({
    booking: input.booking,
    checkoutUrl: input.checkoutUrl,
  });
}
