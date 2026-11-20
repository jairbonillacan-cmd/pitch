import { NextResponse } from "next/server";
import { redeemAccessCoupon } from "@pitchlab/db";
import { recordMemberFunnelIfConsented } from "../../../../src/server/funnel";
import { getMailer } from "../../../../src/server/mailer";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  trustedClientIp,
  verifySameOriginMutation,
} from "../../../../src/server/request-security";
import { requireMember } from "../../../../src/server/session-user";
import { sendTransferRedeemedEmails } from "../../../../src/server/transfer-emails";
import { COUPON_ERROR_COPY } from "../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/me/redeem { code } — canjea un cupón de acceso temporal (atómico, 1 vez por socio). */
export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const member = await requireMember(request);
  if ("error" in member) return member.error;

  const rl = await checkEndpointRateLimit({
    bucket: "me-coupons-redeem",
    key: `${member.userId}:${trustedClientIp(request.headers) || "local"}`,
    limit: 10,
    windowMs: 3_600_000,
  });
  if (!rl.allowed) {
    return rateLimitResponse(
      rl.retryAfterSeconds,
      "Alcanzaste el límite de intentos de canje por hora. Intenta más tarde.",
    );
  }

  const body = (await request.json().catch(() => null)) as { code?: unknown; codigo?: unknown } | null;
  const rawCode = typeof body?.code === "string" ? body.code : typeof body?.codigo === "string" ? body.codigo : "";
  if (!rawCode.trim()) {
    return NextResponse.json({ ok: false, error: "Escribe el código de tu cupón." }, { status: 400 });
  }

  const now = new Date();
  const res = await redeemAccessCoupon(member.db, {
    userId: member.userId,
    code: rawCode,
    now,
  });

  if (!res.ok) {
    const info = COUPON_ERROR_COPY[res.reason];
    return NextResponse.json(
      { ok: false, reason: res.reason, error: info.message },
      { status: info.status },
    );
  }

  if (res.transferActivated) {
    await sendTransferRedeemedEmails(member.db, getMailer(), {
      activated: res.transferActivated,
      newAccessUntil: res.newAccessUntil,
      now,
    });
  }

  await recordMemberFunnelIfConsented(
    member.db,
    member.userId,
    "coupon_redeemed",
    "/app/canjear",
    { grantId: res.grantId, transferActivated: Boolean(res.transferActivated) },
    now,
  );

  return NextResponse.json(
    {
      ok: true,
      code: res.coupon.code,
      days: res.coupon.days,
      grantId: res.grantId,
      transferActivated: Boolean(res.transferActivated),
      newAccessUntilIso: res.newAccessUntil ? res.newAccessUntil.toISOString() : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
