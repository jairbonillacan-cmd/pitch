"use client";

import React, { useCallback, useState } from "react";
import {
  canonicalGameHref,
  canonicalTeamHref,
  isLivePhaseActive,
  sportHasDraw,
  sportScoringUnit,
  type LeagueId,
  type LiveScoreboardEntry,
} from "@pitchlab/contracts";
import { LeagueBadge, PBar, ProbSplit, TeamBadge } from "../../../sports";
import { formatOddsValue, isPickUnlocked, isPreGameIntelUnlocked } from "../../access-guard";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import {
  ParlayPickButton,
  formatCountsHint,
  formatGoalLineHint,
} from "../../components/MatchList";
import { setActiveSharedTransition } from "../../navigation-helpers";
import { usePlatformActions, usePlatformCore } from "../../platform-provider";
import type { PlatformGame } from "../../types";
import {
  alternativePick,
  groupMatchesByDayAndLeague,
  mostLikelyOutcome,
  shortDateLabel,
} from "./home-model";
import {
  countLabel,
  formatGameKickoffTime,
  formatLiveChipPhase,
  leagueRegionOf,
  type HomeBoardView,
} from "./home-view-helpers";
import { LiveSportBallIcon } from "./HomeFilterBar";

export const INITIAL_HOME_CARDS_LIMIT = 10;

export const AstroMatchRow = React.memo(function AstroMatchRow({
  game,
  liveEntry,
  showOdds = false,
}: {
  readonly game: PlatformGame;
  readonly liveEntry?: LiveScoreboardEntry;
  readonly showOdds?: boolean;
}): React.JSX.Element {
  const { viewerRole, oddsFormat, hasAccountSession, upgradeHref, userTimezone } = usePlatformCore();
  const { setAuraFromGame, navigateTo, prefetchRoute } = usePlatformActions();

  const hasDraw = sportHasDraw(game.sport);
  const unit = sportScoringUnit(game.sport);
  const decimals = unit.decimals;
  const hasForecast = game.hasForecast !== false && Boolean(game.x12 && game.projection);
  const live =
    (liveEntry ? isLivePhaseActive(liveEntry.phase) : false) || String(game.status) === "LIVE";
  const isFinished =
    !live &&
    (game.status === "FT" || liveEntry?.phase === "final") &&
    (game.score !== undefined || liveEntry?.score != null);
  const activeScore = live
    ? (liveEntry?.score ?? game.score ?? null)
    : (game.score ?? liveEntry?.score ?? null);
  const mainPick = game.picks[0];
  const unlocked = mainPick ? isPickUnlocked(mainPick, game.status, viewerRole) : false;
  const intelUnlocked = isFinished || isPreGameIntelUnlocked(game, viewerRole);
  const alt = unlocked ? alternativePick(game) : null;
  const outcome = hasForecast ? mostLikelyOutcome(game) : null;
  const goalHint = hasForecast ? formatGoalLineHint(game, intelUnlocked) : null;
  const countsHint = hasForecast ? formatCountsHint(game, intelUnlocked) : null;
  const [ph, pd, pa] = game.x12 ?? [0, 0, 0];
  const studioHref = canonicalGameHref(game.league, game);
  const homeHref = canonicalTeamHref(game.league, game.home.slug);
  const awayHref = canonicalTeamHref(game.league, game.away.slug);
  const matchLabel = `${game.home.name} contra ${game.away.name}`;
  const time = formatGameKickoffTime(game, userTimezone);

  const homeStrong = isFinished
    ? (activeScore?.home ?? 0) > (activeScore?.away ?? 0)
    : outcome?.side === "home";
  const awayStrong = isFinished
    ? (activeScore?.away ?? 0) > (activeScore?.home ?? 0)
    : outcome?.side === "away";

  const showRealScore = live || isFinished;
  const homeVal = showRealScore
    ? (activeScore?.home ?? "—")
    : unlocked && game.projection
      ? game.projection.home.toFixed(decimals)
      : "—";
  const awayVal = showRealScore
    ? (activeScore?.away ?? "—")
    : unlocked && game.projection
      ? game.projection.away.toFixed(decimals)
      : "—";

  const scoreCaption = live
    ? "en vivo"
    : isFinished
      ? "final"
      : unlocked && game.projection
        ? `${unit.short} proy.`
        : "";

  const openStudio = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setActiveSharedTransition(e.currentTarget.closest("article"), "pl-match-hero");
    setAuraFromGame(game);
    navigateTo(studioHref);
  };

  const openTeam = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveSharedTransition(
      e.currentTarget.closest(".pl-astro-team-line") as HTMLElement | null,
      "pl-team-hero",
    );
    setAuraFromGame(game);
    navigateTo(href);
  };

  return (
    <article
      className={`pl-astro-row ${live ? "is-live" : ""} ${isFinished ? "is-finished" : ""}`.trim()}
      data-game-card={game.id}
      onMouseEnter={() => setAuraFromGame(game)}
    >
      <div className="pl-astro-row-top">
        <a
          href={studioHref}
          onPointerEnter={() => prefetchRoute(studioHref)}
          onTouchStart={() => prefetchRoute(studioHref)}
          onClick={openStudio}
          data-card-open=""
          aria-label={`Ver partido ${matchLabel}`}
          className="pl-astro-row-meta num no-underline"
        >
          {live ? (
            <span className="pl-astro-live-pill pl-home-card-live">
              <span className="pl-home-live-sport" aria-hidden="true">
                <LiveSportBallIcon sport={game.sport} />
              </span>
              <span className="pl-home-live-dot" aria-hidden="true" />
              <span>{formatLiveChipPhase(liveEntry)}</span>
            </span>
          ) : (
            <span className="pl-astro-time-badge">
              <strong className="pl-astro-clock">
                {shortDateLabel(game.dayId)} · {time}
              </strong>
              <span className="pl-astro-status">{isFinished ? "Final" : "Por jugar"}</span>
            </span>
          )}
          {game.round || game.venue ? (
            <span className="pl-astro-venue-meta truncate">
              {game.round}
              {game.venue ? `${game.round ? " · " : ""}${game.venue}` : ""}
            </span>
          ) : null}
        </a>
      </div>

      <div className="pl-astro-row-body">
        <div className="pl-astro-matchup-box">
          <div className="pl-astro-col-teams">
            <div className="pl-astro-team-line">
              <TeamBadge
                league={game.league}
                slug={game.home.slug}
                name={game.home.name}
                logoUrl={game.home.logoUrl}
                size={24}
              />
              <div className="pl-astro-team-info">
                <a
                  href={homeHref}
                  onPointerEnter={() => prefetchRoute(homeHref)}
                  onTouchStart={() => prefetchRoute(homeHref)}
                  onClick={openTeam(homeHref)}
                  className={`pl-team-link pl-astro-team-name ${homeStrong ? "is-strong" : ""}`.trim()}
                >
                  {game.home.name}
                </a>
                {!game.neutralSite || game.home.record ? (
                  <div className="pl-astro-team-sub">
                    {!game.neutralSite ? <span className="pl-side-tag is-home">Local</span> : null}
                    {game.home.record ? (
                      <span className="pl-astro-team-rec num">{game.home.record}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <a
                href={studioHref}
                onClick={openStudio}
                tabIndex={-1}
                aria-hidden="true"
                className={`pl-astro-team-score num no-underline ${homeStrong ? "is-strong" : ""}`.trim()}
              >
                {homeVal}
              </a>
            </div>

            <div className="pl-astro-team-line">
              <TeamBadge
                league={game.league}
                slug={game.away.slug}
                name={game.away.name}
                logoUrl={game.away.logoUrl}
                size={24}
              />
              <div className="pl-astro-team-info">
                <a
                  href={awayHref}
                  onPointerEnter={() => prefetchRoute(awayHref)}
                  onTouchStart={() => prefetchRoute(awayHref)}
                  onClick={openTeam(awayHref)}
                  className={`pl-team-link pl-astro-team-name ${awayStrong ? "is-strong" : ""}`.trim()}
                >
                  {game.away.name}
                </a>
                {!game.neutralSite || game.away.record ? (
                  <div className="pl-astro-team-sub">
                    {!game.neutralSite ? <span className="pl-side-tag">Visita</span> : null}
                    {game.away.record ? (
                      <span className="pl-astro-team-rec num">{game.away.record}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <a
                href={studioHref}
                onClick={openStudio}
                tabIndex={-1}
                aria-hidden="true"
                className={`pl-astro-team-score num no-underline ${awayStrong ? "is-strong" : ""}`.trim()}
              >
                {awayVal}
              </a>
            </div>
          </div>

          {scoreCaption ? (
            <div className="pl-astro-score-caption num">{scoreCaption}</div>
          ) : null}
        </div>

        {!isFinished && hasForecast && outcome ? (
          <div className="pl-astro-prob-box">
            <ProbSplit
              probabilities={hasDraw ? [ph, pd, pa] : [ph, pa]}
              labels={
                hasDraw
                  ? [game.home.shortName, "Empate", game.away.shortName]
                  : [game.home.shortName, game.away.shortName]
              }
              showLabels
            />

            {showOdds && unlocked ? (
              <div className="pl-astro-odds-strip num" aria-label="Momios justos por resultado">
                <span className={`pl-astro-odd-pill ${outcome.side === "home" ? "is-best" : ""}`.trim()}>
                  <small>1</small>
                  <strong>{ph > 0.01 ? formatOddsValue(1 / ph, oddsFormat) : "—"}</strong>
                </span>
                {hasDraw ? (
                  <span
                    className={`pl-astro-odd-pill ${outcome.side === "draw" ? "is-best" : ""}`.trim()}
                  >
                    <small>X</small>
                    <strong>{pd > 0.01 ? formatOddsValue(1 / pd, oddsFormat) : "—"}</strong>
                  </span>
                ) : null}
                <span className={`pl-astro-odd-pill ${outcome.side === "away" ? "is-best" : ""}`.trim()}>
                  <small>2</small>
                  <strong>{pa > 0.01 ? formatOddsValue(1 / pa, oddsFormat) : "—"}</strong>
                </span>
              </div>
            ) : null}

            <div className="pl-astro-outcome-strip num">
              <strong className="pl-astro-outcome-name truncate">{outcome.label}</strong>
              <span className="pl-astro-outcome-summary shrink-0">
                <strong className="pl-astro-outcome-pct">{(outcome.p * 100).toFixed(1)} %</strong>
                <span className="pl-astro-outcome-fair">
                  justo {formatOddsValue(1 / Math.max(outcome.p, 0.0001), oddsFormat)}
                </span>
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="pl-astro-row-foot">
        {isFinished ? (
          <div className="pl-astro-ft-wrap">
            {mainPick ? (
              <span className="pl-astro-ft-pick num">
                <span>Pick publicado:</span>
                <strong>{mainPick.label}</strong>
                <span>({(mainPick.p * 100).toFixed(0)} %)</span>
              </span>
            ) : (
              <span className="pl-astro-ft-pick">Partido finalizado</span>
            )}
            <a
              href={studioHref}
              onPointerEnter={() => prefetchRoute(studioHref)}
              onTouchStart={() => prefetchRoute(studioHref)}
              onClick={openStudio}
              className="pl-btn-glass text-xs min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 px-3 inline-flex items-center gap-1.5 no-underline"
            >
              <span>Ver partido</span>
              <MaestroIcon name="arrowRight" size={12} />
            </a>
          </div>
        ) : !hasForecast ? (
          <div className="pl-astro-ft-wrap" data-empty-forecast="">
            <span className="pl-mlist-chip">Sin pronóstico publicado</span>
            <a
              href={studioHref}
              onPointerEnter={() => prefetchRoute(studioHref)}
              onTouchStart={() => prefetchRoute(studioHref)}
              onClick={openStudio}
              className="pl-btn-glass text-xs min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 px-3 inline-flex items-center gap-1.5 no-underline"
            >
              <span>Ver partido</span>
              <MaestroIcon name="arrowRight" size={12} />
            </a>
          </div>
        ) : mainPick && unlocked ? (
          <div className="pl-astro-pick-card">
            <div className="pl-astro-pick-main">
              <div className="pl-astro-pick-headline">
                <strong className="pl-astro-pick-label">{mainPick.label}</strong>
                <strong className="pl-astro-pick-prob num">{(mainPick.p * 100).toFixed(1)} %</strong>
              </div>

              <PBar p={mainPick.p} lead />

              <div className="pl-astro-pick-sub num">
                <span className="pl-astro-pick-odds-inline">
                  Momio justo{" "}
                  <strong style={{ color: "var(--pl-text)" }}>
                    {formatOddsValue(mainPick.fairDecimal, oddsFormat)}
                  </strong>
                  {showOdds && mainPick.marketDecimal ? (
                    <>
                      {" "}· Casa{" "}
                      <strong style={{ color: "var(--pl-brand)" }}>
                        {formatOddsValue(mainPick.marketDecimal, oddsFormat)}
                      </strong>
                    </>
                  ) : null}
                </span>
                {goalHint || countsHint ? (
                  <span className="pl-astro-pick-hints">
                    {goalHint ? (
                      <span className="pl-mlist-chip is-goals num" data-goal-line="">
                        {goalHint}
                      </span>
                    ) : null}
                    {countsHint ? (
                      <span className="pl-mlist-chip is-counts num" data-counts-hint="">
                        {countsHint}
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {alt ? (
                  <span className="truncate">
                    También: <strong style={{ color: "var(--pl-text)" }}>{alt.label}</strong> ·{" "}
                    {(alt.p * 100).toFixed(0)} %
                  </span>
                ) : null}
              </div>
            </div>

            <div className="pl-astro-pick-actions">
              {!live ? <ParlayPickButton pick={mainPick} matchLabel={matchLabel} /> : null}
              <a
                href={studioHref}
                onPointerEnter={() => prefetchRoute(studioHref)}
                onTouchStart={() => prefetchRoute(studioHref)}
                onClick={openStudio}
                className="pl-btn-glass text-xs min-h-11 px-3 inline-flex items-center justify-center gap-1.5 no-underline"
              >
                <span>Ver partido · {countLabel(game.picks.length, "pick", "picks")}</span>
                <MaestroIcon name="arrowRight" size={13} />
              </a>
            </div>
          </div>
        ) : (
          <div className="pl-astro-ft-wrap" data-card-locked="">
            <div className="flex items-center gap-2 min-w-0">
              <MaestroIcon name="lock" size={13} />
              <span className="text-xs font-bold" style={{ color: "var(--pl-brand)" }}>
                Pick principal y marcador proyectado
              </span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={upgradeHref}
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo(upgradeHref);
                }}
                className="pl-btn-accent text-xs min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-10 px-3 inline-flex items-center gap-1.5 no-underline"
              >
                <MaestroIcon name="unlock" size={12} />
                <span>{hasAccountSession ? "Activar Pase Ultra" : "Pase PitchLab Ultra"}</span>
              </a>
              <a
                href={studioHref}
                onPointerEnter={() => prefetchRoute(studioHref)}
                onTouchStart={() => prefetchRoute(studioHref)}
                onClick={openStudio}
                className="pl-btn-glass text-xs min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-10 px-3 inline-flex items-center gap-1.5 no-underline"
              >
                <span>Ver partido</span>
                <MaestroIcon name="arrowRight" size={12} />
              </a>
            </div>
          </div>
        )}
      </div>
    </article>
  );
});

export function HomeMatchCardsSection({
  groups,
  liveByGameId,
  showOdds = false,
  boardView = "all",
  favoriteLeagueSet,
  onToggleFavoriteLeague,
  onResetFilters,
  hasActiveFilters = false,
  resetKey,
}: {
  readonly groups: ReturnType<typeof groupMatchesByDayAndLeague>;
  readonly today: string;
  readonly liveByGameId: ReadonlyMap<string, LiveScoreboardEntry>;
  readonly showOdds?: boolean;
  readonly boardView?: HomeBoardView;
  readonly favoriteLeagueSet: ReadonlySet<string>;
  readonly onToggleFavoriteLeague: (lg: LeagueId) => void;
  readonly onResetFilters?: () => void;
  readonly hasActiveFilters?: boolean;
  readonly resetKey?: string;
}): React.JSX.Element {
  const { navigateTo, prefetchRoute } = usePlatformActions();
  const totalGames = groups.reduce((sum, d) => sum + d.count, 0);
  const [limitState, setLimitState] = useState<{
    readonly key: string | undefined;
    readonly limit: number;
  }>(() => ({
    key: resetKey,
    limit: INITIAL_HOME_CARDS_LIMIT,
  }));
  const limit = limitState.key === resetKey ? limitState.limit : INITIAL_HOME_CARDS_LIMIT;
  const [collapsedLeagues, setCollapsedLeagues] = useState<ReadonlySet<string>>(() => new Set());

  const toggleCollapseLeague = useCallback((lg: string) => {
    setCollapsedLeagues((prev) => {
      const next = new Set(prev);
      if (next.has(lg)) next.delete(lg);
      else next.add(lg);
      return next;
    });
  }, []);

  if (groups.length === 0) {
    return (
      <div
        className="glass-card glass-ring rounded-2xl p-7 text-center text-sm space-y-3"
        style={{ color: "var(--pl-text-muted)" }}
      >
        <p className="m-0">
          {boardView === "favorites"
            ? "Hoy no hay partidos en tus ligas o equipos favoritos con este filtro."
            : "No hay partidos con este filtro. Prueba otro día o limpia los filtros activos."}
        </p>
        {hasActiveFilters && onResetFilters ? (
          <div>
            <button
              type="button"
              className="pl-btn-glass text-xs min-h-11 px-4"
              onClick={onResetFilters}
            >
              Restablecer filtros
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  let remaining = limit;
  const visibleLeagues: Array<
    ReturnType<typeof groupMatchesByDayAndLeague>[number]["leagues"][number]
  > = [];
  for (const dayGroup of groups) {
    for (const leagueGroup of dayGroup.leagues) {
      if (remaining <= 0) break;
      const take = leagueGroup.games.slice(0, remaining);
      remaining -= take.length;
      if (take.length > 0) {
        visibleLeagues.push({ ...leagueGroup, games: take });
      }
    }
  }

  return (
    <div className="pl-home-cards pl-astro-leagues">
      {visibleLeagues.map((leagueGroup) => {
        const region = leagueRegionOf(leagueGroup.league);
        const leagueHref = `/app/${leagueGroup.league}`;
        const isFav = favoriteLeagueSet.has(leagueGroup.league);
        const isCollapsed = boardView === "competitions" && collapsedLeagues.has(leagueGroup.league);
        const liveInLeague = leagueGroup.games.reduce((acc, g) => {
          const entry = liveByGameId.get(g.id);
          const isLive =
            (entry ? isLivePhaseActive(entry.phase) : false) || String(g.status) === "LIVE";
          return acc + (isLive ? 1 : 0);
        }, 0);

        return (
          <section
            key={leagueGroup.league}
            aria-label={leagueGroup.label}
            className="pl-astro-league-block glass-card glass-ring"
            data-league-group={leagueGroup.league}
          >
            <header className={`pl-astro-league-head ${isCollapsed ? "is-collapsed" : ""}`.trim()}>
              <a
                href={leagueHref}
                onPointerEnter={() => prefetchRoute(leagueHref)}
                onTouchStart={() => prefetchRoute(leagueHref)}
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo(leagueHref);
                }}
                className="pl-league-link pl-astro-league-link"
              >
                <LeagueBadge
                  league={leagueGroup.league}
                  label={leagueGroup.label}
                  logoUrl={leagueGroup.logoUrl}
                  size={26}
                />
                <div className="min-w-0 flex-1">
                  <h2 className="pl-astro-league-title">{leagueGroup.label}</h2>
                  <span className="pl-astro-league-sub">
                    {region}
                    {leagueGroup.round ? ` · ${leagueGroup.round}` : ""}
                  </span>
                </div>
              </a>

              <div className="pl-astro-league-head-actions">
                {liveInLeague > 0 ? (
                  <span className="pl-astro-league-live num">{liveInLeague} en vivo</span>
                ) : null}
                <span className="pl-astro-league-count num">
                  {countLabel(leagueGroup.count, "partido", "partidos")}
                </span>
                <button
                  type="button"
                  className={`pl-astro-fav-btn ${isFav ? "is-fav" : ""}`.trim()}
                  aria-pressed={isFav}
                  aria-label={
                    isFav
                      ? `Quitar ${leagueGroup.label} de favoritos`
                      : `Agregar ${leagueGroup.label} a favoritos`
                  }
                  title={isFav ? "En favoritos" : "Agregar a favoritos"}
                  onClick={() => onToggleFavoriteLeague(leagueGroup.league)}
                >
                  <MaestroIcon name="star" size={14} />
                </button>
                {boardView === "competitions" ? (
                  <button
                    type="button"
                    className={`pl-astro-collapse-btn ${isCollapsed ? "is-collapsed" : ""}`.trim()}
                    aria-expanded={!isCollapsed}
                    aria-label={
                      isCollapsed
                        ? `Mostrar partidos de ${leagueGroup.label}`
                        : `Contraer ${leagueGroup.label}`
                    }
                    onClick={() => toggleCollapseLeague(leagueGroup.league)}
                  >
                    <MaestroIcon name="chevronDown" size={15} />
                  </button>
                ) : null}
              </div>
            </header>

            {!isCollapsed ? (
              <div className="pl-astro-rows">
                {leagueGroup.games.map((g) => (
                  <AstroMatchRow
                    key={g.id}
                    game={g}
                    liveEntry={liveByGameId.get(g.id)}
                    showOdds={showOdds}
                  />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}

      {totalGames > limit ? (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            className="pl-btn-glass text-xs min-h-11 px-4 num"
            onClick={() =>
              setLimitState({
                key: resetKey,
                limit: limit + INITIAL_HOME_CARDS_LIMIT,
              })
            }
          >
            Ver más partidos ({totalGames - limit})
          </button>
        </div>
      ) : null}
    </div>
  );
}
