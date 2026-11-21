import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload, parseStrictFiniteNumber } from "@pitchlab/contracts";
import { cancelTransferRequest, submitTransferReceipt } from "@pitchlab/db";
import {
  withMemberMutation,
  type GuardedRouteHandler,
  type MemberMutationContext,
} from "../../../../../src/server/api-guards";
import { serializeTransferRequest } from "../../../../../src/server/member-plan";
import { UUID_RE, type ParsedReceiptFields } from "../../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TransferIdParamsSchema = z.object({
  id: z.string().regex(UUID_RE),
});

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

const PatchTransferReceiptSchema = z.object({
  originBank: OptionalNullableTextSchema,
  receiptReference: OptionalNullableTextSchema,
  payerName: OptionalNullableTextSchema,
  userNote: z.string().max(500).nullable().optional(),
  transferDate: TransferDateSchema,
  reportedAmountCentavosMxn: NumericInputSchema,
  reportedAmountMxn: NumericInputSchema,
});

function extractReceiptFields(
  data: z.infer<typeof PatchTransferReceiptSchema>,
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

export const PATCH: GuardedRouteHandler<{ id: string }> = withMemberMutation(
  {
    bucket: "me-transfers-receipt",
    limit: 20,
    windowMs: 3_600_000,
    failClosed: true,
  },
  async ({ request, params, user }: MemberMutationContext<{ id: string }>) => {
    const parsedParams = TransferIdParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      const payload = createSanitizedErrorPayload("INVALID_TRANSFER_ID", "Solicitud inválida.");
      return NextResponse.json({ ...payload, error: payload.message }, { status: 400 });
    }

    const rawBody: unknown = await request.json().catch(() => null);
    const parsedBody = PatchTransferReceiptSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      const payload = createSanitizedErrorPayload(
        "INVALID_TRANSFER_RECEIPT",
        "Revisa los datos del comprobante de transferencia.",
      );
      return NextResponse.json({ ...payload, error: payload.message }, { status: 400 });
    }

    const extracted = extractReceiptFields(parsedBody.data);
    if (!extracted.ok) {
      const payload = createSanitizedErrorPayload("INVALID_TRANSFER_AMOUNT", extracted.message);
      return NextResponse.json({ ...payload, error: payload.message }, { status: 400 });
    }

    const res = await submitTransferReceipt(user.db, {
      requestId: parsedParams.data.id,
      userId: user.userId,
      ...extracted.fields,
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

    return NextResponse.json({ ok: true, request: serializeTransferRequest(res.request) });
  },
);

export const DELETE: GuardedRouteHandler<{ id: string }> = withMemberMutation(
  {
    bucket: "me-transfers-cancel",
    limit: 20,
    windowMs: 3_600_000,
    failClosed: true,
    requireJson: false,
  },
  async ({ params, user }: MemberMutationContext<{ id: string }>) => {
    const parsedParams = TransferIdParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      const payload = createSanitizedErrorPayload("INVALID_TRANSFER_ID", "Solicitud inválida.");
      return NextResponse.json({ ...payload, error: payload.message }, { status: 400 });
    }

    const res = await cancelTransferRequest(user.db, {
      requestId: parsedParams.data.id,
      userId: user.userId,
      now: new Date(),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "La solicitud ya fue resuelta o no está pendiente." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, request: serializeTransferRequest(res.request) });
  },
);
