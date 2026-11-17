"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { MaestroIcon } from "./MaestroPrimitives";
import { TopLayerModalDialog } from "./PlatformOverlays";
import {
  shiftYearMonth,
  type DailyCalendarCell,
  type MonthlyCalendarGrid,
} from "../record-stats";

const WEEKDAYS_ES = [
  { short: "lun", full: "Lunes" },
  { short: "mar", full: "Martes" },
  { short: "mié", full: "Miércoles" },
  { short: "jue", full: "Jueves" },
  { short: "vie", full: "Viernes" },
  { short: "sáb", full: "Sábado" },
  { short: "dom", full: "Domingo" },
] as const;

function formatCompactSignedUnits(u: number): string {
  if (Object.is(u, -0) || Math.abs(u) < 0.005) return "0.0u";
  const abs = Math.abs(u);
  const decimals = Number.isInteger(Math.round(abs * 10) / 10) ? 1 : 1;
  return u > 0 ? `+${abs.toFixed(decimals)}u` : `−${abs.toFixed(decimals)}u`;
}

function formatDayHeadingEs(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateIso;
  const raw = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

type Direction = "left" | "right" | "up" | "down";

function findSpatialNeighbor(
  origin: HTMLElement,
  candidates: readonly HTMLElement[],
  dir: Direction,
): HTMLElement | null {
  const r0 = origin.getBoundingClientRect();
  // En entornos JSDOM sin layout real (width=0, height=0), caer al índice lineal +/-1 o +/-7
  if (r0.width === 0 && r0.height === 0) {
    const idx = candidates.indexOf(origin);
    if (idx < 0) return null;
    const step = dir === "left" ? -1 : dir === "right" ? 1 : dir === "up" ? -7 : 7;
    return candidates[idx + step] ?? null;
  }

  const cx0 = r0.left + r0.width / 2;
  const cy0 = r0.top + r0.height / 2;
  let best: HTMLElement | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const el of candidates) {
    if (el === origin) continue;
    const visible =
      typeof el.checkVisibility === "function"
        ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        : true;
    if (!visible) continue;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = cx - cx0;
    const dy = cy - cy0;

    if (dir === "left" && dx >= -4) continue;
    if (dir === "right" && dx <= 4) continue;
    if (dir === "up" && dy >= -4) continue;
    if (dir === "down" && dy <= 4) continue;

    const primary = dir === "left" || dir === "right" ? Math.abs(dx) : Math.abs(dy);
    const cross = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
    const score = primary + cross * 2.5;
    if (score < bestDist) {
      bestDist = score;
      best = el;
    }
  }
  return best;
}

export interface DailyResultsCalendarProps {
  /** Función que construye la cuadrícula para el mes `YYYY-MM` solicitado. */
  readonly buildMonth: (yearMonth: string) => MonthlyCalendarGrid;
  /** Mes inicial `YYYY-MM` (por defecto el mes con actividad más reciente o el actual). */
  readonly initialYearMonth?: string;
  /** Mes actual de referencia `YYYY-MM` para el botón «Hoy». */
  readonly todayYearMonth?: string;
  /** Fecha actual `YYYY-MM-DD` para centrar al pulsar «Hoy». */
  readonly todayDateIso?: string;
  /** `"units"` muestra saldo en unidades (`+2.4u`); `"counts"` muestra solo ganados/perdidos (`2G–0P`); `"model"` muestra cumplidos del motor (`4/5`). */
  readonly mode?: "units" | "counts" | "model";
  readonly onNavigateItem?: (href: string) => void;
}

export function DailyResultsCalendar({
  buildMonth,
  initialYearMonth,
  todayYearMonth,
  todayDateIso,
  mode = "units",
  onNavigateItem,
}: DailyResultsCalendarProps): React.JSX.Element {
  const initialGrid = useMemo(
    () => buildMonth(initialYearMonth ?? ""),
    [buildMonth, initialYearMonth],
  );
  const [yearMonth, setYearMonth] = useState<string>(initialGrid.yearMonth);
  const grid = useMemo(() => buildMonth(yearMonth), [buildMonth, yearMonth]);

  const flatCells = useMemo(() => grid.weeks.flat(), [grid.weeks]);
  const defaultFocusIso = useMemo(() => {
    const todayInMonth = flatCells.find((c) => c.inMonth && c.isToday);
    if (todayInMonth) return todayInMonth.dateIso;
    const withItems = flatCells.find((c) => c.inMonth && c.items.length > 0);
    if (withItems) return withItems.dateIso;
    return flatCells.find((c) => c.inMonth)?.dateIso ?? flatCells[0]?.dateIso ?? "";
  }, [flatCells]);

  const [focusedIso, setFocusedIso] = useState<string>(defaultFocusIso);
  const [selectedIso, setSelectedIso] = useState<string | null>(() => {
    const active = flatCells.find((c) => c.inMonth && c.items.length > 0);
    return active?.dateIso ?? null;
  });
  const [mobileSheetOpen, setMobileSheetOpen] = useState<boolean>(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();

  useEffect(() => {
    setFocusedIso(defaultFocusIso);
  }, [defaultFocusIso]);

  const selectedCell: DailyCalendarCell | null = useMemo(
    () => (selectedIso ? flatCells.find((c) => c.dateIso === selectedIso) ?? null : null),
    [flatCells, selectedIso],
  );

  const handleSelectCell = useCallback((cell: DailyCalendarCell) => {
    setFocusedIso(cell.dateIso);
    setSelectedIso(cell.dateIso);
    if (cell.items.length > 0 && typeof window !== "undefined" && window.innerWidth < 768) {
      setMobileSheetOpen(true);
    }
  }, []);

  const handleJumpToday = () => {
    const targetYm = todayYearMonth ?? new Date().toISOString().slice(0, 7);
    setYearMonth(targetYm);
    if (todayDateIso) {
      setFocusedIso(todayDateIso);
      setSelectedIso(todayDateIso);
    }
  };

  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keyMap: Partial<Record<string, Direction>> = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
    };
    const dir = keyMap[e.key];
    if (!dir && e.key !== "Home" && e.key !== "End") return;
    const container = gridRef.current;
    if (!container) return;
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button[data-cal-cell]"),
    );
    if (buttons.length === 0) return;

    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const inMonthBtns = buttons.filter((b) => b.dataset.calInMonth === "true");
      const target = e.key === "Home" ? inMonthBtns[0] : inMonthBtns[inMonthBtns.length - 1];
      if (target?.dataset.calCell) {
        setFocusedIso(target.dataset.calCell);
        target.focus();
      }
      return;
    }

    const origin =
      (document.activeElement instanceof HTMLButtonElement &&
      container.contains(document.activeElement)
        ? document.activeElement
        : buttons.find((b) => b.dataset.calCell === focusedIso)) ?? buttons[0]!;

    const next = findSpatialNeighbor(origin, buttons, dir!);
    if (next?.dataset.calCell) {
      e.preventDefault();
      setFocusedIso(next.dataset.calCell);
      next.focus();
    }
  };

  const renderDayItemsList = (cell: DailyCalendarCell) => (
    <div className="space-y-2.5" data-cal-day-detail={cell.dateIso}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="m-0 text-sm font-extrabold">{formatDayHeadingEs(cell.dateIso)}</h4>
          <p className="m-0 text-xs num" style={{ color: "var(--pl-text-muted)" }}>
            {mode === "model"
              ? `${cell.wonCount} cumplidos de ${cell.settledCount} calificados`
              : `${cell.wonCount}G – ${cell.lostCount}P${cell.openCount > 0 ? ` · ${cell.openCount} ${cell.openCount === 1 ? "abierto" : "abiertos"}` : ""}`}
          </p>
        </div>
        {mode === "units" && cell.settledCount > 0 ? (
          <strong
            className={`num text-sm font-extrabold ${
              cell.netUnits > 0 ? "pl-rec-pos" : cell.netUnits < 0 ? "pl-rec-neg" : ""
            }`}
          >
            {formatCompactSignedUnits(cell.netUnits)}
          </strong>
        ) : null}
      </div>

      {cell.items.length === 0 ? (
        <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
          Sin actividad registrada en esta fecha.
        </p>
      ) : (
        <ul className="m-0 p-0 list-none space-y-1.5">
          {cell.items.map((item) => {
            const badgeTone =
              item.status === "won"
                ? "pl-pill--success"
                : item.status === "lost"
                  ? "pl-pill--danger"
                  : "pl-pill--info";
            const badgeText =
              item.status === "won"
                ? mode === "units" && item.netUnits !== null
                  ? formatCompactSignedUnits(item.netUnits)
                  : "Cumplido"
                : item.status === "lost"
                  ? mode === "units" && item.netUnits !== null
                    ? formatCompactSignedUnits(item.netUnits)
                    : "No cumplido"
                  : "Abierto";
            const inner = (
              <>
                <div className="min-w-0">
                  <strong className="block text-xs font-bold truncate">{item.label}</strong>
                  <span
                    className="block text-[11px] truncate"
                    style={{ color: "var(--pl-text-muted)" }}
                  >
                    {item.subtitle}
                  </span>
                </div>
                <span className={`pl-pill text-[11px] num shrink-0 ${badgeTone}`}>
                  {badgeText}
                </span>
              </>
            );
            return (
              <li key={item.id}>
                {item.href ? (
                  <a
                    href={item.href}
                    className="pl-cal-detail-item"
                    onClick={(e) => {
                      if (!onNavigateItem) return;
                      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                        return;
                      }
                      e.preventDefault();
                      onNavigateItem(item.href!);
                    }}
                  >
                    {inner}
                  </a>
                ) : (
                  <div className="pl-cal-detail-item">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const monthHitPct =
    grid.summary.settledCount > 0
      ? Math.round((grid.summary.wonCount / grid.summary.settledCount) * 1000) / 10
      : null;

  return (
    <div className="pl-cal-root space-y-3" data-daily-results-calendar="">
      {/* Cabecera de mes + navegación + Hoy */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            className="pl-btn-glass min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl"
            aria-label="Mes anterior"
            data-cal-prev=""
            onClick={() => setYearMonth((ym) => shiftYearMonth(ym, -1))}
          >
            <MaestroIcon name="chevronLeft" size={16} />
          </button>
          <h3 id={headingId} className="m-0 px-2 text-base font-extrabold num">
            {grid.monthLabel}
          </h3>
          <button
            type="button"
            className="pl-btn-glass min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl"
            aria-label="Mes siguiente"
            data-cal-next=""
            onClick={() => setYearMonth((ym) => shiftYearMonth(ym, 1))}
          >
            <MaestroIcon name="chevronRight" size={16} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="pl-cal-summary num text-xs">
            {mode === "units" ? (
              <>
                <span style={{ color: "var(--pl-text-muted)" }}>Saldo del mes:</span>{" "}
                <strong
                  className={
                    grid.summary.netUnits > 0
                      ? "pl-rec-pos"
                      : grid.summary.netUnits < 0
                        ? "pl-rec-neg"
                        : ""
                  }
                >
                  {formatCompactSignedUnits(grid.summary.netUnits)}
                </strong>
                <span style={{ color: "var(--pl-text-muted)" }}>
                  {" "}
                  · {grid.summary.wonCount}G–{grid.summary.lostCount}P
                </span>
              </>
            ) : mode === "model" ? (
              <>
                <span style={{ color: "var(--pl-text-muted)" }}>Cumplidos:</span>{" "}
                <strong>
                  {grid.summary.wonCount}/{grid.summary.settledCount}
                </strong>
                {monthHitPct !== null ? (
                  <span style={{ color: "var(--pl-text-muted)" }}> ({monthHitPct.toFixed(1)} %)</span>
                ) : null}
              </>
            ) : (
              <strong>
                {grid.summary.wonCount}G – {grid.summary.lostCount}P
              </strong>
            )}
          </div>

          <button
            type="button"
            className="pl-btn-glass min-h-11 px-3 text-xs font-bold rounded-xl"
            data-cal-today=""
            onClick={handleJumpToday}
          >
            Hoy
          </button>
        </div>
      </div>

      {/* Cuadrícula lun...dom con navegación espacial 2D */}
      <div
        ref={gridRef}
        role="grid"
        aria-labelledby={headingId}
        onKeyDown={handleGridKeyDown}
        className="pl-cal-grid-wrap"
      >
        <div role="row" className="pl-cal-weekdays">
          {WEEKDAYS_ES.map((wd) => (
            <div key={wd.short} role="columnheader" aria-label={wd.full} className="pl-cal-weekday">
              {wd.short}
            </div>
          ))}
        </div>

        {grid.weeks.map((week, wIdx) => (
          <div key={`wk-${wIdx}`} role="row" className="pl-cal-week">
            {week.map((cell) => {
              const hasSettled = cell.settledCount > 0;
              const isPos =
                mode === "units"
                  ? hasSettled && cell.netUnits > 0
                  : hasSettled && cell.wonCount > cell.lostCount;
              const isNeg =
                mode === "units"
                  ? hasSettled && cell.netUnits < 0
                  : hasSettled && cell.lostCount > cell.wonCount;
              const isSelected = selectedIso === cell.dateIso;
              const tone = isPos ? "pos" : isNeg ? "neg" : hasSettled ? "even" : "idle";

              const a11ySummary =
                cell.settledCount === 0 && cell.openCount === 0
                  ? `${cell.dateIso}, sin actividad`
                  : mode === "units"
                    ? `${cell.dateIso}, saldo ${formatCompactSignedUnits(cell.netUnits)}, ${cell.wonCount} ganados, ${cell.lostCount} perdidos${cell.openCount > 0 ? `, ${cell.openCount} abiertos` : ""}`
                    : `${cell.dateIso}, ${cell.wonCount} cumplidos de ${cell.settledCount}`;

              return (
                <div key={cell.dateIso} role="gridcell" className="pl-cal-cell-wrap">
                  <button
                    type="button"
                    data-cal-cell={cell.dateIso}
                    data-cal-in-month={cell.inMonth ? "true" : "false"}
                    data-cal-tone={tone}
                    tabIndex={cell.dateIso === focusedIso ? 0 : -1}
                    aria-current={cell.isToday ? "date" : undefined}
                    aria-pressed={isSelected}
                    aria-label={a11ySummary}
                    onClick={() => handleSelectCell(cell)}
                    className={[
                      "pl-cal-cell num",
                      !cell.inMonth ? "is-outside" : "",
                      cell.isToday ? "is-today" : "",
                      isSelected ? "is-selected" : "",
                      `pl-cal-cell--${tone}`,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {hasSettled && (isPos || isNeg) ? (
                      <span
                        className={`pl-cal-cell-bar ${isPos ? "is-pos" : "is-neg"}`}
                        aria-hidden="true"
                      />
                    ) : null}

                    <span className="pl-cal-day-row">
                      <span className="pl-cal-day-num">{cell.dayNumber}</span>
                      {cell.isToday ? <span className="pl-cal-today-dot" aria-hidden="true" /> : null}
                    </span>

                    {hasSettled ? (
                      <span className="pl-cal-metric">
                        <strong className="pl-cal-primary-val">
                          {mode === "units"
                            ? formatCompactSignedUnits(cell.netUnits)
                            : mode === "model"
                              ? `${cell.wonCount}/${cell.settledCount}`
                              : `${cell.wonCount}G–${cell.lostCount}P`}
                        </strong>
                        {mode === "units" ? (
                          <span className="pl-cal-sub-val">
                            {cell.wonCount}G–{cell.lostCount}P
                          </span>
                        ) : null}
                      </span>
                    ) : null}

                    {cell.openCount > 0 ? (
                      <span className="pl-cal-open-badge">
                        <span className="pl-cal-open-dot" aria-hidden="true" />
                        <span className="pl-cal-open-full">
                          {cell.openCount} {cell.openCount === 1 ? "abierto" : "abiertos"}
                        </span>
                        <span className="pl-cal-open-short" aria-hidden="true">
                          {cell.openCount} ab.
                        </span>
                      </span>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Desglose en línea en escritorio (>= 768px) */}
      {selectedCell ? (
        <div className="hidden md:block pl-cal-inline-detail">
          {renderDayItemsList(selectedCell)}
        </div>
      ) : null}

      {/* Desglose en hoja inferior nativa en móvil (< 768px) */}
      <TopLayerModalDialog
        open={mobileSheetOpen && Boolean(selectedCell)}
        onClose={() => setMobileSheetOpen(false)}
        ariaLabel="Detalle diario de resultados"
        variant="drawer"
      >
        {selectedCell ? (
          <div className="p-4 space-y-3" style={{ background: "var(--pl-surface)" }}>
            <div className="flex justify-end">
              <button
                type="button"
                className="pl-btn-glass min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl"
                aria-label="Cerrar detalle del día"
                onClick={() => setMobileSheetOpen(false)}
              >
                <MaestroIcon name="x" size={16} />
              </button>
            </div>
            {renderDayItemsList(selectedCell)}
          </div>
        ) : null}
      </TopLayerModalDialog>
    </div>
  );
}
