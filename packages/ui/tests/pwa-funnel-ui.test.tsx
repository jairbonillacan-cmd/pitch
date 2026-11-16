import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { AccountReferralsClubView } from "../src/platform/club/AccountReferralsClubView";
import { FounderAdminClubView, type AdminFunnelSummary } from "../src/platform/club/FounderAdminClubView";
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  ANALYTICS_SID_STORAGE_KEY,
  hasLocalAnalyticsConsent,
  syncLocalAnalyticsConsent,
} from "../src/platform/funnel-consent";
import { buildPlatformDataset } from "../src/platform/match-picks-engine";
import { PlatformProvider } from "../src/platform/platform-provider";

const EMPTY_DATASET = buildPlatformDataset([]);

function installMockStorageWindow() {
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  (globalThis as unknown as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => local.get(k) ?? null,
      setItem: (k: string, v: string) => {
        local.set(k, v);
      },
      removeItem: (k: string) => {
        local.delete(k);
      },
    },
    sessionStorage: {
      getItem: (k: string) => session.get(k) ?? null,
      setItem: (k: string, v: string) => {
        session.set(k, v);
      },
      removeItem: (k: string) => {
        session.delete(k);
      },
    },
  };
  return { local, session };
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("Preferencias PWA/Push, embudo Admin y consentimiento local", () => {
  it("oculta en Preferencias los envíos periódicos, Web Push e instalación PWA que aún no se ofrecen", () => {
    const prefsHtml = renderToStaticMarkup(
      <PlatformProvider
        dataset={EMPTY_DATASET}
        initialRole="member"
        accountsEnabled={true}
        allowRoleSimulation={false}
      >
        <AccountReferralsClubView
          initialTab="prefs"
          storyOverride={{
            accountsEnabled: true,
            profile: { handle: "carlos_mx", displayName: "Carlos Méndez", email: "carlos@pitchlab.mx" },
            prefs: {
              accountsEnabled: true,
              email: "carlos@pitchlab.mx",
              visualStyle: "solid",
            },
          }}
        />
      </PlatformProvider>,
    );

    expect(prefsHtml).toContain("Estilo");
    expect(prefsHtml).toContain("Cristal");
    expect(prefsHtml).toContain("Sólido");
    expect(prefsHtml).toContain("Madrid · España");
    expect(prefsHtml).not.toContain("Resumen semanal por correo");
    expect(prefsHtml).not.toContain("Corte mensual de Mi récord");
    expect(prefsHtml).not.toContain("Notificaciones push en este dispositivo");
    expect(prefsHtml).not.toContain("Instalar PitchLab como app");
    expect(prefsHtml).not.toContain("Instalar app");
  });

  it("renderiza tabla semántica del embudo propio en FounderAdminClubView", () => {
    const storyFunnel: AdminFunnelSummary = {
      windowDays: 30,
      generatedAtIso: "2026-11-15T12:00:00.000Z",
      stages: [
        { stage: "landing", order: 1, label: "Visita a landing", count30d: 420, conversionFromPrevPct: null, conversionFromLandingPct: 100 },
        { stage: "signup_step1", order: 2, label: "Inicio paso 1 (cuenta)", count30d: 168, conversionFromPrevPct: 40, conversionFromLandingPct: 40 },
        { stage: "signup_step2", order: 3, label: "Completa paso 2 (perfil)", count30d: 126, conversionFromPrevPct: 75, conversionFromLandingPct: 30 },
        { stage: "first_sealed_pick", order: 4, label: "Primer pick sellado", count30d: 88, conversionFromPrevPct: 69.8, conversionFromLandingPct: 21 },
        { stage: "spei_transfer", order: 5, label: "Solicitud SPEI", count30d: 31, conversionFromPrevPct: 35.2, conversionFromLandingPct: 7.4 },
        { stage: "coupon_redeemed", order: 6, label: "Cupón canjeado", count30d: 26, conversionFromPrevPct: 83.9, conversionFromLandingPct: 6.2 },
      ],
    };

    const html = renderToStaticMarkup(
      <PlatformProvider
        dataset={EMPTY_DATASET}
        initialRole="admin"
        accountsEnabled={true}
        allowRoleSimulation={false}
      >
        <FounderAdminClubView
          showDataHealth={false}
          storyModeration={{ pendingQueue: [], hiddenItems: [], pausedMembers: [] }}
          storyFunnel={storyFunnel}
        />
      </PlatformProvider>,
    );

    expect(html).toContain("Embudo propio");
    expect(html).toContain("<table");
    expect(html).toContain('<caption class="sr-only">');
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain("Visita a landing");
    expect(html).toContain("Cupón canjeado");
    expect(html).toContain("420");
    expect(html).toContain("40.0 %");
  });

  it("nunca crea identificador ni activa consentimiento local si la persona no aceptó analyticsConsent", () => {
    const { local } = installMockStorageWindow();

    expect(hasLocalAnalyticsConsent()).toBe(false);
    expect(syncLocalAnalyticsConsent(false)).toBeNull();
    expect(local.has(ANALYTICS_CONSENT_STORAGE_KEY)).toBe(false);
    expect(local.has(ANALYTICS_SID_STORAGE_KEY)).toBe(false);

    const sid = syncLocalAnalyticsConsent(true);
    expect(sid).toMatch(/^pl-/);
    expect(hasLocalAnalyticsConsent()).toBe(true);
    expect(local.get(ANALYTICS_SID_STORAGE_KEY)).toBe(sid);

    expect(syncLocalAnalyticsConsent(false)).toBeNull();
    expect(hasLocalAnalyticsConsent()).toBe(false);
    expect(local.has(ANALYTICS_SID_STORAGE_KEY)).toBe(false);
  });
});
