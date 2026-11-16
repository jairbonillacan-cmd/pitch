import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { asLeagueId, asMarketKey, type LiveScoreboardEntry, type MatchAnalysis } from "@pitchlab/contracts";
import { HomeClubView, HomeFilterHeader } from "../src/platform/club/home/HomeClubView";
import { ALL, filterGames, gamesForSelection } from "../src/platform/club/home/home-model";
import { buildPlatformDataset } from "../src/platform/match-picks-engine";
import { PlatformProvider } from "../src/platform/platform-provider";
import { makeStoryMatch } from "../src/platform/story-fixtures";

function gameFixture(opts: {
  id: string;
  league: "liga-mx" | "nfl" | "nba";
  leagueLabel: string;
  sport: "football" | "american-football" | "basketball";
  day: string;
  kickoffUtc: string;
  kickoffLocal: string;
  homeCode: string;
  homeName: string;
  awayCode: string;
  awayName: string;
}): MatchAnalysis {
  const base = makeStoryMatch({
    id: opts.id,
    league: opts.league === "nba" ? "nfl" : opts.league,
    leagueLabel: opts.leagueLabel,
    sport: opts.sport === "basketball" ? "american-football" : opts.sport,
    status: "NS",
    homeSlug: opts.homeCode.toLowerCase(),
    homeName: opts.homeName,
    homeCode: opts.homeCode,
    awaySlug: opts.awayCode.toLowerCase(),
    awayName: opts.awayName,
    awayCode: opts.awayCode,
    x12: [0.6, opts.sport === "football" ? 0.22 : 0, opts.sport === "football" ? 0.18 : 0.4],
    proj: { home: 24, away: 19, total: 43 },
  });
  return {
    ...base,
    league: asLeagueId(opts.league),
    leagueLabel: opts.leagueLabel,
    sport: opts.sport,
    day: opts.day,
    dayLabel: opts.day,
    kickoffUtc: opts.kickoffUtc,
    kickoffLocal: opts.kickoffLocal,
    marketGroups: [
      {
        group: "Resultado",
        rows: [
          {
            market: asMarketKey("h2h"),
            selection: "home",
            label: `${opts.homeName} gana`,
            p: 0.6,
            fairOdds: 1.67,
          },
        ],
      },
    ],
  };
}

const DATASET = buildPlatformDataset([
  {
    league: asLeagueId("nfl"),
    leagueLabel: "NFL",
    sport: "american-football",
    season: "2026",
    roundLabel: "Semana 10",
    generatedAt: "2026-11-15T12:00:00Z",
    games: [
      gameFixture({
        id: "nfl-early",
        league: "nfl",
        leagueLabel: "NFL",
        sport: "american-football",
        day: "2026-11-15",
        kickoffUtc: "2026-11-15T18:00:00Z",
        kickoffLocal: "12:00",
        homeCode: "SF",
        homeName: "San Francisco",
        awayCode: "DAL",
        awayName: "Dallas",
      }),
      gameFixture({
        id: "nfl-live",
        league: "nfl",
        leagueLabel: "NFL",
        sport: "american-football",
        day: "2026-11-15",
        kickoffUtc: "2026-11-15T20:00:00Z",
        kickoffLocal: "14:00",
        homeCode: "KC",
        homeName: "Kansas City",
        awayCode: "BUF",
        awayName: "Buffalo",
      }),
    ],
  },
  {
    league: asLeagueId("nba"),
    leagueLabel: "NBA",
    sport: "basketball",
    season: "2026-27",
    roundLabel: "Temporada regular",
    generatedAt: "2026-11-15T12:00:00Z",
    games: [
      gameFixture({
        id: "nba-bos-mia",
        league: "nba",
        leagueLabel: "NBA",
        sport: "basketball",
        day: "2026-11-15",
        kickoffUtc: "2026-11-16T00:00:00Z",
        kickoffLocal: "18:00",
        homeCode: "BOS",
        homeName: "Celtics",
        awayCode: "MIA",
        awayName: "Heat",
      }),
    ],
  },
  {
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    season: "Apertura 2026",
    roundLabel: "Jornada 17",
    generatedAt: "2026-11-15T12:00:00Z",
    games: [
      gameFixture({
        id: "lmx-fri",
        league: "liga-mx",
        leagueLabel: "Liga MX",
        sport: "football",
        day: "2026-11-20",
        kickoffUtc: "2026-11-21T01:00:00Z",
        kickoffLocal: "19:00",
        homeCode: "AME",
        homeName: "América",
        awayCode: "TIG",
        awayName: "Tigres",
      }),
    ],
  },
]);

const LIVE_MAP: ReadonlyMap<string, LiveScoreboardEntry> = new Map([
  [
    "nfl-live",
    {
      gameId: "nfl-live",
      league: "nfl",
      phase: "live",
      clock: "Q3",
      minute: null,
      score: { home: 28, away: 3 },
      htScore: { home: 21, away: 3 },
      redCards: null,
      kickoffUtc: "2026-11-15T20:00:00Z",
    },
  ],
]);

describe("Encabezado unificado de filtros en Inicio", () => {
  it("renderiza deporte → liga → día, con MLB «Pronto», icono 32 px y en vivo primero", () => {
    const today = "2026-11-15";
    const dayGames = gamesForSelection(DATASET.games, today, today);
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={DATASET} initialRole="member">
        <HomeFilterHeader
          allGames={DATASET.games}
          dayGames={dayGames}
          visibleGames={dayGames}
          today={today}
          day={today}
          sport={ALL}
          league={ALL}
          liveByGameId={LIVE_MAP}
          onDayChange={() => undefined}
          onSportChange={() => undefined}
          onLeagueChange={() => undefined}
          onJumpDay={() => undefined}
        />
      </PlatformProvider>,
    );

    // Orden estricto de las 3 franjas dentro del encabezado
    const sportIdx = html.indexOf('aria-label="Elegir deporte"');
    const leagueIdx = html.indexOf('aria-label="Elegir liga"');
    const dayIdx = html.indexOf('aria-label="Elegir día"');
    expect(sportIdx).toBeGreaterThan(-1);
    expect(leagueIdx).toBeGreaterThan(sportIdx);
    expect(dayIdx).toBeGreaterThan(leagueIdx);

    // Iconos WebP + PNG de 32 px y MLB deshabilitado con «Pronto»
    expect(html).toContain("/sports/american-football.webp");
    expect(html).toContain("/sports/basketball.png");
    expect(html).toContain("/sports/hockey.webp");
    expect(html).toContain("/sports/baseball.png");
    expect(html).toContain("Pronto");
    expect(html).toContain('data-sport-filter="mlb"');
    expect(html).toMatch(/disabled=""[^>]*data-sport-filter="mlb"|data-sport-filter="mlb"[^>]*disabled=""/);

    // Deportes sin partidos ese día siguen siendo clicables (no disabled) con «0 partidos» en aria-label
    expect(html).toContain('aria-label="Fútbol, 0 partidos"');
    expect(html).toContain('data-sport-filter="futbol"');

    // Control segmentado: Hoy + flechas accesibles + Todas las ligas
    expect(html).toContain('aria-label="Día anterior"');
    expect(html).toContain('aria-label="Día siguiente"');
    expect(html).toContain(">Hoy<");
    expect(html).toContain("Todas las ligas");

    // Partido en vivo va primero antes que el partido programado de las 12:00
    const liveChipIdx = html.indexOf('data-match-chip="nfl-live"');
    const earlyChipIdx = html.indexOf('data-match-chip="nfl-early"');
    expect(liveChipIdx).toBeGreaterThan(-1);
    expect(earlyChipIdx).toBeGreaterThan(liveChipIdx);
    expect(html).toContain("Vivo");
    expect(html).toContain("28–3");
    expect(html).not.toContain("tipstar");
  });

  it("al filtrar por NBA solo muestra ligas y chips de NBA; y en día vacío muestra «Sin partidos este día» + «Ir al …»", () => {
    const today = "2026-11-15";
    const dayGames = gamesForSelection(DATASET.games, today, today);
    const nbaOnly = filterGames(dayGames, "nba", ALL);
    const nbaHtml = renderToStaticMarkup(
      <PlatformProvider dataset={DATASET} initialRole="member">
        <HomeFilterHeader
          allGames={DATASET.games}
          dayGames={dayGames}
          visibleGames={nbaOnly}
          today={today}
          day={today}
          sport="nba"
          league={ALL}
          liveByGameId={LIVE_MAP}
          onDayChange={() => undefined}
          onSportChange={() => undefined}
          onLeagueChange={() => undefined}
          onJumpDay={() => undefined}
        />
      </PlatformProvider>,
    );
    expect(nbaHtml).toContain('data-match-chip="nba-bos-mia"');
    expect(nbaHtml).not.toContain('data-match-chip="nfl-early"');
    expect(nbaHtml).not.toContain('data-match-chip="nfl-live"');
    expect(nbaHtml).toContain('data-league-filter="nba"');
    expect(nbaHtml).not.toContain('data-league-filter="nfl"');

    // Día vacío con Fútbol en domingo 15 → «Ir al viernes 20»
    const emptyHtml = renderToStaticMarkup(
      <PlatformProvider dataset={DATASET} initialRole="member">
        <HomeFilterHeader
          allGames={DATASET.games}
          dayGames={dayGames}
          visibleGames={[]}
          today={today}
          day={today}
          sport="futbol"
          league={ALL}
          liveByGameId={new Map()}
          onDayChange={() => undefined}
          onSportChange={() => undefined}
          onLeagueChange={() => undefined}
          onJumpDay={() => undefined}
        />
      </PlatformProvider>,
    );
    expect(emptyHtml).toContain("Sin partidos este día");
    expect(emptyHtml).toContain("Ir al viernes 20");
  });

  it("formatea Mañana y día corto en HomeClubView sin errores", () => {
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={DATASET} initialRole="member">
        <HomeClubView initialDay="2026-11-16" initialToday="2026-11-15" liveBoardOverride={null} />
      </PlatformProvider>,
    );
    expect(html).toContain("Mañana");

    const friHtml = renderToStaticMarkup(
      <PlatformProvider dataset={DATASET} initialRole="member">
        <HomeClubView initialDay="2026-11-20" initialToday="2026-11-15" liveBoardOverride={null} />
      </PlatformProvider>,
    );
    expect(friHtml).toContain("vie 20");
  });

  it("renderiza bloques de liga y filas de partido con estado en vivo y sin marca de agua diagonal", () => {
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={DATASET} initialRole="member">
        <HomeClubView
          initialDay="2026-11-15"
          initialToday="2026-11-15"
          liveBoardOverride={{
            generatedAt: "2026-11-15T20:05:00Z",
            sourceFetchedAt: "2026-11-15T20:04:00Z",
            active: true,
            nextPollSeconds: 30,
            notice: null,
            entries: [LIVE_MAP.get("nfl-live")!],
          }}
        />
      </PlatformProvider>,
    );

    expect(html).toContain("pl-astro-league-block");
    expect(html).toContain('data-game-card="nfl-live"');
    expect(html).toContain("pl-home-card-live");
    expect(html).toContain("Q3&#x27;");
    expect(html).toContain("en vivo");
    expect(html).toContain("data-card-open");
    expect(html).not.toContain("pl-club-watermark");
  });
});
