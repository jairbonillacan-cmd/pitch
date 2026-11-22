"use client";

import React, { Suspense, lazy, memo, useCallback, useId, useMemo, useState } from "react";
import {
  parseStrictFiniteNumber,
  sportForLeague,
  sportScoringUnit,
  type LeagueId,
  type PlatformSport,
} from "@pitchlab/contracts";
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
import { LeagueBadge, TeamBadge, parseUserOdds } from "../../sports";
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
import { MarketCategoryIcon } from "../components/PackSportIcons";
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
  useIsPickInParlay,
  useParlayState,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import type {
  MatchPick,
  OddsFormat,
  PlatformGame,
  RiskBand,
  SgpCopulaAuditView,
} from "../types";
import { ALL, SPORTS, shortDateLabel, sportOf, type SportFilter } from "./home/home-model";
import { OddsCompareClubView } from "./OddsCompareView";
import {
  classifyOddsMovement,
  computeExpectedValuePct,
} from "./picks/BookmakerComparePill";

const loadParlayBetBuilderDrawer = () =>
  import("./picks/BetBuilderDrawer").then((mod) => ({
    default: mod.BetBuilderDrawer,
  }));
const LazyBetBuilderDrawer = lazy(loadParlayBetBuilderDrawer);

function prefetchParlayBetBuilderDrawer(): void {
  void loadParlayBetBuilderDrawer();
}

const ParlayBetBuilderButton = memo(function ParlayBetBuilderButton({
  pick,
  game,
  onInspect,
  compact = false,
}: {
  readonly pick: MatchPick;
  readonly game: PlatformGame;
  readonly onInspect: (pick: MatchPick, game: PlatformGame) => void;
  readonly compact?: boolean;
}): React.JSX.Element {
  const inParlay = useIsPickInParlay(pick.id);
  const handleClick = useCallback(() => {
    onInspect(pick, game);
  }, [game, onInspect, pick]);
  return (
    <Button
      variant={inParlay ? "secondary" : "ghost"}
      size="sm"
      className={`pl-scr-builder-btn min-w-11 ${compact ? "is-compact" : ""} ${inParlay ? "is-in-slip" : ""}`.trim()}
      data-open-bet-builder={pick.id}
      aria-label={`Abrir Bet Builder para ${pick.label}`}
      onPointerEnter={prefetchParlayBetBuilderDrawer}
      onFocus={prefetchParlayBetBuilderDrawer}
      onClick={handleClick}
    >
      <MaestroIcon name="layers" size={13} />
      <span>{inParlay ? "En boleto" : "Builder"}</span>
    </Button>
  );
});

type ManualCategoryFilter = "all" | "principal" | "totales" | "valor" | "tactico";

interface PickerRow {
  readonly id: string;
  readonly game: PlatformGame;
  readonly pick: MatchPick;
  readonly completeLabel: string;
  readonly marketFamily: string;
  readonly unlocked: boolean;
  readonly inSlip: boolean;
  readonly atMaxLegs: boolean;
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
  readonly code?:
    | ParlayCompatibilityResult["code"]
    | "sgp_hold"
    | "invalid_odds_input"
    | "max_legs";
}

const MAX_PARLAY_LEGS = 6;
const LEG_COUNT_PRESETS = [2, 3, 4, 5, 6] as const;
const INITIAL_MANUAL_ROWS = 12;
const MANUAL_PAGE_STEP = 12;
const AUTO_PREVIEW_LIMIT = 6;
const LEAGUE_CHIP_LIMIT = 7;
const MAX_DISPLAY_LEG_EV_PCT = 20;
const MAX_DISPLAY_SLIP_EV_PCT = 50;

const HAS_UNIT_RE =
  /\b(goles|gol|puntos|punto|pts|carreras|carrera|córners|corners|esquinas|faltas|tarjetas|amarillas|tiros|remates|rebotes|asistencias|triples)\b/i;
const BARE_TOTAL_RE = /^(?:más|menos)\s+de\s+\d+(?:[.,]\d+)?$/i;

const CATEGORY_TABS: readonly SofascoreTabItem[] = [
  { id: "all", label: "Todos" },
  { id: "principal", label: "Resultado" },
  { id: "totales", label: "Totales" },
  { id: "valor", label: "Ambos / Valor" },
  { id: "tactico", label: "Táctico" },
];

function formatSafeOdds(
  decimalOdds: number | null | undefined,
  format: OddsFormat,
): string {
  if (decimalOdds == null || !Number.isFinite(decimalOdds) || decimalOdds <= 1.01) {
    return "—";
  }
  return formatOddsValue(decimalOdds, format);
}

function formatCompletePickLabel(pick: MatchPick, sport: PlatformSport): string {
  const raw = pick.label.trim();
  if (!raw || HAS_UNIT_RE.test(raw)) return raw;
  const market = (pick.market ?? "").toLowerCase();
  const isTotalLine =
    BARE_TOTAL_RE.test(raw) ||
    market === "totals" ||
    market === "team_totals" ||
    market.includes("total");
  if (!isTotalLine) return raw;
  if (market.includes("corner")) return `${raw} córners`;
  if (market.includes("card") || market.includes("yellow") || market.includes("booking")) {
    return `${raw} tarjetas`;
  }
  if (market.includes("foul")) return `${raw} faltas`;
  if (market.includes("sot") || market.includes("shots_on_target")) {
    return `${raw} tiros a puerta`;
  }
  if (market.includes("shot")) return `${raw} remates`;
  return `${raw} ${sportScoringUnit(sport).plural}`;
}

function resolvePickMarketFamily(pick: MatchPick, sport: PlatformSport): string {
  const leg = matchPickToBetBuilderLeg(pick, sport);
  if (leg.family !== "other" && leg.family !== "correct_score") {
    return leg.family;
  }
  return pick.market ?? pick.categoryLabel ?? pick.label;
}

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
  atMaxLegs: boolean,
): string {
  if (atMaxLegs) return `Máx. ${MAX_PARLAY_LEGS}`;
  if (compat.code === "live") return "En vivo";
  if (compat.code === "finished") return "Finalizado";
  if (compat.code === "duplicate") return "En boleto";
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

function computeSlipProbabilityBounds(
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

interface SlipLegViewItem {
  readonly pick: MatchPick;
  readonly game: PlatformGame | undefined;
  readonly fullLabel: string;
  readonly family: string;
  readonly isSgpLeg: boolean;
}

const AutoPreviewRowItem = memo(function AutoPreviewRowItem({
  row,
  allowSgp,
  oddsFormat,
  hasAccountSession,
  upgradeHref,
  onInspect,
  onPickAction,
  onNavigateUpgrade,
}: {
  readonly row: PickerRow;
  readonly allowSgp: boolean;
  readonly oddsFormat: OddsFormat;
  readonly hasAccountSession: boolean;
  readonly upgradeHref: string;
  readonly onInspect: (pick: MatchPick, game: PlatformGame) => void;
  readonly onPickAction: (row: PickerRow) => void;
  readonly onNavigateUpgrade: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}): React.JSX.Element {
  const isBlocked = !row.inSlip && (row.atMaxLegs || !row.compat.allowed);
  const blockedLabel = isBlocked
    ? getCompactBlockReason(row.sameGameExists, allowSgp, row.compat, row.atMaxLegs)
    : null;
  const toggleLabel = row.inSlip
    ? "En boleto"
    : isBlocked
      ? (blockedLabel ?? "Bloqueado")
      : "Agregar";

  const handleToggle = useCallback(() => {
    onPickAction(row);
  }, [onPickAction, row]);

  return (
    <li
      className={`pl-pb-preview-item ${row.inSlip ? "is-in-slip" : ""}`.trim()}
      data-preview-in-slip={row.inSlip ? "true" : undefined}
    >
      <div className="pl-pb-preview-main">
        <div className="pl-pb-preview-head">
          <LeagueBadge
            league={row.game.league}
            label={row.game.leagueLabel}
            logoUrl={row.game.leagueLogoUrl || undefined}
            size={14}
          />
          <span className="pl-pb-preview-league">
            {row.game.leagueLabel} · {shortDateLabel(row.game.dayId)} {row.game.kickoffLocal}
          </span>
          {row.inSlip ? (
            <span className="pl-pb-in-slip-badge">
              <MaestroIcon name="check" size={11} />
              <span>En tu boleto</span>
            </span>
          ) : null}
        </div>

        <div className="pl-pb-preview-match">
          <span className="pl-pb-crest-pair">
            <TeamBadge
              league={row.game.league}
              slug={row.game.home.slug}
              name={row.game.home.name}
              logoUrl={row.game.home.logoUrl || undefined}
              size={18}
            />
            <strong>{row.game.home.shortName}</strong>
            <span className="pl-pb-vs" aria-hidden="true">
              vs
            </span>
            <TeamBadge
              league={row.game.league}
              slug={row.game.away.slug}
              name={row.game.away.name}
              logoUrl={row.game.away.logoUrl || undefined}
              size={18}
            />
            <strong>{row.game.away.shortName}</strong>
          </span>
        </div>

        <div className="pl-pb-preview-pick">
          <MarketCategoryIcon family={row.marketFamily} size={16} />
          <span className="pl-pb-preview-pick-text">
            {row.unlocked ? row.completeLabel : "Selección reservada Pase PitchLab Ultra"}
          </span>
        </div>
      </div>

      <div className="pl-pb-preview-side">
        {row.unlocked ? (
          <div className="pl-pb-preview-metrics num">
            <strong className="pl-pb-preview-prob">{(row.pick.p * 100).toFixed(1)} %</strong>
            <span className="pl-pb-preview-odds">
              Justo {formatSafeOdds(row.pick.fairDecimal, oddsFormat)}
              {row.bestOddsDecimal !== null
                ? ` · ${row.bestBookLabel ?? "Casa"} ${formatSafeOdds(row.bestOddsDecimal, oddsFormat)}`
                : ""}
            </span>
            {row.evPct !== null && row.evPct > 0 ? (
              <SofascoreSignalPair evPct={row.evPct} movement={row.movement} compact />
            ) : null}
          </div>
        ) : null}

        <div className="pl-pb-row-actions">
          {row.unlocked ? (
            <>
              <ParlayBetBuilderButton
                pick={row.pick}
                game={row.game}
                onInspect={onInspect}
                compact
              />
              <Button
                variant={isBlocked ? "ghost" : "secondary"}
                tone={isBlocked ? "danger" : "default"}
                size="sm"
                className={`min-w-11 pl-pb-toggle-btn ${row.inSlip ? "is-selected" : ""}`.trim()}
                aria-pressed={!isBlocked ? row.inSlip : undefined}
                aria-label={`${toggleLabel}: ${row.completeLabel} (${row.game.home.shortName} vs ${row.game.away.shortName})`}
                data-pick-toggle={row.pick.id}
                data-pick-blocked={
                  isBlocked
                    ? row.atMaxLegs
                      ? "max_legs"
                      : (row.compat.code ?? "blocked")
                    : undefined
                }
                onClick={handleToggle}
              >
                <MaestroIcon
                  name={row.inSlip ? "check" : isBlocked ? "alert-warning" : "plus"}
                  size={13}
                />
                <span>{toggleLabel}</span>
              </Button>
            </>
          ) : (
            <a href={upgradeHref} onClick={onNavigateUpgrade} className="pl-pb-locked-link">
              <MaestroIcon name="lock" size={12} />
              <span>{hasAccountSession ? "Activar Pase" : "Pase Ultra"}</span>
            </a>
          )}
        </div>
      </div>
    </li>
  );
});

const ParlaySlipLegRow = memo(function ParlaySlipLegRow({
  item,
  oddsFormat,
  onRemove,
}: {
  readonly item: SlipLegViewItem;
  readonly oddsFormat: OddsFormat;
  readonly onRemove: (pickId: string) => void;
}): React.JSX.Element {
  const { pick, game: gm, fullLabel, family, isSgpLeg } = item;
  const handleRemove = useCallback(() => {
    onRemove(pick.id);
  }, [onRemove, pick.id]);

  return (
    <li className="pl-pb-leg-row">
      <div className="pl-pb-leg-copy">
        <span className="pl-pb-leg-meta">
          <LeagueBadge
            league={pick.league}
            label={pick.leagueLabel}
            logoUrl={gm?.leagueLogoUrl || undefined}
            size={13}
          />
          {gm ? (
            <span className="pl-pb-crest-pair">
              <TeamBadge
                league={gm.league}
                slug={gm.home.slug}
                name={gm.home.name}
                logoUrl={gm.home.logoUrl || undefined}
                size={14}
              />
              <span className="truncate">{gm.home.shortName}</span>
              <span className="pl-pb-vs" aria-hidden="true">
                vs
              </span>
              <TeamBadge
                league={gm.league}
                slug={gm.away.slug}
                name={gm.away.name}
                logoUrl={gm.away.logoUrl || undefined}
                size={14}
              />
              <span className="truncate">{gm.away.shortName}</span>
            </span>
          ) : (
            <span className="truncate">{pick.matchLabel}</span>
          )}
        </span>
        <span className="pl-pb-leg-pick-line">
          <MarketCategoryIcon family={family} size={15} />
          <strong className="pl-pb-leg-title">{fullLabel}</strong>
        </span>
        <span className="pl-pb-leg-odds num">
          <span>
            {(pick.p * 100).toFixed(1)} % · {formatSafeOdds(pickReferenceDecimal(pick), oddsFormat)}
            {gm ? ` · ${shortDateLabel(gm.dayId)} ${gm.kickoffLocal}` : ` · ${pick.kickoffLocal}`}
          </span>
          {isSgpLeg ? <span className="pl-pb-sgp-tag">SGP</span> : null}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Quitar ${fullLabel}`}
        onClick={handleRemove}
      >
        <MaestroIcon name="x" size={14} />
      </Button>
    </li>
  );
});

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
  const bookOddsInputId = useId();
  const bookOddsErrorId = useId();

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
    const logoByLeague = new Map<LeagueId, string>();
    for (const g of openGamesAll) {
      if (sportFilter !== ALL && sportOf(g) !== sportFilter) continue;
      countsByLeague.set(g.league, (countsByLeague.get(g.league) ?? 0) + 1);
      if (g.leagueLogoUrl && !logoByLeague.has(g.league)) {
        logoByLeague.set(g.league, g.leagueLogoUrl);
      }
    }
    return dataset.leagues
      .filter((l) => countsByLeague.has(l.league))
      .map((l) => ({
        ...l,
        logoUrl: l.logoUrl || logoByLeague.get(l.league),
        openCount: countsByLeague.get(l.league) ?? 0,
      }))
      .sort((a, b) => b.openCount - a.openCount || a.label.localeCompare(b.label, "es-MX"));
  }, [dataset.leagues, openGamesAll, sportFilter]);

  const effectiveLeague: LeagueId | typeof ALL = useMemo(() => {
    if (leagueFilter === ALL) return ALL;
    return activeLeagues.some((l) => l.league === leagueFilter) ? leagueFilter : ALL;
  }, [activeLeagues, leagueFilter]);

  const visibleLeagueChips = useMemo(() => {
    const base = activeLeagues.slice(0, LEAGUE_CHIP_LIMIT);
    if (
      effectiveLeague !== ALL &&
      !base.some((lg) => lg.league === effectiveLeague)
    ) {
      const selected = activeLeagues.find((lg) => lg.league === effectiveLeague);
      if (selected) {
        return [...base.slice(0, LEAGUE_CHIP_LIMIT - 1), selected];
      }
    }
    return base;
  }, [activeLeagues, effectiveLeague]);

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
        return g.picks.some((pk) => {
          const unlocked = isPickUnlocked(pk, g.status, viewerRole);
          const fullLabel = formatCompletePickLabel(pk, g.sport);
          return (
            pk.categoryLabel.toLowerCase().includes(q) ||
            (unlocked && fullLabel.toLowerCase().includes(q))
          );
        });
      }
      return true;
    });
  }, [effectiveLeague, manualQuery, openGamesAll, sportFilter, viewerRole]);

  const availableAutoSlots = allowSgp ? allOpenGames.length * 2 : allOpenGames.length;
  const maxAutoLegs = Math.min(MAX_PARLAY_LEGS, Math.max(2, availableAutoSlots));
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
      const atMaxLegs = !inSlip && parlayLegs.length >= MAX_PARLAY_LEGS;
      const sameGameExists = parlayLegs.some(
        (l) => l.pick.gameId === pick.gameId && l.pick.id !== pick.id,
      );
      const compat = checkParlayCompatibility(parlayLegs, pick, allowSgp);
      const prefQuote = resolvePreferredBookQuote(pick.bookQuotes, preferredBooks);
      const bestOddsDecimal = prefQuote?.decimal ?? pick.marketDecimal ?? null;
      const bestBookLabel = prefQuote?.bookLabel ?? pick.marketBookLabel ?? null;
      const rawEvPct = computeExpectedValuePct(pick.p, bestOddsDecimal);
      const evPct =
        rawEvPct !== null && rawEvPct <= MAX_DISPLAY_LEG_EV_PCT ? rawEvPct : null;
      const movementInfo = classifyOddsMovement(
        prefQuote?.openingDecimal ?? null,
        bestOddsDecimal,
        prefQuote?.movementDirection ?? null,
      );
      return {
        id: pick.id,
        game,
        pick,
        completeLabel: formatCompletePickLabel(pick, game.sport),
        marketFamily: resolvePickMarketFamily(pick, game.sport),
        unlocked,
        inSlip,
        atMaxLegs,
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
          const unlocked = isPickUnlocked(pick, game.status, viewerRole);
          const fullLabel = formatCompletePickLabel(pick, game.sport);
          const matchHay =
            `${game.home.name} ${game.away.name} ${game.home.shortName} ${game.away.shortName} ${game.leagueLabel}`.toLowerCase();
          const pickHay = unlocked
            ? `${fullLabel} ${pick.categoryLabel}`.toLowerCase()
            : pick.categoryLabel.toLowerCase();
          if (!matchHay.includes(q) && !pickHay.includes(q)) continue;
        }
        rows.push(buildPickerRow(game, pick));
      }
    }
    return rows;
  }, [allOpenGames, buildPickerRow, categoryFilter, manualQuery, viewerRole]);

  const visibleManualRows = useMemo(
    () => manualPickerRowsAll.slice(0, catalogLimit),
    [catalogLimit, manualPickerRowsAll],
  );

  const autoPreviewRows = useMemo<PickerRow[]>(() => {
    if (autoPreview.status !== "insufficient" && autoPreview.legs.length > 0) {
      const previewRows: PickerRow[] = [];
      for (const leg of autoPreview.legs.slice(0, AUTO_PREVIEW_LIMIT)) {
        const game = gamesById.get(leg.pick.gameId);
        if (game) {
          previewRows.push(buildPickerRow(game, leg.pick));
        }
      }
      if (previewRows.length > 0) return previewRows;
    }
    const fallback: PickerRow[] = [];
    for (const game of allOpenGames.slice(0, AUTO_PREVIEW_LIMIT)) {
      const topPick = game.picks[0];
      if (topPick) {
        fallback.push(buildPickerRow(game, topPick));
      }
    }
    return fallback;
  }, [allOpenGames, autoPreview.legs, autoPreview.status, buildPickerRow, gamesById]);

  const hasAutoProposal = autoPreview.status !== "insufficient" && autoPreview.legs.length >= 2;
  const autoPreviewInSlipCount = useMemo(
    () => autoPreviewRows.filter((row) => row.inSlip).length,
    [autoPreviewRows],
  );
  const allAutoPreviewInSlip =
    hasAutoProposal &&
    autoPreviewRows.length > 0 &&
    autoPreviewInSlipCount === autoPreviewRows.length;

  const hasSlipLegs = parlaySummary.legs.length > 0;
  const exceedsMaxLegs = parlaySummary.legs.length > MAX_PARLAY_LEGS;
  const canSealParlay = parlaySummary.legs.length >= 2 && !exceedsMaxLegs;

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
    if (!hasSlipLegs) return null;
    const adapted = parlaySummary.legs.map(({ pick }) =>
      matchPickToBetBuilderLeg(pick, sportForLeague(pick.league)),
    );
    return evaluateBetBuilder(adapted, { offeredBookDecimal: parsedBookParlayDec });
  }, [hasSlipLegs, parlaySummary.legs, parsedBookParlayDec]);

  const probabilityBounds = useMemo(
    () => computeSlipProbabilityBounds(parlaySummary.legs),
    [parlaySummary.legs],
  );

  const activeSgpAudit =
    hasSlipLegs && parlaySummary.hasSgpCorrelation ? resolvedSgpAudit : null;

  const effectiveSlipProb = useMemo(() => {
    if (!hasSlipLegs) return 0;
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
    return Math.min(probabilityBounds.upper, Math.max(probabilityBounds.lower, candidate));
  }, [
    activeSgpAudit,
    betBuilderEval,
    hasSlipLegs,
    parlaySummary,
    probabilityBounds.lower,
    probabilityBounds.upper,
  ]);

  const effectiveSlipFairDec = useMemo<number | null>(() => {
    if (!hasSlipLegs || effectiveSlipProb <= 0) return null;
    if (
      activeSgpAudit &&
      parlaySummary.legs.length === activeSgpAudit.nLegs &&
      activeSgpAudit.fairCombinedDecimal > 1.01
    ) {
      return activeSgpAudit.fairCombinedDecimal;
    }
    return Math.max(1.02, Math.round((1 / Math.max(effectiveSlipProb, 0.0001)) * 100) / 100);
  }, [activeSgpAudit, effectiveSlipProb, hasSlipLegs, parlaySummary.legs.length]);

  const effectiveSlipBookDec = useMemo<number | null>(() => {
    if (!hasSlipLegs) return null;
    if (parsedBookParlayDec !== null && parsedBookParlayDec > 1.01) {
      return parsedBookParlayDec;
    }
    if (
      parlaySummary.bookDecimal != null &&
      Number.isFinite(parlaySummary.bookDecimal) &&
      parlaySummary.bookDecimal > 1.01
    ) {
      return parlaySummary.bookDecimal;
    }
    return effectiveSlipFairDec;
  }, [effectiveSlipFairDec, hasSlipLegs, parlaySummary.bookDecimal, parsedBookParlayDec]);

  const effectiveSlipEvPct = useMemo<number | null>(() => {
    if (!hasSlipLegs || effectiveSlipBookDec === null || effectiveSlipProb <= 0) {
      return null;
    }
    const raw = Math.round((effectiveSlipProb * effectiveSlipBookDec - 1) * 1000) / 10;
    if (!Number.isFinite(raw) || raw > MAX_DISPLAY_SLIP_EV_PCT) {
      return null;
    }
    return raw;
  }, [effectiveSlipBookDec, effectiveSlipProb, hasSlipLegs]);

  const effectiveReturnUnits =
    hasSlipLegs && effectiveSlipBookDec !== null
      ? Math.round(parlaySummary.stakeUnits * effectiveSlipBookDec * 100) / 100
      : 0;

  const slipRisk = useMemo(
    () =>
      hasSlipLegs
        ? assessParlayRisk({
            ...parlaySummary,
            combinedProbability: effectiveSlipProb,
          })
        : null,
    [effectiveSlipProb, hasSlipLegs, parlaySummary],
  );

  const sgpHoldAlert = useMemo<InlineSlipAlert | null>(() => {
    if (bookOddsInvalid) {
      return {
        tone: "warning",
        title: "Formato de momio no reconocido",
        detail: "Captura un momio decimal (> 1.01, ej. 4.40) o americano (ej. +340, -110).",
        code: "invalid_odds_input",
      };
    }
    if (!hasSlipLegs) return null;
    if (activeSgpAudit?.bookQuoteAudit?.taxFlag === "severe_sgp_tax") {
      return {
        tone: "danger",
        title: `Sobrecargo alto SGP (${activeSgpAudit.bookQuoteAudit.effectiveHoldPct.toFixed(1)} % margen)`,
        detail: `Tu casa paga ${formatSafeOdds(activeSgpAudit.bookQuoteAudit.offeredDecimal, oddsFormat)} frente al justo calibrado ${formatSafeOdds(activeSgpAudit.bookQuoteAudit.fairCombinedDecimal, oddsFormat)}.`,
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
  }, [activeSgpAudit, betBuilderEval, bookOddsInvalid, hasSlipLegs, oddsFormat]);

  const visibleSports = useMemo(
    () => SPORTS.filter((sp) => (sportCounts[sp.id] ?? 0) > 0),
    [sportCounts],
  );

  const slipLegItems = useMemo<readonly SlipLegViewItem[]>(
    () =>
      parlaySummary.legs.map(({ pick }) => {
        const game = gamesById.get(pick.gameId);
        const sport = game ? game.sport : sportForLeague(pick.league);
        return {
          pick,
          game,
          fullLabel: formatCompletePickLabel(pick, sport),
          family: resolvePickMarketFamily(pick, sport),
          isSgpLeg: sgpGameIds.has(pick.gameId),
        };
      }),
    [gamesById, parlaySummary.legs, sgpGameIds],
  );

  const handleSelectLeague = useCallback(
    (rawValue: string) => {
      if (rawValue === ALL) {
        setLeagueFilter(ALL);
      } else {
        const matched = activeLeagues.find((lg) => lg.league === rawValue);
        setLeagueFilter(matched ? matched.league : ALL);
      }
      setCatalogLimit(INITIAL_MANUAL_ROWS);
    },
    [activeLeagues],
  );

  const handleModeChange = useCallback((nextId: string) => {
    if (nextId === "auto" || nextId === "manual") {
      setBuilderMode(nextId);
      setInlineAlert(null);
    }
  }, []);

  const handleCategoryChange = useCallback((nextId: string) => {
    if (isManualCategoryFilter(nextId)) {
      setCategoryFilter(nextId);
      setCatalogLimit(INITIAL_MANUAL_ROWS);
    }
  }, []);

  const handleInspectRow = useCallback((pick: MatchPick, game: PlatformGame) => {
    setInspectedRow({ pick, game });
  }, []);

  const handleCloseInspect = useCallback(() => {
    setInspectedRow(null);
  }, []);

  const handleNavigateUpgrade = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      navigateTo(upgradeHref);
    },
    [navigateTo, upgradeHref],
  );

  const handleManualQueryChange = useCallback((next: string) => {
    setManualQuery(next);
    setCatalogLimit(INITIAL_MANUAL_ROWS);
  }, []);

  const handleResetManualFilters = useCallback(() => {
    setSportFilter(ALL);
    setLeagueFilter(ALL);
    setCategoryFilter("all");
    setManualQuery("");
    setCatalogLimit(INITIAL_MANUAL_ROWS);
  }, []);

  const handlePickAction = useCallback(
    (row: PickerRow) => {
      if (row.inSlip) {
        setInlineAlert(null);
        removePickFromParlay(row.pick.id);
        return;
      }
      if (row.atMaxLegs) {
        setInlineAlert({
          tone: "warning",
          title: `Máximo ${MAX_PARLAY_LEGS} selecciones por boleto`,
          detail: `Quita una selección antes de agregar otra para poder sellar en Mi récord.`,
          code: "max_legs",
        });
        return;
      }
      if (!row.compat.allowed) {
        setInlineAlert({
          tone: row.compat.code === "same_game_disabled" ? "warning" : "danger",
          title: getCompactBlockReason(row.sameGameExists, allowSgp, row.compat, false),
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
          title: getCompactBlockReason(row.sameGameExists, allowSgp, check, false),
          detail: check.reason ?? "No se pudo agregar esta selección al boleto.",
          code: check.code,
        });
      }
    },
    [addPickToParlay, allowSgp, parlayLegs, removePickFromParlay],
  );

  const handleGenerateAuto = () => {
    setInlineAlert(null);
    if (hasAutoProposal) {
      const styleLabel = DAILY_PARLAY_STYLE_SPECS[autoRisk].label;
      loadParlayPicks(
        autoPreview.legs.slice(0, MAX_PARLAY_LEGS).map((l) => l.pick),
        {
          allowSgp,
          label:
            targetPreset === "libre"
              ? `Parlay automático (${styleLabel})`
              : `Parlay automático (${activePresetSpec.label} · ${styleLabel})`,
        },
      );
      return;
    }
    const count = generateAutoParlay({
      leagues: scopedLeagueIds.length > 0 ? scopedLeagueIds : dataset.leagues.map((l) => l.league),
      risk: autoRisk,
      legCount: Math.min(MAX_PARLAY_LEGS, effectiveAutoLegCount),
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

  const handleShareParlay = () => {
    if (!canSealParlay || effectiveSlipFairDec === null || effectiveSlipBookDec === null) {
      return;
    }
    const formattedLegs = parlaySummary.legs.map(({ pick }) => {
      const gm = gamesById.get(pick.gameId);
      const sport = gm ? gm.sport : sportForLeague(pick.league);
      const fullLabel = formatCompletePickLabel(pick, sport);
      const matchName = gm
        ? `${gm.home.shortName} vs ${gm.away.shortName}`
        : pick.matchLabel;
      return {
        label: fullLabel,
        matchLabel: gm
          ? `${matchName} · ${shortDateLabel(gm.dayId)} ${gm.kickoffLocal}`
          : `${matchName} · ${pick.kickoffLocal}`,
        summaryLine: `${matchName}: ${fullLabel}`,
        p: pick.p,
        fairDecimal: pick.fairDecimal,
        marketDecimal: pick.marketDecimal,
        kickoffLocal: pick.kickoffLocal,
      };
    });
    const uniqueLeagues = Array.from(
      new Set(parlaySummary.legs.map((l) => l.pick.leagueLabel)),
    );
    openShareTicket({
      kind: "parlay",
      title: `Parlay PitchLab (${parlaySummary.legs.length} selecciones)`,
      subtitle: parlaySummary.hasSgpCorrelation
        ? "Ajuste automático por correlación dentro del mismo partido"
        : "Combinada calibrada · PitchLab",
      leagueLabel: uniqueLeagues.length === 1 ? uniqueLeagues[0]! : "Multi-Liga",
      pickLabel: formattedLegs.map((l) => l.summaryLine).join(" · "),
      legs: formattedLegs.map((l) => ({
        label: l.label,
        matchLabel: l.matchLabel,
        p: l.p,
        fairDecimal: l.fairDecimal,
        marketDecimal: l.marketDecimal,
        kickoffLocal: l.kickoffLocal,
      })),
      probability: effectiveSlipProb,
      fairDecimal: effectiveSlipFairDec,
      marketDecimal: effectiveSlipBookDec,
      units: parlaySummary.stakeUnits,
      gameStatus: "NS",
    });
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
                logoUrl={row.game.leagueLogoUrl || undefined}
                size={14}
              />
              <span className="pl-pb-crest-pair">
                <TeamBadge
                  league={row.game.league}
                  slug={row.game.home.slug}
                  name={row.game.home.name}
                  logoUrl={row.game.home.logoUrl || undefined}
                  size={15}
                />
                <span className="truncate">{row.game.home.shortName}</span>
                <span className="pl-pb-vs" aria-hidden="true">
                  vs
                </span>
                <TeamBadge
                  league={row.game.league}
                  slug={row.game.away.slug}
                  name={row.game.away.name}
                  logoUrl={row.game.away.logoUrl || undefined}
                  size={15}
                />
                <span className="truncate">{row.game.away.shortName}</span>
              </span>
            </span>
            <span className="pl-pb-pick-line">
              <MarketCategoryIcon family={row.marketFamily} size={16} />
              <span className="pl-pb-pick-label">
                {row.unlocked ? row.completeLabel : "Selección reservada Pase PitchLab Ultra"}
              </span>
            </span>
            <span className="pl-pb-pick-cat">
              {shortDateLabel(row.game.dayId)} {row.game.kickoffLocal} · {row.pick.categoryLabel}
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
              fairLabel={formatSafeOdds(row.pick.fairDecimal, oddsFormat)}
              bestBookLabel={row.bestBookLabel}
              bestOddsLabel={
                row.bestOddsDecimal !== null
                  ? formatSafeOdds(row.bestOddsDecimal, oddsFormat)
                  : null
              }
              evPct={null}
            />
          ) : (
            <span className="text-xs font-semibold" style={{ color: "var(--pl-text-muted)" }}>
              Reservado
            </span>
          ),
      },
      {
        key: "signals",
        header: "Señal",
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
              {formatSafeOdds(pickReferenceDecimal(row.pick), oddsFormat)}
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
          const isBlocked = !row.inSlip && (row.atMaxLegs || !row.compat.allowed);
          const blockedLabel = isBlocked
            ? getCompactBlockReason(row.sameGameExists, allowSgp, row.compat, row.atMaxLegs)
            : null;
          const visibleLabel = row.inSlip
            ? "En boleto"
            : isBlocked
              ? (blockedLabel ?? "Bloqueado")
              : "Agregar";
          return (
            <div className="pl-pb-row-actions">
              <ParlayBetBuilderButton
                pick={row.pick}
                game={row.game}
                onInspect={handleInspectRow}
                compact
              />
              <Button
                variant={isBlocked ? "ghost" : "secondary"}
                tone={isBlocked ? "danger" : "default"}
                size="sm"
                className={`min-w-11 pl-pb-toggle-btn ${row.inSlip ? "is-selected" : ""}`.trim()}
                aria-pressed={!isBlocked ? row.inSlip : undefined}
                aria-label={`${visibleLabel}: ${row.completeLabel} (${row.game.home.shortName} vs ${row.game.away.shortName})`}
                data-pick-toggle={row.pick.id}
                data-pick-blocked={
                  isBlocked ? (row.atMaxLegs ? "max_legs" : (row.compat.code ?? "blocked")) : undefined
                }
                title={
                  row.atMaxLegs
                    ? `Máximo ${MAX_PARLAY_LEGS} selecciones por boleto`
                    : blockedLabel
                      ? row.compat.reason
                      : undefined
                }
                onClick={() => handlePickAction(row)}
              >
                <MaestroIcon
                  name={row.inSlip ? "check" : isBlocked ? "alert-warning" : "plus"}
                  size={13}
                />
                <span>{visibleLabel}</span>
              </Button>
            </div>
          );
        },
      },
    ],
    [
      allowSgp,
      handleInspectRow,
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
        label: "Probabilidad",
        value: !hasSlipLegs
          ? "—"
          : effectiveSlipProb * 100 < 0.1
            ? "< 0.1 %"
            : `${(effectiveSlipProb * 100).toFixed(1)} %`,
        tone: hasSlipLegs ? "brand" : "default",
      },
      {
        id: "book",
        label: parsedBookParlayDec ? "Tu momio total" : "Momio combinado",
        value: hasSlipLegs ? formatSafeOdds(effectiveSlipBookDec, oddsFormat) : "—",
      },
      {
        id: "fair",
        label: "Momio justo",
        value: hasSlipLegs ? formatSafeOdds(effectiveSlipFairDec, oddsFormat) : "—",
      },
      {
        id: "ev",
        label: "EV",
        value:
          hasSlipLegs && effectiveSlipEvPct !== null
            ? `${effectiveSlipEvPct >= 0 ? "+" : ""}${effectiveSlipEvPct.toFixed(1)} %`
            : "—",
        delta:
          hasSlipLegs && effectiveReturnUnits > 0
            ? `Ret. ${effectiveReturnUnits.toFixed(2)}u`
            : undefined,
        tone:
          !hasSlipLegs || effectiveSlipEvPct === null
            ? "default"
            : effectiveSlipEvPct >= 0
              ? "positive"
              : "negative",
      },
    ],
    [
      effectiveReturnUnits,
      effectiveSlipBookDec,
      effectiveSlipEvPct,
      effectiveSlipFairDec,
      effectiveSlipProb,
      hasSlipLegs,
      oddsFormat,
      parsedBookParlayDec,
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
  const riskStyleLabel = DAILY_PARLAY_STYLE_SPECS[autoRisk].label;
  const autoPreviewCount = hasAutoProposal ? autoPreview.legs.length : effectiveAutoLegCount;

  return (
    <AtmosphereStage activePath="/app/parlays">
      <ClubWorkspaceShell activePath="/app/parlays">
        <div className="pl-pb-page">
          <header className="pl-pb-header">
            <div className="pl-pb-header-copy">
              <h1 className="pl-pb-title">Armar parlay</h1>
              <p className="pl-pb-subtitle">
                Genera una combinada calibrada en segundos o elige entre 2 y {MAX_PARLAY_LEGS}{" "}
                selecciones partido por partido.
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
                  onSearchChange={builderMode === "manual" ? handleManualQueryChange : undefined}
                  searchPlaceholder="Buscar equipo, liga o mercado…"
                  resultCount={
                    builderMode === "manual" ? manualPickerRowsAll.length : allOpenGames.length
                  }
                  trailing={
                    activeLeagues.length > LEAGUE_CHIP_LIMIT ? (
                      <div className="min-w-0 w-full sm:w-auto">
                        <label htmlFor={leagueSelectId} className="sr-only">
                          Más ligas disponibles
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
                    ) : undefined
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
                    {visibleSports.map((sp) => (
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

                {visibleLeagueChips.length > 0 ? (
                  <div
                    className="pl-pb-league-strip"
                    role="group"
                    aria-label="Filtrar por liga"
                    data-parlay-league-chips=""
                  >
                    <button
                      type="button"
                      className="pl-pb-league-chip num"
                      aria-pressed={effectiveLeague === ALL}
                      data-parlay-league-chip="all"
                      onClick={() => handleSelectLeague(ALL)}
                    >
                      <span>Todas las ligas</span>
                    </button>
                    {visibleLeagueChips.map((lg) => (
                      <button
                        key={lg.league}
                        type="button"
                        className="pl-pb-league-chip num"
                        aria-pressed={effectiveLeague === lg.league}
                        data-parlay-league-chip={lg.league}
                        onClick={() => handleSelectLeague(lg.league)}
                      >
                        <LeagueBadge
                          league={lg.league}
                          label={lg.label}
                          logoUrl={lg.logoUrl || undefined}
                          size={16}
                        />
                        <span className="pl-pb-league-chip-name">{lg.label}</span>
                        <span className="pl-pb-league-chip-count">{lg.openCount}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {activeAlert ? (
                <div
                  className={`pl-pb-alert is-${activeAlert.tone}`}
                  role="alert"
                  data-parlay-inline-alert={activeAlert.code ?? "notice"}
                >
                  <div className="pl-pb-alert-body">
                    <MaestroIcon name="alert-warning" size={16} />
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
                      hasAutoProposal ? (
                        <span className="pl-pb-preview-pill num">
                          {autoPreview.legs.length} selecciones ·{" "}
                          {autoPreview.combinedProbability * 100 < 0.1
                            ? "< 0.1 %"
                            : `${(autoPreview.combinedProbability * 100).toFixed(1)} %`}{" "}
                          · Justo {formatSafeOdds(autoPreview.fairDecimal, oddsFormat)}
                        </span>
                      ) : (
                        <span>Ajusta tus filtros</span>
                      )
                    }
                  >
                    <div className="pl-pb-auto-stack">
                      <div className="pl-pb-decisions-grid">
                        <div className="pl-pb-field">
                          <span className="pl-pb-field-label">1. Riesgo</span>
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
                                {DAILY_PARLAY_STYLE_SPECS[r].label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="pl-pb-field">
                          <span className="pl-pb-field-label num">
                            2. Selecciones (2–{MAX_PARLAY_LEGS})
                          </span>
                          <div
                            className="pl-pb-chip-row"
                            role="group"
                            aria-label="Número de selecciones"
                          >
                            {LEG_COUNT_PRESETS.map((cnt) => (
                              <button
                                key={cnt}
                                type="button"
                                disabled={cnt > availableAutoSlots}
                                className="pl-pb-chip is-count num"
                                aria-pressed={effectiveAutoLegCount === cnt}
                                onClick={() => setAutoLegCount(cnt)}
                              >
                                {cnt}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="pl-pb-field pl-pb-field-full">
                          <span className="pl-pb-field-label">3. Cuota meta</span>
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
                      </div>

                      <div className="pl-pb-sgp-bar">
                        <div className="pl-pb-sgp-copy">
                          <span className="pl-pb-sgp-title">Mismo partido (SGP)</span>
                          <span className="pl-pb-sgp-desc">
                            Hasta 2 selecciones compatibles del mismo encuentro. Ajuste automático
                            por correlación dentro del mismo partido.
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
                            <MaestroIcon name="alert-warning" size={15} />
                            <div className="pl-pb-alert-text">
                              <strong>Sin combinación completa con esa regla</strong>
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

                      <div className="pl-pb-auto-cta-row">
                        <Button
                          variant={
                            allAutoPreviewInSlip || parlaySummary.legs.length >= 2
                              ? "secondary"
                              : "primary"
                          }
                          size="default"
                          className="w-full"
                          data-generate-parlay=""
                          onClick={handleGenerateAuto}
                        >
                          <MaestroIcon
                            name={
                              allAutoPreviewInSlip
                                ? "verified-seal"
                                : hasSlipLegs
                                  ? "refresh-sync"
                                  : "target-picks"
                            }
                            size={16}
                          />
                          <span>
                            {allAutoPreviewInSlip
                              ? `Ya cargada en tu boleto (${autoPreviewCount} selecciones)`
                              : hasSlipLegs
                                ? `Reemplazar boleto (${autoPreviewCount} selecciones · ${riskStyleLabel}${targetPreset !== "libre" ? ` · ${activePresetSpec.label}` : ""})`
                                : `Cargar al boleto (${autoPreviewCount} selecciones · ${riskStyleLabel}${targetPreset !== "libre" ? ` · ${activePresetSpec.label}` : ""})`}
                          </span>
                        </Button>

                        {autoPreviewInSlipCount > 0 && !allAutoPreviewInSlip ? (
                          <p className="pl-pb-sync-note num" role="status">
                            {autoPreviewInSlipCount} de {autoPreviewRows.length} selecciones
                            propuestas ya están en tu boleto.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </SofascoreCard>

                  <SofascoreCard
                    title={
                      hasAutoProposal
                        ? "Vista previa de tu combinada"
                        : "Cartelera abierta elegible"
                    }
                    meta={`${autoPreviewRows.length} ${autoPreviewRows.length === 1 ? "selección" : "selecciones"}`}
                    density="compact"
                  >
                    {autoPreviewRows.length === 0 ? (
                      <SofascoreEmptyState
                        title="Sin partidos abiertos con ese filtro"
                        description="Prueba con otro deporte o selecciona Todas las ligas."
                        actionLabel="Ver todos los deportes"
                        onAction={() => {
                          setSportFilter(ALL);
                          setLeagueFilter(ALL);
                        }}
                      />
                    ) : (
                      <ul
                        className="pl-pb-preview-list"
                        role="list"
                        data-parlay-auto-preview=""
                      >
                        {autoPreviewRows.map((row) => (
                          <AutoPreviewRowItem
                            key={row.id}
                            row={row}
                            allowSgp={allowSgp}
                            oddsFormat={oddsFormat}
                            hasAccountSession={hasAccountSession}
                            upgradeHref={upgradeHref}
                            onInspect={handleInspectRow}
                            onPickAction={handlePickAction}
                            onNavigateUpgrade={handleNavigateUpgrade}
                          />
                        ))}
                      </ul>
                    )}
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
                    title="Selector de selecciones"
                    density="compact"
                    meta={
                      <div className="pl-pb-switch-wrap">
                        <Switch isSelected={allowSgp} onChange={setAllowSgp}>
                          <Switch.Control>
                            <Switch.Thumb />
                          </Switch.Control>
                          <Switch.Content>
                            <span className="text-xs font-bold">Mismo partido (SGP)</span>
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
                        className="pl-pb-table-wrap"
                        emptyState={
                          <SofascoreEmptyState
                            title="Sin selecciones abiertas con ese filtro"
                            description="Prueba con otro deporte, mercado o limpia la búsqueda."
                            actionLabel="Restablecer filtros"
                            onAction={handleResetManualFilters}
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
                      {parlaySummary.legs.length} / {MAX_PARLAY_LEGS}
                    </span>
                    {hasSlipLegs ? (
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
                  {!hasSlipLegs ? (
                    <SofascoreEmptyState
                      title="Tu boleto combinado está vacío"
                      description={`Usa el generador automático o elige entre 2 y ${MAX_PARLAY_LEGS} selecciones compatibles.`}
                    />
                  ) : (
                    <ul className="pl-pb-legs" role="list">
                      {slipLegItems.map((item) => (
                        <ParlaySlipLegRow
                          key={item.pick.id}
                          item={item}
                          oddsFormat={oddsFormat}
                          onRemove={removePickFromParlay}
                        />
                      ))}
                    </ul>
                  )}

                  {parlaySummary.legs.length === 1 ? (
                    <div className="pl-pb-alert is-info" role="status">
                      <div className="pl-pb-alert-body">
                        <MaestroIcon name="layers" size={14} />
                        <div className="pl-pb-alert-text">
                          <strong>Falta 1 selección para sellar</strong>
                          <p>
                            Agrega al menos 1 selección compatible más (2 a {MAX_PARLAY_LEGS}{" "}
                            selecciones).
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {exceedsMaxLegs ? (
                    <div className="pl-pb-alert is-danger" role="alert">
                      <div className="pl-pb-alert-body">
                        <MaestroIcon name="alert-warning" size={15} />
                        <div className="pl-pb-alert-text">
                          <strong>Máximo {MAX_PARLAY_LEGS} selecciones para sellar</strong>
                          <p>
                            Quita {parlaySummary.legs.length - MAX_PARLAY_LEGS}{" "}
                            {parlaySummary.legs.length - MAX_PARLAY_LEGS === 1
                              ? "selección"
                              : "selecciones"}{" "}
                            para guardar tu boleto en Mi récord.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {hasSlipLegs && slipRisk ? (
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
                      <div className="pl-pb-risk-track" aria-hidden="true">
                        <div
                          className="pl-pb-risk-fill"
                          style={{
                            width: `${slipRisk.meterPct}%`,
                            background: riskToneCss(slipRisk.tone),
                          }}
                        />
                      </div>
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
                  ) : null}

                  {hasSlipLegs && parlaySummary.hasSgpCorrelation ? (
                    <SgpCopulaAuditCard
                      legs={parlaySummary.legs}
                      oddsFormat={oddsFormat}
                      offeredCombinedDecimalOdds={parsedBookParlayDec}
                      onAuditResolved={setResolvedSgpAudit}
                    />
                  ) : null}

                  <div className="pl-pb-slip-controls">
                    <SofascoreKpiStrip items={slipKpiItems} />

                    {hasSlipLegs ? (
                      <>
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
                          <label htmlFor={bookOddsInputId} className="pl-pb-slip-label">
                            Momio total en tu casa
                          </label>
                          <div className="pl-pb-odds-field">
                            <input
                              id={bookOddsInputId}
                              type="text"
                              inputMode="decimal"
                              autoCorrect="off"
                              spellCheck={false}
                              value={bookParlayOddsRaw}
                              onChange={(e) => setBookParlayOddsRaw(e.target.value)}
                              placeholder="Opcional (+340 / 4.40)"
                              aria-invalid={bookOddsInvalid || undefined}
                              aria-describedby={bookOddsInvalid ? bookOddsErrorId : undefined}
                              className="pl-pb-input pl-pb-input-odds num"
                            />
                            {bookOddsInvalid ? (
                              <span
                                id={bookOddsErrorId}
                                className="pl-pb-input-error"
                                role="alert"
                              >
                                Usa decimal (&gt; 1.01) o americano (+340 / -110).
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>

                  <div className="pl-pb-slip-actions">
                    <Button
                      variant="secondary"
                      size="default"
                      className="w-full"
                      disabled={!canSealParlay}
                      onClick={handleShareParlay}
                    >
                      <MaestroIcon name="share" size={14} />
                      <span>Compartir</span>
                    </Button>
                    <Button
                      variant="primary"
                      size="default"
                      className="w-full num"
                      disabled={!canSealParlay}
                      onClick={() => sealParlayToJournal(undefined, parsedBookParlayDec)}
                    >
                      <MaestroIcon name="verified-seal" size={15} />
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
                      <li>
                        <strong>Límite por boleto:</strong> Puedes combinar de 2 a{" "}
                        {MAX_PARLAY_LEGS} selecciones por boleto sellado.
                      </li>
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

        {inspectedRow ? (
          <Suspense fallback={null}>
            <LazyBetBuilderDrawer
              open
              pick={inspectedRow.pick}
              game={inspectedRow.game}
              onClose={handleCloseInspect}
            />
          </Suspense>
        ) : null}

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
