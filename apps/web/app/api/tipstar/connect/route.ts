import { NextResponse } from "next/server";
import { setConnectAccount, tipstarProfileForUser } from "@pitchlab/db";
import { createExpressAccount, createOnboardingLink } from "../../../../src/server/billing/connect";
import { verifySameOriginMutation } from "../../../../src/server/request-security";
import { requireMember } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tipstar/connect → { url } del alta en Stripe Connect Express.
 * Crea la cuenta conectada la primera vez; después devuelve el enlace para completar datos.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request, { requireJson: false });
  if (csrfError) return csrfError;

  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) return NextResponse.json({ error: "Cobro no configurado" }, { status: 503 });
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  const row = await tipstarProfileForUser(member.db, member.userId);
  if (!row) return NextResponse.json({ error: "Tu cuenta no es de tipstar oficial" }, { status: 403 });

  try {
    let accountId = row.profile.stripeConnectAccountId;
    if (!accountId) {
      accountId = await createExpressAccount(apiKey, {
        email: row.email,
        tipstarUserId: member.userId,
        handle: row.profile.handle,
      });
      await setConnectAccount(member.db, member.userId, accountId);
    }
    const url = await createOnboardingLink(apiKey, {
      accountId,
      baseUrl: process.env.BETTER_AUTH_URL ?? new URL(request.url).origin,
    });
    return NextResponse.json({ url, payoutsEnabled: row.profile.connectPayoutsEnabled });
  } catch (err) {
    console.error("[tipstar-connect]", err);
    return NextResponse.json({ error: "No se pudo abrir el alta de pagos" }, { status: 502 });
  }
}
