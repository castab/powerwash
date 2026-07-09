import { execFileSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function log(message) {
  console.log(`[vercel-build] ${message}`);
}

function requireEnv(name) {
  const value = process.env[name];

  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

function requireSecret(name) {
  requireEnv(name);
  const value = process.env[name];

  if (value.startsWith("change-me") || value.startsWith("replace-with")) {
    throw new Error(`Environment variable ${name} is still set to a placeholder value.`);
  }

  if (value.length < 32) {
    throw new Error(`Environment variable ${name} must be at least 32 characters.`);
  }
}

function runNpmScript(script) {
  execFileSync(npmCommand, ["run", script], {
    stdio: "inherit",
    env: process.env,
  });
}

async function main() {
  log("Validating environment");
  requireEnv("DATABASE_URL");
  requireEnv("DIRECT_URL");
  requireEnv("NEXT_PUBLIC_APP_URL");
  requireSecret("ADMIN_SESSION_SECRET");
  requireSecret("MANAGE_LINK_SECRET");
  requireEnv("STRIPE_SECRET_KEY");
  requireEnv("STRIPE_WEBHOOK_SECRET");
  requireEnv("RESEND_API_KEY");
  requireEnv("EMAIL_FROM");
  requireEnv("SUPPORT_EMAIL");

  log("Generating Prisma client");
  runNpmScript("prisma:generate");

  log("Running database migrations");
  runNpmScript("prisma:migrate");

  log("Checking bootstrap data");
  try {
    runNpmScript("seed:check");
    log("Bootstrap data missing, running seed");
    runNpmScript("prisma:seed");
  } catch {
    log("Bootstrap data already present, skipping seed");
  }

  log("Building Next.js");
  runNpmScript("build:app");
}

main().catch((error) => {
  console.error("[vercel-build] Build failed.", error);
  process.exit(1);
});
