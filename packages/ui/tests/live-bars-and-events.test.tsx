import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  asLeagueId,
  asMarketKey,
  type LiveIncident,
  type LiveMatchDetail,
  type LiveTeamStats,
  type MatchAnalysis,
} from "@pitchlab/contracts";
import {
  SportEventIcon,
  resolveSportEventAssetPath,
} from "../src/platform/components/SportEventIcons";
import {
  LiveStatBars,
  MomentumChart,
  computeStatBarWidths,
} from "../src/platform/live/live-charts";
import { LiveScoreTelemetry } from "../src/platform/live/LiveScoreTelemetry";
import {
  MatchHeroScoreboard,
  MatchLeftRail,
} from "../src/platform/club/match/MatchHeroAndRail";
import { buildPlatformDataset } from "../src/platform/match-picks-engine";
import { PlatformProvider } from "../src/platform/platform-provider";

const EMPTY_STATS: LiveTeamStats = {
  xg: null,
  shots: null,
  shotsOnTarget: null,
  corners: null,
  possessionPct: null,
  fouls: null,
  yellowCards: null,
  redCards: null,
  offsides: null,
  bigChances: null,
  goalsPrevented: null,
  touchesInBox: null,
  passAccuracyPct: null,
};

function mkIncident(over: Partial<LiveIncident> & Pick<LiveIncident, "kind" | "minute">): LiveIncident {
  return {
    order: (over.minute ?? 0) * 100,
    side: "home",
    addedTime: null,
    player: null,
    secondary: null,
    score: null,
    note: null,
    ...over,
  };
}

function buildTestDataset() {
  const match: MatchAnalysis = {
    id: "test-adr054-live-1",
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    round: "Jornada 16",
    day: "2030-11-14",
    dayLabel: "jueves",
    kickoffUtc: "2030-11-14T23:00:00Z",
    kickoffLocal: "17:00",
    venue: "Estadio Corregidora",
    status: "NS",
    home: { slug: "queretaro", name: "Querétaro", shortName: "Querétaro", code: "QRO", record: "5G-5E-5P" },
    away: { slug: "monterrey", name: "Rayados de Monterrey", shortName: "Monterrey", code: "MTY", record: "6G-3E-6P" },
    x12: [0.34, 0.26, 0.4],
    projection: { home: 1.4, away: 1.6, total: 3.0 },
    outcomes: [
      { key: "home", label: "Querétaro gana", probability: 0.34 },
      { key: "draw", label: "Empate", probability: 0.26 },
      { key: "away", label: "Monterrey gana", probability: 0.4 },
    ],
    marketGroups: [
      {
        group: "Resultado",
        rows: [
          { market: asMarketKey("1x2"), selection: "home", label: "Querétaro", p: 0.34, fairOdds: 2.94 },
          { market: asMarketKey("1x2"), selection: "draw", label: "Empate", p: 0.26, fairOdds: 3.85 },
          { market: asMarketKey("1x2"), selection: "away", label: "Monterrey", p: 0.4, fairOdds: 2.5 },
        ],
      },
      {
        group: "Totales",
        rows: [
          { market: asMarketKey("totals"), selection: "over_2_5", label: "Más de 2.5 goles", p: 0.58, fairOdds: 1.72 },
        ],
      },
    ],
    factors: [
      { label: "Forma local", detail: "", impact: "", value: "G-E-G-P-G · 3-1", sub: "8 GF" },
      { label: "Forma visitante", detail: "", impact: "", value: "G-G-P-E-G · 3-1", sub: "9 GF" },
    ],
    trace: [],
    headToHead: [
      { date: "2026-04-12", home: "Monterrey", away: "Querétaro", homeGoals: 2, awayGoals: 1 },
      { date: "2025-09-20", home: "Querétaro", away: "Monterrey", homeGoals: 2, awayGoals: 2 },
    ],
  };
  return buildPlatformDataset([
    {
      league: asLeagueId("liga-mx"),
      leagueLabel: "Liga MX",
      sport: "football",
      season: "Apertura",
      roundLabel: "Jornada 16",
      generatedAt: "2030-11-13T18:00:00Z",
      games: [match],
      standings: [],
    },
  ]);
}

describe("ADR-054 · Barras estadísticas planas, métricas negativas, iconos y eventos", () => {
  it("computeStatBarWidths calcula longitudes proporcionales para valores negativos (Goles evitados -0.54 vs -0.44)", () => {
    const res = computeStatBarWidths(-0.54, -0.44, { signed: true });
    expect(res.homePct).toBe(100);
    expect(res.awayPct).toBeGreaterThan(75);
    expect(res.homeNegative).toBe(true);
    expect(res.awayNegative).toBe(true);
    // -0.44 es mejor (mayor) que -0.54
    expect(res.lead).toBe("away");
  });

  it("computeStatBarWidths maneja porcentajes, conteos positivos y ceros sin romper proporciones", () => {
    const poss = computeStatBarWidths(59, 41, { pct: true });
    expect(poss.homePct).toBe(59);
    expect(poss.awayPct).toBe(41);
    expect(poss.lead).toBe("home");
    expect(poss.homeNegative).toBe(false);

    const xg = computeStatBarWidths(0.2, 2.26);
    expect(xg.lead).toBe("away");
    expect(xg.awayPct).toBeGreaterThan(xg.homePct * 5);

    const zeros = computeStatBarWidths(0, 0);
    expect(zeros.homePct).toBe(0);
    expect(zeros.awayPct).toBe(0);
    expect(zeros.lead).toBe("tie");
  });

  it("LiveStatBars marca data-negative en métricas con signo negativo (Goles evitados -0.54 vs -0.44)", () => {
    const html = renderToStaticMarkup(
      <LiveStatBars
        homeLabel="Al-Ahli"
        awayLabel="Al-Nassr"
        stats={{
          home: { ...EMPTY_STATS, possessionPct: 59, xg: 0.2, goalsPrevented: -0.54, shots: 4, shotsOnTarget: 2 },
          away: { ...EMPTY_STATS, possessionPct: 41, xg: 2.26, goalsPrevented: -0.44, shots: 10, shotsOnTarget: 3 },
        }}
      />,
    );
    expect(html).toContain("Goles evitados");
    expect(html).toContain("-0.54");
    expect(html).toContain("-0.44");
    expect(html).toContain('data-negative="true"');
  });

  it("SportEventIcon renderiza WebP del pack con srcSet 1x/2x, dimensiones explícitas y sin hex literales para cada incidente deportivo", () => {
    const kinds = [
      "goal",
      "own_goal",
      "penalty_goal",
      "penalty_missed",
      "yellow",
      "red",
      "second_yellow",
      "var",
      "sub",
      "injury",
      "whistle",
    ] as const;
    for (const kind of kinds) {
      const asset = resolveSportEventAssetPath(kind);
      const html = renderToStaticMarkup(<SportEventIcon kind={kind} size={14} />);
      expect(html).toContain("<img");
      expect(html).not.toContain("<svg");
      expect(html).toContain(`src="/icons-dark/32/${asset}.webp"`);
      expect(html).toContain(`srcSet="/icons-dark/32/${asset}.webp 1x, /icons-dark/64/${asset}.webp 2x"`);
      expect(html).toContain('width="14"');
      expect(html).toContain('height="14"');
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('alt=""');
      expect(html).toContain("pl-sport-evt-ico");
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    }
  });

  it("MatchHeroScoreboard y MatchLeftRail muestran iconos deportivos, singular '1 cambio', sin Conf. N ni tarjetas redundantes", () => {
    const dataset = buildTestDataset();
    const game = dataset.games[0]!;
    const detail: LiveMatchDetail = {
      gameId: game.id,
      generatedAt: "2030-11-14T23:58:00Z",
      sourceFetchedAt: "2030-11-14T23:58:00Z",
      entry: {
        gameId: game.id,
        league: game.league,
        phase: "live",
        clock: "58",
        minute: 58,
        score: { home: 1, away: 1 },
        htScore: { home: 1, away: 1 },
        redCards: { home: 0, away: 0 },
        referee: "Hector Martinez",
        kickoffUtc: game.kickoffUtc,
      },
      incidents: [
        mkIncident({
          kind: "goal",
          minute: 14,
          side: "away",
          player: "C. Ronaldo",
          secondary: "S. Costa",
          score: { home: 0, away: 1 },
        }),
        mkIncident({
          kind: "goal",
          minute: 45,
          addedTime: 1,
          side: "home",
          player: "W. Galeno",
          secondary: "I. Toney",
          score: { home: 1, away: 1 },
        }),
        mkIncident({
          kind: "sub",
          minute: 46,
          side: "away",
          player: "L. Paqarada",
          secondary: "M. Zrilić",
        }),
      ],
      momentum: [
        { minute: 10, value: -35 },
        { minute: 27, value: 60 },
        { minute: 45, value: 25 },
        { minute: 55, value: -20 },
      ],
      stats: { home: { ...EMPTY_STATS, shots: 4 }, away: { ...EMPTY_STATS, shots: 10 } },
      xgEstimated: false,
      xgTimeline: [],
      shots: [],
      nextPollSeconds: null,
      notice: null,
      attribution: "Datos en vivo PitchLab",
    };

    const html = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member">
        <MatchHeroScoreboard
          game={game}
          homePrimary="var(--pl-brand)"
          awayPrimary="var(--pl-info)"
          intelUnlocked
          liveDetail={detail}
          onNavigate={() => undefined}
        />
        <MatchLeftRail
          game={game}
          markets={game.markets}
          oddsFormat="decimal"
          intelUnlocked
          liveDetail={detail}
          mainEngineName="Spacetime v5.1"
          cortexSummaryText="Resumen táctico"
          onSelectTab={() => undefined}
        />
      </PlatformProvider>,
    );

    expect(html).toContain("1 cambio");
    expect(html).not.toContain("1 cambios");
    expect(html).toContain("pl-sport-evt-ico");
    expect(html).not.toContain("data-confidence-chip");
    expect(html).not.toContain("data-rail-picks");
    expect(html).not.toContain("Tiempo reglamentario (90 min)");
  });

  it("MomentumChart renderiza divisor HT, marcadores de gol y aguja roja en vivo", () => {
    const html = renderToStaticMarkup(
      <MomentumChart
        momentum={[
          { minute: 14, value: -45 },
          { minute: 27, value: 70 },
          { minute: 58, value: 20 },
        ]}
        goals={[
          mkIncident({ kind: "goal", minute: 27, side: "home", player: "A. Vukotić" }),
          mkIncident({ kind: "goal", minute: 14, side: "away", player: "B. Zivzivadze" }),
        ]}
        homeLabel="Local"
        awayLabel="Visita"
        liveMinute={58}
      />,
    );
    expect(html).toContain("pl-live-ht-split");
    expect(html).toContain("pl-live-now-line");
    expect(html).toContain("pl-live-now-dot");
    expect(html).toContain("pl-live-goal");
  });

  it("LiveScoreTelemetry renderiza xG, tiros a puerta y posesión con SVGs accesibles y omite métricas faltantes sin inventar ceros", () => {
    const fullHtml = renderToStaticMarkup(
      <LiveScoreTelemetry
        stats={{
          home: { ...EMPTY_STATS, xg: 0.19, shotsOnTarget: 6, possessionPct: 28 },
          away: { ...EMPTY_STATS, xg: 0.93, shotsOnTarget: 6, possessionPct: 72 },
        }}
      />,
    );
    expect(fullHtml).toContain("data-live-telemetry");
    expect(fullHtml).toContain("0.19");
    expect(fullHtml).toContain("0.93");
    expect(fullHtml).toContain("xG");
    expect(fullHtml).toContain("28%");
    expect(fullHtml).toContain("72%");
    expect(fullHtml).toContain('aria-hidden="true"');
    expect(fullHtml).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);

    const partialHtml = renderToStaticMarkup(
      <LiveScoreTelemetry
        stats={{
          home: { ...EMPTY_STATS, shotsOnTarget: 4 },
          away: { ...EMPTY_STATS, shotsOnTarget: 2 },
        }}
        shotmapSummary={{ xgHome: 0.44, xgAway: 0.31, shotsHome: 5, shotsAway: 3 }}
      />,
    );
    expect(partialHtml).toContain("0.44");
    expect(partialHtml).toContain("0.31");
    expect(partialHtml).toContain('data-telemetry-metric="sot"');
    expect(partialHtml).not.toContain('data-telemetry-metric="possession"');

    const emptyHtml = renderToStaticMarkup(<LiveScoreTelemetry stats={null} />);
    expect(emptyHtml).toBe("");
  });
});
