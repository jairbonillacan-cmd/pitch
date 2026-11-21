import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload, parseStrictFiniteNumber } from "@pitchlab/contracts";
import {
  applyModerationAction,
  listModerationPanelData,
  MODERATION_ACTIONS,
  type ModerationPanelData,
} from "@pitchlab/db";
import { withAdminMutation } from "../../../../src/server/api-guards";
import { sendContentRemovedEmail } from "../../../../src/server/lifecycle-emails";
import { getMailer } from "../../../../src/server/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ADMIN_LIST_LIMIT = 40;

const ACTION_MESSAGES: Record<string, { status: number; code: string; error: string }> = {
  accion_invalida: {
    status: 400,
    code: "INVALID_MODERATION_ACTION",
    error: "Acción de moderación inválida.",
  },
  no_existe: {
    status: 404,
    code: "MODERATION_TARGET_NOT_FOUND",
    error: "Ese contenido o socio ya no existe.",
  },
};

function parseBoundedLimit(request: Request, defaultLimit: number): number {
  const raw = new URL(request.url).searchParams.get("limit");
  if (raw === null || raw.trim() === "") return defaultLimit;
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null || !Number.isInteger(parsed)) return defaultLimit;
  return Math.max(1, Math.min(MAX_ADMIN_LIST_LIMIT, parsed));
}

function boundModerationPanelData(data: ModerationPanelData, limit: number): ModerationPanelData {
  return {
    pendingQueue: data.pendingQueue.slice(0, limit),
    hiddenItems: data.hiddenItems.slice(0, limit),
    pausedMembers: data.pausedMembers.slice(0, limit),
  };
}

function invalidModerationResponse(
  code: string,
  message: string,
  status = 400,
  reason?: string,
): NextResponse {
  const payload = createSanitizedErrorPayload(code, message);
  return NextResponse.json(
    {
      ok: false,
      error: payload.message,
      code: payload.code,
      message: payload.message,
      ...(reason ? { reason } : {}),
    },
    { status },
  );
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (err) {
    void err;
    return null;
  }
}

const moderationActionBodySchema = z
  .object({
    action: z.enum(MODERATION_ACTIONS),
    targetType: z.enum(["post", "comment"]).optional(),
    targetId: z.string().trim().min(1).max(128).optional(),
    targetUserId: z.string().trim().min(1).max(128).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((data) => {
    if (data.action === "pause_user" || data.action === "unpause_user") {
      return typeof data.targetUserId === "string" && data.targetUserId.length > 0;
    }
    return (
      (data.targetType === "post" || data.targetType === "comment") &&
      typeof data.targetId === "string" &&
      data.targetId.length > 0
    );
  });

export const GET = withAdminMutation(
  { bucket: "admin-moderation-read", allowGet: true, limit: 60 },
  async ({ request, user }) => {
    const limit = parseBoundedLimit(request, MAX_ADMIN_LIST_LIMIT);
    const moderation = boundModerationPanelData(await listModerationPanelData(user.db), limit);
    return NextResponse.json(moderation);
  },
);

export const POST = withAdminMutation(
  { bucket: "admin-moderation", limit: 30 },
  async ({ request, user }) => {
    const rawBody = await readJsonBody(request);
    const parsed = moderationActionBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return invalidModerationResponse(
        "INVALID_MODERATION_ACTION",
        "Acción de moderación inválida.",
        400,
        "accion_invalida",
      );
    }

    const { action, targetType, targetId, targetUserId, reason } = parsed.data;
    const now = new Date();
    const res = await applyModerationAction(
      user.db,
      user.userId,
      {
        action,
        targetType,
        targetId,
        targetUserId,
      },
      now,
    );
    if (!res.ok) {
      const info = ACTION_MESSAGES[res.reason] ?? {
        status: 400,
        code: "MODERATION_ACTION_FAILED",
        error: "No se pudo aplicar la acción.",
      };
      return invalidModerationResponse(info.code, info.error, info.status, res.reason);
    }

    if (action === "hide" && targetType && targetId) {
      await sendContentRemovedEmail(user.db, getMailer(), {
        targetType,
        targetId,
        reason,
        now,
      });
    }

    const moderation = boundModerationPanelData(
      await listModerationPanelData(user.db),
      MAX_ADMIN_LIST_LIMIT,
    );
    return NextResponse.json({ ok: true, ...moderation });
  },
);
