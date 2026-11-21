"use client";

import React from "react";
import { canonicalGameHref, canonicalTeamHref, isLivePhaseActive, sportHasDraw, sportScoringUnit, type LiveScoreboardEntry } from "@pitchlab/contracts";
import { getTeamColors } from "@pitchlab/sports-assets";
import { LeagueBadge, PBar, ProbSplit, TeamBadge } from "../../sports";
import { formatOddsValue, isPickUnlocked, isPreGameIntelUnlocked } from "../access-guard";
import { alternativePick, mostLikelyOutcome, shortDateLabel } from "../club/home/home-model";
import { setActiveSharedTransition } from "../navigation-helpers";
import { usePlatformActions, usePlatformCore } from "../platform-provider";
import type { PlatformGame } from "../types";
import { CrestPedestal, MaestroIcon } from "./MaestroPrimitives";
import { ParlayPickButton, formatCountsHint, formatGoalLineHint } from "./MatchList";

/**
 * Tarjeta de partido del Inicio. Se lee de arriba abajo sin repetir datos:
 * hora/estado vivo y confianza → equipos con marcador real o proyectado → barra 1·X·2
 * y líneas clave → resultado más probable → pick principal del modelo → acciones.
 */
export const HomeMatchCard = React.memo(function HomeMatchCard({
  game,
  liveEntry,
}: {
  game: PlatformGame;
  liveEntry?: LiveScoreboardEntry;
}): React.JSX.Element {
  const { viewerRole, oddsFormat, hasAccountSession, upgradeHref } = usePlatformCore();
  const { setAuraFromGame, navigateTo, prefetchRoute } = usePlatformActions();

  const hasDraw = sportHasDraw(game.sport);
  const unit = sportScoringUnit(game.sport);
  const hasForecast = game.hasForecast !== false && Boolean(game.x12 && game.projection);
  const live = (liveEntry ? isLivePhaseActive(liveEntry.phase) : false) || String(game.status) === "LIVE";
  const isFinished = !live && (game.status === "FT" || liveEntry?.phase === "final") && (game.score !== undefined || liveEntry?.score != null);
  const activeScore = live ? (liveEntry?.score ?? game.score ?? null) : game.score ?? liveEntry?.score ?? null;
  const mainPick = game.picks[0];
  const unlocked = mainPick ? isPickUnlocked(mainPick, game.status, viewerRole) : false;
  const intelUnlocked = isFinished || isPreGameIntelUnlocked(game, viewerRole);
  const alt = unlocked ? alternativePick(game) : null;
  const outcome = hasForecast ? mostLikelyOutcome(game) : null;
  const goalHint = hasForecast ? formatGoalLineHint(game, intelUnlocked) : null;
  const countsHint = hasForecast ? formatCountsHint(game, intelUnlocked) : null;
  const decimals = unit.decimals;
  const studioHref = canonicalGameHref(game.league, game);
  const matchLabel = `${game.home.name} contra ${game.away.name}`;
  const [ph, pd, pa] = game.x12 ?? [0, 0, 0];

  const teams = [
    { side: "home" as const, team: game.home, proj: game.projection?.home ?? null, score: activeScore?.home },
    { side: "away" as const, team: game.away, proj: game.projection?.away ?? null, score: activeScore?.away },
  ];

  const openStudio = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setActiveSharedTransition(e.currentTarget.closest("article"), "pl-match-hero");
    setAuraFromGame(game);
    navigateTo(studioHref);
  };

  return (
    <article
      className={`pl-home-card glass-card glass-ring hover-lift ${live ? "is-live" : ""}`.trim()}
      data-game-card={game.id}
      onMouseEnter={() => setAuraFromGame(game)}
    >
      <header className="pl-home-card-head">
        {live ? (
          <span className="pl-pill pl-home-card-live inline-flex items-center gap-1.5 num">
            <LeagueBadge
              league={game.league}
              label={game.leagueLabel}
              logoUrl={game.leagueLogoUrl}
              size={14}
            />
            <span className="pl-home-live-dot" aria-hidden="true" />
            <span>Vivo{liveEntry?.clock ? ` · ${liveEntry.clock}'` : ""}</span>
          </span>
        ) : (
          <span className="pl-pill inline-flex items-center gap-1.5 num">
            <LeagueBadge
              league={game.league}
              label={game.leagueLabel}
              logoUrl={game.leagueLogoUrl}
              size={14}
            />
            <span>
              {shortDateLabel(game.dayId)} · {isFinished ? "Final" : game.kickoffLocal}
            </span>
          </span>
        )}
        <span className="pl-home-card-round">{game.round}</span>
        {isFinished ? (
          <span className="pl-pill pl-pill--brand num text-xs">Final</span>
        ) : null}
      </header>

      <div className="pl-home-teams">
        {teams.map(({ side, team, proj, score }) => {
          const favored = !isFinished && outcome !== null && outcome.side === side;
          const colors = getTeamColors(game.league, team.slug);
          const teamHref = canonicalTeamHref(game.league, team.slug);
          const showScore = live || isFinished;
          return (
            <div key={side} className="pl-home-team">
              <CrestPedestal size="sm" glowColor={colors?.[0] ?? "var(--pl-aura-default-home)"}>
                <TeamBadge
                  league={game.league}
                  slug={team.slug}
                  name={team.name}
                  logoUrl={team.logoUrl}
                  size={26}
                />
              </CrestPedestal>
              <div className="min-w-0 flex-1">
                <p className={`m-0 truncate text-[15px] ${favored ? "font-extrabold" : "font-bold"}`}>
                  <a
                    href={teamHref}
                    onPointerEnter={() => prefetchRoute(teamHref)}
                    onTouchStart={() => prefetchRoute(teamHref)}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveSharedTransition(
                        e.currentTarget.closest(".pl-home-team") as HTMLElement | null,
                        "pl-team-hero",
                      );
                      navigateTo(teamHref);
                    }}
                    className="pl-team-link"
                    title={`Ver perfil de ${team.name}`}
                  >
                    {team.name}
                  </a>
                </p>
                <span className="pl-home-team-meta text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  {game.neutralSite ? null : (
                    <span className={`pl-side-tag ${side === "home" ? "is-home" : ""}`.trim()}>
                      {side === "home" ? "Local" : "Visita"}
                    </span>
                  )}
                  <span className="truncate">{team.record}</span>
                </span>
              </div>
              <span className="pl-home-team-value num">
                <strong>
                  {showScore
                    ? (score ?? "—")
                    : unlocked && proj !== null
                      ? proj.toFixed(decimals)
                      : "—"}
                </strong>
                <span>{live ? "en vivo" : isFinished ? "final" : `${unit.short} proy.`}</span>
              </span>
            </div>
          );
        })}
      </div>

      {game.venue ? (
        <p className="pl-home-venue">
          <MaestroIcon name="pin" size={13} />
          <span className="truncate">
            {game.venue}
            {game.neutralSite ? " · sede neutral" : ` · en casa de ${game.home.shortName}`}
          </span>
        </p>
      ) : null}

      {isFinished ? null : hasForecast && outcome ? (
        <>
          <ProbSplit
            probabilities={hasDraw ? [ph, pd, pa] : [ph, pa]}
            labels={hasDraw ? [game.home.shortName, "Empate", game.away.shortName] : [game.home.shortName, game.away.shortName]}
            showLabels
          />
          {goalHint || countsHint ? (
            <div className="pl-home-card-chips num">
              {goalHint ? (
                <span className="pl-mlist-chip is-goals" data-goal-line="">
                  {goalHint}
                </span>
              ) : null}
              {countsHint ? (
                <span className="pl-mlist-chip is-counts" data-counts-hint="">
                  {countsHint}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="pl-home-outcome">
            <div className="min-w-0">
              <span className="pl-home-eyebrow">Resultado más probable</span>
              <strong className="block truncate text-[15px]">{outcome.label}</strong>
            </div>
            <div className="text-right num shrink-0">
              <strong className="block text-lg">{(outcome.p * 100).toFixed(1)} %</strong>
              <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                justo {formatOddsValue(1 / Math.max(outcome.p, 0.0001), oddsFormat)}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="pl-home-outcome" data-empty-forecast="">
          <div className="min-w-0">
            <span className="pl-home-eyebrow">Pronóstico</span>
            <strong className="block text-sm">Sin pronóstico publicado</strong>
            <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Pronóstico pendiente para este partido.
            </span>
          </div>
        </div>
      )}

      <div className="pl-home-pick">
        {mainPick && unlocked ? (
          <>
            <span className="pl-home-eyebrow">
              {isFinished ? "Pick principal publicado" : "Pick principal del modelo"}
            </span>
            <div className="flex items-baseline justify-between gap-3">
              <strong className="min-w-0 text-base leading-snug">{mainPick.label}</strong>
              <strong className="num text-lg shrink-0">{(mainPick.p * 100).toFixed(1)} %</strong>
            </div>
            <PBar p={mainPick.p} lead />
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs num" style={{ color: "var(--pl-text-muted)" }}>
              <span>
                Momio justo{" "}
                <strong style={{ color: "var(--pl-text)" }}>
                  {formatOddsValue(mainPick.fairDecimal, oddsFormat)}
                </strong>
              </span>
              {alt ? (
                <span className="truncate">
                  También: {alt.label} · {(alt.p * 100).toFixed(0)} %
                </span>
              ) : null}
            </div>
          </>
        ) : mainPick ? (
          <div className="flex items-center justify-between gap-2" data-card-locked="">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--pl-brand)" }}>
                <MaestroIcon name="lock" size={12} />
                <span>Pick principal y marcador proyectado</span>
              </span>
              <span className="locked-redact block mt-0.5 text-sm" aria-hidden="true">
                Pick principal oculto
              </span>
            </div>
            <span className="pl-pill shrink-0">Pase PitchLab Ultra</span>
          </div>
        ) : (
          <div className="text-xs" style={{ color: "var(--pl-text-muted)" }} data-empty-picks="">
            Sin pick principal publicado en este corte.
          </div>
        )}
      </div>

      <footer className="pl-home-card-actions">
        {!isFinished && !live && mainPick && unlocked ? <ParlayPickButton pick={mainPick} matchLabel={matchLabel} /> : null}
        {!isFinished && mainPick && !unlocked ? (
          <a
            href={upgradeHref}
            onClick={(e) => {
              e.preventDefault();
              navigateTo(upgradeHref);
            }}
            className="pl-btn-accent text-xs min-h-11 px-3 inline-flex items-center gap-1.5"
          >
            <MaestroIcon name="unlock" size={13} />
            <span>{hasAccountSession ? "Activar Pase Ultra" : "7 días gratis"}</span>
          </a>
        ) : null}
        <a
          href={studioHref}
          onPointerEnter={() => prefetchRoute(studioHref)}
          onTouchStart={() => prefetchRoute(studioHref)}
          onClick={openStudio}
          data-card-open=""
          className="pl-btn-glass text-xs min-h-11 px-3 inline-flex flex-1 items-center justify-center gap-1.5"
        >
          <span>Ver partido · {game.picks.length} picks</span>
          <MaestroIcon name="arrowRight" size={13} />
        </a>
      </footer>
    </article>
  );
});
