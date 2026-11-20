import { cache } from "react";
import { COMPETITION_BY_ID, type StandingRow } from "@pitchlab/contracts";
import { redactDatasetForVisitor } from "@pitchlab/ui/access-guard";
import { buildPlatformDataset, type RawLeagueInput } from "@pitchlab/ui/picks-engine";
import type {
  PaymentMode,
  PlatformDataset,
  PlatformGame,
  PlatformGameDetail,
  ViewerIdentity,
  ViewerRole,
  ViewerVia,
} from "@pitchlab/ui/platform";
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
  const maxExpansionHorizonMs = nowMs + 16 * 86_400_000;
  const perExpansionCount = new Map<string, number>();

  const upcoming = upcomingAll
    .slice()
    .sort((a, b) => (a.kickoffUtc || "").localeCompare(b.kickoffUtc || ""))
    .filter((g) => {
      if (g.status === "LIVE" || CORE_SHELL_LEAGUES.has(g.league)) return true;
      const ms = Date.parse(g.kickoffUtc);
      if (Number.isFinite(ms) && ms > maxExpansionHorizonMs) return false;
      const seen = perExpansionCount.get(g.league) ?? 0;
      if (seen >= 10) return false;
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

/**
 * Quita el detalle pesado de cada partido y del shell compartido (mercados, H2H, factores,
 * tablas de las 57 ligas, alineaciones probables y clubes amateur de copas menores).
 * Cada página de liga o partido recibe su tabla y detalle puntual en servidor.
 */
export function withoutGameDetail(dataset: PlatformDataset): PlatformDataset {
  return {
    ...dataset,
    leagues: dataset.leagues.map((lg) => ({
      ...lg,
      standings: [],
    })),
    teams: (dataset.teams ?? []).filter((t) => {
      if (CORE_SHELL_LEAGUES.has(t.league)) return true;
      const tier = COMPETITION_BY_ID[t.league]?.prestigeTier ?? 4;
      return tier <= 2;
    }),
    games: dataset.games.map((g) => ({
      ...g,
      markets: [],
      headToHead: [],
      factors: [],
      preGame: g.preGame
        ? {
            ...g.preGame,
            injuries: undefined,
            probableLineups: undefined,
          }
        : g.preGame,
    })),
  };
}

/** Detalle de un partido con la misma redacción Cero-Fuga que el resto del dataset. */
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
        dataset: { ...withoutGameDetail(redactDatasetForVisitor(fullDataset)), leagues: [], games: [] },
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
      ? {
          ...baseMemberDataset,
          leagues: [],
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
        }
      : baseMemberDataset;
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
        games: resolvedWeekly
          ? redacted.games
              .filter((g) => g.id === resolvedWeekly.gameId)
              .map((g) =>
                g.status === "FT"
                  ? g
                  : {
                      ...g,
                      x12: [0, 0, 0] as [number, number, number],
                      projection: { home: 0, away: 0, total: 0 },
                      confidenceScore: 0,
                    },
              )
          : [],
      }
    : redacted;

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
      dataset: getSlimVisitorShell(bundle),
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
    dataset: getSlimMemberShell(bundle),
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
