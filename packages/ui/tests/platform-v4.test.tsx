import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  LeagueSnapshotSchema,
  snapshotToMatchAnalyses,
} from "@pitchlab/contracts";
import {
  AccountReferralsClubView,
  buildPlatformDataset,
  buildPlayerPropsCatalog,
  buildSmartAutoParlay,
  canRevealPickOnShare,
  checkParlayCompatibility,
  computeParlaySummary,
  containsExternalLink,
  evaluatePropLineProbability,
  formatOddsValue,
  isDisposableEmailDomain,
  isPickUnlocked,
  LandingSurface,
  MatchStudioClubView,
  normalizeTrialEmail,
  ParlayBuilderClubView,
  PlatformProvider,
  PublicTipstarPickSurface,
  redactDatasetForVisitor,
  SocialVipClubView,
  type RawLeagueInput,
} from "../src/index.js";

const FORBIDDEN_UI_TERMS = [
  "dixon-coles",
  "poisson",
  "lightgbm",
  "platt",
  "pitágoras",
  "log5",
  "nflverse",
  "openfootball",
  "api-football",
  "polymarket",
  "kalshi",
  "understat",
  "espn",
];

function loadRealSnapshotInput(leagueKey: "liga-mx" | "nfl"): RawLeagueInput {
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

describe("PitchLab Spacetime Suite v2.1 & Liquid Glass Platform v4", () => {
  const dataset = buildPlatformDataset([
    loadRealSnapshotInput("liga-mx"),
    loadRealSnapshotInput("nfl"),
  ]);

  it("derives 5 structured picks + Cortex IA pre-game intel per match from real snapshots without forbidden leaks", () => {
    expect(dataset.games.length).toBeGreaterThan(4);
    expect(dataset.dailyPromoPickId).toBeTruthy();
    expect(dataset.tipstarWeeklyPickId).toBeTruthy();

    for (const game of dataset.games.slice(0, 8)) {
      expect(game.picks).toHaveLength(5);
      expect(game.preGame.cortexSynthesis.length).toBeGreaterThan(30);
      expect(game.markets.length).toBeGreaterThanOrEqual(8);

      const serialized = JSON.stringify(game).toLowerCase();
      for (const term of FORBIDDEN_UI_TERMS) {
        expect(serialized).not.toContain(term);
      }
    }
  });

  it("enforces Zero-Leakage server redaction for visitors while keeping FT games, 1 daily promo, and 1 Tipstar weekly pick open", () => {
    const redacted = redactDatasetForVisitor(dataset);
    expect(redacted.isServerRedactedForVisitor).toBe(true);

    const upcomingGames = redacted.games.filter((g) => g.status !== "FT");
    expect(upcomingGames.length).toBeGreaterThan(0);

    let unlockedUpcomingPicks = 0;
    let lockedUpcomingPicks = 0;

    for (const g of upcomingGames) {
      for (const pk of g.picks) {
        if (isPickUnlocked(pk, g.status, "visitor")) {
          unlockedUpcomingPicks += 1;
          expect(pk.isRedacted).toBeFalsy();
        } else {
          lockedUpcomingPicks += 1;
          expect(pk.isRedacted).toBe(true);
          expect(pk.label).toBe("Selección reservada Pase Total");
        }
      }
    }

    // Exactamente 2 picks abiertos próximos en toda la plataforma: 1 Promo del Día + 1 Semanal de Tipstar
    expect(unlockedUpcomingPicks).toBe(2);
    expect(lockedUpcomingPicks).toBeGreaterThan(5);

    const finishedGames = redacted.games.filter((g) => g.status === "FT");
    for (const fg of finishedGames.slice(0, 3)) {
      for (const pk of fg.picks) {
        expect(isPickUnlocked(pk, "FT", "visitor")).toBe(true);
      }
    }
  });

  it("enforces Q12 pre-kickoff Share Card sealing for regular subscribers while allowing FT and Tipstar weekly promo shares", () => {
    expect(canRevealPickOnShare("NS", "member", false)).toBe(false);
    expect(canRevealPickOnShare("LIVE", "member", false)).toBe(false);
    expect(canRevealPickOnShare("FT", "member", false)).toBe(true);
    expect(canRevealPickOnShare("NS", "tipstar", true)).toBe(true);
    expect(canRevealPickOnShare("NS", "member", true)).toBe(false);
  });

  it("blocks contradictory legs and enforces SGP 1-vs-2 picks per game with Geodesic correlation factor", () => {
    const targetGame = dataset.games.find((g) => g.status !== "FT") ?? dataset.games[0]!;
    const pickA = targetGame.picks[0]!;
    const pickCompatible =
      targetGame.picks.find(
        (p) =>
          p.id !== pickA.id &&
          p.conflictGroup !== pickA.conflictGroup &&
          checkParlayCompatibility([{ pick: pickA }], p, true).allowed,
      ) ?? targetGame.picks[2]!;

    // Con SGP apagado: máximo 1 selección por partido
    const withoutSgp = checkParlayCompatibility([{ pick: pickA }], pickCompatible, false);
    expect(withoutSgp.allowed).toBe(false);

    // Con SGP encendido: hasta 2 selecciones compatibles del mismo partido con correlación Geodesic
    const withSgp = checkParlayCompatibility([{ pick: pickA }], pickCompatible, true);
    expect(withSgp.allowed).toBe(true);

    const summary = computeParlaySummary([{ pick: pickA }, { pick: pickCompatible }], 1.5);
    expect(summary.hasSgpCorrelation).toBe(true);
    expect(summary.sgpPairsCount).toBe(1);
    expect(summary.combinedProbability).toBeGreaterThan(0);

    // Auto-armador genera el número pedido de selecciones sin contradicciones
    const autoNoSgp = buildSmartAutoParlay(dataset.games, {
      leagues: dataset.leagues.map((l) => l.league),
      risk: "medio",
      legCount: 3,
      allowSgp: false,
      viewerRole: "member",
    });
    expect(autoNoSgp).toHaveLength(3);
    const uniqueGameIds = new Set(autoNoSgp.map((l) => l.pick.gameId));
    expect(uniqueGameIds.size).toBe(3);
  });

  it("validates $0 MXN anti-abuse email normalization, disposable domain blocking, external link blocking, and props probability", () => {
    expect(normalizeTrialEmail("Usuario.De.Prueba+promo2@googlemail.com")).toBe(
      "usuariodeprueba@gmail.com",
    );
    expect(isDisposableEmailDomain("bot@mailinator.com")).toBe(true);
    expect(isDisposableEmailDomain("analista@gmail.com")).toBe(false);

    expect(containsExternalLink("Únanse a mi canal t.me/picksvip")).toBe(true);
    expect(containsExternalLink("https://spam.example.com")).toBe(true);
    expect(containsExternalLink("Gran lectura de Minkowski v2.1 en tercer down.")).toBe(false);

    expect(formatOddsValue(2.2, "american")).toBe("+120");
    expect(formatOddsValue(1.5, "american")).toBe("-200");
    expect(formatOddsValue(1.91, "decimal")).toBe("1.91");

    const props = buildPlayerPropsCatalog(dataset.games);
    expect(props.length).toBeGreaterThanOrEqual(2);
    const lowLine = evaluatePropLineProbability(260, 32, 235);
    const highLine = evaluatePropLineProbability(260, 32, 285);
    expect(lowLine.pOver).toBeGreaterThan(highLine.pOver);
  });

  it("renders Public & Club surfaces cleanly in SSR without leaking forbidden terms", () => {
    const redacted = redactDatasetForVisitor(dataset);
    const firstGame = dataset.games[0]!;

    const publicHtml = renderToStaticMarkup(
      <PlatformProvider dataset={redacted} initialRole="visitor">
        <LandingSurface />
        <PublicTipstarPickSurface pickSlug="sofia-sem" />
      </PlatformProvider>,
    );

    const clubHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member">
        <MatchStudioClubView leagueId={firstGame.league} gameId={firstGame.id} />
        <ParlayBuilderClubView />
        <SocialVipClubView />
        <AccountReferralsClubView />
      </PlatformProvider>,
    );

    expect(publicHtml).toContain("PitchLab Spacetime Suite v2.1");
    expect(publicHtml).toContain("data-locked-pick");
    expect(clubHtml).toContain("PitchLab Cortex IA");
    expect(clubHtml).toContain("+15 días gratis");

    const combinedLower = (publicHtml + clubHtml).toLowerCase();
    for (const term of FORBIDDEN_UI_TERMS) {
      expect(combinedLower).not.toContain(term);
    }
  });
});
