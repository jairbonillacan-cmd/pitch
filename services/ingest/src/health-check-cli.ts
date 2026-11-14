/**
 * Parte 4 · CLI de auditoría independiente de «Salud de datos» (`health:check`).
 *
 * Se puede ejecutar de forma autónoma o como paso `if: always()` al cierre de un workflow de
 * GitHub Actions para garantizar que incluso una caída abrupta del paso principal quede registrada
 * y notifique por Resend (sin repetir correos para fallas ya abiertas).
 */
import { resolve } from "node:path";
import type { DataWorkflowId } from "@pitchlab/contracts";
import { loadRootEnvFiles } from "./env.js";
import { evaluateAndReportDataHealth } from "./health/health-monitor.js";

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..");

function parseArgs(argv: readonly string[]): {
  workflowId?: DataWorkflowId;
  workflowOutcome?: string;
  durationMs?: number;
  dryRun: boolean;
} {
  let workflowId: DataWorkflowId | undefined;
  let workflowOutcome: string | undefined;
  let durationMs: number | undefined;
  let dryRun = false;

  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--workflow=")) {
      const val = arg.slice("--workflow=".length).trim();
      if (val === "odds-refresh" || val === "pre-mvp-snapshot") {
        workflowId = val;
      }
    } else if (arg.startsWith("--workflow-outcome=")) {
      workflowOutcome = arg.slice("--workflow-outcome=".length).trim();
    } else if (arg.startsWith("--duration-ms=")) {
      const parsed = Number(arg.slice("--duration-ms=".length));
      if (Number.isFinite(parsed) && parsed >= 0) durationMs = parsed;
    }
  }

  return { workflowId, workflowOutcome, durationMs, dryRun };
}

async function main(): Promise<void> {
  loadRootEnvFiles(ROOT_DIR);
  const { workflowId, workflowOutcome, durationMs, dryRun } = parseArgs(process.argv.slice(2));
  const nowIso = new Date().toISOString();

  const isUnexpectedWorkflowFailure =
    workflowId !== undefined &&
    workflowOutcome !== undefined &&
    workflowOutcome !== "success" &&
    workflowOutcome !== "skipped";

  const result = await evaluateAndReportDataHealth({
    rootDir: ROOT_DIR,
    nowIso,
    persistFiles: !dryRun,
    ...(isUnexpectedWorkflowFailure
      ? {
          workflowUpdate: {
            workflowId,
            status: "failed",
            runAtUtc: nowIso,
            durationMs: durationMs ?? 0,
            errorMessage: `El paso principal de '${workflowId}' terminó con estado '${workflowOutcome}' en GitHub Actions.`,
          },
        }
      : {}),
  });

  console.log(
    `[health:check] estado=${result.report.overallStatus} · incidencias=${result.report.activeIncidents.length} · nuevosAvisos=${result.newlyNotifiedIncidents.length} · correoEnviado=${result.emailSent}`,
  );
}

main().catch((err) => {
  console.error("[health:check] Error fatal:", err);
  process.exit(1);
});
