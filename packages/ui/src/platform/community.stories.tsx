import React from "react";
import type { Meta } from "@storybook/react-vite";
import {
  CommunityConsensusTab,
  CommunityTopicsPicker,
  SocialVipClubView,
} from "./club/CommunityClubView";
import type { FollowedTopics } from "./club/community-ui";
import { computeConsensus, type WinnerVoteTally } from "./community-stats";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";
import type { PlatformGame } from "./types";

const meta = {
  title: "PitchLab v4 / Comunidad",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

const dataset = buildPlatformDataset([]);

function game(
  id: string,
  league: PlatformGame["league"],
  leagueLabel: string,
  home: [string, string],
  away: [string, string],
  x12: [number, number, number],
  hoursAhead: number,
): PlatformGame {
  const sport = league === "nfl" ? "american-football" : "football";
  return {
    id,
    league,
    leagueLabel,
    sport,
    status: "NS",
    kickoffUtc: new Date(Date.UTC(2026, 10, 14, 2) + hoursAhead * 3_600_000).toISOString(),
    home: { slug: home[0], name: home[1], shortName: home[1], code: home[1].slice(0, 3).toUpperCase(), record: "" },
    away: { slug: away[0], name: away[1], shortName: away[1], code: away[1].slice(0, 3).toUpperCase(), record: "" },
    x12,
    picks: [],
  } as unknown as PlatformGame;
}

const GAMES: PlatformGame[] = [
  game("st-1", "liga-mx" as PlatformGame["league"], "Liga MX", ["queretaro", "Querétaro"], ["monterrey", "Monterrey"], [0.4, 0.26, 0.34], 20),
  game("st-2", "premier-league" as PlatformGame["league"], "Premier League", ["arsenal", "Arsenal"], ["chelsea", "Chelsea"], [0.52, 0.25, 0.23], 30),
  game("st-3", "nfl" as PlatformGame["league"], "NFL", ["det", "Detroit"], ["gb", "Green Bay"], [0.55, 0, 0.45], 44),
];

const TALLIES: WinnerVoteTally[] = [
  { gameId: "st-1", home: 6, draw: 2, away: 14 },
  { gameId: "st-2", home: 9, draw: 3, away: 3 },
  { gameId: "st-3", home: 4, draw: 0, away: 3 },
];

function Stage({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <PlatformProvider dataset={dataset} initialRole="member">
      <div style={{ padding: 24, maxWidth: 1040, margin: "0 auto", background: "var(--pl-stage-bg)", minHeight: "100vh" }}>
        {children}
      </div>
    </PlatformProvider>
  );
}

const consensusStory = (theme: "dark" | "light", tallies: WinnerVoteTally[]) => ({
  globals: { theme },
  render: () => (
    <Stage>
      <CommunityConsensusTab items={computeConsensus([], GAMES, { voteTallies: tallies })} />
    </Stage>
  ),
});

/** Consenso con votos de «¿Quién gana?» contra el 1X2 del modelo. */
export const ConsensoConVotosOscuro = consensusStory("dark", TALLIES);
export const ConsensoConVotosClaro = consensusStory("light", TALLIES);
/** Sin picks ni votos suficientes. */
export const ConsensoVacioOscuro = consensusStory("dark", []);
export const ConsensoVacioClaro = consensusStory("light", []);

function TopicsDemo({ initial }: { initial: FollowedTopics }): React.JSX.Element {
  const [topics, setTopics] = React.useState(initial);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <CommunityTopicsPicker
      games={GAMES}
      topics={topics}
      onToggleLeague={(l) => setTopics((t) => ({ ...t, leagues: toggle(t.leagues, l) }))}
      onToggleTeam={(k) => setTopics((t) => ({ ...t, teams: toggle(t.teams, k) }))}
      defaultOpen
    />
  );
}

const topicsStory = (theme: "dark" | "light") => ({
  globals: { theme },
  render: () => (
    <Stage>
      <TopicsDemo initial={{ leagues: ["nfl"], teams: ["liga-mx:queretaro"] }} />
    </Stage>
  ),
});

/** Ligas y equipos que sigues (filtran «Siguiendo»). */
export const LigasYEquiposOscuro = topicsStory("dark");
export const LigasYEquiposClaro = topicsStory("light");

function WithTab({ tab, children }: { tab: string; children: React.ReactNode }): React.JSX.Element {
  // `useUrlTab` lee `?tab=` al montar: se fija antes de pintar Comunidad.
  const [ready, setReady] = React.useState(false);
  React.useLayoutEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(window.history.state, "", url.toString());
    setReady(true);
  }, [tab]);
  return ready ? <>{children}</> : <></>;
}

const rankingStory = (theme: "dark" | "light") => ({
  globals: { theme },
  render: () => (
    <WithTab tab="ranking">
      <PlatformProvider dataset={dataset} initialRole="member">
        <SocialVipClubView />
      </PlatformProvider>
    </WithTab>
  ),
});

/** Ranking de 7 y 30 días; sin cuenta muestra perfiles de ejemplo marcados. */
export const RankingOscuro = rankingStory("dark");
export const RankingClaro = rankingStory("light");
