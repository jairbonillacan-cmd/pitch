"use client";

import React, { useEffect, useId, useState } from "react";
import {
  LEAGUE_REGIONS,
  type LeagueId,
  type LeagueRegionKey,
  type PlatformSport,
} from "@pitchlab/contracts";
import { LeagueBadge, TeamBadge } from "../../sports";
import { computeStatBarWidths } from "../atomic/AtomicStatComparisonBar";
import { FormSquares } from "../components/FormSquares";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { PlSelect } from "../components/PlSelect";
import { shareH2hStoryCard } from "../components/share-story-card";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { usePlatformActions } from "../platform-provider";
import { PersonAvatar } from "./team/PersonAvatar";

export type CompareMode = "equipos" | "jugadores";

export interface CompareMetricRow {
  id: string;
  label: string;
  valueA: string;
  valueB: string;
  numA: number | null;
  numB: number | null;
  /** `true` cuando un valor menor es mejor (p. ej. goles en contra o ERA). */
  lowerIsBetter?: boolean;
}

export interface CompareTeamOption {
  slug: string;
  name: string;
  shortName: string;
  rank: number | null;
}

export interface CompareLeagueCatalog {
  league: LeagueId;
  label: string;
  region?: LeagueRegionKey;
  sport: PlatformSport;
  teams: CompareTeamOption[];
}

export interface CompareTeamCard {
  slug: string;
  name: string;
  shortName: string;
  code: string;
  rank: number | null;
  recordLabel: string;
  pointsLabel: string;
  streak: Array<"G" | "E" | "P">;
  coachName: string | null;
  coachPhotoKey: string | null;
  href: string;
}

export interface CompareH2HMatchRow {
  id: string;
  dateLabel: string;
  round: string | null;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  winner: "A" | "B" | "draw";
  gameHref: string | null;
}

export interface TeamComparisonPayload {
  league: LeagueId;
  leagueLabel: string;
  sport: PlatformSport;
  seasonLabel: string;
  teamA: CompareTeamCard;
  teamB: CompareTeamCard;
  metrics: CompareMetricRow[];
  h2hSummary: {
    played: number;
    winsA: number;
    draws: number;
    winsB: number;
  };
  h2hMatches: CompareH2HMatchRow[];
}

export interface ComparePlayerOption {
  ref: string; // "<teamSlug>:<playerSlug>"
  name: string;
  shortName: string;
  teamSlug: string;
  teamName: string;
  positionLabel: string;
  jersey: string | null;
  photoKey: string | null;
  fallbackPhotoKey: string | null;
}

export interface ComparePlayerCard {
  ref: string;
  name: string;
  shortName: string;
  teamSlug: string;
  teamName: string;
  positionLabel: string;
  jersey: string | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  nationality: string | null;
  photoKey: string | null;
  fallbackPhotoKey: string | null;
  href: string;
}

export interface PlayerComparisonPayload {
  league: LeagueId;
  leagueLabel: string;
  sport: PlatformSport;
  seasonLabel: string;
  playerA: ComparePlayerCard;
  playerB: ComparePlayerCard;
  metrics: CompareMetricRow[];
}

export interface CompareHubViewProps {
  initialMode: CompareMode;
  initialLeague: LeagueId;
  catalog: readonly CompareLeagueCatalog[];
  initialTeamComparison: TeamComparisonPayload | null;
  initialPlayerOptions: readonly ComparePlayerOption[];
  initialPlayerComparison: PlayerComparisonPayload | null;
  /** Opcional para Storybook / pruebas sin red. */
  disableLiveFetch?: boolean;
}

/**
 * Barra comparativa plana editorial (ADR-054):
 * - Cero gradientes, 100 % tokens `--pl-*`.
 * - Apoyada en `computeStatBarWidths` para manejar porcentajes, conteos y valores negativos.
 */
function CompareBarRow({
  row,
  nameA,
  nameB,
}: {
  row: CompareMetricRow;
  nameA: string;
  nameB: string;
}): React.JSX.Element {
  const a = typeof row.numA === "number" && Number.isFinite(row.numA) ? row.numA : null;
  const b = typeof row.numB === "number" && Number.isFinite(row.numB) ? row.numB : null;

  const isPct = row.valueA.includes("%") || row.valueB.includes("%");
  const widths =
    a !== null && b !== null
      ? computeStatBarWidths(a, b, { pct: isPct, signed: a < 0 || b < 0 })
      : { homePct: 0, awayPct: 0, homeNegative: false, awayNegative: false, lead: "tie" as const };

  let leader: "A" | "B" | "tie" = "tie";
  if (a !== null && b !== null && Math.abs(a - b) > 1e-4) {
    if (row.lowerIsBetter) {
      leader = a < b ? "A" : "B";
    } else {
      leader = a > b ? "A" : "B";
    }
  }

  const neutralBarColor = "color-mix(in oklab, var(--pl-text-muted) 32%, transparent)";
  const barColorA = widths.homeNegative
    ? "var(--pl-danger)"
    : leader === "A"
      ? "var(--pl-brand)"
      : neutralBarColor;
  const barColorB = widths.awayNegative
    ? "var(--pl-danger)"
    : leader === "B"
      ? "var(--pl-success)"
      : neutralBarColor;

  return (
    <div className="pl-cmp-row min-w-0" data-compare-metric={row.id}>
      <div className="pl-cmp-row-head num min-w-0">
        <span
          className={`pl-cmp-val truncate ${leader === "A" ? "is-lead" : ""}`.trim()}
          aria-label={`${nameA}: ${row.valueA}`}
        >
          {row.valueA}
        </span>
        <span className="pl-cmp-label min-w-0 break-words">{row.label}</span>
        <span
          className={`pl-cmp-val text-right truncate ${leader === "B" ? "is-lead" : ""}`.trim()}
          aria-label={`${nameB}: ${row.valueB}`}
        >
          {row.valueB}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5" aria-hidden="true">
        <div
          className="flex justify-end h-[7px] rounded-full overflow-hidden"
          style={{ background: "var(--pl-surface-soft)" }}
        >
          <span
            className="block h-full rounded-full"
            data-lead={leader === "A" ? "true" : undefined}
            data-negative={widths.homeNegative ? "true" : undefined}
            style={{
              width: `${widths.homePct}%`,
              background: barColorA,
              transition: "width 220ms ease",
            }}
          />
        </div>
        <div
          className="flex justify-start h-[7px] rounded-full overflow-hidden"
          style={{ background: "var(--pl-surface-soft)" }}
        >
          <span
            className="block h-full rounded-full"
            data-lead={leader === "B" ? "true" : undefined}
            data-negative={widths.awayNegative ? "true" : undefined}
            style={{
              width: `${widths.awayPct}%`,
              background: barColorB,
              transition: "width 220ms ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Comparador rápido H2H (`/app/comparar`):
 * - Pestaña «Equipos»: comparación lado a lado con barras planas + historial directo (H2H) real.
 * - Pestaña «Jugadores»: bio y métricas de temporada proporcionales lado a lado.
 */
export function CompareHubView({
  initialMode,
  initialLeague,
  catalog,
  initialTeamComparison,
  initialPlayerOptions,
  initialPlayerComparison,
  disableLiveFetch = false,
}: CompareHubViewProps): React.JSX.Element {
  const { navigateTo } = usePlatformActions();
  const tabIdBase = useId();
  const [mode, setMode] = useState<CompareMode>(initialMode);
  const [league, setLeague] = useState<LeagueId>(initialLeague);

  const activeCatalog = catalog.find((c) => c.league === league) ?? catalog[0];

  const [teamASlug, setTeamASlug] = useState<string>(
    initialTeamComparison?.teamA.slug ?? activeCatalog?.teams[0]?.slug ?? "",
  );
  const [teamBSlug, setTeamBSlug] = useState<string>(
    initialTeamComparison?.teamB.slug ?? activeCatalog?.teams[1]?.slug ?? "",
  );
  const [teamComparison, setTeamComparison] = useState<TeamComparisonPayload | null>(
    initialTeamComparison,
  );

  const [playerOptions, setPlayerOptions] = useState<readonly ComparePlayerOption[]>(
    initialPlayerOptions,
  );
  const [playerARef, setPlayerARef] = useState<string>(
    initialPlayerComparison?.playerA.ref ?? initialPlayerOptions[0]?.ref ?? "",
  );
  const [playerBRef, setPlayerBRef] = useState<string>(
    initialPlayerComparison?.playerB.ref ?? initialPlayerOptions[1]?.ref ?? "",
  );
  const [playerComparison, setPlayerComparison] = useState<PlayerComparisonPayload | null>(
    initialPlayerComparison,
  );
  const [loading, setLoading] = useState<boolean>(false);

  const navigateOnPlainClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigateTo(href);
  };

  // Cargar comparación de equipos al cambiar selección
  useEffect(() => {
    if (disableLiveFetch || mode !== "equipos") return;
    if (!league || !teamASlug || !teamBSlug || teamASlug === teamBSlug) return;
    if (
      teamComparison &&
      teamComparison.league === league &&
      teamComparison.teamA.slug === teamASlug &&
      teamComparison.teamB.slug === teamBSlug
    ) {
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(
      `/api/compare?modo=equipos&liga=${encodeURIComponent(league)}&a=${encodeURIComponent(teamASlug)}&b=${encodeURIComponent(teamBSlug)}`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { teamComparison?: TeamComparisonPayload | null } | null) => {
        if (controller.signal.aborted) return;
        if (data?.teamComparison) setTeamComparison(data.teamComparison);
        setLoading(false);
      })
      .catch((err) => {
        void err;
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [disableLiveFetch, league, mode, teamASlug, teamBSlug, teamComparison]);

  // Cargar opciones de jugadores y comparación al cambiar liga/jugadores
  useEffect(() => {
    if (disableLiveFetch || mode !== "jugadores" || !league) return;
    const controller = new AbortController();
    setLoading(true);
    const qs = new URLSearchParams({ modo: "jugadores", liga: league });
    if (playerARef) qs.set("a", playerARef);
    if (playerBRef) qs.set("b", playerBRef);
    fetch(`/api/compare?${qs.toString()}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            playerOptions?: ComparePlayerOption[];
            playerComparison?: PlayerComparisonPayload | null;
          } | null,
        ) => {
          if (controller.signal.aborted) return;
          if (Array.isArray(data?.playerOptions)) {
            setPlayerOptions(data.playerOptions);
          }
          if (data?.playerComparison) {
            setPlayerComparison(data.playerComparison);
            if (!playerARef) setPlayerARef(data.playerComparison.playerA.ref);
            if (!playerBRef) setPlayerBRef(data.playerComparison.playerB.ref);
          }
          setLoading(false);
        },
      )
      .catch((err) => {
        void err;
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [disableLiveFetch, league, mode, playerARef, playerBRef]);

  const handleLeagueChange = (nextLeague: string) => {
    const found = catalog.find((c) => c.league === nextLeague);
    if (!found) return;
    setLeague(found.league);
    setTeamASlug(found.teams[0]?.slug ?? "");
    setTeamBSlug(found.teams[1]?.slug ?? found.teams[0]?.slug ?? "");
    setPlayerARef("");
    setPlayerBRef("");
  };

  const handleSwap = () => {
    if (mode === "equipos") {
      setTeamASlug(teamBSlug);
      setTeamBSlug(teamASlug);
    } else {
      setPlayerARef(playerBRef);
      setPlayerBRef(playerARef);
    }
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const nextMode: CompareMode = mode === "equipos" ? "jugadores" : "equipos";
    setMode(nextMode);
    const nextTabEl = document.getElementById(`${tabIdBase}-tab-${nextMode}`);
    nextTabEl?.focus();
  };

  const teamsForLeague = activeCatalog?.teams ?? [];

  return (
    <AtmosphereStage activePath="/app/comparar">
      <ClubWorkspaceShell activePath="/app/comparar">
        <div className="space-y-4 min-w-0" data-compare-hub="">
          {/* Cabecera + pestañas WAI-ARIA + selectores */}
          <section className="glass-card glass-ring rounded-3xl p-4 sm:p-6 space-y-4 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3 min-w-0">
              <div className="min-w-0">
                <h1 className="m-0 text-xl sm:text-2xl font-black tracking-tight">
                  Comparador H2H
                </h1>
                <p
                  className="m-0 text-xs sm:text-sm mt-1"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  Compara equipos cara a cara con historial real o contrasta jugadores por temporada.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 max-w-full">
                <button
                  type="button"
                  className="pl-btn-glass text-xs min-h-11 sm:min-h-9 px-3 inline-flex items-center gap-1.5"
                  aria-label="Compartir comparativa H2H en formato 9:16"
                  data-share-h2h-story=""
                  disabled={mode === "equipos" ? !teamComparison : !playerComparison}
                  onClick={() => {
                    if (mode === "equipos" && teamComparison) {
                      void shareH2hStoryCard({
                        leagueLabel: teamComparison.leagueLabel,
                        leftTitle: teamComparison.teamA.name,
                        rightTitle: teamComparison.teamB.name,
                        headline:
                          teamComparison.h2hSummary.played > 0
                            ? `H2H (${teamComparison.h2hSummary.played}): ${teamComparison.h2hSummary.winsA}G – ${teamComparison.h2hSummary.draws}E – ${teamComparison.h2hSummary.winsB}G`
                            : `Temporada ${teamComparison.seasonLabel}`,
                        rows: teamComparison.metrics.slice(0, 6).map((m) => ({
                          label: m.label,
                          leftValue: m.valueA,
                          rightValue: m.valueB,
                        })),
                      });
                    } else if (mode === "jugadores" && playerComparison) {
                      void shareH2hStoryCard({
                        leagueLabel: playerComparison.leagueLabel,
                        leftTitle: playerComparison.playerA.name,
                        rightTitle: playerComparison.playerB.name,
                        headline: `${playerComparison.playerA.teamName} vs ${playerComparison.playerB.teamName}`,
                        rows: playerComparison.metrics.slice(0, 6).map((m) => ({
                          label: m.label,
                          leftValue: m.valueA,
                          rightValue: m.valueB,
                        })),
                      });
                    }
                  }}
                >
                  <MaestroIcon name="share" size={13} />
                  <span className="num">9:16</span>
                </button>

                <div
                  className="seg-well max-w-full"
                  role="tablist"
                  aria-label="Modo de comparación"
                  onKeyDown={handleTabKeyDown}
                >
                  <button
                    id={`${tabIdBase}-tab-equipos`}
                    type="button"
                    role="tab"
                    aria-selected={mode === "equipos"}
                    aria-controls={`${tabIdBase}-panel-equipos`}
                    className={`seg-btn min-h-11 sm:min-h-9 px-3 ${mode === "equipos" ? "is-active" : ""}`.trim()}
                    onClick={() => setMode("equipos")}
                  >
                    Equipos H2H
                  </button>
                  <button
                    id={`${tabIdBase}-tab-jugadores`}
                    type="button"
                    role="tab"
                    aria-selected={mode === "jugadores"}
                    aria-controls={`${tabIdBase}-panel-jugadores`}
                    className={`seg-btn min-h-11 sm:min-h-9 px-3 ${mode === "jugadores" ? "is-active" : ""}`.trim()}
                    onClick={() => setMode("jugadores")}
                  >
                    Jugadores
                  </button>
                </div>
              </div>
            </div>

            <div className="pl-cmp-controls min-w-0">
              <div className="min-w-0">
                <label
                  htmlFor={`${tabIdBase}-league`}
                  className="block text-[11px] font-semibold mb-1"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  Liga / competencia
                </label>
                <PlSelect
                  id={`${tabIdBase}-league`}
                  ariaLabel="Seleccionar liga para comparar"
                  variant="field"
                  size="md"
                  fullWidth
                  popoverWidth="trigger"
                  triggerClassName="text-base sm:text-sm min-h-11"
                  value={league}
                  onChange={handleLeagueChange}
                  options={catalog.map((c) => {
                    const reg = c.region
                      ? LEAGUE_REGIONS.find((r) => r.key === c.region)
                      : undefined;
                    return {
                      value: c.league,
                      label: reg && catalog.length > 10 ? `${c.label} · ${reg.shortLabel}` : c.label,
                    };
                  })}
                />
              </div>

              {mode === "equipos" ? (
                <>
                  <div className="min-w-0">
                    <label
                      htmlFor={`${tabIdBase}-team-a`}
                      className="block text-[11px] font-semibold mb-1"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      Equipo A
                    </label>
                    <PlSelect
                      id={`${tabIdBase}-team-a`}
                      ariaLabel="Seleccionar primer equipo"
                      variant="field"
                      size="md"
                      fullWidth
                      popoverWidth="trigger"
                      triggerClassName="text-base sm:text-sm min-h-11"
                      value={teamASlug}
                      onChange={setTeamASlug}
                      options={teamsForLeague.map((t) => ({
                        value: t.slug,
                        label: t.rank ? `#${t.rank} · ${t.name}` : t.name,
                      }))}
                    />
                  </div>
                  <div className="flex items-end justify-center">
                    <button
                      type="button"
                      className="pl-btn-glass min-h-11 min-w-11 lg:min-h-10 w-full md:w-auto px-3 text-xs font-bold inline-flex items-center justify-center gap-1.5"
                      aria-label="Intercambiar lado A y lado B"
                      onClick={handleSwap}
                    >
                      <span aria-hidden="true">⇄</span>
                      <span className="md:hidden">Intercambiar</span>
                    </button>
                  </div>
                  <div className="min-w-0">
                    <label
                      htmlFor={`${tabIdBase}-team-b`}
                      className="block text-[11px] font-semibold mb-1"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      Equipo B
                    </label>
                    <PlSelect
                      id={`${tabIdBase}-team-b`}
                      ariaLabel="Seleccionar segundo equipo"
                      variant="field"
                      size="md"
                      fullWidth
                      popoverWidth="trigger"
                      triggerClassName="text-base sm:text-sm min-h-11"
                      value={teamBSlug}
                      onChange={setTeamBSlug}
                      options={teamsForLeague.map((t) => ({
                        value: t.slug,
                        label: t.rank ? `#${t.rank} · ${t.name}` : t.name,
                      }))}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="min-w-0">
                    <label
                      htmlFor={`${tabIdBase}-player-a`}
                      className="block text-[11px] font-semibold mb-1"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      Jugador A
                    </label>
                    <PlSelect
                      id={`${tabIdBase}-player-a`}
                      ariaLabel="Seleccionar primer jugador"
                      variant="field"
                      size="md"
                      fullWidth
                      popoverWidth="trigger"
                      triggerClassName="text-base sm:text-sm min-h-11"
                      value={playerARef}
                      onChange={setPlayerARef}
                      options={playerOptions.map((p) => ({
                        value: p.ref,
                        label: `${p.name} · ${p.teamName} (${p.positionLabel})`,
                      }))}
                    />
                  </div>
                  <div className="flex items-end justify-center">
                    <button
                      type="button"
                      className="pl-btn-glass min-h-11 min-w-11 lg:min-h-10 w-full md:w-auto px-3 text-xs font-bold inline-flex items-center justify-center gap-1.5"
                      aria-label="Intercambiar jugador A y jugador B"
                      onClick={handleSwap}
                    >
                      <span aria-hidden="true">⇄</span>
                      <span className="md:hidden">Intercambiar</span>
                    </button>
                  </div>
                  <div className="min-w-0">
                    <label
                      htmlFor={`${tabIdBase}-player-b`}
                      className="block text-[11px] font-semibold mb-1"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      Jugador B
                    </label>
                    <PlSelect
                      id={`${tabIdBase}-player-b`}
                      ariaLabel="Seleccionar segundo jugador"
                      variant="field"
                      size="md"
                      fullWidth
                      popoverWidth="trigger"
                      triggerClassName="text-base sm:text-sm min-h-11"
                      value={playerBRef}
                      onChange={setPlayerBRef}
                      options={playerOptions.map((p) => ({
                        value: p.ref,
                        label: `${p.name} · ${p.teamName} (${p.positionLabel})`,
                      }))}
                    />
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Panel Equipos H2H */}
          {mode === "equipos" ? (
            <div
              id={`${tabIdBase}-panel-equipos`}
              role="tabpanel"
              aria-labelledby={`${tabIdBase}-tab-equipos`}
              className="space-y-4 min-w-0"
            >
              {teamComparison ? (
                <>
                  <section className="glass-card glass-ring rounded-2xl p-4 sm:p-5 space-y-5 min-w-0">
                    <div className="pl-cmp-duel-head">
                      {[teamComparison.teamA, teamComparison.teamB].map((side, idx) => (
                        <div
                          key={side.slug}
                          className={`pl-cmp-side-card ${idx === 1 ? "is-right" : ""}`.trim()}
                        >
                          <a
                            href={side.href}
                            onClick={(e) => navigateOnPlainClick(e, side.href)}
                            className="flex items-center gap-3 no-underline min-w-0 w-full min-h-11"
                            style={{ color: "var(--pl-text)" }}
                          >
                            <span className="shrink-0">
                              <TeamBadge
                                league={teamComparison.league}
                                slug={side.slug}
                                name={side.name}
                                size={44}
                              />
                            </span>
                            <div className="min-w-0 flex-1">
                              <strong className="block text-base sm:text-lg font-extrabold truncate">
                                {side.name}
                              </strong>
                              <span
                                className="block text-xs num truncate"
                                style={{ color: "var(--pl-text-muted)" }}
                              >
                                {side.rank ? `#${side.rank} · ` : ""}
                                {side.recordLabel} · {side.pointsLabel}
                              </span>
                            </div>
                          </a>
                          {side.streak.length > 0 ? (
                            <div className="mt-2">
                              <FormSquares form={side.streak} size="sm" />
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3 min-w-0" aria-busy={loading ? "true" : undefined}>
                      {teamComparison.metrics.map((row) => (
                        <CompareBarRow
                          key={row.id}
                          row={row}
                          nameA={teamComparison.teamA.shortName}
                          nameB={teamComparison.teamB.shortName}
                        />
                      ))}
                    </div>
                  </section>

                  {/* Historial directo H2H */}
                  <section className="glass-card glass-ring rounded-2xl p-4 sm:p-5 space-y-3 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <h2 className="m-0 text-base font-extrabold">
                          Historial directo (H2H)
                        </h2>
                        <p
                          className="m-0 text-xs mt-0.5"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          Enfrentamientos registrados entre {teamComparison.teamA.shortName} y{" "}
                          {teamComparison.teamB.shortName} en nuestros snapshots y corpus verificados.
                        </p>
                      </div>
                      {teamComparison.h2hSummary.played > 0 ? (
                        <span className="pl-pill pl-pill--brand pl-pill--wrap text-xs num">
                          {teamComparison.teamA.shortName} {teamComparison.h2hSummary.winsA} · Empates{" "}
                          {teamComparison.h2hSummary.draws} · {teamComparison.teamB.shortName}{" "}
                          {teamComparison.h2hSummary.winsB}
                        </span>
                      ) : null}
                    </div>

                    {teamComparison.h2hSummary.played > 0 ? (
                      <div
                        className="flex h-[7px] w-full overflow-hidden rounded-full gap-1"
                        aria-hidden="true"
                      >
                        {teamComparison.h2hSummary.winsA > 0 ? (
                          <span
                            className="block h-full rounded-full"
                            style={{
                              flexGrow: teamComparison.h2hSummary.winsA,
                              background: "var(--pl-brand)",
                            }}
                          />
                        ) : null}
                        {teamComparison.h2hSummary.draws > 0 ? (
                          <span
                            className="block h-full rounded-full"
                            style={{
                              flexGrow: teamComparison.h2hSummary.draws,
                              background:
                                "color-mix(in oklab, var(--pl-text-muted) 38%, transparent)",
                            }}
                          />
                        ) : null}
                        {teamComparison.h2hSummary.winsB > 0 ? (
                          <span
                            className="block h-full rounded-full"
                            style={{
                              flexGrow: teamComparison.h2hSummary.winsB,
                              background: "var(--pl-success)",
                            }}
                          />
                        ) : null}
                      </div>
                    ) : null}

                    {teamComparison.h2hMatches.length === 0 ? (
                      <div className="pl-prematch-empty">
                        No hay enfrentamientos directos recientes registrados en la ventana actual entre ambos clubes.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {teamComparison.h2hMatches.map((m) => {
                          const rowBody = (
                            <>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                                <span className="shrink-0">
                                  <LeagueBadge
                                    league={teamComparison.league}
                                    label={teamComparison.leagueLabel}
                                    size={16}
                                  />
                                </span>
                                <span className="num" style={{ color: "var(--pl-text-muted)" }}>
                                  {m.dateLabel}
                                </span>
                                {m.round ? (
                                  <span
                                    className="truncate"
                                    style={{ color: "var(--pl-text-muted)" }}
                                  >
                                    · {m.round}
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold num min-w-0">
                                <span className="min-w-0 break-words">{m.homeName}</span>
                                <span className="pl-pill text-xs shrink-0 num">
                                  {m.homeScore} – {m.awayScore}
                                </span>
                                <span className="min-w-0 break-words">{m.awayName}</span>
                              </div>
                            </>
                          );

                          if (m.gameHref) {
                            const gameHref = m.gameHref;
                            return (
                              <a
                                key={m.id}
                                href={gameHref}
                                onClick={(e) => navigateOnPlainClick(e, gameHref)}
                                className="rounded-xl px-3.5 py-2.5 min-h-11 sm:min-h-9 flex flex-wrap items-center justify-between gap-2 text-xs no-underline min-w-0"
                                style={{
                                  background: "var(--pl-surface-elevated)",
                                  border: "1px solid var(--pl-row-rule)",
                                  color: "var(--pl-text)",
                                }}
                              >
                                {rowBody}
                              </a>
                            );
                          }

                          return (
                            <div
                              key={m.id}
                              className="rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs min-w-0"
                              style={{
                                background: "var(--pl-surface-elevated)",
                                border: "1px solid var(--pl-row-rule)",
                              }}
                            >
                              {rowBody}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </>
              ) : (
                <div
                  className="glass-card glass-ring rounded-2xl p-6 text-sm"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  Selecciona dos equipos distintos para generar la comparativa H2H.
                </div>
              )}
            </div>
          ) : (
            /* Panel Jugadores */
            <div
              id={`${tabIdBase}-panel-jugadores`}
              role="tabpanel"
              aria-labelledby={`${tabIdBase}-tab-jugadores`}
              className="space-y-4 min-w-0"
            >
              {playerComparison ? (
                <section className="glass-card glass-ring rounded-2xl p-4 sm:p-5 space-y-5 min-w-0">
                  <div className="pl-cmp-duel-head">
                    {[playerComparison.playerA, playerComparison.playerB].map((p, idx) => (
                      <div
                        key={p.ref}
                        className={`pl-cmp-side-card ${idx === 1 ? "is-right" : ""}`.trim()}
                      >
                        <a
                          href={p.href}
                          onClick={(e) => navigateOnPlainClick(e, p.href)}
                          className="flex items-center gap-3 no-underline min-w-0 w-full min-h-11"
                          style={{ color: "var(--pl-text)" }}
                        >
                          <span className="shrink-0">
                            <PersonAvatar
                              photoKey={p.photoKey}
                              fallbackPhotoKey={p.fallbackPhotoKey}
                              role="player"
                              size={56}
                            />
                          </span>
                          <div className="min-w-0 flex-1">
                            <strong className="block text-base sm:text-lg font-extrabold truncate">
                              {p.name}
                            </strong>
                            <span
                              className="block text-xs truncate num"
                              style={{ color: "var(--pl-text-muted)" }}
                            >
                              {p.teamName} · {p.positionLabel}
                              {p.jersey ? ` · #${p.jersey}` : ""}
                            </span>
                            <span
                              className="block text-[11px] num mt-0.5 truncate"
                              style={{ color: "var(--pl-text-muted)" }}
                            >
                              {[
                                p.age ? `${p.age} años` : null,
                                p.heightCm ? `${p.heightCm} cm` : null,
                                p.weightKg ? `${p.weightKg} kg` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </div>
                        </a>
                      </div>
                    ))}
                  </div>

                  {playerComparison.metrics.length > 0 ? (
                    <div className="space-y-3 min-w-0" aria-busy={loading ? "true" : undefined}>
                      {playerComparison.metrics.map((row) => (
                        <CompareBarRow
                          key={row.id}
                          row={row}
                          nameA={playerComparison.playerA.shortName}
                          nameB={playerComparison.playerB.shortName}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="pl-prematch-empty">
                      Todavía no hay métricas acumuladas en esta temporada para ambos jugadores.
                    </div>
                  )}
                </section>
              ) : (
                <div
                  className="glass-card glass-ring rounded-2xl p-6 text-sm"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  {loading
                    ? "Cargando nóminas de la liga..."
                    : "Selecciona dos jugadores para comparar su rendimiento de temporada."}
                </div>
              )}
            </div>
          )}
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
