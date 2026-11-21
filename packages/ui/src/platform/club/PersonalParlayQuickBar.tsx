"use client";

import React, { useId, useMemo, useState } from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { Button, SofascoreCard } from "../../components/ui/primitives";
import { formatOddsValue } from "../access-guard";
import { MaestroIcon } from "../components/MaestroPrimitives";
import {
  buildPersonalQuickParlay,
  DAILY_PARLAY_STYLE_SPECS,
  DAILY_PARLAY_STYLES,
  PARLAY_TARGET_PRESETS,
  type ParlayTargetPresetId,
  type PersonalParlayScope,
} from "../daily-parlay";
import { ALL, SPORTS, sportOf, type SportFilter } from "./home/home-model";
import { assessParlayRisk } from "../parlay-engine";
import {
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import type { RiskBand } from "../types";

const QUICK_LEG_COUNTS = [2, 3, 4, 5, 6, 8, 10] as const;

function riskBadgeColor(tone: "success" | "info" | "warning" | "danger"): string {
  if (tone === "success") return "var(--pl-success)";
  if (tone === "warning") return "var(--pl-warning)";
  if (tone === "danger") return "var(--pl-danger)";
  return "var(--pl-brand)";
}

export function PersonalParlayQuickBar(): React.JSX.Element {
  const { dataset, viewerRole, oddsFormat, riskPreference } = usePlatformCore();
  const { loadParlayPicks } = usePlatformActions();
  const leagueSelectId = useId();
  const [legCount, setLegCount] = useState<number>(4);
  const [risk, setRisk] = useState<RiskBand>(riskPreference);
  const [targetPreset, setTargetPreset] = useState<ParlayTargetPresetId>("libre");
  const [sport, setSport] = useState<SportFilter>(ALL);
  const [league, setLeague] = useState<LeagueId | typeof ALL>(ALL);

  const openGames = useMemo(
    () => dataset.games.filter((g) => g.status !== "FT" && g.status !== "LIVE"),
    [dataset.games],
  );

  const availableLeagues = useMemo(() => {
    const sportLeagues = new Set<LeagueId>();
    for (const game of openGames) {
      if (sport === ALL || sportOf(game) === sport) {
        sportLeagues.add(game.league);
      }
    }
    return dataset.leagues.filter((l) => sportLeagues.has(l.league));
  }, [dataset.leagues, openGames, sport]);

  const effectiveLeague: LeagueId | typeof ALL = useMemo(() => {
    if (league === ALL) return ALL;
    return availableLeagues.some((l) => l.league === league) ? league : ALL;
  }, [availableLeagues, league]);

  const scope: PersonalParlayScope = useMemo(() => {
    if (effectiveLeague !== ALL) {
      return { kind: "league", league: effectiveLeague };
    }
    if (sport !== ALL) {
      return { kind: "sport", sport };
    }
    return { kind: "all" };
  }, [effectiveLeague, sport]);

  const maxScopedGames = useMemo(() => {
    const count = openGames.filter((g) => {
      if (effectiveLeague !== ALL) return g.league === effectiveLeague;
      if (sport !== ALL) return sportOf(g) === sport;
      return true;
    }).length;
    return Math.max(2, count);
  }, [openGames, effectiveLeague, sport]);

  const effectiveLegCount = Math.min(maxScopedGames, Math.max(2, legCount));

  const preview = useMemo(
    () =>
      buildPersonalQuickParlay({
        games: dataset.games,
        legCount: effectiveLegCount,
        risk,
        targetPreset,
        scope,
        viewerRole,
        allowSgp: false,
      }),
    [dataset.games, effectiveLegCount, risk, targetPreset, scope, viewerRole],
  );

  const previewRisk = useMemo(
    () =>
      assessParlayRisk({
        legs: preview.legs,
        combinedProbability: preview.combinedProbability,
        hasSgpCorrelation: false,
        sgpPairsCount: 0,
      }),
    [preview.legs, preview.combinedProbability],
  );

  const activePresetSpec =
    PARLAY_TARGET_PRESETS.find((p) => p.id === targetPreset) ?? PARLAY_TARGET_PRESETS[0]!;

  const handleSelectSport = (next: SportFilter) => {
    setSport(next);
    setLeague(ALL);
  };

  const handleSelectLeague = (rawValue: string) => {
    if (rawValue === ALL) {
      setLeague(ALL);
      return;
    }
    const matched = availableLeagues.find((lg) => lg.league === rawValue);
    setLeague(matched ? matched.league : ALL);
  };

  const handleApply = () => {
    if (preview.legs.length === 0) return;
    const styleLabel = DAILY_PARLAY_STYLE_SPECS[risk].label;
    const parlayTitle =
      targetPreset === "libre"
        ? `Parlay personal (${styleLabel})`
        : `Parlay personal (${activePresetSpec.label} · ${styleLabel})`;
    loadParlayPicks(
      preview.legs.map((l) => l.pick),
      { allowSgp: false, label: parlayTitle },
    );
  };

  const cardMeta =
    preview.status === "insufficient"
      ? "Sin combinación"
      : `${preview.legs.length} ${preview.legs.length === 1 ? "pick" : "picks"}`;

  return (
    <div className="pl-pb-quickbar" data-personal-parlay-quickbar="">
      <SofascoreCard title="Arma tu parlay en un toque" meta={cardMeta}>
        <div className="pl-pb-quickbar-body">
          <div className="pl-pb-quickbar-preview num">
            {preview.status === "insufficient" ? (
              <span className="text-xs font-semibold" style={{ color: "var(--pl-text-muted)" }}>
                Sin combinación válida con esa regla
              </span>
            ) : (
              <>
                <span className="pl-sf-signal-pill is-compact is-shortening">
                  {preview.legs.length} {preview.legs.length === 1 ? "pick" : "picks"} ·{" "}
                  {preview.combinedProbability * 100 < 0.1
                    ? "< 0.1 %"
                    : `${(preview.combinedProbability * 100).toFixed(1)} %`}{" "}
                  · {formatOddsValue(preview.fairDecimal, oddsFormat)}
                  {preview.hasCapturedBookOdds
                    ? ` (casa ~${formatOddsValue(preview.bookDecimal, oddsFormat)})`
                    : ""}
                </span>
                <span
                  className="pl-sf-signal-pill is-compact"
                  data-quick-risk-badge={previewRisk.level}
                  style={{ color: riskBadgeColor(previewRisk.tone) }}
                >
                  {previewRisk.shortLabel} (~1/{previewRisk.oneIn})
                </span>
              </>
            )}
          </div>

          <div className="pl-pb-quickbar-controls">
            <div className="pl-pb-field">
              <span className="pl-pb-field-label num">
                Selecciones ({effectiveLegCount} de {maxScopedGames})
              </span>
              <div className="pl-pb-stepper-row">
                <div className="pl-pb-chip-row" role="group" aria-label="Picks en tu parlay">
                  {QUICK_LEG_COUNTS.map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      disabled={cnt > maxScopedGames}
                      className="pl-pb-chip num"
                      aria-pressed={effectiveLegCount === cnt}
                      data-quick-count={cnt}
                      onClick={() => setLegCount(cnt)}
                    >
                      {cnt}
                    </button>
                  ))}
                </div>
                <div className="pl-pb-stepper" role="group" aria-label="Ajustar selecciones del generador">
                  <button
                    type="button"
                    className="pl-pb-stepper-btn"
                    aria-label="Menos selecciones en generador"
                    disabled={effectiveLegCount <= 2}
                    onClick={() => setLegCount(Math.max(2, effectiveLegCount - 1))}
                  >
                    −
                  </button>
                  <span className="pl-pb-stepper-val num">{effectiveLegCount}</span>
                  <button
                    type="button"
                    className="pl-pb-stepper-btn"
                    aria-label="Más selecciones en generador"
                    disabled={effectiveLegCount >= maxScopedGames}
                    onClick={() => setLegCount(Math.min(maxScopedGames, effectiveLegCount + 1))}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

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

            <div className="pl-pb-field">
              <span className="pl-pb-field-label">Estilo de riesgo</span>
              <div className="pl-pb-chip-row" role="group" aria-label="Estilo de riesgo">
                {DAILY_PARLAY_STYLES.map((styleId) => (
                  <button
                    key={styleId}
                    type="button"
                    className="pl-pb-chip is-grow"
                    aria-pressed={risk === styleId}
                    data-quick-risk={styleId}
                    onClick={() => setRisk(styleId)}
                  >
                    {DAILY_PARLAY_STYLE_SPECS[styleId].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pl-pb-field">
              <span className="pl-pb-field-label">Deporte</span>
              <div className="pl-pb-chip-row" role="group" aria-label="Filtrar por deporte">
                <button
                  type="button"
                  className="pl-pb-chip is-grow"
                  aria-pressed={sport === ALL}
                  data-quick-sport="all"
                  onClick={() => handleSelectSport(ALL)}
                >
                  Todo
                </button>
                {SPORTS.map((sp) => (
                  <button
                    key={sp.id}
                    type="button"
                    className="pl-pb-chip is-grow"
                    aria-pressed={sport === sp.id}
                    data-quick-sport={sp.id}
                    onClick={() => handleSelectSport(sp.id)}
                  >
                    {sp.shortLabel}
                  </button>
                ))}
              </div>
            </div>

            <div className="pl-pb-field">
              <label htmlFor={leagueSelectId} className="pl-pb-field-label">
                Liga
              </label>
              <select
                id={leagueSelectId}
                className="pl-pb-select"
                value={effectiveLeague}
                onChange={(e) => handleSelectLeague(e.target.value)}
                data-quick-league=""
              >
                <option value={ALL}>Todas las ligas</option>
                {availableLeagues.map((lg) => (
                  <option key={lg.league} value={lg.league}>
                    {lg.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="pl-pb-field">
              <Button
                variant="primary"
                size="default"
                className="w-full"
                disabled={preview.status === "insufficient"}
                onClick={handleApply}
                data-quick-generate-parlay=""
              >
                <MaestroIcon name="sparkles" size={15} />
                <span>
                  {preview.status === "insufficient"
                    ? "Sin suficientes picks"
                    : `Armar ${preview.legs.length} picks`}
                </span>
              </Button>
            </div>
          </div>

          {targetPreset !== "libre" && preview.status !== "insufficient" ? (
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Regla activa: ≥ {risk === "conservador" ? 60 : 52} % por selección (momio mín.{" "}
              {activePresetSpec.minLegDecimal.toFixed(2)}), máximo 1 por partido dentro del rango{" "}
              {activePresetSpec.range?.min.toFixed(1)}–{activePresetSpec.range?.max.toFixed(1)} sin
              inventar cuotas.
            </p>
          ) : null}

          {preview.message ? (
            <div className="pl-pb-quickbar-foot" role="status">
              <p className="m-0">{preview.message}</p>
              {preview.status === "insufficient" && targetPreset !== "libre" ? (
                <Button variant="secondary" size="sm" onClick={() => setTargetPreset("libre")}>
                  Cambiar a Libre
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </SofascoreCard>
    </div>
  );
}
