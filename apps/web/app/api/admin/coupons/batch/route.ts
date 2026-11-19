import { NextResponse } from "next/server";
import { createAccessCouponBatch, type AccessCouponRow } from "@pitchlab/db";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  verifySameOriginMutation,
} from "../../../../../src/server/request-security";
import { requireAdmin } from "../../../../../src/server/session-user";
import { trialHashes } from "../../../../../src/server/signup";

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
  };
}

/** POST /api/admin/coupons/batch — genera un lote de 1–50 cupones de un solo uso. */
export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const rl = await checkEndpointRateLimit({
    bucket: "admin-coupon-batch",
    key: admin.userId,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const body = (await request.json().catch(() => null)) as {
    count?: unknown;
    days?: unknown;
    prefix?: unknown;
    expiresAtIso?: unknown;
    note?: unknown;
  } | null;

  const count = Number(body?.count);
  const days = Number(body?.days);
  const prefix = typeof body?.prefix === "string" && body.prefix.trim() ? body.prefix.trim() : null;
  const note = typeof body?.note === "string" ? body.note : null;

  let expiresAt: Date | null = null;
  if (typeof body?.expiresAtIso === "string" && body.expiresAtIso.trim()) {
    const raw = body.expiresAtIso.trim();
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T23:59:59.000-06:00`) : new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Fecha límite inválida." }, { status: 400 });
    }
    expiresAt = parsed;
  }

  const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");
  const res = await createAccessCouponBatch(admin.db, {
    adminUserId: admin.userId,
    adminEmail: admin.email,
    count,
    days,
    prefix,
    expiresAt,
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
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json(
    { ok: true, coupons: res.coupons.map(serializeCoupon) },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
