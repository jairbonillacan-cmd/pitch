"use client";

import React, { memo, useCallback, useId, useMemo, useRef } from "react";
import { canonicalGameHref, type LiveScoreboardEntry } from "@pitchlab/contracts";
import { Button } from "../../../components/ui/primitives";
import { LeagueBadge, TeamBadge } from "../../../sports";
import { formatOddsValue, isPickUnlocked } from "../../access-guard";
import { LivePickProgressBar } from "../../atomic";
import { parseManualOddsInput } from "../../bookmakers";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { MarketCategoryIcon } from "../../components/PackSportIcons";
import { useSheetSwipeDismiss } from "../../components/use-sheet-swipe-dismiss";
import { useSafeEffect } from "../../hooks";
import { useIsPickInParlay, usePlatformActions } from "../../platform-provider";
import type { MatchPick, OddsFormat, PlatformGame, ViewerRole } from "../../types";
import { PersonAvatar } from "../team/PersonAvatar";
import { computeExpectedValuePct } from "./BookmakerComparePill";
import { EvidenceWindowPills } from "./EvidenceWindowPills";
import {
  MAX_AUDITABLE_EV_PCT,
  MAX_SHARP_AUDITABLE_EV_PCT,
  MAX_SOFT_AUDITABLE_EV_PCT,
  estimateResidualProjection,
  formatProjectedScore,
  formatValueThresholdForOdds,
  inferLiveDirection,
  inferLiveUnitLabel,
  isSharpQuoteBook,
  normText,
  periodShortTag,
  resolveLiveStatusPill,
  settlementLabel,
  type LiveTrackedPickView,
  type ScreenerItem,
  type TimingMode,
} from "./picks-finder-model";

export const loadPickEvidenceLabDrawer = () =>
  import("./PickEvidenceLabDrawer").then((mod) => ({
    default: mod.PickEvidenceLabDrawer,
  }));

export const loadBetBuilderDrawer = () =>
  import("./BetBuilderDrawer").then((mod) => ({
    default: mod.BetBuilderDrawer,
  }));

export function prefetchPickEvidenceLabDrawer(): void {
  void loadPickEvidenceLabDrawer();
}

export function prefetchBetBuilderDrawer(): void {
  void loadBetBuilderDrawer();
}

export const ParlayRowButton = memo(function ParlayRowButton({
  pick,
  compact = false,
}: {
  readonly pick: MatchPick;
  readonly compact?: boolean;
}): React.JSX.Element {
  const { addPickToParlay, removePickFromParlay } = usePlatformActions();
  const on = useIsPickInParlay(pick.id);
  const handleToggle = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (on) removePickFromParlay(pick.id);
      else addPickToParlay(pick);
    },
    [addPickToParlay, on, pick, removePickFromParlay],
  );
  return (
    <button
      type="button"
      className={`pl-scr-row-action ${on ? "is-on" : ""} ${compact ? "is-compact" : ""}`.trim()}
      aria-pressed={on}
      aria-label={`${on ? "Quitar del parlay" : "Agregar al parlay"}: ${pick.label}, ${pick.matchLabel}`}
      onClick={handleToggle}
    >
      <MaestroIcon name={on ? "check" : "plus"} size={12} />
      <span>{on ? "En parlay" : "Parlay"}</span>
    </button>
  );
});

export const ScreenerBetBuilderButton = memo(function ScreenerBetBuilderButton({
  pick,
  game,
  onOpenBuilder,
  compact = false,
}: {
  readonly pick: MatchPick;
  readonly game: PlatformGame;
  readonly onOpenBuilder: (pick: MatchPick, game: PlatformGame) => void;
  readonly compact?: boolean;
}): React.JSX.Element {
  const inParlay = useIsPickInParlay(pick.id);
  const handleClick = useCallback(() => {
    onOpenBuilder(pick, game);
  }, [game, onOpenBuilder, pick]);
  return (
    <Button
      variant={inParlay ? "secondary" : "ghost"}
      size="sm"
      className={`pl-scr-builder-btn min-w-11 ${compact ? "is-compact" : ""} ${inParlay ? "is-in-slip" : ""}`.trim()}
      data-open-bet-builder={pick.id}
      aria-label={`Abrir Bet Builder para ${pick.label}`}
      onPointerEnter={prefetchBetBuilderDrawer}
      onFocus={prefetchBetBuilderDrawer}
      onClick={handleClick}
    >
      <MaestroIcon name="layers" size={13} />
      <span>{inParlay ? "En boleto" : "Builder"}</span>
    </Button>
  );
});

export interface ScreenerPickRowProps {
  readonly item: ScreenerItem;
  readonly timing: TimingMode;
  readonly showMatchMeta: boolean;
  readonly unlocked: boolean;
  readonly oddsFormat: OddsFormat;
  readonly manualRaw: string;
  readonly isManualOpen: boolean;
  readonly trackedLive: LiveTrackedPickView | null;
  readonly onOpenLab: (item: ScreenerItem) => void;
  readonly onOpenBuilder: (pick: MatchPick, game: PlatformGame) => void;
  readonly onOpenComposer: (pick: MatchPick) => void;
  readonly onOpenManual: (pickId: string) => void;
  readonly onManualChange: (pickId: string, value: string) => void;
}

export const ScreenerPickRow = memo(function ScreenerPickRow({
  item,
  timing,
  showMatchMeta,
  unlocked,
  oddsFormat,
  manualRaw,
  isManualOpen,
  trackedLive,
  onOpenLab,
  onOpenBuilder,
  onOpenComposer,
  onOpenManual,
  onManualChange,
}: ScreenerPickRowProps): React.JSX.Element {
  const { game, pick, playerMeta, liveProgress } = item;
  const periodTag = periodShortTag(item.period);
  const manualDec = parseManualOddsInput(manualRaw);
  const effectiveHouseDec = manualDec ?? item.houseDecimal;
  const hasHouseQuote = effectiveHouseDec !== null;
  const effectiveHouseLabel = manualDec !== null ? "Tu momio" : item.houseLabel;
  const effectiveValuePct =
    manualDec !== null ? computeExpectedValuePct(pick.p, manualDec) : item.valuePct;
  const rowEvCap =
    manualDec !== null
      ? MAX_AUDITABLE_EV_PCT
      : isSharpQuoteBook(undefined, item.houseLabel)
        ? MAX_SHARP_AUDITABLE_EV_PCT
        : MAX_SOFT_AUDITABLE_EV_PCT;
  const isOutlierEv =
    (manualDec === null && item.isPricingAnomalous) ||
    (effectiveValuePct !== null && effectiveValuePct > rowEvCap);
  const auditablePositiveEv =
    !isOutlierEv && effectiveValuePct !== null && effectiveValuePct > 0
      ? effectiveValuePct
      : null;
  const effectiveMovement = manualDec !== null ? null : (item.movement ?? null);
  const oddsDisplay =
    effectiveHouseDec !== null
      ? formatOddsValue(effectiveHouseDec, oddsFormat)
      : formatOddsValue(pick.fairDecimal, oddsFormat);

  const timeOrClock =
    item.isSettled && game.score
      ? `FT ${game.score.home}–${game.score.away}`
      : trackedLive
        ? trackedLive.clockLabel
        : liveProgress
          ? `${liveProgress.scoreLabel} · ${liveProgress.clockLabel}`
          : `${game.dayLabel} ${game.kickoffLocal}`;

  const sideTeam = item.sideBucket === "away" ? game.away : game.home;
  const isPlayerPick = Boolean(playerMeta);
  const isSideTeamPick = !isPlayerPick && (item.sideBucket === "home" || item.sideBucket === "away");
  const playerTeam = playerMeta?.teamSide === "away" ? game.away : game.home;
  const entityTitle = isPlayerPick
    ? playerMeta!.playerName
    : isSideTeamPick
      ? sideTeam.name
      : `${game.home.shortName} vs ${game.away.shortName}`;

  const liveDirection =
    trackedLive?.direction ?? (liveProgress?.asianState ? "handicap" : inferLiveDirection(pick));
  const liveStatus = item.isLiveGame
    ? resolveLiveStatusPill({ tracked: trackedLive, liveProgress, direction: liveDirection })
    : null;
  const normalizedPickLabel = normText(pick.label);
  const isBttsYes =
    normalizedPickLabel.includes("ambos anotan") && !normalizedPickLabel.includes("no");
  const rawLiveActual = liveProgress?.rawActual ?? liveProgress?.currentValue ?? null;
  const rawLiveTarget =
    typeof pick.line === "number" && Number.isFinite(pick.line)
      ? pick.line
      : (liveProgress?.rawLine ?? (isBttsYes ? 1.5 : (liveProgress?.targetValue ?? null)));
  const hasNumericLiveBar =
    unlocked &&
    item.isLiveGame &&
    (Boolean(trackedLive) ||
      (rawLiveActual !== null &&
        rawLiveTarget !== null &&
        (liveDirection === "handicap" || rawLiveTarget > 0)));

  const liveActual = trackedLive?.actualValue ?? rawLiveActual ?? 0;
  const liveTarget = trackedLive?.targetLine ?? rawLiveTarget ?? 1;
  const liveClock =
    trackedLive?.clockLabel ??
    (liveProgress ? `${liveProgress.scoreLabel} · ${liveProgress.clockLabel}` : "En vivo");
  const liveUnit =
    trackedLive?.unitLabel ??
    (liveProgress ? inferLiveUnitLabel(liveProgress, game.sport) : "goles");
  const liveProjected =
    trackedLive?.projectedFinal ??
    (liveProgress && liveDirection !== "handicap" && !isBttsYes
      ? estimateResidualProjection(liveActual, liveProgress.clockLabel, game.sport)
      : null);

  const handleRowClick = useCallback(
    (event: React.MouseEvent<HTMLTableRowElement>) => {
      if (!unlocked) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("button, a, input, select, label")) return;
      onOpenLab(item);
    },
    [item, onOpenLab, unlocked],
  );

  const handleOpenLabClick = useCallback(() => {
    onOpenLab(item);
  }, [item, onOpenLab]);

  const handleComposerClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onOpenComposer(pick);
    },
    [onOpenComposer, pick],
  );

  const handleOpenManualClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onOpenManual(pick.id);
    },
    [onOpenManual, pick.id],
  );

  const handleManualInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onManualChange(pick.id, e.target.value);
    },
    [onManualChange, pick.id],
  );

  return (
    <tr
      className={`pl-scr-row ${unlocked ? "is-clickable" : ""}`.trim()}
      data-picks-row=""
      data-pick-id={pick.id}
      data-pick-recommended={item.isRecommended ? "true" : "false"}
      onPointerEnter={unlocked ? prefetchPickEvidenceLabDrawer : undefined}
      onClick={handleRowClick}
    >
      <th scope="row" className="pl-scr-td pl-scr-col-pick" data-label="Pick">
        <div className="pl-scr-entity">
          <div className="pl-scr-entity-media">
            {isPlayerPick ? (
              <PersonAvatar photoKey={playerMeta!.photoKey ?? null} size={34} />
            ) : isSideTeamPick ? (
              <TeamBadge
                league={game.league}
                slug={sideTeam.slug}
                name={sideTeam.name}
                logoUrl={sideTeam.logoUrl}
                size={30}
              />
            ) : (
              <span className="pl-scr-dual-badges" aria-hidden="true">
                <TeamBadge
                  league={game.league}
                  slug={game.home.slug}
                  name={game.home.name}
                  logoUrl={game.home.logoUrl}
                  size={22}
                />
                <TeamBadge
                  league={game.league}
                  slug={game.away.slug}
                  name={game.away.name}
                  logoUrl={game.away.logoUrl}
                  size={22}
                />
              </span>
            )}
          </div>

          <div className="pl-scr-entity-copy">
            <strong className="pl-scr-entity-name">{entityTitle}</strong>
            <span className="pl-scr-entity-meta">
              {isPlayerPick ? (
                <>
                  <TeamBadge
                    league={game.league}
                    slug={playerMeta!.teamSlug ?? playerTeam.slug}
                    name={playerMeta!.teamName}
                    logoUrl={playerTeam.logoUrl}
                    size={13}
                  />
                  <span>{playerMeta!.teamName}</span>
                </>
              ) : (
                <span>{game.leagueLabel}</span>
              )}
              <span className="pl-scr-meta-sep" aria-hidden="true">
                ·
              </span>
              <span className="num">{timeOrClock}</span>
            </span>
            {isPlayerPick && playerMeta!.position ? (
              <span className="pl-scr-entity-pos">{playerMeta!.position}</span>
            ) : showMatchMeta && isSideTeamPick ? (
              <span className="pl-scr-entity-pos">
                {game.home.shortName} vs {game.away.shortName}
              </span>
            ) : null}
          </div>
        </div>
      </th>

      <td
        className="pl-scr-td pl-scr-col-bet"
        data-label="Apuesta"
        data-screener-pick={pick.id}
        data-market-family={item.catalogFamilyId}
      >
        <div className="pl-scr-bet-cell">
          {unlocked ? (
            <button
              type="button"
              className="pl-scr-pick-open-btn"
              aria-label={`Analizar ${pick.label} (${game.home.shortName} vs ${game.away.shortName}) en Bet Lab`}
              onPointerEnter={prefetchPickEvidenceLabDrawer}
              onFocus={prefetchPickEvidenceLabDrawer}
              onClick={handleOpenLabClick}
            >
              <MarketCategoryIcon
                family={item.catalogFamilyId}
                size={18}
                className="pl-scr-bet-icon"
              />
              <span className="pl-scr-pick-title">{pick.label}</span>
            </button>
          ) : (
            <div className="pl-scr-bet-main">
              <MarketCategoryIcon
                family={item.catalogFamilyId}
                size={18}
                className="pl-scr-bet-icon"
              />
              <strong className="pl-scr-pick-title locked-redact">
                Pick reservado Pase PitchLab Ultra
              </strong>
            </div>
          )}
          <div className="pl-scr-bet-sub">
            <span>
              {game.home.shortName} vs {game.away.shortName}
            </span>
            {periodTag ? <span className="pl-scr-period-tag">{periodTag}</span> : null}
            <span className="pl-scr-cat-tag">{pick.categoryLabel}</span>
          </div>
        </div>
      </td>

      <td className="pl-scr-td pl-scr-col-evidence" data-label="Evidencia">
        {!unlocked ? (
          <span className="pl-scr-ev-fallback">Evidencia disponible con Pase PitchLab Ultra</span>
        ) : item.isLiveGame ? (
          <div className="pl-scr-live-cell" data-picks-live-progress="" data-live-progress-bar="">
            {hasNumericLiveBar ? (
              <LivePickProgressBar
                pickLabel={pick.label}
                matchLabel={`${game.home.shortName} vs ${game.away.shortName}`}
                clockLabel={liveClock}
                actualValue={liveActual}
                targetLine={liveTarget}
                unitLabel={liveUnit}
                direction={liveDirection}
                projectedFinal={liveProjected}
                asianState={trackedLive?.asianState ?? liveProgress?.asianState ?? null}
                starterAlert={trackedLive?.starterAlert ?? null}
                starterAlertDetail={trackedLive?.starterAlertDetail ?? null}
                compact
              />
            ) : (
              <div className="pl-scr-live-fallback num">
                <span className="pl-scr-live-badge">{liveClock}</span>
                <span>{liveProgress?.statusText ?? "Seguimiento en vivo"}</span>
              </div>
            )}
            {liveStatus ? (
              <span className={`pl-scr-live-status-pill is-${liveStatus.tone}`}>
                {liveStatus.label}
              </span>
            ) : null}
          </div>
        ) : item.evidenceWindows.length > 0 ? (
          <EvidenceWindowPills
            windows={item.evidenceWindows}
            layout="bullets"
            ariaLabel={`Evidencia histórica observada para ${pick.label}`}
          />
        ) : (
          <span className="pl-scr-ev-fallback">
            {pick.rationale ? pick.rationale.slice(0, 76) : "Modelo calibrado Spacetime v5.1"}
          </span>
        )}
      </td>

      <td
        className="pl-scr-td pl-scr-col-odds"
        data-label={timing === "settled" ? "Liquidación" : "Cuotas"}
      >
        <div className="pl-scr-odds-cell">
          {unlocked && !item.isSettled && item.convergenceCount > 0 ? (
            <span
              className="pl-scr-conv-badge num"
              data-picks-convergence={item.convergenceCount}
              title={`${item.convergenceCount} ventanas históricas alineadas (≥ 65 %)`}
            >
              <span>{item.convergenceCount}</span>
              <MaestroIcon name="flame" size={11} />
            </span>
          ) : null}

          {item.isSettled ? (
            <div className="pl-scr-settlement-cell num">
              <span
                className={`pl-scr-settlement-badge is-${item.settlement}`}
                data-settlement={item.settlement}
              >
                {settlementLabel(item.settlement)}
              </span>
              {game.score ? (
                <span className="pl-scr-settlement-score">
                  {game.score.home}–{game.score.away} · FT
                </span>
              ) : null}
              {unlocked ? (
                <span className="pl-scr-spacetime-line">
                  Prob {(pick.p * 100).toFixed(1)} % · Justo{" "}
                  {formatOddsValue(pick.fairDecimal, oddsFormat)}
                </span>
              ) : null}
            </div>
          ) : !unlocked ? (
            <span className="pl-scr-locked-tag">
              <MaestroIcon name="lock" size={12} />
              <span>Ultra</span>
            </span>
          ) : (
            <>
              <div className="pl-scr-odds-pill-wrap num">
                <div
                  className={`pl-scr-odds-pill ${auditablePositiveEv !== null ? "is-ev-pos" : ""}`.trim()}
                  data-bookmaker-compare="compact"
                >
                  <strong className="pl-scr-odds-val">{oddsDisplay}</strong>
                  <span className="pl-scr-odds-book">
                    {hasHouseQuote ? (effectiveHouseLabel ?? "Casa") : "Justo"}
                  </span>
                  {effectiveMovement && effectiveMovement.kind !== "stable" ? (
                    <span
                      className={`pl-scr-move-dot is-${effectiveMovement.kind}`}
                      title={`Movimiento de línea: ${effectiveMovement.label}`}
                    >
                      {effectiveMovement.arrow}
                    </span>
                  ) : null}
                </div>

                <div className="pl-scr-odds-sub">
                  {auditablePositiveEv !== null ? (
                    <span
                      className="pl-scr-ev-tag"
                      data-ev-positive="true"
                      title="Valor esperado positivo calculado con probabilidad calibrada Spacetime"
                    >
                      +{auditablePositiveEv.toFixed(1)} % EV+
                    </span>
                  ) : isOutlierEv ? (
                    <span
                      className="pl-scr-ev-tag is-outlier"
                      data-ev-outlier="true"
                      title="Divergencia atípica entre el modelo y la cuota capturada; verifica la línea antes de jugar"
                    >
                      <MaestroIcon name="alert-warning" size={12} />
                      <span>Divergencia</span>
                    </span>
                  ) : null}
                  <span className="pl-scr-spacetime-line">
                    {hasHouseQuote
                      ? `Spacetime ${(pick.p * 100).toFixed(1)} % · Justo ${formatOddsValue(pick.fairDecimal, oddsFormat)}`
                      : `Spacetime ${(pick.p * 100).toFixed(1)} %`}
                  </span>
                </div>
              </div>

              <div className="pl-scr-row-actions">
                {!item.isLiveGame ? <ParlayRowButton pick={pick} compact /> : null}
                {!item.isLiveGame ? (
                  <button
                    type="button"
                    className="pl-scr-row-action is-compact"
                    onClick={handleComposerClick}
                  >
                    Sellar
                  </button>
                ) : null}
                {isManualOpen ? (
                  <label
                    className="pl-scr-manual-wrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="sr-only">Tu momio para {pick.label}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      enterKeyHint="done"
                      autoComplete="off"
                      placeholder={oddsFormat === "american" ? "-110" : "1.91"}
                      value={manualRaw}
                      onChange={handleManualInputChange}
                      data-manual-odds-input={pick.id}
                      className="pl-scr-manual-input num"
                    />
                  </label>
                ) : (
                  <button
                    type="button"
                    className="pl-scr-row-action is-compact is-ghost"
                    data-open-manual-odds={pick.id}
                    onClick={handleOpenManualClick}
                  >
                    Mi momio
                  </button>
                )}
                <span className="pl-scr-builder-inline">
                  <ScreenerBetBuilderButton
                    pick={pick}
                    game={game}
                    onOpenBuilder={onOpenBuilder}
                    compact
                  />
                </span>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
});

export interface ScreenerPickTableProps {
  readonly items: readonly ScreenerItem[];
  readonly limit?: number;
  readonly caption: string;
  readonly showMatchMeta: boolean;
  readonly tableKey: string;
  readonly timing: TimingMode;
  readonly viewerRole: ViewerRole;
  readonly oddsFormat: OddsFormat;
  readonly manualOddsByPick: Readonly<Record<string, string>>;
  readonly openManualPickId: string | null;
  readonly liveTrackedByPickId: ReadonlyMap<string, LiveTrackedPickView>;
  readonly onOpenLab: (item: ScreenerItem) => void;
  readonly onOpenBuilder: (pick: MatchPick, game: PlatformGame) => void;
  readonly onOpenComposer: (pick: MatchPick) => void;
  readonly onOpenManual: (pickId: string) => void;
  readonly onManualChange: (pickId: string, value: string) => void;
}

export const ScreenerPickTable = memo(function ScreenerPickTable({
  items,
  limit,
  caption,
  showMatchMeta,
  tableKey,
  timing,
  viewerRole,
  oddsFormat,
  manualOddsByPick,
  openManualPickId,
  liveTrackedByPickId,
  onOpenLab,
  onOpenBuilder,
  onOpenComposer,
  onOpenManual,
  onManualChange,
}: ScreenerPickTableProps): React.JSX.Element {
  const displayedItems = useMemo(
    () => (limit !== undefined && items.length > limit ? items.slice(0, limit) : items),
    [items, limit],
  );
  return (
    <div
      className="pl-scr-table-wrap"
      role="region"
      tabIndex={0}
      aria-labelledby={`pl-scr-cap-${tableKey}`}
    >
      <table className="pl-scr-table">
        <caption id={`pl-scr-cap-${tableKey}`} className="sr-only">
          {caption}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="pl-scr-th pl-scr-th-pick">
              Pick
            </th>
            <th scope="col" className="pl-scr-th pl-scr-th-bet">
              Apuesta
            </th>
            <th scope="col" className="pl-scr-th pl-scr-th-evidence">
              {timing === "live" ? "Avance en vivo" : "Evidencia"}
            </th>
            <th scope="col" className="pl-scr-th pl-scr-th-odds is-end">
              {timing === "settled" ? "Liquidación" : "Cuotas"}
            </th>
          </tr>
        </thead>
        <tbody>
          {displayedItems.map((item) => {
            const unlocked = isPickUnlocked(item.pick, item.game.status, viewerRole);
            const tracked = item.isLiveGame ? (liveTrackedByPickId.get(item.pick.id) ?? null) : null;
            return (
              <ScreenerPickRow
                key={item.pick.id}
                item={item}
                timing={timing}
                showMatchMeta={showMatchMeta}
                unlocked={unlocked}
                oddsFormat={oddsFormat}
                manualRaw={manualOddsByPick[item.pick.id] ?? ""}
                isManualOpen={openManualPickId === item.pick.id}
                trackedLive={tracked}
                onOpenLab={onOpenLab}
                onOpenBuilder={onOpenBuilder}
                onOpenComposer={onOpenComposer}
                onOpenManual={onOpenManual}
                onManualChange={onManualChange}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

export const ScreenerMatchGroupHeader = memo(function ScreenerMatchGroupHeader({
  game,
  liveEntry,
  itemsCount,
  isCollapsed,
  onToggleCollapse,
  onPrefetchRoute,
  onNavigateTo,
}: {
  readonly game: PlatformGame;
  readonly liveEntry?: LiveScoreboardEntry;
  readonly itemsCount: number;
  readonly isCollapsed: boolean;
  readonly onToggleCollapse: (groupKey: string) => void;
  readonly onPrefetchRoute: (href: string) => void;
  readonly onNavigateTo: (href: string) => void;
}): React.JSX.Element {
  const href = canonicalGameHref(game.league, game);
  const liveScore = liveEntry?.score ?? game.score;
  const liveClock =
    game.status === "FT"
      ? "FT"
      : (liveEntry?.clock ?? (game.status === "LIVE" ? "En vivo" : null));
  const projLabel = formatProjectedScore(game);
  const groupKey = `m:${game.id}`;

  const handleToggle = useCallback(() => {
    onToggleCollapse(groupKey);
  }, [groupKey, onToggleCollapse]);

  const handlePrefetch = useCallback(() => {
    onPrefetchRoute(href);
  }, [href, onPrefetchRoute]);

  const handleNavigate = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      onNavigateTo(href);
    },
    [href, onNavigateTo],
  );

  return (
    <header className="pl-scr-group-head">
      <button
        type="button"
        className="pl-scr-group-toggle"
        aria-expanded={!isCollapsed}
        onClick={handleToggle}
      >
        <span className="pl-scr-group-crests" aria-hidden="true">
          <TeamBadge
            league={game.league}
            slug={game.home.slug}
            name={game.home.name}
            logoUrl={game.home.logoUrl}
            size={22}
          />
          <TeamBadge
            league={game.league}
            slug={game.away.slug}
            name={game.away.name}
            logoUrl={game.away.logoUrl}
            size={22}
          />
        </span>
        <div className="pl-scr-group-meta min-w-0">
          <strong className="pl-scr-group-title truncate">
            {game.home.name} vs {game.away.name}
          </strong>
          <span className="pl-scr-group-sub num">
            <span className="pl-scr-sub-piece">
              <LeagueBadge
                league={game.league}
                label={game.leagueLabel}
                logoUrl={game.leagueLogoUrl}
                size={13}
              />
              <span>{game.leagueLabel}</span>
            </span>
            <span className="pl-scr-meta-sep" aria-hidden="true">
              ·
            </span>
            <span className="pl-scr-sub-piece">
              {liveScore && liveClock
                ? `${liveScore.home}–${liveScore.away} · ${liveClock}`
                : `${game.dayLabel} ${game.kickoffLocal}`}
            </span>
            {projLabel && game.status !== "FT" ? (
              <>
                <span className="pl-scr-meta-sep" aria-hidden="true">
                  ·
                </span>
                <span className="pl-scr-sub-piece pl-scr-group-proj">
                  {projLabel}
                </span>
              </>
            ) : null}
          </span>
        </div>
      </button>

      <div className="pl-scr-group-actions">
        <button
          type="button"
          className="pl-scr-group-count-btn num"
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? "Mostrar" : "Ocultar"} ${itemsCount} ${itemsCount === 1 ? "pick" : "picks"} de ${game.home.shortName} vs ${game.away.shortName}`}
          onClick={handleToggle}
        >
          <span className="pl-scr-group-count">
            {itemsCount} {itemsCount === 1 ? "pick" : "picks"}
          </span>
          <MaestroIcon
            name="chevronDown"
            size={15}
            className={`pl-scr-chev ${isCollapsed ? "is-collapsed" : ""}`.trim()}
          />
        </button>

        <a
          href={href}
          className="pl-scr-group-ficha"
          onPointerEnter={handlePrefetch}
          onTouchStart={handlePrefetch}
          onClick={handleNavigate}
        >
          <span>Ficha</span>
          <MaestroIcon name="arrowRight" size={12} />
        </a>
      </div>
    </header>
  );
});

export const ScreenerMarketGroupHeader = memo(function ScreenerMarketGroupHeader({
  groupKey,
  label,
  family,
  itemsCount,
  isCollapsed,
  onToggleCollapse,
}: {
  readonly groupKey: string;
  readonly label: string;
  readonly family: string;
  readonly itemsCount: number;
  readonly isCollapsed: boolean;
  readonly onToggleCollapse: (key: string) => void;
}): React.JSX.Element {
  const handleToggle = useCallback(() => {
    onToggleCollapse(`k:${groupKey}`);
  }, [groupKey, onToggleCollapse]);

  return (
    <header className="pl-scr-group-head">
      <button
        type="button"
        className="pl-scr-group-toggle"
        aria-expanded={!isCollapsed}
        onClick={handleToggle}
      >
        <MarketCategoryIcon family={family} size={18} />
        <strong className="pl-scr-group-title">{label}</strong>
        <span className="pl-scr-group-count num">
          {itemsCount} {itemsCount === 1 ? "pick" : "picks"}
        </span>
        <MaestroIcon
          name="chevronDown"
          size={15}
          className={`pl-scr-chev ${isCollapsed ? "is-collapsed" : ""}`.trim()}
        />
      </button>
    </header>
  );
});

export const ScreenerPotdSection = memo(function ScreenerPotdSection({
  featuredPotd,
  secondaryPotds,
  totalCount,
  potdExpanded,
  oddsFormat,
  onToggleExpanded,
  onOpenLab,
}: {
  readonly featuredPotd: ScreenerItem;
  readonly secondaryPotds: readonly ScreenerItem[];
  readonly totalCount: number;
  readonly potdExpanded: boolean;
  readonly oddsFormat: OddsFormat;
  readonly onToggleExpanded: () => void;
  readonly onOpenLab: (item: ScreenerItem) => void;
}): React.JSX.Element {
  const handleOpenFeatured = useCallback(() => {
    onOpenLab(featuredPotd);
  }, [featuredPotd, onOpenLab]);

  return (
    <section
      className="pl-scr-potd"
      aria-label="Pick del día seleccionado por Spacetime"
      data-picks-potd=""
    >
      <div className="pl-scr-potd-row">
        <div className="pl-scr-potd-left">
          <div className="pl-scr-potd-eyebrow num">
            <MaestroIcon name="target-picks" size={14} className="pl-scr-potd-icon" />
            <span>PICK DEL DÍA</span>
            <span className="pl-scr-meta-sep" aria-hidden="true">
              ·
            </span>
            <span>{featuredPotd.game.leagueLabel}</span>
            <span className="pl-scr-meta-sep" aria-hidden="true">
              ·
            </span>
            <span>{featuredPotd.game.kickoffLocal}</span>
            {featuredPotd.projectedScoreLabel ? (
              <>
                <span className="pl-scr-meta-sep" aria-hidden="true">
                  ·
                </span>
                <span className="pl-scr-potd-proj">{featuredPotd.projectedScoreLabel}</span>
              </>
            ) : null}
          </div>

          <div className="pl-scr-potd-headline">
            <TeamBadge
              league={featuredPotd.game.league}
              slug={featuredPotd.game.home.slug}
              name={featuredPotd.game.home.name}
              logoUrl={featuredPotd.game.home.logoUrl}
              size={20}
            />
            <span className="pl-scr-potd-match">
              {featuredPotd.game.home.shortName} vs {featuredPotd.game.away.shortName}
            </span>
            <span className="pl-scr-meta-sep" aria-hidden="true">
              —
            </span>
            <MarketCategoryIcon
              family={featuredPotd.catalogFamilyId}
              size={18}
              className="pl-scr-potd-mkt-icon"
            />
            <strong className="pl-scr-potd-pick">{featuredPotd.pick.label}</strong>
          </div>

          <p className="pl-scr-potd-reason">
            {formatValueThresholdForOdds(featuredPotd, oddsFormat)}
            {featuredPotd.evidenceWindows.length > 0 ? (
              <span className="pl-scr-potd-ev num">
                {" · "}
                {featuredPotd.evidenceWindows
                  .slice(0, 2)
                  .map((w) => `${w.label} ${w.value}`)
                  .join(" · ")}
              </span>
            ) : null}
          </p>
        </div>

        <div className="pl-scr-potd-metrics num">
          <div className="pl-scr-potd-prob-wrap">
            <strong className="pl-scr-potd-prob">
              {(featuredPotd.pick.p * 100).toFixed(1)} %
            </strong>
            <span className="pl-scr-potd-prob-lbl">
              Prob. Spacetime ·{" "}
              {featuredPotd.houseDecimal !== null
                ? `${featuredPotd.houseLabel ?? "Casa"} ${formatOddsValue(featuredPotd.houseDecimal, oddsFormat)}`
                : `Justo ${formatOddsValue(featuredPotd.pick.fairDecimal, oddsFormat)}`}
            </span>
          </div>

          <div className="pl-scr-potd-actions">
            <button
              type="button"
              className="pl-scr-potd-cta"
              data-picks-potd-analyze=""
              onPointerEnter={prefetchPickEvidenceLabDrawer}
              onFocus={prefetchPickEvidenceLabDrawer}
              onClick={handleOpenFeatured}
            >
              <span>Analizar</span>
              <MaestroIcon name="arrowRight" size={12} />
            </button>
            <ParlayRowButton pick={featuredPotd.pick} />
            {secondaryPotds.length > 0 ? (
              <button
                type="button"
                className="pl-scr-potd-toggle"
                aria-expanded={potdExpanded}
                data-picks-potd-toggle=""
                onClick={onToggleExpanded}
              >
                <span>{potdExpanded ? "Solo Top 1" : `Top ${totalCount}`}</span>
                <MaestroIcon
                  name="chevronDown"
                  size={12}
                  className={`pl-scr-chev ${potdExpanded ? "is-open" : ""}`.trim()}
                />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {potdExpanded && secondaryPotds.length > 0 ? (
        <div className="pl-scr-potd-more">
          {secondaryPotds.map((candidate, idx) => (
            <div key={candidate.pick.id} className="pl-scr-potd-subcard">
              <div className="pl-scr-potd-subhead">
                <span className="pl-scr-potd-rank num">#{idx + 2}</span>
                <MarketCategoryIcon
                  family={candidate.catalogFamilyId}
                  size={16}
                  className="pl-scr-potd-mkt-icon"
                />
                <strong className="pl-scr-potd-subpick">{candidate.pick.label}</strong>
                <span className="pl-scr-potd-subprob num">
                  {(candidate.pick.p * 100).toFixed(1)} %
                </span>
              </div>
              <span className="pl-scr-potd-submatch num">
                {candidate.game.home.shortName} vs {candidate.game.away.shortName} ·{" "}
                {candidate.game.leagueLabel}
                {candidate.projectedScoreLabel ? ` · ${candidate.projectedScoreLabel}` : ""}
              </span>
              <div className="pl-scr-potd-subfoot">
                <span className="pl-scr-potd-subreason">
                  {formatValueThresholdForOdds(candidate, oddsFormat, true)}
                </span>
                <button
                  type="button"
                  className="pl-scr-row-action is-compact"
                  onPointerEnter={prefetchPickEvidenceLabDrawer}
                  onFocus={prefetchPickEvidenceLabDrawer}
                  onClick={() => onOpenLab(candidate)}
                >
                  Analizar
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
});

export function MobileFiltersSheet({
  resultCount,
  onReset,
  onClose,
  children,
}: {
  readonly resultCount: number;
  readonly onReset: () => void;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const swipe = useSheetSwipeDismiss({
    onDismiss: () => onCloseRef.current(),
    scrollContainerRef: scrollRef,
  });

  useSafeEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    dialog.setAttribute("closedby", "any");

    const closeDialogSafely = () => {
      if (typeof dialog.close === "function" && dialog.open) {
        try {
          dialog.returnValue = "";
          dialog.close();
          return;
        } catch (err) {
          void err;
        }
      }
      if (dialog.hasAttribute("open")) {
        dialog.removeAttribute("open");
      }
    };

    if (!dialog.open) {
      if (typeof dialog.showModal === "function") {
        try {
          dialog.showModal();
        } catch (err) {
          void err;
          dialog.setAttribute("open", "");
        }
      } else if (typeof dialog.show === "function") {
        try {
          dialog.show();
        } catch (err) {
          void err;
          dialog.setAttribute("open", "");
        }
      } else {
        dialog.setAttribute("open", "");
      }
    }

    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };

    const handleClose = () => {
      if (dialog.open) return;
      dialog.returnValue = "";
      onCloseRef.current();
    };
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);

    const handleEscape = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.key !== "Escape") return;
      if (!dialog.open && !dialog.hasAttribute("open")) return;
      e.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener("keydown", handleEscape);

    let cleanupLightDismiss: (() => void) | undefined;
    if (
      typeof HTMLDialogElement !== "undefined" &&
      !("closedBy" in HTMLDialogElement.prototype)
    ) {
      const isOutside = (e: PointerEvent) => {
        if (e.target !== dialog) return false;
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        );
      };
      let pressedOutside = false;
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) {
          if (typeof dialog.close === "function" && dialog.open) {
            try {
              dialog.close();
              return;
            } catch (err) {
              void err;
            }
          }
          dialog.removeAttribute("open");
          onCloseRef.current();
        }
      };
      dialog.addEventListener("pointerdown", onPointerDown);
      dialog.addEventListener("pointerup", onPointerUp);
      cleanupLightDismiss = () => {
        dialog.removeEventListener("pointerdown", onPointerDown);
        dialog.removeEventListener("pointerup", onPointerUp);
      };
    }

    return () => {
      window.removeEventListener("keydown", handleEscape);
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
      cleanupLightDismiss?.();
      closeDialogSafely();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="pl-scr-filter-sheet"
      data-mobile-filters-sheet=""
      style={swipe.sheetStyle}
    >
      <div className="pl-scr-sheet-shell">
        <div className="pl-scr-sheet-drag" {...swipe.handleProps}>
          <span className="pl-bottom-sheet-handle" aria-hidden="true" />
          <div className="pl-scr-sheet-head">
            <h2 id={titleId} className="m-0 text-base font-extrabold">
              Filtros del buscador
            </h2>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Cerrar filtros"
              autoFocus
              onClick={onClose}
            >
              <MaestroIcon name="x" size={16} />
            </Button>
          </div>
        </div>

        <div ref={scrollRef} className="pl-scr-sheet-scroll">
          {children}
        </div>

        <footer className="pl-scr-sheet-footer">
          <Button type="button" variant="secondary" size="default" onClick={onReset}>
            Restablecer
          </Button>
          <Button
            type="button"
            variant="primary"
            size="default"
            className="flex-1 num"
            onClick={onClose}
          >
            Ver {resultCount} {resultCount === 1 ? "pick" : "picks"}
          </Button>
        </footer>
      </div>
    </dialog>
  );
}
