import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LeagueSnapshotSchema,
  asGameId,
  parseStrictFiniteNumber,
  type LeagueSnapshot,
  type StandingRow,
} from "@pitchlab/contracts";
import { loadRootEnvFiles } from "./env.js";
import { loadPreviousSnapshot, writeSnapshotFiles } from "./pipeline.js";
import {
  buildNbaPlayerPropsSnapshotFile,
  collectBzzoiroNbaRichBundle,
  type NbaRichCollectionResult,
  type NbaRichEventTarget,
} from "./providers/bzzoiro-nba-rich.js";
import { BZZOIRO_US, collectUsSeason, usSeasonOf, type UsGameRow, type UsSport } from "./providers/bzzoiro-us.js";
import { readProviderConfigs } from "./providers/config.js";
import { createProviderClient } from "./providers/http.js";
import { buildUsLeagueSnapshot, usTeam } from "./us-snapshot.js";
import { validateLeagueSnapshotCandidate } from "./validation/snapshot-validator.js";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const SNAPSHOTS = resolve(ROOT, "data", "snapshots");

function buildNbaRichEventTargets(
  rows: readonly UsGameRow[],
  candidate: LeagueSnapshot,
): NbaRichEventTarget[] {
  const upcomingIds = new Set<string>(
    candidate.games.filter((g) => g.status !== "final").map((g) => g.id),
  );
  if (upcomingIds.size === 0) return [];

  const seen = new Set<string>();
  const targets: NbaRichEventTarget[] = [];
  for (const row of rows) {
    if (!row.kickoffUtc || row.sport !== "nba") continue;
    const ms = Date.parse(row.kickoffUtc);
    if (!Number.isFinite(ms)) continue;
    const home = usTeam("nba", row.home);
    const away = usTeam("nba", row.away);
    const gameId = asGameId(`nba-${row.kickoffUtc.slice(0, 10)}-${away.code}-${home.code}`.toLowerCase());
    if (!upcomingIds.has(gameId) || seen.has(gameId)) continue;
    seen.add(gameId);
    targets.push({
      providerMatchId: row.providerMatchId,
      gameId,
      homeTeamId: home.id,
      homeTeamName: home.name,
      homeProviderTeamId: row.home.providerTeamId,
      awayTeamId: away.id,
      awayTeamName: away.name,
      awayProviderTeamId: row.away.providerTeamId,
      kickoffUtc: new Date(ms).toISOString(),
    });
  }
  return targets.sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
}

export function applyNbaRichEnrichmentToSnapshot(
  candidate: LeagueSnapshot,
  rich: NbaRichCollectionResult,
): LeagueSnapshot {
  const existingStandingsById = new Map<string, StandingRow>(
    (candidate.standings ?? []).map((row) => [row.teamId, row]),
  );

  const standings =
    rich.standingsOk && rich.standings.length >= 10
      ? rich.standings.map((row) => {
          const prevRow = existingStandingsById.get(row.teamId);
          const logoUrl = row.logoUrl ?? prevRow?.logoUrl ?? candidate.teamRates[row.teamId]?.logoUrl;
          const form = row.form && row.form.length > 0 ? row.form : prevRow?.form;
          return {
            ...row,
            ...(logoUrl ? { logoUrl } : {}),
            ...(form && form.length > 0 ? { form } : {}),
          };
        })
      : candidate.standings;

  const games = candidate.games.map((game) => {
    const pregame = rich.pregameByGameId.get(game.id);
    const leadOfficial = pregame?.officials[0];
    if (!leadOfficial) return game;
    return { ...game, referee: leadOfficial.slice(0, 120) };
  });

  const analyses = { ...candidate.analyses };
  for (const [gameId, pregame] of rich.pregameByGameId.entries()) {
    const current = analyses[gameId];
    if (!current) continue;
    const leadOfficial = pregame.officials[0];
    const hasRestDays = pregame.restDays.home !== null || pregame.restDays.away !== null;
    analyses[gameId] = {
      ...current,
      ...(leadOfficial
        ? {
            matchContext: {
              ...(current.matchContext ?? {}),
              referee: leadOfficial.slice(0, 120),
            },
          }
        : {}),
      ...(hasRestDays
        ? {
            insights: {
              why: current.insights?.why ?? [],
              ...(current.insights?.headToHead ? { headToHead: current.insights.headToHead } : {}),
              restDays: {
                ...(current.insights?.restDays ?? {}),
                ...(pregame.restDays.home !== null ? { home: pregame.restDays.home } : {}),
                ...(pregame.restDays.away !== null ? { away: pregame.restDays.away } : {}),
              },
            },
          }
        : {}),
    };
  }

  return LeagueSnapshotSchema.parse({
    ...candidate,
    games,
    analyses,
    ...(standings && standings.length > 0 ? { standings } : {}),
  });
}

export function writeNbaRichSidecarFiles(
  snapshotsRoot: string,
  rich: NbaRichCollectionResult,
  updatedAtIso: string,
): { wroteMarketLines: boolean; wrotePlayerProps: boolean } {
  const dir = join(snapshotsRoot, "nba");
  let wroteMarketLines = false;
  let wrotePlayerProps = false;

  if (rich.marketLines.length > 0) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "market-lines.json"),
      JSON.stringify(
        { schemaVersion: 1, league: "nba", updatedAt: updatedAtIso, lines: rich.marketLines },
        null,
        2,
      ) + "\n",
    );
    wroteMarketLines = true;
  }

  if (rich.propSeeds.length > 0) {
    mkdirSync(dir, { recursive: true });
    const propsFile = buildNbaPlayerPropsSnapshotFile(rich.propSeeds, updatedAtIso);
    writeFileSync(join(dir, "player-props.json"), JSON.stringify(propsFile, null, 2) + "\n");
    wrotePlayerProps = true;
  }

  return { wroteMarketLines, wrotePlayerProps };
}

export interface RunUsSnapshotCliOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly argv?: readonly string[];
  readonly cacheDir?: string;
  readonly snapshotsRoot?: string;
  readonly now?: Date;
  readonly fetchImpl?: typeof fetch;
}

export interface RunUsSnapshotCliResult {
  readonly offline: boolean;
  readonly skippedMissingKey: boolean;
  readonly updatedSports: UsSport[];
  readonly preservedOfflineSports: UsSport[];
  readonly failures: number;
}

export async function runUsSnapshotCli(
  options: RunUsSnapshotCliOptions = {},
): Promise<RunUsSnapshotCliResult> {
  const env = options.env ?? process.env;
  const argv = options.argv ?? process.argv.slice(2);
  let sports: UsSport[] = ["nba", "nhl"];
  let offline = env.PITCHLAB_OFFLINE === "1";
  for (const arg of argv) {
    if (arg === "--offline") offline = true;
    else if (arg.startsWith("--sports=")) {
      sports = arg.slice(9).split(",").filter((s): s is UsSport => s in BZZOIRO_US);
    } else {
      throw new Error(`Argumento no reconocido: '${arg}'.`);
    }
  }
  const cfg = readProviderConfigs(env).bzzoiro;
  if (!cfg.enabled && !offline) {
    console.log("[snapshot:us] Falta BZZOIRO_API_KEY; no se genera NBA/NHL.");
    return {
      offline: false,
      skippedMissingKey: true,
      updatedSports: [],
      preservedOfflineSports: [],
      failures: 0,
    };
  }
  const rootCfg = { ...cfg, baseUrl: cfg.baseUrl.replace(/\/api\/v2$/, "") };
  const snapshotsRoot = options.snapshotsRoot ?? SNAPSHOTS;
  const cacheDir = options.cacheDir ?? resolve(ROOT, "data", "history", "raw");
  const now = options.now ?? new Date();
  const updatedAtIso = now.toISOString();
  const parsedStartYear = parseStrictFiniteNumber(usSeasonOf(updatedAtIso).slice(0, 4));
  const currentStart = parsedStartYear ?? now.getUTCFullYear();
  const updatedSports: UsSport[] = [];
  const preservedOfflineSports: UsSport[] = [];
  let failures = 0;

  for (const sport of sports) {
    try {
      const client = createProviderClient(rootCfg, {
        cacheDir,
        minIntervalMs: 1_000,
        maxRequests: 30,
        offline,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        log: (m) => console.log(`[snapshot:${sport}] ${m}`),
      });
      const rows: UsGameRow[] = [];
      let offlineCacheMiss = false;
      for (let year = currentStart - 2; year <= currentStart; year++) {
        try {
          rows.push(...(await collectUsSeason(client, sport, year, !offline && year === currentStart)));
        } catch (seasonErr) {
          if (offline && seasonErr instanceof Error && seasonErr.message.startsWith("Modo offline:")) {
            offlineCacheMiss = true;
            break;
          }
          throw seasonErr;
        }
      }
      if (offline && (offlineCacheMiss || rows.length === 0)) {
        preservedOfflineSports.push(sport);
        console.log(
          `[snapshot:${sport}] Modo offline sin caché local completa; se conserva snapshot previo.`,
        );
        continue;
      }
      const previous = loadPreviousSnapshot(snapshotsRoot, sport);
      let candidate = buildUsLeagueSnapshot({ sport, rows, now, previousSnapshot: previous });

      let nbaRich: NbaRichCollectionResult | null = null;
      if (sport === "nba" && cfg.enabled && !offline) {
        try {
          const richClient = createProviderClient(rootCfg, {
            cacheDir,
            minIntervalMs: cfg.unlimitedQuota ? 150 : 1_000,
            maxRequests: cfg.unlimitedQuota ? 300 : 40,
            offline: false,
            ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
            log: (m) => console.log(`[snapshot:nba:rich] ${m}`),
          });
          const upcomingEvents = buildNbaRichEventTargets(rows, candidate);
          nbaRich = await collectBzzoiroNbaRichBundle({
            client: richClient,
            upcomingEvents,
            nowIso: updatedAtIso,
            maxEvents: cfg.unlimitedQuota ? 16 : 6,
            maxTeamsForProps: cfg.unlimitedQuota ? 20 : 6,
            maxPlayersPerTeam: cfg.unlimitedQuota ? 8 : 4,
          });
          candidate = applyNbaRichEnrichmentToSnapshot(candidate, nbaRich);
        } catch (richErr) {
          console.warn(
            "[snapshot:nba:rich] Enriquecimiento Bzzoiro NBA omitido por error (se conserva snapshot base):",
            richErr instanceof Error ? richErr.message : richErr,
          );
        }
      }

      const validation = validateLeagueSnapshotCandidate(candidate, previous, { nowMs: now.getTime() });
      if (!validation.ok) {
        const reason = validation.issues.slice(0, 3).map((i) => `${i.code}: ${i.message}`).join(" | ");
        if (offline) {
          preservedOfflineSports.push(sport);
          console.log(
            `[snapshot:${sport}] Modo offline con caché insuficiente (${reason}); se conserva snapshot previo.`,
          );
          continue;
        }
        failures++;
        console.error(`[snapshot:${sport}] rechazado por validación; se conserva el anterior (${reason}).`);
        continue;
      }
      const { latestPath } = writeSnapshotFiles(
        snapshotsRoot,
        validation.value ?? candidate,
        updatedAtIso.slice(0, 10),
      );
      let richSummary = "";
      if (nbaRich) {
        const sidecars = writeNbaRichSidecarFiles(snapshotsRoot, nbaRich, updatedAtIso);
        richSummary = ` · pregame=${nbaRich.pregameByGameId.size} · líneas=${nbaRich.marketLines.length}${sidecars.wroteMarketLines ? " (guardadas)" : ""} · props=${nbaRich.propSeeds.length}${sidecars.wrotePlayerProps ? " (player-props.json)" : ""}`;
      }
      updatedSports.push(sport);
      console.log(
        `[snapshot:${sport}] ${candidate.games.length} partidos (${Object.keys(candidate.analyses).length} con análisis)${richSummary} → ${latestPath} · peticiones ${client.stats.requests}`,
      );
    } catch (error) {
      failures++;
      console.error(`[snapshot:${sport}] error; se conserva el anterior:`, error instanceof Error ? error.message : error);
    }
  }

  return {
    offline,
    skippedMissingKey: false,
    updatedSports,
    preservedOfflineSports,
    failures,
  };
}

async function main(): Promise<void> {
  loadRootEnvFiles(ROOT);
  const result = await runUsSnapshotCli({
    env: process.env,
    argv: process.argv.slice(2),
  });
  if (result.failures > 0) process.exitCode = 1;
}

const isDirectEntry =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectEntry) {
  main().catch((err) => {
    console.error("[snapshot:us] Error fatal:", err);
    process.exit(1);
  });
}
