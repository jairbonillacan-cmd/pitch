import { describe, expect, it } from "vitest";
import {
  buildNotifications,
  formatBadgeCount,
  formatNotificationTime,
  notificationGroup,
  unreadCount,
  type JournalEntry,
  type MatchPick,
  type PlatformGame,
} from "../src/index";

const NOW = new Date("2026-11-14T19:30:00Z");

function game(partial: Partial<PlatformGame> & { id: string }): PlatformGame {
  return {
    league: "liga-mx",
    leagueLabel: "Liga MX",
    sport: "football",
    round: "Jornada 16",
    dayId: "2026-11-14",
    dayLabel: "sábado",
    kickoffUtc: "2026-11-14T20:00:00Z",
    kickoffLocal: "14:00",
    venue: "Estadio",
    status: "NS",
    home: { slug: "ame", name: "América", shortName: "América", code: "AME", record: "" },
    away: { slug: "caz", name: "Cruz Azul", shortName: "Cruz Azul", code: "CAZ", record: "" },
    x12: [0.3, 0.25, 0.45],
    projection: { home: 1, away: 1, total: 2 },
    confidenceScore: 60,
    confidenceLevel: "media",
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

function valuePick(gameId: string): MatchPick {
  return {
    id: `${gameId}-valor`,
    gameId,
    category: "valor",
    label: "Cruz Azul gana",
    engineName: "Geodesic",
    p: 0.538,
    fairDecimal: 1.86,
    marketDecimal: 2.05,
    edgePts: 5,
  } as MatchPick;
}

function journal(partial: Partial<JournalEntry>): JournalEntry {
  return {
    id: "j1",
    pickId: "p1",
    gameId: "g1",
    leagueLabel: "Liga MX",
    matchLabel: "América vs Cruz Azul",
    pickLabel: "Cruz Azul gana",
    origin: "Spacetime Suite",
    units: 2,
    userDecimal: 2.1,
    fairDecimal: 1.9,
    clvPct: 4.1,
    status: "pending",
    sealedAt: "",
    sealedAtIso: "2026-11-13T12:00:00Z",
    ...partial,
  };
}

const base = { journal: [], oddsFormat: "decimal" as const, now: NOW };

describe("buildNotifications", () => {
  it("solo avisa de partidos vigilados", () => {
    const games = [game({ id: "g1" }), game({ id: "g2" })];
    const out = buildNotifications({ ...base, games, watchlistGameIds: ["g1"] });
    expect(out.map((n) => n.id)).toEqual(["kickoff:g1"]);
  });

  it("avisa 60 min antes con lo más probable y su cuota justa", () => {
    const out = buildNotifications({ ...base, games: [game({ id: "g1" })], watchlistGameIds: ["g1"] });
    expect(out[0]).toMatchObject({
      kind: "partidos",
      priority: "urgent",
      title: "América vs Cruz Azul empieza en 30 min",
      context: { lead: "Lo más probable: Cruz Azul 45.0 %", text: " · cuota justa 2.22" },
      atIso: "2026-11-14T19:00:00.000Z",
    });
  });

  it("no avisa antes de la ventana de 60 min", () => {
    const g = game({ id: "g1", kickoffUtc: "2026-11-14T22:00:00Z" });
    expect(buildNotifications({ ...base, games: [g], watchlistGameIds: ["g1"] })).toEqual([]);
  });

  it("dice si lo más probable ocurrió en el resultado final", () => {
    const g = game({ id: "g1", kickoffUtc: "2026-11-14T16:00:00Z", status: "FT", score: { home: 0, away: 2 } });
    const [n] = buildNotifications({ ...base, games: [g], watchlistGameIds: ["g1"] });
    expect(n).toMatchObject({ id: "final:g1", title: "Final: América 0–2 Cruz Azul", priority: "normal" });
    expect(n!.context.text).toBe(" y ocurrió.");
  });

  it("aviso de valor con momio en el formato elegido; urgente a menos de 3 h", () => {
    const g = game({ id: "g1", kickoffUtc: "2026-11-14T21:00:00Z" });
    g.picks = [valuePick("g1")];
    const out = buildNotifications({ ...base, oddsFormat: "american", games: [g], watchlistGameIds: ["g1"] });
    const v = out.find((n) => n.kind === "cuotas");
    expect(v).toMatchObject({
      priority: "urgent",
      title: "Cruz Azul gana: la casa paga +105, la cuota justa es -116",
    });
  });

  it("bloquea el pick al iniciar y califica el liquidado", () => {
    const live = game({ id: "g1", status: "LIVE", kickoffUtc: "2026-11-14T19:00:00Z" });
    const done = game({ id: "g2", status: "FT", kickoffUtc: "2026-11-14T15:00:00Z", score: { home: 1, away: 0 } });
    const out = buildNotifications({
      ...base,
      games: [live, done],
      watchlistGameIds: [],
      journal: [journal({ id: "a", gameId: "g1" }), journal({ id: "b", gameId: "g2", status: "lost", clvPct: -1.2 })],
    });
    expect(out.find((n) => n.id === "locked:a")?.title).toBe("Tu pick quedó bloqueado");
    expect(out.find((n) => n.id === "graded:b")?.context).toEqual({
      lead: "No cumplido",
      text: " · -1.2 pts frente a la cuota justa. Registraste 2.10.",
    });
  });

  it("resume la jornada terminada de las ligas favoritas", () => {
    const ft = (id: string, score: { home: number; away: number }) =>
      game({ id, status: "FT", kickoffUtc: "2026-11-13T20:00:00Z", score });
    const games = [ft("a", { home: 0, away: 1 }), ft("b", { home: 2, away: 0 }), ft("c", { home: 0, away: 3 })];
    const out = buildNotifications({ ...base, games, watchlistGameIds: [], favoriteLeagues: ["liga-mx" as PlatformGame["league"]] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "resumen", priority: "digest", context: { lead: "2 de 3" } });
  });

  it("ordena del más nuevo al más viejo y nunca pone avisos en el futuro", () => {
    const g = game({ id: "g1" });
    const out = buildNotifications({ ...base, games: [g], watchlistGameIds: ["g1"], journal: [journal({ status: "won", gameId: "x", sealedAtIso: "2026-11-15T00:00:00Z" })] });
    for (const n of out) expect(Date.parse(n.atIso)).toBeLessThanOrEqual(NOW.getTime());
    const times = out.map((n) => Date.parse(n.atIso));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});

describe("contador y tiempos", () => {
  it("los resúmenes no suman y el contador topa en 9+", () => {
    const items = [
      { id: "a", priority: "urgent" },
      { id: "b", priority: "digest" },
      { id: "c", priority: "normal" },
    ] as unknown as Parameters<typeof unreadCount>[0];
    expect(unreadCount(items, new Set(["c"]))).toBe(1);
    expect(formatBadgeCount(12)).toBe("9+");
  });

  it("agrupa en Ahora, Hoy y Antes", () => {
    expect(notificationGroup("2026-11-14T19:10:00Z", NOW)).toBe("Ahora");
    expect(notificationGroup("2026-11-13T10:00:00Z", NOW)).toBe("Antes");
    expect(formatNotificationTime("2026-11-14T19:26:00Z", NOW)).toBe("hace 4 min");
    expect(formatNotificationTime("2026-11-14T16:30:00Z", NOW)).toBe("hace 3 h");
  });
});
