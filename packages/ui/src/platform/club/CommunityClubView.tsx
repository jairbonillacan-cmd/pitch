"use client";

import React, { memo, useCallback, useId, useMemo, useState } from "react";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreTable,
  type SofascoreTableColumn,
} from "../../components/ui/primitives";
import { LeagueBadge, TeamBadge } from "../../sports";
import { formatOddsValue } from "../access-guard";
import { getExampleAnalystSpec } from "../community-examples";
import {
  CONSENSUS_AGREE_PTS,
  CONSENSUS_MIN_PICKS,
  CONSENSUS_MIN_VOTES,
  CONSENSUS_STRONG_PTS,
  computeConsensus,
  consensusReading,
  formatDiffPts,
  type ConsensusGame,
  type WinnerVoteTally,
} from "../community-stats";
import { ExampleBadge, MaestroIcon, VerifiedSeal } from "../components/MaestroPrimitives";
import { TopLayerModalDialog } from "../components/PlatformOverlays";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { useAbortableJson, useSafeEffect } from "../hooks";
import {
  socialScopeKey,
  type SocialFeedScope,
  usePlatformActions,
  usePlatformCore,
  useSocialState,
} from "../platform-provider";
import {
  LEADERBOARD_MIN_SETTLED,
  entriesInWindow,
  formatSignedPct,
  formatUnits,
  leaderboardMinSettled,
  monthLongLabel,
  profileRecord,
  rankAnalysts,
  type LeaderboardSort,
  type LeaderboardWindow,
  type RankedAnalyst,
} from "../profile-stats";
import type {
  JournalEntry,
  MatchPick,
  OddsFormat,
  PlatformDataset,
  PlatformGame,
  SocialPost,
} from "../types";
import {
  SOCIAL_POST_MAX_CHARS,
  SocialPostCard,
  copyPostPickToJournal,
  copyPostPickToParlay,
  isPlainClick,
  resolvePostAuthor,
  shareSocialPost,
  type SocialPostAuthor,
} from "./SocialPostCard";
import {
  Avatar,
  ChevronRightIcon,
  GiftIcon,
  SocialReportDialog,
  TabPanel,
  UnderlineTabs,
  postMatchesTopics,
  resolveEntryGame,
  teamTopicKey,
  useFollowedTopics,
  useFollowing,
  useLeaderboardRows,
  useUrlTab,
  type FollowedTopics,
  type OwnIdentity,
  type SocialReportTarget,
  type TabDef,
} from "./community-ui";

type CommunityTab = "para-ti" | "siguiendo" | "consenso" | "ranking";

const TABS: readonly TabDef<CommunityTab>[] = [
  { key: "para-ti", label: "Para ti" },
  { key: "siguiendo", label: "Siguiendo" },
  { key: "consenso", label: "Consenso" },
  { key: "ranking", label: "Ranking" },
];
const TAB_KEYS = TABS.map((t) => t.key);
const FEED_PAGE = 8;
const TOP_N = 10;

const KICKOFF_FMT = new Intl.DateTimeFormat("es-MX", {
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function kickoffLabel(iso?: string, timeZone?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    const fmt = timeZone
      ? new Intl.DateTimeFormat("es-MX", {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
          timeZone,
        })
      : KICKOFF_FMT;
    return fmt.format(d).replace(".", "").replace(",", "");
  } catch (err) {
    void err;
    return KICKOFF_FMT.format(d).replace(".", "").replace(",", "");
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function SocialVipClubView(): React.JSX.Element {
  const { viewerRole, hasAccountSession, upgradeHref } = usePlatformCore();
  const { navigateTo } = usePlatformActions();

  if (viewerRole === "visitor") {
    return (
      <AtmosphereStage>
        <ClubWorkspaceShell activePath="/app/social">
          <div className="pl-com">
            <header className="pl-com-header">
              <h1 className="pl-com-title">Comunidad</h1>
            </header>
            <SofascoreCard as="section" className="pl-com-gate-card">
              <div className="pl-com-gate">
                <p className="pl-com-gate-title">
                  {hasAccountSession
                    ? "Activa tu Pase PitchLab Ultra para participar en la comunidad."
                    : "La comunidad es para socios."}
                </p>
                <Button
                  variant="primary"
                  size="default"
                  render={
                    <a
                      href={upgradeHref}
                      onClick={(e) => {
                        if (!isPlainClick(e)) return;
                        e.preventDefault();
                        navigateTo(upgradeHref);
                      }}
                    />
                  }
                >
                  {hasAccountSession ? "Activar Pase Ultra" : "Probar 7 días gratis"}
                </Button>
              </div>
            </SofascoreCard>
          </div>
        </ClubWorkspaceShell>
      </AtmosphereStage>
    );
  }

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/social">
        <CommunityContent />
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

function CommunityContent(): React.JSX.Element {
  const uid = useId();
  const { dataset, oddsFormat, hasAccountSessionAuth } = usePlatformCore();
  const {
    publishSocialPost,
    addSocialComment,
    deleteSocialComment,
    toggleSocialCommentHelpful,
    loadAllPostComments,
    recordSocialPostCopy,
    toggleSocialLike,
    deleteSocialPost,
    refreshSocialFeed,
    ensureSocialPostLoaded,
    sealPickToJournal,
    addPickToParlay,
    pushToast,
    navigateTo,
  } = usePlatformActions();
  const { socialPosts } = useSocialState();
  const [tab, setTab] = useUrlTab<CommunityTab>(TAB_KEYS, "para-ti");
  const consensusQuery = useAbortableJson<{ tallies?: WinnerVoteTally[] }>(
    "/api/social/consensus",
    { enabled: hasAccountSessionAuth },
  );
  const voteTallies = useMemo(
    () => (Array.isArray(consensusQuery.data?.tallies) ? consensusQuery.data.tallies : []),
    [consensusQuery.data],
  );
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<SocialReportTarget | null>(null);

  useSafeEffect(() => {
    refreshSocialFeed();
  }, [refreshSocialFeed]);

  useSafeEffect(() => {
    if (typeof window === "undefined") return;
    const syncPostParam = () => {
      try {
        const postId = new URLSearchParams(window.location.search).get("post")?.trim() || null;
        setHighlightedPostId(postId);
        if (postId) {
          setTab("para-ti");
          ensureSocialPostLoaded(postId);
        }
      } catch (err) {
        void err;
      }
    };
    syncPostParam();
    window.addEventListener("popstate", syncPostParam);
    return () => window.removeEventListener("popstate", syncPostParam);
  }, [ensureSocialPostLoaded, setTab]);

  const { rows, own, today, source, ownJournal } = useLeaderboardRows();
  const follows = useFollowing();
  const monthName = monthLongLabel(today.getMonth());

  const seasonRanked = useMemo(
    () => rankAnalysts(rows, { window: "season", sort: "units", today, minSettled: 0 }),
    [rows, today],
  );
  const monthRanked = useMemo(
    () => rankAnalysts(rows, { window: "30d", sort: "units", today }),
    [rows, today],
  );
  const consensus = useMemo(
    () => computeConsensus(socialPosts, dataset.games, { voteTallies }),
    [dataset.games, socialPosts, voteTallies],
  );

  const authorOf = useMemo(
    () =>
      (post: SocialPost): SocialPostAuthor =>
        resolvePostAuthor(post, own, seasonRanked),
    [own, seasonRanked],
  );

  const goProfile = useCallback(
    (handle: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!isPlainClick(e)) return;
      e.preventDefault();
      navigateTo(`/app/u/${handle}`);
    },
    [navigateTo],
  );

  const onToggleFollow = useCallback(
    (handle: string): void => {
      const now = follows.toggle(handle);
      pushToast(
        now ? `Ahora sigues a @${handle}.` : `Dejaste de seguir a @${handle}.`,
        "default",
      );
    },
    [follows, pushToast],
  );

  const onCopy = useCallback(
    (post: SocialPost): void =>
      copyPostPickToJournal(post, {
        dataset,
        sealPickToJournal,
        recordSocialPostCopy,
        pushToast,
      }),
    [dataset, pushToast, recordSocialPostCopy, sealPickToJournal],
  );

  const onCopyToParlay = useCallback(
    (post: SocialPost): void =>
      copyPostPickToParlay(post, {
        dataset,
        addPickToParlay,
        pushToast,
      }),
    [addPickToParlay, dataset, pushToast],
  );

  const onShare = useCallback(
    (post: SocialPost): void => shareSocialPost(post, pushToast),
    [pushToast],
  );

  const handleOpenRanking = useCallback(() => setTab("ranking"), [setTab]);
  const handleOpenConsensus = useCallback(() => setTab("consenso"), [setTab]);
  const handleOpenPrivacy = useCallback(() => navigateTo("/app/lab?tab=privacidad"), [navigateTo]);
  const handleCloseReport = useCallback(() => setReportTarget(null), []);

  const [forYouLeague, setForYouLeague] = useState<string>("all");
  const [forYouOpenOnly, setForYouOpenOnly] = useState(false);
  const [forYouSort, setForYouSort] = useState<"recent" | "most_commented">("recent");

  const forYouScope = useMemo<SocialFeedScope | undefined>(() => {
    if (forYouLeague === "all" && !forYouOpenOnly && forYouSort === "recent") return undefined;
    return {
      ...(forYouLeague !== "all" ? { leagueLabel: forYouLeague } : {}),
      ...(forYouOpenOnly ? { openPickOnly: true } : {}),
      ...(forYouSort === "most_commented" ? { sort: "most_commented" as const } : {}),
    };
  }, [forYouLeague, forYouOpenOnly, forYouSort]);

  useSafeEffect(() => {
    if (!forYouScope) return;
    refreshSocialFeed(forYouScope);
  }, [forYouScope, refreshSocialFeed]);

  const postCountByLeague = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of socialPosts) {
      if (p.leagueLabel && p.leagueLabel !== "Comunidad") {
        counts.set(p.leagueLabel, (counts.get(p.leagueLabel) ?? 0) + 1);
      }
    }
    return counts;
  }, [socialPosts]);

  const openPostsCount = useMemo(
    () => socialPosts.filter((p) => p.pick?.status === "open").length,
    [socialPosts],
  );

  const orderedLeagues = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ label: string; count: number }> = [];
    const sortedDataset = [...dataset.leagues].sort((a, b) => {
      const ca = postCountByLeague.get(a.label) ?? 0;
      const cb = postCountByLeague.get(b.label) ?? 0;
      return cb - ca;
    });
    for (const lg of sortedDataset) {
      if (seen.has(lg.label)) continue;
      seen.add(lg.label);
      list.push({ label: lg.label, count: postCountByLeague.get(lg.label) ?? 0 });
    }
    for (const [label, count] of postCountByLeague.entries()) {
      if (!seen.has(label)) {
        seen.add(label);
        list.push({ label, count });
      }
    }
    return list;
  }, [dataset.leagues, postCountByLeague]);

  const activeLeagueChips = useMemo(
    () => orderedLeagues.filter((item) => item.count > 0).slice(0, 5),
    [orderedLeagues],
  );

  const filteredForYouPosts = useMemo(() => {
    const filtered = socialPosts.filter((p) => {
      if (forYouLeague !== "all" && p.leagueLabel !== forYouLeague) return false;
      if (forYouOpenOnly && p.pick?.status !== "open") return false;
      return true;
    });
    if (forYouSort !== "most_commented") return filtered;
    return [...filtered].sort((a, b) => {
      const ca = Math.max(a.commentsCount ?? 0, a.comments.length);
      const cb = Math.max(b.commentsCount ?? 0, b.comments.length);
      if (cb !== ca) return cb - ca;
      return (b.createdAtIso ?? "").localeCompare(a.createdAtIso ?? "");
    });
  }, [forYouLeague, forYouOpenOnly, forYouSort, socialPosts]);

  const feedProps = useMemo<FeedSharedProps>(
    () => ({
      authorOf,
      own,
      dataset,
      journal: ownJournal,
      oddsFormat,
      follows,
      onToggleFollow,
      onCopy,
      onCopyToParlay,
      onShare,
      toggleSocialLike,
      addSocialComment,
      deleteSocialComment,
      toggleSocialCommentHelpful,
      loadAllPostComments,
      onDelete: deleteSocialPost,
      onOpenReport: setReportTarget,
      navigateTo,
      goProfile,
      highlightedPostId,
    }),
    [
      addSocialComment,
      authorOf,
      dataset,
      deleteSocialComment,
      deleteSocialPost,
      follows,
      goProfile,
      highlightedPostId,
      loadAllPostComments,
      navigateTo,
      oddsFormat,
      onCopy,
      onCopyToParlay,
      onShare,
      onToggleFollow,
      own,
      ownJournal,
      toggleSocialCommentHelpful,
      toggleSocialLike,
    ],
  );

  return (
    <div className="pl-com">
      <header className="pl-com-header">
        <h1 className="pl-com-title">Comunidad</h1>
        <p className="pl-com-subtitle">
          Lecturas de socios, picks sellados antes del partido y consenso frente al modelo.
        </p>
      </header>
      <UnderlineTabs
        tabs={TABS}
        active={tab}
        onChange={setTab}
        label="Vistas de Comunidad"
        idPrefix="pl-com"
        className="pl-com-tabs"
      />
      <TabPanel tabKey={tab} idPrefix="pl-com" className="pl-com-panel">
        {tab === "para-ti" ? (
          <div className="pl-com-cols">
            <div className="pl-com-main">
              <Composer
                own={own}
                games={dataset.games}
                journal={ownJournal}
                oddsFormat={oddsFormat}
                publish={publishSocialPost}
              />
              <MobileTop ranked={monthRanked} monthName={monthName} goProfile={goProfile} />
              <div className="pl-com-filter-panel" role="region" aria-label="Filtros de Para ti">
                <div className="pl-com-filter-bar">
                  <div className="pl-com-filter-controls">
                    <div
                      className="pl-com-seg pl-com-seg--compact max-w-full overflow-x-auto"
                      role="group"
                      aria-label="Tipo de publicaciones"
                    >
                      <button
                        type="button"
                        aria-pressed={!forYouOpenOnly}
                        onClick={() => setForYouOpenOnly(false)}
                      >
                        Todo
                      </button>
                      <button
                        type="button"
                        aria-pressed={forYouOpenOnly}
                        onClick={() => setForYouOpenOnly(true)}
                      >
                        <span>Con pick abierto</span>
                        {openPostsCount > 0 ? (
                          <span className="pl-com-inline-count num">{openPostsCount}</span>
                        ) : null}
                      </button>
                    </div>

                    <div className="pl-com-select-wrap">
                      <label htmlFor={`${uid}-league-filter`} className="sr-only">
                        Filtrar publicaciones por liga
                      </label>
                      <select
                        id={`${uid}-league-filter`}
                        className="pl-com-select"
                        value={forYouLeague}
                        onChange={(e) => setForYouLeague(e.target.value)}
                      >
                        <option value="all">Todas las ligas</option>
                        {orderedLeagues.map((lg) => (
                          <option key={lg.label} value={lg.label}>
                            {lg.count > 0 ? `${lg.label} (${lg.count})` : lg.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {forYouLeague !== "all" || forYouOpenOnly ? (
                      <button
                        type="button"
                        className="pl-com-reset-btn"
                        onClick={() => {
                          setForYouLeague("all");
                          setForYouOpenOnly(false);
                        }}
                      >
                        Limpiar
                      </button>
                    ) : null}
                  </div>

                  <div className="pl-com-filter-end">
                    <span className="pl-com-result-count num" role="status" aria-live="polite">
                      {filteredForYouPosts.length}{" "}
                      {filteredForYouPosts.length === 1 ? "publicación" : "publicaciones"}
                    </span>
                    <div
                      className="pl-com-seg pl-com-seg--compact max-w-full overflow-x-auto"
                      role="group"
                      aria-label="Ordenar publicaciones"
                    >
                      <button
                        type="button"
                        aria-pressed={forYouSort === "recent"}
                        onClick={() => setForYouSort("recent")}
                      >
                        Recientes
                      </button>
                      <button
                        type="button"
                        aria-pressed={forYouSort === "most_commented"}
                        onClick={() => setForYouSort("most_commented")}
                      >
                        Más comentados
                      </button>
                    </div>
                  </div>
                </div>

                {activeLeagueChips.length > 0 ? (
                  <div
                    className="pl-com-league-chips"
                    role="group"
                    aria-label="Acceso rápido por liga"
                  >
                    <button
                      type="button"
                      className="pl-prof-chip"
                      aria-pressed={forYouLeague === "all"}
                      onClick={() => setForYouLeague("all")}
                    >
                      Todas
                    </button>
                    {activeLeagueChips.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        className="pl-prof-chip num"
                        aria-pressed={forYouLeague === item.label}
                        onClick={() =>
                          setForYouLeague((cur) => (cur === item.label ? "all" : item.label))
                        }
                      >
                        <span>{item.label}</span>
                        <span className="pl-com-inline-count">{item.count}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <Feed
                key={`${forYouLeague}:${forYouOpenOnly ? "open" : "all"}:${forYouSort}`}
                posts={filteredForYouPosts}
                scope={forYouScope}
                emptyText={
                  forYouLeague !== "all" || forYouOpenOnly
                    ? "No hay publicaciones con esos filtros."
                    : "Todavía no hay publicaciones."
                }
                {...feedProps}
              />
            </div>
            <aside className="pl-com-aside" aria-label="Resumen de Comunidad">
              <YourMonthCard
                own={own}
                ranked={monthRanked}
                monthName={monthName}
                goProfile={goProfile}
              />
              <TopCard
                ranked={monthRanked}
                monthName={monthName}
                onRanking={handleOpenRanking}
                goProfile={goProfile}
              />
              {consensus[0] ? (
                <HotCard item={consensus[0]} onConsensus={handleOpenConsensus} />
              ) : null}
              <a
                href="/app/account?tab=referrals"
                className="pl-com-invite"
                onClick={(e) => {
                  if (!isPlainClick(e)) return;
                  e.preventDefault();
                  navigateTo("/app/account?tab=referrals");
                }}
              >
                <span className="pl-com-invite-icon" aria-hidden="true">
                  <GiftIcon size={18} />
                </span>
                <span className="pl-com-invite-copy">
                  <strong>Invita a un amigo</strong>
                  <span>7 días para él, +7 días para ti</span>
                </span>
                <ChevronRightIcon size={16} />
              </a>
            </aside>
          </div>
        ) : null}

        {tab === "siguiendo" ? (
          <FollowingTab posts={socialPosts} seasonRanked={seasonRanked} {...feedProps} />
        ) : null}

        {tab === "consenso" ? <ConsensusTab items={consensus} /> : null}

        {tab === "ranking" ? (
          <RankingTab
            rows={rows}
            own={own}
            ownJournal={ownJournal}
            source={source}
            today={today}
            follows={follows}
            onToggleFollow={onToggleFollow}
            goProfile={goProfile}
            onPrivacy={handleOpenPrivacy}
          />
        ) : null}
      </TabPanel>
      <SocialReportDialog target={reportTarget} onClose={handleCloseReport} />
    </div>
  );
}

interface AttachedPick {
  matchPick: MatchPick;
  units: number;
  userDecimal: number;
  sealedEntryId?: string;
}

const STAKE_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

function entryToMatchPick(entry: JournalEntry, games: readonly PlatformGame[]): MatchPick {
  const game = games.find((g) => g.id === entry.gameId);
  const exact = game?.picks.find((p) => p.id === entry.pickId);
  if (exact) return exact;
  return {
    id: entry.pickId,
    gameId: entry.gameId,
    league: game?.league ?? ("liga-mx" as MatchPick["league"]),
    leagueLabel: entry.leagueLabel,
    matchLabel: entry.matchLabel,
    kickoffLocal: game?.kickoffLocal ?? "",
    gameStatus: entry.status === "pending" ? "NS" : "FT",
    slotIndex: 99,
    category: "valor",
    categoryLabel: entry.origin,
    risk: "medio",
    engineKey: game?.picks[0]?.engineKey ?? "tachyon",
    engineName: entry.origin,
    marketGroup: "journal",
    selectionKey: entry.pickId,
    conflictGroup: "independent",
    label: entry.pickLabel,
    rationale: "",
    p: Math.min(0.95, Math.max(0.05, 1 / Math.max(1.04, entry.fairDecimal))),
    fairDecimal: entry.fairDecimal,
    fairAmerican: 0,
    marketDecimal: entry.userDecimal,
    marketAmerican: 0,
    edgePts: 0,
    confidenceScore: null,
    suggestedUnits: entry.units,
    result: entry.status === "won" ? "hit" : entry.status === "lost" ? "miss" : null,
  };
}

type PublishSocialFn = ReturnType<typeof usePlatformActions>["publishSocialPost"];

function Composer({
  own,
  games,
  journal,
  oddsFormat,
  publish,
}: {
  own: OwnIdentity | null;
  games: readonly PlatformGame[];
  journal: readonly JournalEntry[];
  oddsFormat: OddsFormat;
  publish: PublishSocialFn;
}): React.JSX.Element {
  const uid = useId();
  const [body, setBody] = useState("");
  const [attached, setAttached] = useState<AttachedPick | null>(null);
  const [origin, setOrigin] = useState<"Spacetime Suite" | "Bitácora Propia">("Spacetime Suite");
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [oddsDraft, setOddsDraft] = useState("");

  const submit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setError("");
    if (!body.trim()) {
      setError("Escribe tu publicación.");
      return;
    }
    const res = publish({
      leagueLabel: attached?.matchPick.leagueLabel ?? "Comunidad",
      gameId: attached?.matchPick.gameId,
      matchLabel: attached?.matchPick.matchLabel ?? "",
      pickBadge: attached ? `${attached.matchPick.label} · ${attached.units.toFixed(1)}u` : "",
      originType: origin,
      body,
      pick: attached ?? undefined,
    });
    if (!res.ok) {
      setError(res.error ?? "No pudimos publicar.");
      return;
    }
    setBody("");
    setAttached(null);
    setOddsDraft("");
    setSheetOpen(false);
  };

  const meta = attached ? resolveGameMeta(attached.matchPick.gameId, games) : null;
  const nearLimit = body.length >= Math.round(SOCIAL_POST_MAX_CHARS * 0.7);

  const form = (inSheet: boolean): React.JSX.Element => (
    <form
      className={`pl-com-composer${inSheet ? " is-in-sheet" : ""}`}
      aria-label="Publicar"
      onSubmit={submit}
      noValidate
    >
      <div className="pl-com-composer-top">
        {own ? (
          <Avatar
            initials={own.avatarInitials}
            avatarUrl={own.avatarUrl}
            gradVar={own.avatarGradVar}
            size={40}
          />
        ) : null}
        <div className="pl-com-composer-field">
          <label htmlFor={`${uid}-${inSheet ? "s" : "d"}-body`} className="sr-only">
            Escribe tu publicación
          </label>
          <textarea
            id={`${uid}-${inSheet ? "s" : "d"}-body`}
            rows={2}
            maxLength={SOCIAL_POST_MAX_CHARS}
            placeholder="¿Qué pick tienes y por qué?"
            value={body}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${uid}-err` : undefined}
            onChange={(e) => {
              setBody(e.target.value);
              if (error) setError("");
            }}
          />
          {attached ? (
            <div className="pl-com-attached">
              {meta ? <LeagueBadge league={meta.league} size={18} /> : null}
              <div className="pl-com-attached-main">
                <span className="pl-com-attached-copy">
                  <strong>{attached.matchPick.label}</strong>{" "}
                  <span>
                    · {attached.matchPick.matchLabel} ·{" "}
                    <span className="num">{attached.units.toFixed(1)}u</span> ·{" "}
                    <span className="num">
                      {formatOddsValue(attached.userDecimal, oddsFormat)}
                    </span>{" "}
                    ·{" "}
                    <span className="pl-com-fair-inline num">
                      Justo {formatOddsValue(attached.matchPick.fairDecimal, oddsFormat)}
                    </span>
                  </span>
                </span>
                {attached.sealedEntryId ? (
                  <span className="pl-com-attached-sealed">Sellado en tu bitácora</span>
                ) : (
                  <div className="pl-com-attached-controls">
                    <label className="pl-com-attached-field">
                      <span>Unidades</span>
                      <select
                        aria-label="Unidades del pick"
                        className="pl-com-attached-input num"
                        value={String(attached.units)}
                        onChange={(e) => {
                          const val = parseStrictFiniteNumber(e.target.value);
                          if (val !== null) {
                            setAttached((prev) => (prev ? { ...prev, units: val } : null));
                          }
                        }}
                      >
                        {STAKE_OPTIONS.map((u) => (
                          <option key={u} value={String(u)}>
                            {u.toFixed(1)}u
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="pl-com-attached-field">
                      <span>Momio</span>
                      <input
                        type="number"
                        step="0.01"
                        min="1.05"
                        max="100"
                        inputMode="decimal"
                        aria-label="Momio decimal del pick"
                        className="pl-com-attached-input num"
                        value={oddsDraft}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setOddsDraft(raw);
                          const parsed = parseStrictFiniteNumber(raw);
                          if (parsed !== null && parsed >= 1.05 && parsed <= 100) {
                            setAttached((prev) => (prev ? { ...prev, userDecimal: parsed } : null));
                          }
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Quitar pick adjunto"
                onClick={() => {
                  setAttached(null);
                  setOddsDraft("");
                }}
              >
                <MaestroIcon name="x" size={14} />
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      <div id={`${uid}-err`} className="pl-com-error-slot" aria-live="polite">
        {error && inSheet === sheetOpen ? (
          <p className="pl-com-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="pl-com-composer-bar">
        <div className="pl-com-composer-tools">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setPickerOpen(true)}
          >
            <MaestroIcon name="plus" size={14} />
            <span>{attached ? "Cambiar pick" : "Adjuntar pick"}</span>
          </Button>
          {attached ? (
            <div className="pl-com-seg max-w-full" role="group" aria-label="Origen del pick">
              <button
                type="button"
                aria-pressed={origin === "Spacetime Suite"}
                onClick={() => setOrigin("Spacetime Suite")}
              >
                Del modelo
              </button>
              <button
                type="button"
                aria-pressed={origin === "Bitácora Propia"}
                onClick={() => setOrigin("Bitácora Propia")}
              >
                Propio
              </button>
            </div>
          ) : null}
        </div>
        <div className="pl-com-composer-submit">
          {nearLimit ? (
            <span className="pl-com-char-count num">
              {body.length}/{SOCIAL_POST_MAX_CHARS}
            </span>
          ) : null}
          <Button type="submit" variant="primary" size="sm">
            Publicar
          </Button>
        </div>
      </div>
    </form>
  );

  return (
    <>
      <div className="pl-com-composer-desktop">{form(false)}</div>
      <button type="button" className="pl-com-composer-row" onClick={() => setSheetOpen(true)}>
        {own ? (
          <Avatar
            initials={own.avatarInitials}
            avatarUrl={own.avatarUrl}
            gradVar={own.avatarGradVar}
            size={36}
          />
        ) : null}
        <span className="pl-com-composer-row-text">Comparte un pick…</span>
        <span className="pl-com-composer-row-cta" aria-hidden="true">
          Publicar
        </span>
      </button>
      {sheetOpen ? (
        <TopLayerModalDialog
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          ariaLabel="Publicar"
          variant="drawer"
        >
          <div className="pl-com-sheet">
            <div className="pl-com-sheet-head">
              <p className="pl-com-sheet-title">Publicar</p>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Cerrar"
                onClick={() => setSheetOpen(false)}
              >
                <MaestroIcon name="x" size={16} />
              </Button>
            </div>
            {form(true)}
          </div>
        </TopLayerModalDialog>
      ) : null}
      {pickerOpen ? (
        <PickPicker
          games={games}
          journal={journal}
          origin={origin}
          onOriginChange={setOrigin}
          oddsFormat={oddsFormat}
          onClose={() => setPickerOpen(false)}
          onPick={(picked) => {
            setAttached(picked);
            setOddsDraft(picked.userDecimal.toFixed(2));
            setPickerOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function resolveGameMeta(gameId: string, games: readonly PlatformGame[]) {
  const game = games.find((g) => g.id === gameId);
  return game ? { league: game.league } : null;
}

function PickPicker({
  games,
  journal,
  origin,
  onOriginChange,
  oddsFormat,
  onClose,
  onPick,
}: {
  games: readonly PlatformGame[];
  journal: readonly JournalEntry[];
  origin: "Spacetime Suite" | "Bitácora Propia";
  onOriginChange: (origin: "Spacetime Suite" | "Bitácora Propia") => void;
  oddsFormat: OddsFormat;
  onClose: () => void;
  onPick: (picked: AttachedPick) => void;
}): React.JSX.Element {
  const uid = useId();
  const { userTimezone } = usePlatformCore();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const journalMatches = useMemo(() => {
    const sorted = [...journal].sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (b.status === "pending" && a.status !== "pending") return 1;
      return (b.sealedAtIso ?? "").localeCompare(a.sealedAtIso ?? "");
    });
    return sorted
      .filter(
        (e) =>
          !q ||
          `${e.pickLabel} ${e.matchLabel} ${e.leagueLabel}`.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [journal, q]);

  const upcoming = useMemo(() => {
    return games
      .filter((g) => g.status === "NS" && g.picks.length > 0)
      .filter(
        (g) =>
          !q ||
          `${g.home.name} ${g.away.name} ${g.home.shortName} ${g.away.shortName} ${g.leagueLabel}`
            .toLowerCase()
            .includes(q),
      )
      .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc))
      .slice(0, 12);
  }, [games, q]);

  return (
    <TopLayerModalDialog open onClose={onClose} ariaLabelledBy={`${uid}-title`} maxWidth="34rem">
      <div className="pl-com-picker">
        <div className="pl-com-sheet-head">
          <h2 id={`${uid}-title`} className="pl-com-sheet-title">
            Adjuntar pick
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Cerrar"
            onClick={onClose}
          >
            <MaestroIcon name="x" size={16} />
          </Button>
        </div>
        <div className="pl-com-seg pl-com-picker-mode max-w-full" role="group" aria-label="Fuente del pick">
          <button
            type="button"
            aria-pressed={origin === "Spacetime Suite"}
            onClick={() => onOriginChange("Spacetime Suite")}
          >
            Del modelo
          </button>
          <button
            type="button"
            aria-pressed={origin === "Bitácora Propia"}
            onClick={() => onOriginChange("Bitácora Propia")}
          >
            Mi bitácora / Propio
          </button>
        </div>
        <label className="sr-only" htmlFor={`${uid}-q`}>
          Buscar partido
        </label>
        <input
          id={`${uid}-q`}
          className="pl-com-search"
          type="search"
          placeholder={
            origin === "Bitácora Propia"
              ? "Buscar en tu bitácora o partido"
              : "Buscar equipo o liga"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="pl-com-picker-list">
          {origin === "Bitácora Propia" ? (
            <>
              <div className="pl-com-picker-section">
                <p className="pl-com-picker-heading">Ya sellados en tu bitácora</p>
                {journalMatches.length === 0 ? (
                  <p className="pl-prof-empty-line">
                    No tienes picks sellados con esa búsqueda. Puedes elegir uno de la cartelera
                    abajo y fijar tus unidades y momio.
                  </p>
                ) : (
                  <ul className="pl-com-picker-journal">
                    {journalMatches.map((entry) => {
                      const mp = entryToMatchPick(entry, games);
                      const isUuid = /^[0-9a-f-]{36}$/i.test(entry.id);
                      return (
                        <li key={entry.id}>
                          <button
                            type="button"
                            className="pl-com-picker-pick"
                            onClick={() =>
                              onPick({
                                matchPick: mp,
                                units: entry.units,
                                userDecimal: entry.userDecimal,
                                ...(isUuid ? { sealedEntryId: entry.id } : {}),
                              })
                            }
                          >
                            <span className="min-w-0 truncate">
                              {entry.pickLabel} ·{" "}
                              <small className="pl-prof-muted">{entry.matchLabel}</small>
                            </span>
                            <span className="num pl-prof-muted shrink-0">
                              {entry.units.toFixed(1)}u @{" "}
                              {formatOddsValue(entry.userDecimal, oddsFormat)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {upcoming.length > 0 ? (
                <p className="pl-com-picker-heading">
                  Cartelera próxima (ajusta unidades y momio al adjuntar)
                </p>
              ) : null}
            </>
          ) : null}
          {upcoming.length === 0 ? (
            origin === "Spacetime Suite" ? (
              <p className="pl-prof-empty-line">No hay partidos próximos con ese nombre.</p>
            ) : null
          ) : (
            upcoming.map((game) => (
              <section
                key={game.id}
                className="pl-com-picker-game"
                aria-label={`${game.home.name} vs ${game.away.name}`}
              >
                <p className="pl-com-picker-match">
                  <LeagueBadge league={game.league} size={16} />
                  <span>
                    {game.home.shortName || game.home.name} vs{" "}
                    {game.away.shortName || game.away.name}
                  </span>
                  <span className="pl-prof-muted num">
                    · {kickoffLabel(game.kickoffUtc, userTimezone)}
                  </span>
                </p>
                <ul>
                  {[...game.picks]
                    .sort((a, b) => b.p - a.p)
                    .slice(0, 4)
                    .map((pick) => (
                      <li key={pick.id}>
                        <button
                          type="button"
                          className="pl-com-picker-pick"
                          onClick={() =>
                            onPick({
                              matchPick: pick,
                              units: Math.max(
                                0.5,
                                Math.min(5, Math.round((pick.suggestedUnits || 1) * 2) / 2),
                              ),
                              userDecimal: pick.marketDecimal ?? pick.fairDecimal,
                            })
                          }
                        >
                          <span className="min-w-0 truncate">{pick.label}</span>
                          <span className="num pl-prof-muted shrink-0">
                            {formatOddsValue(pick.marketDecimal ?? pick.fairDecimal, oddsFormat)} ·
                            justo {formatOddsValue(pick.fairDecimal, oddsFormat)} ·{" "}
                            {(pick.p * 100).toFixed(1)} %
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </TopLayerModalDialog>
  );
}

type PlatformActions = ReturnType<typeof usePlatformActions>;

interface FeedSharedProps {
  authorOf: (post: SocialPost) => SocialPostAuthor;
  own: OwnIdentity | null;
  dataset: PlatformDataset;
  journal: readonly JournalEntry[];
  oddsFormat: OddsFormat;
  follows: ReturnType<typeof useFollowing>;
  onToggleFollow: (handle: string) => void;
  onCopy: (post: SocialPost) => void;
  onCopyToParlay: (post: SocialPost) => void;
  onShare: (post: SocialPost) => void;
  toggleSocialLike: (postId: string) => void;
  addSocialComment: PlatformActions["addSocialComment"];
  deleteSocialComment: PlatformActions["deleteSocialComment"];
  toggleSocialCommentHelpful: PlatformActions["toggleSocialCommentHelpful"];
  loadAllPostComments: PlatformActions["loadAllPostComments"];
  onDelete: (postId: string) => void;
  onOpenReport: (target: SocialReportTarget) => void;
  navigateTo: (href: string) => void;
  goProfile: (handle: string) => (e: React.MouseEvent<HTMLAnchorElement>) => void;
  highlightedPostId?: string | null;
}

const MemoSocialPostItem = memo(SocialPostCard);

const Feed = memo(function Feed({
  posts,
  scope,
  emptyText = "Todavía no hay publicaciones.",
  ...shared
}: FeedSharedProps & {
  posts: readonly SocialPost[];
  scope?: SocialFeedScope;
  emptyText?: string;
}): React.JSX.Element {
  const { loadOlderSocialPosts } = usePlatformActions();
  const { socialFeedPages } = useSocialState();
  const [limit, setLimit] = useState(FEED_PAGE);
  const pageState = socialFeedPages[socialScopeKey(scope)];
  const hasMoreServer = Boolean(pageState?.hasMore);
  const loadingOlder = Boolean(pageState?.loading);

  const realPosts = useMemo(() => posts.filter((p) => !p.isExample), [posts]);
  const examplePosts = useMemo(() => posts.filter((p) => p.isExample), [posts]);
  const displayPool = useMemo(
    () => (hasMoreServer ? realPosts : [...realPosts, ...examplePosts]),
    [hasMoreServer, realPosts, examplePosts],
  );

  const targetIdx = shared.highlightedPostId
    ? displayPool.findIndex((p) => p.id === shared.highlightedPostId)
    : -1;
  const effectiveLimit = targetIdx >= limit ? targetIdx + FEED_PAGE : limit;

  const resolvedVisiblePosts = useMemo(
    () =>
      displayPool.slice(0, effectiveLimit).map((post) => ({
        post,
        author: shared.authorOf(post),
        following: shared.follows.isFollowing(post.authorHandle),
      })),
    [displayPool, effectiveLimit, shared.authorOf, shared.follows],
  );

  const onShowMore = useCallback((): void => {
    if (loadingOlder) return;
    const nextLimit = effectiveLimit + FEED_PAGE;
    setLimit(nextLimit);
    if (hasMoreServer && nextLimit >= realPosts.length) {
      void loadOlderSocialPosts(scope);
    }
  }, [effectiveLimit, hasMoreServer, loadOlderSocialPosts, loadingOlder, realPosts.length, scope]);

  if (displayPool.length === 0 && !hasMoreServer && !loadingOlder) {
    return <SofascoreEmptyState title={emptyText} />;
  }

  const canShowMore = displayPool.length > effectiveLimit || hasMoreServer || loadingOlder;

  return (
    <div className="pl-com-feed">
      {resolvedVisiblePosts.map(({ post, author, following }) => (
        <MemoSocialPostItem
          key={post.id}
          post={post}
          author={author}
          own={shared.own}
          dataset={shared.dataset}
          journal={shared.journal}
          oddsFormat={shared.oddsFormat}
          following={following}
          onToggleFollow={shared.onToggleFollow}
          onCopy={shared.onCopy}
          onCopyToParlay={shared.onCopyToParlay}
          onShare={shared.onShare}
          toggleSocialLike={shared.toggleSocialLike}
          addSocialComment={shared.addSocialComment}
          onDeleteComment={shared.deleteSocialComment}
          onToggleCommentHelpful={shared.toggleSocialCommentHelpful}
          onLoadAllComments={shared.loadAllPostComments}
          onDeletePost={shared.onDelete}
          onOpenReport={shared.onOpenReport}
          onNavigate={shared.navigateTo}
          goProfile={shared.goProfile}
          highlighted={shared.highlightedPostId === post.id}
        />
      ))}
      {canShowMore ? (
        <div className="pl-prof-more">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={loadingOlder}
            onClick={onShowMore}
          >
            {loadingOlder ? "Cargando…" : "Ver más"}
          </Button>
        </div>
      ) : null}
    </div>
  );
});

const YourMonthCard = memo(function YourMonthCard({
  own,
  ranked,
  monthName,
  goProfile,
}: {
  own: OwnIdentity | null;
  ranked: readonly RankedAnalyst[];
  monthName: string;
  goProfile: (handle: string) => (e: React.MouseEvent<HTMLAnchorElement>) => void;
}): React.JSX.Element | null {
  if (!own) return null;
  const me = ranked.find((r) => r.handle === own.handle);
  const tenth = ranked[TOP_N - 1];
  return (
    <SofascoreCard id="pl-com-mine" title={`Tu ${monthName}`} density="compact">
      <div className="pl-com-card-stack">
        {me ? (
          <>
            <div className="pl-com-mine num">
              <p className="pl-com-mine-rank">#{me.rank}</p>
              <p>
                <strong className={me.record.netUnits >= 0 ? "pl-prof-pos" : "pl-prof-neg"}>
                  {formatUnits(me.record.netUnits)}
                </strong>{" "}
                · {me.record.settled} picks
              </p>
            </div>
            {me.rank > TOP_N && tenth ? (
              <p className="pl-com-card-note num">
                Te faltan {Math.max(0.1, tenth.record.netUnits - me.record.netUnits).toFixed(1)}u
                para el top 10.
              </p>
            ) : null}
          </>
        ) : (
          <p className="pl-com-card-note">
            Registra {LEADERBOARD_MIN_SETTLED} picks para entrar al ranking.
          </p>
        )}
        <a
          href={`/app/u/${own.handle}`}
          className="pl-prof-link pl-com-inline-link"
          onClick={goProfile(own.handle)}
        >
          Ver mi perfil
        </a>
      </div>
    </SofascoreCard>
  );
});

const TopCard = memo(function TopCard({
  ranked,
  monthName,
  onRanking,
  goProfile,
}: {
  ranked: readonly RankedAnalyst[];
  monthName: string;
  onRanking: () => void;
  goProfile: (handle: string) => (e: React.MouseEvent<HTMLAnchorElement>) => void;
}): React.JSX.Element {
  return (
    <SofascoreCard
      id="pl-com-top"
      title={`Top de ${monthName}`}
      density="compact"
      meta={
        <button type="button" className="pl-com-text-btn" onClick={onRanking}>
          Ver ranking
        </button>
      }
    >
      {ranked.length === 0 ? (
        <p className="pl-com-card-note">
          Aún nadie llega a {LEADERBOARD_MIN_SETTLED} picks este mes.
        </p>
      ) : (
        <ol className="pl-com-top">
          {ranked.slice(0, 5).map((r) => (
            <li key={r.handle}>
              <span className="pl-com-top-rank num">{r.rank}</span>
              <Avatar
                initials={r.avatarInitials}
                avatarUrl={r.avatarUrl}
                gradVar={r.avatarGradVar}
                size={28}
                loading="lazy"
              />
              <a
                href={`/app/u/${r.handle}`}
                onClick={goProfile(r.handle)}
                className="pl-com-top-name"
              >
                {r.name}
              </a>
              <span className={`num ${r.record.netUnits >= 0 ? "pl-prof-pos" : "pl-prof-neg"}`}>
                {formatUnits(r.record.netUnits)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </SofascoreCard>
  );
});

const HotCard = memo(function HotCard({
  item,
  onConsensus,
}: {
  item: ConsensusGame;
  onConsensus: () => void;
}): React.JSX.Element {
  const g = item.game;
  return (
    <SofascoreCard
      id="pl-com-hot"
      title="Más comentado hoy"
      density="compact"
      meta={
        <button type="button" className="pl-com-text-btn" onClick={onConsensus}>
          Ver consenso
        </button>
      }
    >
      <div className="pl-com-card-stack">
        <p className="pl-com-hot-match flex-wrap min-w-0">
          <TeamBadge league={g.league} slug={g.home.slug} name={g.home.name} size={22} decorative />
          {g.home.shortName || g.home.name} vs {g.away.shortName || g.away.name}
          <TeamBadge league={g.league} slug={g.away.slug} name={g.away.name} size={22} decorative />
        </p>
        <BarsPair label={item.top.label} fans={item.top.fansPct} model={item.top.modelPct} />
      </div>
    </SofascoreCard>
  );
});

const BarsPair = memo(function BarsPair({
  label,
  fans,
  model,
}: {
  label: string;
  fans: number;
  model: number;
}): React.JSX.Element {
  const fansWidth = Math.max(0, Math.min(100, fans));
  const modelWidth = Math.max(0, Math.min(100, model));
  return (
    <div
      className="pl-com-bars num"
      role="img"
      aria-label={`${label}: socios ${fans} %, modelo ${model} %`}
    >
      <span className="pl-com-bars-name">Socios</span>
      <span className="pl-com-bar" aria-hidden="true">
        <span className="pl-com-bar-fill pl-com-bar-fill--fans" style={{ width: `${fansWidth}%` }} />
      </span>
      <strong>{fans} %</strong>
      <span className="pl-com-bars-name">Modelo</span>
      <span className="pl-com-bar" aria-hidden="true">
        <span
          className="pl-com-bar-fill pl-com-bar-fill--model"
          style={{ width: `${modelWidth}%` }}
        />
      </span>
      <strong>{model} %</strong>
    </div>
  );
});

const MobileTop = memo(function MobileTop({
  ranked,
  monthName,
  goProfile,
}: {
  ranked: readonly RankedAnalyst[];
  monthName: string;
  goProfile: (handle: string) => (e: React.MouseEvent<HTMLAnchorElement>) => void;
}): React.JSX.Element | null {
  if (ranked.length === 0) return null;
  return (
    <section className="pl-com-mtop" aria-labelledby="pl-com-mtop-title">
      <h2 id="pl-com-mtop-title" className="pl-prof-eyebrow">
        Top de {monthName}
      </h2>
      <ol className="pl-com-mtop-list">
        {ranked.slice(0, 10).map((r) => (
          <li key={r.handle}>
            <a
              href={`/app/u/${r.handle}`}
              onClick={goProfile(r.handle)}
              className="pl-com-mtop-card"
            >
              <span className="pl-com-mtop-rank num">#{r.rank}</span>
              <Avatar
                initials={r.avatarInitials}
                avatarUrl={r.avatarUrl}
                gradVar={r.avatarGradVar}
                size={40}
              />
              <span className="pl-com-mtop-name">{r.name.split(" ")[0]}</span>
              <span className={`num ${r.record.netUnits >= 0 ? "pl-prof-pos" : "pl-prof-neg"}`}>
                {formatUnits(r.record.netUnits)}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
});

type FollowFilter = "all" | "tipsters" | "socios" | "open";

const FollowingTab = memo(function FollowingTab({
  posts,
  seasonRanked,
  ...shared
}: FeedSharedProps & {
  posts: readonly SocialPost[];
  seasonRanked: readonly RankedAnalyst[];
}): React.JSX.Element {
  const { loadFollowingSocialPosts } = usePlatformActions();
  const [filter, setFilter] = useState<FollowFilter>("all");
  const { follows, dataset, onToggleFollow, goProfile } = shared;
  const followed = follows.following;
  const { topics, toggleLeague, toggleTeam } = useFollowedTopics();
  const topicCount = topics.leagues.length + topics.teams.length;
  const isFollowedPost = useCallback(
    (p: SocialPost) => followed.includes(p.authorHandle) || postMatchesTopics(p, topics, dataset),
    [dataset, followed, topics],
  );

  useSafeEffect(() => {
    if (followed.length > 0 || topicCount > 0) {
      loadFollowingSocialPosts();
    }
  }, [followed.length, topicCount, loadFollowingSocialPosts]);

  const followedInfo = useMemo(
    () =>
      followed.map((handle) => {
        const spec = getExampleAnalystSpec(handle);
        const matchingPost = posts.find((p) => p.authorHandle === handle);
        const postTipster = posts.some(
          (p) =>
            p.authorHandle === handle &&
            (p.authorIsTipster || p.roleBadge === "Tipster Oficial"),
        );
        return {
          handle,
          initials: spec?.avatarInitials ?? handle.slice(0, 2).toUpperCase(),
          gradVar: spec?.avatarGradVar ?? "var(--avatar-grad-4)",
          avatarUrl: spec ? null : (matchingPost?.authorAvatarUrl ?? null),
          isTipster: spec?.isTipster ?? postTipster,
          name: spec?.name ?? matchingPost?.authorName ?? `@${handle}`,
        };
      }),
    [followed, posts],
  );
  const tipsters = useMemo(
    () => followedInfo.filter((f) => f.isTipster).length,
    [followedInfo],
  );

  const followedPosts = useMemo(() => {
    const base = posts.filter(isFollowedPost);
    return base.filter((p) => {
      const tip =
        (getExampleAnalystSpec(p.authorHandle)?.isTipster ?? false) ||
        Boolean(p.authorIsTipster || p.roleBadge === "Tipster Oficial");
      if (filter === "tipsters") return tip;
      if (filter === "socios") return !tip;
      if (filter === "open") return p.pick?.status === "open";
      return true;
    });
  }, [filter, isFollowedPost, posts]);

  const openPicks = useMemo(() => {
    const groups = new Map<
      string,
      { label: string; gameId: string; names: string[]; kickoff?: string; league?: string }
    >();
    for (const p of posts) {
      if (!isFollowedPost(p) || p.pick?.status !== "open") continue;
      const meta = resolveEntryGame(p.pick.gameId, dataset);
      const g = groups.get(p.pick.pickId) ?? {
        label: p.pick.label,
        gameId: p.pick.gameId,
        names: [],
        kickoff: meta?.kickoffIso,
        league: meta?.leagueLabel ?? p.leagueLabel,
      };
      g.names.push(p.authorName.split(" ")[0] ?? p.authorName);
      groups.set(p.pick.pickId, g);
    }
    return [...groups.values()]
      .sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? ""))
      .slice(0, 5);
  }, [dataset, isFollowedPost, posts]);

  const suggestions = useMemo(
    () =>
      seasonRanked
        .filter((r) => !followed.includes(r.handle) && r.handle !== shared.own?.handle)
        .slice(0, 3),
    [followed, seasonRanked, shared.own?.handle],
  );

  const suggestionList = (
    <ul className="pl-com-suggest">
      {suggestions.map((r) => (
        <li key={r.handle}>
          <Avatar
            initials={r.avatarInitials}
            avatarUrl={r.avatarUrl}
            gradVar={r.avatarGradVar}
            size={36}
            loading="lazy"
          />
          <span className="pl-com-suggest-who">
            <a href={`/app/u/${r.handle}`} onClick={goProfile(r.handle)}>
              {r.name}
            </a>
            {r.isTipster ? <VerifiedSeal size={14} /> : null}
            <span className="pl-prof-muted num">
              {formatUnits(r.record.netUnits)} · {r.record.settled} picks
            </span>
          </span>
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="shrink-0"
            aria-pressed={false}
            aria-label={`Seguir a ${r.name}`}
            onClick={() => onToggleFollow(r.handle)}
          >
            Seguir
          </Button>
        </li>
      ))}
    </ul>
  );

  const topicsPicker = (
    <TopicsPicker
      games={dataset.games}
      topics={topics}
      onToggleLeague={toggleLeague}
      onToggleTeam={toggleTeam}
      defaultOpen={followed.length === 0 && topicCount === 0}
    />
  );

  if (followed.length === 0 && topicCount === 0) {
    return (
      <div className="pl-com-main">
        <SofascoreCard title="Aún no sigues a nadie">
          <div className="pl-com-card-stack">
            <p className="pl-com-card-note">
              Sigue a socios o elige ligas y equipos: sus publicaciones aparecen aquí.
            </p>
            {suggestionList}
          </div>
        </SofascoreCard>
        {topicsPicker}
      </div>
    );
  }

  return (
    <div className="pl-com-cols">
      <div className="pl-com-main">
        <section className="pl-com-strip" aria-label="A quién sigues">
          <span className="pl-com-stack" aria-hidden="true">
            {followedInfo.slice(0, 5).map((f) => (
              <Avatar
                key={f.handle}
                initials={f.initials}
                avatarUrl={f.avatarUrl}
                gradVar={f.gradVar}
                size={32}
                loading="lazy"
              />
            ))}
          </span>
          <p className="pl-com-strip-copy num">
            {followSummary(followed.length, tipsters, topics)}
          </p>
        </section>

        {topicsPicker}

        <div className="pl-com-filters" role="group" aria-label="Filtrar">
          {(
            [
              ["all", "Todos"],
              ["tipsters", "Tipsters"],
              ["socios", "Socios"],
              ["open", "Con pick abierto"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="pl-prof-chip"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {openPicks.length > 0 ? (
          <ol className="pl-com-open-strip" aria-label="Picks abiertos de quienes sigues">
            {openPicks.map((p) => (
              <li key={`${p.gameId}-${p.label}`} className="pl-com-open-strip-item">
                <p className="pl-prof-row-sub num">
                  {capitalize(kickoffLabel(p.kickoff))} · {p.league}
                </p>
                <p className="pl-prof-row-title">{p.label}</p>
                <p className="pl-prof-row-sub">{p.names.join(", ")}</p>
              </li>
            ))}
          </ol>
        ) : null}

        <Feed
          key={`following:${filter}`}
          posts={followedPosts}
          scope={{ following: true }}
          emptyText="Nada de quienes sigues ni de tus ligas y equipos con este filtro."
          {...shared}
        />
      </div>
      <aside className="pl-com-aside" aria-label="De quienes sigues">
        <SofascoreCard id="pl-com-open" title="Picks abiertos · próximos" density="compact">
          {openPicks.length === 0 ? (
            <p className="pl-com-card-note">Sin picks abiertos de quienes sigues.</p>
          ) : (
            <ol className="pl-com-open-list">
              {openPicks.map((p) => (
                <li key={`${p.gameId}-${p.label}`}>
                  <p className="pl-prof-row-sub num">
                    {capitalize(kickoffLabel(p.kickoff))} · {p.league}
                  </p>
                  <p className="pl-com-open-label">{p.label}</p>
                  <p className="pl-prof-row-sub">{p.names.join(", ")}</p>
                </li>
              ))}
            </ol>
          )}
        </SofascoreCard>
        {suggestions.length > 0 ? (
          <SofascoreCard id="pl-com-suggest" title="Para seguir" density="compact">
            {suggestionList}
          </SofascoreCard>
        ) : null}
      </aside>
    </div>
  );
});

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

function followSummary(people: number, tipsters: number, topics: FollowedTopics): string {
  const parts: string[] = [];
  if (people > 0) {
    const kinds = [
      tipsters > 0 ? plural(tipsters, "tipster", "tipsters") : "",
      people - tipsters > 0 ? plural(people - tipsters, "socio", "socios") : "",
    ].filter(Boolean);
    parts.push(`Sigues a ${people} (${kinds.join(", ")})`);
  }
  const topicParts = [
    topics.leagues.length > 0 ? plural(topics.leagues.length, "liga", "ligas") : "",
    topics.teams.length > 0 ? plural(topics.teams.length, "equipo", "equipos") : "",
  ].filter(Boolean);
  if (topicParts.length > 0) {
    parts.push(`${people > 0 ? "" : "Sigues "}${topicParts.join(" y ")}`);
  }
  return parts.join(" · ");
}

const TopicsPicker = memo(function TopicsPicker({
  games,
  topics,
  onToggleLeague,
  onToggleTeam,
  defaultOpen,
}: {
  games: readonly PlatformGame[];
  topics: FollowedTopics;
  onToggleLeague: (league: string) => void;
  onToggleTeam: (key: string) => void;
  defaultOpen: boolean;
}): React.JSX.Element | null {
  const uid = useId();
  const [query, setQuery] = useState("");
  const leagues = useMemo(() => {
    const map = new Map<
      string,
      {
        league: PlatformGame["league"];
        label: string;
        teams: Map<string, { slug: string; name: string }>;
      }
    >();
    for (const g of games) {
      const entry = map.get(g.league) ?? {
        league: g.league,
        label: g.leagueLabel,
        teams: new Map(),
      };
      entry.teams.set(g.home.slug, { slug: g.home.slug, name: g.home.shortName || g.home.name });
      entry.teams.set(g.away.slug, { slug: g.away.slug, name: g.away.shortName || g.away.name });
      map.set(g.league, entry);
    }
    return [...map.values()].map((l) => ({
      ...l,
      teams: [...l.teams.values()].sort((a, b) => a.name.localeCompare(b.name, "es")),
    }));
  }, [games]);

  const [selectedLeagueKey, setSelectedLeagueKey] = useState<string>("");
  const activeLeagueKey =
    selectedLeagueKey && leagues.some((l) => l.league === selectedLeagueKey)
      ? selectedLeagueKey
      : (leagues[0]?.league ?? "");
  const activeLeague = leagues.find((l) => l.league === activeLeagueKey) ?? leagues[0];

  const normalizedQuery = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  const matchingTeams = useMemo(() => {
    if (!normalizedQuery) {
      return activeLeague
        ? activeLeague.teams.map((t) => ({
            ...t,
            league: activeLeague.league,
            leagueLabel: activeLeague.label,
          }))
        : [];
    }
    const hits: Array<{
      slug: string;
      name: string;
      league: PlatformGame["league"];
      leagueLabel: string;
    }> = [];
    for (const l of leagues) {
      for (const t of l.teams) {
        const hay = `${t.name} ${l.label}`
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();
        if (hay.includes(normalizedQuery)) {
          hits.push({ ...t, league: l.league, leagueLabel: l.label });
        }
      }
    }
    return hits.slice(0, 24);
  }, [activeLeague, leagues, normalizedQuery]);

  const count = topics.leagues.length + topics.teams.length;
  if (leagues.length === 0) return null;

  const isFollowingActiveLeague = activeLeague
    ? topics.leagues.includes(activeLeague.league)
    : false;

  return (
    <details className="pl-com-topics" open={defaultOpen}>
      <summary className="pl-com-topics-summary">
        <span>Ligas y equipos que sigues</span>
        <span className="pl-prof-muted num">{count === 0 ? "Elegir" : `${count} activos`}</span>
      </summary>
      <div className="pl-com-topics-body">
        <p className="pl-com-card-note">
          Sigue una liga o tus equipos favoritos para ver sus publicaciones en «Siguiendo».
        </p>

        {count > 0 ? (
          <div className="pl-com-filters !mx-0 !px-0" role="group" aria-label="Temas seguidos actualmente">
            {topics.leagues.map((lgId) => {
              const lgObj = leagues.find((item) => item.league === lgId);
              return (
                <button
                  key={`followed-lg-${lgId}`}
                  type="button"
                  className="pl-prof-chip"
                  aria-pressed={true}
                  onClick={() => onToggleLeague(lgId)}
                >
                  <LeagueBadge league={lgId} size={15} />
                  <span>{lgObj?.label ?? lgId}</span>
                  <MaestroIcon name="x" size={12} />
                </button>
              );
            })}
            {topics.teams.map((key) => {
              const [lgId, slug] = key.split(":");
              const lgObj = leagues.find((item) => item.league === lgId);
              const teamObj = lgObj?.teams.find((t) => t.slug === slug);
              if (!lgId || !slug) return null;
              return (
                <button
                  key={`followed-tm-${key}`}
                  type="button"
                  className="pl-prof-chip"
                  aria-pressed={true}
                  onClick={() => onToggleTeam(key)}
                >
                  <TeamBadge
                    league={lgId}
                    slug={slug}
                    name={teamObj?.name ?? slug}
                    size={15}
                    decorative
                  />
                  <span>{teamObj?.name ?? slug}</span>
                  <MaestroIcon name="x" size={12} />
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="pl-com-topics-toolbar">
          <div className="pl-com-select-wrap">
            <label htmlFor={`${uid}-topic-league`} className="sr-only">
              Elegir liga para explorar equipos
            </label>
            <select
              id={`${uid}-topic-league`}
              className="pl-com-select"
              value={activeLeagueKey}
              onChange={(e) => {
                setSelectedLeagueKey(e.target.value);
                setQuery("");
              }}
            >
              {leagues.map((l) => (
                <option key={l.league} value={l.league}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {activeLeague && !normalizedQuery ? (
            <button
              type="button"
              className="pl-prof-chip"
              aria-pressed={isFollowingActiveLeague}
              onClick={() => onToggleLeague(activeLeague.league)}
            >
              <LeagueBadge league={activeLeague.league} size={15} />
              <span>
                {isFollowingActiveLeague
                  ? `Siguiendo ${activeLeague.label}`
                  : `Seguir toda ${activeLeague.label}`}
              </span>
            </button>
          ) : null}

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar equipo…"
            aria-label="Buscar equipo para seguir"
            className="pl-com-search pl-com-topics-search"
          />
        </div>

        <div className="pl-com-topics-league">
          <p className="pl-com-topics-label" id={`${uid}-teams`}>
            {normalizedQuery
              ? `Resultados para «${query.trim()}»`
              : activeLeague
                ? `Equipos de ${activeLeague.label}`
                : "Equipos"}
          </p>
          {matchingTeams.length === 0 ? (
            <p className="pl-com-card-note">Sin equipos que coincidan con esa búsqueda.</p>
          ) : (
            <div className="pl-com-filters !mx-0 !px-0" role="group" aria-labelledby={`${uid}-teams`}>
              {matchingTeams.map((t) => {
                const key = teamTopicKey(t.league, t.slug);
                return (
                  <button
                    key={key}
                    type="button"
                    className="pl-prof-chip"
                    aria-pressed={topics.teams.includes(key)}
                    onClick={() => onToggleTeam(key)}
                  >
                    <TeamBadge
                      league={t.league}
                      slug={t.slug}
                      name={t.name}
                      size={16}
                      decorative
                    />
                    <span>{t.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </details>
  );
});

type ConsensusSort = "diff" | "picks" | "soon";

function diffClass(diff: number): string {
  const abs = Math.abs(diff);
  if (abs >= CONSENSUS_STRONG_PTS) return "pl-com-diff pl-com-diff--strong";
  if (abs < CONSENSUS_AGREE_PTS) return "pl-com-diff pl-com-diff--quiet";
  return "pl-com-diff";
}

function sampleLabel(item: ConsensusGame): string {
  const parts: string[] = [];
  if (item.totalPicks > 0) {
    parts.push(`${item.totalPicks} ${item.totalPicks === 1 ? "pick" : "picks"}`);
  }
  if (item.votes) {
    parts.push(`${item.votes.total} ${item.votes.total === 1 ? "voto" : "votos"}`);
  }
  return parts.join(" · ");
}

const sampleSize = (item: ConsensusGame): number => item.totalPicks + (item.votes?.total ?? 0);

const ConsensusTab = memo(function ConsensusTab({
  items,
}: {
  items: readonly ConsensusGame[];
}): React.JSX.Element {
  const { userTimezone } = usePlatformCore();
  const sortId = useId();
  const [league, setLeague] = useState("all");
  const [sort, setSort] = useState<ConsensusSort>("diff");
  const leagues = useMemo(() => [...new Set(items.map((i) => i.game.leagueLabel))], [items]);
  const list = useMemo(() => {
    const filtered =
      league === "all" ? [...items] : items.filter((i) => i.game.leagueLabel === league);
    if (sort === "picks") filtered.sort((a, b) => sampleSize(b) - sampleSize(a));
    if (sort === "soon") {
      filtered.sort((a, b) => a.game.kickoffUtc.localeCompare(b.game.kickoffUtc));
    }
    return filtered;
  }, [items, league, sort]);

  const consensusColumns = useMemo<readonly SofascoreTableColumn<ConsensusGame>[]>(
    () => [
      {
        key: "match",
        header: "Partido",
        sticky: true,
        render: (i) => (
          <div className="pl-com-crow-match">
            <LeagueBadge league={i.game.league} size={18} />
            <div>
              <p className="pl-prof-row-title">
                {i.game.home.shortName || i.game.home.name} vs{" "}
                {i.game.away.shortName || i.game.away.name}
              </p>
              <p className="pl-prof-row-sub">{kickoffLabel(i.game.kickoffUtc, userTimezone)}</p>
            </div>
          </div>
        ),
      },
      {
        key: "top",
        header: "Más elegido",
        render: (i) => <span>{i.top.label}</span>,
      },
      {
        key: "fans",
        header: "Socios",
        numeric: true,
        render: (i) => <strong className="num">{i.top.fansPct} %</strong>,
      },
      {
        key: "model",
        header: "Modelo",
        numeric: true,
        render: (i) => <span className="pl-prof-muted num">{i.top.modelPct} %</span>,
      },
      {
        key: "diff",
        header: "Diferencia",
        align: "end",
        render: (i) => (
          <span className={`${diffClass(i.top.diffPts)} num`}>{formatDiffPts(i.top.diffPts)}</span>
        ),
      },
      {
        key: "sample",
        header: "Muestra",
        align: "end",
        render: (i) => <span className="pl-prof-muted num">{sampleLabel(i)}</span>,
      },
    ],
    [userTimezone],
  );

  if (items.length === 0) {
    return (
      <div className="pl-com-consensus">
        <SofascoreEmptyState
          title="Todavía no hay partidos con suficientes picks o votos de socios"
          description="Publica tu pick con «Adjuntar pick» o vota «¿Quién gana?» en la ficha del partido: los dos cuentan."
        />
        <ConsensusNote />
      </div>
    );
  }

  const [featured, ...rest] = list;
  return (
    <div className="pl-com-consensus">
      <div className="pl-com-toolbar">
        <div className="pl-com-filters" role="group" aria-label="Liga">
          <button
            type="button"
            className="pl-prof-chip"
            aria-pressed={league === "all"}
            onClick={() => setLeague("all")}
          >
            Todas
          </button>
          {leagues.map((l) => (
            <button
              key={l}
              type="button"
              className="pl-prof-chip"
              aria-pressed={league === l}
              onClick={() => setLeague(l)}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="pl-com-sort">
          <label htmlFor={sortId}>Ordenar</label>
          <select
            id={sortId}
            className="pl-com-select"
            value={sort}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "diff" || v === "picks" || v === "soon") setSort(v);
            }}
          >
            <option value="diff">Mayor diferencia</option>
            <option value="picks">Más picks</option>
            <option value="soon">Próximos</option>
          </select>
        </div>
      </div>

      {featured ? (
        <SofascoreCard
          as="article"
          title={sort === "diff" ? "Mayor diferencia hoy" : "Destacado"}
          meta={sampleLabel(featured)}
          className="pl-com-featured-card"
        >
          <h2 id="pl-com-featured-title" className="pl-com-featured-title">
            <TeamBadge
              league={featured.game.league}
              slug={featured.game.home.slug}
              name={featured.game.home.name}
              size={24}
              decorative
            />
            {featured.game.home.shortName || featured.game.home.name} vs{" "}
            {featured.game.away.shortName || featured.game.away.name}
            <TeamBadge
              league={featured.game.league}
              slug={featured.game.away.slug}
              name={featured.game.away.name}
              size={24}
              decorative
            />
          </h2>
          <p className="pl-com-card-note num">
            {featured.game.leagueLabel} · {kickoffLabel(featured.game.kickoffUtc, userTimezone)} ·{" "}
            {sampleLabel(featured)}
          </p>
          {featured.outcomes.length > 0 ? (
            <>
              <h3 className="pl-com-consensus-sub">Picks publicados</h3>
              <div className="pl-com-outcomes">
                {featured.outcomes.slice(0, 3).map((o) => (
                  <div key={o.pickId} className="pl-com-outcome">
                    <div className="pl-com-outcome-head">
                      <p>{o.label}</p>
                      <span className={`${diffClass(o.diffPts)} num`}>
                        {formatDiffPts(o.diffPts)}
                      </span>
                    </div>
                    <BarsPair label={o.label} fans={o.fansPct} model={o.modelPct} />
                  </div>
                ))}
              </div>
            </>
          ) : null}
          {featured.votes ? (
            <>
              <h3 className="pl-com-consensus-sub num">
                ¿Quién gana? · {featured.votes.total} votos
              </h3>
              <div className="pl-com-outcomes">
                {featured.votes.outcomes.map((o) => (
                  <div key={o.pickId} className="pl-com-outcome">
                    <div className="pl-com-outcome-head">
                      <p>{o.label}</p>
                      <span className={`${diffClass(o.diffPts)} num`}>
                        {formatDiffPts(o.diffPts)}
                      </span>
                    </div>
                    <BarsPair label={o.label} fans={o.fansPct} model={o.modelPct} />
                  </div>
                ))}
              </div>
            </>
          ) : null}
          <p className="pl-com-reading">{consensusReading(featured.top)}</p>
        </SofascoreCard>
      ) : null}

      {rest.length > 0 ? (
        <SofascoreTable
          caption="Consenso de socios frente al modelo"
          columns={consensusColumns}
          rows={rest}
          rowKey={(i) => i.game.id}
          density="compact"
        />
      ) : null}
      <ConsensusNote />
    </div>
  );
});

const ConsensusNote = memo(function ConsensusNote(): React.JSX.Element {
  return (
    <p className="pl-com-footnote">
      Socios: % de picks publicados por resultado, o % de votos de «¿Quién gana?». Modelo:
      probabilidad del partido. Entran partidos con {CONSENSUS_MIN_PICKS} picks o{" "}
      {CONSENSUS_MIN_VOTES} votos.
    </p>
  );
});

const RankingTab = memo(function RankingTab({
  rows,
  own,
  ownJournal,
  source,
  today,
  follows,
  onToggleFollow,
  goProfile,
  onPrivacy,
}: {
  rows: ReturnType<typeof useLeaderboardRows>["rows"];
  own: OwnIdentity | null;
  ownJournal: ReturnType<typeof useLeaderboardRows>["ownJournal"];
  source: ReturnType<typeof useLeaderboardRows>["source"];
  today: Date;
  follows: ReturnType<typeof useFollowing>;
  onToggleFollow: (handle: string) => void;
  goProfile: (handle: string) => (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onPrivacy: () => void;
}): React.JSX.Element {
  const { hasAccountSessionAuth } = usePlatformCore();
  const [windowKey, setWindowKey] = useState<LeaderboardWindow>("30d");
  const [sort, setSort] = useState<LeaderboardSort>("units");
  const minSettled = leaderboardMinSettled(windowKey);
  const ranked = useMemo(
    () => rankAnalysts(rows, { window: windowKey, sort, today }),
    [rows, windowKey, sort, today],
  );
  const top = useMemo(() => ranked.slice(0, TOP_N), [ranked]);
  const podium = useMemo(() => top.slice(0, 3), [top]);
  const tableRows = useMemo(() => top.slice(3), [top]);
  const me = useMemo(
    () => (own ? (ranked.find((r) => r.handle === own.handle) ?? null) : null),
    [own, ranked],
  );
  const meInTop = me !== null && me.rank <= TOP_N;
  const ownSettled = useMemo(
    () => (own ? profileRecord(entriesInWindow(ownJournal, windowKey, today)).settled : 0),
    [own, ownJournal, today, windowKey],
  );
  const tenth = top[TOP_N - 1];
  const windowLabel = windowKey === "7d" ? "últimos 7 días" : "últimos 30 días";
  const sortLabel =
    sort === "units" ? "saldo" : sort === "clv" ? "ventaja contra el cierre" : "cumplidos";

  const hit = (r: RankedAnalyst): string => `${Math.round(r.record.hitRatePct ?? 0)} %`;
  const clv = (r: RankedAnalyst): string =>
    r.record.avgClvPct === null ? "—" : formatSignedPct(r.record.avgClvPct);
  const sub = (r: RankedAnalyst): string => `${r.roleLabel} · ${r.specialty}`;

  const meNote = me
    ? me.rank > TOP_N && tenth
      ? `Te faltan ${Math.max(0.1, tenth.record.netUnits - me.record.netUnits).toFixed(1)}u para el top 10`
      : "Estás en el top 10"
    : hasAccountSessionAuth && ownSettled >= minSettled
      ? "Activa «Aparecer en el ranking» en Privacidad para entrar"
      : `Registra ${Math.max(0, minSettled - ownSettled)} picks más para entrar`;

  const nameOf = (r: RankedAnalyst): React.ReactNode => (
    <>
      <a href={`/app/u/${r.handle}`} onClick={goProfile(r.handle)}>
        {r.name}
      </a>
      {r.isExample ? <ExampleBadge className="pl-com-example" /> : null}
    </>
  );

  return (
    <div className="pl-com-ranking">
      <div className="pl-com-toolbar">
        <div className="pl-com-seg max-w-full" role="group" aria-label="Periodo">
          <button
            type="button"
            aria-pressed={windowKey === "7d"}
            onClick={() => setWindowKey("7d")}
          >
            Semana
          </button>
          <button
            type="button"
            aria-pressed={windowKey === "30d"}
            onClick={() => setWindowKey("30d")}
          >
            Mes
          </button>
        </div>
        <div className="pl-com-seg max-w-full overflow-x-auto" role="group" aria-label="Ordenar por">
          <button type="button" aria-pressed={sort === "units"} onClick={() => setSort("units")}>
            Saldo
          </button>
          <button type="button" aria-pressed={sort === "clv"} onClick={() => setSort("clv")}>
            Contra el cierre
          </button>
          <button type="button" aria-pressed={sort === "hits"} onClick={() => setSort("hits")}>
            Cumplidos
          </button>
        </div>
      </div>

      {source === "examples" ? (
        <p className="pl-com-card-note">
          <ExampleBadge className="pl-com-example" />{" "}
          {hasAccountSessionAuth
            ? "Todavía ningún socio cumple la muestra mínima, así que ves perfiles de ejemplo."
            : "Con el acceso de la beta ves perfiles de ejemplo y tu propio récord."}
        </p>
      ) : null}

      {ranked.length === 0 ? (
        <SofascoreEmptyState
          title={`Aún nadie llega a ${minSettled} picks cerrados en este periodo`}
        />
      ) : (
        <>
          <ol className="pl-com-podium" aria-label="Primeros tres lugares">
            {podium.map((r) => {
              const following = follows.isFollowing(r.handle);
              const isMe = own?.handle === r.handle;
              return (
                <li
                  key={r.handle}
                  className={`pl-com-podium-card${r.rank === 1 ? " is-first" : ""}`}
                  data-rank={r.rank}
                >
                  <span className="pl-com-podium-rank num">#{r.rank}</span>
                  <Avatar
                    initials={r.avatarInitials}
                    avatarUrl={r.avatarUrl}
                    gradVar={r.avatarGradVar}
                    size={r.rank === 1 ? 60 : 52}
                    className="pl-com-podium-avatar"
                  />
                  <p className="pl-com-podium-name flex-wrap">
                    {nameOf(r)}
                    {r.isTipster ? <VerifiedSeal size={16} /> : null}
                  </p>
                  <p className="pl-com-podium-sub">{sub(r)}</p>
                  <p
                    className={`pl-com-podium-units num ${r.record.netUnits >= 0 ? "pl-prof-pos" : "pl-prof-neg"}`}
                  >
                    {formatUnits(r.record.netUnits)}
                  </p>
                  <div className="pl-com-podium-stats num">
                    <span>
                      <strong>{hit(r)}</strong>cumplidos
                    </span>
                    <span>
                      <strong>{clv(r)}</strong>vs cierre
                    </span>
                    <span>
                      <strong>{r.record.settled}</strong>picks
                    </span>
                  </div>
                  {!isMe ? (
                    <Button
                      type="button"
                      variant={following ? "secondary" : "primary"}
                      size="sm"
                      className="pl-com-podium-follow"
                      aria-pressed={following}
                      aria-label={`${following ? "Siguiendo" : "Seguir"} a ${r.name}`}
                      onClick={() => onToggleFollow(r.handle)}
                    >
                      {following ? "Siguiendo" : "Seguir"}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ol>

          <div
            className="pl-com-table-wrap pl-sf-table-wrap"
            tabIndex={0}
            role="region"
            aria-labelledby="pl-com-ranking-caption"
          >
            <table className="pl-com-table pl-com-ranking-table pl-sf-table num">
              <caption id="pl-com-ranking-caption" className="sr-only">
                Ranking de Comunidad, {windowLabel}, ordenado por {sortLabel}, del 4.º lugar en
                adelante
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="pl-sf-th">
                    #
                  </th>
                  <th scope="col" className="pl-sf-th is-sticky-col">
                    Analista
                  </th>
                  <th scope="col" className="pl-sf-th is-end">
                    Saldo
                  </th>
                  <th scope="col" className="pl-sf-th is-end">
                    Cumplidos
                  </th>
                  <th scope="col" className="pl-sf-th is-end">
                    Contra el cierre
                  </th>
                  <th scope="col" className="pl-sf-th is-end">
                    Picks
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <tr
                    key={r.handle}
                    className={own?.handle === r.handle ? "pl-sf-tr is-me" : "pl-sf-tr"}
                  >
                    <td className="pl-sf-td pl-prof-muted">{r.rank}</td>
                    <th scope="row" className="pl-sf-td is-sticky-col">
                      <span className="pl-com-table-who">
                        <Avatar
                          initials={r.avatarInitials}
                          avatarUrl={r.avatarUrl}
                          gradVar={r.avatarGradVar}
                          size={30}
                          loading="lazy"
                        />
                        <span>
                          <span className="pl-com-table-name">
                            {nameOf(r)}
                            {r.isTipster ? <VerifiedSeal size={14} /> : null}
                          </span>
                          <span className="pl-com-table-sub">{sub(r)}</span>
                        </span>
                      </span>
                    </th>
                    <td
                      className={`pl-sf-td is-end ${r.record.netUnits >= 0 ? "pl-prof-pos pl-com-strong" : "pl-prof-neg pl-com-strong"}`}
                    >
                      {formatUnits(r.record.netUnits)}
                    </td>
                    <td className="pl-sf-td is-end">{hit(r)}</td>
                    <td className="pl-sf-td is-end">{clv(r)}</td>
                    <td className="pl-sf-td is-end pl-prof-muted">{r.record.settled}</td>
                  </tr>
                ))}
                {own && !meInTop ? (
                  <tr className="pl-sf-tr is-me">
                    <td className="pl-sf-td pl-com-strong">{me ? me.rank : "—"}</td>
                    <th scope="row" className="pl-sf-td is-sticky-col">
                      <span className="pl-com-table-who">
                        <Avatar
                          initials={own.avatarInitials}
                          avatarUrl={own.avatarUrl}
                          gradVar={own.avatarGradVar}
                          size={30}
                          loading="lazy"
                        />
                        <span>
                          <span className="pl-com-table-name">Tú</span>
                          <span className="pl-com-table-sub">{meNote}</span>
                        </span>
                      </span>
                    </th>
                    <td className="pl-sf-td is-end pl-com-strong">
                      {me ? formatUnits(me.record.netUnits) : "—"}
                    </td>
                    <td className="pl-sf-td is-end">{me ? hit(me) : "—"}</td>
                    <td className="pl-sf-td is-end">{me ? clv(me) : "—"}</td>
                    <td className="pl-sf-td is-end pl-prof-muted">
                      {me ? me.record.settled : ownSettled}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <ol className="pl-com-mlist" aria-label="Del 4.º lugar en adelante">
            {tableRows.map((r) => (
              <li key={r.handle}>
                <span className="pl-com-top-rank num">{r.rank}</span>
                <Avatar
                  initials={r.avatarInitials}
                  avatarUrl={r.avatarUrl}
                  gradVar={r.avatarGradVar}
                  size={36}
                  loading="lazy"
                />
                <span className="pl-com-mlist-who">
                  <span>{nameOf(r)}</span>
                  <span className="pl-prof-muted num">
                    {hit(r)} cumplidos · {r.record.settled} picks
                  </span>
                </span>
                <span
                  className={`num pl-com-strong ${r.record.netUnits >= 0 ? "pl-prof-pos" : "pl-prof-neg"}`}
                >
                  {formatUnits(r.record.netUnits)}
                </span>
              </li>
            ))}
          </ol>
          {own && !meInTop ? (
            <div className="pl-com-mme num">
              <span className="pl-com-top-rank">{me ? me.rank : "—"}</span>
              <Avatar
                initials={own.avatarInitials}
                avatarUrl={own.avatarUrl}
                gradVar={own.avatarGradVar}
                size={36}
                loading="lazy"
              />
              <span className="pl-com-mlist-who">
                <strong>Tú</strong>
                <span className="pl-prof-muted">{meNote}</span>
              </span>
              <span className="pl-com-strong">{me ? formatUnits(me.record.netUnits) : "—"}</span>
            </div>
          ) : null}
        </>
      )}
      <p className="pl-com-footnote">
        Mínimo {minSettled} picks cerrados. Solo aparecen socios que lo eligieron en{" "}
        <button type="button" className="pl-com-text-btn" onClick={onPrivacy}>
          Privacidad
        </button>
        .
      </p>
    </div>
  );
});

export { ConsensusTab as CommunityConsensusTab, TopicsPicker as CommunityTopicsPicker };
