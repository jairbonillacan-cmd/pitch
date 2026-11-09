import React from "react";
import { loadAllActiveLeagueSnapshots } from "../src/server/snapshots.js";
import {
  LandingClient,
  type LandingLeagueSummary,
} from "../src/client/landing-client.js";
import { asLeagueId, type MatchAnalysis } from "@pitchlab/contracts";

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
  const plGames = snapshots["premier-league"].data?.games ?? [];
  const nflGames = snapshots.nfl.data?.games ?? [];
  const mxGames = snapshots["liga-mx"].data?.games ?? [];
  const llGames = snapshots.laliga.data?.games ?? [];
  const plAnalyses = plGames.filter((game) => game.publicationLabel);
  const nflAnalyses = nflGames.filter((game) => game.publicationLabel);
  const mxAnalyses = mxGames.filter((game) => game.publicationLabel);
  const llAnalyses = llGames.filter((game) => game.publicationLabel);

  const demos = [
    plAnalyses[0],
    nflAnalyses[0],
    mxAnalyses[0],
    llAnalyses[0],
    plAnalyses[1],
    nflAnalyses[1],
    mxAnalyses[1],
  ]
    .filter((game): game is MatchAnalysis => game !== undefined)
    .slice(0, 3);
  const [firstDemo = FALLBACK_MATCH, ...otherDemos] = demos;

  const leagues: LandingLeagueSummary[] = [
    {
      id: "liga-mx",
      name: "Liga MX",
      season: snapshots["liga-mx"].data?.season ?? "Apertura 2026",
      roundLabel: snapshots["liga-mx"].data?.roundLabel ?? "Jornada 16",
      mascot: "liga-mx",
      gameCount: mxGames.length,
      active: mxGames.length > 0,
    },
    {
      id: "premier-league",
      name: "Premier League",
      season: snapshots["premier-league"].data?.season ?? "2026/27",
      roundLabel: snapshots["premier-league"].data?.roundLabel ?? "Jornada 11",
      mascot: "premier-league",
      gameCount: plGames.length,
      active: plGames.length > 0,
    },
    {
      id: "laliga",
      name: "LaLiga",
      season: snapshots.laliga.data?.season ?? "2026/27",
      roundLabel: snapshots.laliga.data?.roundLabel ?? "Jornada 11",
      mascot: "laliga",
      gameCount: llGames.length,
      active: llGames.length > 0,
    },
    {
      id: "nfl",
      name: "NFL",
      season: snapshots.nfl.data?.season ?? "2026",
      roundLabel: snapshots.nfl.data?.roundLabel ?? "Semana 10",
      mascot: "nfl",
      gameCount: nflGames.length,
      active: nflGames.length > 0,
    },
  ];

  return (
    <LandingClient
      demoMatches={[firstDemo, ...otherDemos]}
      leagues={leagues}
    />
  );
}
