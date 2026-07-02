import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const defaultDatabaseUrl = "postgresql://postgres:postgres@localhost:5432/powerwash?schema=public";

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL || defaultDatabaseUrl,
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
