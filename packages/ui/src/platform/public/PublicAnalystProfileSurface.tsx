"use client";

import React, { useMemo } from "react";
import type { PublicMemberProfile } from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
} from "../../components/ui/primitives";
import type { BadgeView } from "../badges";
import {
  FeaturedBadgeRow,
  ProfileBadgesSection,
} from "../club/badges/ProfileBadges";
import {
  Avatar,
  ProfileVerificationReceipt,
  ShareIcon,
  buildPublicProfileReceipt,
  shareUrl,
  shortDate,
} from "../club/community-ui";
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
import type { PublicRecordPayload } from "../record-stats";
import type { OddsFormat } from "../types";
import { PublicSiteShell } from "./PublicSiteSections";

export interface PublicAnalystProfileSurfaceProps {
  profile: PublicMemberProfile;
  publicRecord: PublicRecordPayload | null;
  badges?: { public: BadgeView[]; featured: BadgeView[] } | null;
  hasSession?: boolean;
  signupHref?: string;
  oddsFormat?: OddsFormat;
}

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

  const featuredBadges = useMemo(
    () => (badges?.featured ?? []).slice(0, 3),
    [badges?.featured],
  );
  const receipt = useMemo(
    () => buildPublicProfileReceipt(profile.handle, publicRecord),
    [profile.handle, publicRecord],
  );

  const onShare = (): void => {
    void shareUrl(
      `/u/${profile.handle}`,
      `${profile.displayName} (@${profile.handle}) en PitchLab`,
      () => pushToast("Copiamos el enlace público del perfil.", "success"),
      () => pushToast("No pudimos compartir el perfil.", "warning"),
    );
  };

  const primaryHref = sessionActive ? `/app/u/${profile.handle}` : signupHref;
  const handleInternalClick =
    (href: string) => (e: React.MouseEvent<HTMLAnchorElement>): void => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      e.preventDefault();
      navigateTo(href);
    };

  return (
    <PublicSiteShell hasSession={sessionActive}>
      <div
        className="pl-page-enter pl-prof pl-prof--public"
        data-public-profile-page={profile.handle}
      >
        <SofascoreCard as="section" className="pl-prof-head-card">
          <div className="pl-prof-editorial-head">
            <div className="pl-prof-editorial-identity">
              <Avatar
                avatarUrl={profile.avatarUrl}
                initials={initials}
                gradVar="var(--avatar-grad-3)"
                size={72}
                className="pl-prof-avatar"
              />
              <div className="pl-prof-editorial-copy">
                <div className="pl-prof-name-row">
                  <h1 id="pl-public-prof-name" className="pl-prof-name">
                    {profile.displayName}
                    {profile.isTipster ? (
                      <VerifiedSeal size={20} className="pl-prof-seal" />
                    ) : null}
                  </h1>
                  {profile.isTipster ? (
                    <TipsterVerifiedBadge />
                  ) : (
                    <span className="pl-prof-role">Socio</span>
                  )}
                  {featuredBadges.length > 0 ? (
                    <FeaturedBadgeRow badges={featuredBadges} />
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
            </div>

            <div className="pl-prof-actions">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onShare}
                aria-label="Copiar enlace público del perfil"
              >
                <ShareIcon size={16} />
                <span>Compartir</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                render={<a href={primaryHref} onClick={handleInternalClick(primaryHref)} />}
              >
                {sessionActive ? "Ver en PitchLab" : "7 días gratis"}
              </Button>
            </div>
          </div>
        </SofascoreCard>

        <section aria-label="Récord sellado">
          {publicRecord === null ? (
            <SofascoreCard title="Récord sellado" meta="En unidades">
              <SofascoreEmptyState
                title={`@${profile.handle} todavía no tiene picks cerrados publicados`}
                description="Todas las cifras públicas se expresan en unidades, sin montos en pesos."
              />
            </SofascoreCard>
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

        <ProfileVerificationReceipt
          handle={profile.handle}
          receiptPayload={receipt.payload}
          settledCount={receipt.settled}
          isPrivate={receipt.isPrivate}
          onNavigate={navigateTo}
          onNotify={(msg, tone) => pushToast(msg, tone)}
        />

        {badges?.public.length ? (
          <ProfileBadgesSection isOwn={false} publicBadges={badges.public} />
        ) : null}

        <SofascoreCard as="section" className="pl-prof-public-cta">
          <div className="pl-prof-public-cta-row">
            <div className="pl-prof-public-cta-copy">
              <h2 className="pl-prof-public-cta-title">
                Récord sellado antes del inicio del partido
              </h2>
              <p className="pl-prof-public-cta-desc">
                Todas las cifras se calculan en unidades (sin montos en pesos). Los picks abiertos
                y el detalle completo del modelo se desbloquean con acceso al club.
              </p>
            </div>
            <Button
              variant="primary"
              size="default"
              render={<a href={primaryHref} onClick={handleInternalClick(primaryHref)} />}
            >
              <MaestroIcon name="shield" size={16} />
              <span>
                {sessionActive ? "Abrir perfil en el club" : "Probar 7 días sin tarjeta"}
              </span>
            </Button>
          </div>
        </SofascoreCard>
      </div>
    </PublicSiteShell>
  );
}
