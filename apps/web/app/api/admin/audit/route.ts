import { NextResponse } from "next/server";
import { listAdminAuditLogs } from "@pitchlab/db";
import { requireAdmin } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/audit — visor de auditoría de seguridad y acciones administrativas. */
export async function GET(request: Request): Promise<NextResponse> {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const entries = await listAdminAuditLogs(admin.db, 60);
  return NextResponse.json({ entries }, { headers: { "Cache-Control": "no-store" } });
}
