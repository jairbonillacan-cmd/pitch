import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === ".next" ||
      entry === "dist" ||
      entry === ".turbo" ||
      entry === "storybook-static" ||
      entry === "playwright-report" ||
      entry === "test-results"
    ) {
      continue;
    }
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

const DIRS_TO_CHECK = [
  join(ROOT, "apps", "web", "app"),
  join(ROOT, "apps", "web", "src"),
  join(ROOT, "packages", "contracts", "src"),
  join(ROOT, "packages", "ui", "src"),
  join(ROOT, "packages", "sports-assets", "src"),
  join(ROOT, "packages", "engines-reference", "src", "adapters"),
  join(ROOT, "services", "ingest", "src"),
];

const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;
const EMPTY_CATCH_RE = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;

const errors = [];

for (const dir of DIRS_TO_CHECK) {
  for (const file of walk(dir)) {
    if (!/\.(ts|tsx|css|mjs)$/.test(file)) continue;
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    const content = readFileSync(file, "utf8");

    // 1. No hex colors outside packages/tokens (ignore generated registry manifest metadata if in sports-assets/src/registry.generated.ts)
    if (!rel.startsWith("packages/tokens/") && !rel.endsWith("registry.generated.ts")) {
      const stripped = content
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      const matches = stripped.match(HEX_COLOR_RE);
      if (matches) {
        errors.push(`${rel}: Color hexadecimal fuera de packages/tokens: ${matches.join(", ")}`);
      }
    }

    // 2. No empty catch {}
    if (EMPTY_CATCH_RE.test(content)) {
      errors.push(`${rel}: Bloque catch vacío prohibido.`);
    }
  }
}

if (errors.length > 0) {
  console.error("Errores de lint encontrados:");
  for (const err of errors) {
    console.error(" - " + err);
  }
  process.exit(1);
}

console.log("OK [lint-codebase]: Cero colores hex fuera de packages/tokens y cero catch vacíos.");
