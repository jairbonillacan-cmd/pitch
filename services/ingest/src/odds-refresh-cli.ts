import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { asGameId, parseStrictFiniteNumber } from "@pitchlab/contracts";
import type { OddsSnapshotRow } from "@pitchlab/spacetime";
import { hydrateOddsOnlyForLeagues } from "./bzzoiro-expansion-cli.js";
import { loadRootEnvFiles } from "./env.js";
import {
  evaluateAndReportDataHealth,
  type RuntimeIncidentInput,
} from "./health/health-monitor.js";
import { buildPermittedActiveOddsAdapters } from "./odds/betfair-exchange.js";
import {
  THE_ODDS_API_BUDGET_FILENAME,
  TheOddsApiAdapter,
} from "./odds/the-odds-api.js";
import {
  buildOddsCadencePlan,
  type OddsRefreshWindowMode,
} from "./odds/cadence-scheduler.js";
import {
  loadQuotesLatestLedger,
  regenerateLiveMatchdaySnapshot,
} from "./odds/regenerate-live-snapshot.js";
import { loadPreviousSnapshot } from "./pipeline.js";
import {
  collectBzzoiroNbaRichBundle,
  type NbaRichEventTarget,
} from "./providers/bzzoiro-nba-rich.js";
import { collectUsSeason, usSeasonOf } from "./providers/bzzoiro-us.js";
import { readProviderConfigs } from "./providers/config.js";
import { createProviderClient } from "./providers/http.js";
import { writeNbaRichSidecarFiles } from "./us-snapshot-cli.js";
import { usTeam } from "./us-snapshot.js";

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..");
const SNAPSHOTS_ROOT = resolve(ROOT_DIR, "data", "snapshots");
const QUOTES_LATEST_PATH = resolve(ROOT_DIR, "data", "odds_timeseries", "quotes_latest.json");
const THE_ODDS_API_BUDGET_PATH = resolve(
  ROOT_DIR,
  "data",
  "odds_timeseries",
  THE_ODDS_API_BUDGET_FILENAME,
);

export interface OddsRefreshCliFlags {
  readonly windowMode: OddsRefreshWindowMode;
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly oddsOnly: boolean;
  readonly includeExpansion: boolean;
  readonly tier1CupsOnly: boolean;
  readonly skipTier1Cups: boolean;
  readonly skipNba: boolean;
}

export function parseOddsRefreshCliFlags(argv: readonly string[]): OddsRefreshCliFlags {
  let windowMode: OddsRefreshWindowMode = "auto";
  let force = false;
  let dryRun = false;
  let oddsOnly = false;
  let includeExpansion = false;
  let tier1CupsOnly = false;
  let skipTier1Cups = false;
  let skipNba = false;

  for (const arg of argv) {
    if (arg === "--force") force = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--odds-only") oddsOnly = true;
    else if (arg === "--include-expansion") includeExpansion = true;
    else if (arg === "--tier1-cups-only") tier1CupsOnly = true;
    else if (arg === "--skip-tier1-cups") skipTier1Cups = true;
    else if (arg === "--skip-nba") skipNba = true;
    else if (arg.startsWith("--window=")) {
      const val = arg.slice("--window=".length).trim();
      if (val === "auto" || val === "all" || val === "matchday" || val === "prekickoff") {
        windowMode = val;
      } else {
        throw new Error(`--window inválido (${val}); se esperaba auto|all|matchday|prekickoff.`);
      }
    }
  }

  return {
    windowMode,
    force,
    dryRun,
    oddsOnly,
    includeExpansion,
    tier1CupsOnly,
    skipTier1Cups,
    skipNba,
  };
}

async function refreshNbaRichOddsAndProps(
  now: Date,
  nowIso: string,
): Promise<{ marketLines: number; propSeeds: number } | null> {
  const bzzoiroCfg = readProviderConfigs().bzzoiro;
  if (!bzzoiroCfg.enabled || process.env.PITCHLAB_OFFLINE === "1") return null;
  const previous = loadPreviousSnapshot(SNAPSHOTS_ROOT, "nba");
  if (!previous) return null;

  const upcomingIds = new Set<string>(
    previous.games.filter((g) => g.status !== "final").map((g) => g.id),
  );
  if (upcomingIds.size === 0) return null;

  const client = createProviderClient(
    { ...bzzoiroCfg, baseUrl: bzzoiroCfg.baseUrl.replace(/\/api\/v2$/, "") },
    {
      cacheDir: resolve(ROOT_DIR, "data", "history", "raw"),
      minIntervalMs: bzzoiroCfg.unlimitedQuota ? 150 : 1_000,
      maxRequests: bzzoiroCfg.unlimitedQuota ? 250 : 25,
      offline: false,
      log: (m) => console.log(`[odds:refresh:nba] ${m}`),
    },
  );
  const startYear = parseStrictFiniteNumber(usSeasonOf(nowIso).slice(0, 4)) ?? now.getUTCFullYear();
  const seasonRows = await collectUsSeason(client, "nba", startYear, true);
  const seen = new Set<string>();
  const upcomingEvents: NbaRichEventTarget[] = [];
  for (const row of seasonRows) {
    if (!row.kickoffUtc) continue;
    const ms = Date.parse(row.kickoffUtc);
    if (!Number.isFinite(ms)) continue;
    const home = usTeam("nba", row.home);
    const away = usTeam("nba", row.away);
    const gameId = asGameId(`nba-${row.kickoffUtc.slice(0, 10)}-${away.code}-${home.code}`.toLowerCase());
    if (!upcomingIds.has(gameId) || seen.has(gameId)) continue;
    seen.add(gameId);
    upcomingEvents.push({
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
  if (upcomingEvents.length === 0) return null;

  const rich = await collectBzzoiroNbaRichBundle({
    client,
    upcomingEvents,
    nowIso,
    includeStandings: false,
    includePregame: false,
    includeOdds: true,
    includePlayerProps: bzzoiroCfg.unlimitedQuota === true,
    maxEvents: bzzoiroCfg.unlimitedQuota ? 16 : 6,
    maxTeamsForProps: bzzoiroCfg.unlimitedQuota ? 16 : 0,
    maxPlayersPerTeam: 8,
  });
  writeNbaRichSidecarFiles(SNAPSHOTS_ROOT, rich, nowIso);
  return { marketLines: rich.marketLines.length, propSeeds: rich.propSeeds.length };
}

async function main(): Promise<void> {
  const startedAt = performance.now();
  loadRootEnvFiles(ROOT_DIR);
  const flags = parseOddsRefreshCliFlags(process.argv.slice(2));
  const { windowMode, force, dryRun, oddsOnly, includeExpansion, tier1CupsOnly, skipTier1Cups, skipNba } = flags;
  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const nowMs = Date.parse(nowIso);
  const isOffline = process.env.PITCHLAB_OFFLINE === "1";

  const runtimeIncidents: RuntimeIncidentInput[] = [];
  const incomingTicks: OddsSnapshotRow[] = [];
  let regenOk = true;
  let allAdaptersFailed = false;
  let activeAdaptersCount = 0;

  if (!tier1CupsOnly) {
    const existingLedger = loadQuotesLatestLedger(QUOTES_LATEST_PATH);
    const plan = buildOddsCadencePlan({
      snapshotsRoot: SNAPSHOTS_ROOT,
      existingTicks: existingLedger?.ticks ?? [],
      windowMode,
      force,
      nowMs,
    });

    console.log(
      `[odds:refresh] ${nowIso} · ventana=${windowMode} · oddsOnly=${oddsOnly} · ligas por refrescar=${plan.leaguesToFetch.length}/${plan.decisions.length}`,
    );
    for (const dec of plan.decisions) {
      console.log(
        `  - ${dec.league.padEnd(15)} [${dec.regime.padEnd(14)}] fetch=${dec.shouldFetch ? "SÍ" : "NO"} · ${dec.reason}`,
      );
    }

    const permitted: ReturnType<typeof buildPermittedActiveOddsAdapters> = isOffline
      ? { adapters: [], skipped: [] }
      : buildPermittedActiveOddsAdapters(process.env, {
          theOddsApiBudgetPath: THE_ODDS_API_BUDGET_PATH,
        });
    const { adapters, skipped } = permitted;
    activeAdaptersCount = adapters.length;
    for (const sk of skipped) {
      if (sk.status !== "blocked_pending_owner_decision") {
        console.log(`[odds:refresh] Fuente omitida (${sk.sourceId}): ${sk.reason}`);
      }
    }

    if (adapters.length > 0 && plan.leaguesToFetch.length > 0) {
      for (const adapter of adapters) {
        try {
          const rows = await adapter.fetchSnapshots({
            activeLeagues: plan.leaguesToFetch,
            capturedAtIso: nowIso,
          });
          console.log(
            `[odds:refresh] ${adapter.metadata.sourceId}: ${rows.length} filas válidas capturadas.`,
          );
          if (adapter instanceof TheOddsApiAdapter && adapter.lastBudgetReport) {
            const r = adapter.lastBudgetReport;
            console.log(
              `[odds:refresh] Presupuesto The Odds API: consultadas=${r.leaguesFetched.length}, omitidas=${JSON.stringify(r.leaguesSkipped)}, usadasMes=${r.monthCreditsUsed}, restanteHeader=${r.remainingHeader ?? "n/d"}`,
            );
          }
          incomingTicks.push(...rows);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[odds:refresh] Falla en ${adapter.metadata.sourceId}: ${msg}`);
          runtimeIncidents.push({
            incidentKey: `source::odds-refresh::${adapter.metadata.sourceId}`,
            kind: "source_failure",
            severity: "critical",
            targetLabel: adapter.metadata.displayName,
            workflowId: "odds-refresh",
            message: msg,
          });
        }
      }
    } else if (adapters.length === 0) {
      console.log(
        isOffline
          ? "[odds:refresh] PITCHLAB_OFFLINE=1; se omite consulta remota y se valida el snapshot vigente."
          : "[odds:refresh] Sin credenciales activas (BZZOIRO_API_KEY / THE_ODDS_API_KEY / BETFAIR_*); se verifica caducidad de 72 h sobre el snapshot vigente.",
      );
    }

    const regen = regenerateLiveMatchdaySnapshot({
      rootDir: ROOT_DIR,
      incomingTicks,
      activeSources: adapters.map((a) => a.metadata.sourceId),
      nowIso,
      dryRun,
    });
    regenOk = regen.ok;

    if (!regen.ok) {
      const summaryMsg = regen.rejectedIssues
        .slice(0, 3)
        .map((i) => `${i.code}: ${i.message}`)
        .join(" | ");
      console.error(
        `[odds:refresh] Validación Parte 3 rechazó el snapshot candidato; se conserva el anterior (${summaryMsg}).`,
      );
      runtimeIncidents.push({
        incidentKey: "validation::momios::live_snapshot",
        kind: "validation_rejected",
        severity: "critical",
        targetLabel: "Snapshot global de momios (v3.2)",
        dataType: "momios",
        workflowId: "odds-refresh",
        message: summaryMsg || "Candidato rechazado por invariantes de Parte 3.",
      });
    } else {
      console.log(
        `[odds:refresh] Resultado: validTicks=${regen.validTicksCount}, conCuotaVigente=${regen.nWithFreshQuotesLt72h}/${regen.nOutlooksTotal}, wroteSnapshot=${regen.wroteLiveSnapshot}, wroteQuotes=${regen.wroteQuotesLedger}`,
      );
    }

    allAdaptersFailed =
      adapters.length > 0 &&
      plan.leaguesToFetch.length > 0 &&
      runtimeIncidents.filter((i) => i.kind === "source_failure").length === adapters.length;
  }

  const bzApiKey = process.env.BZZOIRO_API_KEY?.trim() ?? "";
  const bzUnlimitedRaw = (process.env.BZZOIRO_UNLIMITED ?? "").trim().toLowerCase();
  const bzUnlimited = bzUnlimitedRaw === "1" || bzUnlimitedRaw === "true" || bzUnlimitedRaw === "yes";

  if (bzApiKey && !dryRun && !isOffline && !skipTier1Cups) {
    try {
      const onlyTier1Cups = tier1CupsOnly || (!includeExpansion && !bzUnlimited);
      const expansionOdds = await hydrateOddsOnlyForLeagues({
        token: bzApiKey,
        unlimited: bzUnlimited,
        tier1CupsOnly: onlyTier1Cups,
        now: new Date(nowMs),
        snapshotsRoot: SNAPSHOTS_ROOT,
      });
      console.log(
        `[odds:refresh] Copas Tier 1${onlyTier1Cups ? "" : " + expansión"}: ${expansionOdds.leaguesWithOdds} ligas (${expansionOdds.totalLines} líneas, ${expansionOdds.totalRequests} solicitudes).`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[odds:refresh] Error en momios de copas Tier 1/expansión: ${msg}`);
    }
  }

  if (bzApiKey && !dryRun && !isOffline && !skipNba && !tier1CupsOnly) {
    try {
      const nbaRes = await refreshNbaRichOddsAndProps(new Date(nowMs), nowIso);
      if (nbaRes) {
        console.log(
          `[odds:refresh] NBA rich: ${nbaRes.marketLines} líneas · ${nbaRes.propSeeds} props guardadas.`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[odds:refresh] Error en NBA rich odds/props: ${msg}`);
    }
  }

  const durationMs = performance.now() - startedAt;
  const wfStatus = !regenOk || allAdaptersFailed
    ? "failed"
    : runtimeIncidents.length > 0
      ? "degraded"
      : activeAdaptersCount === 0
        ? "pending_credentials"
        : "ok";

  if (!dryRun && !oddsOnly && !tier1CupsOnly) {
    const health = await evaluateAndReportDataHealth({
      rootDir: ROOT_DIR,
      nowIso,
      clearTransientScopes: ["odds"],
      runtimeIncidents,
      workflowUpdate: {
        workflowId: "odds-refresh",
        status: wfStatus,
        runAtUtc: nowIso,
        durationMs,
        errorMessage: runtimeIncidents[0]?.message ?? null,
      },
    });
    console.log(
      `[odds:refresh] Salud de datos=${health.report.overallStatus} · incidencias activas=${health.report.activeIncidents.length} · correo enviado=${health.emailSent} · duración=${Math.round(durationMs)} ms`,
    );
  }

  if (!regenOk || allAdaptersFailed) {
    process.exitCode = 1;
  }
}

const isDirectEntry =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectEntry) {
  main().catch((err) => {
    console.error("[odds:refresh] Error fatal:", err);
    process.exit(1);
  });
}
