/**
 * Descarga (bajo demanda) las banderas/escudos de selecciones nacionales (128×128 PNG
 * transparente) y emblemas de competencias internacionales hacia
 * `apps/web/public/brand/official/{countries|competitions}/`, y genera
 * `packages/sports-assets/src/national-assets.generated.ts`.
 *
 * No corre en `build`/`typecheck`/`test` para mantener el repo 100 % offline y determinista.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NATIONAL_COMPETITION_ESPN_LOGOS,
  NATIONAL_TEAMS,
} from "../../contracts/src/sports/national-teams.ts";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = resolve(SCRIPT_DIR, "..");
const ROOT_DIR = resolve(PKG_DIR, "..", "..");
const COUNTRIES_DIR = join(ROOT_DIR, "apps", "web", "public", "brand", "official", "countries");
const COMPETITIONS_DIR = join(ROOT_DIR, "apps", "web", "public", "brand", "official", "competitions");
const OUT_FILE = join(PKG_DIR, "src", "national-assets.generated.ts");

function toResizedUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  if (parsed.hostname === "a.espncdn.com" && !parsed.pathname.startsWith("/combiner/i")) {
    return `https://a.espncdn.com/combiner/i?img=${parsed.pathname}&w=128&h=128&transparent=true`;
  }
  return rawUrl;
}

async function fetchPng(url, destPath) {
  if (existsSync(destPath)) return true;
  for (const candidate of [toResizedUrl(url), url]) {
    try {
      const res = await fetch(candidate, { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 150) continue;
      // Check PNG magic bytes
      if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) continue;
      writeFileSync(destPath, buf);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

async function runPool(items, concurrency, worker) {
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const i = cursor++;
      await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => next()));
}

async function main() {
  mkdirSync(COUNTRIES_DIR, { recursive: true });
  mkdirSync(COMPETITIONS_DIR, { recursive: true });

  const syncedCountries = new Set();
  const syncedCompetitions = new Set();

  const compEntries = Object.entries(NATIONAL_COMPETITION_ESPN_LOGOS);
  await runPool(compEntries, 6, async ([leagueId, url]) => {
    const ok = await fetchPng(url, join(COMPETITIONS_DIR, `${leagueId}.png`));
    if (ok) syncedCompetitions.add(leagueId);
  });

  await runPool([...NATIONAL_TEAMS], 16, async (team) => {
    const ok = await fetchPng(team.externalLogo, join(COUNTRIES_DIR, `${team.slug}.png`));
    if (ok) syncedCountries.add(team.slug);
  });

  const sortedCountries = [...syncedCountries].sort();
  const sortedComps = [...syncedCompetitions].sort();

  const source = [
    "// Archivo generado por `node packages/sports-assets/scripts/sync-national-assets.mjs`.",
    "// Lista los emblemas locales descargados en `/brand/official/{countries|competitions}/`.",
    "",
    "export const NATIONAL_COUNTRY_SLUGS: ReadonlySet<string> = new Set([",
    ...sortedCountries.map((s) => `  ${JSON.stringify(s)},`),
    "]);",
    "",
    "export const NATIONAL_COMPETITION_ASSETS: ReadonlySet<string> = new Set([",
    ...sortedComps.map((s) => `  ${JSON.stringify(s)},`),
    "]);",
    "",
  ].join("\n");

  writeFileSync(OUT_FILE, source, "utf8");
  console.log(
    `OK [@pitchlab/sports-assets]: ${sortedCountries.length}/${NATIONAL_TEAMS.length} selecciones y ${sortedComps.length}/${compEntries.length} competencias sincronizadas.`,
  );
}

main().catch((err) => {
  console.error("Error en sync-national-assets:", err);
  process.exit(1);
});
