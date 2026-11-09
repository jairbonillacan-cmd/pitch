"use client";

import React from "react";
import { getLogoPath, getMascotPath } from "@pitchlab/sports-assets";
import { Icon } from "./icons.js";

// El botón vive en `components/ui/button.tsx` (shadcn/ui, estilo Mira, Base UI).

export type TagVariant = "default" | "ok" | "info" | "model" | "demo";

export function Tag({
  variant = "default",
  dot = false,
  className = "",
  style,
  children,
}: {
  variant?: TagVariant;
  dot?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}): React.JSX.Element {
  const vClass = variant === "default" ? "" : `tag-${variant}`;
  return (
    <span className={`tag ${vClass} ${className}`.trim()} style={style}>
      {dot ? <span className="dot" /> : null}
      {children}
    </span>
  );
}

export function Panel({
  as: Component = "div",
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  as?: "div" | "article" | "section" | "aside";
}): React.JSX.Element {
  return (
    <Component className={`panel ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
}

export function Notice({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={`notice ${className}`.trim()}>
      <Icon name="info" />
      <span>{children}</span>
    </div>
  );
}

export function Field({
  id,
  label,
  type = "text",
  placeholder,
  autoComplete,
}: {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}): React.JSX.Element {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
    </div>
  );
}

export function Mascot({
  edition = "radar",
  size = 230,
  className = "",
  lazy = false,
}: {
  edition?: string;
  size?: number;
  className?: string;
  lazy?: boolean;
}): React.JSX.Element {
  return (
    <div className={`mascot ${className}`.trim()} aria-hidden="true">
      <img
        src={getMascotPath(edition)}
        alt=""
        width={size}
        height={size}
        loading={lazy ? "lazy" : undefined}
      />
    </div>
  );
}

export function BrandLogo({
  variant = "horizontal",
  width = 133,
  height = 26,
  alt = "",
}: {
  variant?: "horizontal" | "compact" | "isologo" | "isotype" | "stacked" | "wordmark";
  width?: number;
  height?: number;
  alt?: string;
}): React.JSX.Element {
  return (
    <>
      <img
        className="only-dark"
        src={getLogoPath(variant, "dark")}
        alt={alt}
        width={width}
        height={height}
      />
      <img
        className="only-light"
        src={getLogoPath(variant, "light")}
        alt={alt}
        width={width}
        height={height}
      />
    </>
  );
}

export function ThemeToggle(): React.JSX.Element {
  const handleToggle = () => {
    if (typeof document === "undefined") return;
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    const next = current === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem("pl-theme", next);
    } catch (err) {
      void err;
    }
  };

  return (
    <button
      className="btn btn-ghost btn-icon theme-btn"
      type="button"
      data-theme-toggle=""
      aria-label="Cambiar tema claro u oscuro"
      onClick={handleToggle}
    >
      <Icon name="moon" />
      <Icon name="sun" />
    </button>
  );
}

export function Skeleton({
  width = "100%",
  height = "12px",
  className = "",
}: {
  width?: string;
  height?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={`skeleton ${className}`.trim()}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function EmptyState({
  message = "No hay partidos este día.",
  actionLabel = "Ver toda la jornada",
  onAction,
}: {
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}): React.JSX.Element {
  return (
    <div className="empty">
      <img src={getMascotPath("radar")} alt="" width={160} height={160} />
      <p>{message}</p>
      {onAction ? (
        <button className="btn btn-secondary" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function ErrorState({
  message = "No pudimos cargar los datos de la jornada.",
  code = "UPSTREAM",
  onRetry,
}: {
  message?: string;
  code?: string;
  onRetry?: () => void;
}): React.JSX.Element {
  return (
    <div className="empty" role="alert">
      <img src={getMascotPath("radar")} alt="" width={160} height={160} />
      <p>{message}</p>
      <span className="caption muted">Código: {code}</span>
      {onRetry ? (
        <button className="btn btn-secondary" type="button" onClick={onRetry}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}
