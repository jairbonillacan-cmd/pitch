import { NextResponse } from "next/server";
import { cancelTransferRequest, submitTransferReceipt } from "@pitchlab/db";
import { serializeTransferRequest } from "../../../../../src/server/member-plan";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  trustedClientIp,
  verifySameOriginMutation,
} from "../../../../../src/server/request-security";
import { requireMember } from "../../../../../src/server/session-user";
import { parseTransferReceiptFields, UUID_RE } from "../../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** PATCH /api/me/transfers/[id] — registra o actualiza los datos del comprobante ("Ya transferí"). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const member = await requireMember(request);
  if ("error" in member) return member.error;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const rl = await checkEndpointRateLimit({
    bucket: "me-transfers-receipt",
    key: `${member.userId}:${trustedClientIp(request.headers) || "local"}`,
    limit: 20,
    windowMs: 3_600_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = parseTransferReceiptFields(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const res = await submitTransferReceipt(member.db, {
    requestId: id,
    userId: member.userId,
    ...parsed.fields,
    now: new Date(),
  });

  if (!res.ok) {
    if (res.reason === "no_encontrada") {
      return NextResponse.json({ error: "No encontramos esa solicitud." }, { status: 404 });
    }
    if (res.reason === "no_pendiente") {
      return NextResponse.json(
        { error: "Esta solicitud ya fue resuelta o cancelada y no puede editarse." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Monto reportado inválido." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, request: serializeTransferRequest(res.request) }, { headers: NO_STORE });
}

/** DELETE /api/me/transfers/[id] — cancela una solicitud pendiente del propio socio. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request, { requireJson: false });
  if (csrfError) return csrfError;

  const member = await requireMember(request);
  if ("error" in member) return member.error;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const res = await cancelTransferRequest(member.db, {
    requestId: id,
    userId: member.userId,
    now: new Date(),
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "La solicitud ya fue resuelta o no está pendiente." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, request: serializeTransferRequest(res.request) }, { headers: NO_STORE });
}
