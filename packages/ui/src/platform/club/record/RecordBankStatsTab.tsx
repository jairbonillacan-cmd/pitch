"use client";

import React, { useCallback, useId, useMemo, useRef, useState } from "react";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreTable,
  type SofascoreTableColumn,
} from "../../../components/ui/primitives";
import { formatOddsValue } from "../../access-guard";
import { DailyResultsCalendar } from "../../components/DailyResultsCalendar";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { ConfirmActionDialog } from "../../components/PlatformOverlays";
import {
  buildMonthlyRecordCalendar,
  type RecordStats,
} from "../../record-stats";
import type { JournalEntry, MatchPick, OddsFormat } from "../../types";
import { formatUnitsAsMxn } from "../account/account-helpers";
import {
  BalanceCurveFigure,
  formatSignedPctValue,
  formatSignedUnits,
  type AuditRateDisplayRow,
} from "./PublicRecordSections";
import {
  computeJournalAuditSummary,
  computeJournalMarketFamilyBreakdown,
} from "./record-audit-helpers";

const BANKROLL_PRESETS = [2_500, 5_000, 10_000] as const;

function parseBankrollInput(
  raw: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const clean = raw.replace(/[$,\s]/g, "").trim();
  if (clean.length === 0) return { ok: true, value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) {
    return { ok: false, error: "Escribe un monto válido en pesos (por ejemplo, 5000)." };
  }
  const num = parseStrictFiniteNumber(clean);
  if (num === null || num < 0 || num > 10_000_000) {
    return { ok: false, error: "La banca inicial debe estar entre $0 y $10,000,000 MXN." };
  }
  return { ok: true, value: Math.round(num) };
}

function buildBreakdownColumns(
  entityHeader: string,
  showAuditMeta: boolean,
): readonly SofascoreTableColumn<AuditRateDisplayRow>[] {
  const cols: SofascoreTableColumn<AuditRateDisplayRow>[] = [
    {
      key: "label",
      header: entityHeader,
      sticky: true,
      render: (row) => <span className="pl-rec-tbl-entity">{row.label}</span>,
    },
    {
      key: "hitRate",
      header: "Acierto",
      numeric: true,
      render: (row) => {
        const pct = row.total > 0 ? Math.round((row.won / row.total) * 1000) / 10 : 0;
        const barColor =
          row.total === 0
            ? "var(--pl-text-muted)"
            : pct >= 55
              ? "var(--pl-success)"
              : pct < 45
                ? "var(--pl-warning)"
                : "var(--pl-brand)";
        return (
          <div className="pl-rec-tbl-rate num">
            <strong>{row.total > 0 ? `${pct.toFixed(1)} %` : "—"}</strong>
            <span className="pl-rec-tbl-bar" aria-hidden="true">
              <span
                style={{
                  inlineSize: `${Math.min(100, Math.max(0, pct))}%`,
                  background: barColor,
                }}
              />
            </span>
          </div>
        );
      },
    },
    {
      key: "record",
      header: "G–P",
      numeric: true,
      render: (row) => {
        const losses = Math.max(0, row.total - row.won);
        const pushes = row.pushes ?? 0;
        return (
          <span className="num whitespace-nowrap">
            {row.won}G–{losses}P{pushes > 0 ? ` · ${pushes}P` : ""}
          </span>
        );
      },
    },
  ];

  if (showAuditMeta) {
    cols.push({
      key: "evClv",
      header: "EV / CLV",
      numeric: true,
      render: (row) => {
        const hasEv = typeof row.avgEvPct === "number" && Number.isFinite(row.avgEvPct);
        const hasClv = typeof row.avgClvPct === "number" && Number.isFinite(row.avgClvPct);
        if (!hasEv && !hasClv) return <span style={{ color: "var(--pl-text-muted)" }}>—</span>;
        return (
          <span className="num whitespace-nowrap text-xs">
            {hasEv && row.avgEvPct !== null && row.avgEvPct !== undefined ? (
              <strong
                style={{
                  color: row.avgEvPct > 0 ? "var(--pl-success)" : "var(--pl-text-secondary)",
                }}
              >
                {formatSignedPctValue(row.avgEvPct)}
              </strong>
            ) : null}
            {hasEv && hasClv ? " · " : null}
            {hasClv && row.avgClvPct !== null && row.avgClvPct !== undefined
              ? formatSignedPctValue(row.avgClvPct)
              : null}
          </span>
        );
      },
    });
  }

  cols.push({
    key: "netUnits",
    header: "Saldo",
    numeric: true,
    render: (row) => (
      <strong className={`num whitespace-nowrap ${row.netUnits >= 0 ? "pl-rec-pos" : "pl-rec-neg"}`}>
        {formatSignedUnits(row.netUnits)}
      </strong>
    ),
  });

  return cols;
}

export function RecordBankStatsTab({
  stats,
  unitMxn,
  bankrollStartMxn,
  oddsFormat,
  onSaveBankroll,
  entries,
  pickById,
  userTimezone = "America/Mexico_City",
}: {
  stats: RecordStats;
  unitMxn: number;
  bankrollStartMxn: number | null;
  oddsFormat: OddsFormat;
  onSaveBankroll: (nextMxn: number | null) => void;
  entries?: readonly JournalEntry[];
  pickById?: ReadonlyMap<string, MatchPick>;
  userTimezone?: string;
}): React.JSX.Element {
  const uid = useId();
  const inputId = `${uid}-bank-input`;
  const helpId = `${uid}-bank-help`;
  const errorId = `${uid}-bank-err`;
  const inputRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<string>(() =>
    bankrollStartMxn !== null ? String(bankrollStartMxn) : "",
  );
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClearBankOpen, setConfirmClearBankOpen] = useState(false);

  const displayDraft = edited ? draft : bankrollStartMxn !== null ? String(bankrollStartMxn) : "";

  const auditSummary = useMemo(
    () => (entries ? computeJournalAuditSummary(entries) : null),
    [entries],
  );

  const marketFamilyRows = useMemo<readonly AuditRateDisplayRow[]>(() => {
    if (!entries || entries.length === 0) return stats.byMarket;
    const fineRows = computeJournalMarketFamilyBreakdown(entries, pickById);
    return fineRows.length > 0 ? fineRows : stats.byMarket;
  }, [entries, pickById, stats.byMarket]);

  const buildMonthlyCalendar = useCallback(
    (ym: string) =>
      buildMonthlyRecordCalendar(entries ?? [], ym || undefined, {
        timeZone: userTimezone,
        includeNetUnits: true,
      }),
    [entries, userTimezone],
  );

  const leagueCols = useMemo(() => buildBreakdownColumns("Liga", false), []);
  const marketCols = useMemo(() => buildBreakdownColumns("Familia", true), []);
  const typeCols = useMemo(() => buildBreakdownColumns("Tipo", false), []);

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
    const parsed = parseBankrollInput(displayDraft);
    if (!parsed.ok) setError(parsed.error);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = parseBankrollInput(displayDraft);
    if (!parsed.ok) {
      setError(parsed.error);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setEdited(false);
    setDraft(parsed.value !== null ? String(parsed.value) : "");
    onSaveBankroll(parsed.value);
  };

  const handleConfirmClearBankroll = () => {
    setDraft("");
    setEdited(false);
    setError(null);
    onSaveBankroll(null);
  };

  const streakLabel =
    stats.currentStreak.kind === "won"
      ? `${stats.currentStreak.length} ${stats.currentStreak.length === 1 ? "ganado" : "ganados"}`
      : stats.currentStreak.kind === "lost"
        ? `${stats.currentStreak.length} ${stats.currentStreak.length === 1 ? "perdido" : "perdidos"}`
        : "Sin cierres";

  return (
    <div className="pl-rec-stack">
      <SofascoreCard
        id={`${uid}-bank`}
        title="Tu banca inicial (opcional)"
        meta={
          <span className="pl-rec-private-note">
            <MaestroIcon name="shield" size={14} />
            <span>Siempre privado · Nadie más ve pesos</span>
          </span>
        }
      >
        <div className="space-y-3">
          <p className="pl-rec-card-meta num">
            Valor actual de tu unidad: 1u = ${unitMxn.toLocaleString("es-MX")} MXN
          </p>

          <div className="pl-rec-bank-grid">
            <form
              className="pl-rec-bank-form"
              onSubmit={handleSubmit}
              aria-labelledby={`${uid}-bank-title`}
              noValidate
            >
              <label htmlFor={inputId} className="pl-rec-label">
                Banca inicial en pesos (MXN)
              </label>
              <p id={helpId} className="pl-rec-hint [text-wrap:pretty]">
                Si la indicas, calculamos tu retorno sobre la banca y arrancamos tu curva de saldo
                desde esas unidades. Los montos en pesos jamás salen en tu perfil público.
              </p>

              <div className="pl-rec-input-row">
                <div className="pl-rec-input-wrap">
                  <span className="pl-rec-currency" aria-hidden="true">
                    $
                  </span>
                  <input
                    ref={inputRef}
                    id={inputId}
                    name="bankrollStartMxn"
                    type="text"
                    inputMode="numeric"
                    enterKeyHint="done"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Ej. 5000"
                    value={displayDraft}
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

                <Button type="submit" variant="primary" size="lg">
                  Guardar banca
                </Button>

                {bankrollStartMxn !== null ? (
                  <Button
                    type="button"
                    variant="secondary"
                    tone="danger"
                    size="lg"
                    data-clear-bankroll-trigger=""
                    onClick={() => setConfirmClearBankOpen(true)}
                  >
                    Quitar
                  </Button>
                ) : null}
              </div>

              {error ? (
                <p id={errorId} className="pl-rec-error" role="status">
                  {error}
                </p>
              ) : null}

              <div
                className="pl-rec-presets num"
                role="group"
                aria-label="Montos rápidos de banca inicial"
              >
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
        </div>
      </SofascoreCard>

      <div className="pl-rec-balance-cal-grid">
        <SofascoreCard
          id={`${uid}-curve`}
          title="Curva de saldo en el tiempo"
          meta={
            <span>
              {stats.settled} {stats.settled === 1 ? "cerrado" : "cerrados"}
              {auditSummary && auditSummary.pushes > 0 ? ` · ${auditSummary.pushes} push` : ""}
              {stats.open > 0 ? ` · ${stats.open} pend.` : ""}
            </span>
          }
        >
          <div className="space-y-3">
            <p className="pl-rec-card-meta [text-wrap:pretty]">
              Evolución acumulada en unidades según la fecha de cierre de cada pick.
            </p>
            <BalanceCurveFigure curve={stats.curve} startingUnits={startingUnits} />
          </div>
        </SofascoreCard>

        <SofascoreCard
          id={`${uid}-calendar`}
          title="Calendario mensual de resultados"
          meta={<span>Por día de cierre</span>}
        >
          <DailyResultsCalendar buildMonth={buildMonthlyCalendar} mode="units" />
        </SofascoreCard>
      </div>

      <div className="pl-rec-metrics-grid num">
        <SofascoreCard id={`${uid}-roi`} title="Rendimiento y retorno" density="compact">
          <div className="pl-rec-metric-pair">
            <div>
              <span className="pl-rec-metric-label">Rendimiento</span>
              <div
                className={`pl-rec-metric-big ${
                  stats.yieldPct === null ? "" : stats.yieldPct >= 0 ? "pl-rec-pos" : "pl-rec-neg"
                }`}
              >
                {stats.yieldPct !== null ? formatSignedPctValue(stats.yieldPct) : "—"}
              </div>
              <span className="pl-rec-kpi-sub">Sobre {stats.stakedUnits.toFixed(2)}u jugadas</span>
            </div>
            <div>
              <span className="pl-rec-metric-label">Retorno sobre tu banca</span>
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
        </SofascoreCard>

        <SofascoreCard id={`${uid}-clv`} title="Ventaja y momio promedio" density="compact">
          <div className="pl-rec-metric-pair">
            <div>
              <span className="pl-rec-metric-label">Ventaja / CLV promedio</span>
              <div
                className={`pl-rec-metric-big ${
                  stats.avgClvPct === null ? "" : stats.avgClvPct >= 0 ? "pl-rec-pos" : "pl-rec-neg"
                }`}
              >
                {stats.avgClvPct !== null ? formatSignedPctValue(stats.avgClvPct) : "—"}
              </div>
              <span className="pl-rec-kpi-sub">
                {auditSummary && auditSummary.avgEvPct !== null
                  ? `EV medio ${formatSignedPctValue(auditSummary.avgEvPct)}${
                      auditSummary.closingTrackedCount > 0
                        ? ` · ${auditSummary.closingTrackedCount} con cierre`
                        : ""
                    }`
                  : "Ventaja frente al momio justo"}
              </span>
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
        </SofascoreCard>

        <SofascoreCard id={`${uid}-streak`} title="Rachas y meses extremos" density="compact">
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
                {stats.bestWinStreak === 1 ? "ganado" : "ganados"}
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
        </SofascoreCard>
      </div>

      <div className="pl-rec-breakdowns">
        <SofascoreCard
          id={`${uid}-by-league`}
          title="Acierto por liga"
          meta={<span>{stats.byLeague.length} ligas</span>}
          density="compact"
        >
          <SofascoreTable
            caption="Desglose de acierto y saldo por liga"
            columns={leagueCols}
            rows={stats.byLeague}
            rowKey={(row) => row.key}
            density="compact"
            emptyState={
              <SofascoreEmptyState title="Aún no tienes picks cerrados por liga." />
            }
          />
        </SofascoreCard>

        <SofascoreCard
          id={`${uid}-by-market`}
          title="Acierto por mercado"
          meta={<span>{marketFamilyRows.length} familias</span>}
          density="compact"
        >
          <SofascoreTable
            caption="Desglose de acierto, EV y saldo por familia de mercado"
            columns={marketCols}
            rows={marketFamilyRows}
            rowKey={(row) => row.key}
            density="compact"
            emptyState={
              <SofascoreEmptyState title="Aún no tienes picks cerrados por familia de mercado." />
            }
          />
        </SofascoreCard>

        <SofascoreCard
          id={`${uid}-by-type`}
          title="Acierto por tipo de pick"
          meta={<span>{stats.byType.length} tipos</span>}
          density="compact"
        >
          <SofascoreTable
            caption="Desglose de acierto y saldo por tipo de pick"
            columns={typeCols}
            rows={stats.byType}
            rowKey={(row) => row.key}
            density="compact"
            emptyState={
              <SofascoreEmptyState title="Aún no tienes picks cerrados por tipo." />
            }
          />
        </SofascoreCard>
      </div>

      <ConfirmActionDialog
        open={confirmClearBankOpen}
        title="¿Quitar tu banca inicial?"
        description="Se eliminará el monto privado en pesos MXN y tu curva volverá a mostrarse desde 0.00u. Tus picks sellados no se modifican."
        confirmLabel="Quitar banca"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={handleConfirmClearBankroll}
        onCancel={() => setConfirmClearBankOpen(false)}
      />
    </div>
  );
}
