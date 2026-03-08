import Stripe from "stripe";
import { getEnv } from "@/lib/env";

let stripeClient: Stripe | null = null;

export function getStripe() {
  const env = getEnv();

  if (!env.stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(env.stripeSecretKey, {
      apiVersion: "2026-02-25.clover",
    });
  }

  return stripeClient;
}
