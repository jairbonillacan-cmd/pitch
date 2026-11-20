import React from "react";
import {
  asLeagueId,
  asMarketKey,
  probabilityToFairOdds,
  type MatchAnalysis,
} from "@pitchlab/contracts";
import { EmblemSurfaceProvider } from "../sports";
import { LeagueHubClubView, MatchStudioClubView } from "./club/CoreMatchViews";
import { HomeMatchCard } from "./components/HomeMatchCard";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";

const row = (market: string, selection: string, label: string, p: number, line?: number) => ({
  market: asMarketKey(market),
  selection,
  label,
  ...(line !== undefined ? { line } : {}),
  p,
  fairOdds: 1 / p,
});

const MATCH: MatchAnalysis = {
  id: "story-mex-jam",
  league: asLeagueId("concacaf-nations"),
  leagueLabel: "Concacaf Nations League",
  sport: "football",
  round: "Cuartos de final",
  day: "2030-11-18",
  dayLabel: "miércoles, 18 de noviembre",
  kickoffUtc: "2030-11-18T02:30:00Z",
  kickoffLocal: "20:30",
  venue: "Estadio Akron",
  status: "NS",
  home: {
    slug: "mexico",
    name: "México",
    shortName: "México",
    code: "MEX",
    record: "4 PJ · 2.0 goles/p",
  },
  away: {
    slug: "jamaica",
    name: "Jamaica",
    shortName: "Jamaica",
    code: "JAM",
    record: "4 PJ · 1.2 goles/p",
  },
  projection: { home: 1.82, away: 0.78, total: 2.6 },
  x12: [0.61, 0.23, 0.16],
  outcomes: [
    { key: "home", label: "México gana", probability: 0.61, fairOdds: probabilityToFairOdds(0.61) },
    { key: "draw", label: "Empate", probability: 0.23, fairOdds: probabilityToFairOdds(0.23) },
    { key: "away", label: "Jamaica gana", probability: 0.16, fairOdds: probabilityToFairOdds(0.16) },
  ],
  marketGroups: [
    {
      group: "Resultado",
      rows: [
        row("h2h", "home", "México gana", 0.61),
        row("h2h", "draw", "Empate", 0.23),
        row("h2h", "away", "Jamaica gana", 0.16),
      ],
    },
    {
      group: "Goles totales",
      rows: [
        row("totals", "over_1.5", "Más de 1.5", 0.73, 1.5),
        row("totals", "over_2.5", "Más de 2.5", 0.48, 2.5),
      ],
    },
  ],
  factors: [
    { label: "Ataque local", impact: "+22 % goles/p", detail: "Peso ofensivo internacional" },
    { label: "Sede", impact: "Localía oficial", detail: "Estadio Akron" },
  ],
  trace: [{ step: "Calibración internacional", value: "Historial de selecciones FIFA" }],
  confidence: { score: 62, level: "alta", reasons: ["Ventaja local marcada"] },
};

const DATASET = buildPlatformDataset([
  {
    league: asLeagueId("concacaf-nations"),
    leagueLabel: "Concacaf Nations League",
    sport: "football",
    season: "2026/27",
    roundLabel: "Cuartos de final",
    generatedAt: "2030-11-16T18:00:00Z",
    games: [MATCH],
  },
]);
const GAME = DATASET.games[0]!;

function StoryStage({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <EmblemSurfaceProvider surface="app">
      <PlatformProvider dataset={DATASET} initialRole="member">
        <div className="pl-stage" style={{ padding: 24, maxWidth: 1120, display: "grid", gap: 16 }}>
          {children}
        </div>
      </PlatformProvider>
    </EmblemSurfaceProvider>
  );
}

export default {
  title: "Platform v4 / Selecciones Nacionales",
  parameters: { layout: "fullscreen" },
};

const light = { globals: { theme: "light" } };

export const TarjetaSeleccionOscuro = {
  render: () => (
    <StoryStage>
      <div style={{ maxWidth: 420 }}>
        <HomeMatchCard game={GAME} />
      </div>
    </StoryStage>
  ),
};
export const TarjetaSeleccionClaro = { ...TarjetaSeleccionOscuro, ...light };

export const CompetenciaSeleccionesOscuro = {
  render: () => (
    <PlatformProvider dataset={DATASET} initialRole="member">
      <LeagueHubClubView leagueId={asLeagueId("concacaf-nations")} initialSection="equipos" />
    </PlatformProvider>
  ),
};
export const CompetenciaSeleccionesClaro = { ...CompetenciaSeleccionesOscuro, ...light };

export const FichaSeleccionOscuro = {
  render: () => (
    <PlatformProvider dataset={DATASET} initialRole="member">
      <MatchStudioClubView leagueId={asLeagueId("concacaf-nations")} gameId={GAME.id} initialTab="resumen" />
    </PlatformProvider>
  ),
};
export const FichaSeleccionClaro = { ...FichaSeleccionOscuro, ...light };
