"use client";

/**
 * Gráficas del Match Center en vivo (skill `dataviz`):
 * - Momentum: polaridad (local arriba, visita abajo) con la pareja local/visita validada
 *   (violeta/rosa de la marca: ΔE CVD 15.4 en oscuro, 18.4 en claro). Área como lavado + línea 2 px,
 *   cero en gris, retícula de pelo, cruz que sigue al puntero y al teclado, goles como marcas de 8 px
 *   con anillo de superficie y tabla equivalente.
 * - xG acumulado: dos líneas escalonadas de 2 px con etiqueta al final (una sola escala).
 * - Barras pareadas de estadísticas: crecen desde el centro, valor en la punta, texto en tinta.
 */
import React, { useId, useMemo, useState } from "react";
import type { LiveIncident, LiveMomentumPoint, LiveTeamStats, LiveXgPoint } from "@pitchlab/contracts";
import {
  AtomicStatComparisonBar,
  computeStatBarWidths,
  type StatBarWidths,
} from "../atomic/AtomicStatComparisonBar";
import { SportEventIcon } from "../components/SportEventIcons";

export { computeStatBarWidths, type StatBarWidths };

const W = 640;
const H = 168;
const PAD_X = 8;
const PAD_Y = 16;

function xScale(maxMinute: number) {
  return (m: number) => PAD_X + (Math.min(m, maxMinute) / maxMinute) * (W - PAD_X * 2);
}

function formatMinute(m: number): string {
  if (m === 45.5) return "MT";
  if (m === 90.5) return "Final";
  return `${Math.round(m)}'`;
}

export interface MomentumChartProps {
  momentum: readonly LiveMomentumPoint[];
  goals: readonly LiveIncident[];
  homeLabel: string;
  awayLabel: string;
  homeCrest?: React.ReactNode;
  awayCrest?: React.ReactNode;
  liveMinute?: number | null;
}

/** Curva de momentum: quién empuja minuto a minuto (−100 visita · +100 local). */
export function MomentumChart({
  momentum,
  goals,
  homeLabel,
  awayLabel,
  homeCrest,
  awayCrest,
  liveMinute = null,
}: MomentumChartProps): React.JSX.Element {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const maxMinute = Math.max(90, ...momentum.map((p) => p.minute));
  const x = xScale(maxMinute);
  const mid = H / 2;
  const amp = mid - PAD_Y;
  const y = (v: number) => mid - (v / 100) * amp;

  const { line, area } = useMemo(() => {
    if (momentum.length === 0) return { line: "", area: "" };
    const pts = momentum.map((p) => `${x(p.minute).toFixed(1)},${y(p.value).toFixed(1)}`);
    const first = x(momentum[0]!.minute).toFixed(1);
    const last = x(momentum[momentum.length - 1]!.minute).toFixed(1);
    return {
      line: `M${pts.join(" L")}`,
      area: `M${first},${mid} L${pts.join(" L")} L${last},${mid} Z`,
    };
    // `x` y `y` dependen solo de maxMinute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [momentum, maxMinute]);

  const active = hover === null ? null : momentum[hover];
  const goalMarks = goals.filter((g) => g.minute !== null && g.side !== null);

  const pick = (clientX: number, rect: DOMRect) => {
    if (momentum.length === 0) return;
    const minute = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < momentum.length; i++) {
      if (Math.abs(x(momentum[i]!.minute) - minute) < Math.abs(x(momentum[best]!.minute) - minute)) best = i;
    }
    setHover(best);
  };

  const describe = (p: LiveMomentumPoint) =>
    p.value === 0 ? "Parejo" : `Empuja ${p.value > 0 ? homeLabel : awayLabel} · ${Math.abs(Math.round(p.value))}`;

  return (
    <figure className="pl-live-chart" aria-labelledby={`${uid}-t`}>
      <figcaption className="pl-live-chart-head">
        <span id={`${uid}-t`} className="pl-live-chart-title">
          Momentum
        </span>
        <span className="pl-live-legend" aria-hidden="true">
          <span className="pl-live-key pl-live-key--home" />
          {homeLabel}
          <span className="pl-live-key pl-live-key--away" />
          {awayLabel}
        </span>
      </figcaption>
      {momentum.length === 0 ? (
        <p className="pl-live-empty">La curva aparece cuando ruede el balón.</p>
      ) : (
        <div className={`pl-live-momentum-shell${homeCrest || awayCrest ? " has-crests" : ""}`}>
          {homeCrest || awayCrest ? (
            <div className="pl-live-momentum-crests" aria-hidden="true">
              <span className="pl-live-momentum-crest">{homeCrest}</span>
              <span className="pl-live-momentum-crest">{awayCrest}</span>
            </div>
          ) : null}
          <div
            className="pl-live-plot pl-live-plot--momentum"
            role="slider"
            tabIndex={0}
            aria-label="Momentum por minuto; usa las flechas para recorrerlo"
            aria-valuemin={0}
            aria-valuemax={maxMinute}
            aria-valuenow={active ? Math.round(active.minute) : 0}
            aria-valuetext={active ? `${formatMinute(active.minute)}: ${describe(active)}` : "Sin minuto elegido"}
            onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
              e.preventDefault();
              const lastIdx = momentum.length - 1;
              setHover((h) => {
                if (e.key === "Home") return 0;
                if (e.key === "End") return lastIdx;
                const from = h ?? lastIdx;
                return Math.max(0, Math.min(lastIdx, from + (e.key === "ArrowRight" ? 1 : -1)));
              });
            }}
          >
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <clipPath id={`${uid}-up`}>
                  <rect x="0" y="0" width={W} height={mid} />
                </clipPath>
                <clipPath id={`${uid}-down`}>
                  <rect x="0" y={mid} width={W} height={mid} />
                </clipPath>
              </defs>
              {/* Bandas de fondo suaves estilo Sofascore: local arriba, visita abajo */}
              <rect className="pl-live-band pl-live-band--home" x={PAD_X} y={PAD_Y / 2} width={W - PAD_X * 2} height={mid - PAD_Y / 2} />
              <rect className="pl-live-band pl-live-band--away" x={PAD_X} y={mid} width={W - PAD_X * 2} height={mid - PAD_Y / 2} />
              <path className="pl-live-area pl-live-area--home" d={area} clipPath={`url(#${uid}-up)`} />
              <path className="pl-live-area pl-live-area--away" d={area} clipPath={`url(#${uid}-down)`} />
              <path className="pl-live-line pl-live-line--home" d={line} clipPath={`url(#${uid}-up)`} />
              <path className="pl-live-line pl-live-line--away" d={line} clipPath={`url(#${uid}-down)`} />
              {/* Divisor limpio de medio tiempo (45') y eje central */}
              <line className="pl-live-ht-split" x1={x(45)} x2={x(45)} y1={PAD_Y / 2} y2={H - PAD_Y / 2} />
              <line className="pl-live-zero" x1={PAD_X} x2={W - PAD_X} y1={mid} y2={mid} />
              {liveMinute !== null && Number.isFinite(liveMinute) && liveMinute > 0 ? (
                <line
                  className="pl-live-now-line"
                  x1={x(liveMinute)}
                  x2={x(liveMinute)}
                  y1={PAD_Y / 2}
                  y2={H - PAD_Y / 2}
                />
              ) : null}
              {active ? (
                <line className="pl-live-crosshair" x1={x(active.minute)} x2={x(active.minute)} y1={0} y2={H} />
              ) : null}
            </svg>
            {/* Aguja superior del minuto actual en vivo (sin distorsión horizontal del SVG) */}
            {liveMinute !== null && Number.isFinite(liveMinute) && liveMinute > 0 ? (
              <span
                className="pl-live-now-dot"
                style={{ left: `${(x(liveMinute) / W) * 100}%` }}
                aria-hidden="true"
              />
            ) : null}
            {/* Balones de gol: fuera del SVG estirado para mantener proporción circular exacta */}
            {goalMarks.map((g, i) => (
              <span
                key={`${g.order}-${i}`}
                className={`pl-live-goal pl-live-goal--${g.side}`}
                style={{ left: `${(x(g.minute ?? 0) / W) * 100}%` }}
                title={`Gol ${g.side === "home" ? homeLabel : awayLabel} · ${g.minute}'${g.player ? ` · ${g.player}` : ""}`}
                aria-hidden="true"
              >
                <SportEventIcon kind={g.kind} size={14} />
              </span>
            ))}
            {active ? (
              <div
                className="pl-live-tooltip"
                style={{ left: `${Math.min(82, Math.max(18, (x(active.minute) / W) * 100))}%` }}
                aria-hidden="true"
              >
                <strong className="num">{Math.abs(Math.round(active.value))}</strong>
                <span>
                  {formatMinute(active.minute)} · {active.value >= 0 ? homeLabel : awayLabel}
                </span>
              </div>
            ) : null}
            <div className="pl-live-axis num" aria-hidden="true">
              <span>0'</span>
              <span>MT</span>
              <span>{maxMinute > 90.5 ? `${Math.round(maxMinute)}'` : "90'"}</span>
            </div>
          </div>
        </div>
      )}
      {momentum.length > 0 ? (
        <details className="pl-live-table">
          <summary>Ver como tabla</summary>
          <div
            className="pl-live-table-scroll"
            role="region"
            tabIndex={0}
            aria-labelledby={`${uid}-tbl-cap`}
          >
            <table>
              <caption id={`${uid}-tbl-cap`} className="sr-only">
                Momentum cada 5 minutos
              </caption>
              <thead>
                <tr>
                  <th scope="col">Minuto</th>
                  <th scope="col">Quién empuja</th>
                  <th scope="col" className="num">Intensidad</th>
                </tr>
              </thead>
              <tbody>
                {momentum
                  .filter((p, i) => i === momentum.length - 1 || Math.round(p.minute) % 5 === 0)
                  .map((p) => (
                    <tr key={p.minute}>
                      <th scope="row" className="num">{formatMinute(p.minute)}</th>
                      <td>{p.value === 0 ? "Parejo" : p.value > 0 ? homeLabel : awayLabel}</td>
                      <td className="num">{Math.abs(Math.round(p.value))}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </figure>
  );
}

export interface XgRaceChartProps {
  points: readonly LiveXgPoint[];
  homeLabel: string;
  awayLabel: string;
  estimated: boolean | null;
}

/** xG acumulado de ambos equipos: escalones que suben con cada tiro. */
export function XgRaceChart({ points, homeLabel, awayLabel, estimated }: XgRaceChartProps): React.JSX.Element | null {
  const uid = useId().replace(/:/g, "");
  if (points.length === 0) return null;
  const maxMinute = Math.max(90, ...points.map((p) => p.minute));
  const x = xScale(maxMinute);
  const top = Math.max(1, Math.ceil(Math.max(...points.map((p) => Math.max(p.home, p.away))) * 2) / 2);
  const h = 120;
  const y = (v: number) => h - 10 - (v / top) * (h - 24);
  const step = (side: "home" | "away") => {
    let d = `M${x(0)},${y(0)}`;
    let prev = 0;
    for (const p of points) {
      d += ` L${x(p.minute).toFixed(1)},${y(prev).toFixed(1)} L${x(p.minute).toFixed(1)},${y(p[side]).toFixed(1)}`;
      prev = p[side];
    }
    // La línea termina en el último minuto leído: en vivo no se inventa el resto del partido.
    return `${d} L${x(points[points.length - 1]!.minute).toFixed(1)},${y(prev).toFixed(1)}`;
  };
  const last = points[points.length - 1]!;
  return (
    <figure className="pl-live-chart" aria-labelledby={`${uid}-t`}>
      <figcaption className="pl-live-chart-head">
        <span id={`${uid}-t`} className="pl-live-chart-title">
          xG acumulado{estimated ? " (estimado)" : ""}
        </span>
        <span className="pl-live-legend">
          <span className="pl-live-key pl-live-key--home" aria-hidden="true" />
          {homeLabel} <strong className="num">{last.home.toFixed(2)}</strong>
          <span className="pl-live-key pl-live-key--away" aria-hidden="true" />
          {awayLabel} <strong className="num">{last.away.toFixed(2)}</strong>
        </span>
      </figcaption>
      <div className="pl-live-plot pl-live-plot--short">
        <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" role="img" aria-label={`xG acumulado: ${homeLabel} ${last.home.toFixed(2)}, ${awayLabel} ${last.away.toFixed(2)} al minuto ${Math.round(last.minute)}`}>
          <line className="pl-live-grid" x1={PAD_X} x2={W - PAD_X} y1={y(top)} y2={y(top)} />
          <line className="pl-live-zero" x1={PAD_X} x2={W - PAD_X} y1={y(0)} y2={y(0)} />
          <path className="pl-live-line pl-live-line--home" d={step("home")} />
          <path className="pl-live-line pl-live-line--away" d={step("away")} />
        </svg>
        <div className="pl-live-axis" aria-hidden="true">
          <span>0'</span>
          <span>escala hasta {top.toFixed(1)} xG</span>
          <span>90'</span>
        </div>
      </div>
    </figure>
  );
}

type StatKey = keyof LiveTeamStats;

const STAT_ROWS: { key: StatKey; label: string; digits?: number; pct?: boolean; signed?: boolean }[] = [
  { key: "possessionPct", label: "Posesión", pct: true },
  { key: "xg", label: "xG", digits: 2 },
  { key: "goalsPrevented", label: "Goles evitados", digits: 2, signed: true },
  { key: "shots", label: "Tiros" },
  { key: "shotsOnTarget", label: "A puerta" },
  { key: "touchesInBox", label: "Toques en área" },
  { key: "bigChances", label: "Ocasiones claras" },
  { key: "passAccuracyPct", label: "Pases precisos", pct: true },
  { key: "corners", label: "Córners" },
  { key: "fouls", label: "Faltas" },
  { key: "yellowCards", label: "Amarillas" },
  { key: "redCards", label: "Rojas" },
];

/** Barras pareadas planas estilo Sofascore con soporte real a métricas negativas. */
export function LiveStatBars({
  stats,
  homeLabel,
  awayLabel,
}: {
  stats: { home: LiveTeamStats; away: LiveTeamStats };
  homeLabel: string;
  awayLabel: string;
}): React.JSX.Element {
  const rows = STAT_ROWS.filter((r) => {
    const h = stats.home[r.key];
    const a = stats.away[r.key];
    if (h == null && a == null) return false;
    // Al arrancar, la fuente reporta 0 % / 100 % de posesión: es ruido, no un dato.
    if (r.pct && (!h || !a)) return false;
    return true;
  });
  if (rows.length === 0) return <></>;
  return (
    <section className="pl-live-stats" aria-label="Estadísticas del partido">
      <div className="pl-live-stats-head" aria-hidden="true">
        <span>
          <span className="pl-live-key pl-live-key--home" /> {homeLabel}
        </span>
        <span>
          {awayLabel} <span className="pl-live-key pl-live-key--away" />
        </span>
      </div>
      <dl className="pl-live-stat-list">
        {rows.map((r) => (
          <AtomicStatComparisonBar
            key={r.key}
            label={r.label}
            homeValue={stats.home[r.key]}
            awayValue={stats.away[r.key]}
            homeLabel={homeLabel}
            awayLabel={awayLabel}
            pct={r.pct}
            signed={r.signed}
            digits={r.digits}
            asDefinitionItem
          />
        ))}
      </dl>
    </section>
  );
}
