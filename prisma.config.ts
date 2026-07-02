import "dotenv/config";
import { defineConfig } from "prisma/config";

const defaultDatabaseUrl = "postgresql://postgres:postgres@localhost:5432/powerwash?schema=public";
const cliDatabaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? defaultDatabaseUrl;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: cliDatabaseUrl,
  },
});
