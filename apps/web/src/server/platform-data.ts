import { cache } from "react";
import { COMPETITION_BY_ID, type StandingRow } from "@pitchlab/contracts";
import { redactDatasetForVisitor } from "@pitchlab/ui/access-guard";
import { ALLOWED_BOOKMAKER_IDS } from "@pitchlab/ui/bookmakers";
import { buildPlatformDataset, type RawLeagueInput } from "@pitchlab/ui/picks-engine";
import type { ViewerIdentity } from "@pitchlab/ui/platform-provider";
import type {
  MatchPick,
  PaymentMode,
  PlatformDataset,
  PlatformGame,
  PlatformGameDetail,
  ViewerRole,
  ViewerVia,
} from "@pitchlab/ui/types";
import { paymentMode } from "./billing/payment-mode";
import { getViewerAccess } from "./viewer-access";
import { buildSpacetimeSignals } from "./spacetime";
import { buildMatchDetailV5 } from "./spacetime-v5";
import { resolveServerFrozenMainPick } from "./frozen-picks";
import { applyOutlook, outlookDetailFor } from "./outlook";
import {
  buildDerivedFootballFallbackRows,
  buildDerivedUsSportRows,
} from "./outlook-derived-rows";
import {
  enrichDatasetWithBookQuotes,
  enrichMarketRowsWithBookQuotes,
} from "./book-quotes";
import {
  createDb,
  eq,
  FLAG_MONTH1_NO_CARD,
  getBoolFlag,
  publicWeeklyPicks,
  type Db,
} from "@pitchlab/db";
import {
  loadAllActiveLeagueSnapshots,
  PRODUCT_LEAGUES,
  type ProductLeague,
} from "./snapshots";
import {
  buildTeamsDirectoryFromEnvelopes,
  loadLeaguePlayerProps,
} from "./team-profile";

export { PRODUCT_LEAGUES, type ProductLeague };

export interface LoadedPlatformState {
  dataset: PlatformDataset;
  initialRole: ViewerRole;
  hasActiveSession: boolean;
  /** Selector de rol y barra de 11 vistas: solo con sesión y herramientas de preview activas. */
  allowRoleSimulation: boolean;
  /** Cuentas reales activas (DATABASE_URL + BETTER_AUTH_SECRET). */
  accountsEnabled: boolean;
  /** Vía de acceso autenticada (`account`, `beta` o `none`). */
  viewerVia: ViewerVia;
  /** Modo de cobro activo (`transfer` por defecto en Beta 1.0, o `stripe`). */
  paymentMode: PaymentMode;
  /** Política de prueba leída de la base; undefined sin cuentas. */
  serverMonth1NoCardMode?: boolean;
  /** Socio con cuenta y usuario elegido; null con PIN o visitante. */
  viewerIdentity: ViewerIdentity | null;
  /** En `/p/[pickId]`: `true` solo si `pickId` corresponde a un slug semanal público autorizado. */
  publicPickResolved?: boolean;
}

/** Identidad para la interfaz: solo con cuenta y con @usuario ya elegido. */
export async function loadViewerIdentity(): Promise<ViewerIdentity | null> {
  const { profile } = await getViewerAccess();
  if (!profile?.handle) return null;
  return {
    handle: profile.handle,
    displayName: profile.displayName,
    initials: profile.initials,
    avatarUrl: profile.avatarUrl,
    referralCode: profile.referralCode,
  };
}

let flagDb: Db | null = null;

/** Bandera «Mes 1 sin tarjeta» desde la base cuando hay cuentas (si falla, se omite). */
export async function loadMonth1Flag(): Promise<boolean | undefined> {
  const url = process.env.DATABASE_URL;
  if (!accountsEnabled() || !url) return undefined;
  try {
    flagDb ??= createDb(url) as unknown as Db;
    return await getBoolFlag(flagDb, FLAG_MONTH1_NO_CARD, true);
  } catch (err) {
    console.warn("[platform] no se pudo leer la bandera de prueba:", err);
    return undefined;
  }
}

export function accountsEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET);
}

/**
 * Herramientas de revisión (selector de rol, barra rápida). Encendidas en desarrollo;
 * en producción solo si `PITCHLAB_PREVIEW_TOOLS=1` Y quien mira es administrador verificado.
 */
export function previewToolsEnabled(viewerIsAdmin: boolean = false): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.PITCHLAB_PREVIEW_TOOLS === "1" && viewerIsAdmin;
}

/** Cuánto vive el dataset calculado en memoria del servidor. Los snapshots cambian una vez al día. */
const DATASET_TTL_MS = 5 * 60 * 1000;

interface DatasetMemoBundle {
  value: PlatformDataset;
  gamesById: Map<string, PlatformGame>;
  redactedValue: PlatformDataset | null;
  redactedGamesById: Map<string, PlatformGame> | null;
  slimMemberShell: PlatformDataset | null;
  slimVisitorShell: PlatformDataset | null;
  initialMemberShell: PlatformDataset | null;
  initialVisitorShell: PlatformDataset | null;
  at: number;
}

let datasetMemo: DatasetMemoBundle | null = null;

function getDatasetMemoBundle(): DatasetMemoBundle {
  const now = Date.now();
  if (datasetMemo && now - datasetMemo.at < DATASET_TTL_MS) return datasetMemo;
  const value = buildServerRawPlatformDatasetUncached();
  const gamesById = new Map<string, PlatformGame>();
  for (const g of value.games) gamesById.set(g.id, g);
  datasetMemo = {
    value,
    gamesById,
    redactedValue: null,
    redactedGamesById: null,
    slimMemberShell: null,
    slimVisitorShell: null,
    initialMemberShell: null,
    initialVisitorShell: null,
    at: now,
  };
  return datasetMemo;
}

function getRedactedMemo(bundle: DatasetMemoBundle): {
  dataset: PlatformDataset;
  gamesById: Map<string, PlatformGame>;
} {
  if (!bundle.redactedValue || !bundle.redactedGamesById) {
    const redacted = redactDatasetForVisitor(bundle.value);
    const map = new Map<string, PlatformGame>();
    for (const g of redacted.games) map.set(g.id, g);
    bundle.redactedValue = redacted;
    bundle.redactedGamesById = map;
  }
  return { dataset: bundle.redactedValue, gamesById: bundle.redactedGamesById };
}

function getSlimMemberShell(bundle: DatasetMemoBundle): PlatformDataset {
  if (!bundle.slimMemberShell) {
    bundle.slimMemberShell = withoutGameDetail(upcomingPlusRecentFinished(bundle.value, 12));
  }
  return bundle.slimMemberShell;
}

function getSlimVisitorShell(bundle: DatasetMemoBundle): PlatformDataset {
  if (!bundle.slimVisitorShell) {
    const { dataset } = getRedactedMemo(bundle);
    bundle.slimVisitorShell = withoutGameDetail(upcomingPlusRecentFinished(dataset, 12));
  }
  return bundle.slimVisitorShell;
}

function mxDayId(date: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch (err) {
    void err;
    return date.toISOString().slice(0, 10);
  }
}

const INITIAL_SHELL_MAX_GAMES = 52;
/** Presupuesto estricto del tramo 1 RSC (< 500 KB con margen de 20 KB para envoltorio Flight). */
const INITIAL_SHELL_MAX_BYTES = 480 * 1024;

function compareShellGamePriority(a: PlatformGame, b: PlatformGame): number {
  const aCore = CORE_SHELL_LEAGUES.has(a.league) ? 0 : 1;
  const bCore = CORE_SHELL_LEAGUES.has(b.league) ? 0 : 1;
  if (aCore !== bCore) return aCore - bCore;
  const aTier = COMPETITION_BY_ID[a.league]?.prestigeTier ?? 4;
  const bTier = COMPETITION_BY_ID[b.league]?.prestigeTier ?? 4;
  if (aTier !== bTier) return aTier - bTier;
  return (a.kickoffUtc || "").localeCompare(b.kickoffUtc || "");
}

function filterTeamsForGames(
  teams: PlatformDataset["teams"],
  games: readonly PlatformGame[],
): NonNullable<PlatformDataset["teams"]> {
  const keys = new Set<string>();
  for (const g of games) {
    keys.add(`${g.league}:${g.home.slug}`);
    keys.add(`${g.league}:${g.away.slug}`);
  }
  return (teams ?? []).filter((t) => keys.has(`${t.league}:${t.slug}`));
}

/**
 * Shell RSC en dos tiempos (ADR-053): conserva en el primer HTML únicamente la ventana inmediata
 * (picks promocionales + en vivo + hoy + ligas prioritarias de mañana) sin `parlayCandidates`
 * ni campos enriquecidos de detalle/Bzzoiro, aplicando un tope duro de juegos (`52`) y bytes (`< 500 KB`).
 * El resto del horizonte (7 días / todas las ligas / `parlayCandidates`) llega vía `/api/shell/extend`
 * al estar ocioso el navegador o al interactuar con buscador/filtros/parlays.
 */
export function splitInitialShellDataset(
  slim: PlatformDataset,
  nowMs: number = Date.now(),
): PlatformDataset {
  const todayStr = mxDayId(new Date(nowMs));
  const tomorrowStr = mxDayId(new Date(nowMs + 86_400_000));

  const upcomingDays = Array.from(
    new Set(
      slim.games
        .filter((g) => g.status !== "FT" && g.dayId)
        .map((g) => g.dayId),
    ),
  ).sort();
  const primaryDay =
    upcomingDays.includes(todayStr)
      ? todayStr
      : (upcomingDays.find((d) => d >= todayStr) ?? upcomingDays[0] ?? todayStr);
  const secondaryDay =
    primaryDay === todayStr
      ? tomorrowStr
      : (upcomingDays.find((d) => d > primaryDay) ?? tomorrowStr);

  const isPromoGame = (g: PlatformGame): boolean =>
    g.picks.some(
      (p) =>
        (slim.dailyPromoPickId && p.id === slim.dailyPromoPickId) ||
        (slim.tipsterWeeklyPickId && p.id === slim.tipsterWeeklyPickId),
    );

  const selected: PlatformGame[] = [];
  const selectedIds = new Set<string>();
  const promoGameIds = new Set<string>();
  const addGame = (g: PlatformGame): void => {
    if (selected.length >= INITIAL_SHELL_MAX_GAMES || selectedIds.has(g.id)) return;
    selectedIds.add(g.id);
    if (isPromoGame(g)) promoGameIds.add(g.id);
    // Proyección explícita del tramo 1: omite `parlayCandidates` y garantiza cero campos
    // pesados de detalle o Bzzoiro (shotmap, posiciones medias, líneas extendidas, evidencia).
    selected.push(
      projectShellGame(g, {
        keepParlayCandidates: false,
        isVisitorRedacted: slim.isServerRedactedForVisitor,
      }),
    );
  };

  // 1a) Partidos que contienen los picks promocionales abiertos del día / semana
  for (const g of slim.games) {
    if (selected.length >= INITIAL_SHELL_MAX_GAMES) break;
    if (isPromoGame(g)) {
      addGame(g);
    }
  }

  // 1b) Partidos LIVE ordenados por CORE_SHELL_LEAGUES y prestigio, respetando INITIAL_SHELL_MAX_GAMES
  const liveGames = slim.games
    .filter((g) => g.status === "LIVE")
    .sort(compareShellGamePriority);
  for (const g of liveGames) {
    if (selected.length >= INITIAL_SHELL_MAX_GAMES) break;
    addGame(g);
  }

  // 2) Todos los partidos del día principal (Hoy) ordenados por prestigio y hora
  const primaryGames = slim.games
    .filter((g) => g.status !== "FT" && g.dayId === primaryDay)
    .sort(compareShellGamePriority);
  for (const g of primaryGames) {
    if (selected.length >= INITIAL_SHELL_MAX_GAMES) break;
    addGame(g);
  }

  // 3) Ligas prioritarias/core del día siguiente (Mañana) hasta el tope del tramo 1
  if (selected.length < INITIAL_SHELL_MAX_GAMES) {
    const secondaryGames = slim.games
      .filter((g) => {
        if (g.status === "FT" || g.dayId !== secondaryDay) return false;
        if (CORE_SHELL_LEAGUES.has(g.league)) return true;
        const tier = COMPETITION_BY_ID[g.league]?.prestigeTier ?? 4;
        return tier <= 2;
      })
      .sort(compareShellGamePriority);
    for (const g of secondaryGames) {
      if (selected.length >= INITIAL_SHELL_MAX_GAMES) break;
      addGame(g);
    }
  }

  // Respaldo si solo hay partidos FT
  if (selected.length === 0) {
    for (const g of slim.games.slice(0, 12)) addGame(g);
  }

  const stage1Leagues = slim.leagues.map((lg) => ({
    ...lg,
    standings: [],
  }));

  let stage1Games = selected;
  let stage1: PlatformDataset = {
    ...slim,
    playerProps: [],
    leagues: stage1Leagues,
    games: stage1Games,
    teams: filterTeamsForGames(slim.teams, stage1Games),
  };

  // Guardia determinista de presupuesto RSC (< 500 KB): si una jornada pico excede el tope,
  // primero compacta cuotas secundarias (que el tramo 2 `/api/shell/extend` hidrata en ocioso)
  // y después recorta partidos de menor prioridad preservando siempre los promocionales.
  if (Buffer.byteLength(JSON.stringify(stage1), "utf8") > INITIAL_SHELL_MAX_BYTES) {
    stage1Games = stage1Games.map((g) => ({
      ...g,
      picks: g.picks.map((pk, idx) =>
        idx === 0 ? pk : { ...pk, bookQuotes: undefined },
      ),
    }));
    stage1 = {
      ...stage1,
      games: stage1Games,
    };
  }

  while (
    stage1Games.length > 1 &&
    Buffer.byteLength(JSON.stringify(stage1), "utf8") > INITIAL_SHELL_MAX_BYTES
  ) {
    let dropIdx = -1;
    for (let i = stage1Games.length - 1; i >= 0; i -= 1) {
      if (!promoGameIds.has(stage1Games[i]!.id)) {
        dropIdx = i;
        break;
      }
    }
    if (dropIdx < 0) break;
    stage1Games = [...stage1Games.slice(0, dropIdx), ...stage1Games.slice(dropIdx + 1)];
    stage1 = {
      ...stage1,
      games: stage1Games,
      teams: filterTeamsForGames(slim.teams, stage1Games),
    };
  }

  return stage1;
}

function getInitialMemberShell(bundle: DatasetMemoBundle): PlatformDataset {
  if (!bundle.initialMemberShell) {
    bundle.initialMemberShell = splitInitialShellDataset(getSlimMemberShell(bundle));
  }
  return bundle.initialMemberShell;
}

function getInitialVisitorShell(bundle: DatasetMemoBundle): PlatformDataset {
  if (!bundle.initialVisitorShell) {
    bundle.initialVisitorShell = splitInitialShellDataset(getSlimVisitorShell(bundle));
  }
  return bundle.initialVisitorShell;
}

/** Tramo 2 diferido para `/api/shell/extend` respetando estrictamente Cero-Fuga. */
export function loadExtendedShellPayload(fullAccess: boolean): {
  games: PlatformGame[];
  teams: NonNullable<PlatformDataset["teams"]>;
  isRedactedForVisitor: boolean;
} {
  const bundle = getDatasetMemoBundle();
  const slim = fullAccess ? getSlimMemberShell(bundle) : getSlimVisitorShell(bundle);
  return {
    games: slim.games,
    teams: slim.teams ?? [],
    isRedactedForVisitor: !fullAccess,
  };
}

/**
 * Dataset completo de la jornada. Se guarda 5 minutos en memoria del servidor (calcular las
 * señales de Spacetime para todos los partidos es lo más caro de cada solicitud) y `cache`
 * evita repetirlo dentro de una misma solicitud.
 */
export const buildServerRawPlatformDataset = cache(function buildServerRawPlatformDatasetCached(): PlatformDataset {
  return getDatasetMemoBundle().value;
});

function buildServerRawPlatformDatasetUncached(): PlatformDataset {
  const envelopes = loadAllActiveLeagueSnapshots();
  const inputs: RawLeagueInput[] = [];

  for (const leagueKey of PRODUCT_LEAGUES) {
    const env = envelopes[leagueKey];
    if (env?.data) {
      // Panorama v3.2: los partidos por jugar que estén en el snapshot del motor toman sus
      // probabilidades y mercados (Inicio, Picks, parlays y landing leen de aquí).
      const signals = buildSpacetimeSignals(env.data.games);
      const games = env.data.games.map((g) => {
        const applied = applyOutlook(g, signals[g.id] ?? null);
        if (applied.signal) signals[g.id] = applied.signal;
        return applied.match;
      });
      inputs.push({
        league: env.data.league,
        leagueLabel: env.data.leagueLabel,
        leagueLogoUrl: env.data.logoUrl,
        sport: env.data.sport,
        season: env.data.season,
        roundLabel: env.data.roundLabel,
        generatedAt: env.data.generatedAt,
        games,
        standings: env.data.standings,
        spacetime: signals,
      });
    }
  }

  const dataset = enrichDatasetWithBookQuotes(buildPlatformDataset(inputs));

  return {
    ...dataset,
    teams: buildTeamsDirectoryFromEnvelopes(envelopes),
    playerProps: loadLeaguePlayerProps(dataset.games),
  };
}

/**
 * Lo que manda el layout del club: solo los partidos por jugar (con sus picks). Los terminados
 * los piden Resultados, la página de cada liga y la ficha de un partido ya jugado.
 * Si no hay partidos por jugar, se mandan los terminados para no dejar la portada vacía.
 */
export function upcomingOnly(dataset: PlatformDataset): PlatformDataset {
  const upcoming = dataset.games.filter((g) => g.status !== "FT");
  return upcoming.length > 0 ? { ...dataset, games: upcoming } : dataset;
}

const CORE_SHELL_LEAGUES = new Set<string>([
  "liga-mx",
  "premier-league",
  "laliga",
  "bundesliga",
  "serie-a",
  "ligue-1",
  "nfl",
  "nba",
  "nhl",
  "mlb",
]);

export function upcomingPlusRecentFinished(
  dataset: PlatformDataset,
  maxFinished = 12,
): PlatformDataset {
  const upcomingAll = dataset.games.filter((g) => g.status !== "FT");
  if (upcomingAll.length === 0) return dataset;
  const nowMs = Date.now();
  // Ventana de 8 días para ligas de expansión (cubre "Hoy" y "Próximos 7 días" completos);
  // las páginas `/app/[league]` cargan toda la agenda de esa liga bajo demanda.
  const maxExpansionHorizonMs = nowMs + 8 * 86_400_000;
  const perExpansionCount = new Map<string, number>();

  const upcoming = upcomingAll
    .slice()
    .sort((a, b) => (a.kickoffUtc || "").localeCompare(b.kickoffUtc || ""))
    .filter((g) => {
      if (g.status === "LIVE" || CORE_SHELL_LEAGUES.has(g.league)) return true;
      const ms = Date.parse(g.kickoffUtc);
      if (Number.isFinite(ms) && ms > maxExpansionHorizonMs) return false;
      const seen = perExpansionCount.get(g.league) ?? 0;
      if (seen >= 6) return false;
      perExpansionCount.set(g.league, seen + 1);
      return true;
    });

  const recentFinished = dataset.games
    .filter((g) => g.status === "FT")
    .sort((a, b) => (b.kickoffUtc || "").localeCompare(a.kickoffUtc || ""))
    .slice(0, maxFinished);
  return { ...dataset, games: [...upcoming, ...recentFinished] };
}

async function redactedForViewer(): Promise<PlatformDataset> {
  const bundle = getDatasetMemoBundle();
  return (await hasAuthenticatedBetaSession()) ? bundle.value : getRedactedMemo(bundle).dataset;
}

/** Tabla de posiciones de una sola liga (evita serializar las 57 tablas en cada página del shell). */
export function loadLeagueStandings(league: ProductLeague): StandingRow[] {
  const full = buildServerRawPlatformDataset();
  return full.leagues.find((l) => l.league === league)?.standings ?? [];
}

/** Todos los partidos de una liga (por jugar + terminados, sin detalle pesado) para `/app/[league]`. */
export async function loadLeagueHubGames(league: ProductLeague): Promise<PlatformGame[]> {
  const dataset = await redactedForViewer();
  return dataset.games
    .filter((g) => g.league === league)
    .map((g) => ({
      ...g,
      markets: [],
      headToHead: [],
      factors: [],
    }));
}

/** Partidos terminados (sin detalle pesado), opcionalmente de una liga. */
export async function loadFinishedGames(league?: string): Promise<PlatformGame[]> {
  const dataset = await redactedForViewer();
  return withoutGameDetail({
    ...dataset,
    games: dataset.games.filter((g) => g.status === "FT" && (!league || g.league === league)),
  }).games;
}

/** Un partido sin detalle pesado, para la ficha de un partido que el layout no trae. */
export async function loadGameSummary(gameId: string): Promise<PlatformGame | null> {
  const bundle = getDatasetMemoBundle();
  const hasSession = await hasAuthenticatedBetaSession();
  const game = hasSession
    ? bundle.gamesById.get(gameId)
    : getRedactedMemo(bundle).gamesById.get(gameId);
  return game ? { ...game, markets: [], headToHead: [], factors: [] } : null;
}

/** Props de jugadores bajo demanda para `/app/props` (fuera del shell compartido). */
export function loadShellPlayerProps(options?: { fullAccess?: boolean }) {
  if (options && options.fullAccess === false) {
    return [];
  }
  return buildServerRawPlatformDataset().playerProps ?? [];
}

/**
 * Proyección explícita de `MatchPick` para el shell compartido (lista blanca de campos).
 * Garantiza que ningún campo enriquecido de detalle/Bzzoiro (evidencia multi-ventana,
 * comparativas extendidas de casas o metadatos internos) infle el shell ni se filtre a visitantes.
 */
function projectShellPick(
  pk: MatchPick,
  opts: { includeQuotes: boolean },
): MatchPick {
  const roundedP = Math.round(pk.p * 10_000) / 10_000;
  let compactQuotes: MatchPick["bookQuotes"] = undefined;

  if (opts.includeQuotes && !pk.isRedacted && pk.bookQuotes && pk.bookQuotes.length > 0) {
    const filtered = pk.bookQuotes
      .filter(
        (q) =>
          q.isBest ||
          ALLOWED_BOOKMAKER_IDS.has(q.book) ||
          (q.openingDecimal != null &&
            q.openingDecimal > 1 &&
            Math.abs((q.decimal - q.openingDecimal) / q.openingDecimal) >= 0.05),
      )
      .slice(0, 3)
      .map((q) => ({
        book: q.book,
        bookLabel: q.bookLabel,
        decimal: q.decimal,
        capturedAtUtc:
          q.capturedAtUtc && q.capturedAtUtc !== pk.marketCapturedAtUtc
            ? q.capturedAtUtc
            : "",
        ...(q.openingDecimal != null && Math.abs(q.openingDecimal - q.decimal) >= 0.01
          ? { openingDecimal: q.openingDecimal }
          : {}),
        ...(q.movementDirection && q.movementDirection !== "stable"
          ? { movementDirection: q.movementDirection }
          : {}),
        ...(q.isBest ? { isBest: true } : {}),
      }));
    if (filtered.length > 0) {
      compactQuotes = filtered;
    }
  }

  return {
    id: pk.id,
    gameId: pk.gameId,
    league: pk.league,
    leagueLabel: pk.leagueLabel,
    matchLabel: pk.matchLabel,
    kickoffLocal: pk.kickoffLocal,
    gameStatus: pk.gameStatus,
    slotIndex: pk.slotIndex,
    category: pk.category,
    categoryLabel: pk.categoryLabel,
    risk: pk.risk,
    engineKey: pk.engineKey,
    engineName: pk.engineName,
    marketGroup: pk.marketGroup,
    selectionKey: pk.selectionKey,
    ...(pk.market !== undefined ? { market: pk.market } : {}),
    ...(pk.line !== undefined ? { line: pk.line } : {}),
    conflictGroup: pk.conflictGroup,
    label: pk.label,
    rationale: "",
    p: roundedP,
    fairDecimal: pk.fairDecimal,
    fairAmerican: pk.fairAmerican,
    marketDecimal: pk.marketDecimal,
    marketAmerican: pk.marketAmerican,
    ...(pk.marketBookLabel !== undefined ? { marketBookLabel: pk.marketBookLabel } : {}),
    ...(pk.marketCapturedAtUtc !== undefined
      ? { marketCapturedAtUtc: pk.marketCapturedAtUtc }
      : {}),
    ...(compactQuotes ? { bookQuotes: compactQuotes } : {}),
    edgePts: pk.edgePts,
    confidenceScore: pk.confidenceScore,
    suggestedUnits: pk.suggestedUnits,
    ...(pk.result !== undefined ? { result: pk.result } : {}),
    ...(pk.isDailyOpenPromo ? { isDailyOpenPromo: true } : {}),
    ...(pk.isTipsterWeeklyOpen ? { isTipsterWeeklyOpen: true } : {}),
    ...(pk.tipsterSlug ? { tipsterSlug: pk.tipsterSlug } : {}),
    ...(pk.isRedacted !== undefined ? { isRedacted: pk.isRedacted } : {}),
  };
}

/**
 * Proyección explícita de `PlatformGame` para el shell compartido (Etapa 1 y Etapa 2).
 * Cualquier campo enriquecido nuevo de Bzzoiro (shotmap, posiciones medias, líneas extendidas,
 * evidencia multi-ventana, catálogo extendido o alineaciones probables) queda fuera del shell
 * y se carga exclusivamente bajo demanda en `loadGameDetail` / rutas de detalle.
 */
function projectShellGame(
  g: PlatformGame,
  opts: { keepParlayCandidates: boolean; isVisitorRedacted: boolean },
): PlatformGame {
  const isFinished = g.status === "FT";
  const hasPromoOpenPick = g.picks.some(
    (p) => Boolean(p.isDailyOpenPromo) || Boolean(p.isTipsterWeeklyOpen),
  );
  const lockedVisitorGame = opts.isVisitorRedacted && !isFinished && !hasPromoOpenPick;
  const shellPicks = isFinished ? g.picks.slice(0, 2) : g.picks;

  const projectedParlayCandidates =
    opts.keepParlayCandidates &&
    !isFinished &&
    !lockedVisitorGame &&
    g.parlayCandidates &&
    g.parlayCandidates.length > 0
      ? g.parlayCandidates
          .slice(0, 3)
          .map((pk) => projectShellPick(pk, { includeQuotes: false }))
      : undefined;

  const canKeepMatchContext =
    !lockedVisitorGame &&
    !g.preGame?.isRedacted &&
    Boolean(
      g.preGame?.matchContext &&
        (g.preGame.matchContext.isLocalDerby ||
          g.preGame.matchContext.referee ||
          g.preGame.matchContext.refereeStats),
    );

  return {
    id: g.id,
    league: g.league,
    leagueLabel: g.leagueLabel,
    ...(g.leagueLogoUrl ? { leagueLogoUrl: g.leagueLogoUrl } : {}),
    sport: g.sport,
    round: g.round,
    dayId: g.dayId,
    dayLabel: g.dayLabel,
    kickoffUtc: g.kickoffUtc,
    kickoffLocal: g.kickoffLocal,
    venue: g.venue,
    ...(g.referee ? { referee: g.referee } : {}),
    ...(g.neutralSite !== undefined ? { neutralSite: g.neutralSite } : {}),
    status: g.status,
    ...(g.score ? { score: g.score } : {}),
    home: g.home,
    away: g.away,
    ...(g.hasForecast !== undefined ? { hasForecast: g.hasForecast } : {}),
    x12: g.x12,
    projection: g.projection,
    ...(g.goalLine !== undefined ? { goalLine: g.goalLine } : {}),
    confidenceScore: g.confidenceScore,
    confidenceLevel: g.confidenceLevel,
    picks: shellPicks.map((pk) =>
      projectShellPick(pk, { includeQuotes: !isFinished && !lockedVisitorGame }),
    ),
    ...(projectedParlayCandidates ? { parlayCandidates: projectedParlayCandidates } : {}),
    preGame: g.preGame
      ? {
          isRedacted: g.preGame.isRedacted,
          cortexSynthesis: "",
          tacticalKeys: [],
          lineupStatusLabel: "",
          lineupsConfirmed60m: g.preGame.lineupsConfirmed60m,
          confirmedLineups: null,
          absences: [],
          moneyFlow: null,
          ...(canKeepMatchContext && g.preGame.matchContext
            ? {
                matchContext: {
                  ...(g.preGame.matchContext.isLocalDerby ? { isLocalDerby: true } : {}),
                  ...(g.preGame.matchContext.referee
                    ? { referee: g.preGame.matchContext.referee }
                    : {}),
                  ...(g.preGame.matchContext.refereeStats
                    ? { refereeStats: g.preGame.matchContext.refereeStats }
                    : {}),
                },
              }
            : {}),
        }
      : g.preGame,
    markets: [],
    factors: [],
    headToHead: [],
    ...(g.restDays ? { restDays: g.restDays } : {}),
    ...(g.counts && !lockedVisitorGame ? { counts: g.counts } : {}),
    updatedAtLabel: g.updatedAtLabel,
    spacetime: null,
  };
}

/**
 * Quita el detalle pesado de cada partido y del shell compartido (mercados, H2H, factores,
 * tablas de las 57 ligas, `bookQuotes` redundantes en `parlayCandidates`, prosa `preGame`
 * que solo consume la ficha individual, `playerProps` exclusivos de `/app/props` y cualquier
 * campo enriquecido de Bzzoiro reservado para detalle).
 * Cada página de liga, partido o props recibe su detalle puntual en servidor.
 */
export function withoutGameDetail(dataset: PlatformDataset): PlatformDataset {
  const parlayCandidateHorizonMs = Date.now() + 2 * 86_400_000;
  const activeShellLeagues = new Set<string>([
    ...CORE_SHELL_LEAGUES,
    ...dataset.games.map((g) => g.league),
  ]);
  return {
    ...dataset,
    playerProps: [],
    leagues: dataset.leagues.map((lg) => ({
      ...lg,
      standings: [],
    })),
    teams: (dataset.teams ?? []).filter((t) => {
      if (CORE_SHELL_LEAGUES.has(t.league)) return true;
      if (!activeShellLeagues.has(t.league)) return false;
      const tier = COMPETITION_BY_ID[t.league]?.prestigeTier ?? 4;
      return tier <= 2;
    }),
    games: dataset.games.map((g) => {
      const kickoffMs = Date.parse(g.kickoffUtc);
      const keepParlayCandidates =
        g.status !== "FT" &&
        (!Number.isFinite(kickoffMs) || kickoffMs <= parlayCandidateHorizonMs);
      return projectShellGame(g, {
        keepParlayCandidates,
        isVisitorRedacted: dataset.isServerRedactedForVisitor,
      });
    }),
  };
}

/**
 * Detalle bajo demanda de un partido (`/app/[league]/g/[gameSlug]`) con redacción Cero-Fuga.
 * Toda carga enriquecida (mercados extendidos, `outlook`, `v5`, shotmap, posiciones medias o
 * evidencia multi-ventana) vive exclusivamente aquí y jamás se serializa en la Etapa 1 del shell
 * ni se entrega a visitantes en partidos próximos/en vivo.
 */
export async function loadGameDetail(gameId: string): Promise<PlatformGameDetail | null> {
  const bundle = getDatasetMemoBundle();
  const hasSession = await hasAuthenticatedBetaSession();
  const game = hasSession
    ? bundle.gamesById.get(gameId)
    : getRedactedMemo(bundle).gamesById.get(gameId);
  if (!game) return null;
  if (!hasSession && game.status !== "FT") {
    return { markets: [], headToHead: game.headToHead, factors: [] };
  }
  // Partido por jugar en el panorama v3.2: sus mercados y su resumen reemplazan a los del snapshot,
  // conservando los grupos de conteos (corners_total, fouls_total, yellow_total) cuando existen.
  const v32 = game.status !== "FT" ? outlookDetailFor(game) : null;
  const countMarkets = game.markets.filter(
    (row) =>
      row.market === "corners_total" ||
      row.market === "fouls_total" ||
      row.market === "yellow_total",
  );
  const derivedFallbackRows =
    !v32 && game.status !== "FT"
      ? game.sport === "football"
        ? buildDerivedFootballFallbackRows(
            game,
            !game.markets.some((row) => row.market === "correct_score"),
          )
        : game.sport === "basketball" || game.sport === "ice-hockey" || game.sport === "baseball"
          ? buildDerivedUsSportRows({
              home: game.home,
              away: game.away,
              projection: game.projection,
              sport: game.sport,
              existingMarkets: game.markets,
            })
          : []
      : [];
  const rawBaseMarkets = v32 ? [...v32.markets, ...countMarkets] : [...game.markets, ...derivedFallbackRows];
  const v5Detail =
    game.status !== "FT"
      ? buildMatchDetailV5(game, {
          hasV32Outlook: Boolean(v32),
          existingMarkets: rawBaseMarkets,
        })
      : null;
  const rawMarkets = v5Detail ? [...rawBaseMarkets, ...v5Detail.extraMarkets] : rawBaseMarkets;
  const markets = enrichMarketRowsWithBookQuotes(game, rawMarkets);
  const frozenMainPick =
    game.status !== "FT" ? await resolveServerFrozenMainPick(game) : null;
  return {
    markets,
    headToHead: game.headToHead,
    factors: game.factors,
    outlook: v32?.outlook ?? v5Detail?.fallbackOutlook ?? null,
    v5: v5Detail?.v5 ?? null,
    frozenMainPick,
  };
}

/** Acceso completo: PIN de la beta o cuenta con registro completo y Pase vigente. */
export async function hasAuthenticatedBetaSession(): Promise<boolean> {
  return (await getViewerAccess()).fullAccess;
}

async function resolvePublicWeeklyPick(
  fullDataset: PlatformDataset,
  rawSlug: string,
): Promise<{ unlockedPickId: string; gameId: string; slug: string } | null> {
  const clean = rawSlug.trim().toLowerCase();
  if (!clean || !/^[a-z0-9-]{3,64}$/.test(clean) || clean.includes("__")) {
    return null;
  }

  const url = process.env.DATABASE_URL;
  if (accountsEnabled() && url) {
    try {
      flagDb ??= createDb(url) as unknown as Db;
      const rows = await flagDb
        .select({
          unlockedPickId: publicWeeklyPicks.unlockedPickId,
          gameId: publicWeeklyPicks.gameId,
          publishedAt: publicWeeklyPicks.publishedAt,
        })
        .from(publicWeeklyPicks)
        .where(eq(publicWeeklyPicks.publicSlug, clean));
      if (rows.length > 0) {
        const latest = rows
          .slice()
          .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())[0]!;
        const exists = fullDataset.games.some(
          (g) => g.id === latest.gameId && g.picks.some((p) => p.id === latest.unlockedPickId),
        );
        if (exists) {
          return { unlockedPickId: latest.unlockedPickId, gameId: latest.gameId, slug: clean };
        }
      }
    } catch (err) {
      void err;
    }
  }

  const upcomingGames = fullDataset.games.filter((g) => g.status !== "FT");
  for (const g of upcomingGames) {
    const openWeekly = g.picks.find(
      (p) => Boolean(p.isTipsterWeeklyOpen) && p.tipsterSlug?.toLowerCase() === clean,
    );
    if (openWeekly) {
      return { unlockedPickId: openWeekly.id, gameId: g.id, slug: clean };
    }
  }

  if (clean === "carlos-sem" && upcomingGames[2]?.picks[0]) {
    return {
      unlockedPickId: upcomingGames[2].picks[0].id,
      gameId: upcomingGames[2].id,
      slug: clean,
    };
  }
  if (clean === "diego-sem" && upcomingGames[3]?.picks[0]) {
    return {
      unlockedPickId: upcomingGames[3].picks[0].id,
      gameId: upcomingGames[3].id,
      slug: clean,
    };
  }

  return null;
}

const PUBLIC_PROVIDER_LOGO_URL_RE = /(?:^https?:\/\/)?(?:[^/]*\.)?sports\.bzzoiro\.com/i;

function stripPublicProviderLogoUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return PUBLIC_PROVIDER_LOGO_URL_RE.test(url) ? undefined : url;
}

function sanitizePublicDatasetGame(g: PlatformGame): PlatformGame {
  const cleanLeagueLogo = stripPublicProviderLogoUrl(g.leagueLogoUrl);
  const cleanHomeLogo = stripPublicProviderLogoUrl(g.home.logoUrl);
  const cleanAwayLogo = stripPublicProviderLogoUrl(g.away.logoUrl);

  const home: PlatformGame["home"] = { ...g.home };
  if (cleanHomeLogo) {
    home.logoUrl = cleanHomeLogo;
  } else {
    delete home.logoUrl;
  }

  const away: PlatformGame["away"] = { ...g.away };
  if (cleanAwayLogo) {
    away.logoUrl = cleanAwayLogo;
  } else {
    delete away.logoUrl;
  }

  const next: PlatformGame = {
    ...g,
    home,
    away,
  };
  if (cleanLeagueLogo) {
    next.leagueLogoUrl = cleanLeagueLogo;
  } else {
    delete next.leagueLogoUrl;
  }
  return next;
}

function sanitizePublicDataset(dataset: PlatformDataset): PlatformDataset {
  return {
    ...dataset,
    teams: [],
    leagues: dataset.leagues.map((lg) => {
      const cleanLogo = stripPublicProviderLogoUrl(lg.logoUrl);
      const next = { ...lg };
      if (cleanLogo) {
        next.logoUrl = cleanLogo;
      } else {
        delete next.logoUrl;
      }
      return next;
    }),
    games: dataset.games.map(sanitizePublicDatasetGame),
  };
}

/**
 * Carga estado para superficies públicas aplicando redacción Cero-Fuga en servidor
 * cuando el visitante no tiene sesión activa. En `/p/[pickId]` solo acepta slugs semanales
 * públicos autorizados (nunca IDs directos de picks pagados).
 */
export async function loadPublicPlatformState(
  publicTipsterSlugOrPickId?: string,
): Promise<LoadedPlatformState> {
  const fullDataset = buildServerRawPlatformDataset();
  const access = await getViewerAccess();
  const currentPaymentMode = paymentMode();
  const hasActiveSession = access.fullAccess;
  const resolvedWeekly = publicTipsterSlugOrPickId
    ? await resolvePublicWeeklyPick(fullDataset, publicTipsterSlugOrPickId)
    : null;
  const publicPickResolved = publicTipsterSlugOrPickId ? resolvedWeekly !== null : undefined;

  if (hasActiveSession) {
    if (publicTipsterSlugOrPickId && !resolvedWeekly) {
      return {
        dataset: {
          ...withoutGameDetail(redactDatasetForVisitor(fullDataset)),
          leagues: [],
          games: [],
          teams: [],
        },
        initialRole: access.isAdmin ? "admin" : access.isTipster ? "tipster" : "member",
        hasActiveSession: true,
        allowRoleSimulation: previewToolsEnabled(access.isAdmin),
        accountsEnabled: accountsEnabled(),
        viewerVia: access.via,
        paymentMode: currentPaymentMode,
        serverMonth1NoCardMode: await loadMonth1Flag(),
        viewerIdentity: await loadViewerIdentity(),
        publicPickResolved: false,
      };
    }
    const baseMemberDataset = withoutGameDetail(fullDataset);
    const memberDataset = resolvedWeekly
      ? sanitizePublicDataset({
          ...baseMemberDataset,
          leagues: [],
          teams: [],
          games: baseMemberDataset.games
            .filter((g) => g.id === resolvedWeekly.gameId)
            .map((g) => ({
              ...g,
              picks: g.picks.map((p) =>
                p.id === resolvedWeekly.unlockedPickId
                  ? { ...p, isTipsterWeeklyOpen: true, tipsterSlug: resolvedWeekly.slug }
                  : p,
              ),
            })),
        })
      : sanitizePublicDataset(baseMemberDataset);
    return {
      dataset: memberDataset,
      initialRole: access.isAdmin ? "admin" : access.isTipster ? "tipster" : "member",
      hasActiveSession: true,
      allowRoleSimulation: previewToolsEnabled(access.isAdmin),
      accountsEnabled: accountsEnabled(),
      viewerVia: access.via,
      paymentMode: currentPaymentMode,
      serverMonth1NoCardMode: await loadMonth1Flag(),
      viewerIdentity: await loadViewerIdentity(),
      publicPickResolved,
    };
  }

  const extraUnlocked = new Set<string>();
  const extraSlugs = new Map<string, string>();
  if (resolvedWeekly) {
    extraUnlocked.add(resolvedWeekly.unlockedPickId);
    extraSlugs.set(resolvedWeekly.unlockedPickId, resolvedWeekly.slug);
  }

  const redacted = withoutGameDetail(redactDatasetForVisitor(fullDataset, extraUnlocked, extraSlugs));
  const scopedDataset = publicTipsterSlugOrPickId
    ? {
        ...redacted,
        leagues: [],
        teams: [],
        games: resolvedWeekly
          ? redacted.games
              .filter((g) => g.id === resolvedWeekly.gameId)
              .map((g) =>
                sanitizePublicDatasetGame(
                  g.status === "FT"
                    ? g
                    : {
                        ...g,
                        x12: [0, 0, 0] as [number, number, number],
                        projection: { home: 0, away: 0, total: 0 },
                        confidenceScore: 0,
                      },
                ),
              )
          : [],
      }
    : sanitizePublicDataset(redacted);

  return {
    dataset: scopedDataset,
    initialRole: "visitor",
    hasActiveSession: false,
    allowRoleSimulation: false,
    accountsEnabled: accountsEnabled(),
    viewerVia: access.via,
    paymentMode: currentPaymentMode,
    serverMonth1NoCardMode: await loadMonth1Flag(),
    viewerIdentity: await loadViewerIdentity(),
    publicPickResolved,
  };
}

/**
 * Carga estado completo para rutas autenticadas `/app/*` (protegidas por `middleware.ts`).
 */
export async function loadClubPlatformState(
  preferredRole: ViewerRole = "member",
): Promise<LoadedPlatformState> {
  const bundle = getDatasetMemoBundle();
  const [access, serverMonth1NoCardMode] = await Promise.all([
    getViewerAccess(),
    loadMonth1Flag(),
  ]);
  const currentPaymentMode = paymentMode();
  const hasActiveSession = access.fullAccess;
  const viewerIdentity: ViewerIdentity | null = access.profile?.handle
    ? {
        handle: access.profile.handle,
        displayName: access.profile.displayName,
        initials: access.profile.initials,
        avatarUrl: access.profile.avatarUrl,
        referralCode: access.profile.referralCode,
      }
    : null;

  if (!hasActiveSession) {
    return {
      dataset: getInitialVisitorShell(bundle),
      initialRole: "visitor",
      hasActiveSession: false,
      allowRoleSimulation: false,
      accountsEnabled: accountsEnabled(),
      viewerVia: access.via,
      paymentMode: currentPaymentMode,
      serverMonth1NoCardMode,
      viewerIdentity,
    };
  }

  const resolvedRole: ViewerRole = accountsEnabled()
    ? access.isAdmin
      ? "admin"
      : access.isTipster
        ? "tipster"
        : "member"
    : preferredRole;

  return {
    dataset: getInitialMemberShell(bundle),
    initialRole: resolvedRole,
    hasActiveSession: true,
    allowRoleSimulation: previewToolsEnabled(access.isAdmin),
    accountsEnabled: accountsEnabled(),
    viewerVia: access.via,
    paymentMode: currentPaymentMode,
    serverMonth1NoCardMode,
    viewerIdentity,
  };
}
