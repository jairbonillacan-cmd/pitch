import { NextResponse } from "next/server";
import {
  createTransferRequest,
  listUserTransferRequests,
  quoteTransferAmountCentavos,
  type TransferPlanInterval,
} from "@pitchlab/db";
import { getTransferBankConfig, paymentMode } from "../../../../src/server/billing/payment-mode";
import { serializeTransferRequest } from "../../../../src/server/member-plan";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  trustedClientIp,
  verifySameOriginMutation,
} from "../../../../src/server/request-security";
import { requireMember } from "../../../../src/server/session-user";
import { parseTransferReceiptFields } from "../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** GET /api/me/transfers — datos SPEI, cotización autoritativa e historial de transferencias del socio. */
export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;

  const [monthly, annual, rows] = await Promise.all([
    quoteTransferAmountCentavos(member.db, member.userId, "monthly"),
    quoteTransferAmountCentavos(member.db, member.userId, "annual"),
    listUserTransferRequests(member.db, member.userId, 20),
  ]);

  const history = rows.map(serializeTransferRequest);
  const activePending = history.find((item) => item.status === "pending_review") ?? null;

  return NextResponse.json(
    {
      paymentMode: paymentMode(),
      bank: getTransferBankConfig(),
      quotes: { monthly, annual },
      activePending,
      history,
    },
    { headers: NO_STORE },
  );
}

/** POST /api/me/transfers — crea una solicitud de pago SPEI con referencia única `PL-{USER}-{4}`. */
export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const member = await requireMember(request);
  if ("error" in member) return member.error;

  const rl = await checkEndpointRateLimit({
    bucket: "me-transfers-create",
    key: `${member.userId}:${trustedClientIp(request.headers) || "local"}`,
    limit: 5,
    windowMs: 3_600_000,
  });
  if (!rl.allowed) {
    return rateLimitResponse(
      rl.retryAfterSeconds,
      "Alcanzaste el límite de solicitudes de transferencia por hora. Intenta de nuevo más tarde.",
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const rawInterval = body?.planInterval;
  if (rawInterval !== "monthly" && rawInterval !== "annual") {
    return NextResponse.json({ error: "Selecciona un plan válido (mensual o anual)." }, { status: 400 });
  }
  const planInterval: TransferPlanInterval = rawInterval;

  const parsedReceipt = parseTransferReceiptFields(body);
  if (!parsedReceipt.ok) {
    return NextResponse.json({ error: parsedReceipt.error }, { status: 400 });
  }

  const res = await createTransferRequest(member.db, {
    userId: member.userId,
    planInterval,
    ...parsedReceipt.fields,
    now: new Date(),
  });

  if (!res.ok) {
    if (res.reason === "solicitud_pendiente_existente") {
      return NextResponse.json(
        {
          error: "Ya tienes una transferencia pendiente de revisión. Puedes actualizar sus datos o cancelarla.",
          reason: res.reason,
          activePending: res.existing ? serializeTransferRequest(res.existing) : null,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "No pudimos crear la solicitud. Revisa los datos e intenta otra vez.", reason: res.reason },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      request: serializeTransferRequest(res.request),
      bank: getTransferBankConfig(),
    },
    { status: 201, headers: NO_STORE },
  );
}
