import { NextResponse } from "next/server";
import { setConnectAccount, tipsterProfileForUser } from "@pitchlab/db";
import { createExpressAccount, createOnboardingLink } from "../../../../src/server/billing/connect";
import { paymentMode } from "../../../../src/server/billing/payment-mode";
import {
  trustedAppBaseUrl,
  verifySameOriginMutation,
} from "../../../../src/server/request-security";
import { requireMember } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tipster/connect → { url } del alta en Stripe Connect Express.
 * En modo `transfer` (Beta 1.0) responde 409 porque las comisiones se liquidan manualmente.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request, { requireJson: false });
  if (csrfError) return csrfError;

  if (paymentMode() === "transfer") {
    return NextResponse.json(
      { error: "Las comisiones se liquidan manualmente por transferencia durante Beta 1.0." },
      { status: 409 },
    );
  }

  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) return NextResponse.json({ error: "Cobro no configurado" }, { status: 503 });
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  const row = await tipsterProfileForUser(member.db, member.userId);
  if (!row) return NextResponse.json({ error: "Tu cuenta no es de tipster oficial" }, { status: 403 });

  let baseUrl: string;
  try {
    baseUrl = trustedAppBaseUrl(request);
  } catch (err) {
    console.error("[tipster-connect] baseUrl inválida:", err);
    return NextResponse.json({ error: "Cobro no configurado" }, { status: 503 });
  }

  try {
    let accountId = row.profile.stripeConnectAccountId;
    if (!accountId) {
      accountId = await createExpressAccount(apiKey, {
        email: row.email,
        tipsterUserId: member.userId,
        handle: row.profile.handle,
      });
      await setConnectAccount(member.db, member.userId, accountId);
    }
    const url = await createOnboardingLink(apiKey, {
      accountId,
      baseUrl,
    });
    return NextResponse.json({ url, payoutsEnabled: row.profile.connectPayoutsEnabled });
  } catch (err) {
    console.error("[tipster-connect]", err);
    return NextResponse.json({ error: "No se pudo abrir el alta de pagos" }, { status: 502 });
  }
}
