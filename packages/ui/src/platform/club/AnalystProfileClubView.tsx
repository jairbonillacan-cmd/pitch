"use client";

import React, { useId, useMemo, useState } from "react";
import type { LeagueId, PublicMemberProfile } from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreKpiStrip,
  SofascoreTable,
  type SofascoreKpiItem,
  type SofascoreTableColumn,
} from "../../components/ui/primitives";
import { LeagueBadge, TeamBadge } from "../../sports";
import { formatOddsValue } from "../access-guard";
import {
  badgeFactsFromEntries,
  computeBadges,
  publicBadges as publicBadgeList,
  type BadgeView,
} from "../badges";
import {
  exampleOpenEntries,
  generateExampleJournal,
  getExampleAnalystSpec,
} from "../community-examples";
import { BadgePickerDialog } from "../components/BadgePickerDialog";
import {
  MaestroIcon,
  TipsterVerifiedBadge,
} from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { useAbortableJson, useSafeEffect } from "../hooks";
import {
  socialScopeKey,
  useJournalEntries,
  usePlatformActions,
  usePlatformCore,
  useSocialState,
} from "../platform-provider";
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
import {
  DEFAULT_RECORD_PRIVACY,
  type PublicRecordPayload,
  type PublicRecordView,
} from "../record-stats";
import { TIPSTER_CREATORS } from "../spacetime-catalog";
import type { JournalEntry, OddsFormat, PlatformDataset, SocialPost } from "../types";
import type { EditableProfile } from "./EditProfileDialog";
import { FeaturedBadgeRow, useOwnBadges } from "./badges/ProfileBadges";
import {
  BalanceCurveFigure,
  PublicRecordPreviewCard,
  RateBreakdownList,
  formatShortIsoDay,
  formatSignedUnits,
} from "./record/PublicRecordSections";
import {
  Avatar,
  ChevronRightIcon,
  GiftIcon,
  PickStatus,
  ProfileVerificationReceipt,
  ShareIcon,
  SocialReportDialog,
  TabPanel,
  UnderlineTabs,
  buildLocalProfileReceipt,
  buildPublicProfileReceipt,
  isOwnProfileHandle,
  outcomeOf,
  ownIdentityFor,
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
import {
  SocialPostCard,
  copyPostPickToJournal,
  copyPostPickToParlay,
  isPlainClick,
  resolvePostAuthor,
  shareSocialPost,
} from "./SocialPostCard";

function XBrandMark(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M18.9 1.2h3.7l-8.2 9.3L24 22.8h-7.5l-5.9-7.7-6.7 7.7H.2l8.8-10L0 1.2h7.7l5.3 7 5.9-7Zm-1.3 19.4h2L6.6 3.3H4.4l13.2 17.3Z" />
    </svg>
  );
}

const EditProfileDialog = React.lazy(() =>
  import("./EditProfileDialog").then((m) => ({ default: m.EditProfileDialog })),
);

type ProfileTab = "publicaciones" | "picks" | "parlays" | "estadisticas";
type ToastTone = "default" | "success" | "warning" | "danger";

const PROFILE_TABS: readonly TabDef<ProfileTab>[] = [
  { key: "publicaciones", label: "Publicaciones", shortLabel: "Posts" },
  { key: "picks", label: "Picks" },
  { key: "parlays", label: "Parlays" },
  { key: "estadisticas", label: "Estadísticas", shortLabel: "Datos" },
];
const TAB_KEYS = PROFILE_TABS.map((t) => t.key);

const PAGE_FIRST = 6;
const PAGE_STEP = 16;
const STATS_MIN_SETTLED = 10;
const PARLAY_ORIGIN: JournalEntry["origin"] = "Parlay Combinado";
const PROFILE_POSTS_PAGE = 12;

const LEAGUE_IDS_BY_LABEL: Readonly<Record<string, LeagueId>> = {
  NFL: "nfl" as LeagueId,
  NBA: "nba" as LeagueId,
  NHL: "nhl" as LeagueId,
  MLB: "mlb" as LeagueId,
  "Liga MX": "liga-mx" as LeagueId,
  "Premier League": "premier-league" as LeagueId,
  Premier: "premier-league" as LeagueId,
  LaLiga: "laliga" as LeagueId,
  Bundesliga: "bundesliga" as LeagueId,
  "Serie A": "serie-a" as LeagueId,
  "Ligue 1": "ligue-1" as LeagueId,
};

interface ResolvedProfile {
  handle: string;
  name: string;
  isTipster: boolean;
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
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function LockIcon(): React.JSX.Element {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function TeamPair({
  meta,
  size = 24,
}: {
  meta: EntryGameMeta;
  size?: number;
}): React.JSX.Element {
  return (
    <span className="pl-prof-teams" aria-hidden="true">
      <TeamBadge
        league={meta.league}
        slug={meta.home.slug}
        name={meta.home.name}
        size={size}
        decorative
      />
      <span className="pl-prof-teams-away">
        <TeamBadge
          league={meta.league}
          slug={meta.away.slug}
          name={meta.away.name}
          size={size}
          decorative
        />
      </span>
    </span>
  );
}

export function AnalystProfileClubView({
  handle,
  memberProfile,
  publicRecord,
  badges,
  avatarEnabled = false,
  xEnabled = false,
  xLinkError = false,
}: {
  handle: string;
  memberProfile?: PublicMemberProfile | null;
  publicRecord?: PublicRecordPayload | null;
  badges?: { public: BadgeView[]; featured: BadgeView[] } | null;
  avatarEnabled?: boolean;
  xEnabled?: boolean;
  xLinkError?: boolean;
}): React.JSX.Element {
  const { dataset, oddsFormat, viewerRole, favoriteLeagues, viewerIdentity } = usePlatformCore();
  const {
    toggleSocialLike,
    pushToast,
    navigateTo,
    updateViewerIdentity,
    loadSocialPostsByAuthor,
  } = usePlatformActions();
  const { socialPosts } = useSocialState();
  const journal = useJournalEntries();
  const [edited, setEdited] = useState<EditableProfile | null>(null);
  const memberHandle = memberProfile?.handle ?? null;

  useSafeEffect(() => {
    if (memberHandle) loadSocialPostsByAuthor(memberHandle);
  }, [memberHandle, loadSocialPostsByAuthor]);

  const { rows, own, today } = useLeaderboardRows();
  const cleanHandle = handle.replace(/^@/, "").trim().toLowerCase();

  const profile = useMemo<ResolvedProfile | null>(() => {
    if (memberProfile) {
      const details = edited ?? memberProfile;
      const ownIdentity = viewerIdentity?.handle === details.handle ? viewerIdentity : null;
      const initials = details.displayName
        .split(/\s+/)
        .map((word) => word[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      return {
        handle: details.handle,
        name: details.displayName,
        isTipster: memberProfile.isTipster,
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
      const creator = TIPSTER_CREATORS.find((c) => c.handle === spec.handle);
      const closed = generateExampleJournal(spec, today);
      const open = exampleOpenEntries(spec, dataset.games, today);
      return {
        handle: spec.handle,
        name: spec.name,
        isTipster: spec.isTipster,
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
        isTipster: false,
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
  }, [
    cleanHandle,
    dataset.games,
    edited,
    favoriteLeagues,
    journal,
    memberProfile,
    own,
    today,
    viewerIdentity,
  ]);

  const saveProfile = (updated: EditableProfile) => {
    const previousHandle = viewerIdentity?.handle;
    setEdited(updated);
    const avatarChanged =
      updated.avatarUrl !== undefined &&
      (viewerIdentity?.avatarUrl ?? null) !== (updated.avatarUrl ?? null);
    if (
      viewerIdentity?.displayName !== updated.displayName ||
      previousHandle !== updated.handle ||
      avatarChanged
    ) {
      updateViewerIdentity(updated);
    }
    if (previousHandle && previousHandle !== updated.handle) {
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

  const needsClientRecord = Boolean(
    profile && !isOwn && !profile.isExample && publicRecord === undefined,
  );
  const clientRecordUrl =
    needsClientRecord && profile ? `/api/u/${encodeURIComponent(profile.handle)}/record` : null;
  const clientRecordQuery = useAbortableJson<PublicRecordPayload>(clientRecordUrl, {
    enabled: needsClientRecord,
  });

  const effectivePublicRecord: PublicRecordPayload | null | undefined =
    publicRecord !== undefined
      ? publicRecord
      : !needsClientRecord
        ? undefined
        : clientRecordQuery.loading
          ? undefined
          : clientRecordQuery.data;

  const localBadges = useMemo(
    () =>
      profile && (profile.isExample || (isOwn && !memberProfile))
        ? computeBadges(
            badgeFactsFromEntries(profile.journal, {
              joinedAtIso: profile.joinedAt
                ? `${profile.joinedAt.slice(0, 10)}T12:00:00Z`
                : null,
              isTipster: profile.isTipster,
            }),
            today,
          )
        : [],
    [isOwn, memberProfile, profile, today],
  );
  const ownBadges = useOwnBadges({
    enabled: isOwn,
    serverBacked: Boolean(memberProfile),
    localBadges,
    onError: (message) => pushToast(message, "warning"),
  });
  const excludedBadgeIds = useMemo(
    () => (profile?.isTipster ? ["tipster-verificado"] : []),
    [profile?.isTipster],
  );
  const visibleBadges = useMemo<{ public: BadgeView[]; featured: BadgeView[] }>(() => {
    const exclude = new Set(excludedBadgeIds);
    const filterList = (list: readonly BadgeView[]) => list.filter((b) => !exclude.has(b.id));
    if (profile?.isExample) {
      const pub = filterList(
        publicBadgeList(localBadges, {
          privacy: DEFAULT_RECORD_PRIVACY,
          recordVisible: true,
          showInRanking: true,
        }),
      );
      return { public: pub, featured: pub.slice(0, 3) };
    }
    if (isOwn) return { public: [], featured: filterList(ownBadges.featured).slice(0, 3) };
    return {
      public: filterList(badges?.public ?? []),
      featured: filterList(badges?.featured ?? []).slice(0, 3),
    };
  }, [badges, excludedBadgeIds, isOwn, localBadges, ownBadges.featured, profile?.isExample]);

  const [badgesModalOpen, setBadgesModalOpen] = useState(false);
  const badgeTotalCount =
    isOwn && !profile?.isExample
      ? (ownBadges.own?.all.filter((b) => b.earned && !excludedBadgeIds.includes(b.id)).length ?? 0)
      : visibleBadges.public.length;

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath={`/app/u/${profile?.handle ?? cleanHandle}`}>
        {profile ? (
          <>
            <ProfileContent
              profile={profile}
              isOwn={isOwn}
              ownHandle={own?.handle ?? null}
              publicRecord={effectivePublicRecord}
              featuredBadges={visibleBadges.featured}
              badgeTotalCount={badgeTotalCount}
              onOpenBadges={() => setBadgesModalOpen(true)}
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
            <BadgePickerDialog
              open={badgesModalOpen}
              onClose={() => setBadgesModalOpen(false)}
              isOwn={isOwn && !profile.isExample}
              memberName={profile.name}
              publicBadges={visibleBadges.public}
              own={ownBadges.own}
              onToggleFeatured={ownBadges.toggle}
              excludeBadgeIds={excludedBadgeIds}
            />
          </>
        ) : (
          <div className="pl-prof">
            <SofascoreCard as="section" className="pl-prof-missing-card">
              <SofascoreEmptyState
                title="Este perfil aún no es público"
                description={`@${cleanHandle} todavía no comparte su récord. Mientras tanto, mira el ranking de Comunidad.`}
                actionLabel="Ver ranking"
                onAction={() => navigateTo("/app/social?tab=ranking")}
              />
            </SofascoreCard>
          </div>
        )}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

function ProfileContent({
  profile,
  isOwn,
  ownHandle,
  publicRecord,
  featuredBadges,
  badgeTotalCount,
  onOpenBadges,
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
  publicRecord?: PublicRecordPayload | null;
  featuredBadges: readonly BadgeView[];
  badgeTotalCount: number;
  onOpenBadges: () => void;
  onEdit?: (profile: EditableProfile) => void;
  avatarEnabled: boolean;
  xEnabled: boolean;
  xLinkError: boolean;
  rows: ReturnType<typeof useLeaderboardRows>["rows"];
  today: Date;
  dataset: PlatformDataset;
  socialPosts: readonly SocialPost[];
  oddsFormat: OddsFormat;
  isVisitor: boolean;
  toggleSocialLike: (postId: string) => void;
  pushToast: (text: string, tone?: ToastTone) => void;
  navigateTo: (path: string) => void;
}): React.JSX.Element {
  const [tab, setTab] = useUrlTab<ProfileTab>(TAB_KEYS, "picks");
  const follows = useFollowing();
  const following = follows.isFollowing(profile.handle);

  const record = useMemo(() => profileRecord(profile.journal), [profile.journal]);
  const rank = useMemo(
    () => analystRank(profile.handle, rows, today),
    [profile.handle, rows, today],
  );
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
    if (!profile.isTipster) return null;
    const pickId = dataset.tipsterWeeklyPickId;
    for (const game of dataset.games) {
      if (game.picks.some((p) => p.id === pickId)) {
        return `${game.home.shortName || game.home.name} vs ${game.away.shortName || game.away.name}`;
      }
    }
    return null;
  }, [dataset.games, dataset.tipsterWeeklyPickId, profile.isTipster]);

  const followerCount =
    profile.followers === null ? null : profile.followers + (following ? 1 : 0);

  const go = (path: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    navigateTo(path);
  };

  const onShare = (): void => {
    void shareUrl(
      profile.isExample ? `/app/u/${profile.handle}` : `/u/${profile.handle}`,
      `${profile.name} en PitchLab`,
      () => pushToast("Copiamos el enlace del perfil.", "success"),
      () => pushToast("No pudimos compartir el perfil.", "warning"),
    );
  };

  const hasSettled = record.settled > 0;
  const kpiItems = useMemo<readonly SofascoreKpiItem[]>(() => {
    if (!hasSettled) return [];
    const hitPct = Math.round(record.hitRatePct ?? 0);
    return [
      {
        id: "saldo",
        label: "Saldo",
        value: formatUnits(record.netUnits),
        delta: `${record.settled} cerrados`,
        tone: record.netUnits > 0 ? "positive" : record.netUnits < 0 ? "negative" : "default",
      },
      {
        id: "cumplidos",
        label: "Cumplidos",
        value: `${record.won} de ${record.settled}`,
        delta: `${hitPct} %`,
        tone: hitPct >= 55 ? "positive" : "default",
      },
      {
        id: "clv",
        label: "Contra el cierre",
        value: record.avgClvPct === null ? "—" : formatSignedPct(record.avgClvPct),
        delta: "CLV medio",
        tone:
          record.avgClvPct !== null && record.avgClvPct > 0
            ? "positive"
            : record.avgClvPct !== null && record.avgClvPct < 0
              ? "negative"
              : "default",
      },
      {
        id: "ranking",
        label: "Comunidad",
        value: rank ? `#${rank.rank}` : "—",
        delta: rank ? monthName : "Sin ranking",
        tone: rank && rank.rank <= 10 ? "brand" : "default",
      },
    ];
  }, [hasSettled, monthName, rank, record]);

  const receiptInfo = useMemo(
    () =>
      !isOwn && !profile.isExample
        ? buildPublicProfileReceipt(profile.handle, publicRecord)
        : buildLocalProfileReceipt(profile.handle, record),
    [isOwn, profile.handle, profile.isExample, publicRecord, record],
  );

  const visibleTabs = isOwn ? PROFILE_TABS.filter((t) => t.key !== "estadisticas") : PROFILE_TABS;
  const activeTab: ProfileTab = isOwn && tab === "estadisticas" ? "picks" : tab;

  return (
    <div className="pl-prof">
      {profile.isExample ? (
        <>
          <div className="pl-prof-example">
            <div className="pl-prof-example-head">
              <span className="pl-pill pl-pill--warning">
                <MaestroIcon name="eye" size={13} />
                <span>Ejemplo</span>
              </span>
              <strong className="pl-prof-example-title">Contenido de ejemplo</strong>
            </div>
            <p className="pl-prof-example-body">
              @{profile.handle} es un perfil de ejemplo: su récord y publicaciones muestran cómo se
              verá un perfil {profile.isTipster ? "verificado" : "de socio"}.
            </p>
          </div>
          <p className="pl-prof-example-line">
            <span className="pl-pill pl-pill--warning">Ejemplo</span> Perfil de ejemplo
          </p>
        </>
      ) : null}

      <SofascoreCard as="section" className="pl-prof-head-card">
        <div className="pl-prof-editorial-head">
          <div className="pl-prof-editorial-identity">
            <Avatar
              initials={profile.avatarInitials}
              avatarUrl={profile.avatarUrl}
              gradVar={profile.avatarGradVar}
              size={72}
              className="pl-prof-avatar"
            />
            <div className="pl-prof-editorial-copy">
              <div className="pl-prof-name-row">
                <h1 id="pl-prof-name" className="pl-prof-name">
                  {profile.name}
                </h1>
                {profile.isTipster ? (
                  <TipsterVerifiedBadge className="pl-prof-seal" />
                ) : (
                  <span className="pl-prof-role">Socio</span>
                )}
                <FeaturedBadgeRow badges={featuredBadges} />
                {isOwn || badgeTotalCount > 0 ? (
                  <button
                    type="button"
                    className="pl-prof-badges-btn"
                    data-open-badges-modal=""
                    onClick={onOpenBadges}
                  >
                    <MaestroIcon name="star" size={13} />
                    <span>Insignias</span>
                    {badgeTotalCount > 0 ? <em className="num">{badgeTotalCount}</em> : null}
                    <span className="sr-only">
                      {isOwn ? " — elegir destacadas" : ` de ${profile.name}`}
                    </span>
                  </button>
                ) : null}
              </div>

              <p className="pl-prof-handle">
                @{profile.handle}
                {profile.specialty ? ` · ${profile.specialty}` : ""}
              </p>

              {profile.bio ? <p className="pl-prof-bio">{profile.bio}</p> : null}

              <div className="pl-prof-meta num">
                {followerCount !== null ? (
                  <span>
                    <strong>{followerCount}</strong>{" "}
                    {followerCount === 1 ? "seguidor" : "seguidores"}
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
                {profile.favoriteLeagues.length > 0 ? (
                  <span className="pl-prof-leagues">
                    <span className="sr-only">Ligas favoritas:</span>
                    {profile.favoriteLeagues.slice(0, 3).map((lg) => (
                      <LeagueBadge key={lg} league={lg} size={18} />
                    ))}
                  </span>
                ) : null}
              </div>
              {xLinkError ? (
                <p className="pl-profile-editor-error" role="status">
                  No se pudo conectar X. Intenta de nuevo.
                </p>
              ) : null}
            </div>
          </div>

          <div className="pl-prof-actions">
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              aria-label="Compartir perfil"
              onClick={onShare}
            >
              <ShareIcon size={16} />
            </Button>
            {isOwn ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  render={<a href="/app/lab?tab=privacidad" onClick={go("/app/lab?tab=privacidad")} />}
                >
                  <LockIcon />
                  <span>Privacidad</span>
                </Button>
                {onEdit ? (
                  <React.Suspense
                    fallback={
                      <Button type="button" variant="primary" size="sm" disabled>
                        Editar perfil
                      </Button>
                    }
                  >
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
                  </React.Suspense>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    render={<a href="/app/account" onClick={go("/app/account")} />}
                  >
                    Editar perfil
                  </Button>
                )}
              </>
            ) : (
              <Button
                type="button"
                variant={following ? "secondary" : "primary"}
                size="sm"
                className="pl-prof-follow"
                aria-pressed={following}
                onClick={() => {
                  const now = follows.toggle(profile.handle);
                  pushToast(
                    now
                      ? `Ahora sigues a @${profile.handle}.`
                      : `Dejaste de seguir a @${profile.handle}.`,
                    "default",
                  );
                }}
              >
                {following ? "Siguiendo" : "Seguir"}
              </Button>
            )}
          </div>
        </div>
      </SofascoreCard>

      <section aria-label="Récord" className="pl-prof-record-block">
        {!isOwn && !profile.isExample ? (
          publicRecord === undefined ? (
            <SofascoreEmptyState title="Cargando récord…" />
          ) : publicRecord === null ? (
            <SofascoreEmptyState title="Sin picks cerrados todavía" />
          ) : (
            <PublicRecordPreviewCard
              handle={profile.handle}
              hidden={publicRecord.hidden}
              settled={publicRecord.hidden ? 0 : publicRecord.settled}
              view={publicRecord.hidden ? null : publicRecord.view}
              oddsFormat={oddsFormat}
              summaryOnly
            />
          )
        ) : hasSettled ? (
          <div className="pl-prof-kpi-wrap">
            <SofascoreKpiStrip items={kpiItems} className="pl-prof-record" />
            {rank ? (
              <a
                href="/app/social?tab=ranking"
                className="pl-prof-rank-link num"
                onClick={go("/app/social?tab=ranking")}
              >
                <span>
                  <strong>#{rank.rank} en Comunidad</strong> · {monthName} · {record.won} de{" "}
                  {record.settled}
                </span>
                <ChevronRightIcon size={15} />
              </a>
            ) : null}
          </div>
        ) : (
          <SofascoreEmptyState
            title="Sin picks cerrados todavía"
            description={
              isOwn
                ? "Registra tu primer pick antes del inicio del partido para comenzar tu historial auditable."
                : undefined
            }
            actionLabel={isOwn ? "Registra tu primer pick" : undefined}
            onAction={isOwn ? () => navigateTo("/app") : undefined}
          />
        )}
      </section>

      <ProfileVerificationReceipt
        handle={profile.handle}
        receiptPayload={receiptInfo.payload}
        settledCount={receiptInfo.settled}
        isPrivate={receiptInfo.isPrivate}
        onNavigate={navigateTo}
        onNotify={(msg, tone) => pushToast(msg, tone)}
      />

      {isOwn ? (
        <a
          href="/app/lab"
          onClick={go("/app/lab")}
          className="pl-prof-shortcut"
          data-profile-record-shortcut=""
        >
          <span className="pl-prof-shortcut-icon" aria-hidden="true">
            <MaestroIcon name="ticket" size={18} />
          </span>
          <span className="pl-prof-shortcut-copy">
            <strong>Gestionar mi récord privado</strong>
            <span>Banca en MXN, curva de unidades, calibración avanzada y privacidad</span>
          </span>
          <ChevronRightIcon size={16} />
        </a>
      ) : null}

      {profile.isTipster && profile.weeklyPickSlug ? (
        <a
          href={`/p/${profile.weeklyPickSlug}`}
          className="pl-prof-shortcut pl-prof-shortcut--weekly"
          onClick={go(`/p/${profile.weeklyPickSlug}`)}
        >
          <span className="pl-prof-shortcut-icon" aria-hidden="true">
            <GiftIcon size={18} />
          </span>
          <span className="pl-prof-shortcut-copy">
            <strong>Pick gratis de la semana</strong>
            <span>
              {weeklyPickMatch ? `${weeklyPickMatch} · ` : ""}con el código{" "}
              <strong className="pl-prof-strong">{profile.promoCode}</strong> tienes{" "}
              {profile.freeDays ?? 5} días gratis
            </span>
          </span>
          <ChevronRightIcon size={16} />
        </a>
      ) : null}

      <UnderlineTabs
        tabs={visibleTabs}
        active={activeTab}
        onChange={setTab}
        label="Contenido del perfil"
        idPrefix="pl-prof"
        className="pl-prof-tabs"
      />

      <TabPanel tabKey={activeTab} idPrefix="pl-prof">
        {activeTab === "publicaciones" ? (
          <PostsPanel
            key={profile.handle}
            posts={posts}
            authorHandle={profile.isExample ? undefined : profile.handle}
            dataset={dataset}
            oddsFormat={oddsFormat}
            toggleSocialLike={toggleSocialLike}
            canReport={!isVisitor}
            ownHandle={ownHandle}
          />
        ) : null}
        {activeTab === "picks" ? (
          !isOwn && !profile.isExample ? (
            <SharedPicksPanel
              handle={profile.handle}
              publicRecord={publicRecord}
              oddsFormat={oddsFormat}
            />
          ) : (
            <PicksPanel
              entries={singlePicks}
              dataset={dataset}
              oddsFormat={oddsFormat}
              isVisitor={isVisitor}
              navigateTo={navigateTo}
            />
          )
        ) : null}
        {activeTab === "parlays" ? (
          !isOwn && !profile.isExample ? (
            <SharedParlaysPanel
              handle={profile.handle}
              publicRecord={publicRecord}
              oddsFormat={oddsFormat}
            />
          ) : (
            <ParlaysPanel entries={parlays} />
          )
        ) : null}
        {activeTab === "estadisticas" ? (
          !isOwn && !profile.isExample ? (
            <SharedStatsPanel handle={profile.handle} publicRecord={publicRecord} />
          ) : (
            <StatsPanel entries={profile.journal} today={today} />
          )
        ) : null}
      </TabPanel>
    </div>
  );
}

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
  dataset: PlatformDataset;
  oddsFormat: OddsFormat;
  toggleSocialLike: (postId: string) => void;
  canReport: boolean;
  ownHandle: string | null;
}): React.JSX.Element {
  const { viewerRole, viewerIdentity } = usePlatformCore();
  const {
    loadOlderSocialPosts,
    addSocialComment,
    deleteSocialComment,
    toggleSocialCommentHelpful,
    loadAllPostComments,
    deleteSocialPost,
    sealPickToJournal,
    recordSocialPostCopy,
    addPickToParlay,
    navigateTo,
    pushToast,
  } = usePlatformActions();
  const { socialFeedPages } = useSocialState();
  const journal = useJournalEntries();
  const follows = useFollowing();
  const [limit, setLimit] = useState(PROFILE_POSTS_PAGE);
  const [reportTarget, setReportTarget] = useState<SocialReportTarget | null>(null);

  const own = useMemo(
    () => ownIdentityFor(viewerRole, viewerIdentity),
    [viewerRole, viewerIdentity],
  );

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
    return <SofascoreEmptyState title="Todavía no hay publicaciones" />;
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

  const goProfile = (handle: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    navigateTo(`/app/u/${handle}`);
  };

  const onCopy = (post: SocialPost): void =>
    copyPostPickToJournal(post, {
      dataset,
      sealPickToJournal,
      recordSocialPostCopy,
      pushToast,
    });

  const onCopyToParlay = (post: SocialPost): void =>
    copyPostPickToParlay(post, {
      dataset,
      addPickToParlay,
      pushToast,
    });

  const onShare = (post: SocialPost): void => shareSocialPost(post, pushToast);

  return (
    <div className="pl-prof-posts">
      {displayPool.slice(0, limit).map((post) => {
        const effectiveOwn = ownHandle ? own : null;
        return (
          <SocialPostCard
            key={post.id}
            variant="profile"
            post={post}
            author={resolvePostAuthor(post, effectiveOwn, [])}
            own={effectiveOwn}
            dataset={dataset}
            journal={journal}
            oddsFormat={oddsFormat}
            following={follows.isFollowing(post.authorHandle)}
            onCopy={onCopy}
            onCopyToParlay={onCopyToParlay}
            onShare={onShare}
            toggleSocialLike={toggleSocialLike}
            addSocialComment={addSocialComment}
            onDeleteComment={deleteSocialComment}
            onToggleCommentHelpful={toggleSocialCommentHelpful}
            onLoadAllComments={loadAllPostComments}
            onDeletePost={deleteSocialPost}
            onOpenReport={canReport ? setReportTarget : undefined}
            onNavigate={navigateTo}
            goProfile={goProfile}
          />
        );
      })}
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
      <SocialReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />
    </div>
  );
}

type StatusFilter = "all" | "open" | "closed";

function PicksPanel({
  entries,
  dataset,
  oddsFormat,
  isVisitor,
  navigateTo,
}: {
  entries: readonly JournalEntry[];
  dataset: PlatformDataset;
  oddsFormat: OddsFormat;
  isVisitor: boolean;
  navigateTo: (path: string) => void;
}): React.JSX.Element {
  const uid = useId();
  const { hasAccountSession, upgradeHref } = usePlatformCore();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [league, setLeague] = useState<string>("all");
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

  const pickColumns = useMemo<readonly SofascoreTableColumn<JournalEntry>[]>(
    () => [
      {
        key: "pick",
        header: "Pick / Partido",
        sticky: true,
        render: (entry) => {
          const meta = resolveEntryGame(entry.gameId, dataset);
          const outcome = outcomeOf(entry.status);
          const locked = isVisitor && outcome === "open";
          const scoreLabel =
            meta && meta.score && outcome !== "open"
              ? `${meta.home.name} ${meta.score.home}–${meta.score.away} ${meta.away.name}`
              : entry.matchLabel;
          const when =
            outcome === "open"
              ? registeredBeforeLabel(entry, meta?.kickoffIso)
              : shortDate(meta?.kickoffIso ?? entry.sealedAtIso);
          const leagueShort =
            meta?.leagueLabel === "Premier League"
              ? "Premier"
              : (meta?.leagueLabel ?? entry.leagueLabel);
          return (
            <div className="pl-prof-tbl-main">
              {meta ? <TeamPair meta={meta} size={22} /> : null}
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
          );
        },
      },
      {
        key: "odds",
        header: "Momio / Justo",
        numeric: true,
        render: (entry) => {
          const locked = isVisitor && outcomeOf(entry.status) === "open";
          if (locked) {
            return <span className="pl-prof-muted">—</span>;
          }
          return (
            <div className="pl-prof-tbl-odds num">
              <strong>{formatOddsValue(entry.userDecimal, oddsFormat)}</strong>
              <span className="pl-prof-muted">
                Justo {formatOddsValue(entry.fairDecimal, oddsFormat)}
              </span>
            </div>
          );
        },
      },
      {
        key: "units",
        header: "Unidades",
        numeric: true,
        render: (entry) => {
          const locked = isVisitor && outcomeOf(entry.status) === "open";
          if (locked) {
            return <span className="pl-prof-muted">—</span>;
          }
          const units = pickSettlementUnits(entry);
          return (
            <span
              className={`num ${units === null ? "pl-prof-muted" : units > 0 ? "pl-prof-pos pl-prof-strong" : "pl-prof-neg pl-prof-strong"}`}
            >
              {units === null ? `${entry.units.toFixed(1)}u` : formatUnits(units)}
            </span>
          );
        },
      },
      {
        key: "status",
        header: "Estado",
        align: "end",
        render: (entry) => {
          const outcome = outcomeOf(entry.status);
          const locked = isVisitor && outcome === "open";
          if (locked) {
            return (
              <Button
                variant="primary"
                size="sm"
                render={
                  <a
                    href={upgradeHref}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo(upgradeHref);
                    }}
                  />
                }
              >
                {hasAccountSession ? "Activar Pase" : "Desbloquear"}
              </Button>
            );
          }
          return <PickStatus status={outcome} />;
        },
      },
    ],
    [dataset, hasAccountSession, isVisitor, navigateTo, oddsFormat, upgradeHref],
  );

  if (entries.length === 0) {
    return <SofascoreEmptyState title="Todavía no hay picks registrados" />;
  }

  const renderSection = (
    id: string,
    title: string,
    list: readonly JournalEntry[],
    limit: number,
    setLimit: (n: number) => void,
  ): React.JSX.Element | null => {
    if (list.length === 0) return null;
    return (
      <SofascoreCard id={id} title={title} meta={`${list.length} picks`} density="compact">
        <div className="pl-prof-table-stack">
          <SofascoreTable
            caption={`${title} del perfil`}
            columns={pickColumns}
            rows={list.slice(0, limit)}
            rowKey={(row) => row.id}
            density="compact"
            className="pl-prof-picks-table"
          />
          {list.length > limit ? (
            <div className="pl-prof-more">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setLimit(limit === PAGE_FIRST ? PAGE_STEP : limit + PAGE_STEP)}
              >
                {limit === PAGE_FIRST ? `Ver los ${list.length} picks` : "Ver más"}
              </Button>
            </div>
          ) : null}
        </div>
      </SofascoreCard>
    );
  };

  return (
    <div className="pl-prof-picks">
      <div className="pl-prof-filter-bar" role="region" aria-label="Filtros de picks">
        <div className="pl-prof-filters-row" role="group" aria-label="Estado de picks">
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
        </div>

        {leagues.length > 1 ? (
          <div className="pl-prof-league-filter">
            <label htmlFor={`${uid}-league`} className="sr-only">
              Filtrar por liga
            </label>
            <select
              id={`${uid}-league`}
              className="pl-prof-select-native"
              value={league}
              onChange={(e) => {
                setLeague(e.target.value);
                setOpenLimit(PAGE_FIRST);
                setClosedLimit(PAGE_FIRST);
              }}
            >
              <option value="all">Todas las ligas</option>
              {leagues.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {status !== "closed"
        ? renderSection("pl-prof-open", "Abiertos", open, openLimit, setOpenLimit)
        : null}
      {status !== "open"
        ? renderSection("pl-prof-closed", "Cerrados", closed, closedLimit, setClosedLimit)
        : null}
      {(status === "open" ? open : status === "closed" ? closed : byLeague).length === 0 ? (
        <SofascoreEmptyState title="No hay picks con este filtro" />
      ) : null}
    </div>
  );
}

function splitLegs(label: string): Array<{ label: string; league: string | null }> {
  const parts = label
    .split(" + ")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.map((part) => {
    const idx = part.lastIndexOf(" · ");
    if (idx < 0) return { label: part, league: null };
    return { label: part.slice(0, idx), league: part.slice(idx + 3) };
  });
}

function ParlaysPanel({ entries }: { entries: readonly JournalEntry[] }): React.JSX.Element {
  if (entries.length === 0) {
    return <SofascoreEmptyState title="Todavía no hay parlays registrados" />;
  }
  return (
    <div className="pl-prof-parlays">
      {entries.map((entry) => {
        const legs = splitLegs(entry.pickLabel);
        const outcome = outcomeOf(entry.status);
        const units = pickSettlementUnits(entry);
        const combined = (1 / Math.max(1.0001, entry.fairDecimal)) * 100;
        return (
          <SofascoreCard
            key={entry.id}
            as="article"
            density="compact"
            title={`Parlay de ${legs.length} · ${entry.units.toFixed(1)}u`}
            meta={<PickStatus status={outcome} />}
          >
            <ol className="pl-prof-legs">
              {legs.map((leg, i) => (
                <li key={`${leg.label}-${i}`}>
                  <span>
                    {leg.label}
                    {leg.league ? <span className="pl-prof-muted"> · {leg.league}</span> : null}
                  </span>
                  {outcome === "won" ? (
                    <span className="pl-prof-pos">
                      <span aria-hidden="true">✓</span>
                      <span className="sr-only">Cumplida</span>
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
                <strong className={units > 0 ? "pl-prof-pos" : "pl-prof-neg"}>
                  {formatUnits(units)}
                </strong>
              ) : null}
            </div>
          </SofascoreCard>
        );
      })}
    </div>
  );
}

function StatsPanel({
  entries,
  today,
}: {
  entries: readonly JournalEntry[];
  today: Date;
}): React.JSX.Element {
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
    return (
      <SofascoreEmptyState title="Las estadísticas aparecen con 10 picks cerrados" />
    );
  }

  const total = months.reduce((s, m) => s + m.net, 0);
  const maxAbs = Math.max(0.1, ...months.map((m) => Math.abs(m.net)));
  const posMax = Math.max(0, ...months.map((m) => m.net));
  const negMax = Math.max(0, ...months.map((m) => -m.net));
  const posArea = 128;
  const negArea = negMax > 0 ? Math.max(32, Math.round((negMax / maxAbs) * posArea)) : 24;

  return (
    <div className="pl-prof-stats">
      <SofascoreCard
        id="pl-prof-stat-month"
        title="Saldo por mes"
        meta={
          <span>
            Últimos 6 meses ·{" "}
            <strong className={total >= 0 ? "pl-prof-pos" : "pl-prof-neg"}>
              {formatUnits(total)}
            </strong>
          </span>
        }
      >
        <div className="pl-prof-bars" aria-hidden="true">
          {months.map((m) => {
            const posH =
              m.net > 0 ? Math.max(3, Math.round((m.net / maxAbs) * (posArea - 22))) : 0;
            const negH =
              m.net < 0 ? Math.max(3, Math.round((-m.net / maxAbs) * (posArea - 22))) : 0;
            return (
              <div
                key={m.month}
                className="pl-prof-bar"
                title={`${m.label}: ${formatUnits(m.net)}`}
              >
                <div className="pl-prof-bar-pos" style={{ height: posArea }}>
                  {m.net > 0 ? (
                    <span className="pl-prof-bar-label num">{formatUnits(m.net)}</span>
                  ) : null}
                  <div className="pl-prof-bar-fill pl-prof-bar-fill--pos" style={{ height: posH }} />
                </div>
                <div className="pl-prof-bar-base" />
                <div
                  className="pl-prof-bar-neg"
                  style={{ height: posMax === 0 && negMax === 0 ? 24 : negArea }}
                >
                  <div className="pl-prof-bar-fill pl-prof-bar-fill--neg" style={{ height: negH }} />
                  {m.net < 0 ? (
                    <span className="pl-prof-bar-label num">{formatUnits(m.net)}</span>
                  ) : null}
                  {m.net === 0 ? (
                    <span className="pl-prof-bar-label pl-prof-muted num">0.0u</span>
                  ) : null}
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
      </SofascoreCard>

      <div className="pl-prof-two">
        <SofascoreCard id="pl-prof-stat-league" title="Cumplidos por liga">
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
        </SofascoreCard>

        <SofascoreCard
          id="pl-prof-stat-calib"
          title="Cuando dijo X %, ¿se cumplió?"
          meta="Calibración"
        >
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
                    <div
                      className="pl-prof-track-mark"
                      style={{ left: `${c.expectedMidPct}%` }}
                      title="Esperado"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="pl-prof-card-note">
            La raya marca lo esperado (punto medio del rango).
          </p>
        </SofascoreCard>
      </div>
    </div>
  );
}

type SharedSettledPick = NonNullable<PublicRecordView["settledPicks"]>[number];

function SharedPicksPanel({
  handle,
  publicRecord,
  oddsFormat,
}: {
  handle: string;
  publicRecord: PublicRecordPayload | null | undefined;
  oddsFormat: OddsFormat;
}): React.JSX.Element {
  const columns = useMemo<readonly SofascoreTableColumn<SharedSettledPick>[]>(
    () => [
      {
        key: "pick",
        header: "Pick cerrado",
        sticky: true,
        render: (p) => (
          <div className="pl-prof-row-copy">
            <p className="pl-prof-row-title">{p.pickLabel}</p>
            <p className="pl-prof-row-sub">
              {[p.leagueLabel, p.day ? formatShortIsoDay(p.day) : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        ),
      },
      {
        key: "odds",
        header: "Momio",
        numeric: true,
        render: (p) => (
          <strong className="num">{formatOddsValue(p.userDecimal, oddsFormat)}</strong>
        ),
      },
      {
        key: "net",
        header: "Saldo",
        numeric: true,
        render: (p) => {
          const net = p.status === "won" ? p.units * (p.userDecimal - 1) : -p.units;
          return (
            <strong className={`num ${net > 0 ? "pl-prof-pos" : "pl-prof-neg"}`}>
              {formatSignedUnits(Math.round(net * 100) / 100)}
            </strong>
          );
        },
      },
      {
        key: "status",
        header: "Estado",
        align: "end",
        render: (p) => <PickStatus status={outcomeOf(p.status)} />,
      },
    ],
    [oddsFormat],
  );

  if (publicRecord === undefined) {
    return <SofascoreEmptyState title="Cargando picks…" />;
  }
  if (!publicRecord || publicRecord.hidden || publicRecord.view.settledPicks === null) {
    return (
      <SofascoreEmptyState
        title={`@${handle} mantiene su historial de picks en privado.`}
      />
    );
  }
  const singles = publicRecord.view.settledPicks.filter((p) => !p.pickLabel.includes(" + "));
  if (singles.length === 0) {
    return <SofascoreEmptyState title="Todavía no hay picks cerrados para mostrar" />;
  }
  return (
    <SofascoreTable
      caption={`Picks cerrados de @${handle}`}
      columns={columns}
      rows={singles}
      rowKey={(p, idx) => `${p.pickLabel}-${p.day ?? idx}-${idx}`}
      density="compact"
      className="pl-prof-picks-table"
    />
  );
}

function SharedParlaysPanel({
  handle,
  publicRecord,
  oddsFormat,
}: {
  handle: string;
  publicRecord: PublicRecordPayload | null | undefined;
  oddsFormat: OddsFormat;
}): React.JSX.Element {
  if (publicRecord === undefined) {
    return <SofascoreEmptyState title="Cargando parlays…" />;
  }
  if (!publicRecord || publicRecord.hidden || publicRecord.view.settledPicks === null) {
    return <SofascoreEmptyState title={`@${handle} mantiene sus parlays en privado.`} />;
  }
  const parlays = publicRecord.view.settledPicks.filter((p) => p.pickLabel.includes(" + "));
  if (parlays.length === 0) {
    return <SofascoreEmptyState title="Todavía no hay parlays cerrados para mostrar" />;
  }
  return (
    <div className="pl-prof-parlays">
      {parlays.map((entry, idx) => {
        const legs = splitLegs(entry.pickLabel);
        const outcome = outcomeOf(entry.status);
        const net =
          entry.status === "won" ? entry.units * (entry.userDecimal - 1) : -entry.units;
        return (
          <SofascoreCard
            key={`${entry.pickLabel}-${entry.day ?? idx}-${idx}`}
            as="article"
            density="compact"
            title={`Parlay de ${legs.length} · ${entry.units.toFixed(1)}u`}
            meta={<PickStatus status={outcome} />}
          >
            <ol className="pl-prof-legs">
              {legs.map((leg, i) => (
                <li key={`${leg.label}-${i}`}>
                  <span>
                    {leg.label}
                    {leg.league ? <span className="pl-prof-muted"> · {leg.league}</span> : null}
                  </span>
                  {outcome === "won" ? (
                    <span className="pl-prof-pos">
                      <span aria-hidden="true">✓</span>
                      <span className="sr-only">Cumplida</span>
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
            <div className="pl-prof-parlay-foot num">
              <span>Momio {formatOddsValue(entry.userDecimal, oddsFormat)}</span>
              <strong className={net > 0 ? "pl-prof-pos" : "pl-prof-neg"}>
                {formatSignedUnits(Math.round(net * 100) / 100)}
              </strong>
            </div>
          </SofascoreCard>
        );
      })}
    </div>
  );
}

function SharedStatsPanel({
  handle,
  publicRecord,
}: {
  handle: string;
  publicRecord: PublicRecordPayload | null | undefined;
}): React.JSX.Element {
  if (publicRecord === undefined) {
    return <SofascoreEmptyState title="Cargando estadísticas…" />;
  }
  if (!publicRecord || publicRecord.hidden) {
    return <SofascoreEmptyState title={`@${handle} mantiene sus estadísticas en privado.`} />;
  }
  if (publicRecord.settled === 0) {
    return (
      <SofascoreEmptyState title="Todavía no hay picks cerrados para calcular estadísticas" />
    );
  }
  const view: PublicRecordView = publicRecord.view;
  const hasCurve = Boolean(view.curve && view.curve.length > 0);
  const hasMonths = Boolean(view.months && (view.months.best || view.months.worst));
  const hasLeagues = Boolean(view.byLeague && view.byLeague.length > 0);
  const hasMarkets = Boolean(view.byMarket && view.byMarket.length > 0);

  if (!hasCurve && !hasMonths && !hasLeagues && !hasMarkets) {
    return (
      <SofascoreEmptyState
        title={`@${handle} mantiene oculto el desglose detallado de estadísticas.`}
      />
    );
  }

  return (
    <div className="pl-rec-stack">
      {hasCurve && view.curve ? (
        <SofascoreCard title="Curva de saldo (unidades)">
          <BalanceCurveFigure curve={view.curve} />
        </SofascoreCard>
      ) : null}

      {hasMonths && view.months ? (
        <SofascoreCard title="Mejor y peor mes">
          <div className="pl-rec-metric-pair num">
            {view.months.best ? (
              <div className="pl-rec-pub-stat">
                <span className="pl-rec-pub-dt">Mejor mes</span>
                <strong className="pl-rec-pub-dd pl-rec-pos">
                  {formatSignedUnits(view.months.best.netUnits)}
                </strong>
                <span className="pl-rec-pub-sub">{view.months.best.label}</span>
              </div>
            ) : null}
            {view.months.worst ? (
              <div className="pl-rec-pub-stat">
                <span className="pl-rec-pub-dt">Peor mes</span>
                <strong
                  className={`pl-rec-pub-dd ${view.months.worst.netUnits >= 0 ? "pl-rec-pos" : "pl-rec-neg"}`}
                >
                  {formatSignedUnits(view.months.worst.netUnits)}
                </strong>
                <span className="pl-rec-pub-sub">{view.months.worst.label}</span>
              </div>
            ) : null}
          </div>
        </SofascoreCard>
      ) : null}

      {hasLeagues || hasMarkets ? (
        <div className="pl-prof-two">
          {hasLeagues && view.byLeague ? (
            <SofascoreCard title="Acierto por liga">
              <RateBreakdownList rows={view.byLeague} showNetUnits={view.netUnits !== null} />
            </SofascoreCard>
          ) : null}
          {hasMarkets && view.byMarket ? (
            <SofascoreCard title="Acierto por mercado">
              <RateBreakdownList rows={view.byMarket} showNetUnits={view.netUnits !== null} />
            </SofascoreCard>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
