import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLeagueCapability } from "@pitchlab/contracts";
import { TeamProfileClubView, type TeamProfileTab } from "@pitchlab/ui/team-profile";
import { listUiVisibleLeagues } from "../../../../../src/server/data-health";
import {
  buildLeagueKnockoutBracket,
  buildLeagueStandingsSplits,
  getTeamAttackDefenseComparison,
} from "../../../../../src/server/standings-brackets";
import { loadTeamProfile } from "../../../../../src/server/team-profile";
import { getViewerAccess } from "../../../../../src/server/viewer-access";
import "../../../../alerts-referees.css";
import "../../../../atomic-kit.css";

export const dynamic = "force-dynamic";

function resolveTab(raw: string | string[] | undefined): TeamProfileTab {
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (val === "estadisticas") return "estadisticas";
  if (val === "partidos") return "partidos";
  if (val === "plantilla") return "plantilla";
  return "resumen";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ league: string; teamSlug: string }>;
}): Promise<Metadata> {
  const { league, teamSlug } = await params;
  const profile = loadTeamProfile(league, teamSlug, { fullAccess: false });
  if (!profile) {
    return { title: "Equipo no encontrado | PitchLab" };
  }
  return {
    title: `${profile.team.name} · ${profile.leagueLabel} | PitchLab`,
    description: `Perfil, promedios recientes, historial de partidos y métricas de ${profile.team.name} en ${profile.leagueLabel}.`,
  };
}

export default async function CanonicalTeamProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string; teamSlug: string }>;
  searchParams?: Promise<{ tab?: string | string[] }>;
}) {
  const { league, teamSlug } = await params;
  const resolvedSearch = searchParams ? await searchParams : undefined;
  const access = await getViewerAccess();
  const profile = loadTeamProfile(league, teamSlug, { fullAccess: access.fullAccess });

  if (!profile) {
    notFound();
  }

  const leagueKey: string = profile.league;
  const capability = getLeagueCapability(leagueKey);
  const isLeagueHealthy =
    capability !== undefined &&
    (capability.uiVisibilityPolicy === "always_visible" ||
      listUiVisibleLeagues().some((lg) => String(lg) === leagueKey));

  const standingsSplits =
    isLeagueHealthy && capability?.hasStandingsTable
      ? buildLeagueStandingsSplits(leagueKey)
      : null;
  const attackDefense =
    isLeagueHealthy && access.fullAccess
      ? getTeamAttackDefenseComparison(leagueKey, profile.team.slug)
      : null;
  const bracket =
    isLeagueHealthy && capability?.hasKnockoutBracket
      ? buildLeagueKnockoutBracket(leagueKey)
      : null;

  return (
    <TeamProfileClubView
      profile={profile}
      initialTab={resolveTab(resolvedSearch?.tab)}
      standingsSplits={standingsSplits}
      attackDefense={attackDefense}
      bracket={bracket}
    />
  );
}
