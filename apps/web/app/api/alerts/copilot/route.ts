import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload, isSafePublicLabel } from "@pitchlab/contracts";
import {
  createMarketAlert,
  MAX_MARKET_ALERTS_PER_USER,
  MAX_TOTAL_MARKET_ALERTS_PER_USER,
  type MarketAlertRow,
} from "@pitchlab/db/market-alerts";
import { withActivePaseMutation } from "../../../../src/server/api-guards";
import { parseMarketAlertWithCopilot } from "../../../../src/server/market-alerts-copilot";
import {
  AlertChannelSchema,
  AlertCooldownMinutesSchema,
  alertRuleToDbCreateInput,
} from "../../../../src/server/market-alerts-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CopilotRequestSchema = z
  .object({
    promptEs: z.string().trim().min(5).max(400),
    save: z.boolean().optional(),
    name: z.string().trim().min(2).max(120).optional(),
    cooldownMinutes: AlertCooldownMinutesSchema.optional(),
    channel: AlertChannelSchema.optional(),
    minDecimal: z.number().finite().gt(1).lte(1000).nullable().optional(),
    maxDecimal: z.number().finite().gt(1).lte(1000).nullable().optional(),
  })
  .strict();

function errorJson(code: string, message: string, status: number): NextResponse {
  const payload = createSanitizedErrorPayload(code, message);
  return NextResponse.json(
    { ok: false, error: payload.message, code: payload.code },
    { status, headers: { "Cache-Control": "private, no-store" } },
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

export const POST = withActivePaseMutation(
  {
    bucket: "alerts-copilot",
    limit: 15,
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

    const parsed = CopilotRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return errorJson(
        "INVALID_COPILOT_PROMPT",
        "Escribe una instrucción clara de alerta en español (5 a 400 caracteres).",
        400,
      );
    }

    if (parsed.data.name !== undefined && !isSafePublicLabel(parsed.data.name)) {
      return errorJson(
        "INVALID_ALERT_NAME",
        "El nombre de la alerta contiene texto no permitido.",
        400,
      );
    }

    if (
      parsed.data.minDecimal !== undefined &&
      parsed.data.minDecimal !== null &&
      parsed.data.maxDecimal !== undefined &&
      parsed.data.maxDecimal !== null &&
      parsed.data.minDecimal > parsed.data.maxDecimal
    ) {
      return errorJson(
        "INVALID_DECIMAL_RANGE",
        "El momio mínimo no puede superar al momio máximo.",
        400,
      );
    }

    const resolution = await parseMarketAlertWithCopilot(parsed.data.promptEs, {
      db: user.db,
    });

    if (resolution.outcome === "reject") {
      return NextResponse.json(
        {
          ok: false,
          outcome: "reject",
          rejectCode: resolution.rejectCode,
          message: resolution.message,
          source: resolution.source,
        },
        {
          status: 422,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    const draft = alertRuleToDbCreateInput(resolution.rule, {
      name: parsed.data.name,
      cooldownMinutes: parsed.data.cooldownMinutes,
      channel: parsed.data.channel,
      minDecimal: parsed.data.minDecimal,
      maxDecimal: parsed.data.maxDecimal,
    });

    if (
      draft.minDecimal !== undefined &&
      draft.minDecimal !== null &&
      draft.maxDecimal !== undefined &&
      draft.maxDecimal !== null &&
      draft.minDecimal > draft.maxDecimal
    ) {
      return errorJson(
        "INVALID_DECIMAL_RANGE",
        "El momio mínimo no puede superar al momio máximo.",
        400,
      );
    }

    if (parsed.data.save === true) {
      const created = await createMarketAlert(user.db, user.userId, draft);
      if (!created.ok) {
        if (created.reason === "limit_exceeded") {
          return errorJson(
            "ALERT_LIMIT_EXCEEDED",
            `Alcanzaste el límite máximo de ${MAX_MARKET_ALERTS_PER_USER} alertas activas (${MAX_TOTAL_MARKET_ALERTS_PER_USER} totales).`,
            409,
          );
        }
        return errorJson("INVALID_ALERT_PAYLOAD", "No se pudo guardar la alerta.", 400);
      }
      return NextResponse.json(
        {
          ok: true,
          outcome: "accept",
          rule: resolution.rule,
          draft,
          alert: serializeAlert(created.alert),
          source: resolution.source,
        },
        {
          status: 201,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        outcome: "accept",
        rule: resolution.rule,
        draft,
        source: resolution.source,
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  },
);
