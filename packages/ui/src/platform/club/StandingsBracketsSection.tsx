"use client";

import React, { useCallback, useMemo, useState } from "react";
import { isSafePublicLabel, type PlatformSport, type StandingFormToken } from "@pitchlab/contracts";
import {
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreTable,
  SofascoreTabs,
  type SofascoreTabItem,
  type SofascoreTableColumn,
} from "../../components/ui/primitives";
import { AtomicFormStrip, AtomicStatComparisonBar } from "../atomic";
import { TeamBadge } from "../../sports";
import { sanitizeInternalHref } from "../navigation-helpers";
import { useOptionalPlatformActions } from "../platform-provider";

export type StandingsSplitKey = "total" | "home" | "away";
export type StandingsZoneTone = "ucl" | "uel" | "uecl" | "warn" | "rel";
export type BracketMode = "active_knockout" | "projected_seeding";
export type BracketFormat =
  | "liga_mx_liguilla"
  | "uefa_knockout"
  | "conmebol_knockout"
  | "nba_playoffs"
  | "generic_knockout";

export interface StandingsZoneDef {
  readonly id: string;
  readonly label: string;
  readonly tone: StandingsZoneTone;
  readonly startRank: number;
  readonly endRank: number;
  readonly scope: "league" | "conference";
}

export interface StandingsSplitRow {
  readonly rank: number;
  readonly teamId: string;
  readonly teamSlug: string;
  readonly name: string;
  readonly shortName: string;
  readonly code: string;
  readonly teamHref: string;
  readonly conference: string | null;
  readonly division: string | null;
  readonly played: number;
  readonly won: number;
  readonly drawn: number;
  readonly lost: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly goalDiff: number;
  readonly points: number;
  readonly winPct: number | null;
  readonly gamesBehind: string | null;
  readonly seed: number | null;
  readonly form: readonly StandingFormToken[];
  readonly zoneId: string | null;
  readonly zoneLabel: string | null;
  readonly zoneTone: StandingsZoneTone | null;
}

export interface LeagueStandingsSplitsData {
  readonly league: string;
  readonly leagueLabel: string;
  readonly sport: PlatformSport;
  readonly season: string;
  readonly roundLabel: string;
  readonly updatedAt: string;
  readonly hasRelegationZones: boolean;
  readonly hasConferences: boolean;
  readonly conferences: readonly string[];
  readonly total: readonly StandingsSplitRow[];
  readonly home: readonly StandingsSplitRow[];
  readonly away: readonly StandingsSplitRow[];
  readonly zones: readonly StandingsZoneDef[];
}

export interface AttackDefenseMetricScore {
  readonly value: number | null;
  readonly rank: number | null;
  readonly leagueSize: number;
  readonly lowerIsBetter: boolean;
}

export interface LeagueAttackDefenseTeamData {
  readonly teamId: string;
  readonly teamSlug: string;
  readonly name: string;
  readonly shortName: string;
  readonly code: string;
  readonly teamHref: string;
  readonly played: number;
  readonly attackRank: number;
  readonly defenseRank: number;
  readonly overallRank: number;
  readonly goalsForPerGame: AttackDefenseMetricScore;
  readonly expectedGoalsFor: AttackDefenseMetricScore;
  readonly shotsPerGame: AttackDefenseMetricScore;
  readonly shotsOnTargetPerGame: AttackDefenseMetricScore;
  readonly goalsAgainstPerGame: AttackDefenseMetricScore;
  readonly expectedGoalsAgainst: AttackDefenseMetricScore;
  readonly cleanSheets: AttackDefenseMetricScore;
  readonly cleanSheetPct: AttackDefenseMetricScore;
}

export interface TeamAttackDefenseMetricData {
  readonly key: string;
  readonly category: "attack" | "defense";
  readonly label: string;
  readonly valueA: number | null;
  readonly valueB: number | null;
  readonly leagueAverage: number | null;
  readonly rankA: number | null;
  readonly rankB: number | null;
  readonly leagueSize: number;
  readonly lowerIsBetter: boolean;
  readonly digits: number;
  readonly pct: boolean;
}

export interface TeamAttackDefenseData {
  readonly league: string;
  readonly leagueLabel: string;
  readonly sport: PlatformSport;
  readonly leagueSize: number;
  readonly teamA: LeagueAttackDefenseTeamData;
  readonly teamB: LeagueAttackDefenseTeamData | null;
  readonly attackMetrics: readonly TeamAttackDefenseMetricData[];
  readonly defenseMetrics: readonly TeamAttackDefenseMetricData[];
  readonly metrics: readonly TeamAttackDefenseMetricData[];
}

export interface BracketTeamSlotData {
  readonly teamId: string | null;
  readonly teamSlug: string | null;
  readonly name: string;
  readonly shortName: string;
  readonly code: string;
  readonly seed: number | null;
  readonly conference: string | null;
  readonly gamesBehind: string | null;
  readonly teamHref: string | null;
  readonly placeholder: string | null;
}

export interface BracketLegDetailData {
  readonly legNumber: number;
  readonly matchSlug: string;
  readonly dateIso: string;
  readonly status: "NS" | "LIVE" | "FT";
  readonly homeTeamSlug: string;
  readonly awayTeamSlug: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly extraTimeScore: { readonly home: number; readonly away: number } | null;
  readonly penaltyShootout: { readonly home: number; readonly away: number } | null;
  readonly href: string;
}

export interface BracketTieData {
  readonly id: string;
  readonly roundKey: string;
  readonly conference: string | null;
  readonly slotIndex: number;
  readonly teamA: BracketTeamSlotData;
  readonly teamB: BracketTeamSlotData;
  readonly aggregateA: number | null;
  readonly aggregateB: number | null;
  readonly penaltiesA: number | null;
  readonly penaltiesB: number | null;
  readonly seriesWinsA: number | null;
  readonly seriesWinsB: number | null;
  readonly bestOf: number | null;
  readonly legs: readonly BracketLegDetailData[];
  readonly status: "projected" | "scheduled" | "in_progress" | "decided";
  readonly winnerSide: "A" | "B" | null;
  readonly winnerTeamSlug: string | null;
  readonly note: string | null;
}

export interface BracketRoundData {
  readonly key: string;
  readonly label: string;
  readonly order: number;
  readonly twoLegged: boolean;
  readonly bestOf: number | null;
  readonly ties: readonly BracketTieData[];
}

export interface BracketConferenceSectionData {
  readonly conference: string;
  readonly label: string;
  readonly playIn: readonly BracketTieData[];
  readonly rounds: readonly BracketRoundData[];
}

export interface LeagueKnockoutBracketData {
  readonly league: string;
  readonly leagueLabel: string;
  readonly sport: PlatformSport;
  readonly season: string;
  readonly updatedAt: string;
  readonly mode: BracketMode;
  readonly format: BracketFormat;
  readonly hasRelegationZones: boolean;
  readonly rounds: readonly BracketRoundData[];
  readonly conferences: readonly BracketConferenceSectionData[];
  readonly finalsTie: BracketTieData | null;
  readonly championSlug: string | null;
  readonly championName: string | null;
}

export interface StandingsSplitsPanelProps {
  readonly standings: LeagueStandingsSplitsData;
  readonly highlightTeamSlug?: string | null;
  readonly defaultSplit?: StandingsSplitKey;
  readonly compact?: boolean;
  readonly onNavigate?: (href: string) => void;
  readonly className?: string;
}

export interface AttackDefenseOrdinalCardProps {
  readonly data: TeamAttackDefenseData;
  readonly compact?: boolean;
  readonly className?: string;
}

export interface KnockoutBracketSvgPanelProps {
  readonly bracket: LeagueKnockoutBracketData | null | undefined;
  readonly highlightTeamSlug?: string | null;
  readonly onNavigate?: (href: string) => void;
  readonly className?: string;
}

export interface StandingsBracketsSectionProps {
  readonly league?: string;
  readonly title?: string;
  readonly standings?: LeagueStandingsSplitsData | null;
  readonly attackDefense?: TeamAttackDefenseData | null;
  readonly bracket?: LeagueKnockoutBracketData | null;
  readonly highlightTeamSlug?: string | null;
  readonly defaultSplit?: StandingsSplitKey;
  readonly compact?: boolean;
  readonly onNavigate?: (href: string) => void;
  readonly className?: string;
}

const SVG_COL_WIDTH = 206;
const SVG_COL_GAP = 36;
const SVG_BOX_HEIGHT = 60;
const SVG_UNIT_HEIGHT = 82;
const SVG_HEAD_HEIGHT = 34;
const SVG_PAD_X = 14;
const SVG_PAD_Y = 12;

function safeLabel(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed || !isSafePublicLabel(trimmed)) return fallback;
  return trimmed;
}

function truncateSvgLabel(raw: string, maxChars = 18): string {
  const clean = raw.trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 1)}…`;
}

function formatWinPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const formatted = value.toFixed(3);
  return formatted.startsWith("0.") ? formatted.slice(1) : formatted;
}

function formatGoalDiff(diff: number): string {
  if (!Number.isFinite(diff)) return "0";
  return diff > 0 ? `+${diff}` : String(diff);
}

function resolveZoneToneForRow(
  row: StandingsSplitRow,
  hasRelegationZones: boolean,
): StandingsZoneTone | null {
  if (!row.zoneTone) return null;
  if (!hasRelegationZones && row.zoneTone === "rel") return null;
  return row.zoneTone;
}

function formatTieSideScore(tie: BracketTieData, side: "A" | "B"): string {
  if (tie.bestOf !== null && tie.bestOf > 1) {
    const wins = side === "A" ? tie.seriesWinsA : tie.seriesWinsB;
    return wins !== null && Number.isFinite(wins) ? String(wins) : "—";
  }
  const agg = side === "A" ? tie.aggregateA : tie.aggregateB;
  const pen = side === "A" ? tie.penaltiesA : tie.penaltiesB;
  if (agg === null || !Number.isFinite(agg)) return "—";
  if (pen !== null && Number.isFinite(pen)) {
    return `${agg} (${pen})`;
  }
  return String(agg);
}

function tieStatusLabelEs(status: BracketTieData["status"]): string {
  if (status === "decided") return "Definida";
  if (status === "in_progress") return "En curso";
  if (status === "scheduled") return "Programada";
  return "Proyectada";
}

function bracketFormatSubtitle(bracket: LeagueKnockoutBracketData): string {
  if (bracket.format === "liga_mx_liguilla") {
    return bracket.mode === "active_knockout"
      ? "Liguilla activa · Ida y vuelta"
      : "Proyección de Liguilla y Play-In";
  }
  if (bracket.format === "uefa_knockout" || bracket.format === "conmebol_knockout") {
    return bracket.mode === "active_knockout"
      ? "Fase eliminatoria · Ida y vuelta"
      : "Cruce eliminatorio proyectado";
  }
  if (bracket.format === "nba_playoffs") {
    return bracket.mode === "active_knockout"
      ? "Playoffs activos · Series al mejor de 7"
      : "Proyección de Playoffs y Play-In";
  }
  return bracket.mode === "active_knockout"
    ? "Postemporada activa"
    : "Llave proyectada";
}

export function StandingsSplitsPanel({
  standings,
  highlightTeamSlug = null,
  defaultSplit = "total",
  compact = false,
  onNavigate,
  className,
}: StandingsSplitsPanelProps): React.JSX.Element {
  const platformActions = useOptionalPlatformActions();
  const [split, setSplit] = useState<StandingsSplitKey>(defaultSplit);
  const [selectedConference, setSelectedConference] = useState<string>("all");

  const navigateSafe = useCallback(
    (href: string) => {
      const safeHref = sanitizeInternalHref(href);
      if (!safeHref) return;
      if (onNavigate) {
        onNavigate(safeHref);
        return;
      }
      if (platformActions) {
        platformActions.navigateTo(safeHref);
        return;
      }
      if (typeof window !== "undefined") {
        window.location.assign(safeHref);
      }
    },
    [onNavigate, platformActions],
  );

  const splitTabs: readonly SofascoreTabItem[] = useMemo(
    () => [
      { id: "total", label: "Total", count: standings.total.length },
      { id: "home", label: "Local", count: standings.home.length },
      { id: "away", label: "Visitante", count: standings.away.length },
    ],
    [standings.total.length, standings.home.length, standings.away.length],
  );

  const effectiveConference =
    selectedConference !== "all" && standings.conferences.includes(selectedConference)
      ? selectedConference
      : "all";

  const activeRows = useMemo(() => {
    const base =
      split === "home"
        ? standings.home
        : split === "away"
          ? standings.away
          : standings.total;
    if (!standings.hasConferences || effectiveConference === "all") {
      return base;
    }
    return base.filter((row) => row.conference === effectiveConference);
  }, [split, standings, effectiveConference]);

  const safeZones = useMemo(
    () =>
      standings.zones.filter((zone) => {
        if (!standings.hasRelegationZones && (zone.tone === "rel" || /descenso/i.test(zone.label))) {
          return false;
        }
        return true;
      }),
    [standings.zones, standings.hasRelegationZones],
  );

  const isFootball = standings.sport === "football";
  const showDrawCol = isFootball || activeRows.some((row) => row.drawn > 0);
  const showGamesBehind = !isFootball && activeRows.some((row) => row.gamesBehind !== null);

  const columns: readonly SofascoreTableColumn<StandingsSplitRow>[] = useMemo(() => {
    const cols: SofascoreTableColumn<StandingsSplitRow>[] = [
      {
        key: "rank",
        header: "#",
        align: "start",
        numeric: true,
        render: (row) => {
          const tone = resolveZoneToneForRow(row, standings.hasRelegationZones);
          return (
            <span
              className={`pl-sb-rank-cell num${tone ? ` is-zone-${tone}` : ""}`}
              title={tone && row.zoneLabel ? safeLabel(row.zoneLabel, "") : undefined}
            >
              {row.rank}
            </span>
          );
        },
      },
      {
        key: "team",
        header: "Equipo",
        sticky: true,
        render: (row) => {
          const isHighlighted = Boolean(highlightTeamSlug && row.teamSlug === highlightTeamSlug);
          const cleanName = safeLabel(row.shortName || row.name, row.teamSlug);
          const safeHref = sanitizeInternalHref(row.teamHref);
          const linkClass = `pl-sb-team-link${isHighlighted ? " is-highlighted" : ""}`;
          const content = (
            <>
              <TeamBadge
                league={standings.league}
                slug={row.teamSlug}
                name={cleanName}
                size={20}
              />
              <span className="pl-sb-team-name">{cleanName}</span>
            </>
          );
          if (!safeHref) {
            return <span className={linkClass}>{content}</span>;
          }
          return (
            <a
              href={safeHref}
              className={linkClass}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                navigateSafe(safeHref);
              }}
            >
              {content}
            </a>
          );
        },
      },
      {
        key: "played",
        header: "PJ",
        numeric: true,
        render: (row) => <span className="num">{row.played}</span>,
      },
      {
        key: "won",
        header: isFootball ? "G" : "W",
        numeric: true,
        render: (row) => <span className="num">{row.won}</span>,
      },
    ];

    if (showDrawCol) {
      cols.push({
        key: "drawn",
        header: isFootball ? "E" : "T",
        numeric: true,
        render: (row) => <span className="num">{row.drawn}</span>,
      });
    }

    cols.push({
      key: "lost",
      header: isFootball ? "P" : "L",
      numeric: true,
      render: (row) => <span className="num">{row.lost}</span>,
    });

    if (isFootball) {
      cols.push(
        {
          key: "gf_ga",
          header: "GF:GC",
          numeric: true,
          render: (row) => <span className="num">{`${row.goalsFor}:${row.goalsAgainst}`}</span>,
        },
        {
          key: "diff",
          header: "DG",
          numeric: true,
          render: (row) => (
            <span
              className={`num ${
                row.goalDiff > 0 ? "pl-sb-pos" : row.goalDiff < 0 ? "pl-sb-neg" : ""
              }`}
            >
              {formatGoalDiff(row.goalDiff)}
            </span>
          ),
        },
        {
          key: "points",
          header: "Pts",
          numeric: true,
          render: (row) => <strong className="num pl-sb-pts">{row.points}</strong>,
        },
      );
    } else {
      cols.push({
        key: "pct",
        header: "PCT",
        numeric: true,
        render: (row) => <strong className="num pl-sb-pts">{formatWinPct(row.winPct)}</strong>,
      });
      if (showGamesBehind) {
        cols.push({
          key: "gb",
          header: "GB",
          numeric: true,
          render: (row) => <span className="num">{row.gamesBehind ?? "—"}</span>,
        });
      }
      cols.push({
        key: "diff",
        header: "Dif.",
        numeric: true,
        render: (row) => (
          <span
            className={`num ${
              row.goalDiff > 0 ? "pl-sb-pos" : row.goalDiff < 0 ? "pl-sb-neg" : ""
            }`}
          >
            {formatGoalDiff(row.goalDiff)}
          </span>
        ),
      });
    }

    cols.push({
      key: "form",
      header: "Últimos 5",
      align: "end",
      render: (row) => (
        <span className="pl-sb-form-cell">
          <AtomicFormStrip
            form={row.form}
            sport={standings.sport}
            size="xs"
            teamName={safeLabel(row.shortName, row.teamSlug)}
          />
        </span>
      ),
    });

    return cols;
  }, [
    standings.hasRelegationZones,
    standings.league,
    standings.sport,
    highlightTeamSlug,
    isFootball,
    showDrawCol,
    showGamesBehind,
    navigateSafe,
  ]);

  const safeLeagueLabel = safeLabel(standings.leagueLabel, standings.league);

  return (
    <SofascoreCard
      title={`Clasificación · ${safeLeagueLabel}`}
      meta={
        <span className="num">
          {[safeLabel(standings.season, ""), safeLabel(standings.roundLabel, "")]
            .filter(Boolean)
            .join(" · ")}
        </span>
      }
      density={compact ? "compact" : "default"}
      className={className}
    >
      <div className="pl-sb-standings-body" data-standings-splits={split}>
        <div className="pl-sb-controls-row">
          <SofascoreTabs
            items={splitTabs}
            value={split}
            onChange={(next) => {
              if (next === "total" || next === "home" || next === "away") {
                setSplit(next);
              }
            }}
            variant="segmented"
            ariaLabel="Seleccionar desglose de tabla general, local o visitante"
            className="pl-sb-split-tabs"
          />

          {standings.hasConferences && standings.conferences.length > 1 ? (
            <div className="pl-sb-conf-pills" role="group" aria-label="Filtrar por conferencia">
              <button
                type="button"
                className={`pl-sb-conf-btn${effectiveConference === "all" ? " is-active" : ""}`}
                aria-pressed={effectiveConference === "all"}
                onClick={() => setSelectedConference("all")}
              >
                Todas
              </button>
              {standings.conferences.map((conf) => (
                <button
                  key={conf}
                  type="button"
                  className={`pl-sb-conf-btn${effectiveConference === conf ? " is-active" : ""}`}
                  aria-pressed={effectiveConference === conf}
                  onClick={() => setSelectedConference(conf)}
                >
                  {safeLabel(conf, conf)}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <SofascoreTable
          caption={`Tabla de posiciones ${split} de ${safeLeagueLabel}`}
          columns={columns}
          rows={activeRows}
          rowKey={(row) => `${split}:${row.teamSlug}`}
          density="compact"
          onRowClick={(row) => navigateSafe(row.teamHref)}
          className="pl-sb-table-wrap"
          emptyState={
            <SofascoreEmptyState
              title="Sin partidos registrados en este desglose"
              description="Cambia a la vista Total o elige otra conferencia."
            />
          }
        />

        {safeZones.length > 0 ? (
          <ul className="pl-sb-zone-legend" aria-label="Zonas de clasificación">
            {safeZones.map((zone) => (
              <li key={zone.id} className="pl-sb-zone-item">
                <span className={`pl-sb-zone-dot is-zone-${zone.tone}`} aria-hidden="true" />
                <span>{safeLabel(zone.label, zone.id)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </SofascoreCard>
  );
}

export function AttackDefenseOrdinalCard({
  data,
  compact = false,
  className,
}: AttackDefenseOrdinalCardProps): React.JSX.Element {
  const teamALabel = safeLabel(data.teamA.shortName || data.teamA.name, data.teamA.teamSlug);
  const teamBLabel = data.teamB
    ? safeLabel(data.teamB.shortName || data.teamB.name, data.teamB.teamSlug)
    : "Media de liga";

  return (
    <SofascoreCard
      title="Ataque vs Defensa"
      meta={
        <span className="num">
          {safeLabel(data.leagueLabel, data.league)} · {data.leagueSize} equipos
        </span>
      }
      density={compact ? "compact" : "default"}
      className={className}
    >
      <div className="pl-sb-ad-body" data-attack-defense-card="">
        <div className="pl-sb-ad-head">
          <div className="pl-sb-ad-side">
            <TeamBadge league={data.league} slug={data.teamA.teamSlug} name={teamALabel} size={22} />
            <div className="pl-sb-ad-side-copy">
              <strong>{teamALabel}</strong>
              <span className="num">
                Atq {data.teamA.attackRank}.º · Def {data.teamA.defenseRank}.º
              </span>
            </div>
          </div>

          <div className="pl-sb-ad-side is-away">
            {data.teamB ? (
              <>
                <div className="pl-sb-ad-side-copy is-end">
                  <strong>{teamBLabel}</strong>
                  <span className="num">
                    Atq {data.teamB.attackRank}.º · Def {data.teamB.defenseRank}.º
                  </span>
                </div>
                <TeamBadge
                  league={data.league}
                  slug={data.teamB.teamSlug}
                  name={teamBLabel}
                  size={22}
                />
              </>
            ) : (
              <div className="pl-sb-ad-side-copy is-end">
                <strong>Media de liga</strong>
                <span className="num">Referencia ({data.leagueSize})</span>
              </div>
            )}
          </div>
        </div>

        <div className="pl-sb-ad-groups">
          {data.attackMetrics.length > 0 ? (
            <div className="pl-sb-ad-group">
              <h3 className="pl-sb-ad-group-title">Ataque</h3>
              <div className="pl-sb-ad-bars">
                {data.attackMetrics.map((metric) => (
                  <AtomicStatComparisonBar
                    key={metric.key}
                    label={safeLabel(metric.label, metric.key)}
                    homeValue={metric.valueA}
                    awayValue={data.teamB ? metric.valueB : metric.leagueAverage}
                    homeLabel={teamALabel}
                    awayLabel={teamBLabel}
                    rankA={metric.rankA}
                    rankB={data.teamB ? metric.rankB : null}
                    lowerIsBetter={metric.lowerIsBetter}
                    digits={metric.digits}
                    pct={metric.pct}
                    variant="compact"
                  />
                ))}
              </div>
            </div>
          ) : null}

          {data.defenseMetrics.length > 0 ? (
            <div className="pl-sb-ad-group">
              <h3 className="pl-sb-ad-group-title">Defensa</h3>
              <div className="pl-sb-ad-bars">
                {data.defenseMetrics.map((metric) => (
                  <AtomicStatComparisonBar
                    key={metric.key}
                    label={safeLabel(metric.label, metric.key)}
                    homeValue={metric.valueA}
                    awayValue={data.teamB ? metric.valueB : metric.leagueAverage}
                    homeLabel={teamALabel}
                    awayLabel={teamBLabel}
                    rankA={metric.rankA}
                    rankB={data.teamB ? metric.rankB : null}
                    lowerIsBetter={metric.lowerIsBetter}
                    digits={metric.digits}
                    pct={metric.pct}
                    variant="compact"
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </SofascoreCard>
  );
}

function BracketTreeSvg({
  rounds,
  titleLabel,
  highlightTeamSlug,
}: {
  readonly rounds: readonly BracketRoundData[];
  readonly titleLabel: string;
  readonly highlightTeamSlug: string | null;
}): React.JSX.Element | null {
  if (rounds.length === 0) return null;

  const firstRoundTies = Math.max(1, rounds[0]?.ties.length ?? 1);
  const totalHeight = SVG_HEAD_HEIGHT + firstRoundTies * SVG_UNIT_HEIGHT + SVG_PAD_Y * 2;
  const totalWidth =
    SVG_PAD_X * 2 +
    rounds.length * SVG_COL_WIDTH +
    Math.max(0, rounds.length - 1) * SVG_COL_GAP;

  const roundPositions = rounds.map((round, roundIndex) => {
    const count = Math.max(1, round.ties.length);
    const x = SVG_PAD_X + roundIndex * (SVG_COL_WIDTH + SVG_COL_GAP);
    const ties = round.ties.map((tie, tieIndex) => {
      const centerY =
        SVG_HEAD_HEIGHT +
        SVG_PAD_Y +
        ((tieIndex + 0.5) / count) * (firstRoundTies * SVG_UNIT_HEIGHT);
      return {
        tie,
        x,
        y: centerY - SVG_BOX_HEIGHT / 2,
        centerY,
      };
    });
    return { round, x, ties };
  });

  return (
    <div
      className="pl-sb-bracket-scroll"
      tabIndex={0}
      role="region"
      aria-label={`Diagrama de llaves eliminatorias: ${titleLabel}`}
    >
      <svg
        className="pl-sb-bracket-svg"
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        width={totalWidth}
        height={totalHeight}
        role="img"
        aria-label={`Llave eliminatoria de ${titleLabel}`}
      >
        {roundPositions.map((col, roundIdx) => {
          const nextCol = roundPositions[roundIdx + 1];
          return (
            <g key={col.round.key}>
              <text
                x={col.x + SVG_COL_WIDTH / 2}
                y={SVG_HEAD_HEIGHT - 10}
                textAnchor="middle"
                className="pl-sb-svg-round-label"
              >
                {truncateSvgLabel(safeLabel(col.round.label, col.round.key), 24)}
              </text>

              {nextCol && nextCol.ties.length > 0
                ? col.ties.map((node, nodeIdx) => {
                    const targetIdx = Math.min(
                      nextCol.ties.length - 1,
                      Math.floor((nodeIdx * nextCol.ties.length) / Math.max(1, col.ties.length)),
                    );
                    const target = nextCol.ties[targetIdx];
                    if (!target) return null;
                    const x1 = node.x + SVG_COL_WIDTH;
                    const midX = x1 + SVG_COL_GAP / 2;
                    const x2 = target.x;
                    const isWinnerLine = node.tie.winnerSide !== null;
                    return (
                      <path
                        key={`conn-${node.tie.id}`}
                        d={`M ${x1} ${node.centerY} H ${midX} V ${target.centerY} H ${x2}`}
                        className={`pl-sb-svg-connector${isWinnerLine ? " is-active" : ""}`}
                      />
                    );
                  })
                : null}

              {col.ties.map((node) => {
                const { tie, x, y } = node;
                const nameA = truncateSvgLabel(
                  safeLabel(tie.teamA.shortName || tie.teamA.name, "Por definir"),
                  17,
                );
                const nameB = truncateSvgLabel(
                  safeLabel(tie.teamB.shortName || tie.teamB.name, "Por definir"),
                  17,
                );
                const scoreA = formatTieSideScore(tie, "A");
                const scoreB = formatTieSideScore(tie, "B");
                const isWinnerA = tie.winnerSide === "A";
                const isWinnerB = tie.winnerSide === "B";
                const isHighlightA = Boolean(
                  highlightTeamSlug && tie.teamA.teamSlug === highlightTeamSlug,
                );
                const isHighlightB = Boolean(
                  highlightTeamSlug && tie.teamB.teamSlug === highlightTeamSlug,
                );
                const hasHighlight = isHighlightA || isHighlightB;
                const midRowY = y + SVG_BOX_HEIGHT / 2;

                return (
                  <g
                    key={tie.id}
                    className={`pl-sb-svg-tie${hasHighlight ? " is-highlighted" : ""}`}
                  >
                    <rect
                      x={x}
                      y={y}
                      width={SVG_COL_WIDTH}
                      height={SVG_BOX_HEIGHT}
                      rx={8}
                      className={`pl-sb-svg-box${hasHighlight ? " is-highlighted" : ""}`}
                    />
                    <line
                      x1={x + 1}
                      y1={midRowY}
                      x2={x + SVG_COL_WIDTH - 1}
                      y2={midRowY}
                      className="pl-sb-svg-divider"
                    />

                    <text
                      x={x + 10}
                      y={y + 20}
                      className={`pl-sb-svg-team${isWinnerA ? " is-winner" : ""}${
                        tie.teamA.placeholder ? " is-placeholder" : ""
                      }`}
                    >
                      {tie.teamA.seed !== null ? `#${tie.teamA.seed} ${nameA}` : nameA}
                    </text>
                    <text
                      x={x + SVG_COL_WIDTH - 10}
                      y={y + 20}
                      textAnchor="end"
                      className={`pl-sb-svg-score num${isWinnerA ? " is-winner" : ""}`}
                    >
                      {scoreA}
                    </text>

                    <text
                      x={x + 10}
                      y={y + 49}
                      className={`pl-sb-svg-team${isWinnerB ? " is-winner" : ""}${
                        tie.teamB.placeholder ? " is-placeholder" : ""
                      }`}
                    >
                      {tie.teamB.seed !== null ? `#${tie.teamB.seed} ${nameB}` : nameB}
                    </text>
                    <text
                      x={x + SVG_COL_WIDTH - 10}
                      y={y + 49}
                      textAnchor="end"
                      className={`pl-sb-svg-score num${isWinnerB ? " is-winner" : ""}`}
                    >
                      {scoreB}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function KnockoutBracketSvgPanel({
  bracket,
  highlightTeamSlug = null,
  onNavigate,
  className,
}: KnockoutBracketSvgPanelProps): React.JSX.Element | null {
  const platformActions = useOptionalPlatformActions();
  const hasConferences = Boolean(bracket && bracket.conferences.length > 0);
  const defaultScope =
    bracket && bracket.conferences.length > 0
      ? (bracket.conferences[0]?.conference ?? "all")
      : "all";
  const [scopeTab, setScopeTab] = useState<string>(defaultScope);

  const navigateSafe = useCallback(
    (href: string) => {
      const safeHref = sanitizeInternalHref(href);
      if (!safeHref) return;
      if (onNavigate) {
        onNavigate(safeHref);
        return;
      }
      if (platformActions) {
        platformActions.navigateTo(safeHref);
        return;
      }
      if (typeof window !== "undefined") {
        window.location.assign(safeHref);
      }
    },
    [onNavigate, platformActions],
  );

  if (!bracket) return null;
  if (bracket.rounds.length === 0 && bracket.conferences.length === 0) return null;

  const safeLeagueLabel = safeLabel(bracket.leagueLabel, bracket.league);

  const conferenceTabs: readonly SofascoreTabItem[] = hasConferences
    ? [
        ...bracket.conferences.map((conf) => ({
          id: conf.conference,
          label: safeLabel(conf.label, conf.conference),
        })),
        ...(bracket.finalsTie ? [{ id: "__finals__", label: "Finales" }] : []),
      ]
    : [];

  const effectiveScope = hasConferences
    ? conferenceTabs.some((tab) => tab.id === scopeTab)
      ? scopeTab
      : (conferenceTabs[0]?.id ?? "all")
    : "all";

  let playInTies: readonly BracketTieData[] = [];
  let treeRounds: readonly BracketRoundData[] = [];

  if (hasConferences) {
    if (effectiveScope === "__finals__" && bracket.finalsTie) {
      treeRounds = [
        {
          key: "finals",
          label: "Finales",
          order: 99,
          twoLegged: false,
          bestOf: bracket.finalsTie.bestOf,
          ties: [bracket.finalsTie],
        },
      ];
    } else {
      const conf =
        bracket.conferences.find((item) => item.conference === effectiveScope) ??
        bracket.conferences[0];
      if (conf) {
        playInTies = conf.playIn;
        treeRounds = conf.rounds;
      }
    }
  } else {
    const playInRound = bracket.rounds.find((r) => r.key === "play_in");
    const nonPlayIn = bracket.rounds.filter((r) => r.key !== "play_in");
    if (playInRound && nonPlayIn.length > 0) {
      playInTies = playInRound.ties;
      treeRounds = nonPlayIn;
    } else {
      treeRounds = bracket.rounds;
    }
  }

  const allDisplayTies: readonly { readonly roundLabel: string; readonly tie: BracketTieData }[] = [
    ...playInTies.map((tie) => ({ roundLabel: "Play-In", tie })),
    ...treeRounds.flatMap((round) =>
      round.ties.map((tie) => ({ roundLabel: safeLabel(round.label, round.key), tie })),
    ),
  ];

  return (
    <SofascoreCard
      title={`Llave eliminatoria · ${safeLeagueLabel}`}
      meta={
        <span className="pl-sb-mode-pill">
          {bracket.mode === "active_knockout" ? "En curso" : "Proyectada"}
        </span>
      }
      className={className}
    >
      <div className="pl-sb-bracket-body" data-knockout-bracket={bracket.format}>
        <div className="pl-sb-bracket-meta-row">
          <p className="pl-sb-bracket-sub">
            {bracketFormatSubtitle(bracket)} · {safeLabel(bracket.season, "2026")}
          </p>
          {bracket.championName ? (
            <span className="pl-sb-champion-pill">
              Campeón: {safeLabel(bracket.championName, "Campeón")}
            </span>
          ) : null}
        </div>

        {conferenceTabs.length > 1 ? (
          <SofascoreTabs
            items={conferenceTabs}
            value={effectiveScope}
            onChange={setScopeTab}
            variant="segmented"
            ariaLabel="Seleccionar conferencia o finales de la llave"
          />
        ) : null}

        {playInTies.length > 0 ? (
          <div className="pl-sb-playin-strip" aria-label="Cruces de Play-In">
            <h3 className="pl-sb-playin-title">Play-In</h3>
            <div className="pl-sb-playin-grid">
              {playInTies.map((tie) => (
                <div key={tie.id} className="pl-sb-playin-card">
                  <div className="pl-sb-playin-row">
                    <span className={tie.winnerSide === "A" ? "is-winner" : undefined}>
                      {tie.teamA.seed !== null ? `#${tie.teamA.seed} ` : ""}
                      {safeLabel(tie.teamA.shortName || tie.teamA.name, "Por definir")}
                    </span>
                    <strong className="num">{formatTieSideScore(tie, "A")}</strong>
                  </div>
                  <div className="pl-sb-playin-row">
                    <span className={tie.winnerSide === "B" ? "is-winner" : undefined}>
                      {tie.teamB.seed !== null ? `#${tie.teamB.seed} ` : ""}
                      {safeLabel(tie.teamB.shortName || tie.teamB.name, "Por definir")}
                    </span>
                    <strong className="num">{formatTieSideScore(tie, "B")}</strong>
                  </div>
                  {tie.note ? <small className="pl-sb-playin-note">{safeLabel(tie.note, "")}</small> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <BracketTreeSvg
          rounds={treeRounds}
          titleLabel={safeLeagueLabel}
          highlightTeamSlug={highlightTeamSlug}
        />

        {allDisplayTies.length > 0 ? (
          <details className="pl-sb-bracket-details">
            <summary>Ver detalle tabular de cruces ({allDisplayTies.length})</summary>
            <div className="pl-sb-details-list">
              {allDisplayTies.map(({ roundLabel, tie }) => {
                const latestLeg = tie.legs[tie.legs.length - 1] ?? null;
                const latestLegHref = latestLeg ? sanitizeInternalHref(latestLeg.href) : null;
                return (
                  <div key={`detail-${tie.id}`} className="pl-sb-detail-row">
                    <span className="pl-sb-detail-round">{roundLabel}</span>
                    <span className="pl-sb-detail-match">
                      {safeLabel(tie.teamA.shortName || tie.teamA.name, "Por definir")}{" "}
                      <strong className="num">{formatTieSideScore(tie, "A")}</strong> –{" "}
                      <strong className="num">{formatTieSideScore(tie, "B")}</strong>{" "}
                      {safeLabel(tie.teamB.shortName || tie.teamB.name, "Por definir")}
                    </span>
                    <span className="pl-sb-detail-status">
                      {tieStatusLabelEs(tie.status)}
                      {tie.bestOf && tie.bestOf > 1 ? ` · BO${tie.bestOf}` : ""}
                    </span>
                    {latestLegHref ? (
                      <a
                        href={latestLegHref}
                        className="pl-sb-detail-link"
                        onClick={(event) => {
                          event.preventDefault();
                          navigateSafe(latestLegHref);
                        }}
                      >
                        Ver partido
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </details>
        ) : null}
      </div>
    </SofascoreCard>
  );
}

export function StandingsBracketsSection({
  title = "Tabla y llaves",
  standings = null,
  attackDefense = null,
  bracket = null,
  highlightTeamSlug = null,
  defaultSplit = "total",
  compact = false,
  onNavigate,
  className,
}: StandingsBracketsSectionProps = {}): React.JSX.Element {
  const hasStandings = Boolean(standings && standings.total.length > 0);
  const hasAttackDefense = Boolean(attackDefense);
  const hasBracket = Boolean(
    bracket && (bracket.rounds.length > 0 || bracket.conferences.length > 0),
  );

  if (!hasStandings && !hasAttackDefense && !hasBracket) {
    return (
      <SofascoreCard title={title} className={className}>
        <SofascoreEmptyState
          title="Sin tabla o llave disponible"
          description="Selecciona una competición activa para consultar clasificación y cruces."
        />
      </SofascoreCard>
    );
  }

  return (
    <div
      className={["pl-sb-root", className].filter(Boolean).join(" ")}
      data-standings-brackets=""
    >
      {hasAttackDefense && attackDefense ? (
        <AttackDefenseOrdinalCard data={attackDefense} compact={compact} />
      ) : null}

      {hasStandings && standings ? (
        <StandingsSplitsPanel
          standings={standings}
          highlightTeamSlug={highlightTeamSlug}
          defaultSplit={defaultSplit}
          compact={compact}
          onNavigate={onNavigate}
        />
      ) : null}

      {hasBracket ? (
        <KnockoutBracketSvgPanel
          bracket={bracket}
          highlightTeamSlug={highlightTeamSlug}
          onNavigate={onNavigate}
        />
      ) : null}
    </div>
  );
}
