import "../../../../../../atomic-kit.css";
import "../../../../../../props-betlab.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  PlayerProfileClubView,
  type PlayerRivalDefenseContext,
} from "@pitchlab/ui/player-profile";
import { hydratePlayerLivePerformance } from "../../../../../../../src/server/player-live-stats";
import { buildLeagueAttackDefenseTable } from "../../../../../../../src/server/standings-brackets";
import { loadPlayerProfile } from "../../../../../../../src/server/team-profile";
import { getViewerAccess } from "../../../../../../../src/server/viewer-access";

export const dynamic = "force-dynamic";

function resolveNextRivalDefense(
  league: string,
  opponentSlug: string | null | undefined,
): PlayerRivalDefenseContext | null {
  if (!opponentSlug) return null;
  const table = buildLeagueAttackDefenseTable(league);
  if (!table || table.teams.length === 0) return null;
  const targetSlug = opponentSlug.trim().toLowerCase();
  const row = table.teams.find((t) => t.teamSlug.toLowerCase() === targetSlug) ?? null;
  if (!row) return null;

  const conceded = row.goalsAgainstPerGame.value;
  const ebLabel =
    table.sport === "basketball"
      ? conceded !== null
        ? `Rival permite ${conceded.toFixed(1)} pts/p`
        : `Defensa rival ${row.defenseRank}.º de ${table.leagueSize}`
      : conceded !== null
        ? `Rival cede ${conceded.toFixed(2)} goles/p`
        : `Defensa rival ${row.defenseRank}.º de ${table.leagueSize}`;

  return {
    opponentName: row.shortName || row.name,
    defenseRank: row.defenseRank,
    leagueSize: table.leagueSize,
    concededPerGame: conceded,
    xgAgainstPerGame: row.expectedGoalsAgainst.value,
    ebLabel,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ league: string; teamSlug: string; playerSlug: string }>;
}): Promise<Metadata> {
  const { league, teamSlug, playerSlug } = await params;
  const profile = loadPlayerProfile(league, teamSlug, playerSlug, { fullAccess: false });
  if (!profile) {
    return { title: "Jugador no encontrado | PitchLab" };
  }
  return {
    title: `${profile.player.name} · ${profile.team.shortName} | PitchLab`,
    description: `Ficha, estadísticas de temporada y picks aplicables de ${profile.player.name} (${profile.team.name}) en ${profile.leagueLabel}.`,
  };
}

export default async function CanonicalPlayerProfilePage({
  params,
}: {
  params: Promise<{ league: string; teamSlug: string; playerSlug: string }>;
}) {
  const { league, teamSlug, playerSlug } = await params;
  const access = await getViewerAccess();
  const profile = loadPlayerProfile(league, teamSlug, playerSlug, {
    fullAccess: access.fullAccess,
  });

  if (!profile) {
    notFound();
  }

  const enrichedProfile = await hydratePlayerLivePerformance(profile);
  const nextRivalDefense = resolveNextRivalDefense(
    enrichedProfile.league,
    enrichedProfile.nextFixture?.opponent.slug,
  );

  return (
    <PlayerProfileClubView
      profile={enrichedProfile}
      nextRivalDefense={nextRivalDefense}
    />
  );
}
