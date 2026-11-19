import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlayerProfileClubView } from "@pitchlab/ui/player-profile";
import { hydratePlayerLivePerformance } from "../../../../../../../src/server/player-live-stats";
import { loadPlayerProfile } from "../../../../../../../src/server/team-profile";
import { getViewerAccess } from "../../../../../../../src/server/viewer-access";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ league: string; teamId: string; playerSlug: string }>;
}): Promise<Metadata> {
  const { league, teamId, playerSlug } = await params;
  const profile = loadPlayerProfile(league, teamId, playerSlug, { fullAccess: false });
  if (!profile) {
    return { title: "Jugador no encontrado | PitchLab" };
  }
  return {
    title: `${profile.player.name} · ${profile.team.shortName} | PitchLab`,
    description: `Ficha, estadísticas de temporada y picks aplicables de ${profile.player.name} (${profile.team.name}) en ${profile.leagueLabel}.`,
  };
}

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ league: string; teamId: string; playerSlug: string }>;
}) {
  const { league, teamId, playerSlug } = await params;
  const access = await getViewerAccess();
  const profile = loadPlayerProfile(league, teamId, playerSlug, {
    fullAccess: access.fullAccess,
  });

  if (!profile) {
    notFound();
  }

  const enrichedProfile = await hydratePlayerLivePerformance(profile);

  return <PlayerProfileClubView profile={enrichedProfile} />;
}
