/**
 * Constantes transcritas del bundle público de aztecavet.com (page fb/nhl/mlb).
 * Categoría: OBSERVADO — cada valor aparece literal en el código cliente y la
 * paridad se demuestra en tests/domain/aztecavet-parity.test.ts.
 * Transcripción desde: aztecavet-analysis/scripts/pages/*.html (decodificados).
 */

// ---------- Fútbol (fb.html, línea de `const LG0=` y bloque de constantes) ----------
export const FB = {
  /** Baseline de goles por liga. */
  LG0: { PL: 1.45, LL: 1.35, MX: 1.51, SA: 1.21, BL: 1.62, L1: 1.41, OT: 1.4 },
  /** Fuerza de liga para escalar en UEFA (suposición mínima del original). */
  STR: { PL: 1, LL: 0.98, BL: 0.96, SA: 0.96, L1: 0.92, MX: 0.8, OT: 0.85 },
  /** Baseline de Copa (UCL/UEL). */
  LGU: 1.45,
  /** Exponente de Pitágoras (fútbol). */
  E: 1.7,
  /** Ventaja de local (share base). */
  HFA: 0.54,
  /** Shrink del Log5 hacia 50%. */
  SHR: 0.85,
  /** Umbral de "empate probable". */
  DRAW: 0.28,
  /** Umbral para combinar doble oportunidad + Over 1.5. */
  DCO: 0.42,
  /** Freno bayesiano de temporada. */
  K: 6,
  /** Rejilla de goles (0..13). */
  NG: 14,
  /** Prob. mínima de la combinada "favorito claro". */
  CMIN: 0.35,
  /** Corrección Dixon-Coles (ρ) por competición. */
  RHO_MX: -0.14,
  RHO: -0.08,
  /** Prior de GF/GC estimado para equipos sin dato (est(gd)). */
  EST_BASE: 55,
} as const;

// ---------- NHL (nhl.html) ----------
export const NHL = {
  /** Exponente de Pitágoras (hockey). */
  E: 2.15,
  HFA: 0.525,
  /** Freno bayesiano (prior 250 goles / 82 juegos). */
  K: 15,
  SHR: 0.85,
  /** Rejilla de goles (0..21). */
  NG: 22,
  /** Peso de la forma reciente (últimos 5 juegos, si el equipo lleva ≥7). */
  FORMW: 0.3,
  /** Prior de goles por juego para equipos "SIN DATO". */
  PRIOR: 250,
  GAMES: 82,
  /** Prob. mínima de la combinada "favorito claro" (NHL). */
  CMIN: 0.4,
} as const;

// ---------- MLB (mlb.html) ----------
export const MLB = {
  /** Carreras promedio de liga por juego. */
  LG: 4.4,
  /** Exponente de Pitágoras (béisbol). */
  EX: 1.83,
  HFA: 0.54,
  SHR: 0.85,
  /** σ del margen/carreras (3·√2) para la aproximación normal. */
  SD: 3 * Math.SQRT2,
  /** Rejilla de carreras para la matriz de combinadas. */
  NG: 26,
  /** Peso del IP "conocido" en la regresión de ERA del abridor. */
  ERA_PRIOR_IP: 80,
  /** Sensibilidad del factor de pitcheo. */
  ERA_FACTOR: 0.55,
  CMIN: 0.4,
} as const;

// ---------- Reglas de boleto/bankroll (inline_1 del shell) ----------
export const BET = {
  /** Bankroll inicial por defecto. */
  START: 1000,
  /** Umbral por defecto para apostar 10% (configurable .55/.60/.65/.70). */
  TH: 0.6,
  /** Ventaja mínima sobre la casa para considerar valor (EV ≥ +4%). */
  EVMIN: 0.04,
  /** Montos permitidos (% del bank). */
  UNIT_HIGH: 10,
  UNIT_LOW: 5,
  /** Máximo de cuotas recordadas (FIFO). */
  ODDS_MAX: 800,
  /** Límite de apuestas cargadas de la nube. */
  BETS_LIMIT: 1000,
  /** Debounce de guardado (ms). */
  SAVE_DEBOUNCE: 500,
} as const;
