import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSanitizedErrorPayload,
  getLeagueCapability,
  isSafePublicLabel,
  parseStrictFiniteNumber,
} from "@pitchlab/contracts";
import {
  createMarketAlert,
  deleteMarketAlertForUser,
  listMarketAlertsForUser,
  MAX_MARKET_ALERTS_LIST_LIMIT,
  MAX_MARKET_ALERTS_PER_USER,
  updateMarketAlertForUser,
  type MarketAlertRow,
  type MarketAlertTrigger,
} from "@pitchlab/db/market-alerts";
import { withActivePaseMutation, withSessionRead } from "../../../src/server/api-guards";
import {
  ALERT_TRIGGERS,
  AlertChannelSchema,
  AlertCooldownMinutesSchema,
  AlertDirectionSchema,
  AlertLeagueSchema,
  AlertMarketFamilySchema,
  AlertTriggerSchema,
} from "../../../src/server/market-alerts-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AlertIdSchema = z.string().trim().regex(/^[a-zA-Z0-9._-]{3,80}$/);
const SafeBookmakerSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_-]{1,39}$/);

const CreateAlertBodySchema = z
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

const UpdateAlertBodySchema = z
  .object({
    id: AlertIdSchema,
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

const DeleteAlertBodySchema = z
  .object({
    id: AlertIdSchema,
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

function parseBoundedLimit(raw: string | null): number {
  if (raw === null) return MAX_MARKET_ALERTS_LIST_LIMIT;
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null) return MAX_MARKET_ALERTS_LIST_LIMIT;
  return Math.max(1, Math.min(MAX_MARKET_ALERTS_LIST_LIMIT, Math.trunc(parsed)));
}

function parseOptionalTriggerParam(raw: string | null): MarketAlertTrigger | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return ALERT_TRIGGERS.find((item) => item === trimmed);
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (err) {
    void err;
    return null;
  }
}

function validateAlertSemantics(input: {
  readonly name?: string;
  readonly selection?: string | null;
  readonly bookmaker?: string | null;
  readonly league?: string | null;
  readonly marketFamily?: string | null;
  readonly minDecimal?: number | null;
  readonly maxDecimal?: number | null;
}): string | null {
  if (input.name !== undefined && !isSafePublicLabel(input.name)) {
    return "El nombre de la alerta contiene texto no permitido.";
  }
  if (input.selection && !isSafePublicLabel(input.selection)) {
    return "La selección contiene texto no permitido.";
  }
  if (input.bookmaker && !isSafePublicLabel(input.bookmaker)) {
    return "La casa de apuestas indicada no es válida.";
  }
  if (
    input.minDecimal !== undefined &&
    input.minDecimal !== null &&
    input.maxDecimal !== undefined &&
    input.maxDecimal !== null &&
    input.minDecimal > input.maxDecimal
  ) {
    return "El momio mínimo no puede ser mayor que el momio máximo.";
  }
  if (input.league && input.marketFamily) {
    const cap = getLeagueCapability(input.league);
    if (!cap || !cap.supportedMarketFamilies.some((fam) => fam === input.marketFamily)) {
      return "La familia de mercado no está disponible para la liga seleccionada.";
    }
  }
  return null;
}

export const GET = withSessionRead(
  {
    bucket: "alerts-read",
    allowBeta: false,
    allowBetaPin: false,
    limit: 60,
    windowMs: 60_000,
    cacheControl: "private, no-store",
  },
  async ({ request, user }) => {
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("activeOnly") === "true";
    const triggerParam = url.searchParams.get("trigger");
    const trigger = parseOptionalTriggerParam(triggerParam);
    if (triggerParam !== null && trigger === undefined) {
      return errorJson("INVALID_ALERT_TRIGGER", "Tipo de disparador no válido.", 400);
    }
    const limit = parseBoundedLimit(url.searchParams.get("limit"));
    const alerts = await listMarketAlertsForUser(user.db, user.userId, {
      activeOnly,
      trigger,
      limit,
    });
    return NextResponse.json({
      ok: true,
      alerts: alerts.map(serializeAlert),
      maxActiveAlerts: MAX_MARKET_ALERTS_PER_USER,
    });
  },
);

export const POST = withActivePaseMutation(
  {
    bucket: "alerts-create",
    limit: 30,
    windowMs: 60_000,
  },
  async ({ request, user }) => {
    const rawBody = await readJsonBody(request);
    const parsed = CreateAlertBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return errorJson("INVALID_ALERT_PAYLOAD", "Parámetros de alerta inválidos.", 400);
    }
    const semanticError = validateAlertSemantics(parsed.data);
    if (semanticError) {
      return errorJson("INVALID_ALERT_PAYLOAD", semanticError, 400);
    }
    const result = await createMarketAlert(user.db, user.userId, parsed.data);
    if (!result.ok) {
      if (result.reason === "limit_exceeded") {
        return errorJson(
          "ALERT_LIMIT_EXCEEDED",
          `Alcanzaste el límite máximo de ${MAX_MARKET_ALERTS_PER_USER} alertas activas.`,
          409,
        );
      }
      return errorJson("INVALID_ALERT_PAYLOAD", "No se pudo crear la alerta.", 400);
    }
    return NextResponse.json(
      { ok: true, alert: serializeAlert(result.alert) },
      { status: 201 },
    );
  },
);

export const PATCH = withActivePaseMutation(
  {
    bucket: "alerts-update",
    limit: 40,
    windowMs: 60_000,
  },
  async ({ request, user }) => {
    const rawBody = await readJsonBody(request);
    const parsed = UpdateAlertBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return errorJson("INVALID_ALERT_PATCH", "Cambios de alerta inválidos.", 400);
    }
    const semanticError = validateAlertSemantics(parsed.data);
    if (semanticError) {
      return errorJson("INVALID_ALERT_PATCH", semanticError, 400);
    }
    const { id, ...patch } = parsed.data;
    const result = await updateMarketAlertForUser(user.db, user.userId, id, patch);
    if (!result.ok) {
      if (result.reason === "not_found") {
        return errorJson("ALERT_NOT_FOUND", "Alerta no encontrada.", 404);
      }
      if (result.reason === "limit_exceeded") {
        return errorJson(
          "ALERT_LIMIT_EXCEEDED",
          `Alcanzaste el límite máximo de ${MAX_MARKET_ALERTS_PER_USER} alertas activas.`,
          409,
        );
      }
      return errorJson("INVALID_ALERT_PATCH", "No se pudo actualizar la alerta.", 400);
    }
    return NextResponse.json({ ok: true, alert: serializeAlert(result.alert) });
  },
);

export const DELETE = withActivePaseMutation(
  {
    bucket: "alerts-delete",
    limit: 40,
    windowMs: 60_000,
    requireJson: false,
  },
  async ({ request, user }) => {
    const queryId = new URL(request.url).searchParams.get("id");
    let alertId: string | null = null;
    if (queryId !== null) {
      const parsedQuery = AlertIdSchema.safeParse(queryId);
      if (parsedQuery.success) {
        alertId = parsedQuery.data;
      }
    } else {
      const rawBody = await readJsonBody(request);
      const parsedBody = DeleteAlertBodySchema.safeParse(rawBody);
      if (parsedBody.success) {
        alertId = parsedBody.data.id;
      }
    }
    if (!alertId) {
      return errorJson("INVALID_ALERT_ID", "Indica un identificador de alerta válido.", 400);
    }
    const result = await deleteMarketAlertForUser(user.db, user.userId, alertId);
    if (!result.ok) {
      return errorJson("ALERT_NOT_FOUND", "Alerta no encontrada.", 404);
    }
    return NextResponse.json({ ok: true, deletedId: result.deletedId });
  },
);
