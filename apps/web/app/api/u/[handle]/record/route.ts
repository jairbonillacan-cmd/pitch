import { NextResponse } from "next/server";
import { loadPublicRecord } from "../../../../../src/server/public-record";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  trustedClientIp,
} from "../../../../../src/server/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — récord público de un socio, solo con lo que él decidió compartir. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ handle: string }> },
): Promise<NextResponse> {
  const rl = await checkEndpointRateLimit({
    bucket: "public-record",
    key: trustedClientIp(request.headers) || "local",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const record = await loadPublicRecord((await params).handle);
  if (!record) return NextResponse.json({ error: "perfil_no_encontrado" }, { status: 404 });
  return NextResponse.json(record, { headers: { "Cache-Control": "private, max-age=60" } });
}
