import { describe, expect, it } from "vitest";
import {
  computeRecordStats,
  DEFAULT_RECORD_PRIVACY,
  marketKindOf,
  normalizeRecordPrivacy,
  publicRecordView,
  type RecordEntry,
} from "../src/platform/record-stats";

const e = (over: Partial<RecordEntry>): RecordEntry => ({
  status: "won",
  units: 1,
  userDecimal: 2,
  fairDecimal: 1.9,
  clvPct: 2,
  leagueLabel: "Liga MX",
  pickLabel: "América gana",
  origin: "Spacetime Suite",
  sealedAtIso: "2026-10-01T18:00:00Z",
  ...over,
});

const ENTRIES: RecordEntry[] = [
  e({ settledAtIso: "2026-10-01T20:00:00Z" }), // +1
  e({ status: "lost", settledAtIso: "2026-10-02T20:00:00Z", pickLabel: "Más de 2.5" }), // -1
  e({ settledAtIso: "2026-11-03T20:00:00Z", userDecimal: 1.5, leagueLabel: "NFL", pickLabel: "WAS +7.5" }), // +0.5
  e({ settledAtIso: "2026-11-04T20:00:00Z", units: 2, userDecimal: 3, origin: "Parlay Combinado", pickLabel: "A + B" }), // +4
  e({ status: "pending", clvPct: -2 }),
];

describe("estadísticas de Mi récord", () => {
  it("calcula saldo, rendimiento, ROI, rachas y momio promedio", () => {
    const s = computeRecordStats(ENTRIES, 20);
    expect(s.settled).toBe(4);
    expect(s.won).toBe(3);
    expect(s.open).toBe(1);
    expect(s.netUnits).toBe(4.5);
    expect(s.stakedUnits).toBe(5);
    expect(s.yieldPct).toBeCloseTo(90, 6);
    expect(s.roiPct).toBeCloseTo(22.5, 6);
    expect(s.currentStreak).toEqual({ kind: "won", length: 2 });
    expect(s.bestWinStreak).toBe(2);
    expect(s.avgOddsDecimal).toBeCloseTo((2 + 2 + 1.5 + 3) / 4, 6);
    expect(s.avgClvPct).toBeCloseTo((2 + 2 + 2 + 2 - 2) / 5, 6);
  });

  it("arma la curva de saldo por día desde la banca inicial", () => {
    const s = computeRecordStats(ENTRIES, 20);
    expect(s.curve.map((p) => p.balance)).toEqual([21, 20, 20.5, 24.5]);
    expect(s.curve[0]!.day).toBe("2026-10-01");
  });

  it("agrupa por liga, mercado y tipo, y encuentra mejor y peor mes", () => {
    const s = computeRecordStats(ENTRIES);
    expect(s.byLeague.find((r) => r.key === "Liga MX")).toMatchObject({ won: 2, total: 3 });
    expect(s.byMarket.map((r) => r.key).sort()).toEqual(["handicap", "parlay", "result", "totals"]);
    expect(s.byType.find((r) => r.key === "Parlay Combinado")?.label).toBe("Parlays");
    expect(s.bestMonth?.key).toBe("2026-11");
    expect(s.worstMonth?.key).toBe("2026-10");
    expect(s.roiPct).toBeNull();
  });

  it("clasifica mercados por la etiqueta", () => {
    expect(marketKindOf({ pickLabel: "Ambos anotan: Sí", origin: "x" }).key).toBe("btts");
    expect(marketKindOf({ pickLabel: "Menos de 45.5 puntos", origin: "x" }).key).toBe("totals");
    expect(marketKindOf({ pickLabel: "NYG -3.5", origin: "x" }).key).toBe("handicap");
    expect(marketKindOf({ pickLabel: "Marcador exacto 1–1", origin: "x" }).key).toBe("score");
  });
});

describe("privacidad del récord", () => {
  it("por defecto comparte récord, rendimiento (sin ROI) e historial, y no el saldo", () => {
    const view = publicRecordView(computeRecordStats(ENTRIES, 20), ENTRIES, DEFAULT_RECORD_PRIVACY);
    expect(view.wonLost).toEqual({ won: 3, lost: 1, settled: 4 });
    expect(view.roiPct).toBeNull();
    expect(view.netUnits).toBeNull();
    expect(view.curve).toBeNull();
    expect(view.settledPicks).toHaveLength(4);
    // Los picks abiertos nunca salen.
    expect(view.settledPicks!.every((p) => p.status !== "pending")).toBe(true);
  });

  it("apagar un bloque oculta todos sus datos aunque estén activados", () => {
    const privacy = normalizeRecordPrivacy({ record: { enabled: false } });
    const view = publicRecordView(computeRecordStats(ENTRIES), ENTRIES, privacy);
    expect(view.wonLost).toBeNull();
    expect(view.hitRatePct).toBeNull();
    expect(view.byLeague).toBeNull();
    expect(view.yieldPct).not.toBeNull();
  });

  it("se puede apagar dato por dato y normaliza valores desconocidos", () => {
    const privacy = normalizeRecordPrivacy({
      performance: { fields: { clv: false, inventado: true } },
      bank: { enabled: true, fields: { curve: false } },
      basura: 1,
    });
    const view = publicRecordView(computeRecordStats(ENTRIES, 20), ENTRIES, privacy);
    expect(view.avgClvPct).toBeNull();
    expect(view.yieldPct).not.toBeNull();
    expect(view.netUnits).toBe(4.5);
    expect(view.curve).toBeNull();
    expect(Object.keys(privacy)).toEqual(["record", "performance", "bank", "history"]);
  });
});
