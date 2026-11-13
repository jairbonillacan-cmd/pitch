import { NextResponse } from "next/server";
import { createAccessCoupon, listCouponsAdmin, type AccessCouponRow } from "@pitchlab/db";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  verifySameOriginMutation,
} from "../../../../src/server/request-security";
import { requireAdmin } from "../../../../src/server/session-user";
import { trialHashes } from "../../../../src/server/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    updatedAtIso: row.updatedAt.toISOString(),
  };
}

/** GET /api/admin/coupons — lista cupones creados para la consola del fundador. */
export async function GET(request: Request): Promise<NextResponse> {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const rows = await listCouponsAdmin(admin.db, 100);
  return NextResponse.json(
    { coupons: rows.map(serializeCoupon) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** POST /api/admin/coupons — crea cupón temporal (código automático o personalizado). */
export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const rl = await checkEndpointRateLimit({
    bucket: "admin-coupon-create",
    key: admin.userId,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const body = (await request.json().catch(() => null)) as {
    code?: unknown;
    days?: unknown;
    maxRedemptions?: unknown;
    expiresAtIso?: unknown;
    note?: unknown;
  } | null;

  const code = typeof body?.code === "string" && body.code.trim() ? body.code.trim() : null;
  const days = typeof body?.days === "number" ? body.days : Number(body?.days);

  let maxRedemptions: number | null = null;
  if (body?.maxRedemptions !== undefined && body.maxRedemptions !== null && body.maxRedemptions !== "") {
    const parsedMax = Number(body.maxRedemptions);
    if (!Number.isInteger(parsedMax) || parsedMax < 1) {
      return NextResponse.json({ error: "El límite de usos debe ser un entero mayor o igual a 1." }, { status: 400 });
    }
    maxRedemptions = parsedMax;
  }

  let expiresAt: Date | null = null;
  if (typeof body?.expiresAtIso === "string" && body.expiresAtIso.trim()) {
    const rawDate = body.expiresAtIso.trim();
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? new Date(`${rawDate}T23:59:59.000-06:00`)
      : new Date(rawDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "La fecha límite del cupón es inválida." }, { status: 400 });
    }
    expiresAt = parsedDate;
  }

  const note = typeof body?.note === "string" ? body.note : null;
  const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");

  const res = await createAccessCoupon(admin.db, {
    adminUserId: admin.userId,
    adminEmail: admin.email,
    code,
    days,
    maxRedemptions,
    expiresAt,
    note,
    now: new Date(),
    ipSubnetHash,
  });

  if (!res.ok) {
    if (res.reason === "duplicado") {
      return NextResponse.json(
        { error: "Ese código ya existe en cupones, referidos o tipsters." },
        { status: 409 },
      );
    }
    if (res.reason === "codigo_invalido") {
      return NextResponse.json(
        { error: "Usa entre 3 y 32 letras, números, guiones (-) o guiones bajos (_)." },
        { status: 400 },
      );
    }
    if (res.reason === "dias_invalidos") {
      return NextResponse.json({ error: "Indica entre 1 y 365 días de acceso." }, { status: 400 });
    }
    return NextResponse.json({ error: "El límite de usos debe ser mayor o igual a 1." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, coupon: serializeCoupon(res.coupon) }, { status: 201 });
}
