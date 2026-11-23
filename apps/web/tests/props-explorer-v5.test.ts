import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { asLeagueId, type SquadPlayerStats } from "@pitchlab/contracts";
import type { PlayerPropItem } from "@pitchlab/ui/types";
import {
  evaluateFootballPropV5,
  loadPlayerPropStreakCards,
  loadStructuredPlayerProps,
  resolveSoccerKnockoutLegTypeV5,
  resolveSoccerPositionClusterV5,
  resolveSoccerPropFamilyV5,
} from "../src/server/props-explorer";
import { projectSoccerPlayerPropV5 } from "../src/server/spacetime-v5";

function makeStats(overrides: Partial<SquadPlayerStats> = {}): SquadPlayerStats {
  return {
    appearances: 15,
    subIns: 1,
    goals: 7,
    assists: 4,
    shots: 38,
    shotsOnTarget: 18,
    foulsCommitted: 14,
    foulsSuffered: 20,
    yellowCards: 3,
    redCards: 0,
    offsides: 5,
    saves: 0,
    shotsFaced: 0,
    goalsConceded: 0,
    ...overrides,
  };
}

describe("props-explorer · Migración v5.1 Logit-Space PAVA Spline + 3 regímenes + knockout 90'", () => {
  it("resuelve familias de props, clústeres posicionales y tipo de eliminatoria 90'", () => {
    expect(resolveSoccerPropFamilyV5("Tiros a puerta", "prop:g1:liv:salah:player_sot")).toBe(
      "shots_on_target",
    );
    expect(resolveSoccerPropFamilyV5("Tiros totales", "prop:g1:liv:salah:player_shots")).toBe(
      "shots",
    );
    expect(resolveSoccerPropFamilyV5("Anotador", "prop:g1:liv:salah:player_goal")).toBe("goals");
    expect(
      resolveSoccerPropFamilyV5("Anota o asiste", "prop:g1:liv:salah:player_goal_or_assist"),
    ).toBe("goals_assists");
    expect(resolveSoccerPropFamilyV5("Asistencias")).toBe("assists");
    expect(resolveSoccerPropFamilyV5("Tarjetas amarillas")).toBe("yellow_cards");
    expect(resolveSoccerPropFamilyV5("Atajadas", "prop:g1:liv:alisson:player_saves")).toBeNull();

    expect(resolveSoccerPositionClusterV5("GK", "Portero")).toBe("GK");
    expect(resolveSoccerPositionClusterV5("DEF", "Defensa central")).toBe("DF_CB");
    expect(resolveSoccerPositionClusterV5("DEF", "Lateral izquierdo")).toBe("DF_FB");
    expect(resolveSoccerPositionClusterV5("MID", "Pivote defensivo")).toBe("MF_DM");
    expect(resolveSoccerPositionClusterV5("MID", "Mediocampista")).toBe("MF_CM");
    expect(resolveSoccerPositionClusterV5("MID", "Mediapunta ofensivo")).toBe("MF_AM");
    expect(resolveSoccerPositionClusterV5("FWD", "Extremo derecho")).toBe("FW_W");
    expect(resolveSoccerPositionClusterV5("FWD", "Delantero centro")).toBe("FW_CF");

    expect(
      resolveSoccerKnockoutLegTypeV5({ league: "premier-league", round: "Jornada 22" }),
    ).toBe("none");
    expect(
      resolveSoccerKnockoutLegTypeV5({
        league: "champions-league",
        round: "Cuartos de final - Ida",
      }),
    ).toBe("first_leg");
    expect(
      resolveSoccerKnockoutLegTypeV5({
        league: "champions-league",
        round: "Cuartos de final - Vuelta",
      }),
    ).toBe("second_leg");
    expect(
      resolveSoccerKnockoutLegTypeV5({
        league: "libertadores",
        previousLegGameId: "lib-leg-1",
      }),
    ).toBe("second_leg");
    expect(
      resolveSoccerKnockoutLegTypeV5({
        league: "champions-league",
        stageName: "Final",
      }),
    ).toBe("single_final");
    expect(resolveSoccerKnockoutLegTypeV5({ league: "uefa-super-cup" })).toBe("single_final");
    expect(
      resolveSoccerKnockoutLegTypeV5({
        league: "liga-mx",
        stageName: "Liguilla Cuartos",
      }),
    ).toBe("first_leg");
  });

  it("mantiene paridad exacta < 1e-12 con projectSoccerPlayerPropV5 y elimina el piso artificial [0.08, 0.92]", () => {
    const stats = makeStats({ appearances: 14, goals: 9, shotsOnTarget: 22 });
    const evaluated = evaluateFootballPropV5({
      statLabel: "Anotador",
      propId: "prop:ucl-1:real-madrid:mbappe:player_goal",
      line: 0.5,
      projectionMean: 0.64,
      projectionSd: 0.55,
      league: "champions-league",
      positionGroup: "FWD",
      positionLabel: "Delantero centro",
      avgMinutes: 84,
      sampleGames: 14,
      playerStats: stats,
      lineupStatus: "confirmed",
      availabilityStatus: "available",
      round: "Semifinal - Vuelta",
      teamProjectedGoals: 1.89,
    });

    const direct = projectSoccerPlayerPropV5({
      propFamily: "goals",
      posCluster: "FW_CF",
      weightedSumY: 9,
      weightedExposure90: (14 * 84) / 90,
      expectedMinutesStarter: 84,
      lineupStatus: "confirmed_starter",
      teamGoalFactor: 1.89 / 1.35,
      oppDefFactor: 1.0,
      refereeFactor: 1.0,
      line: 0.5,
      knockoutLegType: "second_leg",
    });

    expect(evaluated.source).toBe("spacetime_hierarchical_v5");
    expect(evaluated.propFamily).toBe("goals");
    expect(evaluated.posCluster).toBe("FW_CF");
    expect(evaluated.lineupStatus).toBe("confirmed_starter");
    expect(evaluated.knockoutLegType).toBe("second_leg");
    expect(Math.abs(evaluated.pOver - direct.pOverCalibrated)).toBeLessThan(1e-12);
    expect(Math.abs(evaluated.pUnder - direct.pUnderCalibrated)).toBeLessThan(1e-12);
    expect(evaluated.fairOverDecimal).toBe(direct.fairOverDecimal);
    expect(evaluated.fairUnderDecimal).toBe(direct.fairUnderDecimal);
    expect(evaluated.pOverSubCover).toBeGreaterThanOrEqual(evaluated.pOver);

    const lowProbCb = evaluateFootballPropV5({
      statLabel: "Anotador",
      line: 1.5,
      projectionMean: 0.04,
      projectionSd: 0.2,
      league: "premier-league",
      positionGroup: "DEF",
      positionLabel: "Defensa central",
      avgMinutes: 88,
      sampleGames: 18,
      playerStats: makeStats({ appearances: 18, goals: 0 }),
      lineupStatus: "confirmed",
    });
    expect(lowProbCb.source).toBe("spacetime_hierarchical_v5");
    expect(lowProbCb.pOver).toBeLessThan(0.08);
    expect(lowProbCb.pOver).toBeGreaterThan(0);
  });

  it("aplica los 3 regímenes de minutos, knockout limpio 90', rigor arbitral y respaldo continuo en atajadas", () => {
    const baseInput = {
      statLabel: "Tiros a puerta",
      line: 0.5,
      projectionMean: 1.25,
      projectionSd: 0.85,
      league: "premier-league",
      positionGroup: "FWD",
      positionLabel: "Delantero centro",
      avgMinutes: 82,
      sampleGames: 12,
      playerStats: makeStats({ appearances: 12, shotsOnTarget: 16 }),
    };

    const confirmed = evaluateFootballPropV5({ ...baseInput, lineupStatus: "confirmed" });
    const probable = evaluateFootballPropV5({ ...baseInput, lineupStatus: "probable" });
    const doubtful = evaluateFootballPropV5({
      ...baseInput,
      lineupStatus: "probable",
      availabilityStatus: "doubtful",
    });
    const bench = evaluateFootballPropV5({
      ...baseInput,
      lineupStatus: null,
      avgMinutes: 48,
    });

    expect(confirmed.expectedMinutes).toBeGreaterThan(probable.expectedMinutes);
    expect(probable.expectedMinutes).toBeGreaterThan(doubtful.expectedMinutes);
    expect(doubtful.expectedMinutes).toBeGreaterThan(bench.expectedMinutes);
    expect(confirmed.pOver).toBeGreaterThan(bench.pOver);

    const koBase = {
      ...baseInput,
      statLabel: "Anotador",
      league: "champions-league",
      lineupStatus: "confirmed" as const,
    };
    const ida = evaluateFootballPropV5({ ...koBase, round: "Cuartos - Ida" });
    const regular = evaluateFootballPropV5({ ...koBase, league: "premier-league", round: "Jornada 18" });
    const vuelta = evaluateFootballPropV5({ ...koBase, round: "Cuartos - Vuelta" });
    expect(ida.knockoutLegType).toBe("first_leg");
    expect(regular.knockoutLegType).toBe("none");
    expect(vuelta.knockoutLegType).toBe("second_leg");
    expect(ida.pOver).toBeLessThan(vuelta.pOver);

    const cardsStrict = evaluateFootballPropV5({
      statLabel: "Tarjetas amarillas",
      line: 0.5,
      projectionMean: 0.3,
      projectionSd: 0.5,
      league: "premier-league",
      positionGroup: "MID",
      positionLabel: "Pivote defensivo",
      avgMinutes: 85,
      sampleGames: 15,
      playerStats: makeStats({ appearances: 15, yellowCards: 6 }),
      refereeAvgYellow: 5.4,
    });
    const cardsLenient = evaluateFootballPropV5({
      statLabel: "Tarjetas amarillas",
      line: 0.5,
      projectionMean: 0.3,
      projectionSd: 0.5,
      league: "premier-league",
      positionGroup: "MID",
      positionLabel: "Pivote defensivo",
      avgMinutes: 85,
      sampleGames: 15,
      playerStats: makeStats({ appearances: 15, yellowCards: 6 }),
      refereeAvgYellow: 2.8,
    });
    expect(cardsStrict.pOver).toBeGreaterThan(cardsLenient.pOver);

    const gkSaves = evaluateFootballPropV5({
      statLabel: "Atajadas",
      propId: "prop:g1:liv:alisson:player_saves",
      line: 2.5,
      projectionMean: 3.1,
      projectionSd: 1.4,
      league: "premier-league",
      positionGroup: "GK",
      positionLabel: "Portero",
      avgMinutes: 90,
      sampleGames: 15,
    });
    expect(gkSaves.source).toBe("continuous_fallback");
    expect(gkSaves.fairOverDecimal).toBeGreaterThanOrEqual(1.05);
    expect(gkSaves.fairUnderDecimal).toBeGreaterThanOrEqual(1.05);
  });

  it("respeta invariantes fast-check (0 < p < 1, subCover >= p, línea 0.5 >= 1.5, momios justos > 1)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "Tiros a puerta",
          "Tiros totales",
          "Anotador",
          "Anota o asiste",
          "Asistencias",
          "Tarjetas amarillas",
        ),
        fc.constantFrom("DEF", "MID", "FWD"),
        fc.double({ min: 45, max: 90, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.1, max: 3.5, noNaN: true, noDefaultInfinity: true }),
        (statLabel, positionGroup, avgMinutes, projectionMean) => {
          const r05 = evaluateFootballPropV5({
            statLabel,
            line: 0.5,
            projectionMean,
            projectionSd: 0.8,
            league: "liga-mx",
            positionGroup,
            avgMinutes,
            sampleGames: 10,
          });
          const r15 = evaluateFootballPropV5({
            statLabel,
            line: 1.5,
            projectionMean,
            projectionSd: 0.8,
            league: "liga-mx",
            positionGroup,
            avgMinutes,
            sampleGames: 10,
          });
          expect(r05.source).toBe("spacetime_hierarchical_v5");
          expect(r05.pOver).toBeGreaterThan(0);
          expect(r05.pOver).toBeLessThan(1);
          expect(r05.pOverSubCover).toBeGreaterThanOrEqual(r05.pOver);
          expect(r05.pOver).toBeGreaterThanOrEqual(r15.pOver - 1e-12);
          expect(r05.fairOverDecimal).toBeGreaterThanOrEqual(1.01);
          expect(r05.fairUnderDecimal).toBeGreaterThanOrEqual(1.01);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("mantiene Cero-Fuga en loadStructuredPlayerProps y firma retrocompatible en loadPlayerPropStreakCards", () => {
    const sampleBaseProp: PlayerPropItem = {
      id: "prop:pl-1:liverpool:mohamed-salah:player_sot",
      league: asLeagueId("premier-league"),
      leagueLabel: "Premier League",
      gameId: "pl-1",
      matchLabel: "ARS @ LIV",
      kickoffLocal: "12:00",
      player: "Mohamed Salah",
      teamSlug: "liverpool",
      teamName: "Liverpool",
      position: "FWD",
      statLabel: "Tiros a puerta",
      baseLine: 0.5,
      step: 0.5,
      minLine: 0.5,
      maxLine: 2.5,
      projectionMean: 1.35,
      projectionSd: 0.9,
      engineName: "Tachyon Player Lab",
      marketOverDecimal: 1.65,
      marketUnderDecimal: 2.25,
      last10: [2, 1, 1, 3, 0],
      contextNote: "Muestra verificada",
    };

    expect(
      loadStructuredPlayerProps({
        fullAccess: false,
        baseProps: [sampleBaseProp],
      }),
    ).toEqual([]);

    const streakCards = loadPlayerPropStreakCards(8);
    expect(Array.isArray(streakCards)).toBe(true);
    expect(streakCards.length).toBeLessThanOrEqual(8);
  });
});
