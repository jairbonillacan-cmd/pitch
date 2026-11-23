"use client";

import React, { useCallback, useId, useState } from "react";
import {
  SofascoreCard,
  SofascoreTabs,
  type SofascoreTabItem,
} from "../../../components/ui/primitives";
import { formatOddsValue } from "../../access-guard";
import { DailyResultsCalendar } from "../../components/DailyResultsCalendar";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import {
  buildMonthlyRecordCalendar,
  type CurvePoint,
  type PublicRecordView,
  type RateRow,
} from "../../record-stats";
import type { OddsFormat } from "../../types";
import {
  auditStatusFromJournal,
  classifyMarketFamily,
  getAuditStatusMeta,
} from "./record-audit-helpers";

export interface AuditRateDisplayRow extends RateRow {
  readonly pushes?: number;
  readonly avgEvPct?: number | null;
  readonly avgClvPct?: number | null;
}

const PUBLIC_VIEW_TABS: readonly SofascoreTabItem[] = [
  { id: "list", label: "Lista" },
  { id: "calendar", label: "Calendario" },
];

export function formatSignedUnits(u: number): string {
  if (Object.is(u, -0) || u === 0) return "0.00u";
  return u > 0 ? `+${u.toFixed(2)}u` : `−${Math.abs(u).toFixed(2)}u`;
}

export function formatSignedPctValue(v: number, digits = 1): string {
  if (Math.abs(v) < 0.0005) return `0.${"0".repeat(digits)} %`;
  return v > 0 ? `+${v.toFixed(digits)} %` : `−${Math.abs(v).toFixed(digits)} %`;
}

export function formatShortIsoDay(day: string | null | undefined): string {
  if (!day) return "";
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" })
    .format(d)
    .replace(".", "");
}

export function BalanceCurveFigure({
  curve,
  startingUnits,
  compact = false,
}: {
  curve: readonly CurvePoint[];
  startingUnits?: number | null;
  compact?: boolean;
}): React.JSX.Element {
  const uid = useId();
  const titleId = `${uid}-curve-title`;

  if (curve.length === 0) {
    return (
      <p className="pl-rec-hint [text-wrap:pretty]">
        Cuando se liquide tu primer pick aparecerá aquí tu curva de saldo día por día.
      </p>
    );
  }

  const base = startingUnits ?? 0;
  const firstPoint = curve[0];
  const points: CurvePoint[] =
    curve.length === 1 && firstPoint
      ? [{ day: firstPoint.day, balance: base }, firstPoint]
      : [...curve];

  const values = [base, ...points.map((p) => p.balance)];
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const span = Math.max(1, maxVal - minVal);
  const pad = span * 0.14;
  const lo = minVal - pad;
  const hi = maxVal + pad;

  const width = 640;
  const height = compact ? 156 : 210;
  const left = 12;
  const right = width - 12;
  const top = 14;
  const bottom = height - 24;

  const xOf = (idx: number) =>
    points.length <= 1
      ? (left + right) / 2
      : left + (idx / (points.length - 1)) * (right - left);
  const yOf = (val: number) =>
    bottom - ((val - lo) / (hi - lo)) * (bottom - top);

  const coords = points.map((p, i) => ({
    x: Math.round(xOf(i) * 10) / 10,
    y: Math.round(yOf(p.balance) * 10) / 10,
    day: p.day,
    balance: p.balance,
  }));

  const first = coords[0];
  const last = coords[coords.length - 1];
  if (!first || !last) {
    return (
      <p className="pl-rec-hint [text-wrap:pretty]">
        Cuando se liquide tu primer pick aparecerá aquí tu curva de saldo día por día.
      </p>
    );
  }

  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`)
    .join(" ");
  const baselineY = Math.round(yOf(base) * 10) / 10;
  const areaPath = `${linePath} L${last.x},${baselineY} L${first.x},${baselineY} Z`;
  const netDelta = Math.round((last.balance - base) * 100) / 100;
  const strokeVar = netDelta >= 0 ? "var(--pl-success)" : "var(--pl-danger)";

  return (
    <figure className="pl-rec-figure">
      <svg
        role="img"
        aria-labelledby={titleId}
        viewBox={`0 0 ${width} ${height}`}
        className="pl-rec-svg"
      >
        <title id={titleId}>
          Curva de saldo en unidades del {formatShortIsoDay(first.day)} al{" "}
          {formatShortIsoDay(last.day)}, cerrando en {last.balance.toFixed(2)}u
        </title>

        <line
          x1={left}
          y1={baselineY}
          x2={right}
          y2={baselineY}
          stroke="var(--pl-border-strong)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        <path d={areaPath} fill={strokeVar} fillOpacity="0.09" />
        <path
          d={linePath}
          fill="none"
          stroke={strokeVar}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <circle
          cx={first.x}
          cy={first.y}
          r="3.5"
          fill="var(--pl-surface)"
          stroke={strokeVar}
          strokeWidth="2"
        />
        <circle cx={last.x} cy={last.y} r="4.5" fill={strokeVar} />

        <text x={left} y={height - 4} fill="var(--pl-text-muted)" fontSize="11">
          {formatShortIsoDay(first.day)}
        </text>
        <text
          x={right}
          y={height - 4}
          textAnchor="end"
          fill="var(--pl-text-muted)"
          fontSize="11"
        >
          {formatShortIsoDay(last.day)}
        </text>
      </svg>

      <figcaption className="pl-rec-figcaption num">
        <span>
          Base {base.toFixed(2)}u · {curve.length}{" "}
          {curve.length === 1 ? "día con cierre" : "días con cierre"}
        </span>
        <strong className={netDelta >= 0 ? "pl-rec-pos" : "pl-rec-neg"}>
          Cierre: {last.balance.toFixed(2)}u ({formatSignedUnits(netDelta)})
        </strong>
      </figcaption>

      <table className="sr-only">
        <caption>Evolución diaria del saldo en unidades</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Saldo en unidades</th>
          </tr>
        </thead>
        <tbody>
          {curve.map((pt) => (
            <tr key={pt.day}>
              <th scope="row">{pt.day}</th>
              <td>{pt.balance.toFixed(2)}u</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function RateBreakdownList({
  rows,
  emptyText = "Sin picks cerrados todavía.",
  showNetUnits = true,
}: {
  rows: readonly AuditRateDisplayRow[];
  emptyText?: string;
  showNetUnits?: boolean;
}): React.JSX.Element {
  if (rows.length === 0) {
    return <p className="pl-rec-hint [text-wrap:pretty]">{emptyText}</p>;
  }
  return (
    <ul className="pl-rec-bars" role="list">
      {rows.map((row) => {
        const pct = row.total > 0 ? Math.round((row.won / row.total) * 1000) / 10 : 0;
        const losses = Math.max(0, row.total - row.won);
        const pushes = row.pushes ?? 0;
        const barColor =
          row.total === 0
            ? "var(--pl-text-muted)"
            : pct >= 55
              ? "var(--pl-success)"
              : pct < 45
                ? "var(--pl-warning)"
                : "var(--pl-brand)";
        const hasAuditMeta =
          (typeof row.avgEvPct === "number" && Number.isFinite(row.avgEvPct)) ||
          (typeof row.avgClvPct === "number" && Number.isFinite(row.avgClvPct));

        return (
          <li key={row.key} className="pl-rec-bar-item">
            <div className="pl-rec-bar-top num">
              <span className="pl-rec-bar-label">{row.label}</span>
              <span className="pl-rec-bar-nums">
                {row.total > 0 ? (
                  <>
                    <strong>{pct.toFixed(1)} %</strong> · {row.won}G–{losses}P
                  </>
                ) : (
                  <strong>—</strong>
                )}
                {pushes > 0 ? <> · {pushes} Push</> : null}
                {showNetUnits ? (
                  <>
                    {" "}
                    ·{" "}
                    <span className={row.netUnits >= 0 ? "pl-rec-pos" : "pl-rec-neg"}>
                      {formatSignedUnits(row.netUnits)}
                    </span>
                  </>
                ) : null}
              </span>
            </div>
            <div className="pl-rec-bar-track" aria-hidden="true">
              <div
                className="pl-rec-bar-fill"
                style={{
                  width: `${Math.min(100, Math.max(0, pct))}%`,
                  background: barColor,
                }}
              />
            </div>
            {hasAuditMeta ? (
              <div
                className="flex flex-wrap items-center gap-2 text-[11px] num"
                style={{ color: "var(--pl-text-muted)" }}
              >
                {typeof row.avgEvPct === "number" && Number.isFinite(row.avgEvPct) ? (
                  <span
                    style={{
                      color:
                        row.avgEvPct > 0 ? "var(--pl-success)" : "var(--pl-text-muted)",
                    }}
                  >
                    EV {formatSignedPctValue(row.avgEvPct)}
                  </span>
                ) : null}
                {typeof row.avgClvPct === "number" && Number.isFinite(row.avgClvPct) ? (
                  <span>CLV {formatSignedPctValue(row.avgClvPct)}</span>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function PublicRecordPreviewCard({
  handle,
  hidden,
  settled,
  view,
  oddsFormat,
  isPreview = false,
  summaryOnly = false,
}: {
  handle: string;
  hidden: boolean;
  settled: number;
  view: PublicRecordView | null;
  oddsFormat: OddsFormat;
  isPreview?: boolean;
  summaryOnly?: boolean;
}): React.JSX.Element {
  const [picksViewMode, setPicksViewMode] = useState<"list" | "calendar">("list");
  const showPublicUnits = Boolean(view && view.netUnits !== null);
  const buildPublicCalendarMonth = useCallback(
    (ym: string) =>
      buildMonthlyRecordCalendar(
        (view?.settledPicks ?? []).map((p, idx) => ({
          id: `pub-${idx}`,
          status: p.status,
          units: p.units,
          userDecimal: p.userDecimal,
          fairDecimal: p.userDecimal,
          clvPct: 0,
          leagueLabel: p.leagueLabel,
          pickLabel: p.pickLabel,
          origin: "Spacetime Suite",
          day: p.day,
        })),
        ym || undefined,
        { includeNetUnits: showPublicUnits },
      ),
    [showPublicUnits, view?.settledPicks],
  );

  if (hidden || !view) {
    return (
      <div data-public-record-state="hidden">
        <SofascoreCard
          as="div"
          title={isPreview ? "Así ven los demás tu récord" : "Récord privado"}
          meta={<span className="pl-pill">Privado</span>}
        >
          <p className="pl-rec-hint [text-wrap:pretty]">
            {isPreview
              ? `Con el interruptor principal apagado, nadie ve el récord ni los picks de @${handle} en su perfil.`
              : `@${handle} eligió mantener su récord en privado.`}
          </p>
        </SofascoreCard>
      </div>
    );
  }

  const statItems: Array<{
    key: string;
    label: string;
    value: string;
    sub: string;
    tone?: "pos" | "neg";
  }> = [];

  if (view.netUnits !== null) {
    statItems.push({
      key: "netUnits",
      label: "Saldo",
      value: formatSignedUnits(view.netUnits),
      sub: "En unidades",
      tone: view.netUnits > 0 ? "pos" : view.netUnits < 0 ? "neg" : undefined,
    });
  }
  if (view.wonLost !== null) {
    statItems.push({
      key: "wonLost",
      label: "Ganados y perdidos",
      value: `${view.wonLost.won}G – ${view.wonLost.lost}P`,
      sub: `${view.wonLost.settled} cerrados`,
    });
  }
  if (view.hitRatePct !== null) {
    statItems.push({
      key: "hitRate",
      label: "Acierto",
      value: `${view.hitRatePct.toFixed(1)} %`,
      sub: "Sobre cerrados",
    });
  }
  if (view.yieldPct !== null) {
    statItems.push({
      key: "yield",
      label: "Rendimiento",
      value: formatSignedPctValue(view.yieldPct),
      sub: "Sobre unidades jugadas",
      tone: view.yieldPct > 0 ? "pos" : view.yieldPct < 0 ? "neg" : undefined,
    });
  }
  if (view.roiPct !== null) {
    statItems.push({
      key: "roi",
      label: "Retorno sobre banca",
      value: formatSignedPctValue(view.roiPct),
      sub: "En unidades (sin pesos)",
      tone: view.roiPct > 0 ? "pos" : view.roiPct < 0 ? "neg" : undefined,
    });
  }
  if (view.avgClvPct !== null) {
    statItems.push({
      key: "clv",
      label: "Ventaja promedio",
      value: formatSignedPctValue(view.avgClvPct),
      sub: "CLV contra momio justo",
      tone: view.avgClvPct > 0 ? "pos" : view.avgClvPct < 0 ? "neg" : undefined,
    });
  }
  if (view.avgOddsDecimal !== null) {
    statItems.push({
      key: "avgOdds",
      label: "Momio promedio",
      value: formatOddsValue(view.avgOddsDecimal, oddsFormat),
      sub: "Picks cerrados",
    });
  }
  if (view.streaks !== null) {
    const cur = view.streaks.current;
    const curLabel =
      cur.kind === "won"
        ? `${cur.length}G seguidos`
        : cur.kind === "lost"
          ? `${cur.length}P seguidos`
          : "—";
    statItems.push({
      key: "streaks",
      label: "Racha",
      value: curLabel,
      sub: `Mejor racha: ${view.streaks.bestWin}G`,
      tone: cur.kind === "won" ? "pos" : cur.kind === "lost" ? "neg" : undefined,
    });
  }

  const hasMonths = Boolean(view.months && (view.months.best || view.months.worst));
  const hasAnyBlock = summaryOnly
    ? statItems.length > 0
    : statItems.length > 0 ||
      (view.curve && view.curve.length > 0) ||
      (view.byLeague && view.byLeague.length > 0) ||
      (view.byMarket && view.byMarket.length > 0) ||
      hasMonths ||
      (view.settledPicks && view.settledPicks.length > 0);

  return (
    <div data-public-record-state="visible">
      <SofascoreCard
        as="div"
        title={isPreview ? "Así ven los demás tu récord" : `Récord público de @${handle}`}
        meta={<span className="pl-pill pl-pill--success">Público</span>}
      >
        <div className="space-y-3.5">
          <p className="pl-rec-card-meta">
            @{handle} · {settled} {settled === 1 ? "pick cerrado" : "picks cerrados"} · cero montos
            en pesos
          </p>

          {!hasAnyBlock ? (
            <p className="pl-rec-hint [text-wrap:pretty]">
              {settled === 0
                ? "Todavía no hay picks cerrados para mostrar."
                : isPreview
                  ? "Apagaste todos los datos individuales: tu perfil se ve activo, pero sin cifras del récord."
                  : `@${handle} mantiene estas cifras en privado.`}
            </p>
          ) : null}

          {statItems.length > 0 ? (
            <dl className="pl-rec-pub-grid num">
              {statItems.map((item) => (
                <div key={item.key} className="pl-rec-pub-stat">
                  <dt className="pl-rec-pub-dt">{item.label}</dt>
                  <dd
                    className={[
                      "pl-rec-pub-dd",
                      item.tone === "pos"
                        ? "pl-rec-pos"
                        : item.tone === "neg"
                          ? "pl-rec-neg"
                          : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {item.value}
                  </dd>
                  <dd className="pl-rec-pub-sub">{item.sub}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {!summaryOnly && hasMonths && view.months ? (
            <div className="pl-rec-metric-pair num">
              {view.months.best ? (
                <div className="pl-rec-pub-stat">
                  <span className="pl-rec-pub-dt">Mejor mes</span>
                  <strong className="pl-rec-pub-dd pl-rec-pos">
                    {formatSignedUnits(view.months.best.netUnits)}
                  </strong>
                  <span className="pl-rec-pub-sub">{view.months.best.label}</span>
                </div>
              ) : null}
              {view.months.worst ? (
                <div className="pl-rec-pub-stat">
                  <span className="pl-rec-pub-dt">Peor mes</span>
                  <strong
                    className={`pl-rec-pub-dd ${view.months.worst.netUnits >= 0 ? "pl-rec-pos" : "pl-rec-neg"}`}
                  >
                    {formatSignedUnits(view.months.worst.netUnits)}
                  </strong>
                  <span className="pl-rec-pub-sub">{view.months.worst.label}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {!summaryOnly && view.curve && view.curve.length > 0 ? (
            <div className="space-y-2">
              <h3 className="m-0 text-xs font-bold" style={{ color: "var(--pl-text-secondary)" }}>
                Curva de saldo (unidades)
              </h3>
              <BalanceCurveFigure curve={view.curve} compact />
            </div>
          ) : null}

          {!summaryOnly && view.byLeague && view.byLeague.length > 0 ? (
            <div className="space-y-2">
              <h3 className="m-0 text-xs font-bold" style={{ color: "var(--pl-text-secondary)" }}>
                Acierto por liga
              </h3>
              <RateBreakdownList
                rows={view.byLeague.slice(0, 4)}
                showNetUnits={view.netUnits !== null}
              />
            </div>
          ) : null}

          {!summaryOnly && view.byMarket && view.byMarket.length > 0 ? (
            <div className="space-y-2">
              <h3 className="m-0 text-xs font-bold" style={{ color: "var(--pl-text-secondary)" }}>
                Acierto por mercado
              </h3>
              <RateBreakdownList
                rows={view.byMarket.slice(0, 4)}
                showNetUnits={view.netUnits !== null}
              />
            </div>
          ) : null}

          {!summaryOnly && view.settledPicks && view.settledPicks.length > 0 ? (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="m-0 text-xs font-bold" style={{ color: "var(--pl-text-secondary)" }}>
                  Últimos picks cerrados ({view.settledPicks.length})
                </h3>
                {!isPreview ? (
                  <div data-public-record-view-toggle="">
                    <SofascoreTabs
                      items={PUBLIC_VIEW_TABS}
                      value={picksViewMode}
                      onChange={(next) =>
                        setPicksViewMode(next === "calendar" ? "calendar" : "list")
                      }
                      variant="segmented"
                      ariaLabel="Vista de picks públicos"
                    />
                  </div>
                ) : null}
              </div>
              {!isPreview && picksViewMode === "calendar" ? (
                <DailyResultsCalendar
                  buildMonth={buildPublicCalendarMonth}
                  mode={showPublicUnits ? "units" : "counts"}
                />
              ) : (
                <ul className="pl-rec-pub-picks num" role="list">
                  {view.settledPicks.slice(0, isPreview ? 4 : 15).map((p, idx) => {
                    const statusMeta = getAuditStatusMeta(auditStatusFromJournal(p.status));
                    const family = classifyMarketFamily({ pickLabel: p.pickLabel });
                    return (
                      <li key={`${p.pickLabel}-${p.day ?? idx}-${idx}`} className="pl-rec-pub-pick">
                        <div className="min-w-0">
                          <strong className="block text-xs font-bold truncate">
                            {p.pickLabel}
                          </strong>
                          <span
                            className="block text-xs truncate"
                            style={{ color: "var(--pl-text-muted)" }}
                          >
                            {p.leagueLabel} · {family.shortLabel}
                            {p.day ? ` · ${formatShortIsoDay(p.day)}` : ""} · {p.units.toFixed(2)}u
                            {" · "}
                            {formatOddsValue(p.userDecimal, oddsFormat)}
                          </span>
                        </div>
                        <span
                          className={`${statusMeta.pillClass} shrink-0`}
                          data-audit-status={statusMeta.status}
                        >
                          <MaestroIcon name={statusMeta.icon} size={11} />
                          <span>{statusMeta.label}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </SofascoreCard>
    </div>
  );
}
