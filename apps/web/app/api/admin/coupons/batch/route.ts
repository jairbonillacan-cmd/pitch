import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload, parseStrictFiniteNumber } from "@pitchlab/contracts";
import { createAccessCouponBatch, type AccessCouponRow } from "@pitchlab/db";
import { withAdminMutation } from "../../../../../src/server/api-guards";
import { trialHashes } from "../../../../../src/server/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseStrictIntInRange(raw: number | string, min: number, max: number): number | null {
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    return null;
  }
  return parsed;
}

function invalidInputResponse(code: string, message: string, status = 400): NextResponse {
  const payload = createSanitizedErrorPayload(code, message);
  return NextResponse.json(
    { ok: false, error: payload.message, code: payload.code, message: payload.message },
    { status },
  );
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (err) {
    void err;
    return null;
  }
}

function parseOptionalExpiry(raw: string | null | undefined): { ok: true; value: Date | null } | { ok: false } {
  if (!raw || !raw.trim()) return { ok: true, value: null };
  const trimmed = raw.trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T23:59:59.000-06:00`)
    : new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return { ok: false };
  return { ok: true, value: parsed };
}

const createCouponBatchBodySchema = z
  .object({
    count: z
      .union([z.number(), z.string()])
      .refine((raw) => parseStrictIntInRange(raw, 1, 50) !== null)
      .transform((raw) => parseStrictIntInRange(raw, 1, 50) ?? 1),
    days: z
      .union([z.number(), z.string()])
      .refine((raw) => parseStrictIntInRange(raw, 1, 365) !== null)
      .transform((raw) => parseStrictIntInRange(raw, 1, 365) ?? 1),
    prefix: z.string().max(24).nullable().optional(),
    expiresAtIso: z.string().max(64).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .strict();

function serializeCoupon(row: AccessCouponRow) {
  return {
    id: row.id,
    code: row.code,
    days: row.days,
    maxRedemptions: row.maxRedemptions,
    redeemedCount: row.redeemedCount,
    expiresAtIso: row.expiresAt ? row.expiresAt.toISOString() : null,
    active: row.active,
    note: row.note,
    createdAtIso: row.createdAt.toISOString(),
  };
}

export const POST = withAdminMutation(
  { bucket: "admin-coupons-batch", limit: 20 },
  async ({ request, user }) => {
    const rawBody = await readJsonBody(request);
    const parsed = createCouponBatchBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return invalidInputResponse(
        "INVALID_COUPON_BATCH",
        "Indica entre 1 y 50 códigos por lote y entre 1 y 365 días de acceso.",
      );
    }

    const expiry = parseOptionalExpiry(parsed.data.expiresAtIso);
    if (!expiry.ok) {
      return invalidInputResponse("INVALID_COUPON_EXPIRY", "Fecha límite inválida.");
    }

    const prefix = parsed.data.prefix?.trim() ? parsed.data.prefix.trim() : null;
    const note = parsed.data.note ?? null;
    const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");

    const res = await createAccessCouponBatch(user.db, {
      adminUserId: user.userId,
      adminEmail: user.email,
      count: parsed.data.count,
      days: parsed.data.days,
      prefix,
      expiresAt: expiry.value,
      note,
      now: new Date(),
      ipSubnetHash,
    });

    if (!res.ok) {
      const msg =
        res.reason === "cantidad_invalida"
          ? "Indica entre 1 y 50 códigos por lote."
          : res.reason === "dias_invalidos"
            ? "Indica entre 1 y 365 días de acceso."
            : "El prefijo debe tener entre 2 y 10 letras o números.";
      return invalidInputResponse("INVALID_COUPON_BATCH", msg);
    }

    return NextResponse.json(
      { ok: true, coupons: res.coupons.map(serializeCoupon) },
      { status: 201 },
    );
  },
);
