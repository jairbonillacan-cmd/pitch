import { describe, expect, it } from "vitest";
import {
  analystRank,
  calibrationBuckets,
  exampleLeaderboardRows,
  formatUnits,
  generateExampleJournal,
  getExampleAnalystSpec,
  hitRateByLeague,
  journalRecord,
  monthlyNetUnits,
  pickSettlementUnits,
  profileRecord,
  rankAnalysts,
  type JournalEntry,
  type LeaderboardAnalyst,
} from "../src/index";

const TODAY = new Date("2026-11-11T18:00:00Z");

function entry(partial: Partial<JournalEntry>): JournalEntry {
  return {
    id: Math.random().toString(36).slice(2),
    pickId: "p",
    gameId: "g",
    leagueLabel: "Liga MX",
    matchLabel: "A vs B",
    pickLabel: "A gana",
    origin: "Spacetime Suite",
    units: 1,
    userDecimal: 2,
    fairDecimal: 1.8,
    clvPct: 2,
    status: "won",
    sealedAt: "",
    sealedAtIso: "2026-11-01T12:00:00Z",
    ...partial,
  };
}

describe("profile-stats", () => {
  it("saldo de un pick: cumplido, no cumplido y abierto", () => {
    expect(pickSettlementUnits(entry({ status: "won", units: 2, userDecimal: 1.9 }))).toBeCloseTo(1.8);
    expect(pickSettlementUnits(entry({ status: "lost", units: 1.5 }))).toBe(-1.5);
    expect(pickSettlementUnits(entry({ status: "pending" }))).toBeNull();
  });

  it("profileRecord y journalRecord comparten la fórmula", () => {
    const list = [
      entry({ status: "won", userDecimal: 2.1 }),
      entry({ status: "lost" }),
      entry({ status: "pending" }),
    ];
    const rec = profileRecord(list);
    expect(rec).toMatchObject({ settled: 2, won: 1, open: 1, hitRatePct: 50 });
    expect(rec.netUnits).toBeCloseTo(0.1);
    expect(journalRecord(list).netUnits).toBeCloseTo(rec.netUnits);
    expect(profileRecord([]).hitRatePct).toBeNull();
  });

  it("saldo por mes con meses vacíos en 0", () => {
    const months = monthlyNetUnits(
      [entry({ sealedAtIso: "2026-11-02T10:00:00Z" }), entry({ status: "lost", sealedAtIso: "2026-09-10T10:00:00Z" })],
      6,
      TODAY,
    );
    expect(months.map((m) => m.label)).toEqual(["Jun", "Jul", "Ago", "Sep", "Oct", "Nov"]);
    expect(months.map((m) => m.net)).toEqual([0, 0, 0, -1, 0, 1]);
  });

  it("cumplidos por liga, ordenado por picks cerrados", () => {
    const rows = hitRateByLeague([
      entry({ leagueLabel: "NFL" }),
      entry({ leagueLabel: "NFL", status: "lost" }),
      entry({ leagueLabel: "Liga MX" }),
      entry({ leagueLabel: "Liga MX", status: "pending" }),
    ]);
    expect(rows[0]).toMatchObject({ leagueLabel: "NFL", won: 1, settled: 2, pct: 50 });
    expect(rows[1]).toMatchObject({ leagueLabel: "Liga MX", settled: 1 });
  });

  it("calibración omite rangos con menos de 5 picks", () => {
    const sixtyFive = Array.from({ length: 5 }, (_, i) =>
      entry({ fairDecimal: 1 / 0.65, status: i < 3 ? "won" : "lost" }),
    );
    const fiftyFive = Array.from({ length: 4 }, () => entry({ fairDecimal: 1 / 0.55 }));
    const buckets = calibrationBuckets([...sixtyFive, ...fiftyFive]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({ range: "60–70 %", expectedMidPct: 65, won: 3, settled: 5, realPct: 60 });
  });

  it("rankAnalysts filtra por ventana real y mínimo de 20 picks", () => {
    const many = (count: number, iso: string, status: JournalEntry["status"] = "won") =>
      Array.from({ length: count }, () => entry({ sealedAtIso: iso, status }));
    const base: Omit<LeaderboardAnalyst, "handle" | "journal"> = {
      name: "x",
      roleLabel: "Socio",
      specialty: "",
      avatarInitials: "X",
      avatarGradVar: "",
      isTipstar: false,
      isVerified: false,
      isExample: false,
    };
    const rows: LeaderboardAnalyst[] = [
      { ...base, handle: "reciente", journal: many(20, "2026-11-05T00:00:00Z") },
      { ...base, handle: "viejo", journal: many(40, "2026-06-01T00:00:00Z") },
      { ...base, handle: "pocos", journal: many(5, "2026-11-05T00:00:00Z") },
    ];
    const month = rankAnalysts(rows, { window: "30d", sort: "units", today: TODAY });
    expect(month.map((r) => r.handle)).toEqual(["reciente"]);
    const season = rankAnalysts(rows, { window: "season", sort: "units", today: TODAY });
    expect(season.map((r) => r.handle)).toEqual(["viejo", "reciente"]);
    expect(analystRank("pocos", rows, TODAY)).toBeNull();
    expect(analystRank("reciente", rows, TODAY)?.rank).toBe(1);
  });

  it("los perfiles de ejemplo cuadran con su récord publicado", () => {
    const spec = getExampleAnalystSpec("sofia_nfl")!;
    const journal = generateExampleJournal(spec, TODAY);
    const rec = profileRecord(journal);
    expect(rec.settled).toBe(142);
    expect(rec.won).toBe(84);
    expect(formatUnits(rec.netUnits)).toBe("+18.4u");
    expect(rec.avgClvPct!).toBeGreaterThan(3);
    expect(rec.avgClvPct!).toBeLessThan(5.5);
    const ranked = rankAnalysts(exampleLeaderboardRows(TODAY), { window: "30d", sort: "units", today: TODAY });
    expect(ranked.length).toBeGreaterThanOrEqual(5);
  });
});
