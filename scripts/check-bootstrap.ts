import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const defaultDatabaseUrl = "postgresql://postgres:postgres@localhost:5432/powerwash?schema=public";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL || defaultDatabaseUrl,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const adminCount = await prisma.adminUser.count();

  if (adminCount === 0) {
    console.log("[bootstrap-check] No admin users found.");
    process.exit(0);
  }

  console.log(`[bootstrap-check] Found ${adminCount} admin user(s).`);
  process.exit(1);
}

main()
  .catch((error) => {
    console.error("[bootstrap-check] Failed to check bootstrap state.", error);
    process.exit(2);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
