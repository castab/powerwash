const required = [
  "DATABASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "ADMIN_SESSION_SECRET",
] as const;

for (const key of required) {
  if (!process.env[key]) {
    console.warn(`Missing environment variable: ${key}`);
  }
}

export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET ?? "change-me",
};
