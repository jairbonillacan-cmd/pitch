"use client";

import React from "react";
import type { LiveIncident } from "@pitchlab/contracts";

export type SportEventIconKind = LiveIncident["kind"] | "injury" | "whistle";

export interface SportEventIconProps {
  readonly kind: SportEventIconKind;
  readonly size?: number;
  readonly className?: string;
}

/**
 * Iconos deportivos vectoriales planos (ADR-054) para anotadores del Hero,
 * cronología «Eventos por tiempo», Momentum y Match Center en vivo.
 * 100 % tokens CSS `--pl-*` (cero colores hex), contraste >= 3:1 en tema oscuro y claro,
 * decorativos (`aria-hidden="true"`, `flex: none`, `pointer-events: none`).
 */
export function SportEventIcon({
  kind,
  size = 15,
  className,
}: SportEventIconProps): React.JSX.Element {
  const cls = `pl-sport-evt-ico pl-sport-evt-ico--${kind}${className ? ` ${className}` : ""}`;

  if (kind === "yellow") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden="true"
        className={cls}
      >
        <rect
          x="4.5"
          y="2.25"
          width="9"
          height="13.5"
          rx="1.8"
          fill="var(--pl-google-yellow, var(--pl-warning))"
          stroke="var(--pl-border-strong)"
          strokeWidth="0.9"
        />
      </svg>
    );
  }

  if (kind === "red") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden="true"
        className={cls}
      >
        <rect
          x="4.5"
          y="2.25"
          width="9"
          height="13.5"
          rx="1.8"
          fill="var(--pl-google-red, var(--pl-danger))"
          stroke="var(--pl-border-strong)"
          strokeWidth="0.9"
        />
      </svg>
    );
  }

  if (kind === "second_yellow") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden="true"
        className={cls}
      >
        <rect
          x="2.5"
          y="3.5"
          width="7.8"
          height="11.5"
          rx="1.5"
          fill="var(--pl-google-yellow, var(--pl-warning))"
          stroke="var(--pl-border-strong)"
          strokeWidth="0.85"
        />
        <rect
          x="7.5"
          y="2"
          width="7.8"
          height="11.5"
          rx="1.5"
          fill="var(--pl-google-red, var(--pl-danger))"
          stroke="var(--pl-surface)"
          strokeWidth="1"
        />
      </svg>
    );
  }

  if (kind === "sub") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden="true"
        className={cls}
      >
        <path
          d="M3.5 6.2H13.5M10.8 3.5L13.8 6.2L10.8 8.9"
          stroke="var(--pl-success)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14.5 11.8H4.5M7.2 9.1L4.2 11.8L7.2 14.5"
          stroke="var(--pl-danger)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (kind === "var") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 18"
        fill="none"
        aria-hidden="true"
        className={cls}
      >
        <rect
          x="1.5"
          y="2.5"
          width="17"
          height="11.5"
          rx="2.4"
          stroke="var(--pl-info)"
          strokeWidth="1.5"
          fill="color-mix(in srgb, var(--pl-info) 12%, transparent)"
        />
        <path
          d="M6.5 16H13.5"
          stroke="var(--pl-info)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <text
          x="10"
          y="10.4"
          textAnchor="middle"
          fill="var(--pl-info)"
          fontSize="5.8"
          fontWeight="800"
          fontFamily="inherit"
        >
          VAR
        </text>
      </svg>
    );
  }

  if (kind === "injury") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden="true"
        className={cls}
      >
        <rect
          x="2"
          y="2"
          width="14"
          height="14"
          rx="3.5"
          fill="color-mix(in srgb, var(--pl-danger) 14%, transparent)"
          stroke="var(--pl-danger)"
          strokeWidth="1.2"
        />
        <path
          d="M9 5.5V12.5M5.5 9H12.5"
          stroke="var(--pl-danger)"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (kind === "whistle" || kind === "period") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden="true"
        className={cls}
      >
        <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 5.5V9L11.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  // Balón de fútbol para `goal`, `own_goal`, `penalty_goal` y `penalty_missed`
  const ballStroke =
    kind === "own_goal" || kind === "penalty_missed"
      ? "var(--pl-danger)"
      : kind === "penalty_goal"
        ? "var(--pl-brand)"
        : "currentColor";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={cls}
    >
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="var(--pl-surface)"
        stroke={ballStroke}
        strokeWidth="1.55"
      />
      <polygon
        points="10,6.2 13.4,8.6 12.1,12.6 7.9,12.6 6.6,8.6"
        fill={ballStroke}
      />
      <path
        d="M10 6.2V2.2M13.4 8.6L17.2 7.2M12.1 12.6L14.8 16M7.9 12.6L5.2 16M6.6 8.6L2.8 7.2"
        stroke={ballStroke}
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      {kind === "penalty_missed" ? (
        <path
          d="M3.5 16.5L16.5 3.5"
          stroke="var(--pl-danger)"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      ) : null}
      {kind === "penalty_goal" ? (
        <>
          <circle cx="15.6" cy="15.6" r="4" fill="var(--pl-brand)" />
          <text
            x="15.6"
            y="17.5"
            textAnchor="middle"
            fill="var(--on-primary, var(--pl-surface))"
            fontSize="5.8"
            fontWeight="800"
            fontFamily="inherit"
          >
            P
          </text>
        </>
      ) : null}
    </svg>
  );
}
