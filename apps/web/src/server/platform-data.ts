import { cache } from "react";
import {
  buildPlatformDataset,
  redactDatasetForVisitor,
  type PlatformDataset,
  type PlatformGame,
  type PlatformGameDetail,
  type RawLeagueInput,
  type ViewerIdentity,
  type ViewerRole,
} from "@pitchlab/ui";
import { getViewerAccess } from "./viewer-access";
import { buildSpacetimeSignals } from "./spacetime";
import { createDb, FLAG_MONTH1_NO_CARD, getBoolFlag, type Db } from "@pitchlab/db";
import {
  loadAllActiveLeagueSnapshots,
  PRODUCT_LEAGUES,
  type ProductLeague,
} from "./snapshots";

export { PRODUCT_LEAGUES, type ProductLeague };

export interface LoadedPlatformState {
  dataset: PlatformDataset;
  initialRole: ViewerRole;
  hasActiveSession: boolean;
  /** Selector de rol y barra de 11 vistas: solo con sesión y herramientas de preview activas. */
  allowRoleSimulation: boolean;
  /** Cuentas reales activas (DATABASE_URL + BETTER_AUTH_SECRET). */
  accountsEnabled: boolean;
  /** Política de prueba leída de la base; undefined sin cuentas. */
  serverMonth1NoCardMode?: boolean;
  /** Socio con cuenta y usuario elegido; null con PIN o visitante. */
  viewerIdentity: ViewerIdentity | null;
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
 * en producción solo con PITCHLAB_PREVIEW_TOOLS=1.
 */
export function previewToolsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.PITCHLAB_PREVIEW_TOOLS === "1";
}

/** Cuánto vive el dataset calculado en memoria del servidor. Los snapshots cambian una vez al día. */
const DATASET_TTL_MS = 5 * 60 * 1000;
let datasetMemo: { value: PlatformDataset; at: number } | null = null;

/**
 * Dataset completo de la jornada. Se guarda 5 minutos en memoria del servidor (calcular las
 * señales de Spacetime para todos los partidos es lo más caro de cada solicitud) y `cache`
 * evita repetirlo dentro de una misma solicitud.
 */
export const buildServerRawPlatformDataset = cache(function buildServerRawPlatformDatasetCached(): PlatformDataset {
  const now = Date.now();
  if (datasetMemo && now - datasetMemo.at < DATASET_TTL_MS) return datasetMemo.value;
  const value = buildServerRawPlatformDatasetUncached();
  datasetMemo = { value, at: now };
  return value;
});

function buildServerRawPlatformDatasetUncached(): PlatformDataset {
  const envelopes = loadAllActiveLeagueSnapshots();
  const inputs: RawLeagueInput[] = [];

  for (const leagueKey of PRODUCT_LEAGUES) {
    const env = envelopes[leagueKey];
    if (env?.data) {
      inputs.push({
        league: env.data.league,
        leagueLabel: env.data.leagueLabel,
        sport: env.data.sport,
        season: env.data.season,
        roundLabel: env.data.roundLabel,
        generatedAt: env.data.generatedAt,
        games: env.data.games,
        standings: env.data.standings,
        spacetime: buildSpacetimeSignals(env.data.games),
      });
    }
  }

  return buildPlatformDataset(inputs);
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

async function redactedForViewer(): Promise<PlatformDataset> {
  const full = buildServerRawPlatformDataset();
  return (await hasAuthenticatedBetaSession()) ? full : redactDatasetForVisitor(full);
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
  const dataset = await redactedForViewer();
  const game = dataset.games.find((g) => g.id === gameId);
  return game ? { ...game, markets: [], headToHead: [], factors: [] } : null;
}

/**
 * Quita el detalle pesado de cada partido (mercados, enfrentamientos y factores, ~la mitad del
 * peso). Solo lo usa la ficha del partido, que lo pide con `loadGameDetail`.
 */
export function withoutGameDetail(dataset: PlatformDataset): PlatformDataset {
  return {
    ...dataset,
    games: dataset.games.map((g) => ({ ...g, markets: [], headToHead: [], factors: [] })),
  };
}

/** Detalle de un partido con la misma redacción Cero-Fuga que el resto del dataset. */
export async function loadGameDetail(gameId: string): Promise<PlatformGameDetail | null> {
  const full = buildServerRawPlatformDataset();
  const dataset = (await hasAuthenticatedBetaSession()) ? full : redactDatasetForVisitor(full);
  const game = dataset.games.find((g) => g.id === gameId);
  return game ? { markets: game.markets, headToHead: game.headToHead, factors: game.factors } : null;
}

/** Acceso completo: PIN de la beta o cuenta con registro completo y Pase vigente. */
export async function hasAuthenticatedBetaSession(): Promise<boolean> {
  return (await getViewerAccess()).fullAccess;
}

/**
 * Carga estado para superficies públicas aplicando redacción Cero-Fuga en servidor
 * cuando el visitante no tiene sesión activa.
 */
export async function loadPublicPlatformState(
  publicTipstarSlugOrPickId?: string,
): Promise<LoadedPlatformState> {
  const fullDataset = buildServerRawPlatformDataset();
  const hasActiveSession = await hasAuthenticatedBetaSession();

  if (hasActiveSession) {
    return {
      dataset: withoutGameDetail(fullDataset),
      initialRole: "member",
      hasActiveSession: true,
      allowRoleSimulation: previewToolsEnabled(),
      accountsEnabled: accountsEnabled(),
      serverMonth1NoCardMode: await loadMonth1Flag(),
      viewerIdentity: await loadViewerIdentity(),
    };
  }

  const extraUnlocked = new Set<string>();
  if (publicTipstarSlugOrPickId) {
    const clean = publicTipstarSlugOrPickId.trim();
    // Si coincide con un pickId directo o un slug de Tipstar secundario, liberar únicamente 1 pick
    const upcomingGames = fullDataset.games.filter((g) => g.status !== "FT");
    if (clean === "carlos-sem" && upcomingGames[2]?.picks[0]) {
      extraUnlocked.add(upcomingGames[2].picks[0].id);
    } else if (clean === "diego-sem" && upcomingGames[3]?.picks[0]) {
      extraUnlocked.add(upcomingGames[3].picks[0].id);
    } else {
      for (const g of upcomingGames) {
        const found = g.picks.find((p) => p.id === clean || p.tipstarSlug === clean);
        if (found) {
          extraUnlocked.add(found.id);
          break;
        }
      }
    }
  }

  return {
    dataset: withoutGameDetail(redactDatasetForVisitor(fullDataset, extraUnlocked)),
    initialRole: "visitor",
    hasActiveSession: false,
    allowRoleSimulation: false,
    accountsEnabled: accountsEnabled(),
      serverMonth1NoCardMode: await loadMonth1Flag(),
      viewerIdentity: await loadViewerIdentity(),
  };
}

/**
 * Carga estado completo para rutas autenticadas `/app/*` (protegidas por `middleware.ts`).
 */
export async function loadClubPlatformState(
  preferredRole: ViewerRole = "member",
): Promise<LoadedPlatformState> {
  const fullDataset = buildServerRawPlatformDataset();
  const hasActiveSession = await hasAuthenticatedBetaSession();

  if (!hasActiveSession) {
    return {
      dataset: upcomingOnly(withoutGameDetail(redactDatasetForVisitor(fullDataset))),
      initialRole: "visitor",
      hasActiveSession: false,
      allowRoleSimulation: false,
      accountsEnabled: accountsEnabled(),
      serverMonth1NoCardMode: await loadMonth1Flag(),
      viewerIdentity: await loadViewerIdentity(),
    };
  }

  return {
    dataset: upcomingOnly(withoutGameDetail(fullDataset)),
    initialRole: preferredRole,
    hasActiveSession: true,
    allowRoleSimulation: previewToolsEnabled(),
    accountsEnabled: accountsEnabled(),
      serverMonth1NoCardMode: await loadMonth1Flag(),
      viewerIdentity: await loadViewerIdentity(),
  };
}
