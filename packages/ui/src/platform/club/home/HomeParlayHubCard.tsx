"use client";

import React, { useMemo, useRef, useState } from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { LeagueBadge } from "../../../sports";
import { formatOddsValue } from "../../access-guard";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { ConfirmActionDialog } from "../../components/PlatformOverlays";
import { useSafeEffect } from "../../hooks";
import {
  assessParlayRisk,
  buildSmartAutoParlay,
  computeParlaySummary,
} from "../../parlay-engine";
import {
  useParlayState,
  usePlatformActions,
  usePlatformCore,
} from "../../platform-provider";
import type { PlatformGame, RiskBand } from "../../types";
import { shortDateLabel } from "./home-model";
import {
  RISKS,
  countLabel,
  formatGameKickoffTime,
  leagueLogoOf,
  riskToneColor,
} from "./home-view-helpers";
import { OfficialDailyParlayCard } from "./OfficialDailyParlayCard";

const AUTO_PARLAY_QUICK_COUNTS = [2, 3, 4, 5, 6, 8, 10] as const;

export interface HomeParlayHubCardProps {
  readonly visibleGames: readonly PlatformGame[];
  readonly allGames: readonly PlatformGame[];
  readonly selectedDay: string;
  readonly today: string;
  readonly isPastDay: boolean;
  readonly activeLeague: LeagueId | null;
}

/**
 * Centro unificado de Parlay en el riel derecho de Inicio:
 * alterna «Tu parlay» (boleto personal + termómetro de riesgo + armado automático)
 * y «Parlay del día» (selección oficial curada), sin duplicar tarjetas.
 */
export function HomeParlayHubCard({
  visibleGames,
  allGames,
  selectedDay,
  today,
  isPastDay,
  activeLeague,
}: HomeParlayHubCardProps): React.JSX.Element {
  const { oddsFormat, riskPreference, viewerRole, userTimezone } = usePlatformCore();
  const {
    removePickFromParlay,
    clearParlay,
    generateAutoParlay,
    navigateTo,
    prefetchRoute,
  } = usePlatformActions();
  const { parlaySummary } = useParlayState();
  const [activeTab, setActiveTab] = useState<"custom" | "daily">("custom");
  const [risk, setRisk] = useState<RiskBand>(riskPreference);
  const [autoCount, setAutoCount] = useState<number>(3);
  const [confirmClearOpen, setConfirmClearOpen] = useState<boolean>(false);
  const legs = parlaySummary.legs;
  const prevLegCountRef = useRef<number>(legs.length);
  const customPanelRef = useRef<HTMLDivElement | null>(null);
  const dailyPanelRef = useRef<HTMLDivElement | null>(null);
  const riskHint = RISKS.find((r) => r.id === risk)?.hint ?? "";

  useSafeEffect(() => {
    if (legs.length > prevLegCountRef.current) {
      setActiveTab("custom");
    }
    prevLegCountRef.current = legs.length;
  }, [legs.length]);

  useSafeEffect(() => {
    const customEl = customPanelRef.current;
    const dailyEl = dailyPanelRef.current;
    const onCustomMatch = () => setActiveTab("custom");
    const onDailyMatch = () => setActiveTab("daily");
    customEl?.addEventListener("beforematch", onCustomMatch);
    dailyEl?.addEventListener("beforematch", onDailyMatch);
    return () => {
      customEl?.removeEventListener("beforematch", onCustomMatch);
      dailyEl?.removeEventListener("beforematch", onDailyMatch);
    };
  }, []);

  useSafeEffect(() => {
    const customEl = customPanelRef.current;
    const dailyEl = dailyPanelRef.current;
    if (customEl) {
      if (activeTab !== "custom") customEl.setAttribute("hidden", "until-found");
      else customEl.removeAttribute("hidden");
    }
    if (dailyEl) {
      if (activeTab !== "daily") dailyEl.setAttribute("hidden", "until-found");
      else dailyEl.removeAttribute("hidden");
    }
  }, [activeTab]);

  const openGamesCount = useMemo(
    () => visibleGames.filter((g) => g.status !== "FT" && g.status !== "LIVE").length,
    [visibleGames],
  );
  const maxAutoLegs = Math.max(2, openGamesCount);
  const effectiveAutoCount = Math.min(maxAutoLegs, Math.max(2, autoCount));

  const activeRiskInfo = useMemo(() => assessParlayRisk(parlaySummary), [parlaySummary]);

  const previewAutoRisk = useMemo(() => {
    const previewLegs = buildSmartAutoParlay(visibleGames, {
      leagues: [],
      risk,
      legCount: effectiveAutoCount,
      allowSgp: false,
      viewerRole,
    });
    return assessParlayRisk(computeParlaySummary(previewLegs, 1));
  }, [visibleGames, risk, effectiveAutoCount, viewerRole]);

  const autoBuilderControls = (
    <div className="pl-parlay-auto-box">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold" style={{ color: "var(--pl-text-muted)" }}>
          Armar en automático
        </span>
        {previewAutoRisk.weakestLeg ? (
          <span
            className="text-[11px] font-bold num"
            style={{ color: riskToneColor(previewAutoRisk.tone) }}
            data-auto-parlay-risk={previewAutoRisk.level}
          >
            {previewAutoRisk.shortLabel} (~1/{previewAutoRisk.oneIn})
          </span>
        ) : null}
      </div>
      <div className="seg-well" role="group" aria-label="Perfil del parlay automático">
        {RISKS.map((r) => (
          <button
            key={r.id}
            type="button"
            className="seg-btn flex-1 min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9"
            aria-pressed={risk === r.id}
            onClick={() => setRisk(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Atajos de selecciones">
          {AUTO_PARLAY_QUICK_COUNTS.filter((c) => c <= maxAutoLegs || c <= 4).map((cnt) => (
            <button
              key={cnt}
              type="button"
              disabled={cnt > maxAutoLegs}
              aria-pressed={effectiveAutoCount === cnt}
              onClick={() => setAutoCount(cnt)}
              className="seg-btn num text-xs px-2 min-h-11 min-w-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 [@media(min-width:768px)_and_(pointer:fine)]:min-w-8 justify-center"
              style={{
                background:
                  effectiveAutoCount === cnt ? "var(--pl-surface-active)" : "var(--pl-surface)",
                border: "1px solid var(--pl-border)",
              }}
            >
              {cnt}
            </button>
          ))}
        </div>
        <div className="sl-stepper" role="group" aria-label="Cantidad de selecciones del parlay">
          <button
            type="button"
            className="min-h-11 min-w-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 [@media(min-width:768px)_and_(pointer:fine)]:min-w-9"
            aria-label="Menos selecciones"
            disabled={effectiveAutoCount <= 2}
            onClick={() => setAutoCount(Math.max(2, effectiveAutoCount - 1))}
          >
            −
          </button>
          <span className="num text-xs font-bold px-1.5">{effectiveAutoCount}</span>
          <button
            type="button"
            className="min-h-11 min-w-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 [@media(min-width:768px)_and_(pointer:fine)]:min-w-9"
            aria-label="Más selecciones"
            disabled={effectiveAutoCount >= maxAutoLegs}
            onClick={() => setAutoCount(Math.min(maxAutoLegs, effectiveAutoCount + 1))}
          >
            +
          </button>
        </div>
      </div>
      <span className="text-[11px] leading-snug" style={{ color: "var(--pl-text-muted)" }}>
        {riskHint}
      </span>
      <button
        type="button"
        className="pl-btn-primary text-sm min-h-11 px-4 w-full inline-flex items-center justify-center gap-1.5"
        onClick={() =>
          generateAutoParlay({
            leagues: [],
            risk,
            legCount: effectiveAutoCount,
            allowSgp: false,
            games: visibleGames,
          })
        }
      >
        <MaestroIcon name="layers" size={14} />
        <span>Armar {effectiveAutoCount} selecciones</span>
      </button>
    </div>
  );

  return (
    <section
      aria-label="Centro de parlays"
      className="pl-home-rail-card is-parlay glass-card glass-ring"
      data-parlay-hub=""
    >
      <div
        role="tablist"
        aria-label="Opciones de parlay"
        className="pl-parlay-hub-tabs"
        {...({ focusgroup: "tablist nomemory" } as React.HTMLAttributes<HTMLDivElement>)}
      >
        <button
          type="button"
          role="tab"
          id="parlay-hub-tab-custom"
          aria-selected={activeTab === "custom"}
          className="pl-parlay-hub-tab min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9"
          onClick={() => setActiveTab("custom")}
          {...(activeTab === "custom"
            ? ({ focusgroupstart: "" } as React.ButtonHTMLAttributes<HTMLButtonElement>)
            : {})}
        >
          <span>Tu parlay</span>
          <span className="pl-parlay-hub-badge num">{legs.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="parlay-hub-tab-daily"
          aria-selected={activeTab === "daily"}
          className="pl-parlay-hub-tab min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9"
          onClick={() => setActiveTab("daily")}
          {...(activeTab === "daily"
            ? ({ focusgroupstart: "" } as React.ButtonHTMLAttributes<HTMLButtonElement>)
            : {})}
        >
          <MaestroIcon name="sparkles" size={12} />
          <span>Parlay del día</span>
        </button>
      </div>

      <div
        ref={customPanelRef}
        role="tabpanel"
        aria-labelledby="parlay-hub-tab-custom"
        className="pl-parlay-hub-panel"
        hidden={activeTab !== "custom"}
      >
        <div className="pl-parlay-hub-panel-body">
          <div className="flex items-center justify-between gap-2">
            <h2 id="home-parlay-title" className="m-0 text-base font-extrabold">
              Tu boleto de parlay
            </h2>
            <span className="pl-pill pl-pill--brand num">
              {countLabel(legs.length, "selección", "selecciones")}
            </span>
          </div>

          {legs.length === 0 ? (
            <>
              <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
                Toca <strong style={{ color: "var(--pl-text)" }}>+ Parlay</strong> en cualquier partido o genera una combinada calibrada:
              </p>
              {autoBuilderControls}
              <button
                type="button"
                className="pl-parlay-switch-cta"
                onClick={() => setActiveTab("daily")}
              >
                <MaestroIcon name="sparkles" size={13} />
                <span>Ver el Parlay oficial del día curado por el modelo</span>
                <MaestroIcon name="arrowRight" size={12} />
              </button>
            </>
          ) : (
            <>
              <ul className="m-0 p-0 list-none flex flex-col gap-2">
                {legs.map(({ pick }) => {
                  const gm = allGames.find((g) => g.id === pick.gameId);
                  return (
                    <li key={pick.id} className="pl-home-leg">
                      <LeagueBadge
                        league={pick.league}
                        label={pick.leagueLabel}
                        logoUrl={leagueLogoOf(allGames, pick.league)}
                        size={20}
                      />
                      <span className="min-w-0 flex-1 flex flex-col">
                        <strong className="text-sm truncate">{pick.label}</strong>
                        <span className="text-xs truncate num" style={{ color: "var(--pl-text-muted)" }}>
                          {pick.matchLabel} ·{" "}
                          {gm
                            ? `${shortDateLabel(gm.dayId)} · ${formatGameKickoffTime(gm, userTimezone)}`
                            : pick.kickoffLocal}
                        </span>
                      </span>
                      <span className="num text-[13px] font-bold" style={{ color: "var(--pl-success)" }}>
                        {(pick.p * 100).toFixed(1)} %
                      </span>
                      <button
                        type="button"
                        className="pl-home-icon-btn"
                        aria-label={`Quitar ${pick.label}`}
                        onClick={() => removePickFromParlay(pick.id)}
                      >
                        <MaestroIcon name="x" size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div
                className="rounded-xl p-3 flex flex-col gap-2"
                style={{
                  background: "var(--pl-surface-elevated)",
                  border: `1px solid color-mix(in srgb, ${riskToneColor(activeRiskInfo.tone)} 36%, var(--pl-border))`,
                }}
                data-parlay-risk-meter={activeRiskInfo.level}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold" style={{ color: "var(--pl-text-muted)" }}>
                    Nivel de riesgo
                  </span>
                  <span
                    className="text-xs font-extrabold num"
                    style={{ color: riskToneColor(activeRiskInfo.tone) }}
                  >
                    {activeRiskInfo.label}
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: "var(--pl-surface-hover)" }}
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${activeRiskInfo.meterPct}%`,
                      background: riskToneColor(activeRiskInfo.tone),
                    }}
                  />
                </div>
                <span className="text-xs font-semibold num" style={{ color: "var(--pl-text)" }}>
                  {activeRiskInfo.headline}
                </span>
                <span className="text-[11px] leading-snug" style={{ color: "var(--pl-text-muted)" }}>
                  {activeRiskInfo.guidance}
                </span>
                {activeRiskInfo.warnings[0] ? (
                  <span
                    className="text-[11px] font-semibold leading-snug"
                    style={{ color: riskToneColor(activeRiskInfo.tone) }}
                  >
                    {activeRiskInfo.warnings[0]}
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="pl-home-stat">
                  <span>Probabilidad combinada</span>
                  <strong className="num">
                    {parlaySummary.combinedProbability * 100 < 0.1
                      ? "< 0.1 %"
                      : `${(parlaySummary.combinedProbability * 100).toFixed(1)} %`}
                  </strong>
                </div>
                <div className="pl-home-stat">
                  <span>Momio justo</span>
                  <strong className="num">
                    {formatOddsValue(parlaySummary.fairDecimal, oddsFormat)}
                  </strong>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <a
                  href="/app/parlays"
                  onPointerEnter={() => prefetchRoute("/app/parlays")}
                  onTouchStart={() => prefetchRoute("/app/parlays")}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo("/app/parlays");
                  }}
                  className="pl-btn-primary text-sm min-h-11 px-4 flex-1 inline-flex items-center justify-center gap-1.5 no-underline"
                >
                  <span>Abrir en el armador</span>
                  <MaestroIcon name="arrowRight" size={13} />
                </a>
                <button
                  type="button"
                  className="pl-btn-glass text-sm min-h-11 px-3.5"
                  onClick={() => {
                    if (legs.length >= 2) {
                      setConfirmClearOpen(true);
                    } else {
                      clearParlay();
                    }
                  }}
                >
                  Vaciar
                </button>
              </div>

              <ConfirmActionDialog
                open={confirmClearOpen}
                title={`¿Vaciar parlay de ${legs.length} selecciones?`}
                description="Se quitarán todas las selecciones del boleto actual. Podrás deshacerlo durante unos segundos desde el aviso inferior."
                confirmLabel="Vaciar boleto"
                onConfirm={clearParlay}
                onCancel={() => setConfirmClearOpen(false)}
              />

              <details className="pl-parlay-auto-details">
                <summary className="pl-parlay-auto-summary">
                  <MaestroIcon name="layers" size={13} />
                  <span>Reemplazar con parlay automático</span>
                </summary>
                <div className="pt-2.5">{autoBuilderControls}</div>
              </details>
            </>
          )}
        </div>
      </div>

      <div
        ref={dailyPanelRef}
        role="tabpanel"
        aria-labelledby="parlay-hub-tab-daily"
        className="pl-parlay-hub-panel"
        hidden={activeTab !== "daily"}
      >
        <div className="pl-parlay-hub-panel-body">
          <OfficialDailyParlayCard
            games={allGames}
            selectedDay={selectedDay}
            today={today}
            isPastDay={isPastDay}
            activeLeague={activeLeague}
            embedded
            onLoadedToParlay={() => setActiveTab("custom")}
          />
        </div>
      </div>
    </section>
  );
}
