import React from "react";
import {
  PRODUCT_LEAGUES,
  loadAllActiveLeagueSnapshots,
} from "../src/server/snapshots.js";
import {
  LandingClient,
  type LandingLeagueSummary,
  type LandingMatch,
} from "../src/client/landing-client.js";
import { asLeagueId, type MatchAnalysis } from "@pitchlab/contracts";

const LEAGUE_MASCOTS: Record<string, string> = {
  "liga-mx": "liga-mx",
  "premier-league": "premier-league",
  laliga: "laliga",
  nfl: "nfl",
};

const FALLBACK_MATCH: LandingMatch = {
  id: "epl-ars-new",
  league: asLeagueId("premier-league"),
  sport: "football",
  home: {
    slug: "arsenal",
    name: "Arsenal",
    shortName: "ARS",
    record: "3G-1E-1P · 10 pts",
  },
  away: {
    slug: "newcastle-united",
    name: "Newcastle",
    shortName: "NEW",
    record: "2G-2E-1P · 8 pts",
  },
  outcomes: [
    {
      key: "home",
      label: "Arsenal",
      probability: 0.482,
      fairOdds: { decimal: 2.07, american: 107 },
    },
    {
      key: "draw",
      label: "Empate",
      probability: 0.258,
      fairOdds: { decimal: 3.88, american: 288 },
    },
    {
      key: "away",
      label: "Newcastle",
      probability: 0.26,
      fairOdds: { decimal: 3.85, american: 285 },
    },
  ],
};

function toLandingMatch(match: MatchAnalysis): LandingMatch {
  const { id, league, sport, home, away, projection, outcomes, marketGroups, publicationLabel, updatedAt } = match;
  return { id, league, sport, home, away, projection, outcomes, marketGroups, publicationLabel, updatedAt };
}

export default function HomePage(): React.JSX.Element {
  const snapshots = loadAllActiveLeagueSnapshots();
  const gamesFor = (key: (typeof PRODUCT_LEAGUES)[number]) =>
    snapshots[key].data?.games ?? [];

  const demos = PRODUCT_LEAGUES.flatMap((key) =>
    gamesFor(key).filter((game) => game.publicationLabel),
  )
    .filter((game): game is MatchAnalysis => game !== undefined)
    .slice(0, 3)
    .map(toLandingMatch);
  const [firstDemo = FALLBACK_MATCH, ...otherDemos] = demos;

  const leagues: LandingLeagueSummary[] = PRODUCT_LEAGUES.map((key) => {
    const games = gamesFor(key);
    const data = snapshots[key].data;
    const leaderRow = data?.standings?.[0];
    return {
      id: asLeagueId(key),
      name: data?.leagueLabel ?? key,
      season: data?.season ?? "2026/27",
      roundLabel: data?.roundLabel ?? "Próxima jornada",
      mascot: LEAGUE_MASCOTS[key] ?? "soccer",
      gameCount: games.length,
      active: games.length > 0,
      leader: leaderRow ? `${leaderRow.shortName} · ${leaderRow.points} pts` : undefined,
    };
  });

  return (
    <LandingClient
      demoMatches={[firstDemo, ...otherDemos]}
      leagues={leagues}
    />
  );
}
