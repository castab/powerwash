import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const defaultDatabaseUrl = "postgresql://postgres:postgres@localhost:5432/powerwash?schema=public";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL || defaultDatabaseUrl,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.service.createMany({
    data: [
      {
        name: "Express Exterior",
        slug: "express-exterior",
        description: "Quick exterior wash with tire shine and spot-free rinse.",
        durationMinutes: 30,
        basePrice: 25.0,
        depositAmount: 10.0,
      },
      {
        name: "Deluxe Detail",
        slug: "deluxe-detail",
        description: "Hand wash, vacuum, interior wipe down, windows, and wax.",
        durationMinutes: 90,
        basePrice: 85.0,
        depositAmount: 25.0,
      },
      {
        name: "SUV Deep Clean",
        slug: "suv-deep-clean",
        description: "Extended interior detail designed for larger family vehicles.",
        durationMinutes: 120,
        basePrice: 120.0,
        depositAmount: 35.0,
      },
    ],
    skipDuplicates: true,
  });

  const defaultRules = [
    { dayOfWeek: 1, startTime: "08:00", endTime: "17:00" },
    { dayOfWeek: 2, startTime: "08:00", endTime: "17:00" },
    { dayOfWeek: 3, startTime: "08:00", endTime: "17:00" },
    { dayOfWeek: 4, startTime: "08:00", endTime: "17:00" },
    { dayOfWeek: 5, startTime: "08:00", endTime: "17:00" },
    { dayOfWeek: 6, startTime: "09:00", endTime: "14:00" },
  ];

  for (const rule of defaultRules) {
    const existing = await prisma.availabilityRule.findFirst({
      where: {
        dayOfWeek: rule.dayOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
      },
    });

    if (!existing) {
      await prisma.availabilityRule.create({ data: rule });
    }
  }

  const DEFAULT_ADMIN_PASSWORD = "ChangeMe123!";
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const configuredPassword = process.env.SEED_ADMIN_PASSWORD;

  // The default seed password is documented publicly, so refuse to bootstrap an
  // admin with it in production. Require a strong SEED_ADMIN_PASSWORD instead.
  if (
    process.env.NODE_ENV === "production" &&
    (!configuredPassword || configuredPassword === DEFAULT_ADMIN_PASSWORD)
  ) {
    throw new Error(
      "Refusing to seed the default admin password in production. Set SEED_ADMIN_PASSWORD to a strong, unique value.",
    );
  }

  const password = configuredPassword ?? DEFAULT_ADMIN_PASSWORD;

  const admin = await prisma.adminUser.findUnique({ where: { email } });

  if (!admin) {
    await prisma.adminUser.create({
      data: {
        email,
        name: "Powerwash Admin",
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
