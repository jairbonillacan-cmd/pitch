"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  canonicalGameHref,
  canonicalTeamHref,
  isLivePhaseActive,
  sportHasDraw,
  sportScoringUnit,
  type LeagueId,
  type LiveScoreboard,
  type LiveScoreboardEntry,
  type PlatformSport,
} from "@pitchlab/contracts";
import {
  resolveThemedPackSrcSet,
  resolveThemedPackUrl,
  usePackIconBase,
} from "../../../pack-icon-theme";
import { LeagueBadge, TeamBadge } from "../../../sports";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { PlSelect, type PlSelectOption } from "../../components/PlSelect";
import { AtmosphereStage, ClubWorkspaceShell } from "../../components/ShellChrome";
import { useLiveScoreboard } from "../../live/live-store";
import { resolveCircularCountryFlag } from "../../country-flags";
import {
  usePlatformActions,
  usePlatformCore,
  useWatchlistGameIds,
} from "../../platform-provider";
import { teamTopicKey, useFollowedTopics } from "../community-ui";
import { localizeInjuryLabelEs } from "../match/pre-match-logic";
import { PersonAvatar } from "./PersonAvatar";
import { resolveTeamVenueGeo, type TeamVenueGeo } from "./team-venues";
import { TeamSquadSection } from "./TeamSquadSection";
import type {
  TeamCoachInfo,
  TeamModelMetric,
  TeamProfileData,
  TeamRecentAverages,
  TeamStandingSummary,
  TeamVenueInfo,
} from "./types";

export * from "./types";
export * from "./PersonAvatar";
export * from "./team-venues";
export * from "./TeamSquadSection";
export * from "./PlayerProfileClubView";

export type TeamProfileTab = "resumen" | "estadisticas" | "plantilla" | "partidos";
type MainTeamTab = "resumen" | "estadisticas" | "plantilla";

export interface TeamProfileClubViewProps {
  profile: TeamProfileData;
  initialTab?: TeamProfileTab;
  liveBoardOverride?: LiveScoreboard | null;
}

const VENUE_SPLIT_OPTIONS: readonly PlSelectOption<"all" | "home" | "away">[] = [
  { value: "all", label: "Todos" },
  { value: "home", label: "En casa" },
  { value: "away", label: "De visita" },
];

function formatLiveClockLabel(entry?: LiveScoreboardEntry): string {
  if (!entry) return "En vivo";
  if (entry.phase === "halftime") return "Descanso";
  if (entry.phase === "penalties") return "Penales";
  const clk = entry.clock?.trim();
  if (clk) {
    return clk.endsWith("'") || /^[A-Za-z]/.test(clk) ? clk : `${clk}'`;
  }
  return "En vivo";
}

const ROOF_LABEL_ES: Readonly<Record<NonNullable<TeamVenueInfo["roofType"]>, string>> = {
  open: "Estadio a cielo abierto",
  retractable: "Techo retráctil",
  dome: "Domo techado",
  indoor_arena: "Arena cubierta",
};

const FORM_LABEL_ES: Readonly<Record<"G" | "E" | "P", string>> = {
  G: "Ganó",
  E: "Empató",
  P: "Perdió",
};

const SPORT_CRUMB_LABEL: Readonly<Record<PlatformSport, string>> = {
  football: "Fútbol",
  "american-football": "Fútbol americano",
  basketball: "Basquetbol",
  "ice-hockey": "Hockey",
  baseball: "Béisbol",
};

function formatCompactSlashDate(isoDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) return null;
  const [, yyyy, mm, dd] = match;
  return `${Number(dd)}/${Number(mm)}/${yyyy!.slice(2)}`;
}

function formatCountryCity(venueGeo: TeamVenueGeo | null): string {
  if (!venueGeo) return "";
  const raw = [venueGeo.country, venueGeo.city].filter((item): item is string => Boolean(item?.trim()));
  const deduped: string[] = [];
  for (const part of raw) {
    const clean = part.trim();
    if (!deduped.some((existing) => existing.toLowerCase() === clean.toLowerCase())) {
      deduped.push(clean);
    }
  }
  return deduped.join(" · ");
}

function FormDots({ streak }: { streak: Array<"G" | "E" | "P"> }): React.JSX.Element {
  return (
    <span
      className="pl-form"
      role="img"
      aria-label={`Racha reciente (${streak.length}): ${streak.map((r) => FORM_LABEL_ES[r]).join(", ")}`}
    >
      {streak.map((r, i) => (
        <span key={`${r}-${i}`} className={`pl-form-dot is-${r}`} aria-hidden="true">
          {r}
        </span>
      ))}
    </span>
  );
}

function metricAccentStyle(tone: TeamModelMetric["tone"]): React.CSSProperties {
  if (tone === "positive") return { color: "var(--pl-success)" };
  if (tone === "warning") return { color: "var(--pl-warning)" };
  if (tone === "brand") return { color: "var(--pl-brand)" };
  return { color: "var(--pl-text)" };
}

function TeamModelSection({
  section,
  upgradeHref,
  hasAccountSession,
  onNavigate,
}: {
  section: TeamProfileData["modelSection"];
  upgradeHref: string;
  hasAccountSession: boolean;
  onNavigate: (href: string) => void;
}): React.JSX.Element {
  return (
    <section
      className="glass-card glass-ring rounded-2xl p-5 space-y-4"
      data-team-model-section=""
      aria-labelledby="team-model-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <h2 id="team-model-heading" className="m-0 text-base sm:text-lg font-extrabold">
            Datos del modelo
          </h2>
          {section.sampleNote || section.updatedLabel ? (
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              {[section.sampleNote, section.updatedLabel ? `Corte ${section.updatedLabel}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </div>
        <span
          className="text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
          style={{ color: "var(--pl-text-muted)" }}
        >
          <MaestroIcon name="cpu" size={12} />
          <span>{section.engineLabel}</span>
        </span>
      </div>

      {section.locked ? (
        <div
          className="rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
          style={{ background: "var(--pl-surface-elevated)" }}
          data-team-model-locked=""
        >
          <div className="space-y-1 min-w-0">
            <p
              className="m-0 text-xs font-bold inline-flex items-center gap-1.5"
              style={{ color: "var(--pl-brand)" }}
            >
              <MaestroIcon name="lock" size={13} />
              <span>Exclusivo Pase PitchLab Ultra · Cero fuga</span>
            </p>
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
              Activa tu pase para consultar las métricas ajustadas por rival, eficiencia avanzada y fuerza relativa de este equipo.
            </p>
          </div>
          <a
            href={upgradeHref}
            onClick={(e) => {
              e.preventDefault();
              onNavigate(upgradeHref);
            }}
            className="pl-btn-accent text-xs min-h-11 px-4 inline-flex items-center gap-1.5 shrink-0"
          >
            <MaestroIcon name="unlock" size={13} />
            <span>{hasAccountSession ? "Activar Pase Ultra" : "Desbloquear 7d gratis"}</span>
          </a>
        </div>
      ) : section.unavailableReason || section.metrics.length === 0 ? (
        <div
          className="rounded-2xl p-4 text-xs"
          style={{ background: "var(--pl-surface-elevated)", color: "var(--pl-text-muted)" }}
          data-team-model-empty=""
        >
          {section.unavailableReason ??
            "Este corte aún no incluye métricas ajustadas del modelo para este equipo."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {section.metrics.map((m) => (
            <article
              key={m.id}
              className="rounded-2xl p-3.5 space-y-1"
              style={{ background: "var(--pl-surface-elevated)" }}
            >
              <span className="block text-[11px] font-semibold" style={{ color: "var(--pl-text-muted)" }}>
                {m.label}
              </span>
              <strong className="block num text-lg sm:text-xl font-extrabold" style={metricAccentStyle(m.tone)}>
                {m.value}
              </strong>
              {m.detail ? (
                <span className="block text-[11px] leading-snug" style={{ color: "var(--pl-text-secondary)" }}>
                  {m.detail}
                </span>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatRecordSummary(
  rec: { wins: number; draws: number; losses: number },
  includeDraws: boolean,
): string {
  return includeDraws || rec.draws > 0
    ? `${rec.wins}G - ${rec.draws}E - ${rec.losses}P`
    : `${rec.wins}G - ${rec.losses}P`;
}

/**
 * Resume métricas y encabezados de tabla según la lógica real del deporte
 * (puntos 3/2 en fútbol y hockey vs. porcentaje de victorias %V en NFL/NBA/MLB).
 */
function standingDisplayMeta(standing: TeamStandingSummary, sport: PlatformSport) {
  const usesPoints = sport === "football" || sport === "ice-hockey";
  const maxPtsPerGame = sport === "football" ? 3 : 2;
  const effRatio =
    standing.played > 0
      ? usesPoints
        ? standing.points / (standing.played * maxPtsPerGame)
        : (standing.won + 0.5 * standing.drawn) / standing.played
      : 0;
  const pctFormatted =
    standing.played > 0
      ? effRatio >= 1
        ? "1.000"
        : effRatio.toFixed(3).replace(/^0/, "")
      : "—";
  const effPctLabel =
    standing.played > 0
      ? usesPoints
        ? `${Math.round(effRatio * 100)} %`
        : `${(effRatio * 100).toFixed(1)} %`
      : "—";
  const otLosses = sport === "ice-hockey" ? Math.max(0, standing.points - standing.won * 2) : 0;
  const recordLabel = formatRecordSummary(
    { wins: standing.won, draws: standing.drawn, losses: standing.lost },
    sport === "football" || sport === "american-football",
  );
  const inlineSummary = usesPoints ? `${standing.points} pts` : `${recordLabel} (${pctFormatted})`;
  const effDetail =
    standing.played > 0
      ? usesPoints
        ? `${(standing.points / standing.played).toFixed(2)} pts/PJ`
        : `${pctFormatted} · ${recordLabel}`
      : null;
  const balanceLabel =
    sport === "baseball"
      ? "Balance de carreras"
      : sport === "basketball" || sport === "american-football"
        ? "Balance de puntos"
        : "Balance goleador";
  return {
    usesPoints,
    maxPtsPerGame,
    effRatio,
    pctFormatted,
    effPctLabel,
    otLosses,
    recordLabel,
    inlineSummary,
    effDetail,
    balanceLabel,
  };
}

function TeamAveragesCard({
  averages,
  sport,
}: {
  averages: TeamRecentAverages;
  sport: TeamProfileData["sport"];
}): React.JSX.Element {
  const unit = sportScoringUnit(sport);
  const hasDraw = sportHasDraw(sport);
  const dec = unit.decimals === 0 ? 1 : unit.decimals;

  return (
    <section
      className="glass-card glass-ring rounded-2xl p-5 space-y-4"
      data-team-averages-section=""
      aria-labelledby="team-averages-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="team-averages-heading" className="m-0 text-base sm:text-lg font-extrabold">
          Promedios recientes
        </h2>
        <span className="num text-xs font-medium" style={{ color: "var(--pl-text-muted)" }}>
          {averages.sampleGames > 0
            ? `Últimos ${averages.sampleGames} partidos`
            : "Sin muestra reciente"}
        </span>
      </div>

      {averages.sampleGames === 0 ? (
        <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
          No hay partidos finalizados en la ventana reciente para calcular promedios por partido.
        </p>
      ) : (
        <>
          {averages.streak.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span style={{ color: "var(--pl-text-muted)" }}>Racha reciente (más reciente a la derecha)</span>
              <FormDots streak={averages.streak} />
            </div>
          ) : null}

          <dl className="pl-ctx-stats">
            <div>
              <dt>A favor / partido</dt>
              <dd className="num">
                {averages.scoredAvg !== null ? averages.scoredAvg.toFixed(dec) : "—"}{" "}
                <small>{unit.short}/p</small>
              </dd>
            </div>
            <div>
              <dt>En contra / partido</dt>
              <dd className="num">
                {averages.concededAvg !== null ? averages.concededAvg.toFixed(dec) : "—"}{" "}
                <small>{unit.short}/p</small>
              </dd>
            </div>
            <div>
              <dt>Diferencial neto</dt>
              <dd
                className="num"
                style={{
                  color:
                    averages.marginAvg !== null && averages.marginAvg >= 0
                      ? "var(--pl-success)"
                      : "var(--pl-warning)",
                }}
              >
                {averages.marginAvg !== null
                  ? `${averages.marginAvg >= 0 ? "+" : ""}${averages.marginAvg.toFixed(dec)}`
                  : "—"}{" "}
                <small>{unit.short}/p</small>
              </dd>
            </div>
            {sport === "football" && averages.cleanSheets !== null ? (
              <div>
                <dt>Arco en cero</dt>
                <dd className="num">
                  {averages.cleanSheets}{" "}
                  <small>de {averages.sampleGames}</small>
                </dd>
              </div>
            ) : (
              <div>
                <dt>Balance ({averages.sampleGames} JJ)</dt>
                <dd className="num text-base">
                  {formatRecordSummary(averages, hasDraw)}
                </dd>
              </div>
            )}
          </dl>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div className="rounded-xl p-3 space-y-1" style={{ background: "var(--pl-surface-elevated)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">En casa</span>
                <span className="num" style={{ color: "var(--pl-text-muted)" }}>
                  {averages.homeRecord.games} JJ · {formatRecordSummary(averages.homeRecord, hasDraw)}
                </span>
              </div>
              <p className="m-0 num" style={{ color: "var(--pl-text-secondary)" }}>
                {averages.homeRecord.scoredAvg !== null
                  ? `${averages.homeRecord.scoredAvg.toFixed(dec)} a favor · ${averages.homeRecord.concededAvg?.toFixed(dec) ?? "—"} en contra`
                  : "Sin registros en casa dentro de esta ventana."}
              </p>
            </div>

            <div className="rounded-xl p-3 space-y-1" style={{ background: "var(--pl-surface-elevated)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">De visita</span>
                <span className="num" style={{ color: "var(--pl-text-muted)" }}>
                  {averages.awayRecord.games} JJ · {formatRecordSummary(averages.awayRecord, hasDraw)}
                </span>
              </div>
              <p className="m-0 num" style={{ color: "var(--pl-text-secondary)" }}>
                {averages.awayRecord.scoredAvg !== null
                  ? `${averages.awayRecord.scoredAvg.toFixed(dec)} a favor · ${averages.awayRecord.concededAvg?.toFixed(dec) ?? "—"} en contra`
                  : "Sin registros de visita dentro de esta ventana."}
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function TeamContextCard({
  leagueLabel,
  sport,
  backHref,
  standing,
  coach,
  venue,
  venueGeo,
  injuries,
  onNavigate,
}: {
  leagueLabel: string;
  sport: PlatformSport;
  backHref: string;
  standing: TeamStandingSummary | null;
  coach: TeamCoachInfo | null;
  venue: TeamVenueInfo | null;
  venueGeo: TeamVenueGeo | null;
  injuries: TeamProfileData["injuries"];
  onNavigate: (href: string) => void;
}): React.JSX.Element {
  const iconBase = usePackIconBase();
  const locationTrail = formatCountryCity(venueGeo);
  const effectiveStadium = venueGeo?.stadium ?? venue?.name ?? null;
  const coachFlag = coach
    ? resolveCircularCountryFlag(coach.nationality, coach.nationalityCode)
    : null;
  const standingCells = useMemo(() => {
    if (!standing) return [];
    const meta = standingDisplayMeta(standing, sport);
    const diffStr = standing.goalDiff > 0 ? `+${standing.goalDiff}` : standing.goalDiff;
    if (sport === "football") {
      return [
        { k: "PJ", v: standing.played },
        { k: "G", v: standing.won },
        { k: "E", v: standing.drawn },
        { k: "P", v: standing.lost },
        { k: "GF", v: standing.goalsFor },
        { k: "GC", v: standing.goalsAgainst },
        { k: "DG", v: diffStr },
        { k: "Pts", v: standing.points, bold: true },
      ];
    }
    if (sport === "ice-hockey") {
      return [
        { k: "PJ", v: standing.played },
        { k: "G", v: standing.won },
        { k: "P", v: standing.lost },
        { k: "TE", v: meta.otLosses },
        { k: "GF", v: standing.goalsFor },
        { k: "GC", v: standing.goalsAgainst },
        { k: "DG", v: diffStr },
        { k: "Pts", v: standing.points, bold: true },
      ];
    }
    const forKey = sport === "baseball" ? "CA" : "PF";
    const againstKey = sport === "baseball" ? "CC" : "PC";
    return [
      { k: "JJ", v: standing.played },
      { k: "G", v: standing.won },
      ...(sport === "american-football" ? [{ k: "E", v: standing.drawn }] : []),
      { k: "P", v: standing.lost },
      { k: forKey, v: standing.goalsFor },
      { k: againstKey, v: standing.goalsAgainst },
      { k: "Dif", v: diffStr },
      { k: "%V", v: meta.pctFormatted, bold: true },
    ];
  }, [standing, sport]);
  return (
    <section
      className="glass-card glass-ring rounded-2xl p-5 space-y-4"
      data-team-context-section=""
      aria-labelledby="team-context-heading"
    >
      <h2 id="team-context-heading" className="m-0 text-base sm:text-lg font-extrabold">
        Información del equipo
      </h2>

      {coach ? (
        <div
          className="flex items-center gap-3 rounded-xl p-3 text-xs"
          style={{ background: "var(--pl-surface-elevated)" }}
          data-team-coach-card=""
        >
          <PersonAvatar photoKey={coach.photoKey} role="coach" size={44} />
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-[13px] font-extrabold truncate">{coach.name}</strong>
              {coach.preferredFormation ? (
                <span className="pl-pill num text-[11px] font-bold">
                  {coach.preferredFormation}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2" style={{ color: "var(--pl-text-muted)" }}>
              <span>Entrenador</span>
              {coach.nationality ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    {coachFlag ? (
                      <img
                        src={resolveThemedPackUrl(coachFlag.src, iconBase)}
                        srcSet={resolveThemedPackSrcSet(coachFlag.srcSet, iconBase)}
                        alt=""
                        aria-hidden="true"
                        width={14}
                        height={14}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        className="pl-team-country-flag"
                        style={{ width: 14, height: 14 }}
                      />
                    ) : null}
                    <span>{coach.nationality}</span>
                  </span>
                </>
              ) : null}
              {coach.styleLabel ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{coach.styleLabel}</span>
                </>
              ) : null}
            </div>
            {coach.careerRecord && coach.careerRecord.matches > 0 ? (
              <div className="num text-[11px] pt-0.5" style={{ color: "var(--pl-text-secondary)" }}>
                Balance registrado: {coach.careerRecord.wins}G - {coach.careerRecord.draws}E -{" "}
                {coach.careerRecord.losses}P ({coach.careerRecord.matches} PJ
                {coach.careerRecord.winPct != null
                  ? ` · ${Math.round(coach.careerRecord.winPct)}% victorias`
                  : ""}
                )
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {standing ? (
        <div className="rounded-2xl p-3.5 space-y-2.5" style={{ background: "var(--pl-surface-elevated)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold">
              Posición en {leagueLabel}:{" "}
              <strong className="num" style={{ color: "var(--pl-brand)" }}>
                #{standing.rank} de {standing.totalTeams}
              </strong>
            </span>
            <a
              href={backHref}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(backHref);
              }}
              className="pl-team-link text-xs font-semibold inline-flex items-center gap-1 min-h-8"
              style={{ color: "var(--pl-brand)" }}
            >
              <span>Ver tabla</span>
              <MaestroIcon name="chevronRight" size={12} />
            </a>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 text-center num text-xs">
            {standingCells.map((cell) => (
              <div key={cell.k} className="py-1 px-1">
                <span className="block text-[10px]" style={{ color: "var(--pl-text-muted)" }}>
                  {cell.k}
                </span>
                <strong className={cell.bold ? "font-extrabold" : "font-bold"} style={cell.bold ? { color: "var(--pl-brand)" } : undefined}>
                  {cell.v}
                </strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2 text-xs">
        <div className="flex items-start gap-2.5 rounded-xl p-3" style={{ background: "var(--pl-surface-elevated)" }}>
          <MaestroIcon name="stadium" size={15} className="mt-0.5 shrink-0" />
          <div className="space-y-0.5 min-w-0">
            <span className="block font-bold">
              {effectiveStadium ?? "Sede oficial no disponible en este corte"}
            </span>
            {locationTrail ? (
              <span className="inline-flex items-center gap-1" style={{ color: "var(--pl-text-muted)" }}>
                <MaestroIcon name="pin" size={12} />
                <span>{locationTrail}</span>
              </span>
            ) : null}
            {venue?.elevationM != null || venue?.roofType ? (
              <span className="block num" style={{ color: "var(--pl-text-secondary)" }}>
                {[
                  venue.roofType ? ROOF_LABEL_ES[venue.roofType] : null,
                  venue.elevationM != null
                    ? `${Math.round(venue.elevationM).toLocaleString("es-MX")} m s.n.m.${venue.elevationM >= 1500 ? " (altitud elevada)" : ""}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-xs font-extrabold uppercase tracking-wide" style={{ color: "var(--pl-text-muted)" }}>
            Reporte de bajas
          </h3>
          <span className="pl-pill num text-[11px]">{injuries.length}</span>
        </div>

        {injuries.length === 0 ? (
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Sin bajas activas registradas en el reporte del corte vigente.
          </p>
        ) : (
          <ul className="m-0 p-0 list-none space-y-1.5" data-team-injuries-list="">
            {injuries.map((inj, idx) => (
              <li
                key={`${inj.player}-${idx}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs"
                style={{ background: "var(--pl-surface-elevated)" }}
              >
                <div className="min-w-0">
                  <strong className="font-bold">{inj.player}</strong>
                  {inj.position ? (
                    <span className="ml-1.5" style={{ color: "var(--pl-text-muted)" }}>
                      ({inj.position})
                    </span>
                  ) : null}
                  {inj.detail ? (
                    <span className="block text-[11px]" style={{ color: "var(--pl-text-secondary)" }}>
                      {localizeInjuryLabelEs(inj.detail)}
                    </span>
                  ) : null}
                </div>
                <span className="pl-pill pl-pill--warning shrink-0">{inj.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const RAIL_PAGE_SIZE = 6;
const MONTH_NAMES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

function monthTitleFromIso(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(isoDate.trim());
  if (!m) return "Jornada programada";
  const year = m[1];
  const monthIdx = Number(m[2]) - 1;
  return `${MONTH_NAMES_ES[monthIdx] ?? "Mes"} ${year}`;
}

function TeamStatsSection({
  standing,
  averages,
  sport,
}: {
  standing: TeamStandingSummary | null;
  averages: TeamRecentAverages;
  sport: TeamProfileData["sport"];
}): React.JSX.Element {
  const unit = sportScoringUnit(sport);
  const hasDraw = sportHasDraw(sport);
  const dec = unit.decimals === 0 ? 1 : unit.decimals;
  const maxPtsPerGame = hasDraw ? 3 : 2;

  interface StatsSplitRow {
    id: string;
    label: string;
    sublabel?: string;
    games: number;
    wins: number;
    draws: number;
    losses: number;
    scoredAvg: number | null;
    concededAvg: number | null;
    diffAvg: number | null;
    effPct: number | null;
  }

  const rows: StatsSplitRow[] = [];

  if (standing && standing.played > 0) {
    const gfAvg = standing.goalsFor / standing.played;
    const gaAvg = standing.goalsAgainst / standing.played;
    const stMeta = standingDisplayMeta(standing, sport);
    rows.push({
      id: "season",
      label: "Temporada completa",
      sublabel: stMeta.usesPoints
        ? `${standing.goalsFor}:${standing.goalsAgainst} ${unit.short} · ${standing.points} pts`
        : `${standing.goalsFor}:${standing.goalsAgainst} ${unit.short} · ${stMeta.pctFormatted}`,
      games: standing.played,
      wins: standing.won,
      draws: standing.drawn,
      losses: standing.lost,
      scoredAvg: gfAvg,
      concededAvg: gaAvg,
      diffAvg: gfAvg - gaAvg,
      effPct: Math.round(stMeta.effRatio * 100),
    });
  }

  const ratioForSample = (wins: number, draws: number, games: number): number | null => {
    if (games <= 0) return null;
    if (sport === "football") return Math.round(((wins * 3 + draws) / (games * 3)) * 100);
    return Math.round(((wins + 0.5 * draws) / games) * 100);
  };

  rows.push({
    id: "recent",
    label: averages.sampleGames > 0 ? `Últimos ${averages.sampleGames} partidos` : "Ventana reciente",
    sublabel:
      sport === "football" && averages.cleanSheets !== null && averages.sampleGames > 0
        ? `Arco en cero: ${averages.cleanSheets} de ${averages.sampleGames}`
        : undefined,
    games: averages.sampleGames,
    wins: averages.wins,
    draws: averages.draws,
    losses: averages.losses,
    scoredAvg: averages.scoredAvg,
    concededAvg: averages.concededAvg,
    diffAvg: averages.marginAvg,
    effPct: ratioForSample(averages.wins, averages.draws, averages.sampleGames),
  });

  for (const item of [
    { id: "home", label: "En casa", rec: averages.homeRecord },
    { id: "away", label: "De visita", rec: averages.awayRecord },
  ]) {
    const diff =
      item.rec.scoredAvg !== null && item.rec.concededAvg !== null
        ? item.rec.scoredAvg - item.rec.concededAvg
        : null;
    rows.push({
      id: item.id,
      label: item.label,
      games: item.rec.games,
      wins: item.rec.wins,
      draws: item.rec.draws,
      losses: item.rec.losses,
      scoredAvg: item.rec.scoredAvg,
      concededAvg: item.rec.concededAvg,
      diffAvg: diff,
      effPct: ratioForSample(item.rec.wins, item.rec.draws, item.rec.games),
    });
  }

  return (
    <section className="pl-team-stats-only" aria-label="Tabla unificada de estadísticas del equipo">
      <div className="pl-sq-region" tabIndex={0} role="region" aria-label="Desglose estadístico del equipo">
        <table className="pl-team-stats-table w-full text-left border-collapse text-xs num">
          <thead>
            <tr>
              <th scope="col" style={{ fontFamily: "var(--font-sans)" }}>
                Condición
              </th>
              <th scope="col" className="text-right">
                PJ
              </th>
              <th scope="col" className="text-right">
                G
              </th>
              {hasDraw ? (
                <th scope="col" className="text-right">
                  E
                </th>
              ) : null}
              <th scope="col" className="text-right">
                P
              </th>
              <th scope="col" className="text-right">
                A favor / p
              </th>
              <th scope="col" className="text-right">
                En contra / p
              </th>
              <th scope="col" className="text-right">
                Dif. / p
              </th>
              <th scope="col" className="text-right">
                Efectividad
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row" style={{ fontFamily: "var(--font-sans)" }}>
                  <span className="block font-bold text-[13px]" style={{ color: "var(--pl-text)" }}>
                    {row.label}
                  </span>
                  {row.sublabel ? (
                    <span className="block text-[11px] font-medium num" style={{ color: "var(--pl-text-muted)" }}>
                      {row.sublabel}
                    </span>
                  ) : null}
                </th>
                <td className="text-right font-bold">{row.games}</td>
                <td className="text-right">{row.games > 0 ? row.wins : "—"}</td>
                {hasDraw ? <td className="text-right">{row.games > 0 ? row.draws : "—"}</td> : null}
                <td className="text-right">{row.games > 0 ? row.losses : "—"}</td>
                <td className="text-right font-semibold">
                  {row.scoredAvg !== null ? `${row.scoredAvg.toFixed(dec)} ${unit.short}` : "—"}
                </td>
                <td className="text-right">
                  {row.concededAvg !== null ? `${row.concededAvg.toFixed(dec)} ${unit.short}` : "—"}
                </td>
                <td
                  className="text-right font-bold"
                  style={{
                    color:
                      row.diffAvg === null
                        ? "var(--pl-text-muted)"
                        : row.diffAvg > 0
                          ? "var(--pl-success)"
                          : row.diffAvg < 0
                            ? "var(--pl-danger)"
                            : "var(--pl-text-secondary)",
                  }}
                >
                  {row.diffAvg !== null
                    ? `${row.diffAvg > 0 ? "+" : ""}${row.diffAvg.toFixed(dec)}`
                    : "—"}
                </td>
                <td className="text-right font-extrabold" style={{ color: "var(--pl-brand)" }}>
                  {row.effPct !== null ? `${row.effPct}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Columna lateral compacta «Partidos» inspirada en marcadores editoriales:
 * - Cabecera «Partidos» + selector «Todos / En casa / De visita»
 * - Conmutador «Lista | Calendario»
 * - Píldoras «Finalizados | Próximos» + paginación «‹ ›»
 * - Subcabecera con emblema de liga y bandera de país + filas compactas con estrella
 */
function TeamMatchesRail({
  profile,
  venueGeo,
  forceRedacted,
  watchlistGameIds,
  onToggleWatchlist,
  onNavigate,
}: {
  profile: TeamProfileData;
  venueGeo: TeamVenueGeo | null;
  forceRedacted: boolean;
  watchlistGameIds: readonly string[];
  onToggleWatchlist: (gameId: string) => void;
  onNavigate: (href: string) => void;
}): React.JSX.Element {
  const [venueSplit, setVenueSplit] = useState<"all" | "home" | "away">("all");
  const [viewFormat, setViewFormat] = useState<"list" | "calendar">("list");
  const [statusMode, setStatusMode] = useState<"finished" | "upcoming">(
    profile.upcomingFixtures.length > 0 ? "upcoming" : "finished",
  );
  const [page, setPage] = useState<number>(0);
  const iconBase = usePackIconBase();

  const watchSet = useMemo(() => new Set<string>(watchlistGameIds), [watchlistGameIds]);

  const filteredUpcoming = useMemo(() => {
    if (venueSplit === "home") return profile.upcomingFixtures.filter((f) => f.isHome);
    if (venueSplit === "away") return profile.upcomingFixtures.filter((f) => !f.isHome);
    return profile.upcomingFixtures;
  }, [profile.upcomingFixtures, venueSplit]);

  const filteredFinished = useMemo(() => {
    if (venueSplit === "home") return profile.recentMatches.filter((m) => m.isHome);
    if (venueSplit === "away") return profile.recentMatches.filter((m) => !m.isHome);
    return profile.recentMatches;
  }, [profile.recentMatches, venueSplit]);

  const activeTotal = statusMode === "upcoming" ? filteredUpcoming.length : filteredFinished.length;
  const pageCount = Math.max(1, Math.ceil(activeTotal / RAIL_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const sliceStart = safePage * RAIL_PAGE_SIZE;

  const pagedUpcoming = filteredUpcoming.slice(sliceStart, sliceStart + RAIL_PAGE_SIZE);
  const pagedFinished = filteredFinished.slice(sliceStart, sliceStart + RAIL_PAGE_SIZE);

  const calendarGroups = useMemo(() => {
    const map = new Map<
      string,
      Array<{
        id: string;
        when: string;
        sub: string;
        opponentSlug: string;
        opponentName: string;
        isHome: boolean;
        badgeText: string;
        outcome: "G" | "E" | "P" | null;
        href: string | null;
      }>
    >();

    for (const f of filteredUpcoming) {
      const bucket = "Próxima jornada";
      const rows = map.get(bucket) ?? [];
      rows.push({
        id: `up-${f.id}`,
        when: f.dateLabel,
        sub: f.kickoffLocal || "—",
        opponentSlug: f.opponent.slug,
        opponentName: f.opponent.shortName || f.opponent.name,
        isHome: f.isHome,
        badgeText: f.kickoffLocal || "Por jugar",
        outcome: null,
        href: f.gameHref,
      });
      map.set(bucket, rows);
    }

    for (const m of filteredFinished) {
      const bucket = monthTitleFromIso(m.date);
      const rows = map.get(bucket) ?? [];
      rows.push({
        id: `ft-${m.id}`,
        when: formatCompactSlashDate(m.date) ?? m.dateLabel,
        sub: m.resultNote ? "TE" : "FT",
        opponentSlug: m.opponent.slug,
        opponentName: m.opponent.shortName || m.opponent.name,
        isHome: m.isHome,
        badgeText: `${m.teamScore} - ${m.opponentScore}`,
        outcome: m.outcome,
        href: m.gameHref,
      });
      map.set(bucket, rows);
    }

    return [...map.entries()];
  }, [filteredUpcoming, filteredFinished]);

  const teamShort = profile.team.shortName || profile.team.name;

  return (
    <section
      className="pl-tmr glass-card glass-ring"
      data-team-matches-section=""
      aria-label="Partidos del equipo"
    >
      <div className="pl-tmr-top">
        <div className="pl-tmr-head">
          <h2 className="pl-tmr-title">Partidos</h2>
          <PlSelect
            variant="glass"
            size="sm"
            ariaLabel="Filtrar partidos por localía"
            value={venueSplit}
            onChange={(next) => {
              setVenueSplit(next);
              setPage(0);
            }}
            options={VENUE_SPLIT_OPTIONS}
            className="pl-tmr-plselect"
          />
        </div>

        <div className="pl-tmr-seg" role="group" aria-label="Formato de vista de partidos">
          <button
            type="button"
            className={`pl-tmr-seg-btn ${viewFormat === "list" ? "is-on" : ""}`.trim()}
            aria-pressed={viewFormat === "list"}
            onClick={() => setViewFormat("list")}
          >
            Lista
          </button>
          <button
            type="button"
            className={`pl-tmr-seg-btn ${viewFormat === "calendar" ? "is-on" : ""}`.trim()}
            aria-pressed={viewFormat === "calendar"}
            onClick={() => setViewFormat("calendar")}
          >
            Calendario
          </button>
        </div>

        {viewFormat === "list" ? (
          <div className="pl-tmr-subbar">
            <div className="pl-tmr-pills" role="group" aria-label="Estado de los encuentros">
              <button
                type="button"
                className={`pl-tmr-pill ${statusMode === "finished" ? "is-on" : ""}`.trim()}
                aria-pressed={statusMode === "finished"}
                onClick={() => {
                  setStatusMode("finished");
                  setPage(0);
                }}
              >
                Finalizados
              </button>
              <button
                type="button"
                className={`pl-tmr-pill ${statusMode === "upcoming" ? "is-on" : ""}`.trim()}
                aria-pressed={statusMode === "upcoming"}
                onClick={() => {
                  setStatusMode("upcoming");
                  setPage(0);
                }}
              >
                Próximos
              </button>
            </div>

            <div className="pl-tmr-pager" role="group" aria-label="Paginación de partidos">
              <button
                type="button"
                className="pl-tmr-page-btn"
                aria-label="Página anterior"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <MaestroIcon name="chevronLeft" size={14} />
              </button>
              <button
                type="button"
                className="pl-tmr-page-btn"
                aria-label="Página siguiente"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                <MaestroIcon name="chevronRight" size={14} />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="pl-tmr-comp">
        <LeagueBadge league={profile.league} label={profile.leagueLabel} size={26} />
        <div className="min-w-0 flex-1">
          <strong className="pl-tmr-comp-name">{profile.leagueLabel}</strong>
          <span className="pl-tmr-comp-country">
            {venueGeo?.flagSrc ? (
              <img
                src={resolveThemedPackUrl(venueGeo.flagSrc, iconBase)}
                srcSet={resolveThemedPackSrcSet(venueGeo.flagSrcSet, iconBase)}
                alt=""
                aria-hidden="true"
                width={14}
                height={14}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="pl-tmr-comp-flag"
              />
            ) : (
              <MaestroIcon name="globe" size={12} />
            )}
            <span>{venueGeo?.country ?? "Internacional"}</span>
          </span>
        </div>
      </div>

      {viewFormat === "calendar" ? (
        <div className="pl-tmr-calendar">
          {calendarGroups.length === 0 ? (
            <p className="pl-tmr-empty">Sin encuentros bajo este filtro.</p>
          ) : (
            calendarGroups.map(([monthTitle, items]) => (
              <div key={monthTitle} className="pl-tmr-cal-group">
                <span className="pl-tmr-cal-heading">{monthTitle}</span>
                <ul className="pl-tmr-list" data-team-history-list="">
                  {items.map((item) => (
                    <li key={item.id} className="pl-tmr-cal-row">
                      <span className="pl-tmr-when num">
                        <span>{item.when}</span>
                        <small>{item.isHome ? "Local" : "Visita"}</small>
                      </span>
                      <div className="pl-tmr-cal-opp">
                        <TeamBadge
                          league={profile.league}
                          slug={item.opponentSlug}
                          name={item.opponentName}
                          size={18}
                        />
                        {item.href ? (
                          <a
                            href={item.href}
                            onClick={(e) => {
                              e.preventDefault();
                              onNavigate(item.href!);
                            }}
                            className="pl-team-link truncate font-semibold text-xs"
                          >
                            {item.opponentName}
                          </a>
                        ) : (
                          <span className="truncate font-semibold text-xs">{item.opponentName}</span>
                        )}
                      </div>
                      <span className={`pl-tmr-cal-score num ${item.outcome ? `is-${item.outcome}` : ""}`.trim()}>
                        {item.badgeText}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      ) : statusMode === "upcoming" ? (
        pagedUpcoming.length === 0 ? (
          <div className="pl-tmr-empty-box">
            <p className="pl-tmr-empty">Sin encuentros próximos en esta ventana.</p>
            {filteredFinished.length > 0 ? (
              <button
                type="button"
                className="pl-btn-glass text-xs min-h-9 px-3"
                onClick={() => {
                  setStatusMode("finished");
                  setPage(0);
                }}
              >
                Ver finalizados ({filteredFinished.length})
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="pl-tmr-list" data-team-history-list="">
            {pagedUpcoming.map((fix) => {
              const redacted = forceRedacted || fix.isRedacted;
              const winPct =
                !redacted && fix.hasForecast && fix.winProbability !== null
                  ? `${Math.round(fix.winProbability * 100)}%`
                  : null;
              const home = fix.isHome
                ? { slug: profile.team.slug, name: teamShort, hint: winPct }
                : { slug: fix.opponent.slug, name: fix.opponent.shortName || fix.opponent.name, hint: null };
              const away = fix.isHome
                ? { slug: fix.opponent.slug, name: fix.opponent.shortName || fix.opponent.name, hint: null }
                : { slug: profile.team.slug, name: teamShort, hint: winPct };
              const starred = watchSet.has(fix.id);

              return (
                <li key={fix.id} className="pl-tmr-row">
                  <div className="pl-tmr-when num">
                    <span>{fix.dateLabel}</span>
                    <strong>{fix.kickoffLocal || "-"}</strong>
                  </div>

                  <a
                    href={fix.gameHref}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate(fix.gameHref);
                    }}
                    className="pl-tmr-teams"
                    aria-label={`${home.name} contra ${away.name}, ${fix.dateLabel}`}
                  >
                    <span className="pl-tmr-team-line">
                      <TeamBadge league={profile.league} slug={home.slug} name={home.name} size={16} />
                      <span className="pl-tmr-team-name truncate">{home.name}</span>
                      {home.hint ? <span className="pl-tmr-prob num">{home.hint}</span> : null}
                    </span>
                    <span className="pl-tmr-team-line">
                      <TeamBadge league={profile.league} slug={away.slug} name={away.name} size={16} />
                      <span className="pl-tmr-team-name truncate">{away.name}</span>
                      {away.hint ? <span className="pl-tmr-prob num">{away.hint}</span> : null}
                    </span>
                  </a>

                  <button
                    type="button"
                    className={`pl-tmr-star ${starred ? "is-on" : ""}`.trim()}
                    aria-pressed={starred}
                    aria-label={starred ? "Quitar partido de favoritos" : "Guardar partido en favoritos"}
                    onClick={() => onToggleWatchlist(fix.id)}
                  >
                    <MaestroIcon name="star" size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : pagedFinished.length === 0 ? (
        <p className="pl-tmr-empty">Sin partidos finalizados bajo este filtro.</p>
      ) : (
        <ul className="pl-tmr-list" data-team-history-list="">
          {pagedFinished.map((m) => {
            const home = m.isHome
              ? { slug: profile.team.slug, name: teamShort, score: m.teamScore }
              : { slug: m.opponent.slug, name: m.opponent.shortName || m.opponent.name, score: m.opponentScore };
            const away = m.isHome
              ? { slug: m.opponent.slug, name: m.opponent.shortName || m.opponent.name, score: m.opponentScore }
              : { slug: profile.team.slug, name: teamShort, score: m.teamScore };
            const homeWon = home.score > away.score;
            const awayWon = away.score > home.score;
            const starred = watchSet.has(m.id);

            const content = (
              <>
                <span className="pl-tmr-team-line">
                  <TeamBadge league={profile.league} slug={home.slug} name={home.name} size={16} />
                  <span className={`pl-tmr-team-name truncate ${homeWon ? "is-strong" : "is-dim"}`}>
                    {home.name}
                  </span>
                  <strong className={`pl-tmr-score num ${homeWon ? "is-strong" : "is-dim"}`}>
                    {home.score}
                  </strong>
                </span>
                <span className="pl-tmr-team-line">
                  <TeamBadge league={profile.league} slug={away.slug} name={away.name} size={16} />
                  <span className={`pl-tmr-team-name truncate ${awayWon ? "is-strong" : "is-dim"}`}>
                    {away.name}
                  </span>
                  <strong className={`pl-tmr-score num ${awayWon ? "is-strong" : "is-dim"}`}>
                    {away.score}
                  </strong>
                </span>
              </>
            );

            return (
              <li key={m.id} className="pl-tmr-row">
                <div className="pl-tmr-when num">
                  <span>{formatCompactSlashDate(m.date) ?? m.dateLabel}</span>
                  <strong>{m.resultNote ? "TE" : "FT"}</strong>
                </div>

                {m.gameHref ? (
                  <a
                    href={m.gameHref}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate(m.gameHref!);
                    }}
                    className="pl-tmr-teams"
                    aria-label={`${home.name} ${home.score} - ${away.score} ${away.name}`}
                  >
                    {content}
                  </a>
                ) : (
                  <div className="pl-tmr-teams">{content}</div>
                )}

                <button
                  type="button"
                  className={`pl-tmr-star ${starred ? "is-on" : ""}`.trim()}
                  aria-pressed={starred}
                  aria-label={starred ? "Quitar partido de favoritos" : "Guardar partido en favoritos"}
                  onClick={() => onToggleWatchlist(m.id)}
                >
                  <MaestroIcon name="star" size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function TeamProfileClubView({
  profile,
  initialTab = "resumen",
  liveBoardOverride,
}: TeamProfileClubViewProps): React.JSX.Element {
  const { dataset, viewerRole, hasAccountSession, upgradeHref } = usePlatformCore();
  const { toggleWatchlistGame, navigateTo } = usePlatformActions();
  const watchlistGameIds = useWatchlistGameIds();
  const { topics, toggleTeam } = useFollowedTopics();
  const teamKey = teamTopicKey(profile.league, profile.team.slug);
  const isFollowingTeam = topics.teams.includes(teamKey);
  const iconBase = usePackIconBase();
  const liveSnap = useLiveScoreboard(liveBoardOverride === undefined);
  const liveBoard = liveBoardOverride !== undefined ? liveBoardOverride : liveSnap.data;
  const hasSquad = Boolean(profile.squad && profile.squad.players.length > 0);
  const resolvedInitialTab: MainTeamTab =
    initialTab === "estadisticas"
      ? "estadisticas"
      : initialTab === "plantilla"
        ? "plantilla"
        : "resumen";
  const [activeTab, setActiveTab] = useState<MainTeamTab>(resolvedInitialTab);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const unit = sportScoringUnit(profile.sport);
  const hasDraw = sportHasDraw(profile.sport);
  const dec = unit.decimals === 0 ? 1 : unit.decimals;

  const isVisitorRestricted = viewerRole === "visitor";
  const effectiveModelSection =
    isVisitorRestricted && !profile.modelSection.locked
      ? { ...profile.modelSection, locked: true, metrics: [] }
      : profile.modelSection;

  const selectTab = (nextTab: MainTeamTab) => {
    setActiveTab(nextTab);
    if (typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", nextTab);
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      } catch (err) {
        console.warn("[team-profile] no se pudo actualizar ?tab en la URL:", err);
      }
    }
  };

  const tabs: ReadonlyArray<{ id: MainTeamTab; label: string; count?: number }> = [
    { id: "resumen", label: "Resumen" },
    { id: "estadisticas", label: "Estadísticas" },
    {
      id: "plantilla",
      label: "Plantilla",
      count: hasSquad && profile.squad ? profile.squad.players.length : undefined,
    },
  ];

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let nextIdx = idx;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = tabs.length - 1;
    else return;

    e.preventDefault();
    const target = tabs[nextIdx];
    if (target) {
      selectTab(target.id);
      tabRefs.current[nextIdx]?.focus();
    }
  };

  const leagueHref = `/app/${profile.league}`;
  const standingsHref = `/app/${profile.league}?vista=tabla`;

  const liveMatchInfo = useMemo(() => {
    const entriesById = new Map<string, LiveScoreboardEntry>();
    if (liveBoard) {
      for (const e of liveBoard.entries) {
        entriesById.set(e.gameId, e);
      }
    }

    for (const g of dataset.games) {
      const involvesTeam =
        g.home.slug === profile.team.slug || g.away.slug === profile.team.slug;
      if (!involvesTeam) continue;
      const entry = entriesById.get(g.id);
      const activeLive =
        (entry ? isLivePhaseActive(entry.phase) : false) || String(g.status) === "LIVE";
      if (!activeLive) continue;
      return {
        id: g.id,
        league: g.league as LeagueId,
        leagueLabel: g.leagueLabel,
        gameHref: canonicalGameHref(g.league, g),
        kickoffLocal: g.kickoffLocal,
        clockLabel: formatLiveClockLabel(entry),
        home: {
          slug: g.home.slug,
          name: g.home.name,
          shortName: g.home.shortName || g.home.name,
          score: entry?.score?.home ?? g.score?.home ?? 0,
        },
        away: {
          slug: g.away.slug,
          name: g.away.name,
          shortName: g.away.shortName || g.away.name,
          score: entry?.score?.away ?? g.score?.away ?? 0,
        },
      };
    }

    for (const fix of profile.upcomingFixtures) {
      const entry = entriesById.get(fix.id);
      if (!entry || !isLivePhaseActive(entry.phase)) continue;
      const teamSide = {
        slug: profile.team.slug,
        name: profile.team.name,
        shortName: profile.team.shortName || profile.team.name,
      };
      const oppSide = {
        slug: fix.opponent.slug,
        name: fix.opponent.name,
        shortName: fix.opponent.shortName || fix.opponent.name,
      };
      const homeBase = fix.isHome ? teamSide : oppSide;
      const awayBase = fix.isHome ? oppSide : teamSide;
      return {
        id: fix.id,
        league: profile.league,
        leagueLabel: profile.leagueLabel,
        gameHref: fix.gameHref,
        kickoffLocal: fix.kickoffLocal,
        clockLabel: formatLiveClockLabel(entry),
        home: { ...homeBase, score: entry.score?.home ?? 0 },
        away: { ...awayBase, score: entry.score?.away ?? 0 },
      };
    }

    return null;
  }, [dataset.games, liveBoard, profile.league, profile.leagueLabel, profile.team, profile.upcomingFixtures]);

  const lastMatch = profile.recentMatches[0] ?? null;
  const nextUpcoming =
    profile.upcomingFixtures.find((f) => f.id !== liveMatchInfo?.id) ?? null;
  const venueGeo = resolveTeamVenueGeo(
    profile.league,
    profile.team.slug,
    profile.team.name,
    profile.venue?.name,
  );
  const venueLocationTrail = formatCountryCity(venueGeo);
  const resolvedStadiumName = venueGeo?.stadium ?? profile.venue?.name ?? null;
  const coachInfo: TeamCoachInfo | null =
    profile.squad?.coach ??
    (profile.squad?.coachName?.trim() ? { name: profile.squad.coachName.trim() } : null);
  const coachName = coachInfo?.name?.trim() || null;
  const showShortNameInTag =
    Boolean(profile.team.shortName) &&
    profile.team.shortName.trim().toLowerCase() !== (venueGeo?.country ?? "").trim().toLowerCase();

  const lastMatchSides = lastMatch
    ? (() => {
        const home = lastMatch.isHome
          ? {
              slug: profile.team.slug,
              name: profile.team.name,
              shortName: profile.team.shortName || profile.team.name,
              score: lastMatch.teamScore,
            }
          : {
              slug: lastMatch.opponent.slug,
              name: lastMatch.opponent.name,
              shortName: lastMatch.opponent.shortName || lastMatch.opponent.name,
              score: lastMatch.opponentScore,
            };
        const away = lastMatch.isHome
          ? {
              slug: lastMatch.opponent.slug,
              name: lastMatch.opponent.name,
              shortName: lastMatch.opponent.shortName || lastMatch.opponent.name,
              score: lastMatch.opponentScore,
            }
          : {
              slug: profile.team.slug,
              name: profile.team.name,
              shortName: profile.team.shortName || profile.team.name,
              score: lastMatch.teamScore,
            };
        return {
          home,
          away,
          homeWon: home.score > away.score,
          awayWon: away.score > home.score,
          whenTop: formatCompactSlashDate(lastMatch.date) ?? lastMatch.dateLabel,
          whenSub: lastMatch.resultNote ? "TE" : "FT",
        };
      })()
    : null;

  const nextMatchSides = nextUpcoming
    ? (() => {
        const canShowWinProb =
          !isVisitorRestricted &&
          !nextUpcoming.isRedacted &&
          nextUpcoming.hasForecast &&
          nextUpcoming.winProbability !== null;
        const teamWinPct = canShowWinProb
          ? `${Math.round(nextUpcoming.winProbability! * 100)}%`
          : null;
        const home = nextUpcoming.isHome
          ? {
              slug: profile.team.slug,
              name: profile.team.name,
              shortName: profile.team.shortName || profile.team.name,
              probLabel: teamWinPct,
            }
          : {
              slug: nextUpcoming.opponent.slug,
              name: nextUpcoming.opponent.name,
              shortName: nextUpcoming.opponent.shortName || nextUpcoming.opponent.name,
              probLabel: null,
            };
        const away = nextUpcoming.isHome
          ? {
              slug: nextUpcoming.opponent.slug,
              name: nextUpcoming.opponent.name,
              shortName: nextUpcoming.opponent.shortName || nextUpcoming.opponent.name,
              probLabel: null,
            }
          : {
              slug: profile.team.slug,
              name: profile.team.name,
              shortName: profile.team.shortName || profile.team.name,
              probLabel: teamWinPct,
            };
        return { home, away };
      })()
    : null;

  return (
    <AtmosphereStage activePath={canonicalTeamHref(profile.league, profile.team.slug)}>
      <ClubWorkspaceShell activePath={canonicalTeamHref(profile.league, profile.team.slug)}>
        {/* Ruta superior estilo editorial deportivo */}
        <nav aria-label="Ruta del equipo" className="pl-team-crumb">
          <ol className="pl-team-crumb-list">
            <li>
              <a
                href="/app"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/app");
                }}
                className="pl-team-crumb-link"
              >
                {SPORT_CRUMB_LABEL[profile.sport]}
              </a>
            </li>
            {venueGeo?.country ? (
              <>
                <li aria-hidden="true" className="pl-team-crumb-sep">
                  ▸
                </li>
                <li className="pl-team-crumb-text">{venueGeo.country}</li>
              </>
            ) : null}
            <li aria-hidden="true" className="pl-team-crumb-sep">
              ▸
            </li>
            <li>
              <a
                href={leagueHref}
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo(leagueHref);
                }}
                className="pl-team-crumb-link"
              >
                {profile.leagueLabel}
              </a>
            </li>
            <li aria-hidden="true" className="pl-team-crumb-sep hidden sm:inline">
              ▸
            </li>
            <li aria-current="page" className="pl-team-crumb-current hidden sm:inline truncate">
              Resultados, partidos, clasificación y estadísticas de {profile.team.shortName || profile.team.name}
            </li>
          </ol>
        </nav>

        {/* Cabecera Hero del Equipo: escudo limpio + identidad + partido anterior/siguiente + KPIs */}
        <section
          className="pl-team-hero glass-card glass-ring rounded-3xl p-5 sm:p-6"
          data-team-hero={profile.team.slug}
        >
          <div className="pl-team-hero-grid">
            {/* Izquierda: escudo limpio, nombre, país, entrenador/código, racha y sede/liga */}
            <div className="pl-team-hero-identity">
              <div className="pl-team-hero-head">
                <span className="pl-team-hero-crest">
                  <TeamBadge
                    league={profile.league}
                    slug={profile.team.slug}
                    name={profile.team.name}
                    size={84}
                  />
                </span>

                <div className="pl-team-hero-copy">
                  <div className="pl-team-title-row">
                    <h1 className="pl-team-hero-title">
                      {profile.team.name}
                    </h1>
                    <button
                      type="button"
                      className={`pl-fav-star-btn ${isFollowingTeam ? "is-active" : ""}`.trim()}
                      aria-pressed={isFollowingTeam}
                      data-follow-team-btn=""
                      onClick={() => toggleTeam(teamKey)}
                    >
                      <span aria-hidden="true">{isFollowingTeam ? "★" : "☆"}</span>
                      <span>{isFollowingTeam ? "Siguiendo" : "Seguir"}</span>
                    </button>
                    {profile.standing ? (
                      <span className="pl-team-standing-inline num">
                        <MaestroIcon name="standings" size={15} />
                        <span>
                          <strong>#{profile.standing.rank}</strong> de {profile.standing.totalTeams} ·{" "}
                          {standingDisplayMeta(profile.standing, profile.sport).inlineSummary}
                        </span>
                      </span>
                    ) : profile.recentAverages.sampleGames > 0 ? (
                      <span className="pl-team-standing-inline num">
                        <MaestroIcon name="standings" size={15} />
                        <span>
                          <strong>{formatRecordSummary(profile.recentAverages, hasDraw)}</strong> · últ. {profile.recentAverages.sampleGames}
                        </span>
                      </span>
                    ) : null}
                  </div>

                  <div className="pl-team-hero-subrow">
                    {venueGeo?.country ? (
                      <span className="pl-team-country-chip">
                        {venueGeo.flagSrc ? (
                          <img
                            src={resolveThemedPackUrl(venueGeo.flagSrc, iconBase)}
                            srcSet={resolveThemedPackSrcSet(venueGeo.flagSrcSet, iconBase)}
                            alt=""
                            aria-hidden="true"
                            width={20}
                            height={20}
                            loading="lazy"
                            decoding="async"
                            draggable={false}
                            className="pl-team-country-flag"
                          />
                        ) : (
                          <MaestroIcon name="globe" size={15} />
                        )}
                        <span>{venueGeo.country}</span>
                      </span>
                    ) : null}

                    <span className="pl-team-coach-chip" data-coach-registered={coachName ? "true" : "false"}>
                      <PersonAvatar
                        photoKey={coachInfo?.photoKey}
                        role="coach"
                        size={30}
                        className="pl-team-coach-avatar"
                      />
                      <span className="pl-team-coach-copy">
                        <strong>{coachName ?? "Sin registro"}</strong>
                        <small>
                          Entrenador
                          {coachInfo?.preferredFormation ? ` · ${coachInfo.preferredFormation}` : ""}
                        </small>
                      </span>
                    </span>

                    <span className="pl-team-code-tag">
                      {showShortNameInTag ? (
                        <>
                          {profile.team.shortName} · <strong className="num">{profile.team.code}</strong>
                        </>
                      ) : (
                        <strong className="num">{profile.team.code}</strong>
                      )}
                    </span>
                  </div>

                  {profile.recentAverages.streak.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs pt-0.5">
                      <span style={{ color: "var(--pl-text-muted)" }}>Racha:</span>
                      <FormDots streak={profile.recentAverages.streak} />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="pl-team-hero-meta">
                {venueLocationTrail || resolvedStadiumName ? (
                  <span className="pl-team-hero-location">
                    {venueLocationTrail ? (
                      <span className="pl-team-location-trail">
                        <MaestroIcon name="pin" size={13} />
                        <span>{venueLocationTrail}</span>
                      </span>
                    ) : null}
                    {venueLocationTrail && resolvedStadiumName ? (
                      <span className="pl-team-location-sep" aria-hidden="true">·</span>
                    ) : null}
                    {resolvedStadiumName ? (
                      <span className="pl-team-stadium-tag">
                        <MaestroIcon name="stadium" size={15} />
                        <span>{resolvedStadiumName}</span>
                      </span>
                    ) : null}
                  </span>
                ) : null}

                <a
                  href={leagueHref}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo(leagueHref);
                  }}
                  className="pl-team-hero-meta-item pl-team-hero-meta-link"
                >
                  <LeagueBadge league={profile.league} label={profile.leagueLabel} size={17} />
                  <span>
                    {profile.leagueLabel}
                    {profile.seasonLabel ? ` · ${profile.seasonLabel}` : ""}
                  </span>
                </a>
              </div>
            </div>

            {/* Derecha: acción superior + Partido anterior y Partido siguiente */}
            <div className="pl-team-hero-side">
              <div className="pl-team-hero-actions">
                <span className="pl-team-updated-text num">
                  Actualizado {profile.updatedAt}
                </span>
                <a
                  href={standingsHref}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo(standingsHref);
                  }}
                  className="pl-team-compare-btn"
                >
                  <MaestroIcon name="sliders" size={13} />
                  <span>{profile.standing ? "Tabla y liga" : `Ver ${profile.leagueLabel}`}</span>
                </a>
                <a
                  href={`/app/comparar?modo=equipos&liga=${profile.league}&a=${profile.team.slug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo(
                      `/app/comparar?modo=equipos&liga=${profile.league}&a=${profile.team.slug}`,
                    );
                  }}
                  className="pl-btn-glass text-xs min-h-11 lg:min-h-9 px-3 inline-flex items-center gap-1.5 no-underline"
                >
                  <MaestroIcon name="chart" size={13} />
                  <span>Comparar</span>
                </a>
              </div>

              <div className="pl-team-hero-matches">
                {/* Cuando el equipo juega en vivo: tarjeta En Vivo (Imagen 3) en lugar de Partido anterior (o junto a Partido siguiente) */}
                {liveMatchInfo ? (
                  <div className="pl-team-mini-col" data-team-live-slot="">
                    <span className="pl-team-mini-heading is-live">En Vivo</span>
                    <a
                      href={liveMatchInfo.gameHref}
                      onClick={(e) => {
                        e.preventDefault();
                        navigateTo(liveMatchInfo.gameHref);
                      }}
                      className="pl-team-mini-card is-link is-live"
                      aria-label={`En vivo (${liveMatchInfo.clockLabel}): ${liveMatchInfo.home.shortName} ${liveMatchInfo.home.score} - ${liveMatchInfo.away.score} ${liveMatchInfo.away.shortName}`}
                    >
                      <div className="pl-team-mini-head">
                        <LeagueBadge league={liveMatchInfo.league} label={liveMatchInfo.leagueLabel} size={15} />
                        <span className="truncate">{liveMatchInfo.leagueLabel}</span>
                      </div>
                      <div className="pl-team-mini-body">
                        <div className="pl-team-mini-when num">
                          <span>{liveMatchInfo.kickoffLocal}</span>
                          <strong className="is-live">{liveMatchInfo.clockLabel}</strong>
                        </div>
                        <div className="pl-team-mini-teams">
                          <div className="pl-team-mini-team">
                            <TeamBadge
                              league={liveMatchInfo.league}
                              slug={liveMatchInfo.home.slug}
                              name={liveMatchInfo.home.name}
                              size={18}
                            />
                            <span className="truncate is-strong">
                              {liveMatchInfo.home.shortName}
                            </span>
                            <strong className="num is-live">
                              {liveMatchInfo.home.score}
                            </strong>
                          </div>
                          <div className="pl-team-mini-team">
                            <TeamBadge
                              league={liveMatchInfo.league}
                              slug={liveMatchInfo.away.slug}
                              name={liveMatchInfo.away.name}
                              size={18}
                            />
                            <span className="truncate is-strong">
                              {liveMatchInfo.away.shortName}
                            </span>
                            <strong className="num is-live">
                              {liveMatchInfo.away.score}
                            </strong>
                          </div>
                        </div>
                      </div>
                    </a>
                  </div>
                ) : (
                  /* Tarjeta 1: Partido anterior */
                  <div className="pl-team-mini-col">
                    <span className="pl-team-mini-heading">Partido anterior</span>
                    {lastMatch && lastMatchSides ? (
                      lastMatch.gameHref ? (
                        <a
                          href={lastMatch.gameHref}
                          onClick={(e) => {
                            e.preventDefault();
                            navigateTo(lastMatch.gameHref!);
                          }}
                          className="pl-team-mini-card is-link"
                          aria-label={`Partido anterior: ${lastMatchSides.home.shortName} ${lastMatchSides.home.score} - ${lastMatchSides.away.score} ${lastMatchSides.away.shortName}`}
                        >
                          <div className="pl-team-mini-head">
                            <LeagueBadge league={profile.league} label={profile.leagueLabel} size={15} />
                            <span className="truncate">{profile.leagueLabel}</span>
                          </div>
                          <div className="pl-team-mini-body">
                            <div className="pl-team-mini-when num">
                              <span>{lastMatchSides.whenTop}</span>
                              <strong>{lastMatchSides.whenSub}</strong>
                            </div>
                            <div className="pl-team-mini-teams">
                              <div className="pl-team-mini-team">
                                <TeamBadge
                                  league={profile.league}
                                  slug={lastMatchSides.home.slug}
                                  name={lastMatchSides.home.name}
                                  size={18}
                                />
                                <span className={`truncate ${lastMatchSides.homeWon ? "is-strong" : "is-dim"}`}>
                                  {lastMatchSides.home.shortName}
                                </span>
                                <strong className={`num ${lastMatchSides.homeWon ? "is-strong" : "is-dim"}`}>
                                  {lastMatchSides.home.score}
                                </strong>
                              </div>
                              <div className="pl-team-mini-team">
                                <TeamBadge
                                  league={profile.league}
                                  slug={lastMatchSides.away.slug}
                                  name={lastMatchSides.away.name}
                                  size={18}
                                />
                                <span className={`truncate ${lastMatchSides.awayWon ? "is-strong" : "is-dim"}`}>
                                  {lastMatchSides.away.shortName}
                                </span>
                                <strong className={`num ${lastMatchSides.awayWon ? "is-strong" : "is-dim"}`}>
                                  {lastMatchSides.away.score}
                                </strong>
                              </div>
                            </div>
                          </div>
                        </a>
                      ) : (
                        <div className="pl-team-mini-card">
                          <div className="pl-team-mini-head">
                            <LeagueBadge league={profile.league} label={profile.leagueLabel} size={15} />
                            <span className="truncate">{profile.leagueLabel}</span>
                          </div>
                          <div className="pl-team-mini-body">
                            <div className="pl-team-mini-when num">
                              <span>{lastMatchSides.whenTop}</span>
                              <strong>{lastMatchSides.whenSub}</strong>
                            </div>
                            <div className="pl-team-mini-teams">
                              <div className="pl-team-mini-team">
                                <TeamBadge
                                  league={profile.league}
                                  slug={lastMatchSides.home.slug}
                                  name={lastMatchSides.home.name}
                                  size={18}
                                />
                                <span className={`truncate ${lastMatchSides.homeWon ? "is-strong" : "is-dim"}`}>
                                  {lastMatchSides.home.shortName}
                                </span>
                                <strong className={`num ${lastMatchSides.homeWon ? "is-strong" : "is-dim"}`}>
                                  {lastMatchSides.home.score}
                                </strong>
                              </div>
                              <div className="pl-team-mini-team">
                                <TeamBadge
                                  league={profile.league}
                                  slug={lastMatchSides.away.slug}
                                  name={lastMatchSides.away.name}
                                  size={18}
                                />
                                <span className={`truncate ${lastMatchSides.awayWon ? "is-strong" : "is-dim"}`}>
                                  {lastMatchSides.away.shortName}
                                </span>
                                <strong className={`num ${lastMatchSides.awayWon ? "is-strong" : "is-dim"}`}>
                                  {lastMatchSides.away.score}
                                </strong>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="pl-team-mini-card is-empty">
                        <span>Sin resultado reciente en este corte</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Tarjeta 2: Partido siguiente */}
                <div className="pl-team-mini-col">
                  <span className="pl-team-mini-heading">Partido siguiente</span>
                  {nextUpcoming && nextMatchSides ? (
                    <a
                      href={nextUpcoming.gameHref}
                      onClick={(e) => {
                        e.preventDefault();
                        navigateTo(nextUpcoming.gameHref);
                      }}
                      className="pl-team-mini-card is-link"
                      aria-label={`Partido siguiente: ${nextMatchSides.home.shortName} contra ${nextMatchSides.away.shortName}, ${nextUpcoming.dateLabel} ${nextUpcoming.kickoffLocal}`}
                    >
                      <div className="pl-team-mini-head">
                        <LeagueBadge league={profile.league} label={profile.leagueLabel} size={15} />
                        <span className="truncate">{profile.leagueLabel}</span>
                      </div>
                      <div className="pl-team-mini-body">
                        <div className="pl-team-mini-when num">
                          <span>{nextUpcoming.dateLabel}</span>
                          <strong>{nextUpcoming.kickoffLocal}</strong>
                        </div>
                        <div className="pl-team-mini-teams">
                          <div className="pl-team-mini-team">
                            <TeamBadge
                              league={profile.league}
                              slug={nextMatchSides.home.slug}
                              name={nextMatchSides.home.name}
                              size={18}
                            />
                            <span className="truncate is-strong">
                              {nextMatchSides.home.shortName}
                            </span>
                            {nextMatchSides.home.probLabel ? (
                              <span className="pl-team-mini-prob num">{nextMatchSides.home.probLabel}</span>
                            ) : null}
                          </div>
                          <div className="pl-team-mini-team">
                            <TeamBadge
                              league={profile.league}
                              slug={nextMatchSides.away.slug}
                              name={nextMatchSides.away.name}
                              size={18}
                            />
                            <span className="truncate is-strong">
                              {nextMatchSides.away.shortName}
                            </span>
                            {nextMatchSides.away.probLabel ? (
                              <span className="pl-team-mini-prob num">{nextMatchSides.away.probLabel}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </a>
                  ) : (
                    <div className="pl-team-mini-card is-empty">
                      <span>Sin próximo encuentro en la jornada</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <dl className="pl-ctx-stats pl-team-hero-kpis">
            {profile.standing ? (
              (() => {
                const stMeta = standingDisplayMeta(profile.standing, profile.sport);
                return (
                  <>
                    <div>
                      <dt>Récord en torneo</dt>
                      <dd className="num">
                        {stMeta.recordLabel}{" "}
                        <small>
                          {profile.standing.played} {stMeta.usesPoints ? "PJ" : "JJ"}
                        </small>
                      </dd>
                    </div>

                    <div>
                      <dt>{stMeta.usesPoints ? "Efectividad" : "Porcentaje de victorias"}</dt>
                      <dd className="num">
                        {stMeta.effPctLabel}{" "}
                        {stMeta.effDetail ? <small>{stMeta.effDetail}</small> : null}
                      </dd>
                    </div>

                    <div>
                      <dt>{stMeta.balanceLabel}</dt>
                      <dd className="num">
                        {profile.standing.goalsFor}:{profile.standing.goalsAgainst}{" "}
                        <small>
                          ({profile.standing.goalDiff > 0 ? `+${profile.standing.goalDiff}` : profile.standing.goalDiff}{" "}
                          {unit.short})
                        </small>
                      </dd>
                    </div>

                    <div>
                      <dt>Rendimiento local reciente</dt>
                      <dd className="num">
                        {profile.recentAverages.homeRecord.games > 0
                          ? formatRecordSummary(profile.recentAverages.homeRecord, hasDraw)
                          : "—"}{" "}
                        <small>
                          {profile.recentAverages.homeRecord.scoredAvg !== null
                            ? `${profile.recentAverages.homeRecord.scoredAvg.toFixed(dec)} ${unit.short}/p`
                            : "en casa"}
                        </small>
                      </dd>
                    </div>
                  </>
                );
              })()
            ) : (
              <>
                <div>
                  <dt>Efectividad reciente</dt>
                  <dd className="num">
                    {profile.recentAverages.sampleGames > 0
                      ? `${Math.round((profile.recentAverages.wins / profile.recentAverages.sampleGames) * 100)} %`
                      : "—"}{" "}
                    {profile.recentAverages.sampleGames > 0 ? (
                      <small>
                        {profile.recentAverages.wins} de {profile.recentAverages.sampleGames} JJ
                      </small>
                    ) : null}
                  </dd>
                </div>

                <div>
                  <dt>Rendimiento local</dt>
                  <dd className="num">
                    {profile.recentAverages.homeRecord.games > 0
                      ? formatRecordSummary(profile.recentAverages.homeRecord, hasDraw)
                      : "—"}{" "}
                    <small>
                      {profile.recentAverages.homeRecord.scoredAvg !== null
                        ? `${profile.recentAverages.homeRecord.scoredAvg.toFixed(dec)} ${unit.short}/p`
                        : "en casa"}
                    </small>
                  </dd>
                </div>

                <div>
                  <dt>Rendimiento visita</dt>
                  <dd className="num">
                    {profile.recentAverages.awayRecord.games > 0
                      ? formatRecordSummary(profile.recentAverages.awayRecord, hasDraw)
                      : "—"}{" "}
                    <small>
                      {profile.recentAverages.awayRecord.scoredAvg !== null
                        ? `${profile.recentAverages.awayRecord.scoredAvg.toFixed(dec)} ${unit.short}/p`
                        : "visita"}
                    </small>
                  </dd>
                </div>

                <div>
                  <dt>{profile.injuries.length > 0 ? "Reporte médico" : "Margen reciente"}</dt>
                  <dd className="num">
                    {profile.injuries.length > 0 ? (
                      <>
                        {profile.injuries.length}{" "}
                        <small>{profile.injuries.length === 1 ? "baja activa" : "bajas activas"}</small>
                      </>
                    ) : (
                      <>
                        {profile.recentAverages.marginAvg !== null
                          ? `${profile.recentAverages.marginAvg >= 0 ? "+" : ""}${profile.recentAverages.marginAvg.toFixed(dec)}`
                          : "—"}{" "}
                        <small>{unit.short}/p</small>
                      </>
                    )}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </section>

        {/* Cuerpo de 2 columnas: Izquierda principal unificada (Resumen, Estadísticas, Plantilla) + Derecha compacta (Partidos) */}
        <div className="pl-team-workspace">
          <div className="pl-team-main-col">
            <div className="pl-team-main-sheet glass-card glass-ring">
              <div
                className="pl-team-main-tabs"
                role="tablist"
                aria-label="Secciones del perfil del equipo"
              >
                {tabs.map((tab, idx) => {
                  const selected = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      ref={(el) => {
                        tabRefs.current[idx] = el;
                      }}
                      id={`team-tab-${tab.id}`}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls={`team-panel-${tab.id}`}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => selectTab(tab.id)}
                      onKeyDown={(e) => handleTabKeyDown(e, idx)}
                      className={`pl-team-main-tab ${selected ? "is-active" : ""}`.trim()}
                    >
                      <span>{tab.label}</span>
                      {typeof tab.count === "number" ? (
                        <span className="pl-team-tab-count num">{tab.count}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {/* Panel Resumen */}
              <div
                id="team-panel-resumen"
                role="tabpanel"
                aria-labelledby="team-tab-resumen"
                tabIndex={activeTab === "resumen" ? 0 : undefined}
                hidden={activeTab !== "resumen"}
              >
                <div className="pl-team-sheet-stack">
                  <TeamModelSection
                    section={effectiveModelSection}
                    upgradeHref={upgradeHref}
                    hasAccountSession={hasAccountSession}
                    onNavigate={navigateTo}
                  />

                  <div className="pl-team-sheet-split">
                    <TeamAveragesCard averages={profile.recentAverages} sport={profile.sport} />
                    <TeamContextCard
                      leagueLabel={profile.leagueLabel}
                      sport={profile.sport}
                      backHref={leagueHref}
                      standing={profile.standing}
                      coach={coachInfo}
                      venue={profile.venue}
                      venueGeo={venueGeo}
                      injuries={profile.injuries}
                      onNavigate={navigateTo}
                    />
                  </div>

                  {profile.relatedTeams.length > 0 ? (
                    <section className="glass-card glass-ring rounded-2xl p-5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="m-0 text-sm font-extrabold">
                          Más equipos de {profile.leagueLabel}
                        </h2>
                        <span className="text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                          También en búsqueda rápida (⌘K)
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {profile.relatedTeams.map((rel) => (
                          <a
                            key={rel.slug}
                            href={rel.href}
                            onClick={(e) => {
                              e.preventDefault();
                              navigateTo(rel.href);
                            }}
                            className="pl-btn-glass text-xs min-h-11 px-3 inline-flex items-center gap-2"
                          >
                            <TeamBadge
                              league={profile.league}
                              slug={rel.slug}
                              name={rel.name}
                              size={18}
                            />
                            <span>{rel.shortName}</span>
                            {rel.rank !== null ? (
                              <span className="num text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                                #{rel.rank}
                              </span>
                            ) : null}
                          </a>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              </div>

              {/* Panel Estadísticas */}
              <div
                id="team-panel-estadisticas"
                role="tabpanel"
                aria-labelledby="team-tab-estadisticas"
                tabIndex={activeTab === "estadisticas" ? 0 : undefined}
                hidden={activeTab !== "estadisticas"}
              >
                <TeamStatsSection
                  standing={profile.standing}
                  averages={profile.recentAverages}
                  sport={profile.sport}
                />
              </div>

              {/* Panel Plantilla */}
              <div
                id="team-panel-plantilla"
                role="tabpanel"
                aria-labelledby="team-tab-plantilla"
                tabIndex={activeTab === "plantilla" ? 0 : undefined}
                hidden={activeTab !== "plantilla"}
              >
                {hasSquad && profile.squad ? (
                  <TeamSquadSection
                    league={profile.league}
                    sport={profile.sport}
                    teamSlug={profile.team.slug}
                    teamName={profile.team.name}
                    seasonLabel={profile.seasonLabel}
                    squad={profile.squad}
                    injuries={profile.injuries}
                    isVisitorRestricted={isVisitorRestricted}
                    upgradeHref={upgradeHref}
                    onNavigate={navigateTo}
                  />
                ) : (
                  <section className="glass-card glass-ring rounded-2xl p-6 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Este corte aún no incluye el desglose individual de plantilla para esta competición.
                  </section>
                )}
              </div>
            </div>
          </div>

          <aside className="pl-team-side-col" aria-label="Calendario y resultados del equipo">
            <TeamMatchesRail
              profile={profile}
              venueGeo={venueGeo}
              forceRedacted={isVisitorRestricted}
              watchlistGameIds={watchlistGameIds}
              onToggleWatchlist={toggleWatchlistGame}
              onNavigate={navigateTo}
            />
          </aside>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
