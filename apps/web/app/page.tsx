import React from "react";
import {
  PRODUCT_LEAGUES,
  loadAllActiveLeagueSnapshots,
} from "../src/server/snapshots.js";
import {
  LandingClient,
  type LandingLeagueSummary,
} from "../src/client/landing-client.js";
import { asLeagueId, type MatchAnalysis } from "@pitchlab/contracts";

const LEAGUE_MASCOTS: Record<string, string> = {
  "liga-mx": "liga-mx",
  "premier-league": "premier-league",
  laliga: "laliga",
  nfl: "nfl",
};

const FALLBACK_MATCH: MatchAnalysis = {
  id: "epl-ars-new",
  league: asLeagueId("premier-league"),
  leagueLabel: "Premier League",
  sport: "football",
  round: "Jornada 10",
  day: "sab",
  dayLabel: "Sáb 7 nov",
  kickoffUtc: "2026-11-07T15:00:00Z",
  kickoffLocal: "09:00 CDMX",
  venue: "Emirates Stadium",
  status: "NS",
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
  factors: [
    {
      label: "Goles esperados",
      detail: "El modelo proyecta 1.62 goles de Arsenal por 1.18 de Newcastle.",
      impact: "1.62 vs 1.18",
    },
  ],
  trace: [
    { step: "Datos de entrada", value: "45 partidos evaluados" },
  ],
};

export default function HomePage(): React.JSX.Element {
  const snapshots = loadAllActiveLeagueSnapshots();
  const gamesFor = (key: (typeof PRODUCT_LEAGUES)[number]) =>
    snapshots[key].data?.games ?? [];

  const demos = PRODUCT_LEAGUES.flatMap((key) =>
    gamesFor(key).filter((game) => game.publicationLabel),
  )
    .filter((game): game is MatchAnalysis => game !== undefined)
    .slice(0, 3);
  const [firstDemo = FALLBACK_MATCH, ...otherDemos] = demos;

  const leagues: LandingLeagueSummary[] = PRODUCT_LEAGUES.map((key) => {
    const games = gamesFor(key);
    const data = snapshots[key].data;
    return {
      id: asLeagueId(key),
      name: data?.leagueLabel ?? key,
      season: data?.season ?? "2026/27",
      roundLabel: data?.roundLabel ?? "Próxima jornada",
      mascot: LEAGUE_MASCOTS[key] ?? "soccer",
      gameCount: games.length,
      active: games.length > 0,
    };
  });

  return (
    <LandingClient
      demoMatches={[firstDemo, ...otherDemos]}
      leagues={leagues}
    />
  );
}
