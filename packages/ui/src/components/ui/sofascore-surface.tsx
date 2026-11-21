"use client";

import React, { useId, useRef } from "react";
import { Button } from "./button";

function joinClasses(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ");
}

export interface SofascoreCardProps {
  title?: string;
  meta?: React.ReactNode;
  density?: "default" | "compact";
  as?: "section" | "article" | "div";
  id?: string;
  className?: string;
  children: React.ReactNode;
}

export function SofascoreCard({
  title,
  meta,
  density = "default",
  as: Component = "section",
  id,
  className,
  children,
}: SofascoreCardProps): React.JSX.Element {
  const autoHeadingId = useId();
  const headingId = title ? (id ? `${id}-title` : autoHeadingId) : undefined;
  const regionLabelledBy = Component === "div" ? undefined : headingId;
  const hasHeader = Boolean(title) || (meta !== undefined && meta !== null);

  return (
    <Component
      id={id}
      aria-labelledby={regionLabelledBy}
      className={joinClasses("pl-sf-card", density === "compact" && "is-compact", className)}
      data-pl-sf-card=""
      data-pl-sf-density={density}
    >
      {hasHeader ? (
        <header className="pl-sf-card-head">
          {title ? (
            <h2 id={headingId} className="pl-sf-card-title">
              {title}
            </h2>
          ) : (
            <span className="pl-sf-card-spacer" aria-hidden="true" />
          )}
          {meta !== undefined && meta !== null ? (
            <div className="pl-sf-card-meta num">{meta}</div>
          ) : null}
        </header>
      ) : null}
      <div className="pl-sf-card-body">{children}</div>
    </Component>
  );
}

export interface SofascoreTableColumn<T> {
  key: string;
  header: string;
  align?: "start" | "end";
  sticky?: boolean;
  numeric?: boolean;
  render: (row: T, index: number) => React.ReactNode;
}

export interface SofascoreTableProps<T> {
  caption: string;
  columns: readonly SofascoreTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T, index: number) => string;
  density?: "default" | "compact";
  onRowClick?: (row: T) => void;
  emptyState?: React.ReactNode;
  className?: string;
}

export function SofascoreTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  density = "default",
  onRowClick,
  emptyState,
  className,
}: SofascoreTableProps<T>): React.JSX.Element {
  const captionId = useId();
  const firstStickyIndex = columns.findIndex((col) => col.sticky);

  if (rows.length === 0) {
    return (
      <div
        className={joinClasses("pl-sf-table-empty-wrap", className)}
        data-pl-sf-table="empty"
      >
        {emptyState ?? <SofascoreEmptyState title="Sin datos para mostrar" />}
      </div>
    );
  }

  return (
    <div
      className={joinClasses(
        "pl-sf-table-wrap",
        density === "compact" && "is-compact",
        className,
      )}
      tabIndex={0}
      role="region"
      aria-labelledby={captionId}
      data-pl-sf-table=""
      data-pl-sf-density={density}
    >
      <table className="pl-sf-table">
        <caption id={captionId} className="sr-only">
          {caption}
        </caption>
        <thead>
          <tr>
            {columns.map((col) => {
              const isEnd = col.align ? col.align === "end" : Boolean(col.numeric);
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={joinClasses(
                    "pl-sf-th",
                    isEnd && "is-end",
                    col.numeric && "num",
                    col.sticky && "is-sticky-col",
                  )}
                >
                  {col.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const key = rowKey(row, rowIndex);
            const handleRowKeyDown = onRowClick
              ? (event: React.KeyboardEvent<HTMLTableRowElement>) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onRowClick(row);
                  }
                }
              : undefined;

            return (
              <tr
                key={key}
                className={joinClasses("pl-sf-tr", Boolean(onRowClick) && "is-clickable")}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={handleRowKeyDown}
              >
                {columns.map((col, colIndex) => {
                  const isEnd = col.align ? col.align === "end" : Boolean(col.numeric);
                  const cellClass = joinClasses(
                    "pl-sf-td",
                    isEnd && "is-end",
                    col.numeric && "num",
                    col.sticky && "is-sticky-col",
                  );
                  if (colIndex === firstStickyIndex) {
                    return (
                      <th
                        key={col.key}
                        scope="row"
                        className={cellClass}
                        data-label={col.header}
                      >
                        {col.render(row, rowIndex)}
                      </th>
                    );
                  }
                  return (
                    <td key={col.key} className={cellClass} data-label={col.header}>
                      {col.render(row, rowIndex)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export interface SofascoreSignalPairProps {
  evPct?: number | null;
  movement?: "steam" | "shortening" | "drifting" | "stable" | null;
  compact?: boolean;
}

const MOVEMENT_META: Readonly<
  Record<"steam" | "shortening" | "drifting", { label: string; shortLabel: string }>
> = {
  steam: { label: "↓↓ Steam", shortLabel: "↓↓ Steam" },
  shortening: { label: "↓ Bajando", shortLabel: "↓ Baja" },
  drifting: { label: "↑ Subiendo", shortLabel: "↑ Sube" },
};

export function SofascoreSignalPair({
  evPct,
  movement,
  compact = false,
}: SofascoreSignalPairProps): React.JSX.Element | null {
  const validEvPct =
    typeof evPct === "number" && Number.isFinite(evPct) ? evPct : null;
  const movementSpec =
    movement === "steam" || movement === "shortening" || movement === "drifting"
      ? MOVEMENT_META[movement]
      : null;

  if (validEvPct === null && !movementSpec) {
    return null;
  }

  const evTone =
    validEvPct !== null && validEvPct > 0
      ? "positive"
      : validEvPct !== null && validEvPct < 0
        ? "negative"
        : "neutral";
  const evPrefix = validEvPct !== null && validEvPct > 0 ? "+" : "";

  return (
    <span
      className={joinClasses("pl-sf-signal-pair num", compact && "is-compact")}
      data-pl-sf-signal-pair=""
    >
      {validEvPct !== null ? (
        <span
          className={joinClasses("pl-sf-signal-pill", `is-${evTone}`)}
          data-pl-sf-ev={evTone}
        >
          {compact
            ? `${evPrefix}${validEvPct.toFixed(1)}%`
            : `EV ${evPrefix}${validEvPct.toFixed(1)}%`}
        </span>
      ) : null}
      {movementSpec && movement ? (
        <span
          className={joinClasses("pl-sf-signal-pill", `is-${movement}`)}
          data-pl-sf-movement={movement}
        >
          {compact ? movementSpec.shortLabel : movementSpec.label}
        </span>
      ) : null}
    </span>
  );
}

export interface SofascoreValueCellProps {
  probPct: number;
  fairLabel: string;
  bestBookLabel?: string | null;
  bestOddsLabel?: string | null;
  evPct?: number | null;
}

export function SofascoreValueCell({
  probPct,
  fairLabel,
  bestBookLabel,
  bestOddsLabel,
  evPct,
}: SofascoreValueCellProps): React.JSX.Element {
  const formattedProb = Number.isFinite(probPct) ? `${probPct.toFixed(1)}%` : "—";
  const validEvPct =
    typeof evPct === "number" && Number.isFinite(evPct) ? evPct : null;
  const hasBook = Boolean(bestOddsLabel);
  const evTone =
    validEvPct !== null && validEvPct > 0
      ? "positive"
      : validEvPct !== null && validEvPct < 0
        ? "negative"
        : "neutral";
  const evPrefix = validEvPct !== null && validEvPct > 0 ? "+" : "";

  return (
    <div className="pl-sf-value-cell num" data-pl-sf-value-cell="">
      <div className="pl-sf-value-main">
        <strong className="pl-sf-value-prob">{formattedProb}</strong>
        <span className="pl-sf-value-fair">Justo {fairLabel}</span>
      </div>
      {hasBook || validEvPct !== null ? (
        <div className="pl-sf-value-sub">
          {hasBook ? (
            <span className="pl-sf-value-book">
              {bestBookLabel ? `${bestBookLabel} ` : ""}
              <strong>{bestOddsLabel}</strong>
            </span>
          ) : null}
          {validEvPct !== null ? (
            <span
              className={joinClasses("pl-sf-signal-pill is-compact", `is-${evTone}`)}
              data-pl-sf-ev={evTone}
            >
              {`${evPrefix}${validEvPct.toFixed(1)}%`}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export interface SofascoreKpiItem {
  id: string;
  label: string;
  value: string;
  delta?: string | null;
  tone?: "default" | "positive" | "negative" | "brand";
}

export interface SofascoreKpiStripProps {
  items: readonly SofascoreKpiItem[];
  className?: string;
}

export function SofascoreKpiStrip({
  items,
  className,
}: SofascoreKpiStripProps): React.JSX.Element | null {
  if (items.length === 0) {
    return null;
  }

  return (
    <dl
      className={joinClasses("pl-sf-kpi-strip", className)}
      data-pl-sf-kpi-strip=""
    >
      {items.map((item) => {
        const tone = item.tone ?? "default";
        return (
          <div
            key={item.id}
            className={joinClasses("pl-sf-kpi-item", `is-${tone}`)}
            data-pl-sf-kpi-tone={tone}
          >
            <dt className="pl-sf-kpi-label">{item.label}</dt>
            <dd className="pl-sf-kpi-value-row num">
              <span className="pl-sf-kpi-value">{item.value}</span>
              {item.delta ? (
                <span className="pl-sf-kpi-delta">{item.delta}</span>
              ) : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export interface SofascoreTabItem {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

export interface SofascoreTabsProps {
  items: readonly SofascoreTabItem[];
  value: string;
  onChange: (id: string) => void;
  variant?: "underline" | "segmented";
  ariaLabel: string;
  className?: string;
}

type NearestScrollIntoViewOptions = ScrollIntoViewOptions & {
  readonly container?: "all" | "nearest";
};

function scrollTabIntoView(element: HTMLButtonElement | null): void {
  if (!element || typeof element.scrollIntoView !== "function") return;
  const opts: NearestScrollIntoViewOptions = {
    block: "nearest",
    inline: "nearest",
    container: "nearest",
  };
  try {
    element.scrollIntoView(opts);
  } catch (err) {
    void err;
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

export function SofascoreTabs({
  items,
  value,
  onChange,
  variant = "underline",
  ariaLabel,
  className,
}: SofascoreTabsProps): React.JSX.Element {
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const enabledItems = items.filter((item) => !item.disabled);
  const focusableId = enabledItems.some((item) => item.id === value)
    ? value
    : (enabledItems[0]?.id ?? "");

  const activateTab = (target: SofascoreTabItem): void => {
    const node = buttonRefs.current[target.id] ?? null;
    node?.focus();
    scrollTabIntoView(node);
    if (target.id !== value) {
      onChange(target.id);
    }
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentId: string,
  ): void => {
    if (enabledItems.length === 0) return;
    const currentIndex = enabledItems.findIndex((item) => item.id === currentId);
    if (currentIndex < 0) return;

    const listEl = event.currentTarget.closest<HTMLElement>('[role="tablist"]');
    const isRtl =
      listEl !== null &&
      typeof window !== "undefined" &&
      window.getComputedStyle(listEl).direction === "rtl";
    const nextKey = isRtl ? "ArrowLeft" : "ArrowRight";
    const prevKey = isRtl ? "ArrowRight" : "ArrowLeft";

    let targetIndex = -1;
    if (event.key === nextKey) {
      targetIndex = (currentIndex + 1) % enabledItems.length;
    } else if (event.key === prevKey) {
      targetIndex = (currentIndex - 1 + enabledItems.length) % enabledItems.length;
    } else if (event.key === "Home") {
      targetIndex = 0;
    } else if (event.key === "End") {
      targetIndex = enabledItems.length - 1;
    }

    if (targetIndex < 0) return;
    event.preventDefault();
    const target = enabledItems[targetIndex];
    if (target) {
      activateTab(target);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className={joinClasses("pl-sf-tabs", `is-${variant}`, className)}
      data-pl-sf-tabs={variant}
    >
      {items.map((item) => {
        const isSelected = item.id === value;
        const isFocusable = !item.disabled && item.id === focusableId;
        return (
          <button
            key={item.id}
            ref={(el) => {
              buttonRefs.current[item.id] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isSelected}
            disabled={item.disabled}
            tabIndex={isFocusable ? 0 : -1}
            data-pl-sf-tab={item.id}
            className="pl-sf-tab"
            onClick={(event) => {
              if (item.disabled) return;
              scrollTabIntoView(event.currentTarget);
              if (item.id !== value) {
                onChange(item.id);
              }
            }}
            onKeyDown={(event) => handleKeyDown(event, item.id)}
          >
            <span className="pl-sf-tab-label">{item.label}</span>
            {typeof item.count === "number" && Number.isFinite(item.count) ? (
              <span className="pl-sf-tab-count num">{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export interface SofascoreFilterBarProps {
  searchValue?: string;
  onSearchChange?: (next: string) => void;
  searchPlaceholder?: string;
  resultCount?: number;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function SofascoreFilterBar({
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Buscar…",
  resultCount,
  trailing,
  children,
  className,
}: SofascoreFilterBarProps): React.JSX.Element {
  const searchInputId = useId();
  const validCount =
    typeof resultCount === "number" && Number.isFinite(resultCount)
      ? resultCount
      : null;

  return (
    <div
      className={joinClasses("pl-sf-filter-bar", className)}
      data-pl-sf-filter-bar=""
    >
      {onSearchChange ? (
        <div className="pl-sf-search-wrap">
          <label htmlFor={searchInputId} className="sr-only">
            {searchPlaceholder}
          </label>
          <input
            id={searchInputId}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoCorrect="off"
            spellCheck={false}
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="pl-sf-search-input"
          />
          {searchValue.length > 0 ? (
            <button
              type="button"
              className="pl-sf-search-clear"
              aria-label="Limpiar búsqueda"
              onClick={() => onSearchChange("")}
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}

      {children ? <div className="pl-sf-filter-controls">{children}</div> : null}

      {validCount !== null || trailing ? (
        <div className="pl-sf-filter-trailing">
          {validCount !== null ? (
            <span
              className="pl-sf-filter-count num"
              role="status"
              aria-live="polite"
            >
              {validCount} {validCount === 1 ? "resultado" : "resultados"}
            </span>
          ) : null}
          {trailing}
        </div>
      ) : null}
    </div>
  );
}

export interface SofascoreEmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function SofascoreEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  className,
}: SofascoreEmptyStateProps): React.JSX.Element {
  return (
    <div className={joinClasses("pl-sf-empty", className)} data-pl-sf-empty="">
      <p className="pl-sf-empty-title">{title}</p>
      {description ? <p className="pl-sf-empty-desc">{description}</p> : null}
      {actionLabel && onAction ? (
        <div className="pl-sf-empty-actions">
          <Button variant="secondary" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export interface SettingsGroupProps {
  title?: string;
  footnote?: string;
  id?: string;
  className?: string;
  children: React.ReactNode;
}

export function SettingsGroup({
  title,
  footnote,
  id,
  className,
  children,
}: SettingsGroupProps): React.JSX.Element {
  const autoId = useId();
  const headingId = title ? (id ? `${id}-heading` : autoId) : undefined;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={joinClasses("pl-sf-settings-group", className)}
      data-pl-sf-settings-group=""
    >
      {title ? (
        <h2 id={headingId} className="pl-sf-settings-heading">
          {title}
        </h2>
      ) : null}
      <div className="pl-sf-settings-card">{children}</div>
      {footnote ? <p className="pl-sf-settings-footnote">{footnote}</p> : null}
    </section>
  );
}

export interface SettingsRowProps {
  title: string;
  subtitle?: string;
  value?: React.ReactNode;
  trailing?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  tone?: "default" | "accent" | "danger";
  disabled?: boolean;
  className?: string;
}

export function SettingsRow({
  title,
  subtitle,
  value,
  trailing,
  href,
  onClick,
  tone = "default",
  disabled = false,
  className,
}: SettingsRowProps): React.JSX.Element {
  const interactive = Boolean(href || onClick) && !disabled;
  const showChevron = interactive && trailing === undefined;

  const rowClassName = joinClasses(
    "pl-sf-settings-row",
    `is-${tone}`,
    interactive && "is-interactive",
    disabled && "is-disabled",
    className,
  );

  const inner = (
    <>
      <span className="pl-sf-settings-copy">
        <span className="pl-sf-settings-title">{title}</span>
        {subtitle ? <span className="pl-sf-settings-subtitle">{subtitle}</span> : null}
      </span>
      {value !== undefined && value !== null ? (
        <span className="pl-sf-settings-value num">{value}</span>
      ) : null}
      {trailing !== undefined && trailing !== null ? (
        <span className="pl-sf-settings-trailing">{trailing}</span>
      ) : null}
      {showChevron ? (
        <svg
          className="pl-sf-settings-chevron"
          viewBox="0 0 16 16"
          width={14}
          height={14}
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M6 3.5L10.5 8L6 12.5"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </>
  );

  if (href && !disabled) {
    return (
      <a
        href={href}
        onClick={onClick ? () => onClick() : undefined}
        className={rowClassName}
        data-pl-sf-settings-row=""
        data-pl-sf-tone={tone}
      >
        {inner}
      </a>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={rowClassName}
        data-pl-sf-settings-row=""
        data-pl-sf-tone={tone}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      className={rowClassName}
      data-pl-sf-settings-row=""
      data-pl-sf-tone={tone}
    >
      {inner}
    </div>
  );
}
