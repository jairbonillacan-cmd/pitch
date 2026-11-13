import { NextResponse } from "next/server";
import { validateCouponPreview } from "@pitchlab/db";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  trustedClientIp,
} from "../../../../../src/server/request-security";
import { optionalPublicDbSession } from "../../../../../src/server/session-user";
import { COUPON_ERROR_COPY } from "../../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/coupons/preview?codigo=XXXX — previsualización de cupón sin consumir usos. */
export async function GET(request: Request): Promise<NextResponse> {
  const rl = await checkEndpointRateLimit({
    bucket: "coupons-preview",
    key: trustedClientIp(request.headers) || "local",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const sp = new URL(request.url).searchParams;
  const code = (sp.get("codigo") ?? sp.get("code") ?? "").trim();
  if (!code) {
    return NextResponse.json(
      { valid: false, reason: "no_existe", error: "Escribe un código para validarlo." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const ctx = await optionalPublicDbSession(request);
  if (!ctx) {
    return NextResponse.json(
      { valid: false, error: "Cuentas no configuradas." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const res = await validateCouponPreview(ctx.db, {
    code,
    userId: ctx.userId,
    now: new Date(),
  });

  if (!res.valid) {
    return NextResponse.json(
      {
        valid: false,
        reason: res.reason,
        error: COUPON_ERROR_COPY[res.reason].message,
        coupon: res.coupon
          ? {
              code: res.coupon.code,
              days: res.coupon.days,
              expiresAtIso: res.coupon.expiresAt ? res.coupon.expiresAt.toISOString() : null,
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      valid: true,
      coupon: {
        code: res.coupon.code,
        days: res.coupon.days,
        expiresAtIso: res.coupon.expiresAt ? res.coupon.expiresAt.toISOString() : null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
