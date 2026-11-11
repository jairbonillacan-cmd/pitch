import { cookies } from "next/headers";
import {
  buildPlatformDataset,
  redactDatasetForVisitor,
  type PlatformDataset,
  type RawLeagueInput,
  type ViewerRole,
} from "@pitchlab/ui";
import { getBetaCookieName, verifyBetaCookieToken } from "./beta-auth.js";
import { buildSpacetimeSignals } from "./spacetime.js";
import { createDb, FLAG_MONTH1_NO_CARD, getBoolFlag, type Db } from "@pitchlab/db";
import {
  loadAllActiveLeagueSnapshots,
  PRODUCT_LEAGUES,
  type ProductLeague,
} from "./snapshots.js";

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

export function buildServerRawPlatformDataset(): PlatformDataset {
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

export async function hasAuthenticatedBetaSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(getBetaCookieName())?.value;
    return await verifyBetaCookieToken(token);
  } catch (err) {
    void err;
    return false;
  }
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
      dataset: fullDataset,
      initialRole: "member",
      hasActiveSession: true,
      allowRoleSimulation: previewToolsEnabled(),
      accountsEnabled: accountsEnabled(),
      serverMonth1NoCardMode: await loadMonth1Flag(),
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
    dataset: redactDatasetForVisitor(fullDataset, extraUnlocked),
    initialRole: "visitor",
    hasActiveSession: false,
    allowRoleSimulation: false,
    accountsEnabled: accountsEnabled(),
      serverMonth1NoCardMode: await loadMonth1Flag(),
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
      dataset: redactDatasetForVisitor(fullDataset),
      initialRole: "visitor",
      hasActiveSession: false,
      allowRoleSimulation: false,
      accountsEnabled: accountsEnabled(),
      serverMonth1NoCardMode: await loadMonth1Flag(),
    };
  }

  return {
    dataset: fullDataset,
    initialRole: preferredRole,
    hasActiveSession: true,
    allowRoleSimulation: previewToolsEnabled(),
    accountsEnabled: accountsEnabled(),
      serverMonth1NoCardMode: await loadMonth1Flag(),
  };
}
