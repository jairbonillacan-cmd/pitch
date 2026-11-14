import { describe, expect, it } from "vitest";
import { computeConsensus, voteConsensus } from "../src/platform/community-stats";
import { rankAnalysts, type LeaderboardAnalyst } from "../src/platform/profile-stats";
import {
  outcomeFromScore,
  pollHitsByUser,
  rankingWindows,
  topTenHistory,
  type RankingPick,
} from "../src/platform/ranking";
import type { PlatformGame } from "../src/platform/types";

const NOW = new Date("2026-11-13T18:00:00Z"); // viernes
const DAY = 86_400_000;

const pick = (daysAgo: number, status: RankingPick["status"], over: Partial<RankingPick> = {}): RankingPick => ({
  status,
  units: 1,
  userDecimal: 2,
  clvPct: 1,
  sealedAtIso: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
  ...over,
});

describe("rankingWindows", () => {
  it("separa la semana y el mes por fecha de sello", () => {
    const w = rankingWindows([pick(1, "won"), pick(3, "lost"), pick(20, "won"), pick(45, "won")], NOW);
    expect(w["7d"]).toMatchObject({ settled: 2, won: 1, netUnits: 0 });
    expect(w["30d"]).toMatchObject({ settled: 3, won: 2, netUnits: 1 });
  });
});

describe("rankAnalysts con récord del servidor", () => {
  const row = (handle: string, settled: number, net: number): LeaderboardAnalyst => ({
    handle,
    name: handle,
    roleLabel: "Socio",
    specialty: "",
    avatarInitials: "AA",
    avatarGradVar: "",
    isTipster: false,
    isVerified: false,
    isExample: false,
    journal: [],
    windows: {
      "7d": { settled, won: settled, hitRatePct: 100, netUnits: net, avgClvPct: 0, open: 0 },
      "30d": { settled, won: settled, hitRatePct: 100, netUnits: net, avgClvPct: 0, open: 0 },
    },
  });

  it("usa el récord ya calculado y la muestra mínima de cada ventana", () => {
    const rows = [row("ana", 5, 3), row("leo", 4, 9), row("eva", 15, 1)];
    expect(rankAnalysts(rows, { window: "7d", sort: "units", today: NOW }).map((r) => r.handle)).toEqual(["ana", "eva"]);
    expect(rankAnalysts(rows, { window: "30d", sort: "units", today: NOW }).map((r) => r.handle)).toEqual(["eva"]);
  });
});

describe("topTenHistory", () => {
  it("cuenta semanas cerradas en el Top 10 y meses de calendario cerrados", () => {
    // Semana pasada (lun 2 – dom 8 nov): 7 a 11 días antes del viernes 13 = 6 al 2 de nov.
    const ana = Array.from({ length: 5 }, (_, i) => pick(7 + i, "won"));
    const leo = Array.from({ length: 5 }, (_, i) => pick(7 + i, "lost"));
    const thisWeek = Array.from({ length: 6 }, () => pick(1, "won"));
    // Octubre completo: 15 picks de eva.
    const eva = Array.from({ length: 15 }, (_, i) => pick(20 + i, "won"));
    const hist = topTenHistory(
      [
        { id: "ana", entries: ana },
        { id: "leo", entries: leo },
        { id: "nuevo", entries: thisWeek },
        { id: "eva", entries: eva },
      ],
      NOW,
    );
    expect(hist.get("ana")).toEqual({ weeks: 1, monthly: false });
    expect(hist.get("leo")?.weeks).toBe(1); // entra al Top 10 aunque pierda: solo hay 2 con muestra
    expect(hist.get("nuevo")).toEqual({ weeks: 0, monthly: false });
    expect(hist.get("eva")?.monthly).toBe(true);
  });

  it("con más de 10 socios, el 11.º no entra", () => {
    const people = Array.from({ length: 11 }, (_, i) => ({
      id: `s${String(i).padStart(2, "0")}`,
      entries: Array.from({ length: 5 }, () => pick(9, i === 10 ? "lost" : "won")),
    }));
    const hist = topTenHistory(people, NOW);
    expect(hist.get("s10")?.weeks).toBe(0);
    expect(hist.get("s00")?.weeks).toBe(1);
  });
});

describe("pollHitsByUser", () => {
  const results = new Map([
    ["g1", "home" as const],
    ["g2", "away" as const],
  ]);
  it("cuenta a quien votó con la mayoría y acertó", () => {
    const votes = [
      ...["a", "b", "c"].map((u) => ({ userId: u, gameId: "g1", choice: "home" })),
      ...["d", "e"].map((u) => ({ userId: u, gameId: "g1", choice: "away" })),
    ];
    const hits = pollHitsByUser(votes, results);
    expect(Object.fromEntries(hits)).toEqual({ a: 1, b: 1, c: 1 });
  });

  it("sin mayoría clara, con pocos votos o si la mayoría falló, no cuenta", () => {
    const tie = [
      ...["a", "b"].map((u) => ({ userId: u, gameId: "g1", choice: "home" })),
      ...["c", "d"].map((u) => ({ userId: u, gameId: "g1", choice: "away" })),
      { userId: "e", gameId: "g1", choice: "draw" },
    ];
    expect(pollHitsByUser(tie, results).size).toBe(0);
    expect(pollHitsByUser([{ userId: "a", gameId: "g1", choice: "home" }], results).size).toBe(0);
    const wrong = ["a", "b", "c", "d", "e"].map((u) => ({ userId: u, gameId: "g2", choice: "home" }));
    expect(pollHitsByUser(wrong, results).size).toBe(0);
  });

  it("resultado desde el marcador", () => {
    expect(outcomeFromScore({ home: 2, away: 1 })).toBe("home");
    expect(outcomeFromScore({ home: 0, away: 0 })).toBe("draw");
    expect(outcomeFromScore({ home: 10, away: 24 })).toBe("away");
  });
});

describe("consenso con votos", () => {
  const game = {
    id: "g1",
    sport: "football",
    status: "NS",
    kickoffUtc: "2026-11-14T02:00:00Z",
    home: { shortName: "América", name: "América" },
    away: { shortName: "Chivas", name: "Chivas" },
    x12: [0.5, 0.3, 0.2],
    picks: [{ id: "p1", label: "Gana América", p: 0.5 }],
  } as unknown as PlatformGame;

  it("compara los votos de «¿Quién gana?» contra el 1X2 del modelo", () => {
    const v = voteConsensus({ gameId: "g1", home: 8, draw: 1, away: 1 }, game)!;
    expect(v.total).toBe(10);
    expect(v.top).toMatchObject({ label: "América", fansPct: 80, modelPct: 50, diffPts: 30 });
  });

  it("un partido entra solo con votos suficientes, sin picks publicados", () => {
    const few = computeConsensus([], [game], { voteTallies: [{ gameId: "g1", home: 2, draw: 1, away: 1 }] });
    expect(few).toEqual([]);
    const [item] = computeConsensus([], [game], { voteTallies: [{ gameId: "g1", home: 4, draw: 1, away: 1 }] });
    expect(item?.outcomes).toEqual([]);
    expect(item?.votes?.total).toBe(6);
    expect(item?.top.label).toBe("América");
  });
});
