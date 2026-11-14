import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildMatchOutlook, type MatchOutlook } from "../src/outlook";
import {
  DEFAULT_NFL_SIGMA_MARGIN,
  DEFAULT_NFL_SIGMA_TOTAL,
  FIRST_HALF_GOAL_SHARE,
  TOP_SCORELINES_COUNT,
  deriveFootballExtraMarkets,
  deriveNflExtraMarkets,
  verifyFootballMatrixParity,
} from "./outlook_derived";

interface SnapshotWithOutlooks {
  readonly outlooks: readonly MatchOutlook[];
}

const SNAPSHOT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../data/live_matchday_v3_snapshot.json",
);
const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as SnapshotWithOutlooks;

describe("Punto 5 · Mercados derivados del motor v3.2", () => {
  it("reproduce los mercados 1X2 y totales publicados por v3.2 con |Δ| < 1e-9", () => {
    const footballOutlooks = snapshot.outlooks.filter((o) => o.sport === "football");
    expect(footballOutlooks).toHaveLength(84);

    let worstDelta = 0;
    let checkedWithoutSharp = 0;
    for (const outlook of footballOutlooks) {
      if (outlook.dataQuality.sharpMarketAvailable) continue;
      checkedWithoutSharp += 1;
      const parity = verifyFootballMatrixParity(outlook);
      expect(parity.checkedMarkets).toEqual([
        "1x2",
        "totals_1_5",
        "totals_2_5",
        "totals_3_5",
      ]);
      expect(parity.maxAbsDelta).toBeLessThan(1e-9);
      if (parity.maxAbsDelta > worstDelta) worstDelta = parity.maxAbsDelta;

      const dc = outlook.dixonColesParams!;
      const derived = deriveFootballExtraMarkets({
        homeTeam: outlook.homeTeam,
        awayTeam: outlook.awayTeam,
        lamHome: dc.lamHome,
        lamAway: dc.lamAway,
        rho: dc.rho,
        maxGoals: dc.maxGoals,
      });
      expect(derived.topScorelines).toHaveLength(TOP_SCORELINES_COUNT);
      for (let i = 0; i < Math.min(3, outlook.topScorelines.length); i += 1) {
        const pubScore = outlook.topScorelines[i]!;
        const derivScore = derived.topScorelines[i]!;
        expect(derivScore.score).toBe(pubScore.score);
        expect(Math.abs(derivScore.p - pubScore.p)).toBeLessThan(1e-9);
      }
    }
    expect(checkedWithoutSharp).toBe(84);
    expect(worstDelta).toBeLessThan(1e-9);

    // También verifica paridad sobre un partido sintético construido en caliente con buildMatchOutlook.
    const synthetic = buildMatchOutlook({
      matchId: "parity-check-1",
      sport: "football",
      league: "epl",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      tsDecision: "2026-11-13T18:00:00Z",
      football: { lamHome: 1.72, lamAway: 1.08, rho: -0.11, maxGoals: 12 },
    });
    const synthParity = verifyFootballMatrixParity(synthetic);
    expect(synthParity.maxAbsDelta).toBeLessThan(1e-9);
  });

  it("fútbol: todas las probabilidades derivadas suman 1 y respeta TOP 6 de marcadores", () => {
    const derived = deriveFootballExtraMarkets({
      homeTeam: "América",
      awayTeam: "Chivas",
      lamHome: 1.65,
      lamAway: 1.12,
    });

    expect(derived.firstHalfGoalShare).toBe(FIRST_HALF_GOAL_SHARE);
    expect(derived.homeTeamGoals.map((l) => l.line)).toEqual([0.5, 1.5, 2.5]);
    expect(derived.awayTeamGoals.map((l) => l.line)).toEqual([0.5, 1.5, 2.5]);
    expect(derived.firstHalfTotals.map((l) => l.line)).toEqual([0.5, 1.5, 2.5]);

    for (const line of [
      ...derived.homeTeamGoals,
      ...derived.awayTeamGoals,
      ...derived.firstHalfTotals,
    ]) {
      expect(Math.abs(line.pOver + line.pUnder - 1)).toBeLessThan(1e-12);
      expect(line.fairOver.decimal).toBeGreaterThan(1);
      expect(line.fairUnder.decimal).toBeGreaterThan(1);
    }

    const htSum =
      derived.firstHalf1X2.pHome +
      derived.firstHalf1X2.pDraw +
      derived.firstHalf1X2.pAway;
    expect(Math.abs(htSum - 1)).toBeLessThan(1e-12);
    // Primera mitad debe tener mayor probabilidad de empate que tiempo completo.
    expect(derived.firstHalf1X2.pDraw).toBeGreaterThan(
      derived.fullTimeMatrixParity.pDraw,
    );

    expect(derived.topScorelines).toHaveLength(6);
    for (let i = 1; i < derived.topScorelines.length; i += 1) {
      expect(derived.topScorelines[i - 1]!.p).toBeGreaterThanOrEqual(
        derived.topScorelines[i]!.p,
      );
    }
    expect(derived.topScorelines[0]!.isMostLikely).toBe(true);
    expect(derived.topScorelines[1]!.isMostLikely).toBe(false);
  });

  it("fútbol: simetría exacta al intercambiar local y visita", () => {
    const ab = deriveFootballExtraMarkets({
      homeTeam: "Equipo A",
      awayTeam: "Equipo B",
      lamHome: 1.85,
      lamAway: 0.95,
    });
    const ba = deriveFootballExtraMarkets({
      homeTeam: "Equipo B",
      awayTeam: "Equipo A",
      lamHome: 0.95,
      lamAway: 1.85,
    });

    for (let i = 0; i < ab.homeTeamGoals.length; i += 1) {
      expect(Math.abs(ab.homeTeamGoals[i]!.pOver - ba.awayTeamGoals[i]!.pOver)).toBeLessThan(1e-12);
      expect(Math.abs(ab.awayTeamGoals[i]!.pOver - ba.homeTeamGoals[i]!.pOver)).toBeLessThan(1e-12);
      expect(Math.abs(ab.firstHalfTotals[i]!.pOver - ba.firstHalfTotals[i]!.pOver)).toBeLessThan(1e-12);
    }

    expect(Math.abs(ab.firstHalf1X2.pHome - ba.firstHalf1X2.pAway)).toBeLessThan(1e-12);
    expect(Math.abs(ab.firstHalf1X2.pDraw - ba.firstHalf1X2.pDraw)).toBeLessThan(1e-12);

    for (const s of ab.topScorelines) {
      const mirrored = ba.topScorelines.find(
        (cand) => cand.homeGoals === s.awayGoals && cand.awayGoals === s.homeGoals,
      );
      expect(mirrored).toBeDefined();
      expect(Math.abs(s.p - mirrored!.p)).toBeLessThan(1e-12);
    }
  });

  it("NFL: deriva hándicap y totales desde ganador con sigma 13.5 y 10.5, sumando 1 y simétricos", () => {
    const nflOutlooks = snapshot.outlooks.filter((o) => o.sport === "nfl");
    expect(nflOutlooks).toHaveLength(46);

    for (const outlook of nflOutlooks) {
      const moneyline = outlook.marketsByKey.moneyline;
      expect(moneyline).toBeDefined();
      const pHome = moneyline!.selections.find((s) => s.selection === "home")!.p;
      const derived = deriveNflExtraMarkets({
        homeTeam: outlook.homeTeam,
        awayTeam: outlook.awayTeam,
        pHome,
      });
      expect(derived.sigmaMargin).toBe(DEFAULT_NFL_SIGMA_MARGIN);
      expect(derived.sigmaTotal).toBe(DEFAULT_NFL_SIGMA_TOTAL);
      expect(derived.spreads.length).toBeGreaterThanOrEqual(3);
      expect(derived.totals.length).toBe(3);

      for (const sp of derived.spreads) {
        expect(Math.abs(sp.pHome + sp.pAway - 1)).toBeLessThan(1e-12);
      }
      for (const tot of derived.totals) {
        expect(Math.abs(tot.pOver + tot.pUnder - 1)).toBeLessThan(1e-12);
      }
    }

    // Prueba de simetría exacta en NFL al invertir local/visita.
    const left = deriveNflExtraMarkets({
      homeTeam: "Chiefs",
      awayTeam: "Bills",
      pHome: 0.64,
      expectedTotal: 49.5,
    });
    const right = deriveNflExtraMarkets({
      homeTeam: "Bills",
      awayTeam: "Chiefs",
      pHome: 0.36,
      expectedTotal: 49.5,
    });
    expect(Math.abs(left.expectedMargin + right.expectedMargin)).toBeLessThan(1e-9);
    expect(left.spreads).toHaveLength(right.spreads.length);
    for (const lSp of left.spreads) {
      const rMatch = right.spreads.find(
        (cand) => Math.abs(cand.homeLine + lSp.homeLine) < 1e-12,
      );
      expect(rMatch).toBeDefined();
      expect(Math.abs(lSp.pHome - rMatch!.pAway)).toBeLessThan(1e-12);
      expect(Math.abs(lSp.pAway - rMatch!.pHome)).toBeLessThan(1e-12);
    }
    for (let i = 0; i < left.totals.length; i += 1) {
      expect(left.totals[i]!.line).toBe(right.totals[i]!.line);
      expect(Math.abs(left.totals[i]!.pOver - right.totals[i]!.pOver)).toBeLessThan(1e-12);
    }
  });
});
