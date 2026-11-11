"use client";

import React, { useMemo, useRef, useState } from "react";
import { getLogoPath, getTeamColors } from "@pitchlab/sports-assets";
import { LeagueBadge, TeamBadge } from "../../sports";
import { formatOddsValue, getSessionWatermark, pickReferenceDecimal } from "../access-guard";
import { downloadTicketPng } from "../components/share-ticket-raster";
import {
  CrestPedestal,
  GlassActionRow,
  LensGlowOrbs,
  MaestroIcon,
  ExampleBadge,
  ExampleNotice,
  NoticeCard,
  StackedAvatars,
  UserBadges,
} from "../components/MaestroPrimitives";
import { TopLayerModalDialog } from "../components/PlatformOverlays";
import {
  AtmosphereStage,
  ClubWorkspaceShell,
} from "../components/ShellChrome";
import { usePlatform } from "../platform-provider";
import { TIPSTAR_CREATORS } from "../spacetime-catalog";
import type { MatchPick } from "../types";

const ACTIVE_MEMBER_AVATARS = [
  { initials: "SM", gradVar: "var(--avatar-grad-1)", label: "Sofía Méndez" },
  { initials: "CV", gradVar: "var(--avatar-grad-2)", label: "Carlos Vega" },
  { initials: "DA", gradVar: "var(--avatar-grad-3)", label: "Diego Aranda" },
  { initials: "JR", gradVar: "var(--avatar-grad-4)", label: "Jair R." },
] as const;

interface LeaderboardRow {
  handle: string;
  name: string;
  roleLabel: string;
  specialty: string;
  avatarInitials: string;
  avatarGradVar: string;
  settledCount: number;
  clvNum: number;
  roiLabel: string;
  unitsNum: number;
  isTipstar: boolean;
}

const BASE_LEADERBOARD_ROWS: readonly LeaderboardRow[] = [
  ...TIPSTAR_CREATORS.map((c) => ({
    handle: c.handle,
    name: c.name,
    roleLabel: "Tipstar Oficial",
    specialty: c.specialty,
    avatarInitials: c.avatarInitials,
    avatarGradVar: c.avatarGradVar,
    settledCount: c.settledCount,
    clvNum: Number.parseFloat(c.clvAvg.replace(/[^0-9.-]/g, "")) || 3.5,
    roiLabel: c.roi95Ci,
    unitsNum: Number.parseFloat(c.verifiedUnits.replace(/[^0-9.-]/g, "")) || 12.0,
    isTipstar: true,
  })),
  {
    handle: "jair_founder",
    name: "Jair R.",
    roleLabel: "Socio Pase PitchLab Ultra",
    specialty: "NFL & Liga MX · Valor Geodesic",
    avatarInitials: "JR",
    avatarGradVar: "var(--avatar-grad-4)",
    settledCount: 112,
    clvNum: 2.8,
    roiLabel: "+4.6 % (±2.8 %)",
    unitsNum: 9.2,
    isTipstar: false,
  },
  {
    handle: "socio_pl",
    name: "Socio Pase PitchLab Ultra",
    roleLabel: "Socio Pase PitchLab Ultra",
    specialty: "Multi-Liga · Bitácora Auditada",
    avatarInitials: "SP",
    avatarGradVar: "var(--avatar-grad-5)",
    settledCount: 64,
    clvNum: 2.6,
    roiLabel: "+4.1 % (±3.1 %)",
    unitsNum: 6.4,
    isTipstar: false,
  },
];

export function SocialVipClubView(): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    oddsFormat,
    journal,
    socialPosts,
    publishSocialPost,
    addSocialComment,
    toggleSocialLike,
    blockedSpamAttempts,
    sealPickToJournal,
    openShareTicket,
    pushToast,
    navigateTo,
  } = usePlatform();

  const [tab, setTab] = useState<"feed" | "consenso" | "ranking">("feed");
  const [feedFilter, setFeedFilter] = useState<"all" | "following">("all");
  const [followedHandles, setFollowedHandles] = useState<string[]>([
    "sofia_nfl",
    "carlos_quant",
  ]);
  const [copiedCounts, setCopiedCounts] = useState<Record<string, number>>({
    "sp-1": 14,
    "sp-2": 9,
    "sp-3": 7,
  });

  const upcomingGames = useMemo(
    () => dataset.games.filter((g) => g.status !== "FT"),
    [dataset.games],
  );

  const [selectedGameId, setSelectedGameId] = useState<string>(
    () => upcomingGames[0]?.id ?? dataset.games[0]?.id ?? "",
  );
  const [draftBody, setDraftBody] = useState<string>("");
  const [draftOrigin, setDraftOrigin] = useState<"Spacetime Suite" | "Bitácora Propia">(
    "Spacetime Suite",
  );
  const [composerErr, setComposerErr] = useState<string>("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyErrors, setReplyErrors] = useState<Record<string, string>>({});
  const [openThreads, setOpenThreads] = useState<string[]>([]);
  const toggleThread = (id: string) =>
    setOpenThreads((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Controles de Ranking CLV (Temporada / 30 días + CLV Medio / Unidades)
  const [lbWindow, setLbWindow] = useState<"season" | "30d">("season");
  const [lbSort, setLbSort] = useState<"clv" | "units">("clv");

  const selectedMatch = useMemo(
    () =>
      upcomingGames.find((g) => g.id === selectedGameId) ??
      upcomingGames[0] ??
      dataset.games[0],
    [dataset.games, selectedGameId, upcomingGames],
  );

  const visiblePosts = useMemo(() => {
    if (feedFilter === "all") return socialPosts;
    return socialPosts.filter(
      (p) =>
        followedHandles.includes(p.authorHandle) ||
        p.authorHandle === "socio_pl" ||
        p.authorHandle === "sofia_nfl",
    );
  }, [feedFilter, followedHandles, socialPosts]);

  const rankedAnalysts = useMemo(() => {
    const windowFactor = lbWindow === "30d" ? 0.58 : 1;
    const clvBoost = lbWindow === "30d" ? 1.06 : 1;
    return BASE_LEADERBOARD_ROWS.map((row) => ({
      ...row,
      displayCount: Math.max(30, Math.round(row.settledCount * windowFactor)),
      displayClv: Math.round(row.clvNum * clvBoost * 10) / 10,
      displayUnits: Math.round(row.unitsNum * windowFactor * 10) / 10,
    })).sort((a, b) =>
      lbSort === "clv"
        ? b.displayClv - a.displayClv
        : b.displayUnits - a.displayUnits,
    );
  }, [lbSort, lbWindow]);

  const toggleFollow = (handle: string) => {
    setFollowedHandles((prev) => {
      const exists = prev.includes(handle);
      pushToast(
        exists
          ? `Dejaste de seguir a @${handle}.`
          : `Ahora sigues los boletos verificados de @${handle}.`,
        "default",
      );
      return exists ? prev.filter((h) => h !== handle) : [...prev, handle];
    });
  };

  const handlePublish = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setComposerErr("");

    const journalEntry = journal[0];
    const useBitacora = draftOrigin === "Bitácora Propia" && Boolean(journalEntry);

    const res = publishSocialPost({
      leagueLabel: useBitacora
        ? journalEntry!.leagueLabel
        : selectedMatch?.leagueLabel ?? "Liga MX",
      matchLabel: useBitacora
        ? journalEntry!.matchLabel
        : selectedMatch
          ? `${selectedMatch.home.shortName} vs ${selectedMatch.away.shortName}`
          : "Análisis de jornada",
      pickBadge: useBitacora
        ? `${journalEntry!.pickLabel} · ${journalEntry!.units.toFixed(1)}u`
        : selectedMatch?.picks[0]
          ? `${selectedMatch.picks[0].label} · ${selectedMatch.picks[0].suggestedUnits.toFixed(1)}u`
          : "Pick principal · 1.5u",
      originType: draftOrigin,
      body: draftBody,
    });
    if (!res.ok) {
      setComposerErr(res.error ?? "No se pudo publicar.");
      return;
    }
    setDraftBody("");
  };

  const handleCopyPostToJournal = (post: (typeof socialPosts)[number]) => {
    const matchedGame =
      dataset.games.find(
        (g) =>
          g.id === post.gameId ||
          post.matchLabel.toLowerCase().includes(g.home.shortName.toLowerCase()) ||
          g.leagueLabel.toLowerCase() === post.leagueLabel.toLowerCase(),
      ) ??
      selectedMatch ??
      dataset.games[0];

    const basePick = matchedGame?.picks[0];
    const syntheticPick: MatchPick = basePick
      ? {
          ...basePick,
          id: `soc-copy-${post.id}-${Date.now()}`,
          matchLabel: post.matchLabel,
          leagueLabel: post.leagueLabel,
          label: post.pickBadge,
        }
      : {
          id: `soc-copy-${post.id}-${Date.now()}`,
          gameId: matchedGame?.id ?? "soc-game",
          league: matchedGame?.league ?? "nfl",
          leagueLabel: post.leagueLabel,
          matchLabel: post.matchLabel,
          kickoffLocal: matchedGame?.kickoffLocal ?? "Hoy",
          gameStatus: "NS",
          slotIndex: 0,
          category: "principal",
          categoryLabel: "Comunidad VIP",
          risk: "medio",
          engineKey: "tachyon",
          engineName: "PitchLab Spacetime Suite v3.0",
          marketGroup: "Principal",
          selectionKey: "community_copy",
          conflictGroup: "independent",
          label: post.pickBadge,
          rationale: post.body,
          p: 0.61,
          fairDecimal: 1.64,
          fairAmerican: -156,
          marketDecimal: 1.85,
          marketAmerican: -118,
          edgePts: 3.4,
          confidenceScore: 76,
          suggestedUnits: 1.0,
        };

    sealPickToJournal(
      syntheticPick,
      1.0,
      pickReferenceDecimal(syntheticPick),
      `Copiado de @${post.authorHandle} en Comunidad VIP`,
    );
    setCopiedCounts((prev) => ({
      ...prev,
      [post.id]: (prev[post.id] ?? 4) + 1,
    }));
  };

  const watermark = getSessionWatermark(viewerRole);

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/social">
        <ExampleNotice>
          La Comunidad VIP todavía no abre. Los perfiles, publicaciones, récords y el ranking de
          esta vista son ejemplos para mostrar cómo funcionará; lo que publiques tú sí es tuyo.
        </ExampleNotice>
        {/* Cabecera estilo Prototipo Maestro */}
        <section className="glass-card glass-ring rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="pl-pill pl-pill--brand">
                <MaestroIcon name="users" size={13} />
                Solo socios
              </span>
              <StackedAvatars items={ACTIVE_MEMBER_AVATARS} extraCount={38} />
            </div>
            <h1 className="m-0 text-2xl sm:text-3xl font-extrabold tracking-tight">
              Comunidad
            </h1>
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
              Picks y opiniones de socios y tipstars. Sin enlaces externos ni spam.
            </p>
          </div>

          <div className="seg-well" role="tablist" aria-label="Vistas de comunidad">
            <button
              id="social-tab-feed"
              type="button"
              role="tab"
              aria-selected={tab === "feed"}
              className="seg-btn"
              onClick={() => setTab("feed")}
            >
              <MaestroIcon name="users" size={14} />
              <span>Feed</span>
            </button>
            <button
              id="social-tab-consenso"
              type="button"
              role="tab"
              aria-selected={tab === "consenso"}
              className="seg-btn"
              onClick={() => setTab("consenso")}
            >
              <MaestroIcon name="flame" size={14} />
              <span>Consenso</span>
            </button>
            <button
              id="social-tab-ranking"
              type="button"
              role="tab"
              aria-selected={tab === "ranking"}
              className="seg-btn"
              onClick={() => setTab("ranking")}
            >
              <MaestroIcon name="trophy" size={14} />
              <span>Ranking</span>
            </button>
          </div>
        </section>

        {viewerRole === "visitor" ? (
          <section className="glass-lens glass-ring glass-ring--featured relative overflow-hidden rounded-3xl p-6 space-y-3">
            <LensGlowOrbs subtle />
            <div className="relative z-10 space-y-3">
              <span className="pl-pill pl-pill--brand">
                <MaestroIcon name="lock" size={13} />
                Pase PitchLab Ultra
              </span>
              <h2 className="m-0 text-xl font-extrabold">
                La comunidad es solo para socios
              </h2>
              <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                Con tu prueba gratis puedes leer y publicar picks con otros socios y tipstars.
              </p>
              <a
                href="/signup"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/signup");
                }}
                className="pl-btn-primary text-xs"
              >
                Activar 7 días gratis
                <MaestroIcon name="arrowRight" size={14} />
              </a>
            </div>
          </section>
        ) : null}

        {/* TAB 1: BOLETOS & DEBATE (2 COLUMNAS ASIMÉTRICAS lg:grid-cols-12) */}
        {viewerRole !== "visitor" && tab === "feed" ? (
          <div
            role="tabpanel"
            aria-labelledby="social-tab-feed"
            className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start"
          >
            {/* Timeline (8 cols) */}
            <div className="lg:col-span-8">
              <div className="pl-feed glass-card glass-ring rounded-2xl overflow-hidden">
                {/* Pestañas Para ti / Siguiendo */}
                <div className="pl-feed-tabs" role="group" aria-label="Filtrar publicaciones">
                  <button
                    type="button"
                    aria-pressed={feedFilter === "all"}
                    onClick={() => setFeedFilter("all")}
                  >
                    Para ti
                  </button>
                  <button
                    type="button"
                    aria-pressed={feedFilter === "following"}
                    onClick={() => setFeedFilter("following")}
                  >
                    Siguiendo
                  </button>
                </div>

                {/* Caja para publicar */}
                <form onSubmit={handlePublish} className="pl-feed-composer">
                  <span
                    className="pl-feed-avatar"
                    style={{ background: "var(--avatar-grad-2)", color: "var(--pl-on-solid)" }}
                    aria-hidden="true"
                  >
                    JR
                  </span>
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <textarea
                      rows={2}
                      aria-label="Escribe tu publicación"
                      value={draftBody}
                      onChange={(e) => {
                        setDraftBody(e.target.value);
                        if (composerErr) setComposerErr("");
                      }}
                      placeholder="¿Qué ves en la jornada?"
                      className="pl-feed-textarea"
                    />
                    {composerErr ? (
                      <p
                        className="m-0 text-xs font-semibold flex items-center gap-1.5"
                        role="alert"
                        style={{ color: "var(--pl-danger)" }}
                      >
                        <MaestroIcon name="shield" size={14} />
                        <span>{composerErr}</span>
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 hairline-t">
                      <label className="pl-feed-attach">
                        <MaestroIcon name="ticket" size={14} />
                        <span className="sr-only">Partido de tu publicación</span>
                        <select
                          id="social-match-select"
                          value={selectedGameId}
                          onChange={(e) => setSelectedGameId(e.target.value)}
                        >
                          {(upcomingGames.length > 0 ? upcomingGames : dataset.games)
                            .slice(0, 12)
                            .map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.home.shortName} vs {g.away.shortName}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        type="submit"
                        className="pl-btn-primary text-xs !min-h-9 !px-4"
                        disabled={draftBody.trim().length === 0}
                      >
                        Publicar
                      </button>
                    </div>
                  </div>
                </form>

                {/* Publicaciones */}
                {visiblePosts.map((post) => {
                  const isFollowing = followedHandles.includes(post.authorHandle);
                  const isMine = post.authorHandle === "socio_pl";
                  const matchedGame = dataset.games.find(
                    (g) =>
                      g.id === post.gameId ||
                      post.matchLabel.toLowerCase().includes(g.home.shortName.toLowerCase()),
                  );
                  const copies = copiedCounts[post.id] ?? 5;
                  const threadOpen = openThreads.includes(post.id);
                  const profileHref = `/app/u/${post.authorHandle}`;

                  return (
                    <article key={post.id} className="pl-feed-post">
                      <a
                        href={profileHref}
                        onClick={(e) => {
                          e.preventDefault();
                          navigateTo(profileHref);
                        }}
                        className="pl-feed-avatar no-underline"
                        style={{ background: post.avatarGradVar, color: "var(--share-card-fg)" }}
                        aria-label={`Perfil de ${post.authorName}`}
                      >
                        {post.authorName.slice(0, 2).toUpperCase()}
                      </a>

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
                            <a
                              href={profileHref}
                              onClick={(e) => {
                                e.preventDefault();
                                navigateTo(profileHref);
                              }}
                              className="font-extrabold no-underline hover:underline truncate"
                            >
                              {post.authorName}
                            </a>
                            <UserBadges roleLabel={post.roleBadge} />
                            <span className="truncate" style={{ color: "var(--pl-text-muted)" }}>
                              @{post.authorHandle} · {post.createdAt}
                            </span>
                            {post.isExample ? <ExampleBadge /> : null}
                          </div>
                          {!isMine ? (
                            <button
                              type="button"
                              className={`pl-feed-follow ${isFollowing ? "is-following" : ""}`}
                              onClick={() => toggleFollow(post.authorHandle)}
                            >
                              {isFollowing ? "Siguiendo" : "Seguir"}
                            </button>
                          ) : null}
                        </div>

                        <p className="m-0 text-[0.95rem] leading-relaxed" style={{ color: "var(--pl-text)" }}>
                          {post.body}
                        </p>

                        {/* Pick citado */}
                        <div className="pl-feed-quote">
                          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                            {matchedGame ? (
                              <>
                                <TeamBadge
                                  league={matchedGame.league}
                                  slug={matchedGame.home.slug}
                                  name={matchedGame.home.name}
                                  size={16}
                                />
                                <TeamBadge
                                  league={matchedGame.league}
                                  slug={matchedGame.away.slug}
                                  name={matchedGame.away.name}
                                  size={16}
                                />
                              </>
                            ) : (
                              <MaestroIcon name="ticket" size={14} />
                            )}
                            <span className="truncate">
                              {post.leagueLabel} · {post.matchLabel}
                            </span>
                          </div>
                          <div className="font-extrabold text-sm">{post.pickBadge}</div>
                          {post.verifiedRecord ? (
                            <div className="text-xs num font-semibold" style={{ color: "var(--pl-success)" }}>
                              Récord de @{post.authorHandle}: {post.verifiedRecord}
                            </div>
                          ) : null}
                        </div>

                        {/* Acciones */}
                        <div className="pl-feed-actions">
                          <button
                            type="button"
                            aria-expanded={threadOpen}
                            onClick={() => toggleThread(post.id)}
                            aria-label={`Responder (${post.comments.length})`}
                          >
                            <MaestroIcon name="message" size={16} />
                            <span className="num">{post.comments.length}</span>
                          </button>
                          <button
                            type="button"
                            aria-pressed={Boolean(post.likedByMe)}
                            className={post.likedByMe ? "is-liked" : ""}
                            onClick={() => toggleSocialLike(post.id)}
                            aria-label={`Me gusta (${post.likes})`}
                          >
                            <MaestroIcon name="heart" size={16} />
                            <span className="num">{post.likes}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyPostToJournal(post)}
                            aria-label={`Llevar a mi bitácora (${copies})`}
                            title="Llevar a mi bitácora"
                          >
                            <MaestroIcon name="plus" size={16} />
                            <span className="num">{copies}</span>
                          </button>
                          <button
                            type="button"
                            aria-label="Compartir"
                            onClick={() =>
                              openShareTicket({
                                kind: "pick",
                                title: post.matchLabel,
                                subtitle: `Comunidad · @${post.authorHandle}`,
                                leagueLabel: post.leagueLabel,
                                pickLabel: post.pickBadge,
                                probability: 0.62,
                                fairDecimal: 1.61,
                                marketDecimal: 1.85,
                                units: 1.5,
                                gameStatus: "NS",
                              })
                            }
                          >
                            <MaestroIcon name="share" size={16} />
                          </button>
                        </div>

                        {/* Respuestas */}
                        {threadOpen ? (
                          <div className="pl-feed-thread">
                            {post.comments.map((c) => (
                              <div key={c.id} className="text-sm">
                                <span className="font-bold">@{c.authorHandle}</span>{" "}
                                <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                                  · {c.createdAt}
                                </span>
                                <p className="m-0 mt-0.5" style={{ color: "var(--pl-text-secondary)" }}>
                                  {c.body}
                                </p>
                              </div>
                            ))}

                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                aria-label={`Responder a ${post.authorName}`}
                                value={replyDrafts[post.id] ?? ""}
                                onChange={(e) => {
                                  setReplyDrafts((prev) => ({ ...prev, [post.id]: e.target.value }));
                                  if (replyErrors[post.id]) {
                                    setReplyErrors((prev) => ({ ...prev, [post.id]: "" }));
                                  }
                                }}
                                placeholder="Escribe tu respuesta"
                                className="glass-input flex-1 px-3 py-2 text-sm min-w-0"
                              />
                              <button
                                type="button"
                                className="pl-btn-glass text-xs min-h-9 px-3"
                                onClick={() => {
                                  const res = addSocialComment(post.id, replyDrafts[post.id] ?? "");
                                  if (res.ok) {
                                    setReplyDrafts((prev) => ({ ...prev, [post.id]: "" }));
                                    setReplyErrors((prev) => ({ ...prev, [post.id]: "" }));
                                  } else if (res.error) {
                                    setReplyErrors((prev) => ({ ...prev, [post.id]: res.error ?? "" }));
                                  }
                                }}
                              >
                                Responder
                              </button>
                            </div>
                            {replyErrors[post.id] ? (
                              <p className="m-0 text-xs font-semibold" style={{ color: "var(--pl-danger)" }}>
                                {replyErrors[post.id]}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}

                {visiblePosts.length === 0 ? (
                  <p className="m-0 p-8 text-center text-sm" style={{ color: "var(--pl-text-muted)" }}>
                    Todavía no sigues a nadie. Sigue a un tipstar para ver sus picks aquí.
                  </p>
                ) : null}
              </div>
            </div>

            {/* Columna derecha sticky (4 cols) */}
            <aside className="lg:col-span-4 lg:sticky lg:top-20 space-y-4">
              {/* Tipstars y Socios Top CLV */}
              <div className="glass-card glass-ring rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="m-0 text-sm font-extrabold flex items-center gap-1.5">
                    <MaestroIcon
                      name="trophy"
                      size={15}
                      style={{ color: "var(--pl-brand)" }}
                    />
                    <span>A quién seguir</span>
                  </h2>
                  <button
                    type="button"
                    className="text-xs font-bold bg-transparent border-0 p-0 cursor-pointer"
                    style={{ color: "var(--pl-brand)" }}
                    onClick={() => setTab("ranking")}
                  >
                    Ver tabla
                  </button>
                </div>

                <div className="space-y-1">
                  {BASE_LEADERBOARD_ROWS.slice(0, 4).map((a) => {
                    const following = followedHandles.includes(a.handle);
                    return (
                      <div
                        key={a.handle}
                        className="py-2 flex items-center justify-between gap-2 hairline-b last:border-b-0"
                      >
                        <a
                          href={`/app/u/${a.handle}`}
                          onClick={(e) => {
                            e.preventDefault();
                            navigateTo(`/app/u/${a.handle}`);
                          }}
                          className="flex items-center gap-2.5 min-w-0 no-underline"
                        >
                          <span
                            className="w-8 h-8 rounded-full avatar-ring inline-flex items-center justify-center text-xs font-extrabold shrink-0"
                            style={{
                              background: a.avatarGradVar,
                              color: "var(--share-card-fg)",
                            }}
                          >
                            {a.avatarInitials}
                          </span>
                          <span className="min-w-0 block">
                            <strong className="block text-xs font-bold truncate">
                              {a.name}
                            </strong>
                            <span
                              className="block text-xs num truncate"
                              style={{ color: "var(--pl-success)" }}
                            >
                              {a.isTipstar ? "Tipstar · " : ""}CLV +{a.clvNum.toFixed(1)} % · +
                              {a.unitsNum.toFixed(1)}u
                            </span>
                          </span>
                        </a>

                        <button
                          type="button"
                          className="pl-btn-glass text-xs min-h-7 px-2.5 shrink-0"
                          onClick={() => toggleFollow(a.handle)}
                        >
                          {following ? "Siguiendo" : "Seguir"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tarjeta rápida Referidos Doble Vía (+15d ambos) */}
              <GlassActionRow
                href="/app/account"
                onClick={() => navigateTo("/app/account")}
                leading={
                  <span
                    className="sq-box"
                    style={{ color: "var(--pl-brand)" }}
                  >
                    <MaestroIcon name="gift" size={18} />
                  </span>
                }
                title="Referidos Doble Vía (+15 días ambos)"
                subtitle="7 días gratis a tu amigo y +15 días al pagar su 1.er mes"
                trailingBadge="+15d"
              />
            </aside>
          </div>
        ) : null}

        {/* TAB 2: CONSENSO VS. SPACETIME SUITE */}
        {viewerRole !== "visitor" && tab === "consenso" ? (
          <div
            role="tabpanel"
            aria-labelledby="social-tab-consenso"
            className="space-y-4"
          >
            <NoticeCard
              icon="chart"
              tone="brand"
              badgeText="Radar Contrarian"
              title="Consenso Socios VIP vs. Spacetime Suite v3.0"
            >
              <span>
                Detecta cuándo el sentimiento general sobrepaga a un favorito frente a la
                probabilidad fría de{" "}
                <strong>Tachyon v3.0, Singularity v3.0 y Minkowski v3.0</strong>.
              </span>
            </NoticeCard>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {upcomingGames.slice(0, 4).map((g, idx) => {
                const suitePct = Math.round((g.picks[0]?.p ?? 0.58) * 100);
                const communityPct = Math.min(
                  88,
                  Math.max(22, suitePct + (idx % 2 === 0 ? 11 : -3)),
                );
                const diff = communityPct - suitePct;
                const isDivergent = Math.abs(diff) >= 8;
                const ticketsCount = 26 + idx * 14;

                return (
                  <article
                    key={g.id}
                    className="glass-card glass-ring rounded-2xl p-5 space-y-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-2 font-bold">
                        <LeagueBadge league={g.league} label={g.leagueLabel} size={17} />
                        <span>
                          {g.leagueLabel} · {g.kickoffLocal}
                        </span>
                      </span>
                      <span
                        className={
                          isDivergent
                            ? "pl-pill pl-pill--warning"
                            : "pl-pill pl-pill--success"
                        }
                      >
                        <MaestroIcon
                          name={isDivergent ? "bolt" : "check"}
                          size={12}
                        />
                        <span>
                          {isDivergent
                            ? `Divergencia Contrarian (${diff > 0 ? `+${diff}` : diff} pts)`
                            : "Convergencia Suite + VIP"}
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CrestPedestal size="sm">
                          <TeamBadge
                            league={g.league}
                            slug={g.home.slug}
                            name={g.home.name}
                            size={24}
                          />
                        </CrestPedestal>
                        <div className="min-w-0">
                          <h2 className="m-0 text-base font-extrabold truncate">
                            {g.home.shortName} vs {g.away.shortName}
                          </h2>
                          <p
                            className="m-0 text-xs truncate"
                            style={{ color: "var(--pl-text-muted)" }}
                          >
                            Pick evaluado: {g.picks[0]?.label} ·{" "}
                            <span className="num">{ticketsCount} boletos sellados</span>
                          </p>
                        </div>
                      </div>
                      <CrestPedestal size="sm">
                        <TeamBadge
                          league={g.league}
                          slug={g.away.slug}
                          name={g.away.name}
                          size={24}
                        />
                      </CrestPedestal>
                    </div>

                    <div className="ticket-perf" />

                    {/* Barras duales de probabilidad */}
                    <div className="space-y-2.5 text-xs num">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span style={{ color: "var(--pl-text-secondary)" }}>
                            Spacetime Suite v3.0
                          </span>
                          <strong
                            className="font-extrabold"
                            style={{ color: "var(--pl-brand)" }}
                          >
                            {suitePct} %
                          </strong>
                        </div>
                        <div
                          className="pbar lead"
                          style={{ "--w": `${suitePct}%` } as React.CSSProperties}
                        >
                          <span />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span style={{ color: "var(--pl-text-secondary)" }}>
                            Consenso Socios VIP
                          </span>
                          <strong
                            className="font-extrabold"
                            style={{ color: "var(--pl-success)" }}
                          >
                            {communityPct} %
                          </strong>
                        </div>
                        <div
                          className="pbar pos"
                          style={{ "--w": `${communityPct}%` } as React.CSSProperties}
                        >
                          <span />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <span
                        className="text-xs"
                        style={{ color: "var(--pl-text-secondary)" }}
                      >
                        {isDivergent
                          ? `El consenso carga +${Math.abs(diff)} pts extra; revisa el Escudo Conservador.`
                          : "Modelo cuantitativo y boletos verificados alineados."}
                      </span>
                      <a
                        href={`/app/${g.league}/games/${g.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigateTo(`/app/${g.league}/games/${g.id}`);
                        }}
                        className="pl-btn-glass text-xs min-h-8 px-3 shrink-0"
                      >
                        <span>Ver partido</span>
                        <MaestroIcon name="chevronRight" size={14} />
                      </a>
                    </div>
                  </article>
                );
              })}
            </section>
          </div>
        ) : null}

        {/* TAB 3: RANKING CLV (IC 95 %) */}
        {viewerRole !== "visitor" && tab === "ranking" ? (
          <div
            role="tabpanel"
            aria-labelledby="social-tab-ranking"
            className="space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="seg-well" role="group" aria-label="Ventana del ranking">
                  <button
                    type="button"
                    className="seg-btn text-xs"
                    aria-pressed={lbWindow === "season"}
                    onClick={() => setLbWindow("season")}
                  >
                    Temporada
                  </button>
                  <button
                    type="button"
                    className="seg-btn text-xs"
                    aria-pressed={lbWindow === "30d"}
                    onClick={() => setLbWindow("30d")}
                  >
                    30 días
                  </button>
                </div>

                <div className="seg-well" role="group" aria-label="Criterio de ordenamiento">
                  <button
                    type="button"
                    className="seg-btn text-xs"
                    aria-pressed={lbSort === "clv"}
                    onClick={() => setLbSort("clv")}
                  >
                    CLV Medio
                  </button>
                  <button
                    type="button"
                    className="seg-btn text-xs"
                    aria-pressed={lbSort === "units"}
                    onClick={() => setLbSort("units")}
                  >
                    Unidades
                  </button>
                </div>
              </div>

              <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Elegibilidad: ≥ 30 picks sellados con cuota observada Geodesic v2.0 · IC 95 %
              </span>
            </div>

            <section className="glass-card glass-ring rounded-2xl p-5 space-y-3">
              <h2 className="m-0 text-lg font-extrabold">
                Leaderboard Verificado ({lbWindow === "season" ? "Temporada completa" : "Últimos 30 días"} · IC 95 %)
              </h2>

              <div
                className="pl-table-region"
                tabIndex={0}
                role="region"
                aria-label="Leaderboard verificado de analistas y Tipstars"
              >
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr
                      className="hairline-b text-xs"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      <th scope="col" className="py-2.5 pr-3">
                        Pos.
                      </th>
                      <th scope="col" className="py-2.5 pr-3">
                        Analista / Tipstar
                      </th>
                      <th scope="col" className="py-2.5 px-2">
                        Especialidad
                      </th>
                      <th scope="col" className="py-2.5 px-2 text-right">
                        Muestra
                      </th>
                      <th scope="col" className="py-2.5 px-2 text-right">
                        CLV Medio
                      </th>
                      <th scope="col" className="py-2.5 px-2 text-right">
                        ROI (IC 95 %)
                      </th>
                      <th scope="col" className="py-2.5 px-2 text-right">
                        Unidades
                      </th>
                      <th scope="col" className="py-2.5 pl-2 text-right">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedAnalysts.map((c, idx) => {
                      const following = followedHandles.includes(c.handle);
                      return (
                        <tr key={c.handle} className="hairline-b row-hover">
                          <td
                            className="py-3 pr-3 num font-extrabold"
                            style={{
                              color:
                                idx === 0 ? "var(--pl-brand)" : "var(--pl-text-muted)",
                            }}
                          >
                            {idx + 1}
                          </td>
                          <th scope="row" className="py-3 pr-3 font-normal">
                            <a
                              href={`/app/u/${c.handle}`}
                              onClick={(e) => {
                                e.preventDefault();
                                navigateTo(`/app/u/${c.handle}`);
                              }}
                              className="inline-flex items-center gap-2.5 no-underline hover:underline"
                            >
                              <span
                                className="w-8 h-8 rounded-full avatar-ring inline-flex items-center justify-center text-xs font-extrabold shrink-0"
                                style={{
                                  background: c.avatarGradVar,
                                  color: "var(--share-card-fg)",
                                }}
                              >
                                {c.avatarInitials}
                              </span>
                              <span>
                                <strong className="flex items-center gap-1.5 font-bold">
                                  {c.name}
                                  <ExampleBadge />
                                </strong>
                                <span
                                  className="block text-xs"
                                  style={{ color: "var(--pl-text-muted)" }}
                                >
                                  @{c.handle} · {c.roleLabel}
                                </span>
                              </span>
                            </a>
                          </th>
                          <td
                            className="py-3 px-2 text-xs"
                            style={{ color: "var(--pl-text-secondary)" }}
                          >
                            {c.specialty}
                          </td>
                          <td className="py-3 px-2 text-right num">
                            {c.displayCount} picks
                          </td>
                          <td className="py-3 px-2 text-right num">
                            <span className="pl-pill pl-pill--brand">
                              +{c.displayClv.toFixed(1)} %
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right num">{c.roiLabel}</td>
                          <td
                            className="py-3 px-2 text-right num font-extrabold"
                            style={{ color: "var(--pl-success)" }}
                          >
                            +{c.displayUnits.toFixed(1)}u
                          </td>
                          <td className="py-3 pl-2 text-right">
                            <button
                              type="button"
                              className="pl-btn-glass text-xs min-h-7 px-2.5"
                              onClick={() => toggleFollow(c.handle)}
                            >
                              {following ? "Siguiendo" : "+ Seguir"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="m-0 pt-2 hairline-t text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Unidades simuladas de análisis. Rendimiento pasado no garantiza resultados futuros.
                PitchLab no acepta apuestas ni entrega premios monetarios.
              </p>
            </section>
          </div>
        ) : null}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function TipstarPortalClubView(): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    setViewerRole,
    journal,
    oddsFormat,
    tipstarWeeklyPickOrigin,
    setTipstarWeeklyPickOrigin,
    selectedTipstarPickId,
    setSelectedTipstarPickId,
    openShareTicket,
    navigateTo,
    pushToast,
    accountsEnabled,
  } = usePlatform();

  const sofia = TIPSTAR_CREATORS[0]!;
  const [connectBusy, setConnectBusy] = useState<boolean>(false);

  // Alta de pagos con Stripe Connect (solo tipstars oficiales con cuenta real).
  const handleSetupPayouts = async () => {
    setConnectBusy(true);
    try {
      const res = await fetch("/api/tipstar/connect", { method: "POST", credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && json.url) {
        window.location.assign(json.url);
        return;
      }
      pushToast(json.error ?? "No se pudo abrir el alta de pagos.", "warning");
    } catch (err) {
      void err;
      pushToast("Sin conexión. Intenta de nuevo.", "warning");
    } finally {
      setConnectBusy(false);
    }
  };
  const [thesis, setThesis] = useState<string>(sofia.weeklyPickThesis);
  const [previewRatio, setPreviewRatio] = useState<"4:5" | "9:16">("4:5");
  const previewCardRef = useRef<HTMLDivElement>(null);
  const [visitorPreviewOpen, setVisitorPreviewOpen] = useState<boolean>(false);

  const upcomingGames = useMemo(
    () => dataset.games.filter((g) => g.status !== "FT"),
    [dataset.games],
  );

  const [selectedMatchId, setSelectedMatchId] = useState<string>(
    () => upcomingGames[0]?.id ?? dataset.games[0]?.id ?? "",
  );

  const selectedMatch = useMemo(
    () =>
      upcomingGames.find((g) => g.id === selectedMatchId) ??
      upcomingGames[0] ??
      dataset.games[0],
    [dataset.games, selectedMatchId, upcomingGames],
  );

  const matchPicks = useMemo(
    () => (selectedMatch?.picks ?? []).filter((p) => !p.isRedacted),
    [selectedMatch],
  );

  const activePick = useMemo(() => {
    const inMatch = matchPicks.find((p) => p.id === selectedTipstarPickId);
    if (inMatch) return inMatch;
    if (matchPicks[0]) return matchPicks[0];
    for (const g of upcomingGames) {
      const firstOpen = g.picks.find((p) => !p.isRedacted);
      if (firstOpen) return firstOpen;
    }
    return dataset.games[0]?.picks[0];
  }, [dataset.games, matchPicks, selectedTipstarPickId, upcomingGames]);

  const lockedSiblingPicks = useMemo(() => {
    if (!selectedMatch) return [];
    const allSlots = selectedMatch.picks;
    return allSlots.filter((p) => p.id !== activePick?.id);
  }, [activePick?.id, selectedMatch]);

  const matchColors = useMemo(() => {
    if (!selectedMatch) {
      return ["var(--pl-aura-default-home)", "var(--pl-aura-default-away)"] as const;
    }
    const home = getTeamColors(selectedMatch.league, selectedMatch.home.slug)?.[0];
    const away = getTeamColors(selectedMatch.league, selectedMatch.away.slug)?.[0];
    return [
      home ?? "var(--pl-aura-default-home)",
      away ?? "var(--pl-aura-default-away)",
    ] as const;
  }, [selectedMatch]);

  const personalJournalEntry = journal[0];
  const isSpacetimeOrigin = tipstarWeeklyPickOrigin === "spacetime";

  const previewMatchTitle = isSpacetimeOrigin
    ? activePick?.matchLabel ?? "Partido Estelar"
    : personalJournalEntry?.matchLabel ?? activePick?.matchLabel ?? "Partido Estelar";

  const previewSelectionLabel = isSpacetimeOrigin
    ? activePick?.label ?? "Pick principal"
    : personalJournalEntry?.pickLabel ?? activePick?.label ?? "Pick principal";

  const previewProb = isSpacetimeOrigin ? activePick?.p ?? 0.62 : 0.61;
  const previewFair = isSpacetimeOrigin
    ? activePick?.fairDecimal ?? 1.62
    : personalJournalEntry?.fairDecimal ?? 1.64;
  // Momio real de casa o el que el tipstar selló; null si no existe (no se inventa).
  const previewBook: number | null = isSpacetimeOrigin
    ? (activePick?.marketDecimal ?? null)
    : (personalJournalEntry?.userDecimal ?? null);
  const previewOddsText =
    previewBook === null
      ? `Justa ${formatOddsValue(previewFair, oddsFormat)}`
      : `Justa ${formatOddsValue(previewFair, oddsFormat)} · Momio ${formatOddsValue(previewBook, oddsFormat)}`;

  const handleCopyPublicUrl = () => {
    const url = "https://pitchlab.mx/p/sofia-sem?code=SOFIA5";
    try {
      void navigator.clipboard?.writeText(url);
    } catch (err) {
      void err;
    }
    pushToast("Enlace público /p/sofia-sem?code=SOFIA5 copiado.", "success");
  };

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/tipstar">
        <ExampleNotice>
          Así funcionará el Portal Tipstar. @{sofia.handle} es un perfil de ejemplo: sus unidades,
          CLV y referidos son ficticios. El pick que muestra sí sale de Spacetime Suite v3.0.
        </ExampleNotice>
        {accountsEnabled && (viewerRole === "tipstar" || viewerRole === "admin") ? (
          <NoticeCard
            icon="gift"
            tone="success"
            badgeText="Pagos"
            title="Recibe tus comisiones con Stripe"
            action={
              <button
                type="button"
                className="pl-btn-primary text-xs min-h-8 px-3"
                disabled={connectBusy}
                onClick={() => void handleSetupPayouts()}
                data-connect-payouts=""
              >
                {connectBusy ? "Abriendo…" : "Configurar pagos"}
              </button>
            }
          >
            Tu 25 % sobre el neto se libera 14 días después de cada cobro y se deposita
            automáticamente en tu cuenta. Stripe te pide tus datos y tu cuenta bancaria una sola vez.
          </NoticeCard>
        ) : null}
        {viewerRole !== "tipstar" && viewerRole !== "admin" ? (
          <NoticeCard
            icon="crown"
            tone="success"
            badgeText="Vista Previa · Programa de Creadores"
            title="Activa el rol Tipstar para publicar tu Pick abierto semanal sin sellado"
            action={
              <button
                type="button"
                className="pl-btn-primary text-xs min-h-8 px-3"
                onClick={() => {
                  setViewerRole("tipstar");
                  pushToast("Modo Tipstar Oficial (@sofia_nfl) activado.", "success");
                }}
              >
                Activar modo @sofia_nfl
              </button>
            }
          >
            <span>
              Como Tipstar Oficial liberas 1 Pick abierto a la semana con tu código de 5 días
              gratis mientras los otros 4 picks del partido siguen protegidos.
            </span>
          </NoticeCard>
        ) : null}

        {/* Encabezado Hero + 4 KPIs */}
        <section className="glass-lens glass-ring glass-ring--featured relative overflow-hidden rounded-3xl p-5 sm:p-6 space-y-5">
          <LensGlowOrbs
            primaryColor={matchColors[0]}
            secondaryColor={matchColors[1]}
            subtle
          />
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <span
                className="w-12 h-12 rounded-full avatar-ring inline-flex items-center justify-center text-sm font-extrabold shrink-0"
                style={{
                  background: sofia.avatarGradVar,
                  color: "var(--share-card-fg)",
                }}
              >
                {sofia.avatarInitials}
              </span>
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="m-0 text-xl sm:text-2xl font-extrabold tracking-tight">
                    Portal tipstar (@{sofia.handle})
                  </h1>
                  <span className="pl-pill pl-pill--success">
                    <MaestroIcon name="check" size={12} />
                    <span>Verificada · {sofia.verifiedUnits}</span>
                  </span>
                </div>
                <p className="m-0 text-xs sm:text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                  Libera <strong>1 Pick abierto a la semana</strong> con branding oficial de
                  PitchLab y tu código promocional. Los otros 4 picks del partido permanecen
                  blindados bajo suscripción.
                </p>
              </div>
            </div>

            <button
              type="button"
              className="pl-btn-glass text-xs"
              onClick={() => setVisitorPreviewOpen(true)}
            >
              <MaestroIcon name="eye" size={14} />
              <span>Simular vista visitante (/p/sofia-sem)</span>
            </button>
          </div>

          <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-3.5 num">
            <div
              className="glass-ring rounded-2xl p-4 space-y-1"
              style={{ background: "var(--pl-surface)" }}
            >
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: "var(--pl-text-muted)" }}
              >
                <span>Código Personal</span>
                <MaestroIcon
                  name="ticket"
                  size={15}
                  style={{ color: "var(--pl-brand)" }}
                />
              </div>
              <strong
                className="block text-xl font-extrabold"
                style={{ color: "var(--pl-brand)" }}
              >
                {sofia.promoCode}
              </strong>
              <span className="block text-xs" style={{ color: "var(--pl-success)" }}>
                Otorga {sofia.freeDays} días Pase PitchLab Ultra gratis
              </span>
            </div>

            <div
              className="glass-ring rounded-2xl p-4 space-y-1"
              style={{ background: "var(--pl-surface)" }}
            >
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: "var(--pl-text-muted)" }}
              >
                <span>Referidos Activos</span>
                <MaestroIcon
                  name="users"
                  size={15}
                  style={{ color: "var(--pl-info)" }}
                />
              </div>
              <strong className="block text-xl font-extrabold">
                {sofia.activeReferrals} socios
              </strong>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                de 64 pruebas iniciadas
              </span>
            </div>

            <div
              className="glass-ring rounded-2xl p-4 space-y-1"
              style={{ background: "var(--pl-surface)" }}
            >
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: "var(--pl-text-muted)" }}
              >
                <span>Comisión 25 %</span>
                <MaestroIcon
                  name="crown"
                  size={15}
                  style={{ color: "var(--pl-success)" }}
                />
              </div>
              <strong
                className="block text-xl font-extrabold"
                style={{ color: "var(--pl-success)" }}
              >
                ${sofia.monthlyCommissionMxn.toLocaleString("es-MX")} MXN
              </strong>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Recurrente + Pase PitchLab Ultra $0
              </span>
            </div>

            <div
              className="glass-ring rounded-2xl p-4 space-y-1"
              style={{ background: "var(--pl-surface)" }}
            >
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: "var(--pl-text-muted)" }}
              >
                <span>Pick abierto semanal</span>
                <MaestroIcon
                  name="unlock"
                  size={15}
                  style={{ color: "var(--pl-accent)" }}
                />
              </div>
              <strong className="block text-xl font-extrabold">1 / 1 disp.</strong>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Cero fuga en los otros 4
              </span>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Izquierda (lg:col-span-7): Configurador con LensGlowOrbs */}
          <section className="lg:col-span-7 glass-lens glass-ring relative overflow-hidden rounded-3xl p-6 space-y-4">
            <LensGlowOrbs
              primaryColor={matchColors[0]}
              secondaryColor={matchColors[1]}
              subtle
            />
            <div className="relative z-10 space-y-4">
              <div className="space-y-2">
                <h2 className="m-0 text-lg font-extrabold">
                  1. Origen de tu Pick abierto de la semana
                </h2>
                <div
                  className="seg-well w-full"
                  role="group"
                  aria-label="Origen del pick semanal"
                >
                  <button
                    type="button"
                    className="seg-btn flex-1 justify-center text-xs"
                    aria-pressed={isSpacetimeOrigin}
                    onClick={() => setTipstarWeeklyPickOrigin("spacetime")}
                  >
                    <MaestroIcon name="cpu" size={14} />
                    <span>Pick Oficial Spacetime Suite</span>
                  </button>
                  <button
                    type="button"
                    className="seg-btn flex-1 justify-center text-xs"
                    aria-pressed={!isSpacetimeOrigin}
                    onClick={() => setTipstarWeeklyPickOrigin("bitacora")}
                  >
                    <MaestroIcon name="ticket" size={14} />
                    <span>Pick Propio de mi Bitácora ({journal.length})</span>
                  </button>
                </div>
              </div>

              {isSpacetimeOrigin ? (
                <>
                  <div className="space-y-2">
                    <label
                      htmlFor="tipstar-match-select"
                      className="block text-xs font-bold"
                      style={{ color: "var(--pl-text-secondary)" }}
                    >
                      2. Selecciona el partido de la jornada
                    </label>
                    <select
                      id="tipstar-match-select"
                      value={selectedMatch?.id ?? ""}
                      onChange={(e) => {
                        const nextGameId = e.target.value;
                        setSelectedMatchId(nextGameId);
                        const nextGame = upcomingGames.find((g) => g.id === nextGameId);
                        const firstPk = nextGame?.picks.find((p) => !p.isRedacted);
                        if (firstPk) {
                          setSelectedTipstarPickId(firstPk.id);
                        }
                      }}
                      className="glass-input w-full px-3.5 py-2.5 text-sm font-semibold"
                    >
                      {(upcomingGames.length > 0 ? upcomingGames : dataset.games)
                        .slice(0, 12)
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.leagueLabel} · {g.home.shortName} vs {g.away.shortName} ({g.kickoffLocal})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <span
                      className="block text-xs font-bold"
                      style={{ color: "var(--pl-text-secondary)" }}
                    >
                      3. Elige cuál de los {matchPicks.length || 5} picks liberarás gratis (los otros permanecen cerrados)
                    </span>
                    <div className="space-y-2">
                      {matchPicks.map((pk) => {
                        const isSelected = pk.id === activePick?.id;
                        return (
                          <button
                            key={pk.id}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => setSelectedTipstarPickId(pk.id)}
                            className="w-full glass-ring rounded-xl p-3 text-left flex items-center justify-between gap-3 cursor-pointer border-0"
                            style={{
                              background: isSelected
                                ? "var(--pl-surface-active)"
                                : "var(--pl-surface)",
                              color: "var(--pl-text)",
                            }}
                          >
                            <div className="min-w-0">
                              <span
                                className="block text-xs font-bold"
                                style={{ color: "var(--pl-brand)" }}
                              >
                                {pk.categoryLabel}
                              </span>
                              <strong className="block text-sm font-extrabold truncate">
                                {pk.label}
                              </strong>
                            </div>
                            <div className="text-right num text-xs shrink-0">
                              <div className="font-extrabold">
                                {(pk.p * 100).toFixed(1)} %
                              </div>
                              <div style={{ color: "var(--pl-text-muted)" }}>
                                Justa {formatOddsValue(pk.fairDecimal, oddsFormat)}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div
                  className="glass-ring rounded-2xl p-4 space-y-1.5"
                  style={{ background: "var(--pl-surface)" }}
                >
                  <span
                    className="block text-xs font-bold"
                    style={{ color: "var(--pl-accent)" }}
                  >
                    Tomado de tu Bitácora verificada pre-partido
                  </span>
                  <strong className="block text-base font-extrabold">
                    {previewSelectionLabel}
                  </strong>
                  <span
                    className="block text-xs num"
                    style={{ color: "var(--pl-text-muted)" }}
                  >
                    {previewMatchTitle} · Cuota sellada{" "}
                    {formatOddsValue(previewBook ?? previewFair, oddsFormat)}
                  </span>
                </div>
              )}

              <div>
                <label
                  htmlFor="tipstar-thesis-input"
                  className="block text-xs font-bold mb-1.5"
                  style={{ color: "var(--pl-text-secondary)" }}
                >
                  4. Tu tesis para redes sociales (/p/sofia-sem · Instagram / X / TikTok)
                </label>
                <textarea
                  id="tipstar-thesis-input"
                  rows={3}
                  maxLength={220}
                  value={thesis}
                  onChange={(e) => setThesis(e.target.value)}
                  className="glass-input w-full p-3 text-sm"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  className="pl-btn-primary text-xs"
                  onClick={() => {
                    if (!activePick) return;
                    if (viewerRole === "member") {
                      setViewerRole("tipstar");
                    }
                    openShareTicket({
                      kind: "tipstar",
                      title: previewMatchTitle,
                      subtitle: `Tipstar Oficial @${sofia.handle} · ${activePick.leagueLabel}`,
                      leagueLabel: activePick.leagueLabel,
                      pickLabel: previewSelectionLabel,
                      probability: previewProb,
                      fairDecimal: previewFair,
                      marketDecimal: previewBook ?? previewFair,
                      units: activePick.suggestedUnits,
                      gameStatus: "NS",
                      promoCode: sofia.promoCode,
                      tipstarHandle: sofia.handle,
                      originBadge: isSpacetimeOrigin
                        ? "PICK OFICIAL PITCHLAB"
                        : "PICK SELLADO BITÁCORA TIPSTAR",
                    });
                  }}
                >
                  <MaestroIcon name="share" size={14} />
                  <span>Generar boleto 4:5 / 9:16 con mi código</span>
                </button>

                <button
                  type="button"
                  className="pl-btn-glass text-xs"
                  onClick={() => setVisitorPreviewOpen(true)}
                >
                  <MaestroIcon name="eye" size={14} />
                  <span>Simular vista visitante (/p/sofia-sem)</span>
                </button>

                <a
                  href="/p/sofia-sem"
                  onClick={(e) => {
                    e.preventDefault();
                    pushToast("Abriendo vista pública /p/sofia-sem...", "default");
                    navigateTo("/p/sofia-sem");
                  }}
                  className="pl-btn-glass text-xs"
                >
                  <span>Abrir /p/sofia-sem</span>
                  <MaestroIcon name="arrowRight" size={13} />
                </a>
              </div>
            </div>
          </section>

          {/* Derecha (lg:col-span-5): Boleto en vivo estilo shows.link */}
          <aside className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span
                className="text-xs font-extrabold"
                style={{ color: "var(--pl-text-muted)" }}
              >
                Boleto Oficial para Redes
              </span>
              <div
                className="seg-well"
                role="group"
                aria-label="Relación de aspecto de vista previa"
              >
                <button
                  type="button"
                  className="seg-btn text-xs min-h-7 px-2.5"
                  aria-pressed={previewRatio === "4:5"}
                  onClick={() => setPreviewRatio("4:5")}
                >
                  Post 4:5
                </button>
                <button
                  type="button"
                  className="seg-btn text-xs min-h-7 px-2.5"
                  aria-pressed={previewRatio === "9:16"}
                  onClick={() => setPreviewRatio("9:16")}
                >
                  Story 9:16
                </button>
              </div>
            </div>

            <div
              ref={previewCardRef}
              className={`share-ticket-card glass-ring p-6 flex flex-col justify-between transition-all ${
                previewRatio === "9:16" ? "min-h-[468px]" : "min-h-[382px]"
              }`}
            >
              <LensGlowOrbs
                primaryColor="var(--pl-aura-default-away)"
                secondaryColor="var(--pl-aura-default-home)"
              />

              <div className="relative z-10 flex items-center justify-between gap-2">
                <img
                  src={getLogoPath("horizontal", "dark")}
                  alt="PitchLab"
                  width={108}
                  height={21}
                />
                <span
                  className="text-xs font-extrabold px-2.5 py-0.5 rounded-md"
                  style={{
                    background: "var(--share-card-surface)",
                    color: "var(--share-card-success)",
                    border: "1px solid var(--share-card-border)",
                  }}
                >
                  PICK GRATIS SEMANAL
                </span>
              </div>

              <div className="relative z-10 space-y-3 my-4">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-9 h-9 rounded-full inline-flex items-center justify-center text-xs font-extrabold shrink-0"
                    style={{
                      background: sofia.avatarGradVar,
                      color: "var(--share-card-fg)",
                    }}
                  >
                    {sofia.avatarInitials}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold truncate">
                      {sofia.name} · @{sofia.handle}
                      {sofia.isExample ? " · Ejemplo" : ""}
                    </div>
                    <div
                      className="text-xs truncate"
                      style={{ color: "var(--share-card-accent)" }}
                    >
                      {isSpacetimeOrigin
                        ? `Respaldado por ${activePick?.engineName ?? "PitchLab Spacetime Suite v3.0"}`
                        : "Tesis propia auditada en Bitácora PitchLab"}
                    </div>
                  </div>
                </div>

                <div className="text-xs" style={{ color: "var(--share-card-muted)" }}>
                  {previewMatchTitle}
                </div>

                <div
                  className="rounded-xl p-3.5 space-y-1"
                  style={{
                    background: "var(--share-card-surface)",
                    border: "1px solid var(--share-card-border)",
                  }}
                >
                  <div className="text-lg sm:text-xl font-extrabold tracking-tight">
                    {previewSelectionLabel}
                  </div>
                  <div
                    className="text-xs num flex items-center justify-between pt-0.5"
                    style={{ color: "var(--share-card-secondary)" }}
                  >
                    <span>
                      Prob.{" "}
                      <strong style={{ color: "var(--share-card-success)" }}>
                        {(previewProb * 100).toFixed(1)} %
                      </strong>{" "}
                      · Justa {formatOddsValue(previewFair, oddsFormat)}
                    </span>
                    {previewBook !== null ? (
                      <strong style={{ color: "var(--share-card-accent)" }}>
                        Momio {formatOddsValue(previewBook, oddsFormat)}
                      </strong>
                    ) : null}
                  </div>
                </div>

                <p
                  className="m-0 text-xs leading-relaxed"
                  style={{ color: "var(--share-card-secondary)" }}
                >
                  “{thesis}”
                </p>

                <div className="ticket-perf" />
              </div>

              <div
                className="relative z-10 rounded-xl p-3 flex items-center justify-between gap-2"
                style={{
                  background: "var(--share-card-surface)",
                  border: "1px solid var(--share-card-border)",
                }}
              >
                <div className="text-xs">
                  <div className="font-extrabold tracking-wide">
                    CÓDIGO: {sofia.promoCode} · {sofia.freeDays} DÍAS GRATIS
                  </div>
                  <div style={{ color: "var(--share-card-muted)" }}>
                    Desbloquea los otros 4 picks en pitchlab.mx
                  </div>
                </div>
                <span
                  className="num text-xs font-extrabold px-2 py-1 rounded"
                  style={{
                    background: "var(--share-card-fg)",
                    color: "var(--share-card-bg)",
                  }}
                >
                  18+
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="pl-btn-glass text-xs"
                onClick={handleCopyPublicUrl}
              >
                <MaestroIcon name="copy" size={13} />
                <span>Copiar link /p/sofia-sem</span>
              </button>
              <button
                type="button"
                className="pl-btn-primary text-xs"
                onClick={() => {
                  const card = previewCardRef.current;
                  if (!card) return;
                  downloadTicketPng(
                    {
                      aspect: previewRatio,
                      leagueLabel: "PICK GRATIS SEMANAL",
                      title: `${sofia.name} · @${sofia.handle}`,
                      subtitle: previewMatchTitle,
                      badge: isSpacetimeOrigin
                        ? `Respaldado por ${activePick?.engineName ?? "PitchLab Spacetime Suite v3.0"}`
                        : "Tesis propia auditada en Bitácora PitchLab",
                      badgeTone: "success",
                      units: "",
                      mainLine: previewSelectionLabel,
                      detailLine: `Prob. ${(previewProb * 100).toFixed(1)} % · ${previewOddsText}`,
                      footerLine: `CÓDIGO: ${sofia.promoCode} · ${sofia.freeDays} DÍAS GRATIS`,
                      footerSub: "Desbloquea los demás picks en pitchlab.mx",
                      watermark: "18+",
                    },
                    card,
                    `pitchlab-${sofia.handle}-${previewRatio === "9:16" ? "9x16" : "4x5"}.png`,
                  ).then(
                    () =>
                      pushToast(
                        `Boleto ${previewRatio === "9:16" ? "1080×1920" : "1080×1350"} con código ${sofia.promoCode} descargado.`,
                        "success",
                      ),
                    () => pushToast("No se pudo generar la imagen del boleto.", "danger"),
                  );
                }}
              >
                <MaestroIcon name="download" size={13} />
                <span>Descargar PNG</span>
              </button>
            </div>
          </aside>
        </div>

        {/* Modal inline: Simulación exacta de cómo ve un visitante externo /p/sofia-sem */}
        <TopLayerModalDialog
          open={visitorPreviewOpen}
          onClose={() => setVisitorPreviewOpen(false)}
          ariaLabelledBy="tipstar-visitor-sim-title"
          maxWidth="34rem"
        >
          <div className="glass-lens glass-ring glass-ring--featured relative overflow-hidden w-full rounded-2xl p-6 space-y-4">
            <LensGlowOrbs subtle />
            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="pl-pill pl-pill--success">
                  <MaestroIcon name="eye" size={13} />
                  <span>Simulación de visitante externo · pitchlab.mx/p/sofia-sem</span>
                </span>
                <button
                  type="button"
                  className="pl-btn-glass px-2.5 min-h-8"
                  aria-label="Cerrar simulación de visitante"
                  onClick={() => setVisitorPreviewOpen(false)}
                >
                  <MaestroIcon name="x" size={15} />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className="w-11 h-11 rounded-full avatar-ring inline-flex items-center justify-center text-xs font-extrabold shrink-0"
                  style={{
                    background: sofia.avatarGradVar,
                    color: "var(--share-card-fg)",
                  }}
                >
                  {sofia.avatarInitials}
                </span>
                <div>
                  <h2 id="tipstar-visitor-sim-title" className="m-0 text-base font-extrabold">
                    @{sofia.handle} liberó 1 Pick Gratis de este partido
                  </h2>
                  <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    {previewMatchTitle} ·{" "}
                    {activePick?.engineName ?? "PitchLab Spacetime Suite v3.0"}
                  </p>
                </div>
              </div>

              <div
                className="glass-ring rounded-xl p-4 space-y-2"
                style={{ background: "var(--pl-surface)" }}
              >
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-extrabold"
                  style={{ color: "var(--pl-success)" }}
                >
                  <MaestroIcon name="unlock" size={13} />
                  <span>Pick abierto de la semana</span>
                </span>
                <div className="text-xl font-extrabold">
                  {previewSelectionLabel}
                </div>
                <div className="num text-xs" style={{ color: "var(--pl-text-secondary)" }}>
                  Probabilidad Spacetime Suite:{" "}
                  <strong style={{ color: "var(--pl-brand)" }}>
                    {(previewProb * 100).toFixed(1)} %
                  </strong>{" "}
                  · Cuota justa{" "}
                  <strong>{formatOddsValue(previewFair, oddsFormat)}</strong>
                </div>
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  “{thesis}”
                </p>
              </div>

              <div className="space-y-2">
                <div
                  className="text-xs font-bold"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  Otros {Math.max(4, lockedSiblingPicks.length)} picks de este mismo partido (Cero fuga sin suscripción):
                </div>
                {(lockedSiblingPicks.length > 0
                  ? lockedSiblingPicks.slice(0, 4)
                  : [
                      { id: "lk-1", categoryLabel: "Escudo Conservador", engineName: "Tachyon v3.0" },
                      { id: "lk-2", categoryLabel: "Línea de Totales", engineName: "Singularity v3.0" },
                      { id: "lk-3", categoryLabel: "Ángulo Táctico", engineName: "Cortex IA" },
                      { id: "lk-4", categoryLabel: "Valor Geodesic", engineName: "Geodesic v2.0" },
                    ]
                ).map((lp) => (
                  <div
                    key={lp.id}
                    className="glass-ring rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                    style={{ background: "var(--pl-surface)" }}
                  >
                    <span
                      className="inline-flex items-center gap-1.5 font-bold"
                      style={{ color: "var(--pl-brand)" }}
                    >
                      <MaestroIcon name="lock" size={12} />
                      <span>{lp.categoryLabel}</span>
                    </span>
                    <span className="locked-redact font-extrabold">
                      RESERVADO PASE PITCHLAB ULTRA
                    </span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="pl-btn-primary w-full text-xs"
                onClick={() => {
                  setVisitorPreviewOpen(false);
                  navigateTo(`/signup?code=${sofia.promoCode}`);
                }}
              >
                <span>
                  Canjear código {sofia.promoCode} · {sofia.freeDays} días de Pase PitchLab Ultra gratis
                </span>
                <MaestroIcon name="arrowRight" size={14} />
              </button>
            </div>
          </div>
        </TopLayerModalDialog>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
