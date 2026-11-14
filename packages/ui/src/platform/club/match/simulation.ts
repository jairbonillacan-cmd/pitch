/**
 * Simulación de un partido a partir de lo que espera el modelo.
 * - Fútbol: goles de cada equipo con Poisson (λ = goles esperados).
 * - NFL: total y margen con normales (σ total 10.5, σ margen 13.5: las constantes de v3.2);
 *   sin empate (el tiempo extra se resuelve según la probabilidad del modelo).
 */

export type Rng = () => number;

/** Generador reproducible (mulberry32). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda: number, rng: Rng): number {
  const l = Math.exp(-Math.max(0, lambda));
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > l && k < 30);
  return k - 1;
}

function normal(mean: number, sd: number, rng: Rng): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface SimInput {
  sport: "football" | "american-football";
  homeExpected: number;
  awayExpected: number;
  /** Probabilidad del local según el modelo (desempate en NFL). */
  pHome: number;
}

export function simulateScore(input: SimInput, rng: Rng): { home: number; away: number } {
  if (input.sport === "football") {
    return { home: poisson(input.homeExpected, rng), away: poisson(input.awayExpected, rng) };
  }
  const total = normal(input.homeExpected + input.awayExpected, 10.5, rng);
  const margin = normal(input.homeExpected - input.awayExpected, 13.5, rng);
  let home = Math.max(0, Math.round((total + margin) / 2));
  let away = Math.max(0, Math.round((total - margin) / 2));
  if (home === away) {
    if (rng() < input.pHome) home += 3;
    else away += 3;
  }
  return { home, away };
}

export interface SimSummary {
  runs: number;
  home: number;
  draw: number;
  away: number;
  /** Marcadores más frecuentes, de mayor a menor. */
  topScores: Array<{ score: string; share: number }>;
  /** Reparto del total (goles 0…6+, o puntos en rangos de 7 para NFL). */
  totals: Array<{ label: string; share: number }>;
}

export class SimAccumulator {
  runs = 0;
  private wins = { home: 0, draw: 0, away: 0 };
  private scores = new Map<string, number>();
  private totals = new Map<number, number>();

  constructor(private readonly sport: SimInput["sport"]) {}

  add(s: { home: number; away: number }): void {
    this.runs += 1;
    if (s.home > s.away) this.wins.home += 1;
    else if (s.home < s.away) this.wins.away += 1;
    else this.wins.draw += 1;
    const key = `${s.home}–${s.away}`;
    this.scores.set(key, (this.scores.get(key) ?? 0) + 1);
    const t = s.home + s.away;
    const bucket = this.sport === "football" ? Math.min(t, 6) : Math.min(Math.floor(t / 7), 9);
    this.totals.set(bucket, (this.totals.get(bucket) ?? 0) + 1);
  }

  summary(): SimSummary {
    const n = Math.max(1, this.runs);
    const topScores = Array.from(this.scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([score, c]) => ({ score, share: c / n }));
    const buckets = this.sport === "football" ? 7 : 10;
    const totals = Array.from({ length: buckets }, (_, i) => ({
      label:
        this.sport === "football" ? (i === 6 ? "6+" : String(i)) : i === 9 ? "63+" : `${i * 7}–${i * 7 + 6}`,
      share: (this.totals.get(i) ?? 0) / n,
    }));
    return {
      runs: this.runs,
      home: this.wins.home / n,
      draw: this.wins.draw / n,
      away: this.wins.away / n,
      topScores,
      totals,
    };
  }
}

/** Un partido jugado minuto a minuto (fútbol) o por cuarto (NFL), para la animación. */
export interface PlayedMatch {
  final: { home: number; away: number };
  events: Array<{ at: number; side: "home" | "away"; points: number }>;
  /** Duración en la unidad del deporte (90 minutos o 4 cuartos). */
  length: number;
}

export function playMatch(input: SimInput, rng: Rng): PlayedMatch {
  const final = simulateScore(input, rng);
  if (input.sport === "football") {
    const events: PlayedMatch["events"] = [];
    for (let i = 0; i < final.home; i++) events.push({ at: 1 + Math.floor(rng() * 90), side: "home", points: 1 });
    for (let i = 0; i < final.away; i++) events.push({ at: 1 + Math.floor(rng() * 90), side: "away", points: 1 });
    events.sort((a, b) => a.at - b.at);
    return { final, events, length: 90 };
  }
  const events: PlayedMatch["events"] = [];
  const split = (pts: number, side: "home" | "away") => {
    let left = pts;
    while (left > 0) {
      const chunk = left >= 7 && rng() < 0.7 ? 7 : left >= 3 ? 3 : left;
      events.push({ at: 1 + Math.floor(rng() * 4), side, points: chunk });
      left -= chunk;
    }
  };
  split(final.home, "home");
  split(final.away, "away");
  events.sort((a, b) => a.at - b.at);
  return { final, events, length: 4 };
}
