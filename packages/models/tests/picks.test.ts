import { describe, expect, it } from "vitest";
import {
  coherentScore,
  coherentScoreFromProjection,
  confidenceIndex,
  featuredPick,
  picksCompatible,
  rescaleMatrixToOutcome,
  scoreMatrix,
  selectionHolds,
  selectPicks,
  type PickCandidate,
} from "../src/index.js";

const c = (market: string, selection: string, p: number, line?: number): PickCandidate => ({
  market,
  selection,
  line,
  p,
  fairOdds: 1 / p,
  label: `${market}:${selection}`,
});

describe("picks por perfil", () => {
  const candidates = [
    c("h2h", "home", 0.25),
    c("h2h", "draw", 0.27),
    c("h2h", "away", 0.48),
    c("double_chance", "1x", 0.52),
    c("double_chance", "x2", 0.75),
    c("totals", "over_1.5", 0.8, 1.5),
    c("totals", "over_2.5", 0.6, 2.5),
    c("totals", "under_2.5", 0.4, 2.5),
    c("correct_score", "1-2", 0.11),
  ];

  it("elige un pick por perfil dentro de su rango y nunca marcador exacto", () => {
    const picks = selectPicks(candidates, { maxScore: 10 });
    const byProfile = Object.fromEntries(picks.map((p) => [p.profile, p]));
    expect(byProfile.conservadora?.p).toBeGreaterThanOrEqual(0.7);
    expect(byProfile.intermedia?.p).toBeGreaterThanOrEqual(0.52);
    expect(byProfile.intermedia?.p).toBeLessThan(0.7);
    expect(byProfile.arriesgada?.p).toBeLessThan(0.52);
    expect(byProfile.arriesgada?.fairOdds).toBeGreaterThanOrEqual(1.9);
    expect(picks.some((p) => p.market === "correct_score")).toBe(false);
    expect(featuredPick(picks)?.profile).toBe("intermedia");
  });

  it("las selecciones de un partido siempre pueden cumplirse a la vez", () => {
    const picks = selectPicks(candidates, { maxScore: 10 });
    expect(picksCompatible(picks, 10)).toBe(true);
    // «Local o empate» y «gana la visita» no pueden darse juntos.
    expect(picksCompatible([c("double_chance", "1x", 0.6), c("h2h", "away", 0.4)], 10)).toBe(false);
  });

  it("omite un perfil si no hay candidato en su rango", () => {
    const picks = selectPicks([c("h2h", "home", 0.25), c("correct_score", "1-0", 0.12)], { maxScore: 10 });
    expect(picks.map((p) => p.profile)).toEqual([]);
  });

  it("califica cada mercado con el marcador final", () => {
    expect(selectionHolds(c("totals", "under_2.5", 0.5, 2.5), 1, 1)).toBe(true);
    expect(selectionHolds(c("btts", "yes", 0.5), 2, 0)).toBe(false);
    expect(selectionHolds(c("team_totals", "away_over", 0.5, 1.5), 0, 2)).toBe(true);
    expect(selectionHolds(c("spreads", "home", 0.5, 9.5), 17, 24)).toBe(true);
    expect(selectionHolds(c("spreads", "away_-7.5", 0.5, -7.5), 17, 24)).toBe(false);
  });
});

describe("marcador proyectado coherente", () => {
  it("pertenece al resultado favorito y al lado favorito de 2.5", () => {
    // Visita favorita con muchos goles: el 1-1 (modo) no debe salir.
    const m = rescaleMatrixToOutcome(scoreMatrix(1.6, 1.8, -0.05, 10), {
      home: 0.33,
      draw: 0.22,
      away: 0.45,
    });
    const s = coherentScore(m);
    expect(s.away).toBeGreaterThan(s.home);
    expect(s.home + s.away).toBeGreaterThan(2.5);
  });

  it("reconstruye uno coherente desde una proyección publicada", () => {
    const s = coherentScoreFromProjection(0.9, 1.1, [0.3, 0.3, 0.4]);
    expect(s.away).toBeGreaterThan(s.home);
    expect(s.home + s.away).toBeLessThan(2.5);
  });
});

describe("índice de confianza", () => {
  it("sube con un favorito claro, más muestra y acuerdo con la historia", () => {
    const low = confidenceIndex({ favorite: 0.38, minGamesPlayed: 2, intervalWidth: 0.45, disagreement: 0.15, outcomes: 3 });
    const high = confidenceIndex({ favorite: 0.7, minGamesPlayed: 12, intervalWidth: 0.2, disagreement: 0.02, outcomes: 3 });
    expect(high.score).toBeGreaterThan(low.score);
    expect(high.level).toBe("alta");
    expect(low.level).toBe("baja");
    expect(low.reasons.length).toBeGreaterThan(0);
  });
});
