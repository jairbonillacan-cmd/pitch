/**
 * Picks por perfil, índice de confianza y marcador proyectado coherente.
 *
 * Reglas fijas (docs/product/PICKS_E_INSIGHTS.md §1-§3):
 *  - El pick sale del modelo: la selección más probable dentro del rango de su perfil.
 *  - Las selecciones de un partido deben poder cumplirse a la vez (compatibilidad).
 *  - La confianza resume qué tan claro y qué tan estable es el pronóstico; se valida
 *    con el backtest antes de publicarse.
 */

export type PickProfile = "conservadora" | "intermedia" | "arriesgada";

export interface PickCandidate {
  market: string;
  selection: string;
  line?: number;
  p: number;
  fairOdds: number;
  label: string;
}

export interface Pick extends PickCandidate {
  profile: PickProfile;
}

export const PICK_PROFILES: ReadonlyArray<{
  profile: PickProfile;
  min: number;
  max: number;
  minFairOdds?: number;
}> = [
  { profile: "intermedia", min: 0.52, max: 0.7 },
  { profile: "conservadora", min: 0.7, max: 0.97 },
  { profile: "arriesgada", min: 0.3, max: 0.52, minFairOdds: 1.9 },
];

/** Mercados que no entran a ningún perfil (probabilidades demasiado bajas o ruidosas). */
const EXCLUDED_MARKETS = new Set(["correct_score"]);

export { selectionHolds } from "@pitchlab/contracts";
import { selectionHolds } from "@pitchlab/contracts";

/** Dos o más selecciones son compatibles si existe un marcador que las cumpla todas. */
export function picksCompatible(
  picks: ReadonlyArray<Pick | PickCandidate>,
  maxScore: number,
): boolean {
  if (picks.length < 2) return true;
  for (let h = 0; h <= maxScore; h++) {
    for (let a = 0; a <= maxScore; a++) {
      if (picks.every((p) => selectionHolds(p, h, a) === true)) return true;
    }
  }
  return false;
}

/**
 * Elige un pick por perfil. El intermedio se elige primero (es el «Pick PitchLab»);
 * después el conservador y el arriesgado, solo entre selecciones compatibles con los ya
 * elegidos. Si un perfil no tiene candidato, se omite: no se fuerza un pick.
 */
export function selectPicks(
  candidates: readonly PickCandidate[],
  options: { maxScore: number },
): Pick[] {
  const eligible = candidates.filter(
    (c) => !EXCLUDED_MARKETS.has(c.market) && selectionHolds(c, 0, 0) !== null,
  );
  const chosen: Pick[] = [];
  for (const rule of PICK_PROFILES) {
    const inBand = eligible
      .filter(
        (c) =>
          c.p >= rule.min &&
          c.p < rule.max &&
          (rule.minFairOdds === undefined || c.fairOdds >= rule.minFairOdds),
      )
      .sort((a, b) => b.p - a.p || a.market.localeCompare(b.market));
    const pick = inBand.find((c) =>
      picksCompatible([...chosen, { ...c, profile: rule.profile }], options.maxScore),
    );
    if (pick) chosen.push({ ...pick, profile: rule.profile });
  }
  const order: Record<PickProfile, number> = { conservadora: 0, intermedia: 1, arriesgada: 2 };
  return chosen.sort((a, b) => order[a.profile] - order[b.profile]);
}

/**
 * Candidatos a partir de los grupos de mercado publicados. La etiqueta se completa para
 * que el pick se entienda fuera de su tabla («Ambos anotan: Sí», «Más de 44.5 puntos»).
 */
export function candidatesFromGroups(
  groups: ReadonlyArray<{
    group: string;
    rows: ReadonlyArray<{
      market: string;
      selection: string;
      label: string;
      line?: number;
      p: number;
      fairOdds: number;
    }>;
  }>,
): PickCandidate[] {
  return groups.flatMap((group) =>
    group.rows.map((row) => {
      let label = row.label;
      if (row.market === "btts") label = `Ambos anotan: ${row.label}`;
      else if (row.market === "totals" && (row.label === "Más" || row.label === "Menos")) {
        label = `${row.label} de ${row.line} puntos`;
      }
      return {
        market: row.market,
        selection: row.selection,
        line: row.line,
        p: row.p,
        fairOdds: row.fairOdds,
        label,
      };
    }),
  );
}

/** El pick destacado: el intermedio y, si no hay, el conservador. */
export function featuredPick(picks: readonly Pick[]): Pick | undefined {
  return (
    picks.find((p) => p.profile === "intermedia") ??
    picks.find((p) => p.profile === "conservadora")
  );
}

export type ConfidenceLevel = "alta" | "media" | "baja";

export interface ConfidenceInputs {
  /** Probabilidad del resultado favorito (1X2 o ganador). */
  favorite: number;
  /** Partidos jugados del equipo con menos muestra esta temporada. */
  minGamesPlayed: number;
  /** Ancho del intervalo del 90 % de la victoria local (0-1). */
  intervalWidth?: number;
  /** Diferencia máxima en el 1X2 entre la temporada y la memoria larga (0-1). */
  disagreement?: number;
  /** Fútbol (3 resultados) o NFL (2): cambia la escala del favorito. */
  outcomes: 2 | 3;
}

export interface Confidence {
  score: number;
  level: ConfidenceLevel;
  reasons: string[];
}

/**
 * Umbrales del índice. Se fijaron con las temporadas de validación del backtest
 * (`pnpm --filter @pitchlab/ingest backtest:blend`) y se comprueban en las de prueba.
 */
export const CONFIDENCE_THRESHOLDS = { alta: 62, media: 45 } as const;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function confidenceIndex(input: ConfidenceInputs): Confidence {
  const floor = input.outcomes === 3 ? 0.34 : 0.5;
  const ceil = input.outcomes === 3 ? 0.75 : 0.85;
  const fav = clamp01((input.favorite - floor) / (ceil - floor));
  const sample = clamp01(input.minGamesPlayed / 10);
  const parts: Array<{ w: number; v: number }> = [
    { w: 0.5, v: fav },
    { w: 0.2, v: sample },
  ];
  if (input.intervalWidth !== undefined) {
    parts.push({ w: 0.15, v: clamp01(1 - (input.intervalWidth - 0.15) / 0.35) });
  }
  if (input.disagreement !== undefined) {
    parts.push({ w: 0.15, v: clamp01(1 - input.disagreement / 0.2) });
  }
  const weight = parts.reduce((acc, p) => acc + p.w, 0);
  const score = Math.round((100 * parts.reduce((acc, p) => acc + p.w * p.v, 0)) / weight);
  const level: ConfidenceLevel =
    score >= CONFIDENCE_THRESHOLDS.alta ? "alta" : score >= CONFIDENCE_THRESHOLDS.media ? "media" : "baja";

  const reasons: string[] = [];
  if (fav >= 0.6) reasons.push("Favorito claro");
  else if (fav <= 0.2) reasons.push("Partido parejo");
  if (sample < 0.5) reasons.push("Poca muestra esta temporada");
  else if (sample >= 1) reasons.push("Muestra suficiente");
  if (input.disagreement !== undefined) {
    if (input.disagreement >= 0.12) reasons.push("La temporada y la historia no coinciden");
    else if (input.disagreement <= 0.05) reasons.push("Temporada e historia coinciden");
  }
  if (input.intervalWidth !== undefined && input.intervalWidth >= 0.4) {
    reasons.push("Rango de incertidumbre amplio");
  }
  return { score, level, reasons: reasons.slice(0, 3) };
}

/**
 * Marcador proyectado coherente: el más probable dentro del resultado favorito y del
 * lado favorito de la línea de 2.5 goles. Evita mostrar «1–1» junto a «gana la visita»
 * o «3–2» junto a «menos de 2.5».
 */
export function coherentScore(
  matrix: readonly (readonly number[])[],
  totalLine = 2.5,
): { home: number; away: number; p: number } {
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  let pOver = 0;
  matrix.forEach((row, i) =>
    row.forEach((p, j) => {
      if (i > j) pHome += p;
      else if (i === j) pDraw += p;
      else pAway += p;
      if (i + j > totalLine) pOver += p;
    }),
  );
  const outcome = pHome >= pDraw && pHome >= pAway ? "home" : pAway >= pDraw ? "away" : "draw";
  const over = pOver >= 0.5;
  const inOutcome = (i: number, j: number): boolean =>
    outcome === "home" ? i > j : outcome === "away" ? j > i : i === j;

  let best = { home: 0, away: 0, p: -1 };
  let fallback = { home: 0, away: 0, p: -1 };
  matrix.forEach((row, i) =>
    row.forEach((p, j) => {
      if (!inOutcome(i, j)) return;
      if (p > fallback.p) fallback = { home: i, away: j, p };
      if ((i + j > totalLine) === over && p > best.p) best = { home: i, away: j, p };
    }),
  );
  return best.p >= 0 ? best : fallback;
}
