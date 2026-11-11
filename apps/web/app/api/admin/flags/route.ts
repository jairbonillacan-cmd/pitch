import { NextResponse } from "next/server";
import { FLAG_MONTH1_NO_CARD, setBoolFlag } from "@pitchlab/db";
import { requireAdmin } from "../../../../src/server/session-user.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDITABLE_FLAGS = new Set([FLAG_MONTH1_NO_CARD]);

/** POST { key, value } — cambia una bandera operativa para toda la plataforma. */
export async function POST(request: Request): Promise<NextResponse> {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;
  const body = (await request.json().catch(() => null)) as { key?: unknown; value?: unknown } | null;
  if (!body || typeof body.key !== "string" || !EDITABLE_FLAGS.has(body.key) || typeof body.value !== "boolean") {
    return NextResponse.json({ error: "Bandera no editable" }, { status: 400 });
  }
  await setBoolFlag(admin.db, body.key, body.value, admin.userId);
  return NextResponse.json({ key: body.key, value: body.value });
}
