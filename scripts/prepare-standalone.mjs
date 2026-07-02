import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const standaloneDir = ".next/standalone";

if (!existsSync(standaloneDir)) {
  throw new Error("Standalone build output not found at .next/standalone");
}

if (existsSync("public")) {
  await cp("public", `${standaloneDir}/public`, { recursive: true, force: true });
}

await mkdir(`${standaloneDir}/.next`, { recursive: true });
await cp(".next/static", `${standaloneDir}/.next/static`, {
  recursive: true,
  force: true,
});
