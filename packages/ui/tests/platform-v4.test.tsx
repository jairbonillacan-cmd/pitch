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
  buildFinishedResultItems,
  buildHeroLeagueCards,
  buildParlayDemoData,
  buildPlatformDataset,
  buildPlayerPropsCatalog,
  buildSmartAutoParlay,
  canRevealPickOnShare,
  checkParlayCompatibility,
  compareUserOddsInput,
  computeParlaySummary,
  ComunidadPageSurface,
  ComoFuncionaPageSurface,
  containsExternalLink,
  evaluatePropLineProbability,
  formatOddsValue,
  isDisposableEmailDomain,
  isPickUnlocked,
  LandingSurface,
  MatchStudioClubView,
  MotoresPageSurface,
  normalizeTrialEmail,
  ParlayBuilderClubView,
  ParlaysPageSurface,
  PlatformProvider,
  PrecioPageSurface,
  PublicTipstarPickSurface,
  redactDatasetForVisitor,
  ResultadosPageSurface,
  SocialVipClubView,
  type RawLeagueInput,
  type SpacetimeSignal,
} from "../src/index";

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

describe("PitchLab Spacetime Suite v3.0 & Liquid Glass Platform v4", () => {
  const dataset = buildPlatformDataset([
    loadRealSnapshotInput("liga-mx"),
    loadRealSnapshotInput("nfl"),
  ]);

  it("derives up to 5 structured picks + Cortex IA pre-game intel per match from real snapshots without forbidden leaks", () => {
    expect(dataset.games.length).toBeGreaterThan(4);
    expect(dataset.dailyPromoPickId).toBeTruthy();
    expect(dataset.tipstarWeeklyPickId).toBeTruthy();

    for (const game of dataset.games.slice(0, 8)) {
      expect(game.picks.length).toBeGreaterThanOrEqual(3);
      expect(game.picks.length).toBeLessThanOrEqual(5);
      // Sin señal de Spacetime no hay momios de casa: nada de momios, ventajas ni flujo inventados.
      for (const pk of game.picks) {
        expect(pk.marketDecimal).toBeNull();
        expect(pk.edgePts).toBeNull();
        expect(pk.category).not.toBe("valor");
      }
      for (const m of game.markets) {
        expect(m.currentDecimal).toBeNull();
        expect(m.openDecimal).toBeNull();
      }
      expect(game.preGame.lineupsConfirmed60m).toBe(false);
      expect(game.preGame.absences).toHaveLength(0);
      expect(game.preGame.cortexSynthesis.length).toBeGreaterThan(30);
      expect(game.markets.length).toBeGreaterThanOrEqual(8);

      const serialized = JSON.stringify(game).toLowerCase();
      for (const term of FORBIDDEN_UI_TERMS) {
        expect(serialized).not.toContain(term);
      }
    }
  });

  it("uses real book odds and Geodesic value from a Spacetime v3.0 signal", () => {
    const input = loadRealSnapshotInput("liga-mx");
    const target = input.games.find((g) => g.status !== "FT") ?? input.games[0]!;
    const signal: SpacetimeSignal = {
      engineName: "PitchLab Singularity v3.0",
      sportsEngineName: "PitchLab Tachyon v3.0",
      probs: { home: 0.5, draw: 0.25, away: 0.25 },
      market: {
        bookLabel: "Caliente",
        asOfUtc: "2026-11-09T18:46:52Z",
        overround: 0.06,
        noVig: { home: 0.45, draw: 0.27, away: 0.28 },
        odds: { home: 2.1, draw: 3.5, away: 3.4 },
      },
      value: [
        { side: "home", prob: 0.5, decimalOdds: 2.1, edge: 0.024, ev: 0.05, stake: 0.012, vetoed: false, institutionalConfirmation: false },
        { side: "draw", prob: 0.25, decimalOdds: 3.5, edge: -0.036, ev: -0.12, stake: 0, vetoed: false, institutionalConfirmation: false },
        { side: "away", prob: 0.25, decimalOdds: 3.4, edge: -0.044, ev: -0.15, stake: 0, vetoed: false, institutionalConfirmation: false },
      ],
      expectedTotal: 2.6,
      expectedMargin: 0.3,
      drivers: [{ label: "Fuerza estructural y xG", impactLogit: 0.2 }],
      availability: { homeInjured: 2, awayInjured: 0, homeMissingValuePct: 4.5, awayMissingValuePct: 0 },
      stadium: { name: "Estadio Corregidora", elevationM: 1820 },
    };
    const ds = buildPlatformDataset([{ ...input, spacetime: { [target.id]: signal } }]);
    const game = ds.games.find((g) => g.id === target.id)!;

    expect(game.x12).toEqual([0.5, 0.25, 0.25]);
    const homeRow = game.markets.find((m) => m.market === "h2h" && m.selection === "home")!;
    expect(homeRow.p).toBe(0.5);
    expect(homeRow.currentDecimal).toBe(2.1);
    expect(homeRow.edgePts).toBeCloseTo((0.5 - 1 / 2.1) * 100, 1);
    expect(game.markets.find((m) => m.market === "totals")?.currentDecimal ?? null).toBeNull();

    const value = game.picks.find((p) => p.category === "valor");
    if (value) {
      expect(value.marketDecimal).toBe(2.1);
      expect(value.engineName).toBe("PitchLab Geodesic v2.0");
    }
    expect(game.preGame.moneyFlow?.homeShare).toBe(45);
    expect(game.preGame.absences).toHaveLength(1);
    expect(game.preGame.cortexSynthesis).toContain("Caliente");
  });

  it("enforces Zero-Leakage server redaction for visitors while keeping FT games, 1 daily promo, and 1 Tipstar weekly pick open", () => {
    const redacted = redactDatasetForVisitor(dataset);
    expect(redacted.isServerRedactedForVisitor).toBe(true);

    const upcomingGames = redacted.games.filter((g) => g.status !== "FT");
    expect(upcomingGames.length).toBeGreaterThan(0);

    let unlockedUpcomingPicks = 0;
    let lockedUpcomingPicks = 0;

    for (const g of upcomingGames) {
      expect(g.spacetime).toBeNull();
      expect(g.markets).toEqual([]);
      expect(g.factors).toEqual([]);
      expect(g.preGame.moneyFlow).toBeNull();
      expect(g.preGame.absences).toEqual([]);
      for (const pk of g.picks) {
        if (isPickUnlocked(pk, g.status, "visitor")) {
          unlockedUpcomingPicks += 1;
          expect(pk.isRedacted).toBeFalsy();
        } else {
          lockedUpcomingPicks += 1;
          expect(pk.isRedacted).toBe(true);
          expect(pk.label).toBe("Selección reservada Pase PitchLab Ultra");
          expect(pk.p).toBe(0);
          expect(pk.fairDecimal).toBe(0);
          expect(pk.fairAmerican).toBe(0);
          expect(pk.marketDecimal).toBeNull();
          expect(pk.marketAmerican).toBeNull();
          expect(pk.edgePts).toBeNull();
          expect(pk.confidenceScore).toBe(0);
          expect(pk.suggestedUnits).toBe(0);
          expect(pk.conflictGroup).toBe("independent");
          expect(pk.marketGroup).toBe("locked");
          expect(pk.selectionKey).toBe("locked");
        }
      }
    }

    // El parlay de demostración sobre el dataset redactado nunca expone selecciones pagadas en vivo
    expect(buildParlayDemoData(redacted.games).isExample).toBe(true);

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
    // Primer partido próximo que tenga dos picks combinables en un mismo partido (SGP).
    const pair = dataset.games
      .filter((g) => g.status !== "FT")
      .map((g) => {
        const first = g.picks[0];
        const second = first
          ? g.picks.find(
              (p) =>
                p.id !== first.id &&
                p.conflictGroup !== first.conflictGroup &&
                checkParlayCompatibility([{ pick: first }], p, true).allowed,
            )
          : undefined;
        return first && second ? { pickA: first, pickCompatible: second } : null;
      })
      .find((x) => x !== null);
    expect(pair).toBeTruthy();
    const { pickA, pickCompatible } = pair!;

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
    // Sin proyecciones por jugador en v3.0: no se inventan props.
    expect(props).toHaveLength(0);
    const lowLine = evaluatePropLineProbability(260, 32, 235);
    const highLine = evaluatePropLineProbability(260, 32, 285);
    expect(lowLine.pOver).toBeGreaterThan(highLine.pOver);
  });

  it("builds public hero cards (Founder h2h 1/p rule), finished results, parlay demo, and validates Tu momio strictly", () => {
    const heroCards = buildHeroLeagueCards(dataset.games, dataset.leagues);
    expect(heroCards.length).toBeGreaterThanOrEqual(2);
    for (const card of heroCards) {
      const maxSplitP = Math.max(...card.splitProbabilities);
      expect(card.mostProbable.p).toBeCloseTo(maxSplitP, 6);
      expect(card.mostProbable.fairDecimal).toBe((1 / card.mostProbable.p).toFixed(2));
      expect(card.mostProbable.fairAmerican).toMatch(/^[+\u2212]\d+$/);
      expect(card.otherMarkets).toHaveLength(3);
    }

    // Incluso con markets vacío (como en dataset redactado sin detalle), deriva 3 filas reales
    const redacted = redactDatasetForVisitor(dataset);
    const strippedGames = redacted.games.map((g) => ({ ...g, markets: [] }));
    const strippedCards = buildHeroLeagueCards(strippedGames, redacted.leagues);
    expect(strippedCards.length).toBeGreaterThanOrEqual(2);
    for (const card of strippedCards) {
      expect(card.otherMarkets).toHaveLength(3);
    }

    const finishedItems = buildFinishedResultItems(dataset.games, 4);
    for (const item of finishedItems) {
      expect(item.fairAmerican).toMatch(/^[+\u2212]\d+$/);
      expect(item.scoreLabel).toContain("–");
    }

    const parlayReal = buildParlayDemoData(dataset.games);
    expect(parlayReal.isExample).toBe(false);
    expect(parlayReal.legs).toHaveLength(2);
    expect(parlayReal.blockedLeg.conflictWithLabel.length).toBeGreaterThan(2);

    const parlayFallback = buildParlayDemoData([]);
    expect(parlayFallback.isExample).toBe(true);
    expect(parlayFallback.legs).toHaveLength(2);

    // Validación estricta de «Tu momio»
    expect(compareUserOddsInput(0.723, "").kind).toBe("empty");
    expect(compareUserOddsInput(0.723, "").text).toBe(
      "Escribe el momio de tu casa (americano o decimal) para compararlo.",
    );
    for (const bad of ["abc", "-50", "+50", "0.8", "1.0", "+1.50"]) {
      const res = compareUserOddsInput(0.723, bad);
      expect(res.kind).toBe("invalid");
      expect(res.text).toBe("Escribe un momio válido, como \u2212200, +150 o 1.50.");
    }

    const plusEdge = compareUserOddsInput(0.723, "-200");
    expect(plusEdge.kind).toBe("valid");
    expect(plusEdge.tone).toBe("positive");
    expect(plusEdge.text).toBe(
      "Probabilidad implícita 66.7 %. Tu momio paga más que el justo: +5.6 pts.",
    );

    const typographicMinus = compareUserOddsInput(0.723, "\u2212200");
    expect(typographicMinus.text).toBe(plusEdge.text);

    const minusEdge = compareUserOddsInput(0.55, "-200");
    expect(minusEdge.kind).toBe("valid");
    expect(minusEdge.tone).toBe("negative");
    expect(minusEdge.text).toContain("Tu momio paga menos que el justo: \u2212");

    const positiveAmerican = compareUserOddsInput(0.45, "+150");
    expect(positiveAmerican.kind).toBe("valid");
    expect(positiveAmerican.text).toContain("Probabilidad implícita 40.0 %.");

    const decimalComma = compareUserOddsInput(0.723, "1,50");
    expect(decimalComma.kind).toBe("valid");
    expect(decimalComma.text).toBe(plusEdge.text);
  });

  it("renders Public & Club surfaces cleanly in SSR without leaking forbidden terms", () => {
    const redacted = redactDatasetForVisitor(dataset);
    const firstGame = dataset.games[0]!;
    const heroCards = buildHeroLeagueCards(dataset.games, dataset.leagues);
    const allResults = buildFinishedResultItems(dataset.games);
    const parlayDemo = buildParlayDemoData(dataset.games);

    const landingAndMenuHtml = renderToStaticMarkup(
      <>
        <LandingSurface dataset={redacted} />
        <ComoFuncionaPageSurface heroCards={heroCards} />
        <MotoresPageSurface />
        <ResultadosPageSurface results={allResults} />
        <ParlaysPageSurface parlayDemo={parlayDemo} />
        <ComunidadPageSurface />
        <PrecioPageSurface />
      </>,
    );

    const tipstarPickHtml = renderToStaticMarkup(
      <PlatformProvider dataset={redacted} initialRole="visitor">
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

    expect(landingAndMenuHtml).toContain("Lo más probable de cada partido, con su momio justo.");
    expect(landingAndMenuHtml).toContain("Tachyon");
    expect(landingAndMenuHtml).toContain("Singularity");
    expect(landingAndMenuHtml).toContain("Minkowski");
    expect(landingAndMenuHtml).toContain("Geodesic");
    expect(landingAndMenuHtml).toContain("Cortex IA");
    expect(landingAndMenuHtml).toContain("+100,000");
    expect(landingAndMenuHtml).toContain("Partidos históricos en los motores");
    expect(landingAndMenuHtml).toContain("16,126");
    expect(landingAndMenuHtml).toContain("los dos suman 15 días");

    const forbiddenPublicPhrases = [
      "Primer mes gratis",
      "ROI",
      "Kelly",
      "Por qué ganamos",
      "más seguro",
      "Sellar",
    ];
    for (const phrase of forbiddenPublicPhrases) {
      expect(landingAndMenuHtml).not.toContain(phrase);
    }

    expect(tipstarPickHtml).toContain("data-locked-pick");
    expect(clubHtml).toContain("Cortex IA");
    expect(clubHtml).toContain("los dos reciben +15 días");
    // Tipstars y comunidad de demostración siempre van marcados como ejemplo
    // (SOCIAL-2: cada publicación de ejemplo lleva su ficha «Ejemplo»).
    expect(clubHtml).toContain("data-example-badge");
    expect(clubHtml).not.toContain("Récord Verificado");

    const combinedLower = (landingAndMenuHtml + tipstarPickHtml + clubHtml).toLowerCase();
    for (const term of FORBIDDEN_UI_TERMS) {
      expect(combinedLower).not.toContain(term);
    }
  });
});
