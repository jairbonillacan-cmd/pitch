import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ReferralInviteSurface,
  resolveReferralInvite,
} from "../src/index";

describe("ReferralInviteSurface & resolveReferralInvite", () => {
  it("resolves monthly and annual socio invites with clean pricing and signup code link", () => {
    const monthly = resolveReferralInvite({
      sku: "sku_iFHd43ge7daR",
      interval: "MONTHLY",
      code: "75Z5-FY0D-DWJR-WM59",
    });
    expect(monthly.code).toBe("75Z5-FY0D-DWJR-WM59");
    expect(monthly.interval).toBe("monthly");
    expect(monthly.expired).toBe(false);
    expect(monthly.headlineMuted).toContain("$209 MXN");
    expect(monthly.signupHref).toBe("/signup?code=75Z5-FY0D-DWJR-WM59");
    // Sin remitente explícito ni código de catálogo, no inventa handles de usuarios.
    expect(monthly.senderDisplay).toBe("Pase PitchLab Ultra");

    const annual = resolveReferralInvite({
      interval: "ANNUAL",
      code: "SOCIO-8842",
      accountsEnabled: false,
    });
    expect(annual.interval).toBe("annual");
    expect(annual.headlineMuted).toContain("$2,390 MXN");
    expect(annual.senderDisplay).toBe("@socio_pl");
    expect(annual.isExampleSender).toBe(true);
  });

  it("resolves Tipstar and expired invite variants cleanly", () => {
    const tipstar = resolveReferralInvite({
      code: "SOFIA5",
      accountsEnabled: false,
    });
    expect(tipstar.headlineLead).toBe("5 días de PitchLab ");
    expect(tipstar.cardTier).toBe("ULTRA · TIPSTAR");
    expect(tipstar.senderDisplay).toBe("@sofia_nfl");
    expect(tipstar.isExampleSender).toBe(true);

    const expired = resolveReferralInvite({
      code: "VENCIDO-2024",
    });
    expect(expired.expired).toBe(true);
    expect(expired.signupHref).toBe("/signup");
    expect(expired.ctaLabel).toBe("Empezar 7 días sin costo");
  });

  it("renders SSR HTML cleanly with Ultra wordmark, subscribe anchor, and zero engine jargon", () => {
    const html = renderToStaticMarkup(
      <ReferralInviteSurface
        sku="sku_iFHd43ge7daR"
        interval="MONTHLY"
        code="75Z5-FY0D-DWJR-WM59"
        senderHandle="socio_pl"
      />,
    );

    expect(html).toContain('id="subscribe"');
    expect(html).toContain("pl-referral-ultra-word");
    expect(html).toContain("Aceptar invitación");
    expect(html).toContain("/signup?code=75Z5-FY0D-DWJR-WM59");
    expect(html).toContain("@socio_pl");
    expect(html.toLowerCase()).not.toContain("tachyon");
    expect(html.toLowerCase()).not.toContain("geodesic");
    expect(html.toLowerCase()).not.toContain("cero fuga");
  });
});
