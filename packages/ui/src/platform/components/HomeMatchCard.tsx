"use client";

import React from "react";
import { getTeamColors } from "@pitchlab/sports-assets";
import { LeagueBadge, PBar, ProbSplit, TeamBadge } from "../../sports";
import { formatOddsValue, getSessionWatermark, isPickUnlocked } from "../access-guard";
import { alternativePick, mostLikelyOutcome } from "../club/home/home-model";
import { useIsPickInParlay, usePlatformActions, usePlatformCore } from "../platform-provider";
import type { MatchPick, PlatformGame } from "../types";
import { CrestPedestal, MaestroIcon } from "./MaestroPrimitives";

function confidenceTone(score: number): string {
  if (score >= 70) return "var(--pl-success)";
  if (score >= 50) return "var(--pl-brand)";
  return "var(--pl-warning)";
}

function confidenceWord(score: number): string {
  if (score >= 70) return "alta";
  if (score >= 50) return "media";
  return "baja";
}

/** «+ Parlay» que agrega o quita el pick; solo este botón se redibuja al cambiar. */
function ParlayButton({ pick, matchLabel }: { pick: MatchPick; matchLabel: string }): React.JSX.Element {
  const { addPickToParlay, removePickFromParlay } = usePlatformActions();
  const inParlay = useIsPickInParlay(pick.id);
  return (
    <button
      type="button"
      className={`pl-home-parlay-btn ${inParlay ? "is-on" : ""}`.trim()}
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
 * Tarjeta de partido del Inicio. Se lee de arriba abajo sin repetir datos:
 * hora y confianza → equipos con su marcador proyectado → barra 1·X·2 → resultado más
 * probable → pick principal del modelo → acciones.
 */
export const HomeMatchCard = React.memo(function HomeMatchCard({
  game,
}: {
  game: PlatformGame;
}): React.JSX.Element {
  const { viewerRole, oddsFormat, hasAccountSession, upgradeHref } = usePlatformCore();
  const { setAuraFromGame, navigateTo } = usePlatformActions();

  const isNfl = game.sport === "american-football";
  const isFinished = game.status === "FT" && game.score !== undefined;
  const mainPick = game.picks[0];
  const unlocked = mainPick ? isPickUnlocked(mainPick, game.status, viewerRole) : false;
  const alt = unlocked ? alternativePick(game) : null;
  const outcome = mostLikelyOutcome(game);
  const decimals = isNfl ? 1 : 2;
  const studioHref = `/app/${game.league}/games/${game.id}`;
  const matchLabel = `${game.home.name} contra ${game.away.name}`;
  const [ph, pd, pa] = game.x12;

  const teams = [
    { side: "home" as const, team: game.home, proj: game.projection.home, score: game.score?.home },
    { side: "away" as const, team: game.away, proj: game.projection.away, score: game.score?.away },
  ];

  const openStudio = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setAuraFromGame(game);
    navigateTo(studioHref);
  };

  return (
    <article
      className="pl-home-card glass-card glass-ring hover-lift"
      data-game-card={game.id}
      onMouseEnter={() => setAuraFromGame(game)}
    >
      <span className="pl-watermark num" aria-hidden="true">
        {getSessionWatermark(viewerRole)}
      </span>

      <header className="pl-home-card-head">
        <span className="pl-pill inline-flex items-center gap-1.5 num">
          <LeagueBadge league={game.league} label={game.leagueLabel} size={14} />
          <span>{isFinished ? "Final" : game.kickoffLocal}</span>
        </span>
        <span className="pl-home-card-round">{game.round}</span>
        {isFinished ? null : (
          <span
            className="pl-pill inline-flex items-center gap-1.5 num"
            title={`Confianza ${confidenceWord(game.confidenceScore)} del modelo en este partido`}
          >
            <span className="pl-home-meter" aria-hidden="true">
              <span
                style={{
                  width: `${game.confidenceScore}%`,
                  background: confidenceTone(game.confidenceScore),
                }}
              />
            </span>
            <span>Conf. {game.confidenceScore}</span>
          </span>
        )}
      </header>

      <div className="pl-home-teams">
        {teams.map(({ side, team, proj, score }) => {
          const favored = !isFinished && outcome.side === side;
          const colors = getTeamColors(game.league, team.slug);
          return (
            <div key={side} className="pl-home-team">
              <CrestPedestal size="sm" glowColor={colors?.[0] ?? "var(--pl-aura-default-home)"}>
                <TeamBadge league={game.league} slug={team.slug} name={team.name} size={26} />
              </CrestPedestal>
              <div className="min-w-0 flex-1">
                <p className={`m-0 truncate text-[15px] ${favored ? "font-extrabold" : "font-bold"}`}>
                  {team.name}
                </p>
                <span className="block text-xs truncate" style={{ color: "var(--pl-text-muted)" }}>
                  {team.record}
                </span>
              </div>
              <span className="pl-home-team-value num">
                <strong>{isFinished ? score : unlocked ? proj.toFixed(decimals) : "—"}</strong>
                <span>{isFinished ? "final" : isNfl ? "pts proy." : "goles proy."}</span>
              </span>
            </div>
          );
        })}
      </div>

      {isFinished ? null : (
        <>
          <ProbSplit
            probabilities={isNfl ? [ph, pa] : [ph, pd, pa]}
            labels={isNfl ? [game.home.shortName, game.away.shortName] : [game.home.shortName, "Empate", game.away.shortName]}
            showLabels
          />
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
        ) : (
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
        )}
      </div>

      <footer className="pl-home-card-actions">
        {!isFinished && mainPick && unlocked ? <ParlayButton pick={mainPick} matchLabel={matchLabel} /> : null}
        {!isFinished && !unlocked ? (
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
        <a href={studioHref} onClick={openStudio} className="pl-btn-glass text-xs min-h-11 px-3 inline-flex flex-1 items-center justify-center gap-1.5">
          <span>Ver partido · {game.picks.length} picks</span>
          <MaestroIcon name="arrowRight" size={13} />
        </a>
      </footer>
    </article>
  );
});
