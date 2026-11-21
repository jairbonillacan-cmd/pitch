"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import { canonicalTeamHref, parseStrictFiniteNumber } from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreKpiStrip,
  SofascoreSignalPair,
  SofascoreTable,
  SofascoreTabs,
  SofascoreValueCell,
  type SofascoreKpiItem,
  type SofascoreTabItem,
  type SofascoreTableColumn,
} from "../../../components/ui/primitives";
import { LeagueBadge, TeamBadge } from "../../../sports";
import {
  resolveThemedPackSrcSet,
  resolveThemedPackUrl,
  usePackIconBase,
} from "../../../pack-icon-theme";
import { decimalToAmericanInt, formatOddsValue } from "../../access-guard";
import { PropBetLabChart, type PropBetLabPoint } from "../../atomic";
import { ContextualBackButton } from "../../components/ContextualBackButton";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import {
  PlayerPropStreakCard,
  evaluatePropStreak,
  type PropMetricSeries,
} from "../../components/PlayerPropStreakCard";
import { AtmosphereStage, ClubWorkspaceShell } from "../../components/ShellChrome";
import { SportEventIcon } from "../../components/SportEventIcons";
import { resolveCircularCountryFlag } from "../../country-flags";
import { evaluatePropLineProbability } from "../../match-picks-engine";
import {
  useJournalEntries,
  usePlatformActions,
  usePlatformCore,
} from "../../platform-provider";
import type { MatchPick } from "../../types";
import { PersonAvatar } from "./PersonAvatar";
import {
  MIN_SAMPLE_GUARD_LABEL,
  deriveStructuredNbaPlayerPicks,
  evaluatePlayerMinutesGuard,
  parseManualBookOdds,
  parseNumericMetric,
  resolvePlayerLineupSignal,
  resolveTeamNextMatchReferee,
} from "./props-context-helpers";
import type {
  PlayerProfileData,
  TeamMatchHistoryRow,
  TeamPlayerPick,
  TeamSquadPlayer,
  TeamSquadPlayerRecentGame,
} from "./types";

export interface PlayerRivalDefenseContext {
  readonly opponentName: string;
  readonly defenseRank: number;
  readonly leagueSize: number;
  readonly concededPerGame: number | null;
  readonly xgAgainstPerGame: number | null;
  readonly ebLabel: string;
}

export interface PlayerProfileClubViewProps {
  profile: PlayerProfileData;
  nextRivalDefense?: PlayerRivalDefenseContext | null;
}

interface RangeSliderVarsStyle extends React.CSSProperties {
  "--attr-min": string;
  "--attr-max": string;
  "--control-value": string;
}

interface PlayerBetLabSeries {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly defaultLine: number;
  readonly minLine: number;
  readonly maxLine: number;
  readonly step: number;
  readonly points: readonly PropBetLabPoint[];
}

type LineupDisplayState = "confirmed" | "probable" | "unknown";

const POSITION_TITLE_ES: Readonly<Record<TeamSquadPlayer["positionGroup"], string>> = {
  GK: "Portero",
  DEF: "Defensa",
  MID: "Mediocampista",
  FWD: "Delantero",
};

const PREFERRED_FOOT_ES: Readonly<Record<"R" | "L" | "B", string>> = {
  R: "Derecho",
  L: "Izquierdo",
  B: "Ambidiestro",
};

const MONTHS_ES_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

const MONTHS_ES_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const NON_PROP_LABELS = new Set([
  "MIN",
  "MINS",
  "MINUTOS",
  "%TC",
  "%3P",
  "%TL",
  "%CMP",
  "FG%",
  "3P%",
  "FT%",
  "AVG",
  "OBP",
  "SLG",
  "OPS",
  "XG",
]);

function buildPlayerKpiItems(
  player: TeamSquadPlayer,
  sport: PlayerProfileData["sport"],
): SofascoreKpiItem[] {
  if (player.seasonMetrics && player.seasonMetrics.length > 0) {
    return player.seasonMetrics.slice(0, 6).map((m, idx) => ({
      id: m.key || `metric-${idx}`,
      label: m.label,
      value: m.value,
      delta: m.detail ?? null,
    }));
  }

  const { stats, positionGroup } = player;
  if (sport !== "football" && stats.appearances === 0) {
    const statusText =
      player.availability === "injured"
        ? "Lesionado"
        : player.availability === "doubtful"
          ? "En duda"
          : player.availability === "suspended"
            ? "Suspendido"
            : "Activo";
    return [
      { id: "jersey", label: "Dorsal", value: player.jersey ? `#${player.jersey}` : "—" },
      {
        id: "pos",
        label: "Demarcación",
        value: player.positionLabel || POSITION_TITLE_ES[positionGroup],
      },
      {
        id: "height",
        label: "Estatura",
        value: player.heightCm != null ? `${player.heightCm} cm` : "—",
      },
      {
        id: "weight",
        label: "Peso",
        value: player.weightKg != null ? `${player.weightKg} kg` : "—",
      },
      { id: "age", label: "Edad", value: player.age != null ? `${player.age} años` : "—" },
      {
        id: "status",
        label: "Estado en nómina",
        value: statusText,
        delta: player.injuryDetail ?? null,
      },
    ];
  }

  const starts = Math.max(0, stats.appearances - stats.subIns);
  if (positionGroup === "GK") {
    const savePct =
      stats.shotsFaced > 0 ? `${((stats.saves / stats.shotsFaced) * 100).toFixed(1)}%` : "—";
    return [
      {
        id: "apps",
        label: "Apariciones",
        value: String(stats.appearances),
        delta: `${starts} tit. · ${stats.subIns} sup.`,
      },
      { id: "saves", label: "Atajadas", value: String(stats.saves), tone: "brand" },
      {
        id: "faced",
        label: "Tiros recibidos",
        value: String(stats.shotsFaced),
        delta: `Eficiencia ${savePct}`,
      },
      { id: "conceded", label: "Goles concedidos", value: String(stats.goalsConceded) },
      {
        id: "fouls",
        label: "Faltas com. / suf.",
        value: `${stats.foulsCommitted} / ${stats.foulsSuffered}`,
      },
      {
        id: "cards",
        label: "Tarjetas (TA / TR)",
        value: `${stats.yellowCards} / ${stats.redCards}`,
      },
    ];
  }

  const accuracyPct =
    stats.shots > 0
      ? `${((stats.shotsOnTarget / stats.shots) * 100).toFixed(0)}% al arco`
      : "Sin remates";
  const gaTotal = stats.goals + stats.assists;
  const gaPerGame =
    stats.appearances > 0 ? `${(gaTotal / stats.appearances).toFixed(2)}/p` : null;

  return [
    {
      id: "apps",
      label: "Apariciones",
      value: String(stats.appearances),
      delta: `${starts} tit. · ${stats.subIns} sup.`,
    },
    {
      id: "ga",
      label: "Goles / Asist.",
      value: `${stats.goals} / ${stats.assists}`,
      delta: gaPerGame ? `G+A ${gaTotal} (${gaPerGame})` : null,
      tone: "brand",
    },
    {
      id: "shots",
      label: "Tiros totales",
      value: String(stats.shots),
      delta: `${stats.shotsOnTarget} a puerta`,
    },
    { id: "acc", label: "Precisión de tiro", value: accuracyPct },
    {
      id: "fouls",
      label: "Faltas com. / suf.",
      value: `${stats.foulsCommitted} / ${stats.foulsSuffered}`,
    },
    {
      id: "disc",
      label: "Disciplina",
      value: `${stats.yellowCards} TA · ${stats.redCards} TR`,
      delta: `Offside ${stats.offsides}`,
    },
  ];
}

function formatGameLogDateShortEs(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const monthNum = parseStrictFiniteNumber(m[2]);
  const dayNum = parseStrictFiniteNumber(m[3]);
  if (monthNum === null || dayNum === null) return iso;
  const idx = Math.trunc(monthNum) - 1;
  return `${Math.trunc(dayNum)} ${MONTHS_ES_SHORT[idx] ?? m[2]}`;
}

function formatBirthDateLongEs(iso?: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const monthNum = parseStrictFiniteNumber(m[2]);
  const dayNum = parseStrictFiniteNumber(m[3]);
  if (monthNum === null || dayNum === null) return null;
  const monthName = MONTHS_ES_LONG[Math.trunc(monthNum) - 1];
  if (!monthName) return null;
  return `${Math.trunc(dayNum)} de ${monthName} de ${m[1]}`;
}

function formatCompactSlashDate(iso?: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const monthNum = parseStrictFiniteNumber(m[2]);
  const dayNum = parseStrictFiniteNumber(m[3]);
  if (monthNum === null || dayNum === null) return null;
  return `${Math.trunc(dayNum)}/${Math.trunc(monthNum)}/${m[1].slice(2)}`;
}

function extractMinutesFromGameLog(
  game: TeamSquadPlayerRecentGame,
  fallbackMinutes: number,
): number {
  const hit = game.stats.find((s) => {
    const lbl = s.label.trim().toUpperCase();
    return lbl === "MIN" || lbl === "MINS" || lbl === "MINUTOS";
  });
  const parsed = hit ? parseNumericMetric(hit.value) : null;
  if (parsed !== null && Number.isFinite(parsed)) {
    return Math.round(parsed);
  }
  return Math.round(fallbackMinutes);
}

function extractXgFromGameLog(game: TeamSquadPlayerRecentGame): number | null {
  const hit = game.stats.find((s) => s.label.trim().toUpperCase() === "XG");
  if (!hit) return null;
  const parsed = parseNumericMetric(hit.value);
  return parsed !== null && Number.isFinite(parsed) ? parsed : null;
}

function buildRecentGameSeries(
  logs: readonly TeamSquadPlayerRecentGame[],
  sport: PlayerProfileData["sport"],
  fallbackMinutes: number,
): readonly PlayerBetLabSeries[] {
  const rawLabels = Array.from(new Set(logs.flatMap((g) => g.stats.map((s) => s.label))));
  const preferredOrder =
    sport === "basketball"
      ? ["PTS", "REB", "AST", "3PM", "Puntos", "Rebotes", "Asistencias", "Triples"]
      : sport === "football"
        ? ["Tiros a puerta", "Tiros", "Goles", "Asistencias", "Faltas", "Amarillas"]
        : [];
  const countingLabels = rawLabels.filter((lbl) => !NON_PROP_LABELS.has(lbl.trim().toUpperCase()));
  const sourceLabels = countingLabels.length > 0 ? countingLabels : rawLabels;
  const labels = [
    ...preferredOrder.filter((lbl) => sourceLabels.includes(lbl)),
    ...sourceLabels.filter((lbl) => !preferredOrder.includes(lbl)),
  ].slice(0, 4);

  const out: PlayerBetLabSeries[] = [];
  for (const lbl of labels) {
    const chronological = logs.slice().reverse();
    const pts: PropBetLabPoint[] = [];
    for (let idx = 0; idx < chronological.length; idx += 1) {
      const g = chronological[idx]!;
      const found = g.stats.find((s) => s.label === lbl);
      const val = parseNumericMetric(found?.value);
      if (val === null) continue;
      pts.push({
        id: `${lbl}-${g.dateIso}-${idx}`,
        label: (g.opponentAbbr ?? g.opponent).slice(0, 6),
        opponent: g.opponent,
        date: g.dateIso,
        value: val,
        minutes: extractMinutesFromGameLog(g, fallbackMinutes),
        xg: sport === "football" ? extractXgFromGameLog(g) : null,
        isHome: g.isHome === true ? true : g.isHome === false ? false : undefined,
      });
    }
    if (pts.length < 3) continue;
    const vals = pts.map((p) => p.value);
    const maxVal = Math.max(...vals);
    if (maxVal <= 0) continue;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const step = maxVal >= 40 ? 5 : maxVal >= 12 ? 1 : 0.5;
    const defaultLine =
      step === 5
        ? Math.max(4.5, Math.floor(avg / 5) * 5 - 0.5)
        : step === 1
          ? Math.max(0.5, Math.floor(avg) - 0.5)
          : Math.max(0.5, Math.floor(avg) + 0.5);
    out.push({
      key: lbl.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      label: lbl,
      unit: lbl.toLowerCase(),
      defaultLine,
      minLine: step === 5 ? Math.max(0.5, defaultLine - 25) : 0.5,
      maxLine: Math.max(defaultLine + step * 3, Math.ceil(maxVal) + 0.5),
      step,
      points: pts,
    });
  }
  return out;
}

function BioGlyph({
  kind,
}: {
  kind: "cake" | "position" | "height" | "weight" | "foot" | "jersey";
}): React.JSX.Element {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.85,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    className: "pl-player-bio-icon",
  };
  switch (kind) {
    case "cake":
      return (
        <svg {...common}>
          <path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" />
          <path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1" />
          <path d="M2 21h20" />
          <path d="M12 11V7" />
          <path d="M12 4.5c.8 0 1.3-.6 1.3-1.3 0-.8-.8-1.5-1.3-2-.5.5-1.3 1.2-1.3 2 0 .7.5 1.3 1.3 1.3Z" />
        </svg>
      );
    case "position":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.2" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      );
    case "height":
      return (
        <svg {...common}>
          <circle cx="9" cy="5.5" r="2" />
          <path d="M9 10v10M6.5 13.5 9 10l2.5 3.5" />
          <path d="M17 4v16M15 6l2-2 2 2M15 18l2 2 2-2" />
        </svg>
      );
    case "weight":
      return (
        <svg {...common}>
          <path d="M6.5 8h11l1.5 12H5L6.5 8Z" />
          <path d="M9 8a3 3 0 0 1 6 0" />
        </svg>
      );
    case "foot":
      return (
        <svg {...common}>
          <path d="M5 18h14a2 2 0 0 0 2-2v-1c0-1.4-1-2.5-2.4-2.7l-3.4-.5-2.6-4.2A1.5 1.5 0 0 0 11.3 7H8a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2Z" />
          <path d="M8 18v2M12 18v2M16 18v2" />
        </svg>
      );
    case "jersey":
      return (
        <svg {...common}>
          <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23Z" />
        </svg>
      );
  }
}

function PlayerInteractivePickCard({
  pick,
  profile,
  oddsFormat,
  journal,
  onAddParlay,
  onSealJournal,
}: {
  pick: TeamPlayerPick;
  profile: PlayerProfileData;
  oddsFormat: "american" | "decimal";
  journal: ReadonlyArray<{ pickId: string }>;
  onAddParlay: (pick: MatchPick) => boolean;
  onSealJournal: (pick: MatchPick, units: number, userDecimal: number, note?: string) => void;
}): React.JSX.Element {
  const sliderId = useId();
  const oddsInputId = useId();
  const unitsInputId = useId();
  const defaultLine = pick.line ?? 0.5;
  const [lineValue, setLineValue] = useState<number>(defaultLine);
  const [customOddsRaw, setCustomOddsRaw] = useState<string>("");
  const [unitsInput, setUnitsInput] = useState<string>("1");
  const [addedToSlip, setAddedToSlip] = useState<boolean>(false);

  const hasModelDistribution = pick.projectionMean != null && pick.projectionSd != null;
  const isWideScale = defaultLine >= 12;
  const isMidScale = !isWideScale && defaultLine >= 5;
  const lineStep = isWideScale ? 1 : 0.5;
  const minLine = isWideScale
    ? Math.max(0.5, defaultLine - 6)
    : isMidScale
      ? Math.max(0.5, defaultLine - 3)
      : 0.5;
  const maxLine = isWideScale
    ? defaultLine + 6
    : isMidScale
      ? defaultLine + 3
      : Math.max(defaultLine + 2, 3.5);

  const liveEval = hasModelDistribution
    ? evaluatePropLineProbability(pick.projectionMean!, pick.projectionSd!, lineValue)
    : null;

  const activeProb = liveEval ? liveEval.pOver : (pick.p ?? 0.5);
  const activeFairDec = liveEval ? liveEval.fairOverDecimal : (pick.fairDecimal ?? 2.0);
  const parsedCustom = parseManualBookOdds(customOddsRaw);
  const hasCustomOdds = parsedCustom !== null;
  const hasInvalidOdds = customOddsRaw.trim().length > 0 && !hasCustomOdds;
  const activeBookDec = hasCustomOdds && parsedCustom !== null ? parsedCustom : activeFairDec;
  const edgePts = (activeProb - 1 / activeBookDec) * 100;
  const evPct = (activeProb * activeBookDec - 1) * 100;

  const constructedPickId = `player-prop:${profile.league}:${profile.team.slug}:${profile.player.slug}:${pick.marketKey}:${lineValue.toFixed(1)}`;
  const inParlay = addedToSlip;
  const alreadySealed = journal.some((j) => j.pickId === constructedPickId);
  const engineLabel = profile.sport === "basketball" ? "Tachyon NBA Lab" : "Tachyon Player Lab";

  const sliderStyle: RangeSliderVarsStyle = {
    "--attr-min": String(minLine),
    "--attr-max": String(maxLine),
    "--control-value": String(lineValue),
  };

  const buildMatchPick = (): MatchPick => {
    const fixture = profile.nextFixture;
    const matchLabel = fixture
      ? fixture.isHome
        ? `${fixture.opponent.shortName} @ ${profile.team.shortName}`
        : `${profile.team.shortName} @ ${fixture.opponent.shortName}`
      : `${profile.team.name} · ${profile.leagueLabel}`;
    const gameId =
      fixture?.id ?? `player:${profile.league}:${profile.team.slug}:${profile.player.slug}`;
    const kickoffLocal = fixture?.dateLabel ?? profile.seasonLabel;

    return {
      id: constructedPickId,
      gameId,
      league: profile.league,
      leagueLabel: profile.leagueLabel,
      matchLabel,
      kickoffLocal,
      gameStatus: "NS",
      slotIndex: 99,
      category: "valor",
      categoryLabel: `Jugador · ${pick.marketLabel}`,
      risk: activeProb >= 0.66 ? "conservador" : activeProb >= 0.52 ? "medio" : "arriesgado",
      engineKey: "tachyon",
      engineName: engineLabel,
      marketGroup: "Player Props",
      selectionKey: `over_${lineValue.toFixed(1)}`,
      conflictGroup: "independent",
      label: `${profile.player.name} · Más de ${lineValue.toFixed(1)} ${pick.marketLabel}`,
      rationale:
        pick.rationale ??
        `Proyección individual de ${profile.player.name} en ${profile.team.shortName}.`,
      p: activeProb,
      fairDecimal: activeFairDec,
      fairAmerican: decimalToAmericanInt(activeFairDec),
      marketDecimal: hasCustomOdds && parsedCustom !== null ? parsedCustom : null,
      marketAmerican:
        hasCustomOdds && parsedCustom !== null ? decimalToAmericanInt(parsedCustom) : null,
      edgePts: hasCustomOdds ? edgePts : 0,
      confidenceScore: Math.round(Math.min(94, Math.max(54, activeProb * 100 + 6))),
      suggestedUnits: 1.0,
    };
  };

  return (
    <article className="pl-pb-pick-tile" data-player-pick={pick.id}>
      <div className="pl-pb-pick-head">
        <div className="pl-pb-pick-copy">
          <div className="pl-pb-lab-badges">
            {pick.statCode ? <span className="pl-pb-code num">{pick.statCode}</span> : null}
            <span className="pl-pb-pick-market">{pick.marketLabel}</span>
            {pick.minMinutesGuard ? (
              <span className="pl-pb-status-pill is-guard">
                {profile.sport === "basketball" ? "Muestra ≥ 18 min/p" : MIN_SAMPLE_GUARD_LABEL}
              </span>
            ) : null}
          </div>
          <h3 className="pl-pb-pick-title">
            {hasModelDistribution
              ? `Más de ${lineValue.toFixed(1)} ${pick.marketLabel.toLowerCase()}`
              : pick.selectionLabel}
          </h3>
        </div>

        <SofascoreValueCell
          probPct={activeProb * 100}
          fairLabel={formatOddsValue(activeFairDec, oddsFormat)}
          bestBookLabel={hasCustomOdds ? "Tu casa" : null}
          bestOddsLabel={hasCustomOdds ? formatOddsValue(activeBookDec, oddsFormat) : null}
          evPct={hasCustomOdds ? evPct : null}
        />
      </div>

      {hasModelDistribution ? (
        <div className="pl-pb-streak-slider">
          <div className="pl-pb-streak-slider-row">
            <label htmlFor={sliderId} style={{ color: "var(--pl-text-muted)" }}>
              Línea evaluada (<strong className="num">{lineValue.toFixed(1)}</strong>)
            </label>
            <span className="num font-semibold">
              Proy. Spacetime: {pick.projectionMean!.toFixed(2)} ± {pick.projectionSd!.toFixed(2)}
            </span>
          </div>
          <input
            id={sliderId}
            type="range"
            min={minLine}
            max={maxLine}
            step={lineStep}
            value={lineValue}
            style={sliderStyle}
            aria-valuetext={`Más de ${lineValue.toFixed(1)} ${pick.marketLabel} (${(activeProb * 100).toFixed(1)} por ciento)`}
            onChange={(e) => {
              const parsed = parseStrictFiniteNumber(e.target.value);
              if (parsed !== null) setLineValue(parsed);
            }}
            className="pl-range-slider"
          />
        </div>
      ) : null}

      {pick.rationale ? <p className="pl-pb-context-note">{pick.rationale}</p> : null}

      <div className="pl-pb-pick-inputs">
        <div className="pl-pb-field">
          <label htmlFor={oddsInputId} className="pl-pb-field-label">
            Compara con tu casa (dec. o amer.)
          </label>
          <input
            id={oddsInputId}
            type="text"
            inputMode="decimal"
            autoCorrect="off"
            spellCheck={false}
            value={customOddsRaw}
            onChange={(e) => setCustomOddsRaw(e.target.value)}
            placeholder={formatOddsValue(activeFairDec, oddsFormat)}
            className="pl-pb-input num"
          />
        </div>

        <div className="pl-pb-field">
          <label htmlFor={unitsInputId} className="pl-pb-field-label num">
            Unidades para bitácora
            {hasCustomOdds ? ` · Ventaja ${edgePts >= 0 ? "+" : ""}${edgePts.toFixed(1)} pts` : ""}
          </label>
          <input
            id={unitsInputId}
            type="number"
            inputMode="decimal"
            min={0.25}
            max={10}
            step={0.25}
            value={unitsInput}
            onChange={(e) => setUnitsInput(e.target.value)}
            className="pl-pb-input num"
          />
        </div>
      </div>

      {hasInvalidOdds ? (
        <p className="pl-pb-comparator-hint is-error" role="alert">
          Ingresa un momio decimal mayor a 1.01 o americano válido.
        </p>
      ) : hasCustomOdds ? (
        <div className="pl-pb-comparator-result num">
          <span>
            Justo PitchLab: <strong>{formatOddsValue(activeFairDec, oddsFormat)}</strong>
          </span>
          <SofascoreSignalPair evPct={evPct} compact />
        </div>
      ) : null}

      <div className="pl-pb-pick-actions">
        <Button
          variant="secondary"
          size="sm"
          disabled={inParlay}
          onClick={() => {
            const ok = onAddParlay(buildMatchPick());
            if (ok) setAddedToSlip(true);
          }}
        >
          <MaestroIcon name={inParlay ? "check" : "plus"} size={12} />
          <span>{inParlay ? "En tu boleto Parlay" : "Agregar al Parlay"}</span>
        </Button>

        <Button
          variant="primary"
          size="sm"
          disabled={alreadySealed}
          onClick={() => {
            const parsedUnits = parseStrictFiniteNumber(unitsInput);
            const units = Math.max(0.25, Math.min(10, parsedUnits ?? 1));
            onSealJournal(
              buildMatchPick(),
              units,
              activeBookDec,
              `Jugador · Media ${pick.projectionMean?.toFixed(2) ?? "N/D"}`,
            );
          }}
        >
          <MaestroIcon name={alreadySealed ? "check" : "ticket"} size={12} />
          <span>{alreadySealed ? "Registrado en Bitácora" : "Registrar en Bitácora"}</span>
        </Button>
      </div>
    </article>
  );
}

export function PlayerProfileClubView({
  profile,
  nextRivalDefense = null,
}: PlayerProfileClubViewProps): React.JSX.Element {
  const labComparatorId = useId();
  const { dataset, viewerRole, oddsFormat, upgradeHref } = usePlatformCore();
  const { addPickToParlay, sealPickToJournal, navigateTo } = usePlatformActions();
  const journal = useJournalEntries();
  const iconBase = usePackIconBase();

  const [selectedLabMetricKey, setSelectedLabMetricKey] = useState<string>("");
  const [labLinesByKey, setLabLinesByKey] = useState<Readonly<Record<string, number>>>({});
  const [labOddsRaw, setLabOddsRaw] = useState<string>("");

  const leagueHref = `/app/${profile.league}`;
  const teamHref = canonicalTeamHref(profile.league, profile.team.slug);
  const squadHref = `${teamHref}?tab=plantilla`;
  const compareHref = `/app/comparar?modo=jugadores&liga=${profile.league}&a=${profile.team.slug}:${profile.player.slug}`;
  const isVisitorRestricted = viewerRole === "visitor" || profile.picksLocked;

  const lineupSignal = useMemo(
    () =>
      resolvePlayerLineupSignal(dataset.games, {
        league: profile.league,
        teamSlug: profile.team.slug,
        playerName: profile.player.name,
        gameId: profile.nextFixture?.id ?? null,
        sport: profile.sport,
        explicitStatus: profile.lineupStatus ?? profile.player.lineupStatus ?? null,
      }),
    [
      dataset.games,
      profile.league,
      profile.lineupStatus,
      profile.nextFixture?.id,
      profile.player.lineupStatus,
      profile.player.name,
      profile.sport,
      profile.team.slug,
    ],
  );

  const lineupState: LineupDisplayState =
    lineupSignal?.status === "confirmed"
      ? "confirmed"
      : lineupSignal?.status === "probable"
        ? "probable"
        : "unknown";

  const lineupDisplayLabel =
    lineupState === "confirmed"
      ? lineupSignal?.label ?? (profile.sport === "football" ? "XI confirmado" : "Titular confirmado")
      : lineupState === "probable"
        ? lineupSignal?.label ?? (profile.sport === "football" ? "XI probable" : "Titular probable")
        : "Alineación por confirmar";

  const minutesGuard = useMemo(
    () => evaluatePlayerMinutesGuard(profile.player, profile.sport),
    [profile.player, profile.sport],
  );

  const nextMatchReferee = useMemo(
    () =>
      resolveTeamNextMatchReferee(
        dataset.games,
        profile.league,
        profile.team.slug,
        profile.nextFixture?.id ?? null,
        profile.nextMatchReferee ?? null,
      ),
    [
      dataset.games,
      profile.league,
      profile.nextFixture?.id,
      profile.nextMatchReferee,
      profile.team.slug,
    ],
  );

  const isPlayerUnavailable =
    profile.player.availability === "injured" ||
    profile.player.availability === "suspended" ||
    lineupSignal?.status === "ruled_out";

  const effectiveCandidatePicks = useMemo<TeamPlayerPick[]>(() => {
    if (isVisitorRestricted || isPlayerUnavailable) return [];

    if (profile.sport === "basketball") {
      const derivedNba = deriveStructuredNbaPlayerPicks({
        player: profile.player,
        league: profile.league,
        teamSlug: profile.team.slug,
        teamName: profile.team.name,
        nextOpponent: profile.nextFixture?.opponent.shortName ?? null,
        datasetProps: dataset.playerProps,
        lineupSignal,
      });
      if (profile.player.candidatePicks.length === 0) return derivedNba;
      const seenKeys = new Set(profile.player.candidatePicks.map((pk) => pk.marketKey));
      return [
        ...profile.player.candidatePicks,
        ...derivedNba.filter((pk) => !seenKeys.has(pk.marketKey)),
      ];
    }

    if (!minutesGuard.qualified) return [];
    return profile.player.candidatePicks.map((pk) => ({
      ...pk,
      minMinutesGuard: pk.minMinutesGuard ?? true,
      lineupStatus:
        pk.lineupStatus ??
        (lineupSignal?.status === "confirmed" || lineupSignal?.status === "probable"
          ? lineupSignal.status
          : null),
    }));
  }, [
    dataset.playerProps,
    isPlayerUnavailable,
    isVisitorRestricted,
    lineupSignal,
    minutesGuard.qualified,
    profile.league,
    profile.nextFixture?.opponent.shortName,
    profile.player,
    profile.sport,
    profile.team.name,
    profile.team.slug,
  ]);

  const kpiItems = useMemo(
    () => buildPlayerKpiItems(profile.player, profile.sport),
    [profile.player, profile.sport],
  );

  const betLabSeries = useMemo(() => {
    const logs = profile.player.recentGames;
    if (!logs || logs.length < 3) return [];
    const fallbackMinutes = minutesGuard.avgMinutes ?? 0;
    return buildRecentGameSeries(logs, profile.sport, fallbackMinutes);
  }, [minutesGuard.avgMinutes, profile.player.recentGames, profile.sport]);

  const activeLabSeries = useMemo(
    () => betLabSeries.find((s) => s.key === selectedLabMetricKey) ?? betLabSeries[0] ?? null,
    [betLabSeries, selectedLabMetricKey],
  );

  const activeLabLine = activeLabSeries
    ? (labLinesByKey[activeLabSeries.key] ?? activeLabSeries.defaultLine)
    : 0.5;

  const labTabItems = useMemo<SofascoreTabItem[]>(
    () => betLabSeries.map((s) => ({ id: s.key, label: s.label })),
    [betLabSeries],
  );

  const labEvaluation = useMemo(() => {
    if (!activeLabSeries) return null;
    const summary = evaluatePropStreak(
      activeLabSeries.points.map((pt) => ({
        label: pt.label,
        opponent: pt.opponent,
        date: pt.date,
        value: pt.value,
      })),
      activeLabLine,
      activeLabSeries.points.length,
    );

    const matchingPick =
      effectiveCandidatePicks.find((pk) => {
        const lbl = pk.marketLabel.toLowerCase();
        const code = (pk.statCode ?? "").toLowerCase();
        const target = activeLabSeries.label.toLowerCase();
        return code === target || lbl.includes(target) || target.includes(lbl);
      }) ?? null;

    if (
      !isVisitorRestricted &&
      matchingPick &&
      matchingPick.projectionMean != null &&
      matchingPick.projectionSd != null
    ) {
      const modelEv = evaluatePropLineProbability(
        matchingPick.projectionMean,
        matchingPick.projectionSd,
        activeLabLine,
      );
      return {
        prob: modelEv.pOver,
        fairDecimal: modelEv.fairOverDecimal,
      };
    }

    return {
      prob: summary.pCalibrated,
      fairDecimal: summary.fairDecimal,
    };
  }, [activeLabLine, activeLabSeries, effectiveCandidatePicks, isVisitorRestricted]);

  const parsedLabBookDec = parseManualBookOdds(labOddsRaw);
  const hasLabBookOdds = parsedLabBookDec !== null;
  const hasInvalidLabBookOdds = labOddsRaw.trim().length > 0 && !hasLabBookOdds;
  const labEvPct =
    hasLabBookOdds && parsedLabBookDec !== null && labEvaluation
      ? (labEvaluation.prob * parsedLabBookDec - 1) * 100
      : null;
  const labEdgePts =
    hasLabBookOdds && parsedLabBookDec !== null && labEvaluation
      ? (labEvaluation.prob - 1 / parsedLabBookDec) * 100
      : null;

  const streakFallbackSeries = useMemo<PropMetricSeries[]>(
    () =>
      betLabSeries.map((s) => ({
        key: s.key,
        label: s.label,
        unit: s.unit,
        defaultLine: s.defaultLine,
        minLine: s.minLine,
        maxLine: s.maxLine,
        step: s.step,
        points: s.points.map((pt) => ({
          label: pt.label,
          opponent: pt.opponent,
          date: pt.date,
          value: pt.value,
          minutes: pt.minutes,
          xg: pt.xg,
          isHome: pt.isHome,
        })),
      })),
    [betLabSeries],
  );

  const birthDateLong = formatBirthDateLongEs(profile.player.birthDate);
  const birthAndAgeLabel =
    birthDateLong && profile.player.age != null
      ? `${birthDateLong} (${profile.player.age})`
      : birthDateLong
        ? birthDateLong
        : profile.player.age != null
          ? `${profile.player.age} años`
          : null;
  const footLabel = profile.player.preferredFoot
    ? PREFERRED_FOOT_ES[profile.player.preferredFoot]
    : null;
  const positionDisplay =
    profile.sport === "football"
      ? POSITION_TITLE_ES[profile.player.positionGroup]
      : profile.player.positionLabel || POSITION_TITLE_ES[profile.player.positionGroup];
  const activeCoach = profile.coach ?? (profile.coachName ? { name: profile.coachName } : null);
  const countryFlag = resolveCircularCountryFlag(
    profile.player.nationality,
    profile.player.nationalityCode,
  );
  const countryLabel = profile.player.nationality ?? profile.player.nationalityCode ?? null;

  const lastMatch = profile.lastMatch ?? null;
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

  const nextUpcoming = profile.nextFixture ?? null;
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

  const hasHeroMatches = Boolean(lastMatchSides || nextMatchSides);

  const navigateOnPlainClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      navigateTo(href);
    },
    [navigateTo],
  );

  const playerGameLogColumns = useMemo<SofascoreTableColumn<TeamSquadPlayerRecentGame>[]>(() => {
    const statHeaders = profile.player.recentGames?.[0]?.stats.map((s) => s.label) ?? [];
    const baseCols: SofascoreTableColumn<TeamSquadPlayerRecentGame>[] = [
      {
        key: "date",
        header: "Fecha",
        sticky: true,
        render: (row) => (
          <span className="num whitespace-nowrap">{formatGameLogDateShortEs(row.dateIso)}</span>
        ),
      },
      {
        key: "rival",
        header: "Rival",
        render: (row) => (
          <span className="whitespace-nowrap">
            <span style={{ color: "var(--pl-text-muted)" }}>
              {row.isHome === true ? "vs " : row.isHome === false ? "@ " : ""}
            </span>
            <strong>{row.opponentAbbr ?? row.opponent}</strong>
          </span>
        ),
      },
      {
        key: "res",
        header: "Res.",
        render: (row) => {
          const resEs =
            row.result === "W" ? "G" : row.result === "L" ? "P" : row.result === "D" ? "E" : "—";
          return (
            <span className="pl-pb-gamelog-res num">
              <span className={`pl-form-sq is-${resEs === "G" || resEs === "P" ? resEs : "E"} is-xs`}>
                {resEs}
              </span>
              <span>{row.score ?? ""}</span>
            </span>
          );
        },
      },
    ];

    for (let cIdx = 0; cIdx < statHeaders.length; cIdx += 1) {
      const lbl = statHeaders[cIdx]!;
      baseCols.push({
        key: `stat-${cIdx}-${lbl}`,
        header: lbl,
        numeric: true,
        align: "end",
        render: (row) => <strong className="num">{row.stats[cIdx]?.value ?? "—"}</strong>,
      });
    }

    return baseCols;
  }, [profile.player.recentGames]);

  const teamRecentColumns = useMemo<SofascoreTableColumn<TeamMatchHistoryRow>[]>(
    () => [
      {
        key: "date",
        header: "Fecha",
        sticky: true,
        render: (m) => <span className="num whitespace-nowrap">{m.dateLabel}</span>,
      },
      {
        key: "rival",
        header: "Rival",
        render: (m) => (
          <strong className="whitespace-nowrap">{m.opponent.shortName || m.opponent.name}</strong>
        ),
      },
      {
        key: "venue",
        header: "Sede",
        render: (m) => (
          <span style={{ color: "var(--pl-text-muted)" }}>
            {m.neutralSite ? "Neutral" : m.isHome ? "Local" : "Visita"}
          </span>
        ),
      },
      {
        key: "score",
        header: "Marcador",
        numeric: true,
        align: "end",
        render: (m) => (
          <span className="pl-pb-gamelog-res num">
            <span
              className={`pl-form-sq is-${m.outcome === "G" || m.outcome === "P" ? m.outcome : "E"} is-xs`}
            >
              {m.outcome}
            </span>
            <strong>
              {m.teamScore}–{m.opponentScore}
            </strong>
          </span>
        ),
      },
    ],
    [],
  );

  const guardLabelEs =
    profile.sport === "basketball" ? "Muestra ≥ 18 min/p" : MIN_SAMPLE_GUARD_LABEL;

  return (
    <AtmosphereStage activePath={leagueHref}>
      <ClubWorkspaceShell activePath={leagueHref}>
        <nav aria-label="Ruta del jugador" className="pl-team-crumb">
          <ContextualBackButton fallbackHref={teamHref} />
          <ol className="pl-team-crumb-list">
            <li>
              <a
                href={leagueHref}
                onClick={(e) => navigateOnPlainClick(e, leagueHref)}
                className="pl-team-crumb-link"
              >
                {profile.leagueLabel}
              </a>
            </li>
            <li aria-hidden="true" className="pl-team-crumb-sep">
              ▸
            </li>
            <li>
              <a
                href={teamHref}
                onClick={(e) => navigateOnPlainClick(e, teamHref)}
                className="pl-team-crumb-link"
              >
                {profile.team.name}
              </a>
            </li>
            <li aria-hidden="true" className="pl-team-crumb-sep">
              ▸
            </li>
            <li>
              <a
                href={squadHref}
                onClick={(e) => navigateOnPlainClick(e, squadHref)}
                className="pl-team-crumb-link"
              >
                Plantilla
              </a>
            </li>
            <li aria-hidden="true" className="pl-team-crumb-sep hidden sm:inline">
              ▸
            </li>
            <li aria-current="page" className="pl-team-crumb-current hidden sm:inline truncate">
              {profile.player.name}
            </li>
          </ol>
        </nav>

        <div className="pl-pb-page">
          <SofascoreCard as="section">
            <div className="pl-pb-player-hero" data-team-hero="player">
              <div className={`pl-player-hero-top ${hasHeroMatches ? "has-matches" : ""}`.trim()}>
                <div className="pl-player-hero-identity">
                  <PersonAvatar
                    photoKey={profile.player.photoKey}
                    fallbackPhotoKey={profile.player.fallbackPhotoKey}
                    role="player"
                    size={84}
                    priority
                    className="pl-player-hero-avatar"
                  />

                  <div className="pl-player-hero-copy">
                    <h1 className="pl-player-hero-title">{profile.player.name}</h1>

                    <div className="pl-player-hero-club">
                      <a
                        href={teamHref}
                        onClick={(e) => navigateOnPlainClick(e, teamHref)}
                        className="pl-player-hero-club-link"
                      >
                        <TeamBadge
                          league={profile.league}
                          slug={profile.team.slug}
                          name={profile.team.name}
                          size={28}
                        />
                        <span className="pl-player-hero-club-copy">
                          <strong>{profile.team.name}</strong>
                          <small>
                            {profile.leagueLabel} · {profile.seasonLabel}
                            {activeCoach
                              ? ` · ${profile.sport === "football" ? "DT" : "Entrenador"}: ${activeCoach.name}`
                              : ""}
                          </small>
                        </span>
                      </a>
                    </div>

                    {profile.player.availability && profile.player.availability !== "available" ? (
                      <div className="pl-sq-injury">
                        <strong className="pl-sq-injury-status">
                          {profile.player.availability === "suspended"
                            ? "Suspendido"
                            : profile.player.availability === "doubtful"
                              ? "En duda"
                              : "Lesionado"}
                        </strong>
                        {profile.player.injuryDetail ? (
                          <span className="pl-sq-injury-detail">
                            · {profile.player.injuryDetail}
                          </span>
                        ) : null}
                        {profile.player.expectedReturn ? (
                          <span className="pl-sq-injury-detail num">
                            (regreso est. {profile.player.expectedReturn})
                          </span>
                        ) : null}
                      </div>
                    ) : nextUpcoming || lineupState !== "unknown" ? (
                      <div className="pl-pb-lab-badges">
                        <span
                          className={`pl-pb-status-pill is-${lineupState}`}
                          data-player-lineup-signal={lineupState}
                        >
                          {lineupDisplayLabel}
                          {lineupSignal?.formation ? ` · ${lineupSignal.formation}` : ""}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {hasHeroMatches ? (
                  <div className="pl-team-hero-matches">
                    <div className="pl-team-mini-col">
                      <span className="pl-team-mini-heading">Partido anterior</span>
                      {lastMatch && lastMatchSides ? (
                        lastMatch.gameHref ? (
                          <a
                            href={lastMatch.gameHref}
                            onClick={(e) => navigateOnPlainClick(e, lastMatch.gameHref!)}
                            className="pl-team-mini-card is-link"
                            aria-label={`Partido anterior: ${lastMatchSides.home.shortName} ${lastMatchSides.home.score} - ${lastMatchSides.away.score} ${lastMatchSides.away.shortName}`}
                          >
                            <div className="pl-team-mini-head">
                              <LeagueBadge
                                league={profile.league}
                                label={profile.leagueLabel}
                                size={15}
                              />
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
                                  <span
                                    className={`truncate ${lastMatchSides.homeWon ? "is-strong" : "is-dim"}`}
                                  >
                                    {lastMatchSides.home.shortName}
                                  </span>
                                  <strong
                                    className={`num ${lastMatchSides.homeWon ? "is-strong" : "is-dim"}`}
                                  >
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
                                  <span
                                    className={`truncate ${lastMatchSides.awayWon ? "is-strong" : "is-dim"}`}
                                  >
                                    {lastMatchSides.away.shortName}
                                  </span>
                                  <strong
                                    className={`num ${lastMatchSides.awayWon ? "is-strong" : "is-dim"}`}
                                  >
                                    {lastMatchSides.away.score}
                                  </strong>
                                </div>
                              </div>
                            </div>
                          </a>
                        ) : (
                          <div className="pl-team-mini-card">
                            <div className="pl-team-mini-head">
                              <LeagueBadge
                                league={profile.league}
                                label={profile.leagueLabel}
                                size={15}
                              />
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
                                  <span
                                    className={`truncate ${lastMatchSides.homeWon ? "is-strong" : "is-dim"}`}
                                  >
                                    {lastMatchSides.home.shortName}
                                  </span>
                                  <strong
                                    className={`num ${lastMatchSides.homeWon ? "is-strong" : "is-dim"}`}
                                  >
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
                                  <span
                                    className={`truncate ${lastMatchSides.awayWon ? "is-strong" : "is-dim"}`}
                                  >
                                    {lastMatchSides.away.shortName}
                                  </span>
                                  <strong
                                    className={`num ${lastMatchSides.awayWon ? "is-strong" : "is-dim"}`}
                                  >
                                    {lastMatchSides.away.score}
                                  </strong>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      ) : (
                        <div className="pl-team-mini-card is-empty">
                          <span>Sin resultado reciente</span>
                        </div>
                      )}
                    </div>

                    <div className="pl-team-mini-col">
                      <span className="pl-team-mini-heading">Partido siguiente</span>
                      {nextUpcoming && nextMatchSides ? (
                        <a
                          href={nextUpcoming.gameHref}
                          onClick={(e) => navigateOnPlainClick(e, nextUpcoming.gameHref)}
                          className="pl-team-mini-card is-link"
                          aria-label={`Partido siguiente: ${nextMatchSides.home.shortName} contra ${nextMatchSides.away.shortName}, ${nextUpcoming.dateLabel} ${nextUpcoming.kickoffLocal}`}
                        >
                          <div className="pl-team-mini-head">
                            <LeagueBadge
                              league={profile.league}
                              label={profile.leagueLabel}
                              size={15}
                            />
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
                                  <span className="pl-team-mini-prob num">
                                    {nextMatchSides.home.probLabel}
                                  </span>
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
                                  <span className="pl-team-mini-prob num">
                                    {nextMatchSides.away.probLabel}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </a>
                      ) : (
                        <div className="pl-team-mini-card is-empty">
                          <span>Sin próximo partido</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <ul className="pl-player-bio-strip" aria-label="Datos biográficos del jugador">
                {countryLabel ? (
                  <li className="pl-player-bio-item">
                    {countryFlag ? (
                      <img
                        src={resolveThemedPackUrl(countryFlag.src, iconBase)}
                        srcSet={resolveThemedPackSrcSet(countryFlag.srcSet, iconBase)}
                        alt=""
                        aria-hidden="true"
                        width={17}
                        height={17}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        className="pl-team-country-flag shrink-0"
                        style={{ width: 17, height: 17 }}
                      />
                    ) : (
                      <MaestroIcon name="globe" size={15} className="pl-player-bio-icon" />
                    )}
                    <span>{countryLabel}</span>
                  </li>
                ) : null}

                {birthAndAgeLabel ? (
                  <li className="pl-player-bio-item num">
                    <BioGlyph kind="cake" />
                    <span>{birthAndAgeLabel}</span>
                  </li>
                ) : null}

                {positionDisplay ? (
                  <li className="pl-player-bio-item">
                    <BioGlyph kind="position" />
                    <span>{positionDisplay}</span>
                  </li>
                ) : null}

                {profile.player.heightCm != null ? (
                  <li className="pl-player-bio-item num">
                    <BioGlyph kind="height" />
                    <span>{profile.player.heightCm} cm</span>
                  </li>
                ) : null}

                {profile.player.weightKg != null ? (
                  <li className="pl-player-bio-item num">
                    <BioGlyph kind="weight" />
                    <span>{profile.player.weightKg} kg</span>
                  </li>
                ) : null}

                {footLabel ? (
                  <li className="pl-player-bio-item">
                    <BioGlyph kind="foot" />
                    <span>{footLabel}</span>
                  </li>
                ) : null}

                {profile.player.jersey ? (
                  <li className="pl-player-bio-item num">
                    <BioGlyph kind="jersey" />
                    <span>Número {profile.player.jersey}</span>
                  </li>
                ) : null}
              </ul>
            </div>
          </SofascoreCard>

          <SofascoreCard
            id="player-stats"
            title="Estadísticas de temporada"
            meta={`Actualizado: ${profile.updatedAt}`}
          >
            <div className="pl-pb-player-lab-stack">
              <SofascoreKpiStrip items={kpiItems} />
              <div className="pl-pb-player-header-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  nativeButton={false}
                  render={
                    <a href={compareHref} onClick={(e) => navigateOnPlainClick(e, compareHref)} />
                  }
                >
                  <MaestroIcon name="sliders" size={13} />
                  <span>Comparar jugador</span>
                </Button>
              </div>
            </div>
          </SofascoreCard>

          {betLabSeries.length > 0 && activeLabSeries ? (
            profile.sport === "football" || profile.sport === "basketball" ? (
              <SofascoreCard
                id="player-betlab"
                title="Bet Lab · Rendimiento vs línea"
                meta={profile.sport === "basketball" ? "0–48m" : "0'–90'"}
              >
                <div className="pl-pb-player-lab-stack">
                  {labTabItems.length > 1 ? (
                    <SofascoreTabs
                      items={labTabItems}
                      value={activeLabSeries.key}
                      onChange={setSelectedLabMetricKey}
                      variant="segmented"
                      ariaLabel="Estadística del Bet Lab"
                    />
                  ) : null}

                  <PropBetLabChart
                    playerName={profile.player.name}
                    statLabel={activeLabSeries.label}
                    unitLabel={activeLabSeries.unit}
                    sport={profile.sport}
                    line={activeLabLine}
                    points={activeLabSeries.points}
                    maxMinutes={profile.sport === "basketball" ? 48 : 90}
                    rivalDefenseRank={nextRivalDefense?.defenseRank ?? null}
                    rivalLeagueSize={nextRivalDefense?.leagueSize ?? null}
                    rivalEbLabel={nextRivalDefense?.ebLabel ?? null}
                    calibratedProb={
                      isVisitorRestricted ? null : (labEvaluation?.prob ?? null)
                    }
                    fairDecimal={
                      isVisitorRestricted ? null : (labEvaluation?.fairDecimal ?? null)
                    }
                    onLineChange={
                      activeLabSeries.step === 0.5
                        ? (nextLine) => {
                            const snapped = Math.round(nextLine * 2) / 2;
                            const clamped = Math.min(
                              activeLabSeries.maxLine,
                              Math.max(activeLabSeries.minLine, snapped),
                            );
                            setLabLinesByKey((prev) => ({
                              ...prev,
                              [activeLabSeries.key]: clamped,
                            }));
                          }
                        : undefined
                    }
                  />

                  {activeLabSeries.step !== 0.5 ? (
                    <div className="pl-pb-line-bar num">
                      <div className="pl-pb-line-readout">
                        <span className="pl-pb-line-readout-label">
                          Línea de {activeLabSeries.label} (paso {activeLabSeries.step})
                        </span>
                        <div className="pl-pb-line-readout-vals">
                          <strong>{activeLabLine.toFixed(1)}</strong>
                        </div>
                      </div>
                      <div
                        className="pl-pb-line-controls"
                        role="group"
                        aria-label={`Ajustar línea de ${activeLabSeries.label}`}
                      >
                        <Button
                          variant="secondary"
                          size="icon-sm"
                          aria-label={`Bajar línea en ${activeLabSeries.step}`}
                          disabled={activeLabLine <= activeLabSeries.minLine}
                          onClick={() => {
                            const next = Math.max(
                              activeLabSeries.minLine,
                              Math.round((activeLabLine - activeLabSeries.step) * 10) / 10,
                            );
                            setLabLinesByKey((prev) => ({
                              ...prev,
                              [activeLabSeries.key]: next,
                            }));
                          }}
                        >
                          −
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={Math.abs(activeLabLine - activeLabSeries.defaultLine) < 0.01}
                          className="num"
                          onClick={() =>
                            setLabLinesByKey((prev) => ({
                              ...prev,
                              [activeLabSeries.key]: activeLabSeries.defaultLine,
                            }))
                          }
                        >
                          Base ({activeLabSeries.defaultLine.toFixed(1)})
                        </Button>
                        <Button
                          variant="secondary"
                          size="icon-sm"
                          aria-label={`Subir línea en ${activeLabSeries.step}`}
                          disabled={activeLabLine >= activeLabSeries.maxLine}
                          onClick={() => {
                            const next = Math.min(
                              activeLabSeries.maxLine,
                              Math.round((activeLabLine + activeLabSeries.step) * 10) / 10,
                            );
                            setLabLinesByKey((prev) => ({
                              ...prev,
                              [activeLabSeries.key]: next,
                            }));
                          }}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {!isVisitorRestricted && labEvaluation ? (
                    <div className="pl-pb-comparator" data-player-lab-comparator="">
                      <div className="pl-pb-comparator-head">
                        <label htmlFor={labComparatorId} className="pl-pb-comparator-label">
                          <MaestroIcon
                            name="activity"
                            size={13}
                            style={{ color: "var(--pl-brand)" }}
                          />
                          <span>Compara con tu casa</span>
                        </label>
                        <span className="pl-pb-line-readout-label num">
                          Momio justo{" "}
                          <strong>
                            {formatOddsValue(labEvaluation.fairDecimal, oddsFormat)}
                          </strong>
                        </span>
                      </div>

                      <div className="pl-pb-comparator-input-row">
                        <div className="pl-pb-comparator-field">
                          <input
                            id={labComparatorId}
                            type="text"
                            inputMode="decimal"
                            autoCorrect="off"
                            spellCheck={false}
                            value={labOddsRaw}
                            onChange={(e) => setLabOddsRaw(e.target.value)}
                            placeholder={formatOddsValue(labEvaluation.fairDecimal, oddsFormat)}
                            className="pl-pb-input num"
                          />
                        </div>
                        {labEvPct !== null ? <SofascoreSignalPair evPct={labEvPct} /> : null}
                      </div>

                      {hasInvalidLabBookOdds ? (
                        <p className="pl-pb-comparator-hint is-error" role="alert">
                          Ingresa un momio decimal mayor a 1.01 (ej. 1.90) o americano (ej. -115).
                        </p>
                      ) : hasLabBookOdds && parsedLabBookDec !== null && labEdgePts !== null ? (
                        <div className="pl-pb-comparator-result num">
                          <span>
                            Tu casa:{" "}
                            <strong>{formatOddsValue(parsedLabBookDec, oddsFormat)}</strong>
                          </span>
                          <span>
                            Ventaja:{" "}
                            <strong>
                              {labEdgePts >= 0 ? "+" : ""}
                              {labEdgePts.toFixed(1)} pts
                            </strong>
                          </span>
                        </div>
                      ) : (
                        <p className="pl-pb-comparator-hint">
                          Ingresa el momio de tu casa para calcular EV+ frente al momio justo de
                          esta línea ({activeLabLine.toFixed(1)} {activeLabSeries.unit}).
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              </SofascoreCard>
            ) : (
              <PlayerPropStreakCard
                playerName={profile.player.name}
                teamName={profile.team.name}
                teamSlug={profile.team.slug}
                league={profile.league}
                photoKey={profile.player.photoKey}
                positionLabel={profile.player.positionLabel}
                oddsFormat={oddsFormat}
                redactCalibratedOdds={isVisitorRestricted}
                series={streakFallbackSeries}
              />
            )
          ) : null}

          {(profile.player.recentGames && profile.player.recentGames.length > 0) ||
          (profile.teamRecentMatches && profile.teamRecentMatches.length > 0) ? (
            <div data-player-recent-games="">
              <SofascoreCard
                id="player-last5"
                title="Últimos 5 partidos"
                meta={
                  profile.player.recentGames && profile.player.recentGames.length > 0
                    ? `${profile.player.recentGames.length} juegos`
                    : `${profile.teamRecentMatches?.length ?? 0} partidos`
                }
                density="compact"
              >
                {profile.player.recentGames && profile.player.recentGames.length > 0 ? (
                  <SofascoreTable
                    caption={`Últimos 5 partidos de ${profile.player.name}`}
                    columns={playerGameLogColumns}
                    rows={profile.player.recentGames}
                    rowKey={(row, idx) => `${row.dateIso}-${idx}`}
                    density="compact"
                  />
                ) : (
                  <SofascoreTable
                    caption={`Últimos 5 partidos recientes de ${profile.team.name}`}
                    columns={teamRecentColumns}
                    rows={profile.teamRecentMatches ?? []}
                    rowKey={(m) => m.id}
                    density="compact"
                  />
                )}
              </SofascoreCard>
            </div>
          ) : null}

          <div data-player-picks-section="">
            <SofascoreCard
              id="player-picks"
              title="Picks individuales aplicables"
              meta={profile.sport === "basketball" ? "Tachyon NBA Lab" : "Tachyon Player Lab"}
            >
              <div className="pl-pb-lab-body">
                {!isVisitorRestricted ? (
                  <div className="pl-pb-lab-badges num">
                    {minutesGuard.qualified && !isPlayerUnavailable ? (
                      <span
                        className="pl-pb-status-pill is-guard"
                        data-player-sample-guard="qualified"
                      >
                        {guardLabelEs}
                        {minutesGuard.avgMinutes !== null
                          ? ` · ${minutesGuard.avgMinutes.toFixed(1)} min/p`
                          : ""}
                      </span>
                    ) : null}
                    <span className={`pl-pb-status-pill is-${lineupState}`}>
                      {lineupDisplayLabel}
                    </span>
                  </div>
                ) : null}
                {!isVisitorRestricted &&
                profile.sport === "football" &&
                nextMatchReferee &&
                (nextMatchReferee.analytics.avgYellow !== null ||
                  nextMatchReferee.analytics.avgFouls !== null) ? (
                  <div className="pl-pb-ref-bar num" data-player-referee-context="">
                    <span className="pl-pb-ref-name">
                      <MaestroIcon name="whistle" size={13} />
                      <span className="truncate">
                        Árbitro: <strong>{nextMatchReferee.analytics.name}</strong>
                      </span>
                    </span>
                    <span className="pl-pb-ref-metrics">
                      {nextMatchReferee.analytics.avgYellow !== null ? (
                        <span className="inline-flex items-center gap-1">
                          <SportEventIcon kind="yellow" size={11} />
                          <span>{nextMatchReferee.analytics.avgYellow.toFixed(1)} amar./p</span>
                        </span>
                      ) : null}
                      {nextMatchReferee.analytics.avgFouls !== null ? (
                        <span>{nextMatchReferee.analytics.avgFouls.toFixed(1)} faltas/p</span>
                      ) : null}
                      <span className="pl-pb-status-pill">
                        {nextMatchReferee.analytics.rigorLabel}
                      </span>
                    </span>
                  </div>
                ) : null}

                {isVisitorRestricted ? (
                  <div className="pl-pb-lock-body" data-cero-fuga-lock="player-picks">
                    <h3 className="pl-pb-lock-title">
                      <MaestroIcon name="lock" size={16} style={{ color: "var(--pl-brand)" }} />
                      <span>Proyecciones y líneas reservadas para Pase PitchLab Ultra</span>
                    </h3>
                    <p className="pl-pb-lock-desc">
                      Las líneas sugeridas, probabilidades calibradas, momios justos y registro
                      directo en Bitácora se habilitan con membresía activa.
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      nativeButton={false}
                      render={
                        <a
                          href={upgradeHref}
                          onClick={(e) => navigateOnPlainClick(e, upgradeHref)}
                        />
                      }
                    >
                      Desbloquear con Pase Ultra
                    </Button>
                  </div>
                ) : isPlayerUnavailable ? (
                  <div data-player-picks-unavailable="">
                    <SofascoreEmptyState
                      title="Jugador no disponible para el próximo partido"
                      description="PitchLab no emite líneas individuales mientras exista baja activa por lesión o suspensión."
                    />
                  </div>
                ) : effectiveCandidatePicks.length === 0 ? (
                  <SofascoreEmptyState
                    title="Sin líneas individuales habilitadas"
                    description={
                      !minutesGuard.qualified
                        ? `Muestra estadística por debajo del umbral mínimo (${guardLabelEs}) para habilitar líneas individuales confiables en este torneo.`
                        : "Muestra estadística todavía acotada (< 3 apariciones o volumen debajo del umbral) para habilitar líneas individuales confiables en este torneo."
                    }
                  />
                ) : (
                  <div className="pl-pb-player-picks-grid">
                    {effectiveCandidatePicks.map((pick) => (
                      <PlayerInteractivePickCard
                        key={pick.id}
                        pick={pick}
                        profile={profile}
                        oddsFormat={oddsFormat}
                        journal={journal}
                        onAddParlay={addPickToParlay}
                        onSealJournal={sealPickToJournal}
                      />
                    ))}
                  </div>
                )}
              </div>
            </SofascoreCard>
          </div>

          {profile.teammates.length > 0 ? (
            <SofascoreCard
              id="player-teammates"
              title={`Más jugadores de ${profile.team.shortName}`}
              meta={
                <a
                  href={squadHref}
                  onClick={(e) => navigateOnPlainClick(e, squadHref)}
                  className="pl-pb-inline-link"
                >
                  Ver plantilla completa →
                </a>
              }
            >
              <div className="pl-pb-teammates-grid">
                {profile.teammates.map((mate) => (
                  <a
                    key={mate.slug}
                    href={mate.href}
                    onClick={(e) => navigateOnPlainClick(e, mate.href)}
                    className="pl-pb-teammate-link"
                  >
                    <span className="pl-pb-teammate-person">
                      <PersonAvatar
                        photoKey={mate.photoKey}
                        fallbackPhotoKey={mate.fallbackPhotoKey}
                        role="player"
                        size={26}
                      />
                      <span className="pl-pb-teammate-name">{mate.shortName}</span>
                    </span>
                    <span className="pl-pb-status-pill num">
                      {mate.jersey ?? mate.positionGroup}
                    </span>
                  </a>
                ))}
              </div>
            </SofascoreCard>
          ) : null}
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
