import { z } from "zod";
import { LeagueIdSchema, type LeagueId } from "./ids";

export const DATA_FRESHNESS_THRESHOLDS_HOURS = {
  calendario: {
    warningHours: 24,
    staleHours: 30,
    matchdayPendingResultHours: 12,
  },
  bajas: {
    warningHours: 24,
    staleHours: 36,
  },
  momios: {
    warningHours: 18,
    staleHours: 36,
    appHardExpireHours: 72,
  },
  alineaciones: {
    warningHours: null,
    staleHours: null,
  },
} as const;

export const DataHealthDataTypeSchema = z.enum([
  "calendario",
  "bajas",
  "momios",
  "alineaciones",
]);
export type DataHealthDataType = z.infer<typeof DataHealthDataTypeSchema>;

export const DataHealthCellStatusSchema = z.enum([
  "ok",
  "warning",
  "stale",
  "error",
  "disabled",
  "pending_source",
]);
export type DataHealthCellStatus = z.infer<typeof DataHealthCellStatusSchema>;

export const WorkflowIdSchema = z.enum(["odds-refresh", "pre-mvp-snapshot"]);
export type DataWorkflowId = z.infer<typeof WorkflowIdSchema>;

export const WorkflowRunStateSchema = z.enum([
  "ok",
  "degraded",
  "failed",
  "pending_credentials",
]);
export type DataWorkflowRunState = z.infer<typeof WorkflowRunStateSchema>;

export const DataHealthErrorInfoSchema = z.object({
  message: z.string().min(1),
  failingSinceUtc: z.string().min(10),
  source: z.string().optional(),
});
export type DataHealthErrorInfo = z.infer<typeof DataHealthErrorInfoSchema>;

export const DataHealthWorkflowStatusSchema = z.object({
  workflowId: WorkflowIdSchema,
  label: z.string().min(1),
  workflowFile: z.string().min(1),
  status: WorkflowRunStateSchema,
  lastRunAtUtc: z.string().nullable(),
  lastSuccessAtUtc: z.string().nullable(),
  durationMs: z.number().nonnegative().nullable(),
  cadenceLabel: z.string().min(1),
  lastError: DataHealthErrorInfoSchema.nullable(),
});
export type DataHealthWorkflowStatus = z.infer<typeof DataHealthWorkflowStatusSchema>;

export const LeagueDataTypeCellSchema = z.object({
  dataType: DataHealthDataTypeSchema,
  status: DataHealthCellStatusSchema,
  updatedAtUtc: z.string().nullable(),
  ageHours: z.number().nonnegative().nullable(),
  maxHours: z.number().positive().nullable(),
  sourceLabel: z.string().min(1),
  recordsCount: z.number().int().nonnegative(),
  note: z.string().optional(),
  lastError: DataHealthErrorInfoSchema.nullable(),
});
export type LeagueDataTypeCell = z.infer<typeof LeagueDataTypeCellSchema>;

export const LeagueDataHealthRowSchema = z.object({
  league: LeagueIdSchema,
  leagueLabel: z.string().min(1),
  cells: z.object({
    calendario: LeagueDataTypeCellSchema,
    bajas: LeagueDataTypeCellSchema,
    momios: LeagueDataTypeCellSchema,
    alineaciones: LeagueDataTypeCellSchema,
  }),
});
export type LeagueDataHealthRow = z.infer<typeof LeagueDataHealthRowSchema>;

export const DataIncidentKindSchema = z.enum([
  "workflow_failure",
  "source_failure",
  "validation_rejected",
  "stale_data",
]);
export type DataIncidentKind = z.infer<typeof DataIncidentKindSchema>;

export const DataHealthIncidentSchema = z.object({
  incidentKey: z.string().min(3),
  kind: DataIncidentKindSchema,
  severity: z.enum(["warning", "critical"]),
  targetLabel: z.string().min(1),
  league: LeagueIdSchema.optional(),
  dataType: DataHealthDataTypeSchema.optional(),
  workflowId: WorkflowIdSchema.optional(),
  message: z.string().min(1),
  failingSinceUtc: z.string().min(10),
  lastSeenAtUtc: z.string().min(10),
  emailedAtUtc: z.string().nullable(),
  occurrences: z.number().int().positive(),
});
export type DataHealthIncident = z.infer<typeof DataHealthIncidentSchema>;

export const DataHealthReportSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAtUtc: z.string().min(10),
  overallStatus: z.enum(["ok", "degraded", "critical"]),
  thresholdsHours: z.object({
    calendario: z.number().positive(),
    calendarioMatchday: z.number().positive(),
    bajas: z.number().positive(),
    momios: z.number().positive(),
    momiosHardExpire: z.number().positive(),
    alineaciones: z.null(),
  }),
  workflows: z.array(DataHealthWorkflowStatusSchema),
  leagues: z.array(LeagueDataHealthRowSchema),
  activeIncidents: z.array(DataHealthIncidentSchema),
});
export type DataHealthReport = z.infer<typeof DataHealthReportSchema>;

export const AlertLedgerStateSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAtUtc: z.string().min(10),
  openIncidents: z.record(z.string(), DataHealthIncidentSchema),
});
export type AlertLedgerState = z.infer<typeof AlertLedgerStateSchema>;

export function computeDataAgeHours(
  updatedAtIso: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!updatedAtIso) return null;
  const ts = Date.parse(updatedAtIso);
  if (!Number.isFinite(ts)) return null;
  const diffHours = Math.max(0, (nowMs - ts) / 3_600_000);
  return Math.round(diffHours * 10) / 10;
}

export function evaluateFreshnessStatus(params: {
  ageHours: number | null;
  warningHours: number | null;
  staleHours: number | null;
  disabled?: boolean;
  pendingSource?: boolean;
  hasError?: boolean;
}): DataHealthCellStatus {
  if (params.disabled) return "disabled";
  if (params.hasError) return "error";
  if (params.pendingSource) return "pending_source";
  if (params.ageHours === null || params.staleHours === null) return "stale";
  if (params.ageHours > params.staleHours) return "stale";
  if (params.warningHours !== null && params.ageHours > params.warningHours) {
    return "warning";
  }
  return "ok";
}

export interface DataHealthSummaryCounts {
  readonly okCells: number;
  readonly warningCells: number;
  readonly staleOrErrorCells: number;
  readonly disabledCells: number;
  readonly healthyLeagues: number;
  readonly totalLeagues: number;
}

export function summarizeDataHealthCells(
  leagues: readonly { league: LeagueId; cells: LeagueDataHealthRow["cells"] }[],
): DataHealthSummaryCounts {
  let okCells = 0;
  let warningCells = 0;
  let staleOrErrorCells = 0;
  let disabledCells = 0;
  let healthyLeagues = 0;

  for (const row of leagues) {
    const list = [
      row.cells.calendario,
      row.cells.bajas,
      row.cells.momios,
      row.cells.alineaciones,
    ];
    let rowHealthy = true;
    for (const c of list) {
      if (c.status === "disabled") {
        disabledCells += 1;
      } else if (c.status === "ok") {
        okCells += 1;
      } else if (c.status === "warning" || c.status === "pending_source") {
        warningCells += 1;
      } else {
        staleOrErrorCells += 1;
        rowHealthy = false;
      }
    }
    if (rowHealthy) healthyLeagues += 1;
  }

  return {
    okCells,
    warningCells,
    staleOrErrorCells,
    disabledCells,
    healthyLeagues,
    totalLeagues: leagues.length,
  };
}
