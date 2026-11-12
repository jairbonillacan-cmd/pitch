import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildTeamIndex,
  robotsAllowsCrawling,
  parseAlltimeStreaksPage,
  parseCompetitionPage,
  parseFormPage,
  parseMatchPage,
  parseTeamPage,
  resolveTeam,
  trailingStreak,
  type CorpusMatch,
} from "../src/index.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures", "history", "native-stats");

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

describe("native-stats — competición", () => {
  const parsed = parseCompetitionPage(fixture("competition-sample.html"), "PL");

  it("lee nombre, temporada y selector de temporadas", () => {
    expect(parsed.code).toBe("PL");
    expect(parsed.name).toBe("Premier League");
    expect(parsed.seasonLabel).toBe("2026/27");
    expect(parsed.seasons).toHaveLength(3);
    expect(parsed.seasons[0]).toMatchObject({ id: "2502", label: "2026/27", selected: true });
    expect(parsed.seasons[1]!.selected).toBe(false);
  });

  it("lee la tabla de posiciones con equipos resueltos a su id nativo", () => {
    expect(parsed.standings).toHaveLength(2);
    expect(parsed.standings[0]).toMatchObject({
      position: 1,
      played: 10,
      points: 27,
      goalDiff: 10,
      goalsFor: 15,
      goalsAgainst: 5,
    });
    expect(parsed.standings[0]!.team).toMatchObject({
      teamId: 57,
      name: "Arsenal",
      code: "ARS",
    });
    expect(parsed.standings[1]!.team.teamId).toBe(397);
  });

  it("separa partidos jugados (con marcador) de programados", () => {
    expect(parsed.matches).toHaveLength(2);
    expect(parsed.matches[0]).toMatchObject({
      matchId: 560001,
      status: "finished",
      kickoffText: "2026/11/08, 15h00",
      score: { home: 3, away: 1 },
    });
    expect(parsed.matches[0]!.home!.name).toBe("Arsenal");
    expect(parsed.matches[1]).toMatchObject({
      matchId: 560002,
      status: "scheduled",
      score: null,
    });
  });
});

describe("native-stats — equipo", () => {
  const parsed = parseTeamPage(fixture("team-sample.html"), 57);

  it("lee identidad y competición de la página", () => {
    expect(parsed.teamId).toBe(57);
    expect(parsed.name).toBe("Arsenal FC");
    expect(parsed.competitionCode).toBe("PL");
    expect(parsed.scopeCode).toBe("PL");
    expect(parsed.crest).toBe("57");
  });

  it("lee el resumen: posición, valor de plantilla y últimos 10", () => {
    expect(parsed.overview.leaguePosition).toBe(1);
    expect(parsed.overview.marketValueMillionEur).toBe(1240.5);
    expect(parsed.overview.last10).toBe("WWDWL");
    expect(parsed.overview.lastWin).toBe("2026/11/08, 15h00");
    expect(parsed.overview.lastLoss).toBe("2026/10/25, 17h30");
  });

  it("lee agregados con split local/visitante y rango de la liga", () => {
    expect(parsed.aggregates).toHaveLength(3);
    expect(parsed.aggregates[0]).toEqual({
      key: "total_matches",
      total: 615,
      home: 307,
      away: 308,
      leagueMax: 3180,
      leagueMin: 190,
    });
    expect(parsed.aggregates[1]).toMatchObject({ key: "total_points", total: 847, leagueMax: null });
  });

  it("lee rachas vigentes, récord propio y poseedor del récord de la liga", () => {
    expect(parsed.streaks).toHaveLength(3);
    const wins = parsed.streaks[0]!;
    expect(wins.key).toBe("consecutive_wins");
    expect(wins.current).toEqual({ total: 2, home: 1, away: 1 });
    expect(wins.record).toEqual({ total: 8, home: 7, away: 5 });
    expect(wins.leagueHistory).toEqual([
      { nativeId: 449, value: 9 },
      { nativeId: 458, value: 10 },
      { nativeId: 114, value: 8 },
    ]);
  });

  it("no inventa récord de liga cuando la celda viene vacía", () => {
    const halfTime = parsed.streaks[2]!;
    expect(halfTime.key).toBe("no_loss_after_ht_lead");
    expect(halfTime.leagueHistory).toEqual([]);
  });
});

describe("native-stats — partido", () => {
  const parsed = parseMatchPage(fixture("match-sample.html"), 560001);

  it("lee el marcador final y el marcador al descanso", () => {
    expect(parsed.matchId).toBe(560001);
    expect(parsed.competitionCode).toBe("PL");
    expect(parsed.date).toBe("2026-11-08");
    expect(parsed.time).toBe("15:00");
    expect(parsed.score).toEqual({ home: 3, away: 1 });
    expect(parsed.halfTime).toEqual({ home: 1, away: 0 });
  });

  it("lee los equipos del encabezado", () => {
    expect(parsed.home).toMatchObject({ teamId: 57, name: "Arsenal", code: "ARS" });
    expect(parsed.away).toMatchObject({ teamId: 61, name: "Chelsea FC", code: "CHE" });
  });

  it("lee goleadores y tarjetas sin inventar asistencia", () => {
    expect(parsed.goals).toHaveLength(2);
    expect(parsed.goals[0]).toMatchObject({
      minute: 12,
      team: "Arsenal",
      scorer: "Bukayo Saka",
      assist: null,
      score: { home: 1, away: 0 },
    });
    expect(parsed.goals[1]!.assist).toBe("Cole Palmer");
    expect(parsed.bookings).toHaveLength(1);
    expect(parsed.bookings[0]).toMatchObject({ minute: 34, team: "Chelsea FC" });
    expect(parsed.substitutions).toEqual([]);
  });
});

describe("native-stats — forma avanzada del día", () => {
  const page = parseFormPage(fixture("form-sample.html"));

  it("lee la fecha que la página está mostrando", () => {
    expect(page.pageDate).toBe("2026-11-09");
  });

  it("mapea las columnas por su abreviatura y no por posición", () => {
    const finished = page.rows[0]!;
    expect(finished.competitionCode).toBe("LMX");
    expect(finished.status).toBe("finished");
    expect(finished.score).toEqual({ home: 0, away: 2 });
    expect(finished.home).toMatchObject({ name: "Querétaro FC", code: "QUE" });
    expect(finished.metrics.avgPoints).toEqual({ home: 0.6, away: 0.4 });
    expect(finished.metrics.combinedGoals).toBe(3.5);
    expect(finished.metrics.combinedFirstHalfGoalsPercentile).toBe(40);
    expect(finished.metrics.combinedSecondHalfGoalsPercentile).toBe(60);
    expect(finished.metrics.bothTeamsScored).toEqual({ home: 60, away: 80 });
    expect(finished.metrics.over25).toEqual({ home: 80, away: 60 });
  });

  it("lee cuotas cuando existen y deja odds=null cuando la celda viene vacía", () => {
    expect(page.rows[0]!.odds).toBeNull();
    const scheduled = page.rows[1]!;
    expect(scheduled.status).toBe("scheduled");
    expect(scheduled.date).toBe("2026-11-09");
    expect(scheduled.time).toBe("16:30");
    expect(scheduled.odds).toEqual({ home: 2.1, draw: 3.4, away: 3.6 });
    expect(scheduled.metrics.avgPoints).toEqual({ home: 2.2, away: 1.8 });
  });
});

describe("native-stats — ranking histórico de rachas", () => {
  const boards = parseAlltimeStreaksPage(fixture("streaks-sample.html"));

  it("lee el tablero global conservando días, partidos y periodo", () => {
    expect(boards).toHaveLength(1);
    expect(boards[0]!.entries).toHaveLength(2);
    expect(boards[0]!.entries[0]).toMatchObject({
      rank: 1,
      days: 483,
      matches: 69,
      periodStart: "2024-08-26",
      periodEnd: "2025-12-22",
    });
    expect(boards[0]!.entries[0]!.team).toMatchObject({ teamId: 57, name: "Arsenal" });
    expect(boards[0]!.entries[1]!.team!.name).toBe("Real Madrid");
  });

  it("no etiqueta las filas con una liga que la página no declara", () => {
    // Los escudos de `/competition/…` son el filtro de la interfaz, no la liga de la fila.
    expect(boards[0]).not.toHaveProperty("competitionCode");
  });
});

describe("native-stats — robots.txt y resolución de equipos", () => {
  it("aborta si el grupo * prohíbe la raíz", () => {
    expect(robotsAllowsCrawling("User-agent: *\nDisallow: /\n")).toBe(false);
    expect(robotsAllowsCrawling("User-agent: Googlebot\nDisallow: /\n")).toBe(true);
  });

  it("el robots.txt real del sitio no prohíbe el rastreo", () => {
    const robots = [
      "# See https://www.robotstxt.org/robotstxt.html for documentation on how to use the robots.txt file",
      "#",
      "# To ban all spiders from the entire site uncomment the next two lines:",
      "# User-agent: *",
      "# Disallow: /",
    ].join("\n");
    expect(robotsAllowsCrawling(robots)).toBe(true);
  });

  it("resuelve por alias, slug exacto, conjunto de tokens, prefijo y sufijo", () => {
    const index = buildTeamIndex([
      "premier-league.arsenal",
      "la-liga.athletic",
      "la-liga.real-betis",
      "la-liga.rayo-vallecano",
      "la-liga.sporting-gijon",
      "serie-a.inter",
      "liga-mx.uanl-tigres",
      "bundesliga.koln",
    ]);

    expect(resolveTeam(index, "PL", "Arsenal FC")).toEqual({
      teamId: "premier-league.arsenal",
      strategy: "exact",
    });
    expect(resolveTeam(index, "PD", "Athletic Club")).toEqual({
      teamId: "la-liga.athletic",
      strategy: "alias",
    });
    expect(resolveTeam(index, "PD", "Real Betis Balompié")).toEqual({
      teamId: "la-liga.real-betis",
      strategy: "alias",
    });
    expect(resolveTeam(index, "PD", "Rayo Vallecano de Madrid")).toEqual({
      teamId: "la-liga.rayo-vallecano",
      strategy: "alias",
    });
    expect(resolveTeam(index, "PD", "Real Sporting de Gijón")).toEqual({
      teamId: "la-liga.sporting-gijon",
      strategy: "alias",
    });
    expect(resolveTeam(index, "SA", "FC Internazionale Milano")).toEqual({
      teamId: "serie-a.inter",
      strategy: "alias",
    });
    expect(resolveTeam(index, "LMX", "Tigres UANL")).toEqual({
      teamId: "liga-mx.uanl-tigres",
      strategy: "alias",
    });
    expect(resolveTeam(index, "BL1", "1. FC Köln")).toEqual({
      teamId: "bundesliga.koln",
      strategy: "alias",
    });
  });

  it("no inventa un id cuando no hay candidato único", () => {
    const index = buildTeamIndex(["premier-league.arsenal", "premier-league.aston-villa"]);
    expect(resolveTeam(index, "PL", "Equipo Inventado FC")).toEqual({
      teamId: null,
      strategy: null,
    });
    expect(resolveTeam(index, "PD", "Arsenal FC")).toEqual({ teamId: null, strategy: null });
  });
});

describe("native-stats — rachas recalculadas desde el corpus", () => {
  function match(
    id: string,
    date: string,
    home: number,
    away: number,
    teams: [string, string] = ["premier-league.arsenal", "premier-league.chelsea"],
  ): CorpusMatch {
    return {
      id,
      league: "premier-league",
      season: "2026-27",
      date,
      homeTeam: teams[0],
      awayTeam: teams[1],
      homeScore: home,
      awayScore: away,
    };
  }

  const arsenal = "premier-league.arsenal";
  const matches: CorpusMatch[] = [
    match("w1", "2026-08-01", 2, 0),
    match("l1", "2026-08-08", 0, 1),
    match("w2", "2026-08-15", 3, 1),
    match("w3", "2026-08-22", 2, 1),
    match("d1", "2026-08-29", 1, 1),
  ];

  it("cuenta la racha vigente desde el final", () => {
    expect(trailingStreak(matches, arsenal, "without_loss")).toBe(3);
    expect(trailingStreak(matches, arsenal, "consecutive_wins")).toBe(0);
    expect(trailingStreak(matches, arsenal, "without_win")).toBe(1);
    expect(trailingStreak(matches, arsenal, "over15_goals")).toBe(3);
    expect(trailingStreak(matches, arsenal, "over25_goals")).toBe(0);
  });

  it("devuelve null para rachas que el corpus no puede calcular", () => {
    expect(trailingStreak(matches, arsenal, "no_loss_after_ht_lead")).toBeNull();
    expect(trailingStreak(matches, arsenal, "racha_inventada")).toBeNull();
  });
});
