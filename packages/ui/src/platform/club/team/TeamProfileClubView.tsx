"use client";

import React, { useMemo, useRef, useState } from "react";
import { sportHasDraw, sportScoringUnit } from "@pitchlab/contracts";
import { getTeamColors } from "@pitchlab/sports-assets";
import { LeagueBadge, TeamBadge } from "../../../sports";
import {
  CrestPedestal,
  LensGlowOrbs,
  MaestroIcon,
} from "../../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../../components/ShellChrome";
import { usePlatform } from "../../platform-provider";
import { TeamSquadSection } from "./TeamSquadSection";
import type {
  TeamMatchHistoryRow,
  TeamModelMetric,
  TeamProfileData,
  TeamRecentAverages,
  TeamStandingSummary,
  TeamUpcomingFixtureRow,
  TeamVenueInfo,
} from "./types";

export * from "./types";
export * from "./TeamSquadSection";
export * from "./PlayerProfileClubView";

export type TeamProfileTab = "resumen" | "partidos" | "plantilla";

export interface TeamProfileClubViewProps {
  profile: TeamProfileData;
  initialTab?: TeamProfileTab;
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
        <span className="pl-pill pl-pill--info text-[11px] inline-flex items-center gap-1 shrink-0">
          <MaestroIcon name="cpu" size={11} />
          <span>{section.engineLabel}</span>
        </span>
      </div>

      {section.locked ? (
        <div
          className="rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
          style={{ background: "var(--pl-surface)" }}
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
          style={{ background: "var(--pl-surface)", color: "var(--pl-text-muted)" }}
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
              style={{ background: "var(--pl-surface)" }}
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
        <span className="pl-pill num text-[11px]">
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
            <div className="rounded-xl p-3 space-y-1" style={{ background: "var(--pl-surface)" }}>
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

            <div className="rounded-xl p-3 space-y-1" style={{ background: "var(--pl-surface)" }}>
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
  backHref,
  standing,
  venue,
  injuries,
  onNavigate,
}: {
  leagueLabel: string;
  backHref: string;
  standing: TeamStandingSummary | null;
  venue: TeamVenueInfo | null;
  injuries: TeamProfileData["injuries"];
  onNavigate: (href: string) => void;
}): React.JSX.Element {
  return (
    <section
      className="glass-card glass-ring rounded-2xl p-5 space-y-4"
      data-team-context-section=""
      aria-labelledby="team-context-heading"
    >
      <h2 id="team-context-heading" className="m-0 text-base sm:text-lg font-extrabold">
        Información del equipo
      </h2>

      {standing ? (
        <div className="rounded-2xl p-3.5 space-y-2.5" style={{ background: "var(--pl-surface)" }}>
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
            {[
              { k: "PJ", v: standing.played },
              { k: "G", v: standing.won },
              { k: "E", v: standing.drawn },
              { k: "P", v: standing.lost },
              { k: "GF", v: standing.goalsFor },
              { k: "GC", v: standing.goalsAgainst },
              { k: "DG", v: standing.goalDiff > 0 ? `+${standing.goalDiff}` : standing.goalDiff },
              { k: "Pts", v: standing.points, bold: true },
            ].map((cell) => (
              <div key={cell.k} className="rounded-lg py-1.5 px-1" style={{ background: "var(--pl-surface-elevated)" }}>
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
        <div className="flex items-start gap-2.5 rounded-xl p-3" style={{ background: "var(--pl-surface)" }}>
          <MaestroIcon name="pin" size={15} className="mt-0.5 shrink-0" />
          <div className="space-y-0.5 min-w-0">
            <span className="block font-bold">
              {venue?.name ?? "Sede oficial no disponible en este corte"}
            </span>
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
                style={{ background: "var(--pl-surface)" }}
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
                      {inj.detail}
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

function UpcomingFixtureCard({
  fixture,
  league,
  sport,
  forceRedacted,
  onNavigate,
}: {
  fixture: TeamUpcomingFixtureRow;
  league: TeamProfileData["league"];
  sport: TeamProfileData["sport"];
  forceRedacted: boolean;
  onNavigate: (href: string) => void;
}): React.JSX.Element {
  const unit = sportScoringUnit(sport);
  const redacted = forceRedacted || fixture.isRedacted;

  return (
    <li className="rounded-2xl p-4 space-y-3" style={{ background: "var(--pl-surface)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-bold num">
          {fixture.dateLabel} · {fixture.kickoffLocal} h
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="pl-pill">{fixture.neutralSite ? "Neutral" : fixture.isHome ? "Local" : "Visita"}</span>
          {fixture.round ? <span className="pl-pill">{fixture.round}</span> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <TeamBadge
            league={league}
            slug={fixture.opponent.slug}
            name={fixture.opponent.name}
            size={30}
          />
          <div className="min-w-0">
            <span className="block text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
              {fixture.isHome ? "Recibe a" : "Visita a"}
            </span>
            {fixture.opponent.href ? (
              <a
                href={fixture.opponent.href}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(fixture.opponent.href!);
                }}
                className="pl-team-link font-extrabold text-sm inline-flex items-center min-h-11 truncate max-w-full"
              >
                <span className="truncate">{fixture.opponent.name}</span>
              </a>
            ) : (
              <strong className="block text-sm font-extrabold truncate">{fixture.opponent.name}</strong>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {fixture.hasForecast ? (
            redacted ? (
              <span className="pl-pill inline-flex items-center gap-1 text-[11px]">
                <MaestroIcon name="lock" size={11} />
                <span>Pronóstico Pase Ultra</span>
              </span>
            ) : fixture.projectedTeamScore !== null && fixture.projectedOpponentScore !== null ? (
              <span className="pl-pill pl-pill--info num text-xs font-bold">
                Proy. {fixture.projectedTeamScore.toFixed(unit.decimals)} –{" "}
                {fixture.projectedOpponentScore.toFixed(unit.decimals)}
                {fixture.winProbability !== null ? ` · ${(fixture.winProbability * 100).toFixed(0)} %` : ""}
              </span>
            ) : null
          ) : null}

          <a
            href={fixture.gameHref}
            onClick={(e) => {
              e.preventDefault();
              onNavigate(fixture.gameHref);
            }}
            className="pl-btn-glass text-xs min-h-11 px-3.5 inline-flex items-center gap-1.5"
          >
            <span>Ver ficha</span>
            <MaestroIcon name="arrowRight" size={13} />
          </a>
        </div>
      </div>
    </li>
  );
}

function RecentMatchesSection({
  league,
  matches,
  onNavigate,
}: {
  league: TeamProfileData["league"];
  matches: TeamMatchHistoryRow[];
  onNavigate: (href: string) => void;
}): React.JSX.Element {
  const [venueFilter, setVenueFilter] = useState<"all" | "home" | "away">("all");

  const filtered = useMemo(() => {
    if (venueFilter === "home") return matches.filter((m) => m.isHome);
    if (venueFilter === "away") return matches.filter((m) => !m.isHome);
    return matches;
  }, [matches, venueFilter]);

  return (
    <section
      className="glass-card glass-ring rounded-2xl p-5 space-y-4"
      data-team-matches-section=""
      aria-labelledby="team-recent-matches-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="team-recent-matches-heading" className="m-0 text-base sm:text-lg font-extrabold">
            Últimos partidos
          </h2>
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Marcadores finales del más reciente al anterior ({matches.length} disponibles).
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar partidos por sede">
          {(
            [
              { id: "all", label: "Todos" },
              { id: "home", label: "En casa" },
              { id: "away", label: "De visita" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={venueFilter === f.id}
              onClick={() => setVenueFilter(f.id)}
              className="pl-btn-glass text-xs min-h-11 px-3"
              style={
                venueFilter === f.id
                  ? { background: "var(--pl-surface-active)", color: "var(--pl-brand)" }
                  : undefined
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
          No hay partidos finalizados registrados bajo este filtro en el corte vigente.
        </p>
      ) : (
        <ul className="m-0 p-0 list-none space-y-2" data-team-history-list="">
          {filtered.map((m) => (
            <li key={m.id} className="pl-team-match-row">
              <span
                className={`pl-form-dot is-${m.outcome}`}
                role="img"
                title={FORM_LABEL_ES[m.outcome]}
                aria-label={FORM_LABEL_ES[m.outcome]}
              >
                <span aria-hidden="true">{m.outcome}</span>
              </span>

              <div className="flex items-center gap-2.5 min-w-0">
                <TeamBadge
                  league={league}
                  slug={m.opponent.slug}
                  name={m.opponent.name}
                  size={28}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {m.opponent.href ? (
                      <a
                        href={m.opponent.href}
                        onClick={(e) => {
                          e.preventDefault();
                          onNavigate(m.opponent.href!);
                        }}
                        className="pl-team-link text-sm font-bold truncate max-w-full"
                      >
                        {m.isHome ? "vs" : "@"} {m.opponent.name}
                      </a>
                    ) : (
                      <strong className="text-sm font-bold truncate">
                        {m.isHome ? "vs" : "@"} {m.opponent.name}
                      </strong>
                    )}
                    <span className="pl-pill text-[11px]">
                      {m.neutralSite ? "Neutral" : m.isHome ? "Local" : "Visita"}
                    </span>
                  </div>
                  <span className="block text-[11px] num" style={{ color: "var(--pl-text-muted)" }}>
                    {[m.dateLabel, m.round, m.resultNote].filter(Boolean).join(" · ")}
                  </span>
                </div>
              </div>

              <div className="pl-team-match-score flex items-center gap-2.5 shrink-0">
                <strong className="num text-base font-extrabold px-2.5 py-1 rounded-lg" style={{ background: "var(--pl-surface-elevated)" }}>
                  {m.teamScore} – {m.opponentScore}
                </strong>
                {m.gameHref ? (
                  <a
                    href={m.gameHref}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate(m.gameHref!);
                    }}
                    className="pl-btn-glass text-xs min-h-11 px-3 inline-flex items-center gap-1"
                  >
                    <span>Ficha</span>
                    <MaestroIcon name="chevronRight" size={12} />
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TeamProfileClubView({
  profile,
  initialTab = "resumen",
}: TeamProfileClubViewProps): React.JSX.Element {
  const { viewerRole, hasAccountSession, upgradeHref, navigateTo } = usePlatform();
  const hasSquad = Boolean(profile.squad && profile.squad.players.length > 0);
  const [activeTab, setActiveTab] = useState<TeamProfileTab>(
    initialTab === "plantilla" && !hasSquad ? "resumen" : initialTab,
  );
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const teamColors = getTeamColors(profile.league, profile.team.slug);
  const primaryColor = teamColors?.[0] ?? "var(--pl-aura-default-home)";
  const secondaryColor = teamColors?.[1] ?? "var(--pl-aura-default-away)";

  const unit = sportScoringUnit(profile.sport);
  const hasDraw = sportHasDraw(profile.sport);
  const dec = unit.decimals === 0 ? 1 : unit.decimals;

  const isVisitorRestricted = viewerRole === "visitor";
  const effectiveModelSection =
    isVisitorRestricted && !profile.modelSection.locked
      ? { ...profile.modelSection, locked: true, metrics: [] }
      : profile.modelSection;

  const selectTab = (nextTab: TeamProfileTab) => {
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

  const tabs: ReadonlyArray<{ id: TeamProfileTab; label: string; count?: number }> = [
    { id: "resumen", label: "Resumen" },
    {
      id: "partidos",
      label: "Partidos",
      count: profile.upcomingFixtures.length + profile.recentMatches.length,
    },
    ...(hasSquad && profile.squad
      ? [
          {
            id: "plantilla" as const,
            label: "Plantilla",
            count: profile.squad.players.length,
          },
        ]
      : []),
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
  const nextUpcoming = profile.upcomingFixtures[0] ?? null;

  return (
    <AtmosphereStage activePath={`/app/${profile.league}/teams/${profile.team.slug}`}>
      <ClubWorkspaceShell activePath={`/app/${profile.league}/teams/${profile.team.slug}`}>
        {/* Barra superior de retorno */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <a
            href={leagueHref}
            onClick={(e) => {
              e.preventDefault();
              navigateTo(leagueHref);
            }}
            className="pl-btn-glass text-xs min-h-11 px-3.5 inline-flex items-center gap-1.5"
          >
            <MaestroIcon name="arrowLeft" size={13} />
            <span>Volver a {profile.leagueLabel}</span>
          </a>

          <span className="pl-pill num text-xs">
            Actualizado {profile.updatedAt}
          </span>
        </div>

        {/* Cabecera Hero del Equipo */}
        <section
          className="glass-lens glass-ring glass-ring--featured rounded-3xl p-5 sm:p-6 space-y-5 relative overflow-hidden"
          data-team-hero={profile.team.slug}
        >
          <LensGlowOrbs primaryColor={primaryColor} secondaryColor={secondaryColor} />

          <div className="flex flex-wrap items-center justify-between gap-2 relative z-10">
            <div className="flex items-center gap-2 min-w-0">
              <LeagueBadge league={profile.league} label={profile.leagueLabel} size={22} />
              <span className="text-xs font-semibold truncate">
                {profile.leagueLabel} · {profile.seasonLabel}
              </span>
            </div>

            {profile.standing ? (
              <span className="pl-pill pl-pill--brand num text-xs font-bold">
                #{profile.standing.rank} de {profile.standing.totalTeams} · {profile.standing.points} pts
              </span>
            ) : profile.recentAverages.sampleGames > 0 ? (
              <span className="pl-pill pl-pill--brand num text-xs font-bold">
                Balance reciente {formatRecordSummary(profile.recentAverages, hasDraw)}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4 relative z-10">
            <CrestPedestal size="lg" className="pl-team-crest-hero" glowColor={primaryColor}>
              <TeamBadge
                league={profile.league}
                slug={profile.team.slug}
                name={profile.team.name}
                size={52}
              />
            </CrestPedestal>

            <div className="min-w-0 flex-1 space-y-1.5">
              <h1 className="m-0 text-2xl sm:text-3xl font-extrabold tracking-tight">
                {profile.team.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
                <span>
                  {profile.team.shortName} · <strong className="num">{profile.team.code}</strong>
                </span>
                {profile.venue?.name ? (
                  <span className="inline-flex items-center gap-1">
                    <MaestroIcon name="pin" size={12} />
                    <span>{profile.venue.name}</span>
                  </span>
                ) : null}
              </div>
              {profile.recentAverages.streak.length > 0 ? (
                <div className="pt-1 flex items-center gap-2 text-xs">
                  <span style={{ color: "var(--pl-text-muted)" }}>Racha:</span>
                  <FormDots streak={profile.recentAverages.streak} />
                </div>
              ) : null}
            </div>
          </div>

          <dl className="pl-ctx-stats relative z-10">
            <div>
              <dt>{profile.standing ? "Tabla general" : "Balance reciente"}</dt>
              <dd className="num">
                {profile.standing
                  ? `#${profile.standing.rank}`
                  : profile.recentAverages.sampleGames > 0
                    ? `${profile.recentAverages.wins}-${profile.recentAverages.losses}`
                    : "—"}
                {profile.standing ? (
                  <small className="ml-1">{profile.standing.points} pts</small>
                ) : profile.recentAverages.sampleGames > 0 ? (
                  <small className="ml-1">{profile.recentAverages.sampleGames} JJ</small>
                ) : null}
              </dd>
            </div>

            <div>
              <dt>A favor / partido</dt>
              <dd className="num">
                {profile.recentAverages.scoredAvg !== null
                  ? profile.recentAverages.scoredAvg.toFixed(dec)
                  : "—"}{" "}
                <small>{unit.short}/p</small>
              </dd>
            </div>

            <div>
              <dt>En contra / partido</dt>
              <dd className="num">
                {profile.recentAverages.concededAvg !== null
                  ? profile.recentAverages.concededAvg.toFixed(dec)
                  : "—"}{" "}
                <small>{unit.short}/p</small>
              </dd>
            </div>

            <div>
              <dt>{profile.standing ? "Diferencia" : "Bajas activas"}</dt>
              <dd className="num">
                {profile.standing ? (
                  <>
                    {profile.standing.goalDiff > 0 ? `+${profile.standing.goalDiff}` : profile.standing.goalDiff}{" "}
                    <small>{unit.short}</small>
                  </>
                ) : (
                  <>
                    {profile.injuries.length} <small>reportadas</small>
                  </>
                )}
              </dd>
            </div>
          </dl>
        </section>

        {/* Navegación por pestañas accesibles (WCAG 1.4.1 + teclado + ?tab=) */}
        <div
          className="seg-well pl-tablist-underline"
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
                className="seg-btn"
              >
                <span>{tab.label}</span>
                {typeof tab.count === "number" ? (
                  <span className="pl-pill num text-[11px] px-1.5 py-0">{tab.count}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Panel Resumen (sin estilos de caja en el elemento role="tabpanel" cuando hidden) */}
        <div
          id="team-panel-resumen"
          role="tabpanel"
          aria-labelledby="team-tab-resumen"
          tabIndex={activeTab === "resumen" ? 0 : undefined}
          hidden={activeTab !== "resumen"}
        >
          <div className="space-y-4">
            <TeamModelSection
              section={effectiveModelSection}
              upgradeHref={upgradeHref}
              hasAccountSession={hasAccountSession}
              onNavigate={navigateTo}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TeamAveragesCard averages={profile.recentAverages} sport={profile.sport} />
              <TeamContextCard
                leagueLabel={profile.leagueLabel}
                backHref={leagueHref}
                standing={profile.standing}
                venue={profile.venue}
                injuries={profile.injuries}
                onNavigate={navigateTo}
              />
            </div>

            {nextUpcoming ? (
              <section className="glass-card glass-ring rounded-2xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="m-0 text-base font-extrabold">Próximo compromiso</h2>
                  <button
                    type="button"
                    onClick={() => selectTab("partidos")}
                    className="pl-btn-glass text-xs min-h-11 px-3 inline-flex items-center gap-1"
                  >
                    <span>Ver calendario completo</span>
                    <MaestroIcon name="chevronRight" size={12} />
                  </button>
                </div>
                <ul className="m-0 p-0 list-none">
                  <UpcomingFixtureCard
                    fixture={nextUpcoming}
                    league={profile.league}
                    sport={profile.sport}
                    forceRedacted={isVisitorRestricted}
                    onNavigate={navigateTo}
                  />
                </ul>
              </section>
            ) : null}

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

        {/* Panel Partidos */}
        <div
          id="team-panel-partidos"
          role="tabpanel"
          aria-labelledby="team-tab-partidos"
          tabIndex={activeTab === "partidos" ? 0 : undefined}
          hidden={activeTab !== "partidos"}
        >
          <div className="space-y-4">
            <section
              className="glass-card glass-ring rounded-2xl p-5 space-y-3"
              aria-labelledby="team-upcoming-heading"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 id="team-upcoming-heading" className="m-0 text-base sm:text-lg font-extrabold">
                  Próximos encuentros
                </h2>
                <span className="pl-pill num text-xs">{profile.upcomingFixtures.length}</span>
              </div>

              {profile.upcomingFixtures.length === 0 ? (
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  No hay encuentros programados para este equipo en la jornada publicada.
                </p>
              ) : (
                <ul className="m-0 p-0 list-none space-y-2.5" data-team-upcoming-list="">
                  {profile.upcomingFixtures.map((fix) => (
                    <UpcomingFixtureCard
                      key={fix.id}
                      fixture={fix}
                      league={profile.league}
                      sport={profile.sport}
                      forceRedacted={isVisitorRestricted}
                      onNavigate={navigateTo}
                    />
                  ))}
                </ul>
              )}
            </section>

            <RecentMatchesSection
              league={profile.league}
              matches={profile.recentMatches}
              onNavigate={navigateTo}
            />
          </div>
        </div>

        {/* Panel Plantilla */}
        {hasSquad && profile.squad ? (
          <div
            id="team-panel-plantilla"
            role="tabpanel"
            aria-labelledby="team-tab-plantilla"
            tabIndex={activeTab === "plantilla" ? 0 : undefined}
            hidden={activeTab !== "plantilla"}
          >
            <TeamSquadSection
              league={profile.league}
              teamSlug={profile.team.slug}
              teamName={profile.team.name}
              seasonLabel={profile.seasonLabel}
              squad={profile.squad}
              isVisitorRestricted={isVisitorRestricted}
              upgradeHref={upgradeHref}
              onNavigate={navigateTo}
            />
          </div>
        ) : null}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
