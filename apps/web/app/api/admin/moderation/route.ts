import { NextResponse } from "next/server";
import {
  applyModerationAction,
  listModerationPanelData,
  type ModerationActionKind,
} from "@pitchlab/db";
import { requireAdmin } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTION_MESSAGES: Record<string, { status: number; error: string }> = {
  accion_invalida: { status: 400, error: "Acción de moderación inválida." },
  no_existe: { status: 404, error: "Ese contenido o socio ya no existe." },
};

/** GET — cola de reportes pendientes, contenido oculto y socios pausados. */
export async function GET(request: Request): Promise<NextResponse> {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;
  const moderation = await listModerationPanelData(admin.db);
  return NextResponse.json(moderation);
}

/** POST { action, targetType?, targetId?, targetUserId? } — ejecuta acción de moderación. */
export async function POST(request: Request): Promise<NextResponse> {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? (body.action as ModerationActionKind) : ("" as ModerationActionKind);
  const res = await applyModerationAction(
    admin.db,
    admin.userId,
    {
      action,
      targetType: body?.targetType === "post" || body?.targetType === "comment" ? body.targetType : undefined,
      targetId: typeof body?.targetId === "string" ? body.targetId : undefined,
      targetUserId: typeof body?.targetUserId === "string" ? body.targetUserId : undefined,
    },
    new Date(),
  );
  if (!res.ok) {
    const info = ACTION_MESSAGES[res.reason] ?? { status: 400, error: "No se pudo aplicar la acción." };
    return NextResponse.json({ error: info.error, reason: res.reason }, { status: info.status });
  }
  const moderation = await listModerationPanelData(admin.db);
  return NextResponse.json({ ok: true, ...moderation });
}
