import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import {
  PlatformProvider,
  SignupPreviewPanel,
  SignupSurfaceV4,
  buildPlatformDataset,
  checkBirthDate,
  compareModelWithHouseOdds,
  exampleHouseAmerican,
  resolveSignupInvite,
  selectSignupPreviewMarket,
  type LandingHeroLeagueCard,
} from "../src/index";

const EMPTY_DATASET = buildPlatformDataset([]);

const CARD: LandingHeroLeagueCard = {
  league: asLeagueId("liga-mx"),
  leagueShort: "Liga MX",
  leagueLabel: "Liga MX",
  roundLabel: "Liga MX · J17",
  whenLabel: "Sáb 14 nov · 17:00",
  home: { slug: "queretaro", name: "Querétaro", note: "Local" },
  away: { slug: "monterrey", name: "Monterrey", note: "Visitante" },
  splitProbabilities: [0.277, 0.252, 0.471],
  splitLabels: ["Querétaro", "Empate", "Monterrey"],
  mostProbable: {
    label: "Monterrey gana",
    p: 0.471,
    fairAmerican: "+112",
    fairDecimal: "2.12",
  },
  otherMarkets: [],
};

describe("SignupSurfaceV4 (SIGNUP-2)", () => {
  it("paso 1: copy exacto, un h1, sin campo de código y con aviso de invitación", () => {
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={EMPTY_DATASET} initialRole="visitor">
        <SignupSurfaceV4 initialPromoCode="SOFIA5" />
      </PlatformProvider>,
    );
    expect(html).toContain("Crea tu cuenta");
    expect(html).toContain("7 días gratis, sin tarjeta. Al terminar decides si sigues.");
    expect(html).toContain("Sofía te invitó.");
    expect(html).toContain('data-testid="invite-notice"');
    expect(html).toContain('id="auth-email"');
    expect(html).not.toContain("auth-promo");
    expect(html.match(/<h1/g)?.length).toBe(1);
    expect(html).not.toMatch(/Primer mes gratis|ROI|Kelly/);
  });

  it("paso 2: tres consentimientos y Crear cuenta deshabilitado", () => {
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={EMPTY_DATASET} initialRole="visitor">
        <SignupSurfaceV4 initialStep="details" initialEmail="ana@gmail.com" />
      </PlatformProvider>,
    );
    expect(html).toContain("Unos datos más");
    expect(html).toContain("Obligatorio");
    expect(html.match(/Opcional/g)?.length).toBe(2);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Crear cuenta<\/button>/);
    expect(html).toContain('autoComplete="bday-day"');
  });

  it("invitación: nombre del creador, código sin nombre o nada", () => {
    expect(resolveSignupInvite("sofia5")).toEqual({
      code: "SOFIA5",
      inviterName: "Sofía",
      freeDays: 5,
    });
    expect(resolveSignupInvite("AMIGO10")).toEqual({
      code: "AMIGO10",
      inviterName: null,
      freeDays: 7,
    });
    expect(resolveSignupInvite("  ")).toBeNull();
  });

  it("edad: incompleta, inexistente, menor de 18 y válida", () => {
    const today = new Date(2026, 10, 11);
    expect(checkBirthDate("", "1", "2000", today)).toEqual({ ok: false, reason: "incomplete" });
    expect(checkBirthDate("30", "2", "2000", today)).toEqual({ ok: false, reason: "invalid" });
    expect(checkBirthDate("12", "11", "2008", today)).toEqual({ ok: false, reason: "underage" });
    expect(checkBirthDate("11", "11", "2008", today)).toEqual({ ok: true, iso: "2008-11-11" });
  });

  it("vista previa: doble oportunidad y diferencia contra −200", () => {
    const market = selectSignupPreviewMarket(CARD);
    expect(market.label).toBe("Monterrey o empate");
    expect(market.p).toBeCloseTo(0.723, 3);
    expect(market.fairAmerican).toBe("−261");
    const cmp = compareModelWithHouseOdds(market.p, exampleHouseAmerican(market.p));
    expect(cmp.houseAmerican).toBe("−200");
    expect(cmp.impliedPct).toBe("66.7");
    expect(cmp.diffPts).toBe("+5.6");

    const html = renderToStaticMarkup(<SignupPreviewPanel card={CARD} />);
    expect(html).toContain("Compara su momio justo");
    expect(html).toContain("+5.6 pts");
  });
});
