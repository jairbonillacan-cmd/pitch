import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LeagueSnapshotSchema } from "@pitchlab/contracts";
import {
  UnmappedTeamError,
  buildFootballSnapshot,
  buildNflSnapshot,
  normalizeApiFootballLigaMx,
  normalizeNflverseSchedule,
  normalizeOpenFootballPremierLeague,
  resolveCanonicalTeam,
} from "../src/index.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "../fixtures");

describe("@pitchlab/ingest", () => {
  it("mapea nombres de las 3 fuentes a TeamId canónicos y falla con error claro si un nombre no existe", () => {
    expect(resolveCanonicalTeam("nfl", "KC").id).toBe("nfl.kansas-city-chiefs");
    expect(resolveCanonicalTeam("nfl", "LA").id).toBe("nfl.los-angeles-rams");
    expect(resolveCanonicalTeam("premier-league", "Arsenal FC").id).toBe("premier-league.arsenal");
    expect(resolveCanonicalTeam("premier-league", "Brighton & Hove Albion FC").id).toBe(
      "premier-league.brighton-hove-albion",
    );
    expect(resolveCanonicalTeam("liga-mx", "Atlante").id).toBe("liga-mx.atlante");
    expect(resolveCanonicalTeam("liga-mx", "Atlas").id).toBe("liga-mx.atlas");

    expect(() => resolveCanonicalTeam("premier-league", "Equipo Inventado FC")).toThrow(
      UnmappedTeamError,
    );
    expect(() => resolveCanonicalTeam("nfl", "FAKE")).toThrow(UnmappedTeamError);
    expect(() => resolveCanonicalTeam("liga-mx", "Club Desconocido")).toThrow(UnmappedTeamError);
  });

  it("normaliza y analiza el fixture grabado de nflverse (NFL 2026) generando un snapshot válido", () => {
    const csv = readFileSync(resolve(FIXTURES_DIR, "nflverse-games-2026.csv"), "utf8");
    const norm = normalizeNflverseSchedule(csv, {
      season: 2026,
      referenceDate: "2026-11-08",
      targetWeek: 9,
    });

    expect(norm.activeWeek).toBe(9);
    expect(norm.activeWeekGames.length).toBe(15);

    const kcRate = norm.teamRateInputs.find((t) => t.teamId === "nfl.kansas-city-chiefs")!;
    expect(kcRate.gamesPlayed).toBeGreaterThan(0);

    const snap = buildNflSnapshot({
      seasonId: norm.seasonId,
      seasonLabel: norm.seasonLabel,
      periodLabel: norm.periodLabel,
      games: norm.activeWeekGames,
      teamRateInputs: norm.teamRateInputs,
      updatedAt: "2026-11-08T14:00:00Z",
    });

    const validated = LeagueSnapshotSchema.parse(snap);
    expect(validated.games).toHaveLength(15);
    expect(Object.keys(validated.analyses)).toHaveLength(15);
  });

  it("normaliza y analiza el fixture grabado de openfootball (Premier League 2026/27)", () => {
    const raw = JSON.parse(
      readFileSync(resolve(FIXTURES_DIR, "openfootball-en-2026-27.json"), "utf8").replace(/^\uFEFF/, ""),
    );
    const norm = normalizeOpenFootballPremierLeague(raw, {
      referenceDate: "2026-11-08",
      targetMatchday: 10,
    });

    expect(norm.activeMatchday).toBe(10);
    expect(norm.activeRoundGames).toHaveLength(10);

    const arsRate = norm.teamRateInputs.find((t) => t.teamId === "premier-league.arsenal")!;
    expect(arsRate.gamesPlayed).toBe(3);

    const snap = buildFootballSnapshot({
      league: "premier-league",
      leagueName: "Premier League",
      seasonId: norm.seasonId,
      seasonLabel: norm.seasonLabel,
      periodLabel: norm.periodLabel,
      games: norm.activeRoundGames,
      teamRateInputs: norm.teamRateInputs,
      updatedAt: "2026-11-08T14:00:00Z",
      source: "openfootball",
    });

    const validated = LeagueSnapshotSchema.parse(snap);
    expect(validated.games).toHaveLength(10);
    expect(Object.keys(validated.analyses)).toHaveLength(10);
  });

  it("normaliza y analiza el fixture grabado de API-Football (Liga MX Apertura 2026)", () => {
    const raw = JSON.parse(
      readFileSync(resolve(FIXTURES_DIR, "api-football-liga-mx-2026.json"), "utf8"),
    );
    const norm = normalizeApiFootballLigaMx(raw, {
      referenceDate: "2026-11-08",
      targetRound: 16,
    });

    expect(norm.activeRound).toBe(16);
    expect(norm.activeRoundGames).toHaveLength(2);

    const snap = buildFootballSnapshot({
      league: "liga-mx",
      leagueName: "Liga MX",
      seasonId: norm.seasonId,
      seasonLabel: norm.seasonLabel,
      periodLabel: norm.periodLabel,
      games: norm.activeRoundGames,
      teamRateInputs: norm.teamRateInputs,
      updatedAt: "2026-11-08T14:00:00Z",
      source: "api-football",
    });

    expect(LeagueSnapshotSchema.parse(snap).games).toHaveLength(2);
  });

  it("garantiza la inmutabilidad del historial: conserva intacto el análisis publicado antes del inicio cuando el partido finaliza", () => {
    const raw = JSON.parse(
      readFileSync(resolve(FIXTURES_DIR, "openfootball-en-2026-27.json"), "utf8").replace(/^\uFEFF/, ""),
    );
    const norm = normalizeOpenFootballPremierLeague(raw, {
      referenceDate: "2026-11-06",
      targetMatchday: 10,
    });

    // 1. Primer snapshot publicado el 2026-11-06 (antes del inicio el 2026-11-07T15:00:00)
    const snapBefore = buildFootballSnapshot({
      league: "premier-league",
      leagueName: "Premier League",
      seasonId: norm.seasonId,
      seasonLabel: norm.seasonLabel,
      periodLabel: norm.periodLabel,
      games: norm.activeRoundGames,
      teamRateInputs: norm.teamRateInputs,
      updatedAt: "2026-11-06T18:00:00Z",
      source: "openfootball",
    });

    const firstGame = norm.activeRoundGames[0]!;
    const originalAnalysis = snapBefore.analyses[firstGame.id]!;

    // 2. El partido termina (2-1) y además cambian las tasas de los equipos
    const gamesAfter = norm.activeRoundGames.map((g, idx) =>
      idx === 0
        ? {
            ...g,
            status: "final" as const,
            result: {
              home: 2,
              away: 1,
              observedAt: "2026-11-07T17:00:00Z",
              source: "openfootball",
            },
          }
        : g,
    );
    const alteredRates = norm.teamRateInputs.map((t) => ({
      ...t,
      goalsFor: t.goalsFor + 10,
      gamesPlayed: t.gamesPlayed + 2,
    }));

    const snapAfter = buildFootballSnapshot({
      league: "premier-league",
      leagueName: "Premier League",
      seasonId: norm.seasonId,
      seasonLabel: norm.seasonLabel,
      periodLabel: norm.periodLabel,
      games: gamesAfter,
      teamRateInputs: alteredRates,
      updatedAt: "2026-11-08T10:00:00Z",
      source: "openfootball",
      previousSnapshot: snapBefore,
    });

    // El resultado final se agregó al partido
    expect(snapAfter.games[0]!.status).toBe("final");
    expect(snapAfter.games[0]!.result?.home).toBe(2);
    expect(snapAfter.games[0]!.result?.away).toBe(1);

    // El análisis publicado antes del inicio permanece idéntico (sin recalcular)
    expect(snapAfter.analyses[firstGame.id]).toEqual(originalAnalysis);
    expect(snapAfter.analyses[firstGame.id]!.publishedAt).toBe("2026-11-06T18:00:00Z");
  });
});
