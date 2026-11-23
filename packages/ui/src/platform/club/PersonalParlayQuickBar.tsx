"use client";

import React, { useId, useMemo, useState } from "react";
import {
  sportForLeague,
  sportScoringUnit,
  type LeagueId,
  type PlatformSport,
} from "@pitchlab/contracts";
import { Button, SofascoreCard } from "../../components/ui/primitives";
import { formatOddsValue } from "../access-guard";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { MarketCategoryIcon } from "../components/PackSportIcons";
import {
  buildPersonalQuickParlay,
  DAILY_PARLAY_STYLE_SPECS,
  DAILY_PARLAY_STYLES,
  PARLAY_TARGET_PRESETS,
  type ParlayTargetPresetId,
  type PersonalParlayScope,
} from "../daily-parlay";
import { assessParlayRisk } from "../parlay-engine";
import { matchPickToBetBuilderLeg } from "../picks-catalog/bet-builder-math";
import {
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import type { MatchPick, OddsFormat, RiskBand } from "../types";
import { ALL, SPORTS, sportOf, type SportFilter } from "./home/home-model";

const MAX_QUICK_LEGS = 6;
const QUICK_LEG_COUNTS = [2, 3, 4, 5, 6] as const;

const HAS_UNIT_RE =
  /\b(goles|gol|puntos|punto|pts|carreras|carrera|córners|corners|esquinas|faltas|tarjetas|amarillas|tiros|remates|rebotes|asistencias|triples)\b/i;
const BARE_TOTAL_RE = /^(?:más|menos)\s+de\s+\d+(?:[.,]\d+)?$/i;

function formatQuickOdds(
  decimalOdds: number | null | undefined,
  format: OddsFormat,
): string {
  if (decimalOdds == null || !Number.isFinite(decimalOdds) || decimalOdds <= 1.01) {
    return "—";
  }
  return formatOddsValue(decimalOdds, format);
}

function formatQuickPickLabel(pick: MatchPick, sport: PlatformSport): string {
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
  if (market.includes("card") || market.includes("yellow")) return `${raw} tarjetas`;
  if (market.includes("foul")) return `${raw} faltas`;
  if (market.includes("sot")) return `${raw} tiros a puerta`;
  if (market.includes("shot")) return `${raw} remates`;
  return `${raw} ${sportScoringUnit(sport).plural}`;
}

function quickMarketFamily(pick: MatchPick, sport: PlatformSport): string {
  const leg = matchPickToBetBuilderLeg(pick, sport);
  if (leg.family !== "other" && leg.family !== "correct_score") {
    return leg.family;
  }
  return pick.market ?? pick.categoryLabel ?? pick.label;
}

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
  const [legCount, setLegCount] = useState<number>(3);
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

  const scopedOpenCount = useMemo(
    () =>
      openGames.filter((g) => {
        if (effectiveLeague !== ALL) return g.league === effectiveLeague;
        if (sport !== ALL) return sportOf(g) === sport;
        return true;
      }).length,
    [openGames, effectiveLeague, sport],
  );

  const maxScopedGames = Math.min(MAX_QUICK_LEGS, Math.max(2, scopedOpenCount));
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

  const hasPreviewLegs = preview.status !== "insufficient" && preview.legs.length > 0;

  const previewRisk = useMemo(
    () =>
      hasPreviewLegs
        ? assessParlayRisk({
            legs: preview.legs,
            combinedProbability: preview.combinedProbability,
            hasSgpCorrelation: false,
            sgpPairsCount: 0,
          })
        : null,
    [hasPreviewLegs, preview.legs, preview.combinedProbability],
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
    if (!hasPreviewLegs) return;
    const styleLabel = DAILY_PARLAY_STYLE_SPECS[risk].label;
    const parlayTitle =
      targetPreset === "libre"
        ? `Parlay personal (${styleLabel})`
        : `Parlay personal (${activePresetSpec.label} · ${styleLabel})`;
    loadParlayPicks(
      preview.legs.slice(0, MAX_QUICK_LEGS).map((l) => l.pick),
      { allowSgp: false, label: parlayTitle },
    );
  };

  const cardMeta = hasPreviewLegs
    ? `${preview.legs.length} ${preview.legs.length === 1 ? "selección" : "selecciones"}`
    : "Sin combinación";

  return (
    <div className="pl-pb-quickbar" data-personal-parlay-quickbar="">
      <SofascoreCard title="Arma tu parlay en un toque" meta={cardMeta}>
        <div className="pl-pb-quickbar-body">
          <div className="pl-pb-quickbar-preview num">
            {!hasPreviewLegs ? (
              <span className="pl-sf-signal-pill is-compact is-neutral">
                Probabilidad — · Momio justo —
              </span>
            ) : (
              <>
                <span className="pl-sf-signal-pill is-compact is-shortening">
                  {preview.legs.length}{" "}
                  {preview.legs.length === 1 ? "selección" : "selecciones"} ·{" "}
                  {preview.combinedProbability * 100 < 0.1
                    ? "< 0.1 %"
                    : `${(preview.combinedProbability * 100).toFixed(1)} %`}{" "}
                  · Justo {formatQuickOdds(preview.fairDecimal, oddsFormat)}
                  {preview.hasCapturedBookOdds && preview.bookDecimal > 1.01
                    ? ` · Casa ${formatQuickOdds(preview.bookDecimal, oddsFormat)}`
                    : ""}
                </span>
                {previewRisk ? (
                  <span
                    className="pl-sf-signal-pill is-compact"
                    data-quick-risk-badge={previewRisk.level}
                    style={{ color: riskBadgeColor(previewRisk.tone) }}
                  >
                    {previewRisk.shortLabel} (~1/{previewRisk.oneIn})
                  </span>
                ) : null}
              </>
            )}
          </div>

          {hasPreviewLegs ? (
            <ul className="pl-pb-quickbar-legs" role="list">
              {preview.legs.slice(0, MAX_QUICK_LEGS).map(({ pick }) => {
                const sportId = sportForLeague(pick.league);
                const fullLabel = formatQuickPickLabel(pick, sportId);
                return (
                  <li key={pick.id} className="pl-pb-quickbar-leg">
                    <MarketCategoryIcon family={quickMarketFamily(pick, sportId)} size={14} />
                    <span className="pl-pb-quickbar-leg-match">{pick.matchLabel}</span>
                    <strong className="pl-pb-quickbar-leg-pick">{fullLabel}</strong>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <div className="pl-pb-quickbar-controls">
            <div className="pl-pb-field">
              <span className="pl-pb-field-label num">
                Selecciones (2–{MAX_QUICK_LEGS})
              </span>
              <div className="pl-pb-chip-row" role="group" aria-label="Picks en tu parlay">
                {QUICK_LEG_COUNTS.map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    disabled={cnt > scopedOpenCount}
                    className="pl-pb-chip num"
                    aria-pressed={effectiveLegCount === cnt}
                    data-quick-count={cnt}
                    onClick={() => setLegCount(cnt)}
                  >
                    {cnt}
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
                disabled={!hasPreviewLegs}
                onClick={handleApply}
                data-quick-generate-parlay=""
              >
                <MaestroIcon name="target-picks" size={15} />
                <span>
                  {!hasPreviewLegs
                    ? "Sin suficientes picks"
                    : `Cargar ${preview.legs.length} selecciones`}
                </span>
              </Button>
            </div>
          </div>

          {targetPreset !== "libre" && hasPreviewLegs ? (
            <p className="m-0 text-xs num" style={{ color: "var(--pl-text-muted)" }}>
              Regla activa: ≥ {risk === "conservador" ? 60 : 52} % por selección (momio mín.{" "}
              {formatQuickOdds(activePresetSpec.minLegDecimal, oddsFormat)}), máximo 1 por partido
              {activePresetSpec.range
                ? ` dentro del rango ${formatQuickOdds(activePresetSpec.range.min, oddsFormat)}–${formatQuickOdds(activePresetSpec.range.max, oddsFormat)}`
                : ""}
              .
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
