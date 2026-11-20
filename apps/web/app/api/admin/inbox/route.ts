import { NextResponse } from "next/server";
import { listAdminInbox, markAdminInboxResolved } from "@pitchlab/db";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  verifySameOriginMutation,
} from "../../../../src/server/request-security";
import { requireAdmin } from "../../../../src/server/session-user";
import { trialHashes } from "../../../../src/server/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/inbox — bandeja de Feedback, Soporte y Solicitudes de eliminación de cuenta. */
export async function GET(request: Request): Promise<NextResponse> {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const items = await listAdminInbox(admin.db, 80);
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}

/** PATCH /api/admin/inbox — marca como atendido un mensaje de la bandeja. */
export async function PATCH(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const rl = await checkEndpointRateLimit({
    bucket: "admin-inbox-resolve",
    key: admin.userId,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const body = (await request.json().catch(() => null)) as { itemId?: unknown; note?: unknown } | null;
  const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 280) : null;
  if (!itemId) {
    return NextResponse.json({ error: "Falta el identificador del mensaje." }, { status: 400 });
  }

  const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");
  const res = await markAdminInboxResolved(admin.db, {
    adminUserId: admin.userId,
    adminEmail: admin.email,
    itemId,
    note,
    ipSubnetHash,
  });
  if (!res.ok) {
    return NextResponse.json({ error: "Mensaje no encontrado." }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
