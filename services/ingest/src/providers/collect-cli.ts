/**
 * `pnpm --filter @pitchlab/ingest history:providers [flags]`
 *
 * Junta históricos de Bzzoiro (xG, alineaciones, bajas) y 5DollarFootballAPI (córners,
 * tarjetas, momios de Bet365) para entrenar los motores de fútbol.
 *
 *   --provider=bzzoiro|fivedollar|all   (por defecto: all)
 *   --leagues=liga-mx,premier-league    (por defecto: todas las del proveedor)
 *   --seasons=3                         Bzzoiro: temporadas más recientes por liga
 *   --no-details                        Bzzoiro: sin stats ni alineaciones (1 llamada por página)
 *   --max-requests=3000                 tope de peticiones reales por proveedor en la corrida
 *   --max-odds=40                       5Dollar: momios nuevos a pedir (1 petición cada uno)
 *   --offline                           solo caché
 *
 * Salida (ignorada por Git, la licencia no permite redistribuir el dato crudo):
 *   data/history/research/<proveedor>/<liga>.jsonl  y  .../manifest.json
 * Cada corrida suma a lo ya guardado, así la ventana móvil del plan gratis se acumula.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadRootEnvFiles } from "../env.js";
import {
  BZZOIRO_LEAGUES,
  collectSeason,
  listSeasons,
  type BzzoiroLeagueKey,
} from "./bzzoiro.js";
import { readProviderConfigs } from "./config.js";
import {
  collectLeague,
  FIVEDOLLAR_LEAGUES,
  fiveDollarIntervalMs,
  type FiveDollarLeagueKey,
} from "./fivedollar.js";
import { createProviderClient, ProviderBudgetExhaustedError } from "./http.js";

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..", "..");
const RAW_DIR = join(ROOT_DIR, "data", "history", "raw");
const OUT_DIR = join(ROOT_DIR, "data", "history", "research");

interface Flags {
  provider: "bzzoiro" | "fivedollar" | "all";
  leagues: string[] | null;
  seasons: number;
  details: boolean;
  maxRequests: number | null;
  maxOdds: number;
  offline: boolean;
}

function parseFlags(argv: readonly string[]): Flags {
  const flags: Flags = {
    provider: "all",
    leagues: null,
    seasons: 3,
    details: true,
    maxRequests: null,
    maxOdds: 40,
    offline: false,
  };
  for (const arg of argv) {
    if (arg === "--offline") flags.offline = true;
    else if (arg === "--no-details") flags.details = false;
    else {
      const match = arg.match(/^--([a-z-]+)=(.+)$/);
      if (!match) throw new Error(`Argumento no reconocido: '${arg}'.`);
      const [, key, value] = match as unknown as [string, string, string];
      const positive = (): number => {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0) throw new Error(`--${key} inválido: '${value}'.`);
        return n;
      };
      if (key === "provider") {
        if (value !== "bzzoiro" && value !== "fivedollar" && value !== "all") {
          throw new Error(`--provider debe ser bzzoiro, fivedollar o all.`);
        }
        flags.provider = value;
      } else if (key === "leagues") flags.leagues = value.split(",").map((s) => s.trim()).filter(Boolean);
      else if (key === "seasons") flags.seasons = Math.max(1, positive());
      else if (key === "max-requests") flags.maxRequests = positive();
      else if (key === "max-odds") flags.maxOdds = positive();
      else throw new Error(`Flag desconocida: '--${key}'.`);
    }
  }
  return flags;
}

function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

/** Une lo nuevo con lo guardado: el registro nuevo gana, salvo que pierda datos que ya había. */
function upsertById<T extends { providerMatchId: number }>(
  existing: readonly T[],
  incoming: readonly T[],
  keepFromExisting: (prev: T, next: T) => T,
): T[] {
  const byId = new Map<number, T>();
  for (const row of existing) byId.set(row.providerMatchId, row);
  for (const row of incoming) {
    const prev = byId.get(row.providerMatchId);
    byId.set(row.providerMatchId, prev ? keepFromExisting(prev, row) : row);
  }
  return [...byId.values()].sort((a, b) =>
    String((a as unknown as { kickoffUtc: string }).kickoffUtc).localeCompare(
      String((b as unknown as { kickoffUtc: string }).kickoffUtc),
    ),
  );
}

function writeJsonl(file: string, rows: readonly unknown[]): void {
  mkdirSync(resolve(file, ".."), { recursive: true });
  writeFileSync(file, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""), "utf8");
}

interface ManifestEntry {
  league: string;
  rows: number;
  withStats?: number;
  withLineups?: number;
  withOdds?: number;
  oddsPending?: number;
  firstKickoff: string | null;
  lastKickoff: string | null;
}

function writeManifest(provider: string, entries: ManifestEntry[], extra: Record<string, unknown>): string {
  const file = join(OUT_DIR, provider, "manifest.json");
  const previous = existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as { leagues?: ManifestEntry[] })
    : {};
  const merged = new Map<string, ManifestEntry>();
  for (const e of previous.leagues ?? []) merged.set(e.league, e);
  for (const e of entries) merged.set(e.league, e);
  mkdirSync(join(OUT_DIR, provider), { recursive: true });
  writeFileSync(
    file,
    JSON.stringify(
      {
        provider,
        generatedAt: new Date().toISOString(),
        license: "research-only: no redistribuir el dato crudo; salidas derivadas permitidas",
        ...extra,
        leagues: [...merged.values()].sort((a, b) => a.league.localeCompare(b.league)),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  return file;
}

async function runBzzoiro(flags: Flags): Promise<void> {
  const cfg = readProviderConfigs().bzzoiro;
  if (!cfg.enabled && !flags.offline) {
    console.log("[bzzoiro] apagado: falta BZZOIRO_API_KEY.");
    return;
  }
  const client = createProviderClient(cfg, {
    cacheDir: RAW_DIR,
    minIntervalMs: 250,
    maxRequests: flags.maxRequests ?? 3_000,
    offline: flags.offline,
    log: (m) => console.log(`[bzzoiro] ${m}`),
  });
  const leagues = (flags.leagues ?? Object.keys(BZZOIRO_LEAGUES)).filter(
    (l): l is BzzoiroLeagueKey => l in BZZOIRO_LEAGUES,
  );
  const entries: ManifestEntry[] = [];
  let exhausted = false;
  let fatal: unknown = null;

  for (const league of leagues) {
    if (exhausted || fatal) break;
    const collected = [];
    try {
      for (const leagueId of BZZOIRO_LEAGUES[league]) {
        const seasons = (await listSeasons(client, leagueId))
          .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
          .slice(0, flags.seasons);
        for (const season of seasons) {
          const rows = await collectSeason(client, league, season, {
            withDetails: flags.details,
            onProgress: (done, total) => {
              if (done === total || done % 50 === 0) {
                console.log(`[bzzoiro] ${league} · ${season.name}: ${done}/${total}`);
              }
            },
          });
          collected.push(...rows);
        }
      }
    } catch (error) {
      if (error instanceof ProviderBudgetExhaustedError) {
        console.log(`[bzzoiro] ${error.message} Guardo lo juntado y sigo en la próxima corrida.`);
        exhausted = true;
      } else {
        // Lo bajado ya está en caché; se guarda lo juntado y se reporta el error al final.
        console.log(`[bzzoiro] Error en ${league}; guardo lo juntado. Vuelve a correr para seguir.`);
        fatal = error;
      }
    }

    const file = join(OUT_DIR, "bzzoiro", `${league}.jsonl`);
    const rows = upsertById(readJsonl<(typeof collected)[number]>(file), collected, (prev, next) => ({
      ...next,
      stats: next.stats ?? prev.stats,
      lineups: next.lineups ?? prev.lineups,
    }));
    writeJsonl(file, rows);
    entries.push({
      league,
      rows: rows.length,
      withStats: rows.filter((r) => r.stats?.home.xg != null).length,
      withLineups: rows.filter((r) => r.lineups?.status === "confirmed").length,
      firstKickoff: rows[0]?.kickoffUtc ?? null,
      lastKickoff: rows.at(-1)?.kickoffUtc ?? null,
    });
    console.log(`[bzzoiro] ${league}: ${rows.length} partidos → ${file}`);
  }

  const manifest = writeManifest("bzzoiro", entries, { requestsThisRun: client.stats.requests });
  console.log(`[bzzoiro] peticiones: ${client.stats.requests} · desde caché: ${client.stats.cacheHits} · ${manifest}`);
  if (fatal) throw fatal;
}

async function runFiveDollar(flags: Flags): Promise<void> {
  const cfg = readProviderConfigs().fivedollar;
  if (!cfg.enabled && !flags.offline) {
    console.log("[fivedollar] apagado: falta FIVEDOLLAR_FOOTBALL_API_KEY.");
    return;
  }
  const plan = (process.env.FIVEDOLLAR_FOOTBALL_PLAN ?? "free").trim().toLowerCase() || "free";
  const paid = plan === "pro" || plan === "ultra" || plan === "education" || plan === "business";
  const client = createProviderClient(cfg, {
    cacheDir: RAW_DIR,
    minIntervalMs: fiveDollarIntervalMs(plan),
    maxRequests: flags.maxRequests ?? (paid ? 600 : 55),
    offline: flags.offline,
    log: (m) => console.log(`[fivedollar] ${m}`),
  });
  const leagues = (flags.leagues ?? Object.keys(FIVEDOLLAR_LEAGUES)).filter(
    (l): l is FiveDollarLeagueKey => l in FIVEDOLLAR_LEAGUES,
  );
  const entries: ManifestEntry[] = [];
  let oddsBudget = flags.maxOdds;

  for (const league of leagues) {
    if (!paid && !FIVEDOLLAR_LEAGUES[league].freePlan) {
      console.log(`[fivedollar] ${league}: necesita plan Pro, la salto.`);
      continue;
    }
    let result;
    try {
      result = await collectLeague(client, league, { maxOddsRequests: oddsBudget });
    } catch (error) {
      if (!(error instanceof ProviderBudgetExhaustedError)) throw error;
      console.log(`[fivedollar] ${error.message} Corre de nuevo en una hora para seguir.`);
      break;
    }
    oddsBudget = Math.max(0, oddsBudget - result.oddsFetched);
    const file = join(OUT_DIR, "fivedollar", `${league}.jsonl`);
    const rows = upsertById(readJsonl<(typeof result.rows)[number]>(file), result.rows, (prev, next) => ({
      ...next,
      odds: next.odds ?? prev.odds,
    }));
    writeJsonl(file, rows);
    entries.push({
      league,
      rows: rows.length,
      withOdds: rows.filter((r) => r.odds?.oneXTwo.closing).length,
      oddsPending: rows.filter((r) => !r.odds).length,
      firstKickoff: rows[0]?.kickoffUtc ?? null,
      lastKickoff: rows.at(-1)?.kickoffUtc ?? null,
    });
    console.log(
      `[fivedollar] ${league}: ${rows.length} partidos, ${result.oddsFetched} momios nuevos, ${result.oddsPending} pendientes → ${file}`,
    );
  }

  const manifest = writeManifest("fivedollar", entries, {
    plan,
    attributionRequired: !paid,
    requestsThisRun: client.stats.requests,
  });
  console.log(`[fivedollar] peticiones: ${client.stats.requests} · desde caché: ${client.stats.cacheHits} · ${manifest}`);
}

async function main(): Promise<void> {
  loadRootEnvFiles(ROOT_DIR);
  const flags = parseFlags(process.argv.slice(2));
  if (flags.provider === "all" || flags.provider === "bzzoiro") await runBzzoiro(flags);
  if (flags.provider === "all" || flags.provider === "fivedollar") await runFiveDollar(flags);
}

main().catch((error: unknown) => {
  console.error("[history:providers] Error fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
