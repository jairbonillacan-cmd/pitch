/**
 * Descarga (bajo demanda) los 30 escudos oficiales de equipos MLB y el logotipo oficial de la liga
 * (128×128 PNG transparente) desde la API pública de ESPN hacia `apps/web/public/brand/official/mlb/`.
 *
 * No corre en `build`/`typecheck`/`test` para mantener el repo 100 % offline y determinista.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = resolve(SCRIPT_DIR, "..");
const ROOT_DIR = resolve(PKG_DIR, "..", "..");
const MLB_DIR = join(ROOT_DIR, "apps", "web", "public", "brand", "official", "mlb");
const REGISTRY_FILE = join(PKG_DIR, "src", "registry.generated.ts");

const MLB_LEAGUE_LOGO_URL = "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png";

function normalizeName(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toResizedUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  if (parsed.hostname === "a.espncdn.com" && !parsed.pathname.startsWith("/combiner/i")) {
    return `https://a.espncdn.com/combiner/i?img=${parsed.pathname}&w=128&h=128&transparent=true`;
  }
  return rawUrl;
}

async function fetchPng(url, destPath, force = false) {
  if (!force && existsSync(destPath)) return true;
  for (const candidate of [toResizedUrl(url), url]) {
    try {
      const res = await fetch(candidate, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 150) continue;
      if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) continue;
      writeFileSync(destPath, buf);
      return true;
    } catch (err) {
      void err;
      continue;
    }
  }
  return false;
}

function readCanonicalMlbTeams() {
  const src = readFileSync(REGISTRY_FILE, "utf8");
  const teams = [];
  const re =
    /"mlb\.([a-z0-9-]+)":\s*\{[\s\S]*?"slug":\s*"([^"]+)"[\s\S]*?"name":\s*"([^"]+)"[\s\S]*?"code":\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    teams.push({ slug: m[2], name: m[3], code: m[4].toUpperCase() });
  }
  return teams;
}

const ESPN_CODE_TO_CANONICAL_SLUG = {
  ARI: "arizona-diamondbacks",
  ATH: "athletics",
  OAK: "athletics",
  ATL: "atlanta-braves",
  BAL: "baltimore-orioles",
  BOS: "boston-red-sox",
  CHC: "chicago-cubs",
  CHW: "chicago-white-sox",
  CWS: "chicago-white-sox",
  CIN: "cincinnati-reds",
  CLE: "cleveland-guardians",
  COL: "colorado-rockies",
  DET: "detroit-tigers",
  HOU: "houston-astros",
  KC: "kansas-city-royals",
  KCR: "kansas-city-royals",
  LAA: "los-angeles-angels",
  LAD: "los-angeles-dodgers",
  MIA: "miami-marlins",
  MIL: "milwaukee-brewers",
  MIN: "minnesota-twins",
  NYM: "new-york-mets",
  NYY: "new-york-yankees",
  PHI: "philadelphia-phillies",
  PIT: "pittsburgh-pirates",
  SD: "san-diego-padres",
  SDP: "san-diego-padres",
  SF: "san-francisco-giants",
  SFG: "san-francisco-giants",
  SEA: "seattle-mariners",
  STL: "st-louis-cardinals",
  TB: "tampa-bay-rays",
  TBR: "tampa-bay-rays",
  TEX: "texas-rangers",
  TOR: "toronto-blue-jays",
  WSH: "washington-nationals",
  WAS: "washington-nationals",
};

async function main() {
  const force = process.argv.includes("--force");
  mkdirSync(MLB_DIR, { recursive: true });

  const canonicalTeams = readCanonicalMlbTeams();
  const byNormName = new Map(canonicalTeams.map((t) => [normalizeName(t.name), t.slug]));
  const byCode = new Map(canonicalTeams.map((t) => [t.code, t.slug]));

  const leagueOk = await fetchPng(MLB_LEAGUE_LOGO_URL, join(MLB_DIR, "mlb.png"), force);
  if (!leagueOk) {
    throw new Error("No se pudo descargar el logo oficial de la liga MLB.");
  }

  const res = await fetch(
    "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams?limit=40",
    {
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) throw new Error(`ESPN MLB teams respondió HTTP ${res.status}`);
  const payload = await res.json();
  const entries = payload?.sports?.[0]?.leagues?.[0]?.teams ?? [];

  let synced = 0;
  const missing = [];
  for (const item of entries) {
    const team = item?.team;
    if (!team) continue;
    const abbr = String(team.abbreviation || "").trim().toUpperCase();
    const displayName = String(team.displayName || "").trim();
    const slug =
      ESPN_CODE_TO_CANONICAL_SLUG[abbr] ??
      byCode.get(abbr) ??
      byNormName.get(normalizeName(displayName));
    if (!slug) {
      missing.push(`${displayName} (${abbr})`);
      continue;
    }
    const logoHref =
      team.logos?.find((l) => Array.isArray(l.rel) && l.rel.includes("default"))?.href ??
      team.logos?.[0]?.href;
    if (!logoHref) {
      missing.push(`${slug} (sin logo)`);
      continue;
    }
    const ok = await fetchPng(logoHref, join(MLB_DIR, `${slug}.png`), force);
    if (ok) synced += 1;
    else missing.push(`${slug} (falló descarga)`);
  }

  console.log(
    `OK [@pitchlab/sports-assets]: MLB sincronizado — liga=${leagueOk ? "ok" : "error"}, equipos=${synced}/${canonicalTeams.length}${missing.length ? ` · faltantes: ${missing.join(", ")}` : ""}`,
  );
  if (synced < canonicalTeams.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Error en sync-mlb-assets:", err);
  process.exit(1);
});
