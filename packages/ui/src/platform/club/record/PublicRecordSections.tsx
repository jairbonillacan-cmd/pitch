"use client";

import React, { useId } from "react";
import { formatOddsValue } from "../../access-guard";
import type {
  CurvePoint,
  PublicRecordView,
  RateRow,
} from "../../record-stats";
import type { OddsFormat } from "../../types";
import { PickStatus, outcomeOf } from "../community-ui";

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

/**
 * Gráfica SVG accesible de la curva de saldo en unidades con tabla equivalente para lectores de pantalla.
 */
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
  const gradId = `${uid}-curve-grad`;

  if (curve.length === 0) {
    return (
      <p className="pl-rec-hint">
        Cuando se liquide tu primer pick aparecerá aquí tu curva de saldo día por día.
      </p>
    );
  }

  const base = startingUnits ?? 0;
  const points: CurvePoint[] =
    curve.length === 1
      ? [{ day: curve[0]!.day, balance: base }, curve[0]!]
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

  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`)
    .join(" ");
  const baselineY = Math.round(yOf(base) * 10) / 10;
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
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
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeVar} stopOpacity="0.28" />
            <stop offset="100%" stopColor={strokeVar} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        <line
          x1={left}
          y1={baselineY}
          x2={right}
          y2={baselineY}
          stroke="var(--pl-border-strong)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        <path d={areaPath} fill={`url(#${gradId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={strokeVar}
          strokeWidth="2.6"
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

        <text
          x={left}
          y={height - 4}
          fill="var(--pl-text-muted)"
          fontSize="11"
        >
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

/**
 * Barras horizontales accesibles para acierto por liga, mercado o tipo de pick.
 */
export function RateBreakdownList({
  rows,
  emptyText = "Sin picks cerrados todavía.",
  showNetUnits = true,
}: {
  rows: readonly RateRow[];
  emptyText?: string;
  showNetUnits?: boolean;
}): React.JSX.Element {
  if (rows.length === 0) {
    return <p className="pl-rec-hint">{emptyText}</p>;
  }
  return (
    <ul className="pl-rec-bars">
      {rows.map((row) => {
        const pct = row.total > 0 ? Math.round((row.won / row.total) * 1000) / 10 : 0;
        return (
          <li key={row.key} className="pl-rec-bar-item">
            <div className="pl-rec-bar-top num">
              <span className="pl-rec-bar-label">{row.label}</span>
              <span className="pl-rec-bar-nums">
                <strong>{pct.toFixed(1)} %</strong> · {row.won} de {row.total}
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
                style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Resumen y secciones del récord público filtrado por `PublicRecordView`.
 * Se usa tanto en la vista previa en vivo de «Privacidad» como en el perfil público de otro socio.
 */
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
  if (hidden || !view) {
    return (
      <div className="pl-rec-card glass-lens glass-ring" data-public-record-state="hidden">
        <div className="pl-rec-card-head">
          <h3 className="pl-rec-card-title">
            {isPreview ? "Así ven los demás tu récord" : "Récord privado"}
          </h3>
          <span className="pl-pill">Privado</span>
        </div>
        <p className="pl-rec-hint">
          {isPreview
            ? `Con el interruptor principal apagado, nadie ve el récord ni los picks de @${handle} en su perfil.`
            : `@${handle} eligió mantener su récord en privado.`}
        </p>
      </div>
    );
  }

  const statItems: Array<{ key: string; label: string; value: string; sub: string; tone?: "pos" | "neg" }> = [];

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
      label: "ROI sobre banca",
      value: formatSignedPctValue(view.roiPct),
      sub: "En unidades (sin pesos)",
      tone: view.roiPct > 0 ? "pos" : view.roiPct < 0 ? "neg" : undefined,
    });
  }
  if (view.avgClvPct !== null) {
    statItems.push({
      key: "clv",
      label: "CLV promedio",
      value: formatSignedPctValue(view.avgClvPct),
      sub: "Contra momio justo",
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
    <div className="pl-rec-card glass-lens glass-ring" data-public-record-state="visible">
      <div className="pl-rec-card-head">
        <div>
          <h3 className="pl-rec-card-title">
            {isPreview ? "Así ven los demás tu récord" : `Récord público de @${handle}`}
          </h3>
          <p className="pl-rec-card-meta">
            @{handle} · {settled} {settled === 1 ? "pick cerrado" : "picks cerrados"} · cero montos en pesos
          </p>
        </div>
        <span className="pl-pill pl-pill--success">Público</span>
      </div>

      {!hasAnyBlock ? (
        <p className="pl-rec-hint">
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
                  item.tone === "pos" ? "pl-rec-pos" : item.tone === "neg" ? "pl-rec-neg" : "",
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
          <h4 className="m-0 text-xs font-bold" style={{ color: "var(--pl-text-secondary)" }}>
            Curva de saldo (unidades)
          </h4>
          <BalanceCurveFigure curve={view.curve} compact />
        </div>
      ) : null}

      {!summaryOnly && view.byLeague && view.byLeague.length > 0 ? (
        <div className="space-y-2">
          <h4 className="m-0 text-xs font-bold" style={{ color: "var(--pl-text-secondary)" }}>
            Acierto por liga
          </h4>
          <RateBreakdownList rows={view.byLeague.slice(0, 4)} showNetUnits={view.netUnits !== null} />
        </div>
      ) : null}

      {!summaryOnly && view.byMarket && view.byMarket.length > 0 ? (
        <div className="space-y-2">
          <h4 className="m-0 text-xs font-bold" style={{ color: "var(--pl-text-secondary)" }}>
            Acierto por mercado
          </h4>
          <RateBreakdownList rows={view.byMarket.slice(0, 4)} showNetUnits={view.netUnits !== null} />
        </div>
      ) : null}

      {!summaryOnly && view.settledPicks && view.settledPicks.length > 0 ? (
        <div className="space-y-2">
          <h4 className="m-0 text-xs font-bold" style={{ color: "var(--pl-text-secondary)" }}>
            Últimos picks cerrados ({view.settledPicks.length})
          </h4>
          <ul className="pl-rec-pub-picks num">
            {view.settledPicks.slice(0, isPreview ? 4 : 15).map((p, idx) => (
              <li key={`${p.pickLabel}-${p.day ?? idx}-${idx}`} className="pl-rec-pub-pick">
                <div className="min-w-0">
                  <strong className="block text-xs font-bold truncate">{p.pickLabel}</strong>
                  <span className="block text-xs truncate" style={{ color: "var(--pl-text-muted)" }}>
                    {p.leagueLabel}
                    {p.day ? ` · ${formatShortIsoDay(p.day)}` : ""} · {p.units.toFixed(2)}u ·{" "}
                    {formatOddsValue(p.userDecimal, oddsFormat)}
                  </span>
                </div>
                <PickStatus status={outcomeOf(p.status)} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
