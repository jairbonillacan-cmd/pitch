"use client";

import React, { useId, useMemo, useState } from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { formatOddsValue } from "../access-guard";
import { MaestroIcon } from "../components/MaestroPrimitives";
import {
  buildPersonalQuickParlay,
  DAILY_PARLAY_STYLE_SPECS,
  DAILY_PARLAY_STYLES,
  type PersonalParlayScope,
} from "../daily-parlay";
import { ALL, SPORTS, sportOf, type SportFilter } from "./home/home-model";
import { usePlatform } from "../platform-provider";
import type { RiskBand } from "../types";

const QUICK_LEG_COUNTS = [2, 3, 4, 5, 6] as const;

export function PersonalParlayQuickBar(): React.JSX.Element {
  const { dataset, viewerRole, oddsFormat, riskPreference, loadParlayPicks } =
    usePlatform();
  const leagueSelectId = useId();
  const [legCount, setLegCount] = useState<number>(3);
  const [risk, setRisk] = useState<RiskBand>(riskPreference);
  const [sport, setSport] = useState<SportFilter>(ALL);
  const [league, setLeague] = useState<LeagueId | typeof ALL>(ALL);

  const openGames = useMemo(
    () => dataset.games.filter((g) => g.status !== "FT"),
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

  const preview = useMemo(
    () =>
      buildPersonalQuickParlay({
        games: dataset.games,
        legCount,
        risk,
        scope,
        viewerRole,
        allowSgp: false,
      }),
    [dataset.games, legCount, risk, scope, viewerRole],
  );

  const handleSelectSport = (next: SportFilter) => {
    setSport(next);
    setLeague(ALL);
  };

  const handleApply = () => {
    if (preview.legs.length === 0) return;
    loadParlayPicks(
      preview.legs.map((l) => l.pick),
      {
        allowSgp: false,
        toastText:
          preview.status === "partial"
            ? `Parlay personal armado con ${preview.legs.length} de ${legCount} selecciones disponibles.`
            : `Parlay personal (${DAILY_PARLAY_STYLE_SPECS[risk].label}) cargado con ${preview.legs.length} selecciones.`,
      },
    );
  };

  return (
    <section
      aria-labelledby="quick-parlay-title"
      className="pl-quickbar glass-card glass-ring"
      data-personal-parlay-quickbar=""
    >
      <div className="pl-quickbar-head">
        <div className="min-w-0 flex flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pl-pill pl-pill--brand">
              <MaestroIcon name="bolt" size={12} />
              <span>Generador personal</span>
            </span>
          </div>
          <h2 id="quick-parlay-title" className="m-0 text-base sm:text-lg font-extrabold">
            Arma tu parlay en un toque
          </h2>
        </div>

        <div className="pl-quickbar-preview">
          {preview.status === "insufficient" ? (
            <span className="text-xs font-semibold" style={{ color: "var(--pl-text-muted)" }}>
              Sin partidos suficientes con ese filtro
            </span>
          ) : (
            <span className="pl-pill pl-pill--info num">
              {preview.legs.length} {preview.legs.length === 1 ? "pick" : "picks"} ·{" "}
              {(preview.combinedProbability * 100).toFixed(1)} % ·{" "}
              {formatOddsValue(preview.fairDecimal, oddsFormat)}
            </span>
          )}
        </div>
      </div>

      <div className="pl-quickbar-controls">
        <div className="pl-quickbar-field">
          <span className="pl-quickbar-label">Selecciones</span>
          <div className="seg-well pl-quickbar-well" role="group" aria-label="Picks en tu parlay">
            {QUICK_LEG_COUNTS.map((cnt) => (
              <button
                key={cnt}
                type="button"
                className="seg-btn pl-quickbar-count num"
                aria-pressed={legCount === cnt}
                data-quick-count={cnt}
                onClick={() => setLegCount(cnt)}
              >
                {cnt}
              </button>
            ))}
          </div>
        </div>

        <div className="pl-quickbar-field">
          <span className="pl-quickbar-label">Estilo de riesgo</span>
          <div className="seg-well pl-quickbar-well" role="group" aria-label="Estilo de riesgo">
            {DAILY_PARLAY_STYLES.map((styleId) => (
              <button
                key={styleId}
                type="button"
                className="seg-btn pl-quickbar-pill"
                aria-pressed={risk === styleId}
                data-quick-risk={styleId}
                onClick={() => setRisk(styleId)}
              >
                {DAILY_PARLAY_STYLE_SPECS[styleId].label}
              </button>
            ))}
          </div>
        </div>

        <div className="pl-quickbar-field">
          <span className="pl-quickbar-label">Deporte</span>
          <div className="seg-well pl-quickbar-well" role="group" aria-label="Filtrar por deporte">
            <button
              type="button"
              className="seg-btn pl-quickbar-pill"
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
                className="seg-btn pl-quickbar-pill"
                aria-pressed={sport === sp.id}
                data-quick-sport={sp.id}
                onClick={() => handleSelectSport(sp.id)}
              >
                {sp.shortLabel}
              </button>
            ))}
          </div>
        </div>

        <div className="pl-quickbar-field">
          <label htmlFor={leagueSelectId} className="pl-quickbar-label">
            Liga
          </label>
          <select
            id={leagueSelectId}
            className="glass-input pl-quickbar-select"
            value={effectiveLeague}
            onChange={(e) => setLeague(e.target.value as LeagueId | typeof ALL)}
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

        <div className="pl-quickbar-action">
          <button
            type="button"
            className="pl-btn-primary pl-quickbar-submit text-sm inline-flex items-center justify-center gap-2"
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
          </button>
        </div>
      </div>

      {preview.message ? (
        <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
          {preview.message}
        </p>
      ) : null}
    </section>
  );
}
