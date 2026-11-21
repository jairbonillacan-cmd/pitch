import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload, parseStrictFiniteNumber } from "@pitchlab/contracts";
import {
  createTransferRequest,
  ensureUserSpeiReference,
  listUserTransferRequests,
  quoteTransferAmountCentavos,
  type TransferPlanInterval,
} from "@pitchlab/db";
import { withMemberMutation, withSessionRead } from "../../../../src/server/api-guards";
import { getTransferBankConfig, paymentMode } from "../../../../src/server/billing/payment-mode";
import { recordMemberFunnelIfConsented } from "../../../../src/server/funnel";
import { serializeTransferRequest } from "../../../../src/server/member-plan";
import type { ParsedReceiptFields } from "../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OptionalNullableTextSchema = z.string().max(240).nullable().optional();

const TransferDateSchema = z
  .union([
    z.null(),
    z.literal(""),
    z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  ])
  .optional();

const NumericInputSchema = z
  .union([z.null(), z.literal(""), z.number().finite(), z.string().trim().max(32)])
  .optional();

const CreateTransferBodySchema = z.object({
  planInterval: z.enum(["monthly", "annual"]),
  originBank: OptionalNullableTextSchema,
  receiptReference: OptionalNullableTextSchema,
  payerName: OptionalNullableTextSchema,
  userNote: z.string().max(500).nullable().optional(),
  transferDate: TransferDateSchema,
  reportedAmountCentavosMxn: NumericInputSchema,
  reportedAmountMxn: NumericInputSchema,
});

function extractReceiptFields(
  data: z.infer<typeof CreateTransferBodySchema>,
): { ok: true; fields: ParsedReceiptFields } | { ok: false; message: string } {
  const fields: ParsedReceiptFields = {};

  if (data.originBank !== undefined) fields.originBank = data.originBank;
  if (data.receiptReference !== undefined) fields.receiptReference = data.receiptReference;
  if (data.payerName !== undefined) fields.payerName = data.payerName;
  if (data.userNote !== undefined) fields.userNote = data.userNote;
  if (data.transferDate !== undefined) {
    fields.transferDate = data.transferDate === null || data.transferDate === "" ? null : data.transferDate;
  }

  if (data.reportedAmountCentavosMxn !== undefined) {
    if (data.reportedAmountCentavosMxn === null || data.reportedAmountCentavosMxn === "") {
      fields.reportedAmountCentavosMxn = null;
    } else {
      const val = parseStrictFiniteNumber(data.reportedAmountCentavosMxn);
      if (val === null || !Number.isInteger(val) || val <= 0 || val > 50_000_000) {
        return { ok: false, message: "El monto transferido debe ser mayor a $0 MXN." };
      }
      fields.reportedAmountCentavosMxn = val;
    }
  } else if (data.reportedAmountMxn !== undefined) {
    if (data.reportedAmountMxn === null || data.reportedAmountMxn === "") {
      fields.reportedAmountCentavosMxn = null;
    } else {
      const pesos = parseStrictFiniteNumber(data.reportedAmountMxn);
      if (pesos === null || pesos <= 0 || pesos > 500_000) {
        return { ok: false, message: "El monto transferido debe ser mayor a $0 MXN." };
      }
      fields.reportedAmountCentavosMxn = Math.round(pesos * 100);
    }
  }

  return { ok: true, fields };
}

export const GET = withSessionRead(
  {
    bucket: "me-transfers-read",
    allowBeta: false,
    limit: 60,
    windowMs: 60_000,
  },
  async ({ user }) => {
    const [monthly, annual, rows, speiReferenceCode] = await Promise.all([
      quoteTransferAmountCentavos(user.db, user.userId, "monthly"),
      quoteTransferAmountCentavos(user.db, user.userId, "annual"),
      listUserTransferRequests(user.db, user.userId, 20),
      ensureUserSpeiReference(user.db, user.userId),
    ]);

    const history = rows.map(serializeTransferRequest);
    const activePending = history.find((item) => item.status === "pending_review") ?? null;

    return NextResponse.json({
      paymentMode: paymentMode(),
      speiReferenceCode,
      bank: getTransferBankConfig(),
      quotes: { monthly, annual },
      activePending,
      history,
    });
  },
);

export const POST = withMemberMutation(
  {
    bucket: "me-transfers-create",
    limit: 5,
    windowMs: 3_600_000,
    failClosed: true,
  },
  async ({ request, user }) => {
    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = CreateTransferBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      const payload = createSanitizedErrorPayload(
        "INVALID_TRANSFER_REQUEST",
        "Selecciona un plan válido (mensual o anual) y revisa los datos del comprobante.",
      );
      return NextResponse.json({ ...payload, error: payload.message }, { status: 400 });
    }

    const planInterval: TransferPlanInterval = parsed.data.planInterval;
    const extracted = extractReceiptFields(parsed.data);
    if (!extracted.ok) {
      const payload = createSanitizedErrorPayload("INVALID_TRANSFER_AMOUNT", extracted.message);
      return NextResponse.json({ ...payload, error: payload.message }, { status: 400 });
    }

    const now = new Date();
    const res = await createTransferRequest(user.db, {
      userId: user.userId,
      planInterval,
      ...extracted.fields,
      now,
    });

    if (!res.ok) {
      if (res.reason === "solicitud_pendiente_existente") {
        return NextResponse.json(
          {
            error:
              "Ya tienes una transferencia pendiente de revisión. Puedes actualizar sus datos o cancelarla.",
            reason: res.reason,
            activePending: res.existing ? serializeTransferRequest(res.existing) : null,
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error: "No pudimos crear la solicitud. Revisa los datos e intenta otra vez.",
          reason: res.reason,
        },
        { status: 400 },
      );
    }

    await recordMemberFunnelIfConsented(
      user.db,
      user.userId,
      "spei_transfer",
      "/app/account",
      { planInterval, transferId: res.request.id },
      now,
    );

    return NextResponse.json(
      {
        ok: true,
        speiReferenceCode: res.request.referenceCode,
        request: serializeTransferRequest(res.request),
        bank: getTransferBankConfig(),
      },
      { status: 201 },
    );
  },
);
