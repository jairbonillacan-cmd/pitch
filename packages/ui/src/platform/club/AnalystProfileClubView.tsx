"use client";

import React, { useMemo, useState } from "react";
import { LeagueBadge } from "../../sports";
import { formatOddsValue } from "../access-guard";
import { ExampleBadge, ExampleNotice, LensGlowOrbs, MaestroIcon, UserBadges } from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { usePlatform } from "../platform-provider";
import { TIPSTAR_CREATORS } from "../spacetime-catalog";

interface ResolvedAnalystProfile {
  handle: string;
  name: string;
  roleBadge: string;
  specialty: string;
  bio: string;
  avatarInitials: string;
  avatarGradVar: string;
  verifiedUnits: string;
  clvAvg: string;
  roi95Ci: string;
  settledCount: number;
  followers: number;
  following: number;
  favSlugs: readonly string[];
  isTipstar: boolean;
  promoCode?: string;
  weeklyPickSlug?: string;
}

export function AnalystProfileClubView({
  handle,
}: {
  handle: string;
}): React.JSX.Element {
  const {
    dataset,
    journal,
    socialPosts,
    oddsFormat,
    viewerRole,
    openShareTicket,
    pushToast,
    navigateTo,
  } = usePlatform();

  const [following, setFollowing] = useState<boolean>(true);
  const cleanHandle = handle.replace(/^@/, "").trim().toLowerCase();

  const profile = useMemo<ResolvedAnalystProfile>(() => {
    const tipstar = TIPSTAR_CREATORS.find(
      (c) => c.handle.toLowerCase() === cleanHandle,
    );
    if (tipstar) {
      return {
        handle: tipstar.handle,
        name: tipstar.name,
        roleBadge: "Tipstar Oficial",
        specialty: tipstar.specialty,
        bio: tipstar.weeklyPickThesis,
        avatarInitials: tipstar.avatarInitials,
        avatarGradVar: tipstar.avatarGradVar,
        verifiedUnits: tipstar.verifiedUnits,
        clvAvg: tipstar.clvAvg,
        roi95Ci: tipstar.roi95Ci,
        settledCount: tipstar.settledCount,
        followers: 420 + tipstar.activeReferrals * 9,
        following: 28,
        favSlugs:
          tipstar.handle === "sofia_nfl"
            ? ["nfl", "liga-mx", "premier-league"]
            : tipstar.handle === "carlos_quant"
              ? ["premier-league", "laliga", "serie-a"]
              : ["liga-mx", "bundesliga", "nfl"],
        isTipstar: true,
        promoCode: tipstar.promoCode,
        weeklyPickSlug: tipstar.weeklyPickSlug,
      };
    }

    if (cleanHandle === "jair" || cleanHandle === "jair_founder") {
      return {
        handle: cleanHandle,
        name: "Jair R.",
        roleBadge: "Founder & Socio Pase PitchLab Ultra",
        specialty: "NFL y Liga MX",
        bio: "Fundador de PitchLab. Analizo NFL y Liga MX antes de cada partido.",
        avatarInitials: "JR",
        avatarGradVar: "var(--avatar-grad-4)",
        verifiedUnits: "+9.2u",
        clvAvg: "+2.8 %",
        roi95Ci: "+4.6 % (±2.8 %)",
        settledCount: 112,
        followers: 184,
        following: 19,
        favSlugs: ["nfl", "liga-mx", "premier-league"],
        isTipstar: false,
      };
    }

    if (cleanHandle === "socio_pl") {
      return {
        handle: "socio_pl",
        name: "Socio Pase PitchLab Ultra",
        roleBadge: "Socio Pase PitchLab Ultra",
        specialty: "Varias ligas",
        bio: "Socio de PitchLab. Todos mis picks quedan sellados antes de que empiece el partido.",
        avatarInitials: "SP",
        avatarGradVar: "var(--avatar-grad-5)",
        verifiedUnits: "+6.4u",
        clvAvg: "+2.6 %",
        roi95Ci: "+4.1 % (±3.1 %)",
        settledCount: Math.max(34, journal.length * 8),
        followers: 42,
        following: 12,
        favSlugs: ["liga-mx", "nfl", "premier-league"],
        isTipstar: false,
      };
    }

    const fallback = TIPSTAR_CREATORS[0]!;
    return {
      handle: fallback.handle,
      name: fallback.name,
      roleBadge: "Tipstar Oficial",
      specialty: fallback.specialty,
      bio: fallback.weeklyPickThesis,
      avatarInitials: fallback.avatarInitials,
      avatarGradVar: fallback.avatarGradVar,
      verifiedUnits: fallback.verifiedUnits,
      clvAvg: fallback.clvAvg,
      roi95Ci: fallback.roi95Ci,
      settledCount: fallback.settledCount,
      followers: 762,
      following: 28,
      favSlugs: ["nfl", "liga-mx", "premier-league"],
      isTipstar: true,
      promoCode: fallback.promoCode,
      weeklyPickSlug: fallback.weeklyPickSlug,
    };
  }, [cleanHandle, journal.length]);

  const posts = useMemo(
    () =>
      socialPosts.filter(
        (p) =>
          p.authorHandle.toLowerCase() === profile.handle.toLowerCase() ||
          (profile.handle === "jair" && p.authorHandle === "jair_founder"),
      ),
    [profile.handle, socialPosts],
  );
  const isExampleProfile =
    TIPSTAR_CREATORS.some((c) => c.isExample && c.handle === profile.handle) ||
    socialPosts.some((p) => p.isExample && p.authorHandle === profile.handle);

  const memberJournalFeed =
    !profile.isTipstar ? journal.slice(0, 4) : [];

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath={`/app/u/${profile.handle}`}>
        {isExampleProfile ? (
          <ExampleNotice>
            @{profile.handle} es un perfil de ejemplo. Su récord, unidades y publicaciones son
            ficticios y sirven para mostrar cómo se verá un perfil verificado.
          </ExampleNotice>
        ) : null}
        <section className="pl-profile glass-card glass-ring rounded-3xl overflow-hidden">
          {/* Portada */}
          <div className="pl-profile-cover" style={{ background: profile.avatarGradVar }} aria-hidden="true">
            <LensGlowOrbs />
          </div>

          <div className="px-5 sm:px-6 pb-6 space-y-4">
            {/* Avatar sobre la portada + acciones */}
            <div className="flex items-end justify-between gap-3">
              <span
                className="pl-profile-avatar"
                style={{ background: profile.avatarGradVar, color: "var(--share-card-fg)" }}
                aria-hidden="true"
              >
                {profile.avatarInitials}
              </span>
              <div className="flex flex-wrap items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  className="pl-btn-glass text-xs !min-h-9"
                  aria-label="Compartir perfil"
                  onClick={() =>
                    openShareTicket({
                      kind: "pick",
                      title: `@${profile.handle}`,
                      subtitle: profile.specialty,
                      leagueLabel: "Récord",
                      pickLabel: `${profile.verifiedUnits} · ${profile.settledCount} picks`,
                      probability: 0.63,
                      fairDecimal: 1.59,
                      marketDecimal: 1.87,
                      units: 1.5,
                      gameStatus: "FT",
                    })
                  }
                >
                  <MaestroIcon name="share" size={14} />
                </button>
                <button
                  type="button"
                  className={`pl-feed-follow !min-h-9 !px-5 ${following ? "is-following" : ""}`}
                  onClick={() => {
                    setFollowing((prev) => !prev);
                    pushToast(
                      following ? `Dejaste de seguir a @${profile.handle}.` : `Ahora sigues a @${profile.handle}.`,
                      "default",
                    );
                  }}
                >
                  {following ? "Siguiendo" : "Seguir"}
                </button>
              </div>
            </div>

            {/* Nombre, insignias y bio */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="m-0 text-2xl sm:text-3xl font-extrabold tracking-tight">{profile.name}</h1>
                <UserBadges roleLabel={profile.roleBadge} />
                {isExampleProfile ? <ExampleBadge /> : null}
              </div>
              <div className="text-sm" style={{ color: "var(--pl-text-muted)" }}>
                @{profile.handle} · {profile.specialty}
              </div>
              <p className="m-0 text-[0.95rem] leading-relaxed max-w-2xl" style={{ color: "var(--pl-text)" }}>
                {profile.bio}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm num">
                <span style={{ color: "var(--pl-text-muted)" }}>
                  <strong style={{ color: "var(--pl-text)" }}>{profile.following}</strong> siguiendo
                </span>
                <span style={{ color: "var(--pl-text-muted)" }}>
                  <strong style={{ color: "var(--pl-text)" }}>{profile.followers + (following ? 1 : 0)}</strong>{" "}
                  seguidores
                </span>
                <span className="inline-flex items-center gap-1.5" aria-label="Ligas favoritas">
                  {dataset.leagues
                    .filter((lg) => profile.favSlugs.includes(lg.league))
                    .map((lg) => (
                      <LeagueBadge key={lg.league} league={lg.league} label={lg.label} size={18} />
                    ))}
                </span>
              </div>
            </div>

            {/* Récord en lenguaje claro */}
            <dl className="pl-profile-stats num">
              <div>
                <dt>Unidades ganadas</dt>
                <dd style={{ color: "var(--pl-success)" }}>{profile.verifiedUnits}</dd>
              </div>
              <div>
                <dt>Rendimiento</dt>
                <dd>{profile.roi95Ci.split("(")[0]!.trim()}</dd>
              </div>
              <div>
                <dt>Picks cerrados</dt>
                <dd>{profile.settledCount}</dd>
              </div>
            </dl>

            {profile.isTipstar && profile.weeklyPickSlug ? (
              <a
                href={`/p/${profile.weeklyPickSlug}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo(`/p/${profile.weeklyPickSlug}`);
                }}
                className="pl-profile-cta"
              >
                <span className="space-y-0.5">
                  <strong className="block text-sm">Pick gratis de la semana</strong>
                  <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Con el código {profile.promoCode} tienes días gratis de Pase PitchLab Ultra
                  </span>
                </span>
                <MaestroIcon name="chevronRight" size={16} />
              </a>
            ) : null}
          </div>
        </section>

        {/* Boletos y aportes verificados */}
        <section className="space-y-3">
          <h2 className="m-0 text-lg font-extrabold">
            Publicaciones
          </h2>

          {posts.map((p) => (
            <article
              key={p.id}
              className="glass-card glass-ring rounded-2xl p-5 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="pl-pill pl-pill--brand">
                  {p.leagueLabel} · {p.originType}
                </span>
                <span className="num" style={{ color: "var(--pl-text-muted)" }}>
                  {p.createdAt}
                </span>
              </div>
              {viewerRole !== "visitor" || profile.isTipstar ? (
                <>
                  <strong className="block text-sm font-extrabold">
                    {p.matchLabel} — {p.pickBadge}
                  </strong>
                  <p
                    className="m-0 text-sm"
                    style={{ color: "var(--pl-text-secondary)" }}
                  >
                    {p.body}
                  </p>
                </>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="locked-redact font-extrabold text-sm">
                    Pick reservado para socios
                  </span>
                  <a
                    href="/signup"
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo("/signup");
                    }}
                    className="pl-btn-primary text-xs min-h-8 px-3"
                  >
                    Desbloquear
                  </a>
                </div>
              )}
            </article>
          ))}

          {memberJournalFeed.map((j) => (
            <article
              key={j.id}
              className="glass-card glass-ring rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  {j.leagueLabel} · {j.matchLabel} · {j.sealedAt}
                </span>
                <strong className="block text-sm font-extrabold mt-0.5">
                  {j.pickLabel} ({j.units.toFixed(1)}u)
                </strong>
              </div>
              <div className="text-right num text-xs">
                <strong className="block text-sm">
                  {formatOddsValue(j.userDecimal, oddsFormat)}
                </strong>
                <span
                  style={{
                    color: j.clvPct >= 0 ? "var(--pl-success)" : "var(--pl-warning)",
                  }}
                >
                  CLV +{j.clvPct.toFixed(1)} %
                </span>
              </div>
            </article>
          ))}
        </section>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
