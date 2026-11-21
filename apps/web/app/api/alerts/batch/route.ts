import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSanitizedErrorPayload,
  getLeagueCapability,
  isSafePublicLabel,
} from "@pitchlab/contracts";
import {
  applyMarketAlertBatch,
  MAX_MARKET_ALERT_BATCH_OPS,
  MAX_MARKET_ALERTS_PER_USER,
  type MarketAlertBatchItemResult,
  type MarketAlertBatchOperation,
  type MarketAlertRow,
} from "@pitchlab/db/market-alerts";
import { withActivePaseMutation } from "../../../../src/server/api-guards";
import {
  AlertChannelSchema,
  AlertCooldownMinutesSchema,
  AlertDirectionSchema,
  AlertLeagueSchema,
  AlertMarketFamilySchema,
  AlertTriggerSchema,
} from "../../../../src/server/market-alerts-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AlertIdSchema = z.string().trim().regex(/^[a-zA-Z0-9._-]{3,80}$/);
const SafeBookmakerSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_-]{1,39}$/);

const BatchCreateDataSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    trigger: AlertTriggerSchema,
    league: AlertLeagueSchema.nullable().optional(),
    marketFamily: AlertMarketFamilySchema.nullable().optional(),
    selection: z.string().trim().min(1).max(160).nullable().optional(),
    thresholdEvPct: z.number().finite().min(-50).max(500).nullable().optional(),
    minDecimal: z.number().finite().gt(1).lte(1000).nullable().optional(),
    maxDecimal: z.number().finite().gt(1).lte(1000).nullable().optional(),
    direction: AlertDirectionSchema.nullable().optional(),
    bookmaker: SafeBookmakerSchema.nullable().optional(),
    cooldownMinutes: AlertCooldownMinutesSchema.optional(),
    channel: AlertChannelSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict();

const BatchUpdatePatchSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    trigger: AlertTriggerSchema.optional(),
    league: AlertLeagueSchema.nullable().optional(),
    marketFamily: AlertMarketFamilySchema.nullable().optional(),
    selection: z.string().trim().min(1).max(160).nullable().optional(),
    thresholdEvPct: z.number().finite().min(-50).max(500).nullable().optional(),
    minDecimal: z.number().finite().gt(1).lte(1000).nullable().optional(),
    maxDecimal: z.number().finite().gt(1).lte(1000).nullable().optional(),
    direction: AlertDirectionSchema.nullable().optional(),
    bookmaker: SafeBookmakerSchema.nullable().optional(),
    cooldownMinutes: AlertCooldownMinutesSchema.optional(),
    channel: AlertChannelSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict();

const BatchOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create"), data: BatchCreateDataSchema }).strict(),
  z.object({ op: z.literal("update"), id: AlertIdSchema, patch: BatchUpdatePatchSchema }).strict(),
  z.object({ op: z.literal("pause"), id: AlertIdSchema }).strict(),
  z.object({ op: z.literal("resume"), id: AlertIdSchema }).strict(),
  z.object({ op: z.literal("delete"), id: AlertIdSchema }).strict(),
]);

const BatchBodySchema = z
  .object({
    operations: z.array(BatchOperationSchema).min(1).max(MAX_MARKET_ALERT_BATCH_OPS),
  })
  .strict();

function errorJson(code: string, message: string, status: number): NextResponse {
  const payload = createSanitizedErrorPayload(code, message);
  return NextResponse.json(
    { ok: false, error: payload.message, code: payload.code },
    { status },
  );
}

function serializeAlert(row: MarketAlertRow) {
  return {
    id: row.id,
    name: row.name,
    trigger: row.trigger,
    league: row.league,
    marketFamily: row.marketFamily,
    selection: row.selection,
    thresholdEvPct: row.thresholdEvPct,
    minDecimal: row.minDecimal,
    maxDecimal: row.maxDecimal,
    direction: row.direction,
    bookmaker: row.bookmaker,
    cooldownMinutes: row.cooldownMinutes,
    channel: row.channel,
    active: row.active,
    lastFiredAtIso: row.lastFiredAt ? row.lastFiredAt.toISOString() : null,
    lastFiredHash: row.lastFiredHash,
    firedCount: row.firedCount,
    createdAtIso: row.createdAt.toISOString(),
    updatedAtIso: row.updatedAt.toISOString(),
  };
}

function serializeBatchItem(item: MarketAlertBatchItemResult) {
  if (item.op === "delete") {
    return { op: item.op, deletedId: item.deletedId };
  }
  return { op: item.op, alert: serializeAlert(item.alert) };
}

function validateOperationSemantics(op: MarketAlertBatchOperation): string | null {
  const fields = op.op === "create" ? op.data : op.op === "update" ? op.patch : null;
  if (!fields) return null;
  if (fields.name !== undefined && !isSafePublicLabel(fields.name)) {
    return "El nombre de la alerta contiene texto no permitido.";
  }
  if (fields.selection && !isSafePublicLabel(fields.selection)) {
    return "La selección contiene texto no permitido.";
  }
  if (fields.bookmaker && !isSafePublicLabel(fields.bookmaker)) {
    return "La casa de apuestas indicada no es válida.";
  }
  if (
    fields.minDecimal !== undefined &&
    fields.minDecimal !== null &&
    fields.maxDecimal !== undefined &&
    fields.maxDecimal !== null &&
    fields.minDecimal > fields.maxDecimal
  ) {
    return "El momio mínimo no puede ser mayor que el máximo.";
  }
  if (fields.league && fields.marketFamily) {
    const cap = getLeagueCapability(fields.league);
    if (!cap || !cap.supportedMarketFamilies.some((fam) => fam === fields.marketFamily)) {
      return "La familia de mercado no está disponible para la liga seleccionada.";
    }
  }
  return null;
}

export const POST = withActivePaseMutation(
  {
    bucket: "alerts-batch",
    limit: 20,
    windowMs: 60_000,
  },
  async ({ request, user }) => {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch (err) {
      void err;
      return errorJson("INVALID_JSON", "Cuerpo JSON inválido.", 400);
    }

    const parsed = BatchBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return errorJson(
        "INVALID_ALERT_BATCH",
        `Envía entre 1 y ${MAX_MARKET_ALERT_BATCH_OPS} operaciones válidas de alertas.`,
        400,
      );
    }

    for (const op of parsed.data.operations) {
      const semanticError = validateOperationSemantics(op);
      if (semanticError) {
        return errorJson("INVALID_ALERT_BATCH", semanticError, 400);
      }
    }

    const result = await applyMarketAlertBatch(user.db, user.userId, parsed.data.operations);
    if (!result.ok) {
      if (result.reason === "not_found") {
        return errorJson("ALERT_NOT_FOUND", "Una o más alertas del lote no existen.", 404);
      }
      if (result.reason === "limit_exceeded") {
        return errorJson(
          "ALERT_LIMIT_EXCEEDED",
          `El lote supera el límite de ${MAX_MARKET_ALERTS_PER_USER} alertas activas.`,
          409,
        );
      }
      return errorJson(
        "INVALID_ALERT_BATCH",
        `El lote debe contener entre 1 y ${MAX_MARKET_ALERT_BATCH_OPS} operaciones válidas.`,
        400,
      );
    }

    return NextResponse.json({
      ok: true,
      applied: result.applied,
      results: result.results.map(serializeBatchItem),
    });
  },
);
