import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
