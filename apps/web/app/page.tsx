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

  const demoMatches: MatchAnalysis[] = [
    ...(mxGames.length > 0 ? [mxGames[0]!] : []),
    ...(plGames.length > 0 ? [plGames[0]!] : []),
    ...(nflGames.length > 0 ? [nflGames[0]!] : []),
    ...(plGames.length > 1 ? [plGames[1]!] : []),
    ...(nflGames.length > 1 ? [nflGames[1]!] : []),
  ].slice(0, 3);

  if (demoMatches.length === 0) {
    demoMatches.push(FALLBACK_MATCH);
  }

  const featuredMatch = plGames[0] ?? nflGames[0] ?? FALLBACK_MATCH;
  const totalGames = plGames.length + nflGames.length + mxGames.length;

  const leagues: LandingLeagueSummary[] = [
    {
      id: "premier-league",
      name: "Premier League",
      season: snapshots["premier-league"].data?.season ?? "Temporada 2026/27",
      roundLabel: snapshots["premier-league"].data?.roundLabel ?? "Jornada 10",
      mascot: "futbol",
      gameCount: plGames.length,
      active: plGames.length > 0,
    },
    {
      id: "nfl",
      name: "NFL",
      season: snapshots.nfl.data?.season ?? "Temporada 2026",
      roundLabel: snapshots.nfl.data?.roundLabel ?? "Semana 9",
      mascot: "americano",
      gameCount: nflGames.length,
      active: nflGames.length > 0,
    },
    {
      id: "liga-mx",
      name: "Liga MX",
      season: snapshots["liga-mx"].data?.season ?? "Apertura 2026",
      roundLabel:
        mxGames.length > 0
          ? (snapshots["liga-mx"].data?.roundLabel ?? "Jornada 16")
          : "Pronto",
      mascot: "celebrando",
      gameCount: mxGames.length,
      active: mxGames.length > 0,
    },
  ];

  return (
    <LandingClient
      featuredMatch={featuredMatch}
      demoMatches={demoMatches}
      leagues={leagues}
      totalGames={totalGames}
    />
  );
}
