"use client";

import React, { useMemo, useState } from "react";
import { ExampleBadge } from "../components/MaestroPrimitives";
import { MEMBERSHIP_SPEC, TIPSTAR_CREATORS } from "../spacetime-catalog";
import { ReferralCard3D } from "./ReferralCard3D";

export interface ReferralInviteInput {
  code?: string;
  interval?: string;
  sku?: string;
  senderHandle?: string;
  expired?: boolean;
  accountsEnabled?: boolean;
}

export interface ResolvedReferralInvite {
  code: string;
  interval: "monthly" | "annual";
  expired: boolean;
  cardTier: string;
  cardBottomLeft: string;
  senderPrefix: string;
  senderDisplay: string;
  senderSuffix: string;
  isExampleSender: boolean;
  headlineLead: string;
  headlineTail: string;
  headlineMuted: string;
  ctaLabel: string;
  signupHref: string;
}

function sanitizeCode(raw?: string): string {
  const cleaned = (raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 32);
  return cleaned || "JAIR-2611";
}

function sanitizeHandle(raw?: string): string {
  const cleaned = (raw ?? "")
    .trim()
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9_.-]/g, "")
    .slice(0, 28);
  return cleaned ? `@${cleaned}` : "";
}

export function resolveReferralInvite(
  input: ReferralInviteInput = {},
): ResolvedReferralInvite {
  const code = sanitizeCode(input.code);
  const rawInterval = (input.interval ?? "").trim().toUpperCase();
  const interval: "monthly" | "annual" =
    rawInterval === "ANNUAL" || rawInterval === "YEARLY" ? "annual" : "monthly";

  const isExpired =
    Boolean(input.expired) ||
    code.startsWith("VENCIDO") ||
    code.startsWith("EXPIR");

  const explicitHandle = sanitizeHandle(input.senderHandle);
  const tipstar = TIPSTAR_CREATORS.find(
    (creator) => creator.promoCode.toUpperCase() === code,
  );
  const isTipstarSku =
    Boolean(tipstar) ||
    (input.sku ?? "").trim().toLowerCase().includes("tipstar");

  if (isExpired) {
    return {
      code,
      interval,
      expired: true,
      cardTier: "ULTRA",
      cardBottomLeft: explicitHandle || "Pase Ultra",
      senderPrefix: "Código expirado · ",
      senderDisplay: code,
      senderSuffix: "",
      isExampleSender: false,
      headlineLead: "Prueba PitchLab ",
      headlineTail: " 7 días.",
      headlineMuted: " Este código venció; tu prueba sin costo sigue activa.",
      ctaLabel: "Empezar 7 días sin costo",
      signupHref: "/signup",
    };
  }

  if (tipstar || isTipstarSku) {
    const handle = explicitHandle || (tipstar ? `@${tipstar.handle}` : "");
    const freeDays = tipstar ? tipstar.freeDays : 5;
    return {
      code,
      interval,
      expired: false,
      cardTier: "ULTRA · TIPSTAR",
      cardBottomLeft: handle || "Tipstar Ultra",
      senderPrefix: handle ? "" : "Invitación tipstar · ",
      senderDisplay: handle || MEMBERSHIP_SPEC.name,
      senderSuffix: handle ? " te invitó" : "",
      isExampleSender: Boolean(
        tipstar?.isExample && !explicitHandle && !input.accountsEnabled,
      ),
      headlineLead: `${freeDays} días de PitchLab `,
      headlineTail: ".",
      headlineMuted: ` Sin cargo hoy, después $${MEMBERSHIP_SPEC.monthlyMxn} MXN al mes.`,
      ctaLabel: "Aceptar invitación",
      signupHref: `/signup?code=${encodeURIComponent(code)}`,
    };
  }

  let senderDisplay = explicitHandle;
  let isExampleSender = false;
  if (!senderDisplay && !input.accountsEnabled) {
    if (code === "JAIR-2611") {
      senderDisplay = "@jair";
      isExampleSender = true;
    } else if (code === "JAIR") {
      senderDisplay = "@jair_founder";
      isExampleSender = true;
    }
  }

  const firstMonthDiscountMxn = MEMBERSHIP_SPEC.referralFriendFirstMonthMxn;
  const headlineMuted =
    interval === "annual"
      ? ` Plan anual $${MEMBERSHIP_SPEC.annualMxn.toLocaleString("en-US")} MXN y +${MEMBERSHIP_SPEC.referralBothRewardDays} días para ambos.`
      : ` Sin cargo hoy, luego $${firstMonthDiscountMxn} MXN tu primer mes.`;

  const hasHandleSender = Boolean(senderDisplay);

  return {
    code,
    interval,
    expired: false,
    cardTier: "ULTRA",
    cardBottomLeft: senderDisplay || "Pase Ultra",
    senderPrefix: hasHandleSender ? "" : "Invitación personal · ",
    senderDisplay: senderDisplay || MEMBERSHIP_SPEC.name,
    senderSuffix: hasHandleSender ? " te invitó" : "",
    isExampleSender,
    headlineLead: `${MEMBERSHIP_SPEC.referralTrialDays} días de PitchLab `,
    headlineTail: ".",
    headlineMuted,
    ctaLabel: "Aceptar invitación",
    signupHref: `/signup?code=${encodeURIComponent(code)}`,
  };
}

export interface ReferralInviteSurfaceProps extends ReferralInviteInput {
  initialFlipped?: boolean;
  themeOverride?: "dark" | "light";
  onAcceptInvite?: (href: string) => void;
}

export function ReferralInviteSurface({
  code,
  interval,
  sku,
  senderHandle,
  expired,
  accountsEnabled,
  initialFlipped = false,
  themeOverride,
  onAcceptInvite,
}: ReferralInviteSurfaceProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const invite = useMemo(
    () =>
      resolveReferralInvite({
        code,
        interval,
        sku,
        senderHandle,
        expired,
        accountsEnabled,
      }),
    [code, interval, sku, senderHandle, expired, accountsEnabled],
  );

  const handleCopyCode = () => {
    try {
      void navigator.clipboard?.writeText(invite.code);
    } catch (err) {
      void err;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      className="pl-referral-stage is-entering"
      data-referral-stage=""
      data-referral-theme={themeOverride}
    >
      <div className="pl-referral-atmo" aria-hidden="true">
        <div className="pl-referral-atmo-canvas">
          <div className="pl-referral-aura pl-referral-aura--home" />
          <div className="pl-referral-aura pl-referral-aura--away" />
          <div className="pl-referral-aura pl-referral-aura--gleam" />
        </div>
        <div className="pl-referral-atmo-scrim" />
      </div>

      <div aria-hidden="true" className="relative z-10 h-1" />

      <main
        id="subscribe"
        className="relative z-10 w-full max-w-5xl mx-auto flex flex-col items-center text-center"
      >
        <div className="pl-referral-card-stage">
          <div className="pl-referral-glass-horizon" aria-hidden="true" />
          <ReferralCard3D
            code={invite.code}
            tierLabel={invite.cardTier}
            bottomLeftLabel={invite.cardBottomLeft}
            expired={invite.expired}
            initialFlipped={initialFlipped}
            themeOverride={themeOverride}
            ariaLabel={`Pase PitchLab Ultra · Invitación ${invite.code}`}
          />
        </div>

        <div className="w-full max-w-[27.8rem] -mt-2 space-y-6">
          <div className="space-y-2.5">
            <p
              className="pl-referral-enter-1 m-0 text-xs font-medium tracking-tight"
              style={{ color: "var(--pl-referral-muted)" }}
            >
              <span>{invite.senderPrefix}</span>
              <span
                className="font-semibold"
                style={{ color: "var(--pl-referral-fg)" }}
              >
                {invite.senderDisplay}
              </span>
              {invite.senderSuffix ? <span>{invite.senderSuffix}</span> : null}
              {invite.isExampleSender ? (
                <ExampleBadge className="ml-2 align-middle" />
              ) : null}
            </p>

            <h1 className="pl-referral-enter-2 pl-referral-headline num">
              <span style={{ color: "var(--pl-referral-fg)" }}>
                {invite.headlineLead}
              </span>
              <span className="whitespace-nowrap">
                <span
                  className={`pl-referral-ultra-word ${invite.expired ? "is-muted" : ""}`.trim()}
                >
                  Ultra
                </span>
                <span style={{ color: "var(--pl-referral-fg)" }}>
                  {invite.headlineTail}
                </span>
              </span>
              <span
                className="pl-referral-headline-sub"
                style={{ color: "var(--pl-referral-muted)" }}
              >
                {invite.headlineMuted}
              </span>
            </h1>
          </div>

          <div className="pl-referral-enter-3 flex flex-col items-center gap-3.5">
            <a
              href={invite.signupHref}
              className="pl-referral-cta-pill"
              data-referral-cta=""
              onClick={
                onAcceptInvite
                  ? (e) => {
                      e.preventDefault();
                      onAcceptInvite(invite.signupHref);
                    }
                  : undefined
              }
            >
              <span>{invite.ctaLabel}</span>
            </a>

            <p
              className="m-0 text-xs num"
              style={{ color: "var(--pl-referral-muted)" }}
            >
              <button
                type="button"
                className="pl-referral-code-btn num"
                onClick={handleCopyCode}
                title="Copiar código"
                aria-live="polite"
              >
                {copied ? `${invite.code} · Copiado` : invite.code}
              </button>
              <span
                className="mx-1.5"
                style={{ color: "var(--pl-referral-sep)" }}
              >
                ·
              </span>
              <span>Cancela cuando quieras</span>
              <span
                className="mx-1.5"
                style={{ color: "var(--pl-referral-sep)" }}
              >
                ·
              </span>
              <a href="/login" className="pl-referral-login-link">
                Entrar
              </a>
            </p>
          </div>
        </div>
      </main>

      <footer className="relative z-10 pt-6 text-center">
        <p className="m-0 text-xs" style={{ color: "var(--pl-referral-muted)" }}>
          Información deportiva para decidir · PitchLab no acepta apuestas · +18
        </p>
      </footer>
    </div>
  );
}
