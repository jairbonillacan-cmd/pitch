"use client";

import React, { useEffect, useId, useState } from "react";
import { formatOddsValue } from "../../access-guard";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import type { RecordStats } from "../../record-stats";
import type { OddsFormat } from "../../types";
import { formatUnitsAsMxn } from "../account/account-helpers";
import {
  BalanceCurveFigure,
  RateBreakdownList,
  formatSignedPctValue,
  formatSignedUnits,
} from "./PublicRecordSections";

const BANKROLL_PRESETS = [2_500, 5_000, 10_000] as const;

function parseBankrollInput(raw: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const clean = raw.replace(/[$,\s]/g, "").trim();
  if (clean.length === 0) return { ok: true, value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) {
    return { ok: false, error: "Escribe un monto válido en pesos (por ejemplo, 5000)." };
  }
  const num = Number(clean);
  if (!Number.isFinite(num) || num < 0 || num > 10_000_000) {
    return { ok: false, error: "La banca inicial debe estar entre $0 y $10,000,000 MXN." };
  }
  return { ok: true, value: Math.round(num) };
}

export function RecordBankStatsTab({
  stats,
  unitMxn,
  bankrollStartMxn,
  oddsFormat,
  onSaveBankroll,
}: {
  stats: RecordStats;
  unitMxn: number;
  bankrollStartMxn: number | null;
  oddsFormat: OddsFormat;
  onSaveBankroll: (nextMxn: number | null) => void;
}): React.JSX.Element {
  const uid = useId();
  const inputId = `${uid}-bank-input`;
  const helpId = `${uid}-bank-help`;
  const errorId = `${uid}-bank-err`;

  const [draft, setDraft] = useState<string>(() =>
    bankrollStartMxn !== null ? String(bankrollStartMxn) : "",
  );
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(bankrollStartMxn !== null ? String(bankrollStartMxn) : "");
    setEdited(false);
    setError(null);
  }, [bankrollStartMxn]);

  const startingUnits =
    bankrollStartMxn !== null && bankrollStartMxn > 0 && unitMxn > 0
      ? Math.round((bankrollStartMxn / unitMxn) * 100) / 100
      : null;
  const currentUnits =
    startingUnits !== null ? Math.round((startingUnits + stats.netUnits) * 100) / 100 : null;
  const currentMxn =
    bankrollStartMxn !== null ? Math.round(bankrollStartMxn + stats.netUnits * unitMxn) : null;

  const handleBlur = () => {
    if (!edited) return;
    const parsed = parseBankrollInput(draft);
    if (!parsed.ok) setError(parsed.error);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = parseBankrollInput(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      document.getElementById(inputId)?.focus();
      return;
    }
    setError(null);
    setEdited(false);
    onSaveBankroll(parsed.value);
  };

  const streakLabel =
    stats.currentStreak.kind === "won"
      ? `${stats.currentStreak.length} ${stats.currentStreak.length === 1 ? "cumplido" : "cumplidos"}`
      : stats.currentStreak.kind === "lost"
        ? `${stats.currentStreak.length} ${stats.currentStreak.length === 1 ? "no cumplido" : "no cumplidos"}`
        : "Sin cierres";

  return (
    <div className="pl-rec-stack">
      {/* Banca inicial privada en pesos MXN */}
      <section className="pl-rec-card glass-card glass-ring" aria-labelledby={`${uid}-bank-heading`}>
        <div className="pl-rec-card-head">
          <div>
            <h2 id={`${uid}-bank-heading`} className="pl-rec-card-title">
              Tu banca inicial (opcional)
            </h2>
            <p className="pl-rec-card-meta">
              Valor actual de tu unidad: 1u = ${unitMxn.toLocaleString("es-MX")} MXN
            </p>
          </div>
          <span className="pl-rec-private-note">
            <MaestroIcon name="shield" size={14} />
            <span>Siempre privado · Nadie más ve pesos</span>
          </span>
        </div>

        <div className="pl-rec-bank-grid">
          <form className="pl-rec-bank-form" onSubmit={handleSubmit} aria-labelledby={`${uid}-bank-heading`} noValidate>
            <label htmlFor={inputId} className="pl-rec-label">
              Banca inicial en pesos (MXN)
            </label>
            <p id={helpId} className="pl-rec-hint">
              Si la indicas, calculamos tu ROI y arrancamos tu curva de saldo desde esas unidades. Los
              montos en pesos jamás salen en tu perfil público.
            </p>

            <div className="pl-rec-input-row">
              <div className="pl-rec-input-wrap">
                <span className="pl-rec-currency" aria-hidden="true">
                  $
                </span>
                <input
                  id={inputId}
                  name="bankrollStartMxn"
                  type="text"
                  inputMode="numeric"
                  enterKeyHint="done"
                  placeholder="Ej. 5000"
                  value={draft}
                  aria-describedby={error ? `${helpId} ${errorId}` : helpId}
                  aria-invalid={error ? "true" : undefined}
                  className="pl-rec-input num"
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setEdited(true);
                    if (error) setError(null);
                  }}
                  onBlur={handleBlur}
                />
                <span className="pl-rec-currency-Unit" aria-hidden="true">
                  MXN
                </span>
              </div>

              <button type="submit" className="pl-rec-btn pl-rec-btn--primary">
                Guardar banca
              </button>

              {bankrollStartMxn !== null ? (
                <button
                  type="button"
                  className="pl-rec-btn"
                  onClick={() => {
                    setDraft("");
                    setEdited(false);
                    setError(null);
                    onSaveBankroll(null);
                  }}
                >
                  Quitar
                </button>
              ) : null}
            </div>

            {error ? (
              <p id={errorId} className="pl-rec-error" role="status">
                {error}
              </p>
            ) : null}

            <div className="pl-rec-presets num" role="group" aria-label="Montos rápidos de banca inicial">
              {BANKROLL_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="pl-rec-chip"
                  aria-pressed={bankrollStartMxn === preset}
                  onClick={() => {
                    setDraft(String(preset));
                    setEdited(false);
                    setError(null);
                    onSaveBankroll(preset);
                  }}
                >
                  ${preset.toLocaleString("es-MX")} ({(preset / unitMxn).toFixed(1)}u)
                </button>
              ))}
            </div>
          </form>

          <div className="pl-rec-bank-summary num" data-private-bankroll-summary="">
            <div className="pl-rec-bank-row">
              <span style={{ color: "var(--pl-text-muted)" }}>Banca inicial</span>
              <strong>
                {bankrollStartMxn !== null && startingUnits !== null
                  ? `$${bankrollStartMxn.toLocaleString("es-MX")} MXN (${startingUnits.toFixed(2)}u)`
                  : "Sin definir (curva desde 0u)"}
              </strong>
            </div>
            <div className="pl-rec-bank-row">
              <span style={{ color: "var(--pl-text-muted)" }}>Movimiento acumulado</span>
              <strong className={stats.netUnits >= 0 ? "pl-rec-pos" : "pl-rec-neg"}>
                {formatSignedUnits(stats.netUnits)} ({formatUnitsAsMxn(stats.netUnits, unitMxn)})
              </strong>
            </div>
            <div className="pl-rec-bank-row">
              <span style={{ color: "var(--pl-text-muted)" }}>Banca actual estimada</span>
              <strong>
                {currentMxn !== null && currentUnits !== null
                  ? `$${currentMxn.toLocaleString("es-MX")} MXN (${currentUnits.toFixed(2)}u)`
                  : `${stats.netUnits >= 0 ? "+" : ""}${stats.netUnits.toFixed(2)}u`}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {/* 1. Curva de saldo en el tiempo */}
      <section className="pl-rec-card glass-card glass-ring" aria-labelledby={`${uid}-curve-heading`}>
        <div className="pl-rec-card-head">
          <div>
            <h2 id={`${uid}-curve-heading`} className="pl-rec-card-title">
              Curva de saldo en el tiempo
            </h2>
            <p className="pl-rec-card-meta">
              Evolución acumulada en unidades según la fecha de cierre de cada pick.
            </p>
          </div>
          <span className="pl-pill num">
            {stats.settled} {stats.settled === 1 ? "pick cerrado" : "picks cerrados"}
          </span>
        </div>
        <BalanceCurveFigure curve={stats.curve} startingUnits={startingUnits} />
      </section>

      {/* 3, 4, 5 y 6: Rendimiento & ROI · CLV & Momio promedio · Rachas & Meses */}
      <div className="pl-rec-metrics-grid num">
        <section className="pl-rec-metric-box glass-card glass-ring" aria-labelledby={`${uid}-roi-heading`}>
          <h2 id={`${uid}-roi-heading`} className="pl-rec-card-title">
            Rendimiento y ROI
          </h2>
          <div className="pl-rec-metric-pair">
            <div>
              <span className="pl-rec-metric-label">Rendimiento (yield)</span>
              <div
                className={`pl-rec-metric-big ${
                  stats.yieldPct === null ? "" : stats.yieldPct >= 0 ? "pl-rec-pos" : "pl-rec-neg"
                }`}
              >
                {stats.yieldPct !== null ? formatSignedPctValue(stats.yieldPct) : "—"}
              </div>
              <span className="pl-rec-kpi-sub">
                Sobre {stats.stakedUnits.toFixed(2)}u jugadas
              </span>
            </div>
            <div>
              <span className="pl-rec-metric-label">ROI sobre banca</span>
              <div
                className={`pl-rec-metric-big ${
                  stats.roiPct === null ? "" : stats.roiPct >= 0 ? "pl-rec-pos" : "pl-rec-neg"
                }`}
              >
                {stats.roiPct !== null ? formatSignedPctValue(stats.roiPct) : "—"}
              </div>
              <span className="pl-rec-kpi-sub">
                {startingUnits !== null
                  ? `Base ${startingUnits.toFixed(1)}u`
                  : "Indica tu banca inicial arriba"}
              </span>
            </div>
          </div>
        </section>

        <section className="pl-rec-metric-box glass-card glass-ring" aria-labelledby={`${uid}-clv-heading`}>
          <h2 id={`${uid}-clv-heading`} className="pl-rec-card-title">
            CLV y momio promedio
          </h2>
          <div className="pl-rec-metric-pair">
            <div>
              <span className="pl-rec-metric-label">CLV promedio</span>
              <div
                className={`pl-rec-metric-big ${
                  stats.avgClvPct === null ? "" : stats.avgClvPct >= 0 ? "pl-rec-pos" : "pl-rec-neg"
                }`}
              >
                {stats.avgClvPct !== null ? formatSignedPctValue(stats.avgClvPct) : "—"}
              </div>
              <span className="pl-rec-kpi-sub">Ventaja frente al momio justo</span>
            </div>
            <div>
              <span className="pl-rec-metric-label">Momio promedio</span>
              <div className="pl-rec-metric-big">
                {stats.avgOddsDecimal !== null
                  ? formatOddsValue(stats.avgOddsDecimal, oddsFormat)
                  : "—"}
              </div>
              <span className="pl-rec-kpi-sub">
                {stats.avgOddsDecimal !== null
                  ? `≈ ${((1 / stats.avgOddsDecimal) * 100).toFixed(1)} % implícita`
                  : "En picks cerrados"}
              </span>
            </div>
          </div>
        </section>

        <section className="pl-rec-metric-box glass-card glass-ring" aria-labelledby={`${uid}-streak-heading`}>
          <h2 id={`${uid}-streak-heading`} className="pl-rec-card-title">
            Rachas y meses extremos
          </h2>
          <div className="pl-rec-metric-pair">
            <div>
              <span className="pl-rec-metric-label">Racha actual</span>
              <div
                className={`pl-rec-metric-big ${
                  stats.currentStreak.kind === "won"
                    ? "pl-rec-pos"
                    : stats.currentStreak.kind === "lost"
                      ? "pl-rec-neg"
                      : ""
                }`}
              >
                {streakLabel}
              </div>
              <span className="pl-rec-kpi-sub">
                Mejor racha: {stats.bestWinStreak}{" "}
                {stats.bestWinStreak === 1 ? "cumplido" : "cumplidos"}
              </span>
            </div>
            <div>
              <span className="pl-rec-metric-label">Mejor / peor mes</span>
              {stats.bestMonth && stats.worstMonth ? (
                <>
                  <div className="text-sm font-extrabold pl-rec-pos">
                    {stats.bestMonth.label}: {formatSignedUnits(stats.bestMonth.netUnits)}
                  </div>
                  <span
                    className={`pl-rec-kpi-sub ${stats.worstMonth.netUnits >= 0 ? "pl-rec-pos" : "pl-rec-neg"}`}
                  >
                    {stats.worstMonth.label}: {formatSignedUnits(stats.worstMonth.netUnits)}
                  </span>
                </>
              ) : (
                <>
                  <div className="pl-rec-metric-big">—</div>
                  <span className="pl-rec-kpi-sub">Se activa con 2 meses cerrados</span>
                </>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* 2. Acierto por liga, por mercado y por tipo de pick */}
      <div className="pl-rec-breakdowns">
        <section className="pl-rec-card glass-card glass-ring" aria-labelledby={`${uid}-by-league`}>
          <div className="pl-rec-card-head">
            <h2 id={`${uid}-by-league`} className="pl-rec-card-title">
              Acierto por liga
            </h2>
            <span className="pl-rec-card-meta num">{stats.byLeague.length} ligas</span>
          </div>
          <RateBreakdownList
            rows={stats.byLeague}
            emptyText="Aún no tienes picks cerrados por liga."
          />
        </section>

        <section className="pl-rec-card glass-card glass-ring" aria-labelledby={`${uid}-by-market`}>
          <div className="pl-rec-card-head">
            <h2 id={`${uid}-by-market`} className="pl-rec-card-title">
              Acierto por mercado
            </h2>
            <span className="pl-rec-card-meta num">{stats.byMarket.length} mercados</span>
          </div>
          <RateBreakdownList
            rows={stats.byMarket}
            emptyText="Aún no tienes picks cerrados por mercado."
          />
        </section>

        <section className="pl-rec-card glass-card glass-ring" aria-labelledby={`${uid}-by-type`}>
          <div className="pl-rec-card-head">
            <h2 id={`${uid}-by-type`} className="pl-rec-card-title">
              Acierto por tipo de pick
            </h2>
            <span className="pl-rec-card-meta num">{stats.byType.length} tipos</span>
          </div>
          <RateBreakdownList
            rows={stats.byType}
            emptyText="Aún no tienes picks cerrados por tipo."
          />
        </section>
      </div>
    </div>
  );
}
