import { describe, expect, it } from "vitest";
import type { MatchPick, PlatformGame } from "../src/platform/types";
import {
  ALL,
  UPCOMING,
  addDays,
  alternativePick,
  buildDayOptions,
  buildSections,
  filterGames,
  gamesForSelection,
  longDayLabel,
  mostLikelyOutcome,
  todayId,
  topPrincipalPicks,
  valuePicks,
} from "../src/platform/club/home/home-model";

function pick(gameId: string, label: string, p: number, extra: Partial<MatchPick> = {}): MatchPick {
  return {
    id: `${gameId}-${label}`,
    gameId,
    label,
    p,
    fairDecimal: 1 / p,
    marketDecimal: null,
    ...extra,
  } as MatchPick;
}

function game(partial: Omit<Partial<PlatformGame>, "league"> & { id: string; league?: string }): PlatformGame {
  return {
    league: "liga-mx",
    leagueLabel: "Liga MX",
    sport: "football",
    round: "Jornada 17",
    dayId: "2026-11-21",
    dayLabel: "sábado",
    kickoffUtc: "2026-11-21T23:00:00Z",
    kickoffLocal: "17:00",
    venue: "Estadio",
    status: "NS",
    home: { slug: "pac", name: "Pachuca", shortName: "Pachuca", code: "PAC", record: "" },
    away: { slug: "tol", name: "Toluca", shortName: "Toluca", code: "TOL", record: "" },
    x12: [0.24, 0.26, 0.5],
    projection: { home: 1.37, away: 1.55, total: 2.92 },
    confidenceScore: 38,
    confidenceLevel: "baja",
    picks: [],
    preGame: {} as PlatformGame["preGame"],
    markets: [],
    factors: [],
    headToHead: [],
    updatedAtLabel: "",
    spacetime: null,
    ...partial,
  } as PlatformGame;
}

const open = () => true;

describe("días del Inicio", () => {
  const games = [
    game({ id: "pasado", dayId: "2026-11-08", status: "FT" }),
    game({ id: "hoy", dayId: "2026-11-12", league: "nfl", leagueLabel: "NFL", sport: "american-football" }),
    game({ id: "domingo", dayId: "2026-11-15", league: "nfl", leagueLabel: "NFL", sport: "american-football" }),
    game({ id: "sabado-21", dayId: "2026-11-21" }),
  ];

  it("calcula hoy en la zona del socio", () => {
    expect(todayId("America/Mexico_City", new Date("2026-11-13T03:00:00Z"))).toBe("2026-11-12");
    expect(addDays("2026-11-28", 5)).toBe("2026-12-03");
    expect(longDayLabel("2026-11-21")).toBe("Sábado 21 de noviembre");
  });

  it("pone «Próximos 7 días» primero y marca hoy y los días pasados", () => {
    const opts = buildDayOptions(games, "2026-11-12");
    expect(opts.map((o) => o.key)).toEqual([UPCOMING, "2026-11-08", "2026-11-12", "2026-11-15", "2026-11-21"]);
    expect(opts[0]).toMatchObject({ isUpcoming: true, count: 2, leagues: ["nfl"] });
    expect(opts[1]).toMatchObject({ isPast: true, count: 1 });
    expect(opts[2]).toMatchObject({ isToday: true });
  });

  it("la ventana de 7 días incluye hoy y deja fuera el día 8 en adelante", () => {
    expect(gamesForSelection(games, UPCOMING, "2026-11-12").map((g) => g.id)).toEqual(["hoy", "domingo"]);
    expect(gamesForSelection(games, "2026-11-21", "2026-11-12").map((g) => g.id)).toEqual(["sabado-21"]);
  });
});

describe("secciones por deporte y liga", () => {
  const games = [
    game({ id: "nfl-1", league: "nfl", leagueLabel: "NFL", sport: "american-football", round: "Semana 10", dayId: "2026-11-15", kickoffUtc: "2026-11-15T18:00:00Z" }),
    game({ id: "pl-tarde", league: "premier-league", leagueLabel: "Premier League", round: "Jornada 11", kickoffUtc: "2026-11-21T16:30:00Z" }),
    game({ id: "pl-temprano", league: "premier-league", leagueLabel: "Premier League", round: "Jornada 11", kickoffUtc: "2026-11-21T12:30:00Z" }),
    game({ id: "mx-1" }),
  ];

  it("agrupa Fútbol antes que NFL, ligas en orden fijo y partidos por hora", () => {
    const sections = buildSections(games);
    expect(sections.map((s) => s.sport)).toEqual(["futbol", "nfl"]);
    expect(sections[0]!.leagues.map((l) => l.league)).toEqual(["liga-mx", "premier-league"]);
    expect(sections[0]!.leagues[1]!.days[0]!.games.map((g) => g.id)).toEqual(["pl-temprano", "pl-tarde"]);
    expect(sections[1]!.leagues[0]).toMatchObject({ round: "Semana 10", count: 1 });
  });

  it("filtra por deporte y por liga", () => {
    expect(filterGames(games, "nfl", ALL).map((g) => g.id)).toEqual(["nfl-1"]);
    expect(filterGames(games, "futbol", "premier-league" as never)).toHaveLength(2);
    expect(buildSections(filterGames(games, "nfl", ALL)).map((s) => s.sport)).toEqual(["nfl"]);
  });
});

describe("resultado más probable y picks", () => {
  it("toma el mayor del 1·X·2 y en la NFL ignora el empate", () => {
    expect(mostLikelyOutcome(game({ id: "a", x12: [0.24, 0.26, 0.5] }))).toMatchObject({ side: "away", label: "Toluca gana", p: 0.5 });
    expect(mostLikelyOutcome(game({ id: "b", x12: [0.3, 0.4, 0.3] })).label).toBe("Empate");
    expect(mostLikelyOutcome(game({ id: "c", sport: "american-football", x12: [0.555, 0, 0.445] })).side).toBe("home");
  });

  it("ordena los picks principales por probabilidad y salta cerrados y bloqueados", () => {
    const games = [
      game({ id: "g1", picks: [pick("g1", "Más de 2.5", 0.56)] }),
      game({ id: "g2", picks: [pick("g2", "León o empate", 0.86)] }),
      game({ id: "g3", status: "FT", picks: [pick("g3", "Final", 0.99)] }),
      game({ id: "g4", picks: [pick("g4", "Oculto", 0.95)] }),
    ];
    const top = topPrincipalPicks(games, 3, (p) => p.label !== "Oculto");
    expect(top.map((t) => t.pick.label)).toEqual(["León o empate", "Más de 2.5"]);
  });

  it("solo cuenta valor cuando la casa paga más que el momio justo", () => {
    const g = game({
      id: "nfl",
      sport: "american-football",
      picks: [
        pick("nfl", "Kansas City gana", 0.604, { fairDecimal: 1.65, marketDecimal: 1.55 }),
        pick("nfl", "Atlanta gana", 0.396, { fairDecimal: 2.53, marketDecimal: 2.59 }),
      ],
    });
    expect(valuePicks([g], open).map((v) => v.pick.label)).toEqual(["Atlanta gana"]);
    expect(valuePicks([g], () => false)).toEqual([]);
  });

  it("la alternativa es la selección más probable después de la principal", () => {
    const g = game({ id: "g", picks: [pick("g", "Principal", 0.56), pick("g", "Más de 1.5", 0.8), pick("g", "Otra", 0.6)] });
    expect(alternativePick(g)?.label).toBe("Más de 1.5");
    expect(alternativePick(game({ id: "s", picks: [pick("s", "Sola", 0.5)] }))).toBeNull();
  });
});
