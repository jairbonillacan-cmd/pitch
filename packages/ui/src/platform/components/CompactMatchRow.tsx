"use client";

import React from "react";
import {
  isLivePhaseActive,
  sportHasDraw,
  sportScoringUnit,
  type LiveScoreboardEntry,
} from "@pitchlab/contracts";
import { TeamBadge } from "../../sports";
import { formatOddsValue, isPickUnlocked } from "../access-guard";
import { formatKickoffByTimezone } from "../club/account/account-helpers";
import { mostLikelyOutcome } from "../club/home/home-model";
import {
  useIsPickInParlay,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import type { PlatformGame } from "../types";
import { MaestroIcon } from "./MaestroPrimitives";

export type RecentFormCode = "G" | "E" | "P";

export interface CompactMatchRowProps {
  readonly game: PlatformGame;
  readonly liveEntry?: LiveScoreboardEntry;
  readonly selected?: boolean;
  readonly showInlineOdds?: boolean;
  readonly onSelectGame?: (gameId: string) => void;
  readonly homeForm?: readonly RecentFormCode[];
  readonly awayForm?: readonly RecentFormCode[];
}

function FormSegments({
  form,
  teamName,
}: {
  readonly form?: readonly RecentFormCode[];
  readonly teamName: string;
}): React.JSX.Element | null {
  if (!form || form.length === 0) return null;
  const recent = form.slice(-5);
  return (
    <span
      className="pl-compact-form"
      aria-label={`Racha reciente de ${teamName}: ${recent.join("-")}`}
    >
      {recent.map((res, idx) => (
        <span
          key={`${idx}-${res}`}
          className={`pl-compact-form-dot is-${res.toLowerCase()}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

/**
 * Fila compacta de alta escaneabilidad (~66px) para `/app` en móvil y lista izquierda Maestro-Detalle.
 * Mantiene todos los contratos accesibles (`data-game-card`, `data-card-open`, `pl-home-card-live`,
 * botón `+` de `44×44px` para parlay) en una sola vista limpia sin scroll muerto.
 */
export const CompactMatchRow = React.memo(function CompactMatchRow({
  game,
  liveEntry,
  selected = false,
  showInlineOdds = false,
  onSelectGame,
  homeForm,
  awayForm,
}: CompactMatchRowProps): React.JSX.Element {
  const { viewerRole, oddsFormat, userTimezone } = usePlatformCore();
  const { setAuraFromGame, navigateTo, addPickToParlay, removePickFromParlay } =
    usePlatformActions();

  const hasDraw = sportHasDraw(game.sport);
  const unit = sportScoringUnit(game.sport);
  const decimals = unit.decimals;
  const hasForecast = game.hasForecast !== false && Boolean(game.x12 && game.projection);
  const live =
    (liveEntry ? isLivePhaseActive(liveEntry.phase) : false) ||
    String(game.status) === "LIVE";
  const isFinished =
    !live &&
    (game.status === "FT" || liveEntry?.phase === "final") &&
    (game.score !== undefined || liveEntry?.score != null);
  const activeScore = live
    ? (liveEntry?.score ?? game.score ?? null)
    : (game.score ?? liveEntry?.score ?? null);

  const mainPick = game.picks[0];
  const unlocked = mainPick ? isPickUnlocked(mainPick, game.status, viewerRole) : false;
  const inParlay = useIsPickInParlay(mainPick?.id);
  const outcome = hasForecast ? mostLikelyOutcome(game) : null;
  const [ph, pd, pa] = game.x12 ?? [0, 0, 0];

  const studioHref = `/app/${game.league}/games/${game.id}`;
  const matchLabel = `${game.home.name} contra ${game.away.name}`;
  const time = formatKickoffByTimezone(
    game.kickoffUtc,
    game.kickoffLocal,
    userTimezone?.trim() || "America/Mexico_City",
  );

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

  const handleRowClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    setAuraFromGame(game);
    if (
      onSelectGame &&
      typeof window !== "undefined" &&
      window.innerWidth >= 1100
    ) {
      onSelectGame(game.id);
      return;
    }
    navigateTo(studioHref);
  };

  const leadPct = outcome ? Math.round(outcome.p * 100) : null;
  const homeReds = liveEntry?.redCards?.home ?? 0;
  const awayReds = liveEntry?.redCards?.away ?? 0;

  return (
    <article
      className={[
        "pl-compact-row",
        live ? "is-live" : "",
        isFinished ? "is-finished" : "",
        selected ? "is-selected" : "",
        showInlineOdds ? "has-inline-odds" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-game-card={game.id}
      data-selected={selected ? "true" : undefined}
      onMouseEnter={() => setAuraFromGame(game)}
    >
      {selected || live ? (
        <span
          className={`pl-compact-indicator ${live ? "is-live" : "is-selected"}`}
          aria-hidden="true"
        />
      ) : null}

      {/* Columna 1 (52px): hora 24h + pulso en vivo / Final */}
      <div className="pl-compact-time num">
        {live ? (
          <div className="flex flex-col items-center leading-tight gap-0.5">
            <span className="text-[10px]" style={{ color: "var(--pl-text-muted)" }}>
              {time}
            </span>
            <span className="pl-compact-live pl-home-card-live">
              <span className="pl-home-live-dot" aria-hidden="true" />
              <span>{liveEntry?.clock ? `${liveEntry.clock}'` : "Vivo"}</span>
              <span className="sr-only"> en vivo</span>
            </span>
          </div>
        ) : isFinished ? (
          <div className="flex flex-col items-center leading-tight gap-0.5">
            <span className="text-[10px]" style={{ color: "var(--pl-text-muted)" }}>
              {time}
            </span>
            <span className="pl-compact-ft">FT</span>
          </div>
        ) : (
          <span className="pl-compact-hour">{time}</span>
        )}
      </div>

      {/* Columna 2 + 3: enlace principal a equipos y marcador/proyección + mini ProbSplit / Momios */}
      <a
        href={studioHref}
        onClick={handleRowClick}
        data-card-open=""
        aria-current={selected ? "true" : undefined}
        aria-label={`Ver partido ${matchLabel}`}
        className="pl-compact-main"
      >
        <div className="pl-compact-teams">
          <div className="pl-compact-team-line">
            <TeamBadge
              league={game.league}
              slug={game.home.slug}
              name={game.home.name}
              logoUrl={game.home.logoUrl}
              size={18}
            />
            <span
              className={`pl-compact-team-name truncate ${homeStrong ? "is-strong" : ""}`.trim()}
            >
              {game.home.shortName || game.home.name}
            </span>
            {homeReds > 0 ? (
              <span className="pl-compact-redcard" aria-label={`${homeReds} tarjeta roja`} />
            ) : null}
            {!showInlineOdds ? (
              <FormSegments form={homeForm} teamName={game.home.shortName} />
            ) : null}
          </div>

          <div className="pl-compact-team-line">
            <TeamBadge
              league={game.league}
              slug={game.away.slug}
              name={game.away.name}
              logoUrl={game.away.logoUrl}
              size={18}
            />
            <span
              className={`pl-compact-team-name truncate ${awayStrong ? "is-strong" : ""}`.trim()}
            >
              {game.away.shortName || game.away.name}
            </span>
            {awayReds > 0 ? (
              <span className="pl-compact-redcard" aria-label={`${awayReds} tarjeta roja`} />
            ) : null}
            {!showInlineOdds ? (
              <FormSegments form={awayForm} teamName={game.away.shortName} />
            ) : null}
          </div>
        </div>

        <div className="pl-compact-metrics num">
          {showInlineOdds && !isFinished && hasForecast && game.x12 && unlocked ? (
            <div className="pl-compact-odds-strip" data-inline-odds="">
              <span className={outcome?.side === "home" ? "is-lead" : ""}>
                <small>1</small>
                <strong>{formatOddsValue(1 / Math.max(ph, 0.01), oddsFormat)}</strong>
              </span>
              {hasDraw ? (
                <span className={outcome?.side === "draw" ? "is-lead" : ""}>
                  <small>X</small>
                  <strong>{formatOddsValue(1 / Math.max(pd, 0.01), oddsFormat)}</strong>
                </span>
              ) : null}
              <span className={outcome?.side === "away" ? "is-lead" : ""}>
                <small>2</small>
                <strong>{formatOddsValue(1 / Math.max(pa, 0.01), oddsFormat)}</strong>
              </span>
            </div>
          ) : null}

          <div className="pl-compact-scores">
            <span className={`${homeStrong ? "is-strong" : ""} ${live ? "is-live-score" : ""}`.trim()}>
              {homeVal}
            </span>
            <span className={`${awayStrong ? "is-strong" : ""} ${live ? "is-live-score" : ""}`.trim()}>
              {awayVal}
            </span>
          </div>

          {!showInlineOdds && !isFinished && hasForecast && game.x12 ? (
            <div className="pl-compact-prob" aria-hidden="true">
              {leadPct !== null && unlocked ? (
                <span className="pl-compact-prob-pct">{leadPct}%</span>
              ) : null}
              <span className="pl-compact-split-bar">
                <span
                  className="is-home"
                  style={{ width: `${Math.max(8, Math.round(ph * 100))}%` }}
                />
                {hasDraw ? (
                  <span
                    className="is-draw"
                    style={{ width: `${Math.max(6, Math.round(pd * 100))}%` }}
                  />
                ) : null}
                <span
                  className="is-away"
                  style={{ width: `${Math.max(8, Math.round(pa * 100))}%` }}
                />
              </span>
            </div>
          ) : null}
        </div>
      </a>

      {/* Columna 4: acción rápida de 44×44px para agregar al Parlay (o indicador de candado/FT) */}
      <div className="pl-compact-action">
        {!isFinished && !live && mainPick && unlocked ? (
          <button
            type="button"
            className={`pl-compact-parlay-btn ${inParlay ? "is-on" : ""}`.trim()}
            aria-pressed={inParlay}
            aria-label={`${inParlay ? "Quitar del parlay" : "Agregar al parlay"}: ${mainPick.label}, ${matchLabel}`}
            title={inParlay ? `En parlay: ${mainPick.label}` : `+ Parlay: ${mainPick.label}`}
            onClick={() =>
              inParlay
                ? removePickFromParlay(mainPick.id)
                : addPickToParlay(mainPick)
            }
          >
            <MaestroIcon name={inParlay ? "check" : "plus"} size={15} />
          </button>
        ) : !isFinished && mainPick && !unlocked ? (
          <span
            className="pl-compact-lock"
            title="Pase PitchLab Ultra"
            aria-label="Pick reservado Pase PitchLab Ultra"
          >
            <MaestroIcon name="lock" size={13} />
          </span>
        ) : (
          <a
            href={studioHref}
            onClick={(e) => {
              e.preventDefault();
              setAuraFromGame(game);
              navigateTo(studioHref);
            }}
            className="pl-compact-open-icon"
            aria-label={`Abrir ficha de ${matchLabel}`}
          >
            <MaestroIcon name="chevronRight" size={15} />
          </a>
        )}
      </div>
    </article>
  );
});
