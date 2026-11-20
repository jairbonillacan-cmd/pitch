import React, { useState } from "react";
import type { Meta } from "@storybook/react-vite";
import {
  CommunityConsensusTab,
  CommunityTopicsPicker,
  SocialVipClubView,
} from "./club/CommunityClubView";
import { SocialPostCard, resolvePostAuthor } from "./club/SocialPostCard";
import { reparentDeletedComment } from "./club/comment-tree";
import type { FollowedTopics } from "./club/community-ui";
import { computeConsensus, type WinnerVoteTally } from "./community-stats";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";
import type { PlatformGame, SocialPost } from "./types";

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

const STORY_POST: SocialPost = {
  id: "story-post-thread",
  fromServer: true,
  authorHandle: "sofia_nfl",
  authorName: "Sofía Méndez",
  authorIsTipster: true,
  avatarGradVar: "var(--avatar-grad-1)",
  roleBadge: "Tipster Oficial",
  verifiedRecord: "+18.4u · 24 picks",
  clvBadge: "Ventaja +4.2 pts",
  leagueLabel: "Liga MX",
  matchLabel: "América vs Guadalajara",
  gameId: "liga-mx:america-guadalajara",
  pickBadge: "Over 2.5 goles · 2u · 1.92",
  originType: "Bitácora Propia",
  body: "Ambos llegan con extremos rápidos y líneas adelantadas; la proyección justa ronda 1.78, hay margen de +4.2 pts en 1.92.",
  createdAt: "hace 25 min",
  likes: 14,
  likedByMe: false,
  copiesCount: 6,
  commentsCount: 4,
  comments: [
    {
      id: "c-root-1",
      parentCommentId: null,
      replyToHandle: null,
      authorHandle: "ana_mx",
      authorName: "Ana López",
      verifiedBadge: "+6.2u · 12 picks",
      body: "¿El pronóstico cuenta si llueve fuerte antes del descanso?",
      createdAt: "hace 18 min",
      isMine: true,
      helpfulCount: 3,
      helpfulByMe: true,
    },
    {
      id: "c-reply-1",
      parentCommentId: "c-root-1",
      replyToHandle: "ana_mx",
      authorHandle: "sofia_nfl",
      authorName: "Sofía Méndez",
      verifiedBadge: "+18.4u · 24 picks",
      body: "Baja ligeramente a 1.5u si el pronóstico de lluvia pasa de 70 %, pero el ritmo sigue favoreciendo llegadas.",
      createdAt: "hace 9 min",
      helpfulCount: 5,
      helpfulByMe: false,
    },
    {
      id: "c-reply-2",
      parentCommentId: "c-reply-1",
      replyToHandle: "sofia_nfl",
      authorHandle: "carlos_quant",
      authorName: "Carlos Vega",
      verifiedBadge: "+14.9u · 186 picks",
      body: "Coincido; además la línea de córners suele subir con lluvia ligera si ambos equipos juegan por banda.",
      createdAt: "hace 5 min",
      helpfulCount: 2,
      helpfulByMe: false,
    },
    {
      id: "c-root-2",
      parentCommentId: null,
      replyToHandle: null,
      authorHandle: "diego_tactico",
      authorName: "Diego Aranda",
      verifiedBadge: "+11.6u · 118 picks",
      body: "Buen margen frente al cierre; sigo el Over también.",
      createdAt: "hace 2 min",
      helpfulCount: 1,
      helpfulByMe: false,
    },
  ],
  pick: {
    gameId: "liga-mx:america-guadalajara",
    pickId: "pick-story-1",
    label: "Over 2.5 goles",
    units: 2,
    userDecimal: 1.92,
    fairDecimal: 1.78,
    modelProbability: 0.562,
    status: "won",
  },
};

function ThreadCardStory(): React.JSX.Element {
  const [post, setPost] = useState<SocialPost>(STORY_POST);
  const author = resolvePostAuthor(post, null, []);
  return (
    <div className="pl-com-shell" style={{ maxWidth: 680, margin: "0 auto", padding: 24 }}>
      <SocialPostCard
        post={post}
        author={author}
        own={{ handle: "ana_mx", name: "Ana López", avatarInitials: "AL", avatarGradVar: "var(--avatar-grad-4)" }}
        dataset={dataset}
        oddsFormat="decimal"
        highlighted
        onShare={() => {}}
        goProfile={() => (e) => e.preventDefault()}
        toggleSocialLike={() =>
          setPost((prev) => ({
            ...prev,
            likedByMe: !prev.likedByMe,
            likes: prev.likedByMe ? prev.likes - 1 : prev.likes + 1,
          }))
        }
        onToggleCommentHelpful={(_postId, commentId) =>
          setPost((prev) => ({
            ...prev,
            comments: prev.comments.map((c) =>
              c.id === commentId
                ? {
                    ...c,
                    helpfulByMe: !c.helpfulByMe,
                    helpfulCount: (c.helpfulCount ?? 0) + (c.helpfulByMe ? -1 : 1),
                  }
                : c,
            ),
          }))
        }
        addSocialComment={(_postId, body, parentCommentId) => {
          const clean = body.trim();
          if (!clean) return { ok: false, error: "Escribe una respuesta." };
          setPost((prev) => {
            const parent = parentCommentId ? prev.comments.find((c) => c.id === parentCommentId) : undefined;
            const next = {
              id: `c-${Date.now()}`,
              parentCommentId: parent?.id ?? null,
              replyToHandle: parent?.authorHandle ?? null,
              authorHandle: "ana_mx",
              authorName: "Ana López",
              verifiedBadge: "+6.2u · 12 picks",
              body: clean,
              createdAt: "ahora",
              isMine: true,
              helpfulCount: 0,
              helpfulByMe: false,
            };
            return {
              ...prev,
              comments: [...prev.comments, next],
              commentsCount: (prev.commentsCount ?? prev.comments.length) + 1,
            };
          });
          return { ok: true };
        }}
        onDeleteComment={(_postId, commentId) =>
          setPost((prev) => ({
            ...prev,
            comments: reparentDeletedComment(prev.comments, commentId),
            commentsCount: Math.max(0, (prev.commentsCount ?? prev.comments.length) - 1),
          }))
        }
      />
    </div>
  );
}

const threadCardStory = (theme: "dark" | "light") => ({
  globals: { theme },
  render: () => <ThreadCardStory />,
});

/** Tarjeta unificada de publicación con pick liquidado, seguidores, hilos multinivel y voto Útil. */
export const PublicacionConHiloOscuro = threadCardStory("dark");
export const PublicacionConHiloClaro = threadCardStory("light");

const forYouStory = (theme: "dark" | "light") => ({
  globals: { theme },
  render: () => (
    <WithTab tab="para-ti">
      <PlatformProvider dataset={dataset} initialRole="tipster">
        <SocialVipClubView />
      </PlatformProvider>
    </WithTab>
  ),
});

/** Feed «Para ti» con filtros por liga/estado, ordenamiento y Composer con unidades y momio editables. */
export const ParaTiFiltrosYComposerOscuro = forYouStory("dark");
export const ParaTiFiltrosYComposerClaro = forYouStory("light");
