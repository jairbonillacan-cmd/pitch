import React from "react";
import { asLeagueId, asMarketKey, type MatchAnalysis } from "@pitchlab/contracts";
import { MatchStudioClubView } from "./club/CoreMatchViews";
import { PreMatchModule } from "./club/match/PreMatchModule";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";
import type { FrozenMainPickSnapshot, PlatformGame } from "./types";

/* Partido de ejemplo para Storybook (cifras ilustrativas, no son datos reales de la jornada).
   Inicio: 2030-11-15T01:00:00Z -> 19:00 en America/Mexico_City -> se congela a las 18:00. */
const row = (market: string, selection: string, label: string, p: number, line?: number) => ({
  market: asMarketKey(market),
  selection,
  label,
  ...(line !== undefined ? { line } : {}),
  p,
  fairOdds: 1 / p,
});

const STORY_MATCH: MatchAnalysis = {
  id: "story-prematch-qro-mty",
  league: asLeagueId("liga-mx"),
  leagueLabel: "Liga MX",
  sport: "football",
  round: "Jornada 16",
  day: "2030-11-14",
  dayLabel: "sábado, 14 de noviembre",
  kickoffUtc: "2030-11-15T01:00:00Z",
  kickoffLocal: "19:00",
  venue: "Estadio Corregidora",
  status: "NS",
  home: {
    slug: "queretaro",
    name: "Querétaro",
    shortName: "Querétaro",
    code: "QRO",
    record: "15 PJ · 1.2 goles/p",
  },
  away: {
    slug: "monterrey",
    name: "Rayados de Monterrey",
    shortName: "Monterrey",
    code: "MTY",
    record: "15 PJ · 1.7 goles/p",
  },
  projection: { home: 1.53, away: 1.41, total: 2.94 },
  x12: [0.397, 0.257, 0.346],
  marketGroups: [
    {
      group: "Resultado",
      rows: [
        row("h2h", "home", "Querétaro gana", 0.397),
        row("h2h", "draw", "Empate", 0.257),
        row("h2h", "away", "Monterrey gana", 0.346),
      ],
    },
    {
      group: "Doble oportunidad",
      rows: [
        row("double_chance", "1x", "Querétaro o empate", 0.654),
        row("double_chance", "12", "Sin empate", 0.743),
      ],
    },
    {
      group: "Goles totales",
      rows: [
        row("totals", "over_1.5", "Más de 1.5", 0.798, 1.5),
        row("totals", "over_2.5", "Más de 2.5", 0.563, 2.5),
      ],
    },
  ],
  outcomes: [
    { key: "home", label: "Querétaro gana", probability: 0.397 },
    { key: "draw", label: "Empate", probability: 0.257 },
    { key: "away", label: "Monterrey gana", probability: 0.346 },
  ],
  factors: [
    { label: "Forma local", detail: "", impact: "", value: "G-E-P-G-G · 3-1", sub: "8 goles a favor · 5 en contra" },
    { label: "Forma visitante", detail: "", impact: "", value: "P-G-G-E-G · 3-1", sub: "9 goles a favor · 6 en contra" },
  ],
  trace: [],
  headToHead: [
    { date: "2026-04-12", home: "Monterrey", away: "Querétaro", homeGoals: 2, awayGoals: 1 },
  ],
  restDays: { home: 7, away: 4 },
  confidence: {
    score: 64,
    level: "media",
    reasons: ["Cobertura estable del modelo", "Muestra completa de torneo"],
    factors: [
      { key: "favorite", label: "Favorito", value: 0.35, weight: 0.5, detail: "Doble oportunidad local 65 %." },
    ],
  },
};

const BASE_DATASET = buildPlatformDataset([
  {
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    season: "Apertura",
    roundLabel: "Jornada 16",
    generatedAt: "2030-11-14T18:00:00Z",
    games: [STORY_MATCH],
    standings: [],
  },
]);

const GAME_NO_ABSENCES: PlatformGame = BASE_DATASET.games[0]!;

const GAME_WITH_ABSENCES: PlatformGame = {
  ...GAME_NO_ABSENCES,
  preGame: {
    ...GAME_NO_ABSENCES.preGame,
    absences: [
      {
        teamSide: "home",
        player: "2 lesionados · Querétaro",
        role: "Reporte de disponibilidad",
        status: "Baja",
        impactNote: "Ausencias equivalentes al 11.4 % del valor de la plantilla.",
      },
      {
        teamSide: "away",
        player: "1 lesionado · Monterrey",
        role: "Reporte de disponibilidad",
        status: "Duda",
        impactNote: "Impacto incluido en la probabilidad del motor.",
      },
    ],
  },
};

const GAME_LIVE: PlatformGame = {
  ...GAME_WITH_ABSENCES,
  status: "LIVE",
};

const FROZEN_SNAPSHOT: FrozenMainPickSnapshot = {
  gameId: GAME_NO_ABSENCES.id,
  pickId: GAME_NO_ABSENCES.picks[0]!.id,
  label: GAME_NO_ABSENCES.picks[0]!.label,
  categoryLabel: GAME_NO_ABSENCES.picks[0]!.categoryLabel,
  marketGroup: GAME_NO_ABSENCES.picks[0]!.marketGroup,
  selectionKey: GAME_NO_ABSENCES.picks[0]!.selectionKey,
  p: GAME_NO_ABSENCES.picks[0]!.p,
  fairDecimal: GAME_NO_ABSENCES.picks[0]!.fairDecimal,
  fairAmerican: GAME_NO_ABSENCES.picks[0]!.fairAmerican,
  kickoffUtc: "2030-11-15T01:00:00.000Z",
  freezeAtUtc: "2030-11-15T00:00:00.000Z",
};

const NOW_BEFORE_FREEZE = new Date("2030-11-14T22:00:00Z"); // 16:00 CDMX (faltan 3 h)
const NOW_FROZEN = new Date("2030-11-15T00:25:00Z"); // 18:25 CDMX (faltan 35 min)
const NOW_STARTED = new Date("2030-11-15T01:15:00Z"); // 19:15 CDMX (en curso)

function StoryStage({
  role = "member",
  watched = false,
  game = GAME_NO_ABSENCES,
  children,
}: {
  role?: "visitor" | "member";
  watched?: boolean;
  game?: PlatformGame;
  children: React.ReactNode;
}): React.JSX.Element {
  const ds = { ...BASE_DATASET, games: [game] };
  return (
    <PlatformProvider
      dataset={ds}
      initialRole={role}
      initialWatchlistGameIds={watched ? [game.id] : []}
    >
      <div className="pl-stage" style={{ padding: 24, maxWidth: 1120, margin: "0 auto" }}>
        {children}
      </div>
    </PlatformProvider>
  );
}

export default {
  title: "Platform v4 / Antes del partido",
  parameters: { layout: "fullscreen" },
};

const light = { globals: { theme: "light" } };

export const PorCongelarSinBajas = {
  render: () => (
    <StoryStage game={GAME_NO_ABSENCES}>
      <PreMatchModule
        game={GAME_NO_ABSENCES}
        now={NOW_BEFORE_FREEZE}
        timeZone="America/Mexico_City"
      />
    </StoryStage>
  ),
};
export const PorCongelarSinBajasClaro = { ...PorCongelarSinBajas, ...light };

export const CongeladoConBajasYAvisoActivo = {
  render: () => (
    <StoryStage game={GAME_WITH_ABSENCES} watched>
      <PreMatchModule
        game={GAME_WITH_ABSENCES}
        detail={{
          markets: GAME_WITH_ABSENCES.markets,
          headToHead: GAME_WITH_ABSENCES.headToHead,
          factors: GAME_WITH_ABSENCES.factors,
          frozenMainPick: FROZEN_SNAPSHOT,
        }}
        now={NOW_FROZEN}
        timeZone="America/Mexico_City"
      />
    </StoryStage>
  ),
};
export const CongeladoConBajasYAvisoActivoClaro = {
  ...CongeladoConBajasYAvisoActivo,
  ...light,
};

export const PartidoYaIniciado = {
  render: () => (
    <StoryStage game={GAME_LIVE} watched>
      <PreMatchModule
        game={GAME_LIVE}
        detail={{
          markets: GAME_LIVE.markets,
          headToHead: GAME_LIVE.headToHead,
          factors: GAME_LIVE.factors,
          frozenMainPick: FROZEN_SNAPSHOT,
        }}
        now={NOW_STARTED}
        timeZone="America/Mexico_City"
      />
    </StoryStage>
  ),
};
export const PartidoYaIniciadoClaro = { ...PartidoYaIniciado, ...light };

export const VisitanteBloqueado = {
  render: () => (
    <StoryStage role="visitor" game={GAME_WITH_ABSENCES}>
      <PreMatchModule
        game={GAME_WITH_ABSENCES}
        now={NOW_BEFORE_FREEZE}
        timeZone="America/Mexico_City"
      />
    </StoryStage>
  ),
};
export const VisitanteBloqueadoClaro = { ...VisitanteBloqueado, ...light };

export const FichaCompletaConModulo = {
  render: () => (
    <PlatformProvider
      dataset={{ ...BASE_DATASET, games: [GAME_WITH_ABSENCES] }}
      initialRole="member"
      initialWatchlistGameIds={[GAME_WITH_ABSENCES.id]}
    >
      <MatchStudioClubView
        leagueId={asLeagueId("liga-mx")}
        gameId={GAME_WITH_ABSENCES.id}
        detail={{
          markets: GAME_WITH_ABSENCES.markets,
          headToHead: GAME_WITH_ABSENCES.headToHead,
          factors: GAME_WITH_ABSENCES.factors,
          frozenMainPick: FROZEN_SNAPSHOT,
        }}
      />
    </PlatformProvider>
  ),
};
export const FichaCompletaConModuloClaro = { ...FichaCompletaConModulo, ...light };
