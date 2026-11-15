import { describe, expect, it } from "vitest";
import { PRODUCT_LEAGUES } from "../src/server/snapshots";
import {
  isProductLeague,
  loadLeagueTeamsDirectory,
  loadTeamProfile,
  teamExistsInSnapshots,
} from "../src/server/team-profile";

const FORBIDDEN_FD16_RE =
  /\b(understat|clubelo|fbref|nflverse|openfootball|transfermarkt|bzzoiro|rotowire|moneypuck|basketball-reference|sofascore|fotmob|api-football|polymarket|kalshi|pinnacle|caliente|poisson|dixon-coles|lightgbm|pitagoras|pitágoras|log5)\b/i;

describe("Cargador de perfiles de equipo y cumplimiento FD-16 / Cero-Fuga", () => {
  it("valida ligas y existencia de equipos reales frente a rutas inválidas", () => {
    expect(isProductLeague("liga-mx")).toBe(true);
    expect(isProductLeague("nba")).toBe(true);
    expect(isProductLeague("nhl")).toBe(true);
    expect(isProductLeague("mlb")).toBe(false);

    expect(teamExistsInSnapshots("liga-mx", "monterrey")).toBe(true);
    expect(teamExistsInSnapshots("liga-mx", "equipo-inexistente")).toBe(false);
    expect(teamExistsInSnapshots("mlb", "dodgers")).toBe(false);

    expect(loadTeamProfile("mlb", "dodgers", { fullAccess: true })).toBeNull();
    expect(loadTeamProfile("liga-mx", "inexistente", { fullAccess: true })).toBeNull();
  });

  it("indexa los equipos de todas las ligas activas (> 200 equipos) y resuelve todos sin fugas FD-16", () => {
    const dir = loadLeagueTeamsDirectory();
    expect(dir.length).toBeGreaterThanOrEqual(200);

    for (const lg of PRODUCT_LEAGUES) {
      const subset = dir.filter((item) => item.league === lg);
      expect(subset.length).toBeGreaterThanOrEqual(16);

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
    // Resultados finalizados e identidad siguen disponibles con honestidad.
    expect(restricted!.recentMatches.length).toBeGreaterThan(0);
    expect(restricted!.injuries.length).toBe(full!.injuries.length);
  });
});
