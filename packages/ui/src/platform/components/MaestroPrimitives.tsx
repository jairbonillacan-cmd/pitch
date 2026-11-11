"use client";

import React from "react";
import { usePlatform } from "../platform-provider.js";
import type { ViewerRole } from "../types.js";

export type MaestroIconName =
  | "sparkles"
  | "lock"
  | "unlock"
  | "shield"
  | "layers"
  | "bolt"
  | "chart"
  | "users"
  | "gift"
  | "share"
  | "bell"
  | "search"
  | "check"
  | "x"
  | "chevronRight"
  | "arrowRight"
  | "arrowLeft"
  | "calendar"
  | "flame"
  | "trophy"
  | "sliders"
  | "eye"
  | "copy"
  | "download"
  | "plus"
  | "minus"
  | "sun"
  | "moon"
  | "star"
  | "ticket"
  | "cpu"
  | "activity"
  | "crown";

function renderIconGeometry(name: MaestroIconName): React.ReactNode {
  switch (name) {
    case "sparkles":
      return (
        <>
          <path d="M12 3l1.9 4.8L18.7 9.7l-4.8 1.9L12 16.4l-1.9-4.8-4.8-1.9 4.8-1.9L12 3z" />
          <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
          <path d="M5 15l.7 1.6L7.3 17.3l-1.6.7L5 19.6l-.7-1.6-1.6-.7 1.6-.7L5 15z" />
        </>
      );
    case "lock":
      return (
        <>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </>
      );
    case "unlock":
      return (
        <>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 7.4-2" />
        </>
      );
    case "shield":
      return (
        <>
          <path d="M12 3l7 3v5.5c0 4.6-3 8.4-7 9.5-4-1.1-7-4.9-7-9.5V6l7-3z" />
          <path d="M9 12.2l2 2 4-4.2" />
        </>
      );
    case "layers":
      return (
        <>
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 12l10 5 10-5" />
          <path d="M2 17l10 5 10-5" />
        </>
      );
    case "bolt":
      return <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />;
    case "chart":
      return (
        <>
          <path d="M3 3v18h18" />
          <path d="M7 15l4-4 3 3 5-6" />
        </>
      );
    case "users":
      return (
        <>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 19.5a6.5 6.5 0 0 1 13 0" />
          <circle cx="17" cy="9" r="2.8" />
          <path d="M15.5 19.5a5 5 0 0 1 6 0" />
        </>
      );
    case "gift":
      return (
        <>
          <rect x="3" y="8" width="18" height="4" rx="1" />
          <path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" />
        </>
      );
    case "share":
      return (
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" />
      );
    case "bell":
      return (
        <>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </>
      );
    case "search":
      return (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.8-3.8" />
        </>
      );
    case "check":
      return <path d="M5 12.5l4.5 4.5L19 7.5" />;
    case "x":
      return <path d="M6 6l12 12M18 6L6 18" />;
    case "chevronRight":
      return <path d="M9 6l6 6-6 6" />;
    case "arrowRight":
      return <path d="M5 12h14M13 6l6 6-6 6" />;
    case "arrowLeft":
      return <path d="M19 12H5M11 6l-6 6 6 6" />;
    case "calendar":
      return (
        <>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </>
      );
    case "flame":
      return (
        <path d="M12 3c.5 3.2-2 4.8-2 7.5a3 3 0 0 0 6 0c0-1.6-.8-3-1.4-4 2.8 1.4 4.4 4.2 4.4 7.3a7 7 0 1 1-14 0c0-4.4 3.4-7.8 7-10.8z" />
      );
    case "trophy":
      return (
        <>
          <path d="M8 21h8M12 17v4M6 4h12v4a6 6 0 0 1-12 0V4z" />
          <path d="M6 6H3.5v1.5A3.5 3.5 0 0 0 7 11M18 6h2.5v1.5A3.5 3.5 0 0 1 17 11" />
        </>
      );
    case "sliders":
      return (
        <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
      );
    case "eye":
      return (
        <>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </>
      );
    case "copy":
      return (
        <>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </>
      );
    case "download":
      return <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />;
    case "plus":
      return <path d="M12 5v14M5 12h14" />;
    case "minus":
      return <path d="M5 12h14" />;
    case "sun":
      return (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
        </>
      );
    case "moon":
      return <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />;
    case "star":
      return (
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      );
    case "ticket":
      return (
        <>
          <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.5a2 2 0 0 0 0 3V15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.5a2 2 0 0 0 0-3V9z" />
          <path d="M9 7v10" strokeDasharray="2 2" />
        </>
      );
    case "cpu":
      return (
        <>
          <rect x="6" y="6" width="12" height="12" rx="2" />
          <rect x="9" y="9" width="6" height="6" rx="1" />
          <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
        </>
      );
    case "activity":
      return <path d="M22 12h-4l-3 9L9 3l-3 9H2" />;
    case "crown":
      return (
        <>
          <path d="M3 18h18l-2-11-5 4-2-6-2 6-5-4-2 11z" />
          <path d="M4 21h16" />
        </>
      );
  }
}

export function MaestroIcon({
  name,
  size = 16,
  className,
  style,
}: {
  name: MaestroIconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={["inline-block shrink-0", className].filter(Boolean).join(" ")}
      style={style}
    >
      {renderIconGeometry(name)}
    </svg>
  );
}

export function LensGlowOrbs({
  primaryColor = "var(--pl-aura-1)",
  secondaryColor = "var(--pl-aura-2)",
  subtle = false,
}: {
  primaryColor?: string;
  secondaryColor?: string;
  subtle?: boolean;
}): React.JSX.Element {
  return (
    <div
      className="pl-lens-orbs pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      data-subtle={subtle ? "true" : undefined}
      aria-hidden="true"
    >
      <span
        className="pl-lens-orb pl-lens-orb--primary"
        style={{ "--orb-color": primaryColor } as React.CSSProperties}
      />
      <span
        className="pl-lens-orb pl-lens-orb--secondary"
        style={{ "--orb-color": secondaryColor } as React.CSSProperties}
      />
    </div>
  );
}

export function CrestPedestal({
  children,
  glowColor,
  size = "md",
  className,
}: {
  children: React.ReactNode;
  glowColor?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}): React.JSX.Element {
  const sizeClass =
    size === "sm"
      ? "crest-pedestal--sm"
      : size === "lg"
        ? "crest-pedestal--lg"
        : "crest-pedestal--md";

  return (
    <span
      className={[
        "crest-pedestal glass-ring",
        sizeClass,
        glowColor ? "crest-pedestal--glow" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        glowColor
          ? ({ "--crest-glow": glowColor } as React.CSSProperties)
          : undefined
      }
    >
      {children}
    </span>
  );
}

export function CalendarSquare({
  monthLabel,
  dayNumber,
  className,
}: {
  monthLabel: string;
  dayNumber: string;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={["glass-ring sq-box num", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      <span className="sq-box__month">{monthLabel}</span>
      <span className="sq-box__day">{dayNumber}</span>
    </div>
  );
}

export function StackedAvatars({
  items,
  extraCount,
}: {
  items: ReadonlyArray<{ initials: string; gradVar?: string; label?: string }>;
  extraCount?: number;
}): React.JSX.Element {
  return (
    <span className="avatar-stack" aria-hidden="true">
      {items.map((item, idx) => (
        <span
          key={`${item.initials}-${idx}`}
          title={item.label}
          className="avatar-ring inline-flex items-center justify-center rounded-full text-[10px] font-extrabold tracking-tight shrink-0"
          style={{
            width: 26,
            height: 26,
            background: item.gradVar ?? `var(--avatar-grad-${(idx % 5) + 1})`,
            color: "var(--pl-on-solid)",
          }}
        >
          {item.initials}
        </span>
      ))}
      {typeof extraCount === "number" && extraCount > 0 ? (
        <span
          className="avatar-ring num inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-bold shrink-0"
          style={{
            height: 26,
            minWidth: 26,
            background: "var(--pl-surface-elevated)",
            color: "var(--pl-text-secondary)",
          }}
        >
          +{extraCount}
        </span>
      ) : null}
    </span>
  );
}

const NOTICE_TONE_STYLES: Record<
  "brand" | "cortex" | "success" | "warning" | "info",
  { fg: string; bg: string; border: string }
> = {
  brand: {
    fg: "var(--pl-pill-brand-fg)",
    bg: "var(--pl-pill-brand-bg)",
    border: "var(--pl-pill-brand-border)",
  },
  cortex: {
    fg: "var(--pl-pill-cortex-fg)",
    bg: "var(--pl-pill-cortex-bg)",
    border: "var(--pl-pill-cortex-border)",
  },
  success: {
    fg: "var(--pl-pill-success-fg)",
    bg: "var(--pl-pill-success-bg)",
    border: "var(--pl-pill-success-border)",
  },
  warning: {
    fg: "var(--pl-pill-warning-fg)",
    bg: "var(--pl-pill-warning-bg)",
    border: "var(--pl-pill-warning-border)",
  },
  info: {
    fg: "var(--pl-pill-info-fg)",
    bg: "var(--pl-pill-info-bg)",
    border: "var(--pl-pill-info-border)",
  },
};

export function NoticeCard({
  icon = "sparkles",
  badgeText,
  title,
  children,
  tone = "brand",
  action,
  className,
}: {
  icon?: MaestroIconName;
  badgeText?: string;
  title: string;
  children: React.ReactNode;
  tone?: "brand" | "cortex" | "success" | "warning" | "info";
  action?: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  const palette = NOTICE_TONE_STYLES[tone];

  return (
    <div
      className={[
        "glass-ring glass-card w-full overflow-hidden rounded-xl flex flex-col gap-2 p-3.5 sm:p-4",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs sm:text-sm">
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{
              color: palette.fg,
              background: palette.bg,
              border: `1px solid ${palette.border}`,
            }}
          >
            <MaestroIcon name={icon} size={13} />
            {badgeText ? <span>{badgeText}</span> : null}
          </span>
          <strong
            className="truncate font-semibold"
            style={{ color: "var(--pl-text)" }}
          >
            {title}
          </strong>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div
        className="text-xs sm:text-sm leading-relaxed"
        style={{ color: "var(--pl-text-secondary)" }}
      >
        {children}
      </div>
    </div>
  );
}

export function GlassActionRow({
  href,
  onClick,
  leading,
  title,
  subtitle,
  trailingBadge,
  className,
}: {
  href?: string;
  onClick?: () => void;
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailingBadge?: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  const sharedClassName = [
    "glass-ring glass-action-row w-full rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 text-left no-underline cursor-pointer border-0",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <span className="flex min-w-0 items-center gap-2.5">
        {leading ? (
          <span className="inline-flex shrink-0 items-center justify-center">
            {leading}
          </span>
        ) : null}
        <span className="flex min-w-0 flex-col">
          <span
            className="truncate text-xs sm:text-sm font-semibold"
            style={{ color: "var(--pl-text)" }}
          >
            {title}
          </span>
          {subtitle ? (
            <span
              className="truncate text-xs"
              style={{ color: "var(--pl-text-muted)" }}
            >
              {subtitle}
            </span>
          ) : null}
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-2">
        {trailingBadge}
        <MaestroIcon
          name="chevronRight"
          size={15}
          style={{ color: "var(--pl-text-muted)" }}
        />
      </span>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        onClick={
          onClick
            ? (e) => {
                e.preventDefault();
                onClick();
              }
            : undefined
        }
        className={sharedClassName}
      >
        {content}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={sharedClassName}>
      {content}
    </button>
  );
}

const ROLE_OPTIONS: ReadonlyArray<{
  role: ViewerRole;
  label: string;
  compactLabel: string;
}> = [
  {
    role: "visitor",
    label: "Visitante (Cero fuga)",
    compactLabel: "Visitante",
  },
  { role: "member", label: "Suscriptor", compactLabel: "Suscriptor" },
  { role: "tipstar", label: "Tipstar", compactLabel: "Tipstar" },
  { role: "admin", label: "Admin", compactLabel: "Admin" },
];

export function RoleSwitcherPill({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}): React.JSX.Element | null {
  const { viewerRole, setViewerRole, rawDataset, openBetaPin, pushToast, allowRoleSimulation } =
    usePlatform();

  const handleSelectRole = (role: ViewerRole) => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("pl-sim-role", role);
      }
    } catch (err) {
      void err;
    }

    setViewerRole(role);

    if (role !== "visitor" && rawDataset.isServerRedactedForVisitor) {
      const nextTarget =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : "/";
      // Sin sesión: el PIN lo escribe la persona; nunca va en el código del cliente.
      openBetaPin(nextTarget);
      return;
    }

    pushToast(
      role === "visitor"
        ? "Modo Visitante activo: candado Cero-Fuga encendido."
        : role === "tipstar"
          ? "Modo Tipstar Oficial (@sofia_nfl) activo."
          : role === "admin"
            ? "Modo Founder Admin activo."
            : "Modo Suscriptor Pase Total activo.",
      "default",
    );
  };

  // Herramienta de revisión: solo con sesión y con las herramientas de preview activas.
  if (!allowRoleSimulation) return null;

  return (
    <div
      className={["seg-well glass-ring", className].filter(Boolean).join(" ")}
      role="group"
      aria-label="Simulador de rol"
    >
      {ROLE_OPTIONS.map((opt) => {
        const active = viewerRole === opt.role;
        return (
          <button
            key={opt.role}
            type="button"
            className="seg-btn !min-h-[28px] !px-2.5 !text-xs"
            aria-pressed={active}
            data-active={active ? "true" : undefined}
            data-role-option={opt.role}
            onClick={() => handleSelectRole(opt.role)}
          >
            {compact ? opt.compactLabel : opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Etiqueta para contenido de demostración (tipstars y publicaciones ficticias).
 * Mientras no haya tipstars ni comunidad reales, todo perfil de ejemplo debe llevarla.
 */
export function ExampleBadge({ className }: { className?: string }): React.JSX.Element {
  return (
    <span
      className={["pl-pill pl-pill--warning text-[10px] shrink-0", className].filter(Boolean).join(" ")}
      title="Perfil de ejemplo: PitchLab todavía no tiene tipstars ni comunidad reales."
      data-example-badge=""
    >
      Ejemplo
    </span>
  );
}

/** Aviso de vista con contenido de demostración. */
export function ExampleNotice({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <NoticeCard
      tone="warning"
      icon="eye"
      badgeText="Ejemplo"
      title="Contenido de ejemplo"
      className={className}
    >
      {children}
    </NoticeCard>
  );
}
