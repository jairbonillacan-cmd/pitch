/**
 * Validaciones compartidas y mensajes en `es-MX` para endpoints de SPEI y cupones (Beta 1.0).
 */
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import type { CouponErrorReason, TransferRequestRow } from "@pitchlab/db";
import type { AdminTransferRequestItem } from "@pitchlab/db";
import { serializeTransferRequest } from "./member-plan";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ParsedReceiptFields {
  originBank?: string | null;
  reportedAmountCentavosMxn?: number | null;
  receiptReference?: string | null;
  payerName?: string | null;
  transferDate?: string | null;
  userNote?: string | null;
}

export function parseTransferReceiptFields(
  body: Record<string, unknown> | null,
): { ok: true; fields: ParsedReceiptFields } | { ok: false; error: string } {
  if (!body) return { ok: true, fields: {} };

  const fields: ParsedReceiptFields = {};

  if (body.originBank !== undefined) {
    fields.originBank = typeof body.originBank === "string" ? body.originBank : null;
  }
  if (body.receiptReference !== undefined) {
    fields.receiptReference = typeof body.receiptReference === "string" ? body.receiptReference : null;
  }
  if (body.payerName !== undefined) {
    fields.payerName = typeof body.payerName === "string" ? body.payerName : null;
  }
  if (body.userNote !== undefined) {
    fields.userNote = typeof body.userNote === "string" ? body.userNote : null;
  }

  if (body.transferDate !== undefined) {
    if (body.transferDate === null || body.transferDate === "") {
      fields.transferDate = null;
    } else if (typeof body.transferDate === "string") {
      const trimmed = body.transferDate.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return { ok: false, error: "La fecha de transferencia debe tener formato AAAA-MM-DD." };
      }
      fields.transferDate = trimmed;
    } else {
      return { ok: false, error: "Fecha de transferencia inválida." };
    }
  }

  if (body.reportedAmountCentavosMxn !== undefined) {
    if (body.reportedAmountCentavosMxn === null || body.reportedAmountCentavosMxn === "") {
      fields.reportedAmountCentavosMxn = null;
    } else {
      const val = parseStrictFiniteNumber(body.reportedAmountCentavosMxn);
      if (val === null || !Number.isInteger(val) || val <= 0 || val > 50_000_000) {
        return { ok: false, error: "El monto transferido debe ser mayor a $0 MXN." };
      }
      fields.reportedAmountCentavosMxn = val;
    }
  } else if (body.reportedAmountMxn !== undefined) {
    if (body.reportedAmountMxn === null || body.reportedAmountMxn === "") {
      fields.reportedAmountCentavosMxn = null;
    } else {
      const pesos = parseStrictFiniteNumber(body.reportedAmountMxn);
      if (pesos === null || pesos <= 0 || pesos > 500_000) {
        return { ok: false, error: "El monto transferido debe ser mayor a $0 MXN." };
      }
      fields.reportedAmountCentavosMxn = Math.round(pesos * 100);
    }
  }

  return { ok: true, fields };
}

export function serializeAdminTransferRequest(row: AdminTransferRequestItem) {
  return {
    ...serializeTransferRequest(row),
    userId: row.userId,
    userEmail: row.userEmail,
    userHandle: row.userHandle,
    userDisplayName: row.userDisplayName,
    adminNotes: row.adminNotes ?? null,
    entitlementGrantId: row.entitlementGrantId ?? null,
    issuedCouponCode: row.issuedCouponCode ?? null,
  };
}

export const COUPON_ERROR_COPY: Record<CouponErrorReason, { status: number; message: string }> = {
  no_existe: {
    status: 404,
    message: "No encontramos ese código. Revisa que esté bien escrito (sin espacios ni caracteres extra).",
  },
  inactivo: {
    status: 410,
    message: "Este cupón fue desactivado por el equipo de PitchLab.",
  },
  vencido: {
    status: 410,
    message: "La vigencia de este cupón ya terminó.",
  },
  agotado: {
    status: 409,
    message: "Este cupón es de un solo uso y ya fue canjeado (o alcanzó su límite máximo de canjes).",
  },
  ya_canjeado: {
    status: 409,
    message: "Ya canjeaste este cupón en tu cuenta.",
  },
  cuenta_distinta: {
    status: 403,
    message:
      "Este cupón personal está ligado a otra cuenta. Inicia sesión con el correo que realizó la transferencia.",
  },
};
