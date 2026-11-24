import { Writable } from "node:stream";
import React from "react";
import { renderToPipeableStream, renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  LeagueSnapshotSchema,
  asGameId,
  asLeagueId,
  asMarketKey,
  asSeasonId,
  asTeamId,
  snapshotToMatchAnalyses,
  type LeagueSnapshot,
} from "@pitchlab/contracts";
import {
  AccountReferralsClubView,
  assessParlayRisk,
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
  PublicTipsterPickSurface,
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

const FROZEN_NOW = new Date("2026-11-15T18:00:00Z");

interface FixtureMatchSeed {
  id: string;
  startTime: string;
  status: "final" | "scheduled";
  round: string;
  week: number;
  venue: string;
  home: { slug: string; name: string; shortName: string; code: string };
  away: { slug: string; name: string; shortName: string; code: string };
  score?: { home: number; away: number };
}

const LIGA_MX_MATCHES: readonly FixtureMatchSeed[] = [
  {
    id: "mx-2026-j16-america-chivas",
    startTime: "2026-11-14T23:00:00.000Z",
    status: "final",
    round: "Jornada 16",
    week: 16,
    venue: "Estadio Azteca",
    home: { slug: "america", name: "Club América", shortName: "América", code: "AME" },
    away: { slug: "guadalajara", name: "Guadalajara", shortName: "Chivas", code: "GDL" },
    score: { home: 2, away: 1 },
  },
  {
    id: "mx-2026-j16-cruz-azul-pumas",
    startTime: "2026-11-15T01:00:00.000Z",
    status: "final",
    round: "Jornada 16",
    week: 16,
    venue: "Estadio Ciudad de los Deportes",
    home: { slug: "cruz-azul", name: "Cruz Azul", shortName: "Cruz Azul", code: "CAZ" },
    away: { slug: "pumas", name: "Pumas UNAM", shortName: "Pumas", code: "PUM" },
    score: { home: 3, away: 1 },
  },
  {
    id: "mx-2026-j16-tigres-toluca",
    startTime: "2026-11-15T03:00:00.000Z",
    status: "final",
    round: "Jornada 16",
    week: 16,
    venue: "Estadio Universitario",
    home: { slug: "tigres", name: "Tigres UANL", shortName: "Tigres", code: "TIG" },
    away: { slug: "toluca", name: "Toluca", shortName: "Toluca", code: "TOL" },
    score: { home: 1, away: 1 },
  },
  {
    id: "mx-2026-j17-queretaro-monterrey",
    startTime: "2026-11-15T23:00:00.000Z",
    status: "scheduled",
    round: "Jornada 17",
    week: 17,
    venue: "Estadio Corregidora",
    home: { slug: "queretaro", name: "Querétaro", shortName: "Querétaro", code: "QRO" },
    away: { slug: "monterrey", name: "Monterrey", shortName: "Monterrey", code: "MTY" },
  },
  {
    id: "mx-2026-j17-pachuca-leon",
    startTime: "2026-11-16T01:00:00.000Z",
    status: "scheduled",
    round: "Jornada 17",
    week: 17,
    venue: "Estadio Hidalgo",
    home: { slug: "pachuca", name: "Pachuca", shortName: "Pachuca", code: "PAC" },
    away: { slug: "leon", name: "León", shortName: "León", code: "LEO" },
  },
  {
    id: "mx-2026-j17-atlas-santos",
    startTime: "2026-11-16T03:00:00.000Z",
    status: "scheduled",
    round: "Jornada 17",
    week: 17,
    venue: "Estadio Jalisco",
    home: { slug: "atlas", name: "Atlas", shortName: "Atlas", code: "ATL" },
    away: { slug: "santos", name: "Santos Laguna", shortName: "Santos", code: "SAN" },
  },
  {
    id: "mx-2026-j17-puebla-necaxa",
    startTime: "2026-11-16T23:00:00.000Z",
    status: "scheduled",
    round: "Jornada 17",
    week: 17,
    venue: "Estadio Cuauhtémoc",
    home: { slug: "puebla", name: "Puebla", shortName: "Puebla", code: "PUE" },
    away: { slug: "necaxa", name: "Necaxa", shortName: "Necaxa", code: "NEC" },
  },
  {
    id: "mx-2026-j17-tijuana-juarez",
    startTime: "2026-11-17T01:00:00.000Z",
    status: "scheduled",
    round: "Jornada 17",
    week: 17,
    venue: "Estadio Caliente",
    home: { slug: "tijuana", name: "Xolos de Tijuana", shortName: "Tijuana", code: "TIJ" },
    away: { slug: "juarez", name: "FC Juárez", shortName: "Juárez", code: "JUA" },
  },
];

const NFL_MATCHES: readonly FixtureMatchSeed[] = [
  {
    id: "nfl-2026-w10-chiefs-raiders",
    startTime: "2026-11-14T21:00:00.000Z",
    status: "final",
    round: "Semana 10",
    week: 10,
    venue: "Arrowhead Stadium",
    home: { slug: "kansas-city-chiefs", name: "Kansas City Chiefs", shortName: "Kansas City", code: "KC" },
    away: { slug: "las-vegas-raiders", name: "Las Vegas Raiders", shortName: "Las Vegas", code: "LV" },
    score: { home: 27, away: 17 },
  },
  {
    id: "nfl-2026-w10-eagles-cowboys",
    startTime: "2026-11-15T01:15:00.000Z",
    status: "final",
    round: "Semana 10",
    week: 10,
    venue: "Lincoln Financial Field",
    home: { slug: "philadelphia-eagles", name: "Philadelphia Eagles", shortName: "Philadelphia", code: "PHI" },
    away: { slug: "dallas-cowboys", name: "Dallas Cowboys", shortName: "Dallas", code: "DAL" },
    score: { home: 31, away: 24 },
  },
  {
    id: "nfl-2026-w11-texans-colts",
    startTime: "2026-11-15T19:00:00.000Z",
    status: "scheduled",
    round: "Semana 11",
    week: 11,
    venue: "NRG Stadium",
    home: { slug: "houston-texans", name: "Houston Texans", shortName: "Houston", code: "HOU" },
    away: { slug: "indianapolis-colts", name: "Indianapolis Colts", shortName: "Indianapolis", code: "IND" },
  },
  {
    id: "nfl-2026-w11-bills-dolphins",
    startTime: "2026-11-15T22:05:00.000Z",
    status: "scheduled",
    round: "Semana 11",
    week: 11,
    venue: "Highmark Stadium",
    home: { slug: "buffalo-bills", name: "Buffalo Bills", shortName: "Buffalo", code: "BUF" },
    away: { slug: "miami-dolphins", name: "Miami Dolphins", shortName: "Miami", code: "MIA" },
  },
  {
    id: "nfl-2026-w11-ravens-steelers",
    startTime: "2026-11-16T01:20:00.000Z",
    status: "scheduled",
    round: "Semana 11",
    week: 11,
    venue: "M&T Bank Stadium",
    home: { slug: "baltimore-ravens", name: "Baltimore Ravens", shortName: "Baltimore", code: "BAL" },
    away: { slug: "pittsburgh-steelers", name: "Pittsburgh Steelers", shortName: "Pittsburgh", code: "PIT" },
  },
  {
    id: "nfl-2026-w11-bengals-commanders",
    startTime: "2026-11-17T01:15:00.000Z",
    status: "scheduled",
    round: "Semana 11",
    week: 11,
    venue: "Northwest Stadium",
    home: { slug: "washington-commanders", name: "Washington Commanders", shortName: "Washington", code: "WAS" },
    away: { slug: "cincinnati-bengals", name: "Cincinnati Bengals", shortName: "Cincinnati", code: "CIN" },
  },
];

function buildSnapshotFixture(params: {
  leagueKey: "liga-mx" | "nfl";
  seasonId: string;
  seasonLabel: string;
  periodLabel: string;
  logoUrl?: string;
  matches: readonly FixtureMatchSeed[];
  forPerGameBase: number;
  againstPerGameHome: number;
  forPerGameAway: number;
  againstPerGameAway: number;
  gamesPlayed: number;
  hasDraw: boolean;
}): LeagueSnapshot {
  const league = asLeagueId(params.leagueKey);
  const season = asSeasonId(params.seasonId);
  const h2hKey = asMarketKey("h2h");
  const dcKey = asMarketKey("double_chance");
  const spreadsKey = asMarketKey("spreads");
  const totalsKey = asMarketKey("totals");
  const bttsKey = asMarketKey("btts");
  const teamTotalsKey = asMarketKey("team_totals");
  const teamRates: LeagueSnapshot["teamRates"] = {};
  const games: LeagueSnapshot["games"] = [];
  const analyses: LeagueSnapshot["analyses"] = {};
  const standings: NonNullable<LeagueSnapshot["standings"]> = [];

  params.matches.forEach((m, idx) => {
    const homeId = asTeamId(`${params.leagueKey}.${m.home.slug}`);
    const awayId = asTeamId(`${params.leagueKey}.${m.away.slug}`);
    const gameId = asGameId(m.id);
    teamRates[homeId] = {
      teamId: homeId,
      name: m.home.name,
      shortName: m.home.shortName,
      code: m.home.code,
      forPerGame: params.forPerGameBase + idx * 0.1,
      againstPerGame: params.againstPerGameHome,
      gamesPlayed: params.gamesPlayed,
      adjustedFor: params.forPerGameBase + idx * 0.08,
      adjustedAgainst: params.againstPerGameHome + 0.05,
    };
    teamRates[awayId] = {
      teamId: awayId,
      name: m.away.name,
      shortName: m.away.shortName,
      code: m.away.code,
      forPerGame: params.forPerGameAway,
      againstPerGame: params.againstPerGameAway,
      gamesPlayed: params.gamesPlayed,
      adjustedFor: params.forPerGameAway - 0.02,
      adjustedAgainst: params.againstPerGameAway - 0.03,
    };
    if (standings.length < 4) {
      standings.push({
        teamId: homeId,
        name: m.home.name,
        shortName: m.home.shortName,
        code: m.home.code,
        played: params.gamesPlayed,
        won: Math.max(1, params.gamesPlayed - 4 - idx),
        drawn: params.hasDraw ? 3 : 0,
        lost: 2 + idx,
        goalsFor: params.hasDraw ? 28 : 254,
        goalsAgainst: params.hasDraw ? 16 : 208,
        points: (params.hasDraw ? 33 : 16) - idx * 2,
        ...(params.hasDraw
          ? {}
          : {
              conference: "AFC",
              division: "AFC Este",
              winPct: 0.8 - idx * 0.1,
              seed: idx + 1,
            }),
        form: ["W", "W", params.hasDraw ? "D" : "W", "W", "L"],
      });
    }
    games.push({
      id: gameId,
      league,
      season,
      week: m.week,
      round: m.round,
      startTime: m.startTime,
      status: m.status,
      home: {
        id: homeId,
        league,
        name: m.home.name,
        shortName: m.home.shortName,
        code: m.home.code,
      },
      away: {
        id: awayId,
        league,
        name: m.away.name,
        shortName: m.away.shortName,
        code: m.away.code,
      },
      venue: m.venue,
      neutralSite: false,
      ...(m.score
        ? {
            result: {
              home: m.score.home,
              away: m.score.away,
              observedAt: "2026-11-15T12:00:00.000Z",
              source: "pitchlab",
            },
          }
        : {}),
    });

    if (params.hasDraw) {
      const pHome = Math.min(0.62, 0.5 + idx * 0.015);
      const pDraw = 0.25;
      const pAway = Math.max(0.13, 1 - pHome - pDraw);
      analyses[gameId] = {
        game: gameId,
        model: {
          id: "pitchlab-statistical-liga-mx",
          version: "2.0.0",
          status: "candidate",
          label: "Modelo PitchLab · en validación",
        },
        projection: { home: 1.68, away: 1.12, total: 2.8, margin: 0.56 },
        x12: [pHome, pDraw, pAway],
        probabilities: [
          { market: h2hKey, selection: `${m.home.shortName} gana`, p: pHome, fairOdds: 1 / pHome },
          { market: h2hKey, selection: "Empate", p: pDraw, fairOdds: 1 / pDraw },
          { market: h2hKey, selection: `${m.away.shortName} gana`, p: pAway, fairOdds: 1 / pAway },
        ],
        marketGroups: [
          {
            group: "Resultado 1X2",
            rows: [
              { market: h2hKey, selection: "home", label: `${m.home.shortName} gana`, p: pHome, fairOdds: 1 / pHome },
              { market: h2hKey, selection: "draw", label: "Empate", p: pDraw, fairOdds: 1 / pDraw },
              { market: h2hKey, selection: "away", label: `${m.away.shortName} gana`, p: pAway, fairOdds: 1 / pAway },
            ],
          },
          {
            group: "Doble oportunidad",
            rows: [
              { market: dcKey, selection: "1x", label: `${m.home.shortName} o Empate`, p: pHome + pDraw, fairOdds: 1 / (pHome + pDraw) },
              { market: dcKey, selection: "12", label: `${m.home.shortName} o ${m.away.shortName}`, p: pHome + pAway, fairOdds: 1 / (pHome + pAway) },
              { market: dcKey, selection: "x2", label: `Empate o ${m.away.shortName}`, p: pDraw + pAway, fairOdds: 1 / (pDraw + pAway) },
            ],
          },
          {
            group: "Total de goles 2.5",
            rows: [
              { market: totalsKey, selection: "over_2.5", label: "Más de 2.5 goles", line: 2.5, p: 0.57, fairOdds: 1 / 0.57 },
              { market: totalsKey, selection: "under_2.5", label: "Menos de 2.5 goles", line: 2.5, p: 0.43, fairOdds: 1 / 0.43 },
            ],
          },
          {
            group: "Ambos equipos anotan",
            rows: [
              { market: bttsKey, selection: "yes", label: "Ambos anotan: Sí", p: 0.55, fairOdds: 1 / 0.55 },
              { market: bttsKey, selection: "no", label: "Ambos anotan: No", p: 0.45, fairOdds: 1 / 0.45 },
            ],
          },
        ],
        mostLikelyScore: { home: 2, away: 1, p: 0.128 },
        factors: [
          { key: "home_attack", label: "Ataque local", value: "1.68 goles/partido", detail: "16 partidos" },
          { key: "away_defense", label: "Defensa visitante", value: "1.35 concedidos/partido", detail: "16 partidos" },
        ],
        steps: [
          "Sincronizando Liga MX · corte 15 nov 2026, 14:00",
          "Fuerza ajustada por rival",
          "Ponderación por antigüedad y localía",
          "Proyección de goles 1.68 – 1.12 · total 2.80",
          "Simulación de marcadores con incertidumbre del ajuste",
          "10 mercados listos · marcador proyectado 2–1",
        ],
        inputsAsOf: "2026-11-15T14:00:00.000Z",
        publishedAt: "2026-11-15T14:00:00.000Z",
        source: "pitchlab",
        confidence: { score: 66, level: "media", reasons: ["Muestra suficiente"] },
        insights: {
          why: [
            `${m.home.shortName} gana en ${Math.round(pHome * 100)} % de los escenarios.`,
            "Se proyecta ritmo ofensivo equilibrado con total esperado de 2.80 goles.",
          ],
          restDays: { home: 7, away: 6 },
        },
      };
      return;
    }

    const pHome = Math.min(0.66, 0.57 + idx * 0.015);
    const pAway = 1 - pHome;
    analyses[gameId] = {
      game: gameId,
      model: {
        id: "pitchlab-statistical-nfl",
        version: "2.0.0",
        status: "candidate",
        label: "Modelo PitchLab · en validación",
      },
      projection: { home: 26.4, away: 21.8, total: 48.2, margin: 4.6 },
      x12: [pHome, 0, pAway],
      probabilities: [
        { market: h2hKey, selection: `${m.home.shortName} gana`, p: pHome, fairOdds: 1 / pHome },
        { market: h2hKey, selection: `${m.away.shortName} gana`, p: pAway, fairOdds: 1 / pAway },
      ],
      marketGroups: [
        {
          group: "Ganador",
          rows: [
            { market: h2hKey, selection: "home", label: `${m.home.shortName} gana`, p: pHome, fairOdds: 1 / pHome },
            { market: h2hKey, selection: "away", label: `${m.away.shortName} gana`, p: pAway, fairOdds: 1 / pAway },
          ],
        },
        {
          group: "Hándicap alternativo +6.5",
          rows: [
            { market: spreadsKey, selection: "home_6.5", label: `${m.home.code} +6.5`, line: 6.5, p: 0.75, fairOdds: 1 / 0.75 },
            { market: spreadsKey, selection: "away_-6.5", label: `${m.away.code} -6.5`, line: -6.5, p: 0.25, fairOdds: 4.0 },
          ],
        },
        {
          group: "Total 47.5",
          rows: [
            { market: totalsKey, selection: "over_47.5", label: "Más de 47.5 puntos", line: 47.5, p: 0.56, fairOdds: 1 / 0.56 },
            { market: totalsKey, selection: "under_47.5", label: "Menos de 47.5 puntos", line: 47.5, p: 0.44, fairOdds: 1 / 0.44 },
          ],
        },
        {
          group: "Puntos por equipo",
          rows: [
            { market: teamTotalsKey, selection: "home_over", label: `${m.home.code} más de 24.5`, line: 24.5, p: 0.55, fairOdds: 1 / 0.55 },
            { market: teamTotalsKey, selection: "home_under", label: `${m.home.code} menos de 24.5`, line: 24.5, p: 0.45, fairOdds: 1 / 0.45 },
            { market: teamTotalsKey, selection: "away_over", label: `${m.away.code} más de 20.5`, line: 20.5, p: 0.52, fairOdds: 1 / 0.52 },
            { market: teamTotalsKey, selection: "away_under", label: `${m.away.code} menos de 20.5`, line: 20.5, p: 0.48, fairOdds: 1 / 0.48 },
          ],
        },
      ],
      factors: [
        { key: "home_offense", label: "Ofensiva local", value: "26.4 pts proyectados", detail: "10 partidos" },
        { key: "away_defense", label: "Defensa visitante", value: "23.8 pts permitidos", detail: "10 partidos" },
      ],
      steps: [
        "Sincronizando NFL · corte 15 nov 2026, 14:00",
        "Ofensiva y defensa ajustadas por rival",
        "Fuerza de calendario incluida",
        "Proyección 26.4 – 21.8 · margen +4.6",
        "Simulando escenarios de margen y total",
        "10 mercados listos",
      ],
      inputsAsOf: "2026-11-15T14:00:00.000Z",
      publishedAt: "2026-11-15T14:00:00.000Z",
      source: "pitchlab",
      confidence: { score: 62, level: "media", reasons: ["Muestra suficiente"] },
      insights: {
        why: [
          `${m.home.shortName} gana en ${Math.round(pHome * 100)} % de los escenarios.`,
          "Se esperan 48.2 puntos totales entre ofensivas estables.",
        ],
        restDays: { home: 7, away: 7 },
      },
    };
  });

  return LeagueSnapshotSchema.parse({
    schemaVersion: 1,
    league,
    ...(params.logoUrl ? { logoUrl: params.logoUrl } : {}),
    season,
    seasonLabel: params.seasonLabel,
    periodLabel: params.periodLabel,
    updatedAt: "2026-11-15T14:00:00.000Z",
    source: "pitchlab",
    provenance: "derived",
    isDemo: false,
    teamRates,
    games,
    analyses,
    standings,
  });
}

function buildFootballSnapshotFixture(): LeagueSnapshot {
  return buildSnapshotFixture({
    leagueKey: "liga-mx",
    seasonId: "liga-mx-2026-apertura",
    seasonLabel: "Apertura 2026",
    periodLabel: "Jornada 17",
    matches: LIGA_MX_MATCHES,
    forPerGameBase: 1.7,
    againstPerGameHome: 1.05,
    forPerGameAway: 1.22,
    againstPerGameAway: 1.35,
    gamesPlayed: 16,
    hasDraw: true,
  });
}

function buildNflSnapshotFixture(): LeagueSnapshot {
  return buildSnapshotFixture({
    leagueKey: "nfl",
    seasonId: "nfl-2026",
    seasonLabel: "2026",
    periodLabel: "Semana 11",
    logoUrl: "/brand/official/nfl/nfl.png",
    matches: NFL_MATCHES,
    forPerGameBase: 25.4,
    againstPerGameHome: 20.8,
    forPerGameAway: 21.5,
    againstPerGameAway: 23.8,
    gamesPlayed: 10,
    hasDraw: false,
  });
}

function loadRealSnapshotInput(leagueKey: "liga-mx" | "nfl"): RawLeagueInput {
  const parsed =
    leagueKey === "nfl" ? buildNflSnapshotFixture() : buildFootballSnapshotFixture();
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
  let dataset: ReturnType<typeof buildPlatformDataset>;

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW);
    dataset = buildPlatformDataset([
      loadRealSnapshotInput("liga-mx"),
      loadRealSnapshotInput("nfl"),
    ]);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("derives up to 5 structured picks + Cortex IA pre-game intel per match from real snapshots without forbidden leaks", () => {
    expect(dataset.games.length).toBeGreaterThan(4);
    expect(dataset.dailyPromoPickId).toBeTruthy();
    expect(dataset.tipsterWeeklyPickId).toBeTruthy();

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
      expect(value.engineName).toBe("Motor Spacetime");
    }
    expect(game.preGame.moneyFlow?.homeShare).toBe(45);
    expect(game.preGame.absences).toHaveLength(1);
    expect(game.preGame.cortexSynthesis).toContain("Caliente");
  });

  it("enforces Zero-Leakage server redaction for visitors while keeping FT games, 1 daily promo, and 1 Tipster weekly pick open", () => {
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

    // Exactamente 2 picks abiertos próximos en toda la plataforma: 1 Promo del Día + 1 Semanal de Tipster
    expect(unlockedUpcomingPicks).toBe(2);
    expect(lockedUpcomingPicks).toBeGreaterThan(5);

    const finishedGames = redacted.games.filter((g) => g.status === "FT");
    for (const fg of finishedGames.slice(0, 3)) {
      for (const pk of fg.picks) {
        expect(isPickUnlocked(pk, "FT", "visitor")).toBe(true);
      }
    }
  });

  it("enforces Q12 pre-kickoff Share Card sealing for regular subscribers while allowing FT and Tipster weekly promo shares", () => {
    expect(canRevealPickOnShare("NS", "member", false)).toBe(false);
    expect(canRevealPickOnShare("LIVE", "member", false)).toBe(false);
    expect(canRevealPickOnShare("FT", "member", false)).toBe(true);
    expect(canRevealPickOnShare("NS", "tipster", true)).toBe(true);
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

    // Auto-armador genera el número pedido de selecciones sin contradicciones (incluso > 6 selecciones)
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

    const autoSix = buildSmartAutoParlay(dataset.games, {
      leagues: dataset.leagues.map((l) => l.league),
      risk: "arriesgado",
      legCount: 8,
      allowSgp: false,
      viewerRole: "member",
    });
    expect(autoSix.length).toBeLessThanOrEqual(6);
    expect(autoSix.length).toBeGreaterThanOrEqual(2);
    if (autoSix.length === 6) {
      const extraCandidate = dataset.games
        .filter((g) => g.status === "NS" && !autoSix.some((l) => l.pick.gameId === g.id))
        .flatMap((g) => g.picks)[0];
      if (extraCandidate) {
        const seventhCheck = checkParlayCompatibility(autoSix, extraCandidate, false);
        expect(seventhCheck.allowed).toBe(false);
        expect(seventhCheck.code).toBe("max_legs");
      }
    }
    const sixRisk = assessParlayRisk(computeParlaySummary(autoSix, 1));
    expect(["alto", "muy_alto", "extremo"]).toContain(sixRisk.level);
    expect(sixRisk.weakestLeg).not.toBeNull();
    expect(sixRisk.warnings.length).toBeGreaterThan(0);

    // Bloquea partidos en vivo, marcador exacto en SGP, mismo eje redundante y contradicciones lógicas (BTTS Sí + Under 1.5)
    const livePick = { ...pickA, id: "live-pick-test", gameId: "other-live-game", gameStatus: "LIVE" as const };
    expect(checkParlayCompatibility([], livePick, false).allowed).toBe(false);
    expect(checkParlayCompatibility([], livePick, false).code).toBe("live");

    const exactScorePick = {
      ...pickA,
      id: "exact-score-pick",
      market: "correct_score",
      selectionKey: "2-1",
      conflictGroup: "independent" as const,
      label: "Marcador exacto 2-1",
    };
    expect(checkParlayCompatibility([{ pick: pickA }], exactScorePick, true).allowed).toBe(false);
    expect(checkParlayCompatibility([{ pick: pickA }], exactScorePick, true).code).toBe("exact_score_sgp");

    const bttsYesPick = {
      ...pickA,
      id: "btts-yes-test",
      market: "btts",
      selectionKey: "yes",
      conflictGroup: "btts_yes" as const,
      label: "Ambos anotan: Sí",
    };
    const under15Pick = {
      ...pickA,
      id: "under-15-test",
      market: "totals",
      selectionKey: "under_1.5",
      line: 1.5,
      conflictGroup: "under_total" as const,
      label: "Menos de 1.5 goles",
    };
    const crossCheck = checkParlayCompatibility([{ pick: bttsYesPick }], under15Pick, true);
    expect(crossCheck.allowed).toBe(false);
    expect(crossCheck.code).toBe("logical_contradiction");
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

  it("renders Public & Club surfaces cleanly in SSR without leaking forbidden terms", async () => {
    const renderHtmlAsync = (element: React.ReactElement): Promise<string> =>
      new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const writable = new Writable({
          write(chunk, _enc, cb) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            cb();
          },
        });
        const { pipe } = renderToPipeableStream(element, {
          onAllReady() {
            pipe(writable);
          },
          onError(err) {
            reject(err);
          },
        });
        writable.on("finish", () =>
          resolve(Buffer.concat(chunks).toString("utf8").replace(/<!--\s*-->/g, "")),
        );
        writable.on("error", reject);
      });

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

    const tipsterPickHtml = renderToStaticMarkup(
      <PlatformProvider dataset={redacted} initialRole="visitor">
        <PublicTipsterPickSurface pickSlug="sofia-sem" />
      </PlatformProvider>,
    );

    const clubHtml = await renderHtmlAsync(
      <PlatformProvider dataset={dataset} initialRole="member">
        <MatchStudioClubView leagueId={firstGame.league} gameId={firstGame.id} />
        <ParlayBuilderClubView />
        <SocialVipClubView />
        <AccountReferralsClubView />
        <AccountReferralsClubView initialTab="referrals" />
      </PlatformProvider>,
    );

    // ADR-051: la pestaña «Análisis IA» (`LazyCortexAnalysisCard`) se monta bajo demanda con `initialTab="ia"`.
    const matchIaHtml = await renderHtmlAsync(
      <PlatformProvider dataset={dataset} initialRole="member">
        <MatchStudioClubView
          leagueId={firstGame.league}
          gameId={firstGame.id}
          initialTab="ia"
        />
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
    expect(landingAndMenuHtml).toContain("los dos suman 7 días");

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

    expect(tipsterPickHtml).toContain("data-locked-pick");
    expect(matchIaHtml).toContain("Cortex IA");
    expect(clubHtml).toContain("los dos reciben +7 días");
    // Tipsters y comunidad de demostración siempre van marcados como ejemplo
    // (SOCIAL-2: cada publicación de ejemplo lleva su ficha «Ejemplo»).
    expect(clubHtml).toContain("data-example-badge");
    expect(clubHtml).not.toContain("Récord Verificado");

    const combinedLower = (
      landingAndMenuHtml +
      tipsterPickHtml +
      clubHtml +
      matchIaHtml
    ).toLowerCase();
    for (const term of FORBIDDEN_UI_TERMS) {
      expect(combinedLower).not.toContain(term);
    }
  });
});
