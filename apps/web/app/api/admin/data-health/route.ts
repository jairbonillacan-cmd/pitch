import { NextResponse } from "next/server";
import { loadServerDataHealthReport } from "../../../../src/server/data-health";
import { accountsEnabled, previewToolsEnabled } from "../../../../src/server/platform-data";
import { requireAdmin } from "../../../../src/server/session-user";
import { getViewerAccess } from "../../../../src/server/viewer-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  if (accountsEnabled()) {
    const admin = await requireAdmin(request);
    if ("error" in admin) return admin.error;
  } else {
    const access = await getViewerAccess();
    if (!access.isAdmin && !previewToolsEnabled(access.isAdmin)) {
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }
  }

  const report = loadServerDataHealthReport();
  return NextResponse.json(report);
}
