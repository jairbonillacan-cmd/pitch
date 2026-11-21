import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload, parseStrictFiniteNumber } from "@pitchlab/contracts";
import { createAccessCoupon, listCouponsAdmin, type AccessCouponRow } from "@pitchlab/db";
import { withAdminMutation } from "../../../../src/server/api-guards";
import { trialHashes } from "../../../../src/server/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ADMIN_LIST_LIMIT = 40;

function parseBoundedLimit(request: Request, defaultLimit: number): number {
  const raw = new URL(request.url).searchParams.get("limit");
  if (raw === null || raw.trim() === "") return defaultLimit;
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null || !Number.isInteger(parsed)) return defaultLimit;
  return Math.max(1, Math.min(MAX_ADMIN_LIST_LIMIT, parsed));
}

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

const optionalMaxRedemptionsSchema = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .refine((raw) => {
    if (raw === undefined || raw === null) return true;
    if (typeof raw === "string" && raw.trim() === "") return true;
    return parseStrictIntInRange(raw, 1, 100_000) !== null;
  })
  .transform((raw): number | null => {
    if (raw === undefined || raw === null) return null;
    if (typeof raw === "string" && raw.trim() === "") return null;
    return parseStrictIntInRange(raw, 1, 100_000);
  });

const createCouponBodySchema = z
  .object({
    code: z.string().max(64).nullable().optional(),
    days: z
      .union([z.number(), z.string()])
      .refine((raw) => parseStrictIntInRange(raw, 1, 365) !== null)
      .transform((raw) => parseStrictIntInRange(raw, 1, 365) ?? 1),
    maxRedemptions: optionalMaxRedemptionsSchema,
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
    transferRequestId: row.transferRequestId ?? null,
    restrictedToUserId: row.restrictedToUserId ?? null,
    createdAtIso: row.createdAt.toISOString(),
    updatedAtIso: row.updatedAt.toISOString(),
  };
}

export const GET = withAdminMutation(
  { bucket: "admin-coupons-read", allowGet: true, limit: 60 },
  async ({ request, user }) => {
    const limit = parseBoundedLimit(request, MAX_ADMIN_LIST_LIMIT);
    const rows = await listCouponsAdmin(user.db, limit);
    return NextResponse.json({ coupons: rows.map(serializeCoupon) });
  },
);

export const POST = withAdminMutation(
  { bucket: "admin-coupons", limit: 60 },
  async ({ request, user }) => {
    const rawBody = await readJsonBody(request);
    const parsed = createCouponBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return invalidInputResponse(
        "INVALID_COUPON_PAYLOAD",
        "Indica entre 1 y 365 días y un límite de usos entero mayor o igual a 1.",
      );
    }

    const expiry = parseOptionalExpiry(parsed.data.expiresAtIso);
    if (!expiry.ok) {
      return invalidInputResponse("INVALID_COUPON_EXPIRY", "La fecha límite del cupón es inválida.");
    }

    const code = parsed.data.code?.trim() ? parsed.data.code.trim() : null;
    const note = parsed.data.note ?? null;
    const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");

    const res = await createAccessCoupon(user.db, {
      adminUserId: user.userId,
      adminEmail: user.email,
      code,
      days: parsed.data.days,
      maxRedemptions: parsed.data.maxRedemptions,
      expiresAt: expiry.value,
      note,
      now: new Date(),
      ipSubnetHash,
    });

    if (!res.ok) {
      if (res.reason === "duplicado") {
        return invalidInputResponse(
          "COUPON_DUPLICATE",
          "Ese código ya existe en cupones, referidos o tipsters.",
          409,
        );
      }
      if (res.reason === "codigo_invalido") {
        return invalidInputResponse(
          "INVALID_COUPON_CODE",
          "Usa entre 3 y 32 letras, números, guiones (-) o guiones bajos (_).",
        );
      }
      if (res.reason === "dias_invalidos") {
        return invalidInputResponse("INVALID_COUPON_DAYS", "Indica entre 1 y 365 días de acceso.");
      }
      return invalidInputResponse(
        "INVALID_COUPON_LIMIT",
        "El límite de usos debe ser mayor o igual a 1.",
      );
    }

    return NextResponse.json({ ok: true, coupon: serializeCoupon(res.coupon) }, { status: 201 });
  },
);
