import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.service.createMany({
    data: [
      {
        name: "Express Exterior",
        slug: "express-exterior",
        description: "Quick exterior wash with tire shine and spot-free rinse.",
        durationMinutes: 30,
        basePrice: 2500,
        depositAmount: 1000,
      },
      {
        name: "Deluxe Detail",
        slug: "deluxe-detail",
        description: "Hand wash, vacuum, interior wipe down, windows, and wax.",
        durationMinutes: 90,
        basePrice: 8500,
        depositAmount: 2500,
      },
      {
        name: "SUV Deep Clean",
        slug: "suv-deep-clean",
        description: "Extended interior detail designed for larger family vehicles.",
        durationMinutes: 120,
        basePrice: 12000,
        depositAmount: 3500,
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

  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

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
