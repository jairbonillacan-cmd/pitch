"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  formatOddsCaptureEs,
  sportHasDraw,
  sportScoringUnit,
  type LeagueId,
} from "@pitchlab/contracts";
import { getTeamColors } from "@pitchlab/sports-assets";
import {
  LeagueBadge,
  PBar,
  ProbSplit,
  TeamBadge,
  parseUserOdds,
} from "../../sports";
import {
  decimalToAmericanInt,
  getSessionWatermark,
  isPreGameIntelUnlocked,
} from "../access-guard";
import {
  CrestPedestal,
  LensGlowOrbs,
  MaestroIcon,
  StackedAvatars,
} from "../components/MaestroPrimitives";
import { MatchList } from "../components/MatchList";
import { PlLeagueSelect } from "../components/PlSelect";
import { MultiPickRow } from "../components/MatchTicketCard";
import { ConfidenceChip } from "../components/ConfidenceChip";
import { groupMatchesByDayAndLeague } from "./home/home-model";
import { CortexAnalysisCard, type CortexSectionView } from "./match/CortexAnalysisCard";
import { MatchContextPanel } from "./match/MatchContextPanel";
import { MatchNumbersPanel } from "./match/MatchNumbersPanel";
import { MatchTabPanel, MatchTabs, useMatchUrlTab } from "./match/MatchTabs";
import { PreMatchModule } from "./match/PreMatchModule";
import {
  SportOutlookCard,
  platformGameToSportOutlook,
} from "./match/sport-outlook";
import { FollowControl, LiveMatchPanel } from "../live/LiveMatchCenter";
import { PicksFinderClubView } from "./PicksFinderView";
import {
  AtmosphereStage,
  ClubWorkspaceShell,
} from "../components/ShellChrome";
import {
  usePlatform,
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
  MatchPick,
  MatchTabKey,
  PlatformGame,
  PlatformGameDetail,
  PlatformMarketRow,
  RiskBand,
} from "../types";

/** El Inicio del Club vive en `home/HomeClubView`; se conserva el nombre anterior.
 */
export { HomeClubView as JornadaClubView } from "./home/HomeClubView";

/** /app/picks: buscador de todas las selecciones (ver PicksFinderView). */
export function MultiPicksClubView(): React.JSX.Element {
  return <PicksFinderClubView />;
}

export function LeagueHubClubView({
  leagueId,
}: {
  leagueId: LeagueId;
}): React.JSX.Element {
  const { dataset, navigateTo } = usePlatform();
  const [dayFilter, setDayFilter] = useState<string>("all");

  const leagueSummary =
    dataset.leagues.find((l) => l.league === leagueId) ?? dataset.leagues[0]!;
  const leagueGames = useMemo(
    () => dataset.games.filter((g) => g.league === leagueSummary.league),
    [dataset.games, leagueSummary.league],
  );

  const dayOptions = useMemo(() => {
    const map = new Map<string, string>();
    map.set("all", "Toda la jornada");
    for (const g of leagueGames) {
      if (!map.has(g.dayId)) {
        map.set(g.dayId, g.dayLabel);
      }
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [leagueGames]);

  const filteredGames = useMemo(
    () =>
      dayFilter === "all"
        ? leagueGames
        : leagueGames.filter((g) => g.dayId === dayFilter),
    [leagueGames, dayFilter],
  );

  const upcoming = filteredGames.filter((g) => g.status !== "FT");
  const finished = filteredGames.filter((g) => g.status === "FT");
  const upcomingGroups = useMemo(() => groupMatchesByDayAndLeague(upcoming), [upcoming]);
  const finishedGroups = useMemo(() => groupMatchesByDayAndLeague(finished), [finished]);

  const hubPath = `/app/${leagueSummary.league}`;

  return (
    <AtmosphereStage activePath={hubPath}>
      <ClubWorkspaceShell activePath={hubPath}>
        <section className="glass-lens glass-ring glass-ring--featured rounded-3xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 relative overflow-hidden">
          <LensGlowOrbs subtle />

          <div className="flex items-center gap-4 relative z-10">
            <CrestPedestal size="lg">
              <LeagueBadge
                league={leagueSummary.league}
                label={leagueSummary.label}
                logoUrl={leagueSummary.logoUrl}
                size={40}
              />
            </CrestPedestal>
            <div>
              <span
                className="text-xs font-bold"
                style={{ color: "var(--pl-brand)" }}
              >
                {[leagueSummary.season, leagueSummary.roundLabel].filter(Boolean).join(" · ")}
              </span>
              <h1 id="panel-league-name" className="m-0 text-2xl sm:text-3xl font-extrabold">
                {leagueSummary.label}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs num relative z-10">
            <span className="pl-pill pl-pill--brand inline-flex items-center gap-1">
              <MaestroIcon name="calendar" size={12} />
              <span>{leagueSummary.upcomingCount} por jugar</span>
            </span>
            <span className="pl-pill pl-pill--success inline-flex items-center gap-1">
              <MaestroIcon name="check" size={12} />
              <span>{leagueSummary.finishedCount} auditados FT</span>
            </span>
          </div>
        </section>

        {/* Chips de filtro por día */}
        <div
          id="day-chips"
          className="seg-well"
          role="group"
          aria-label="Filtrar partidos por día"
        >
          {dayOptions.map((d) => (
            <button
              key={d.id}
              type="button"
              className="day-chip seg-btn"
              aria-pressed={dayFilter === d.id}
              onClick={() => setDayFilter(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>

        {upcoming.length > 0 ? (
          <section className="space-y-3">
            <h2 className="m-0 text-lg font-extrabold">
              Próximos encuentros ({upcoming.length})
            </h2>
            <MatchList groups={upcomingGroups} hideLeagueHeader />
          </section>
        ) : null}

        {finished.length > 0 ? (
          <section className="space-y-3">
            <h2 className="m-0 text-lg font-extrabold">
              Resultados cerrados FT ({finished.length})
            </h2>
            <MatchList groups={finishedGroups} hideLeagueHeader />
          </section>
        ) : (
          <section className="glass-card glass-ring rounded-2xl p-4 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Aún no hay marcadores cerrados (FT) registrados en este corte de la jornada.
          </section>
        )}

        {/* Tabla de posiciones real del snapshot */}
        {leagueSummary.standings.length > 0 ? (
          <section className="standings-block pl-deferred-section glass-card glass-ring rounded-2xl p-5 space-y-3">
            <h2 className="m-0 text-lg font-extrabold">
              Tabla de Posiciones · {leagueSummary.label}
            </h2>
            <div
              className="pl-table-region"
              tabIndex={0}
              role="region"
              aria-label={`Tabla de posiciones de ${leagueSummary.label}`}
            >
              <table className="standings w-full text-left border-collapse text-sm">
                <thead>
                  <tr
                    className="hairline-b text-xs"
                    style={{ color: "var(--pl-text-muted)" }}
                  >
                    <th scope="col" className="py-2 pr-3">
                      Pos.
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      Club
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      PJ
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      G
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      E
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      P
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      DG
                    </th>
                    <th scope="col" className="py-2 pl-2 text-right">
                      Pts
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leagueSummary.standings.map((row, idx) => {
                    const slug = row.teamId.includes(".")
                      ? row.teamId.split(".")[1]!
                      : row.teamId;
                    const dg = row.goalsFor - row.goalsAgainst;
                    return (
                      <tr key={row.teamId} className="hairline-b">
                        <td className="py-2.5 pr-3 num font-bold">{idx + 1}</td>
                        <td className="py-2.5 pr-3">
                          <a
                            href={`/app/${leagueSummary.league}/teams/${slug}`}
                            onClick={(e) => {
                              e.preventDefault();
                              navigateTo(`/app/${leagueSummary.league}/teams/${slug}`);
                            }}
                            className="pl-team-link flex items-center gap-2 font-semibold min-h-11 py-1"
                            title={`Ver perfil de ${row.name}`}
                          >
                            <TeamBadge
                              league={leagueSummary.league}
                              slug={slug}
                              name={row.name}
                              logoUrl={row.logoUrl}
                              size={20}
                            />
                            <span>{row.name}</span>
                          </a>
                        </td>
                        <td className="py-2.5 px-2 text-right num">{row.played}</td>
                        <td className="py-2.5 px-2 text-right num">{row.won}</td>
                        <td className="py-2.5 px-2 text-right num">{row.drawn}</td>
                        <td className="py-2.5 px-2 text-right num">{row.lost}</td>
                        <td className="py-2.5 px-2 text-right num">
                          {dg > 0 ? `+${dg}` : dg}
                        </td>
                        <td className="py-2.5 pl-2 text-right num font-extrabold">
                          {row.points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="standings-block glass-card glass-ring rounded-2xl p-5 space-y-1.5">
            <h2 className="m-0 text-lg font-extrabold">
              Tabla de Posiciones · {leagueSummary.label}
            </h2>
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              La clasificación actualizada aún no está disponible en el corte vigente de esta
              competición.
            </p>
          </section>
        )}

        {(() => {
          const directoryFromDataset = (dataset.teams ?? []).filter(
            (t) => t.league === leagueSummary.league,
          );
          const fallbackMap = new Map<
            string,
            { slug: string; name: string; shortName: string; href: string }
          >();
          if (directoryFromDataset.length === 0) {
            for (const g of leagueGames) {
              for (const side of [g.home, g.away]) {
                if (!fallbackMap.has(side.slug)) {
                  fallbackMap.set(side.slug, {
                    slug: side.slug,
                    name: side.name,
                    shortName: side.shortName,
                    href: `/app/${leagueSummary.league}/teams/${side.slug}`,
                  });
                }
              }
            }
          }
          const directoryTeams =
            directoryFromDataset.length > 0
              ? directoryFromDataset
              : [...fallbackMap.values()].sort((a, b) => a.name.localeCompare(b.name, "es-MX"));

          if (directoryTeams.length === 0) return null;

          return (
            <section
              className="glass-card glass-ring rounded-2xl p-5 space-y-3"
              aria-labelledby="league-clubs-directory-heading"
              data-league-teams-directory=""
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="league-clubs-directory-heading" className="m-0 text-base sm:text-lg font-extrabold">
                  Perfiles de equipos · {leagueSummary.label}
                </h2>
                <span className="pl-pill num text-xs">{directoryTeams.length} equipos</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {directoryTeams.map((teamItem) => (
                  <a
                    key={teamItem.slug}
                    href={teamItem.href}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo(teamItem.href);
                    }}
                    className="pl-btn-glass text-xs min-h-11 px-3 inline-flex items-center gap-2"
                  >
                    <TeamBadge
                      league={leagueSummary.league}
                      slug={teamItem.slug}
                      name={teamItem.name}
                      size={20}
                    />
                    <span>{teamItem.shortName}</span>
                  </a>
                ))}
              </div>
            </section>
          );
        })()}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function MatchStudioClubView({
  leagueId,
  gameId,
  cortexSynthesisOverride,
  cortexSections,
  cortexHeadline,
  detail,
  initialTab = "resumen",
}: {
  leagueId: LeagueId;
  gameId: string;
  /** Resumen de Cortex IA redactado en servidor (LLM validado); si falta, se usa la plantilla. */
  cortexSynthesisOverride?: string | null;
  /** Análisis por secciones de Cortex IA (lo redacta el corte y llega en el snapshot). */
  cortexSections?: readonly CortexSectionView[] | null;
  /** Idea central del partido redactada por Cortex IA. */
  cortexHeadline?: string | null;
  /** Mercados, enfrentamientos y factores de este partido (el dataset del layout llega sin ellos). */
  detail?: PlatformGameDetail | null;
  /** Pestaña inicial resuelta en servidor desde `?tab=` para compartir enlaces. */
  initialTab?: MatchTabKey;
}): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    viewerIdentity,
    hasAccountSessionAuth,
    oddsFormat,
    setSelectedTipsterPickId,
    socialPosts,
    publishSocialPost,
    addSocialComment,
    deleteSocialComment,
    toggleSocialCommentHelpful,
    loadAllPostComments,
    deleteSocialPost,
    toggleSocialLike,
    loadMatchSocialPosts,
    sealPickToJournal,
    recordSocialPostCopy,
    addPickToParlay,
    journal,
    openComposer,
    navigateTo,
    pushToast,
  } = usePlatform();

  const follows = useFollowing();
  const [reportTarget, setReportTarget] = useState<SocialReportTarget | null>(null);
  const own = useMemo(
    () => ownIdentityFor(viewerRole, viewerIdentity),
    [viewerRole, viewerIdentity],
  );

  const [activeTab, setActiveTab] = useMatchUrlTab(initialTab);
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

  useEffect(() => {
    void loadMatchSocialPosts(game.id);
  }, [game.id, loadMatchSocialPosts]);

  const hasDraw = sportHasDraw(game.sport);
  const unit = sportScoringUnit(game.sport);
  const hasForecast =
    game.hasForecast !== false && Boolean(game.x12 && game.projection);
  const overtimeFactor = game.factors.find((f) => /tiempo extra/i.test(f.label));
  const flow = game.preGame.moneyFlow;
  const isFinished = game.status === "FT" && game.score !== undefined;
  const intelUnlocked = isPreGameIntelUnlocked(game, viewerRole);

  const homePrimary =
    getTeamColors(game.league, game.home.slug)?.[0] ??
    "var(--pl-aura-default-home)";
  const awayPrimary =
    getTeamColors(game.league, game.away.slug)?.[0] ??
    "var(--pl-aura-default-away)";

  const studioPath = `/app/${game.league}/games/${game.id}`;
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
      engineName: "PitchLab Geodesic v2.0",
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

  return (
    <AtmosphereStage activePath={studioPath}>
      <ClubWorkspaceShell activePath={studioPath}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <a
            href={`/app/${game.league}`}
            onClick={(e) => {
              e.preventDefault();
              navigateTo(`/app/${game.league}`);
            }}
            className="pl-btn-glass text-xs min-h-8 px-3 inline-flex items-center gap-1.5"
          >
            <MaestroIcon name="arrowLeft" size={13} />
            <span>Volver a {game.leagueLabel}</span>
          </a>

          {isFinished ? null : <FollowControl gameId={game.id} />}
        </div>

        {/* Cabecera Estelar de Radiografía del Partido */}
        <section
          className="glass-lens glass-ring glass-ring--featured rounded-3xl p-6 space-y-5 relative overflow-hidden"
          data-match-studio={game.id}
        >
          <LensGlowOrbs primaryColor={homePrimary} secondaryColor={awayPrimary} />

          <div className="flex flex-wrap items-center justify-between gap-2 relative z-10">
            <div className="flex items-center gap-2">
              <LeagueBadge
                league={game.league}
                label={game.leagueLabel}
                logoUrl={game.leagueLogoUrl}
                size={22}
              />
              <span
                id="modal-league"
                className="text-xs font-semibold"
              >
                {[game.leagueLabel, game.round, game.venue].filter(Boolean).join(" · ")}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {isFinished ? null : <ConfidenceChip game={game} size="lg" />}
              <span className="pl-pill pl-pill--brand num text-xs">
                {isFinished
                  ? "Finalizado FT"
                  : `${game.dayLabel} · ${game.kickoffLocal}`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center relative z-10">
            <div className="flex items-center gap-3.5 min-w-0">
              <CrestPedestal size="lg" glowColor={homePrimary}>
                <TeamBadge
                  league={game.league}
                  slug={game.home.slug}
                  name={game.home.name}
                  logoUrl={game.home.logoUrl}
                  size={44}
                />
              </CrestPedestal>
              <div className="min-w-0">
                <h1 className="m-0 text-xl sm:text-2xl font-extrabold truncate">
                  <a
                    href={`/app/${game.league}/teams/${game.home.slug}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo(`/app/${game.league}/teams/${game.home.slug}`);
                    }}
                    className="pl-team-link"
                    title={`Ver perfil de ${game.home.name}`}
                  >
                    {game.home.name}
                  </a>
                </h1>
                <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  {game.home.record}
                </span>
              </div>
            </div>

            <div className="text-center space-y-1">
              {isFinished ? (
                <strong className="num text-3xl font-extrabold block">
                  {game.score?.home} – {game.score?.away}
                </strong>
              ) : !hasForecast || !game.projection ? (
                <strong
                  className="text-lg font-extrabold block"
                  style={{ color: "var(--pl-text-secondary)" }}
                >
                  Sin pronóstico
                </strong>
              ) : intelUnlocked ? (
                <strong
                  className="num text-2xl font-extrabold block"
                  style={{ color: "var(--pl-brand)" }}
                >
                  Proy. {game.projection.home.toFixed(unit.decimals)} –{" "}
                  {game.projection.away.toFixed(unit.decimals)}
                </strong>
              ) : (
                <span className="pl-pill inline-flex items-center gap-1.5">
                  <MaestroIcon name="lock" size={12} />
                  <span>Marcador proyectado Pase PitchLab Ultra</span>
                </span>
              )}
              <span
                className="text-xs num block"
                style={{ color: "var(--pl-text-muted)" }}
              >
                {!hasForecast || !game.projection
                  ? "Sin pronóstico ni confianza publicados"
                  : intelUnlocked || isFinished
                    ? `${unit.plural === "puntos" ? "Puntos" : "Goles"} esperados: ${game.projection.total.toFixed(unit.decimals)}`
                    : "Disponible con Pase PitchLab Ultra"}
              </span>
              {overtimeFactor && hasForecast ? (
                <span
                  className="pl-pill pl-pill--wrap text-[11px] inline-flex items-center justify-center gap-1 mt-1 max-w-full"
                  data-overtime-pill=""
                  title={overtimeFactor.sub ?? undefined}
                >
                  <span>
                    {overtimeFactor.label}: {overtimeFactor.value}
                    {overtimeFactor.sub ? ` · ${overtimeFactor.sub}` : ""}
                  </span>
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-3.5 md:justify-end min-w-0">
              <div className="md:text-right min-w-0">
                <h2 className="m-0 text-xl sm:text-2xl font-extrabold truncate">
                  <a
                    href={`/app/${game.league}/teams/${game.away.slug}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo(`/app/${game.league}/teams/${game.away.slug}`);
                    }}
                    className="pl-team-link"
                    title={`Ver perfil de ${game.away.name}`}
                  >
                    {game.away.name}
                  </a>
                </h2>
                <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  {game.away.record}
                </span>
              </div>
              <CrestPedestal size="lg" glowColor={awayPrimary}>
                <TeamBadge
                  league={game.league}
                  slug={game.away.slug}
                  name={game.away.name}
                  logoUrl={game.away.logoUrl}
                  size={44}
                />
              </CrestPedestal>
            </div>
          </div>

          {hasForecast && game.x12 ? (
            <div className="relative z-10">
              <ProbSplit
                probabilities={hasDraw ? game.x12 : [game.x12[0], game.x12[2]]}
                labels={
                  hasDraw
                    ? [game.home.shortName, "Empate", game.away.shortName]
                    : [game.home.shortName, game.away.shortName]
                }
                showLabels
              />
            </div>
          ) : (
            <div
              className="relative z-10 rounded-2xl px-4 py-3 text-xs"
              style={{
                background: "var(--pl-surface-soft)",
                color: "var(--pl-text-muted)",
              }}
              data-empty-forecast=""
            >
              Este snapshot aún no incluye pronóstico ni confianza publicados para este partido.
            </div>
          )}
        </section>

        {/* Match Center en vivo: marcador, minuto a minuto, momentum y estadísticas (EN-VIVO-1) */}
        <LiveMatchPanel game={game} />

        {/* Navegación accesible en 3 pestañas sincronizada con ?tab= */}
        <MatchTabs
          idPrefix="pl-match"
          active={activeTab}
          onSelect={setActiveTab}
          tabs={[
            { key: "resumen", label: "Resumen", count: game.picks.length },
            {
              key: "numeros",
              label: "Números",
              count: activeMarkets.length > 0 ? activeMarkets.length : undefined,
            },
            { key: "contexto", label: "Contexto" },
          ]}
        />

        {/* Pestaña 1: Resumen (Antes del partido, pronóstico, Cortex IA, pulso de dinero y factores) */}
        <MatchTabPanel idPrefix="pl-match" tabKey="resumen" active={activeTab}>
          {isFinished ? null : <PreMatchModule game={game} detail={detail} />}
          {sportOutlook ? (
            <SportOutlookCard outlook={sportOutlook} oddsFormat={oddsFormat} />
          ) : null}

          {/* Pronóstico / Picks del partido */}
          <section className="space-y-3.5" data-picks="">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-lg font-extrabold">Pronóstico del partido</h2>
              {viewerRole === "tipster" || viewerRole === "admin" ? (
                <span
                  className="text-xs font-semibold inline-flex items-center gap-1"
                  style={{ color: "var(--pl-brand)" }}
                >
                  <MaestroIcon name="crown" size={13} />
                  <span>Elige cualquiera como tu Pick abierto semanal</span>
                </span>
              ) : null}
            </div>

            {game.picks.length === 0 ? (
              <div
                className="glass-card glass-ring rounded-2xl p-4 text-sm"
                style={{ color: "var(--pl-text-muted)" }}
                data-empty-forecast=""
              >
                Aún no hay picks publicados para este partido porque el snapshot no incluye pronóstico ni probabilidades.
              </div>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {game.picks.map((pk) => (
                <div key={pk.id} className="space-y-1.5">
                  <MultiPickRow pick={pk} gameStatus={game.status} />
                  {(viewerRole === "tipster" || viewerRole === "admin") &&
                  game.status !== "FT" ? (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="pl-btn-glass text-xs min-h-9 px-3 inline-flex items-center gap-1"
                        onClick={() => {
                          setSelectedTipsterPickId(pk.id);
                          pushToast(
                            `«${pk.label}» asignado como tu Pick abierto semanal en Portal Tipster.`,
                            "success",
                          );
                        }}
                      >
                        <MaestroIcon name="crown" size={12} />
                        <span>Usar como mi Pick abierto semanal</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            )}
          </section>

          {/* Lectura de Cortex IA + pulso de mercado */}
          <section aria-label="Análisis de Cortex IA y pulso de mercado" className="pl-studio-main">
            <CortexAnalysisCard
              game={game}
              synthesis={
                cortexSections?.find((sec) => sec.key === "lectura")?.text ??
                cortexSynthesisOverride ??
                game.preGame.cortexSynthesis
              }
              unlocked={intelUnlocked}
              sections={cortexSections}
              headline={cortexHeadline}
            />
            <div className="pl-studio-side">
              {!flow ? (
                <div
                  className="glass-card glass-ring rounded-2xl p-4 space-y-2.5 min-w-0"
                  data-market-pulse=""
                >
                  <div data-no-market="" className="space-y-2">
                    <h2 className="m-0 text-sm font-extrabold">¿Dónde está el dinero?</h2>
                    <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                      Este partido todavía no tiene momios verificados. Mostramos solo la probabilidad del modelo.
                    </p>
                  </div>
                  <div className="pt-1">
                    <button
                      type="button"
                      className="pl-btn-glass text-xs min-h-11 px-3 w-full justify-center"
                      onClick={() => setActiveTab("numeros")}
                    >
                      Ver números y líneas
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="glass-card glass-ring rounded-2xl p-4 space-y-3 flex flex-col justify-between min-w-0"
                  data-market-pulse=""
                >
                  <div className="space-y-2.5 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                      <h2 className="m-0 text-sm font-extrabold">¿Dónde está el dinero?</h2>
                      <span className="pl-pill pl-pill--brand text-[11px] num">
                        {game.spacetime?.market?.asOfUtc ? (
                          <>
                            {game.spacetime.market.bookLabel.split(" · ")[0] ?? "Mercado"} ·{" "}
                            <time dateTime={game.spacetime.market.asOfUtc}>
                              {formatOddsCaptureEs(game.spacetime.market.asOfUtc)}
                            </time>
                          </>
                        ) : (
                          game.spacetime?.market?.bookLabel ?? "Mercado"
                        )}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs num min-w-0">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="truncate" style={{ color: "var(--pl-text-muted)" }}>
                          {game.home.shortName}: dinero / modelo
                        </span>
                        <strong className="shrink-0">
                          {flow.homeShare} %{game.x12 ? ` / ${(game.x12[0] * 100).toFixed(0)} %` : ""}
                        </strong>
                      </div>
                      <PBar p={flow.homeShare / 100} lead={flow.homeShare >= 50} />

                      {flow.drawShare !== undefined && hasDraw ? (
                        <>
                          <div className="flex items-center justify-between gap-2 pt-1 min-w-0">
                            <span className="truncate" style={{ color: "var(--pl-text-muted)" }}>
                              Empate: dinero / modelo
                            </span>
                            <strong className="shrink-0">
                              {flow.drawShare} %{game.x12 ? ` / ${(game.x12[1] * 100).toFixed(0)} %` : ""}
                            </strong>
                          </div>
                          <PBar p={flow.drawShare / 100} />
                        </>
                      ) : null}

                      <div className="flex items-center justify-between gap-2 pt-1 min-w-0">
                        <span className="truncate" style={{ color: "var(--pl-text-muted)" }}>
                          {game.away.shortName}: dinero / modelo
                        </span>
                        <strong className="shrink-0">
                          {flow.awayShare} %{game.x12 ? ` / ${(game.x12[2] * 100).toFixed(0)} %` : ""}
                        </strong>
                      </div>
                      <PBar p={flow.awayShare / 100} lead={flow.awayShare > 50} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 hairline-t text-xs min-w-0">
                    <span className="min-w-0 flex-1" style={{ color: "var(--pl-text-secondary)" }}>
                      {flow.sharpNote}
                    </span>
                    <button
                      type="button"
                      className="pl-btn-glass text-xs min-h-11 px-3 shrink-0"
                      onClick={() => setActiveTab("numeros")}
                    >
                      Ver números
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Factores clave del análisis */}
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
                  Señales cuantitativas que explican la probabilidad y confianza del modelo.
                </p>
              </div>
              {intelUnlocked && game.confidenceDetail?.reasons.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {game.confidenceDetail.reasons.map((reason) => (
                    <span key={reason} className="pl-pill text-[11px]">
                      {reason}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {!intelUnlocked && !isFinished ? (
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Los factores cuantitativos del encuentro están reservados para socios con Pase PitchLab Ultra.
              </p>
            ) : game.factors.length > 0 ? (
              <div className="pl-factors-grid">
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
        </MatchTabPanel>

        {/* Pestaña 2: Números esperados, mercados y simulador */}
        <MatchTabPanel idPrefix="pl-match" tabKey="numeros" active={activeTab}>
          <MatchNumbersPanel
            game={game}
            markets={activeMarkets}
            oddsFormat={oddsFormat}
            watermark={getSessionWatermark(viewerRole, viewerIdentity)}
            unlocked={intelUnlocked}
            isFinished={isFinished}
            canSeal={viewerRole !== "visitor"}
            outlook={detail?.outlook ?? null}
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
        </MatchTabPanel>

        {/* Pestaña 3: Contexto (tabla, forma, bajas, descanso, H2H y opiniones) */}
        <MatchTabPanel idPrefix="pl-match" tabKey="contexto" active={activeTab}>
          <MatchContextPanel
            game={game}
            standings={
              dataset.leagues.find((l) => l.league === game.league)?.standings ?? []
            }
            unlocked={intelUnlocked}
          />

          <section className="max-w-3xl">
            <aside
              aria-label="Opiniones de socios sobre el partido"
              className="glass-lens glass-ring rounded-3xl p-5 space-y-4"
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
                  <span className="text-xs font-semibold" style={{ color: "var(--pl-text-muted)" }}>
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
                          now ? `Ahora sigues a @${handle}.` : `Dejaste de seguir a @${handle}.`,
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
                  style={{ background: "var(--pl-surface)", color: "var(--pl-text-muted)" }}
                >
                  Aún no hay opiniones publicadas para este partido. Sé el primero en compartir tu
                  lectura.
                </p>
              )}

              <form onSubmit={handlePublishDebate} noValidate className="space-y-2 pt-2 hairline-t">
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
                  className="glass-input w-full p-2.5 text-xs resize-none"
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
              <SocialReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />
            </aside>
          </section>
        </MatchTabPanel>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
