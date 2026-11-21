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
  join(ROOT, "packages", "db", "src"),
  join(ROOT, "packages", "emails", "src"),
  join(ROOT, "packages", "models", "src"),
  join(ROOT, "packages", "spacetime", "src"),
  join(ROOT, "packages", "ui", "src"),
  join(ROOT, "packages", "sports-assets", "src"),
  join(ROOT, "packages", "engines-reference", "src", "adapters"),
  join(ROOT, "services", "ingest", "src"),
];

const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;
const EMPTY_CATCH_RE = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
// ADR-050: Prohibido acoplar lógica de producto a SDKs de proveedores cloud específicos fuera de adaptadores aislados.
const VENDOR_SDK_IMPORT_RE =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'](@vercel\/[^"']+|@google-cloud\/[^"']+|@cloudflare\/[^"']+|@neondatabase\/[^"']+|@aws-sdk\/[^"']+|aws-sdk)["']/g;
const VENDOR_ADAPTER_ALLOWLIST = new Set([
  "apps/web/src/server/avatar-storage.ts",
]);

const errors = [];

for (const dir of DIRS_TO_CHECK) {
  for (const file of walk(dir)) {
    if (!/\.(ts|tsx|css|mjs)$/.test(file)) continue;
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    const content = readFileSync(file, "utf8");

    // 1. No hex colors outside packages/tokens (ignore HTML email templates in packages/emails/src and generated registry metadata)
    if (
      !rel.startsWith("packages/tokens/") &&
      !rel.startsWith("packages/emails/src/") &&
      !rel.endsWith("registry.generated.ts")
    ) {
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

    // 3. ADR-050: No vendor cloud SDK imports outside isolated adapters
    if (!VENDOR_ADAPTER_ALLOWLIST.has(rel)) {
      VENDOR_SDK_IMPORT_RE.lastIndex = 0;
      const sdkMatches = [...content.matchAll(VENDOR_SDK_IMPORT_RE)].map((m) => m[1]);
      if (sdkMatches.length > 0) {
        errors.push(
          `${rel}: SDK de proveedor cloud prohibido fuera de adaptadores aislados (ADR-050): ${sdkMatches.join(", ")}`,
        );
      }
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

console.log("OK [lint-codebase]: Cero colores hex fuera de packages/tokens, cero catch vacíos y cero lock-in de SDK cloud (ADR-050).");
