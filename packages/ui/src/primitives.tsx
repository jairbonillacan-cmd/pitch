"use client";

import React from "react";
import { getLogoPath, getMascotPath } from "@pitchlab/sports-assets";
import { Icon } from "./icons.js";
import { Badge } from "./components/ui/badge.js";
import { Button } from "./components/ui/button.js";

export type TagVariant = "default" | "ok" | "info" | "model" | "demo";

const tagVariants = {
  default: "pill",
  ok: "pill-success",
  info: "pill-info",
  model: "pill-model",
  demo: "pill-warning",
} as const satisfies Record<TagVariant, React.ComponentProps<typeof Badge>["variant"]>;

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
  return (
    <Badge variant={tagVariants[variant]} className={className} style={style}>
      {dot ? <span className="dot" aria-hidden="true" /> : null}
      {children}
    </Badge>
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

export function ThemeToggle({ shape }: { shape?: "pill" } = {}): React.JSX.Element {
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
    <Button
      variant="ghost"
      size="icon"
      shape={shape}
      appearance="d1"
      className="theme-btn p-0 text-sm"
      type="button"
      data-theme-toggle=""
      aria-label="Cambiar tema claro u oscuro"
      onClick={handleToggle}
    >
      <Icon name="moon" className="icon size-5" />
      <Icon name="sun" className="icon size-5" />
    </Button>
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
        <Button variant="secondary" appearance="d1" type="button" onClick={onAction}>
          {actionLabel}
        </Button>
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
        <Button variant="secondary" appearance="d1" type="button" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}
