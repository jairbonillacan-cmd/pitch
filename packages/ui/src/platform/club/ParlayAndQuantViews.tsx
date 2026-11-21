"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import { parseStrictFiniteNumber, sportForLeague, type LeagueId } from "@pitchlab/contracts";
import { Switch } from "@heroui/react";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreFilterBar,
  SofascoreKpiStrip,
  SofascoreSignalPair,
  SofascoreTable,
  SofascoreTabs,
  SofascoreValueCell,
  type SofascoreKpiItem,
  type SofascoreTabItem,
  type SofascoreTableColumn,
} from "../../components/ui/primitives";
import { LeagueBadge, parseUserOdds } from "../../sports";
import {
  formatOddsValue,
  isPickUnlocked,
  pickReferenceDecimal,
} from "../access-guard";
import { resolvePreferredBookQuote } from "../bookmakers";
import {
  buildPersonalQuickParlay,
  DAILY_PARLAY_STYLE_SPECS,
  PARLAY_TARGET_PRESETS,
  type ParlayTargetPresetId,
  type PersonalParlayScope,
} from "../daily-parlay";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { MobileParlaySheet } from "../components/MobileParlaySheet";
import { ConfirmActionDialog } from "../components/PlatformOverlays";
import { SgpCopulaAuditCard } from "../components/SgpCopulaAuditCard";
import {
  AtmosphereStage,
  ClubWorkspaceShell,
} from "../components/ShellChrome";
import { useMediaQuery, useSafeEffect } from "../hooks";
import {
  assessParlayRisk,
  checkParlayCompatibility,
  PARLAY_NON_COMBINABLE_RULES,
  type ParlayCompatibilityResult,
} from "../parlay-engine";
import {
  evaluateBetBuilder,
  matchPickToBetBuilderLeg,
} from "../picks-catalog/bet-builder-math";
import {
  useParlayState,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import type { MatchPick, PlatformGame, RiskBand, SgpCopulaAuditView } from "../types";
import { ALL, SPORTS, shortDateLabel, sportOf, type SportFilter } from "./home/home-model";
import { OddsCompareClubView } from "./OddsCompareView";
import { BetBuilderDrawer, BetBuilderQuickButton } from "./picks/BetBuilderDrawer";
import {
  classifyOddsMovement,
  computeExpectedValuePct,
} from "./picks/BookmakerComparePill";

type ManualCategoryFilter = "all" | "principal" | "totales" | "valor" | "tactico";

interface PickerRow {
  readonly id: string;
  readonly game: PlatformGame;
  readonly pick: MatchPick;
  readonly unlocked: boolean;
  readonly inSlip: boolean;
  readonly sameGameExists: boolean;
  readonly compat: ParlayCompatibilityResult;
  readonly bestBookLabel: string | null;
  readonly bestOddsDecimal: number | null;
  readonly evPct: number | null;
  readonly movement: "steam" | "shortening" | "drifting" | "stable" | null;
}

interface InlineSlipAlert {
  readonly tone: "danger" | "warning" | "info";
  readonly title: string;
  readonly detail: string;
  readonly code?: ParlayCompatibilityResult["code"] | "sgp_hold" | "invalid_odds_input";
}

const INITIAL_MANUAL_ROWS = 14;
const MANUAL_PAGE_STEP = 14;
const AUTO_PREVIEW_TABLE_LIMIT = 8;
const LEG_COUNT_PRESETS = [2, 3, 4, 5, 6, 8, 10] as const;

const CATEGORY_TABS: readonly SofascoreTabItem[] = [
  { id: "all", label: "Todos" },
  { id: "principal", label: "Resultado" },
  { id: "totales", label: "Totales" },
  { id: "valor", label: "Ambos / Valor" },
  { id: "tactico", label: "Táctico" },
];

function riskToneCss(tone: "success" | "info" | "warning" | "danger"): string {
  if (tone === "success") return "var(--pl-success)";
  if (tone === "warning") return "var(--pl-warning)";
  if (tone === "danger") return "var(--pl-danger)";
  return "var(--pl-brand)";
}

function getCompactBlockReason(
  sameGameExists: boolean,
  allowSgp: boolean,
  compat: ParlayCompatibilityResult,
): string {
  if (compat.code === "live") return "En vivo (cerrado)";
  if (compat.code === "finished") return "Finalizado";
  if (compat.code === "duplicate") return "Ya en boleto";
  if (compat.code === "invalid_odds") return "Línea cerrada";
  if ((compat.code === "same_game_disabled" || sameGameExists) && !allowSgp) {
    return "Activar SGP";
  }
  if (compat.code === "sgp_limit") return "Máx. 2 SGP";
  if (compat.code === "exact_score_sgp") return "Exacto no SGP";
  if (compat.code === "logical_contradiction") return "Contradicción";
  if (compat.code === "same_axis") return "Mismo eje";
  return "No combinable";
}

function computeSlipFrechetBounds(
  legs: readonly { readonly pick: MatchPick }[],
): { readonly lower: number; readonly upper: number } {
  if (legs.length === 0) return { lower: 0, upper: 0 };
  const byGame = new Map<string, number[]>();
  for (const { pick } of legs) {
    const p = Math.min(0.99, Math.max(0.01, pick.p));
    const list = byGame.get(pick.gameId) ?? [];
    list.push(p);
    byGame.set(pick.gameId, list);
  }
  let lower = 1;
  let upper = 1;
  for (const probs of byGame.values()) {
    if (probs.length === 1) {
      const p = probs[0] ?? 0.5;
      lower *= p;
      upper *= p;
    } else {
      const sumP = probs.reduce((acc, v) => acc + v, 0);
      const minP = probs.reduce((acc, v) => Math.min(acc, v), 1);
      const lo = Math.max(0.0001, sumP - (probs.length - 1));
      lower *= lo;
      upper *= Math.max(lo, minP);
    }
  }
  return {
    lower: Math.max(0.0001, Math.min(0.99, lower)),
    upper: Math.max(0.0001, Math.min(0.99, upper)),
  };
}

function isManualCategoryFilter(value: string): value is ManualCategoryFilter {
  return (
    value === "all" ||
    value === "principal" ||
    value === "totales" ||
    value === "valor" ||
    value === "tactico"
  );
}

export function ParlayBuilderClubView(): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    hasAccountSession,
    upgradeHref,
    oddsFormat,
    riskPreference,
    preferredBooks,
  } = usePlatformCore();
  const {
    setAllowSgp,
    setParlayStakeUnits,
    addPickToParlay,
    removePickFromParlay,
    clearParlay,
    generateAutoParlay,
    loadParlayPicks,
    sealParlayToJournal,
    openShareTicket,
    navigateTo,
    requestFullShell,
  } = usePlatformActions();
  const { parlayLegs, allowSgp, parlayStakeUnits, parlaySummary } = useParlayState();

  useSafeEffect(() => {
    void requestFullShell();
  }, [requestFullShell]);

  const isCompactViewport = useMediaQuery("(max-width: 1023px)", false);
  const leagueSelectId = useId();

  const [builderMode, setBuilderMode] = useState<"auto" | "manual">("auto");
  const [sportFilter, setSportFilter] = useState<SportFilter>(ALL);
  const [leagueFilter, setLeagueFilter] = useState<LeagueId | typeof ALL>(ALL);
  const [categoryFilter, setCategoryFilter] = useState<ManualCategoryFilter>("all");
  const [manualQuery, setManualQuery] = useState<string>("");
  const [autoRisk, setAutoRisk] = useState<RiskBand>(riskPreference);
  const [targetPreset, setTargetPreset] = useState<ParlayTargetPresetId>("libre");
  const [autoLegCount, setAutoLegCount] = useState<number>(3);
  const [catalogLimit, setCatalogLimit] = useState<number>(INITIAL_MANUAL_ROWS);
  const [bookParlayOddsRaw, setBookParlayOddsRaw] = useState<string>("");
  const [resolvedSgpAudit, setResolvedSgpAudit] = useState<SgpCopulaAuditView | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState<boolean>(false);
  const [inlineAlert, setInlineAlert] = useState<InlineSlipAlert | null>(null);
  const [inspectedRow, setInspectedRow] = useState<{
    readonly pick: MatchPick;
    readonly game: PlatformGame;
  } | null>(null);

  const parsedBookParlayDec = useMemo(() => {
    const trimmed = bookParlayOddsRaw.trim();
    if (!trimmed) return null;
    const parsed = parseUserOdds(trimmed);
    const strict = parseStrictFiniteNumber(parsed);
    return strict !== null && strict > 1.01 ? strict : null;
  }, [bookParlayOddsRaw]);

  const bookOddsInvalid = bookParlayOddsRaw.trim().length > 0 && parsedBookParlayDec === null;

  const openGamesAll = useMemo(
    () => dataset.games.filter((g) => g.status !== "FT" && g.status !== "LIVE"),
    [dataset.games],
  );

  const gamesById = useMemo(() => {
    const map = new Map<string, PlatformGame>();
    for (const g of dataset.games) {
      map.set(g.id, g);
    }
    return map;
  }, [dataset.games]);

  const sportCounts = useMemo(() => {
    const counts: Record<string, number> = { [ALL]: openGamesAll.length };
    for (const g of openGamesAll) {
      const sp = sportOf(g);
      counts[sp] = (counts[sp] ?? 0) + 1;
    }
    return counts;
  }, [openGamesAll]);

  const activeLeagues = useMemo(() => {
    const countsByLeague = new Map<LeagueId, number>();
    for (const g of openGamesAll) {
      if (sportFilter !== ALL && sportOf(g) !== sportFilter) continue;
      countsByLeague.set(g.league, (countsByLeague.get(g.league) ?? 0) + 1);
    }
    return dataset.leagues
      .filter((l) => countsByLeague.has(l.league))
      .map((l) => ({ ...l, openCount: countsByLeague.get(l.league) ?? 0 }))
      .sort((a, b) => b.openCount - a.openCount || a.label.localeCompare(b.label, "es-MX"));
  }, [dataset.leagues, openGamesAll, sportFilter]);

  const effectiveLeague: LeagueId | typeof ALL = useMemo(() => {
    if (leagueFilter === ALL) return ALL;
    return activeLeagues.some((l) => l.league === leagueFilter) ? leagueFilter : ALL;
  }, [activeLeagues, leagueFilter]);

  const scopedLeagueIds = useMemo<LeagueId[]>(() => {
    if (effectiveLeague !== ALL) return [effectiveLeague];
    return activeLeagues.map((l) => l.league);
  }, [activeLeagues, effectiveLeague]);

  const scope = useMemo<PersonalParlayScope>(() => {
    if (effectiveLeague !== ALL) return { kind: "league", league: effectiveLeague };
    if (sportFilter !== ALL) return { kind: "sport", sport: sportFilter };
    return { kind: "all" };
  }, [effectiveLeague, sportFilter]);

  const allOpenGames = useMemo(() => {
    const q = manualQuery.trim().toLowerCase();
    return openGamesAll.filter((g) => {
      if (sportFilter !== ALL && sportOf(g) !== sportFilter) return false;
      if (effectiveLeague !== ALL && g.league !== effectiveLeague) return false;
      if (q) {
        const hay =
          `${g.home.name} ${g.away.name} ${g.home.shortName} ${g.away.shortName} ${g.leagueLabel}`.toLowerCase();
        if (hay.includes(q)) return true;
        return g.picks.some(
          (pk) =>
            pk.label.toLowerCase().includes(q) || pk.categoryLabel.toLowerCase().includes(q),
        );
      }
      return true;
    });
  }, [effectiveLeague, manualQuery, openGamesAll, sportFilter]);

  const maxAutoLegs = Math.max(2, allowSgp ? allOpenGames.length * 2 : allOpenGames.length);
  const effectiveAutoLegCount = Math.min(maxAutoLegs, Math.max(2, autoLegCount));

  const autoPreview = useMemo(
    () =>
      buildPersonalQuickParlay({
        games: dataset.games,
        legCount: effectiveAutoLegCount,
        risk: autoRisk,
        targetPreset,
        scope,
        viewerRole,
        allowSgp,
      }),
    [allowSgp, autoRisk, dataset.games, effectiveAutoLegCount, scope, targetPreset, viewerRole],
  );

  const activePresetSpec =
    PARLAY_TARGET_PRESETS.find((p) => p.id === targetPreset) ?? PARLAY_TARGET_PRESETS[0]!;

  const buildPickerRow = useMemo(() => {
    return (game: PlatformGame, pick: MatchPick): PickerRow => {
      const unlocked = isPickUnlocked(pick, game.status, viewerRole);
      const inSlip = parlayLegs.some((l) => l.pick.id === pick.id);
      const sameGameExists = parlayLegs.some(
        (l) => l.pick.gameId === pick.gameId && l.pick.id !== pick.id,
      );
      const compat = checkParlayCompatibility(parlayLegs, pick, allowSgp);
      const prefQuote = resolvePreferredBookQuote(pick.bookQuotes, preferredBooks);
      const bestOddsDecimal = prefQuote?.decimal ?? pick.marketDecimal ?? null;
      const bestBookLabel = prefQuote?.bookLabel ?? pick.marketBookLabel ?? null;
      const evPct = computeExpectedValuePct(pick.p, bestOddsDecimal);
      const movementInfo = classifyOddsMovement(
        prefQuote?.openingDecimal ?? null,
        bestOddsDecimal,
        prefQuote?.movementDirection ?? null,
      );
      return {
        id: pick.id,
        game,
        pick,
        unlocked,
        inSlip,
        sameGameExists,
        compat,
        bestBookLabel,
        bestOddsDecimal,
        evPct,
        movement: movementInfo?.kind ?? null,
      };
    };
  }, [allowSgp, parlayLegs, preferredBooks, viewerRole]);

  const manualPickerRowsAll = useMemo<PickerRow[]>(() => {
    const q = manualQuery.trim().toLowerCase();
    const rows: PickerRow[] = [];
    for (const game of allOpenGames) {
      for (const pick of game.picks.slice(0, 4)) {
        if (categoryFilter !== "all" && pick.category !== categoryFilter) {
          if (!(categoryFilter === "principal" && pick.category === "conservador")) {
            continue;
          }
        }
        if (q) {
          const matchHay =
            `${game.home.name} ${game.away.name} ${game.home.shortName} ${game.away.shortName} ${game.leagueLabel}`.toLowerCase();
          const pickHay = `${pick.label} ${pick.categoryLabel}`.toLowerCase();
          if (!matchHay.includes(q) && !pickHay.includes(q)) continue;
        }
        rows.push(buildPickerRow(game, pick));
      }
    }
    return rows;
  }, [allOpenGames, buildPickerRow, categoryFilter, manualQuery]);

  const visibleManualRows = useMemo(
    () => manualPickerRowsAll.slice(0, catalogLimit),
    [catalogLimit, manualPickerRowsAll],
  );

  const autoTableRows = useMemo<PickerRow[]>(() => {
    if (autoPreview.status !== "insufficient" && autoPreview.legs.length > 0) {
      const previewRows: PickerRow[] = [];
      for (const leg of autoPreview.legs.slice(0, AUTO_PREVIEW_TABLE_LIMIT)) {
        const game = gamesById.get(leg.pick.gameId);
        if (game) {
          previewRows.push(buildPickerRow(game, leg.pick));
        }
      }
      if (previewRows.length > 0) return previewRows;
    }
    const fallback: PickerRow[] = [];
    for (const game of allOpenGames.slice(0, AUTO_PREVIEW_TABLE_LIMIT)) {
      const topPick = game.picks[0];
      if (topPick) {
        fallback.push(buildPickerRow(game, topPick));
      }
    }
    return fallback;
  }, [allOpenGames, autoPreview.legs, autoPreview.status, buildPickerRow, gamesById]);

  const sgpGameIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { pick } of parlaySummary.legs) {
      counts.set(pick.gameId, (counts.get(pick.gameId) ?? 0) + 1);
    }
    const ids = new Set<string>();
    for (const [gameId, cnt] of counts.entries()) {
      if (cnt >= 2) ids.add(gameId);
    }
    return ids;
  }, [parlaySummary.legs]);

  const betBuilderEval = useMemo(() => {
    if (parlaySummary.legs.length === 0) return null;
    const adapted = parlaySummary.legs.map(({ pick }) =>
      matchPickToBetBuilderLeg(pick, sportForLeague(pick.league)),
    );
    return evaluateBetBuilder(adapted, { offeredBookDecimal: parsedBookParlayDec });
  }, [parlaySummary.legs, parsedBookParlayDec]);

  const frechetBounds = useMemo(
    () => computeSlipFrechetBounds(parlaySummary.legs),
    [parlaySummary.legs],
  );

  const activeSgpAudit = parlaySummary.hasSgpCorrelation ? resolvedSgpAudit : null;

  const effectiveSlipProb = useMemo(() => {
    if (parlaySummary.legs.length === 0) return 0;
    let candidate = betBuilderEval?.jointProbability ?? parlaySummary.combinedProbability;
    if (activeSgpAudit) {
      if (parlaySummary.legs.length === activeSgpAudit.nLegs) {
        candidate = activeSgpAudit.jointProbability;
      } else {
        const localMult = parlaySummary.sgpCorrelationMultiplier ?? 1;
        candidate =
          (parlaySummary.combinedProbability / Math.max(localMult, 0.05)) *
          activeSgpAudit.correlationMultiplier;
      }
    }
    return Math.min(frechetBounds.upper, Math.max(frechetBounds.lower, candidate));
  }, [activeSgpAudit, betBuilderEval, frechetBounds.lower, frechetBounds.upper, parlaySummary]);

  const effectiveSlipFairDec = useMemo(() => {
    if (parlaySummary.legs.length === 0) return parlaySummary.fairDecimal;
    if (
      activeSgpAudit &&
      parlaySummary.legs.length === activeSgpAudit.nLegs &&
      activeSgpAudit.fairCombinedDecimal > 1
    ) {
      return activeSgpAudit.fairCombinedDecimal;
    }
    return Math.max(1.01, Math.round((1 / Math.max(effectiveSlipProb, 0.0001)) * 100) / 100);
  }, [activeSgpAudit, effectiveSlipProb, parlaySummary.fairDecimal, parlaySummary.legs.length]);

  const slipRisk = useMemo(
    () =>
      assessParlayRisk({
        ...parlaySummary,
        combinedProbability: effectiveSlipProb,
      }),
    [effectiveSlipProb, parlaySummary],
  );

  const effectiveSlipBookDec =
    parsedBookParlayDec && parsedBookParlayDec > 1
      ? parsedBookParlayDec
      : parlaySummary.bookDecimal;
  const effectiveSlipEdgePts =
    parlaySummary.legs.length > 0 && effectiveSlipBookDec > 1
      ? (effectiveSlipProb - 1 / effectiveSlipBookDec) * 100
      : parlaySummary.edgePts;
  const effectiveReturnUnits =
    parlaySummary.legs.length > 0
      ? Math.round(parlaySummary.stakeUnits * effectiveSlipBookDec * 100) / 100
      : 0;

  const sgpHoldAlert = useMemo<InlineSlipAlert | null>(() => {
    if (bookOddsInvalid) {
      return {
        tone: "warning",
        title: "Formato de momio no reconocido",
        detail: "Captura un momio decimal (> 1.01, ej. 4.40) o americano (ej. +340, -110).",
        code: "invalid_odds_input",
      };
    }
    if (activeSgpAudit?.bookQuoteAudit?.taxFlag === "severe_sgp_tax") {
      return {
        tone: "danger",
        title: `Sobrecargo alto SGP (${activeSgpAudit.bookQuoteAudit.effectiveHoldPct.toFixed(1)} % margen)`,
        detail: `Tu casa paga ${formatOddsValue(activeSgpAudit.bookQuoteAudit.offeredDecimal, oddsFormat)} frente al justo calibrado ${formatOddsValue(activeSgpAudit.bookQuoteAudit.fairCombinedDecimal, oddsFormat)}.`,
        code: "sgp_hold",
      };
    }
    if (
      betBuilderEval &&
      betBuilderEval.effectiveHoldPct !== null &&
      betBuilderEval.effectiveHoldPct > 15
    ) {
      return {
        tone: "danger",
        title: `Margen oculto elevado (${betBuilderEval.effectiveHoldPct.toFixed(1)} pts)`,
        detail: "Compara contra el momio justo calibrado antes de sellar el boleto.",
        code: "sgp_hold",
      };
    }
    return null;
  }, [activeSgpAudit, betBuilderEval, bookOddsInvalid, oddsFormat]);

  const handleSelectLeague = (rawValue: string) => {
    if (rawValue === ALL) {
      setLeagueFilter(ALL);
    } else {
      const matched = activeLeagues.find((lg) => lg.league === rawValue);
      setLeagueFilter(matched ? matched.league : ALL);
    }
    setCatalogLimit(INITIAL_MANUAL_ROWS);
  };

  const handleModeChange = (nextId: string) => {
    if (nextId === "auto" || nextId === "manual") {
      setBuilderMode(nextId);
      setInlineAlert(null);
    }
  };

  const handleCategoryChange = (nextId: string) => {
    if (isManualCategoryFilter(nextId)) {
      setCategoryFilter(nextId);
      setCatalogLimit(INITIAL_MANUAL_ROWS);
    }
  };

  const handlePickAction = useCallback(
    (row: PickerRow) => {
      if (row.inSlip) {
        setInlineAlert(null);
        removePickFromParlay(row.pick.id);
        return;
      }
      if (!row.compat.allowed) {
        setInlineAlert({
          tone: row.compat.code === "same_game_disabled" ? "warning" : "danger",
          title: getCompactBlockReason(row.sameGameExists, allowSgp, row.compat),
          detail:
            row.compat.reason ?? "Esta selección es incompatible con tu boleto combinado actual.",
          code: row.compat.code,
        });
        return;
      }
      setInlineAlert(null);
      const added = addPickToParlay(row.pick);
      if (!added) {
        const check = checkParlayCompatibility(parlayLegs, row.pick, allowSgp);
        setInlineAlert({
          tone: "danger",
          title: getCompactBlockReason(row.sameGameExists, allowSgp, check),
          detail: check.reason ?? "No se pudo agregar esta selección al boleto.",
          code: check.code,
        });
      }
    },
    [addPickToParlay, allowSgp, parlayLegs, removePickFromParlay],
  );

  const handleGenerateAuto = () => {
    setInlineAlert(null);
    if (targetPreset !== "libre" && autoPreview.legs.length > 0) {
      const styleLabel = DAILY_PARLAY_STYLE_SPECS[autoRisk].label;
      loadParlayPicks(
        autoPreview.legs.map((l) => l.pick),
        {
          allowSgp,
          label: `Parlay automático (${activePresetSpec.label} · ${styleLabel})`,
        },
      );
      return;
    }
    const count = generateAutoParlay({
      leagues: scopedLeagueIds.length > 0 ? scopedLeagueIds : dataset.leagues.map((l) => l.league),
      risk: autoRisk,
      legCount: effectiveAutoLegCount,
      allowSgp,
      games: allOpenGames,
    });
    if (count === 0) {
      setInlineAlert({
        tone: "warning",
        title: "Sin combinaciones suficientes",
        detail:
          "Amplía el deporte, cambia a «Todas las ligas» o baja el número de selecciones.",
      });
    }
  };

  const pickerColumns = useMemo<readonly SofascoreTableColumn<PickerRow>[]>(
    () => [
      {
        key: "match",
        header: "Partido · Selección",
        sticky: true,
        render: (row) => (
          <div className="pl-pb-match-cell">
            <span className="pl-pb-match-meta">
              <LeagueBadge
                league={row.game.league}
                label={row.game.leagueLabel}
                logoUrl={row.game.leagueLogoUrl}
                size={14}
              />
              <span className="truncate">
                {row.game.home.shortName} vs {row.game.away.shortName} ·{" "}
                {shortDateLabel(row.game.dayId)} {row.game.kickoffLocal}
              </span>
            </span>
            <span className="pl-pb-pick-label">{row.pick.label}</span>
            <span className="pl-pb-pick-cat">
              {row.game.leagueLabel} · {row.pick.categoryLabel}
            </span>
          </div>
        ),
      },
      {
        key: "value",
        header: "Prob · Justo · Casa",
        align: "end",
        numeric: true,
        render: (row) =>
          row.unlocked ? (
            <SofascoreValueCell
              probPct={row.pick.p * 100}
              fairLabel={formatOddsValue(row.pick.fairDecimal, oddsFormat)}
              bestBookLabel={row.bestBookLabel}
              bestOddsLabel={
                row.bestOddsDecimal !== null
                  ? formatOddsValue(row.bestOddsDecimal, oddsFormat)
                  : null
              }
              evPct={row.evPct}
            />
          ) : (
            <span className="text-xs font-semibold" style={{ color: "var(--pl-text-muted)" }}>
              Reservado
            </span>
          ),
      },
      {
        key: "signals",
        header: "Señales",
        render: (row) => {
          if (!row.unlocked) {
            return (
              <span className="pl-sf-signal-pill is-compact is-neutral">
                Pase Ultra
              </span>
            );
          }
          const hasSignal = row.evPct !== null || (row.movement && row.movement !== "stable");
          return hasSignal ? (
            <SofascoreSignalPair evPct={row.evPct} movement={row.movement} compact />
          ) : (
            <span className="pl-sf-signal-pill is-compact is-neutral num">
              {formatOddsValue(pickReferenceDecimal(row.pick), oddsFormat)}
            </span>
          );
        },
      },
      {
        key: "action",
        header: "Boleto",
        align: "end",
        render: (row) => {
          if (!row.unlocked) {
            return (
              <a
                href={upgradeHref}
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo(upgradeHref);
                }}
                className="pl-pb-locked-link"
              >
                <MaestroIcon name="lock" size={12} />
                <span>{hasAccountSession ? "Activar Pase" : "Pase Ultra"}</span>
              </a>
            );
          }
          const blockedLabel = !row.inSlip && !row.compat.allowed
            ? getCompactBlockReason(row.sameGameExists, allowSgp, row.compat)
            : null;
          return (
            <div className="pl-pb-row-actions">
              <BetBuilderQuickButton
                pick={row.pick}
                onInspect={() => setInspectedRow({ pick: row.pick, game: row.game })}
                compact
              />
              <Button
                variant={row.inSlip ? "secondary" : "ghost"}
                tone={!row.inSlip && !row.compat.allowed ? "danger" : "default"}
                size="sm"
                className="min-w-11"
                data-pick-toggle={row.pick.id}
                data-pick-blocked={blockedLabel ? (row.compat.code ?? "blocked") : undefined}
                title={blockedLabel ? row.compat.reason : undefined}
                onClick={() => handlePickAction(row)}
              >
                <MaestroIcon
                  name={row.inSlip ? "check" : row.compat.allowed ? "plus" : "shield"}
                  size={13}
                />
                <span>
                  {row.inSlip
                    ? "En boleto"
                    : row.compat.allowed
                      ? "Agregar"
                      : blockedLabel}
                </span>
              </Button>
            </div>
          );
        },
      },
    ],
    [
      allowSgp,
      handlePickAction,
      hasAccountSession,
      navigateTo,
      oddsFormat,
      upgradeHref,
    ],
  );

  const slipKpiItems = useMemo<readonly SofascoreKpiItem[]>(
    () => [
      {
        id: "prob",
        label: "Prob. Conjunta Real",
        value:
          effectiveSlipProb * 100 < 0.1 && parlaySummary.legs.length > 0
            ? "< 0.1 %"
            : `${(effectiveSlipProb * 100).toFixed(1)} %`,
        tone: "brand",
      },
      {
        id: "book",
        label: parsedBookParlayDec ? "Tu Momio Total" : "Momio Combinado",
        value: formatOddsValue(effectiveSlipBookDec, oddsFormat),
      },
      {
        id: "fair",
        label: "Momio justo",
        value: formatOddsValue(effectiveSlipFairDec, oddsFormat),
      },
      {
        id: "return",
        label: "Retorno",
        value: `${effectiveReturnUnits.toFixed(2)}u`,
        delta: `${effectiveSlipEdgePts >= 0 ? "+" : ""}${effectiveSlipEdgePts.toFixed(1)} pts`,
        tone:
          parlaySummary.legs.length === 0
            ? "default"
            : effectiveSlipEdgePts >= 0
              ? "positive"
              : "negative",
      },
    ],
    [
      effectiveReturnUnits,
      effectiveSlipBookDec,
      effectiveSlipEdgePts,
      effectiveSlipFairDec,
      effectiveSlipProb,
      oddsFormat,
      parsedBookParlayDec,
      parlaySummary.legs.length,
    ],
  );

  const modeTabs = useMemo<readonly SofascoreTabItem[]>(
    () => [
      { id: "auto", label: "Automático" },
      { id: "manual", label: "Armar a mano", count: openGamesAll.length },
    ],
    [openGamesAll.length],
  );

  const activeAlert = inlineAlert ?? sgpHoldAlert;

  return (
    <AtmosphereStage activePath="/app/parlays">
      <ClubWorkspaceShell activePath="/app/parlays">
        <div className="pl-pb-page">
          <header className="pl-pb-header">
            <div className="pl-pb-header-copy">
              <h1 className="pl-pb-title">Armar parlay</h1>
              <p className="pl-pb-subtitle">
                Genera una combinada calibrada al instante o selecciona piernas en tabla con
                auditoría SGP en vivo.
              </p>
            </div>

            <div className="pl-pb-mode-wrap" data-parlay-mode-tabs="">
              <SofascoreTabs
                variant="segmented"
                ariaLabel="Modo del armador de parlays"
                items={modeTabs}
                value={builderMode}
                onChange={handleModeChange}
              />
            </div>
          </header>

          <div className="pl-pb-workspace" data-parlay-workspace="">
            <div className="pl-pb-main">
              <div className="pl-pb-scope-bar" data-parlay-scope-bar="">
                <SofascoreFilterBar
                  searchValue={builderMode === "manual" ? manualQuery : undefined}
                  onSearchChange={
                    builderMode === "manual"
                      ? (next) => {
                          setManualQuery(next);
                          setCatalogLimit(INITIAL_MANUAL_ROWS);
                        }
                      : undefined
                  }
                  searchPlaceholder="Buscar equipo, liga o mercado…"
                  resultCount={
                    builderMode === "manual" ? manualPickerRowsAll.length : allOpenGames.length
                  }
                  trailing={
                    <div className="min-w-0 w-full sm:w-auto">
                      <label htmlFor={leagueSelectId} className="sr-only">
                        Liga activa
                      </label>
                      <select
                        id={leagueSelectId}
                        value={effectiveLeague}
                        onChange={(e) => handleSelectLeague(e.target.value)}
                        className="pl-pb-select pl-pb-select-league"
                      >
                        <option value={ALL}>
                          Todas las ligas ({activeLeagues.length})
                        </option>
                        {activeLeagues.map((lg) => (
                          <option key={lg.league} value={lg.league}>
                            {lg.label} ({lg.openCount})
                          </option>
                        ))}
                      </select>
                    </div>
                  }
                >
                  <div className="pl-pb-chip-row" role="group" aria-label="Elegir deporte">
                    <button
                      type="button"
                      className="pl-pb-chip num"
                      aria-pressed={sportFilter === ALL}
                      onClick={() => {
                        setSportFilter(ALL);
                        setLeagueFilter(ALL);
                        setCatalogLimit(INITIAL_MANUAL_ROWS);
                      }}
                    >
                      Todos ({sportCounts[ALL] ?? 0})
                    </button>
                    {SPORTS.filter((sp) => (sportCounts[sp.id] ?? 0) > 0).map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        className="pl-pb-chip num"
                        aria-pressed={sportFilter === sp.id}
                        onClick={() => {
                          setSportFilter(sp.id);
                          setLeagueFilter(ALL);
                          setCatalogLimit(INITIAL_MANUAL_ROWS);
                        }}
                      >
                        {sp.label} ({sportCounts[sp.id] ?? 0})
                      </button>
                    ))}
                  </div>
                </SofascoreFilterBar>
              </div>

              {activeAlert ? (
                <div
                  className={`pl-pb-alert is-${activeAlert.tone}`}
                  role="alert"
                  data-parlay-inline-alert={activeAlert.code ?? "notice"}
                >
                  <div className="pl-pb-alert-body">
                    <MaestroIcon name="shield" size={15} />
                    <div className="pl-pb-alert-text">
                      <strong>{activeAlert.title}</strong>
                      <p>{activeAlert.detail}</p>
                    </div>
                  </div>
                  <div className="pl-pb-alert-actions">
                    {activeAlert.code === "same_game_disabled" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setAllowSgp(true);
                          setInlineAlert(null);
                        }}
                      >
                        Activar SGP
                      </Button>
                    ) : null}
                    {inlineAlert ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Descartar aviso"
                        onClick={() => setInlineAlert(null)}
                      >
                        <MaestroIcon name="x" size={14} />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {builderMode === "auto" ? (
                <div
                  className="pl-pb-main"
                  role="tabpanel"
                  aria-label="Generador automático de parlay"
                  data-parlay-auto-panel=""
                >
                  <SofascoreCard
                    title="Generador automático"
                    className="pl-pb-auto-card"
                    meta={
                      autoPreview.status !== "insufficient" && autoPreview.legs.length > 0 ? (
                        <span className="pl-pb-preview-pill num">
                          {autoPreview.legs.length} picks ·{" "}
                          {autoPreview.combinedProbability * 100 < 0.1
                            ? "< 0.1 %"
                            : `${(autoPreview.combinedProbability * 100).toFixed(1)} %`}{" "}
                          · {formatOddsValue(autoPreview.fairDecimal, oddsFormat)}
                        </span>
                      ) : (
                        <span>Sin vista previa</span>
                      )
                    }
                  >
                    <div className="pl-pb-auto-stack">
                      <div className="pl-pb-field">
                        <span className="pl-pb-field-label">Cuota meta</span>
                        <div className="pl-pb-chip-row" role="group" aria-label="Cuota meta">
                          {PARLAY_TARGET_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              className="pl-pb-chip is-grow num"
                              aria-pressed={targetPreset === preset.id}
                              data-quick-target={preset.id}
                              onClick={() => setTargetPreset(preset.id)}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="pl-pb-auto-grid">
                        <div className="pl-pb-field">
                          <span className="pl-pb-field-label">Estilo de riesgo</span>
                          <div
                            className="pl-pb-chip-row"
                            role="group"
                            aria-label="Estilo de riesgo"
                          >
                            {(["conservador", "medio", "arriesgado"] as const).map((r) => (
                              <button
                                key={r}
                                type="button"
                                className="pl-pb-chip is-grow"
                                aria-pressed={autoRisk === r}
                                onClick={() => setAutoRisk(r)}
                              >
                                {r === "conservador"
                                  ? "Conservador"
                                  : r === "medio"
                                    ? "Medio"
                                    : "Arriesgado"}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="pl-pb-field">
                          <span className="pl-pb-field-label num">
                            Selecciones ({effectiveAutoLegCount} de {maxAutoLegs} disp.)
                          </span>
                          <div className="pl-pb-stepper-row">
                            <div
                              className="pl-pb-chip-row"
                              role="group"
                              aria-label="Número de selecciones"
                            >
                              {LEG_COUNT_PRESETS.map((cnt) => (
                                <button
                                  key={cnt}
                                  type="button"
                                  disabled={cnt > maxAutoLegs}
                                  className="pl-pb-chip num"
                                  aria-pressed={effectiveAutoLegCount === cnt}
                                  onClick={() => setAutoLegCount(cnt)}
                                >
                                  {cnt}
                                </button>
                              ))}
                            </div>
                            <div
                              className="pl-pb-stepper"
                              role="group"
                              aria-label="Ajustar número de selecciones"
                            >
                              <button
                                type="button"
                                className="pl-pb-stepper-btn"
                                aria-label="Menos selecciones"
                                disabled={effectiveAutoLegCount <= 2}
                                onClick={() =>
                                  setAutoLegCount(Math.max(2, effectiveAutoLegCount - 1))
                                }
                              >
                                −
                              </button>
                              <span className="pl-pb-stepper-val num">
                                {effectiveAutoLegCount}
                              </span>
                              <button
                                type="button"
                                className="pl-pb-stepper-btn"
                                aria-label="Más selecciones"
                                disabled={effectiveAutoLegCount >= maxAutoLegs}
                                onClick={() =>
                                  setAutoLegCount(Math.min(maxAutoLegs, effectiveAutoLegCount + 1))
                                }
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="pl-pb-sgp-bar">
                        <div className="pl-pb-sgp-copy">
                          <span className="pl-pb-sgp-title">Mismo partido (SGP)</span>
                          <span className="pl-pb-sgp-desc">
                            Permite hasta 2 selecciones de distinto eje del mismo partido con
                            ajuste Student-t acotado por Fréchet-Hoeffding.
                          </span>
                        </div>
                        <div className="pl-pb-switch-wrap">
                          <Switch isSelected={allowSgp} onChange={setAllowSgp}>
                            <Switch.Control>
                              <Switch.Thumb />
                            </Switch.Control>
                            <Switch.Content>
                              <span className="text-xs font-bold">
                                {allowSgp ? "Activado" : "Desactivado"}
                              </span>
                            </Switch.Content>
                          </Switch>
                        </div>
                      </div>

                      {autoPreview.status === "insufficient" && autoPreview.message ? (
                        <div className="pl-pb-alert is-warning" role="status">
                          <div className="pl-pb-alert-body">
                            <MaestroIcon name="shield" size={14} />
                            <div className="pl-pb-alert-text">
                              <strong>Regla sin combinación completa</strong>
                              <p>{autoPreview.message}</p>
                            </div>
                          </div>
                          {targetPreset !== "libre" ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setTargetPreset("libre")}
                            >
                              Usar Libre
                            </Button>
                          ) : null}
                        </div>
                      ) : null}

                      <Button
                        variant="secondary"
                        size="default"
                        className="w-full"
                        data-generate-parlay=""
                        onClick={handleGenerateAuto}
                      >
                        <MaestroIcon name="sparkles" size={15} />
                        <span>
                          Generar parlay ({effectiveAutoLegCount} selecciones · {autoRisk}
                          {targetPreset !== "libre" ? ` · ${activePresetSpec.label}` : ""})
                        </span>
                      </Button>
                    </div>
                  </SofascoreCard>

                  <SofascoreCard
                    title={
                      autoPreview.status !== "insufficient" && autoPreview.legs.length > 0
                        ? "Selecciones propuestas para el parlay"
                        : "Cartelera abierta elegible"
                    }
                    meta={`${autoTableRows.length} selecciones`}
                    density="compact"
                  >
                    <SofascoreTable
                      caption="Selecciones elegibles para armar parlay"
                      columns={pickerColumns}
                      rows={autoTableRows}
                      rowKey={(row) => row.id}
                      density="compact"
                      emptyState={
                        <SofascoreEmptyState
                          title="Sin partidos abiertos con ese filtro"
                          description="Prueba con otro deporte o selecciona Todas las ligas."
                          actionLabel="Ver todos los deportes"
                          onAction={() => {
                            setSportFilter(ALL);
                            setLeagueFilter(ALL);
                          }}
                        />
                      }
                    />
                  </SofascoreCard>
                </div>
              ) : (
                <div
                  className="pl-pb-main"
                  role="tabpanel"
                  aria-label="Armar parlay a mano"
                  data-parlay-manual-panel=""
                >
                  <SofascoreCard
                    title="Selector de piernas"
                    density="compact"
                    meta={
                      <div className="pl-pb-switch-wrap">
                        <Switch isSelected={allowSgp} onChange={setAllowSgp}>
                          <Switch.Control>
                            <Switch.Thumb />
                          </Switch.Control>
                          <Switch.Content>
                            <span className="text-xs font-bold">Mismo partido</span>
                          </Switch.Content>
                        </Switch>
                      </div>
                    }
                  >
                    <div className="pl-pb-auto-stack">
                      <SofascoreTabs
                        variant="underline"
                        ariaLabel="Filtrar mercado en selector manual"
                        items={CATEGORY_TABS}
                        value={categoryFilter}
                        onChange={handleCategoryChange}
                      />

                      <SofascoreTable
                        caption="Catálogo abierto de selecciones para parlay manual"
                        columns={pickerColumns}
                        rows={visibleManualRows}
                        rowKey={(row) => row.id}
                        density="compact"
                        emptyState={
                          <SofascoreEmptyState
                            title="Sin selecciones abiertas con ese filtro"
                            description="Prueba con otro deporte, mercado o limpia la búsqueda."
                            actionLabel="Restablecer filtros"
                            onAction={() => {
                              setSportFilter(ALL);
                              setLeagueFilter(ALL);
                              setCategoryFilter("all");
                              setManualQuery("");
                              setCatalogLimit(INITIAL_MANUAL_ROWS);
                            }}
                          />
                        }
                      />

                      {manualPickerRowsAll.length > catalogLimit ? (
                        <div className="pl-pb-pager">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="num"
                            onClick={() => setCatalogLimit((c) => c + MANUAL_PAGE_STEP)}
                          >
                            Ver más selecciones ({manualPickerRowsAll.length - catalogLimit}{" "}
                            restantes)
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </SofascoreCard>
                </div>
              )}
            </div>

            <aside className="pl-pb-slip-col" aria-label="Boleto combinado activo">
              <SofascoreCard
                title="Boleto combinado"
                className="pl-pb-slip-card"
                meta={
                  <div className="pl-pb-slip-head-meta">
                    <span className="num">
                      {parlaySummary.legs.length}{" "}
                      {parlaySummary.legs.length === 1 ? "selección" : "selecciones"}
                    </span>
                    {parlaySummary.legs.length > 0 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (parlaySummary.legs.length >= 2) {
                            setConfirmClearOpen(true);
                          } else {
                            clearParlay();
                          }
                        }}
                      >
                        Limpiar
                      </Button>
                    ) : null}
                  </div>
                }
              >
                <div className="pl-pb-slip-stack">
                  {parlaySummary.legs.length === 0 ? (
                    <SofascoreEmptyState
                      title="Tu boleto combinado está vacío"
                      description="Usa el generador automático o elige piernas compatibles en la tabla (mínimo 2 para sellar)."
                    />
                  ) : (
                    <ul className="pl-pb-legs" role="list">
                      {parlaySummary.legs.map(({ pick }) => {
                        const gm = gamesById.get(pick.gameId);
                        const isSgpLeg = sgpGameIds.has(pick.gameId);
                        return (
                          <li key={pick.id} className="pl-pb-leg-row">
                            <div className="pl-pb-leg-copy">
                              <span className="pl-pb-leg-meta">
                                {pick.leagueLabel} · {pick.matchLabel}
                                {gm
                                  ? ` · ${shortDateLabel(gm.dayId)} ${gm.kickoffLocal}`
                                  : ` · ${pick.kickoffLocal}`}
                              </span>
                              <strong className="pl-pb-leg-title">{pick.label}</strong>
                              <span className="pl-pb-leg-odds num">
                                <span>
                                  {(pick.p * 100).toFixed(1)} % ·{" "}
                                  {formatOddsValue(pickReferenceDecimal(pick), oddsFormat)}
                                </span>
                                {isSgpLeg ? <span className="pl-pb-sgp-tag">SGP</span> : null}
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Quitar ${pick.label}`}
                              onClick={() => removePickFromParlay(pick.id)}
                            >
                              <MaestroIcon name="x" size={14} />
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {parlaySummary.legs.length === 1 ? (
                    <div className="pl-pb-alert is-info" role="status">
                      <div className="pl-pb-alert-body">
                        <MaestroIcon name="layers" size={14} />
                        <div className="pl-pb-alert-text">
                          <strong>Falta 1 selección para sellar</strong>
                          <p>Un parlay necesita al menos 2 piernas compatibles.</p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div
                    className="pl-pb-risk-box"
                    style={{
                      borderColor: `color-mix(in srgb, ${riskToneCss(slipRisk.tone)} 38%, var(--pl-border))`,
                    }}
                    data-parlay-risk-meter={slipRisk.level}
                  >
                    <div className="pl-pb-risk-head">
                      <span style={{ color: "var(--pl-text-muted)", fontWeight: 700 }}>
                        Nivel de riesgo del boleto
                      </span>
                      <span
                        className="font-extrabold num"
                        style={{ color: riskToneCss(slipRisk.tone) }}
                      >
                        {slipRisk.label}
                      </span>
                    </div>
                    {parlaySummary.legs.length > 0 ? (
                      <div className="pl-pb-risk-track" aria-hidden="true">
                        <div
                          className="pl-pb-risk-fill"
                          style={{
                            width: `${slipRisk.meterPct}%`,
                            background: riskToneCss(slipRisk.tone),
                          }}
                        />
                      </div>
                    ) : null}
                    <p className="pl-pb-risk-headline num">{slipRisk.headline}</p>
                    <p className="pl-pb-risk-guidance">{slipRisk.guidance}</p>
                    {slipRisk.warnings.length > 0 ? (
                      <ul
                        className="pl-pb-risk-warnings"
                        style={{ color: riskToneCss(slipRisk.tone) }}
                      >
                        {slipRisk.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  {parlaySummary.hasSgpCorrelation ? (
                    <div className="pl-pb-frechet num" data-parlay-frechet="">
                      <span>Cotas Fréchet-Hoeffding</span>
                      <strong>
                        {(frechetBounds.lower * 100).toFixed(1)} % –{" "}
                        {(frechetBounds.upper * 100).toFixed(1)} %
                      </strong>
                    </div>
                  ) : null}

                  {parlaySummary.hasSgpCorrelation ? (
                    <SgpCopulaAuditCard
                      legs={parlaySummary.legs}
                      oddsFormat={oddsFormat}
                      offeredCombinedDecimalOdds={parsedBookParlayDec}
                      onAuditResolved={setResolvedSgpAudit}
                    />
                  ) : null}

                  <div className="pl-pb-slip-controls">
                    <div className="pl-pb-slip-row">
                      <span className="pl-pb-slip-label">Unidades simuladas</span>
                      <div
                        className="pl-pb-stepper"
                        role="group"
                        aria-label="Unidades del boleto combinado"
                      >
                        <button
                          type="button"
                          className="pl-pb-stepper-btn"
                          aria-label="Restar unidades al parlay"
                          onClick={() =>
                            setParlayStakeUnits(
                              Math.max(
                                0.5,
                                Math.round((parlayStakeUnits - 0.5) * 100) / 100,
                              ),
                            )
                          }
                        >
                          −
                        </button>
                        <span className="pl-pb-stepper-val num">
                          {parlayStakeUnits.toFixed(2)}u
                        </span>
                        <button
                          type="button"
                          className="pl-pb-stepper-btn"
                          aria-label="Sumar unidades al parlay"
                          onClick={() =>
                            setParlayStakeUnits(
                              Math.min(
                                5,
                                Math.round((parlayStakeUnits + 0.5) * 100) / 100,
                              ),
                            )
                          }
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="pl-pb-slip-row">
                      <label htmlFor="parlay-book-odds-input" className="pl-pb-slip-label">
                        Momio total en tu casa
                      </label>
                      <input
                        id="parlay-book-odds-input"
                        type="text"
                        inputMode="decimal"
                        autoCorrect="off"
                        spellCheck={false}
                        value={bookParlayOddsRaw}
                        onChange={(e) => setBookParlayOddsRaw(e.target.value)}
                        placeholder="Opcional (+340 / 4.40)"
                        aria-invalid={bookOddsInvalid || undefined}
                        className="pl-pb-input pl-pb-input-odds num"
                      />
                    </div>

                    <SofascoreKpiStrip items={slipKpiItems} />
                  </div>

                  <div className="pl-pb-slip-actions">
                    <Button
                      variant="secondary"
                      size="default"
                      className="w-full"
                      disabled={parlaySummary.legs.length < 2}
                      onClick={() =>
                        openShareTicket({
                          kind: "parlay",
                          title: `Parlay PitchLab (${parlaySummary.legs.length} picks)`,
                          subtitle: "Armador Inteligente · Spacetime Suite v5.1",
                          leagueLabel: "Multi-Liga",
                          pickLabel: parlaySummary.legs
                            .map((l) => l.pick.label)
                            .join(" + "),
                          legs: parlaySummary.legs.map(({ pick }) => ({
                            label: pick.label,
                            matchLabel: `${pick.matchLabel} · ${pick.kickoffLocal}`,
                            p: pick.p,
                            fairDecimal: pick.fairDecimal,
                            marketDecimal: pick.marketDecimal,
                            kickoffLocal: pick.kickoffLocal,
                          })),
                          probability: effectiveSlipProb,
                          fairDecimal: effectiveSlipFairDec,
                          marketDecimal: effectiveSlipBookDec,
                          units: parlaySummary.stakeUnits,
                          gameStatus: "NS",
                        })
                      }
                    >
                      <MaestroIcon name="share" size={14} />
                      <span>Exportar boleto</span>
                    </Button>
                    <Button
                      variant="primary"
                      size="default"
                      className="w-full num"
                      disabled={parlaySummary.legs.length < 2}
                      onClick={() => sealParlayToJournal()}
                    >
                      <MaestroIcon name="ticket" size={14} />
                      <span>Sellar en Mi récord ({parlaySummary.stakeUnits.toFixed(1)}u)</span>
                    </Button>
                  </div>

                  <details className="pl-pb-rules" data-parlay-rules="">
                    <summary className="pl-pb-rules-summary">
                      Qué no se puede combinar en parlay
                    </summary>
                    <ul className="pl-pb-rules-list">
                      {PARLAY_NON_COMBINABLE_RULES.map((rule) => (
                        <li key={rule.title}>
                          <strong>{rule.title}:</strong> {rule.detail}
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              </SofascoreCard>
            </aside>
          </div>
        </div>

        {isCompactViewport && parlayLegs.length > 0 ? (
          <MobileParlaySheet
            variant="builder"
            offeredCombinedDecimalOdds={parsedBookParlayDec}
          />
        ) : null}

        <BetBuilderDrawer
          open={inspectedRow !== null}
          pick={inspectedRow?.pick ?? null}
          game={inspectedRow?.game ?? null}
          onClose={() => setInspectedRow(null)}
        />

        <ConfirmActionDialog
          open={confirmClearOpen}
          title={`¿Vaciar parlay de ${parlaySummary.legs.length} selecciones?`}
          description="Se quitarán todas las selecciones del boleto actual. Podrás deshacerlo durante unos segundos desde el aviso inferior."
          confirmLabel="Vaciar boleto"
          onConfirm={clearParlay}
          onCancel={() => setConfirmClearOpen(false)}
        />
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export {
  PropsLabClubView,
  type NbaPropStatCode,
  type PropsLabClubViewProps,
  type PropsLabPlayerPropItem,
  type PropsLabRefereeSummary,
  type PropsStreakExplorerItem,
} from "./PropsLabClubView";

export function MomiosExplorerClubView(): React.JSX.Element {
  return <OddsCompareClubView />;
}
