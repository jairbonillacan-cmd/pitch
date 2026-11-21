"use client";

import React, { useId } from "react";
import { MaestroIcon, type MaestroIconName } from "./MaestroPrimitives";

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
  className = "",
  children,
}: SettingsGroupProps): React.JSX.Element {
  const autoId = useId();
  const headingId = title ? (id ? `${id}-title` : `${autoId}-title`) : undefined;
  return (
    <section
      id={id}
      className={`pl-sg pl-sf-settings-group ${className}`.trim()}
      aria-labelledby={headingId}
      data-settings-group=""
      data-pl-sf-settings-group=""
    >
      {title ? (
        <h2 id={headingId} className="pl-sg-heading pl-sf-settings-heading">
          {title}
        </h2>
      ) : null}
      <div className="pl-sg-card border border-[var(--pl-border)] bg-[var(--pl-surface)]">
        {children}
      </div>
      {footnote ? <p className="pl-sg-footnote pl-sf-settings-footnote">{footnote}</p> : null}
    </section>
  );
}

export interface SettingsRowProps {
  icon?: MaestroIconName;
  title: string;
  subtitle?: string;
  value?: React.ReactNode;
  trailing?: React.ReactNode;
  href?: string;
  external?: boolean;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  tone?: "default" | "accent" | "danger";
  showChevron?: boolean;
  disabled?: boolean;
  dataAttr?: string;
  className?: string;
}

export function SettingsRow({
  icon,
  title,
  subtitle,
  value,
  trailing,
  href,
  external = false,
  onClick,
  tone = "default",
  showChevron,
  disabled = false,
  dataAttr,
  className = "",
}: SettingsRowProps): React.JSX.Element {
  const interactive = Boolean(href || onClick) && !disabled;
  const displayChevron = showChevron ?? (interactive && !trailing);

  const content = (
    <>
      {icon ? (
        <span className={`pl-sg-icon is-${tone}`} aria-hidden="true">
          <MaestroIcon name={icon} size={17} />
        </span>
      ) : null}
      <span className="pl-sg-copy">
        <span className="pl-sg-title">{title}</span>
        {subtitle ? <span className="pl-sg-subtitle">{subtitle}</span> : null}
      </span>
      {value !== undefined && value !== null ? (
        <span className="pl-sg-value num">{value}</span>
      ) : null}
      {trailing ? <span className="pl-sg-trailing">{trailing}</span> : null}
      {displayChevron ? (
        <span className="pl-sg-chev" aria-hidden="true">
          <MaestroIcon name={external ? "arrowRight" : "chevronRight"} size={15} />
        </span>
      ) : null}
    </>
  );

  const rowClass =
    `pl-sg-row is-${tone} ${interactive ? "is-interactive" : ""} ${disabled ? "is-disabled" : ""} ${className}`.trim();
  const extraData = dataAttr ? { [`data-${dataAttr}`]: "" } : {};

  if (href && !disabled) {
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        onClick={onClick}
        className={rowClass}
        data-pl-sf-settings-row=""
        data-pl-sf-tone={tone}
        {...extraData}
      >
        {content}
      </a>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={rowClass}
        data-pl-sf-settings-row=""
        data-pl-sf-tone={tone}
        {...extraData}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={rowClass}
      data-pl-sf-settings-row=""
      data-pl-sf-tone={tone}
      {...extraData}
    >
      {content}
    </div>
  );
}
