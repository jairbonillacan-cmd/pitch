"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { PBar, TeamBadge } from "../../../sports";
import {
  formatOddsValue,
  isPickUnlocked,
  isPreGameIntelUnlocked,
} from "../../access-guard";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { formatPctEs } from "../../notifications";
import { usePlatform } from "../../platform-provider";
import type {
  FrozenMainPickSnapshot,
  PlatformGame,
  PlatformGameDetail,
} from "../../types";
import { MatchCommunityPoll } from "./MatchCommunityPoll";
import {
  DEFAULT_PRE_MATCH_TIMEZONE,
  isValidFrozenSnapshot,
  readClientFrozenPick,
  resolveConfirmedLineupSlotState,
  resolvePreMatchAbsencesState,
  resolvePreMatchFreezeState,
  saveClientFrozenPick,
} from "./pre-match-logic";

export interface PreMatchModuleProps {
  game: PlatformGame;
  detail?: PlatformGameDetail | null;
  /** Reloj inyectable para pruebas deterministas y Storybook. */
  now?: Date | number;
  /** Zona horaria opcional (por defecto la preferencia del socio o `America/Mexico_City`). */
  timeZone?: string;
}

function formatWindowSummary(
  matchStarted: boolean,
  isFrozen: boolean,
  minutesUntilKickoff: number | null,
  isWithinMatchdayHours: boolean,
): string {
  if (matchStarted) {
    return "Partido en curso · el pick previo quedó congelado 60 min antes del inicio";
  }
  if (isFrozen) {
    if (minutesUntilKickoff !== null && minutesUntilKickoff > 0) {
      return `Últimos ${minutesUntilKickoff} min antes del saque inicial · lectura congelada`;
    }
    return "Ventana final previa al saque inicial · lectura congelada";
  }
  if (isWithinMatchdayHours && minutesUntilKickoff !== null) {
    const hours = Math.max(1, Math.round(minutesUntilKickoff / 60));
    return `Activo a ${hours} ${hours === 1 ? "hora" : "horas"} del saque inicial`;
  }
  return "Preparación previa rumbo al saque inicial";
}

/**
 * Módulo «Antes del partido» en la ficha del encuentro:
 * 1) Pick principal congelado determinísticamente 60 min antes del saque inicial (solo probabilidad y momio justo).
 * 2) Bajas y lesiones reportadas (con honestidad explícita cuando no hay reporte).
 * 3) Ranura «Alineación confirmada» preparada y APAGADA mientras no exista fuente verificada real.
 * 4) Votos de la comunidad (`MatchCommunityPoll`) integrados sin duplicarse fuera del módulo.
 * 5) Aviso opcional en la campana («Avísame 60 min antes») conectado a `toggleWatchlistGame`.
 */
export function PreMatchModule({
  game,
  detail,
  now: nowProp,
  timeZone: timeZoneProp,
}: PreMatchModuleProps): React.JSX.Element {
  const {
    viewerRole,
    watchlistGameIds,
    oddsFormat,
    userTimezone,
    toggleWatchlistGame,
    upgradeHref,
    navigateTo,
  } = usePlatform();

  const headingId = useId();
  const [liveNowMs, setLiveNowMs] = useState<number>(() => Date.now());
  const [clientFrozen, setClientFrozen] = useState<FrozenMainPickSnapshot | null>(null);
  const stickyFrozenRef = useRef<FrozenMainPickSnapshot | null>(null);

  // Al cambiar de partido, reinicia el respaldo en memoria y lee el snapshot local si existe.
  if (stickyFrozenRef.current && stickyFrozenRef.current.gameId !== game.id) {
    stickyFrozenRef.current = null;
  }

  useEffect(() => {
    const stored = readClientFrozenPick(game.id);
    if (stored) {
      stickyFrozenRef.current = stored;
      setClientFrozen(stored);
    } else {
      setClientFrozen(null);
    }
  }, [game.id]);

  // En vivo actualiza el reloj cada 30 s para sellar puntualmente al cruzar T - 60 min.
  useEffect(() => {
    if (nowProp !== undefined || game.status === "FT") return;
    setLiveNowMs(Date.now());
    const interval = window.setInterval(() => {
      setLiveNowMs(Date.now());
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [nowProp, game.id, game.status]);

  const effectiveNow = nowProp ?? liveNowMs;
  const effectiveTimeZone = timeZoneProp || userTimezone || DEFAULT_PRE_MATCH_TIMEZONE;

  const existingFrozen = useMemo<FrozenMainPickSnapshot | null>(() => {
    if (isValidFrozenSnapshot(detail?.frozenMainPick, game.id)) {
      return detail.frozenMainPick;
    }
    if (isValidFrozenSnapshot(stickyFrozenRef.current, game.id)) {
      return stickyFrozenRef.current;
    }
    if (isValidFrozenSnapshot(clientFrozen, game.id)) {
      return clientFrozen;
    }
    return null;
  }, [detail?.frozenMainPick, clientFrozen, game.id]);

  const freeze = useMemo(
    () =>
      resolvePreMatchFreezeState({
        game,
        now: effectiveNow,
        existingFrozen,
        timeZone: effectiveTimeZone,
      }),
    [game, effectiveNow, existingFrozen, effectiveTimeZone],
  );

  // Sella el snapshot en memoria de inmediato para que ningún re-render posterior lo cambie.
  if (
    freeze.isFrozen &&
    freeze.snapshotToPersist &&
    !isValidFrozenSnapshot(stickyFrozenRef.current, game.id)
  ) {
    stickyFrozenRef.current = freeze.snapshotToPersist;
  }

  useEffect(() => {
    if (!freeze.isFrozen || !freeze.snapshotToPersist) return;
    const saved = saveClientFrozenPick(freeze.snapshotToPersist);
    stickyFrozenRef.current = saved;
    setClientFrozen((prev) => (prev?.gameId === saved.gameId ? prev : saved));
  }, [freeze.isFrozen, freeze.snapshotToPersist]);

  const intelUnlocked = isPreGameIntelUnlocked(game, viewerRole);
  const mainPickCandidate = game.picks[0];
  const mainPickUnlocked =
    viewerRole !== "visitor" ||
    (mainPickCandidate ? isPickUnlocked(mainPickCandidate, game.status, viewerRole) : false);

  const absencesState = useMemo(
    () => resolvePreMatchAbsencesState(game, intelUnlocked),
    [game, intelUnlocked],
  );
  const lineupSlot = useMemo(
    () => resolveConfirmedLineupSlotState(game.preGame, intelUnlocked),
    [game.preGame, intelUnlocked],
  );

  const watched = watchlistGameIds.includes(game.id);
  const windowSummary = formatWindowSummary(
    freeze.matchStarted,
    freeze.isFrozen,
    freeze.minutesUntilKickoff,
    freeze.isWithinMatchdayHours,
  );

  const pollMainPickOverride =
    mainPickUnlocked && freeze.pick
      ? { label: freeze.pick.label, p: freeze.pick.p }
      : null;

  return (
    <section
      className="pl-prematch glass-card glass-ring"
      aria-labelledby={headingId}
      data-pre-match-module=""
      data-pre-match-phase={freeze.phase}
    >
      <header className="pl-prematch-header">
        <div className="pl-prematch-title-group">
          <div className="pl-prematch-eyebrow-row">
            <span
              className={`pl-prematch-dot ${freeze.isWithinMatchdayHours || freeze.isFrozen ? "is-live" : ""}`.trim()}
              aria-hidden="true"
            />
            <span className="pl-prematch-eyebrow">
              {freeze.isWithinMatchdayHours || freeze.isFrozen
                ? "Ventana previa activa"
                : "Módulo prepartido"}
            </span>
          </div>
          <h2 id={headingId} className="pl-prematch-heading">
            Antes del partido
          </h2>
          <p className="pl-prematch-subtitle">{windowSummary}</p>
        </div>

        <div className="pl-prematch-bell-wrap">
          <button
            type="button"
            className={`pl-prematch-bell-btn ${watched ? "is-active" : ""}`.trim()}
            aria-pressed={watched}
            disabled={freeze.matchStarted}
            onClick={() => toggleWatchlistGame(game.id)}
            data-pre-match-bell=""
          >
            <MaestroIcon
              name={watched ? "check" : "bell"}
              size={15}
              style={{ color: watched ? "var(--pl-brand)" : undefined }}
            />
            <span className="pl-prematch-bell-label">Avísame 60 min antes</span>
          </button>
          <span className="pl-prematch-bell-status" aria-live="polite">
            {freeze.matchStarted
              ? "El partido ya comenzó"
              : watched
                ? "Aviso activo en tu campana"
                : "Recibe alerta en la campana"}
          </span>
        </div>
      </header>

      <div className="pl-prematch-grid">
        <div className="pl-prematch-stack">
          {/* 1) Pick principal congelado 1 h antes */}
          <article
            className={`pl-prematch-card pl-prematch-pick ${freeze.isFrozen ? "is-frozen" : ""}`.trim()}
            data-pre-match-pick=""
          >
            <div className="pl-prematch-card-head">
              <h3 className="pl-prematch-card-title">Pick principal</h3>
              <span
                className={`pl-prematch-seal num ${freeze.isFrozen ? "is-frozen" : "is-pending"}`.trim()}
                data-freeze-seal=""
                data-freeze-state={freeze.phase}
                aria-live="polite"
              >
                <MaestroIcon
                  name={freeze.isFrozen ? "lock" : "calendar"}
                  size={12}
                />
                <time dateTime={freeze.freezeAtUtc}>{freeze.sealLabel}</time>
              </span>
            </div>

            {mainPickUnlocked && freeze.pick ? (
              <div className="pl-prematch-pick-body">
                <div className="pl-prematch-pick-main">
                  <div className="min-w-0">
                    <span className="pl-prematch-kicker">
                      {freeze.pick.categoryLabel} · {freeze.pick.marketGroup}
                    </span>
                    <strong className="pl-prematch-pick-name" data-frozen-pick-label="">
                      {freeze.pick.label}
                    </strong>
                  </div>

                  <div className="pl-prematch-metrics num">
                    <div className="pl-prematch-metric">
                      <span className="pl-prematch-metric-label">Probabilidad</span>
                      <strong className="pl-prematch-metric-value is-accent" data-frozen-pick-prob="">
                        {formatPctEs(freeze.pick.p)}
                      </strong>
                    </div>
                    <div className="pl-prematch-metric">
                      <span className="pl-prematch-metric-label">Momio justo</span>
                      <strong className="pl-prematch-metric-value" data-frozen-pick-odds="">
                        {formatOddsValue(freeze.pick.fairDecimal, oddsFormat)}
                      </strong>
                    </div>
                  </div>
                </div>

                <PBar p={freeze.pick.p} lead />

                <p className="pl-prematch-note">
                  {freeze.isFrozen
                    ? "Selección y probabilidad selladas 60 min antes del inicio. No cambian aunque el motor vuelva a calcularse."
                    : "La selección principal y su probabilidad quedan selladas 60 min antes del saque inicial."}
                </p>
              </div>
            ) : !mainPickUnlocked ? (
              <div className="pl-prematch-locked">
                <p className="pl-prematch-note">
                  El pick principal congelado y su momio justo están incluidos en el Pase PitchLab Ultra.
                </p>
                <a
                  href={upgradeHref}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo(upgradeHref);
                  }}
                  className="pl-btn-glass text-xs min-h-9 px-3 inline-flex items-center gap-1.5"
                >
                  <MaestroIcon name="lock" size={13} />
                  <span>Activar Pase PitchLab Ultra</span>
                </a>
              </div>
            ) : (
              <p className="pl-prematch-note">
                Aún no hay selección principal calculada para este encuentro.
              </p>
            )}
          </article>

          {/* 2) Bajas y lesiones */}
          <article className="pl-prematch-card" data-pre-match-absences="">
            <div className="pl-prematch-card-head">
              <h3 className="pl-prematch-card-title">Bajas y lesiones</h3>
              {absencesState.state === "with_absences" ? (
                <span className="pl-prematch-count num">
                  {absencesState.items.length}{" "}
                  {absencesState.items.length === 1 ? "reporte" : "reportes"}
                </span>
              ) : null}
            </div>

            {absencesState.state === "with_absences" ? (
              <ul role="list" className="pl-prematch-absence-list">
                {absencesState.items.map((item, idx) => {
                  const team = item.teamSide === "home" ? game.home : game.away;
                  const statusTone =
                    item.status === "Baja"
                      ? "pl-pill pl-pill--danger"
                      : "pl-pill pl-pill--warning";
                  return (
                    <li key={`${item.teamSide}-${item.player}-${idx}`} className="pl-prematch-absence-item">
                      <div className="pl-prematch-absence-top">
                        <div className="pl-prematch-absence-team">
                          <TeamBadge
                            league={game.league}
                            slug={team.slug}
                            name={team.name}
                            logoUrl={team.logoUrl}
                            size={20}
                          />
                          <strong className="pl-prematch-absence-player">
                            {item.player}
                          </strong>
                        </div>
                        <span className={`${statusTone} text-[11px] shrink-0`}>
                          {item.status}
                        </span>
                      </div>
                      <p className="pl-prematch-absence-impact">{item.impactNote}</p>
                    </li>
                  );
                })}
              </ul>
            ) : absencesState.state === "no_absences" ? (
              <p className="pl-prematch-empty" data-no-absences="">
                {absencesState.honestEmptyLabel}
              </p>
            ) : (
              <p className="pl-prematch-note">
                Reporte de bajas y disponibilidad reservado para socios con Pase PitchLab Ultra.
              </p>
            )}
          </article>

          {/* 3) Ranura «Alineación confirmada» — preparada pero APAGADA sin fuente verificada */}
          <article
            className={`pl-prematch-card pl-prematch-lineup ${lineupSlot.enabled ? "is-enabled" : "is-off"}`.trim()}
            data-lineup-slot={lineupSlot.enabled ? "on" : "off"}
          >
            <div className="pl-prematch-card-head">
              <h3 className="pl-prematch-card-title">Alineación confirmada</h3>
              <span
                className={`pl-prematch-slot-chip ${lineupSlot.enabled ? "is-on" : "is-off"}`.trim()}
                data-lineup-status={lineupSlot.enabled ? "on" : "off"}
              >
                {lineupSlot.statusBadge}
              </span>
            </div>

            {lineupSlot.enabled && lineupSlot.lineups ? (
              <div className="pl-prematch-lineup-grid">
                <div className="pl-prematch-lineup-col">
                  <strong className="pl-prematch-lineup-team">
                    {game.home.shortName}
                    {lineupSlot.lineups.homeFormation ? ` · ${lineupSlot.lineups.homeFormation}` : ""}
                  </strong>
                  <ul role="list" className="pl-prematch-starters">
                    {lineupSlot.lineups.homeStarters.map((p, idx) => (
                      <li key={`h-${p.name}-${idx}`}>
                        {p.number !== undefined ? <span className="num">{p.number}</span> : null}
                        <span>{p.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="pl-prematch-lineup-col">
                  <strong className="pl-prematch-lineup-team">
                    {game.away.shortName}
                    {lineupSlot.lineups.awayFormation ? ` · ${lineupSlot.lineups.awayFormation}` : ""}
                  </strong>
                  <ul role="list" className="pl-prematch-starters">
                    {lineupSlot.lineups.awayStarters.map((p, idx) => (
                      <li key={`a-${p.name}-${idx}`}>
                        {p.number !== undefined ? <span className="num">{p.number}</span> : null}
                        <span>{p.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="pl-prematch-note">{lineupSlot.helperText}</p>
            )}
          </article>
        </div>

        {/* 4) Votos de la comunidad (integrado en el módulo sin duplicarse fuera) */}
        <div className="pl-prematch-poll-col">
          <MatchCommunityPoll
            game={game}
            headingLevel={3}
            embedded
            mainPickOverride={pollMainPickOverride}
            nowOverride={nowProp}
          />
        </div>
      </div>
    </section>
  );
}
