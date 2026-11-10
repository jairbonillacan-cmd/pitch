import { cookies } from "next/headers";
import {
  buildPlatformDataset,
  redactDatasetForVisitor,
  type PlatformDataset,
  type RawLeagueInput,
  type ViewerRole,
} from "@pitchlab/ui";
import { getBetaCookieName, verifyBetaCookieToken } from "./beta-auth.js";
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
    };
  }

  return {
    dataset: fullDataset,
    initialRole: preferredRole,
    hasActiveSession: true,
  };
}
