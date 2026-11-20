/**
 * Adaptador de servidor para el Catálogo de Picks de 34 Familias (`Spacetime v5.1`).
 *
 * Responsabilidades:
 * - Función pura `buildServerMatchPicksCatalog(game, options)` sin efectos secundarios ni I/O.
 * - Cumplimiento estricto de `Cero-Fuga`: cuando `fullAccess === false` y el partido aún no
 *   finaliza (`status !== "FT"`), redacta todos los picks reservados eliminando probabilidad,
 *   cuotas, valor, lado, línea, evidencia interna y metadatos de jugador.
 * - Preserva íntegros los partidos `FT` con liquidación auditable (`hit | miss | push | pending`).
 * - Compacta el payload por familia y límite global para rutas de partido/picks sin inflar
 *   el shell RSC inicial (`ADR-051` / `ADR-053`).
 */
import type {
  MatchIntelligenceV5View,
  PlatformGame,
  PlatformMarketRow,
  PlayerPropItem,
} from "@pitchlab/ui/types";
import {
  buildMatchPicksCatalog,
  type CatalogBuildContext,
  type CatalogPickItem,
  type FootballPlayerPropCandidateInput,
  type MarketFamilyId,
  type MatchFinalCountStats,
  type MatchPicksCatalog,
  type NbaPlayerPropCandidateInput,
  type TeamMatchEvidenceRecord,
} from "@pitchlab/ui/picks-catalog";

export interface ServerMatchPicksCatalogOptions {
  /** `true` para socios autenticados; `false` aplica redacción estricta Cero-Fuga. */
  readonly fullAccess: boolean;
  /** Filas de mercado enriquecidas en servidor (v3.2 / v5.1 / cuotas vigentes). */
  readonly markets?: readonly PlatformMarketRow[];
  /** Enriquecimiento Spacetime v5.1 (micro-conteos, rigor arbitral, bandas epistémicas). */
  readonly v5?: MatchIntelligenceV5View | null;
  /** Player props ya cargados para el partido/liga. */
  readonly playerProps?: readonly PlayerPropItem[];
  /** Candidatos granulares de player props de fútbol (sujetos a guardia >= 45 min). */
  readonly footballPlayers?: readonly FootballPlayerPropCandidateInput[];
  /** Candidatos granulares de player props NBA (PTS / REB / AST / 3PM). */
  readonly nbaPlayers?: readonly NbaPlayerPropCandidateInput[];
  /** Historial reciente real de equipo local/visitante para ventanas L5/L10/L20/Local-Visita. */
  readonly homeHistory?: readonly TeamMatchEvidenceRecord[];
  readonly awayHistory?: readonly TeamMatchEvidenceRecord[];
  /** Marcador F5 y estadísticas finales reales (para liquidar picks en partidos `FT`). */
  readonly f5Score?: { readonly home: number; readonly away: number } | null;
  readonly finalStats?: MatchFinalCountStats | null;
  /** IDs explícitamente abiertos para visitante (Pick Abierto del Día / Tipster semanal). */
  readonly unlockedPickIds?: ReadonlySet<string>;
  /** Subconjunto opcional de familias solicitadas por la vista. */
  readonly families?: readonly MarketFamilyId[];
  /** Método preferido de de-vig (`auto` usa Shin en overround >= 3.5 % y proporcional en sharp). */
  readonly deVigPreference?: "auto" | "proportional" | "shin";
  /** Tope de selecciones por familia para mantener el payload ligero (por defecto `4`). */
  readonly maxPicksPerFamily?: number;
  /** Tope global de selecciones por partido (por defecto `48`). */
  readonly maxTotalPicks?: number;
  /** Tope de marcadores redactados para visitante (por defecto `8`). */
  readonly maxVisitorLockedSlots?: number;
  /** Si `true`, recorta `bookQuotes` y viñetas secundarias para transporte RSC mínimo. */
  readonly compact?: boolean;
  /** Timestamp ISO determinista opcional. */
  readonly nowIso?: string;
}

const DEFAULT_MAX_PICKS_PER_FAMILY = 4;
const DEFAULT_MAX_TOTAL_PICKS = 48;
const DEFAULT_MAX_VISITOR_LOCKED_SLOTS = 8;

/**
 * Redacta un pick bloqueado bajo la política `Cero-Fuga`:
 * ninguna probabilidad, cuota justa/casa, EV, ventaja, lado, línea, evidencia ni jugador
 * se serializa hacia visitantes sin Pase PitchLab Ultra activo.
 */
export function redactCatalogPickForVisitor(item: CatalogPickItem): CatalogPickItem {
  return {
    id: item.id,
    gameId: item.gameId,
    league: item.league,
    leagueLabel: item.leagueLabel,
    sport: item.sport,
    matchLabel: item.matchLabel,
    kickoffUtc: item.kickoffUtc,
    kickoffLocal: item.kickoffLocal,
    gameStatus: item.gameStatus,
    family: item.family,
    familyLabel: item.familyLabel,
    category: item.category,
    axis: item.axis,
    selectionKey: "locked",
    label: "Selección reservada Pase PitchLab Ultra",
    line: null,
    direction: "combo",
    pricing: {
      p: 0,
      fairOdds: 0,
      fairAmerican: 0,
      marketDecimal: null,
      marketAmerican: null,
      marketBookLabel: null,
      marketCapturedAtUtc: null,
      deVigMarketProb: null,
      deVigMethod: "none",
      overroundPct: null,
      evPct: null,
      edgePts: null,
      noVigEdgePts: null,
      valueLabel: null,
      hasPositiveValue: false,
    },
    evidence: {
      windows: [],
      xgSignal: null,
      refereeSignal: null,
      bullets: [],
      avgObservedRatePct: null,
    },
    settlement: "pending",
    engineName: "PitchLab Spacetime v5.1",
    isPrimaryModelPick: item.isPrimaryModelPick,
    isDerived: item.isDerived,
    conflictGroup: "independent",
    playerMeta: null,
    isDailyOpenPromo: false,
    isTipsterWeeklyOpen: false,
    isRedacted: true,
  };
}

function rankPickForCompaction(item: CatalogPickItem): number {
  const primaryBonus = item.isPrimaryModelPick ? 100 : 0;
  const valueBonus =
    item.pricing.hasPositiveValue && item.pricing.evPct !== null
      ? 40 + Math.min(30, item.pricing.evPct * 2)
      : 0;
  const quoteBonus = item.pricing.marketDecimal !== null ? 15 : 0;
  // Prioriza líneas balanceadas y accionables (evita extremos 2 % / 98 % antes de líneas centrales)
  const balanceScore = 30 - Math.abs(item.pricing.p - 0.58) * 50;
  return primaryBonus + valueBonus + quoteBonus + balanceScore;
}

function rebuildCatalogSummary(
  base: MatchPicksCatalog,
  picks: readonly CatalogPickItem[],
  isRedactedForVisitor: boolean,
): MatchPicksCatalog {
  const familyCounts: Partial<Record<MarketFamilyId, number>> = {};
  const availableFamilies: MarketFamilyId[] = [];
  for (const item of picks) {
    const prev = familyCounts[item.family] ?? 0;
    if (prev === 0) availableFamilies.push(item.family);
    familyCounts[item.family] = prev + 1;
  }
  return {
    ...base,
    isRedactedForVisitor,
    totalPicks: picks.length,
    availableFamilies,
    familyCounts,
    picks,
  };
}

/**
 * Compacta un catálogo de partido preservando representatividad en todas las familias activas
 * sin inflar el payload serializado para rutas RSC (`/app/[league]/g/[gameSlug]` o `/app/picks`).
 */
export function compactCatalogPayload(
  catalog: MatchPicksCatalog,
  options: {
    readonly maxPicksPerFamily?: number;
    readonly maxTotalPicks?: number;
    readonly compact?: boolean;
  } = {},
): MatchPicksCatalog {
  const maxPerFamily = Math.max(1, options.maxPicksPerFamily ?? DEFAULT_MAX_PICKS_PER_FAMILY);
  const maxTotal = Math.max(1, options.maxTotalPicks ?? DEFAULT_MAX_TOTAL_PICKS);
  const compactMode = options.compact ?? true;

  // Agrupar por familia manteniendo el orden canónico de aparición
  const byFamily = new Map<MarketFamilyId, CatalogPickItem[]>();
  for (const item of catalog.picks) {
    const list = byFamily.get(item.family) ?? [];
    list.push(item);
    byFamily.set(item.family, list);
  }

  const trimmedPerFamily: CatalogPickItem[] = [];
  for (const items of byFamily.values()) {
    const sorted = items
      .slice()
      .sort((a, b) => rankPickForCompaction(b) - rankPickForCompaction(a))
      .slice(0, maxPerFamily);
    trimmedPerFamily.push(...sorted);
  }

  // Selección final garantizando al menos el mejor pick de cada familia antes de rellenar hasta maxTotal
  const selected: CatalogPickItem[] = [];
  const selectedIds = new Set<string>();

  for (const items of byFamily.values()) {
    if (selected.length >= maxTotal) break;
    const best = items
      .slice()
      .sort((a, b) => rankPickForCompaction(b) - rankPickForCompaction(a))[0];
    if (best && !selectedIds.has(best.id)) {
      selectedIds.add(best.id);
      selected.push(best);
    }
  }

  const remainder = trimmedPerFamily
    .filter((item) => !selectedIds.has(item.id))
    .sort((a, b) => rankPickForCompaction(b) - rankPickForCompaction(a));

  for (const item of remainder) {
    if (selected.length >= maxTotal) break;
    selectedIds.add(item.id);
    selected.push(item);
  }

  const finalPicks = compactMode
    ? selected.map((item) => ({
        ...item,
        evidence: {
          ...item.evidence,
          windows: item.evidence.windows.slice(0, 3),
          bullets: item.evidence.bullets.slice(0, 3),
        },
        ...(item.bookQuotes && item.bookQuotes.length > 0
          ? { bookQuotes: item.bookQuotes.slice(0, 2) }
          : {}),
      }))
    : selected;

  return rebuildCatalogSummary(catalog, finalPicks, catalog.isRedactedForVisitor);
}

/**
 * Función pura de servidor para construir el catálogo de picks de un partido:
 * - Aplica `Cero-Fuga` estricta cuando `fullAccess === false` en partidos `NS` / `LIVE`.
 * - Mantiene auditable y sin redacción cualquier partido `FT` con su estado `hit | miss | push | pending`.
 * - Compacta el payload para mantener respuestas rápidas sin inflar el shell RSC inicial.
 */
export function buildServerMatchPicksCatalog(
  game: PlatformGame,
  options: ServerMatchPicksCatalogOptions,
): MatchPicksCatalog {
  const ctx: CatalogBuildContext = {
    markets: options.markets ?? game.markets,
    v5: options.v5 ?? null,
    playerProps: options.playerProps,
    footballPlayers: options.footballPlayers,
    nbaPlayers: options.nbaPlayers,
    homeHistory: options.homeHistory,
    awayHistory: options.awayHistory,
    f5Score: options.f5Score ?? null,
    finalStats: options.finalStats ?? null,
    deVigPreference: options.deVigPreference ?? "auto",
    nowIso: options.nowIso,
  };

  let catalog = buildMatchPicksCatalog(game, ctx);

  if (options.families && options.families.length > 0) {
    const allowed = new Set<MarketFamilyId>(options.families);
    const filtered = catalog.picks.filter((item) => allowed.has(item.family));
    catalog = rebuildCatalogSummary(catalog, filtered, false);
  }

  // Partidos FT siempre auditables; socios con fullAccess ven el catálogo completo compactado
  if (options.fullAccess || game.status === "FT") {
    return compactCatalogPayload(catalog, {
      maxPicksPerFamily: options.maxPicksPerFamily,
      maxTotalPicks: options.maxTotalPicks,
      compact: options.compact ?? true,
    });
  }

  // Visitante en partido NS / LIVE: política Cero-Fuga estricta
  const unlockedIds = options.unlockedPickIds ?? new Set<string>();
  const maxLockedSlots = Math.max(
    0,
    options.maxVisitorLockedSlots ?? DEFAULT_MAX_VISITOR_LOCKED_SLOTS,
  );

  const openPicks: CatalogPickItem[] = [];
  const redactedByFamily = new Map<MarketFamilyId, CatalogPickItem>();

  for (const item of catalog.picks) {
    const isUnlocked =
      Boolean(item.isDailyOpenPromo) ||
      Boolean(item.isTipsterWeeklyOpen) ||
      unlockedIds.has(item.id);
    if (isUnlocked) {
      openPicks.push(item);
    } else if (!redactedByFamily.has(item.family) && redactedByFamily.size < maxLockedSlots) {
      redactedByFamily.set(item.family, redactCatalogPickForVisitor(item));
    }
  }

  const visitorPicks = [...openPicks, ...redactedByFamily.values()];
  return rebuildCatalogSummary(catalog, visitorPicks, true);
}

/**
 * Construye catálogos compactos en lote para vistas multi-partido (p. ej. `/app/picks`)
 * respetando la misma frontera `Cero-Fuga` por sesión.
 */
export function buildServerMatchPicksCatalogsBatch(
  games: readonly PlatformGame[],
  options: Omit<
    ServerMatchPicksCatalogOptions,
    "markets" | "v5" | "homeHistory" | "awayHistory" | "f5Score" | "finalStats"
  > & {
    readonly detailsByGameId?: ReadonlyMap<
      string,
      {
        readonly markets?: readonly PlatformMarketRow[];
        readonly v5?: MatchIntelligenceV5View | null;
      }
    >;
  },
): ReadonlyMap<string, MatchPicksCatalog> {
  const result = new Map<string, MatchPicksCatalog>();
  for (const game of games) {
    const detail = options.detailsByGameId?.get(game.id);
    const catalog = buildServerMatchPicksCatalog(game, {
      ...options,
      markets: detail?.markets ?? game.markets,
      v5: detail?.v5 ?? null,
      maxPicksPerFamily: options.maxPicksPerFamily ?? 2,
      maxTotalPicks: options.maxTotalPicks ?? 18,
      compact: options.compact ?? true,
    });
    result.set(game.id, catalog);
  }
  return result;
}
