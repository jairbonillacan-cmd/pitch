"use client";

import React, { useEffect, useState } from "react";
import { BrandLogo, ThemeToggle } from "../../primitives";
import { usePlatform } from "../platform-provider";
import type { PaymentMode } from "../types";
import { CouponRedeemBox } from "./CanjearCouponView";
import { LensGlowOrbs, MaestroIcon } from "./MaestroPrimitives";
import { AtmosphereStage } from "./ShellChrome";

export interface ExpiredPassGateProps {
  memberHandle?: string | null;
  accessEndedIso?: string | null;
  paymentMode?: PaymentMode;
  storyOverride?: {
    memberHandle?: string | null;
    accessEndedIso?: string | null;
    paymentMode?: PaymentMode;
    hasAccountSession?: boolean;
    redeemStatus?: "idle" | "redeemed" | "error";
    redeemMessage?: string;
    redeemDays?: number;
  };
}

const DATE_FMT_MX = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Mexico_City",
});

function formatEndedDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return DATE_FMT_MX.format(new Date(ms)).replace(/\./g, "");
}

/**
 * Puerta de recuperación dentro de `/app/*` cuando el usuario tiene cuenta
 * confirmada pero su prueba o pase venció y no es admin.
 */
export function ExpiredPassGate({
  memberHandle,
  accessEndedIso,
  paymentMode,
  storyOverride,
}: ExpiredPassGateProps): React.JSX.Element {
  const {
    paymentMode: ctxPaymentMode,
    hasAccountSessionAuth,
    viewerIdentity,
    navigateTo,
    logoutSession,
  } = usePlatform();

  const [fetchedEndedIso, setFetchedEndedIso] = useState<string | null>(null);
  const [redeemedPayload, setRedeemedPayload] = useState<{
    code: string;
    days: number;
    newAccessUntilIso: string | null;
  } | null>(
    storyOverride?.redeemStatus === "redeemed"
      ? {
          code: "PROMO",
          days: storyOverride.redeemDays ?? 7,
          newAccessUntilIso: null,
        }
      : null,
  );

  const effectiveHandle =
    storyOverride?.memberHandle !== undefined
      ? storyOverride.memberHandle
      : (memberHandle ?? viewerIdentity?.handle ?? null);
  const effectivePaymentMode: PaymentMode =
    storyOverride?.paymentMode ?? paymentMode ?? ctxPaymentMode ?? "transfer";
  const effectiveEndedIso =
    storyOverride?.accessEndedIso !== undefined
      ? storyOverride.accessEndedIso
      : accessEndedIso !== undefined
        ? accessEndedIso
        : fetchedEndedIso;

  useEffect(() => {
    if (storyOverride || accessEndedIso !== undefined || !hasAccountSessionAuth) return;
    let active = true;
    fetch("/api/me/plan", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { accessUntilIso?: string | null } | null) => {
        if (!active || !data?.accessUntilIso) return;
        setFetchedEndedIso(data.accessUntilIso);
      })
      .catch(() => {
        // Opcional: si falla, el gate sigue mostrando la recuperación sin romper la vista.
      });
    return () => {
      active = false;
    };
  }, [accessEndedIso, hasAccountSessionAuth, storyOverride]);

  const endedText = formatEndedDate(effectiveEndedIso);
  const planHref =
    effectivePaymentMode === "transfer" ? "/app/account?tab=plan#transfer" : "/app/account?tab=plan";

  const enterClubNow = () => {
    if (typeof window !== "undefined" && !storyOverride) {
      window.location.assign("/app");
      return;
    }
    navigateTo("/app");
  };

  return (
    <AtmosphereStage activePath="/precio">
      <header className="w-full max-w-4xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 flex items-center justify-between gap-3">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigateTo("/");
          }}
          className="inline-flex items-center min-h-[44px]"
          aria-label="PitchLab inicio"
        >
          <BrandLogo variant="horizontal" alt="PitchLab" />
        </a>

        <div className="flex items-center gap-2">
          {effectiveHandle ? (
            <span
              className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-full glass-ring text-xs font-semibold num"
              style={{ color: "var(--pl-text-secondary)" }}
            >
              @{effectiveHandle}
            </span>
          ) : null}
          <ThemeToggle />
          <button
            type="button"
            onClick={() => {
              void logoutSession();
            }}
            className="pl-btn-glass glass-ring min-h-[44px] px-3.5 text-xs font-semibold"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main id="main" className="pl-page-enter px-4 sm:px-6 pt-6 sm:pt-10 pb-16">
        <section
          aria-labelledby="expired-pass-heading"
          className="max-w-2xl mx-auto glass-lens glass-ring glass-ring--featured relative overflow-hidden rounded-3xl p-5 sm:p-7 space-y-6"
          data-expired-pass-gate=""
        >
          <LensGlowOrbs />

          <div className="relative z-10 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="pl-pill pl-pill--warning">
                <MaestroIcon name="calendar" size={14} />
                <span>Pase PitchLab Ultra · Acceso vencido</span>
              </span>
              {endedText ? (
                <span className="text-xs font-semibold num" style={{ color: "var(--pl-text-muted)" }}>
                  Último acceso: {endedText}
                </span>
              ) : null}
            </div>

            <h1 id="expired-pass-heading" className="m-0 text-2xl sm:text-3xl font-extrabold tracking-tight">
              Tu pase terminó, pero tus datos siguen intactos
            </h1>

            <p className="m-0 text-sm leading-relaxed" style={{ color: "var(--pl-text-secondary)" }}>
              Tu bitácora personal, tu watchlist, tu racha y tus datos de cuenta se conservan guardados. Activa de nuevo
              cuando tú decidas — sin cargos automáticos ni renovaciones sorpresa.
            </p>
          </div>

          {/* CTA principal de renovación */}
          <div className="relative z-10 glass-ring rounded-2xl p-4 sm:p-5 space-y-3" style={{ background: "var(--pl-surface)" }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="m-0 text-base font-bold">
                  {effectivePaymentMode === "transfer"
                    ? "Activa tu pase por transferencia SPEI"
                    : "Reactiva tu Pase PitchLab Ultra"}
                </h2>
                <p className="m-0 text-xs mt-1" style={{ color: "var(--pl-text-secondary)" }}>
                  $299 MXN / mes o $2,390 MXN / año (IVA incluido). Sin suscripción automática.
                </p>
              </div>
              <span className="pl-pill pl-pill--brand self-start sm:self-center num shrink-0">
                $299 MXN / mes
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
              <a
                href={planHref}
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo(planHref);
                }}
                className="pl-btn-primary min-h-[44px] flex-1 text-sm"
                data-expired-activate-cta=""
              >
                <MaestroIcon name="receipt" size={16} />
                <span>
                  {effectivePaymentMode === "transfer"
                    ? "Activar por transferencia SPEI"
                    : "Elegir plan en Mi plan"}
                </span>
                <MaestroIcon name="arrowRight" size={15} />
              </a>

              <a
                href="/app/account?tab=prefs"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/app/account?tab=prefs");
                }}
                className="pl-btn-glass glass-ring min-h-[44px] px-4 text-sm"
              >
                <span>Ver mis datos / facturación</span>
              </a>
            </div>
          </div>

          {/* Cupón directo */}
          <div className="relative z-10 glass-ring rounded-2xl p-4 sm:p-5 space-y-3" style={{ background: "var(--pl-surface)" }}>
            <div>
              <h2 className="m-0 text-base font-bold">¿Tienes un cupón de acceso?</h2>
              <p className="m-0 text-xs mt-1" style={{ color: "var(--pl-text-secondary)" }}>
                Canjéalo aquí para sumar días gratis al instante y volver al tablero principal.
              </p>
            </div>

            <CouponRedeemBox
              compact
              hasAccountSessionOverride={storyOverride?.hasAccountSession}
              onRedeemed={(payload) => setRedeemedPayload(payload)}
              storyResultOverride={
                storyOverride?.redeemStatus
                  ? {
                      status: storyOverride.redeemStatus,
                      message: storyOverride.redeemMessage,
                      days: storyOverride.redeemDays,
                    }
                  : undefined
              }
            />

            {redeemedPayload ? (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={enterClubNow}
                  className="pl-btn-primary min-h-[44px] px-5 text-sm"
                  data-expired-enter-club=""
                >
                  <span>Entrar al tablero</span>
                  <MaestroIcon name="arrowRight" size={15} />
                </button>
              </div>
            ) : null}
          </div>

          <div
            className="relative z-10 hairline-t pt-4 flex flex-wrap items-center justify-between gap-2 text-xs"
            style={{ color: "var(--pl-text-muted)" }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="/app/account?tab=cfdi"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/app/account?tab=cfdi");
                }}
                className="underline min-h-[44px] inline-flex items-center"
              >
                Facturación CFDI 4.0
              </a>
              <a
                href="/app/account?tab=referrals"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/app/account?tab=referrals");
                }}
                className="underline min-h-[44px] inline-flex items-center"
              >
                Mis referidos
              </a>
              <a
                href="/precio"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/precio");
                }}
                className="underline min-h-[44px] inline-flex items-center"
              >
                Ver planes
              </a>
            </div>

            <button
              type="button"
              onClick={() => {
                void logoutSession();
              }}
              className="underline font-semibold min-h-[44px] px-1"
              style={{ color: "var(--pl-text-secondary)" }}
            >
              Cerrar sesión
            </button>
          </div>
        </section>
      </main>
    </AtmosphereStage>
  );
}
