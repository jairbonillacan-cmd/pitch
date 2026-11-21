import "../../atomic-kit.css";
import "../../props-betlab.css";
import React from "react";
import { PropsLabClubView, type PropsRivalDefenseContext } from "@pitchlab/ui/props";
import { loadShellPlayerProps } from "../../../src/server/platform-data";
import {
  loadPlayerPropStreakCards,
  loadStructuredPlayerProps,
} from "../../../src/server/props-explorer";
import { buildLeagueAttackDefenseTable } from "../../../src/server/standings-brackets";
import { getViewerAccess } from "../../../src/server/viewer-access";

export const dynamic = "force-dynamic";

function buildRivalDefenseIndex(
  leagues: readonly string[],
): Readonly<Record<string, PropsRivalDefenseContext>> {
  const index: Record<string, PropsRivalDefenseContext> = {};
  const seen = new Set<string>();

  for (const league of leagues) {
    if (seen.has(league)) continue;
    seen.add(league);
    const table = buildLeagueAttackDefenseTable(league);
    if (!table || table.teams.length === 0) continue;

    for (const row of table.teams) {
      const conceded = row.goalsAgainstPerGame.value;
      const ebLabel =
        table.sport === "basketball"
          ? conceded !== null
            ? `Rival permite ${conceded.toFixed(1)} pts/p`
            : `Defensa rival ${row.defenseRank}.º de ${table.leagueSize}`
          : conceded !== null
            ? `Rival cede ${conceded.toFixed(2)} goles/p`
            : `Defensa rival ${row.defenseRank}.º de ${table.leagueSize}`;

      index[`${league}:${row.teamSlug.toLowerCase()}`] = {
        opponentName: row.shortName || row.name,
        defenseRank: row.defenseRank,
        leagueSize: table.leagueSize,
        ebLabel,
      };
    }
  }

  return index;
}

export default async function ClubPropsPage(): Promise<React.JSX.Element> {
  const access = await getViewerAccess();
  const streakCards = access.fullAccess ? loadPlayerPropStreakCards(36) : [];
  const basePlayerProps = loadShellPlayerProps({ fullAccess: access.fullAccess });
  const playerProps = access.fullAccess
    ? loadStructuredPlayerProps({ fullAccess: true, baseProps: basePlayerProps })
    : [];
  const rivalDefenseByLeagueTeam = access.fullAccess
    ? buildRivalDefenseIndex(playerProps.map((prop) => String(prop.league)))
    : undefined;

  return (
    <PropsLabClubView
      streakCards={streakCards}
      playerProps={playerProps}
      rivalDefenseByLeagueTeam={rivalDefenseByLeagueTeam}
    />
  );
}
