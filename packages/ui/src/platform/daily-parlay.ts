import type { LeagueId } from "@pitchlab/contracts";
import {
  decimalToAmericanInt,
  isPickUnlocked,
  pickReferenceDecimal,
} from "./access-guard";
import { sportOf, UPCOMING, type SportId } from "./club/home/home-model";
import {
  checkParlayCompatibility,
  computeParlaySummary,
} from "./parlay-engine";
import type {
  MatchPick,
  ParlayLeg,
  PlatformGame,
  RiskBand,
  ViewerRole,
} from "./types";

export interface DailyParlayStyleSpec {
  risk: RiskBand;
  label: string;
  minLegs: number;
  maxLegs: number;
  minProbability: number;
  ruleHint: string;
}

export const DAILY_PARLAY_STYLE_SPECS: Readonly<Record<RiskBand, DailyParlayStyleSpec>> = {
  conservador: {
    risk: "conservador",
    label: "Conservador",
    minLegs: 2,
    maxLegs: 3,
    minProbability: 0.7,
    ruleHint: "2–3 selecciones con 70 % o más de probabilidad.",
  },
  medio: {
    risk: "medio",
    label: "Medio",
    minLegs: 3,
    maxLegs: 4,
    minProbability: 0.55,
    ruleHint: "3–4 selecciones equilibradas con 55 % o más.",
  },
  arriesgado: {
    risk: "arriesgado",
    label: "Arriesgado",
    minLegs: 4,
    maxLegs: 6,
    minProbability: 0,
    ruleHint: "4–6 selecciones buscando mayor momio combinado.",
  },
};

export const DAILY_PARLAY_STYLES: readonly RiskBand[] = [
  "conservador",
  "medio",
  "arriesgado",
];

export interface DailyParlayResult {
  dayId: string;
  risk: RiskBand;
  status: "ready" | "insufficient";
  minLegs: number;
  maxLegs: number;
  minProbability: number;
  legs: ParlayLeg[];
  combinedProbability: number;
  fairDecimal: number;
  fairAmerican: number;
  bookDecimal: number;
  emptyReason?: string;
}

export type GradedParlayOutcome = "hit" | "miss" | "pending" | "insufficient";

export interface GradedDailyParlayEntry {
  dayId: string;
  risk: RiskBand;
  parlay: DailyParlayResult;
  outcome: GradedParlayOutcome;
  hitLegs: number;
  missLegs: number;
  pendingLegs: number;
}

export interface GradedDailyParlayDay {
  dayId: string;
  finishedGamesCount: number;
  entries: GradedDailyParlayEntry[];
}

export type PersonalParlayScope =
  | { kind: "all" }
  | { kind: "sport"; sport: SportId }
  | { kind: "league"; league: LeagueId };

export interface PersonalQuickParlayResult {
  status: "ready" | "partial" | "insufficient";
  risk: RiskBand;
  requestedCount: number;
  legs: ParlayLeg[];
  combinedProbability: number;
  fairDecimal: number;
  fairAmerican: number;
  bookDecimal: number;
  message?: string;
}

function roundDecimal(val: number): number {
  return Math.max(1.01, Math.round(val * 100) / 100);
}

/**
 * Probabilidad combinada (producto independiente) y momio justo exacto `1 / p`.
 * Respeta `computeParlaySummary` cuando se habilita SGP en el armador manual.
 */
function summarizeIndependentLegs(legs: readonly ParlayLeg[]): {
  combinedProbability: number;
  fairDecimal: number;
  fairAmerican: number;
  bookDecimal: number;
} {
  if (legs.length === 0) {
    return {
      combinedProbability: 0,
      fairDecimal: 1,
      fairAmerican: 100,
      bookDecimal: 1,
    };
  }
  let combinedProbability = 1;
  let bookDecimal = 1;
  for (const { pick } of legs) {
    combinedProbability *= pick.p;
    bookDecimal *= pickReferenceDecimal(pick);
  }
  const fairDecimal = combinedProbability > 0 ? roundDecimal(1 / combinedProbability) : 1;
  return {
    combinedProbability,
    fairDecimal,
    fairAmerican: decimalToAmericanInt(fairDecimal),
    bookDecimal: roundDecimal(bookDecimal),
  };
}

interface CandidateItem {
  game: PlatformGame;
  pick: MatchPick;
  score: number;
}

function scoreDailyPick(game: PlatformGame, pick: MatchPick, risk: RiskBand): number {
  if (risk === "conservador") {
    return (
      pick.p * 100 +
      (pick.category === "conservador" || pick.category === "principal" ? 3 : 0) +
      (pick.edgePts ?? 0) * 0.4 +
      pick.confidenceScore * 0.02
    );
  }
  if (risk === "medio") {
    const bandBonus =
      pick.risk === "medio" ? 18 : pick.risk === "conservador" ? 9 : 0;
    return (
      bandBonus +
      pick.p * 32 +
      (pick.edgePts ?? 0) * 2.5 +
      pick.confidenceScore * 0.1
    );
  }
  const bandBonus =
    pick.risk === "arriesgado" ? 24 : pick.risk === "medio" ? 10 : 0;
  return (
    bandBonus +
    (1 - Math.abs(0.46 - pick.p)) * 24 +
    (pick.edgePts ?? 0) * 3.8 +
    pick.confidenceScore * 0.12
  );
}

function compareCandidatesDeterministic(a: CandidateItem, b: CandidateItem, risk: RiskBand): number {
  if (b.score !== a.score) return b.score - a.score;
  if (risk === "arriesgado") {
    if (b.pick.fairDecimal !== a.pick.fairDecimal) {
      return b.pick.fairDecimal - a.pick.fairDecimal;
    }
  } else if (b.pick.p !== a.pick.p) {
    return b.pick.p - a.pick.p;
  }
  const koCmp = a.game.kickoffUtc.localeCompare(b.game.kickoffUtc);
  if (koCmp !== 0) return koCmp;
  const gCmp = a.game.id.localeCompare(b.game.id);
  if (gCmp !== 0) return gCmp;
  if (a.pick.slotIndex !== b.pick.slotIndex) return a.pick.slotIndex - b.pick.slotIndex;
  return a.pick.id.localeCompare(b.pick.id);
}

function canAddSinglePerGame(selected: readonly ParlayLeg[], candidate: MatchPick): boolean {
  if (candidate.isRedacted) return false;
  if (selected.length >= 6) return false;
  for (const leg of selected) {
    if (leg.pick.id === candidate.id || leg.pick.gameId === candidate.gameId) {
      return false;
    }
  }
  return true;
}

/**
 * Día del Parlay oficial en «Próximos 7 días»: el primer día con partidos por jugar en el que
 * el estilo elegido sí reúne sus selecciones. Si ninguno alcanza, el primer día con partidos.
 * Con un día elegido en la barra se respeta ese día.
 */
export function pickOfficialParlayDay(
  games: readonly PlatformGame[],
  selectedDay: string,
  today: string,
  risk: RiskBand,
  viewerRole: ViewerRole = "member",
): string {
  const fallback = resolveOfficialParlayDay(games, selectedDay, today);
  if (selectedDay !== UPCOMING) return fallback;
  const openDays = Array.from(
    new Set(games.filter((g) => g.status === "NS" && g.dayId >= today).map((g) => g.dayId)),
  ).sort();
  return (
    openDays.find((dayId) => buildOfficialDailyParlay({ dayId, games, risk, viewerRole }).status === "ready") ??
    fallback
  );
}

/**
 * Determina el `dayId` (`YYYY-MM-DD`) activo para mostrar el Parlay oficial del día en Inicio:
 * - Si el socio eligió un día específico en la barra, usa ese día.
 * - Si eligió «Próximos 7 días», prioriza `today` si tiene partidos abiertos; si no, el próximo día con partidos abiertos.
 */
export function resolveOfficialParlayDay(
  games: readonly PlatformGame[],
  selectedDay: string,
  today: string,
): string {
  if (selectedDay !== UPCOMING) {
    return selectedDay;
  }
  const hasOpenToday = games.some((g) => g.dayId === today && g.status !== "FT");
  if (hasOpenToday) return today;

  const openDaysFuture = Array.from(
    new Set(
      games
        .filter((g) => g.status !== "FT" && g.dayId >= today)
        .map((g) => g.dayId),
    ),
  ).sort();
  if (openDaysFuture.length > 0) return openDaysFuture[0]!;

  const anyOpenDays = Array.from(
    new Set(games.filter((g) => g.status !== "FT").map((g) => g.dayId)),
  ).sort();
  return anyOpenDays[0] ?? today;
}

/**
 * Parlay oficial del día (determinista): mismo `dayId`, mismos partidos y mismo estilo
 * siempre producen exactamente las mismas selecciones y momio justo.
 *
 * Se arma con todos los partidos del día, sin importar si ya empezaron o terminaron, y con
 * la regla de un pick por partido: así el parlay que se ve en la mañana es el mismo que se
 * ve en la tarde y el mismo que se califica en Resultados.
 */
export function buildOfficialDailyParlay(options: {
  dayId: string;
  games: readonly PlatformGame[];
  risk: RiskBand;
  viewerRole?: ViewerRole;
}): DailyParlayResult {
  const { dayId, games, risk, viewerRole = "member" } = options;
  const spec = DAILY_PARLAY_STYLE_SPECS[risk];

  const dayGames = games
    .filter((g) => g.dayId === dayId)
    .slice()
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.id.localeCompare(b.id));

  const candidates: CandidateItem[] = [];
  for (const game of dayGames) {
    for (const pick of game.picks) {
      if (pick.isRedacted || !isPickUnlocked(pick, game.status, viewerRole)) {
        continue;
      }
      if (!Number.isFinite(pick.p) || pick.p <= 0 || pick.p < spec.minProbability) {
        continue;
      }
      candidates.push({
        game,
        pick,
        score: scoreDailyPick(game, pick, risk),
      });
    }
  }

  candidates.sort((a, b) => compareCandidatesDeterministic(a, b, risk));

  const legs: ParlayLeg[] = [];
  for (const item of candidates) {
    if (legs.length >= spec.maxLegs) break;
    if (canAddSinglePerGame(legs, item.pick)) {
      legs.push({ pick: item.pick });
    }
  }

  if (legs.length < spec.minLegs) {
    const minPct = Math.round(spec.minProbability * 100);
    const reason =
      spec.minProbability > 0
        ? `Este día solo reúne ${legs.length} ${legs.length === 1 ? "selección compatible" : "selecciones compatibles"} con ${minPct} % o más; se necesitan al menos ${spec.minLegs} partidos distintos.`
        : `Este día solo reúne ${legs.length} ${legs.length === 1 ? "partido disponible" : "partidos disponibles"}; el parlay arriesgado requiere al menos ${spec.minLegs}.`;
    return {
      dayId,
      risk,
      status: "insufficient",
      minLegs: spec.minLegs,
      maxLegs: spec.maxLegs,
      minProbability: spec.minProbability,
      legs: [],
      combinedProbability: 0,
      fairDecimal: 1,
      fairAmerican: 100,
      bookDecimal: 1,
      emptyReason: reason,
    };
  }

  const metrics = summarizeIndependentLegs(legs);
  return {
    dayId,
    risk,
    status: "ready",
    minLegs: spec.minLegs,
    maxLegs: spec.maxLegs,
    minProbability: spec.minProbability,
    legs,
    ...metrics,
  };
}

/**
 * Califica automáticamente los parlays oficiales de los días con partidos finalizados
 * (`status === "FT" && score`), reconstruyendo las mismas selecciones deterministas del día.
 */
export function gradeOfficialDailyParlays(
  games: readonly PlatformGame[],
  limitDays = 7,
): GradedDailyParlayDay[] {
  const byDay = new Map<string, PlatformGame[]>();
  const finishedCountByDay = new Map<string, number>();

  for (const game of games) {
    const dayKey = game.dayId || game.kickoffUtc.slice(0, 10);
    const list = byDay.get(dayKey) ?? [];
    list.push(game);
    byDay.set(dayKey, list);
    if (game.status === "FT" && game.score) {
      finishedCountByDay.set(dayKey, (finishedCountByDay.get(dayKey) ?? 0) + 1);
    }
  }

  const dayIds = Array.from(finishedCountByDay.entries())
    .filter(([, count]) => count > 0)
    .map(([dayId]) => dayId)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limitDays);

  return dayIds.map((dayId) => {
    const dayGames = byDay.get(dayId) ?? [];
    const entries: GradedDailyParlayEntry[] = DAILY_PARLAY_STYLES.map((risk) => {
      const parlay = buildOfficialDailyParlay({
        dayId,
        games: dayGames,
        risk,
        viewerRole: "member",
      });

      if (parlay.status !== "ready" || parlay.legs.length === 0) {
        return {
          dayId,
          risk,
          parlay,
          outcome: "insufficient",
          hitLegs: 0,
          missLegs: 0,
          pendingLegs: 0,
        };
      }

      let hitLegs = 0;
      let missLegs = 0;
      let pendingLegs = 0;
      for (const { pick } of parlay.legs) {
        if (pick.result === "hit") hitLegs += 1;
        else if (pick.result === "miss") missLegs += 1;
        else pendingLegs += 1;
      }

      const outcome: GradedParlayOutcome =
        missLegs > 0
          ? "miss"
          : hitLegs === parlay.legs.length
            ? "hit"
            : "pending";

      return {
        dayId,
        risk,
        parlay,
        outcome,
        hitLegs,
        missLegs,
        pendingLegs,
      };
    });

    return {
      dayId,
      finishedGamesCount: finishedCountByDay.get(dayId) ?? 0,
      entries,
    };
  });
}

function matchesPersonalScope(game: PlatformGame, scope: PersonalParlayScope): boolean {
  if (scope.kind === "all") return true;
  if (scope.kind === "sport") return sportOf(game) === scope.sport;
  return game.league === scope.league;
}

/**
 * Generador rápido personal: arma entre 2 y 6 selecciones compatibles filtradas por
 * liga, deporte o todo, según el estilo de riesgo elegido.
 */
export function buildPersonalQuickParlay(options: {
  games: readonly PlatformGame[];
  legCount: number;
  risk: RiskBand;
  scope: PersonalParlayScope;
  viewerRole?: ViewerRole;
  allowSgp?: boolean;
}): PersonalQuickParlayResult {
  const {
    games,
    legCount,
    risk,
    scope,
    viewerRole = "member",
    allowSgp = false,
  } = options;
  const requestedCount = Math.min(6, Math.max(2, Math.round(legCount)));

  const scopedGames = games
    .filter((g) => g.status !== "FT" && matchesPersonalScope(g, scope))
    .slice()
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.id.localeCompare(b.id));

  const candidates: CandidateItem[] = [];
  for (const game of scopedGames) {
    for (const pick of game.picks) {
      if (pick.isRedacted || !isPickUnlocked(pick, game.status, viewerRole)) {
        continue;
      }
      if (!Number.isFinite(pick.p) || pick.p <= 0) continue;
      candidates.push({
        game,
        pick,
        score: scoreDailyPick(game, pick, risk),
      });
    }
  }

  candidates.sort((a, b) => compareCandidatesDeterministic(a, b, risk));

  const legs: ParlayLeg[] = [];
  for (const item of candidates) {
    if (legs.length >= requestedCount) break;
    if (checkParlayCompatibility(legs, item.pick, allowSgp).allowed) {
      legs.push({ pick: item.pick });
    }
  }

  if (legs.length < 2) {
    return {
      status: "insufficient",
      risk,
      requestedCount,
      legs: [],
      combinedProbability: 0,
      fairDecimal: 1,
      fairAmerican: 100,
      bookDecimal: 1,
      message: "No hay suficientes partidos abiertos con ese filtro para armar un parlay de al menos 2 selecciones.",
    };
  }

  const metrics = allowSgp
    ? (() => {
        const s = computeParlaySummary(legs, 1);
        return {
          combinedProbability: s.combinedProbability,
          fairDecimal: s.fairDecimal,
          fairAmerican: s.fairAmerican,
          bookDecimal: s.bookDecimal,
        };
      })()
    : summarizeIndependentLegs(legs);

  const partial = legs.length < requestedCount;
  return {
    status: partial ? "partial" : "ready",
    risk,
    requestedCount,
    legs,
    ...metrics,
    message: partial
      ? `Solo había ${legs.length} selecciones compatibles disponibles de las ${requestedCount} pedidas.`
      : undefined,
  };
}
