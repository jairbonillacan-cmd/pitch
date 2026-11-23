"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  canonicalGameHref,
  getLeagueCapability,
  isLeagueHealthyForUi,
  isLivePhaseActive,
  sportHasDraw,
  type LeagueId,
  type LiveScoreboardEntry,
} from "@pitchlab/contracts";
import { LeagueBadge, TeamBadge } from "../../../sports";
import { formatOddsValue, isPickUnlocked } from "../../access-guard";
import { AtomicFormStrip, parseAtomicForm } from "../../atomic";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { ParlayPickButton } from "../../components/MatchList";
import { setActiveSharedTransition } from "../../navigation-helpers";
import { selectHeadlineMatchPick } from "../../pick-quality-ranker";
import { usePlatformActions, usePlatformCore } from "../../platform-provider";
import type { PlatformGame } from "../../types";
import {
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

function resolveFactorForm(
  game: PlatformGame,
  side: "home" | "away",
): string | null {
  const matcher = side === "home" ? /forma\s+local/i : /forma\s+visit/i;
  const hit = game.factors.find((factor) => matcher.test(factor.label));
  return hit?.value ?? null;
}

function resolveValidForm(
  explicit: readonly string[] | string | null | undefined,
  game: PlatformGame,
  side: "home" | "away",
): readonly string[] | string | null {
  const candidate = explicit ?? game[side].form ?? resolveFactorForm(game, side);
  if (!candidate) return null;
  const parsed = parseAtomicForm(candidate, { sport: game.sport, max: 5 });
  return parsed.length > 0 ? candidate : null;
}

function isDesktopViewportNow(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(min-width: 1024px)").matches
  );
}

export interface AstroMatchRowProps {
  readonly game: PlatformGame;
  readonly liveEntry?: LiveScoreboardEntry;
  readonly showOdds?: boolean;
  readonly isSelected?: boolean;
  readonly onSelectGame?: (game: PlatformGame) => void;
  readonly homeForm?: readonly string[] | string | null;
  readonly awayForm?: readonly string[] | string | null;
  readonly isWatched?: boolean;
  readonly onToggleWatchlist?: (gameId: string) => void;
  readonly showLeagueTag?: boolean;
}

function renderRowFormDashes(
  entries: readonly ReturnType<typeof parseAtomicForm>[number][],
  teamName: string,
): React.JSX.Element {
  if (entries.length === 0) {
    return (
      <span className="pl-home-md-score is-empty" aria-hidden="true">
        —
      </span>
    );
  }
  const summary = entries.map((entry) => entry.glyph).join(" ");
  return (
    <span
      className="pl-home-md-form-dashes"
      data-row-form-dashes=""
      aria-label={`Forma últimos ${entries.length} partidos de ${teamName}: ${summary}`}
      title={`${teamName}: ${summary}`}
    >
      {entries.map((entry, idx) => (
        <span
          key={`${entry.glyph}-${idx}`}
          className={`pl-home-md-form-dash is-${entry.outcome}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export const AstroMatchRow = React.memo(function AstroMatchRow({
  game,
  liveEntry,
  showOdds = false,
  isSelected = false,
  onSelectGame,
  homeForm,
  awayForm,
  isWatched = false,
  onToggleWatchlist,
  showLeagueTag = false,
}: AstroMatchRowProps): React.JSX.Element {
  const { viewerRole, oddsFormat, hasAccountSession, upgradeHref, userTimezone } = usePlatformCore();
  const { setAuraFromGame, navigateTo, prefetchRoute, toggleWatchlistGame } = usePlatformActions();

  const hasDraw = sportHasDraw(game.sport);
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
  const mainPick = selectHeadlineMatchPick(game.picks) ?? game.picks[0];
  const unlocked = mainPick ? isPickUnlocked(mainPick, game.status, viewerRole) : false;
  const outcome = hasForecast ? mostLikelyOutcome(game) : null;
  const [ph, pd, pa] = game.x12 ?? [0, 0, 0];
  const studioHref = canonicalGameHref(game.league, game);
  const matchLabel = `${game.home.name} contra ${game.away.name}`;
  const time = formatGameKickoffTime(game, userTimezone);

  const resolvedHomeForm = useMemo(
    () => resolveValidForm(homeForm, game, "home"),
    [homeForm, game],
  );
  const resolvedAwayForm = useMemo(
    () => resolveValidForm(awayForm, game, "away"),
    [awayForm, game],
  );
  const homeFormDashes = useMemo(
    () =>
      resolvedHomeForm
        ? parseAtomicForm(resolvedHomeForm, { sport: game.sport, max: 5 })
        : [],
    [game.sport, resolvedHomeForm],
  );
  const awayFormDashes = useMemo(
    () =>
      resolvedAwayForm
        ? parseAtomicForm(resolvedAwayForm, { sport: game.sport, max: 5 })
        : [],
    [game.sport, resolvedAwayForm],
  );

  const homeStrong = isFinished
    ? (activeScore?.home ?? 0) > (activeScore?.away ?? 0)
    : outcome?.side === "home";
  const awayStrong = isFinished
    ? (activeScore?.away ?? 0) > (activeScore?.home ?? 0)
    : outcome?.side === "away";

  const showRealScore = live || isFinished;
  const homeVal = showRealScore ? (activeScore?.home ?? "—") : null;
  const awayVal = showRealScore ? (activeScore?.away ?? "—") : null;

  const handleActivateMatch = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    setAuraFromGame(game);
    if (isDesktopViewportNow() && onSelectGame) {
      onSelectGame(game);
      return;
    }
    setActiveSharedTransition(e.currentTarget.closest("article"), "pl-match-hero");
    navigateTo(studioHref);
  };

  const handleCardSurfaceClick = (e: React.MouseEvent<HTMLElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    const target = e.target;
    if (target instanceof Element && target.closest("a, button")) {
      return;
    }
    setAuraFromGame(game);
    if (isDesktopViewportNow() && onSelectGame) {
      onSelectGame(game);
      return;
    }
    setActiveSharedTransition(e.currentTarget, "pl-match-hero");
    navigateTo(studioHref);
  };

  const handleToggleStar = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggleWatchlist) {
      onToggleWatchlist(game.id);
      return;
    }
    toggleWatchlistGame(game.id);
  };

  const liveProgressText =
    live && mainPick && unlocked && activeScore
      ? `${mainPick.label} · ${activeScore.home}–${activeScore.away}`
      : null;

  return (
    <article
      className={`pl-astro-row pl-home-md-row ${live ? "is-live" : ""} ${isFinished ? "is-finished" : ""} ${isSelected ? "is-selected" : ""}`.trim()}
      data-game-card={game.id}
      data-game-id={game.id}
      data-selected={isSelected ? "true" : "false"}
      onClick={handleCardSurfaceClick}
      onMouseEnter={() => setAuraFromGame(game)}
    >
      <div className="pl-home-md-row-grid">
        <a
          href={studioHref}
          onPointerEnter={() => prefetchRoute(studioHref)}
          onTouchStart={() => prefetchRoute(studioHref)}
          onClick={handleActivateMatch}
          data-card-open=""
          aria-current={isSelected ? "true" : undefined}
          className="pl-home-md-row-trigger no-underline"
        >
          <span className="sr-only">{`Ver partido · ${matchLabel}${live ? " · en vivo" : ""} · `}</span>
          <span className="pl-home-md-row-time num">
            {live ? (
              <span className="pl-home-md-live-chip pl-home-card-live">
                <span className="pl-home-live-sport" aria-hidden="true">
                  <LiveSportBallIcon sport={game.sport} />
                </span>
                <span className="pl-home-live-dot" aria-hidden="true" />
                <span>{formatLiveChipPhase(liveEntry)}</span>
              </span>
            ) : (
              <>
                <strong className="pl-home-md-clock">{time}</strong>
                <span className={`pl-home-md-status ${isFinished ? "is-ft" : ""}`.trim()}>
                  {isFinished ? "FT" : shortDateLabel(game.dayId)}
                </span>
              </>
            )}
          </span>

          <span className="pl-home-md-row-teams">
            {showLeagueTag ? (
              <span className="pl-home-md-row-league">
                <LeagueBadge
                  league={game.league}
                  label={game.leagueLabel}
                  logoUrl={game.leagueLogoUrl}
                  size={14}
                  decorative
                />
                <span className="truncate">{game.leagueLabel}</span>
              </span>
            ) : null}

            <span className="pl-home-md-team-line">
              <TeamBadge
                league={game.league}
                slug={game.home.slug}
                name={game.home.name}
                logoUrl={game.home.logoUrl}
                size={20}
              />
              <span
                className={`pl-team-link pl-home-md-team-name ${homeStrong ? "is-strong" : ""}`.trim()}
              >
                {game.home.shortName || game.home.name}
              </span>
              {showRealScore && resolvedHomeForm ? (
                <span className="pl-home-md-form-strip" data-home-form-strip="">
                  <AtomicFormStrip
                    form={resolvedHomeForm}
                    sport={game.sport}
                    max={5}
                    size="xs"
                    teamName={game.home.shortName || game.home.name}
                    emptyFallback={null}
                  />
                </span>
              ) : null}
              {showRealScore ? (
                <strong
                  className={`pl-home-md-score num ${homeStrong ? "is-strong" : ""} ${live ? "is-live" : ""}`.trim()}
                >
                  {homeVal}
                </strong>
              ) : (
                renderRowFormDashes(homeFormDashes, game.home.shortName || game.home.name)
              )}
            </span>

            <span className="pl-home-md-team-line">
              <TeamBadge
                league={game.league}
                slug={game.away.slug}
                name={game.away.name}
                logoUrl={game.away.logoUrl}
                size={20}
              />
              <span
                className={`pl-team-link pl-home-md-team-name ${awayStrong ? "is-strong" : ""}`.trim()}
              >
                {game.away.shortName || game.away.name}
              </span>
              {showRealScore && resolvedAwayForm ? (
                <span className="pl-home-md-form-strip" data-home-form-strip="">
                  <AtomicFormStrip
                    form={resolvedAwayForm}
                    sport={game.sport}
                    max={5}
                    size="xs"
                    teamName={game.away.shortName || game.away.name}
                    emptyFallback={null}
                  />
                </span>
              ) : null}
              {showRealScore ? (
                <strong
                  className={`pl-home-md-score num ${awayStrong ? "is-strong" : ""} ${live ? "is-live" : ""}`.trim()}
                >
                  {awayVal}
                </strong>
              ) : (
                renderRowFormDashes(awayFormDashes, game.away.shortName || game.away.name)
              )}
            </span>
          </span>
        </a>

        <div className="pl-home-md-row-side">
          <button
            type="button"
            className={`pl-home-md-star-btn ${isWatched ? "is-fav" : ""}`.trim()}
            aria-pressed={isWatched}
            aria-label={
              isWatched
                ? `Quitar ${matchLabel} de favoritos`
                : `Seguir ${matchLabel}`
            }
            title={isWatched ? "Siguiendo partido" : "Seguir partido"}
            onClick={handleToggleStar}
          >
            <MaestroIcon name="star" size={14} />
          </button>
        </div>
      </div>

      {showOdds && !isFinished && hasForecast && unlocked && outcome ? (
        <div className="pl-home-md-odds-inline num" aria-label="Momios justos por resultado">
          <span className={`pl-home-md-odd-cell ${outcome.side === "home" ? "is-best" : ""}`.trim()}>
            <small>1</small>
            <strong>{ph > 0.01 ? formatOddsValue(1 / ph, oddsFormat) : "—"}</strong>
          </span>
          {hasDraw ? (
            <span className={`pl-home-md-odd-cell ${outcome.side === "draw" ? "is-best" : ""}`.trim()}>
              <small>X</small>
              <strong>{pd > 0.01 ? formatOddsValue(1 / pd, oddsFormat) : "—"}</strong>
            </span>
          ) : null}
          <span className={`pl-home-md-odd-cell ${outcome.side === "away" ? "is-best" : ""}`.trim()}>
            <small>2</small>
            <strong>{pa > 0.01 ? formatOddsValue(1 / pa, oddsFormat) : "—"}</strong>
          </span>
        </div>
      ) : null}

      <div className="pl-home-md-row-foot">
        {isFinished ? (
          <span className="pl-home-md-pick-badge is-ft num">
            {mainPick ? (
              <>
                <span className="truncate">{mainPick.label}</span>
                {mainPick.result ? (
                  <strong
                    className={`pl-home-md-pick-res is-${mainPick.result}`.trim()}
                  >
                    {mainPick.result === "hit" ? "Acertado" : "Fallado"}
                  </strong>
                ) : null}
              </>
            ) : (
              <span>Partido finalizado</span>
            )}
          </span>
        ) : !hasForecast ? (
          <span className="pl-home-md-pick-badge" data-empty-forecast="">
            Sin pronóstico publicado
          </span>
        ) : mainPick && unlocked ? (
          <>
            <span className={`pl-home-md-pick-badge num ${live ? "is-live" : ""}`.trim()}>
              <strong className="truncate">
                {liveProgressText ?? mainPick.label}
              </strong>
              {!live ? (
                <span className="pl-home-md-pick-meta">
                  {(mainPick.p * 100).toFixed(0)} % · {formatOddsValue(mainPick.fairDecimal, oddsFormat)}
                </span>
              ) : null}
            </span>
            {!live ? (
              <span
                className="pl-home-md-parlay-wrap"
                onClick={(e) => e.stopPropagation()}
              >
                <ParlayPickButton
                  pick={mainPick}
                  matchLabel={matchLabel}
                  className="pl-home-parlay-btn is-sm pl-home-md-parlay-btn"
                />
              </span>
            ) : null}
          </>
        ) : (
          <span className="pl-home-md-pick-badge is-locked" data-card-locked="">
            <MaestroIcon name="lock" size={12} />
            <a
              href={upgradeHref}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigateTo(upgradeHref);
              }}
              className="pl-home-md-lock-link no-underline"
            >
              {hasAccountSession ? "Activar Pase Ultra" : "Pick Pase PitchLab Ultra"}
            </a>
          </span>
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
  selectedGameId = null,
  onSelectGame,
  teamFormLookup,
  watchlistSet,
  onToggleWatchlist,
  recommendedGames,
  showRecommendedAccordion = false,
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
  readonly selectedGameId?: string | null;
  readonly onSelectGame?: (game: PlatformGame) => void;
  readonly teamFormLookup?: ReadonlyMap<string, readonly string[]>;
  readonly watchlistSet?: ReadonlySet<string>;
  readonly onToggleWatchlist?: (gameId: string) => void;
  readonly recommendedGames?: readonly PlatformGame[];
  readonly showRecommendedAccordion?: boolean;
}): React.JSX.Element {
  const { navigateTo, prefetchRoute } = usePlatformActions();
  const [limitState, setLimitState] = useState<{
    readonly key: string | undefined;
    readonly limit: number;
  }>(() => ({
    key: resetKey,
    limit: INITIAL_HOME_CARDS_LIMIT,
  }));
  const limit = limitState.key === resetKey ? limitState.limit : INITIAL_HOME_CARDS_LIMIT;
  const [collapsedLeagues, setCollapsedLeagues] = useState<ReadonlySet<string>>(() => new Set());
  const [recommendedOpen, setRecommendedOpen] = useState<boolean>(true);

  const toggleCollapseLeague = useCallback((lg: string) => {
    setCollapsedLeagues((prev) => {
      const next = new Set(prev);
      if (next.has(lg)) next.delete(lg);
      else next.add(lg);
      return next;
    });
  }, []);

  const activeRecommended = useMemo<readonly PlatformGame[]>(() => {
    if (!showRecommendedAccordion || !recommendedGames || recommendedGames.length === 0) {
      return [];
    }
    return recommendedGames;
  }, [recommendedGames, showRecommendedAccordion]);

  const recommendedIdSet = useMemo(
    () => new Set(activeRecommended.map((g) => g.id)),
    [activeRecommended],
  );

  const healthyLeagues = useMemo(() => {
    const out: Array<
      ReturnType<typeof groupMatchesByDayAndLeague>[number]["leagues"][number]
    > = [];
    for (const dayGroup of groups) {
      for (const leagueGroup of dayGroup.leagues) {
        const capability = getLeagueCapability(leagueGroup.league);
        if (
          capability &&
          !isLeagueHealthyForUi(leagueGroup.league, {
            hasValidSnapshot: true,
            gamesCount: leagueGroup.count,
          })
        ) {
          continue;
        }
        const filteredGames =
          recommendedIdSet.size > 0
            ? leagueGroup.games.filter((g) => !recommendedIdSet.has(g.id))
            : leagueGroup.games;
        if (filteredGames.length > 0) {
          out.push({
            ...leagueGroup,
            count: filteredGames.length,
            games: filteredGames,
          });
        }
      }
    }
    return out;
  }, [groups, recommendedIdSet]);

  const totalLeagueGames = healthyLeagues.reduce((sum, lg) => sum + lg.games.length, 0);
  const totalGames = totalLeagueGames + activeRecommended.length;

  const lookupTeamForm = useCallback(
    (game: PlatformGame, side: "home" | "away"): readonly string[] | null => {
      if (!teamFormLookup) return null;
      const team = side === "home" ? game.home : game.away;
      return (
        teamFormLookup.get(`${game.league}::${team.slug.toLowerCase()}`) ??
        teamFormLookup.get(`${game.league}::${team.code.toLowerCase()}`) ??
        teamFormLookup.get(`${game.league}::${team.shortName.toLowerCase()}`) ??
        null
      );
    },
    [teamFormLookup],
  );

  if (totalGames === 0) {
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

  let remaining = Math.max(1, limit - activeRecommended.length);
  const visibleLeagues: typeof healthyLeagues = [];
  for (const leagueGroup of healthyLeagues) {
    if (remaining <= 0) break;
    const take = leagueGroup.games.slice(0, remaining);
    remaining -= take.length;
    if (take.length > 0) {
      visibleLeagues.push({ ...leagueGroup, games: take });
    }
  }

  return (
    <div className="pl-home-cards pl-astro-leagues">
      {activeRecommended.length > 0 ? (
        <section
          aria-label="Recomendados para ti"
          className="pl-astro-league-block pl-home-md-recommended glass-card glass-ring"
          data-home-recommended=""
        >
          <header
            className={`pl-astro-league-head pl-home-md-rec-head ${!recommendedOpen ? "is-collapsed" : ""}`.trim()}
          >
            <h2 className="pl-home-md-rec-heading">
              <button
                type="button"
                className="pl-home-md-rec-toggle"
                aria-expanded={recommendedOpen}
                onClick={() => setRecommendedOpen((open) => !open)}
              >
                <span className="pl-home-md-rec-title-wrap">
                  <MaestroIcon name="sparkles" size={14} />
                  <span className="pl-astro-league-title">Recomendados para ti</span>
                </span>
                <span className="pl-home-md-rec-meta">
                  <span className="pl-astro-league-count num">{activeRecommended.length}</span>
                  <MaestroIcon
                    name="chevronDown"
                    size={15}
                    className={`pl-home-md-chevron ${!recommendedOpen ? "is-collapsed" : ""}`.trim()}
                  />
                </span>
              </button>
            </h2>
          </header>

          {recommendedOpen ? (
            <div className="pl-astro-rows">
              {activeRecommended.map((g) => (
                <AstroMatchRow
                  key={g.id}
                  game={g}
                  liveEntry={liveByGameId.get(g.id)}
                  showOdds={showOdds}
                  isSelected={selectedGameId === g.id}
                  onSelectGame={onSelectGame}
                  homeForm={lookupTeamForm(g, "home")}
                  awayForm={lookupTeamForm(g, "away")}
                  isWatched={watchlistSet ? watchlistSet.has(g.id) : false}
                  onToggleWatchlist={onToggleWatchlist}
                  showLeagueTag
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {visibleLeagues.map((leagueGroup) => {
        const region = leagueRegionOf(leagueGroup.league);
        const leagueHref = `/app/${leagueGroup.league}`;
        const isFav = favoriteLeagueSet.has(leagueGroup.league);
        const isCollapsed = collapsedLeagues.has(leagueGroup.league);
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
                  size={24}
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
                    isSelected={selectedGameId === g.id}
                    onSelectGame={onSelectGame}
                    homeForm={lookupTeamForm(g, "home")}
                    awayForm={lookupTeamForm(g, "away")}
                    isWatched={watchlistSet ? watchlistSet.has(g.id) : false}
                    onToggleWatchlist={onToggleWatchlist}
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
