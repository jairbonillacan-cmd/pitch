import { NextResponse } from "next/server";
import { listAdminTransferRequests, type TransferRequestStatus } from "@pitchlab/db";
import { requireAdmin } from "../../../../src/server/session-user";
import { serializeAdminTransferRequest } from "../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["all", "pending_review", "approved", "rejected", "canceled"]);

/** GET /api/admin/transfers?status=...&q=... — lista solicitudes SPEI para la consola de fundador. */
export async function GET(request: Request): Promise<NextResponse> {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const sp = new URL(request.url).searchParams;
  const rawStatus = sp.get("status") ?? "all";
  const status: TransferRequestStatus | "all" = ALLOWED_STATUSES.has(rawStatus)
    ? (rawStatus as TransferRequestStatus | "all")
    : "all";
  const query = sp.get("q")?.trim() ?? "";

  const rows = await listAdminTransferRequests(admin.db, {
    status,
    query: query || undefined,
    limit: 80,
  });

  const requests = rows.map(serializeAdminTransferRequest);
  const pendingCount = requests.filter((r) => r.status === "pending_review").length;

  return NextResponse.json(
    { requests, pendingCount },
    { headers: { "Cache-Control": "no-store" } },
  );
}
