import {
  MAX_POSITIVE_DECIMAL_ODDS,
  isPermittedMarketQuoteBook,
  parseStrictFiniteNumber,
  sportScoringUnit,
  type PlatformSport,
} from "@pitchlab/contracts";
import { resolvePersonPhotoUrl } from "@pitchlab/sports-assets";
import { normalCdf } from "../spacetime-markets";
import type {
  BookQuoteItem,
  MatchPick,
  PickConflictGroup,
  PlatformGame,
  PlatformMarketRow,
} from "../types";
import {
  FOOTBALL_PROP_MIN_MINUTES,
  MARKET_FAMILY_IDS,
  NBA_PROP_DEFAULT_MIN_MINUTES,
  type CatalogBuildContext,
  type CatalogPickItem,
  type EvidenceWindowStat,
  type FootballPlayerPropCandidateInput,
  type FootballPlayerPropStatKey,
  type LineupConfirmationStatus,
  type MarketFamilyId,
  type MarketFamilySpec,
  type MatchPicksCatalog,
  type NbaPlayerPropCandidateInput,
  type NbaPlayerPropStatKey,
  type PickAxisKey,
  type PickDirection,
  type PlayerPropMeta,
  type RefereeEvidenceSignal,
} from "./catalog-types";
import {
  buildCatalogPickEvidence,
  buildNumericSeriesEvidenceWindows,
  computePickPricing,
  gradeCatalogPick,
  isMarketBookLabelPermitted,
  isMarketQuoteFreshWithin72h,
  resolveRefereeEvidenceSignal,
  resolveXgEvidenceSignal,
  scoreRecommendedCatalogPick,
} from "./evidence-engine";

export const MARKET_FAMILIES: Readonly<Record<MarketFamilyId, MarketFamilySpec>> = {
  "1x2": {
    id: "1x2",
    sport: "football",
    label: "Resultado 1X2",
    shortLabel: "1X2",
    category: "resultado",
    axis: "result_ft",
    ways: 3,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Ganador en 90 minutos reglamentarios o empate.",
  },
  double_chance: {
    id: "double_chance",
    sport: "football",
    label: "Doble oportunidad",
    shortLabel: "Doble op.",
    category: "resultado",
    axis: "result_ft",
    ways: 3,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Cobertura de 2 de los 3 desenlaces reglamentarios (1X, X2 o 12).",
  },
  dnb: {
    id: "dnb",
    sport: "football",
    label: "Empate no acción (DNB)",
    shortLabel: "DNB",
    category: "resultado",
    axis: "result_ft",
    ways: 2,
    supportsPush: true,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Ganador del encuentro con devolución (push) en caso de empate.",
  },
  btts: {
    id: "btts",
    sport: "football",
    label: "Ambos equipos anotan",
    shortLabel: "Ambos anotan",
    category: "ambos_porteria",
    axis: "btts",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Ambos equipos marcan al menos un gol en 90 minutos (Sí / No).",
  },
  totals: {
    id: "totals",
    sport: "football",
    label: "Total de goles (0.5–4.5)",
    shortLabel: "Goles totales",
    category: "goles_totales",
    axis: "goals_total",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Más/Menos goles combinados en líneas 0.5 a 4.5.",
  },
  team_totals: {
    id: "team_totals",
    sport: "football",
    label: "Goles por equipo",
    shortLabel: "Goles equipo",
    category: "goles_totales",
    axis: "team_goals_home",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Más/Menos goles individuales para el equipo local o visitante.",
  },
  half_time_result: {
    id: "half_time_result",
    sport: "football",
    label: "Resultado 1.er tiempo",
    shortLabel: "1T 1X2",
    category: "resultado",
    axis: "result_ht",
    ways: 3,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Resultado al descanso (minutos 1–45+).",
  },
  second_half_result: {
    id: "second_half_result",
    sport: "football",
    label: "Resultado 2.º tiempo",
    shortLabel: "2T 1X2",
    category: "resultado",
    axis: "result_2h",
    ways: 3,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Resultado parcial considerando únicamente goles del complemento.",
  },
  combo_1x2_over: {
    id: "combo_1x2_over",
    sport: "football",
    label: "Resultado + Total de goles",
    shortLabel: "1X2 + Goles",
    category: "handicap_combos",
    axis: "combo_result_goals",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Combinada exacta desde la matriz conjunta de resultado y goles totales.",
  },
  combo_1x2_btts: {
    id: "combo_1x2_btts",
    sport: "football",
    label: "Resultado + Ambos anotan",
    shortLabel: "1X2 + BTTS",
    category: "handicap_combos",
    axis: "combo_result_btts",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Combinada exacta de desenlace reglamentario y ambos anotan (Sí / No).",
  },
  asian_handicap: {
    id: "asian_handicap",
    sport: "football",
    label: "Hándicap asiático (-2.5..+2.5)",
    shortLabel: "Hándicap asiático",
    category: "handicap_combos",
    axis: "handicap",
    ways: 2,
    supportsPush: true,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Ventaja o desventaja de goles desde -2.5 hasta +2.5 con push en líneas enteras.",
  },
  clean_sheet: {
    id: "clean_sheet",
    sport: "football",
    label: "Portería a cero",
    shortLabel: "Portería cero",
    category: "ambos_porteria",
    axis: "clean_sheet_home",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Probabilidad de que un equipo no reciba gol durante el encuentro.",
  },
  win_to_nil: {
    id: "win_to_nil",
    sport: "football",
    label: "Ganar sin recibir gol",
    shortLabel: "Gana a cero",
    category: "ambos_porteria",
    axis: "win_to_nil",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Victoria reglamentaria manteniendo la portería en cero.",
  },
  corners_total: {
    id: "corners_total",
    sport: "football",
    label: "Córners totales",
    shortLabel: "Córners",
    category: "conteos_arbitro",
    axis: "corners_total",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Tiros de esquina totales proyectados según ritmo ofensivo y guion de partido.",
  },
  corners_team: {
    id: "corners_team",
    sport: "football",
    label: "Córners por equipo",
    shortLabel: "Córners equipo",
    category: "conteos_arbitro",
    axis: "corners_home",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Tiros de esquina individuales del local o visitante condicionados al dominio esperado.",
  },
  shots_total: {
    id: "shots_total",
    sport: "football",
    label: "Remates totales",
    shortLabel: "Remates",
    category: "conteos_arbitro",
    axis: "shots_total",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Volumen total de remates proyectado según ritmo ofensivo y dispersión del partido.",
  },
  shots_on_target: {
    id: "shots_on_target",
    sport: "football",
    label: "Remates a puerta",
    shortLabel: "A puerta",
    category: "conteos_arbitro",
    axis: "sot_total",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Remates entre los tres palos combinados en el encuentro.",
  },
  fouls_total: {
    id: "fouls_total",
    sport: "football",
    label: "Faltas totales",
    shortLabel: "Faltas",
    category: "conteos_arbitro",
    axis: "fouls_total",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: true,
    sgpEligible: true,
    description: "Faltas combinadas ajustadas por paridad del duelo y perfil arbitral.",
  },
  cards_total: {
    id: "cards_total",
    sport: "football",
    label: "Tarjetas totales",
    shortLabel: "Tarjetas",
    category: "conteos_arbitro",
    axis: "cards_total",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: true,
    sgpEligible: true,
    description: "Tarjetas amarillas totales ajustadas por muestra y rigor arbitral.",
  },
  player_props_football: {
    id: "player_props_football",
    sport: "football",
    label: "Props de jugador (Fútbol)",
    shortLabel: "Jugadores",
    category: "player_props",
    axis: "player_prop",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: true,
    usesRefereeAdjustment: true,
    sgpEligible: true,
    description:
      "Tiros, tiros a puerta, gol/asistencia, faltas y tarjetas con guardia >= 45 min y estado de alineación.",
  },

  nba_moneyline: {
    id: "nba_moneyline",
    sport: "basketball",
    label: "Ganador NBA (Moneyline)",
    shortLabel: "Ganador",
    category: "resultado",
    axis: "result_ft",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Ganador final NBA incluyendo tiempo extra.",
  },
  nba_spread: {
    id: "nba_spread",
    sport: "basketball",
    label: "Hándicap NBA (Spread)",
    shortLabel: "Spread",
    category: "handicap_combos",
    axis: "handicap",
    ways: 2,
    supportsPush: true,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Línea principal y alternativas de margen de puntos NBA.",
  },
  nba_totals: {
    id: "nba_totals",
    sport: "basketball",
    label: "Total de puntos NBA",
    shortLabel: "Totales",
    category: "goles_totales",
    axis: "points_total",
    ways: 2,
    supportsPush: true,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Más/Menos puntos totales combinados con ritmo y eficiencia calibrados.",
  },
  nba_player_props: {
    id: "nba_player_props",
    sport: "basketball",
    label: "Props de jugador NBA",
    shortLabel: "Jugadores NBA",
    category: "player_props",
    axis: "player_prop",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: true,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Proyecciones calibradas de Puntos (PTS), Rebotes (REB), Asistencias (AST) y Triples (3PM).",
  },

  mlb_moneyline: {
    id: "mlb_moneyline",
    sport: "baseball",
    label: "Ganador MLB (Moneyline)",
    shortLabel: "Ganador",
    category: "resultado",
    axis: "result_ft",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Ganador de juego completo MLB incluyendo resolución de extra innings.",
  },
  mlb_run_line: {
    id: "mlb_run_line",
    sport: "baseball",
    label: "Run Line MLB (-1.5 / +1.5)",
    shortLabel: "Run Line",
    category: "handicap_combos",
    axis: "handicap",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Hándicap de carreras integrando victorias de 2+ en entradas extra.",
  },
  mlb_f5: {
    id: "mlb_f5",
    sport: "baseball",
    label: "Primeras 5 entradas (F5)",
    shortLabel: "F5",
    category: "resultado",
    axis: "result_f5",
    ways: 3,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Resultado (3 vías) y total de carreras en las primeras 5 entradas (abridores).",
  },
  mlb_totals: {
    id: "mlb_totals",
    sport: "baseball",
    label: "Total de carreras MLB",
    shortLabel: "Carreras",
    category: "goles_totales",
    axis: "runs_total",
    ways: 2,
    supportsPush: true,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Más/Menos carreras combinadas integrando la masa exacta de extra innings.",
  },

  nhl_moneyline: {
    id: "nhl_moneyline",
    sport: "ice-hockey",
    label: "Ganador NHL (incl. OT/SO)",
    shortLabel: "Ganador",
    category: "resultado",
    axis: "result_ft",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Ganador final NHL incluyendo prórroga y tanda de penales.",
  },
  nhl_puck_line: {
    id: "nhl_puck_line",
    sport: "ice-hockey",
    label: "Puck Line NHL (-1.5 / +1.5)",
    shortLabel: "Puck Line",
    category: "handicap_combos",
    axis: "handicap",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Diferencial de goles NHL ajustado por efecto de portería vacía (empty-net).",
  },
  nhl_totals: {
    id: "nhl_totals",
    sport: "ice-hockey",
    label: "Total de goles NHL",
    shortLabel: "Goles NHL",
    category: "goles_totales",
    axis: "goals_total",
    ways: 2,
    supportsPush: true,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Más/Menos goles totales integrando gol decisivo de prórroga y empty-net.",
  },

  nfl_moneyline: {
    id: "nfl_moneyline",
    sport: "american-football",
    label: "Ganador NFL (Moneyline)",
    shortLabel: "Ganador",
    category: "resultado",
    axis: "result_ft",
    ways: 2,
    supportsPush: false,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Ganador final del partido NFL.",
  },
  nfl_spread: {
    id: "nfl_spread",
    sport: "american-football",
    label: "Hándicap NFL (Spread)",
    shortLabel: "Spread NFL",
    category: "handicap_combos",
    axis: "handicap",
    ways: 2,
    supportsPush: true,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Spread calibrado con núcleo discreto en números clave (±3 y ±7).",
  },
  nfl_totals: {
    id: "nfl_totals",
    sport: "american-football",
    label: "Total de puntos NFL",
    shortLabel: "Totales NFL",
    category: "goles_totales",
    axis: "points_total",
    ways: 2,
    supportsPush: true,
    requiresLineupGuard: false,
    usesRefereeAdjustment: false,
    sgpEligible: true,
    description: "Más/Menos puntos totales combinados NFL.",
  },
};

export function getMarketFamilySpec(id: MarketFamilyId): MarketFamilySpec {
  return MARKET_FAMILIES[id];
}

export function getMarketFamiliesForSport(sport: PlatformSport): readonly MarketFamilySpec[] {
  return MARKET_FAMILY_IDS.map((id) => MARKET_FAMILIES[id]).filter((spec) => spec.sport === sport);
}


function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function clampProb(p: number): number {
  return clamp(Number.isFinite(p) ? p : 0.5, 0.015, 0.985);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function roundToHalf(n: number): number {
  return Math.round(n - 0.5) + 0.5;
}

function formatSignedLine(line: number): string {
  const clean = Number.isInteger(line) ? line.toFixed(1).replace(/\.0$/, ".0") : String(line);
  return line > 0 ? `+${clean}` : clean;
}

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function logGamma(z: number): number {
  const g = 7;
  const coef = [
    0.9999999999998099,
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  const zm = z - 1;
  let x = coef[0]!;
  for (let i = 1; i < g + 2; i += 1) {
    x += coef[i]! / (zm + i);
  }
  const t = zm + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (zm + 0.5) * Math.log(t) - t + Math.log(x);
}

function negBinomPmfArray(mu: number, r: number, maxK: number): number[] {
  const safeMu = Number.isFinite(mu) ? Math.max(0.001, mu) : 0.02;
  const safeR = Number.isFinite(r) ? Math.max(0.001, r) : 0.5;
  const safeMaxK = Number.isFinite(maxK) ? Math.max(1, Math.min(110, Math.floor(maxK))) : 25;
  const logP = Math.log(safeR / (safeR + safeMu));
  const logQ = Math.log(safeMu / (safeR + safeMu));
  const lgR = logGamma(safeR);

  const pmf = new Array<number>(safeMaxK + 1);
  let sum = 0;
  for (let k = 0; k <= safeMaxK; k += 1) {
    const lp = logGamma(k + safeR) - logGamma(k + 1) - lgR + safeR * logP + k * logQ;
    const val = Number.isFinite(lp) ? Math.exp(lp) : 0;
    pmf[k] = val;
    sum += val;
  }
  if (sum > 0 && Number.isFinite(sum)) {
    for (let k = 0; k <= safeMaxK; k += 1) pmf[k] = pmf[k]! / sum;
  } else {
    pmf.fill(0);
    pmf[0] = 1;
  }
  return pmf;
}

function negBinomOverUnder(
  mu: number,
  dispersionR: number,
  line: number,
): { readonly pOver: number; readonly pUnder: number; readonly pPush: number } {
  const safeMu = Number.isFinite(mu) ? Math.max(0.001, mu) : 0.001;
  const safeR = Number.isFinite(dispersionR) ? Math.max(0.001, dispersionR) : 0.5;
  const safeLine = Number.isFinite(line) ? line : 0.5;
  const variance = safeMu + (safeMu * safeMu) / safeR;
  const rawMaxK = Math.ceil(safeMu + 6 * Math.sqrt(Math.max(0, variance)) + 8);
  const maxK = Number.isFinite(rawMaxK) ? clamp(rawMaxK, 25, 110) : 110;
  const pmf = negBinomPmfArray(safeMu, safeR, maxK);
  const isInt = Math.abs(safeLine - Math.round(safeLine)) < 1e-6;
  const intLine = Math.round(safeLine);

  let pUnder = 0;
  let pPush = 0;
  let pOver = 0;
  for (let k = 0; k < pmf.length; k += 1) {
    const pk = pmf[k]!;
    if (isInt && k === intLine) pPush += pk;
    else if (k < safeLine) pUnder += pk;
    else pOver += pk;
  }
  const active = Math.max(1e-6, pOver + pUnder);
  return {
    pOver: clampProb(pOver / active),
    pUnder: clampProb(pUnder / active),
    pPush,
  };
}

function normalInvCdf(p: number): number {
  const safe = clamp(p, 0.005, 0.995);
  let lo = -5;
  let hi = 5;
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) * 0.5;
    if (normalCdf(mid) < safe) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
}

function buildCoherentFootballMatrix(
  lamHome: number,
  lamAway: number,
  x12: readonly [number, number, number] | null,
  rho = -0.075,
  maxGoals = 10,
): number[][] {
  const lh = clamp(lamHome, 0.15, 5.2);
  const la = clamp(lamAway, 0.15, 5.2);

  const ph = new Array<number>(maxGoals + 1);
  const pa = new Array<number>(maxGoals + 1);
  ph[0] = Math.exp(-lh);
  pa[0] = Math.exp(-la);
  for (let k = 1; k <= maxGoals; k += 1) {
    ph[k] = (ph[k - 1]! * lh) / k;
    pa[k] = (pa[k - 1]! * la) / k;
  }

  const matrix: number[][] = [];
  let sum = 0;
  for (let h = 0; h <= maxGoals; h += 1) {
    const row: number[] = [];
    for (let a = 0; a <= maxGoals; a += 1) {
      let tau = 1;
      if (h === 0 && a === 0) tau = 1 - lh * la * rho;
      else if (h === 0 && a === 1) tau = 1 + lh * rho;
      else if (h === 1 && a === 0) tau = 1 + la * rho;
      else if (h === 1 && a === 1) tau = 1 - rho;
      const cell = Math.max(0, tau) * ph[h]! * pa[a]!;
      row.push(cell);
      sum += cell;
    }
    matrix.push(row);
  }
  if (sum > 0) {
    for (let h = 0; h <= maxGoals; h += 1) {
      for (let a = 0; a <= maxGoals; a += 1) {
        matrix[h]![a] = matrix[h]![a]! / sum;
      }
    }
  }

  if (x12) {
    const [rH, rD, rA] = x12;
    const xSum = rH + rD + rA;
    if (Number.isFinite(xSum) && xSum > 0 && rH > 0 && rD > 0 && rA > 0) {
      const tH = rH / xSum;
      const tD = rD / xSum;
      const tA = rA / xSum;
      let sH = 0;
      let sD = 0;
      let sA = 0;
      for (let h = 0; h <= maxGoals; h += 1) {
        for (let a = 0; a <= maxGoals; a += 1) {
          const p = matrix[h]![a]!;
          if (h > a) sH += p;
          else if (h === a) sD += p;
          else sA += p;
        }
      }
      if (sH > 1e-6 && sD > 1e-6 && sA > 1e-6) {
        for (let h = 0; h <= maxGoals; h += 1) {
          for (let a = 0; a <= maxGoals; a += 1) {
            const scale = h > a ? tH / sH : h === a ? tD / sD : tA / sA;
            matrix[h]![a] = matrix[h]![a]! * scale;
          }
        }
      }
    }
  }

  return matrix;
}

function sumMatrix(matrix: readonly (readonly number[])[], pred: (h: number, a: number) => boolean): number {
  let acc = 0;
  for (let h = 0; h < matrix.length; h += 1) {
    const row = matrix[h]!;
    for (let a = 0; a < row.length; a += 1) {
      if (pred(h, a)) acc += row[a]!;
    }
  }
  return acc;
}

function sanitizeSafePhotoKey(raw?: string | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return null;
  return resolvePersonPhotoUrl(trimmed) ? trimmed : null;
}

interface IndexedQuote {
  readonly decimal: number;
  readonly bookLabel: string | null;
  readonly capturedAtUtc: string | null;
  readonly bookQuotes?: readonly BookQuoteItem[];
  readonly publishedProb?: number;
}

function selectPermittedFreshBookQuotes(
  bookQuotes: readonly BookQuoteItem[] | undefined,
  nowIso: string | null,
): readonly BookQuoteItem[] {
  if (!bookQuotes || bookQuotes.length === 0) return [];
  const valid = bookQuotes
    .filter(
      (q) =>
        typeof q.decimal === "number" &&
        Number.isFinite(q.decimal) &&
        q.decimal >= 1.01 &&
        q.decimal <= MAX_POSITIVE_DECIMAL_ODDS &&
        isPermittedMarketQuoteBook(q.book, q.bookLabel) &&
        isMarketQuoteFreshWithin72h(q.capturedAtUtc, nowIso),
    )
    .slice()
    .sort((a, b) => b.decimal - a.decimal);
  return valid.map((q, idx) => (idx === 0 ? { ...q, isBest: true } : { ...q, isBest: false }));
}

const LINE_SCOPED_MARKETS: ReadonlySet<string> = new Set([
  "totals",
  "team_totals",
  "spread",
  "spreads",
  "handicap",
  "asian_handicap",
  "corners_total",
  "corners_team",
  "fouls_total",
  "cards_total",
  "yellow_total",
  "shots_total",
  "shots_on_target",
  "nba_totals",
  "nba_spread",
  "mlb_totals",
  "mlb_run_line",
  "nhl_totals",
  "nhl_puck_line",
  "nhl_puckline",
  "nfl_totals",
  "nfl_spread",
  "over_under",
]);

const SHARP_COMPANION_BOOK_PRIORITY: readonly string[] = [
  "pinnacle",
  "betcris",
  "betonline",
  "betonlineag",
];

function isLineScopedMarket(marketLower: string): boolean {
  return (
    LINE_SCOPED_MARKETS.has(marketLower) ||
    marketLower.startsWith("totals_") ||
    marketLower.startsWith("ah_") ||
    marketLower.startsWith("team_goals_")
  );
}

function normalizeBookKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function buildQuoteIndex(
  game: PlatformGame,
  markets: readonly PlatformMarketRow[],
  nowIso: string | null,
): Map<string, IndexedQuote> {
  const index = new Map<string, IndexedQuote>();

  const put = (key: string, val: IndexedQuote) => {
    if (!index.has(key)) index.set(key, val);
  };

  for (const row of markets) {
    const cleanQuotes = selectPermittedFreshBookQuotes(row.bookQuotes, nowIso);
    const bestFromQuotes = cleanQuotes[0] ?? null;

    const fallbackAllowed =
      typeof row.currentDecimal === "number" &&
      Number.isFinite(row.currentDecimal) &&
      row.currentDecimal >= 1.01 &&
      row.currentDecimal <= MAX_POSITIVE_DECIMAL_ODDS &&
      isMarketBookLabelPermitted(row.quoteBookLabel) &&
      isMarketQuoteFreshWithin72h(row.quoteCapturedAtUtc, nowIso);

    const dec = bestFromQuotes
      ? bestFromQuotes.decimal
      : fallbackAllowed
        ? row.currentDecimal
        : null;
    const bookLabel = bestFromQuotes
      ? bestFromQuotes.bookLabel
      : fallbackAllowed
        ? (row.quoteBookLabel ?? null)
        : null;
    const capturedAtUtc = bestFromQuotes
      ? bestFromQuotes.capturedAtUtc
      : fallbackAllowed
        ? (row.quoteCapturedAtUtc ?? null)
        : null;

    if (dec === null && !Number.isFinite(row.p)) continue;

    const entry: IndexedQuote = {
      decimal: dec ?? 0,
      bookLabel,
      capturedAtUtc,
      ...(cleanQuotes.length > 0 ? { bookQuotes: cleanQuotes } : {}),
      publishedProb: Number.isFinite(row.p) && row.p > 0.005 && row.p < 0.995 ? row.p : undefined,
    };
    const m = row.market.toLowerCase();
    const s = row.selection.toLowerCase();
    const explicitLine =
      typeof row.line === "number" && Number.isFinite(row.line) ? row.line : null;
    const resolvedLine = explicitLine ?? parseLineFromKey(s) ?? parseLineFromKey(m);

    if (isLineScopedMarket(m)) {
      if (resolvedLine === null) continue;
      const l = String(resolvedLine);
      put(`${m}|${s}|${l}`, entry);
      const baseSel = s.replace(/_[+-]?\d+(?:[._]\d+)?$/, "");
      if (baseSel && baseSel !== s) {
        put(`${m}|${baseSel}|${l}`, entry);
      }
    } else {
      const l = resolvedLine !== null ? String(resolvedLine) : "";
      if (l.length > 0) {
        put(`${m}|${s}|${l}`, entry);
      }
      put(`${m}|${s}`, entry);
    }
  }

  const stMarket = game.spacetime?.market;
  if (stMarket) {
    const book = stMarket.bookLabel.split(" · ")[0]?.trim() ?? stMarket.bookLabel;
    if (
      isMarketBookLabelPermitted(stMarket.bookLabel) &&
      isMarketQuoteFreshWithin72h(stMarket.asOfUtc, nowIso)
    ) {
      if (stMarket.odds.home >= 1.01 && stMarket.odds.home <= MAX_POSITIVE_DECIMAL_ODDS) {
        put("1x2|home", {
          decimal: stMarket.odds.home,
          bookLabel: book,
          capturedAtUtc: stMarket.asOfUtc,
        });
        put("h2h|home", {
          decimal: stMarket.odds.home,
          bookLabel: book,
          capturedAtUtc: stMarket.asOfUtc,
        });
      }
      if (
        stMarket.odds.draw !== null &&
        stMarket.odds.draw >= 1.01 &&
        stMarket.odds.draw <= MAX_POSITIVE_DECIMAL_ODDS
      ) {
        put("1x2|draw", {
          decimal: stMarket.odds.draw,
          bookLabel: book,
          capturedAtUtc: stMarket.asOfUtc,
        });
        put("h2h|draw", {
          decimal: stMarket.odds.draw,
          bookLabel: book,
          capturedAtUtc: stMarket.asOfUtc,
        });
      }
      if (stMarket.odds.away >= 1.01 && stMarket.odds.away <= MAX_POSITIVE_DECIMAL_ODDS) {
        put("1x2|away", {
          decimal: stMarket.odds.away,
          bookLabel: book,
          capturedAtUtc: stMarket.asOfUtc,
        });
        put("h2h|away", {
          decimal: stMarket.odds.away,
          bookLabel: book,
          capturedAtUtc: stMarket.asOfUtc,
        });
      }
    }
  }

  return index;
}

function lookupQuote(
  quoteIndex: ReadonlyMap<string, IndexedQuote>,
  keys: readonly string[],
): IndexedQuote | null {
  for (const k of keys) {
    const found = quoteIndex.get(k);
    if (found && found.decimal >= 1.01) return found;
  }
  return null;
}

function lookupPublishedProb(
  quoteIndex: ReadonlyMap<string, IndexedQuote>,
  keys: readonly string[],
): number | null {
  for (const k of keys) {
    const found = quoteIndex.get(k);
    if (found && typeof found.publishedProb === "number") return found.publishedProb;
  }
  return null;
}

function resolveSameBookCompanionDecimals(
  legs: ReadonlyArray<IndexedQuote | null>,
): readonly number[] | null {
  if (legs.length < 2) return null;
  const present: IndexedQuote[] = [];
  for (const leg of legs) {
    if (!leg || !Number.isFinite(leg.decimal) || leg.decimal < 1.01) return null;
    present.push(leg);
  }

  const legBookMaps = present.map((leg) => {
    const map = new Map<string, number>();
    for (const q of leg.bookQuotes ?? []) {
      if (!Number.isFinite(q.decimal) || q.decimal < 1.01) continue;
      const key = normalizeBookKey(q.book || q.bookLabel);
      if (key && !map.has(key)) map.set(key, q.decimal);
    }
    if (map.size === 0 && leg.bookLabel) {
      const primary = normalizeBookKey(leg.bookLabel.split(/[·|]/)[0] ?? leg.bookLabel);
      if (primary) map.set(primary, leg.decimal);
    }
    return map;
  });

  const firstMap = legBookMaps[0];
  if (firstMap) {
    const commonBooks: string[] = [];
    for (const key of firstMap.keys()) {
      if (legBookMaps.every((m) => m.has(key))) {
        commonBooks.push(key);
      }
    }
    if (commonBooks.length > 0) {
      commonBooks.sort((a, b) => {
        const pa = SHARP_COMPANION_BOOK_PRIORITY.findIndex((t) => a.includes(t));
        const pb = SHARP_COMPANION_BOOK_PRIORITY.findIndex((t) => b.includes(t));
        const ra = pa >= 0 ? pa : 99;
        const rb = pb >= 0 ? pb : 99;
        if (ra !== rb) return ra - rb;
        return a.localeCompare(b);
      });
      const chosenBook = commonBooks[0]!;
      return legBookMaps.map((m) => m.get(chosenBook)!);
    }
  }

  return null;
}

function parseLineFromKey(key: string): number | null {
  const trimmed = key.trim().toLowerCase();
  const direct = trimmed.match(/(?:_|\s)([+-]?\d+(?:\.\d+)?)$/);
  if (direct?.[1]) {
    const n = parseStrictFiniteNumber(direct[1]);
    if (n !== null) return n;
  }
  const underscoreDec = trimmed.match(/(?:_|\s)([+-]?\d+)_(\d+)$/);
  if (underscoreDec?.[1] && underscoreDec?.[2]) {
    const n = parseStrictFiniteNumber(`${underscoreDec[1]}.${underscoreDec[2]}`);
    if (n !== null) return n;
  }
  return null;
}

function findMatchingPrimaryPick(
  game: PlatformGame,
  family: MarketFamilyId,
  selectionKey: string,
  line: number | null,
  claimedPrimaryIds: ReadonlySet<string>,
): MatchPick | null {
  const sNorm = selectionKey.toLowerCase();
  const targetTotalDir =
    sNorm === "over" || sNorm.startsWith("over_")
      ? "over"
      : sNorm === "under" || sNorm.startsWith("under_")
        ? "under"
        : null;

  for (const pk of game.picks) {
    if (claimedPrimaryIds.has(pk.id)) continue;
    const pm = (pk.market ?? "").toLowerCase();
    const ps = pk.selectionKey.toLowerCase();
    const explicitPkLine =
      typeof pk.line === "number" && Number.isFinite(pk.line) ? pk.line : null;
    const psLine = parseLineFromKey(ps);
    const pmLine = parseLineFromKey(pm);
    if (explicitPkLine !== null && psLine !== null && Math.abs(explicitPkLine - psLine) >= 0.01) {
      continue;
    }
    const pkLine = explicitPkLine ?? psLine ?? pmLine;
    const sameLine =
      line === null
        ? true
        : family === "dnb"
          ? pkLine === null || Math.abs(pkLine - line) < 0.01
          : pkLine !== null && Math.abs(pkLine - line) < 0.01;

    if (!sameLine) continue;
    if (
      (family === "1x2" ||
        family === "nba_moneyline" ||
        family === "mlb_moneyline" ||
        family === "nhl_moneyline" ||
        family === "nfl_moneyline") &&
      (pm === "h2h" || pm === "1x2" || pm === "moneyline" || pm === "ml") &&
      ps === sNorm
    ) {
      return pk;
    }
    if (family === "double_chance" && pm === "double_chance" && ps === sNorm) return pk;
    if (family === "dnb" && (pm === "dnb" || pm === "draw_no_bet") && ps === sNorm) return pk;
    if (family === "btts" && pm === "btts" && ps === sNorm) return pk;
    if (
      (family === "totals" ||
        family === "nba_totals" ||
        family === "mlb_totals" ||
        family === "nhl_totals" ||
        family === "nfl_totals") &&
      (pm === "totals" || pm === family || pm.startsWith("totals_") || pm === "over_under")
    ) {
      const pkTotalDir =
        ps === "over" || ps.startsWith("over_")
          ? "over"
          : ps === "under" || ps.startsWith("under_")
            ? "under"
            : null;
      if (ps === sNorm || (targetTotalDir !== null && pkTotalDir === targetTotalDir)) {
        return pk;
      }
    }
    if (
      family === "team_totals" &&
      pm.startsWith("team_") &&
      (ps === sNorm || ps === sNorm.replace(/_[+-]?\d+(?:\.\d+)?$/, ""))
    ) {
      return pk;
    }
    if (
      (family === "asian_handicap" ||
        family === "nba_spread" ||
        family === "mlb_run_line" ||
        family === "nhl_puck_line" ||
        family === "nfl_spread") &&
      (pm.includes("spread") || pm.includes("handicap") || pm.includes("puck") || pm.includes("run")) &&
      (ps === sNorm || ((ps === "home" || ps === "away") && sNorm.startsWith(`${ps}_`)))
    ) {
      return pk;
    }
  }
  return null;
}

function resolveLineupStatusForPlayer(
  game: PlatformGame,
  playerName: string,
  teamSide: "home" | "away",
  explicit?: LineupConfirmationStatus,
): { readonly status: LineupConfirmationStatus; readonly isRuledOut: boolean } {
  const normP = normalizeName(playerName);
  const absences = game.preGame?.absences ?? [];
  for (const abs of absences) {
    if (abs.teamSide !== teamSide) continue;
    const normAbs = normalizeName(abs.player);
    if (normAbs && (normAbs === normP || normAbs.includes(normP) || normP.includes(normAbs))) {
      if (abs.status === "Baja") {
        return { status: "unknown", isRuledOut: true };
      }
    }
  }

  const confirmed = game.preGame?.confirmedLineups;
  if (confirmed) {
    const list = teamSide === "home" ? confirmed.homeStarters : confirmed.awayStarters;
    const hit = list.some((s) => {
      const ns = normalizeName(s.name);
      return ns === normP || ns.includes(normP) || normP.includes(ns);
    });
    if (hit) return { status: "confirmed", isRuledOut: false };
  }

  const probable = game.preGame?.probableLineups;
  if (probable) {
    const list = teamSide === "home" ? probable.homeStarters : probable.awayStarters;
    const hit = list.some((s) => {
      const ns = normalizeName(s.name);
      return ns === normP || ns.includes(normP) || normP.includes(ns);
    });
    if (hit) return { status: "probable", isRuledOut: false };
  }

  return { status: explicit ?? "unknown", isRuledOut: false };
}

function conflictGroupFor(
  family: MarketFamilyId,
  selectionKey: string,
  direction: PickDirection,
): PickConflictGroup {
  const s = selectionKey.toLowerCase();
  if (family === "btts") return direction === "no" ? "btts_no" : "btts_yes";
  if (
    family === "totals" ||
    family === "nba_totals" ||
    family === "mlb_totals" ||
    family === "nhl_totals" ||
    family === "nfl_totals"
  ) {
    return direction === "under" ? "under_total" : "over_total";
  }
  if (
    family === "1x2" ||
    family === "double_chance" ||
    family === "dnb" ||
    family === "nba_moneyline" ||
    family === "mlb_moneyline" ||
    family === "nhl_moneyline" ||
    family === "nfl_moneyline"
  ) {
    if (s === "draw" || s === "x") return "draw_side";
    if (s.includes("home") || s === "1" || s === "1x") return "home_side";
    if (s.includes("away") || s === "2" || s === "x2") return "away_side";
  }
  return "independent";
}


const FOOTBALL_POS_PRIORS: Readonly<
  Record<string, Readonly<Record<FootballPlayerPropStatKey, { readonly rate: number; readonly r: number }>>>
> = {
  FWD: {
    shots: { rate: 2.35, r: 4.5 },
    shots_on_target: { rate: 0.95, r: 3.5 },
    goal_or_assist: { rate: 0.52, r: 2.8 },
    fouls: { rate: 1.05, r: 4.0 },
    cards: { rate: 0.16, r: 2.0 },
  },
  MID: {
    shots: { rate: 1.35, r: 4.0 },
    shots_on_target: { rate: 0.48, r: 3.2 },
    goal_or_assist: { rate: 0.28, r: 2.6 },
    fouls: { rate: 1.35, r: 4.5 },
    cards: { rate: 0.24, r: 2.2 },
  },
  DEF: {
    shots: { rate: 0.55, r: 3.2 },
    shots_on_target: { rate: 0.18, r: 2.5 },
    goal_or_assist: { rate: 0.11, r: 2.2 },
    fouls: { rate: 1.15, r: 4.2 },
    cards: { rate: 0.22, r: 2.2 },
  },
  GK: {
    shots: { rate: 0.05, r: 2.0 },
    shots_on_target: { rate: 0.02, r: 2.0 },
    goal_or_assist: { rate: 0.01, r: 2.0 },
    fouls: { rate: 0.1, r: 2.0 },
    cards: { rate: 0.08, r: 2.0 },
  },
};

const FOOTBALL_PROP_STAT_LABELS: Readonly<Record<FootballPlayerPropStatKey, string>> = {
  shots: "Tiros",
  shots_on_target: "Tiros a puerta",
  goal_or_assist: "Gol o asistencia",
  fouls: "Faltas cometidas",
  cards: "Tarjeta recibida",
};

const NBA_PROP_STAT_LABELS: Readonly<Record<NbaPlayerPropStatKey, string>> = {
  PTS: "Puntos (PTS)",
  REB: "Rebotes (REB)",
  AST: "Asistencias (AST)",
  "3PM": "Triples (3PM)",
};

const NBA_PROP_DEFAULT_SD: Readonly<Record<NbaPlayerPropStatKey, number>> = {
  PTS: 6.4,
  REB: 2.9,
  AST: 2.4,
  "3PM": 1.35,
};

function mapPlayerPropItemToFootballStat(statLabel: string): FootballPlayerPropStatKey | null {
  const s = normalizeName(statLabel);
  if (s.includes("puerta") || s.includes("sot")) return "shots_on_target";
  if (s.includes("tiro") || s.includes("remate") || s.includes("shot")) return "shots";
  if (s.includes("anota") || s.includes("gol") || s.includes("asiste")) return "goal_or_assist";
  if (s.includes("falta") || s.includes("foul")) return "fouls";
  if (s.includes("tarjeta") || s.includes("amarilla") || s.includes("card")) return "cards";
  return null;
}

function mapPlayerPropItemToNbaStat(statLabel: string): NbaPlayerPropStatKey | null {
  const s = statLabel.trim().toUpperCase();
  if (s === "PTS" || s.includes("PUNTO") || s.includes("POINT")) return "PTS";
  if (s === "REB" || s.includes("REBOTE") || s.includes("REBOUND")) return "REB";
  if (s === "AST" || s.includes("ASIST") || s.includes("ASSIST")) return "AST";
  if (s === "3PM" || s.includes("TRIPLE") || s.includes("3P")) return "3PM";
  return null;
}


interface EmitPickArgs {
  readonly family: MarketFamilyId;
  readonly selectionKey: string;
  readonly label: string;
  readonly line: number | null;
  readonly direction: PickDirection;
  readonly axisOverride?: PickAxisKey;
  readonly p: number;
  readonly marketDecimal?: number | null;
  readonly companionMarketDecimals?: readonly number[] | null;
  readonly companionIndex?: number;
  readonly companionProbSum?: number;
  readonly marketBookLabel?: string | null;
  readonly marketCapturedAtUtc?: string | null;
  readonly bookQuotes?: readonly BookQuoteItem[];
  readonly isDerived: boolean;
  readonly contextBullets?: readonly string[];
  readonly precomputedWindows?: readonly EvidenceWindowStat[];
  readonly playerMeta?: PlayerPropMeta | null;
  readonly engineName?: string;
}

export function buildMatchPicksCatalog(
  game: PlatformGame,
  context: CatalogBuildContext = {},
): MatchPicksCatalog {
  const generatedAtUtc = context.nowIso ?? game.kickoffUtc;
  const markets = context.markets ?? game.markets ?? [];
  const v5 = context.v5 ?? null;
  const deVigPref = context.deVigPreference ?? "auto";
  const allowedFamilies = context.allowedFamilies;

  const hasForecast =
    game.hasForecast !== false &&
    Boolean(game.x12 || game.projection || game.picks.length > 0 || markets.length > 0);

  if (!hasForecast) {
    return {
      gameId: game.id,
      league: game.league,
      sport: game.sport,
      gameStatus: game.status,
      generatedAtUtc,
      engineVersion: "spacetime-v5.1",
      isRedactedForVisitor: false,
      totalPicks: 0,
      availableFamilies: [],
      familyCounts: {},
      picks: [],
    };
  }

  const freshnessNowIso = context.nowIso ?? null;
  const quoteIndex = buildQuoteIndex(game, markets, freshnessNowIso);
  const xgSignal = resolveXgEvidenceSignal(game, v5);
  const refereeSignal = resolveRefereeEvidenceSignal(game, v5);
  const matchLabel = `${game.home.shortName} vs ${game.away.shortName}`;
  const scoreUnit = sportScoringUnit(game.sport);
  const projectedScoreLabel =
    game.projection &&
    Number.isFinite(game.projection.home) &&
    Number.isFinite(game.projection.away) &&
    game.projection.home > 0 &&
    game.projection.away > 0
      ? `Proy. ${game.projection.home.toFixed(scoreUnit.decimals)} – ${game.projection.away.toFixed(scoreUnit.decimals)}`
      : xgSignal
        ? `Proy. ${xgSignal.homeXg.toFixed(scoreUnit.decimals)} – ${xgSignal.awayXg.toFixed(scoreUnit.decimals)}`
        : null;
  const defaultEngine =
    game.spacetime?.engineName ??
    (game.sport === "football"
      ? "PitchLab Spacetime v5.1"
      : game.sport === "basketball"
        ? "PitchLab Tensor NBA v5.1"
        : game.sport === "baseball"
          ? "PitchLab Kepler MLB v5.1"
          : game.sport === "ice-hockey"
            ? "PitchLab Curvature NHL v5.1"
            : "PitchLab Minkowski NFL v5.1");

  const picks: CatalogPickItem[] = [];
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  const claimedPrimaryIds = new Set<string>();

  const emit = (args: EmitPickArgs) => {
    if (allowedFamilies && !allowedFamilies.has(args.family)) return;
    const spec = MARKET_FAMILIES[args.family];
    const dedupKey = `${args.family}|${args.selectionKey.toLowerCase()}|${args.line ?? ""}`;
    if (seenKeys.has(dedupKey)) return;
    seenKeys.add(dedupKey);

    const primaryMatch = findMatchingPrimaryPick(
      game,
      args.family,
      args.selectionKey,
      args.line,
      claimedPrimaryIds,
    );
    if (primaryMatch) {
      claimedPrimaryIds.add(primaryMatch.id);
    }
    const usesArgMarketSource = args.marketDecimal !== undefined && args.marketDecimal !== null;
    const pricing = computePickPricing({
      calibratedProb: args.p,
      marketDecimal: usesArgMarketSource ? args.marketDecimal : (primaryMatch?.marketDecimal ?? null),
      companionMarketDecimals: args.companionMarketDecimals ?? null,
      companionIndex: args.companionIndex,
      companionProbSum: args.companionProbSum,
      marketBookLabel: usesArgMarketSource
        ? (args.marketBookLabel ?? null)
        : (primaryMatch?.marketBookLabel ?? null),
      marketCapturedAtUtc: usesArgMarketSource
        ? (args.marketCapturedAtUtc ?? null)
        : (primaryMatch?.marketCapturedAtUtc ?? null),
      nowIso: freshnessNowIso,
      deVigPreference: deVigPref,
    });

    const evidence = buildCatalogPickEvidence({
      game,
      family: args.family,
      selectionKey: args.selectionKey,
      line: args.line,
      direction: args.direction,
      v5,
      xgSignal,
      refereeSignal,
      homeHistory: context.homeHistory,
      awayHistory: context.awayHistory,
      precomputedWindows: args.precomputedWindows,
      contextBullets: args.contextBullets,
    });

    const settlement = gradeCatalogPick({
      game,
      family: args.family,
      selectionKey: args.selectionKey,
      line: args.line,
      f5Score: context.f5Score ?? null,
      finalStats: context.finalStats ?? null,
      playerKey: args.playerMeta?.playerSlug ?? args.playerMeta?.playerName ?? null,
      playerStatKey: args.playerMeta?.statKey ?? null,
    });

    const lineTag = args.line !== null ? `__${args.line}` : "";
    const fallbackId = `${game.id}__cat__${args.family}__${args.selectionKey}${lineTag}`;
    const id = primaryMatch?.id && !seenIds.has(primaryMatch.id) ? primaryMatch.id : fallbackId;
    seenIds.add(id);

    const safeQuotes = selectPermittedFreshBookQuotes(args.bookQuotes, freshnessNowIso);

    const draftItem: CatalogPickItem = {
      id,
      gameId: game.id,
      league: game.league,
      leagueLabel: game.leagueLabel,
      sport: game.sport,
      matchLabel,
      kickoffUtc: game.kickoffUtc,
      kickoffLocal: game.kickoffLocal,
      gameStatus: game.status,
      family: args.family,
      familyLabel: spec.label,
      category: spec.category,
      axis: args.axisOverride ?? spec.axis,
      selectionKey: args.selectionKey,
      label: args.label,
      line: args.line,
      direction: args.direction,
      pricing,
      evidence,
      settlement,
      engineName: args.engineName ?? defaultEngine,
      isPrimaryModelPick: Boolean(primaryMatch),
      isDerived: args.isDerived,
      conflictGroup: primaryMatch?.conflictGroup ?? conflictGroupFor(args.family, args.selectionKey, args.direction),
      ...(args.playerMeta ? { playerMeta: args.playerMeta } : {}),
      ...(safeQuotes.length > 0 ? { bookQuotes: safeQuotes } : {}),
      ...(primaryMatch?.isDailyOpenPromo ? { isDailyOpenPromo: true } : {}),
      ...(primaryMatch?.isTipsterWeeklyOpen ? { isTipsterWeeklyOpen: true } : {}),
    };

    const scored = scoreRecommendedCatalogPick(draftItem);
    picks.push({
      ...draftItem,
      recommendationScore: scored.score,
      recommendationTier: scored.tier,
      isRecommendedByModel: scored.isRecommended,
      convergenceCount: scored.convergenceCount,
      pickOfTheDayReason: scored.valueThresholdLabel,
      projectedScoreLabel,
    });
  };

  if (game.sport === "football") {
    emitFootballCatalog(game, context, quoteIndex, refereeSignal, emit);
  } else if (game.sport === "basketball") {
    emitNbaCatalog(game, context, quoteIndex, emit);
  } else if (game.sport === "baseball") {
    emitMlbCatalog(game, context, quoteIndex, emit);
  } else if (game.sport === "ice-hockey") {
    emitNhlCatalog(game, quoteIndex, emit);
  } else if (game.sport === "american-football") {
    emitNflCatalog(game, quoteIndex, emit);
  }

  const familyCounts: Partial<Record<MarketFamilyId, number>> = {};
  const availableFamilies: MarketFamilyId[] = [];
  for (const item of picks) {
    const prev = familyCounts[item.family] ?? 0;
    if (prev === 0) availableFamilies.push(item.family);
    familyCounts[item.family] = prev + 1;
  }

  return {
    gameId: game.id,
    league: game.league,
    sport: game.sport,
    gameStatus: game.status,
    generatedAtUtc,
    engineVersion: "spacetime-v5.1",
    isRedactedForVisitor: false,
    totalPicks: picks.length,
    availableFamilies,
    familyCounts,
    picks,
  };
}


function emitFootballCatalog(
  game: PlatformGame,
  context: CatalogBuildContext,
  quoteIndex: ReadonlyMap<string, IndexedQuote>,
  refereeSignal: RefereeEvidenceSignal | null,
  emit: (args: EmitPickArgs) => void,
): void {
  const home = game.home.shortName || game.home.name;
  const away = game.away.shortName || game.away.name;

  const rawX12 = game.x12;
  let lamHome = game.projection?.home ?? null;
  let lamAway = game.projection?.away ?? null;

  if ((lamHome === null || lamAway === null) && rawX12) {
    const [ph, , pa] = rawX12;
    const total = game.spacetime?.expectedTotal ?? 2.6;
    const diff = Math.log(Math.max(0.03, ph) / Math.max(0.03, pa)) * 0.48;
    lamHome = clamp(total / (1 + Math.exp(-diff)), 0.3, 4.2);
    lamAway = clamp(total - lamHome, 0.3, 4.2);
  }

  if (lamHome === null || lamAway === null) return;

  const matrix = buildCoherentFootballMatrix(lamHome, lamAway, rawX12);
  const pHome = clampProb(sumMatrix(matrix, (h, a) => h > a));
  const pDraw = clampProb(sumMatrix(matrix, (h, a) => h === a));
  const pAway = clampProb(sumMatrix(matrix, (h, a) => a > h));

  const qH = lookupQuote(quoteIndex, ["1x2|home", "h2h|home"]);
  const qD = lookupQuote(quoteIndex, ["1x2|draw", "h2h|draw"]);
  const qA = lookupQuote(quoteIndex, ["1x2|away", "h2h|away"]);
  const x12Comp = resolveSameBookCompanionDecimals([qH, qD, qA]);
  emit({
    family: "1x2",
    selectionKey: "home",
    label: `Gana ${home}`,
    line: null,
    direction: "home",
    p: pHome,
    marketDecimal: qH?.decimal ?? null,
    companionMarketDecimals: x12Comp,
    companionIndex: 0,
    marketBookLabel: qH?.bookLabel,
    marketCapturedAtUtc: qH?.capturedAtUtc,
    bookQuotes: qH?.bookQuotes,
    isDerived: false,
  });
  emit({
    family: "1x2",
    selectionKey: "draw",
    label: "Empate",
    line: null,
    direction: "draw",
    p: pDraw,
    marketDecimal: qD?.decimal ?? null,
    companionMarketDecimals: x12Comp,
    companionIndex: 1,
    marketBookLabel: qD?.bookLabel,
    marketCapturedAtUtc: qD?.capturedAtUtc,
    bookQuotes: qD?.bookQuotes,
    isDerived: false,
  });
  emit({
    family: "1x2",
    selectionKey: "away",
    label: `Gana ${away}`,
    line: null,
    direction: "away",
    p: pAway,
    marketDecimal: qA?.decimal ?? null,
    companionMarketDecimals: x12Comp,
    companionIndex: 2,
    marketBookLabel: qA?.bookLabel,
    marketCapturedAtUtc: qA?.capturedAtUtc,
    bookQuotes: qA?.bookQuotes,
    isDerived: false,
  });

  const q1X = lookupQuote(quoteIndex, ["double_chance|1x"]);
  const qX2 = lookupQuote(quoteIndex, ["double_chance|x2"]);
  const q12 = lookupQuote(quoteIndex, ["double_chance|12"]);
  const dcComp = resolveSameBookCompanionDecimals([q1X, qX2, q12]);
  emit({
    family: "double_chance",
    selectionKey: "1x",
    label: `${home} o Empate (1X)`,
    line: null,
    direction: "home",
    p: clampProb(pHome + pDraw),
    marketDecimal: q1X?.decimal ?? null,
    companionMarketDecimals: dcComp,
    companionIndex: 0,
    companionProbSum: 2,
    marketBookLabel: q1X?.bookLabel,
    marketCapturedAtUtc: q1X?.capturedAtUtc,
    bookQuotes: q1X?.bookQuotes,
    isDerived: !q1X,
  });
  emit({
    family: "double_chance",
    selectionKey: "x2",
    label: `${away} o Empate (X2)`,
    line: null,
    direction: "away",
    p: clampProb(pAway + pDraw),
    marketDecimal: qX2?.decimal ?? null,
    companionMarketDecimals: dcComp,
    companionIndex: 1,
    companionProbSum: 2,
    marketBookLabel: qX2?.bookLabel,
    marketCapturedAtUtc: qX2?.capturedAtUtc,
    bookQuotes: qX2?.bookQuotes,
    isDerived: !qX2,
  });
  emit({
    family: "double_chance",
    selectionKey: "12",
    label: `${home} o ${away} (Sin empate)`,
    line: null,
    direction: "combo",
    p: clampProb(pHome + pAway),
    marketDecimal: q12?.decimal ?? null,
    companionMarketDecimals: dcComp,
    companionIndex: 2,
    companionProbSum: 2,
    marketBookLabel: q12?.bookLabel,
    marketCapturedAtUtc: q12?.capturedAtUtc,
    bookQuotes: q12?.bookQuotes,
    isDerived: !q12,
  });

  const dnbDenom = Math.max(1e-6, pHome + pAway);
  const qDnbH = lookupQuote(quoteIndex, ["dnb|home", "draw_no_bet|home"]);
  const qDnbA = lookupQuote(quoteIndex, ["dnb|away", "draw_no_bet|away"]);
  const dnbComp = resolveSameBookCompanionDecimals([qDnbH, qDnbA]);
  emit({
    family: "dnb",
    selectionKey: "home",
    label: `${home} · Empate no acción (DNB)`,
    line: 0,
    direction: "home",
    p: clampProb(pHome / dnbDenom),
    marketDecimal: qDnbH?.decimal ?? null,
    companionMarketDecimals: dnbComp,
    companionIndex: 0,
    marketBookLabel: qDnbH?.bookLabel,
    marketCapturedAtUtc: qDnbH?.capturedAtUtc,
    isDerived: !qDnbH,
    contextBullets: [`Empate devuelve importe (P empate ${(pDraw * 100).toFixed(1)} %)`],
  });
  emit({
    family: "dnb",
    selectionKey: "away",
    label: `${away} · Empate no acción (DNB)`,
    line: 0,
    direction: "away",
    p: clampProb(pAway / dnbDenom),
    marketDecimal: qDnbA?.decimal ?? null,
    companionMarketDecimals: dnbComp,
    companionIndex: 1,
    marketBookLabel: qDnbA?.bookLabel,
    marketCapturedAtUtc: qDnbA?.capturedAtUtc,
    isDerived: !qDnbA,
    contextBullets: [`Empate devuelve importe (P empate ${(pDraw * 100).toFixed(1)} %)`],
  });

  const pBttsYes = clampProb(
    lookupPublishedProb(quoteIndex, ["btts|yes"]) ?? sumMatrix(matrix, (h, a) => h > 0 && a > 0),
  );
  const qBttsY = lookupQuote(quoteIndex, ["btts|yes"]);
  const qBttsN = lookupQuote(quoteIndex, ["btts|no"]);
  const bttsComp = resolveSameBookCompanionDecimals([qBttsY, qBttsN]);
  emit({
    family: "btts",
    selectionKey: "yes",
    label: "Ambos anotan: Sí",
    line: null,
    direction: "yes",
    p: pBttsYes,
    marketDecimal: qBttsY?.decimal ?? null,
    companionMarketDecimals: bttsComp,
    companionIndex: 0,
    marketBookLabel: qBttsY?.bookLabel,
    marketCapturedAtUtc: qBttsY?.capturedAtUtc,
    bookQuotes: qBttsY?.bookQuotes,
    isDerived: !qBttsY,
  });
  emit({
    family: "btts",
    selectionKey: "no",
    label: "Ambos anotan: No",
    line: null,
    direction: "no",
    p: clampProb(1 - pBttsYes),
    marketDecimal: qBttsN?.decimal ?? null,
    companionMarketDecimals: bttsComp,
    companionIndex: 1,
    marketBookLabel: qBttsN?.bookLabel,
    marketCapturedAtUtc: qBttsN?.capturedAtUtc,
    bookQuotes: qBttsN?.bookQuotes,
    isDerived: !qBttsN,
  });

  for (const line of [0.5, 1.5, 2.5, 3.5, 4.5] as const) {
    const lineKey = String(line).replace(".", "_");
    const pubOver = lookupPublishedProb(quoteIndex, [
      `totals|over_${line}|${line}`,
      `totals_${lineKey}|over|${line}`,
      `totals|over|${line}`,
    ]);
    const pOver = clampProb(pubOver ?? sumMatrix(matrix, (h, a) => h + a > line));
    const qO = lookupQuote(quoteIndex, [
      `totals|over_${line}|${line}`,
      `totals_${lineKey}|over|${line}`,
      `totals|over|${line}`,
    ]);
    const qU = lookupQuote(quoteIndex, [
      `totals|under_${line}|${line}`,
      `totals_${lineKey}|under|${line}`,
      `totals|under|${line}`,
    ]);
    const comp = resolveSameBookCompanionDecimals([qO, qU]);
    emit({
      family: "totals",
      selectionKey: `over_${line}`,
      label: `Más de ${line} goles`,
      line,
      direction: "over",
      p: pOver,
      marketDecimal: qO?.decimal ?? null,
      companionMarketDecimals: comp,
      companionIndex: 0,
      marketBookLabel: qO?.bookLabel,
      marketCapturedAtUtc: qO?.capturedAtUtc,
      bookQuotes: qO?.bookQuotes,
      isDerived: pubOver === null,
    });
    emit({
      family: "totals",
      selectionKey: `under_${line}`,
      label: `Menos de ${line} goles`,
      line,
      direction: "under",
      p: clampProb(1 - pOver),
      marketDecimal: qU?.decimal ?? null,
      companionMarketDecimals: comp,
      companionIndex: 1,
      marketBookLabel: qU?.bookLabel,
      marketCapturedAtUtc: qU?.capturedAtUtc,
      bookQuotes: qU?.bookQuotes,
      isDerived: pubOver === null,
    });
  }

  for (const side of [
    { key: "home" as const, name: home, axis: "team_goals_home" as const, lam: lamHome },
    { key: "away" as const, name: away, axis: "team_goals_away" as const, lam: lamAway },
  ]) {
    for (const line of [0.5, 1.5, 2.5] as const) {
      const pOver = clampProb(
        sumMatrix(matrix, (h, a) => (side.key === "home" ? h : a) > line),
      );
      if (pOver < 0.06 || pOver > 0.96) continue;
      const qO = lookupQuote(quoteIndex, [
        `team_totals|${side.key}_over|${line}`,
        `team_totals|${side.key}_over_${line}|${line}`,
        `team_goals_${side.key}|${side.key}_over_${line}|${line}`,
        `team_goals_${side.key}|${side.key}_over|${line}`,
      ]);
      const qU = lookupQuote(quoteIndex, [
        `team_totals|${side.key}_under|${line}`,
        `team_totals|${side.key}_under_${line}|${line}`,
        `team_goals_${side.key}|${side.key}_under_${line}|${line}`,
        `team_goals_${side.key}|${side.key}_under|${line}`,
      ]);
      const comp = resolveSameBookCompanionDecimals([qO, qU]);
      emit({
        family: "team_totals",
        selectionKey: `${side.key}_over_${line}`,
        label: `${side.name} · Más de ${line} goles`,
        line,
        direction: "over",
        axisOverride: side.axis,
        p: pOver,
        marketDecimal: qO?.decimal ?? null,
        companionMarketDecimals: comp,
        companionIndex: 0,
        marketBookLabel: qO?.bookLabel,
        marketCapturedAtUtc: qO?.capturedAtUtc,
        isDerived: !qO,
        contextBullets: [`xG individual proyectado ${side.name}: ${side.lam.toFixed(2)}`],
      });
      emit({
        family: "team_totals",
        selectionKey: `${side.key}_under_${line}`,
        label: `${side.name} · Menos de ${line} goles`,
        line,
        direction: "under",
        axisOverride: side.axis,
        p: clampProb(1 - pOver),
        marketDecimal: qU?.decimal ?? null,
        companionMarketDecimals: comp,
        companionIndex: 1,
        marketBookLabel: qU?.bookLabel,
        marketCapturedAtUtc: qU?.capturedAtUtc,
        isDerived: !qU,
        contextBullets: [`xG individual proyectado ${side.name}: ${side.lam.toFixed(2)}`],
      });
    }
  }

  const htMatrix = buildCoherentFootballMatrix(lamHome * 0.44, lamAway * 0.44, null, -0.05, 6);
  const pHtH = clampProb(
    lookupPublishedProb(quoteIndex, ["ht_1x2|ht_home", "ht_1x2|home"]) ??
      sumMatrix(htMatrix, (h, a) => h > a),
  );
  const pHtD = clampProb(
    lookupPublishedProb(quoteIndex, ["ht_1x2|ht_draw", "ht_1x2|draw"]) ??
      sumMatrix(htMatrix, (h, a) => h === a),
  );
  const pHtA = clampProb(
    lookupPublishedProb(quoteIndex, ["ht_1x2|ht_away", "ht_1x2|away"]) ??
      sumMatrix(htMatrix, (h, a) => a > h),
  );
  const htSum = pHtH + pHtD + pHtA;
  emit({
    family: "half_time_result",
    selectionKey: "ht_home",
    label: `1T · Gana ${home}`,
    line: null,
    direction: "home",
    p: clampProb(pHtH / htSum),
    isDerived: true,
    contextBullets: [`xG 1.er tiempo: ${(lamHome * 0.44).toFixed(2)} – ${(lamAway * 0.44).toFixed(2)}`],
  });
  emit({
    family: "half_time_result",
    selectionKey: "ht_draw",
    label: "1T · Empate",
    line: null,
    direction: "draw",
    p: clampProb(pHtD / htSum),
    isDerived: true,
  });
  emit({
    family: "half_time_result",
    selectionKey: "ht_away",
    label: `1T · Gana ${away}`,
    line: null,
    direction: "away",
    p: clampProb(pHtA / htSum),
    isDerived: true,
  });

  const shMatrix = buildCoherentFootballMatrix(lamHome * 0.56, lamAway * 0.56, null, -0.06, 6);
  const p2hH = clampProb(
    lookupPublishedProb(quoteIndex, ["2h_1x2|home", "2h_1x2|2h_home"]) ??
      sumMatrix(shMatrix, (h, a) => h > a),
  );
  const p2hD = clampProb(
    lookupPublishedProb(quoteIndex, ["2h_1x2|draw", "2h_1x2|2h_draw"]) ??
      sumMatrix(shMatrix, (h, a) => h === a),
  );
  const p2hA = clampProb(
    lookupPublishedProb(quoteIndex, ["2h_1x2|away", "2h_1x2|2h_away"]) ??
      sumMatrix(shMatrix, (h, a) => a > h),
  );
  const shSum = p2hH + p2hD + p2hA;
  emit({
    family: "second_half_result",
    selectionKey: "2h_home",
    label: `2T · Gana ${home}`,
    line: null,
    direction: "home",
    p: clampProb(p2hH / shSum),
    isDerived: true,
    contextBullets: [`xG 2.º tiempo: ${(lamHome * 0.56).toFixed(2)} – ${(lamAway * 0.56).toFixed(2)}`],
  });
  emit({
    family: "second_half_result",
    selectionKey: "2h_draw",
    label: "2T · Empate",
    line: null,
    direction: "draw",
    p: clampProb(p2hD / shSum),
    isDerived: true,
  });
  emit({
    family: "second_half_result",
    selectionKey: "2h_away",
    label: `2T · Gana ${away}`,
    line: null,
    direction: "away",
    p: clampProb(p2hA / shSum),
    isDerived: true,
  });

  const comboOverSpecs: ReadonlyArray<{
    readonly key: string;
    readonly label: string;
    readonly line: number;
    readonly pred: (h: number, a: number) => boolean;
  }> = [
    { key: "home_over_1.5", label: `${home} gana y Más de 1.5 goles`, line: 1.5, pred: (h, a) => h > a && h + a > 1.5 },
    { key: "home_over_2.5", label: `${home} gana y Más de 2.5 goles`, line: 2.5, pred: (h, a) => h > a && h + a > 2.5 },
    { key: "home_under_3.5", label: `${home} gana y Menos de 3.5 goles`, line: 3.5, pred: (h, a) => h > a && h + a < 3.5 },
    { key: "away_over_1.5", label: `${away} gana y Más de 1.5 goles`, line: 1.5, pred: (h, a) => a > h && h + a > 1.5 },
    { key: "away_over_2.5", label: `${away} gana y Más de 2.5 goles`, line: 2.5, pred: (h, a) => a > h && h + a > 2.5 },
    { key: "away_under_3.5", label: `${away} gana y Menos de 3.5 goles`, line: 3.5, pred: (h, a) => a > h && h + a < 3.5 },
    { key: "1x_over_1.5", label: `${home} o Empate (1X) y Más de 1.5 goles`, line: 1.5, pred: (h, a) => h >= a && h + a > 1.5 },
    { key: "x2_over_1.5", label: `${away} o Empate (X2) y Más de 1.5 goles`, line: 1.5, pred: (h, a) => a >= h && h + a > 1.5 },
    { key: "1x_under_3.5", label: `${home} o Empate (1X) y Menos de 3.5 goles`, line: 3.5, pred: (h, a) => h >= a && h + a < 3.5 },
    { key: "x2_under_3.5", label: `${away} o Empate (X2) y Menos de 3.5 goles`, line: 3.5, pred: (h, a) => a >= h && h + a < 3.5 },
  ];
  for (const spec of comboOverSpecs) {
    const p = sumMatrix(matrix, spec.pred);
    if (p < 0.05) continue;
    emit({
      family: "combo_1x2_over",
      selectionKey: spec.key,
      label: spec.label,
      line: spec.line,
      direction: "combo",
      p: clampProb(p),
      isDerived: true,
    });
  }

  const comboBttsSpecs: ReadonlyArray<{
    readonly key: string;
    readonly label: string;
    readonly pred: (h: number, a: number) => boolean;
  }> = [
    { key: "home_btts_yes", label: `${home} gana y Ambos anotan: Sí`, pred: (h, a) => h > a && h > 0 && a > 0 },
    { key: "away_btts_yes", label: `${away} gana y Ambos anotan: Sí`, pred: (h, a) => a > h && h > 0 && a > 0 },
    { key: "draw_btts_yes", label: "Empate y Ambos anotan: Sí", pred: (h, a) => h === a && h > 0 },
    { key: "home_btts_no", label: `${home} gana y Ambos anotan: No`, pred: (h, a) => h > a && a === 0 },
    { key: "away_btts_no", label: `${away} gana y Ambos anotan: No`, pred: (h, a) => a > h && h === 0 },
  ];
  for (const spec of comboBttsSpecs) {
    const p = sumMatrix(matrix, spec.pred);
    if (p < 0.05) continue;
    emit({
      family: "combo_1x2_btts",
      selectionKey: spec.key,
      label: spec.label,
      line: null,
      direction: "combo",
      p: clampProb(p),
      isDerived: true,
    });
  }

  const ahLines = [-2.5, -2.0, -1.5, -1.0, -0.5, 0.5, 1.0, 1.5, 2.0, 2.5] as const;
  for (const homeLine of ahLines) {
    const awayLine = -homeLine;
    const pWinH = sumMatrix(matrix, (h, a) => h + homeLine > a);
    const pPush = sumMatrix(matrix, (h, a) => Math.abs(h + homeLine - a) < 1e-9);
    const pWinA = sumMatrix(matrix, (h, a) => h + homeLine < a);
    const active = Math.max(1e-6, pWinH + pWinA);
    const pCondH = pWinH / active;
    const pCondA = pWinA / active;
    if (pCondH < 0.06 || pCondH > 0.94) continue;

    const qAhH = lookupQuote(quoteIndex, [
      `asian_handicap|home_${formatSignedLine(homeLine)}|${homeLine}`,
      `asian_handicap|home|${homeLine}`,
      `spread|home_${formatSignedLine(homeLine)}|${homeLine}`,
      `spread|home|${homeLine}`,
      `spreads|home|${homeLine}`,
      `handicap|home|${homeLine}`,
    ]);
    const qAhA = lookupQuote(quoteIndex, [
      `asian_handicap|away_${formatSignedLine(awayLine)}|${awayLine}`,
      `asian_handicap|away|${awayLine}`,
      `spread|away_${formatSignedLine(awayLine)}|${awayLine}`,
      `spread|away|${awayLine}`,
      `spreads|away|${awayLine}`,
      `handicap|away|${awayLine}`,
    ]);
    const comp = resolveSameBookCompanionDecimals([qAhH, qAhA]);
    const pushNote = pPush > 0.005 ? [`Push si diferencia exacta (${(pPush * 100).toFixed(1)} %)`] : undefined;

    emit({
      family: "asian_handicap",
      selectionKey: `home_${formatSignedLine(homeLine)}`,
      label: `${home} (${formatSignedLine(homeLine)}) AH`,
      line: homeLine,
      direction: "home",
      p: clampProb(pCondH),
      marketDecimal: qAhH?.decimal ?? null,
      companionMarketDecimals: comp,
      companionIndex: 0,
      marketBookLabel: qAhH?.bookLabel,
      marketCapturedAtUtc: qAhH?.capturedAtUtc,
      isDerived: !qAhH,
      contextBullets: pushNote,
    });
    emit({
      family: "asian_handicap",
      selectionKey: `away_${formatSignedLine(awayLine)}`,
      label: `${away} (${formatSignedLine(awayLine)}) AH`,
      line: awayLine,
      direction: "away",
      p: clampProb(pCondA),
      marketDecimal: qAhA?.decimal ?? null,
      companionMarketDecimals: comp,
      companionIndex: 1,
      marketBookLabel: qAhA?.bookLabel,
      marketCapturedAtUtc: qAhA?.capturedAtUtc,
      isDerived: !qAhA,
      contextBullets: pushNote,
    });
  }

  const pCsHome = clampProb(sumMatrix(matrix, (_h, a) => a === 0));
  const pCsAway = clampProb(sumMatrix(matrix, (h) => h === 0));
  emit({
    family: "clean_sheet",
    selectionKey: "home_yes",
    label: `${home} · Portería a cero: Sí`,
    line: null,
    direction: "yes",
    axisOverride: "clean_sheet_home",
    p: pCsHome,
    isDerived: true,
    contextBullets: [`xG permitido a ${away}: ${lamAway.toFixed(2)}`],
  });
  emit({
    family: "clean_sheet",
    selectionKey: "home_no",
    label: `${home} · Portería a cero: No`,
    line: null,
    direction: "no",
    axisOverride: "clean_sheet_home",
    p: clampProb(1 - pCsHome),
    isDerived: true,
  });
  emit({
    family: "clean_sheet",
    selectionKey: "away_yes",
    label: `${away} · Portería a cero: Sí`,
    line: null,
    direction: "yes",
    axisOverride: "clean_sheet_away",
    p: pCsAway,
    isDerived: true,
    contextBullets: [`xG permitido a ${home}: ${lamHome.toFixed(2)}`],
  });
  emit({
    family: "clean_sheet",
    selectionKey: "away_no",
    label: `${away} · Portería a cero: No`,
    line: null,
    direction: "no",
    axisOverride: "clean_sheet_away",
    p: clampProb(1 - pCsAway),
    isDerived: true,
  });

  const pWtnHome = sumMatrix(matrix, (h, a) => h > 0 && a === 0);
  const pWtnAway = sumMatrix(matrix, (h, a) => a > 0 && h === 0);
  if (pWtnHome >= 0.06) {
    emit({
      family: "win_to_nil",
      selectionKey: "home",
      label: `${home} gana sin recibir gol`,
      line: null,
      direction: "home",
      p: clampProb(pWtnHome),
      isDerived: true,
    });
  }
  if (pWtnAway >= 0.06) {
    emit({
      family: "win_to_nil",
      selectionKey: "away",
      label: `${away} gana sin recibir gol`,
      line: null,
      direction: "away",
      p: clampProb(pWtnAway),
      isDerived: true,
    });
  }

  const v5Micro = context.v5?.microCounts ?? null;
  const sup = lamHome - lamAway;
  const tempo = lamHome + lamAway - 2.6;
  const tightness = Math.exp(-Math.abs(sup)) - 0.5;
  const v5RefAlreadyBaked = Boolean(v5Micro?.refereeProfile);

  const cornersHomeMean =
    v5Micro?.corners?.home ??
    game.counts?.corners?.home ??
    round1(clamp(5.15 + 0.95 * sup + 0.35 * tempo, 2.4, 8.8));
  const cornersAwayMean =
    v5Micro?.corners?.away ??
    game.counts?.corners?.away ??
    round1(clamp(4.35 - 0.85 * sup + 0.3 * tempo, 2.0, 8.2));
  const cornersTotalMean = round1(cornersHomeMean + cornersAwayMean);
  const cornerCenter = roundToHalf(cornersTotalMean);
  const cornerLines = Array.from(new Set([cornerCenter - 1, cornerCenter, cornerCenter + 1])).filter(
    (l) => l >= 6.5 && l <= 13.5,
  );
  for (const line of cornerLines) {
    const nb = negBinomOverUnder(cornersTotalMean, 8.5, line);
    const qO = lookupQuote(quoteIndex, [
      `corners_total|over|${line}`,
      `corners_total|over_${line}|${line}`,
    ]);
    const qU = lookupQuote(quoteIndex, [
      `corners_total|under|${line}`,
      `corners_total|under_${line}|${line}`,
    ]);
    const comp = resolveSameBookCompanionDecimals([qO, qU]);
    const ctx = [
      `Ritmo proyectado ${cornersTotalMean.toFixed(1)} córners (${cornersHomeMean.toFixed(1)} + ${cornersAwayMean.toFixed(1)})`,
    ];
    emit({
      family: "corners_total",
      selectionKey: `over_${line}`,
      label: `Más de ${line} córners`,
      line,
      direction: "over",
      p: nb.pOver,
      marketDecimal: qO?.decimal ?? null,
      companionMarketDecimals: comp,
      companionIndex: 0,
      marketBookLabel: qO?.bookLabel,
      marketCapturedAtUtc: qO?.capturedAtUtc,
      isDerived: !v5Micro?.corners && !game.counts?.corners,
      contextBullets: ctx,
    });
    emit({
      family: "corners_total",
      selectionKey: `under_${line}`,
      label: `Menos de ${line} córners`,
      line,
      direction: "under",
      p: nb.pUnder,
      marketDecimal: qU?.decimal ?? null,
      companionMarketDecimals: comp,
      companionIndex: 1,
      marketBookLabel: qU?.bookLabel,
      marketCapturedAtUtc: qU?.capturedAtUtc,
      isDerived: !v5Micro?.corners && !game.counts?.corners,
      contextBullets: ctx,
    });
  }

  for (const side of [
    { key: "home" as const, name: home, mean: cornersHomeMean, axis: "corners_home" as const },
    { key: "away" as const, name: away, mean: cornersAwayMean, axis: "corners_away" as const },
  ]) {
    const cLine = clamp(roundToHalf(side.mean), 2.5, 8.5);
    const nb = negBinomOverUnder(side.mean, 6.2, cLine);
    const ctx = [`Media proyectada ${side.name}: ${side.mean.toFixed(1)} córners`];
    emit({
      family: "corners_team",
      selectionKey: `${side.key}_over_${cLine}`,
      label: `${side.name} · Más de ${cLine} córners`,
      line: cLine,
      direction: "over",
      axisOverride: side.axis,
      p: nb.pOver,
      isDerived: true,
      contextBullets: ctx,
    });
    emit({
      family: "corners_team",
      selectionKey: `${side.key}_under_${cLine}`,
      label: `${side.name} · Menos de ${cLine} córners`,
      line: cLine,
      direction: "under",
      axisOverride: side.axis,
      p: nb.pUnder,
      isDerived: true,
      contextBullets: ctx,
    });
  }

  const shotsHomeMean =
    v5Micro?.shots?.home ?? round1(clamp(12.6 + 2.8 * sup + 1.4 * tempo, 6.5, 22.0));
  const shotsAwayMean =
    v5Micro?.shots?.away ?? round1(clamp(10.4 - 2.5 * sup + 1.2 * tempo, 5.5, 20.0));
  const shotsTotalMean = round1(shotsHomeMean + shotsAwayMean);
  const shotsCenter = roundToHalf(shotsTotalMean);
  for (const line of [shotsCenter - 2, shotsCenter, shotsCenter + 2].filter((l) => l >= 14.5)) {
    const nb = negBinomOverUnder(shotsTotalMean, 10.0, line);
    const ctx = [
      `Proyección ${shotsTotalMean.toFixed(1)} remates (${shotsHomeMean.toFixed(1)} + ${shotsAwayMean.toFixed(1)})`,
    ];
    emit({
      family: "shots_total",
      selectionKey: `over_${line}`,
      label: `Más de ${line} remates totales`,
      line,
      direction: "over",
      p: nb.pOver,
      isDerived: !v5Micro?.shots,
      contextBullets: ctx,
    });
    emit({
      family: "shots_total",
      selectionKey: `under_${line}`,
      label: `Menos de ${line} remates totales`,
      line,
      direction: "under",
      p: nb.pUnder,
      isDerived: !v5Micro?.shots,
      contextBullets: ctx,
    });
  }

  const sotHomeMean =
    v5Micro?.shotsOnTarget?.home ?? round1(clamp(4.3 + 1.15 * sup + 0.65 * tempo, 2.0, 8.5));
  const sotAwayMean =
    v5Micro?.shotsOnTarget?.away ?? round1(clamp(3.5 - 1.0 * sup + 0.55 * tempo, 1.6, 7.5));
  const sotTotalMean = round1(sotHomeMean + sotAwayMean);
  const sotCenter = roundToHalf(sotTotalMean);
  for (const line of [sotCenter - 1, sotCenter, sotCenter + 1].filter((l) => l >= 4.5)) {
    const nb = negBinomOverUnder(sotTotalMean, 6.5, line);
    const ctx = [
      `Proyección ${sotTotalMean.toFixed(1)} remates a puerta (${sotHomeMean.toFixed(1)} + ${sotAwayMean.toFixed(1)})`,
    ];
    emit({
      family: "shots_on_target",
      selectionKey: `over_${line}`,
      label: `Más de ${line} remates a puerta`,
      line,
      direction: "over",
      p: nb.pOver,
      isDerived: !v5Micro?.shotsOnTarget,
      contextBullets: ctx,
    });
    emit({
      family: "shots_on_target",
      selectionKey: `under_${line}`,
      label: `Menos de ${line} remates a puerta`,
      line,
      direction: "under",
      p: nb.pUnder,
      isDerived: !v5Micro?.shotsOnTarget,
      contextBullets: ctx,
    });
  }

  const foulsMult = !v5RefAlreadyBaked && refereeSignal ? refereeSignal.foulsMultiplier : 1.0;
  const baseFoulsTotal =
    v5Micro?.fouls?.total ??
    game.counts?.fouls?.total ??
    round1(clamp(23.8 + 2.4 * tightness, 18.0, 31.0));
  const foulsTotalMean = round1(baseFoulsTotal * foulsMult);
  const foulsCenter = roundToHalf(foulsTotalMean);
  for (const line of [foulsCenter - 2, foulsCenter, foulsCenter + 2].filter((l) => l >= 16.5)) {
    const nb = negBinomOverUnder(foulsTotalMean, 12.0, line);
    const qO = lookupQuote(quoteIndex, [
      `fouls_total|over|${line}`,
      `fouls_total|over_${line}|${line}`,
    ]);
    const qU = lookupQuote(quoteIndex, [
      `fouls_total|under|${line}`,
      `fouls_total|under_${line}|${line}`,
    ]);
    const comp = resolveSameBookCompanionDecimals([qO, qU]);
    const ctx = [`Proyección ${foulsTotalMean.toFixed(1)} faltas combinadas`];
    emit({
      family: "fouls_total",
      selectionKey: `over_${line}`,
      label: `Más de ${line} faltas`,
      line,
      direction: "over",
      p: nb.pOver,
      marketDecimal: qO?.decimal ?? null,
      companionMarketDecimals: comp,
      companionIndex: 0,
      marketBookLabel: qO?.bookLabel,
      marketCapturedAtUtc: qO?.capturedAtUtc,
      isDerived: !v5Micro?.fouls && !game.counts?.fouls,
      contextBullets: ctx,
    });
    emit({
      family: "fouls_total",
      selectionKey: `under_${line}`,
      label: `Menos de ${line} faltas`,
      line,
      direction: "under",
      p: nb.pUnder,
      marketDecimal: qU?.decimal ?? null,
      companionMarketDecimals: comp,
      companionIndex: 1,
      marketBookLabel: qU?.bookLabel,
      marketCapturedAtUtc: qU?.capturedAtUtc,
      isDerived: !v5Micro?.fouls && !game.counts?.fouls,
      contextBullets: ctx,
    });
  }

  const cardsMult = !v5RefAlreadyBaked && refereeSignal ? refereeSignal.cardsMultiplier : 1.0;
  const baseCardsTotal =
    v5Micro?.yellowCards?.total ??
    game.counts?.yellow?.total ??
    round1(clamp(4.15 + 0.72 * tightness, 2.6, 6.4));
  const cardsTotalMean = round2(clamp(baseCardsTotal * cardsMult, 1.8, 8.2));
  const cardsCenter = clamp(roundToHalf(cardsTotalMean), 2.5, 6.5);
  for (const line of [cardsCenter - 1, cardsCenter, cardsCenter + 1].filter((l) => l >= 1.5 && l <= 7.5)) {
    const nb = negBinomOverUnder(cardsTotalMean, 6.0, line);
    const qO = lookupQuote(quoteIndex, [
      `yellow_total|over|${line}`,
      `yellow_total|over_${line}|${line}`,
      `cards_total|over|${line}`,
      `cards_total|over_${line}|${line}`,
    ]);
    const qU = lookupQuote(quoteIndex, [
      `yellow_total|under|${line}`,
      `yellow_total|under_${line}|${line}`,
      `cards_total|under|${line}`,
      `cards_total|under_${line}|${line}`,
    ]);
    const comp = resolveSameBookCompanionDecimals([qO, qU]);
    const ctx = [
      `Media ajustada ${cardsTotalMean.toFixed(2)} tarjetas${refereeSignal ? ` (factor arbitral ×${refereeSignal.cardsMultiplier.toFixed(2)})` : ""}`,
    ];
    emit({
      family: "cards_total",
      selectionKey: `over_${line}`,
      label: `Más de ${line} tarjetas`,
      line,
      direction: "over",
      p: nb.pOver,
      marketDecimal: qO?.decimal ?? null,
      companionMarketDecimals: comp,
      companionIndex: 0,
      marketBookLabel: qO?.bookLabel,
      marketCapturedAtUtc: qO?.capturedAtUtc,
      isDerived: !v5Micro?.yellowCards && !game.counts?.yellow,
      contextBullets: ctx,
    });
    emit({
      family: "cards_total",
      selectionKey: `under_${line}`,
      label: `Menos de ${line} tarjetas`,
      line,
      direction: "under",
      p: nb.pUnder,
      marketDecimal: qU?.decimal ?? null,
      companionMarketDecimals: comp,
      companionIndex: 1,
      marketBookLabel: qU?.bookLabel,
      marketCapturedAtUtc: qU?.capturedAtUtc,
      isDerived: !v5Micro?.yellowCards && !game.counts?.yellow,
      contextBullets: ctx,
    });
  }

  emitFootballPlayerProps(game, context, lamHome, lamAway, refereeSignal, emit);
}

function emitFootballPlayerProps(
  game: PlatformGame,
  context: CatalogBuildContext,
  lamHome: number,
  lamAway: number,
  refereeSignal: RefereeEvidenceSignal | null,
  emit: (args: EmitPickArgs) => void,
): void {
  const candidates: FootballPlayerPropCandidateInput[] = [...(context.footballPlayers ?? [])];
  const explicitKeys = new Set(candidates.map((c) => normalizeName(c.playerName)));

  const fromItemsByPlayer = new Map<
    string,
    {
      playerName: string;
      teamSide: "home" | "away";
      teamName: string;
      teamSlug: string;
      position: string;
      avgMinutes: number | null;
      matchLogs: Array<{
        minutesPlayed: number;
        shots?: number;
        shotsOnTarget?: number;
        goals?: number;
        foulsCommitted?: number;
        yellowCards?: number;
      }>;
      marketQuotes: Partial<
        Record<
          FootballPlayerPropStatKey,
          { readonly line: number; readonly overDecimal: number | null; readonly underDecimal: number | null }
        >
      >;
    }
  >();

  for (const pp of context.playerProps ?? []) {
    if (pp.gameId !== game.id) continue;
    const statKey = mapPlayerPropItemToFootballStat(pp.statLabel);
    if (!statKey) continue;
    const pKey = normalizeName(pp.player);
    if (explicitKeys.has(pKey)) continue;

    const rawCarrier = pp as typeof pp & {
      readonly minutesPlayed?: readonly number[];
      readonly avgMinutes?: number | null;
      readonly minutesPerGame?: number | null;
    };
    const realMinutesLog = Array.isArray(rawCarrier.minutesPlayed)
      ? rawCarrier.minutesPlayed
      : null;
    if (!realMinutesLog || realMinutesLog.length === 0) continue;
    const realAvgMinutes =
      typeof rawCarrier.avgMinutes === "number" && Number.isFinite(rawCarrier.avgMinutes)
        ? rawCarrier.avgMinutes
        : typeof rawCarrier.minutesPerGame === "number" &&
            Number.isFinite(rawCarrier.minutesPerGame)
          ? rawCarrier.minutesPerGame
          : null;

    const isHome =
      pp.teamSlug === game.home.slug || normalizeName(pp.teamName) === normalizeName(game.home.name);

    let bucket = fromItemsByPlayer.get(pKey);
    if (!bucket) {
      bucket = {
        playerName: pp.player,
        teamSide: isHome ? "home" : "away",
        teamName: pp.teamName,
        teamSlug: pp.teamSlug,
        position: pp.position,
        avgMinutes: realAvgMinutes,
        matchLogs: [],
        marketQuotes: {},
      };
      fromItemsByPlayer.set(pKey, bucket);
    }

    for (let i = 0; i < pp.last10.length; i += 1) {
      const val = pp.last10[i]!;
      const rawMins = realMinutesLog[i];
      const realMins = typeof rawMins === "number" && Number.isFinite(rawMins) ? rawMins : Number.NaN;
      const log = bucket.matchLogs[i] ?? { minutesPlayed: realMins };
      if (statKey === "shots") log.shots = val;
      else if (statKey === "shots_on_target") log.shotsOnTarget = val;
      else if (statKey === "goal_or_assist") log.goals = val;
      else if (statKey === "fouls") log.foulsCommitted = val;
      else if (statKey === "cards") log.yellowCards = val;
      bucket.matchLogs[i] = log;
    }

    bucket.marketQuotes[statKey] = {
      line: pp.baseLine,
      overDecimal: null,
      underDecimal: null,
    };
  }

  for (const bucket of fromItemsByPlayer.values()) {
    candidates.push({
      playerName: bucket.playerName,
      teamSide: bucket.teamSide,
      teamName: bucket.teamName,
      teamSlug: bucket.teamSlug,
      position: bucket.position,
      minMinutes: FOOTBALL_PROP_MIN_MINUTES,
      avgMinutes: bucket.avgMinutes,
      matchLogs: bucket.matchLogs,
      marketQuotes: bucket.marketQuotes,
    });
  }

  const EB_PRIOR_GAMES = 5;
  const statOrder: readonly FootballPlayerPropStatKey[] = [
    "shots",
    "shots_on_target",
    "goal_or_assist",
    "fouls",
    "cards",
  ];

  for (const cand of candidates) {
    const minMinutesGuard = Math.max(
      FOOTBALL_PROP_MIN_MINUTES,
      typeof cand.minMinutes === "number" && Number.isFinite(cand.minMinutes)
        ? cand.minMinutes
        : FOOTBALL_PROP_MIN_MINUTES,
    );
    const lineupCheck = resolveLineupStatusForPlayer(
      game,
      cand.playerName,
      cand.teamSide,
      cand.lineupStatus,
    );
    if (lineupCheck.isRuledOut) continue;

    const qualifiedLogs = cand.matchLogs
      ? cand.matchLogs.filter((l) => Number.isFinite(l.minutesPlayed) && l.minutesPlayed >= minMinutesGuard)
      : null;

    if (qualifiedLogs !== null) {
      if (qualifiedLogs.length < 3) continue;
    } else if (
      typeof cand.avgMinutes !== "number" ||
      !Number.isFinite(cand.avgMinutes) ||
      cand.avgMinutes < minMinutesGuard ||
      !cand.seasonTotals ||
      !Number.isFinite(cand.seasonTotals.appearances) ||
      cand.seasonTotals.appearances < 3
    ) {
      continue;
    }

    const qualifyingMatches = qualifiedLogs ? qualifiedLogs.length : cand.seasonTotals!.appearances;
    const avgMinutes = qualifiedLogs
      ? round1(qualifiedLogs.reduce((s, l) => s + l.minutesPlayed, 0) / qualifiedLogs.length)
      : cand.avgMinutes ?? minMinutesGuard;

    const posKey = FOOTBALL_POS_PRIORS[cand.position.toUpperCase()] ? cand.position.toUpperCase() : "MID";
    const posPriors = FOOTBALL_POS_PRIORS[posKey]!;
    const teamLam = cand.teamSide === "home" ? lamHome : lamAway;
    const attackMult = clamp(teamLam / 1.35, 0.72, 1.38);

    const playerSlug =
      cand.playerSlug ??
      normalizeName(cand.playerName).replace(/\s+/g, "-");

    for (const statKey of statOrder) {
      const prior = posPriors[statKey];
      let observedValues: number[] | null = null;
      let homeAwayValues: number[] | undefined;
      let rawSum = 0;

      if (qualifiedLogs) {
        const extracted = qualifiedLogs
          .map((l) => {
            if (statKey === "shots") return l.shots;
            if (statKey === "shots_on_target") return l.shotsOnTarget;
            if (statKey === "goal_or_assist") {
              return l.goals !== undefined || l.assists !== undefined
                ? (l.goals ?? 0) + (l.assists ?? 0)
                : undefined;
            }
            if (statKey === "fouls") return l.foulsCommitted;
            if (statKey === "cards") {
              return l.yellowCards !== undefined || l.redCards !== undefined
                ? (l.yellowCards ?? 0) + (l.redCards ?? 0)
                : undefined;
            }
            return undefined;
          })
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

        if (extracted.length < 3) continue;
        observedValues = extracted;
        rawSum = extracted.reduce((acc, v) => acc + v, 0);

        const venueFiltered = qualifiedLogs
          .filter((l) =>
            cand.teamSide === "home" ? l.isHome === true : l.isHome === false,
          )
          .map((l) => {
            if (statKey === "shots") return l.shots;
            if (statKey === "shots_on_target") return l.shotsOnTarget;
            if (statKey === "goal_or_assist") return (l.goals ?? 0) + (l.assists ?? 0);
            if (statKey === "fouls") return l.foulsCommitted;
            return (l.yellowCards ?? 0) + (l.redCards ?? 0);
          })
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
        if (venueFiltered.length >= 3) homeAwayValues = venueFiltered;
      } else if (cand.seasonTotals) {
        const st = cand.seasonTotals;
        const val =
          statKey === "shots"
            ? st.shots
            : statKey === "shots_on_target"
              ? st.shotsOnTarget
              : statKey === "goal_or_assist"
                ? st.goals !== undefined || st.assists !== undefined
                  ? (st.goals ?? 0) + (st.assists ?? 0)
                  : undefined
                : statKey === "fouls"
                  ? st.foulsCommitted
                  : st.yellowCards !== undefined || st.redCards !== undefined
                    ? (st.yellowCards ?? 0) + (st.redCards ?? 0)
                    : undefined;
        if (val === undefined) continue;
        rawSum = val;
      }

      const nObs = observedValues ? observedValues.length : qualifyingMatches;
      const shrunkBaseRate = (rawSum + EB_PRIOR_GAMES * prior.rate) / (nObs + EB_PRIOR_GAMES);
      const contextMult =
        statKey === "cards"
          ? refereeSignal?.cardsMultiplier ?? 1.0
          : statKey === "fouls"
            ? refereeSignal?.foulsMultiplier ?? 1.0
            : attackMult;
      const mean = round2(Math.max(0.05, shrunkBaseRate * contextMult));
      const sd = round2(Math.sqrt(mean + (mean * mean) / prior.r));

      const quote = cand.marketQuotes?.[statKey];
      const line =
        quote?.line ??
        (statKey === "shots"
          ? mean >= 2.4
            ? 2.5
            : mean >= 1.35
              ? 1.5
              : 0.5
          : statKey === "shots_on_target"
            ? mean >= 1.35
              ? 1.5
              : 0.5
            : statKey === "fouls"
              ? mean >= 1.45
                ? 1.5
                : 0.5
              : 0.5);

      const nb = negBinomOverUnder(mean, prior.r, line);
      const pOver = clamp(nb.pOver, 0.04, 0.92);
      if (pOver < 0.14) continue;

      const windows = observedValues
        ? buildNumericSeriesEvidenceWindows({
            values: observedValues,
            homeAwayValues,
            venueLabel: cand.teamSide === "home" ? "Local" : "Visita",
            line,
            direction: "over",
            subjectLabel: cand.playerName,
          })
        : [];

      const comp =
        quote?.overDecimal && quote?.underDecimal
          ? [quote.overDecimal, quote.underDecimal]
          : null;

      const lineupText =
        lineupCheck.status === "confirmed"
          ? "XI confirmado"
          : lineupCheck.status === "probable"
            ? "XI probable"
            : "Alineación por confirmar";

      const meta: PlayerPropMeta = {
        playerName: cand.playerName,
        playerSlug,
        teamSide: cand.teamSide,
        teamName: cand.teamName,
        teamSlug: cand.teamSlug ?? (cand.teamSide === "home" ? game.home.slug : game.away.slug),
        photoKey: sanitizeSafePhotoKey(cand.photoKey),
        position: cand.position,
        statKey,
        statLabel: FOOTBALL_PROP_STAT_LABELS[statKey],
        minMinutesGuard,
        qualifyingMatches: nObs,
        avgMinutes,
        lineupStatus: lineupCheck.status,
        projectionMean: mean,
        projectionSd: sd,
      };

      const actionLabel =
        statKey === "goal_or_assist"
          ? `${cand.playerName} · Gol o asistencia`
          : statKey === "cards"
            ? `${cand.playerName} · Recibe tarjeta (+${line})`
            : `${cand.playerName} · Más de ${line} ${FOOTBALL_PROP_STAT_LABELS[statKey].toLowerCase()}`;

      emit({
        family: "player_props_football",
        selectionKey: `${playerSlug}_${statKey}_over_${line}`,
        label: actionLabel,
        line,
        direction: "over",
        p: pOver,
        marketDecimal: quote?.overDecimal ?? null,
        companionMarketDecimals: comp,
        companionIndex: 0,
        marketBookLabel: quote?.bookLabel ?? null,
        marketCapturedAtUtc: quote?.capturedAtUtc ?? null,
        isDerived: !quote?.overDecimal,
        precomputedWindows: windows,
        contextBullets: [
          `Proyección ajustada ${mean.toFixed(2)} · Guardia >= ${minMinutesGuard} min (${nObs} PJ, ${lineupText})`,
        ],
        playerMeta: meta,
      });
    }
  }
}


function emitNbaCatalog(
  game: PlatformGame,
  context: CatalogBuildContext,
  quoteIndex: ReadonlyMap<string, IndexedQuote>,
  emit: (args: EmitPickArgs) => void,
): void {
  const home = game.home.shortName || game.home.name;
  const away = game.away.shortName || game.away.name;
  const rawX12 = game.x12;
  const homeMean = game.projection?.home ?? null;
  const awayMean = game.projection?.away ?? null;

  let pHome = 0.5;
  if (rawX12 && rawX12[0] + rawX12[2] > 0) {
    pHome = clampProb(rawX12[0] / (rawX12[0] + rawX12[2]));
  } else if (homeMean !== null && awayMean !== null) {
    pHome = clampProb(normalCdf((homeMean - awayMean) / 12.2));
  }
  const pAway = clampProb(1 - pHome);

  const qH = lookupQuote(quoteIndex, ["h2h|home", "moneyline|home", "1x2|home"]);
  const qA = lookupQuote(quoteIndex, ["h2h|away", "moneyline|away", "1x2|away"]);
  const mlComp = resolveSameBookCompanionDecimals([qH, qA]);
  emit({
    family: "nba_moneyline",
    selectionKey: "home",
    label: `Gana ${home}`,
    line: null,
    direction: "home",
    p: pHome,
    marketDecimal: qH?.decimal ?? null,
    companionMarketDecimals: mlComp,
    companionIndex: 0,
    marketBookLabel: qH?.bookLabel,
    marketCapturedAtUtc: qH?.capturedAtUtc,
    bookQuotes: qH?.bookQuotes,
    isDerived: false,
  });
  emit({
    family: "nba_moneyline",
    selectionKey: "away",
    label: `Gana ${away}`,
    line: null,
    direction: "away",
    p: pAway,
    marketDecimal: qA?.decimal ?? null,
    companionMarketDecimals: mlComp,
    companionIndex: 1,
    marketBookLabel: qA?.bookLabel,
    marketCapturedAtUtc: qA?.capturedAtUtc,
    bookQuotes: qA?.bookQuotes,
    isDerived: false,
  });

  if (homeMean !== null && awayMean !== null && homeMean > 50 && awayMean > 50) {
    const marginMean = homeMean - awayMean;
    const totalMean = game.projection?.total ?? homeMean + awayMean;
    let sigmaMargin = 12.2;
    const zWin = normalInvCdf(pHome);
    if (Math.abs(zWin) > 0.08 && Math.sign(zWin) === Math.sign(marginMean)) {
      const cal = marginMean / zWin;
      if (cal >= 8.5 && cal <= 16.5) sigmaMargin = cal;
    }
    const sigmaTotal = 17.2;

    const centerSpread = roundToHalf(-marginMean);
    for (const hLine of Array.from(new Set([centerSpread - 3, centerSpread, centerSpread + 3]))) {
      const aLine = -hLine;
      const pHomeCover = clampProb(1 - normalCdf((-hLine - marginMean) / sigmaMargin));
      const qSH = lookupQuote(quoteIndex, [
        `spread|home_${formatSignedLine(hLine)}|${hLine}`,
        `spread|home|${hLine}`,
        `spreads|home|${hLine}`,
        `nba_spread|home|${hLine}`,
      ]);
      const qSA = lookupQuote(quoteIndex, [
        `spread|away_${formatSignedLine(aLine)}|${aLine}`,
        `spread|away|${aLine}`,
        `spreads|away|${aLine}`,
        `nba_spread|away|${aLine}`,
      ]);
      const comp = resolveSameBookCompanionDecimals([qSH, qSA]);
      emit({
        family: "nba_spread",
        selectionKey: `home_${formatSignedLine(hLine)}`,
        label: `${home} (${formatSignedLine(hLine)})`,
        line: hLine,
        direction: "home",
        p: pHomeCover,
        marketDecimal: qSH?.decimal ?? null,
        companionMarketDecimals: comp,
        companionIndex: 0,
        marketBookLabel: qSH?.bookLabel,
        marketCapturedAtUtc: qSH?.capturedAtUtc,
        isDerived: !qSH,
      });
      emit({
        family: "nba_spread",
        selectionKey: `away_${formatSignedLine(aLine)}`,
        label: `${away} (${formatSignedLine(aLine)})`,
        line: aLine,
        direction: "away",
        p: clampProb(1 - pHomeCover),
        marketDecimal: qSA?.decimal ?? null,
        companionMarketDecimals: comp,
        companionIndex: 1,
        marketBookLabel: qSA?.bookLabel,
        marketCapturedAtUtc: qSA?.capturedAtUtc,
        isDerived: !qSA,
      });
    }

    const centerTotal = roundToHalf(totalMean);
    for (const line of [centerTotal - 5, centerTotal, centerTotal + 5].filter((l) => l >= 170)) {
      const pOver = clampProb(1 - normalCdf((line - totalMean) / sigmaTotal));
      const qO = lookupQuote(quoteIndex, [
        `totals|over_${line}|${line}`,
        `totals|over|${line}`,
        `nba_totals|over|${line}`,
      ]);
      const qU = lookupQuote(quoteIndex, [
        `totals|under_${line}|${line}`,
        `totals|under|${line}`,
        `nba_totals|under|${line}`,
      ]);
      const comp = resolveSameBookCompanionDecimals([qO, qU]);
      emit({
        family: "nba_totals",
        selectionKey: `over_${line}`,
        label: `Más de ${line} puntos`,
        line,
        direction: "over",
        p: pOver,
        marketDecimal: qO?.decimal ?? null,
        companionMarketDecimals: comp,
        companionIndex: 0,
        marketBookLabel: qO?.bookLabel,
        marketCapturedAtUtc: qO?.capturedAtUtc,
        isDerived: !qO,
      });
      emit({
        family: "nba_totals",
        selectionKey: `under_${line}`,
        label: `Menos de ${line} puntos`,
        line,
        direction: "under",
        p: clampProb(1 - pOver),
        marketDecimal: qU?.decimal ?? null,
        companionMarketDecimals: comp,
        companionIndex: 1,
        marketBookLabel: qU?.bookLabel,
        marketCapturedAtUtc: qU?.capturedAtUtc,
        isDerived: !qU,
      });
    }
  }

  emitNbaPlayerProps(game, context, emit);
}

function emitNbaPlayerProps(
  game: PlatformGame,
  context: CatalogBuildContext,
  emit: (args: EmitPickArgs) => void,
): void {
  const byPlayer = new Map<
    string,
    {
      playerName: string;
      playerSlug?: string;
      photoKey?: string | null;
      teamSlug?: string | null;
      teamSide: "home" | "away";
      teamName: string;
      position: string;
      lineupStatus?: LineupConfirmationStatus;
      minMinutes?: number;
      avgMinutes?: number | null;
      matchLogs?: NbaPlayerPropCandidateInput["matchLogs"];
      statProjections: Partial<
        Record<
          NbaPlayerPropStatKey,
          {
            readonly line: number;
            readonly mean: number;
            readonly sd?: number;
            readonly last10?: readonly number[];
            readonly overDecimal?: number | null;
            readonly underDecimal?: number | null;
            readonly bookLabel?: string | null;
            readonly capturedAtUtc?: string | null;
          }
        >
      >;
    }
  >();

  for (const c of context.nbaPlayers ?? []) {
    const key = normalizeName(c.playerName);
    byPlayer.set(key, {
      playerName: c.playerName,
      playerSlug: c.playerSlug,
      photoKey: c.photoKey ?? null,
      teamSlug: c.teamSlug ?? null,
      teamSide: c.teamSide,
      teamName: c.teamName,
      position: c.position,
      lineupStatus: c.lineupStatus,
      minMinutes: c.minMinutes,
      avgMinutes: c.avgMinutes,
      matchLogs: c.matchLogs,
      statProjections: { ...(c.statProjections ?? {}) },
    });
  }

  for (const pp of context.playerProps ?? []) {
    if (pp.gameId !== game.id) continue;
    const statKey = mapPlayerPropItemToNbaStat(pp.statLabel);
    if (!statKey) continue;
    const isHome =
      pp.teamSlug === game.home.slug || normalizeName(pp.teamName) === normalizeName(game.home.name);
    const key = normalizeName(pp.player);
    let bucket = byPlayer.get(key);
    if (!bucket) {
      const rawCarrier = pp as typeof pp & {
        readonly avgMinutes?: number | null;
        readonly minutesPerGame?: number | null;
      };
      const realAvgMinutes =
        typeof rawCarrier.avgMinutes === "number" && Number.isFinite(rawCarrier.avgMinutes)
          ? rawCarrier.avgMinutes
          : typeof rawCarrier.minutesPerGame === "number" &&
              Number.isFinite(rawCarrier.minutesPerGame)
            ? rawCarrier.minutesPerGame
            : null;
      bucket = {
        playerName: pp.player,
        teamSide: isHome ? "home" : "away",
        teamName: pp.teamName,
        position: pp.position,
        avgMinutes: realAvgMinutes,
        statProjections: {},
      };
      byPlayer.set(key, bucket);
    }
    if (!bucket.statProjections[statKey]) {
      bucket.statProjections[statKey] = {
        line: pp.baseLine,
        mean: pp.projectionMean,
        sd: pp.projectionSd,
        last10: pp.last10,
        overDecimal: null,
        underDecimal: null,
      };
    }
  }

  const candidates = Array.from(byPlayer.values());

  const statOrder: readonly NbaPlayerPropStatKey[] = ["PTS", "REB", "AST", "3PM"];

  for (const cand of candidates) {
    const minMinutes = Math.max(
      NBA_PROP_DEFAULT_MIN_MINUTES,
      typeof cand.minMinutes === "number" && Number.isFinite(cand.minMinutes)
        ? cand.minMinutes
        : NBA_PROP_DEFAULT_MIN_MINUTES,
    );
    const lineupCheck = resolveLineupStatusForPlayer(
      game,
      cand.playerName,
      cand.teamSide,
      cand.lineupStatus,
    );
    if (lineupCheck.isRuledOut) continue;

    const qualifiedLogs = cand.matchLogs
      ? cand.matchLogs.filter((l) => Number.isFinite(l.minutesPlayed) && l.minutesPlayed >= minMinutes)
      : null;

    if (qualifiedLogs !== null) {
      if (qualifiedLogs.length < 3) continue;
    } else if (
      typeof cand.avgMinutes !== "number" ||
      !Number.isFinite(cand.avgMinutes) ||
      cand.avgMinutes < minMinutes
    ) {
      continue;
    }

    const playerSlug =
      cand.playerSlug ?? normalizeName(cand.playerName).replace(/\s+/g, "-");

    for (const statKey of statOrder) {
      const proj = cand.statProjections?.[statKey];
      const logValues = qualifiedLogs
        ? qualifiedLogs
            .map((l) => l[statKey])
            .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
        : proj?.last10
          ? [...proj.last10]
          : [];

      if (!proj && logValues.length < 3) continue;

      const sampleMean =
        logValues.length > 0
          ? logValues.reduce((acc, v) => acc + v, 0) / logValues.length
          : null;
      const mean = round2(proj?.mean ?? sampleMean ?? 0);
      if (mean <= 0.2) continue;

      const sd = round2(
        Math.max(0.65, proj?.sd ?? NBA_PROP_DEFAULT_SD[statKey]),
      );
      const line = proj?.line ?? roundToHalf(mean);

      const pOver =
        statKey === "3PM"
          ? clamp(negBinomOverUnder(mean, 4.2, line).pOver, 0.08, 0.92)
          : clamp(1 - normalCdf((line - mean) / sd), 0.08, 0.92);
      const pUnder = clamp(1 - pOver, 0.08, 0.92);

      const comp =
        proj?.overDecimal && proj?.underDecimal ? [proj.overDecimal, proj.underDecimal] : null;
      const avgMinutes = qualifiedLogs
        ? round1(qualifiedLogs.reduce((s, l) => s + l.minutesPlayed, 0) / qualifiedLogs.length)
        : cand.avgMinutes ?? null;

      const meta: PlayerPropMeta = {
        playerName: cand.playerName,
        playerSlug,
        teamSide: cand.teamSide,
        teamName: cand.teamName,
        teamSlug: cand.teamSlug ?? (cand.teamSide === "home" ? game.home.slug : game.away.slug),
        photoKey: sanitizeSafePhotoKey(cand.photoKey),
        position: cand.position,
        statKey,
        statLabel: NBA_PROP_STAT_LABELS[statKey],
        minMinutesGuard: minMinutes,
        qualifyingMatches: qualifiedLogs ? qualifiedLogs.length : logValues.length,
        avgMinutes,
        lineupStatus: lineupCheck.status,
        projectionMean: mean,
        projectionSd: sd,
      };

      const overWindows = buildNumericSeriesEvidenceWindows({
        values: logValues,
        line,
        direction: "over",
        subjectLabel: cand.playerName,
      });
      const underWindows = buildNumericSeriesEvidenceWindows({
        values: logValues,
        line,
        direction: "under",
        subjectLabel: cand.playerName,
      });

      emit({
        family: "nba_player_props",
        selectionKey: `${playerSlug}_${statKey.toLowerCase()}_over_${line}`,
        label: `${cand.playerName} · Más de ${line} ${statKey}`,
        line,
        direction: "over",
        p: pOver,
        marketDecimal: proj?.overDecimal ?? null,
        companionMarketDecimals: comp,
        companionIndex: 0,
        marketBookLabel: proj?.bookLabel ?? null,
        marketCapturedAtUtc: proj?.capturedAtUtc ?? null,
        isDerived: !proj?.overDecimal,
        precomputedWindows: overWindows,
        contextBullets: [`Proyección ${mean.toFixed(1)} ${statKey} (±${sd.toFixed(1)})`],
        playerMeta: meta,
      });
      emit({
        family: "nba_player_props",
        selectionKey: `${playerSlug}_${statKey.toLowerCase()}_under_${line}`,
        label: `${cand.playerName} · Menos de ${line} ${statKey}`,
        line,
        direction: "under",
        p: pUnder,
        marketDecimal: proj?.underDecimal ?? null,
        companionMarketDecimals: comp,
        companionIndex: 1,
        marketBookLabel: proj?.bookLabel ?? null,
        marketCapturedAtUtc: proj?.capturedAtUtc ?? null,
        isDerived: !proj?.underDecimal,
        precomputedWindows: underWindows,
        contextBullets: [`Proyección ${mean.toFixed(1)} ${statKey} (±${sd.toFixed(1)})`],
        playerMeta: meta,
      });
    }
  }
}


function emitMlbCatalog(
  game: PlatformGame,
  context: CatalogBuildContext,
  quoteIndex: ReadonlyMap<string, IndexedQuote>,
  emit: (args: EmitPickArgs) => void,
): void {
  const home = game.home.shortName || game.home.name;
  const away = game.away.shortName || game.away.name;
  const homeFull = game.projection?.home ?? 4.35;
  const awayFull = game.projection?.away ?? 4.15;
  const totalFull = game.projection?.total ?? homeFull + awayFull;

  const muH9 = Math.max(0.8, homeFull * 0.945);
  const muA9 = Math.max(0.8, awayFull * 0.945);
  const pmfH9 = negBinomPmfArray(muH9, 5.5, 22);
  const pmfA9 = negBinomPmfArray(muA9, 5.5, 22);

  let pHome9 = 0;
  let pAway9 = 0;
  let pTie9 = 0;
  let pHomeRlMinus15 = 0;
  let pAwayRlMinus15 = 0;

  const totalDist = new Array<number>(52).fill(0);
  const pHomeEi = clamp(0.535 + 0.12 * Math.tanh((muH9 - muA9) / 3), 0.44, 0.63);
  const pAwayEi = 1 - pHomeEi;
  const eiAddedDist: ReadonlyArray<readonly [number, number]> = [
    [1, 0.34],
    [2, 0.27],
    [3, 0.19],
    [4, 0.12],
    [5, 0.08],
  ];

  for (let h = 0; h < pmfH9.length; h += 1) {
    for (let a = 0; a < pmfA9.length; a += 1) {
      const p = pmfH9[h]! * pmfA9[a]!;
      if (h > a) {
        pHome9 += p;
        if (h - a >= 2) pHomeRlMinus15 += p;
        totalDist[Math.min(51, h + a)]! += p;
      } else if (a > h) {
        pAway9 += p;
        if (a - h >= 2) pAwayRlMinus15 += p;
        totalDist[Math.min(51, h + a)]! += p;
      } else {
        pTie9 += p;
        pHomeRlMinus15 += p * pHomeEi * 0.22;
        pAwayRlMinus15 += p * pAwayEi * 0.48;
        for (const [extraRuns, w] of eiAddedDist) {
          totalDist[Math.min(51, h + a + extraRuns)]! += p * w;
        }
      }
    }
  }

  const rawX12 = game.x12;
  const pHomeMl = clampProb(
    rawX12 && rawX12[0] + rawX12[2] > 0
      ? rawX12[0] / (rawX12[0] + rawX12[2])
      : pHome9 + pTie9 * pHomeEi,
  );
  const pAwayMl = clampProb(1 - pHomeMl);

  const qH = lookupQuote(quoteIndex, ["h2h|home", "moneyline|home", "1x2|home"]);
  const qA = lookupQuote(quoteIndex, ["h2h|away", "moneyline|away", "1x2|away"]);
  const mlComp = resolveSameBookCompanionDecimals([qH, qA]);
  emit({
    family: "mlb_moneyline",
    selectionKey: "home",
    label: `Gana ${home}`,
    line: null,
    direction: "home",
    p: pHomeMl,
    marketDecimal: qH?.decimal ?? null,
    companionMarketDecimals: mlComp,
    companionIndex: 0,
    marketBookLabel: qH?.bookLabel,
    marketCapturedAtUtc: qH?.capturedAtUtc,
    bookQuotes: qH?.bookQuotes,
    isDerived: false,
    contextBullets: [`Probabilidad de extra innings: ${(pTie9 * 100).toFixed(1)} %`],
  });
  emit({
    family: "mlb_moneyline",
    selectionKey: "away",
    label: `Gana ${away}`,
    line: null,
    direction: "away",
    p: pAwayMl,
    marketDecimal: qA?.decimal ?? null,
    companionMarketDecimals: mlComp,
    companionIndex: 1,
    marketBookLabel: qA?.bookLabel,
    marketCapturedAtUtc: qA?.capturedAtUtc,
    bookQuotes: qA?.bookQuotes,
    isDerived: false,
    contextBullets: [`Probabilidad de extra innings: ${(pTie9 * 100).toFixed(1)} %`],
  });

  const homeFav = pHomeMl >= 0.5;
  const rlHomeLine = homeFav ? -1.5 : 1.5;
  const rlAwayLine = -rlHomeLine;
  const pRlHome = clampProb(homeFav ? pHomeRlMinus15 : 1 - pAwayRlMinus15);
  const pRlAway = clampProb(1 - pRlHome);
  const qRlH = lookupQuote(quoteIndex, [
    `spread|home_${formatSignedLine(rlHomeLine)}|${rlHomeLine}`,
    `spread|home|${rlHomeLine}`,
    `spreads|home|${rlHomeLine}`,
    `mlb_run_line|home|${rlHomeLine}`,
  ]);
  const qRlA = lookupQuote(quoteIndex, [
    `spread|away_${formatSignedLine(rlAwayLine)}|${rlAwayLine}`,
    `spread|away|${rlAwayLine}`,
    `spreads|away|${rlAwayLine}`,
    `mlb_run_line|away|${rlAwayLine}`,
  ]);
  const rlComp = resolveSameBookCompanionDecimals([qRlH, qRlA]);
  emit({
    family: "mlb_run_line",
    selectionKey: `home_${formatSignedLine(rlHomeLine)}`,
    label: `${home} (${formatSignedLine(rlHomeLine)}) Run Line`,
    line: rlHomeLine,
    direction: "home",
    p: pRlHome,
    marketDecimal: qRlH?.decimal ?? null,
    companionMarketDecimals: rlComp,
    companionIndex: 0,
    marketBookLabel: qRlH?.bookLabel,
    marketCapturedAtUtc: qRlH?.capturedAtUtc,
    isDerived: !qRlH,
    contextBullets: ["Incluye resolución exacta de entradas extra"],
  });
  emit({
    family: "mlb_run_line",
    selectionKey: `away_${formatSignedLine(rlAwayLine)}`,
    label: `${away} (${formatSignedLine(rlAwayLine)}) Run Line`,
    line: rlAwayLine,
    direction: "away",
    p: pRlAway,
    marketDecimal: qRlA?.decimal ?? null,
    companionMarketDecimals: rlComp,
    companionIndex: 1,
    marketBookLabel: qRlA?.bookLabel,
    marketCapturedAtUtc: qRlA?.capturedAtUtc,
    isDerived: !qRlA,
    contextBullets: ["Incluye resolución exacta de entradas extra"],
  });

  const muH5 = Math.max(0.5, homeFull * 0.555);
  const muA5 = Math.max(0.5, awayFull * 0.555);
  const pmfH5 = negBinomPmfArray(muH5, 4.8, 16);
  const pmfA5 = negBinomPmfArray(muA5, 4.8, 16);
  let pF5H = 0;
  let pF5T = 0;
  let pF5A = 0;
  for (let h = 0; h < pmfH5.length; h += 1) {
    for (let a = 0; a < pmfA5.length; a += 1) {
      const p = pmfH5[h]! * pmfA5[a]!;
      if (h > a) pF5H += p;
      else if (h === a) pF5T += p;
      else pF5A += p;
    }
  }
  const pubF5H = lookupPublishedProb(quoteIndex, ["mlb_f5|home", "f5_moneyline|f5_home"]);
  const pubF5T = lookupPublishedProb(quoteIndex, ["mlb_f5|tie"]);
  const pubF5A = lookupPublishedProb(quoteIndex, ["mlb_f5|away", "f5_moneyline|f5_away"]);
  const f5FinalH = clampProb(pubF5H ?? pF5H);
  const f5FinalT = clampProb(pubF5T ?? pF5T);
  const f5FinalA = clampProb(pubF5A ?? pF5A);
  const f5Sum = f5FinalH + f5FinalT + f5FinalA;

  emit({
    family: "mlb_f5",
    selectionKey: "f5_home",
    label: `F5 · ${home} (Primeras 5 entradas)`,
    line: null,
    direction: "home",
    axisOverride: "result_f5",
    p: clampProb(f5FinalH / f5Sum),
    isDerived: pubF5H === null,
    contextBullets: [`Proyección F5: ${muH5.toFixed(2)} – ${muA5.toFixed(2)} carreras`],
  });
  emit({
    family: "mlb_f5",
    selectionKey: "f5_tie",
    label: "F5 · Empate tras 5 entradas",
    line: null,
    direction: "draw",
    axisOverride: "result_f5",
    p: clampProb(f5FinalT / f5Sum),
    isDerived: pubF5T === null,
  });
  emit({
    family: "mlb_f5",
    selectionKey: "f5_away",
    label: `F5 · ${away} (Primeras 5 entradas)`,
    line: null,
    direction: "away",
    axisOverride: "result_f5",
    p: clampProb(f5FinalA / f5Sum),
    isDerived: pubF5A === null,
  });

  const f5TotalMean = muH5 + muA5;
  const f5Line = clamp(roundToHalf(f5TotalMean), 3.5, 7.5);
  let pF5Over = 0;
  for (let h = 0; h < pmfH5.length; h += 1) {
    for (let a = 0; a < pmfA5.length; a += 1) {
      if (h + a > f5Line) pF5Over += pmfH5[h]! * pmfA5[a]!;
    }
  }
  emit({
    family: "mlb_f5",
    selectionKey: `f5_over_${f5Line}`,
    label: `F5 · Más de ${f5Line} carreras`,
    line: f5Line,
    direction: "over",
    axisOverride: "f5_totals",
    p: clampProb(pF5Over),
    isDerived: true,
    contextBullets: [`Total proyectado F5: ${f5TotalMean.toFixed(2)} carreras`],
  });
  emit({
    family: "mlb_f5",
    selectionKey: `f5_under_${f5Line}`,
    label: `F5 · Menos de ${f5Line} carreras`,
    line: f5Line,
    direction: "under",
    axisOverride: "f5_totals",
    p: clampProb(1 - pF5Over),
    isDerived: true,
  });

  const centerRuns = clamp(roundToHalf(totalFull), 6.5, 11.5);
  for (const line of Array.from(new Set([centerRuns - 1, centerRuns, centerRuns + 1])).filter(
    (l) => l >= 5.5 && l <= 13.5,
  )) {
    let pOver = 0;
    for (let r = 0; r < totalDist.length; r += 1) {
      if (r > line) pOver += totalDist[r]!;
    }
    const qO = lookupQuote(quoteIndex, [
      `totals|over_${line}|${line}`,
      `totals|over|${line}`,
      `mlb_totals|over|${line}`,
    ]);
    const qU = lookupQuote(quoteIndex, [
      `totals|under_${line}|${line}`,
      `totals|under|${line}`,
      `mlb_totals|under|${line}`,
    ]);
    const comp = resolveSameBookCompanionDecimals([qO, qU]);
    emit({
      family: "mlb_totals",
      selectionKey: `over_${line}`,
      label: `Más de ${line} carreras`,
      line,
      direction: "over",
      p: clampProb(pOver),
      marketDecimal: qO?.decimal ?? null,
      companionMarketDecimals: comp,
      companionIndex: 0,
      marketBookLabel: qO?.bookLabel,
      marketCapturedAtUtc: qO?.capturedAtUtc,
      isDerived: !qO,
      contextBullets: [`Total esperado (incl. extras): ${totalFull.toFixed(1)} carreras`],
    });
    emit({
      family: "mlb_totals",
      selectionKey: `under_${line}`,
      label: `Menos de ${line} carreras`,
      line,
      direction: "under",
      p: clampProb(1 - pOver),
      marketDecimal: qU?.decimal ?? null,
      companionMarketDecimals: comp,
      companionIndex: 1,
      marketBookLabel: qU?.bookLabel,
      marketCapturedAtUtc: qU?.capturedAtUtc,
      isDerived: !qU,
    });
  }

  void context;
}


function emitNhlCatalog(
  game: PlatformGame,
  quoteIndex: ReadonlyMap<string, IndexedQuote>,
  emit: (args: EmitPickArgs) => void,
): void {
  const home = game.home.shortName || game.home.name;
  const away = game.away.shortName || game.away.name;
  const homeFull = game.projection?.home ?? 3.1;
  const awayFull = game.projection?.away ?? 2.9;
  const totalFull = game.projection?.total ?? homeFull + awayFull;

  const muHReg = Math.max(1.0, homeFull * 0.94);
  const muAReg = Math.max(1.0, awayFull * 0.94);
  const pmfH = negBinomPmfArray(muHReg, 14.0, 14);
  const pmfA = negBinomPmfArray(muAReg, 14.0, 14);

  const rawX12 = game.x12;
  const pHomeMl = clampProb(
    rawX12 && rawX12[0] + rawX12[2] > 0
      ? rawX12[0] / (rawX12[0] + rawX12[2])
      : normalCdf((homeFull - awayFull) / 2.15),
  );
  const pAwayMl = clampProb(1 - pHomeMl);

  const EMPTY_NET_SHARE = 0.24;
  let pOt = 0;
  let pHomeMinus15 = 0;
  let pAwayMinus15 = 0;
  const totalDist = new Array<number>(30).fill(0);

  for (let h = 0; h < pmfH.length; h += 1) {
    for (let a = 0; a < pmfA.length; a += 1) {
      const p = pmfH[h]! * pmfA[a]!;
      const diff = h - a;
      if (diff === 0) {
        pOt += p;
        totalDist[Math.min(29, h + a + 1)]! += p;
      } else if (diff === 1) {
        pHomeMinus15 += p * EMPTY_NET_SHARE;
        totalDist[Math.min(29, h + a)]! += p * (1 - EMPTY_NET_SHARE);
        totalDist[Math.min(29, h + a + 1)]! += p * EMPTY_NET_SHARE;
      } else if (diff === -1) {
        pAwayMinus15 += p * EMPTY_NET_SHARE;
        totalDist[Math.min(29, h + a)]! += p * (1 - EMPTY_NET_SHARE);
        totalDist[Math.min(29, h + a + 1)]! += p * EMPTY_NET_SHARE;
      } else if (diff >= 2) {
        pHomeMinus15 += p;
        totalDist[Math.min(29, h + a)]! += p;
      } else {
        pAwayMinus15 += p;
        totalDist[Math.min(29, h + a)]! += p;
      }
    }
  }

  const qH = lookupQuote(quoteIndex, ["h2h|home", "moneyline|home", "1x2|home"]);
  const qA = lookupQuote(quoteIndex, ["h2h|away", "moneyline|away", "1x2|away"]);
  const mlComp = resolveSameBookCompanionDecimals([qH, qA]);
  emit({
    family: "nhl_moneyline",
    selectionKey: "home",
    label: `Gana ${home} (incl. OT/SO)`,
    line: null,
    direction: "home",
    p: pHomeMl,
    marketDecimal: qH?.decimal ?? null,
    companionMarketDecimals: mlComp,
    companionIndex: 0,
    marketBookLabel: qH?.bookLabel,
    marketCapturedAtUtc: qH?.capturedAtUtc,
    bookQuotes: qH?.bookQuotes,
    isDerived: false,
    contextBullets: [`Probabilidad de prórroga/SO: ${(pOt * 100).toFixed(1)} %`],
  });
  emit({
    family: "nhl_moneyline",
    selectionKey: "away",
    label: `Gana ${away} (incl. OT/SO)`,
    line: null,
    direction: "away",
    p: pAwayMl,
    marketDecimal: qA?.decimal ?? null,
    companionMarketDecimals: mlComp,
    companionIndex: 1,
    marketBookLabel: qA?.bookLabel,
    marketCapturedAtUtc: qA?.capturedAtUtc,
    bookQuotes: qA?.bookQuotes,
    isDerived: false,
    contextBullets: [`Probabilidad de prórroga/SO: ${(pOt * 100).toFixed(1)} %`],
  });

  const homeFav = pHomeMl >= 0.5;
  const plHomeLine = homeFav ? -1.5 : 1.5;
  const plAwayLine = -plHomeLine;
  const pubHomePl = lookupPublishedProb(quoteIndex, [
    "nhl_puckline|home_-1.5|-1.5",
    "nhl_puck_line|home_-1.5|-1.5",
    "nhl_puckline|home|-1.5",
  ]);
  const pPlHome = clampProb(
    homeFav ? (pubHomePl ?? pHomeMinus15) : 1 - pAwayMinus15,
  );
  const pPlAway = clampProb(1 - pPlHome);
  const qPlH = lookupQuote(quoteIndex, [
    `nhl_puckline|home_${formatSignedLine(plHomeLine)}|${plHomeLine}`,
    `nhl_puck_line|home|${plHomeLine}`,
    `spread|home_${formatSignedLine(plHomeLine)}|${plHomeLine}`,
    `spreads|home|${plHomeLine}`,
  ]);
  const qPlA = lookupQuote(quoteIndex, [
    `nhl_puckline|away_${formatSignedLine(plAwayLine)}|${plAwayLine}`,
    `nhl_puck_line|away|${plAwayLine}`,
    `spread|away_${formatSignedLine(plAwayLine)}|${plAwayLine}`,
    `spreads|away|${plAwayLine}`,
  ]);
  const plComp = resolveSameBookCompanionDecimals([qPlH, qPlA]);
  emit({
    family: "nhl_puck_line",
    selectionKey: `home_${formatSignedLine(plHomeLine)}`,
    label: `${home} (${formatSignedLine(plHomeLine)}) Puck Line`,
    line: plHomeLine,
    direction: "home",
    p: pPlHome,
    marketDecimal: qPlH?.decimal ?? null,
    companionMarketDecimals: plComp,
    companionIndex: 0,
    marketBookLabel: qPlH?.bookLabel,
    marketCapturedAtUtc: qPlH?.capturedAtUtc,
    isDerived: !qPlH,
    contextBullets: ["Incluye ajuste de gol a portería vacía (empty-net)"],
  });
  emit({
    family: "nhl_puck_line",
    selectionKey: `away_${formatSignedLine(plAwayLine)}`,
    label: `${away} (${formatSignedLine(plAwayLine)}) Puck Line`,
    line: plAwayLine,
    direction: "away",
    p: pPlAway,
    marketDecimal: qPlA?.decimal ?? null,
    companionMarketDecimals: plComp,
    companionIndex: 1,
    marketBookLabel: qPlA?.bookLabel,
    marketCapturedAtUtc: qPlA?.capturedAtUtc,
    isDerived: !qPlA,
    contextBullets: ["Incluye ajuste de gol a portería vacía (empty-net)"],
  });

  const nhlLines = Array.from(new Set([5.5, roundToHalf(totalFull), 6.5]))
    .filter((l) => l >= 4.5 && l <= 8.5)
    .sort((a, b) => a - b);
  for (const line of nhlLines) {
    let pOver = 0;
    for (let g = 0; g < totalDist.length; g += 1) {
      if (g > line) pOver += totalDist[g]!;
    }
    const qO = lookupQuote(quoteIndex, [
      `totals|over_${line}|${line}`,
      `totals|over|${line}`,
      `nhl_totals|over|${line}`,
    ]);
    const qU = lookupQuote(quoteIndex, [
      `totals|under_${line}|${line}`,
      `totals|under|${line}`,
      `nhl_totals|under|${line}`,
    ]);
    const comp = resolveSameBookCompanionDecimals([qO, qU]);
    emit({
      family: "nhl_totals",
      selectionKey: `over_${line}`,
      label: `Más de ${line} goles`,
      line,
      direction: "over",
      p: clampProb(pOver),
      marketDecimal: qO?.decimal ?? null,
      companionMarketDecimals: comp,
      companionIndex: 0,
      marketBookLabel: qO?.bookLabel,
      marketCapturedAtUtc: qO?.capturedAtUtc,
      isDerived: !qO,
    });
    emit({
      family: "nhl_totals",
      selectionKey: `under_${line}`,
      label: `Menos de ${line} goles`,
      line,
      direction: "under",
      p: clampProb(1 - pOver),
      marketDecimal: qU?.decimal ?? null,
      companionMarketDecimals: comp,
      companionIndex: 1,
      marketBookLabel: qU?.bookLabel,
      marketCapturedAtUtc: qU?.capturedAtUtc,
      isDerived: !qU,
    });
  }
}


function buildNflKeyNumberMarginPmf(
  expectedMargin: number,
  sigmaMargin: number,
  targetPHome: number,
): { readonly minM: number; readonly pmf: readonly number[] } {
  const minM = -45;
  const maxM = 45;
  const keyWeight = (m: number): number => {
    const abs = Math.abs(m);
    if (abs === 0) return 0.06;
    if (abs === 3) return 1.38;
    if (abs === 7) return 1.22;
    if (abs === 10) return 1.1;
    if (abs === 6 || abs === 14) return 1.08;
    if (abs === 1 || abs === 2) return 0.62;
    return 1.0;
  };

  const pmf: number[] = [];
  let sum = 0;
  for (let m = minM; m <= maxM; m += 1) {
    const raw =
      normalCdf((m + 0.5 - expectedMargin) / sigmaMargin) -
      normalCdf((m - 0.5 - expectedMargin) / sigmaMargin);
    const w = Math.max(0, raw) * keyWeight(m);
    pmf.push(w);
    sum += w;
  }
  if (sum > 0) {
    for (let i = 0; i < pmf.length; i += 1) pmf[i] = pmf[i]! / sum;
  }

  let pPos = 0;
  let pNeg = 0;
  let pZero = 0;
  for (let i = 0; i < pmf.length; i += 1) {
    const m = minM + i;
    if (m > 0) pPos += pmf[i]!;
    else if (m < 0) pNeg += pmf[i]!;
    else pZero += pmf[i]!;
  }
  const active = Math.max(1e-6, 1 - pZero);
  const desiredPos = clamp(targetPHome, 0.02, 0.98) * active;
  const desiredNeg = active - desiredPos;
  if (pPos > 1e-6 && pNeg > 1e-6) {
    for (let i = 0; i < pmf.length; i += 1) {
      const m = minM + i;
      if (m > 0) pmf[i] = pmf[i]! * (desiredPos / pPos);
      else if (m < 0) pmf[i] = pmf[i]! * (desiredNeg / pNeg);
    }
  }

  return { minM, pmf };
}

function emitNflCatalog(
  game: PlatformGame,
  quoteIndex: ReadonlyMap<string, IndexedQuote>,
  emit: (args: EmitPickArgs) => void,
): void {
  const home = game.home.shortName || game.home.name;
  const away = game.away.shortName || game.away.name;
  const rawX12 = game.x12;
  const homeMean = game.projection?.home ?? 23.0;
  const awayMean = game.projection?.away ?? 21.5;
  const totalMean = game.projection?.total ?? homeMean + awayMean;
  const marginMean = homeMean - awayMean;

  const pHomeMl = clampProb(
    rawX12 && rawX12[0] + rawX12[2] > 0
      ? rawX12[0] / (rawX12[0] + rawX12[2])
      : normalCdf(marginMean / 13.2),
  );
  const pAwayMl = clampProb(1 - pHomeMl);

  const qH = lookupQuote(quoteIndex, ["h2h|home", "moneyline|home", "1x2|home"]);
  const qA = lookupQuote(quoteIndex, ["h2h|away", "moneyline|away", "1x2|away"]);
  const mlComp = resolveSameBookCompanionDecimals([qH, qA]);
  emit({
    family: "nfl_moneyline",
    selectionKey: "home",
    label: `Gana ${home}`,
    line: null,
    direction: "home",
    p: pHomeMl,
    marketDecimal: qH?.decimal ?? null,
    companionMarketDecimals: mlComp,
    companionIndex: 0,
    marketBookLabel: qH?.bookLabel,
    marketCapturedAtUtc: qH?.capturedAtUtc,
    bookQuotes: qH?.bookQuotes,
    isDerived: false,
  });
  emit({
    family: "nfl_moneyline",
    selectionKey: "away",
    label: `Gana ${away}`,
    line: null,
    direction: "away",
    p: pAwayMl,
    marketDecimal: qA?.decimal ?? null,
    companionMarketDecimals: mlComp,
    companionIndex: 1,
    marketBookLabel: qA?.bookLabel,
    marketCapturedAtUtc: qA?.capturedAtUtc,
    bookQuotes: qA?.bookQuotes,
    isDerived: false,
  });

  let sigmaMargin = 13.2;
  const zWin = normalInvCdf(pHomeMl);
  if (Math.abs(zWin) > 0.08 && Math.sign(zWin) === Math.sign(marginMean)) {
    const cal = marginMean / zWin;
    if (cal >= 10.0 && cal <= 17.0) sigmaMargin = cal;
  }
  const { minM, pmf } = buildNflKeyNumberMarginPmf(marginMean, sigmaMargin, pHomeMl);
  const centerSpread = roundToHalf(-marginMean);
  const spreadLines = Array.from(new Set([centerSpread - 3, centerSpread, centerSpread + 3]));

  for (const hLine of spreadLines) {
    const aLine = -hLine;
    let pWinH = 0;
    let pPush = 0;
    let pWinA = 0;
    for (let i = 0; i < pmf.length; i += 1) {
      const m = minM + i;
      const diff = m + hLine;
      if (Math.abs(diff) < 1e-9) pPush += pmf[i]!;
      else if (diff > 0) pWinH += pmf[i]!;
      else pWinA += pmf[i]!;
    }
    const active = Math.max(1e-6, pWinH + pWinA);
    const pHomeCover = clampProb(pWinH / active);
    const pAwayCover = clampProb(1 - pHomeCover);
    const qSH = lookupQuote(quoteIndex, [
      `spread|home_${formatSignedLine(hLine)}|${hLine}`,
      `spread|home|${hLine}`,
      `spreads|home|${hLine}`,
      `nfl_spread|home|${hLine}`,
    ]);
    const qSA = lookupQuote(quoteIndex, [
      `spread|away_${formatSignedLine(aLine)}|${aLine}`,
      `spread|away|${aLine}`,
      `spreads|away|${aLine}`,
      `nfl_spread|away|${aLine}`,
    ]);
    const comp = resolveSameBookCompanionDecimals([qSH, qSA]);
    const notes =
      pPush > 0.005
        ? [`Núcleo números clave NFL (±3 / ±7) · push ${(pPush * 100).toFixed(1)} %`]
        : ["Núcleo discreto de números clave NFL (±3 / ±7)"];
    emit({
      family: "nfl_spread",
      selectionKey: `home_${formatSignedLine(hLine)}`,
      label: `${home} (${formatSignedLine(hLine)})`,
      line: hLine,
      direction: "home",
      p: pHomeCover,
      marketDecimal: qSH?.decimal ?? null,
      companionMarketDecimals: comp,
      companionIndex: 0,
      marketBookLabel: qSH?.bookLabel,
      marketCapturedAtUtc: qSH?.capturedAtUtc,
      isDerived: !qSH,
      contextBullets: notes,
    });
    emit({
      family: "nfl_spread",
      selectionKey: `away_${formatSignedLine(aLine)}`,
      label: `${away} (${formatSignedLine(aLine)})`,
      line: aLine,
      direction: "away",
      p: pAwayCover,
      marketDecimal: qSA?.decimal ?? null,
      companionMarketDecimals: comp,
      companionIndex: 1,
      marketBookLabel: qSA?.bookLabel,
      marketCapturedAtUtc: qSA?.capturedAtUtc,
      isDerived: !qSA,
      contextBullets: notes,
    });
  }

  const sigmaTotal = 13.5;
  const centerTot = clamp(roundToHalf(totalMean), 32.5, 62.5);
  for (const line of Array.from(new Set([centerTot - 3.5, centerTot, centerTot + 3.5])).filter(
    (l) => l >= 28.5 && l <= 68.5,
  )) {
    const pOver = clampProb(1 - normalCdf((line - totalMean) / sigmaTotal));
    const qO = lookupQuote(quoteIndex, [
      `totals|over_${line}|${line}`,
      `totals|over|${line}`,
      `nfl_totals|over|${line}`,
    ]);
    const qU = lookupQuote(quoteIndex, [
      `totals|under_${line}|${line}`,
      `totals|under|${line}`,
      `nfl_totals|under|${line}`,
    ]);
    const comp = resolveSameBookCompanionDecimals([qO, qU]);
    emit({
      family: "nfl_totals",
      selectionKey: `over_${line}`,
      label: `Más de ${line} puntos`,
      line,
      direction: "over",
      p: pOver,
      marketDecimal: qO?.decimal ?? null,
      companionMarketDecimals: comp,
      companionIndex: 0,
      marketBookLabel: qO?.bookLabel,
      marketCapturedAtUtc: qO?.capturedAtUtc,
      isDerived: !qO,
    });
    emit({
      family: "nfl_totals",
      selectionKey: `under_${line}`,
      label: `Menos de ${line} puntos`,
      line,
      direction: "under",
      p: clampProb(1 - pOver),
      marketDecimal: qU?.decimal ?? null,
      companionMarketDecimals: comp,
      companionIndex: 1,
      marketBookLabel: qU?.bookLabel,
      marketCapturedAtUtc: qU?.capturedAtUtc,
      isDerived: !qU,
    });
  }
}
