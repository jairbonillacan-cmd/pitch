import { randomUUID } from "node:crypto";
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "./billing";
import { withDbTransaction, type DbExecutor } from "./client";
import { marketAlerts, users, type MarketAlertRow, type NewMarketAlertRow } from "./schema";

export type { MarketAlertRow, NewMarketAlertRow };

export const MAX_MARKET_ALERTS_PER_USER = 40;
export const MAX_TOTAL_MARKET_ALERTS_PER_USER = 80;
export const MAX_MARKET_ALERTS_LIST_LIMIT = 40;
export const MAX_MARKET_ALERT_BATCH_OPS = 10;
export const MIN_MARKET_ALERT_COOLDOWN_MINUTES = 5;
export const MAX_MARKET_ALERT_COOLDOWN_MINUTES = 1440;
export const DEFAULT_MARKET_ALERT_COOLDOWN_MINUTES = 60;

export const MARKET_ALERT_TRIGGERS = [
  "market_opened",
  "sharp_steam",
  "stale_line_ev",
  "lineup_confirmed",
  "schedule_change",
] as const;

export const MARKET_ALERT_DIRECTIONS = [
  "any",
  "over",
  "under",
  "home",
  "away",
  "draw",
] as const;

export const MARKET_ALERT_CHANNELS = ["push", "in_app", "both"] as const;

export type MarketAlertTrigger = (typeof MARKET_ALERT_TRIGGERS)[number];
export type MarketAlertDirection = (typeof MARKET_ALERT_DIRECTIONS)[number];
export type MarketAlertChannel = (typeof MARKET_ALERT_CHANNELS)[number];

const TRIGGER_SET: ReadonlySet<string> = new Set(MARKET_ALERT_TRIGGERS);
const DIRECTION_SET: ReadonlySet<string> = new Set(MARKET_ALERT_DIRECTIONS);
const CHANNEL_SET: ReadonlySet<string> = new Set(MARKET_ALERT_CHANNELS);
const ALERT_ID_RE = /^[a-zA-Z0-9._-]{3,80}$/;

const MARKET_ALERT_COLUMNS = {
  id: marketAlerts.id,
  userId: marketAlerts.userId,
  name: marketAlerts.name,
  trigger: marketAlerts.trigger,
  league: marketAlerts.league,
  marketFamily: marketAlerts.marketFamily,
  selection: marketAlerts.selection,
  thresholdEvPct: marketAlerts.thresholdEvPct,
  minDecimal: marketAlerts.minDecimal,
  maxDecimal: marketAlerts.maxDecimal,
  direction: marketAlerts.direction,
  bookmaker: marketAlerts.bookmaker,
  cooldownMinutes: marketAlerts.cooldownMinutes,
  channel: marketAlerts.channel,
  active: marketAlerts.active,
  lastFiredAt: marketAlerts.lastFiredAt,
  lastFiredHash: marketAlerts.lastFiredHash,
  firedCount: marketAlerts.firedCount,
  createdAt: marketAlerts.createdAt,
  updatedAt: marketAlerts.updatedAt,
};

export interface ListMarketAlertsOptions {
  readonly activeOnly?: boolean;
  readonly trigger?: MarketAlertTrigger;
  readonly limit?: number;
}

export interface CreateMarketAlertInput {
  readonly id?: string;
  readonly name: string;
  readonly trigger: MarketAlertTrigger;
  readonly league?: string | null;
  readonly marketFamily?: string | null;
  readonly selection?: string | null;
  readonly thresholdEvPct?: number | null;
  readonly minDecimal?: number | null;
  readonly maxDecimal?: number | null;
  readonly direction?: MarketAlertDirection | null;
  readonly bookmaker?: string | null;
  readonly cooldownMinutes?: number;
  readonly channel?: MarketAlertChannel;
  readonly active?: boolean;
}

export interface UpdateMarketAlertInput {
  readonly name?: string;
  readonly trigger?: MarketAlertTrigger;
  readonly league?: string | null;
  readonly marketFamily?: string | null;
  readonly selection?: string | null;
  readonly thresholdEvPct?: number | null;
  readonly minDecimal?: number | null;
  readonly maxDecimal?: number | null;
  readonly direction?: MarketAlertDirection | null;
  readonly bookmaker?: string | null;
  readonly cooldownMinutes?: number;
  readonly channel?: MarketAlertChannel;
  readonly active?: boolean;
}

export type MarketAlertBatchOperation =
  | { readonly op: "create"; readonly data: CreateMarketAlertInput }
  | { readonly op: "update"; readonly id: string; readonly patch: UpdateMarketAlertInput }
  | { readonly op: "pause"; readonly id: string }
  | { readonly op: "resume"; readonly id: string }
  | { readonly op: "delete"; readonly id: string };

export type CreateMarketAlertResult =
  | { readonly ok: true; readonly alert: MarketAlertRow }
  | { readonly ok: false; readonly reason: "invalid_input" | "limit_exceeded" };

export type UpdateMarketAlertResult =
  | { readonly ok: true; readonly alert: MarketAlertRow }
  | { readonly ok: false; readonly reason: "not_found" | "invalid_input" | "limit_exceeded" };

export type DeleteMarketAlertResult =
  | { readonly ok: true; readonly deletedId: string }
  | { readonly ok: false; readonly reason: "not_found" };

export type MarketAlertBatchItemResult =
  | { readonly op: "create" | "update" | "pause" | "resume"; readonly alert: MarketAlertRow }
  | { readonly op: "delete"; readonly deletedId: string };

export type ApplyMarketAlertBatchResult =
  | {
      readonly ok: true;
      readonly applied: number;
      readonly results: readonly MarketAlertBatchItemResult[];
    }
  | {
      readonly ok: false;
      readonly reason:
        | "batch_size_invalid"
        | "batch_limit_exceeded"
        | "invalid_input"
        | "not_found"
        | "limit_exceeded";
      readonly failedIndex?: number;
    };

export interface RecordMarketAlertFiredInput {
  readonly alertId: string;
  readonly userId?: string;
  readonly eventHash: string;
  readonly now?: Date;
}

export type MarketAlertMergedValidator = (merged: {
  readonly trigger: MarketAlertTrigger;
  readonly league: string | null;
  readonly marketFamily: string | null;
}) => boolean;

export interface MarketAlertMutationOptions {
  readonly validateMerged?: MarketAlertMergedValidator;
}

export type RecordMarketAlertFiredResult =
  | { readonly ok: true; readonly alert: MarketAlertRow }
  | {
      readonly ok: false;
      readonly reason: "not_found" | "inactive" | "invalid_hash" | "duplicate_hash" | "cooldown_active";
      readonly nextEligibleAtIso?: string;
    };

class BatchRollbackError extends Error {
  readonly reason: "invalid_input" | "not_found" | "limit_exceeded";
  readonly failedIndex: number;

  constructor(reason: "invalid_input" | "not_found" | "limit_exceeded", failedIndex: number) {
    super(reason);
    this.name = "BatchRollbackError";
    this.reason = reason;
    this.failedIndex = failedIndex;
  }
}

function clampListLimit(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return MAX_MARKET_ALERTS_LIST_LIMIT;
  }
  return Math.max(1, Math.min(MAX_MARKET_ALERTS_LIST_LIMIT, Math.trunc(raw)));
}

function parseCountResult(raw: unknown): number {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? Math.trunc(raw) : 0;
  }
  if (typeof raw === "string") {
    const parsed = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }
  return 0;
}

function sanitizeOptionalText(value: string | null | undefined, maxLen: number): string | null {
  if (value === null || value === undefined) return null;
  let cleaned = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127) continue;
    cleaned += ch;
  }
  const trimmed = cleaned.trim().slice(0, maxLen);
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeAlertName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = sanitizeOptionalText(value, 120);
  if (!cleaned || cleaned.length < 2) return null;
  return cleaned;
}

function isValidTrigger(value: unknown): value is MarketAlertTrigger {
  return typeof value === "string" && TRIGGER_SET.has(value);
}

function isValidDirection(value: unknown): value is MarketAlertDirection {
  return typeof value === "string" && DIRECTION_SET.has(value);
}

function isValidChannel(value: unknown): value is MarketAlertChannel {
  return typeof value === "string" && CHANNEL_SET.has(value);
}

function parseOptionalFiniteInRange(
  value: number | null | undefined,
  min: number,
  max: number,
  strictMin: boolean,
): { readonly ok: true; readonly value: number | null } | { readonly ok: false } {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false };
  }
  const passesMin = strictMin ? value > min : value >= min;
  if (!passesMin || value > max) {
    return { ok: false };
  }
  return { ok: true, value };
}

function parseCooldownMinutes(raw: number | undefined): number | null {
  if (raw === undefined) return DEFAULT_MARKET_ALERT_COOLDOWN_MINUTES;
  if (typeof raw !== "number" || !Number.isFinite(raw) || !Number.isInteger(raw)) {
    return null;
  }
  if (raw < MIN_MARKET_ALERT_COOLDOWN_MINUTES || raw > MAX_MARKET_ALERT_COOLDOWN_MINUTES) {
    return null;
  }
  return raw;
}

function generateAlertId(): string {
  return `alert_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export async function countActiveMarketAlertsForUser(
  db: DbExecutor,
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(marketAlerts)
    .where(and(eq(marketAlerts.userId, userId), eq(marketAlerts.active, true)));
  return parseCountResult(row?.total);
}

export async function countTotalMarketAlertsForUser(
  db: DbExecutor,
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(marketAlerts)
    .where(eq(marketAlerts.userId, userId));
  return parseCountResult(row?.total);
}

async function lockUserMarketAlertsInTx(tx: Db, userId: string): Promise<void> {
  await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for("update");
}

export async function listMarketAlertsForUser(
  db: DbExecutor,
  userId: string,
  opts: ListMarketAlertsOptions = {},
): Promise<MarketAlertRow[]> {
  const limit = clampListLimit(opts.limit);
  const filters = [eq(marketAlerts.userId, userId)];
  if (opts.activeOnly === true) {
    filters.push(eq(marketAlerts.active, true));
  }
  if (opts.trigger !== undefined && isValidTrigger(opts.trigger)) {
    filters.push(eq(marketAlerts.trigger, opts.trigger));
  }
  return db
    .select(MARKET_ALERT_COLUMNS)
    .from(marketAlerts)
    .where(and(...filters))
    .orderBy(desc(marketAlerts.createdAt), desc(marketAlerts.id))
    .limit(limit);
}

export async function getMarketAlertForUser(
  db: DbExecutor,
  userId: string,
  alertId: string,
): Promise<MarketAlertRow | null> {
  const cleanId = alertId.trim();
  if (!ALERT_ID_RE.test(cleanId)) return null;
  const [row] = await db
    .select(MARKET_ALERT_COLUMNS)
    .from(marketAlerts)
    .where(and(eq(marketAlerts.id, cleanId), eq(marketAlerts.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listActiveMarketAlertsByTrigger(
  db: DbExecutor,
  trigger: MarketAlertTrigger,
  limit = MAX_MARKET_ALERTS_LIST_LIMIT,
): Promise<MarketAlertRow[]> {
  if (!isValidTrigger(trigger)) return [];
  const safeLimit = clampListLimit(limit);
  return db
    .select(MARKET_ALERT_COLUMNS)
    .from(marketAlerts)
    .where(and(eq(marketAlerts.trigger, trigger), eq(marketAlerts.active, true)))
    .orderBy(desc(marketAlerts.createdAt), desc(marketAlerts.id))
    .limit(safeLimit);
}

async function createMarketAlertInTx(
  tx: Db,
  userId: string,
  input: CreateMarketAlertInput,
  now: Date,
  opts?: MarketAlertMutationOptions,
): Promise<CreateMarketAlertResult> {
  const name = sanitizeAlertName(input.name);
  if (!name || !isValidTrigger(input.trigger)) {
    return { ok: false, reason: "invalid_input" };
  }
  const direction =
    input.direction === undefined || input.direction === null ? null : input.direction;
  if (direction !== null && !isValidDirection(direction)) {
    return { ok: false, reason: "invalid_input" };
  }
  const channel = input.channel ?? "push";
  if (!isValidChannel(channel)) {
    return { ok: false, reason: "invalid_input" };
  }
  const cooldownMinutes = parseCooldownMinutes(input.cooldownMinutes);
  if (cooldownMinutes === null) {
    return { ok: false, reason: "invalid_input" };
  }
  const evPct = parseOptionalFiniteInRange(input.thresholdEvPct, -50, 500, false);
  const minDec = parseOptionalFiniteInRange(input.minDecimal, 1, 1000, true);
  const maxDec = parseOptionalFiniteInRange(input.maxDecimal, 1, 1000, true);
  if (!evPct.ok || !minDec.ok || !maxDec.ok) {
    return { ok: false, reason: "invalid_input" };
  }
  if (minDec.value !== null && maxDec.value !== null && minDec.value > maxDec.value) {
    return { ok: false, reason: "invalid_input" };
  }

  let alertId = generateAlertId();
  if (input.id !== undefined) {
    const candidateId = input.id.trim();
    if (!ALERT_ID_RE.test(candidateId)) {
      return { ok: false, reason: "invalid_input" };
    }
    alertId = candidateId;
  }

  const league = sanitizeOptionalText(input.league, 64);
  const marketFamily = sanitizeOptionalText(input.marketFamily, 64);
  if (
    opts?.validateMerged &&
    !opts.validateMerged({
      trigger: input.trigger,
      league,
      marketFamily,
    })
  ) {
    return { ok: false, reason: "invalid_input" };
  }

  await lockUserMarketAlertsInTx(tx, userId);

  const totalCount = await countTotalMarketAlertsForUser(tx, userId);
  if (totalCount >= MAX_TOTAL_MARKET_ALERTS_PER_USER) {
    return { ok: false, reason: "limit_exceeded" };
  }

  const active = input.active !== false;
  if (active) {
    const activeCount = await countActiveMarketAlertsForUser(tx, userId);
    if (activeCount >= MAX_MARKET_ALERTS_PER_USER) {
      return { ok: false, reason: "limit_exceeded" };
    }
  }

  const [created] = await tx
    .insert(marketAlerts)
    .values({
      id: alertId,
      userId,
      name,
      trigger: input.trigger,
      league,
      marketFamily,
      selection: sanitizeOptionalText(input.selection, 160),
      thresholdEvPct: evPct.value,
      minDecimal: minDec.value,
      maxDecimal: maxDec.value,
      direction,
      bookmaker: sanitizeOptionalText(input.bookmaker, 48)?.toLowerCase() ?? null,
      cooldownMinutes,
      channel,
      active,
      createdAt: now,
      updatedAt: now,
    })
    .returning(MARKET_ALERT_COLUMNS);

  if (!created) {
    return { ok: false, reason: "invalid_input" };
  }
  return { ok: true, alert: created };
}

async function updateMarketAlertInTx(
  tx: Db,
  userId: string,
  alertId: string,
  patch: UpdateMarketAlertInput,
  now: Date,
  opts?: MarketAlertMutationOptions,
): Promise<UpdateMarketAlertResult> {
  const cleanId = alertId.trim();
  if (!ALERT_ID_RE.test(cleanId)) {
    return { ok: false, reason: "not_found" };
  }

  await lockUserMarketAlertsInTx(tx, userId);

  const existing = await getMarketAlertForUser(tx, userId, cleanId);
  if (!existing) {
    return { ok: false, reason: "not_found" };
  }

  const nextName = patch.name !== undefined ? sanitizeAlertName(patch.name) : existing.name;
  if (!nextName) {
    return { ok: false, reason: "invalid_input" };
  }
  const nextTrigger = patch.trigger !== undefined ? patch.trigger : existing.trigger;
  if (!isValidTrigger(nextTrigger)) {
    return { ok: false, reason: "invalid_input" };
  }
  const nextDirection =
    patch.direction !== undefined ? patch.direction : existing.direction;
  if (nextDirection !== null && !isValidDirection(nextDirection)) {
    return { ok: false, reason: "invalid_input" };
  }
  const nextChannel = patch.channel !== undefined ? patch.channel : existing.channel;
  if (!isValidChannel(nextChannel)) {
    return { ok: false, reason: "invalid_input" };
  }
  const nextCooldown =
    patch.cooldownMinutes !== undefined
      ? parseCooldownMinutes(patch.cooldownMinutes)
      : existing.cooldownMinutes;
  if (nextCooldown === null) {
    return { ok: false, reason: "invalid_input" };
  }

  const nextEv =
    patch.thresholdEvPct !== undefined
      ? parseOptionalFiniteInRange(patch.thresholdEvPct, -50, 500, false)
      : { ok: true as const, value: existing.thresholdEvPct };
  const nextMinDec =
    patch.minDecimal !== undefined
      ? parseOptionalFiniteInRange(patch.minDecimal, 1, 1000, true)
      : { ok: true as const, value: existing.minDecimal };
  const nextMaxDec =
    patch.maxDecimal !== undefined
      ? parseOptionalFiniteInRange(patch.maxDecimal, 1, 1000, true)
      : { ok: true as const, value: existing.maxDecimal };
  if (!nextEv.ok || !nextMinDec.ok || !nextMaxDec.ok) {
    return { ok: false, reason: "invalid_input" };
  }
  if (
    nextMinDec.value !== null &&
    nextMaxDec.value !== null &&
    nextMinDec.value > nextMaxDec.value
  ) {
    return { ok: false, reason: "invalid_input" };
  }

  const nextLeague =
    patch.league !== undefined ? sanitizeOptionalText(patch.league, 64) : existing.league;
  const nextMarketFamily =
    patch.marketFamily !== undefined
      ? sanitizeOptionalText(patch.marketFamily, 64)
      : existing.marketFamily;

  if (
    opts?.validateMerged &&
    !opts.validateMerged({
      trigger: nextTrigger,
      league: nextLeague,
      marketFamily: nextMarketFamily,
    })
  ) {
    return { ok: false, reason: "invalid_input" };
  }

  const nextActive = patch.active !== undefined ? patch.active : existing.active;
  if (!existing.active && nextActive) {
    const activeCount = await countActiveMarketAlertsForUser(tx, userId);
    if (activeCount >= MAX_MARKET_ALERTS_PER_USER) {
      return { ok: false, reason: "limit_exceeded" };
    }
  }

  const nextSelection =
    patch.selection !== undefined
      ? sanitizeOptionalText(patch.selection, 160)
      : existing.selection;
  const nextBookmaker =
    patch.bookmaker !== undefined
      ? (sanitizeOptionalText(patch.bookmaker, 48)?.toLowerCase() ?? null)
      : existing.bookmaker;

  const [updated] = await tx
    .update(marketAlerts)
    .set({
      name: nextName,
      trigger: nextTrigger,
      league: nextLeague,
      marketFamily: nextMarketFamily,
      selection: nextSelection,
      thresholdEvPct: nextEv.value,
      minDecimal: nextMinDec.value,
      maxDecimal: nextMaxDec.value,
      direction: nextDirection,
      bookmaker: nextBookmaker,
      cooldownMinutes: nextCooldown,
      channel: nextChannel,
      active: nextActive,
      updatedAt: now,
    })
    .where(and(eq(marketAlerts.id, cleanId), eq(marketAlerts.userId, userId)))
    .returning(MARKET_ALERT_COLUMNS);

  if (!updated) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: true, alert: updated };
}

async function deleteMarketAlertInTx(
  tx: DbExecutor,
  userId: string,
  alertId: string,
): Promise<DeleteMarketAlertResult> {
  const cleanId = alertId.trim();
  if (!ALERT_ID_RE.test(cleanId)) {
    return { ok: false, reason: "not_found" };
  }
  const deleted = await tx
    .delete(marketAlerts)
    .where(and(eq(marketAlerts.id, cleanId), eq(marketAlerts.userId, userId)))
    .returning({ id: marketAlerts.id });
  const row = deleted[0];
  if (!row) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: true, deletedId: row.id };
}

export async function createMarketAlert(
  db: Db,
  userId: string,
  input: CreateMarketAlertInput,
  now = new Date(),
  opts?: MarketAlertMutationOptions,
): Promise<CreateMarketAlertResult> {
  return withDbTransaction(db, (tx) => createMarketAlertInTx(tx, userId, input, now, opts));
}

export async function updateMarketAlertForUser(
  db: Db,
  userId: string,
  alertId: string,
  patch: UpdateMarketAlertInput,
  now = new Date(),
  opts?: MarketAlertMutationOptions,
): Promise<UpdateMarketAlertResult> {
  return withDbTransaction(db, (tx) => updateMarketAlertInTx(tx, userId, alertId, patch, now, opts));
}

export async function deleteMarketAlertForUser(
  db: DbExecutor,
  userId: string,
  alertId: string,
): Promise<DeleteMarketAlertResult> {
  return deleteMarketAlertInTx(db, userId, alertId);
}

export async function applyMarketAlertBatch(
  db: Db,
  userId: string,
  operations: readonly MarketAlertBatchOperation[],
  now = new Date(),
  opts?: MarketAlertMutationOptions,
): Promise<ApplyMarketAlertBatchResult> {
  if (!Array.isArray(operations) || operations.length === 0) {
    return { ok: false, reason: "batch_size_invalid" };
  }
  if (operations.length > MAX_MARKET_ALERT_BATCH_OPS) {
    return { ok: false, reason: "batch_limit_exceeded" };
  }

  try {
    const results = await withDbTransaction(db, async (tx) => {
      await lockUserMarketAlertsInTx(tx, userId);
      const applied: MarketAlertBatchItemResult[] = [];
      for (let idx = 0; idx < operations.length; idx += 1) {
        const operation = operations[idx];
        if (!operation) {
          throw new BatchRollbackError("invalid_input", idx);
        }
        if (operation.op === "create") {
          const res = await createMarketAlertInTx(tx, userId, operation.data, now, opts);
          if (!res.ok) {
            throw new BatchRollbackError(res.reason, idx);
          }
          applied.push({ op: "create", alert: res.alert });
        } else if (operation.op === "update") {
          const res = await updateMarketAlertInTx(
            tx,
            userId,
            operation.id,
            operation.patch,
            now,
            opts,
          );
          if (!res.ok) {
            throw new BatchRollbackError(res.reason, idx);
          }
          applied.push({ op: "update", alert: res.alert });
        } else if (operation.op === "pause") {
          const res = await updateMarketAlertInTx(tx, userId, operation.id, { active: false }, now);
          if (!res.ok) {
            throw new BatchRollbackError(res.reason, idx);
          }
          applied.push({ op: "pause", alert: res.alert });
        } else if (operation.op === "resume") {
          const res = await updateMarketAlertInTx(tx, userId, operation.id, { active: true }, now);
          if (!res.ok) {
            throw new BatchRollbackError(res.reason, idx);
          }
          applied.push({ op: "resume", alert: res.alert });
        } else if (operation.op === "delete") {
          const res = await deleteMarketAlertInTx(tx, userId, operation.id);
          if (!res.ok) {
            throw new BatchRollbackError(res.reason, idx);
          }
          applied.push({ op: "delete", deletedId: res.deletedId });
        } else {
          throw new BatchRollbackError("invalid_input", idx);
        }
      }
      return applied;
    });
    return { ok: true, applied: results.length, results };
  } catch (err) {
    if (err instanceof BatchRollbackError) {
      return { ok: false, reason: err.reason, failedIndex: err.failedIndex };
    }
    throw err;
  }
}

export async function recordMarketAlertFired(
  db: Db,
  params: RecordMarketAlertFiredInput,
): Promise<RecordMarketAlertFiredResult> {
  const cleanId = params.alertId.trim();
  const cleanHash = params.eventHash.trim().slice(0, 128);
  if (!ALERT_ID_RE.test(cleanId)) {
    return { ok: false, reason: "not_found" };
  }
  if (cleanHash.length < 4) {
    return { ok: false, reason: "invalid_hash" };
  }
  const now = params.now ?? new Date();

  return withDbTransaction(db, async (tx): Promise<RecordMarketAlertFiredResult> => {
    const scope = params.userId
      ? and(eq(marketAlerts.id, cleanId), eq(marketAlerts.userId, params.userId))
      : eq(marketAlerts.id, cleanId);
    const [existing] = await tx
      .select(MARKET_ALERT_COLUMNS)
      .from(marketAlerts)
      .where(scope)
      .for("update");

    if (!existing) {
      return { ok: false, reason: "not_found" } as const;
    }
    if (!existing.active) {
      return { ok: false, reason: "inactive" } as const;
    }
    if (existing.lastFiredHash && existing.lastFiredHash === cleanHash) {
      return { ok: false, reason: "duplicate_hash" } as const;
    }
    if (existing.lastFiredAt) {
      const cooldownMs = existing.cooldownMinutes * 60_000;
      const nextEligibleMs = existing.lastFiredAt.getTime() + cooldownMs;
      if (now.getTime() < nextEligibleMs) {
        return {
          ok: false,
          reason: "cooldown_active",
          nextEligibleAtIso: new Date(nextEligibleMs).toISOString(),
        } as const;
      }
    }

    const [updated] = await tx
      .update(marketAlerts)
      .set({
        lastFiredAt: now,
        lastFiredHash: cleanHash,
        firedCount: sql`${marketAlerts.firedCount} + 1`,
        updatedAt: now,
      })
      .where(scope)
      .returning(MARKET_ALERT_COLUMNS);

    if (!updated) {
      return { ok: false, reason: "not_found" } as const;
    }
    return { ok: true, alert: updated } as const;
  });
}
