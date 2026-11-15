/**
 * Parte 1 · CLI de actualización automática de momios (`odds:refresh`).
 *
 * Uso:
 *   pnpm --filter @pitchlab/ingest odds:refresh [--window=auto|all|matchday|prekickoff] [--force] [--dry-run]
 *
 * Flujo:
 * 1. Evalúa el régimen horario por liga (`cadence-scheduler.ts`) sobre `data/snapshots/<liga>/latest.json`.
 * 2. Ejecuta únicamente los adaptadores permitidos por la compuerta legal (`bzzoiro_odds` para fútbol, `the_odds_api` para la NFL, `betfair_exchange`).
 * 3. Valida los ticks y el snapshot consolidado con Parte 3 (`regenerate-live-snapshot.ts`),
 *    conservando el archivo anterior si cualquier invariante falla.
 * 4. Actualiza `data/health/data-health.json` y dispara avisos deduplicados por Resend (Parte 4).
 */
import { resolve } from "node:path";
import type { OddsSnapshotRow } from "@pitchlab/spacetime";
import { loadRootEnvFiles } from "./env.js";
import {
  evaluateAndReportDataHealth,
  type RuntimeIncidentInput,
} from "./health/health-monitor.js";
import { buildPermittedActiveOddsAdapters } from "./odds/betfair-exchange.js";
import {
  buildOddsCadencePlan,
  type OddsRefreshWindowMode,
} from "./odds/cadence-scheduler.js";
import {
  loadQuotesLatestLedger,
  regenerateLiveMatchdaySnapshot,
} from "./odds/regenerate-live-snapshot.js";

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..");
const SNAPSHOTS_ROOT = resolve(ROOT_DIR, "data", "snapshots");
const QUOTES_LATEST_PATH = resolve(ROOT_DIR, "data", "odds_timeseries", "quotes_latest.json");

function parseCliFlags(argv: readonly string[]): {
  windowMode: OddsRefreshWindowMode;
  force: boolean;
  dryRun: boolean;
} {
  let windowMode: OddsRefreshWindowMode = "auto";
  let force = false;
  let dryRun = false;

  for (const arg of argv) {
    if (arg === "--force") force = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--window=")) {
      const val = arg.slice("--window=".length).trim();
      if (val === "auto" || val === "all" || val === "matchday" || val === "prekickoff") {
        windowMode = val;
      } else {
        throw new Error(`--window inválido (${val}); se esperaba auto|all|matchday|prekickoff.`);
      }
    }
  }

  return { windowMode, force, dryRun };
}

async function main(): Promise<void> {
  const startedAt = performance.now();
  loadRootEnvFiles(ROOT_DIR);
  const { windowMode, force, dryRun } = parseCliFlags(process.argv.slice(2));
  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const nowMs = Date.parse(nowIso);

  const existingLedger = loadQuotesLatestLedger(QUOTES_LATEST_PATH);
  const plan = buildOddsCadencePlan({
    snapshotsRoot: SNAPSHOTS_ROOT,
    existingTicks: existingLedger?.ticks ?? [],
    windowMode,
    force,
    nowMs,
  });

  console.log(
    `[odds:refresh] ${nowIso} · ventana=${windowMode} · ligas por refrescar=${plan.leaguesToFetch.length}/${plan.decisions.length}`,
  );
  for (const dec of plan.decisions) {
    console.log(
      `  - ${dec.league.padEnd(15)} [${dec.regime.padEnd(14)}] fetch=${dec.shouldFetch ? "SÍ" : "NO"} · ${dec.reason}`,
    );
  }

  const { adapters, skipped } = buildPermittedActiveOddsAdapters(process.env);
  for (const sk of skipped) {
    if (sk.status !== "blocked_pending_owner_decision") {
      console.log(`[odds:refresh] Fuente omitida (${sk.sourceId}): ${sk.reason}`);
    }
  }

  const runtimeIncidents: RuntimeIncidentInput[] = [];
  const incomingTicks: OddsSnapshotRow[] = [];

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
      "[odds:refresh] Sin credenciales activas (BZZOIRO_API_KEY / THE_ODDS_API_KEY / BETFAIR_*); se verifica caducidad de 72 h sobre el snapshot vigente.",
    );
  }

  const regen = regenerateLiveMatchdaySnapshot({
    rootDir: ROOT_DIR,
    incomingTicks,
    activeSources: adapters.map((a) => a.metadata.sourceId),
    nowIso,
    dryRun,
  });

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

  const durationMs = performance.now() - startedAt;
  const allAdaptersFailed =
    adapters.length > 0 &&
    plan.leaguesToFetch.length > 0 &&
    runtimeIncidents.filter((i) => i.kind === "source_failure").length === adapters.length;

  const wfStatus = !regen.ok || allAdaptersFailed
    ? "failed"
    : runtimeIncidents.length > 0
      ? "degraded"
      : adapters.length === 0
        ? "pending_credentials"
        : "ok";

  if (!dryRun) {
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

  if (!regen.ok || allAdaptersFailed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[odds:refresh] Error fatal:", err);
  process.exit(1);
});
