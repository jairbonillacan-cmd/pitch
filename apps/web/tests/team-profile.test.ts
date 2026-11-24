import { describe, expect, it } from "vitest";
import { PRODUCT_LEAGUES } from "../src/server/snapshots";
import {
  isProductLeague,
  loadLeaguePlayerProps,
  loadLeagueStandingsMeta,
  loadLeagueTeamsDirectory,
  loadPlayerProfile,
  loadTeamProfile,
  playerExistsInSnapshots,
  teamExistsInSnapshots,
} from "../src/server/team-profile";

const FORBIDDEN_FD16_RE =
  /\b(understat|clubelo|fbref|nflverse|openfootball|transfermarkt|bzzoiro|rotowire|moneypuck|basketball-reference|sofascore|fotmob|api-football|polymarket|kalshi|pinnacle|caliente|poisson|dixon-coles|lightgbm|pitagoras|pitágoras|log5|elo)\b/i;

describe("Cargador de perfiles de equipo y cumplimiento FD-16 / Cero-Fuga", () => {
  it("valida ligas y existencia de equipos reales frente a rutas inválidas", () => {
    expect(isProductLeague("liga-mx")).toBe(true);
    expect(isProductLeague("nba")).toBe(true);
    expect(isProductLeague("nhl")).toBe(true);
    expect(isProductLeague("mlb")).toBe(true);
    expect(isProductLeague("liga-fantasma")).toBe(false);

    expect(teamExistsInSnapshots("liga-mx", "monterrey")).toBe(true);
    expect(teamExistsInSnapshots("mlb", "los-angeles-dodgers")).toBe(true);
    expect(teamExistsInSnapshots("liga-mx", "equipo-inexistente")).toBe(false);

    expect(loadTeamProfile("mlb", "los-angeles-dodgers", { fullAccess: true })).not.toBeNull();
    expect(loadTeamProfile("liga-mx", "inexistente", { fullAccess: true })).toBeNull();
  });

  it("indexa los equipos de todas las ligas activas (> 200 equipos) y resuelve todos sin fugas FD-16", () => {
    const dir = loadLeagueTeamsDirectory();
    expect(dir.length).toBeGreaterThanOrEqual(200);

    const coreFullSeason = new Set([
      "liga-mx",
      "premier-league",
      "laliga",
      "bundesliga",
      "serie-a",
      "ligue-1",
      "nfl",
      "nba",
      "nhl",
      "mlb",
    ]);

    for (const lg of PRODUCT_LEAGUES) {
      const subset = dir.filter((item) => item.league === lg);
      expect(subset.length).toBeGreaterThanOrEqual(coreFullSeason.has(lg) ? 16 : 2);

      const sample = loadTeamProfile(lg, subset[0]!.slug, { fullAccess: true });
      expect(sample).not.toBeNull();
      expect(sample!.team.name.length).toBeGreaterThan(2);
      expect(sample!.modelSection.metrics.length).toBeGreaterThan(0);

      const serialized = JSON.stringify(sample);
      expect(serialized).not.toMatch(FORBIDDEN_FD16_RE);

      const matchIds = sample!.recentMatches.map((m) => `${m.date}|${m.opponent.slug}|${m.teamScore}-${m.opponentScore}`);
      expect(new Set(matchIds).size).toBe(matchIds.length);
    }
  });

  it("resuelve alias históricos reales en Liga MX y LaLiga sin perder partidos recientes", () => {
    const chivas = loadTeamProfile("liga-mx", "chivas", { fullAccess: true });
    expect(chivas).not.toBeNull();
    expect(chivas!.recentMatches.length).toBeGreaterThanOrEqual(5);
    expect(chivas!.recentAverages.sampleGames).toBeGreaterThanOrEqual(5);

    const celta = loadTeamProfile("laliga", "celta-vigo", { fullAccess: true });
    expect(celta).not.toBeNull();
    expect(celta!.recentMatches.length).toBeGreaterThanOrEqual(5);
  });

  it("oculta métricas del modelo y proyecciones pre-partido cuando fullAccess es false (Cero-Fuga)", () => {
    const full = loadTeamProfile("nfl", "kansas-city-chiefs", { fullAccess: true });
    expect(full).not.toBeNull();
    expect(full!.modelSection.locked).toBe(false);
    expect(full!.modelSection.metrics.length).toBeGreaterThan(0);

    const restricted = loadTeamProfile("nfl", "kansas-city-chiefs", { fullAccess: false });
    expect(restricted).not.toBeNull();
    expect(restricted!.modelSection.locked).toBe(true);
    expect(restricted!.modelSection.metrics).toEqual([]);
    for (const upcoming of restricted!.upcomingFixtures) {
      expect(upcoming.projectedTeamScore).toBeNull();
      expect(upcoming.projectedOpponentScore).toBeNull();
      expect(upcoming.winProbability).toBeNull();
      expect(upcoming.confidenceLabel).toBeNull();
    }
    // Resultados finalizados e identidad siguen disponibles con honestidad; bajas y datos de sede restringidos sin acceso.
    expect(restricted!.recentMatches.length).toBeGreaterThan(0);
    expect(restricted!.injuries).toEqual([]);
    expect(full!.injuries.length).toBeGreaterThanOrEqual(0);
    if (restricted!.venue) {
      expect(restricted!.venue.elevationM).toBeNull();
      expect(restricted!.venue.roofType).toBeNull();
    }
  });

  it("calcula racha real de últimos 5 partidos en Liga MX (18/18) y ligas europeas, e incluye lastMatch en perfil de jugador", () => {
    const mxMeta = loadLeagueStandingsMeta("liga-mx");
    expect(mxMeta).not.toBeNull();
    const mxSlugs = Object.keys(mxMeta!.formBySlug);
    expect(mxSlugs.length).toBe(18);
    for (const slug of mxSlugs) {
      expect(mxMeta!.formBySlug[slug]!.length).toBe(5);
    }

    for (const lg of ["premier-league", "laliga", "bundesliga", "serie-a", "ligue-1"] as const) {
      const meta = loadLeagueStandingsMeta(lg);
      expect(meta).not.toBeNull();
      const entries = Object.values(meta!.formBySlug);
      expect(entries.length).toBeGreaterThanOrEqual(18);
      for (const form of entries) {
        expect(form.length).toBeGreaterThanOrEqual(4);
      }
    }

    const america = loadTeamProfile("liga-mx", "america", { fullAccess: true });
    expect(america).not.toBeNull();
    expect(america!.recentMatches[0]?.date.startsWith("2026-")).toBe(true);
    const firstPlayer = america!.squad?.players[0];
    expect(firstPlayer).toBeDefined();
    expect(playerExistsInSnapshots("liga-mx", "america", firstPlayer!.slug)).toBe(true);
    expect(playerExistsInSnapshots("liga-mx", "america", "jugador-inexistente")).toBe(false);
    const playerProfile = loadPlayerProfile("liga-mx", "america", firstPlayer!.slug, {
      fullAccess: true,
    });
    expect(playerProfile).not.toBeNull();
    expect(playerProfile!.lastMatch).not.toBeNull();
    expect(playerProfile!.lastMatch!.date.startsWith("2026-")).toBe(true);

    const uclMadrid = loadTeamProfile("champions-league", "real-madrid", { fullAccess: true });
    expect(uclMadrid).not.toBeNull();
    expect(uclMadrid!.squad?.players.length ?? 0).toBeGreaterThan(10);

    const uclPsg = loadTeamProfile("champions-league", "paris-saint-germain", { fullAccess: true });
    expect(uclPsg).not.toBeNull();
    expect(uclPsg!.squad?.players.length ?? 0).toBeGreaterThan(10);

    const leaguesCupMty = loadTeamProfile("leagues-cup", "monterrey", { fullAccess: true });
    expect(leaguesCupMty).not.toBeNull();
    expect(leaguesCupMty!.squad?.players.length ?? 0).toBeGreaterThan(10);

    const mlsChicago = loadTeamProfile("mls", "chicago-fire", { fullAccess: true });
    expect(mlsChicago).not.toBeNull();
    expect(mlsChicago!.squad?.players.length ?? 0).toBeGreaterThan(10);
  });

  it("carga props de jugadores sin romper si falta player-props.json de NBA", () => {
    const emptyNba = loadLeaguePlayerProps([
      {
        id: "nba-test-game",
        league: "nba" as never,
        leagueLabel: "NBA",
        sport: "basketball",
        round: "Temporada",
        day: "2026-11-20",
        dayLabel: "2026-11-20",
        kickoffUtc: "2026-11-21T01:00:00Z",
        kickoffLocal: "19:00",
        venue: "TD Garden",
        status: "NS",
        home: { slug: "boston-celtics", name: "Boston Celtics", shortName: "Boston", code: "BOS", record: "10-2" },
        away: { slug: "new-york-knicks", name: "New York Knicks", shortName: "Knicks", code: "NYK", record: "8-4" },
        hasForecast: true,
        outcomes: [],
        factors: [],
        trace: [],
        marketGroups: [],
        picks: [],
        markets: [],
        scorelines: [],
        quality: { flag: "ok", coveragePct: 90 },
        hasRecentQuote: false,
      } as never,
    ]);
    expect(Array.isArray(emptyNba)).toBe(true);
    expect(JSON.stringify(emptyNba)).not.toMatch(/\bbzzoiro\b/i);
  });
});
