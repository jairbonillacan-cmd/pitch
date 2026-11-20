"use client";

import React from "react";
import type { LeagueId, LivePhase } from "@pitchlab/contracts";
import { LIVE_PHASE_LABEL_ES, isLivePhaseActive } from "@pitchlab/contracts";
import { TeamBadge } from "../../sports";
import { SportEventIcon, type SportEventIconKind } from "../components/SportEventIcons";

export interface AtomicMatchHeaderTeam {
  readonly slug: string;
  readonly name: string;
  readonly shortName?: string;
  readonly logoUrl?: string;
  readonly redCards?: number;
}

export interface AtomicMatchHeaderEvent {
  readonly kind: SportEventIconKind;
  readonly minute?: number | null;
  readonly addedTime?: number | null;
  readonly label?: string;
}

export interface AtomicMatchHeaderBarProps {
  readonly league: LeagueId;
  readonly home: AtomicMatchHeaderTeam;
  readonly away: AtomicMatchHeaderTeam;
  readonly score?: { readonly home: number; readonly away: number } | null;
  readonly phase?: LivePhase;
  /** Minuto en vivo (`"58"` o `"45+2"`) o etiqueta de inicio (`"17:00"`). */
  readonly clock?: string | null;
  /** Última incidencia destacada para mostrar con `<SportEventIcon />` en contenedores amplios. */
  readonly latestEvent?: AtomicMatchHeaderEvent | null;
  /** Activa posicionamiento sticky compacto (una sola fila, `< 12 %` viewport). */
  readonly sticky?: boolean;
  /** Slot compacto opcional a la derecha (p. ej. botón Seguir). */
  readonly trailing?: React.ReactNode;
  readonly className?: string;
}

function formatClockLabel(phase: LivePhase | undefined, clock: string | null | undefined): string {
  if (phase === "live" && clock) {
    return clock.endsWith("'") ? clock : `${clock}'`;
  }
  if (phase === "halftime") return "MT";
  if (phase === "final") return "FT";
  if (phase === "penalties") return "Pen.";
  if (clock) return clock;
  if (phase) return LIVE_PHASE_LABEL_ES[phase];
  return "vs";
}

/**
 * Barra compacta de encabezado de partido para vistas densas o sticky:
 * escudos, marcador/reloj en `.num`, expulsiones y evento reciente con `<SportEventIcon />`.
 * Cero `backdrop-filter`, una sola fila compacta, sin desbordamiento en 375 px.
 */
export function AtomicMatchHeaderBar({
  league,
  home,
  away,
  score = null,
  phase = "scheduled",
  clock = null,
  latestEvent = null,
  sticky = false,
  trailing,
  className = "",
}: AtomicMatchHeaderBarProps): React.JSX.Element {
  const homeShort = home.shortName ?? home.name;
  const awayShort = away.shortName ?? away.name;
  const isLive = isLivePhaseActive(phase);
  const clockLabel = formatClockLabel(phase, clock);
  const hasScore = score !== null && (isLive || phase === "final");

  const homeLead = hasScore && score.home > score.away;
  const awayLead = hasScore && score.away > score.home;
  const eventMin =
    latestEvent?.minute != null
      ? `${latestEvent.minute}${latestEvent.addedTime ? `+${latestEvent.addedTime}` : ""}'`
      : null;

  return (
    <header
      className={`pl-atom-header${sticky ? " is-sticky" : ""}${isLive ? " is-live" : ""} ${className}`.trim()}
      data-atomic-match-header=""
      aria-label={`${homeShort} ${hasScore ? `${score.home} a ${score.away}` : "contra"} ${awayShort}, ${clockLabel}`}
    >
      <div className="pl-atom-header-grid">
        <div className={`pl-atom-header-team is-home${homeLead ? " is-lead" : ""}`}>
          {(home.redCards ?? 0) > 0 ? (
            <span
              className="pl-atom-header-card"
              aria-label={`${home.redCards} tarjeta${home.redCards === 1 ? "" : "s"} roja${home.redCards === 1 ? "" : "s"} para ${homeShort}`}
            >
              <SportEventIcon kind="red" size={12} />
              {(home.redCards ?? 0) > 1 ? <span className="num">{home.redCards}</span> : null}
            </span>
          ) : null}
          <span className="pl-atom-header-name">{homeShort}</span>
          <TeamBadge
            league={league}
            slug={home.slug}
            name={home.name}
            logoUrl={home.logoUrl}
            size={22}
            decorative
          />
        </div>

        <div className="pl-atom-header-center num">
          <span className={`pl-atom-header-clock${isLive ? " is-live" : ""}`}>
            {isLive ? <span className="pl-atom-header-dot" aria-hidden="true" /> : null}
            <span>{clockLabel}</span>
          </span>
          {hasScore ? (
            <strong className="pl-atom-header-score">
              {score.home}
              <span aria-hidden="true">–</span>
              {score.away}
            </strong>
          ) : null}
        </div>

        <div className={`pl-atom-header-team is-away${awayLead ? " is-lead" : ""}`}>
          <TeamBadge
            league={league}
            slug={away.slug}
            name={away.name}
            logoUrl={away.logoUrl}
            size={22}
            decorative
          />
          <span className="pl-atom-header-name">{awayShort}</span>
          {(away.redCards ?? 0) > 0 ? (
            <span
              className="pl-atom-header-card"
              aria-label={`${away.redCards} tarjeta${away.redCards === 1 ? "" : "s"} roja${away.redCards === 1 ? "" : "s"} para ${awayShort}`}
            >
              <SportEventIcon kind="red" size={12} />
              {(away.redCards ?? 0) > 1 ? <span className="num">{away.redCards}</span> : null}
            </span>
          ) : null}
        </div>
      </div>

      {latestEvent ? (
        <div className="pl-atom-header-event num">
          <SportEventIcon kind={latestEvent.kind} size={13} />
          {eventMin ? <span className="pl-atom-header-event-min">{eventMin}</span> : null}
          {latestEvent.label ? <span className="truncate">{latestEvent.label}</span> : null}
        </div>
      ) : null}

      {trailing ? <div className="pl-atom-header-trailing">{trailing}</div> : null}
    </header>
  );
}
