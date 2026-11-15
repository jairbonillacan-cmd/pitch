/**
 * Resuelve y verifica los IDs numéricos de equipos en Bzzoiro Sports Data
 * para la Image API (`https://sports.bzzoiro.com/img/team/<id>/?bg=transparent`).
 *
 * Uso bajo demanda (requiere BZZOIRO_API_KEY en el entorno, `.env.local` o `--env-file=<ruta>`):
 *   pnpm --filter @pitchlab/sports-assets sync:bzzoiro
 *
 * No corre durante `build`/`test`/`typecheck` para que el monorepo siga 100 % offline y determinista.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = resolve(SCRIPT_DIR, "..");
const ROOT_DIR = resolve(PKG_DIR, "..", "..");
const BRAND_DIR = join(ROOT_DIR, "pitchlab-brand");
const DATA_DIR = join(ROOT_DIR, "data");
const OUT_FILE = join(PKG_DIR, "src", "bzzoiro-teams.generated.ts");

const API_BASE = "https://sports.bzzoiro.com/api/v2";
const BASKETBALL_API_BASE = "https://sports.bzzoiro.com/basketball/api/v2";
const IMG_BASE = "https://sports.bzzoiro.com/img";
const BASKETBALL_LEAGUE_IDS = { nba: 1 };

const STANDINGS_BY_LEAGUE = {
  "liga-mx": [19, 20],
  "premier-league": [1, 12, 86, 87],
  laliga: [3, 38],
  "la-liga": [3, 38],
  bundesliga: [5, 94],
  "serie-a": [4, 100, 101, 102, 103],
  "ligue-1": [6, 89, 105],
  "champions-league": [7],
  "europa-league": [8],
};

const COUNTRY_BY_LEAGUE = {
  "liga-mx": "Mexico",
  "premier-league": "England",
  laliga: "Spain",
  "la-liga": "Spain",
  bundesliga: "Germany",
  "serie-a": "Italy",
  "ligue-1": "France",
};

/** Aliases exactos entre slugs propios (manifiestos / historial / snapshots) y nombres de Bzzoiro. */
const ALIAS_NAMES = {
  "liga-mx.chivas": "CD Guadalajara",
  "liga-mx.deportivo-guadalajara": "CD Guadalajara",
  "liga-mx.gallos-blancos": "Querétaro FC",
  "liga-mx.queretaro": "Querétaro FC",
  "liga-mx.uanl-tigres": "Tigres UANL",
  "liga-mx.tigres-uanl": "Tigres UANL",
  "liga-mx.monterrey": "CF Monterrey",
  "liga-mx.deportivo-toluca": "CD Toluca",
  "liga-mx.toluca": "CD Toluca",
  "liga-mx.atlas-guadalajara": "Atlas FC",
  "liga-mx.atlas": "Atlas FC",
  "liga-mx.tijuana": "Club Tijuana",
  "liga-mx.atlante": "Atlante FC",
  "liga-mx.mazatlan": "Mazatlán FC",
  "liga-mx.monarcas-morelia": "Club Atlético Morelia",
  "liga-mx.veracruz": "Veracruz",
  "liga-mx.lobos-buap": "Lobos BUAP",
  "premier-league.bournemouth": "Bournemouth",
  "premier-league.afc-bournemouth": "Bournemouth",
  "premier-league.wolverhampton-wanderers": "Wolverhampton",
  "laliga.racing-santander": "Real Racing Club",
  "la-liga.real-racing-santander": "Real Racing Club",
  "laliga.deportivo-la-coruna": "Deportivo de A Coruña",
  "la-liga.deportivo-la-coruna": "Deportivo de A Coruña",
  "la-liga.espanyol-barcelona": "Espanyol",
  "la-liga.celta": "Celta Vigo",
  "la-liga.athletic": "Athletic Club",
  "la-liga.sd-eibar": "Eibar",
  "la-liga.sd-huesca": "Huesca",
  "bundesliga.borussia-monchengladbach": "Borussia M'gladbach",
  "bundesliga.greuther-furth": "SpVgg Greuther Fürth",
  "bundesliga.fortuna-dusseldorf": "Fortuna Düsseldorf",
  "bundesliga.nurnberg": "1. FC Nürnberg",
  "bundesliga.hannover": "Hannover 96",
  "bundesliga.ingolstadt": "FC Ingolstadt 04",
  "bundesliga.st-pauli": "FC St. Pauli",
  "serie-a.internazionale-milano": "Inter",
  "serie-a.inter": "Inter",
  "serie-a.delfino-pescara": "Pescara",
  "serie-a.chievo-verona": "Chievo Verona",
  "serie-a.spal-ferrara": "SPAL",
  "ligue-1.racing-lens": "RC Lens",
  "ligue-1.lens": "RC Lens",
  "ligue-1.es-troyes": "Troyes",
  "ligue-1.estac-troyes": "Troyes",
  "ligue-1.paris": "Paris FC",
  "ligue-1.paris-saint-germain": "Paris Saint-Germain",
  "ligue-1.strasbourg-alsace": "RC Strasbourg",
  "ligue-1.strasbourg": "RC Strasbourg",
  "ligue-1.girondins-bordeaux": "Girondins de Bordeaux",
  "ligue-1.dijon-fco": "Dijon",
  "ligue-1.ea-guingamp": "Guingamp",
  "ligue-1.sm-caen": "Caen",
  "ligue-1.nimes-olympique": "Nîmes Olympique",
  "ligue-1.nancy-lorraine": "Nancy",
  "ligue-1.evian-thonon-gaillard": "Thonon Evian Grand Genève F.C",
  "champions-league.inter-milan": "Inter",
  "champions-league.bayern-munich": "FC Bayern München",
  "champions-league.lille": "LOSC Lille",
  "champions-league.lens": "RC Lens",
  "europa-league.lyon": "Olympique Lyonnais",
  "europa-league.marseille": "Olympique de Marseille",
  "europa-league.rennes": "Stade Rennais",
  "europa-league.bayer-leverkusen": "Bayer 04 Leverkusen",
};

/** Slugs históricos sin equipo activo equivalente en Bzzoiro (evita emparejamientos falsos). */
const SKIP_SLUGS = new Set(["ligue-1.gazelec-ajaccio"]);

const STOP_WORDS = new Set([
  "fc",
  "cf",
  "sc",
  "sv",
  "ac",
  "as",
  "us",
  "ss",
  "rc",
  "ud",
  "cd",
  "rcd",
  "sd",
  "afc",
  "ogc",
  "osc",
  "ssc",
  "vfb",
  "tsg",
  "fsv",
  "rb",
  "es",
  "aj",
  "sm",
  "ea",
  "1",
  "04",
  "05",
  "07",
  "1899",
  "1901",
  "1907",
  "1909",
  "1913",
  "29",
  "club",
  "real",
  "deportivo",
  "calcio",
  "united",
  "city",
  "town",
  "albion",
  "stade",
  "olympique",
  "borussia",
  "eintracht",
  "bayer",
  "racing",
  "paris",
  "sporting",
]);

function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function loadApiKey(args) {
  if (process.env.BZZOIRO_API_KEY?.trim()) return process.env.BZZOIRO_API_KEY.trim();
  const explicitEnv = args.find((a) => a.startsWith("--env-file="))?.slice("--env-file=".length);
  const candidates = explicitEnv
    ? [explicitEnv]
    : [join(ROOT_DIR, ".env.local"), join(ROOT_DIR, ".env")];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*BZZOIRO_API_KEY\s*=\s*(.*)\s*$/);
      if (m) {
        const key = m[1].replace(/^['"]|['"]$/g, "").trim();
        if (key) return key;
      }
    }
  }
  return "";
}

async function getJson(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} en ${url}`);
  }
  return res.json();
}

function appendTeamsFromSnapshotsAndHistory(teams, allowedLeagues, allSnapshotFiles = false) {
  const snapDir = join(DATA_DIR, "snapshots");
  if (existsSync(snapDir)) {
    for (const league of readdirSync(snapDir)) {
      if (!(league in allowedLeagues)) continue;
      const leagueDir = join(snapDir, league);
      const files = allSnapshotFiles
        ? readdirSync(leagueDir).filter((f) => f.endsWith(".json"))
        : existsSync(join(leagueDir, "latest.json"))
          ? ["latest.json"]
          : [];
      for (const file of files) {
        const parsed = JSON.parse(readFileSync(join(leagueDir, file), "utf8"));
        for (const game of parsed.games || []) {
          for (const side of ["home", "away"]) {
            const team = game[side];
            if (!team?.id || teams.has(team.id)) continue;
            const slug = team.id.includes(".") ? team.id.split(".")[1] : team.id;
            teams.set(team.id, {
              canonId: team.id,
              league,
              slug,
              name: team.name || slug,
              shortName: team.shortName || team.name || slug,
            });
          }
        }
      }
    }
  }

  const histDir = join(DATA_DIR, "history");
  if (existsSync(histDir)) {
    for (const file of readdirSync(histDir)) {
      if (!file.endsWith(".jsonl") || file === "nfl.jsonl") continue;
      for (const line of readFileSync(join(histDir, file), "utf8").split(/\r?\n/)) {
        if (!line.trim()) continue;
        const row = JSON.parse(line);
        for (const teamId of [row.homeTeam, row.awayTeam]) {
          if (!teamId || !teamId.includes(".") || teams.has(teamId)) continue;
          const [league, slug] = teamId.split(".");
          if (!(league in allowedLeagues)) continue;
          teams.set(teamId, { canonId: teamId, league, slug, name: slug, shortName: slug });
        }
      }
    }
  }
}

function collectCanonicalBasketballTeams() {
  const teams = new Map();
  appendTeamsFromSnapshotsAndHistory(teams, BASKETBALL_LEAGUE_IDS, true);
  return [...teams.values()].sort((a, b) => a.canonId.localeCompare(b.canonId));
}

function collectCanonicalFootballTeams() {
  const teams = new Map();

  const manifests = [
    ["liga-mx", join(BRAND_DIR, "football/liga-mx-apertura-2026/manifest.json")],
    ["premier-league", join(BRAND_DIR, "football/premier-league-2026-27/manifest.json")],
    ["laliga", join(BRAND_DIR, "football/laliga-2026-27/manifest.json")],
    ["bundesliga", join(BRAND_DIR, "football/bundesliga-2026-27/manifest.json")],
    ["serie-a", join(BRAND_DIR, "football/serie-a-2026-27/manifest.json")],
    ["ligue-1", join(BRAND_DIR, "football/ligue-1-2026-27/manifest.json")],
    ["champions-league", join(BRAND_DIR, "football/champions-league-2026-27/manifest.json")],
    ["europa-league", join(BRAND_DIR, "football/europa-league-2026-27/manifest.json")],
  ];

  for (const [league, file] of manifests) {
    if (!existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    for (const entry of manifest.entries || []) {
      if (entry.kind !== "club" || !entry.id) continue;
      teams.set(`${league}.${entry.id}`, {
        canonId: `${league}.${entry.id}`,
        league,
        slug: entry.id,
        name: entry.name || entry.id,
        shortName: entry.shortName || entry.name || entry.id,
      });
    }
  }

  appendTeamsFromSnapshotsAndHistory(teams, STANDINGS_BY_LEAGUE);

  const mappingsPath = join(ROOT_DIR, "services", "ingest", "src", "mappings.ts");
  if (existsSync(mappingsPath)) {
    const raw = readFileSync(mappingsPath, "utf8");
    for (const m of raw.matchAll(
      /"((?:liga-mx|premier-league|laliga|bundesliga|serie-a|ligue-1)\.[a-z0-9-]+)"/g,
    )) {
      const canonId = m[1];
      if (teams.has(canonId)) continue;
      const [league, slug] = canonId.split(".");
      teams.set(canonId, { canonId, league, slug, name: slug, shortName: slug });
    }
  }

  return [...teams.values()].sort((a, b) => a.canonId.localeCompare(b.canonId));
}

function pickExactMatch(item, pool) {
  const alias = ALIAS_NAMES[item.canonId];
  const nAlias = alias ? norm(alias) : null;
  const nName = norm(item.name);
  const nShort = norm(item.shortName);
  const nSlug = norm(item.slug);

  if (nAlias) {
    return pool.find((c) => norm(c.name) === nAlias) ?? null;
  }
  return (
    pool.find((c) => {
      const nc = norm(c.name);
      return nc === nName || nc === nShort || nc === nSlug;
    }) ?? null
  );
}

function pickFuzzyMatch(item, pool) {
  const alias = ALIAS_NAMES[item.canonId];
  const nAlias = alias ? norm(alias) : null;
  const nName = norm(item.name);
  const nShort = norm(item.shortName);
  const nSlug = norm(item.slug);

  const target = nAlias || nName;
  const toksA = [
    ...new Set([...target.split(" "), ...nSlug.split(" "), ...nShort.split(" ")]),
  ].filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  const scored = pool
    .map((c) => {
      const nc = norm(c.name);
      if (/u18|u19|u21|u23|women|femenil|frauen|\bb\b|\bii\b/i.test(nc)) return null;
      const toksB = new Set(nc.split(" ").filter((w) => w.length > 2 && !STOP_WORDS.has(w)));
      let overlap = 0;
      for (const tok of toksA) if (toksB.has(tok)) overlap += 1;
      const exactSub = nc === nSlug || nc.includes(target) || target.includes(nc);
      if (overlap === 0 && !exactSub) return null;
      return { c, overlap, exactSub, lenDiff: Math.abs(nc.length - target.length) };
    })
    .filter(Boolean)
    .sort((a, b) => b.exactSub - a.exactSub || b.overlap - a.overlap || a.lenDiff - b.lenDiff);

  return scored[0]?.c ?? null;
}

async function verifyTeamImage(teamId, sportSegment = "team") {
  const url = `${IMG_BASE}/${sportSegment}/${teamId}/?bg=transparent`;
  const res = await fetch(url);
  if (res.status !== 200) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  // Bzzoiro devuelve 204 o un PNG transparente de 1x1 (70 bytes) cuando no existe escudo.
  if (buf.length <= 150) return false;
  if (buf.length >= 24 && buf.subarray(1, 4).toString() === "PNG") {
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    if (w <= 1 || h <= 1) return false;
  }
  return true;
}

async function fetchPaginatedTeams(baseUrl, headers) {
  const rows = [];
  for (let offset = 0; ; offset += 200) {
    const page = await getJson(`${baseUrl}/teams/?limit=200&offset=${offset}`, headers);
    rows.push(...(page.results || []));
    if (!page.next) break;
  }
  return rows;
}

async function verifyCandidatesAndCollect(candidates, sportSegment) {
  const uniqueIds = [...new Set(Object.values(candidates).map((m) => m.id))];
  const validIds = new Set();
  for (let i = 0; i < uniqueIds.length; i += 10) {
    const chunk = uniqueIds.slice(i, i + 10);
    await Promise.all(
      chunk.map(async (id) => {
        if (await verifyTeamImage(id, sportSegment)) validIds.add(id);
      }),
    );
  }
  return validIds;
}

async function main() {
  const apiKey = loadApiKey(process.argv.slice(2));
  if (!apiKey) {
    console.error(
      "Falta BZZOIRO_API_KEY (entorno, .env.local en raíz o --env-file=<ruta>).",
    );
    process.exit(1);
  }
  const headers = { Authorization: `Token ${apiKey}` };

  // 1) Fútbol (/api/v2/ → /img/team/<id>/)
  const standingsPool = {};
  for (const [league, bzIds] of Object.entries(STANDINGS_BY_LEAGUE)) {
    const map = new Map();
    for (const bzId of bzIds) {
      try {
        const st = await getJson(`${API_BASE}/leagues/${bzId}/standings/`, headers);
        for (const row of st.standings || []) {
          if (row.team_id && row.team_name) map.set(row.team_id, row.team_name);
        }
      } catch (err) {
        console.warn(`[sync-bzzoiro] omitiendo standings ${league}/${bzId}: ${err.message}`);
      }
    }
    standingsPool[league] = [...map.entries()].map(([id, name]) => ({ id, name }));
  }

  const allBzTeams = await fetchPaginatedTeams(API_BASE, headers);
  const canonicalTeams = collectCanonicalFootballTeams();
  const footballCandidates = {};
  const unresolved = [];

  for (const item of canonicalTeams) {
    if (SKIP_SLUGS.has(item.canonId)) continue;
    const pool = standingsPool[item.league] || [];
    const country = COUNTRY_BY_LEAGUE[item.league];
    const fallbackPool = country
      ? allBzTeams.filter(
          (t) =>
            t.country === country &&
            !/ U18$| U19$| U21$| U23$| B$| II$| Frauen$| Women$| Femenil$/i.test(t.name || ""),
        )
      : allBzTeams;

    const match =
      pickExactMatch(item, pool) ||
      pickExactMatch(item, fallbackPool) ||
      pickFuzzyMatch(item, pool) ||
      pickFuzzyMatch(item, fallbackPool);
    if (match) footballCandidates[item.canonId] = match;
    else unresolved.push(item.canonId);
  }

  // 2) Básquetbol NBA (/basketball/api/v2/ → /img/basketball/team/<id>/)
  const allBasketTeams = await fetchPaginatedTeams(BASKETBALL_API_BASE, headers);
  const basketUsaPool = allBasketTeams.filter((t) => t.country === "USA");
  const nbaPool = [];
  try {
    const nbaStandings = await getJson(
      `${BASKETBALL_API_BASE}/standings/?league=${BASKETBALL_LEAGUE_IDS.nba}`,
      headers,
    );
    const seen = new Set();
    for (const row of nbaStandings.standings || []) {
      const rowId = row.team_id ?? row.team?.id;
      const rowName = row.team_name ?? row.team?.name;
      if (rowId && rowName && !seen.has(rowId)) {
        seen.add(rowId);
        nbaPool.push({ id: rowId, name: rowName });
      }
    }
  } catch (err) {
    console.warn(`[sync-bzzoiro] omitiendo standings nba: ${err.message}`);
  }

  const basketballCandidates = {};
  for (const item of collectCanonicalBasketballTeams()) {
    const match =
      pickExactMatch(item, nbaPool) ||
      pickExactMatch(item, basketUsaPool) ||
      pickFuzzyMatch(item, nbaPool) ||
      pickFuzzyMatch(item, basketUsaPool);
    if (match) basketballCandidates[item.canonId] = match;
    else unresolved.push(item.canonId);
  }

  const validFootballIds = await verifyCandidatesAndCollect(footballCandidates, "team");
  const validBasketballIds = await verifyCandidatesAndCollect(
    basketballCandidates,
    "basketball/team",
  );

  const verifiedEntries = [];
  const emptyImages = [];
  for (const [canonId, match] of Object.entries(footballCandidates)) {
    if (validFootballIds.has(match.id)) verifiedEntries.push([canonId, match.id]);
    else emptyImages.push(`${canonId} (team:${match.id}:${match.name})`);
  }
  for (const [canonId, match] of Object.entries(basketballCandidates)) {
    if (validBasketballIds.has(match.id)) verifiedEntries.push([canonId, match.id]);
    else emptyImages.push(`${canonId} (basketball/team:${match.id}:${match.name})`);
  }
  verifiedEntries.sort(([a], [b]) => a.localeCompare(b));
  const verifiedMap = Object.fromEntries(verifiedEntries);

  const ts = `/* Archivo autogenerado por scripts/sync-bzzoiro-teams.mjs — no editar a mano. */

/**
 * Mapa de \`<league>.<slug>\` canónico hacia el id numérico de equipo en Bzzoiro Sports Data
 * usado por la Image API (\`/img/team/<id>/?bg=transparent\` en fútbol y
 * \`/img/basketball/team/<id>/?bg=transparent\` en NBA).
 * Cada id fue verificado contra Bzzoiro para asegurar un PNG/WebP no vacío (> 1×1 px).
 */
export const BZZOIRO_TEAM_IDS: Readonly<Record<string, number>> = ${JSON.stringify(verifiedMap, null, 2)};
`;

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, ts, "utf8");

  const uniqueVerifiedCount = validFootballIds.size + validBasketballIds.size;
  console.log(
    `OK [@pitchlab/sports-assets]: ${verifiedEntries.length} claves mapeadas (${uniqueVerifiedCount} ids únicos verificados: fútbol ${validFootballIds.size}, NBA ${validBasketballIds.size}) → ${OUT_FILE}`,
  );
  if (unresolved.length) {
    console.warn(`[sync-bzzoiro] Sin coincidencia (${unresolved.length}): ${unresolved.join(", ")}`);
  }
  if (emptyImages.length) {
    console.warn(`[sync-bzzoiro] Sin imagen válida en Bzzoiro (${emptyImages.length}): ${emptyImages.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
