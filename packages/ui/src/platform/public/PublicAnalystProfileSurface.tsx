"use client";

import React from "react";
import type { PublicMemberProfile } from "@pitchlab/contracts";
import type { BadgeView } from "../badges";
import type { OddsFormat } from "../types";
import type { PublicRecordPayload } from "../record-stats";
import {
  Avatar,
  ShareIcon,
  shareUrl,
  shortDate,
} from "../club/community-ui";
import {
  FeaturedBadgeRow,
  ProfileBadgesSection,
} from "../club/badges/ProfileBadges";
import { PublicRecordPreviewCard } from "../club/record/PublicRecordSections";
import {
  MaestroIcon,
  TipsterVerifiedBadge,
  VerifiedSeal,
} from "../components/MaestroPrimitives";
import {
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import { PublicSiteShell } from "./PublicSiteSections";

export interface PublicAnalystProfileSurfaceProps {
  profile: PublicMemberProfile;
  publicRecord: PublicRecordPayload | null;
  badges?: { public: BadgeView[]; featured: BadgeView[] } | null;
  hasSession?: boolean;
  signupHref?: string;
  oddsFormat?: OddsFormat;
}

/**
 * Perfil público y verificable de un socio (`/u/[handle]`, fuera del candado de `/login`).
 * Solo recibe datos previamente filtrados por el servidor según `publicProfile`,
 * `publicRecordVisible` y `recordPrivacy`. Nunca expone montos en pesos ni picks abiertos.
 */
export function PublicAnalystProfileSurface({
  profile,
  publicRecord,
  badges = null,
  hasSession = false,
  signupHref = "/signup",
  oddsFormat: oddsFormatProp,
}: PublicAnalystProfileSurfaceProps): React.JSX.Element {
  const { oddsFormat: platformOddsFormat, hasAccountSession } = usePlatformCore();
  const { navigateTo, pushToast } = usePlatformActions();
  const oddsFormat = oddsFormatProp ?? platformOddsFormat;
  const sessionActive = hasSession || hasAccountSession;
  const joined = shortDate(profile.joinedAt);
  const initials =
    profile.displayName
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || profile.handle.slice(0, 2).toUpperCase();

  const onShare = (): void => {
    void shareUrl(
      `/u/${profile.handle}`,
      `${profile.displayName} (@${profile.handle}) en PitchLab`,
      () => pushToast("Copiamos el enlace público del perfil.", "success"),
      () => pushToast("No pudimos compartir el perfil.", "warning"),
    );
  };

  return (
    <PublicSiteShell hasSession={sessionActive}>
      <div
        className="pl-page-enter max-w-4xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-12 space-y-6"
        data-public-profile-page={profile.handle}
      >
        <section
          className="pl-prof-header glass-card glass-ring"
          aria-labelledby="pl-public-prof-name"
        >
          <div className="pl-prof-banner" aria-hidden="true" />
          <div className="pl-prof-identity">
            <div className="pl-prof-top">
              <div className="pl-prof-avatar">
                <Avatar
                  avatarUrl={profile.avatarUrl}
                  initials={initials}
                  gradVar="var(--avatar-grad-3)"
                  size={76}
                />
              </div>
              <div className="pl-prof-actions">
                <button
                  type="button"
                  className="pl-prof-btn pl-prof-btn--ghost"
                  onClick={onShare}
                  aria-label="Copiar enlace público del perfil"
                >
                  <ShareIcon />
                  <span>Compartir</span>
                </button>
                <a
                  href={sessionActive ? `/app/u/${profile.handle}` : signupHref}
                  className="pl-prof-btn pl-prof-follow pl-prof-btn--primary"
                  onClick={(e) => {
                    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                      return;
                    }
                    e.preventDefault();
                    navigateTo(sessionActive ? `/app/u/${profile.handle}` : signupHref);
                  }}
                >
                  {sessionActive ? "Ver en PitchLab" : "7 días gratis"}
                </a>
              </div>
            </div>

            <div className="pl-prof-name-row">
              <h1 id="pl-public-prof-name" className="pl-prof-name">
                {profile.displayName}
                {profile.isTipster ? (
                  <VerifiedSeal size={22} className="pl-prof-seal" />
                ) : null}
              </h1>
              {profile.isTipster ? (
                <TipsterVerifiedBadge />
              ) : (
                <span className="pl-prof-role">Socio</span>
              )}
              {badges?.featured.length ? (
                <FeaturedBadgeRow badges={badges.featured} />
              ) : null}
            </div>

            <p className="pl-prof-handle">@{profile.handle}</p>
            {profile.bio ? <p className="pl-prof-bio">{profile.bio}</p> : null}

            <div className="pl-prof-meta num">
              {typeof profile.followers === "number" ? (
                <span>
                  <strong>{profile.followers}</strong>{" "}
                  {profile.followers === 1 ? "seguidor" : "seguidores"}
                </span>
              ) : null}
              {typeof profile.following === "number" ? (
                <span>
                  <strong>{profile.following}</strong> siguiendo
                </span>
              ) : null}
              {joined ? (
                <span className="pl-prof-meta-icon">
                  <MaestroIcon name="calendar" size={14} />
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
                  @{profile.xUsername} en X
                </a>
              ) : null}
            </div>
          </div>
        </section>

        <section aria-label="Récord verificado">
          {publicRecord === null ? (
            <div className="pl-rec-card glass-lens glass-ring">
              <div className="pl-rec-card-head">
                <h2 className="pl-rec-card-title">Récord verificado</h2>
                <span className="pl-pill">En unidades</span>
              </div>
              <p className="pl-rec-hint">
                @{profile.handle} todavía no tiene picks cerrados publicados.
              </p>
            </div>
          ) : (
            <PublicRecordPreviewCard
              handle={profile.handle}
              hidden={publicRecord.hidden}
              settled={publicRecord.hidden ? 0 : publicRecord.settled}
              view={publicRecord.hidden ? null : publicRecord.view}
              oddsFormat={oddsFormat}
              summaryOnly={false}
            />
          )}
        </section>

        {badges?.public.length ? (
          <ProfileBadgesSection
            isOwn={false}
            publicBadges={badges.public}
          />
        ) : null}

        <section
          className="glass-card glass-ring rounded-2xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4"
          aria-label="Únete al club"
        >
          <div className="space-y-1 max-w-xl">
            <h2 className="m-0 text-base font-extrabold">
              Récord sellado antes del inicio del partido
            </h2>
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Todas las cifras se calculan en unidades (sin montos en pesos). Los picks abiertos
              y el detalle completo del modelo se desbloquean con acceso al club.
            </p>
          </div>
          <a
            href={sessionActive ? `/app/u/${profile.handle}` : signupHref}
            className="pl-btn-glass pl-btn-glass--primary min-h-11 px-4 inline-flex items-center gap-2 text-sm font-bold"
            onClick={(e) => {
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                return;
              }
              e.preventDefault();
              navigateTo(sessionActive ? `/app/u/${profile.handle}` : signupHref);
            }}
          >
            <MaestroIcon name="shield" size={16} />
            <span>
              {sessionActive ? "Abrir perfil en el club" : "Probar 7 días sin tarjeta"}
            </span>
          </a>
        </section>
      </div>
    </PublicSiteShell>
  );
}
