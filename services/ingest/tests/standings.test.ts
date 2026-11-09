import { describe, expect, it } from "vitest";
import { computeStandings } from "../src/pipeline.js";
import type { FootballTeamRateInput } from "@pitchlab/engines-reference";

const teams: FootballTeamRateInput[] = [
  { teamId: "liga-mx.alpha", name: "Alpha", shortName: "Alpha", code: "ALP", goalsFor: 0, goalsAgainst: 0, gamesPlayed: 0 },
  { teamId: "liga-mx.beta", name: "Beta", shortName: "Beta", code: "BET", goalsFor: 0, goalsAgainst: 0, gamesPlayed: 0 },
  { teamId: "liga-mx.gamma", name: "Gamma", shortName: "Gamma", code: "GAM", goalsFor: 0, goalsAgainst: 0, gamesPlayed: 0 },
  { teamId: "liga-mx.delta", name: "Delta", shortName: "Delta", code: "DEL", goalsFor: 0, goalsAgainst: 0, gamesPlayed: 0 },
];

describe("computeStandings", () => {
  it("asigna puntos, goles y ordena por puntos y diferencia", () => {
    const rows = computeStandings(
      [
        { date: "2026-08-10", home: "liga-mx.alpha", away: "liga-mx.beta", homeGoals: 2, awayGoals: 0 },
        { date: "2026-08-11", home: "liga-mx.gamma", away: "liga-mx.delta", homeGoals: 1, awayGoals: 1 },
        { date: "2026-08-12", home: "liga-mx.alpha", away: "liga-mx.gamma", homeGoals: 0, awayGoals: 3 },
        { date: "2026-08-13", home: "liga-mx.delta", away: "liga-mx.beta", homeGoals: 1, awayGoals: 0 },
      ],
      teams,
    );

    expect(rows).toHaveLength(4);
    const alpha = rows.find((r) => r.teamId === "liga-mx.alpha")!;
    expect(alpha.played).toBe(2);
    expect(alpha.won).toBe(1);
    expect(alpha.lost).toBe(1);
    expect(alpha.points).toBe(3);
    expect(alpha.goalsFor).toBe(2);
    expect(alpha.goalsAgainst).toBe(3);

    const gamma = rows.find((r) => r.teamId === "liga-mx.gamma")!;
    expect(gamma.points).toBe(4);
    expect(gamma.drawn).toBe(1);

    // Gamma (4) y delta (4) arriba; alpha (3) delante de beta (0).
    expect(rows[0]!.teamId).toBe("liga-mx.gamma");
    expect(rows[1]!.teamId).toBe("liga-mx.delta");
    expect(rows[2]!.teamId).toBe("liga-mx.alpha");
    expect(rows[3]!.teamId).toBe("liga-mx.beta");
  });

  it("ignora equipos sin partidos y no rompe con una liga vacía", () => {
    const rows = computeStandings(
      [{ date: "2026-08-10", home: "liga-mx.alpha", away: "liga-mx.beta", homeGoals: 1, awayGoals: 0 }],
      teams,
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.played === 1)).toBe(true);

    expect(computeStandings([], teams)).toEqual([]);
  });

  it("desempata por diferencia de goles y luego por goles a favor", () => {
    const rows = computeStandings(
      [
        { date: "2026-08-10", home: "liga-mx.alpha", away: "liga-mx.beta", homeGoals: 3, awayGoals: 1 },
        { date: "2026-08-11", home: "liga-mx.gamma", away: "liga-mx.delta", homeGoals: 2, awayGoals: 2 },
        { date: "2026-08-12", home: "liga-mx.gamma", away: "liga-mx.alpha", homeGoals: 0, awayGoals: 0 },
      ],
      teams,
    );
    // Alpha y Gamma empatan a 4 puntos; Alpha tiene mejor diferencia (+2 vs 0).
    expect(rows[0]!.teamId).toBe("liga-mx.alpha");
    expect(rows[1]!.teamId).toBe("liga-mx.gamma");
  });
});
