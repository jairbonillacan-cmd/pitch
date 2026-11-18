"use client";

import { sportHasDraw, sportScoringUnit } from "@pitchlab/contracts";
import React, { useState } from "react";
import { LeagueBadge, ProbSplit, TeamBadge } from "../../sports";
import { isPickUnlocked, isPreGameIntelUnlocked } from "../access-guard";
import {
  longDayLabel,
  mostLikelyOutcome,
  shortDateLabel,
  type DayMatchGroup,
} from "../club/home/home-model";
import {
  useIsPickInParlay,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import type { MatchPick, PlatformGame } from "../types";
import { ConfidenceChip } from "./ConfidenceChip";
import { MaestroIcon } from "./MaestroPrimitives";

const DEFAULT_LIST_PAGE = 24;

function countText(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Formatea la línea de goles (o puntos en NFL) para mostrarla de un vistazo. */
export function formatGoalLineHint(
  game: Pick<PlatformGame, "sport" | "status" | "goalLine" | "projection" | "score">,
  unlocked: boolean,
): string | null {
  const unit = sportScoringUnit(game.sport).short;
  if (game.status === "FT" && game.score) {
    const total = game.score.home + game.score.away;
    return `Total ${total} ${unit}`;
  }
  if (!unlocked && game.goalLine == null) return null;
  if (game.goalLine) {
    return `Línea ${game.goalLine.line} ${unit} · ${Math.round(game.goalLine.pOver * 100)}% +`;
  }
  if (unlocked && game.projection && game.projection.total > 0) {
    return `Línea ${game.projection.total.toFixed(1)} ${unit}`;
  }
  return null;
}

/** Construye una pista breve de córners o faltas esperadas cuando hay `counts`. */
export function formatCountsHint(
  game: Pick<PlatformGame, "sport" | "counts">,
  unlocked: boolean,
): string | null {
  if (!unlocked || game.sport === "american-football" || !game.counts) {
    return null;
  }
  const parts: string[] = [];
  if (game.counts.corners) {
    parts.push(`Córners ${game.counts.corners.total.toFixed(1)}`);
  }
  if (game.counts.fouls) {
    parts.push(`Faltas ${game.counts.fouls.total.toFixed(1)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Botón «Parlay / En parlay» con zona táctil mínima de 44 px y estado en tienda compartida. */
export function ParlayPickButton({
  pick,
  matchLabel,
  className = "pl-home-parlay-btn",
}: {
  readonly pick: MatchPick;
  readonly matchLabel: string;
  readonly className?: string;
}): React.JSX.Element {
  const { addPickToParlay, removePickFromParlay } = usePlatformActions();
  const inParlay = useIsPickInParlay(pick.id);
  return (
    <button
      type="button"
      className={`${className} ${inParlay ? "is-on" : ""}`.trim()}
      aria-pressed={inParlay}
      aria-label={`${inParlay ? "Quitar del parlay" : "Agregar al parlay"}: ${pick.label}, ${matchLabel}`}
      onClick={() => (inParlay ? removePickFromParlay(pick.id) : addPickToParlay(pick))}
    >
      <MaestroIcon name={inParlay ? "check" : "plus"} size={14} />
      <span>{inParlay ? "En parlay" : "Parlay"}</span>
    </button>
  );
}

/**
 * Fila de partido de la lista agrupada:
 * hora → equipos → barra de probabilidad 1X2 → línea de goles y pista de córners/faltas → acciones (>= 44 px).
 */
export const MatchListRow = React.memo(function MatchListRow({
  game,
}: {
  readonly game: PlatformGame;
}): React.JSX.Element {
  const { viewerRole, hasAccountSession, upgradeHref } = usePlatformCore();
  const { setAuraFromGame, navigateTo } = usePlatformActions();

  const isNfl = !sportHasDraw(game.sport);
  const isFinished = game.status === "FT" && game.score !== undefined;
  const mainPick = game.picks[0];
  const mainUnlocked = mainPick
    ? isPickUnlocked(mainPick, game.status, viewerRole)
    : false;
  const intelUnlocked = isFinished || isPreGameIntelUnlocked(game, viewerRole);
  const outcome = mostLikelyOutcome(game);
  const hasForecast = game.hasForecast !== false && game.x12 !== null;
  const [ph, pd, pa] = game.x12 ?? [0, 0, 0];

  const goalHint = formatGoalLineHint(game, intelUnlocked);
  const countsHint = formatCountsHint(game, intelUnlocked);
  const studioHref = `/app/${game.league}/games/${game.id}`;
  const matchLabel = `${game.home.name} contra ${game.away.name}`;

  const openStudio = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setAuraFromGame(game);
    navigateTo(studioHref);
  };

  return (
    <li className="pl-cv-card">
      <article
        className="pl-mlist-row glass-card glass-ring"
        data-game-card={game.id}
        onMouseEnter={() => setAuraFromGame(game)}
      >
        <div className="pl-mlist-time num">
          <span className="pl-mlist-clock">
            {shortDateLabel(game.dayId)} · {isFinished ? "Final" : game.kickoffLocal}
          </span>
          <span className="pl-mlist-round">{game.round}</span>
          {!isFinished ? <ConfidenceChip game={game} /> : null}
        </div>

        <a
          href={studioHref}
          onClick={openStudio}
          aria-label={`Abrir ficha de ${matchLabel}`}
          className="pl-mlist-matchup"
        >
          <div className="pl-mlist-teams">
            <div className="pl-mlist-team">
              <TeamBadge
                league={game.league}
                slug={game.home.slug}
                name={game.home.name}
                logoUrl={game.home.logoUrl}
                size={22}
              />
              <span
                className={`pl-mlist-name ${!isFinished && outcome?.side === "home" ? "is-fav" : ""}`.trim()}
              >
                {game.home.name}
              </span>
              {isFinished && game.score ? (
                <strong className="pl-mlist-score num">{game.score.home}</strong>
              ) : null}
            </div>

            <div className="pl-mlist-team">
              <TeamBadge
                league={game.league}
                slug={game.away.slug}
                name={game.away.name}
                logoUrl={game.away.logoUrl}
                size={22}
              />
              <span
                className={`pl-mlist-name ${!isFinished && outcome?.side === "away" ? "is-fav" : ""}`.trim()}
              >
                {game.away.name}
              </span>
              {isFinished && game.score ? (
                <strong className="pl-mlist-score num">{game.score.away}</strong>
              ) : null}
            </div>
          </div>
        </a>

        {hasForecast ? (
        <div className="pl-mlist-prob">
          <div
            className="pl-mlist-prob-nums num"
            aria-label={
              isNfl
                ? `${game.home.shortName} ${Math.round(ph * 100)} %, ${game.away.shortName} ${Math.round(pa * 100)} %`
                : `${game.home.shortName} ${Math.round(ph * 100)} %, Empate ${Math.round(pd * 100)} %, ${game.away.shortName} ${Math.round(pa * 100)} %`
            }
          >
            <span>
              {game.home.shortName} {Math.round(ph * 100)}%
            </span>
            {isNfl ? null : <span>E {Math.round(pd * 100)}%</span>}
            <span>
              {game.away.shortName} {Math.round(pa * 100)}%
            </span>
          </div>
          <ProbSplit
            probabilities={isNfl ? [ph, pa] : [ph, pd, pa]}
            labels={
              isNfl
                ? [game.home.shortName, game.away.shortName]
                : [game.home.shortName, "Empate", game.away.shortName]
            }
          />
        </div>
        ) : (
          <div className="pl-mlist-prob" data-empty-forecast="">
            <span className="pl-mlist-chip">Sin pronóstico publicado</span>
          </div>
        )}

        <div className="pl-mlist-lines num">
          {goalHint ? (
            <span className="pl-mlist-chip is-goals" data-goal-line="">
              {goalHint}
            </span>
          ) : !isFinished && !intelUnlocked && hasForecast ? (
            <span className="pl-mlist-chip is-locked">
              <MaestroIcon name="lock" size={12} />
              <span>Línea Pase Ultra</span>
            </span>
          ) : null}
          {countsHint ? (
            <span className="pl-mlist-chip is-counts" data-counts-hint="">
              {countsHint}
            </span>
          ) : null}
        </div>

        <div className="pl-mlist-actions">
          {!isFinished && mainPick && mainUnlocked ? (
            <ParlayPickButton pick={mainPick} matchLabel={matchLabel} />
          ) : !isFinished && mainPick && !mainUnlocked ? (
            <a
              href={upgradeHref}
              onClick={(e) => {
                e.preventDefault();
                navigateTo(upgradeHref);
              }}
              className="pl-mlist-action-btn is-accent"
            >
              <MaestroIcon name="unlock" size={13} />
              <span>{hasAccountSession ? "Activar Pase" : "7 días gratis"}</span>
            </a>
          ) : null}
          <a
            href={studioHref}
            onClick={openStudio}
            aria-label={`Ver partido: ${matchLabel}`}
            className="pl-mlist-action-btn"
          >
            <span>Ver partido</span>
            <MaestroIcon name="arrowRight" size={14} />
          </a>
        </div>
      </article>
    </li>
  );
});

/**
 * Lista de partidos agrupada por día y por liga.
 */
export function MatchList({
  groups,
  today,
  hideLeagueHeader = false,
  initialLimit = DEFAULT_LIST_PAGE,
}: {
  readonly groups: readonly DayMatchGroup[];
  readonly today?: string;
  readonly hideLeagueHeader?: boolean;
  readonly initialLimit?: number;
}): React.JSX.Element {
  const { navigateTo } = usePlatformActions();
  const totalGames = groups.reduce((sum, d) => sum + d.count, 0);
  const [limit, setLimit] = useState<number>(initialLimit);

  if (groups.length === 0) {
    return (
      <div
        className="glass-card glass-ring rounded-2xl p-7 text-center text-sm"
        style={{ color: "var(--pl-text-muted)" }}
      >
        No hay partidos con este filtro. Prueba otro día o «Todas».
      </div>
    );
  }

  let remaining = limit;
  const visibleGroups: DayMatchGroup[] = [];
  for (const dayGroup of groups) {
    if (remaining <= 0) break;
    const slicedLeagues = [];
    for (const leagueGroup of dayGroup.leagues) {
      if (remaining <= 0) break;
      const take = leagueGroup.games.slice(0, remaining);
      remaining -= take.length;
      if (take.length > 0) {
        slicedLeagues.push({ ...leagueGroup, games: take });
      }
    }
    if (slicedLeagues.length > 0) {
      visibleGroups.push({
        ...dayGroup,
        leagues: slicedLeagues,
      });
    }
  }

  return (
    <div className="pl-mlist">
      {visibleGroups.map((dayGroup) => (
        <section
          key={dayGroup.dayId}
          aria-label={longDayLabel(dayGroup.dayId)}
          className="pl-mlist-day"
          data-day-group={dayGroup.dayId}
        >
          <header className="pl-mlist-day-head">
            <h2 className="pl-mlist-day-title">
              {longDayLabel(dayGroup.dayId)}
              {today && dayGroup.dayId === today ? " · hoy" : ""}
            </h2>
            <span className="pl-mlist-day-count num">
              {countText(dayGroup.count, "partido", "partidos")}
            </span>
          </header>

          <div className="pl-mlist-leagues">
            {dayGroup.leagues.map((leagueGroup) => (
              <div
                key={`${dayGroup.dayId}-${leagueGroup.league}`}
                className="pl-mlist-league"
                data-league-group={leagueGroup.league}
              >
                {hideLeagueHeader ? null : (
                  <header className="pl-mlist-league-head">
                    <a
                      href={`/app/${leagueGroup.league}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigateTo(`/app/${leagueGroup.league}`);
                      }}
                      className="pl-league-link inline-flex items-center gap-2.5 min-w-0 flex-1"
                    >
                      <LeagueBadge
                        league={leagueGroup.league}
                        label={leagueGroup.label}
                        logoUrl={leagueGroup.logoUrl}
                        size={22}
                      />
                      <h3 className="pl-mlist-league-title">
                        {leagueGroup.label}
                      </h3>
                    </a>
                    <span className="pl-mlist-league-meta num">
                      {leagueGroup.round} ·{" "}
                      {countText(leagueGroup.count, "partido", "partidos")}
                    </span>
                  </header>
                )}

                <ul className="pl-mlist-items" role="list">
                  {leagueGroup.games.map((g) => (
                    <MatchListRow key={g.id} game={g} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}

      {totalGames > limit ? (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            className="pl-btn-glass text-xs min-h-11 px-4"
            onClick={() => setLimit((c) => c + DEFAULT_LIST_PAGE)}
          >
            Ver más partidos ({totalGames - limit})
          </button>
        </div>
      ) : null}
    </div>
  );
}
