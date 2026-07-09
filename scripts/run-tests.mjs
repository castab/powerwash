// Aggregating test runner: discovers every `*.test.ts` under `src/` and runs
// each in its own `node --experimental-strip-types` child process so a failure
// (or top-level throw) in one file cannot abort the others. Exits non-zero if
// any file fails, so `npm test` gates on the whole suite.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(rootDir, "src");
const registerHook = path.join(rootDir, "scripts", "test-resolve-hook.mjs");

function findTestFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTestFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

const testFiles = findTestFiles(srcDir).sort();

if (testFiles.length === 0) {
  console.error("No *.test.ts files found under src/.");
  process.exit(1);
}

const failures = [];

for (const file of testFiles) {
  const relative = path.relative(rootDir, file);
  console.log(`\n> ${relative}`);
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--import",
      pathToFileURL(registerHook).href,
      // Entry passed relative to rootDir: a bare drive-letter path (H:\...) is
      // misread as a URL scheme by the ESM loader on Windows.
      path.relative(rootDir, file),
    ],
    { stdio: "inherit", cwd: rootDir },
  );

  if (result.status !== 0) {
    failures.push(relative);
  }
}

console.log("");
if (failures.length > 0) {
  console.error(`FAILED (${failures.length}/${testFiles.length}): ${failures.join(", ")}`);
  process.exit(1);
}

console.log(`PASSED (${testFiles.length} file${testFiles.length === 1 ? "" : "s"})`);
