"use client";

import React, { useId, useMemo, useRef, useState } from "react";
import { isLiveCapableLeague, type LiveMatchDetail } from "@pitchlab/contracts";
import { PBar, TeamBadge } from "../../../sports";
import {
  formatOddsValue,
  isPickUnlocked,
  isPreGameIntelUnlocked,
} from "../../access-guard";
import {
  AtomicAveragePositionsPitch,
  type AtomicAveragePositionPlayer,
} from "../../atomic/AtomicAveragePositionsPitch";
import { AtomicFormStrip, parseAtomicForm } from "../../atomic/AtomicFormStrip";
import { AtomicLineupPitch } from "../../atomic/AtomicLineupPitch";
import { AtomicShotmapPitch, type AtomicShotItem } from "../../atomic/AtomicShotmapPitch";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { RefereeRigorBadge } from "../../components/RefereeRigorBadge";
import { useSafeEffect } from "../../hooks";
import { useLiveMatch } from "../../live/live-store";
import { formatPctEs } from "../../notifications";
import {
  usePlatformActions,
  usePlatformCore,
  useWatchlistGameIds,
} from "../../platform-provider";
import { resolveMatchRefereeAnalytics } from "../../referee-stats";
import type {
  FrozenMainPickSnapshot,
  PlatformGame,
  PlatformGameDetail,
} from "../../types";
import { MatchCommunityPoll } from "./MatchCommunityPoll";
import {
  DEFAULT_PRE_MATCH_TIMEZONE,
  isValidFrozenSnapshot,
  localizeInjuryLabelEs,
  readClientFrozenPick,
  resolveConfirmedLineupSlotState,
  resolvePreMatchAbsencesState,
  resolvePreMatchFreezeState,
  resolveProbableLineupSlotState,
  saveClientFrozenPick,
} from "./pre-match-logic";

export interface PreMatchModuleProps {
  game: PlatformGame;
  detail?: PlatformGameDetail | null;
  /** Detalle en vivo opcional para incidencias, calificaciones en cancha y canales MX. */
  liveDetail?: LiveMatchDetail | null;
  /** Posiciones medias opcionales para vista táctica progresiva. */
  averagePositions?: readonly AtomicAveragePositionPlayer[];
  /** Mapa de tiros opcional para vista táctica progresiva. */
  shots?: readonly AtomicShotItem[];
  /** Reloj inyectable para pruebas deterministas y Storybook. */
  now?: Date | number;
  /** Zona horaria opcional (por defecto la preferencia del socio o `America/Mexico_City`). */
  timeZone?: string;
}

function mergeUniqueChannels(
  primary?: readonly string[],
  secondary?: readonly string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of [primary, secondary]) {
    if (!list) continue;
    for (const raw of list) {
      const clean = raw.trim();
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

function buildPlayerRatingsMap(
  playerStats?: LiveMatchDetail["playerStats"],
): Readonly<Record<string, number>> | undefined {
  if (!playerStats || playerStats.length === 0) return undefined;
  const map: Record<string, number> = {};
  let count = 0;
  for (const row of playerStats) {
    if (row.rating != null && Number.isFinite(row.rating) && row.rating > 0) {
      map[row.player] = row.rating;
      count += 1;
    }
  }
  return count > 0 ? map : undefined;
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
 * 2) Contexto previo (árbitro y rigor, clima/estadio, TV México y rachas `AtomicFormStrip`) cuando existen datos reales.
 * 3) Bajas y lesiones reportadas (con honestidad explícita cuando no hay reporte).
 * 4) Cancha táctica `AtomicLineupPitch` cuando existe alineación verificada o estimada, más vistas tácticas progresivas.
 * 5) Votos de la comunidad (`MatchCommunityPoll`) y aviso opcional en la campana («Avísame 60 min antes»).
 */
export function PreMatchModule({
  game,
  detail,
  liveDetail: liveDetailProp,
  averagePositions,
  shots: shotsProp,
  now: nowProp,
  timeZone: timeZoneProp,
}: PreMatchModuleProps): React.JSX.Element {
  const { dataset, viewerRole, oddsFormat, userTimezone, upgradeHref } = usePlatformCore();
  const { toggleWatchlistGame, navigateTo } = usePlatformActions();
  const watchlistGameIds = useWatchlistGameIds();

  const liveSupported = isLiveCapableLeague(game.league);
  const liveSnap = useLiveMatch(game.id, liveSupported && liveDetailProp === undefined);
  const effectiveLiveDetail = liveDetailProp !== undefined ? liveDetailProp : liveSnap.data;

  const headingId = useId();
  // Ancla determinista en SSR para evitar discrepancias de hidratación si el minuto cambia entre servidor y cliente.
  const [liveNowMs, setLiveNowMs] = useState<number | null>(null);
  const [clientFrozen, setClientFrozen] = useState<FrozenMainPickSnapshot | null>(null);
  const stickyFrozenRef = useRef<FrozenMainPickSnapshot | null>(null);

  // Al cambiar de partido, reinicia el respaldo en memoria y lee el snapshot local si existe.
  if (stickyFrozenRef.current && stickyFrozenRef.current.gameId !== game.id) {
    stickyFrozenRef.current = null;
  }

  useSafeEffect(() => {
    const stored = readClientFrozenPick(game.id);
    if (stored) {
      stickyFrozenRef.current = stored;
      setClientFrozen(stored);
    } else {
      setClientFrozen(null);
    }
  }, [game.id]);

  // En vivo actualiza el reloj cada 30 s para sellar puntualmente al cruzar T - 60 min.
  useSafeEffect(() => {
    if (nowProp !== undefined || game.status === "FT") return;
    setLiveNowMs(Date.now());
    const interval = window.setInterval(() => {
      setLiveNowMs(Date.now());
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [nowProp, game.id, game.status]);

  const kickoffAnchorMs = Date.parse(game.kickoffUtc);
  const ssrSafeFallbackNow = Number.isFinite(kickoffAnchorMs)
    ? game.status === "FT"
      ? kickoffAnchorMs + 3 * 3_600_000
      : kickoffAnchorMs - 4 * 3_600_000
    : 0;
  const effectiveNow = nowProp ?? liveNowMs ?? ssrSafeFallbackNow;
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

  useSafeEffect(() => {
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
  const probableSlot = useMemo(
    () => resolveProbableLineupSlotState(game.preGame, intelUnlocked),
    [game.preGame, intelUnlocked],
  );

  const preContext = game.preGame.matchContext;
  const stadium = game.spacetime?.stadium;
  const effectiveReferee =
    (game.referee ?? preContext?.referee ?? effectiveLiveDetail?.entry.referee ?? "").trim() || null;

  const refereeAnalytics = useMemo(() => {
    if (!effectiveReferee) return null;
    const refGame =
      game.referee || preContext?.referee ? game : { ...game, referee: effectiveReferee };
    return resolveMatchRefereeAnalytics(refGame, dataset.games);
  }, [effectiveReferee, game, preContext?.referee, dataset.games]);

  const refereeV5 = intelUnlocked ? (detail?.v5?.microCounts?.refereeProfile ?? null) : null;

  const broadcastsMx = useMemo(
    () => mergeUniqueChannels(preContext?.broadcastsMx, effectiveLiveDetail?.broadcastsMx),
    [preContext?.broadcastsMx, effectiveLiveDetail?.broadcastsMx],
  );

  const playerRatings = useMemo(
    () => buildPlayerRatingsMap(effectiveLiveDetail?.playerStats),
    [effectiveLiveDetail?.playerStats],
  );

  const weatherSummary = useMemo(() => {
    const w = preContext?.weather;
    if (!w) return null;
    const parts = [
      w.description?.trim() || null,
      w.temperatureC != null && Number.isFinite(w.temperatureC)
        ? `${Math.round(w.temperatureC)} °C`
        : null,
      w.windSpeedKmh != null && Number.isFinite(w.windSpeedKmh)
        ? `Viento ${Math.round(w.windSpeedKmh)} km/h`
        : null,
    ].filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [preContext?.weather]);

  const stadiumName = (stadium?.name ?? game.venue ?? "").trim() || null;
  const stadiumLocation = [preContext?.venueCity, preContext?.venueCountry]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(", ");

  const homeFactor = game.factors.find((f) => /local/i.test(f.label));
  const awayFactor = game.factors.find((f) => /visit/i.test(f.label));
  const canShowForm = intelUnlocked && !game.preGame.isRedacted;
  const homeFormRaw = canShowForm ? homeFactor?.value : undefined;
  const awayFormRaw = canShowForm ? awayFactor?.value : undefined;
  const hasHomeForm = useMemo(
    () => (homeFormRaw ? parseAtomicForm(homeFormRaw, { sport: game.sport }).length > 0 : false),
    [homeFormRaw, game.sport],
  );
  const hasAwayForm = useMemo(
    () => (awayFormRaw ? parseAtomicForm(awayFormRaw, { sport: game.sport }).length > 0 : false),
    [awayFormRaw, game.sport],
  );
  const hasFormStrip = hasHomeForm || hasAwayForm;
  const hasClimateOrTerrain = Boolean(
    weatherSummary || preContext?.pitchCondition || stadium?.elevationM,
  );
  const hasContextStrip = Boolean(
    effectiveReferee || hasClimateOrTerrain || broadcastsMx.length > 0 || hasFormStrip,
  );

  const activeLineups = lineupSlot.enabled
    ? lineupSlot.lineups
    : probableSlot?.available
      ? probableSlot.lineups
      : null;
  const hasActiveLineup = Boolean(activeLineups);

  const explicitShots = useMemo<readonly AtomicShotItem[]>(() => {
    if (shotsProp && shotsProp.length > 0) return shotsProp;
    if (liveDetailProp?.shots && liveDetailProp.shots.length > 0) return liveDetailProp.shots;
    return [];
  }, [shotsProp, liveDetailProp?.shots]);

  const showShotmap = game.sport === "football" && explicitShots.length > 0;
  const showAvgPositions =
    game.sport === "football" && Boolean(averagePositions && averagePositions.length > 0);
  const hasProgressiveTactics = showShotmap || showAvgPositions;

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

  const hasManyAbsences =
    absencesState.state === "with_absences" && absencesState.items.length > 2;

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

      <div
        className="pl-prematch-grid"
        data-absences-layout={hasManyAbsences ? "wide" : "compact"}
      >
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
                className="pl-btn-glass text-xs min-h-11 sm:min-h-9 px-3 inline-flex items-center gap-1.5 touch-manipulation"
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

        {/* 2) Votos de la comunidad (emparejado a la derecha del pick principal con altura equilibrada) */}
        <div className="pl-prematch-poll-col">
          <MatchCommunityPoll
            game={game}
            headingLevel={3}
            embedded
            mainPickOverride={pollMainPickOverride}
            nowOverride={nowProp}
          />
        </div>

        {/* 2.5) Contexto previo (árbitro y rigor, sede/clima, TV México y rachas recientes) */}
        {hasContextStrip ? (
          <article
            className="pl-prematch-card"
            style={{ gridColumn: "1 / -1" }}
            data-pre-match-context=""
          >
            <div className="pl-prematch-card-head">
              <h3 className="pl-prematch-card-title">Ficha previa y rachas</h3>
              {stadiumName ? (
                <span
                  className="inline-flex items-center gap-1 text-xs font-semibold truncate max-w-full"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  <MaestroIcon name="pin" size={13} />
                  <span className="truncate">
                    {stadiumName}
                    {stadiumLocation ? ` · ${stadiumLocation}` : ""}
                  </span>
                </span>
              ) : null}
            </div>

            {effectiveReferee || hasClimateOrTerrain || broadcastsMx.length > 0 ? (
              <dl className="pl-ctx-stats pl-ctx-facts-grid">
                {effectiveReferee ? (
                  <div>
                    <dt>Árbitro</dt>
                    <dd className="text-sm font-bold flex flex-col gap-1">
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <MaestroIcon name="whistle" size={13} />
                        <span className="truncate">{effectiveReferee}</span>
                      </span>
                      {preContext?.refereeStats &&
                      (preContext.refereeStats.avgYellow != null ||
                        preContext.refereeStats.avgFouls != null) ? (
                        <span className="pl-ctx-referee-stats num">
                          {[
                            preContext.refereeStats.avgYellow != null
                              ? `${preContext.refereeStats.avgYellow.toFixed(1)} amar./p`
                              : null,
                            preContext.refereeStats.avgFouls != null
                              ? `${preContext.refereeStats.avgFouls.toFixed(1)} faltas/p`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      ) : null}
                      {refereeAnalytics && refereeAnalytics.ebYellow !== null ? (
                        <RefereeRigorBadge referee={refereeAnalytics} variant="compact" />
                      ) : null}
                      {refereeV5 ? (() => {
                        const cardDelta = Math.round((refereeV5.cardsMultiplier - 1) * 100);
                        const foulDelta = Math.round((refereeV5.foulsMultiplier - 1) * 100);
                        return (
                          <span
                            className="text-[11px] font-semibold num"
                            style={{ color: "var(--pl-text-secondary)" }}
                          >
                            {cardDelta >= 0 ? `+${cardDelta}` : `${cardDelta}`} % tarjetas ·{" "}
                            {foulDelta >= 0 ? `+${foulDelta}` : `${foulDelta}`} % faltas vs liga
                          </span>
                        );
                      })() : null}
                    </dd>
                  </div>
                ) : null}

                {hasClimateOrTerrain ? (
                  <div>
                    <dt>Clima y cancha</dt>
                    <dd className="text-sm font-bold flex flex-col gap-0.5">
                      {weatherSummary ? <span>{weatherSummary}</span> : null}
                      {preContext?.pitchCondition || stadium?.elevationM ? (
                        <span
                          className="text-xs font-semibold num"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          {[
                            preContext?.pitchCondition ?? null,
                            stadium?.elevationM
                              ? `Altitud ${Math.round(stadium.elevationM).toLocaleString("es-MX")} m`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ) : null}

                {broadcastsMx.length > 0 ? (
                  <div data-pre-match-broadcasts-mx="">
                    <dt>TV México</dt>
                    <dd className="text-sm font-bold">{broadcastsMx.join(" · ")}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}

            {hasFormStrip ? (
              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1"
                data-pre-match-form=""
              >
                {hasHomeForm ? (
                  <div
                    className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 min-w-0"
                    style={{
                      background: "var(--pl-surface)",
                      border: "1px solid var(--pl-border)",
                    }}
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <TeamBadge
                        league={game.league}
                        slug={game.home.slug}
                        name={game.home.shortName}
                        logoUrl={game.home.logoUrl}
                        size={18}
                        decorative
                      />
                      <span className="text-xs font-bold truncate">{game.home.shortName}</span>
                    </span>
                    <AtomicFormStrip
                      form={homeFormRaw}
                      sport={game.sport}
                      teamName={game.home.shortName}
                      size="xs"
                    />
                  </div>
                ) : null}
                {hasAwayForm ? (
                  <div
                    className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 min-w-0"
                    style={{
                      background: "var(--pl-surface)",
                      border: "1px solid var(--pl-border)",
                    }}
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <TeamBadge
                        league={game.league}
                        slug={game.away.slug}
                        name={game.away.shortName}
                        logoUrl={game.away.logoUrl}
                        size={18}
                        decorative
                      />
                      <span className="text-xs font-bold truncate">{game.away.shortName}</span>
                    </span>
                    <AtomicFormStrip
                      form={awayFormRaw}
                      sport={game.sport}
                      teamName={game.away.shortName}
                      size="xs"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>
        ) : null}

        {/* 3) Bajas y lesiones (en rejilla multi-columna si supera 2 reportes para aprovechar todo el ancho) */}
        <article
          className={`pl-prematch-card pl-prematch-absences ${hasManyAbsences ? "is-wide" : ""}`.trim()}
          data-pre-match-absences=""
        >
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
            <ul
              role="list"
              tabIndex={0}
              aria-label="Lista de bajas y dudas"
              className={`pl-prematch-absence-list ${hasManyAbsences ? "is-grid" : ""}`.trim()}
            >
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
                    <p className="pl-prematch-absence-impact">
                      {(() => {
                        const injEs = localizeInjuryLabelEs(item.injuryType);
                        const noteEs = localizeInjuryLabelEs(item.impactNote);
                        const parts = [
                          injEs || null,
                          item.returnDate ? `Regreso est. ${item.returnDate}` : null,
                          noteEs && noteEs.toLowerCase() !== injEs.toLowerCase() ? noteEs : null,
                        ].filter(Boolean);
                        return parts.join(" · ");
                      })()}
                    </p>
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

        {/* 4) Ranura «Alineación confirmada» / «Once estimado» con AtomicLineupPitch */}
        <article
          className={`pl-prematch-card pl-prematch-lineup ${hasActiveLineup ? "is-enabled" : "is-off"} ${hasManyAbsences || hasActiveLineup ? "is-wide" : ""}`.trim()}
          data-lineup-slot={lineupSlot.enabled ? "on" : probableSlot?.available ? "estimated" : "off"}
        >
          <div className="pl-prematch-card-head">
            <h3 className="pl-prematch-card-title">
              {lineupSlot.enabled || !probableSlot?.available ? "Alineación confirmada" : "Once estimado"}
            </h3>
            <span
              className={`pl-prematch-slot-chip ${hasActiveLineup ? "is-on" : "is-off"}`.trim()}
              data-lineup-status={lineupSlot.enabled ? "on" : probableSlot?.available ? "estimated" : "off"}
            >
              {lineupSlot.enabled ? lineupSlot.statusBadge : probableSlot?.available ? probableSlot.statusBadge : lineupSlot.statusBadge}
            </span>
          </div>

          {activeLineups ? (
            (() => {
              const helper = lineupSlot.enabled ? lineupSlot.helperText : probableSlot!.helperText;
              const canRenderPitch =
                game.sport === "football" &&
                (activeLineups.homeStarters.length >= 7 || activeLineups.awayStarters.length >= 7);
              return (
                <div className="space-y-3">
                  {canRenderPitch ? (
                    <AtomicLineupPitch
                      homeName={game.home.shortName}
                      awayName={game.away.shortName}
                      homeFormation={activeLineups.homeFormation}
                      awayFormation={activeLineups.awayFormation}
                      homeStarters={activeLineups.homeStarters}
                      awayStarters={activeLineups.awayStarters}
                      status={lineupSlot.enabled ? "confirmed" : "probable"}
                      incidents={effectiveLiveDetail?.incidents}
                      playerRatings={playerRatings}
                    />
                  ) : (
                    <div className="pl-prematch-lineup-grid">
                      <div className="pl-prematch-lineup-col">
                        <strong className="pl-prematch-lineup-team">
                          {game.home.shortName}
                          {activeLineups.homeFormation ? ` · ${activeLineups.homeFormation}` : ""}
                        </strong>
                        <ul role="list" className="pl-prematch-starters">
                          {activeLineups.homeStarters.map((p, idx) => (
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
                          {activeLineups.awayFormation ? ` · ${activeLineups.awayFormation}` : ""}
                        </strong>
                        <ul role="list" className="pl-prematch-starters">
                          {activeLineups.awayStarters.map((p, idx) => (
                            <li key={`a-${p.name}-${idx}`}>
                              {p.number !== undefined ? <span className="num">{p.number}</span> : null}
                              <span>{p.name}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                  {probableSlot?.available && !lineupSlot.enabled ? (
                    <p className="pl-prematch-note">{helper}</p>
                  ) : null}
                </div>
              );
            })()
          ) : (
            <p className="pl-prematch-note">{lineupSlot.helperText}</p>
          )}
        </article>

        {/* 5) Vistas tácticas progresivas (mapa de tiros xG y posiciones medias si existen) */}
        {hasProgressiveTactics ? (
          <div
            className={showShotmap && showAvgPositions ? "pl-ctx-split" : "space-y-3"}
            style={{ gridColumn: "1 / -1" }}
            data-pre-match-tactics=""
          >
            {showShotmap ? (
              <AtomicShotmapPitch
                shots={explicitShots}
                homeLabel={game.home.shortName}
                awayLabel={game.away.shortName}
              />
            ) : null}
            {showAvgPositions && averagePositions ? (
              <AtomicAveragePositionsPitch
                players={averagePositions}
                homeLabel={game.home.shortName}
                awayLabel={game.away.shortName}
                homeFormation={activeLineups?.homeFormation}
                awayFormation={activeLineups?.awayFormation}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
