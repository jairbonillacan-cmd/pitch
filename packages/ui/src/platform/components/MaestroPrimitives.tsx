"use client";

import React from "react";
import { buildPackIconSources, usePackIconBase } from "../../pack-icon-theme";
import {
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import type { ViewerRole } from "../types";
import { BadgeInfoTrigger } from "./BadgeInfoTrigger";

export type MaestroNewInterfaceIconName =
  | "alert-market"
  | "alert-warning"
  | "bankroll-wallet"
  | "bracket-playoff"
  | "compare-h2h"
  | "expand-fullscreen"
  | "info-circle"
  | "live-pulse"
  | "player-props"
  | "push-void"
  | "refresh-sync"
  | "target-picks"
  | "verified-seal";

export const MAESTRO_NEW_INTERFACE_ICONS: readonly MaestroNewInterfaceIconName[] = Object.freeze([
  "alert-market",
  "alert-warning",
  "bankroll-wallet",
  "bracket-playoff",
  "compare-h2h",
  "expand-fullscreen",
  "info-circle",
  "live-pulse",
  "player-props",
  "push-void",
  "refresh-sync",
  "target-picks",
  "verified-seal",
]);

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
  | "trash"
  | "chevronRight"
  | "chevronLeft"
  | "grid"
  | "arrowRight"
  | "arrowLeft"
  | "calendar"
  | "flame"
  | "trophy"
  | "podium"
  | "sliders"
  | "filter"
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
  | "crown"
  | "message"
  | "heart"
  | "link"
  | "users-plus"
  | "user"
  | "receipt"
  | "logout"
  | "chevronDown"
  | "dots"
  | "flag"
  | "pin"
  | "globe"
  | "stadium"
  | "command"
  | "whistle"
  | "coach"
  | "standings"
  | "all-leagues"
  | "attach-pick"
  | "notifications-unread"
  | "notifications-muted"
  | "mark-read"
  | "reply"
  | "repost"
  | "add-to-record"
  | "add-to-parlay"
  | "attach-file"
  | "bookmark"
  | "settings"
  | "responsible-play"
  | MaestroNewInterfaceIconName;

const MAESTRO_ICON_PACK_SLUGS: Readonly<Record<MaestroIconName, string>> = {
  sparkles: "sparkles",
  lock: "lock",
  unlock: "unlock",
  shield: "shield",
  layers: "layers",
  bolt: "bolt",
  chart: "chart",
  users: "users",
  gift: "gift",
  share: "share",
  bell: "bell",
  search: "search",
  check: "check",
  x: "x",
  trash: "trash",
  chevronRight: "chevron-right",
  chevronLeft: "chevron-left",
  grid: "grid",
  arrowRight: "arrow-right",
  arrowLeft: "arrow-left",
  calendar: "calendar",
  flame: "flame",
  trophy: "trophy",
  podium: "podium",
  sliders: "sliders",
  filter: "sliders",
  eye: "eye",
  copy: "copy",
  download: "download",
  plus: "plus",
  minus: "minus",
  sun: "sun",
  moon: "moon",
  star: "star",
  ticket: "ticket",
  cpu: "cpu",
  activity: "activity",
  crown: "crown",
  message: "message",
  heart: "heart",
  link: "link",
  "users-plus": "users-plus",
  user: "user",
  receipt: "receipt",
  logout: "logout",
  chevronDown: "chevron-down",
  dots: "dots",
  flag: "flag",
  pin: "pin",
  globe: "globe",
  stadium: "stadium",
  command: "command",
  whistle: "whistle",
  coach: "coach",
  standings: "standings",
  "all-leagues": "all-leagues",
  "attach-pick": "attach-pick",
  "notifications-unread": "notifications-unread",
  "notifications-muted": "notifications-muted",
  "mark-read": "mark-read",
  reply: "reply",
  repost: "repost",
  "add-to-record": "add-to-record",
  "add-to-parlay": "add-to-parlay",
  "attach-file": "attach-file",
  bookmark: "bookmark",
  settings: "settings",
  "responsible-play": "responsible-play",
  "alert-market": "alert-market",
  "alert-warning": "alert-warning",
  "bankroll-wallet": "bankroll-wallet",
  "bracket-playoff": "bracket-playoff",
  "compare-h2h": "compare-h2h",
  "expand-fullscreen": "expand-fullscreen",
  "info-circle": "info-circle",
  "live-pulse": "live-pulse",
  "player-props": "player-props",
  "push-void": "push-void",
  "refresh-sync": "refresh-sync",
  "target-picks": "target-picks",
  "verified-seal": "verified-seal",
};

export const MAESTRO_INTERFACE_PACK_SLUGS: readonly string[] = Object.freeze(
  Array.from(new Set(Object.values(MAESTRO_ICON_PACK_SLUGS))).sort(),
);

export function MaestroIcon({
  name,
  size = 16,
  className,
  style,
  label,
}: {
  readonly name: MaestroIconName;
  readonly size?: number;
  readonly className?: string;
  readonly style?: React.CSSProperties;
  readonly label?: string;
}): React.JSX.Element {
  const slug = MAESTRO_ICON_PACK_SLUGS[name];
  const iconBase = usePackIconBase();
  const sources = buildPackIconSources(iconBase, `interfaz/${slug}`);
  const accessibleLabel = label?.trim() ?? "";
  return (
    <img
      src={sources.src}
      srcSet={sources.srcSet}
      width={size}
      height={size}
      alt={accessibleLabel}
      aria-hidden={accessibleLabel ? undefined : true}
      decoding="async"
      draggable={false}
      className={["pl-maestro-icon", "pl-pack-icon", "inline-block", "shrink-0", className].filter(Boolean).join(" ")}
      style={style}
    />
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
        "crest-pedestal",
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
  { role: "tipster", label: "Tipster", compactLabel: "Tipster" },
  { role: "admin", label: "Admin", compactLabel: "Admin" },
];

export function RoleSwitcherPill({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}): React.JSX.Element | null {
  const { viewerRole, rawDataset, allowRoleSimulation } = usePlatformCore();
  const { setViewerRole, openBetaPin, pushToast } = usePlatformActions();

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
      openBetaPin(nextTarget);
      return;
    }

    pushToast(
      role === "visitor"
        ? "Modo Visitante activo: candado Cero-Fuga encendido."
        : role === "tipster"
          ? "Modo Tipster Oficial (@sofia_nfl) activo."
          : role === "admin"
            ? "Modo Founder Admin activo."
            : "Modo Suscriptor Pase PitchLab Ultra activo.",
      "default",
    );
  };

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
            className="seg-btn min-h-11 md:min-h-7 px-2.5 text-xs"
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

export function ExampleBadge({ className }: { className?: string }): React.JSX.Element {
  return (
    <span
      className={["pl-pill pl-pill--warning text-[11px] shrink-0", className].filter(Boolean).join(" ")}
      title="Perfil de ejemplo: PitchLab todavía no tiene tipsters ni comunidad reales."
      data-example-badge=""
    >
      Ejemplo
    </span>
  );
}

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

export function UltraTag({ className }: { className?: string }): React.JSX.Element {
  return (
    <span className={`pl-ultra-tag ${className ?? ""}`.trim()} title="Pase PitchLab Ultra">
      Ultra
    </span>
  );
}

export function VerifiedBadge({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}): React.JSX.Element {
  const iconBase = usePackIconBase();
  const sources = buildPackIconSources(iconBase, "insignias/tipster-verificado");
  return (
    <img
      src={sources.src}
      srcSet={sources.srcSet}
      className={["pl-verified", "pl-maestro-icon", "pl-pack-icon", "inline-block", "shrink-0", className].filter(Boolean).join(" ")}
      width={size}
      height={size}
      alt="Verificado"
      decoding="async"
      draggable={false}
    />
  );
}

export function TipsterBadge({ className }: { className?: string }): React.JSX.Element {
  return (
    <span className={`pl-tipster-badge ${className ?? ""}`.trim()}>
      <MaestroIcon name="crown" size={11} />
      <span>Tipster</span>
    </span>
  );
}

export function VerifiedSeal({
  size = 20,
  decorative = false,
  className,
}: {
  size?: number;
  decorative?: boolean;
  className?: string;
}): React.JSX.Element {
  const iconBase = usePackIconBase();
  if (!decorative) {
    return (
      <BadgeInfoTrigger
        badgeId="tipster-verificado"
        family="origin"
        label="Tipster verificado"
        criterion="Tipster oficial de PitchLab con récord sellado antes del partido."
        size={size}
        className={className}
        iconClassName="pl-seal"
      />
    );
  }
  const sources = buildPackIconSources(iconBase, "insignias/tipster-verificado");
  return (
    <img
      src={sources.src}
      srcSet={sources.srcSet}
      className={["pl-seal", "pl-maestro-icon", "pl-pack-icon", "inline-block", "shrink-0", className].filter(Boolean).join(" ")}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
    />
  );
}

export function TipsterVerifiedBadge({ className }: { className?: string }): React.JSX.Element {
  return (
    <BadgeInfoTrigger
      badgeId="tipster-verificado"
      family="origin"
      label="Tipster verificado"
      criterion="Tipster oficial de PitchLab con récord sellado antes del partido."
      size={20}
      className={["pl-vbadge", className].filter(Boolean).join(" ")}
      iconClassName="pl-vbadge-seal"
    />
  );
}

export function UserBadges({
  roleLabel,
  verified,
  ultra,
}: {
  roleLabel?: string;
  verified?: boolean;
  ultra?: boolean;
}): React.JSX.Element {
  const label = (roleLabel ?? "").toLowerCase();
  const isTipster = label.includes("tipster");
  const isVerified = verified ?? (isTipster || label.includes("verificad") || label.includes("analista"));
  const isUltra = ultra ?? (label.includes("ultra") || label.includes("socio") || label.includes("founder"));
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      {isVerified ? <VerifiedBadge /> : null}
      {isTipster ? <TipsterBadge /> : null}
      {isUltra ? <UltraTag /> : null}
    </span>
  );
}
