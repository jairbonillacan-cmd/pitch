import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import {
  PlatformProvider,
  SignupPreviewPanel,
  SignupSurfaceV4,
  buildPlatformDataset,
  checkBirthDate,
  compareModelWithHouseOdds,
  exampleHouseAmerican,
  flushSignupDetails,
  resolveSignupInvite,
  selectSignupPreviewMarket,
  submitSignupDetails,
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
    expect(html).toContain('autoComplete="bday-month"');
    expect(html).toContain('autoComplete="bday-year"');
    expect(html).toContain("<select");
    expect(html).toContain('role="group"');
    expect(html).toContain("Sugerencias calculadas aquí (sin verificar disponibilidad):");
    expect(html).toContain("@ana");
    expect(html).toContain("@ana2");
    expect(html).toContain("@ana3");
    expect((html.match(/class="pl-handle-chip"/g) ?? []).length).toBe(3);
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

describe("Contrato C2 · Turnstile y recuperación en flushSignupDetails", () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      configurable: true,
      writable: true,
    });
  });

  it("conserva los datos pendientes y devuelve captcha_required ante HTTP 403 verificacion_humana_requerida", async () => {
    const store = new Map<string, string>();
    const localStorageMock = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      key: (idx: number) => [...store.keys()][idx] ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
    };
    Object.defineProperty(globalThis, "window", {
      value: { localStorage: localStorageMock },
      configurable: true,
      writable: true,
    });
    const fetchMock = vi.fn().mockResolvedValue({
      status: 403,
      ok: false,
      json: async () => ({ error: "verificacion_humana_requerida" }),
    });
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      configurable: true,
      writable: true,
    });

    submitSignupDetails({
      email: "ana@gmail.com",
      displayName: "Ana López",
      handle: "ana_lopez",
      birthDate: "1998-04-12",
      consents: {
        terms: true,
        analytics: false,
        marketing: false,
        version: "2026-11-11",
      },
    });

    const result = await flushSignupDetails("ana@gmail.com", "ts-token-123");
    expect(result).toEqual({ status: "captcha_required" });
    expect(store.get("pitchlab.signup.details")).toBeTruthy();

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      turnstileToken: "ts-token-123",
      handle: "ana_lopez",
    });
  });
});
