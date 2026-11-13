"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { LeagueBadge, TeamBadge } from "../../sports";
import { formatOddsValue } from "../access-guard";
import { getExampleAnalystSpec } from "../community-examples";
import {
  CONSENSUS_AGREE_PTS,
  CONSENSUS_STRONG_PTS,
  computeConsensus,
  consensusReading,
  formatDiffPts,
  type ConsensusGame,
} from "../community-stats";
import { ExampleBadge, MaestroIcon, VerifiedSeal } from "../components/MaestroPrimitives";
import { TopLayerModalDialog } from "../components/PlatformOverlays";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { socialScopeKey, usePlatform, type SocialFeedScope } from "../platform-provider";
import {
  LEADERBOARD_MIN_SETTLED,
  entriesInWindow,
  formatSignedPct,
  formatUnits,
  monthLongLabel,
  profileRecord,
  rankAnalysts,
  type LeaderboardSort,
  type LeaderboardWindow,
  type RankedAnalyst,
} from "../profile-stats";
import type { MatchPick, PlatformGame, SocialPost } from "../types";
import {
  Avatar,
  ChevronRightIcon,
  CommentIcon,
  GiftIcon,
  HeartIcon,
  PickStatus,
  ShareIcon,
  SocialReportDialog,
  SocialReportMenu,
  TabPanel,
  UnderlineTabs,
  resolveEntryGame,
  shareUrl,
  useFollowing,
  useLeaderboardRows,
  useUrlTab,
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
const FEED_PAGE = 20;
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

function isPlainClick(e: React.MouseEvent<HTMLAnchorElement>): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

interface AuthorInfo {
  handle: string;
  name: string;
  initials: string;
  gradVar: string;
  avatarUrl: string | null;
  isTipster: boolean;
  saldo: string | null;
}

/* ===========================================================================
   Vista
   ========================================================================= */

export function SocialVipClubView(): React.JSX.Element {
  const platform = usePlatform();
  const { viewerRole, hasAccountSession, upgradeHref, navigateTo } = platform;

  if (viewerRole === "visitor") {
    return (
      <AtmosphereStage>
        <ClubWorkspaceShell activePath="/app/social">
          <div className="pl-com">
            <h1 className="pl-com-title">Comunidad</h1>
            <section className="pl-com-gate glass-lens glass-ring" aria-label="Acceso">
              <p className="pl-com-gate-title">
                {hasAccountSession
                  ? "Activa tu Pase PitchLab Ultra para participar en la comunidad."
                  : "La comunidad es para socios."}
              </p>
              <a
                href={upgradeHref}
                className="pl-prof-btn pl-prof-btn--primary"
                onClick={(e) => {
                  if (!isPlainClick(e)) return;
                  e.preventDefault();
                  navigateTo(upgradeHref);
                }}
              >
                {hasAccountSession ? "Activar Pase Ultra" : "Probar 7 días gratis"}
              </a>
            </section>
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
  const {
    dataset,
    socialPosts,
    oddsFormat,
    publishSocialPost,
    addSocialComment,
    toggleSocialLike,
    deleteSocialPost,
    refreshSocialFeed,
    ensureSocialPostLoaded,
    sealPickToJournal,
    pushToast,
    navigateTo,
  } = usePlatform();
  const [tab, setTab] = useUrlTab<CommunityTab>(TAB_KEYS, "para-ti");
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<SocialReportTarget | null>(null);
  // Al abrir Comunidad se trae lo último que publicaron los demás.
  useEffect(() => {
    refreshSocialFeed();
  }, [refreshSocialFeed]);

  // Enlace directo a una publicación (`/app/social?post=<id>`, p. ej. desde la campana).
  useEffect(() => {
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
  const { rows, own, today } = useLeaderboardRows();
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
    () => computeConsensus(socialPosts, dataset.games),
    [dataset.games, socialPosts],
  );

  const authorOf = useMemo(() => {
    const cache = new Map<string, AuthorInfo>();
    return (post: SocialPost): AuthorInfo => {
      const spec = getExampleAnalystSpec(post.authorHandle);
      const isOwnPost = own?.handle === post.authorHandle;
      const nextAvatarUrl = spec
        ? null
        : ((isOwnPost ? (own?.avatarUrl ?? post.authorAvatarUrl) : post.authorAvatarUrl) ?? null);
      const hit = cache.get(post.authorHandle);
      if (hit && hit.avatarUrl === nextAvatarUrl) return hit;
      const ranked = seasonRanked.find((r) => r.handle === post.authorHandle);
      const info: AuthorInfo = {
        handle: post.authorHandle,
        name: isOwnPost && !spec ? own!.name : post.authorName,
        initials:
          spec?.avatarInitials ??
          (isOwnPost ? own!.avatarInitials : post.authorName.split(" ").map((w) => w[0]).join("").slice(0, 2)),
        gradVar: spec?.avatarGradVar ?? post.avatarGradVar,
        avatarUrl: nextAvatarUrl,
        isTipster: spec?.isTipster ?? false,
        saldo: ranked && ranked.record.settled > 0 ? formatUnits(ranked.record.netUnits) : null,
      };
      cache.set(post.authorHandle, info);
      return info;
    };
  }, [own, seasonRanked]);

  const goProfile = (handle: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    navigateTo(`/app/u/${handle}`);
  };

  const onToggleFollow = (handle: string): void => {
    const now = follows.toggle(handle);
    pushToast(now ? `Ahora sigues a @${handle}.` : `Dejaste de seguir a @${handle}.`, "default");
  };

  const onCopy = (post: SocialPost): void => {
    if (!post.pick) return;
    const game = dataset.games.find((g) => g.id === post.pick!.gameId);
    const pick = game?.picks.find((p) => p.id === post.pick!.pickId);
    if (!pick) {
      pushToast("Ese partido ya no está disponible para registrar.", "warning");
      return;
    }
    sealPickToJournal(pick, post.pick.units, post.pick.userDecimal);
  };

  const onShare = (post: SocialPost): void => {
    void shareUrl(
      `/app/u/${post.authorHandle}`,
      `${post.authorName} en PitchLab`,
      () => pushToast("Copiamos el enlace.", "success"),
      () => pushToast("No pudimos compartir.", "warning"),
    );
  };

  const feedProps = {
    authorOf,
    own,
    dataset,
    oddsFormat,
    follows,
    onToggleFollow,
    onCopy,
    onShare,
    toggleSocialLike,
    addSocialComment,
    onDelete: deleteSocialPost,
    onOpenReport: setReportTarget,
    goProfile,
    highlightedPostId,
  };

  return (
    <div className="pl-com">
      <h1 className="pl-com-title">Comunidad</h1>
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
              <Composer own={own} games={dataset.games} oddsFormat={oddsFormat} publish={publishSocialPost} />
              <MobileTop ranked={monthRanked} monthName={monthName} goProfile={goProfile} />
              <Feed posts={socialPosts} {...feedProps} />
            </div>
            <aside className="pl-com-aside" aria-label="Resumen de Comunidad">
              <YourMonthCard own={own} ranked={monthRanked} monthName={monthName} goProfile={goProfile} />
              <TopCard ranked={monthRanked} monthName={monthName} onRanking={() => setTab("ranking")} goProfile={goProfile} />
              {consensus[0] ? <HotCard item={consensus[0]} onConsensus={() => setTab("consenso")} /> : null}
              <a
                href="/app/account?tab=referrals"
                className="pl-com-invite glass-card glass-ring"
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
                  <span>7 días para él, +15 días para ti</span>
                </span>
                <ChevronRightIcon size={16} />
              </a>
            </aside>
          </div>
        ) : null}

        {tab === "siguiendo" ? (
          <FollowingTab
            posts={socialPosts}
            seasonRanked={seasonRanked}
            {...feedProps}
          />
        ) : null}

        {tab === "consenso" ? <ConsensusTab items={consensus} /> : null}

        {tab === "ranking" ? (
          <RankingTab rows={rows} own={own} today={today} follows={follows} onToggleFollow={onToggleFollow} goProfile={goProfile} />
        ) : null}
      </TabPanel>
      <SocialReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />
    </div>
  );
}

/* ===========================================================================
   Publicar
   ========================================================================= */

interface AttachedPick {
  matchPick: MatchPick;
  units: number;
  userDecimal: number;
}

function Composer({
  own,
  games,
  oddsFormat,
  publish,
}: {
  own: OwnIdentity | null;
  games: readonly PlatformGame[];
  oddsFormat: ReturnType<typeof usePlatform>["oddsFormat"];
  publish: ReturnType<typeof usePlatform>["publishSocialPost"];
}): React.JSX.Element {
  const uid = useId();
  const [body, setBody] = useState("");
  const [attached, setAttached] = useState<AttachedPick | null>(null);
  const [origin, setOrigin] = useState<"Spacetime Suite" | "Bitácora Propia">("Spacetime Suite");
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const submit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setError("");
    if (!body.trim()) {
      setError("Escribe tu publicación.");
      return;
    }
    const res = publish({
      leagueLabel: attached?.matchPick.leagueLabel ?? "Comunidad",
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
    setSheetOpen(false);
  };

  const meta = attached ? resolveGameMeta(attached.matchPick.gameId, games) : null;

  const form = (inSheet: boolean): React.JSX.Element => (
    <form className={`pl-com-composer ${inSheet ? "" : "glass-lens glass-ring"}`} aria-label="Publicar" onSubmit={submit} noValidate>
      <div className="pl-com-composer-top">
        {own ? <Avatar initials={own.avatarInitials} avatarUrl={own.avatarUrl} gradVar={own.avatarGradVar} size={40} /> : null}
        <div className="pl-com-composer-field">
          <label htmlFor={`${uid}-${inSheet ? "s" : "d"}-body`} className="sr-only">
            Escribe tu publicación
          </label>
          <textarea
            id={`${uid}-${inSheet ? "s" : "d"}-body`}
            rows={2}
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
            <div className="pl-com-attached glass-card glass-ring">
              {meta ? <LeagueBadge league={meta.league} size={18} /> : null}
              <span className="pl-com-attached-copy">
                <strong>{attached.matchPick.label}</strong>{" "}
                <span>
                  · {attached.matchPick.matchLabel} · <span className="num">{attached.units.toFixed(1)}u</span>
                </span>
              </span>
              <button
                type="button"
                className="pl-com-icon-btn"
                aria-label="Quitar pick adjunto"
                onClick={() => setAttached(null)}
              >
                <MaestroIcon name="x" size={14} />
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div id={`${uid}-err`} className="pl-com-error-slot" aria-live="polite">
        {error && inSheet === sheetOpen ? <p className="pl-com-error" role="alert">{error}</p> : null}
      </div>
      <div className="pl-com-composer-bar">
        <div className="pl-com-composer-tools">
          <button type="button" className="pl-prof-btn pl-prof-btn--ghost pl-prof-btn--sm" onClick={() => setPickerOpen(true)}>
            <MaestroIcon name="layers" size={14} />
            {attached ? "Cambiar pick" : "Adjuntar pick"}
          </button>
          <div className="pl-com-seg" role="group" aria-label="Origen del pick">
            <button type="button" aria-pressed={origin === "Spacetime Suite"} onClick={() => setOrigin("Spacetime Suite")}>
              Del modelo
            </button>
            <button type="button" aria-pressed={origin === "Bitácora Propia"} onClick={() => setOrigin("Bitácora Propia")}>
              Propio
            </button>
          </div>
        </div>
        <button type="submit" className="pl-prof-btn pl-prof-btn--primary pl-prof-btn--sm">
          Publicar
        </button>
      </div>
    </form>
  );

  return (
    <>
      <div className="pl-com-composer-desktop">{form(false)}</div>
      <button
        type="button"
        className="pl-com-composer-row glass-lens glass-ring"
        onClick={() => setSheetOpen(true)}
      >
        {own ? <Avatar initials={own.avatarInitials} avatarUrl={own.avatarUrl} gradVar={own.avatarGradVar} size={36} /> : null}
        <span className="pl-com-composer-row-text">Comparte un pick…</span>
        <span className="pl-prof-btn pl-prof-btn--primary pl-prof-btn--sm" aria-hidden="true">
          Publicar
        </span>
      </button>
      {sheetOpen ? (
        <TopLayerModalDialog open={sheetOpen} onClose={() => setSheetOpen(false)} ariaLabel="Publicar" variant="drawer">
          <div className="pl-com-sheet">
            <div className="pl-com-sheet-head">
              <p className="pl-com-sheet-title">Publicar</p>
              <button type="button" className="pl-com-icon-btn" aria-label="Cerrar" onClick={() => setSheetOpen(false)}>
                <MaestroIcon name="x" size={16} />
              </button>
            </div>
            {form(true)}
          </div>
        </TopLayerModalDialog>
      ) : null}
      {pickerOpen ? (
        <PickPicker
          games={games}
          oddsFormat={oddsFormat}
          onClose={() => setPickerOpen(false)}
          onPick={(pick) => {
            setAttached({
              matchPick: pick,
              units: Math.max(0.5, Math.min(3, Math.round((pick.suggestedUnits || 1) * 2) / 2)),
              userDecimal: pick.marketDecimal ?? pick.fairDecimal,
            });
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
  oddsFormat,
  onClose,
  onPick,
}: {
  games: readonly PlatformGame[];
  oddsFormat: ReturnType<typeof usePlatform>["oddsFormat"];
  onClose: () => void;
  onPick: (pick: MatchPick) => void;
}): React.JSX.Element {
  const uid = useId();
  const { userTimezone } = usePlatform();
  const [query, setQuery] = useState("");
  const upcoming = useMemo(() => {
    const q = query.trim().toLowerCase();
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
  }, [games, query]);

  return (
    <TopLayerModalDialog open onClose={onClose} ariaLabelledBy={`${uid}-title`} maxWidth="34rem">
      <div className="pl-com-picker glass-lens glass-ring">
        <div className="pl-com-sheet-head">
          <h2 id={`${uid}-title`} className="pl-com-sheet-title">
            Adjuntar pick
          </h2>
          <button type="button" className="pl-com-icon-btn" aria-label="Cerrar" onClick={onClose}>
            <MaestroIcon name="x" size={16} />
          </button>
        </div>
        <label className="sr-only" htmlFor={`${uid}-q`}>
          Buscar partido
        </label>
        <input
          id={`${uid}-q`}
          className="pl-com-search"
          type="search"
          placeholder="Buscar equipo o liga"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="pl-com-picker-list">
          {upcoming.length === 0 ? <p className="pl-prof-empty-line">No hay partidos próximos con ese nombre.</p> : null}
          {upcoming.map((game) => (
            <section key={game.id} className="pl-com-picker-game" aria-label={`${game.home.name} vs ${game.away.name}`}>
              <p className="pl-com-picker-match">
                <LeagueBadge league={game.league} size={16} />
                <span>
                  {game.home.shortName || game.home.name} vs {game.away.shortName || game.away.name}
                </span>
                <span className="pl-prof-muted num">· {kickoffLabel(game.kickoffUtc, userTimezone)}</span>
              </p>
              <ul>
                {[...game.picks]
                  .sort((a, b) => b.p - a.p)
                  .slice(0, 4)
                  .map((pick) => (
                    <li key={pick.id}>
                      <button type="button" className="pl-com-picker-pick" onClick={() => onPick(pick)}>
                        <span>{pick.label}</span>
                        <span className="num pl-prof-muted">
                          {formatOddsValue(pick.marketDecimal ?? pick.fairDecimal, oddsFormat)} · modelo{" "}
                          {(pick.p * 100).toFixed(1)} %
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </TopLayerModalDialog>
  );
}

/* ===========================================================================
   Feed
   ========================================================================= */

interface FeedSharedProps {
  authorOf: (post: SocialPost) => AuthorInfo;
  own: OwnIdentity | null;
  dataset: ReturnType<typeof usePlatform>["dataset"];
  oddsFormat: ReturnType<typeof usePlatform>["oddsFormat"];
  follows: ReturnType<typeof useFollowing>;
  onToggleFollow: (handle: string) => void;
  onCopy: (post: SocialPost) => void;
  onShare: (post: SocialPost) => void;
  toggleSocialLike: (postId: string) => void;
  addSocialComment: (postId: string, body: string) => { ok: boolean; error?: string };
  onDelete: (postId: string) => void;
  onOpenReport: (target: SocialReportTarget) => void;
  goProfile: (handle: string) => (e: React.MouseEvent<HTMLAnchorElement>) => void;
  highlightedPostId?: string | null;
}

function Feed({
  posts,
  scope,
  emptyText = "Todavía no hay publicaciones.",
  ...shared
}: FeedSharedProps & {
  posts: readonly SocialPost[];
  scope?: SocialFeedScope;
  emptyText?: string;
}): React.JSX.Element {
  const { socialFeedPages, loadOlderSocialPosts } = usePlatform();
  const [limit, setLimit] = useState(FEED_PAGE);
  const pageState = socialFeedPages[socialScopeKey(scope)];
  const hasMoreServer = Boolean(pageState?.hasMore);
  const loadingOlder = Boolean(pageState?.loading);

  const realPosts = useMemo(() => posts.filter((p) => !p.isExample), [posts]);
  const examplePosts = useMemo(() => posts.filter((p) => p.isExample), [posts]);
  // Mientras sigan quedando publicaciones reales en el servidor, las de ejemplo esperan al final.
  const displayPool = useMemo(
    () => (hasMoreServer ? realPosts : [...realPosts, ...examplePosts]),
    [hasMoreServer, realPosts, examplePosts],
  );

  const targetIdx = shared.highlightedPostId
    ? displayPool.findIndex((p) => p.id === shared.highlightedPostId)
    : -1;
  useEffect(() => {
    if (targetIdx >= limit) {
      setLimit(targetIdx + FEED_PAGE);
    }
  }, [targetIdx, limit]);

  if (displayPool.length === 0 && !hasMoreServer && !loadingOlder) {
    return <p className="pl-prof-empty-line">{emptyText}</p>;
  }

  const canShowMore = displayPool.length > limit || hasMoreServer || loadingOlder;
  const onShowMore = (): void => {
    if (loadingOlder) return;
    const nextLimit = limit + FEED_PAGE;
    setLimit(nextLimit);
    if (hasMoreServer && nextLimit >= realPosts.length) {
      void loadOlderSocialPosts(scope);
    }
  };

  return (
    <div className="pl-com-feed">
      {displayPool.slice(0, limit).map((post) => (
        <PostCard key={post.id} post={post} {...shared} />
      ))}
      {canShowMore ? (
        <div className="pl-prof-more">
          <button
            type="button"
            className="pl-prof-btn pl-prof-btn--ghost"
            disabled={loadingOlder}
            onClick={onShowMore}
          >
            {loadingOlder ? "Cargando…" : "Ver más"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PostCard({
  post,
  authorOf,
  own,
  dataset,
  oddsFormat,
  follows,
  onToggleFollow,
  onCopy,
  onShare,
  toggleSocialLike,
  addSocialComment,
  onDelete,
  onOpenReport,
  goProfile,
  highlightedPostId,
}: FeedSharedProps & { post: SocialPost }): React.JSX.Element {
  const uid = useId();
  const cardRef = useRef<HTMLElement>(null);
  const isHighlighted = Boolean(highlightedPostId && highlightedPostId === post.id);
  const author = authorOf(post);
  const [threadOpen, setThreadOpen] = useState(isHighlighted);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!isHighlighted) return;
    setThreadOpen(true);
    cardRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [isHighlighted]);
  const canDelete = Boolean(post.fromServer && post.isMine);
  const [reply, setReply] = useState("");
  const [replyError, setReplyError] = useState("");
  const isMine = Boolean(post.isMine || own?.handle === post.authorHandle);
  const canReportPost = !isMine && !post.isExample;
  const following = follows.isFollowing(post.authorHandle);
  const pick = post.pick;
  const meta = pick ? resolveEntryGame(pick.gameId, dataset) : null;
  const units = pick ? (pick.status === "won" ? pick.units * (pick.userDecimal - 1) : pick.status === "lost" ? -pick.units : null) : null;
  const firstComment = post.comments[0];
  const isFirstCommentMine = firstComment ? Boolean(firstComment.isMine || own?.handle === firstComment.authorHandle) : true;

  const pickMeta = pick
    ? pick.status === "open"
      ? [
          meta?.leagueLabel ?? post.leagueLabel,
          kickoffLabel(meta?.kickoffIso),
          formatOddsValue(pick.userDecimal, oddsFormat),
          `justo ${formatOddsValue(pick.fairDecimal, oddsFormat)}`,
          `modelo ${(pick.modelProbability * 100).toFixed(1)} %`,
        ]
      : [
          meta?.leagueLabel ?? post.leagueLabel,
          meta?.score ? `${meta.home.name} ${meta.score.home}–${meta.score.away} ${meta.away.name}` : post.matchLabel,
          formatOddsValue(pick.userDecimal, oddsFormat),
        ]
    : [];

  return (
    <article
      ref={cardRef}
      id={`post-${post.id}`}
      data-highlighted={isHighlighted ? "true" : undefined}
      className="pl-com-post glass-lens glass-ring"
      aria-labelledby={`${uid}-author`}
    >
      <header className="pl-com-post-head">
        <a href={`/app/u/${post.authorHandle}`} onClick={goProfile(post.authorHandle)} className="pl-com-post-avatar" tabIndex={-1} aria-hidden="true">
          <Avatar initials={author.initials} avatarUrl={author.avatarUrl} gradVar={author.gradVar} size={42} loading="lazy" />
        </a>
        <div className="pl-com-post-who">
          <p className="pl-com-post-name">
            <a id={`${uid}-author`} href={`/app/u/${post.authorHandle}`} onClick={goProfile(post.authorHandle)}>
              {author.name}
            </a>
            {author.isTipster ? <VerifiedSeal size={16} /> : null}
            {post.isExample ? <ExampleBadge className="pl-com-example" /> : null}
          </p>
          <p className="pl-com-post-sub num">
            @{post.authorHandle}
            {author.saldo ? ` · ${author.saldo}` : ""} · {post.createdAt.toLowerCase()}
          </p>
        </div>
        {!isMine ? (
          <button
            type="button"
            className={`pl-prof-btn pl-prof-btn--sm ${following ? "pl-prof-btn--ghost" : "pl-prof-btn--primary"} pl-com-follow`}
            aria-pressed={following}
            aria-label={`${following ? "Siguiendo" : "Seguir"} a ${author.name}`}
            onClick={() => onToggleFollow(post.authorHandle)}
          >
            {following ? "Siguiendo" : "Seguir"}
          </button>
        ) : null}
        {canReportPost ? (
          <SocialReportMenu
            triggerLabel={`Más opciones de la publicación de ${author.name}`}
            onReport={() =>
              onOpenReport({
                kind: "post",
                postId: post.id,
                authorHandle: post.authorHandle,
              })
            }
          />
        ) : null}
      </header>

      <p className="pl-com-post-body">{post.body}</p>

      {pick ? (
        <div className="pl-com-pick glass-card glass-ring">
          {meta ? (
            <span className="pl-prof-teams" aria-hidden="true">
              <TeamBadge league={meta.league} slug={meta.home.slug} name={meta.home.name} size={28} decorative />
              <span className="pl-prof-teams-away">
                <TeamBadge league={meta.league} slug={meta.away.slug} name={meta.away.name} size={28} decorative />
              </span>
            </span>
          ) : null}
          <div className="pl-com-pick-copy">
            <p className="pl-prof-row-title">
              {pick.label} · <span className="num">{pick.units.toFixed(1)}u</span>
            </p>
            <p className="pl-prof-row-sub num">{pickMeta.filter(Boolean).join(" · ")}</p>
          </div>
          <PickStatus status={pick.status} detail={units === null ? undefined : formatUnits(units)} />
        </div>
      ) : null}

      <div className="pl-com-actions num">
        <button
          type="button"
          className={`pl-com-act ${post.likedByMe ? "is-on" : ""}`}
          aria-pressed={Boolean(post.likedByMe)}
          aria-label={`Me gusta, ${post.likes}`}
          onClick={() => toggleSocialLike(post.id)}
        >
          <HeartIcon filled={Boolean(post.likedByMe)} />
          <span>{post.likes}</span>
        </button>
        <button
          type="button"
          className="pl-com-act"
          aria-expanded={threadOpen}
          aria-controls={`${uid}-thread`}
          aria-label={`Comentarios, ${post.comments.length}`}
          onClick={() => setThreadOpen((v) => !v)}
        >
          <CommentIcon />
          <span>{post.comments.length}</span>
        </button>
        {pick && !isMine ? (
          <button type="button" className="pl-com-act" onClick={() => onCopy(post)}>
            <MaestroIcon name="copy" size={15} />
            Copiar a mi bitácora
          </button>
        ) : null}
        {canDelete ? (
          confirmDelete ? (
            <span className="pl-com-delete-confirm" role="group" aria-label="Confirmar borrado">
              <button type="button" className="pl-com-act pl-com-act--danger" onClick={() => onDelete(post.id)}>
                Borrar
              </button>
              <button type="button" className="pl-com-act" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="pl-com-act pl-com-act--end"
              aria-label="Borrar publicación"
              onClick={() => setConfirmDelete(true)}
            >
              <MaestroIcon name="trash" size={15} />
            </button>
          )
        ) : null}
        <button
          type="button"
          className={`pl-com-act ${canDelete ? "" : "pl-com-act--end"}`}
          aria-label="Compartir"
          onClick={() => onShare(post)}
        >
          <ShareIcon size={16} />
        </button>
      </div>

      <div id={`${uid}-thread`}>
        {!threadOpen && firstComment ? (
          <div className="pl-com-comment-preview">
            <Avatar
              initials={firstComment.authorName.split(" ").map((w) => w[0]).join("").slice(0, 2)}
              avatarUrl={
                own?.handle === firstComment.authorHandle
                  ? (own.avatarUrl ?? firstComment.authorAvatarUrl)
                  : firstComment.authorAvatarUrl
              }
              gradVar={getExampleAnalystSpec(firstComment.authorHandle)?.avatarGradVar ?? "var(--avatar-grad-3)"}
              size={28}
              loading="lazy"
            />
            <div className="pl-com-comment-preview-body">
              <div className="pl-com-comment-head">
                <p>
                  <strong>{firstComment.authorName}</strong> {firstComment.body}
                </p>
                {!isFirstCommentMine && !post.isExample ? (
                  <SocialReportMenu
                    compact
                    triggerLabel={`Más opciones del comentario de ${firstComment.authorName}`}
                    onReport={() =>
                      onOpenReport({
                        kind: "comment",
                        commentId: firstComment.id,
                        authorHandle: firstComment.authorHandle,
                      })
                    }
                  />
                ) : null}
              </div>
              {post.comments.length > 1 ? (
                <button type="button" className="pl-com-more-comments" onClick={() => setThreadOpen(true)}>
                  Ver los {post.comments.length} comentarios
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {threadOpen ? (
          <div className="pl-com-thread">
            {post.comments.length > 0 ? (
              <ul>
                {post.comments.map((c) => {
                  const isCommentMine = Boolean(c.isMine || own?.handle === c.authorHandle);
                  const commentAvatarUrl =
                    own?.handle === c.authorHandle ? (own.avatarUrl ?? c.authorAvatarUrl) : c.authorAvatarUrl;
                  return (
                    <li key={c.id} className="pl-com-comment-row">
                      <Avatar
                        initials={c.authorName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                        avatarUrl={commentAvatarUrl}
                        gradVar={getExampleAnalystSpec(c.authorHandle)?.avatarGradVar ?? "var(--avatar-grad-3)"}
                        size={26}
                        loading="lazy"
                      />
                      <div className="pl-com-comment-body">
                        <div className="pl-com-comment-head">
                          <p>
                            <strong>{c.authorName}</strong>{" "}
                            <span className="pl-prof-muted">· {c.createdAt.toLowerCase()}</span>
                          </p>
                          {!isCommentMine && !post.isExample ? (
                            <SocialReportMenu
                              compact
                              triggerLabel={`Más opciones del comentario de ${c.authorName}`}
                              onReport={() =>
                                onOpenReport({
                                  kind: "comment",
                                  commentId: c.id,
                                  authorHandle: c.authorHandle,
                                })
                              }
                            />
                          ) : null}
                        </div>
                        <p>{c.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <form
              className="pl-com-reply"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                const res = addSocialComment(post.id, reply);
                if (!res.ok) {
                  setReplyError(res.error ?? "No pudimos comentar.");
                  return;
                }
                setReply("");
                setReplyError("");
              }}
            >
              <label className="sr-only" htmlFor={`${uid}-reply`}>
                Responder
              </label>
              <input
                id={`${uid}-reply`}
                value={reply}
                placeholder="Responde…"
                aria-describedby={replyError ? `${uid}-reply-err` : undefined}
                onChange={(e) => {
                  setReply(e.target.value);
                  if (replyError) setReplyError("");
                }}
              />
              <button type="submit" className="pl-prof-btn pl-prof-btn--ghost pl-prof-btn--sm">
                Responder
              </button>
            </form>
            <div id={`${uid}-reply-err`} aria-live="polite">
              {replyError ? <p className="pl-com-error">{replyError}</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

/* ===========================================================================
   Columna derecha
   ========================================================================= */

function YourMonthCard({
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
    <section className="pl-com-card glass-lens glass-ring" aria-labelledby="pl-com-mine">
      <h2 id="pl-com-mine" className="pl-prof-eyebrow">
        Tu {monthName}
      </h2>
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
              Te faltan {Math.max(0.1, tenth.record.netUnits - me.record.netUnits).toFixed(1)}u para el top 10.
            </p>
          ) : null}
        </>
      ) : (
        <p className="pl-com-card-note">Registra {LEADERBOARD_MIN_SETTLED} picks para entrar al ranking.</p>
      )}
      <a href={`/app/u/${own.handle}`} className="pl-prof-link" onClick={goProfile(own.handle)}>
        Ver mi perfil
      </a>
    </section>
  );
}

function TopCard({
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
    <section className="pl-com-card glass-lens glass-ring" aria-labelledby="pl-com-top">
      <div className="pl-com-card-head">
        <h2 id="pl-com-top" className="pl-prof-eyebrow">
          Top de {monthName}
        </h2>
        <button type="button" className="pl-com-text-btn" onClick={onRanking}>
          Ver ranking
        </button>
      </div>
      {ranked.length === 0 ? (
        <p className="pl-com-card-note">Aún nadie llega a {LEADERBOARD_MIN_SETTLED} picks este mes.</p>
      ) : (
        <ol className="pl-com-top">
          {ranked.slice(0, 5).map((r) => (
            <li key={r.handle}>
              <span className="pl-com-top-rank num">{r.rank}</span>
              <Avatar initials={r.avatarInitials} gradVar={r.avatarGradVar} size={28} />
              <a href={`/app/u/${r.handle}`} onClick={goProfile(r.handle)} className="pl-com-top-name">
                {r.name}
              </a>
              <span className={`num ${r.record.netUnits >= 0 ? "pl-prof-pos" : "pl-prof-neg"}`}>
                {formatUnits(r.record.netUnits)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function HotCard({ item, onConsensus }: { item: ConsensusGame; onConsensus: () => void }): React.JSX.Element {
  const g = item.game;
  return (
    <section className="pl-com-card glass-lens glass-ring" aria-labelledby="pl-com-hot">
      <h2 id="pl-com-hot" className="pl-prof-eyebrow">
        Más comentado hoy
      </h2>
      <p className="pl-com-hot-match">
        <TeamBadge league={g.league} slug={g.home.slug} name={g.home.name} size={22} decorative />
        {g.home.shortName || g.home.name} vs {g.away.shortName || g.away.name}
        <TeamBadge league={g.league} slug={g.away.slug} name={g.away.name} size={22} decorative />
      </p>
      <BarsPair label={item.top.label} fans={item.top.fansPct} model={item.top.modelPct} />
      <button type="button" className="pl-com-text-btn" onClick={onConsensus}>
        Ver consenso
      </button>
    </section>
  );
}

function BarsPair({ label, fans, model }: { label: string; fans: number; model: number }): React.JSX.Element {
  return (
    <div className="pl-com-bars num" role="img" aria-label={`${label}: socios ${fans} %, modelo ${model} %`}>
      <span className="pl-com-bars-name">Socios</span>
      <span className="pl-com-bar" aria-hidden="true">
        <span className="pl-com-bar-fill pl-com-bar-fill--fans" style={{ width: `${fans}%` }} />
      </span>
      <strong>{fans} %</strong>
      <span className="pl-com-bars-name">Modelo</span>
      <span className="pl-com-bar" aria-hidden="true">
        <span className="pl-com-bar-fill pl-com-bar-fill--model" style={{ width: `${model}%` }} />
      </span>
      <strong>{model} %</strong>
    </div>
  );
}

function MobileTop({
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
            <a href={`/app/u/${r.handle}`} onClick={goProfile(r.handle)} className="pl-com-mtop-card glass-card glass-ring">
              <span className="pl-com-mtop-rank num">#{r.rank}</span>
              <Avatar initials={r.avatarInitials} gradVar={r.avatarGradVar} size={40} />
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
}

/* ===========================================================================
   Siguiendo
   ========================================================================= */

type FollowFilter = "all" | "tipsters" | "socios" | "open";

function FollowingTab({
  posts,
  seasonRanked,
  ...shared
}: FeedSharedProps & { posts: readonly SocialPost[]; seasonRanked: readonly RankedAnalyst[] }): React.JSX.Element {
  const { loadFollowingSocialPosts } = usePlatform();
  const [filter, setFilter] = useState<FollowFilter>("all");
  const { follows, dataset, oddsFormat, onToggleFollow, goProfile } = shared;
  const followed = follows.following;

  useEffect(() => {
    if (followed.length > 0) {
      loadFollowingSocialPosts();
    }
  }, [followed.length, loadFollowingSocialPosts]);

  const followedInfo = useMemo(
    () =>
      followed.map((handle) => {
        const spec = getExampleAnalystSpec(handle);
        const matchingPost = spec ? undefined : posts.find((p) => p.authorHandle === handle && p.authorAvatarUrl);
        return {
          handle,
          initials: spec?.avatarInitials ?? handle.slice(0, 2).toUpperCase(),
          gradVar: spec?.avatarGradVar ?? "var(--avatar-grad-4)",
          avatarUrl: matchingPost?.authorAvatarUrl ?? null,
          isTipster: spec?.isTipster ?? false,
          name: spec?.name ?? `@${handle}`,
        };
      }),
    [followed, posts],
  );
  const tipsters = followedInfo.filter((f) => f.isTipster).length;

  const followedPosts = useMemo(() => {
    const base = posts.filter((p) => followed.includes(p.authorHandle));
    return base.filter((p) => {
      const tip = getExampleAnalystSpec(p.authorHandle)?.isTipster ?? false;
      if (filter === "tipsters") return tip;
      if (filter === "socios") return !tip;
      if (filter === "open") return p.pick?.status === "open";
      return true;
    });
  }, [filter, followed, posts]);

  const openPicks = useMemo(() => {
    const groups = new Map<string, { label: string; gameId: string; names: string[]; kickoff?: string; league?: string }>();
    for (const p of posts) {
      if (!followed.includes(p.authorHandle) || p.pick?.status !== "open") continue;
      const meta = resolveEntryGame(p.pick.gameId, dataset);
      const g = groups.get(p.pick.pickId) ?? {
        label: p.pick.label,
        gameId: p.pick.gameId,
        names: [],
        kickoff: meta?.kickoffIso,
        league: meta?.leagueLabel ?? p.leagueLabel,
      };
      g.names.push(p.authorName.split(" ")[0]!);
      groups.set(p.pick.pickId, g);
    }
    return [...groups.values()].sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? "")).slice(0, 5);
  }, [dataset, followed, posts]);

  const suggestions = useMemo(
    () => seasonRanked.filter((r) => !followed.includes(r.handle) && r.handle !== shared.own?.handle).slice(0, 3),
    [followed, seasonRanked, shared.own?.handle],
  );

  const suggestionList = (
    <ul className="pl-com-suggest">
      {suggestions.map((r) => (
        <li key={r.handle}>
          <Avatar initials={r.avatarInitials} gradVar={r.avatarGradVar} size={36} />
          <span className="pl-com-suggest-who">
            <a href={`/app/u/${r.handle}`} onClick={goProfile(r.handle)}>
              {r.name}
            </a>
            {r.isTipster ? <VerifiedSeal size={14} /> : null}
            <span className="pl-prof-muted num">
              {formatUnits(r.record.netUnits)} · {r.record.settled} picks
            </span>
          </span>
          <button
            type="button"
            className="pl-prof-btn pl-prof-btn--primary pl-prof-btn--sm"
            aria-pressed={false}
            aria-label={`Seguir a ${r.name}`}
            onClick={() => onToggleFollow(r.handle)}
          >
            Seguir
          </button>
        </li>
      ))}
    </ul>
  );

  if (followed.length === 0) {
    return (
      <div className="pl-com-empty glass-lens glass-ring">
        <p className="pl-com-empty-title">Aún no sigues a nadie.</p>
        {suggestionList}
      </div>
    );
  }

  return (
    <div className="pl-com-cols">
      <div className="pl-com-main">
        <section className="pl-com-strip glass-lens glass-ring" aria-label="A quién sigues">
          <span className="pl-com-stack" aria-hidden="true">
            {followedInfo.slice(0, 5).map((f) => (
              <Avatar key={f.handle} initials={f.initials} avatarUrl={f.avatarUrl} gradVar={f.gradVar} size={32} loading="lazy" />
            ))}
          </span>
          <p className="pl-com-strip-copy num">
            Sigues a <strong>{followed.length}</strong> · {tipsters} {tipsters === 1 ? "tipster" : "tipsters"},{" "}
            {followed.length - tipsters} {followed.length - tipsters === 1 ? "socio" : "socios"}
          </p>
        </section>

        <div className="pl-com-filters" role="group" aria-label="Filtrar">
          {(
            [
              ["all", "Todos"],
              ["tipsters", "Tipsters"],
              ["socios", "Socios"],
              ["open", "Con pick abierto"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" className="pl-prof-chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>

        {openPicks.length > 0 ? (
          <ol className="pl-com-open-strip" aria-label="Picks abiertos de quienes sigues">
            {openPicks.map((p) => (
              <li key={`${p.gameId}-${p.label}`} className="glass-card glass-ring">
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
          posts={followedPosts}
          scope={{ following: true }}
          emptyText="Nadie a quien sigues publicó con este filtro."
          {...shared}
        />
      </div>
      <aside className="pl-com-aside" aria-label="De quienes sigues">
        <section className="pl-com-card glass-lens glass-ring" aria-labelledby="pl-com-open">
          <h2 id="pl-com-open" className="pl-prof-eyebrow">
            Picks abiertos · próximos
          </h2>
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
        </section>
        {suggestions.length > 0 ? (
          <section className="pl-com-card glass-lens glass-ring" aria-labelledby="pl-com-suggest">
            <h2 id="pl-com-suggest" className="pl-prof-eyebrow">
              Para seguir
            </h2>
            {suggestionList}
          </section>
        ) : null}
        <p className="sr-only">{oddsFormat}</p>
      </aside>
    </div>
  );
}

/* ===========================================================================
   Consenso
   ========================================================================= */

type ConsensusSort = "diff" | "picks" | "soon";

function diffClass(diff: number): string {
  const abs = Math.abs(diff);
  if (abs >= CONSENSUS_STRONG_PTS) return "pl-com-diff pl-com-diff--strong";
  if (abs < CONSENSUS_AGREE_PTS) return "pl-com-diff pl-com-diff--quiet";
  return "pl-com-diff";
}

function ConsensusTab({ items }: { items: readonly ConsensusGame[] }): React.JSX.Element {
  const { userTimezone } = usePlatform();
  const [league, setLeague] = useState("all");
  const [sort, setSort] = useState<ConsensusSort>("diff");
  const leagues = useMemo(() => [...new Set(items.map((i) => i.game.leagueLabel))], [items]);
  const list = useMemo(() => {
    const filtered = league === "all" ? [...items] : items.filter((i) => i.game.leagueLabel === league);
    if (sort === "picks") filtered.sort((a, b) => b.totalPicks - a.totalPicks);
    if (sort === "soon") filtered.sort((a, b) => a.game.kickoffUtc.localeCompare(b.game.kickoffUtc));
    return filtered;
  }, [items, league, sort]);

  if (items.length === 0) {
    return (
      <div className="pl-com-consensus">
        <div className="pl-com-empty glass-lens glass-ring">
          <p className="pl-com-empty-title">Todavía no hay partidos con 10 picks de socios.</p>
          <p className="pl-com-card-note">Publica tu pick con «Adjuntar pick» y cuenta para el consenso.</p>
        </div>
        <ConsensusNote />
      </div>
    );
  }

  const [featured, ...rest] = list;
  return (
    <div className="pl-com-consensus">
      <div className="pl-com-toolbar">
        <div className="pl-com-filters" role="group" aria-label="Liga">
          <button type="button" className="pl-prof-chip" aria-pressed={league === "all"} onClick={() => setLeague("all")}>
            Todas
          </button>
          {leagues.map((l) => (
            <button key={l} type="button" className="pl-prof-chip" aria-pressed={league === l} onClick={() => setLeague(l)}>
              {l}
            </button>
          ))}
        </div>
        <label className="pl-com-sort">
          Ordenar
          <span className="pl-prof-select">
            <select value={sort} onChange={(e) => setSort(e.target.value as ConsensusSort)}>
              <option value="diff">Mayor diferencia</option>
              <option value="picks">Más picks</option>
              <option value="soon">Próximos</option>
            </select>
          </span>
        </label>
      </div>

      {featured ? (
        <article className="pl-com-featured glass-lens glass-ring" aria-labelledby="pl-com-featured-title">
          <p className="pl-prof-eyebrow">{sort === "diff" ? "Mayor diferencia hoy" : "Destacado"}</p>
          <h2 id="pl-com-featured-title" className="pl-com-featured-title">
            <TeamBadge league={featured.game.league} slug={featured.game.home.slug} name={featured.game.home.name} size={26} decorative />
            {featured.game.home.shortName || featured.game.home.name} vs {featured.game.away.shortName || featured.game.away.name}
            <TeamBadge league={featured.game.league} slug={featured.game.away.slug} name={featured.game.away.name} size={26} decorative />
          </h2>
          <p className="pl-com-card-note num">
            {featured.game.leagueLabel} · {kickoffLabel(featured.game.kickoffUtc, userTimezone)} · {featured.totalPicks} picks de socios
          </p>
          <div className="pl-com-outcomes">
            {featured.outcomes.slice(0, 3).map((o) => (
              <div key={o.pickId} className="pl-com-outcome glass-card glass-ring">
                <div className="pl-com-outcome-head">
                  <p>{o.label}</p>
                  <span className={diffClass(o.diffPts)}>{formatDiffPts(o.diffPts)}</span>
                </div>
                <BarsPair label={o.label} fans={o.fansPct} model={o.modelPct} />
              </div>
            ))}
          </div>
          <p className="pl-com-reading">{consensusReading(featured.top)}</p>
        </article>
      ) : null}

      {rest.length > 0 ? (
        <section className="pl-com-clist glass-lens glass-ring" aria-labelledby="pl-com-clist-title">
          <h2 id="pl-com-clist-title" className="sr-only">
            Todos los partidos
          </h2>
          <div className="pl-com-crow pl-com-crow--head" aria-hidden="true">
            <span>Partido</span>
            <span className="pl-com-hide-md">Más elegido por socios</span>
            <span className="pl-com-hide-md pl-com-right">Socios</span>
            <span className="pl-com-hide-md pl-com-right">Modelo</span>
            <span className="pl-com-right">Diferencia</span>
            <span className="pl-com-hide-md pl-com-right">Picks</span>
          </div>
          {rest.map((i) => (
            <div key={i.game.id} className="pl-com-crow num">
              <div className="pl-com-crow-match">
                <LeagueBadge league={i.game.league} size={20} />
                <div>
                  <p className="pl-prof-row-title">
                    {i.game.home.shortName || i.game.home.name} vs {i.game.away.shortName || i.game.away.name}
                  </p>
                  <p className="pl-prof-row-sub">{kickoffLabel(i.game.kickoffUtc, userTimezone)}</p>
                </div>
              </div>
              <span className="pl-com-hide-md">{i.top.label}</span>
              <span className="pl-com-hide-md pl-com-right">
                <strong>{i.top.fansPct} %</strong>
              </span>
              <span className="pl-com-hide-md pl-com-right pl-prof-muted">{i.top.modelPct} %</span>
              <span className="pl-com-right">
                <span className={diffClass(i.top.diffPts)}>{formatDiffPts(i.top.diffPts)}</span>
              </span>
              <span className="pl-com-hide-md pl-com-right pl-prof-muted">{i.totalPicks}</span>
            </div>
          ))}
        </section>
      ) : null}
      <ConsensusNote />
    </div>
  );
}

function ConsensusNote(): React.JSX.Element {
  return (
    <p className="pl-com-footnote">
      Socios: % de picks publicados por resultado. Modelo: probabilidad del partido. Solo partidos con 10 picks o más.
    </p>
  );
}

/* ===========================================================================
   Ranking
   ========================================================================= */

function RankingTab({
  rows,
  own,
  today,
  follows,
  onToggleFollow,
  goProfile,
}: {
  rows: ReturnType<typeof useLeaderboardRows>["rows"];
  own: OwnIdentity | null;
  today: Date;
  follows: ReturnType<typeof useFollowing>;
  onToggleFollow: (handle: string) => void;
  goProfile: (handle: string) => (e: React.MouseEvent<HTMLAnchorElement>) => void;
}): React.JSX.Element {
  const [window, setWindow] = useState<LeaderboardWindow>("30d");
  const [sort, setSort] = useState<LeaderboardSort>("units");
  const ranked = useMemo(() => rankAnalysts(rows, { window, sort, today }), [rows, window, sort, today]);
  const top = ranked.slice(0, TOP_N);
  const podium = top.slice(0, 3);
  const tableRows = top.slice(3);
  const me = own ? ranked.find((r) => r.handle === own.handle) ?? null : null;
  const meInTop = me !== null && me.rank <= TOP_N;
  const ownRow = own ? rows.find((r) => r.handle === own.handle) : undefined;
  const ownSettled = ownRow ? profileRecord(entriesInWindow(ownRow.journal, window, today)).settled : 0;
  const tenth = top[TOP_N - 1];
  const windowLabel = window === "30d" ? "últimos 30 días" : "temporada";
  const sortLabel = sort === "units" ? "saldo" : sort === "clv" ? "ventaja contra el cierre" : "cumplidos";

  const hit = (r: RankedAnalyst): string => `${Math.round(r.record.hitRatePct ?? 0)} %`;
  const clv = (r: RankedAnalyst): string => (r.record.avgClvPct === null ? "—" : formatSignedPct(r.record.avgClvPct));
  const sub = (r: RankedAnalyst): string => `${r.roleLabel} · ${r.specialty}`;

  const meNote = me
    ? me.rank > TOP_N && tenth
      ? `Te faltan ${Math.max(0.1, tenth.record.netUnits - me.record.netUnits).toFixed(1)}u para el top 10`
      : "Estás en el top 10"
    : `Registra ${Math.max(0, LEADERBOARD_MIN_SETTLED - ownSettled)} picks más para entrar`;

  return (
    <div className="pl-com-ranking">
      <div className="pl-com-toolbar">
        <div className="pl-com-seg" role="group" aria-label="Periodo">
          <button type="button" aria-pressed={window === "30d"} onClick={() => setWindow("30d")}>
            Últimos 30 días
          </button>
          <button type="button" aria-pressed={window === "season"} onClick={() => setWindow("season")}>
            Temporada
          </button>
        </div>
        <div className="pl-com-seg" role="group" aria-label="Ordenar por">
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

      {ranked.length === 0 ? (
        <p className="pl-prof-empty-line">Aún nadie llega a {LEADERBOARD_MIN_SETTLED} picks cerrados en este periodo.</p>
      ) : (
        <>
          <ol className="pl-com-podium" aria-label="Primeros tres lugares">
            {podium.map((r) => {
              const following = follows.isFollowing(r.handle);
              const isMe = own?.handle === r.handle;
              return (
                <li key={r.handle} className={`pl-com-podium-card glass-lens glass-ring ${r.rank === 1 ? "is-first glass-ring--featured" : ""}`} data-rank={r.rank}>
                  <span className="pl-com-podium-rank num">#{r.rank}</span>
                  <Avatar initials={r.avatarInitials} gradVar={r.avatarGradVar} size={r.rank === 1 ? 64 : 56} className="pl-com-podium-avatar" />
                  <p className="pl-com-podium-name">
                    <a href={`/app/u/${r.handle}`} onClick={goProfile(r.handle)}>
                      {r.name}
                    </a>
                    {r.isTipster ? <VerifiedSeal size={16} /> : null}
                  </p>
                  <p className="pl-com-podium-sub">{sub(r)}</p>
                  <p className={`pl-com-podium-units num ${r.record.netUnits >= 0 ? "pl-prof-pos" : "pl-prof-neg"}`}>
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
                    <button
                      type="button"
                      className={`pl-prof-btn pl-prof-btn--sm pl-com-podium-follow ${following ? "pl-prof-btn--ghost" : "pl-prof-btn--ghost"}`}
                      aria-pressed={following}
                      aria-label={`${following ? "Siguiendo" : "Seguir"} a ${r.name}`}
                      onClick={() => onToggleFollow(r.handle)}
                    >
                      {following ? "Siguiendo" : "Seguir"}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ol>

          <div className="pl-com-table-wrap glass-lens glass-ring">
            <table className="pl-com-table num">
              <caption className="sr-only">
                Ranking de Comunidad, {windowLabel}, ordenado por {sortLabel}, del 4.º lugar en adelante
              </caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Analista</th>
                  <th scope="col">Saldo</th>
                  <th scope="col">Cumplidos</th>
                  <th scope="col">Contra el cierre</th>
                  <th scope="col">Picks</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <tr key={r.handle} className={own?.handle === r.handle ? "is-me" : undefined}>
                    <td className="pl-prof-muted">{r.rank}</td>
                    <td>
                      <span className="pl-com-table-who">
                        <Avatar initials={r.avatarInitials} gradVar={r.avatarGradVar} size={32} />
                        <span>
                          <span className="pl-com-table-name">
                            <a href={`/app/u/${r.handle}`} onClick={goProfile(r.handle)}>
                              {r.name}
                            </a>
                            {r.isTipster ? <VerifiedSeal size={14} /> : null}
                          </span>
                          <span className="pl-com-table-sub">{sub(r)}</span>
                        </span>
                      </span>
                    </td>
                    <td className={r.record.netUnits >= 0 ? "pl-prof-pos pl-com-strong" : "pl-prof-neg pl-com-strong"}>
                      {formatUnits(r.record.netUnits)}
                    </td>
                    <td>{hit(r)}</td>
                    <td>{clv(r)}</td>
                    <td className="pl-prof-muted">{r.record.settled}</td>
                  </tr>
                ))}
                {own && !meInTop ? (
                  <tr className="is-me">
                    <td className="pl-com-strong">{me ? me.rank : "—"}</td>
                    <td>
                      <span className="pl-com-table-who">
                        <Avatar initials={own.avatarInitials} gradVar={own.avatarGradVar} size={32} />
                        <span>
                          <span className="pl-com-table-name">Tú</span>
                          <span className="pl-com-table-sub">{meNote}</span>
                        </span>
                      </span>
                    </td>
                    <td className="pl-com-strong">{me ? formatUnits(me.record.netUnits) : "—"}</td>
                    <td>{me ? hit(me) : "—"}</td>
                    <td>{me ? clv(me) : "—"}</td>
                    <td className="pl-prof-muted">{me ? me.record.settled : ownSettled}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <ol className="pl-com-mlist" aria-label="Del 4.º lugar en adelante">
            {tableRows.map((r) => (
              <li key={r.handle}>
                <span className="pl-com-top-rank num">{r.rank}</span>
                <Avatar initials={r.avatarInitials} gradVar={r.avatarGradVar} size={36} />
                <span className="pl-com-mlist-who">
                  <a href={`/app/u/${r.handle}`} onClick={goProfile(r.handle)}>
                    {r.name}
                  </a>
                  <span className="pl-prof-muted num">
                    {hit(r)} cumplidos · {r.record.settled} picks
                  </span>
                </span>
                <span className={`num pl-com-strong ${r.record.netUnits >= 0 ? "pl-prof-pos" : "pl-prof-neg"}`}>
                  {formatUnits(r.record.netUnits)}
                </span>
              </li>
            ))}
          </ol>
          {own && !meInTop ? (
            <div className="pl-com-mme glass-lens glass-ring num">
              <span className="pl-com-top-rank">{me ? me.rank : "—"}</span>
              <Avatar initials={own.avatarInitials} gradVar={own.avatarGradVar} size={36} />
              <span className="pl-com-mlist-who">
                <strong>Tú</strong>
                <span className="pl-prof-muted">{meNote}</span>
              </span>
              <span className="pl-com-strong">{me ? formatUnits(me.record.netUnits) : "—"}</span>
            </div>
          ) : null}
        </>
      )}
      <p className="pl-com-footnote">Mínimo {LEADERBOARD_MIN_SETTLED} picks cerrados.</p>
    </div>
  );
}
