// Test-time module resolver so `node --experimental-strip-types` can run the
// project's `*.test.ts` files without a bundler. It teaches Node two things the
// app relies on Next/webpack for at build time:
//   1. the `@/*` path alias -> `src/*`
//   2. extensionless relative/alias imports (e.g. `./business-time`, `@/lib/env`)
// Registered via `node --import ./scripts/test-resolve-hook.mjs`.
import { registerHooks } from "node:module";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const srcDir = path.resolve(import.meta.dirname, "..", "src");
const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", ".mts", ".js", ".mjs"];
const INDEX_SUFFIXES = ["/index.ts", "/index.tsx", "/index.js", "/index.mjs"];

function isFile(filePath) {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

// Resolve a bare filesystem path to a concrete on-disk file, mirroring the
// extension/index resolution a bundler performs.
function resolveOnDisk(basePath) {
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = basePath + suffix;
    if (isFile(candidate)) return candidate;
  }
  if (existsSync(basePath) && statSync(basePath).isDirectory()) {
    for (const suffix of INDEX_SUFFIXES) {
      const candidate = basePath + suffix;
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let basePath = null;

    if (specifier.startsWith("@/")) {
      basePath = path.join(srcDir, specifier.slice(2));
    } else if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:")
    ) {
      basePath = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }

    if (basePath) {
      const resolved = resolveOnDisk(basePath);
      if (resolved) {
        return { url: pathToFileURL(resolved).href, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  },
});
