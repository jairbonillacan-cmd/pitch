"use client";

import React, { useMemo } from "react";
import {
  canonicalTeamHref,
  isNationalCompetition,
  sportHasDraw,
  sportScoringUnit,
  type LiveMatchDetail,
  type StandingRow,
} from "@pitchlab/contracts";
import { TeamBadge } from "../../../sports";
import { PersonAvatar } from "../team/PersonAvatar";
import {
  AtomicAveragePositionsPitch,
  type AtomicAveragePositionPlayer,
} from "../../atomic/AtomicAveragePositionsPitch";
import { AtomicFormStrip } from "../../atomic/AtomicFormStrip";
import { AtomicLineupPitch } from "../../atomic/AtomicLineupPitch";
import { AtomicShotmapPitch, type AtomicShotItem } from "../../atomic/AtomicShotmapPitch";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { RefereeRigorBadge } from "../../components/RefereeRigorBadge";
import { useLiveMatch } from "../../live/live-store";
import { useOptionalPlatformActions, useOptionalPlatformCore } from "../../platform-provider";
import { resolveMatchRefereeAnalytics } from "../../referee-stats";
import type { MatchIntelligenceV5View, PlatformGame } from "../../types";
import {
  HONEST_NO_ABSENCES_COPY,
  localizeInjuryLabelEs,
  resolveConfirmedLineupSlotState,
  resolveProbableLineupSlotState,
} from "./pre-match-logic";

type Result = "G" | "E" | "P";

/** «P-G-G-G-G · 4-1» → ["P","G","G","G","G"]. */
export function parseForm(value: string): Result[] {
  const head = value.split("·")[0] ?? "";
  return (head.match(/[GEPWDL]/g) ?? []).map((c) => (c === "W" ? "G" : c === "D" ? "E" : c === "L" ? "P" : (c as Result)));
}

/** «129 pts a favor · 94 en contra» con 5 partidos → por partido. */
function perGame(sub: string | undefined, games: number): { for: number; against: number } | null {
  if (!sub || games <= 0) return null;
  const nums = sub.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  return { for: Number(nums[0]) / games, against: Number(nums[1]) / games };
}

function standingSlug(teamId: string): string {
  return (teamId.includes(".") ? teamId.split(".")[1]! : teamId).toLowerCase();
}

function matchSideForStanding(
  row: StandingRow,
  game: PlatformGame,
): "home" | "away" | null {
  const rowSlug = standingSlug(row.teamId);
  const rowName = row.name.trim().toLowerCase();
  const homeSlug = game.home.slug.toLowerCase();
  const awaySlug = game.away.slug.toLowerCase();
  if (
    rowSlug === homeSlug ||
    rowName === game.home.name.trim().toLowerCase() ||
    rowName === game.home.shortName.trim().toLowerCase()
  ) {
    return "home";
  }
  if (
    rowSlug === awaySlug ||
    rowName === game.away.name.trim().toLowerCase() ||
    rowName === game.away.shortName.trim().toLowerCase()
  ) {
    return "away";
  }
  return null;
}

function restComparisonLabel(game: PlatformGame): string | null {
  const home = game.restDays?.home;
  const away = game.restDays?.away;
  if (home === undefined || away === undefined) return null;
  if (home === away) {
    return `Igualdad de descanso (${home} ${home === 1 ? "día" : "días"} por lado)`;
  }
  const diff = Math.abs(home - away);
  const restedTeam = home > away ? game.home.shortName : game.away.shortName;
  return `${restedTeam} llega con +${diff} ${diff === 1 ? "día" : "días"} extra de descanso`;
}

function mergeUniqueBroadcasts(
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

function buildLivePlayerRatings(
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

export interface MatchContextPanelProps {
  readonly game: PlatformGame;
  readonly standings?: readonly StandingRow[];
  readonly unlocked?: boolean;
  readonly v5?: MatchIntelligenceV5View | null;
  readonly liveDetail?: LiveMatchDetail | null;
  readonly averagePositions?: readonly AtomicAveragePositionPlayer[];
  readonly shots?: readonly AtomicShotItem[];
  readonly opinionsSlot?: React.ReactNode;
}

/**
 * Contexto del partido: cómo llegan los equipos (forma con `AtomicFormStrip`, producción,
 * descanso y bajas), lectura táctica en cancha (`AtomicLineupPitch`, `AtomicShotmapPitch`,
 * `AtomicAveragePositionsPitch`), sede/clima/árbitro/TV MX, historial directo y tabla.
 * Todo sale de datos reales del partido sin inventar valores.
 */
export function MatchContextPanel({
  game,
  standings = [],
  unlocked = true,
  v5 = null,
  liveDetail: liveDetailProp,
  averagePositions,
  shots: shotsProp,
  opinionsSlot,
}: MatchContextPanelProps): React.JSX.Element {
  const platformActions = useOptionalPlatformActions();
  const platformCore = useOptionalPlatformCore();
  const liveSupported = game.sport !== "american-football" && game.league !== "nfl";
  const liveSnap = useLiveMatch(game.id, liveSupported && liveDetailProp === undefined);
  const effectiveLiveDetail = liveDetailProp !== undefined ? liveDetailProp : liveSnap.data;

  const hasDraw = sportHasDraw(game.sport);
  const unit = sportScoringUnit(game.sport).short;
  const isFinished = game.status === "FT";
  const canReadContext = unlocked || isFinished;
  const homeFactor = game.factors.find((f) => /local/i.test(f.label));
  const awayFactor = game.factors.find((f) => /visit/i.test(f.label));
  const others = game.factors.filter((f) => f !== homeFactor && f !== awayFactor);
  const availability = game.spacetime?.availability;
  const stadium = game.spacetime?.stadium;
  const restBadge = restComparisonLabel(game);
  const absences = canReadContext ? game.preGame.absences : [];

  const homeStandingIdx = standings.findIndex(
    (r) => matchSideForStanding(r, game) === "home",
  );
  const awayStandingIdx = standings.findIndex(
    (r) => matchSideForStanding(r, game) === "away",
  );

  const sides = [
    {
      side: "home" as const,
      team: game.home,
      factor: homeFactor,
      rest: game.restDays?.home,
      injured: availability?.homeInjured ?? null,
      missing: availability?.homeMissingValuePct ?? null,
    },
    {
      side: "away" as const,
      team: game.away,
      factor: awayFactor,
      rest: game.restDays?.away,
      injured: availability?.awayInjured ?? null,
      missing: availability?.awayMissingValuePct ?? null,
    },
  ];

  const h2h = game.headToHead;
  const homeKey = game.home.shortName.toLowerCase();
  const wins = { home: 0, away: 0, draw: 0 };
  let goals = 0;
  for (const m of h2h) {
    goals += m.homeGoals + m.awayGoals;
    if (m.homeGoals === m.awayGoals) wins.draw += 1;
    else {
      const winner = m.homeGoals > m.awayGoals ? m.home : m.away;
      if (winner.toLowerCase().includes(homeKey) || homeKey.includes(winner.toLowerCase())) wins.home += 1;
      else wins.away += 1;
    }
  }

  const preContext = game.preGame?.matchContext;
  const effectiveReferee =
    (game.referee ?? preContext?.referee ?? effectiveLiveDetail?.entry.referee ?? "").trim() || null;

  const refereeAnalytics = useMemo(() => {
    if (!effectiveReferee) return null;
    const refGame =
      game.referee || preContext?.referee ? game : { ...game, referee: effectiveReferee };
    return resolveMatchRefereeAnalytics(refGame, platformCore?.dataset.games ?? [refGame]);
  }, [effectiveReferee, game, preContext?.referee, platformCore?.dataset.games]);

  const broadcastsMx = useMemo(
    () => mergeUniqueBroadcasts(preContext?.broadcastsMx, effectiveLiveDetail?.broadcastsMx),
    [preContext?.broadcastsMx, effectiveLiveDetail?.broadcastsMx],
  );

  const playerRatings = useMemo(
    () => buildLivePlayerRatings(effectiveLiveDetail?.playerStats),
    [effectiveLiveDetail?.playerStats],
  );

  const confirmedLineupSlot = useMemo(
    () => resolveConfirmedLineupSlotState(game.preGame, canReadContext),
    [game.preGame, canReadContext],
  );
  const probableLineupSlot = useMemo(
    () => resolveProbableLineupSlotState(game.preGame, canReadContext),
    [game.preGame, canReadContext],
  );
  const activeLineups = confirmedLineupSlot.enabled
    ? confirmedLineupSlot.lineups
    : probableLineupSlot?.available
      ? probableLineupSlot.lineups
      : null;

  const showLineupPitch =
    game.sport === "football" &&
    activeLineups !== null &&
    (activeLineups.homeStarters.length >= 7 || activeLineups.awayStarters.length >= 7);

  const effectiveShots = useMemo<readonly AtomicShotItem[]>(() => {
    if (shotsProp && shotsProp.length > 0) return shotsProp;
    if (effectiveLiveDetail?.shots && effectiveLiveDetail.shots.length > 0) {
      return effectiveLiveDetail.shots;
    }
    return [];
  }, [shotsProp, effectiveLiveDetail?.shots]);

  const showShotmap = game.sport === "football" && effectiveShots.length > 0;
  const showAvgPositions =
    game.sport === "football" && Boolean(averagePositions && averagePositions.length > 0);
  const hasTacticalBoard = showLineupPitch || showShotmap || showAvgPositions;

  const stadiumLocation = [preContext?.venueCity, preContext?.venueCountry]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(", ");

  const hasRefRawStats = Boolean(
    preContext?.refereeStats &&
      (preContext.refereeStats.avgYellow != null ||
        preContext.refereeStats.avgFouls != null ||
        preContext.refereeStats.avgRed != null),
  );
  const hasRefRigorBadge = Boolean(refereeAnalytics && refereeAnalytics.ebYellow !== null);
  const hasRefV5Prior = Boolean(canReadContext && v5?.microCounts?.refereeProfile);

  return (
    <div className="pl-ctx">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="m-0 text-lg font-extrabold">Contexto del partido</h2>
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Forma reciente, alineaciones, sede, arbitraje, bajas e historial directo.
          </p>
        </div>
        {restBadge ? (
          <span className="pl-pill pl-pill--brand num text-xs" data-ctx-rest="">
            {restBadge}
          </span>
        ) : null}
      </div>

      <section className="pl-ctx-teams" aria-label="Cómo llegan los equipos">
        {sides.map((s) => {
          const form = s.factor ? parseForm(s.factor.value) : [];
          const prod = perGame(s.factor?.sub, form.length);
          return (
            <article key={s.side} className="pl-ctx-team glass-card glass-ring">
              <header className="flex items-center gap-3">
                <TeamBadge
                  league={game.league}
                  slug={s.team.slug}
                  name={s.team.name}
                  logoUrl={s.team.logoUrl}
                  size={32}
                />
                <div className="min-w-0 flex-1">
                  <h3 className="m-0 text-base font-extrabold truncate">
                    <a
                      href={canonicalTeamHref(game.league, s.team.slug)}
                      onClick={(e) => {
                        if (!platformActions) return;
                        e.preventDefault();
                        platformActions.navigateTo(canonicalTeamHref(game.league, s.team.slug));
                      }}
                      className="pl-team-link inline-flex items-center min-h-11 sm:min-h-0"
                      title={`Ver perfil de ${s.team.name}`}
                    >
                      {s.team.name}
                    </a>
                  </h3>
                  <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    {game.neutralSite ? "Sede neutral" : s.side === "home" ? "Juega en casa" : "Juega de visita"} ·{" "}
                    {s.team.record}
                  </span>
                </div>
              </header>
              {form.length > 0 ? (
                <div className="pl-ctx-row">
                  <span>Últimos {form.length}</span>
                  <AtomicFormStrip
                    form={form}
                    sport={game.sport}
                    teamName={s.team.name}
                    size="sm"
                  />
                </div>
              ) : null}
              <dl className="pl-ctx-stats">
                {prod ? (
                  <>
                    <div>
                      <dt>A favor</dt>
                      <dd className="num">
                        {prod.for.toFixed(1)} <small>{unit}/p</small>
                      </dd>
                    </div>
                    <div>
                      <dt>En contra</dt>
                      <dd className="num">
                        {prod.against.toFixed(1)} <small>{unit}/p</small>
                      </dd>
                    </div>
                  </>
                ) : null}
                {s.rest !== undefined ? (
                  <div>
                    <dt>Descanso</dt>
                    <dd className="num">
                      {s.rest} <small>días</small>
                    </dd>
                  </div>
                ) : null}
                {s.injured !== null ? (
                  <div>
                    <dt>Lesionados</dt>
                    <dd className="num">{s.injured}</dd>
                  </div>
                ) : null}
                {s.missing !== null ? (
                  <div>
                    <dt>Plantilla fuera</dt>
                    <dd className="num">
                      {s.missing} <small>%</small>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </article>
          );
        })}
      </section>

      {hasTacticalBoard ? (
        <section
          className="space-y-3"
          aria-labelledby="ctx-tactics"
          data-ctx-tactics=""
        >
          <h3 id="ctx-tactics" className="pl-cortex-label m-0">
            Lectura táctica en cancha
          </h3>

          {showLineupPitch && activeLineups ? (
            <div className="space-y-2">
              <AtomicLineupPitch
                homeName={game.home.shortName}
                awayName={game.away.shortName}
                homeFormation={activeLineups.homeFormation}
                awayFormation={activeLineups.awayFormation}
                homeStarters={activeLineups.homeStarters}
                awayStarters={activeLineups.awayStarters}
                status={confirmedLineupSlot.enabled ? "confirmed" : "probable"}
                incidents={effectiveLiveDetail?.incidents}
                playerRatings={playerRatings}
              />
              {probableLineupSlot?.available && !confirmedLineupSlot.enabled ? (
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  {probableLineupSlot.helperText}
                </p>
              ) : null}
            </div>
          ) : null}

          {showShotmap || showAvgPositions ? (
            <div className={showShotmap && showAvgPositions ? "pl-ctx-split" : "space-y-3"}>
              {showShotmap ? (
                <AtomicShotmapPitch
                  shots={effectiveShots}
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
        </section>
      ) : null}

      <div className="pl-ctx-split">
        <section className="pl-ctx-card glass-card glass-ring" aria-labelledby="ctx-venue">
          <h3 id="ctx-venue" className="pl-cortex-label">
            Sede y ficha del encuentro
          </h3>
          <p className="m-0 flex flex-wrap items-center gap-2 text-sm font-bold">
            <MaestroIcon name="pin" size={15} />
            <span>{stadium?.name ?? game.venue}</span>
            {stadiumLocation ? (
              <span className="text-xs font-normal" style={{ color: "var(--pl-text-muted)" }}>
                · {stadiumLocation}
              </span>
            ) : null}
          </p>
          <dl className="pl-ctx-stats pl-ctx-facts-grid">
            <div>
              <dt>Condición</dt>
              <dd className="text-sm font-bold">
                {game.neutralSite ? "Sede neutral" : `Local: ${game.home.shortName}`}
              </dd>
            </div>
            <div>
              <dt>Visitante</dt>
              <dd className="text-sm font-bold">{game.away.shortName}</dd>
            </div>
            <div>
              <dt>Inicio</dt>
              <dd className="text-sm font-bold num">{game.kickoffLocal}</dd>
            </div>
            {effectiveReferee ? (
              <div className="pl-ctx-referee-cell">
                <dt>Árbitro</dt>
                <dd className="text-sm font-bold inline-flex flex-col gap-1">
                  <span className="inline-flex items-center gap-1.5">
                    <MaestroIcon name="whistle" size={14} />
                    <span>{effectiveReferee}</span>
                    {preContext?.refereeStats?.country ? (
                      <span className="text-xs font-normal" style={{ color: "var(--pl-text-muted)" }}>
                        · {preContext.refereeStats.country}
                      </span>
                    ) : null}
                  </span>
                  {hasRefRawStats && preContext?.refereeStats ? (
                    <span className="pl-ctx-referee-stats num">
                      {[
                        preContext.refereeStats.avgYellow != null
                          ? `${preContext.refereeStats.avgYellow.toFixed(1)} amar./p`
                          : null,
                        preContext.refereeStats.avgRed != null
                          ? `${preContext.refereeStats.avgRed.toFixed(2)} roj./p`
                          : null,
                        preContext.refereeStats.avgFouls != null
                          ? `${preContext.refereeStats.avgFouls.toFixed(1)} faltas/p`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : null}
                  {hasRefRigorBadge && refereeAnalytics ? (
                    <RefereeRigorBadge referee={refereeAnalytics} variant="compact" />
                  ) : null}
                  {hasRefV5Prior && v5?.microCounts?.refereeProfile ? (() => {
                    const rp = v5.microCounts.refereeProfile;
                    const cardDeltaPct = Math.round((rp.cardsMultiplier - 1) * 100);
                    const foulDeltaPct = Math.round((rp.foulsMultiplier - 1) * 100);
                    const cardTone =
                      cardDeltaPct >= 6
                        ? "var(--pl-warning)"
                        : cardDeltaPct <= -6
                          ? "var(--pl-success)"
                          : "var(--pl-text-secondary)";
                    return (
                      <span
                        className="text-[11px] font-semibold num"
                        style={{ color: cardTone }}
                        data-v5-referee-prior=""
                      >
                        Perfil histórico ({rp.games} p):{" "}
                        {cardDeltaPct >= 0 ? `+${cardDeltaPct}` : `${cardDeltaPct}`} % tarjetas ·{" "}
                        {foulDeltaPct >= 0 ? `+${foulDeltaPct}` : `${foulDeltaPct}`} % faltas vs liga
                      </span>
                    );
                  })() : null}
                  {!hasRefRawStats && !hasRefRigorBadge && !hasRefV5Prior ? (
                    <span className="text-[11px] font-normal" style={{ color: "var(--pl-text-muted)" }}>
                      Sin historial suficiente de tarjetas y faltas en liga.
                    </span>
                  ) : null}
                </dd>
              </div>
            ) : (
              <div>
                <dt>Árbitro</dt>
                <dd className="text-sm font-semibold" style={{ color: "var(--pl-text-muted)" }}>
                  {isFinished ? "No reportado" : "Por confirmar"}
                </dd>
              </div>
            )}
            {preContext?.venueCapacity ? (
              <div>
                <dt>Capacidad</dt>
                <dd className="text-sm font-bold num">
                  {preContext.venueCapacity.toLocaleString("es-MX")} esp.
                </dd>
              </div>
            ) : null}
            {preContext?.attendance != null && preContext.attendance > 0 ? (
              <div>
                <dt>Asistencia</dt>
                <dd className="text-sm font-bold num">
                  {preContext.attendance.toLocaleString("es-MX")} esp.
                </dd>
              </div>
            ) : null}
            {preContext?.halfTimeScore ? (
              <div>
                <dt>Al descanso</dt>
                <dd className="text-sm font-bold num">
                  {preContext.halfTimeScore.home} – {preContext.halfTimeScore.away}
                </dd>
              </div>
            ) : null}
            {preContext?.extraTimeScore ? (
              <div>
                <dt>Prórroga</dt>
                <dd className="text-sm font-bold num">
                  {preContext.extraTimeScore.home} – {preContext.extraTimeScore.away}
                </dd>
              </div>
            ) : null}
            {preContext?.penaltyShootout ? (
              <div>
                <dt>Penales</dt>
                <dd className="text-sm font-bold num">
                  {preContext.penaltyShootout.home} – {preContext.penaltyShootout.away}
                </dd>
              </div>
            ) : null}
            {stadium?.elevationM ? (
              <div>
                <dt>Altitud</dt>
                <dd className="text-sm font-bold num">
                  {Math.round(stadium.elevationM).toLocaleString("es-MX")} m
                </dd>
              </div>
            ) : null}
            {preContext?.weather &&
            (preContext.weather.description ||
              preContext.weather.temperatureC != null ||
              preContext.weather.windSpeedKmh != null) ? (
              <div>
                <dt>Clima previsto</dt>
                <dd className="text-sm font-bold">
                  {[
                    preContext.weather.description,
                    preContext.weather.temperatureC != null
                      ? `${Math.round(preContext.weather.temperatureC)} °C`
                      : null,
                    preContext.weather.windSpeedKmh != null
                      ? `Viento ${Math.round(preContext.weather.windSpeedKmh)} km/h`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </dd>
              </div>
            ) : null}
            {preContext?.pitchCondition ? (
              <div>
                <dt>Terreno</dt>
                <dd className="text-sm font-bold">{preContext.pitchCondition}</dd>
              </div>
            ) : null}
            {preContext?.travelDistanceKm != null ? (
              <div>
                <dt>Viaje visita</dt>
                <dd className="text-sm font-bold num">{Math.round(preContext.travelDistanceKm)} km</dd>
              </div>
            ) : null}
            {preContext?.isLocalDerby ? (
              <div>
                <dt>Rivalidad</dt>
                <dd className="text-sm font-bold">Clásico local</dd>
              </div>
            ) : null}
            {broadcastsMx.length > 0 ? (
              <div data-ctx-broadcasts-mx="">
                <dt>TV México</dt>
                <dd className="text-sm font-bold">{broadcastsMx.join(" · ")}</dd>
              </div>
            ) : null}
          </dl>
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            {game.dayLabel} · {game.kickoffLocal}
          </p>
          {preContext?.probablePitchers &&
          (preContext.probablePitchers.home || preContext.probablePitchers.away) ? (
            <div className="pt-2" data-mlb-probable-pitchers="">
              <h4 className="pl-cortex-label m-0">Lanzadores abridores probables</h4>
              <div className="pl-pitchers-grid">
                {(
                  [
                    { sideLabel: game.home.shortName, pitcher: preContext.probablePitchers.home },
                    { sideLabel: game.away.shortName, pitcher: preContext.probablePitchers.away },
                  ] as const
                )
                  .filter((item) => Boolean(item.pitcher))
                  .map(({ sideLabel, pitcher }) => {
                    const p = pitcher!;
                    const handLabel =
                      p.throwingHand === "L"
                        ? "Zurdo"
                        : p.throwingHand === "R"
                          ? "Derecho"
                          : p.throwingHand === "S"
                            ? "Ambidiestro"
                            : null;
                    const statParts = [
                      p.record ? p.record : null,
                      p.era != null ? `ERA ${p.era.toFixed(2)}` : null,
                      p.whip != null ? `WHIP ${p.whip.toFixed(2)}` : null,
                      p.strikeoutsPer9 != null ? `K/9 ${p.strikeoutsPer9.toFixed(1)}` : null,
                    ].filter(Boolean);
                    return (
                      <div key={sideLabel} className="pl-pitcher-card">
                        <PersonAvatar photoKey={p.photoKey} size={36} />
                        <div className="min-w-0 flex-1">
                          <span className="block text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                            {sideLabel}
                            {handLabel ? ` · ${handLabel}` : ""}
                          </span>
                          <strong className="block text-sm font-bold truncate">{p.name}</strong>
                          {statParts.length > 0 ? (
                            <span className="block text-xs num" style={{ color: "var(--pl-text-secondary)" }}>
                              {statParts.join(" · ")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : null}
          {others.length > 0 ? (
            <>
              <h3 className="pl-cortex-label mt-1">Otros datos del encuentro</h3>
              <dl className="pl-ctx-stats pl-ctx-facts-grid">
                {others.map((f) => (
                  <div key={f.label}>
                    <dt>{f.label}</dt>
                    <dd className="text-sm font-bold num">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </section>

        <section className="pl-ctx-card glass-card glass-ring" aria-labelledby="ctx-h2h">
          <h3 id="ctx-h2h" className="pl-cortex-label">
            Historial directo
          </h3>
          {h2h.length === 0 ? (
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-muted)" }}>
              No hay enfrentamientos previos registrados.
            </p>
          ) : (
            <>
              <div className="pl-ctx-h2h-sum num">
                <div>
                  <strong>{wins.home}</strong>
                  <span>{game.home.shortName}</span>
                </div>
                {hasDraw ? (
                  <div>
                    <strong>{wins.draw}</strong>
                    <span>Empates</span>
                  </div>
                ) : null}
                <div>
                  <strong>{wins.away}</strong>
                  <span>{game.away.shortName}</span>
                </div>
                <div>
                  <strong>{(goals / h2h.length).toFixed(1)}</strong>
                  <span>{unit} por partido</span>
                </div>
              </div>
              <ul className="pl-ctx-h2h" role="list">
                {h2h.map((m) => {
                  const draw = m.homeGoals === m.awayGoals;
                  const homeWon = m.homeGoals > m.awayGoals;
                  return (
                    <li key={`${m.date}-${m.home}`} className="num">
                      <span className="pl-ctx-date">{m.date}</span>
                      <span className={`truncate ${!draw && homeWon ? "font-extrabold" : ""}`}>{m.home}</span>
                      <strong className="pl-ctx-score">
                        {m.homeGoals}–{m.awayGoals}
                      </strong>
                      <span className={`truncate text-right ${!draw && !homeWon ? "font-extrabold" : ""}`}>{m.away}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* Bajas y ausencias detalladas + Opiniones de socios lado a lado cuando existe */}
      {(() => {
        const absencesSection = (
          <section
            className="pl-ctx-card glass-card glass-ring"
            aria-labelledby="ctx-absences"
            data-ctx-absences=""
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="ctx-absences" className="pl-cortex-label m-0">
                Bajas y disponibilidad
              </h3>
              {canReadContext ? (
                <span className="text-xs num font-semibold" style={{ color: "var(--pl-text-muted)" }}>
                  {absences.length > 0
                    ? `${absences.length} ${absences.length === 1 ? "reporte" : "reportes"}`
                    : "Sin bajas registradas"}
                </span>
              ) : null}
            </div>
            {!canReadContext ? (
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                El reporte detallado de bajas y plantilla fuera está disponible con Pase PitchLab Ultra.
              </p>
            ) : absences.length > 0 ? (
              <ul className="pl-ctx-absences" role="list">
                {absences.map((item, idx) => (
                  <li key={`${item.player}-${idx}`} className="pl-ctx-absence-row">
                    <div className="min-w-0">
                      <strong className="block text-sm truncate">{item.player}</strong>
                      <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                        {item.role}
                        {(() => {
                          const injEs = localizeInjuryLabelEs(item.injuryType);
                          const noteEs = localizeInjuryLabelEs(item.impactNote);
                          const parts = [
                            injEs || null,
                            item.returnDate ? `Regreso est.: ${item.returnDate}` : null,
                            noteEs && noteEs.toLowerCase() !== injEs.toLowerCase() ? noteEs : null,
                          ].filter(Boolean);
                          return parts.length > 0 ? ` · ${parts.join(" · ")}` : "";
                        })()}
                      </span>
                    </div>
                    <span className="pl-pill text-[11px] shrink-0">{item.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                {HONEST_NO_ABSENCES_COPY}.
              </p>
            )}
          </section>
        );
        if (!opinionsSlot) return absencesSection;
        return (
          <div className="pl-ctx-split">
            {absencesSection}
            {opinionsSlot}
          </div>
        );
      })()}

      {/* Tabla de posiciones */}
      <section
        className="pl-ctx-card glass-card glass-ring"
        aria-labelledby="ctx-standings"
        data-ctx-standings=""
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="ctx-standings" className="pl-cortex-label m-0">
            Tabla de posiciones · {game.leagueLabel}
          </h3>
          {standings.length > 0 && (homeStandingIdx >= 0 || awayStandingIdx >= 0) ? (
            <div className="flex flex-wrap items-center gap-2 text-xs num">
              {homeStandingIdx >= 0 ? (
                <span className="pl-pill pl-pill--brand">
                  {game.home.shortName}: {homeStandingIdx + 1}.º ({standings[homeStandingIdx]!.points} pts)
                </span>
              ) : null}
              {awayStandingIdx >= 0 ? (
                <span className="pl-pill">
                  {game.away.shortName}: {awayStandingIdx + 1}.º ({standings[awayStandingIdx]!.points} pts)
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {standings.length === 0 ? (
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            {game.sport !== "football"
              ? `La ${game.leagueLabel} se consulta por conferencia; arriba puedes comparar la marca de cada club.`
              : "La tabla oficial de esta jornada se actualizará con el siguiente corte."}
          </p>
        ) : (
          <div
            className="pl-table-region"
            tabIndex={0}
            role="region"
            aria-label={`Tabla de posiciones de ${game.leagueLabel}`}
          >
            <table className="standings w-full text-left border-collapse text-sm">
              <thead>
                <tr className="hairline-b text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  <th scope="col" className="py-2 pr-3">Pos.</th>
                  <th scope="col" className="py-2 pr-3">
                    {isNationalCompetition(game.league) ? "Selección" : "Club"}
                  </th>
                  <th scope="col" className="py-2 px-2 text-right">PJ</th>
                  <th scope="col" className="py-2 px-2 text-right">G</th>
                  <th scope="col" className="py-2 px-2 text-right">E</th>
                  <th scope="col" className="py-2 px-2 text-right">P</th>
                  <th scope="col" className="py-2 px-2 text-right">DG</th>
                  <th scope="col" className="py-2 pl-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, idx) => {
                  const side = matchSideForStanding(row, game);
                  const slug = standingSlug(row.teamId);
                  const dg = row.goalsFor - row.goalsAgainst;
                  return (
                    <tr
                      key={row.teamId}
                      className={`hairline-b ${side ? "pl-ctx-standing-highlight" : ""}`.trim()}
                    >
                      <td className="py-2.5 pr-3 num font-bold">{idx + 1}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2 font-semibold">
                          <TeamBadge league={game.league} slug={slug} name={row.name} logoUrl={row.logoUrl} size={20} />
                          <a
                            href={canonicalTeamHref(game.league, slug)}
                            onClick={(e) => {
                              if (!platformActions) return;
                              e.preventDefault();
                              platformActions.navigateTo(canonicalTeamHref(game.league, slug));
                            }}
                            className="pl-team-link"
                            title={`Ver perfil de ${row.name}`}
                          >
                            {row.name}
                          </a>
                          {side ? (
                            <span className="pl-pill text-[10px]">
                              {side === "home" ? "Local" : "Visita"}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right num">{row.played}</td>
                      <td className="py-2.5 px-2 text-right num">{row.won}</td>
                      <td className="py-2.5 px-2 text-right num">{row.drawn}</td>
                      <td className="py-2.5 px-2 text-right num">{row.lost}</td>
                      <td className="py-2.5 px-2 text-right num">{dg >= 0 ? `+${dg}` : dg}</td>
                      <td className="py-2.5 pl-2 text-right num font-extrabold">{row.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
