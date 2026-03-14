import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { reconcileCheckoutSession } from "@/lib/stripe-reconciliation";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const env = getEnv();
  const stripe = getStripe();
  const body = await request.text();
  const signature = (await headers()).get("stripe-signature");

  if (!signature || !env.stripeWebhookSecret) {
    return NextResponse.json({ error: "Missing webhook signature." }, { status: 400 });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, env.stripeWebhookSecret);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook signature error." },
      { status: 400 },
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    await reconcileCheckoutSession({
      sessionId: session.id,
      trigger: "stripe-webhook",
    });
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object;
    await reconcileCheckoutSession({
      sessionId: session.id,
      trigger: "stripe-webhook",
    });
  }

  return NextResponse.json({ received: true });
}
