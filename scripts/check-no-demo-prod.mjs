import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function walk(dir) {
  if (!existsSync(dir)) return [];
  const results = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist" || entry === ".turbo") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...walk(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

const isProd = process.env.NODE_ENV === "production" || process.argv.includes("--prod");

if (isProd && process.env.REGISTER_DEMO_ADAPTER === "true") {
  console.error("ERROR [check-no-demo-prod]: Un adaptador demo está registrado con NODE_ENV=production.");
  process.exit(1);
}

const snapshotFiles = walk(join(ROOT, "data", "snapshots")).filter((f) => f.endsWith(".json"));
for (const file of snapshotFiles) {
  const raw = readFileSync(file, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed.provenance === "demo" || parsed.isDemo === true) {
    console.error(`ERROR [check-no-demo-prod]: El snapshot ${file} contiene datos demo (provenance=demo).`);
    process.exit(1);
  }
}

const ingestAdapters = walk(join(ROOT, "services", "ingest", "src")).filter((f) => f.endsWith(".ts"));
for (const file of ingestAdapters) {
  const raw = readFileSync(file, "utf8");
  if (/registerAdapter\s*\(\s*["']demo["']/.test(raw)) {
    console.error(`ERROR [check-no-demo-prod]: Adaptador demo registrado estáticamente en ${file}.`);
    process.exit(1);
  }
}

console.log("OK [check-no-demo-prod]: Cero adaptadores o snapshots demo en producción.");
