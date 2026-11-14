import React from "react";
import type { LiveMatchDetail, LiveScoreboard, LiveScoreboardEntry } from "@pitchlab/contracts";
import { asLeagueId } from "@pitchlab/contracts";
import { FollowControl, LiveMatchPanelView, LiveScoreboardView } from "./live/LiveMatchCenter";
import { STORY_INCIDENTS, STORY_STATS } from "./live/live-story-data";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";
import type { PlatformGame } from "./types";

/* Ejemplos para Storybook (EN-VIVO-1). Las cifras del partido vienen de un partido real de otra
   liga con equipos y jugadores sustituidos; los marcadores del día son ilustrativos. */

const team = (slug: string, name: string, shortName: string, code: string) => ({ slug, name, shortName, code, record: "" });

function game(id: string, league: "liga-mx" | "premier-league", home: ReturnType<typeof team>, away: ReturnType<typeof team>, kickoffLocal: string): PlatformGame {
  return {
    id,
    league: asLeagueId(league),
    leagueLabel: league === "liga-mx" ? "Liga MX" : "Premier League",
    sport: "football",
    kickoffUtc: "2030-11-14T23:00:00Z",
    kickoffLocal,
    home,
    away,
  } as unknown as PlatformGame;
}

const QRO_MTY = game("story-qro-mty", "liga-mx", team("queretaro", "Querétaro", "Querétaro", "QRO"), team("monterrey", "Rayados de Monterrey", "Monterrey", "MTY"), "17:00");
const AME_CAZ = game("story-ame-caz", "liga-mx", team("america", "América", "América", "AME"), team("cruz-azul", "Cruz Azul", "Cruz Azul", "CAZ"), "19:05");
const TIG_PUM = game("story-tig-pum", "liga-mx", team("tigres", "Tigres UANL", "Tigres", "TIG"), team("pumas", "Pumas UNAM", "Pumas", "PUM"), "21:10");
const EVE_COV = game("story-eve-cov", "premier-league", team("everton", "Everton", "Everton", "EVE"), team("coventry-city", "Coventry City", "Coventry City", "COV"), "14:00");
const GAMES = [QRO_MTY, AME_CAZ, TIG_PUM, EVE_COV];

const entry = (g: PlatformGame, patch: Partial<LiveScoreboardEntry>): LiveScoreboardEntry => ({
  gameId: g.id,
  league: g.league,
  phase: "scheduled",
  clock: null,
  minute: null,
  score: null,
  htScore: null,
  redCards: null,
  kickoffUtc: g.kickoffUtc,
  ...patch,
});

const upTo = (minute: number) => ({
  incidents: STORY_INCIDENTS.filter((i) => (i.minute ?? 0) <= minute),
  momentum: STORY_STATS.momentum.filter((p) => p.minute <= minute),
  xgTimeline: STORY_STATS.xgTimeline.filter((p) => p.minute <= minute),
});

const LIVE_DETAIL: LiveMatchDetail = {
  gameId: QRO_MTY.id,
  generatedAt: "2030-11-14T23:52:00Z",
  sourceFetchedAt: "2030-11-14T23:51:50Z",
  entry: entry(QRO_MTY, { phase: "live", clock: "67", minute: 67, score: { home: 1, away: 2 }, htScore: { home: 1, away: 0 } }),
  ...STORY_STATS,
  ...upTo(67),
  nextPollSeconds: 20,
  notice: null,
  attribution: "Datos en vivo: Bzzoiro Sports Data",
};

const FINAL_DETAIL: LiveMatchDetail = {
  ...LIVE_DETAIL,
  entry: entry(QRO_MTY, { phase: "final", score: { home: 2, away: 2 }, htScore: { home: 1, away: 0 } }),
  incidents: STORY_INCIDENTS,
  momentum: STORY_STATS.momentum,
  xgTimeline: STORY_STATS.xgTimeline,
  nextPollSeconds: null,
};

const EARLY_DETAIL: LiveMatchDetail = {
  ...LIVE_DETAIL,
  entry: entry(QRO_MTY, { phase: "live", clock: "3", minute: 3, score: { home: 0, away: 0 } }),
  incidents: [],
  momentum: [],
  xgTimeline: [],
  stats: null,
  notice: "Marcador en pausa para cuidar la cuota de datos; vuelve en unos minutos.",
};

const BOARD: LiveScoreboard = {
  generatedAt: "2030-11-14T23:52:00Z",
  sourceFetchedAt: "2030-11-14T23:51:50Z",
  active: true,
  nextPollSeconds: 15,
  notice: null,
  entries: [
    entry(QRO_MTY, { phase: "live", clock: "67", minute: 67, score: { home: 1, away: 2 } }),
    entry(AME_CAZ, { phase: "halftime", score: { home: 0, away: 0 } }),
    entry(TIG_PUM, {}),
    entry(EVE_COV, { phase: "final", score: { home: 3, away: 1 } }),
  ],
};

const DATASET = { ...buildPlatformDataset([]), games: GAMES };

function Stage({ children, width = 1120 }: { children: React.ReactNode; width?: number }): React.JSX.Element {
  return (
    <PlatformProvider dataset={DATASET} initialRole="member" initialWatchlistGameIds={[QRO_MTY.id]}>
      <div className="pl-stage" style={{ padding: 16, maxWidth: width, margin: "0 auto" }}>
        {children}
      </div>
    </PlatformProvider>
  );
}

export default {
  title: "Platform v4 / Match Center en vivo",
  parameters: { layout: "fullscreen" },
};

const light = { globals: { theme: "light" } };
const mobile = { parameters: { viewport: { defaultViewport: "mobile1" } } };

export const FichaEnVivo = {
  render: () => (
    <Stage>
      <LiveMatchPanelView game={QRO_MTY} detail={LIVE_DETAIL} />
    </Stage>
  ),
};
export const FichaEnVivoClaro = { ...FichaEnVivo, ...light };

export const FichaFinal = {
  render: () => (
    <Stage>
      <LiveMatchPanelView game={QRO_MTY} detail={FINAL_DETAIL} />
    </Stage>
  ),
};
export const FichaFinalClaro = { ...FichaFinal, ...light };

export const FichaRecienEmpezadaConAviso = {
  render: () => (
    <Stage>
      <LiveMatchPanelView game={QRO_MTY} detail={EARLY_DETAIL} />
    </Stage>
  ),
};
export const FichaRecienEmpezadaConAvisoClaro = { ...FichaRecienEmpezadaConAviso, ...light };

export const FichaCargando = {
  render: () => (
    <Stage>
      <LiveMatchPanelView game={QRO_MTY} detail={null} loading />
    </Stage>
  ),
};

export const MarcadorDelDia = {
  render: () => (
    <Stage>
      <LiveScoreboardView board={BOARD} games={GAMES} />
    </Stage>
  ),
};
export const MarcadorDelDiaClaro = { ...MarcadorDelDia, ...light };

export const FichaEnVivoMovil = {
  render: () => (
    <Stage width={375}>
      <LiveMatchPanelView game={QRO_MTY} detail={LIVE_DETAIL} />
    </Stage>
  ),
  ...mobile,
};
export const FichaEnVivoMovilClaro = { ...FichaEnVivoMovil, ...light };

export const MarcadorDelDiaMovil = {
  render: () => (
    <Stage width={375}>
      <LiveScoreboardView board={BOARD} games={GAMES} />
    </Stage>
  ),
  ...mobile,
};
export const MarcadorDelDiaMovilClaro = { ...MarcadorDelDiaMovil, ...light };

export const Siguiendo = {
  render: () => (
    <Stage>
      <FollowControl gameId={QRO_MTY.id} />
    </Stage>
  ),
};
export const SiguiendoClaro = { ...Siguiendo, ...light };
