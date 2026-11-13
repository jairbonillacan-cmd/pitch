"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { LeagueId, PublicMemberProfile } from "@pitchlab/contracts";
import { EditProfileDialog, XBrandMark, type EditableProfile } from "./EditProfileDialog";
import { LeagueBadge, TeamBadge } from "../../sports";
import { formatOddsValue } from "../access-guard";
import {
  exampleOpenEntries,
  generateExampleJournal,
  getExampleAnalystSpec,
} from "../community-examples";
import {
  ExampleNotice,
  MaestroIcon,
  TipstarVerifiedBadge,
  VerifiedSeal,
} from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { socialScopeKey, usePlatform } from "../platform-provider";
import {
  analystRank,
  calibrationBuckets,
  formatSignedPct,
  formatUnits,
  hitRateByLeague,
  monthLongLabel,
  monthlyNetUnits,
  pickSettlementUnits,
  profileRecord,
} from "../profile-stats";
import { TIPSTAR_CREATORS } from "../spacetime-catalog";
import type { JournalEntry, SocialPost } from "../types";
import {
  Avatar,
  ChevronRightIcon,
  CommentIcon,
  GiftIcon,
  HeartIcon,
  isOwnProfileHandle,
  PickStatus,
  ShareIcon,
  SocialReportDialog,
  SocialReportMenu,
  TabPanel,
  UnderlineTabs,
  outcomeOf,
  registeredBeforeLabel,
  resolveEntryGame,
  shareUrl,
  shortDate,
  useFollowing,
  useLeaderboardRows,
  useUrlTab,
  type EntryGameMeta,
  type SocialReportTarget,
  type TabDef,
} from "./community-ui";

type ProfileTab = "publicaciones" | "picks" | "parlays" | "estadisticas";

const PROFILE_TABS: readonly TabDef<ProfileTab>[] = [
  { key: "publicaciones", label: "Publicaciones", shortLabel: "Posts" },
  { key: "picks", label: "Picks" },
  { key: "parlays", label: "Parlays" },
  { key: "estadisticas", label: "Estadísticas", shortLabel: "Datos" },
];
const TAB_KEYS = PROFILE_TABS.map((t) => t.key);

const PAGE_FIRST = 5;
const PAGE_STEP = 20;
const STATS_MIN_SETTLED = 10;
const PARLAY_ORIGIN: JournalEntry["origin"] = "Parlay Combinado";

const LEAGUE_IDS_BY_LABEL: Record<string, LeagueId> = {
  NFL: "nfl" as LeagueId,
  "Liga MX": "liga-mx" as LeagueId,
  "Premier League": "premier-league" as LeagueId,
  Premier: "premier-league" as LeagueId,
  LaLiga: "laliga" as LeagueId,
};

interface ResolvedProfile {
  handle: string;
  name: string;
  isTipstar: boolean;
  specialty: string;
  bio: string | null;
  xUsername?: string | null;
  avatarUrl?: string | null;
  avatarInitials: string;
  avatarGradVar: string;
  joinedAt: string | null;
  followers: number | null;
  following: number | null;
  favoriteLeagues: readonly LeagueId[];
  isExample: boolean;
  promoCode?: string;
  freeDays?: number;
  weeklyPickSlug?: string;
  journal: JournalEntry[];
  postHandles: readonly string[];
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function joinedLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return `Se unió en ${monthLongLabel(d.getUTCMonth())} ${d.getUTCFullYear()}`;
}

function CalendarIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function LockIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function TeamPair({ meta, size = 30 }: { meta: EntryGameMeta; size?: number }): React.JSX.Element {
  return (
    <span className="pl-prof-teams" aria-hidden="true">
      <TeamBadge league={meta.league} slug={meta.home.slug} name={meta.home.name} size={size} decorative />
      <span className="pl-prof-teams-away">
        <TeamBadge league={meta.league} slug={meta.away.slug} name={meta.away.name} size={size} decorative />
      </span>
    </span>
  );
}

export function AnalystProfileClubView({
  handle,
  memberProfile,
  avatarEnabled = false,
  xEnabled = false,
  xLinkError = false,
}: {
  handle: string;
  memberProfile?: PublicMemberProfile | null;
  avatarEnabled?: boolean;
  xEnabled?: boolean;
  xLinkError?: boolean;
}): React.JSX.Element {
  const {
    dataset,
    journal,
    socialPosts,
    oddsFormat,
    viewerRole,
    favoriteLeagues,
    toggleSocialLike,
    pushToast,
    navigateTo,
    viewerIdentity,
    updateViewerIdentity,
    loadSocialPostsByAuthor,
  } = usePlatform();
  const [edited, setEdited] = useState<EditableProfile | null>(null);
  // Publicaciones del socio guardadas en el servidor (no solo las del feed reciente).
  const memberHandle = memberProfile?.handle ?? null;
  useEffect(() => {
    if (memberHandle) loadSocialPostsByAuthor(memberHandle);
  }, [memberHandle, loadSocialPostsByAuthor]);
  const { rows, own, today } = useLeaderboardRows();
  const cleanHandle = handle.replace(/^@/, "").trim().toLowerCase();

  const profile = useMemo<ResolvedProfile | null>(() => {
    if (memberProfile) {
      const details = edited ?? memberProfile;
      const ownIdentity = viewerIdentity?.handle === details.handle ? viewerIdentity : null;
      const initials = details.displayName.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
      return {
        handle: details.handle,
        name: details.displayName,
        isTipstar: memberProfile.isTipstar,
        specialty: "",
        bio: details.bio,
        xUsername: details.xUsername,
        avatarUrl:
          details.avatarUrl !== undefined
            ? details.avatarUrl
            : (ownIdentity?.avatarUrl ?? memberProfile.avatarUrl ?? null),
        avatarInitials: ownIdentity?.initials ?? initials,
        avatarGradVar: "var(--avatar-grad-3)",
        joinedAt: memberProfile.joinedAt,
        // Sin quien mira: la vista suma 1 si lo sigue (así seguir/dejar de seguir se ve al instante).
        followers:
          typeof memberProfile.followers === "number"
            ? Math.max(0, memberProfile.followers - (memberProfile.viewerFollows ? 1 : 0))
            : null,
        following: typeof memberProfile.following === "number" ? memberProfile.following : null,
        favoriteLeagues: ownIdentity ? favoriteLeagues : [],
        isExample: false,
        journal: ownIdentity ? journal : [],
        postHandles: [details.handle],
      };
    }
    const spec = getExampleAnalystSpec(cleanHandle);
    if (spec) {
      const creator = TIPSTAR_CREATORS.find((c) => c.handle === spec.handle);
      const closed = generateExampleJournal(spec, today);
      const open = exampleOpenEntries(spec, dataset.games, today);
      return {
        handle: spec.handle,
        name: spec.name,
        isTipstar: spec.isTipstar,
        specialty: spec.specialty,
        bio: spec.bio,
        avatarInitials: spec.avatarInitials,
        avatarGradVar: spec.avatarGradVar,
        joinedAt: spec.joinedAt,
        followers: spec.followers,
        following: spec.following,
        favoriteLeagues: spec.leagues.map((l) => l as LeagueId),
        isExample: true,
        promoCode: creator?.promoCode,
        freeDays: creator?.freeDays,
        weeklyPickSlug: creator?.weeklyPickSlug,
        journal: [...open, ...closed],
        postHandles: [spec.handle],
      };
    }
    const isOwnAlias = isOwnProfileHandle(cleanHandle, own, viewerIdentity !== null);
    if (own && isOwnAlias) {
      return {
        handle: own.handle,
        name: own.name,
        isTipstar: false,
        specialty: "Varias ligas",
        bio: "Socio de PitchLab. Registro mis picks antes de que empiece el partido.",
        avatarUrl: own.avatarUrl ?? null,
        avatarInitials: own.avatarInitials,
        avatarGradVar: own.avatarGradVar,
        joinedAt: null,
        followers: null,
        following: null,
        favoriteLeagues,
        isExample: false,
        journal: [...journal],
        postHandles: viewerIdentity ? [own.handle] : [own.handle, "jair_founder"],
      };
    }
    return null;
  }, [cleanHandle, dataset.games, edited, favoriteLeagues, journal, memberProfile, own, today, viewerIdentity]);

  const saveProfile = (updated: EditableProfile) => {
    const previousHandle = viewerIdentity?.handle;
    setEdited(updated);
    const avatarChanged =
      updated.avatarUrl !== undefined && (viewerIdentity?.avatarUrl ?? null) !== (updated.avatarUrl ?? null);
    if (
      viewerIdentity?.displayName !== updated.displayName ||
      previousHandle !== updated.handle ||
      avatarChanged
    ) {
      updateViewerIdentity(updated);
    }
    if (previousHandle && previousHandle !== updated.handle) {
      // Next.js toma `history.replaceState` como cambio de ruta y vuelve a montar la vista con
      // los datos viejos del servidor; se carga la dirección nueva para traer el perfil guardado.
      // `replace` evita que «atrás» lleve al usuario anterior, que ya no existe.
      const url = new URL(window.location.href);
      url.pathname = `/app/u/${updated.handle}`;
      window.location.replace(url);
    }
  };

  const isOwn =
    profile !== null &&
    (viewerIdentity
      ? profile.handle === viewerIdentity.handle
      : profile.handle === own?.handle || isOwnProfileHandle(cleanHandle, own, false));

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath={`/app/u/${profile?.handle ?? cleanHandle}`}>
        {profile ? (
          <ProfileContent
            profile={profile}
            isOwn={isOwn}
            ownHandle={own?.handle ?? null}
            onEdit={isOwn && memberProfile ? saveProfile : undefined}
            avatarEnabled={avatarEnabled}
            xEnabled={xEnabled}
            xLinkError={isOwn && xLinkError}
            rows={rows}
            today={today}
            dataset={dataset}
            socialPosts={socialPosts}
            oddsFormat={oddsFormat}
            isVisitor={viewerRole === "visitor"}
            toggleSocialLike={toggleSocialLike}
            pushToast={pushToast}
            navigateTo={navigateTo}
          />
        ) : (
          <section className="pl-prof pl-prof-missing glass-lens glass-ring" aria-labelledby="pl-prof-missing-title">
            <h1 id="pl-prof-missing-title" className="pl-prof-missing-title">
              Este perfil aún no es público
            </h1>
            <p className="pl-prof-missing-copy">
              @{cleanHandle} todavía no comparte su récord. Mientras tanto, mira el ranking de Comunidad.
            </p>
            <a
              href="/app/social?tab=ranking"
              className="pl-prof-btn pl-prof-btn--ghost"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/app/social?tab=ranking");
              }}
            >
              Ver ranking
            </a>
          </section>
        )}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

function ProfileContent({
  profile,
  isOwn,
  ownHandle,
  onEdit,
  avatarEnabled,
  xEnabled,
  xLinkError,
  rows,
  today,
  dataset,
  socialPosts,
  oddsFormat,
  isVisitor,
  toggleSocialLike,
  pushToast,
  navigateTo,
}: {
  profile: ResolvedProfile;
  isOwn: boolean;
  ownHandle: string | null;
  onEdit?: (profile: EditableProfile) => void;
  avatarEnabled: boolean;
  xEnabled: boolean;
  xLinkError: boolean;
  rows: ReturnType<typeof useLeaderboardRows>["rows"];
  today: Date;
  dataset: ReturnType<typeof usePlatform>["dataset"];
  socialPosts: readonly SocialPost[];
  oddsFormat: ReturnType<typeof usePlatform>["oddsFormat"];
  isVisitor: boolean;
  toggleSocialLike: (postId: string) => void;
  pushToast: ReturnType<typeof usePlatform>["pushToast"];
  navigateTo: (path: string) => void;
}): React.JSX.Element {
  const [tab, setTab] = useUrlTab<ProfileTab>(TAB_KEYS, "picks");
  const follows = useFollowing();
  const following = follows.isFollowing(profile.handle);

  const record = useMemo(() => profileRecord(profile.journal), [profile.journal]);
  const rank = useMemo(() => analystRank(profile.handle, rows, today), [profile.handle, rows, today]);
  const monthName = capitalize(monthLongLabel(today.getMonth()));
  const joined = joinedLabel(profile.joinedAt);

  const singlePicks = useMemo(
    () => profile.journal.filter((j) => j.origin !== PARLAY_ORIGIN),
    [profile.journal],
  );
  const parlays = useMemo(
    () => profile.journal.filter((j) => j.origin === PARLAY_ORIGIN),
    [profile.journal],
  );
  const posts = useMemo(
    () => socialPosts.filter((p) => profile.postHandles.includes(p.authorHandle)),
    [profile.postHandles, socialPosts],
  );

  const weeklyPickMatch = useMemo(() => {
    if (!profile.isTipstar) return null;
    const pickId = dataset.tipstarWeeklyPickId;
    for (const game of dataset.games) {
      if (game.picks.some((p) => p.id === pickId)) return `${game.home.shortName || game.home.name} vs ${game.away.shortName || game.away.name}`;
    }
    return null;
  }, [dataset.games, dataset.tipstarWeeklyPickId, profile.isTipstar]);

  const followerCount =
    profile.followers === null ? null : profile.followers + (following ? 1 : 0);

  const go = (path: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigateTo(path);
  };

  const onShare = (): void => {
    void shareUrl(
      `/app/u/${profile.handle}`,
      `${profile.name} en PitchLab`,
      () => pushToast("Copiamos el enlace del perfil.", "success"),
      () => pushToast("No pudimos compartir el perfil.", "warning"),
    );
  };

  const hasSettled = record.settled > 0;
  const netClass =
    record.netUnits > 0 ? "pl-prof-pos" : record.netUnits < 0 ? "pl-prof-neg" : "";

  return (
    <div className="pl-prof">
      {profile.isExample ? (
        <>
          <ExampleNotice className="pl-prof-example">
            @{profile.handle} es un perfil de ejemplo: su récord y publicaciones muestran cómo se verá un
            perfil {profile.isTipstar ? "verificado" : "de socio"}.
          </ExampleNotice>
          <p className="pl-prof-example-line">
            <span className="pl-pill pl-pill--warning">Ejemplo</span> Perfil de ejemplo
          </p>
        </>
      ) : null}

      {/* Encabezado */}
      <section className="pl-prof-head glass-lens glass-ring" aria-labelledby="pl-prof-name">
        <div className="pl-prof-cover" aria-hidden="true" />
        <div className="pl-prof-head-body">
          <div className="pl-prof-head-top">
            <Avatar
              initials={profile.avatarInitials}
              avatarUrl={profile.avatarUrl}
              gradVar={profile.avatarGradVar}
              size={96}
              className="pl-prof-avatar"
            />
            <div className="pl-prof-actions">
              <button
                type="button"
                className="pl-prof-btn pl-prof-btn--ghost pl-prof-btn--icon"
                aria-label="Compartir perfil"
                onClick={onShare}
              >
                <ShareIcon />
              </button>
              {isOwn ? (
                <>
                  <a href="/app/account" className="pl-prof-btn pl-prof-btn--ghost" onClick={go("/app/account")}>
                    <LockIcon />
                    Perfil público
                  </a>
                  {onEdit ? (
                    <EditProfileDialog
                      profile={{
                        displayName: profile.name,
                        handle: profile.handle,
                        bio: profile.bio,
                        xUsername: profile.xUsername ?? null,
                        avatarUrl: profile.avatarUrl ?? null,
                      }}
                      onChange={onEdit}
                      avatarEnabled={avatarEnabled}
                      xEnabled={xEnabled}
                    />
                  ) : (
                    <a href="/app/account" className="pl-prof-btn pl-prof-btn--primary" onClick={go("/app/account")}>
                      Editar perfil
                    </a>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  className={`pl-prof-btn pl-prof-follow ${following ? "pl-prof-btn--ghost" : "pl-prof-btn--primary"}`}
                  aria-pressed={following}
                  onClick={() => {
                    const now = follows.toggle(profile.handle);
                    pushToast(
                      now ? `Ahora sigues a @${profile.handle}.` : `Dejaste de seguir a @${profile.handle}.`,
                      "default",
                    );
                  }}
                >
                  {following ? "Siguiendo" : "Seguir"}
                </button>
              )}
            </div>
          </div>

          <div className="pl-prof-name-row">
            <h1 id="pl-prof-name" className="pl-prof-name">
              {profile.name}
              {profile.isTipstar ? <VerifiedSeal size={22} className="pl-prof-seal" /> : null}
            </h1>
            {profile.isTipstar ? <TipstarVerifiedBadge /> : <span className="pl-prof-role">Socio</span>}
          </div>
          <p className="pl-prof-handle">
            @{profile.handle}{profile.specialty ? ` · ${profile.specialty}` : ""}
          </p>
          {profile.bio ? <p className="pl-prof-bio">{profile.bio}</p> : null}
          {profile.xUsername ? (
            <a
              className="pl-profile-x-link"
              href={`https://x.com/${encodeURIComponent(profile.xUsername)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`@${profile.xUsername} en X, abre en otra pestaña`}
            >
              <XBrandMark />
              @{profile.xUsername}
            </a>
          ) : null}
          {xLinkError ? <p className="pl-profile-editor-error" role="status">No se pudo conectar X. Intenta de nuevo.</p> : null}
          <div className="pl-prof-meta num">
            {followerCount !== null ? (
              <span>
                <strong>{followerCount}</strong> {followerCount === 1 ? "seguidor" : "seguidores"}
              </span>
            ) : null}
            {profile.following !== null ? (
              <span>
                <strong>{profile.following}</strong> siguiendo
              </span>
            ) : null}
            {joined ? (
              <span className="pl-prof-meta-icon">
                <CalendarIcon />
                {joined}
              </span>
            ) : null}
            {profile.favoriteLeagues.length > 0 ? (
              <span className="pl-prof-leagues">
                <span className="sr-only">Ligas favoritas:</span>
                {profile.favoriteLeagues.slice(0, 3).map((lg) => (
                  <LeagueBadge key={lg} league={lg} size={20} />
                ))}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {/* Récord */}
      <section aria-label="Récord">
        {hasSettled ? (
          <>
            <dl className="pl-prof-record glass-lens glass-ring num">
              <div className="pl-prof-stat">
                <dt>Saldo</dt>
                <dd className={netClass}>{formatUnits(record.netUnits)}</dd>
                <dd className="pl-prof-sub">{record.settled} picks cerrados</dd>
              </div>
              <div className="pl-prof-stat">
                <dt>Cumplidos</dt>
                <dd>
                  <span className="pl-prof-stat-long">
                    {record.won} <span className="pl-prof-stat-of">de {record.settled}</span>
                  </span>
                  <span className="pl-prof-stat-short">{Math.round(record.hitRatePct ?? 0)} %</span>
                </dd>
                <dd className="pl-prof-sub">{Math.round(record.hitRatePct ?? 0)} % de acierto</dd>
              </div>
              <div className="pl-prof-stat">
                <dt>
                  <span className="pl-prof-stat-long">Ventaja contra el cierre</span>
                  <span className="pl-prof-stat-short">Contra el cierre</span>
                </dt>
                <dd>{record.avgClvPct === null ? "—" : formatSignedPct(record.avgClvPct)}</dd>
                <dd className="pl-prof-sub">Tomó mejor momio que el de cierre</dd>
              </div>
              <div className="pl-prof-stat pl-prof-stat--rank">
                <dt>Puesto en Comunidad</dt>
                <dd>{rank ? `#${rank.rank}` : "—"}</dd>
                <dd className="pl-prof-sub">
                  {rank ? (
                    <a href="/app/social?tab=ranking" className="pl-prof-link" onClick={go("/app/social?tab=ranking")}>
                      {monthName} · ver tabla
                    </a>
                  ) : (
                    "Aún no aparece"
                  )}
                </dd>
              </div>
            </dl>
            <a
              href="/app/social?tab=ranking"
              className="pl-prof-rank-row glass-card glass-ring num"
              onClick={go("/app/social?tab=ranking")}
            >
              <span>
                {rank ? (
                  <>
                    <strong>#{rank.rank} en Comunidad</strong> · {monthName}
                  </>
                ) : (
                  <strong>Aún no aparece en Comunidad</strong>
                )}{" "}
                · {record.won} de {record.settled}
              </span>
              <ChevronRightIcon size={16} />
            </a>
          </>
        ) : (
          <div className="pl-prof-empty glass-lens glass-ring">
            <p className="pl-prof-empty-title">Sin picks cerrados todavía</p>
            {isOwn ? (
              <a href="/app" className="pl-prof-btn pl-prof-btn--primary" onClick={go("/app")}>
                Registra tu primer pick
              </a>
            ) : null}
          </div>
        )}
      </section>

      {/* Tipstar: pick gratis de la semana */}
      {profile.isTipstar && profile.weeklyPickSlug ? (
        <a
          href={`/p/${profile.weeklyPickSlug}`}
          className="pl-prof-weekly glass-lens glass-ring"
          onClick={go(`/p/${profile.weeklyPickSlug}`)}
        >
          <span className="pl-prof-weekly-icon" aria-hidden="true">
            <GiftIcon />
          </span>
          <span className="pl-prof-weekly-copy">
            <strong>Pick gratis de la semana</strong>
            <span>
              {weeklyPickMatch ? `${weeklyPickMatch} · ` : ""}con el código{" "}
              <strong className="pl-prof-strong">{profile.promoCode}</strong> tienes {profile.freeDays ?? 5} días
              gratis
            </span>
          </span>
          <ChevronRightIcon />
        </a>
      ) : null}

      <UnderlineTabs
        tabs={PROFILE_TABS}
        active={tab}
        onChange={setTab}
        label="Contenido del perfil"
        idPrefix="pl-prof"
        className="pl-prof-tabs"
      />

      <TabPanel tabKey={tab} idPrefix="pl-prof">
        {tab === "publicaciones" ? (
          <PostsPanel
            posts={posts}
            authorHandle={profile.isExample ? undefined : profile.handle}
            dataset={dataset}
            oddsFormat={oddsFormat}
            toggleSocialLike={toggleSocialLike}
            canReport={!isVisitor}
            ownHandle={ownHandle}
          />
        ) : null}
        {tab === "picks" ? (
          <PicksPanel
            entries={singlePicks}
            dataset={dataset}
            oddsFormat={oddsFormat}
            isVisitor={isVisitor}
            navigateTo={navigateTo}
          />
        ) : null}
        {tab === "parlays" ? <ParlaysPanel entries={parlays} /> : null}
        {tab === "estadisticas" ? <StatsPanel entries={profile.journal} today={today} /> : null}
      </TabPanel>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Publicaciones
   ------------------------------------------------------------------------- */

const PROFILE_POSTS_PAGE = 20;

function PostsPanel({
  posts,
  authorHandle,
  dataset,
  oddsFormat,
  toggleSocialLike,
  canReport,
  ownHandle,
}: {
  posts: readonly SocialPost[];
  authorHandle?: string;
  dataset: ReturnType<typeof usePlatform>["dataset"];
  oddsFormat: ReturnType<typeof usePlatform>["oddsFormat"];
  toggleSocialLike: (postId: string) => void;
  canReport: boolean;
  ownHandle: string | null;
}): React.JSX.Element {
  const { socialFeedPages, loadOlderSocialPosts } = usePlatform();
  const [limit, setLimit] = useState(PROFILE_POSTS_PAGE);
  const [openComments, setOpenComments] = useState<string[]>([]);
  const [reportTarget, setReportTarget] = useState<SocialReportTarget | null>(null);

  useEffect(() => {
    setLimit(PROFILE_POSTS_PAGE);
  }, [authorHandle]);

  const scope = useMemo(() => (authorHandle ? { author: authorHandle } : undefined), [authorHandle]);
  const pageState = scope ? socialFeedPages[socialScopeKey(scope)] : undefined;
  const hasMoreServer = Boolean(pageState?.hasMore);
  const loadingOlder = Boolean(pageState?.loading);

  const realPosts = useMemo(() => posts.filter((p) => !p.isExample), [posts]);
  const examplePosts = useMemo(() => posts.filter((p) => p.isExample), [posts]);
  const displayPool = useMemo(
    () => (hasMoreServer ? realPosts : [...realPosts, ...examplePosts]),
    [hasMoreServer, realPosts, examplePosts],
  );

  if (displayPool.length === 0 && !hasMoreServer && !loadingOlder) {
    return <p className="pl-prof-empty-line">Todavía no hay publicaciones.</p>;
  }

  const canShowMore = displayPool.length > limit || hasMoreServer || loadingOlder;
  const onShowMore = (): void => {
    if (loadingOlder) return;
    const nextLimit = limit + PROFILE_POSTS_PAGE;
    setLimit(nextLimit);
    if (scope && hasMoreServer && nextLimit >= realPosts.length) {
      void loadOlderSocialPosts(scope);
    }
  };

  return (
    <div className="pl-prof-posts">
      {displayPool.slice(0, limit).map((post) => {
        const meta = post.pick ? resolveEntryGame(post.pick.gameId, dataset) : null;
        const commentsOpen = openComments.includes(post.id);
        const isPostMine = Boolean(post.isMine || (ownHandle && post.authorHandle === ownHandle));
        const showPostReport = canReport && !isPostMine && !post.isExample;
        return (
          <article key={post.id} className="pl-prof-post glass-lens glass-ring">
            <div className="pl-prof-post-meta">
              <span className="pl-prof-post-league">
                {meta ? <LeagueBadge league={meta.league} size={16} /> : null}
                {post.leagueLabel}
              </span>
              <span className="pl-com-meta-end">
                <span>{post.createdAt}</span>
                {showPostReport ? (
                  <SocialReportMenu
                    compact
                    triggerLabel={`Más opciones de la publicación de @${post.authorHandle}`}
                    onReport={() =>
                      setReportTarget({
                        kind: "post",
                        postId: post.id,
                        authorHandle: post.authorHandle,
                      })
                    }
                  />
                ) : null}
              </span>
            </div>
            <p className="pl-prof-post-body">{post.body}</p>
            {post.pick ? (
              <div className="pl-prof-post-pick glass-card glass-ring">
                {meta ? <TeamPair meta={meta} size={28} /> : null}
                <div className="pl-prof-post-pick-copy">
                  <p className="pl-prof-row-title">
                    {post.pick.label} · <span className="num">{post.pick.units.toFixed(1)}u</span>
                  </p>
                  <p className="pl-prof-row-sub num">
                    Su momio {formatOddsValue(post.pick.userDecimal, oddsFormat)} · momio justo{" "}
                    {formatOddsValue(post.pick.fairDecimal, oddsFormat)}
                  </p>
                </div>
                <PickStatus status={post.pick.status} />
              </div>
            ) : null}
            <div className="pl-prof-post-actions num">
              <button
                type="button"
                className="pl-prof-chip"
                aria-pressed={Boolean(post.likedByMe)}
                aria-label={`Me gusta, ${post.likes}`}
                onClick={() => toggleSocialLike(post.id)}
              >
                <HeartIcon filled={Boolean(post.likedByMe)} size={14} />
                {post.likes}
              </button>
              <button
                type="button"
                className="pl-prof-chip"
                aria-expanded={commentsOpen}
                onClick={() =>
                  setOpenComments((prev) =>
                    prev.includes(post.id) ? prev.filter((id) => id !== post.id) : [...prev, post.id],
                  )
                }
              >
                <CommentIcon size={14} />
                {post.comments.length} {post.comments.length === 1 ? "comentario" : "comentarios"}
              </button>
            </div>
            {commentsOpen && post.comments.length > 0 ? (
              <ul className="pl-prof-comments">
                {post.comments.map((c) => {
                  const isCommentMine = Boolean(c.isMine || (ownHandle && c.authorHandle === ownHandle));
                  const showCommentReport = canReport && !isCommentMine && !post.isExample;
                  return (
                    <li key={c.id} className="pl-com-comment-row">
                      <Avatar
                        initials={c.authorName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                        avatarUrl={c.authorAvatarUrl}
                        gradVar={getExampleAnalystSpec(c.authorHandle)?.avatarGradVar ?? "var(--avatar-grad-3)"}
                        size={26}
                        loading="lazy"
                      />
                      <div className="pl-com-comment-body">
                        <div className="pl-com-comment-head">
                          <span>
                            <strong>{c.authorName}</strong> <span className="pl-prof-muted">· {c.createdAt}</span>
                          </span>
                          {showCommentReport ? (
                            <SocialReportMenu
                              compact
                              triggerLabel={`Más opciones del comentario de ${c.authorName}`}
                              onReport={() =>
                                setReportTarget({
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
          </article>
        );
      })}
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
      <SocialReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Picks
   ------------------------------------------------------------------------- */

type StatusFilter = "all" | "open" | "closed";

function PicksPanel({
  entries,
  dataset,
  oddsFormat,
  isVisitor,
  navigateTo,
}: {
  entries: readonly JournalEntry[];
  dataset: ReturnType<typeof usePlatform>["dataset"];
  oddsFormat: ReturnType<typeof usePlatform>["oddsFormat"];
  isVisitor: boolean;
  navigateTo: (path: string) => void;
}): React.JSX.Element {
  const { hasAccountSession, upgradeHref } = usePlatform();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [league, setLeague] = useState<string>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openLimit, setOpenLimit] = useState(PAGE_FIRST);
  const [closedLimit, setClosedLimit] = useState(PAGE_FIRST);

  const leagues = useMemo(
    () => [...new Set(entries.map((e) => e.leagueLabel))].sort(),
    [entries],
  );
  const byLeague = useMemo(
    () => (league === "all" ? entries : entries.filter((e) => e.leagueLabel === league)),
    [entries, league],
  );
  const open = useMemo(() => byLeague.filter((e) => e.status === "pending"), [byLeague]);
  const closed = useMemo(() => byLeague.filter((e) => e.status !== "pending"), [byLeague]);
  const openTotal = entries.filter((e) => e.status === "pending").length;
  const closedTotal = entries.length - openTotal;

  if (entries.length === 0) {
    return <p className="pl-prof-empty-line">Todavía no hay picks registrados.</p>;
  }

  const filters = (
    <div className={`pl-prof-filters ${filtersOpen ? "is-open" : ""}`} id="pl-prof-filters">
      {(
        [
          ["all", "Todos"],
          ["open", `Abiertos · ${openTotal}`],
          ["closed", `Cerrados · ${closedTotal}`],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          className="pl-prof-chip num"
          aria-pressed={status === key}
          onClick={() => {
            setStatus(key);
            setOpenLimit(PAGE_FIRST);
            setClosedLimit(PAGE_FIRST);
          }}
        >
          {label}
        </button>
      ))}
      <span className="pl-prof-filter-sep" aria-hidden="true" />
      <label className="pl-prof-select">
        <span className="sr-only">Liga</span>
        <select value={league} onChange={(e) => setLeague(e.target.value)}>
          <option value="all">Todas las ligas</option>
          {leagues.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  const renderRow = (entry: JournalEntry): React.JSX.Element => {
    const meta = resolveEntryGame(entry.gameId, dataset);
    const outcome = outcomeOf(entry.status);
    const locked = isVisitor && outcome === "open";
    const units = pickSettlementUnits(entry);
    const scoreLabel =
      meta && meta.score && outcome !== "open"
        ? `${meta.home.name} ${meta.score.home}–${meta.score.away} ${meta.away.name}`
        : entry.matchLabel;
    const when = outcome === "open" ? registeredBeforeLabel(entry, meta?.kickoffIso) : shortDate(meta?.kickoffIso ?? entry.sealedAtIso);
    const leagueShort = meta?.leagueLabel === "Premier League" ? "Premier" : (meta?.leagueLabel ?? entry.leagueLabel);
    return (
      <li key={entry.id} className={`pl-prof-row ${locked ? "is-locked" : ""}`}>
        <div className="pl-prof-row-main">
          {meta ? <TeamPair meta={meta} /> : null}
          {meta ? (
            <span className="pl-prof-row-league" aria-hidden="true">
              <LeagueBadge league={meta.league} size={22} />
            </span>
          ) : null}
          <div className="pl-prof-row-copy">
            {locked ? (
              <p className="pl-prof-row-title pl-prof-locked">Disponible para socios</p>
            ) : (
              <p className="pl-prof-row-title">{entry.pickLabel}</p>
            )}
            <p className="pl-prof-row-sub">
              {[leagueShort, scoreLabel, when].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        {locked ? (
          <a
            href={upgradeHref}
            className="pl-prof-btn pl-prof-btn--primary pl-prof-btn--sm"
            onClick={(e) => {
              e.preventDefault();
              navigateTo(upgradeHref);
            }}
          >
            {hasAccountSession ? "Activar Pase" : "Desbloquear"}
          </a>
        ) : (
          <>
            <div className="pl-prof-row-odds num">
              <p>
                {formatOddsValue(entry.userDecimal, oddsFormat)}{" "}
                <span className="pl-prof-muted">vs justo {formatOddsValue(entry.fairDecimal, oddsFormat)}</span>
              </p>
              <p className={units === null ? "pl-prof-muted" : units > 0 ? "pl-prof-pos" : "pl-prof-neg"}>
                {units === null ? `${entry.units.toFixed(1)}u` : formatUnits(units)}
              </p>
            </div>
            <PickStatus status={outcome} />
          </>
        )}
      </li>
    );
  };

  const section = (
    id: string,
    title: string,
    list: readonly JournalEntry[],
    limit: number,
    setLimit: (n: number) => void,
  ): React.JSX.Element | null => {
    if (list.length === 0) return null;
    return (
      <section aria-labelledby={id} className="pl-prof-section">
        <h2 id={id} className="pl-prof-eyebrow">
          {title}
        </h2>
        <ul className="pl-prof-rows glass-lens glass-ring">{list.slice(0, limit).map(renderRow)}</ul>
        {list.length > limit ? (
          <div className="pl-prof-more">
            <button
              type="button"
              className="pl-prof-btn pl-prof-btn--ghost"
              onClick={() => setLimit(limit === PAGE_FIRST ? PAGE_STEP : limit + PAGE_STEP)}
            >
              {limit === PAGE_FIRST ? `Ver los ${list.length} picks` : "Ver más"}
            </button>
          </div>
        ) : null}
      </section>
    );
  };

  return (
    <div className="pl-prof-picks">
      <div className="pl-prof-filter-bar">
        <button
          type="button"
          className="pl-prof-chip pl-prof-filter-toggle"
          aria-expanded={filtersOpen}
          aria-controls="pl-prof-filters"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <MaestroIcon name="sliders" size={14} />
          Filtrar
        </button>
        {filters}
      </div>
      {status !== "closed" ? section("pl-prof-open", "Abiertos", open, openLimit, setOpenLimit) : null}
      {status !== "open" ? section("pl-prof-closed", "Cerrados", closed, closedLimit, setClosedLimit) : null}
      {(status === "open" ? open : status === "closed" ? closed : byLeague).length === 0 ? (
        <p className="pl-prof-empty-line">No hay picks con este filtro.</p>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Parlays
   ------------------------------------------------------------------------- */

function splitLegs(label: string): Array<{ label: string; league: string | null }> {
  const parts = label.split(" + ").map((p) => p.trim()).filter(Boolean);
  return parts.map((part) => {
    const idx = part.lastIndexOf(" · ");
    if (idx < 0) return { label: part, league: null };
    return { label: part.slice(0, idx), league: part.slice(idx + 3) };
  });
}

function ParlaysPanel({ entries }: { entries: readonly JournalEntry[] }): React.JSX.Element {
  if (entries.length === 0) {
    return <p className="pl-prof-empty-line">Todavía no hay parlays registrados.</p>;
  }
  return (
    <div className="pl-prof-parlays">
      {entries.map((entry) => {
        const legs = splitLegs(entry.pickLabel);
        const outcome = outcomeOf(entry.status);
        const units = pickSettlementUnits(entry);
        const combined = (1 / Math.max(1.0001, entry.fairDecimal)) * 100;
        return (
          <article key={entry.id} className="pl-prof-parlay glass-lens glass-ring">
            <div className="pl-prof-parlay-head">
              <p className="pl-prof-row-title num">
                Parlay de {legs.length} · {entry.units.toFixed(1)}u
              </p>
              <PickStatus status={outcome} />
            </div>
            <ol className="pl-prof-legs">
              {legs.map((leg, i) => (
                <li key={`${leg.label}-${i}`}>
                  <span>
                    {leg.label}
                    {leg.league ? <span className="pl-prof-muted"> · {leg.league}</span> : null}
                  </span>
                  {outcome === "won" ? (
                    <span className="pl-prof-pos" aria-label="Cumplida">
                      ✓
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
            <div className="pl-prof-parlay-foot num">
              <span>
                Probabilidad combinada <strong>{combined.toFixed(1)} %</strong>
              </span>
              {units !== null ? (
                <strong className={units > 0 ? "pl-prof-pos" : "pl-prof-neg"}>{formatUnits(units)}</strong>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Estadísticas
   ------------------------------------------------------------------------- */

function StatsPanel({ entries, today }: { entries: readonly JournalEntry[]; today: Date }): React.JSX.Element {
  const settled = entries.filter((e) => e.status !== "pending").length;
  const months = useMemo(() => monthlyNetUnits(entries, 6, today), [entries, today]);
  const leagues = useMemo(
    () => hitRateByLeague(entries.filter((e) => e.origin !== PARLAY_ORIGIN)),
    [entries],
  );
  const calib = useMemo(
    () => calibrationBuckets(entries.filter((e) => e.origin !== PARLAY_ORIGIN)),
    [entries],
  );

  if (settled < STATS_MIN_SETTLED) {
    return <p className="pl-prof-empty-line">Las estadísticas aparecen con 10 picks cerrados.</p>;
  }

  const total = months.reduce((s, m) => s + m.net, 0);
  const maxAbs = Math.max(0.1, ...months.map((m) => Math.abs(m.net)));
  const posMax = Math.max(0, ...months.map((m) => m.net));
  const negMax = Math.max(0, ...months.map((m) => -m.net));
  const posArea = 132;
  const negArea = negMax > 0 ? Math.max(32, Math.round((negMax / maxAbs) * posArea)) : 24;

  return (
    <div className="pl-prof-stats">
      <section className="pl-prof-card glass-lens glass-ring" aria-labelledby="pl-prof-stat-month">
        <div className="pl-prof-card-head">
          <h2 id="pl-prof-stat-month" className="pl-prof-card-title">
            Saldo por mes
          </h2>
          <p className="pl-prof-card-meta num">
            Últimos 6 meses ·{" "}
            <strong className={total >= 0 ? "pl-prof-pos" : "pl-prof-neg"}>{formatUnits(total)}</strong>
          </p>
        </div>
        <div className="pl-prof-bars" aria-hidden="true">
          {months.map((m) => {
            const posH = m.net > 0 ? Math.max(3, Math.round((m.net / maxAbs) * (posArea - 22))) : 0;
            const negH = m.net < 0 ? Math.max(3, Math.round((-m.net / maxAbs) * (posArea - 22))) : 0;
            return (
              <div key={m.month} className="pl-prof-bar" title={`${m.label}: ${formatUnits(m.net)}`}>
                <div className="pl-prof-bar-pos" style={{ height: posArea }}>
                  {m.net > 0 ? <span className="pl-prof-bar-label num">{formatUnits(m.net)}</span> : null}
                  <div className="pl-prof-bar-fill pl-prof-bar-fill--pos" style={{ height: posH }} />
                </div>
                <div className="pl-prof-bar-base" />
                <div className="pl-prof-bar-neg" style={{ height: posMax === 0 && negMax === 0 ? 24 : negArea }}>
                  <div className="pl-prof-bar-fill pl-prof-bar-fill--neg" style={{ height: negH }} />
                  {m.net < 0 ? <span className="pl-prof-bar-label num">{formatUnits(m.net)}</span> : null}
                  {m.net === 0 ? <span className="pl-prof-bar-label pl-prof-muted num">0.0u</span> : null}
                </div>
                <span className="pl-prof-bar-month">{m.label}</span>
              </div>
            );
          })}
        </div>
        <table className="sr-only">
          <caption>Saldo por mes, últimos 6 meses</caption>
          <thead>
            <tr>
              <th scope="col">Mes</th>
              <th scope="col">Saldo</th>
              <th scope="col">Picks cerrados</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <th scope="row">{m.label}</th>
                <td>{formatUnits(m.net)}</td>
                <td>{m.settled}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="pl-prof-two">
        <section className="pl-prof-card glass-lens glass-ring" aria-labelledby="pl-prof-stat-league">
          <h2 id="pl-prof-stat-league" className="pl-prof-card-title">
            Cumplidos por liga
          </h2>
          <ul className="pl-prof-hbars">
            {leagues.map((l) => {
              const id = LEAGUE_IDS_BY_LABEL[l.leagueLabel];
              return (
                <li key={l.leagueLabel}>
                  <div className="pl-prof-hbar-head num">
                    <span className="pl-prof-hbar-name">
                      {id ? <LeagueBadge league={id} size={18} /> : null}
                      {l.leagueLabel}
                    </span>
                    <span>
                      <strong>{l.pct} %</strong>{" "}
                      <span className="pl-prof-muted">
                        · {l.won} de {l.settled}
                      </span>
                    </span>
                  </div>
                  <div className="pl-prof-track" aria-hidden="true">
                    <div className="pl-prof-track-fill" style={{ width: `${l.pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="pl-prof-card glass-lens glass-ring" aria-labelledby="pl-prof-stat-calib">
          <h2 id="pl-prof-stat-calib" className="pl-prof-card-title">
            Cuando dijo X %, ¿se cumplió?
          </h2>
          <p className="pl-prof-card-meta">Probabilidad del pick contra lo que pasó.</p>
          {calib.length === 0 ? (
            <p className="pl-prof-empty-line">Aún no hay 5 picks cerrados en ningún rango.</p>
          ) : (
            <ul className="pl-prof-hbars">
              {calib.map((c) => (
                <li key={c.range}>
                  <div className="pl-prof-hbar-head num">
                    <span className="pl-prof-hbar-name">Picks de {c.range}</span>
                    <span>
                      <strong>{c.realPct} %</strong>{" "}
                      <span className="pl-prof-muted">
                        · {c.won} de {c.settled}
                      </span>
                    </span>
                  </div>
                  <div className="pl-prof-track pl-prof-track--calib" aria-hidden="true">
                    <div className="pl-prof-track-fill" style={{ width: `${c.realPct}%` }} />
                    <div className="pl-prof-track-mark" style={{ left: `${c.expectedMidPct}%` }} title="Esperado" />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="pl-prof-card-note">La raya marca lo esperado (punto medio del rango).</p>
        </section>
      </div>
    </div>
  );
}
