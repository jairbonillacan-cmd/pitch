"use client";

import React, { Suspense, lazy, useMemo, useRef, useState } from "react";
import {
  canonicalGameHref,
  isLiveCapableLeague,
  type LeagueId,
  type LiveMatchDetail,
  type StandingRow,
} from "@pitchlab/contracts";
import { getTeamColors } from "@pitchlab/sports-assets";
import { useSafeEffect } from "../hooks";
import { parseUserOdds } from "../../sports";
import {
  decimalToAmericanInt,
  getSessionWatermark,
  isPreGameIntelUnlocked,
} from "../access-guard";
import {
  MaestroIcon,
  StackedAvatars,
} from "../components/MaestroPrimitives";
import type { CortexSectionView } from "./match/CortexAnalysisCard";
import {
  MatchBreadcrumb,
  MatchHeroScoreboard,
  MatchLeftRail,
} from "./match/MatchHeroAndRail";
import { MatchPicksEvidenceBoard } from "./match/MatchPicksEvidenceBoard";
import { MatchTabPanel, MatchTabs, useMatchUrlTab } from "./match/MatchTabs";
import { PreMatchModule } from "./match/PreMatchModule";
import { platformGameToSportOutlook } from "./match/sport-outlook/sport-outlook-mapper";
import { useLiveMatch } from "../live/live-store";
import {
  AtmosphereStage,
  ClubWorkspaceShell,
} from "../components/ShellChrome";
import {
  useJournalEntries,
  useParlayState,
  usePlatformActions,
  usePlatformCore,
  useSocialState,
} from "../platform-provider";
import {
  SocialReportDialog,
  ownIdentityFor,
  useFollowing,
  type SocialReportTarget,
} from "./community-ui";
import {
  SOCIAL_POST_MAX_CHARS,
  SocialPostCard,
  copyPostPickToJournal,
  copyPostPickToParlay,
  isPlainClick,
  resolvePostAuthor,
  shareSocialPost,
} from "./SocialPostCard";
import type {
  MatchInjuryItem,
  MatchPick,
  MatchTabKey,
  PlatformGameDetail,
  PlatformMarketRow,
} from "../types";

export {
  LeagueHubClubView,
  resolveLeagueStandingsZones,
  type LeagueAttackDefenseTableData,
  type LeagueHubCapabilitiesData,
  type LeagueHubEnrichmentData,
  type LeagueHubSectionKey,
  type LeagueSeasonProgressData,
  type LeagueStandingsMeta,
  type LeagueStandingsSplitMeta,
  type LeagueStatLeaderCategoryData,
  type LeagueStatLeaderEntryData,
  type LeagueStatLeadersData,
  type LeagueTeamStatLeaderEntryData,
  type LeagueTitleCandidateData,
  type LeagueTitleProjectionData,
} from "./league/LeagueHubClubView";

const loadMatchPlayerPicksBoard = () =>
  import("./match/MatchPlayerPicksBoard").then((m) => ({ default: m.MatchPlayerPicksBoard }));
const LazyMatchPlayerPicksBoard = lazy(loadMatchPlayerPicksBoard);
const LazySportOutlookCard = lazy(() =>
  import("./match/sport-outlook/SportOutlookCard").then((m) => ({ default: m.SportOutlookCard })),
);
const LazyMatchLineupsPanel = lazy(() =>
  import("./match/MatchLineupsPanel").then((m) => ({ default: m.MatchLineupsPanel })),
);
const LazyMatchEnfrentamientosPanel = lazy(() =>
  import("./match/MatchEnfrentamientosPanel").then((m) => ({
    default: m.MatchEnfrentamientosPanel,
  })),
);
const LazyMatchInjuriesPanel = lazy(() =>
  import("./match/MatchInjuriesPanel").then((m) => ({ default: m.MatchInjuriesPanel })),
);
const LazyLiveMatchPanelView = lazy(() =>
  import("../live/LiveMatchCenter").then((m) => ({ default: m.LiveMatchPanelView })),
);
const LazyCortexAnalysisCard = lazy(() =>
  import("./match/CortexAnalysisCard").then((m) => ({ default: m.CortexAnalysisCard })),
);
const LazyMatchNumbersPanel = lazy(() =>
  import("./match/MatchNumbersPanel").then((m) => ({ default: m.MatchNumbersPanel })),
);
const LazyMatchMoneyPanel = lazy(() =>
  import("./match/MatchMoneyPanel").then((m) => ({ default: m.MatchMoneyPanel })),
);
const LazyMatchContextPanel = lazy(() =>
  import("./match/MatchContextPanel").then((m) => ({ default: m.MatchContextPanel })),
);

function MatchTabFallback(): React.JSX.Element {
  return (
    <div
      className="pl-skel-card rounded-2xl p-5 space-y-3"
      role="status"
      aria-busy="true"
      aria-label="Cargando análisis del partido"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="pl-skel-bar h-5 w-44 rounded-lg" />
        <div className="pl-skel-bar h-6 w-20 rounded-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="pl-skel-bar h-24 rounded-xl" />
        <div className="pl-skel-bar h-24 rounded-xl" />
      </div>
      <div className="pl-skel-bar h-16 rounded-xl" />
    </div>
  );
}

export function MatchStudioClubView({
  leagueId,
  gameId,
  cortexSynthesisOverride,
  cortexSections,
  cortexHeadline,
  detail,
  leagueStandings,
  liveDetailOverride,
  initialTab = "picks",
}: {
  leagueId: LeagueId;
  gameId: string;
  cortexSynthesisOverride?: string | null;
  cortexSections?: readonly CortexSectionView[] | null;
  cortexHeadline?: string | null;
  detail?: PlatformGameDetail | null;
  leagueStandings?: readonly StandingRow[];
  liveDetailOverride?: LiveMatchDetail | null;
  initialTab?: MatchTabKey;
}): React.JSX.Element {
  const { dataset, viewerRole, viewerIdentity, hasAccountSessionAuth, oddsFormat, upgradeHref } = usePlatformCore();
  const { setSelectedTipsterPickId, publishSocialPost, addSocialComment, deleteSocialComment, toggleSocialCommentHelpful, loadAllPostComments, deleteSocialPost, toggleSocialLike, loadMatchSocialPosts, sealPickToJournal, recordSocialPostCopy, addPickToParlay, removePickFromParlay, openComposer, navigateTo, pushToast } = usePlatformActions();
  const { parlaySummary } = useParlayState();
  const { socialPosts } = useSocialState();
  const journal = useJournalEntries();

  const follows = useFollowing();
  const [reportTarget, setReportTarget] = useState<SocialReportTarget | null>(null);
  const [picksSubTab, setPicksSubTab] = useState<"equipo" | "jugadores">("equipo");
  const own = useMemo(
    () => ownIdentityFor(viewerRole, viewerIdentity),
    [viewerRole, viewerIdentity],
  );
  const parlayPickIds = useMemo(
    () => new Set(parlaySummary.legs.map((l) => l.pick.id)),
    [parlaySummary.legs],
  );
  const sealedPickIds = useMemo(
    () => new Set(journal.map((entry) => entry.pickId)),
    [journal],
  );

  const [activeTab, setActiveTab] = useMatchUrlTab(initialTab);
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<MatchTabKey>>(
    () => new Set([activeTab]),
  );
  useSafeEffect(() => {
    setVisitedTabs((prev) => (prev.has(activeTab) ? prev : new Set([...prev, activeTab])));
  }, [activeTab]);
  const isTabMounted = (key: MatchTabKey) => activeTab === key || visitedTabs.has(key);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const handleSelectTabFromRail = (nextTab: MatchTabKey) => {
    setActiveTab(nextTab);
    if (typeof window !== "undefined") {
      const reduced =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      workspaceRef.current?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "start",
      });
    }
  };
  const [marketUserOddsRaw, setMarketUserOddsRaw] = useState<string>("");
  const [houseOddsByKey, setHouseOddsByKey] = useState<Record<string, string>>({});
  const [sealedMarketKeys, setSealedMarketKeys] = useState<Set<string>>(() => new Set());
  const [debateBody, setDebateBody] = useState<string>("");
  const [debateError, setDebateError] = useState<string>("");

  const game = useMemo(() => {
    const base =
      dataset.games.find((g) => g.id === gameId) ??
      dataset.games.find((g) => g.league === leagueId) ??
      dataset.games[0]!;
    return detail && base.id === gameId ? { ...base, ...detail } : base;
  }, [dataset.games, gameId, leagueId, detail]);

  useSafeEffect(() => {
    void loadMatchSocialPosts(game.id);
  }, [game.id, loadMatchSocialPosts]);

  const liveSupported = isLiveCapableLeague(game.league);
  const liveSnap = useLiveMatch(game.id, liveSupported && !liveDetailOverride);
  const liveDetail = liveDetailOverride ?? liveSnap.data;
  const hasLiveMomentum = Boolean(
    liveDetail && (liveDetail.momentum.length > 0 || liveDetail.incidents.length > 0),
  );
  const hasLiveIncidents = Boolean(liveDetail && liveDetail.incidents.length > 0);
  const isFinished = game.status === "FT" && game.score !== undefined;
  const hasForecast = game.hasForecast !== false && Boolean(game.x12 && game.projection);
  const intelUnlocked = isPreGameIntelUnlocked(game, viewerRole);
  const enrichedLineups = detail?.enrichedLineups ?? null;
  const playerPicksList = detail?.playerPicks ?? [];
  const injuriesList: readonly MatchInjuryItem[] = useMemo(() => {
    if (detail?.injuries) return detail.injuries;
    return game.preGame.absences
      .filter((item) => item.status !== "Confirmado XI")
      .map((item) => ({
        teamSide: item.teamSide,
        player: item.player,
        position: item.role || null,
        status: item.status,
        detail: item.injuryType ?? item.impactNote ?? null,
        expectedReturn: item.returnDate ?? null,
      }));
  }, [detail?.injuries, game.preGame.absences]);
  const hasLineupsTab = Boolean(enrichedLineups || game.sport === "football");
  const resolvedEnfrentamientos = useMemo(
    () =>
      detail?.enfrentamientos ?? {
        rankings: null,
        h2h: game.headToHead.map((row, idx) => ({
          id: `studio-h2h-${game.id}-${idx}`,
          dateIso: row.date,
          competitionLabel: game.leagueLabel,
          isSameCompetition: true,
          homeTeam: row.home,
          awayTeam: row.away,
          homeSlug: game.home.slug,
          awaySlug: game.away.slug,
          homeScore: row.homeGoals,
          awayScore: row.awayGoals,
          isHomeForFocus: row.home
            .toLowerCase()
            .includes((game.home.shortName || game.home.name).toLowerCase()),
          resultForFocus:
            row.homeGoals === row.awayGoals
              ? ("D" as const)
              : row.homeGoals > row.awayGoals
                ? ("W" as const)
                : ("L" as const),
        })),
        homeRecent: [],
        awayRecent: [],
      },
    [detail?.enfrentamientos, game.away.slug, game.headToHead, game.home.name, game.home.shortName, game.home.slug, game.id, game.leagueLabel],
  );

  const homePrimary =
    getTeamColors(game.league, game.home.slug)?.[0] ??
    "var(--pl-aura-default-home)";
  const awayPrimary =
    getTeamColors(game.league, game.away.slug)?.[0] ??
    "var(--pl-aura-default-away)";

  const studioPath = canonicalGameHref(game.league, game);
  const mainEngineName =
    game.picks[0]?.engineName ??
    (game.sport === "american-football"
      ? "PitchLab Minkowski v3.0"
      : game.sport === "basketball"
        ? "PitchLab Motor NBA"
        : game.sport === "ice-hockey"
          ? "PitchLab Motor NHL"
          : "PitchLab Tachyon v3.0");

  const activeMarkets = useMemo(() => {
    if (!intelUnlocked && !isFinished && game.markets.length === 0) return [];
    return detail?.markets && detail.markets.length > 0 ? detail.markets : game.markets;
  }, [detail?.markets, game.markets, intelUnlocked, isFinished]);

  const sportOutlook = useMemo(
    () => (isFinished ? null : platformGameToSportOutlook(game, detail)),
    [detail, game, isFinished],
  );

  const matchLabelShort = `${game.home.shortName} vs ${game.away.shortName}`;

  const matchDebatePosts = useMemo(() => {
    const homeShort = game.home.shortName.toLowerCase();
    const awayShort = game.away.shortName.toLowerCase();
    return socialPosts.filter((p) => {
      if (p.gameId === game.id || p.pick?.gameId === game.id) return true;
      if (!p.gameId && p.isExample) {
        const lower = p.matchLabel.toLowerCase();
        return lower.includes(homeShort) || lower.includes(awayShort);
      }
      return false;
    });
  }, [game.away.shortName, game.home.shortName, game.id, socialPosts]);

  const goProfile = (handle: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    navigateTo(`/app/u/${handle}`);
  };

  const handlePublishDebate = (e: React.FormEvent) => {
    e.preventDefault();
    setDebateError("");
    const res = publishSocialPost({
      leagueLabel: game.leagueLabel,
      gameId: game.id,
      matchLabel: matchLabelShort,
      pickBadge: game.picks[0]?.categoryLabel ?? "Lectura Socio",
      originType: "Spacetime Suite",
      body: debateBody,
    });
    if (!res.ok) {
      setDebateError(res.error ?? "No se pudo publicar tu comentario.");
      return;
    }
    setDebateBody("");
  };

  const handleSealMarketRow = (
    m: PlatformMarketRow,
    idx: number,
    rowCustomOddsRaw?: string,
  ) => {
    const existingPick = game.picks.find((p) => p.label === m.label);
    if (existingPick) {
      openComposer(existingPick);
      return;
    }
    const effectiveRaw = rowCustomOddsRaw?.trim() || marketUserOddsRaw.trim();
    const parsedUserDec = effectiveRaw ? parseUserOdds(effectiveRaw) : null;
    const effectiveBookDec =
      parsedUserDec && parsedUserDec > 1 ? parsedUserDec : m.currentDecimal;
    const edgeForSeal =
      effectiveBookDec === null ? null : Math.round((m.p - 1 / effectiveBookDec) * 1000) / 10;
    const syntheticPick: MatchPick = {
      id: `${game.id}__mkt__${encodeURIComponent(m.group)}__${encodeURIComponent(m.selection)}`,
      gameId: game.id,
      league: game.league,
      leagueLabel: game.leagueLabel,
      matchLabel: `${game.home.name} vs ${game.away.name}`,
      kickoffLocal: game.kickoffLocal,
      gameStatus: game.status,
      slotIndex: idx + 10,
      category: "valor",
      categoryLabel: m.group,
      risk: m.p >= 0.68 ? "conservador" : m.p >= 0.52 ? "medio" : "arriesgado",
      engineKey: "geodesic",
      engineName: "Motor Spacetime",
      marketGroup: m.group,
      selectionKey: m.selection,
      market: m.market,
      ...(m.line !== undefined ? { line: m.line } : {}),
      conflictGroup: "independent",
      label: m.label,
      rationale: `Línea directa del panel de mercados (${(m.p * 100).toFixed(1)} % de probabilidad real).`,
      p: m.p,
      fairDecimal: m.fairDecimal,
      fairAmerican: m.fairAmerican,
      marketDecimal: effectiveBookDec,
      marketAmerican: effectiveBookDec === null ? null : decimalToAmericanInt(effectiveBookDec),
      edgePts: edgeForSeal,
      confidenceScore: game.confidenceScore,
      suggestedUnits: 1.0,
    };
    openComposer(syntheticPick);
  };

  const cortexSummaryText =
    cortexHeadline?.trim() ||
    cortexSections?.find((sec) => sec.key === "lectura")?.text ||
    cortexSynthesisOverride ||
    game.preGame.cortexSynthesis;

  return (
    <AtmosphereStage activePath={studioPath}>
      <ClubWorkspaceShell activePath={studioPath}>
        <MatchBreadcrumb game={game} onNavigate={navigateTo} />

        <MatchHeroScoreboard
          game={game}
          homePrimary={homePrimary}
          awayPrimary={awayPrimary}
          intelUnlocked={intelUnlocked}
          liveDetail={liveDetail}
          onNavigate={navigateTo}
        />

        <div className="pl-match-layout">
          <MatchLeftRail
            game={game}
            markets={activeMarkets}
            oddsFormat={oddsFormat}
            intelUnlocked={intelUnlocked}
            liveDetail={liveDetail}
            mainEngineName={mainEngineName}
            cortexSummaryText={cortexSummaryText}
            onSelectTab={handleSelectTabFromRail}
          />

          <section ref={workspaceRef} className="pl-match-workspace" aria-label="Análisis del partido">
            <MatchTabs
              idPrefix="pl-match"
              active={activeTab}
              onSelect={setActiveTab}
              tabs={[
                {
                  key: "picks",
                  label: "Picks",
                  count:
                    game.picks.length + playerPicksList.length > 0
                      ? game.picks.length + playerPicksList.length
                      : undefined,
                },
                { key: "resumen", label: "Resumen" },
                ...(hasLineupsTab ? [{ key: "alineaciones" as const, label: "Alineaciones" }] : []),
                { key: "enfrentamientos", label: "Enfrentamientos" },
                {
                  key: "lesiones",
                  label: "Lesiones",
                  count: injuriesList.length > 0 ? injuriesList.length : undefined,
                },
                { key: "ia", label: "Análisis IA" },
                {
                  key: "numeros",
                  label: "Números",
                  count: activeMarkets.length > 0 ? activeMarkets.length : undefined,
                },
                { key: "dinero", label: "¿Dónde está el dinero?" },
              ]}
            />

            <MatchTabPanel idPrefix="pl-match" tabKey="picks" active={activeTab}>
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                <div
                  className="pl-mdp-switcher"
                  role="group"
                  aria-label="Tipo de picks"
                  data-studio-picks-switcher=""
                >
                  <button
                    type="button"
                    className={`pl-mdp-switcher-btn ${picksSubTab === "equipo" ? "is-active" : ""}`.trim()}
                    aria-pressed={picksSubTab === "equipo"}
                    data-picks-subtab="equipo"
                    onClick={() => setPicksSubTab("equipo")}
                  >
                    <span>Equipo</span>
                    {game.picks.length > 0 ? <span className="num">{game.picks.length}</span> : null}
                  </button>
                  <button
                    type="button"
                    className={`pl-mdp-switcher-btn ${picksSubTab === "jugadores" ? "is-active" : ""}`.trim()}
                    aria-pressed={picksSubTab === "jugadores"}
                    data-picks-subtab="jugadores"
                    onPointerEnter={() => void loadMatchPlayerPicksBoard()}
                    onFocus={() => void loadMatchPlayerPicksBoard()}
                    onClick={() => setPicksSubTab("jugadores")}
                  >
                    <span>Jugadores</span>
                    {playerPicksList.length > 0 ? (
                      <span className="num">{playerPicksList.length}</span>
                    ) : null}
                  </button>
                </div>
              </div>

              {picksSubTab === "equipo" ? (
                <MatchPicksEvidenceBoard
                  game={game}
                  markets={activeMarkets}
                  v5={detail?.v5 ?? null}
                  catalog={detail?.picksCatalog ?? null}
                />
              ) : (
                <Suspense fallback={<MatchTabFallback />}>
                  <LazyMatchPlayerPicksBoard
                    picks={playerPicksList}
                    allowFull={intelUnlocked || isFinished}
                    homeLabel={game.home.shortName || game.home.name}
                    awayLabel={game.away.shortName || game.away.name}
                    oddsFormat={oddsFormat}
                    upgradeHref={upgradeHref}
                    hasAccountSession={viewerIdentity !== null}
                    parlayPickIds={parlayPickIds}
                    sealedPickIds={sealedPickIds}
                    onToggleParlay={(pk) => {
                      if (parlayPickIds.has(pk.id)) {
                        removePickFromParlay(pk.id);
                      } else {
                        addPickToParlay(pk);
                      }
                    }}
                    onSealPick={openComposer}
                    onNavigate={navigateTo}
                  />
                </Suspense>
              )}
            </MatchTabPanel>

            <MatchTabPanel idPrefix="pl-match" tabKey="resumen" active={activeTab}>
              {isTabMounted("resumen") && (liveSupported || liveDetailOverride) ? (
                <Suspense fallback={<MatchTabFallback />}>
                  <LazyLiveMatchPanelView
                    game={game}
                    detail={liveDetail}
                    loading={liveDetailOverride ? false : liveSnap.loading}
                    error={liveDetailOverride ? false : liveSnap.error}
                    showFollow={false}
                    hideMomentum={hasLiveMomentum}
                    hideTimeline={hasLiveIncidents}
                    hideScoreboard
                  />
                </Suspense>
              ) : null}

              {isFinished ? null : <PreMatchModule game={game} detail={detail} />}
              {isTabMounted("resumen") && sportOutlook ? (
                <Suspense fallback={<MatchTabFallback />}>
                  <LazySportOutlookCard outlook={sportOutlook} oddsFormat={oddsFormat} />
                </Suspense>
              ) : null}

              <section
                className="glass-card glass-ring rounded-2xl p-5 space-y-3.5"
                aria-labelledby="resumen-factors-heading"
                data-summary-factors=""
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2 id="resumen-factors-heading" className="m-0 text-base font-extrabold">
                      Factores del partido
                    </h2>
                    <p className="m-0 text-xs mt-0.5" style={{ color: "var(--pl-text-muted)" }}>
                      Señales cuantitativas que explican las probabilidades del modelo.
                    </p>
                  </div>
                </div>

                {!intelUnlocked && !isFinished ? (
                  <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Los factores cuantitativos del encuentro están reservados para socios con Pase PitchLab Ultra.
                  </p>
                ) : game.factors.length > 0 ? (
                  <div className="pl-factors-grid" data-factor-count={game.factors.length}>
                    {game.factors.map((factor) => (
                      <article key={`${factor.label}-${factor.value}`} className="pl-factor-item">
                        <span className="pl-factor-label">{factor.label}</span>
                        <strong className="pl-factor-value num">{factor.value}</strong>
                        {factor.sub ? (
                          <span className="pl-factor-sub">{factor.sub}</span>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Los factores detallados aparecerán cuando el partido acumule señales adicionales.
                  </p>
                )}
              </section>

              {isTabMounted("resumen") ? (
                <Suspense fallback={<MatchTabFallback />}>
                  <LazyMatchContextPanel
                    game={game}
                    standings={
                      leagueStandings && leagueStandings.length > 0
                        ? [...leagueStandings]
                        : (dataset.leagues.find((l) => l.league === game.league)?.standings ?? [])
                    }
                    unlocked={intelUnlocked}
                    v5={detail?.v5 ?? null}
                    opinionsSlot={
                      <aside
                        aria-label="Opiniones de socios sobre el partido"
                        className="pl-ctx-card glass-lens glass-ring"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <h2 className="m-0 text-lg font-extrabold">Opiniones de socios</h2>
                          </div>
                          {matchDebatePosts.length > 0 ? (
                            <StackedAvatars
                              items={matchDebatePosts.slice(0, 3).map((post, idx) => ({
                                initials: post.authorHandle.slice(0, 2).toUpperCase(),
                                gradVar: post.avatarGradVar || `var(--avatar-grad-${(idx % 3) + 1})`,
                                label: `@${post.authorHandle}`,
                              }))}
                              extraCount={Math.max(0, matchDebatePosts.length - 3)}
                            />
                          ) : (
                            <span
                              className="text-xs font-semibold"
                              style={{ color: "var(--pl-text-muted)" }}
                            >
                              0 publicaciones
                            </span>
                          )}
                        </div>

                        {matchDebatePosts.length > 0 ? (
                          <div className="pl-studio-debate-list space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
                            {matchDebatePosts.map((post) => (
                              <SocialPostCard
                                key={post.id}
                                variant="compact"
                                post={post}
                                author={resolvePostAuthor(post, own, [])}
                                own={own}
                                dataset={dataset}
                                journal={journal}
                                oddsFormat={oddsFormat}
                                following={follows.isFollowing(post.authorHandle)}
                                onToggleFollow={(handle) => {
                                  const now = follows.toggle(handle);
                                  pushToast(
                                    now
                                      ? `Ahora sigues a @${handle}.`
                                      : `Dejaste de seguir a @${handle}.`,
                                    "default",
                                  );
                                }}
                                onCopy={(p) =>
                                  copyPostPickToJournal(p, {
                                    dataset,
                                    sealPickToJournal,
                                    recordSocialPostCopy,
                                    pushToast,
                                  })
                                }
                                onCopyToParlay={(p) =>
                                  copyPostPickToParlay(p, {
                                    dataset,
                                    addPickToParlay,
                                    pushToast,
                                  })
                                }
                                onShare={(p) => shareSocialPost(p, pushToast)}
                                toggleSocialLike={toggleSocialLike}
                                addSocialComment={addSocialComment}
                                onDeleteComment={deleteSocialComment}
                                onToggleCommentHelpful={toggleSocialCommentHelpful}
                                onLoadAllComments={loadAllPostComments}
                                onDeletePost={deleteSocialPost}
                                onOpenReport={setReportTarget}
                                onNavigate={navigateTo}
                                goProfile={goProfile}
                              />
                            ))}
                          </div>
                        ) : (
                          <p
                            className="m-0 rounded-2xl p-3.5 text-xs leading-relaxed"
                            style={{
                              background: "var(--pl-surface)",
                              color: "var(--pl-text-muted)",
                            }}
                          >
                            Aún no hay opiniones publicadas para este partido. Sé el primero en
                            compartir tu lectura.
                          </p>
                        )}

                        <form
                          onSubmit={handlePublishDebate}
                          noValidate
                          className="space-y-2 pt-2 hairline-t"
                        >
                          <label
                            htmlFor="studio-debate-input"
                            className="text-xs font-bold block"
                          >
                            Tu opinión sobre {matchLabelShort}
                          </label>
                          <textarea
                            id="studio-debate-input"
                            rows={2}
                            maxLength={SOCIAL_POST_MAX_CHARS}
                            value={debateBody}
                            onChange={(e) => {
                              setDebateBody(e.target.value);
                              if (debateError) setDebateError("");
                            }}
                            placeholder="¿Qué ves en este partido?"
                            className="glass-input w-full p-2.5 text-base sm:text-xs resize-none"
                          />
                          {debateError ? (
                            <p
                              role="alert"
                              className="m-0 text-xs font-semibold"
                              style={{ color: "var(--pl-danger)" }}
                            >
                              {debateError}
                            </p>
                          ) : null}
                          <div className="flex items-center justify-between gap-2">
                            <span>
                              {debateBody.length >= Math.round(SOCIAL_POST_MAX_CHARS * 0.7) ? (
                                <span className="pl-com-char-count num">
                                  {debateBody.length}/{SOCIAL_POST_MAX_CHARS}
                                </span>
                              ) : null}
                            </span>
                            <button
                              type="submit"
                              className="pl-btn-primary text-xs min-h-11 px-3.5 inline-flex items-center gap-1.5"
                            >
                              <MaestroIcon name="users" size={12} />
                              <span>Publicar opinión</span>
                            </button>
                          </div>
                        </form>
                        <SocialReportDialog
                          target={reportTarget}
                          onClose={() => setReportTarget(null)}
                        />
                      </aside>
                    }
                  />
                </Suspense>
              ) : null}
            </MatchTabPanel>

            {hasLineupsTab ? (
              <MatchTabPanel idPrefix="pl-match" tabKey="alineaciones" active={activeTab}>
                {isTabMounted("alineaciones") ? (
                  <Suspense fallback={<MatchTabFallback />}>
                    <LazyMatchLineupsPanel
                      lineups={enrichedLineups}
                      incidents={liveDetail?.incidents}
                      onNavigate={navigateTo}
                    />
                  </Suspense>
                ) : null}
              </MatchTabPanel>
            ) : null}

            <MatchTabPanel idPrefix="pl-match" tabKey="enfrentamientos" active={activeTab}>
              {isTabMounted("enfrentamientos") ? (
                <Suspense fallback={<MatchTabFallback />}>
                  <LazyMatchEnfrentamientosPanel
                    enfrentamientos={resolvedEnfrentamientos}
                    league={game.league}
                    homeName={game.home.shortName || game.home.name}
                    homeSlug={game.home.slug}
                    homeLogoUrl={game.home.logoUrl}
                    awayName={game.away.shortName || game.away.name}
                    awaySlug={game.away.slug}
                    awayLogoUrl={game.away.logoUrl}
                  />
                </Suspense>
              ) : null}
            </MatchTabPanel>

            <MatchTabPanel idPrefix="pl-match" tabKey="lesiones" active={activeTab}>
              {isTabMounted("lesiones") ? (
                <Suspense fallback={<MatchTabFallback />}>
                  <LazyMatchInjuriesPanel
                    injuries={injuriesList}
                    league={game.league}
                    homeName={game.home.name}
                    homeSlug={game.home.slug}
                    homeLogoUrl={game.home.logoUrl}
                    awayName={game.away.name}
                    awaySlug={game.away.slug}
                    awayLogoUrl={game.away.logoUrl}
                    onNavigate={navigateTo}
                  />
                </Suspense>
              ) : null}
            </MatchTabPanel>

        <MatchTabPanel idPrefix="pl-match" tabKey="ia" active={activeTab}>
          {isTabMounted("ia") ? (
            <Suspense fallback={<MatchTabFallback />}>
              <LazyCortexAnalysisCard
            game={game}
            synthesis={
              cortexSections?.find((sec) => sec.key === "lectura")?.text ??
              cortexSynthesisOverride ??
              (game.preGame.cortexSynthesis?.trim()
                ? game.preGame.cortexSynthesis
                : (detail?.v5?.verifiedSummaryEs ?? ""))
            }
            unlocked={intelUnlocked || isFinished || !hasForecast}
            sections={cortexSections}
            headline={cortexHeadline}
            onAddPickToParlay={(pk) => {
              addPickToParlay(pk);
              pushToast(`«${pk.label}» agregado a tu parlay.`, "success");
            }}
            inParlayPickIds={parlayPickIds}
            onUpgrade={() => navigateTo(upgradeHref)}
            sideSlot={
              intelUnlocked &&
              hasForecast &&
              ((game.spacetime?.drivers.length ?? 0) > 0 ||
                game.preGame.tacticalKeys.length > 0) ? (
                <div
                  className="glass-card glass-ring rounded-2xl p-4 space-y-3 min-w-0"
                  data-cortex-signals=""
                >
                  <h2 className="m-0 text-sm font-extrabold">Señales del modelo</h2>

                  {(game.spacetime?.drivers.length ?? 0) > 0 ? (() => {
                    const drivers = game.spacetime!.drivers;
                    const maxImpact = Math.max(
                      0.0001,
                      ...drivers.map((d) => Math.abs(d.impactLogit)),
                    );
                    return (
                      <div className="space-y-1.5">
                        <h3 className="pl-cortex-label">Lo que más mueve el pronóstico</h3>
                        <ul className="pl-cortex-drivers">
                          {drivers.slice(0, 4).map((d) => (
                            <li key={d.label}>
                              <span className="text-xs">{d.label}</span>
                              <span className="pl-cortex-impact" aria-hidden="true">
                                <span
                                  style={{
                                    width: `${Math.round((Math.abs(d.impactLogit) / maxImpact) * 100)}%`,
                                    background:
                                      d.impactLogit >= 0
                                        ? "var(--pl-success)"
                                        : "var(--pl-warning)",
                                  }}
                                />
                              </span>
                              <span
                                className="text-[11px] num"
                                style={{ color: "var(--pl-text-muted)" }}
                              >
                                {d.impactLogit >= 0
                                  ? `a favor de ${game.home.shortName}`
                                  : `a favor de ${game.away.shortName}`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })() : null}

                  {game.preGame.tacticalKeys.length > 0 ? (
                    <div className="space-y-1.5 pt-2 hairline-t">
                      <h3 className="pl-cortex-label">Claves rápidas</h3>
                      <ul className="pl-cortex-list text-xs">
                        {game.preGame.tacticalKeys.map((k) => (
                          <li key={k}>{k}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null
            }
          />
            </Suspense>
          ) : null}
        </MatchTabPanel>

        <MatchTabPanel idPrefix="pl-match" tabKey="numeros" active={activeTab}>
          {isTabMounted("numeros") ? (
            <Suspense fallback={<MatchTabFallback />}>
              <LazyMatchNumbersPanel
            game={game}
            markets={activeMarkets}
            oddsFormat={oddsFormat}
            watermark={getSessionWatermark(viewerRole, viewerIdentity)}
            unlocked={intelUnlocked}
            isFinished={isFinished}
            canSeal={viewerRole !== "visitor"}
            outlook={detail?.outlook ?? null}
            v5={detail?.v5 ?? null}
            sealedKeys={sealedMarketKeys}
            globalHouseOddRaw={marketUserOddsRaw}
            houseOddsByKey={houseOddsByKey}
            onGlobalHouseOddChange={setMarketUserOddsRaw}
            onHouseOddChange={(key, value) =>
              setHouseOddsByKey((prev) => ({ ...prev, [key]: value }))
            }
            onSealRow={(row, rowKey) => {
              setSealedMarketKeys((prev) => {
                const next = new Set(prev);
                next.add(rowKey);
                return next;
              });
              handleSealMarketRow(row, sealedMarketKeys.size, houseOddsByKey[rowKey]);
            }}
          />
            </Suspense>
          ) : null}
        </MatchTabPanel>

        <MatchTabPanel idPrefix="pl-match" tabKey="dinero" active={activeTab}>
          {isTabMounted("dinero") ? (
            <Suspense fallback={<MatchTabFallback />}>
              <LazyMatchMoneyPanel
            game={game}
            markets={activeMarkets}
            oddsFormat={oddsFormat}
            unlocked={intelUnlocked}
            isFinished={isFinished}
            onOpenNumbers={() => setActiveTab("numeros")}
            onAddPickToParlay={
              viewerRole !== "visitor"
                ? (pk) => {
                    addPickToParlay(pk);
                    pushToast(`«${pk.label}» agregado a tu parlay.`, "success");
                  }
                : undefined
            }
            inParlayPickIds={parlayPickIds}
          />
            </Suspense>
          ) : null}
        </MatchTabPanel>
          </section>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
