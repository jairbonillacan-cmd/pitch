import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  LeagueSnapshotSchema,
  snapshotToMatchAnalyses,
  type LeagueId,
} from "@pitchlab/contracts";
import {
  AccountReferralsClubView,
  annualSavingsMxn,
  buildInviteShareMessage,
  buildPlatformDataset,
  buildWhatsAppShareHref,
  buildXShareHref,
  deriveExampleReferralCode,
  formatKickoffByTimezone,
  formatShortInviteDisplay,
  formatShortInviteUrl,
  formatUnitsAsMxn,
  normalizeReferralCode,
  PlatformProvider,
  referralEarnedDays,
  toggleLeagueSelection,
  validateMexicanRfc,
  type RawLeagueInput,
} from "../src/index";

function loadSnapshot(leagueKey: "liga-mx" | "nfl"): RawLeagueInput {
  const file = path.resolve(
    import.meta.dirname,
    "../../../data/snapshots",
    leagueKey,
    "latest.json",
  );
  const parsed = LeagueSnapshotSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  const { matches } = snapshotToMatchAnalyses(parsed);
  return {
    league: parsed.league,
    leagueLabel: leagueKey === "nfl" ? "NFL" : "Liga MX",
    sport: leagueKey === "nfl" ? "american-football" : "football",
    season: parsed.seasonLabel,
    roundLabel: parsed.periodLabel,
    generatedAt: parsed.updatedAt,
    games: matches,
    standings: parsed.standings,
  };
}

const dataset = buildPlatformDataset([
  loadSnapshot("liga-mx"),
  loadSnapshot("nfl"),
]);

describe("Mi cuenta · Fase A (Invitar amigos y helpers)", () => {
  it("computes referralEarnedDays accurately for 0, 1, 4, 5 and 7 friends", () => {
    expect(referralEarnedDays(0)).toBe(0);
    expect(referralEarnedDays(1)).toBe(15);
    expect(referralEarnedDays(4)).toBe(60);
    expect(referralEarnedDays(5)).toBe(105);
    expect(referralEarnedDays(7)).toBe(135);
    expect(annualSavingsMxn()).toBe(1198);
  });

  it("formats short invite link and share message in uppercase without extra query params", () => {
    expect(normalizeReferralCode("jair-2611")).toBe("JAIR-2611");
    expect(normalizeReferralCode("  sofia-5  ")).toBe("SOFIA-5");
    expect(normalizeReferralCode("abc")).toBeNull();
    expect(normalizeReferralCode("bad code!")).toBeNull();
    expect(normalizeReferralCode("A".repeat(25))).toBeNull();

    expect(deriveExampleReferralCode("@jair")).toBe("JAIR-2611");
    expect(formatShortInviteDisplay("jair-2611")).toBe("pitchlab.mx/i/JAIR-2611");
    expect(formatShortInviteUrl("jair-2611")).toBe("https://pitchlab.mx/i/JAIR-2611");

    const msg = buildInviteShareMessage("jair-2611");
    expect(msg).toContain("https://pitchlab.mx/i/JAIR-2611");
    expect(msg).toContain("7 días sin costo");
    expect(msg).toContain("$209 MXN");
    expect(msg).toContain("+15 días");
    expect(msg).not.toContain("sku=");
    expect(msg).not.toContain("interval=");
    expect(msg).not.toContain("#subscribe");

    expect(buildWhatsAppShareHref("jair-2611")).toBe(
      `https://wa.me/?text=${encodeURIComponent(msg)}`,
    );
    expect(buildXShareHref("jair-2611")).toBe(
      `https://x.com/intent/post?text=${encodeURIComponent(msg)}`,
    );
  });

  it("prevents removing the last active league in toggleLeagueSelection", () => {
    const nfl = "nfl" as LeagueId;
    const ligaMx = "liga-mx" as LeagueId;

    const twoToOne = toggleLeagueSelection([nfl, ligaMx], ligaMx);
    expect(twoToOne.blockedLast).toBe(false);
    expect(twoToOne.next).toEqual([nfl]);

    const lastAttempt = toggleLeagueSelection([nfl], nfl);
    expect(lastAttempt.blockedLast).toBe(true);
    expect(lastAttempt.next).toEqual([nfl]);
  });

  it("marks all sample data with Ejemplo when accountsEnabled is false and hides simulator by default", () => {
    const html = renderToStaticMarkup(
      <PlatformProvider
        dataset={dataset}
        initialRole="member"
        accountsEnabled={false}
        allowRoleSimulation={false}
      >
        <AccountReferralsClubView />
      </PlatformProvider>,
    );

    expect(html).toContain("Mi cuenta");
    expect(html).toContain("@jair");
    expect(html).toContain("JAIR-2611");
    expect(html).toContain("pitchlab.mx/i/JAIR-2611");
    expect(html).toContain("Contenido de ejemplo");

    const badgeMatches = html.match(/data-example-badge=""/g) ?? [];
    expect(badgeMatches.length).toBeGreaterThanOrEqual(3);

    expect(html).toContain('data-copy-short-link=""');
    expect(html).not.toContain("Copiar enlace");
    expect(html).not.toContain("Simular pago de un amigo");
    expect(html).not.toContain("Ver portada pública");
    expect(html).not.toContain("SOCIO-8842");
    expect(html).not.toContain("sku=ultra");
  });

  it("renders role simulator only inside Simulador block when allowRoleSimulation is true", () => {
    const html = renderToStaticMarkup(
      <PlatformProvider
        dataset={dataset}
        initialRole="member"
        accountsEnabled={false}
        allowRoleSimulation={true}
      >
        <AccountReferralsClubView />
      </PlatformProvider>,
    );

    expect(html).toContain('aria-label="Simulador"');
    expect(html).toContain("Simular pago de un amigo");
  });

  it("shows honest states when accountsEnabled is true (generating code vs empty real account)", () => {
    const generatingHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member" accountsEnabled={true}>
        <AccountReferralsClubView
          storyOverride={{
            accountsEnabled: true,
            invite: {
              accountsEnabled: true,
              referralCode: null,
              paidFriends: 0,
              pendingFriends: 0,
              loading: false,
            },
          }}
        />
      </PlatformProvider>,
    );
    expect(generatingHtml).toContain("Generando tu código…");
    expect(generatingHtml).not.toContain("JAIR-2611");

    const emptyRealHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member" accountsEnabled={true}>
        <AccountReferralsClubView
          storyOverride={{
            accountsEnabled: true,
            profile: { handle: "carlos_mx", displayName: "Carlos M." },
            invite: {
              accountsEnabled: true,
              referralCode: "CARLOS-9012",
              paidFriends: 0,
              pendingFriends: 0,
              loading: false,
            },
          }}
        />
      </PlatformProvider>,
    );
    expect(emptyRealHtml).toContain("@carlos_mx");
    expect(emptyRealHtml).toContain("CARLOS-9012");
    expect(emptyRealHtml).toContain("Aún no invitas a nadie. Comparte tu enlace.");
    expect(emptyRealHtml).not.toContain("Veces que abrieron tu enlace");
    expect(emptyRealHtml).not.toContain("Mariana T.");
  });

  it("renders CFDI tab without dummy RFC or razon social values", () => {
    const cfdiHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member" accountsEnabled={false}>
        <AccountReferralsClubView initialTab="cfdi" />
      </PlatformProvider>,
    );

    expect(cfdiHtml).toContain("Facturación CFDI 4.0");
    expect(cfdiHtml).not.toContain("XAXX010101000");
    expect(cfdiHtml).not.toContain("SOCIO PITCHLAB SA DE CV");
  });

  it("renders Mi plan in prueba, mensual, anual and sin_renovacion with MEMBERSHIP_SPEC savings and zero forbidden copy", () => {
    const trialHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member" accountsEnabled={false}>
        <AccountReferralsClubView initialTab="plan" />
      </PlatformProvider>,
    );
    expect(trialHtml).toContain("Contenido de ejemplo");
    expect(trialHtml).toContain("Prueba · quedan 4 días");
    expect(trialHtml).toContain("Sin cobro automático");
    expect(trialHtml).toContain("1,198");
    expect(trialHtml).toContain("data-example-badge=\"\"");
    expect(trialHtml).not.toContain("Cancelar en 1 clic");
    expect(trialHtml).not.toContain("Mantener Mensual");
    expect(trialHtml.toLowerCase()).not.toContain("gana ");

    const monthlyHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member" accountsEnabled={false}>
        <AccountReferralsClubView
          initialTab="plan"
          storyOverride={{
            accountsEnabled: false,
            plan: { accountsEnabled: false, planState: "mensual", paidFriends: 2 },
          }}
        />
      </PlatformProvider>,
    );
    expect(monthlyHtml).toContain("Pase PitchLab Ultra mensual");
    expect(monthlyHtml).toContain("+30 días");
    expect(monthlyHtml).toContain("Tu próximo cobro se recorre al");
    expect(monthlyHtml).toContain("Cancelar renovación");

    const cancelledHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member" accountsEnabled={false}>
        <AccountReferralsClubView
          initialTab="plan"
          storyOverride={{
            accountsEnabled: false,
            plan: { accountsEnabled: false, planState: "sin_renovacion", paidFriends: 2 },
          }}
        />
      </PlatformProvider>,
    );
    expect(cancelledHtml).toContain("Sin renovación");
    expect(cancelledHtml).toContain("Tienes acceso hasta el");
    expect(cancelledHtml).toContain("Sumados a tu acceso hasta el");
    expect(cancelledHtml).not.toContain("próximo cobro");
    expect(cancelledHtml).toContain("Reactivar renovación");

    const realAccountPlanHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member" accountsEnabled={true}>
        <AccountReferralsClubView
          initialTab="plan"
          initialServerReferrals={{
            referralCode: "REAL-7788",
            paidFriends: 1,
            pendingFriends: 0,
            handle: "carlos_mx",
            displayName: "Carlos M.",
          }}
          initialServerPlan={{
            active: true,
            planState: "mensual",
            interval: "monthly",
            hasCard: true,
            cancelAtPeriodEnd: false,
            accessUntilIso: "2027-01-15T12:00:00Z",
            currentPeriodEndIso: "2026-12-31T12:00:00Z",
            memberSinceIso: "2026-10-01T12:00:00Z",
            trialDaysRemaining: 0,
            paidFriends: 1,
            earnedDays: 15,
            stripeConfigured: true,
          }}
        />
      </PlatformProvider>,
    );
    expect(realAccountPlanHtml).toContain("REAL-7788");
    expect(realAccountPlanHtml).toContain("Aún no tienes cobros registrados.");
    expect(realAccountPlanHtml).not.toContain("@mariana_t");
    expect(realAccountPlanHtml).not.toContain("data-example-badge=\"\"");
  });

  it("validates Mexican SAT RFC format and formats timezone kickoffs and MXN balance", () => {
    expect(validateMexicanRfc("ABCD890123XYZ", "612").valid).toBe(true);
    expect(validateMexicanRfc("ABC890123XYZ", "601").valid).toBe(true);
    expect(validateMexicanRfc("ABC890123XYZ", "612").valid).toBe(false);
    expect(validateMexicanRfc("ABCD890123XYZ", "601").valid).toBe(false);
    expect(validateMexicanRfc("ABCD891399XYZ", "612").valid).toBe(false);

    expect(
      formatKickoffByTimezone("2026-11-12T01:00:00Z", "19:00", "America/Mexico_City"),
    ).toBe("19:00");
    expect(
      formatKickoffByTimezone("2026-11-12T01:00:00Z", "19:00", "America/Tijuana"),
    ).toBe("17:00");
    expect(
      formatKickoffByTimezone("2026-11-12T01:00:00Z", "19:00", "America/Cancun"),
    ).toBe("20:00");
    expect(
      formatKickoffByTimezone("2026-11-12T01:00:00Z", "19:00", "America/Hermosillo"),
    ).toBe("18:00");

    expect(formatUnitsAsMxn(6.4, 250)).toBe("+$1,600 MXN");
    expect(formatUnitsAsMxn(-2, 250)).toBe("−$500 MXN");
    expect(formatUnitsAsMxn(0, 250)).toBe("$0 MXN");
  });

  it("renders Preferencias with all 6 groups, Example badge on sample MXN preview without accounts, and zero forbidden copy", () => {
    const prefsNoAccountsHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member" accountsEnabled={false}>
        <AccountReferralsClubView
          initialTab="prefs"
          storyOverride={{
            accountsEnabled: false,
            prefs: {
              accountsEnabled: false,
              initialPrefs: { showMxnBalance: true, unitMxn: 250 },
            },
          }}
        />
      </PlatformProvider>,
    );

    expect(prefsNoAccountsHtml).toContain("Los cambios se guardan solos");
    expect(prefsNoAccountsHtml).toContain("Tus ligas");
    expect(prefsNoAccountsHtml).toContain("Cómo ves los datos");
    expect(prefsNoAccountsHtml).toContain("Picks y parlays");
    expect(prefsNoAccountsHtml).toContain("Alertas");
    expect(prefsNoAccountsHtml).toContain("Privacidad");
    expect(prefsNoAccountsHtml).toContain("Juego responsable");
    expect(prefsNoAccountsHtml).toContain("PitchLab no sugiere cuánto apostar");
    expect(prefsNoAccountsHtml).toContain('data-example-badge=""');
    expect(prefsNoAccountsHtml).toContain("Disponible cuando se activen las cuentas con correo.");

    expect(prefsNoAccountsHtml).not.toContain("Simulador de stake");
    expect(prefsNoAccountsHtml).not.toContain("Autoexclusión");
    expect(prefsNoAccountsHtml).not.toContain("Modo Pausa Social");
    expect(prefsNoAccountsHtml.toLowerCase()).not.toContain("sobrepaga");

    const prefsWithAccountsPausedHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member" accountsEnabled={true}>
        <AccountReferralsClubView
          initialTab="prefs"
          storyOverride={{
            accountsEnabled: true,
            profile: { handle: "carlos_mx", email: "carlos@pitchlab.mx" },
            prefs: {
              accountsEnabled: true,
              email: "carlos@pitchlab.mx",
              initialPrefs: { pauseChoice: "7d" },
            },
          }}
        />
      </PlatformProvider>,
    );

    expect(prefsWithAccountsPausedHtml).toContain(
      "La pausa se aplicará cuando se active tu cuenta.",
    );
    expect(prefsWithAccountsPausedHtml).toContain("carlos@pitchlab.mx");
  });
});
