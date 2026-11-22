import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  GameAnalysisSchema,
  asGameId,
  asLeagueId,
  asMarketKey,
  asSeasonId,
  asTeamId,
  type GameDTO,
  type TeamSeasonRate,
} from "@pitchlab/contracts";
import {
  analyzeFootballGameV2,
  baseLambdaAway,
  baseLambdaHome,
  candidatesFromGroups,
  confidenceIndex,
  fitDixonColes,
  makeRng,
  poissonPmf,
  predictFootball,
  scoreMatrix,
  type FootballMatchRow,
} from "../src/index.js";

function samplePoisson(lambda: number, rng: () => number): number {
  const pmf = poissonPmf(Math.min(Math.max(lambda, 0.05), 8), 14);
  const u = rng();
  let acc = 0;
  for (let k = 0; k < pmf.length; k += 1) {
    acc += pmf[k]!;
    if (u <= acc) return k;
  }
  return pmf.length - 1;
}

function buildSyntheticLeague(
  trueHomeAdv: number,
  trueBaseTotal: number,
  seed: string,
  rounds = 2,
): FootballMatchRow[] {
  const teams = ["t1", "t2", "t3", "t4", "t5", "t6"];
  const attack = [1.28, 1.15, 1.03, 0.96, 0.87, 0.78];
  const defense = [0.8, 0.9, 0.98, 1.04, 1.12, 1.24];
  const baseMu = trueBaseTotal / (1 + trueHomeAdv);
  const rng = makeRng(seed);
  const rows: FootballMatchRow[] = [];

  for (let r = 0; r < rounds; r += 1) {
    for (let i = 0; i < teams.length; i += 1) {
      for (let j = 0; j < teams.length; j += 1) {
        if (i === j) continue;
        const lh = baseMu * attack[i]! * defense[j]! * trueHomeAdv;
        const la = baseMu * attack[j]! * defense[i]!;
        rows.push({
          date: "2026-10-15",
          home: teams[i]!,
          away: teams[j]!,
          homeGoals: samplePoisson(lh, rng),
          awayGoals: samplePoisson(la, rng),
        });
      }
    }
  }
  return rows;
}

function meanExpectedVsObservedRatio(rows: readonly FootballMatchRow[], homeAdvPrior = 1.15): {
  readonly ratio: number;
  readonly converged: boolean;
  readonly model: ReturnType<typeof fitDixonColes>;
} {
  const model = fitDixonColes(rows, {
    xi: 0,
    priorHomeAdvantage: homeAdvPrior,
    referenceDate: "2026-10-15",
  });
  let sumExpected = 0;
  let sumObserved = 0;
  for (const r of rows) {
    sumExpected += baseLambdaHome(model, r.home, r.away) + baseLambdaAway(model, r.home, r.away);
    sumObserved += r.homeGoals + r.awayGoals;
  }
  return {
    ratio: sumObserved > 0 ? sumExpected / sumObserved : 1,
    converged: model.converged,
    model,
  };
}

describe("Ola 7 · Invariantes algebraicos de Dixon-Coles y etiquetas con unidad", () => {
  it("conserva los goles esperados in-sample (< 2%) para cualquier ventaja de local H en [0.7, 2.0]", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.7, max: 2.0, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 1.8, max: 3.8, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 1, max: 1000 }),
        (trueHomeAdv, trueBaseTotal, seedNum) => {
          const rows = buildSyntheticLeague(trueHomeAdv, trueBaseTotal, `dc-cons-${seedNum}`, 2);
          const { ratio, converged } = meanExpectedVsObservedRatio(rows);
          expect(converged).toBe(true);
          expect(Number.isFinite(ratio)).toBe(true);
          expect(Math.abs(ratio - 1)).toBeLessThan(0.02);
        },
      ),
      { numRuns: 35 },
    );
  });

  it("elimina el sesgo de sobreestimación para regímenes de localía reales (H = 1.43, 1.37, 0.93)", () => {
    for (const [idx, trueH] of [1.43, 1.37, 0.93].entries()) {
      const rows = buildSyntheticLeague(trueH, 2.75, `dc-forensic-${idx}`, 4);
      const { ratio, converged, model } = meanExpectedVsObservedRatio(rows);
      expect(converged).toBe(true);
      expect(Math.abs(ratio - 1)).toBeLessThan(0.005);
      const pred = predictFootball(model, "t1", "t6", { simulations: 40 });
      expect(pred.total).toBeLessThan(4.5);
      const over35 = pred.totals.find((t) => t.line === 3.5)!;
      expect(over35.over).toBeLessThan(0.65);
    }
  });

  it("garantiza monotonicidad estricta P(Over 0.5) >= P(Over 1.5) >= P(Over 2.5) >= P(Over 3.5)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.25, max: 3.2, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.25, max: 3.2, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -0.14, max: 0.1, noNaN: true, noDefaultInfinity: true }),
        (lh, la, rho) => {
          const mat = scoreMatrix(lh, la, rho, 11);
          const overLine = (line: number): number => {
            let acc = 0;
            for (let h = 0; h < mat.length; h += 1) {
              for (let a = 0; a < mat[h]!.length; a += 1) {
                if (h + a > line) acc += mat[h]![a]!;
              }
            }
            return acc;
          };
          const p05 = overLine(0.5);
          const p15 = overLine(1.5);
          const p25 = overLine(2.5);
          const p35 = overLine(3.5);
          expect(p05).toBeGreaterThanOrEqual(p15 - 1e-12);
          expect(p15).toBeGreaterThanOrEqual(p25 - 1e-12);
          expect(p25).toBeGreaterThanOrEqual(p35 - 1e-12);
          expect(p05).toBeLessThanOrEqual(1 + 1e-9);
          expect(p35).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 80 },
    );

    const rows = buildSyntheticLeague(1.35, 2.7, "dc-mono-fit", 2);
    const model = fitDixonColes(rows, { referenceDate: "2026-10-15" });
    const pred = predictFootball(model, "t1", "t5", { simulations: 40 });
    const mat = scoreMatrix(pred.lambdaHome, pred.lambdaAway, model.rho, model.gridSize);
    const pOver05 = 1 - mat[0]![0]!;
    const p15 = pred.totals.find((t) => t.line === 1.5)!.over;
    const p25 = pred.totals.find((t) => t.line === 2.5)!.over;
    const p35 = pred.totals.find((t) => t.line === 3.5)!.over;
    expect(pOver05).toBeGreaterThanOrEqual(p15 - 1e-9);
    expect(p15).toBeGreaterThanOrEqual(p25 - 1e-9);
    expect(p25).toBeGreaterThanOrEqual(p35 - 1e-9);
  });

  it("regulariza con mayor fuerza muestras pequeñas para evitar proyecciones extremas de 4.7–5.0 goles", () => {
    const tinyRows: FootballMatchRow[] = [
      { date: "2026-10-01", home: "A", away: "B", homeGoals: 5, awayGoals: 0 },
      { date: "2026-10-08", home: "A", away: "C", homeGoals: 4, awayGoals: 1 },
      { date: "2026-10-08", home: "D", away: "B", homeGoals: 3, awayGoals: 0 },
      { date: "2026-10-15", home: "C", away: "D", homeGoals: 1, awayGoals: 1 },
    ];
    const defaultModel = fitDixonColes(tinyRows, { referenceDate: "2026-10-15" });
    const weakPriorModel = fitDixonColes(tinyRows, {
      referenceDate: "2026-10-15",
      priorMatches: 1,
    });
    const defaultPred = predictFootball(defaultModel, "A", "B", { simulations: 40 });
    const weakPred = predictFootball(weakPriorModel, "A", "B", { simulations: 40 });
    expect(defaultPred.total).toBeLessThan(weakPred.total);
    expect(defaultPred.total).toBeLessThan(4.7);
  });

  it("incluye unidad obligatoria en totales de analyzeFootballGameV2 y candidatesFromGroups", () => {
    const leagueId = asLeagueId("premier-league");
    const homeId = asTeamId("premier-league.team-one");
    const awayId = asTeamId("premier-league.team-two");
    const rows = buildSyntheticLeague(1.2, 2.7, "dc-labels", 2).map((r) => ({
      ...r,
      home: r.home === "t1" ? homeId : r.home === "t2" ? awayId : `premier-league.${r.home}`,
      away: r.away === "t1" ? homeId : r.away === "t2" ? awayId : `premier-league.${r.away}`,
    }));
    const model = fitDixonColes(rows, { referenceDate: "2026-10-15" });
    const game: GameDTO = {
      id: asGameId("g-unit-1"),
      league: leagueId,
      season: asSeasonId("2026-27"),
      round: "J10",
      startTime: "2026-10-20T18:00:00Z",
      status: "scheduled",
      neutralSite: false,
      home: { id: homeId, league: leagueId, name: "Team One", shortName: "One", code: "ONE" },
      away: { id: awayId, league: leagueId, name: "Team Two", shortName: "Two", code: "TWO" },
    };
    const teamRates: Record<string, TeamSeasonRate> = {
      [homeId]: {
        teamId: homeId,
        name: "Team One",
        shortName: "One",
        code: "ONE",
        forPerGame: 1.8,
        againstPerGame: 0.9,
        gamesPlayed: 10,
        adjustedFor: 1.12,
        adjustedAgainst: 0.88,
      },
      [awayId]: {
        teamId: awayId,
        name: "Team Two",
        shortName: "Two",
        code: "TWO",
        forPerGame: 1.5,
        againstPerGame: 1.1,
        gamesPlayed: 10,
        adjustedFor: 1.02,
        adjustedAgainst: 0.98,
      },
    };
    const analysis = analyzeFootballGameV2({
      league: leagueId,
      leagueName: "Premier League",
      game,
      model,
      teamRates,
      inputsAsOf: "2026-10-19T12:00:00Z",
      publishedAt: "2026-10-19T12:00:00Z",
      source: "test",
    });

    const totalRows = analysis.marketGroups
      .flatMap((g) => g.rows)
      .filter((r) => r.market === asMarketKey("totals") || r.market === asMarketKey("team_totals"));
    expect(totalRows.length).toBeGreaterThanOrEqual(9);
    for (const row of totalRows) {
      expect(row.label).toMatch(/\bgoles\b/i);
    }

    const candidates = candidatesFromGroups([
      {
        group: "Goles totales",
        rows: [
          { market: "totals", selection: "over_2.5", label: "Más de 2.5", line: 2.5, p: 0.58, fairOdds: 1.72 },
        ],
      },
      {
        group: "Totales (220.5 puntos)",
        rows: [
          { market: "totals", selection: "over", label: "Más", line: 220.5, p: 0.55, fairOdds: 1.82 },
        ],
      },
      {
        group: "Carreras totales (8.5)",
        rows: [
          { market: "totals", selection: "under", label: "Menos", line: 8.5, p: 0.54, fairOdds: 1.85 },
        ],
      },
    ]);
    expect(candidates[0]!.label).toBe("Más de 2.5 goles");
    expect(candidates[1]!.label).toBe("Más de 220.5 puntos");
    expect(candidates[2]!.label).toBe("Menos de 8.5 carreras");
  });

  it("nunca produce NaN en intervalos ni en confidence.score para equipos sin muestra en el modelo", () => {
    const rows = buildSyntheticLeague(1.25, 2.7, "dc-unseen", 2);
    const model = fitDixonColes(rows, { referenceDate: "2026-10-15" });
    const pred = predictFootball(model, "coppa-italia.unseen-home", "coppa-italia.unseen-away", {
      simulations: 60,
    });
    expect(Number.isFinite(pred.intervals.homeWin[0])).toBe(true);
    expect(Number.isFinite(pred.intervals.homeWin[1])).toBe(true);
    expect(pred.intervals.homeWin[0]).toBeGreaterThanOrEqual(0);
    expect(pred.intervals.homeWin[1]).toBeLessThanOrEqual(1);
    expect(pred.intervals.homeWin[0]).toBeLessThanOrEqual(pred.intervals.homeWin[1]);
    expect(Number.isFinite(pred.intervals.total[0])).toBe(true);
    expect(Number.isFinite(pred.intervals.total[1])).toBe(true);
    expect(pred.intervals.total[0]).toBeGreaterThan(0);

    const leagueId = asLeagueId("coppa-italia");
    const homeId = asTeamId("coppa-italia.unseen-home");
    const awayId = asTeamId("coppa-italia.unseen-away");
    const game: GameDTO = {
      id: asGameId("g-unseen-1"),
      league: leagueId,
      season: asSeasonId("2026-27"),
      round: "Octavos",
      startTime: "2026-12-01T18:00:00Z",
      status: "scheduled",
      neutralSite: false,
      home: { id: homeId, league: leagueId, name: "Unseen Home", shortName: "UHome", code: "UHO" },
      away: { id: awayId, league: leagueId, name: "Unseen Away", shortName: "UAway", code: "UAW" },
    };
    const analysis = analyzeFootballGameV2({
      league: leagueId,
      leagueName: "Coppa Italia",
      game,
      model,
      teamRates: {},
      inputsAsOf: "2026-11-21T12:00:00Z",
      publishedAt: "2026-11-21T12:00:00Z",
      source: "test",
    });
    const parsed = GameAnalysisSchema.parse(analysis);
    expect(Number.isFinite(parsed.confidence?.score)).toBe(true);
    expect(parsed.confidence?.score).toBeGreaterThanOrEqual(0);
    expect(parsed.confidence?.score).toBeLessThanOrEqual(100);

    const fallbackConfidence = confidenceIndex({
      favorite: 0.55,
      minGamesPlayed: 4,
      intervalWidth: Number.NaN,
      disagreement: Number.NaN,
      outcomes: 3,
    });
    expect(Number.isFinite(fallbackConfidence.score)).toBe(true);
    expect(fallbackConfidence.score).toBeGreaterThanOrEqual(0);
    expect(fallbackConfidence.score).toBeLessThanOrEqual(100);
  });
});
