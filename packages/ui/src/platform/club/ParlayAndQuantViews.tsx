"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import { OddsCompareClubView } from "./OddsCompareView";
import { ALL, SPORTS, shortDateLabel, sportOf, type SportFilter } from "./home/home-model";
import type { LeagueId } from "@pitchlab/contracts";
import { Switch } from "@heroui/react";
import { LeagueBadge, parseUserOdds } from "../../sports";
import {
  formatOddsValue,
  isPickUnlocked,
  pickReferenceDecimal,
} from "../access-guard";
import {
  buildPersonalQuickParlay,
  DAILY_PARLAY_STYLE_SPECS,
  PARLAY_TARGET_PRESETS,
  type ParlayTargetPresetId,
  type PersonalParlayScope,
} from "../daily-parlay";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { ConfirmActionDialog } from "../components/PlatformOverlays";
import { SgpCopulaAuditCard } from "../components/SgpCopulaAuditCard";
import {
  AtmosphereStage,
  ClubWorkspaceShell,
} from "../components/ShellChrome";
import {
  assessParlayRisk,
  checkParlayCompatibility,
  PARLAY_NON_COMBINABLE_RULES,
  type ParlayCompatibilityResult,
} from "../parlay-engine";
import {
  useParlayState,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import type { RiskBand, SgpCopulaAuditView } from "../types";

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
  if (compat.code === "live") {
    return "Partido en vivo (cerrado)";
  }
  if (compat.code === "finished") {
    return "Partido finalizado";
  }
  if (compat.code === "invalid_odds") {
    return "Línea cerrada para parlay";
  }
  if ((compat.code === "same_game_disabled" || sameGameExists) && !allowSgp) {
    return "Mismo partido: activa el interruptor";
  }
  if (compat.code === "sgp_limit") {
    return "Máx. 2 selecciones por partido";
  }
  if (compat.code === "exact_score_sgp") {
    return "Marcador exacto: no combinable en SGP";
  }
  if (compat.code === "logical_contradiction") {
    return "Contradicción lógica en el partido";
  }
  if (compat.code === "same_axis") {
    return "Mismo eje de mercado (opuesto o redundante)";
  }
  const rawReason = compat.reason;
  if (!rawReason) {
    return "Mercado contradictorio";
  }
  const lower = rawReason.toLowerCase();
  if (lower.includes("mismo partido") && !allowSgp) {
    return "Mismo partido: activa el interruptor";
  }
  if (lower.includes("contradic") || lower.includes("opuest") || lower.includes("choca")) {
    return "Mercado contradictorio";
  }
  if (lower.includes("máximo 2") || lower.includes("2 selecciones")) {
    return "Máx. 2 selecciones por partido";
  }
  return rawReason;
}

export function ParlayBuilderClubView(): React.JSX.Element {
  const { dataset, viewerRole, hasAccountSession, upgradeHref, oddsFormat, riskPreference } =
    usePlatformCore();
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

  useEffect(() => {
    void requestFullShell();
  }, [requestFullShell]);

  const leagueSelectId = useId();
  const [builderMode, setBuilderMode] = useState<"auto" | "manual">("auto");
  const [sportFilter, setSportFilter] = useState<SportFilter>(ALL);
  const [leagueFilter, setLeagueFilter] = useState<LeagueId | typeof ALL>(ALL);
  const [manualQuery, setManualQuery] = useState<string>("");
  const [autoRisk, setAutoRisk] = useState<RiskBand>(riskPreference);
  const [targetPreset, setTargetPreset] = useState<ParlayTargetPresetId>("libre");
  const [autoLegCount, setAutoLegCount] = useState<number>(3);
  const [catalogLimit, setCatalogLimit] = useState<number>(12);
  const [bookParlayOddsRaw, setBookParlayOddsRaw] = useState<string>("");
  const [resolvedSgpAudit, setResolvedSgpAudit] = useState<SgpCopulaAuditView | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState<boolean>(false);

  const parsedBookParlayDec = useMemo(
    () => (bookParlayOddsRaw.trim() ? parseUserOdds(bookParlayOddsRaw) : null),
    [bookParlayOddsRaw],
  );

  // Solo partidos abiertos (excluye FT y LIVE)
  const openGamesAll = useMemo(
    () => dataset.games.filter((g) => g.status !== "FT" && g.status !== "LIVE"),
    [dataset.games],
  );

  const sportCounts = useMemo(() => {
    const counts: Record<string, number> = { [ALL]: openGamesAll.length };
    for (const g of openGamesAll) {
      const sp = sportOf(g);
      counts[sp] = (counts[sp] ?? 0) + 1;
    }
    return counts;
  }, [openGamesAll]);

  // Solo ligas con partidos abiertos para el deporte seleccionado (evita muro de 57 ligas)
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
        const hay = `${g.home.name} ${g.away.name} ${g.home.shortName} ${g.away.shortName} ${g.leagueLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [effectiveLeague, manualQuery, openGamesAll, sportFilter]);

  const candidateGames = useMemo(
    () => allOpenGames.slice(0, catalogLimit),
    [allOpenGames, catalogLimit],
  );

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

  const handleGenerateAuto = () => {
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
    generateAutoParlay({
      leagues: scopedLeagueIds.length > 0 ? scopedLeagueIds : dataset.leagues.map((l) => l.league),
      risk: autoRisk,
      legCount: effectiveAutoLegCount,
      allowSgp,
      games: allOpenGames,
    });
  };

  // Cuando la Cópula Student-t v5.1 (/api/parlays/sgp) responde, alinea el resumen del boleto
  // para que Prob. Conjunta Real, Momio justo y Nivel de riesgo coincidan exactamente.
  const activeSgpAudit = parlaySummary.hasSgpCorrelation ? resolvedSgpAudit : null;
  const effectiveSlipProb = useMemo(() => {
    if (!activeSgpAudit || parlaySummary.legs.length === 0) {
      return parlaySummary.combinedProbability;
    }
    if (parlaySummary.legs.length === activeSgpAudit.nLegs) {
      return activeSgpAudit.jointProbability;
    }
    const localMult = parlaySummary.sgpCorrelationMultiplier ?? 1;
    const adjusted =
      (parlaySummary.combinedProbability / Math.max(localMult, 0.05)) *
      activeSgpAudit.correlationMultiplier;
    return Math.min(0.92, Math.max(0.0001, adjusted));
  }, [activeSgpAudit, parlaySummary]);

  const effectiveSlipFairDec = useMemo(() => {
    if (
      activeSgpAudit &&
      parlaySummary.legs.length === activeSgpAudit.nLegs &&
      activeSgpAudit.fairCombinedDecimal > 1
    ) {
      return activeSgpAudit.fairCombinedDecimal;
    }
    return parlaySummary.legs.length > 0
      ? Math.max(1.05, Math.round((1 / Math.max(effectiveSlipProb, 0.0001)) * 100) / 100)
      : parlaySummary.fairDecimal;
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

  return (
    <AtmosphereStage activePath="/app/parlays">
      <ClubWorkspaceShell activePath="/app/parlays">
        <section className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
              Armar parlay
            </h1>
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
              Genera una combinada calibrada al instante o elige piernas manualmente con bloqueo en vivo de mercados contradictorios.
            </p>
          </div>

          <div
            className="seg-well"
            role="tablist"
            aria-label="Modo del armador de parlays"
            data-parlay-mode-tabs=""
            {...({ focusgroup: "tablist nomemory" } as React.HTMLAttributes<HTMLDivElement>)}
          >
            <button
              type="button"
              role="tab"
              aria-selected={builderMode === "auto"}
              className="seg-btn text-xs min-h-11 sm:min-h-10 px-4 inline-flex items-center gap-1.5"
              data-parlay-tab="auto"
              onClick={() => setBuilderMode("auto")}
              {...(builderMode === "auto"
                ? ({ focusgroupstart: "" } as React.ButtonHTMLAttributes<HTMLButtonElement>)
                : {})}
            >
              <MaestroIcon name="bolt" size={13} />
              <span>Automático</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={builderMode === "manual"}
              className="seg-btn text-xs min-h-11 sm:min-h-10 px-4 inline-flex items-center gap-1.5"
              data-parlay-tab="manual"
              onClick={() => setBuilderMode("manual")}
              {...(builderMode === "manual"
                ? ({ focusgroupstart: "" } as React.ButtonHTMLAttributes<HTMLButtonElement>)
                : {})}
            >
              <MaestroIcon name="layers" size={13} />
              <span>Armar a mano</span>
            </button>
          </div>
        </section>

        <div className="pl-parlay-grid grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
          {/* Columna izquierda: Un solo flujo limpio (Automático o Armar a mano) */}
          <div className="lg:col-span-7 space-y-4 min-w-0">
            {/* Filtro compacto Deporte + Liga activa (cero muro de 57 ligas) */}
            <section
              className="glass-card glass-ring rounded-2xl p-4 space-y-3"
              aria-label="Filtrar deporte y liga"
              data-parlay-scope-bar=""
            >
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0" role="group" aria-label="Elegir deporte">
                  <button
                    type="button"
                    className="seg-btn text-xs min-h-11 sm:min-h-9 px-3 num"
                    aria-pressed={sportFilter === ALL}
                    onClick={() => {
                      setSportFilter(ALL);
                      setLeagueFilter(ALL);
                      setCatalogLimit(12);
                    }}
                  >
                    Todos ({sportCounts[ALL] ?? 0})
                  </button>
                  {SPORTS.filter((sp) => (sportCounts[sp.id] ?? 0) > 0).map((sp) => (
                    <button
                      key={sp.id}
                      type="button"
                      className="seg-btn text-xs min-h-11 sm:min-h-9 px-3 num"
                      aria-pressed={sportFilter === sp.id}
                      onClick={() => {
                        setSportFilter(sp.id);
                        setLeagueFilter(ALL);
                        setCatalogLimit(12);
                      }}
                    >
                      {sp.label} ({sportCounts[sp.id] ?? 0})
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
                  <label htmlFor={leagueSelectId} className="sr-only">
                    Liga activa
                  </label>
                  <select
                    id={leagueSelectId}
                    value={effectiveLeague}
                    onChange={(e) => {
                      setLeagueFilter(e.target.value as LeagueId | typeof ALL);
                      setCatalogLimit(12);
                    }}
                    className="glass-input text-base sm:text-xs font-semibold min-h-11 sm:min-h-10 px-3 rounded-xl w-full sm:w-auto sm:max-w-[240px]"
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
              </div>
            </section>

            {builderMode === "auto" ? (
              <section
                className="glass-card glass-ring rounded-2xl p-4 sm:p-6 space-y-5"
                role="tabpanel"
                aria-label="Generador automático de parlay"
                data-parlay-auto-panel=""
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="m-0 text-lg font-extrabold">
                      Generador automático
                    </h2>
                    <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                      Elige cuota meta, nivel de riesgo y número de selecciones sin contradicciones.
                    </p>
                  </div>
                  {autoPreview.status !== "insufficient" && autoPreview.legs.length > 0 ? (
                    <span className="pl-pill pl-pill--info num text-xs">
                      Vista previa: {autoPreview.legs.length} picks ·{" "}
                      {autoPreview.combinedProbability * 100 < 0.1
                        ? "< 0.1 %"
                        : `${(autoPreview.combinedProbability * 100).toFixed(1)} %`}{" "}
                      · {formatOddsValue(autoPreview.fairDecimal, oddsFormat)}
                    </span>
                  ) : null}
                </div>

                {/* Cuota meta */}
                <div className="space-y-2">
                  <span className="text-xs font-extrabold block" style={{ color: "var(--pl-text-secondary)" }}>
                    Cuota meta
                  </span>
                  <div className="seg-well w-full flex-wrap" role="group" aria-label="Cuota meta">
                    {PARLAY_TARGET_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="seg-btn flex-1 justify-center num text-xs min-h-11 sm:min-h-10"
                        aria-pressed={targetPreset === preset.id}
                        data-quick-target={preset.id}
                        onClick={() => setTargetPreset(preset.id)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Riesgo + Selecciones */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <span className="text-xs font-extrabold block" style={{ color: "var(--pl-text-secondary)" }}>
                      Estilo de riesgo
                    </span>
                    <div className="seg-well w-full" role="group" aria-label="Estilo de riesgo">
                      {(["conservador", "medio", "arriesgado"] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          className="seg-btn flex-1 justify-center text-xs min-h-11 sm:min-h-10"
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

                  <div className="space-y-2">
                    <span className="text-xs font-extrabold block num" style={{ color: "var(--pl-text-secondary)" }}>
                      Selecciones ({effectiveAutoLegCount} de {maxAutoLegs} disp.)
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="seg-well flex-wrap" role="group" aria-label="Número de selecciones">
                        {[2, 3, 4, 5, 6, 8, 10].map((cnt) => (
                          <button
                            key={cnt}
                            type="button"
                            disabled={cnt > maxAutoLegs}
                            className="seg-btn num text-xs justify-center px-2 min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
                            aria-pressed={effectiveAutoLegCount === cnt}
                            onClick={() => setAutoLegCount(cnt)}
                          >
                            {cnt}
                          </button>
                        ))}
                      </div>
                      <div className="sl-stepper" role="group" aria-label="Ajustar número de selecciones">
                        <button
                          type="button"
                          className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
                          aria-label="Menos selecciones"
                          disabled={effectiveAutoLegCount <= 2}
                          onClick={() => setAutoLegCount(Math.max(2, effectiveAutoLegCount - 1))}
                        >
                          −
                        </button>
                        <span className="num">{effectiveAutoLegCount}</span>
                        <button
                          type="button"
                          className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
                          aria-label="Más selecciones"
                          disabled={effectiveAutoLegCount >= maxAutoLegs}
                          onClick={() => setAutoLegCount(Math.min(maxAutoLegs, effectiveAutoLegCount + 1))}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mismo partido (SGP) */}
                <div className="pl-parlay-surface-tile rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <span className="text-xs font-extrabold block" style={{ color: "var(--pl-text)" }}>
                      Mismo partido (SGP)
                    </span>
                    <span className="text-xs" style={{ color: "var(--pl-text-secondary)" }}>
                      Permite hasta 2 selecciones de distinto eje del mismo partido con ajuste de correlación Student-t.
                    </span>
                  </div>

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

                <button
                  type="button"
                  className="pl-btn-primary pl-btn-wrap w-full min-h-11 text-sm inline-flex items-center justify-center gap-2"
                  data-generate-parlay=""
                  onClick={handleGenerateAuto}
                >
                  <MaestroIcon name="sparkles" size={15} />
                  <span>
                    Generar parlay ({effectiveAutoLegCount} selecciones · {autoRisk}
                    {targetPreset !== "libre" ? ` · ${activePresetSpec.label}` : ""})
                  </span>
                </button>
              </section>
            ) : (
              /* Panel: Armar a mano con protección anti-contradicción */
              <section
                className="space-y-3"
                role="tabpanel"
                aria-label="Armar parlay a mano"
                data-parlay-manual-panel=""
              >
                <div className="glass-card glass-ring rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <MaestroIcon name="search" size={15} style={{ color: "var(--pl-text-muted)" }} />
                    <input
                      type="search"
                      inputMode="search"
                      enterKeyHint="search"
                      autoCorrect="off"
                      spellCheck={false}
                      value={manualQuery}
                      onChange={(e) => {
                        setManualQuery(e.target.value);
                        setCatalogLimit(12);
                      }}
                      placeholder="Buscar equipo o liga…"
                      aria-label="Buscar equipo o liga para armar parlay"
                      className="glass-input text-base sm:text-xs min-h-11 sm:min-h-10 px-3 rounded-xl flex-1 min-w-0"
                    />
                  </div>
                  <Switch isSelected={allowSgp} onChange={setAllowSgp}>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <Switch.Content>
                      <span className="text-xs font-bold">Mismo partido</span>
                    </Switch.Content>
                  </Switch>
                </div>

                {candidateGames.length === 0 ? (
                  <div className="glass-card glass-ring rounded-2xl p-6 text-center space-y-2">
                    <p className="m-0 text-sm font-bold">Sin partidos abiertos con ese filtro</p>
                    <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                      Prueba con otro deporte, liga o limpia la búsqueda.
                    </p>
                  </div>
                ) : (
                  candidateGames.map((g) => (
                    <div
                      key={g.id}
                      className="glass-card glass-ring rounded-2xl p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-2 font-bold min-w-0">
                          <LeagueBadge league={g.league} label={g.leagueLabel} logoUrl={g.leagueLogoUrl} size={16} />
                          <span className="truncate">
                            {g.leagueLabel} · {g.home.shortName} vs {g.away.shortName}
                          </span>
                        </span>
                        <span className="num shrink-0" style={{ color: "var(--pl-text-muted)" }}>
                          {shortDateLabel(g.dayId)} · {g.kickoffLocal}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {g.picks.slice(0, 4).map((pk) => {
                          const unlocked = isPickUnlocked(pk, g.status, viewerRole);
                          const inSlip = parlayLegs.some((l) => l.pick.id === pk.id);
                          const sameGameExists = parlayLegs.some(
                            (l) => l.pick.gameId === pk.gameId && l.pick.id !== pk.id,
                          );
                          const compat = checkParlayCompatibility(
                            parlayLegs,
                            pk,
                            allowSgp,
                          );

                          if (!unlocked) {
                            return (
                              <a
                                key={pk.id}
                                href={upgradeHref}
                                onClick={(e) => {
                                  e.preventDefault();
                                  navigateTo(upgradeHref);
                                }}
                                className="rounded-xl p-2.5 text-xs flex items-center justify-between gap-2 no-underline"
                                style={{
                                  background: "var(--pl-surface)",
                                  color: "var(--pl-text-secondary)",
                                }}
                              >
                                <span className="inline-flex items-center gap-1.5 font-semibold truncate">
                                  <MaestroIcon name="lock" size={12} />
                                  <span className="truncate">{pk.categoryLabel}</span>
                                </span>
                                <span className="pl-pill text-[11px] shrink-0">
                                  {hasAccountSession ? "Activar Pase Ultra" : "Pase PitchLab Ultra"}
                                </span>
                              </a>
                            );
                          }

                          const blockedReason =
                            !inSlip && !compat.allowed
                              ? getCompactBlockReason(
                                  sameGameExists,
                                  allowSgp,
                                  compat,
                                )
                              : null;

                          return (
                            <button
                              key={pk.id}
                              type="button"
                              onClick={() =>
                                inSlip
                                  ? removePickFromParlay(pk.id)
                                  : addPickToParlay(pk)
                              }
                              disabled={!inSlip && !compat.allowed}
                              title={blockedReason ?? undefined}
                              className="rounded-xl p-3 text-left text-xs cursor-pointer transition-opacity disabled:opacity-60 disabled:cursor-not-allowed space-y-1 min-h-11"
                              style={{
                                background: inSlip
                                  ? "var(--pl-surface-active)"
                                  : "var(--pl-surface)",
                                border: inSlip
                                  ? "1.5px solid var(--pl-brand)"
                                  : "1px solid var(--pl-border)",
                              }}
                            >
                              <div className="flex items-center justify-between gap-1.5 font-bold">
                                <span className="truncate">{pk.label}</span>
                                <span className="num shrink-0">
                                  {formatOddsValue(pickReferenceDecimal(pk), oddsFormat)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-1.5 num">
                                <span style={{ color: "var(--pl-text-muted)" }}>
                                  {(pk.p * 100).toFixed(0)} % · {pk.categoryLabel}
                                </span>
                                {inSlip ? (
                                  <span
                                    className="inline-flex items-center gap-1 font-extrabold shrink-0"
                                    style={{ color: "var(--pl-brand)" }}
                                  >
                                    <MaestroIcon name="check" size={11} />
                                    <span>En boleto</span>
                                  </span>
                                ) : compat.allowed ? (
                                  <span
                                    className="inline-flex items-center gap-1 font-bold shrink-0"
                                    style={{ color: "var(--pl-success)" }}
                                  >
                                    <MaestroIcon name="plus" size={11} />
                                    <span>Agregar</span>
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex items-center gap-1 font-bold shrink-0"
                                    style={{ color: "var(--pl-warning)" }}
                                  >
                                    <MaestroIcon name="x" size={11} />
                                    <span>{blockedReason}</span>
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}

                {allOpenGames.length > catalogLimit ? (
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      className="pl-btn-glass text-xs min-h-11 px-4 num"
                      onClick={() => setCatalogLimit((c) => c + 12)}
                    >
                      Ver más partidos ({allOpenGames.length - catalogLimit} restantes)
                    </button>
                  </div>
                ) : null}
              </section>
            )}
          </div>

          {/* Columna derecha: Boleto Combinado PitchLab (plano, sin brillos decorativos) */}
          <aside className="lg:col-span-5 glass-card glass-ring rounded-2xl p-4 sm:p-6 space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto overflow-x-hidden min-w-0">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span
                    className="text-xs font-extrabold inline-flex items-center gap-1.5"
                    style={{ color: "var(--pl-brand)" }}
                  >
                    <MaestroIcon name="ticket" size={13} />
                    <span>Boleto combinado</span>
                  </span>
                  <h2 className="m-0 text-xl font-extrabold num">
                    {parlaySummary.legs.length} {parlaySummary.legs.length === 1 ? "selección activa" : "selecciones activas"}
                  </h2>
                </div>
                {parlaySummary.legs.length > 0 ? (
                  <button
                    type="button"
                    className="pl-btn-glass text-xs min-h-11 sm:min-h-10 px-3 inline-flex items-center gap-1 shrink-0"
                    onClick={() => {
                      if (parlaySummary.legs.length >= 2) {
                        setConfirmClearOpen(true);
                      } else {
                        clearParlay();
                      }
                    }}
                  >
                    <MaestroIcon name="x" size={12} />
                    <span>Limpiar</span>
                  </button>
                ) : null}
              </div>

              <div className="ticket-perf" />

              {parlaySummary.legs.length === 0 ? (
                <div className="py-6 text-center space-y-2">
                  <p className="m-0 text-sm font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
                    Tu boleto combinado está vacío
                  </p>
                  <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Usa el generador automático o cambia a «Armar a mano» para elegir piernas compatibles (mínimo 2 para sellar).
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {parlaySummary.legs.map(({ pick }) => {
                    const gm = dataset.games.find((g) => g.id === pick.gameId);
                    return (
                    <div
                      key={pick.id}
                      className="pl-parlay-surface-tile rounded-xl p-3 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span
                          className="block text-[11px] truncate"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          {pick.leagueLabel} · {pick.matchLabel}
                          {gm ? ` · ${shortDateLabel(gm.dayId)} · ${gm.kickoffLocal}` : ` · ${pick.kickoffLocal}`}
                        </span>
                        <strong className="block text-sm truncate">{pick.label}</strong>
                        <span
                          className="text-xs num font-bold"
                          style={{ color: "var(--pl-brand)" }}
                        >
                          {(pick.p * 100).toFixed(1)} % ·{" "}
                          {formatOddsValue(pickReferenceDecimal(pick), oddsFormat)}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Quitar ${pick.label}`}
                        onClick={() => removePickFromParlay(pick.id)}
                        className="pl-btn-glass px-2.5 min-h-11 min-w-11 sm:min-h-10 sm:min-w-10 text-xs inline-flex items-center justify-center shrink-0"
                      >
                        <MaestroIcon name="x" size={12} />
                      </button>
                    </div>
                  );
                  })}
                </div>
              )}

              <div
                className="rounded-xl p-3.5 space-y-2"
                style={{
                  background: "var(--pl-surface)",
                  border: `1px solid color-mix(in srgb, ${riskToneCss(slipRisk.tone)} 38%, var(--pl-border))`,
                }}
                data-parlay-risk-meter={slipRisk.level}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold" style={{ color: "var(--pl-text-muted)" }}>
                    Nivel de riesgo del boleto
                  </span>
                  <span
                    className="text-xs font-extrabold num"
                    style={{ color: riskToneCss(slipRisk.tone) }}
                  >
                    {slipRisk.label}
                  </span>
                </div>
                {parlaySummary.legs.length > 0 ? (
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ background: "var(--pl-surface-hover)" }}
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${slipRisk.meterPct}%`,
                        background: riskToneCss(slipRisk.tone),
                      }}
                    />
                  </div>
                ) : null}
                <p className="m-0 text-xs font-semibold num" style={{ color: "var(--pl-text)" }}>
                  {slipRisk.headline}
                </p>
                <p className="m-0 text-[11px] leading-snug" style={{ color: "var(--pl-text-muted)" }}>
                  {slipRisk.guidance}
                </p>
                {slipRisk.warnings.length > 0 ? (
                  <ul className="m-0 pl-4 space-y-1 text-[11px] font-semibold" style={{ color: riskToneCss(slipRisk.tone) }}>
                    {slipRisk.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="ticket-perf" />

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">Unidades simuladas</span>
                  <div
                    className="sl-stepper"
                    role="group"
                    aria-label="Unidades del boleto combinado"
                  >
                    <button
                      type="button"
                      className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
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
                    <span className="num">{parlayStakeUnits.toFixed(2)}u</span>
                    <button
                      type="button"
                      className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
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

                {/* Calculadora de momio total de casa */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="parlay-book-odds-input"
                    className="text-xs font-bold"
                  >
                    Momio total en tu casa:
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
                    className="glass-input px-2.5 py-1 text-base sm:text-xs font-bold num min-h-11 sm:min-h-9 w-full sm:w-40 text-right"
                  />
                </div>

                {parlaySummary.hasSgpCorrelation ? (
                  <SgpCopulaAuditCard
                    legs={parlaySummary.legs}
                    oddsFormat={oddsFormat}
                    offeredCombinedDecimalOdds={parsedBookParlayDec}
                    onAuditResolved={setResolvedSgpAudit}
                  />
                ) : null}

                <div className="grid grid-cols-2 gap-2.5 num">
                  <div className="pl-parlay-surface-tile rounded-xl p-3">
                    <span
                      className="block text-xs"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      Prob. Conjunta Real
                    </span>
                    <strong className="text-base font-extrabold">
                      {effectiveSlipProb * 100 < 0.1 && parlaySummary.legs.length > 0
                        ? "< 0.1 %"
                        : `${(effectiveSlipProb * 100).toFixed(1)} %`}
                    </strong>
                  </div>
                  <div className="pl-parlay-surface-tile rounded-xl p-3">
                    <span
                      className="block text-xs"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      {parsedBookParlayDec ? "Tu Momio Total" : "Momio Combinado"}
                    </span>
                    <strong className="text-base font-extrabold">
                      {formatOddsValue(effectiveSlipBookDec, oddsFormat)}
                    </strong>
                  </div>
                  <div className="pl-parlay-surface-tile rounded-xl p-3">
                    <span
                      className="block text-xs"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      Momio justo
                    </span>
                    <strong className="text-base font-bold">
                      {formatOddsValue(effectiveSlipFairDec, oddsFormat)}
                    </strong>
                  </div>
                  <div className="pl-parlay-surface-tile rounded-xl p-3">
                    <span
                      className="block text-xs"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      Retorno ({effectiveSlipEdgePts >= 0 ? `+${effectiveSlipEdgePts.toFixed(1)}` : effectiveSlipEdgePts.toFixed(1)} pts)
                    </span>
                    <strong
                      className="text-base font-extrabold"
                      style={{ color: "var(--pl-success)" }}
                    >
                      {effectiveReturnUnits.toFixed(2)}u
                    </strong>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  disabled={parlaySummary.legs.length < 2}
                  className="pl-btn-glass min-h-11 text-xs inline-flex items-center justify-center gap-1.5"
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
                      probability: parlaySummary.combinedProbability,
                      fairDecimal: parlaySummary.fairDecimal,
                      marketDecimal: effectiveSlipBookDec,
                      units: parlaySummary.stakeUnits,
                      gameStatus: "NS",
                    })
                  }
                >
                  <MaestroIcon name="share" size={13} />
                  <span>Exportar boleto</span>
                </button>
                <button
                  type="button"
                  disabled={parlaySummary.legs.length < 2}
                  className="pl-btn-primary min-h-11 text-xs inline-flex items-center justify-center gap-1.5"
                  onClick={() => sealParlayToJournal()}
                >
                  <MaestroIcon name="ticket" size={13} />
                  <span>Sellar en Mi récord ({parlaySummary.stakeUnits.toFixed(1)}u)</span>
                </button>
              </div>

              <details
                className="pl-parlay-surface-tile rounded-xl p-3.5"
                data-parlay-rules=""
              >
                <summary className="text-xs font-extrabold cursor-pointer" style={{ color: "var(--pl-text)" }}>
                  Qué no se puede combinar en parlay
                </summary>
                <ul className="m-0 mt-2 pl-4 space-y-1 text-[11px] leading-snug" style={{ color: "var(--pl-text-muted)" }}>
                  {PARLAY_NON_COMBINABLE_RULES.map((rule) => (
                    <li key={rule.title}>
                      <strong style={{ color: "var(--pl-text-secondary)" }}>{rule.title}:</strong> {rule.detail}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          </aside>
        </div>

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

/** /app/momios: compara tu momio contra el justo (ver OddsCompareView). */
export function MomiosExplorerClubView(): React.JSX.Element {
  return <OddsCompareClubView />;
}
