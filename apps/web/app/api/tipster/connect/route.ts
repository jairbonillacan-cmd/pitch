import { NextResponse } from "next/server";
import { setConnectAccount, tipsterProfileForUser } from "@pitchlab/db";
import { withMemberMutation } from "../../../../src/server/api-guards";
import { createExpressAccount, createOnboardingLink } from "../../../../src/server/billing/connect";
import { paymentMode } from "../../../../src/server/billing/payment-mode";
import { trustedAppBaseUrl } from "../../../../src/server/request-security";
import { logSecurityEvent } from "../../../../src/server/safe-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withMemberMutation(
  {
    bucket: "tipster-connect",
    limit: 15,
    windowMs: 60_000,
    failClosed: true,
    requireJson: false,
  },
  async ({ request, user }) => {
    if (paymentMode() === "transfer") {
      return NextResponse.json(
        { error: "Las comisiones se liquidan manualmente por transferencia durante Beta 1.0." },
        { status: 409 },
      );
    }

    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Cobro no configurado" }, { status: 503 });
    }

    const row = await tipsterProfileForUser(user.db, user.userId);
    if (!row) {
      return NextResponse.json({ error: "Tu cuenta no es de tipster oficial" }, { status: 403 });
    }

    let baseUrl: string;
    try {
      baseUrl = trustedAppBaseUrl(request);
    } catch (err) {
      logSecurityEvent("error", "tipster_connect_invalid_base_url", {
        userId: user.userId,
        error: err,
      });
      return NextResponse.json({ error: "Cobro no configurado" }, { status: 503 });
    }

    try {
      let accountId = row.profile.stripeConnectAccountId;
      if (!accountId) {
        accountId = await createExpressAccount(apiKey, {
          email: row.email,
          tipsterUserId: user.userId,
          handle: row.profile.handle,
        });
        await setConnectAccount(user.db, user.userId, accountId);
      }
      const url = await createOnboardingLink(apiKey, {
        accountId,
        baseUrl,
      });
      return NextResponse.json({ url, payoutsEnabled: row.profile.connectPayoutsEnabled });
    } catch (err) {
      logSecurityEvent("error", "tipster_connect_failed", { userId: user.userId, error: err });
      return NextResponse.json({ error: "No se pudo abrir el alta de pagos" }, { status: 502 });
    }
  },
);
