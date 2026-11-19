"use client";

import React from "react";
import { MaestroIcon, type MaestroIconName } from "./MaestroPrimitives";

export interface SettingsGroupProps {
  /** Título opcional de la sección en mayúsculas suaves (estilo lista agrupada nativa). */
  title?: string;
  /** Descripción auxiliar opcional debajo del grupo. */
  footnote?: string;
  id?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Contenedor atómico de lista agrupada para Preferencias, Cuenta y Soporte.
 * Sigue el estándar curado (mobile-first, objetivos ≥ 44 px, divisores sutiles).
 */
export function SettingsGroup({
  title,
  footnote,
  id,
  className = "",
  children,
}: SettingsGroupProps): React.JSX.Element {
  const headingId = title ? `${id ?? "pl-sg"}-title` : undefined;
  return (
    <section
      id={id}
      className={`pl-sg ${className}`.trim()}
      aria-labelledby={headingId}
      data-settings-group=""
    >
      {title ? (
        <h2 id={headingId} className="pl-sg-heading">
          {title}
        </h2>
      ) : null}
      <div className="pl-sg-card glass-ring">{children}</div>
      {footnote ? <p className="pl-sg-footnote">{footnote}</p> : null}
    </section>
  );
}

export interface SettingsRowProps {
  icon?: MaestroIconName;
  title: string;
  subtitle?: string;
  /** Valor de texto alineado a la derecha antes de la flecha (ej. "Español (MX)", "Decimal"). */
  value?: React.ReactNode;
  /** Control interactivo a la derecha (Switch, segmented control, badge) cuando no es botón/link. */
  trailing?: React.ReactNode;
  /** Si se pasa `href` renderiza `<a>`; si se pasa `onClick` renderiza `<button>`; si no, contenedor. */
  href?: string;
  external?: boolean;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  tone?: "default" | "accent" | "danger";
  showChevron?: boolean;
  disabled?: boolean;
  dataAttr?: string;
  className?: string;
}

/**
 * Fila atómica dentro de `<SettingsGroup>`: ícono circular, título, subtítulo,
 * valor/control derecho y flecha de navegación opcional.
 */
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
  const interactive = Boolean(href || onClick);
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
        <span className="pl-sg-value">{value}</span>
      ) : null}
      {trailing ? <span className="pl-sg-trailing">{trailing}</span> : null}
      {displayChevron ? (
        <span className="pl-sg-chev" aria-hidden="true">
          <MaestroIcon name={external ? "arrowRight" : "chevronRight"} size={15} />
        </span>
      ) : null}
    </>
  );

  const rowClass = `pl-sg-row is-${tone} ${interactive ? "is-interactive" : ""} ${disabled ? "is-disabled" : ""} ${className}`.trim();
  const extraData = dataAttr ? { [`data-${dataAttr}`]: "" } : {};

  if (href && !disabled) {
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        onClick={onClick}
        className={rowClass}
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
        {...extraData}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={rowClass} {...extraData}>
      {content}
    </div>
  );
}
