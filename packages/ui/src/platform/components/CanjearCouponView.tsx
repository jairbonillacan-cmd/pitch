"use client";

import React, { useCallback, useEffect, useId, useState } from "react";
import { usePlatform } from "../platform-provider";
import { ExampleNotice, LensGlowOrbs, MaestroIcon } from "./MaestroPrimitives";
import {
  AtmosphereStage,
  ClubWorkspaceShell,
  PublicFooterV4,
  PublicHeaderV4,
} from "./ShellChrome";

export interface CouponPreviewState {
  valid: boolean;
  reason?: "no_existe" | "inactivo" | "vencido" | "agotado" | "ya_canjeado" | "no_configurado";
  error?: string;
  coupon?: {
    code: string;
    days: number;
    expiresAtIso: string | null;
  } | null;
}

const DATE_FMT_MX = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Mexico_City",
});

function formatCouponDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return DATE_FMT_MX.format(new Date(ms)).replace(/\./g, "");
}

function normalizeInputCode(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, "").slice(0, 32);
}

/**
 * Caja reutilizable de canje de cupones de acceso temporal (`POST /api/me/redeem`).
 * Usada tanto en `/canjear` y `/app/canjear` como en `Mi plan` y la pantalla de pase vencido.
 */
export function CouponRedeemBox({
  initialCode = "",
  onRedeemed,
  compact = false,
  hasAccountSessionOverride,
  storyResultOverride,
}: {
  initialCode?: string;
  onRedeemed?: (payload: {
    code: string;
    days: number;
    newAccessUntilIso: string | null;
  }) => void;
  compact?: boolean;
  hasAccountSessionOverride?: boolean;
  storyResultOverride?: {
    status: "idle" | "redeemed" | "error";
    message?: string;
    days?: number;
    newAccessUntilIso?: string | null;
  };
}): React.JSX.Element {
  const { accountsEnabled, hasAccountSessionAuth, pushToast } = usePlatform();
  const effectiveAccountSession = hasAccountSessionOverride ?? hasAccountSessionAuth;
  const [code, setCode] = useState<string>(() => normalizeInputCode(initialCode));
  const [busy, setBusy] = useState<boolean>(false);
  const [status, setStatus] = useState<"idle" | "redeemed" | "error">(
    storyResultOverride?.status ?? "idle",
  );
  const [message, setMessage] = useState<string>(storyResultOverride?.message ?? "");
  const [grantedDays, setGrantedDays] = useState<number | null>(
    storyResultOverride?.days ?? null,
  );
  const [newUntilIso, setNewUntilIso] = useState<string | null>(
    storyResultOverride?.newAccessUntilIso ?? null,
  );
  const inputId = useId();

  useEffect(() => {
    const clean = normalizeInputCode(initialCode);
    if (clean) setCode(clean);
  }, [initialCode]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const cleaned = normalizeInputCode(code);
      if (!cleaned) {
        setStatus("error");
        setMessage("Escribe el código de tu cupón antes de canjearlo.");
        return;
      }

      if (!accountsEnabled) {
        setStatus("redeemed");
        setGrantedDays(15);
        setMessage(`Vista previa lista: con cuentas activas el código ${cleaned} sumaría sus días a tu cuenta.`);
        return;
      }

      if (!effectiveAccountSession) {
        setStatus("error");
        setMessage("Inicia sesión con tu cuenta de PitchLab para canjear el cupón.");
        return;
      }

      setBusy(true);
      setStatus("idle");
      setMessage("");
      try {
        const res = await fetch("/api/me/redeem", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: cleaned }),
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          code?: string;
          days?: number;
          newAccessUntilIso?: string | null;
          error?: string;
        } | null;

        if (!res.ok || !json?.ok) {
          setStatus("error");
          setMessage(json?.error ?? "No se pudo canjear el cupón. Revisa el código e intenta de nuevo.");
          return;
        }

        const redeemedDays = json.days ?? 1;
        setStatus("redeemed");
        setGrantedDays(redeemedDays);
        setNewUntilIso(json.newAccessUntilIso ?? null);
        const untilText = formatCouponDate(json.newAccessUntilIso);
        const okText = untilText
          ? `¡Cupón ${json.code ?? cleaned} canjeado! Sumaste +${redeemedDays} días (acceso hasta el ${untilText}).`
          : `¡Cupón ${json.code ?? cleaned} canjeado! Sumaste +${redeemedDays} días a tu pase.`;
        setMessage(okText);
        pushToast(`+${redeemedDays} días abonados a tu pase`, "success");
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("pitchlab:plan-updated", {
              detail: { days: redeemedDays, newAccessUntilIso: json.newAccessUntilIso ?? null },
            }),
          );
        }
        onRedeemed?.({
          code: json.code ?? cleaned,
          days: redeemedDays,
          newAccessUntilIso: json.newAccessUntilIso ?? null,
        });
      } catch (err) {
        void err;
        setStatus("error");
        setMessage("No pudimos conectar con el servidor. Intenta de nuevo en un momento.");
      } finally {
        setBusy(false);
      }
    },
    [accountsEnabled, code, effectiveAccountSession, onRedeemed, pushToast],
  );

  return (
    <form onSubmit={handleSubmit} noValidate className={compact ? "space-y-2.5" : "space-y-3"}>
      <label
        htmlFor={inputId}
        className="block text-xs font-semibold"
        style={{ color: "var(--pl-text-secondary)" }}
      >
        Código de cupón
      </label>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <input
          id={inputId}
          type="text"
          name="codigo"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={32}
          placeholder="PL-XXXX-XXXX"
          value={code}
          onChange={(e) => {
            setCode(normalizeInputCode(e.target.value));
            if (status === "error") {
              setStatus("idle");
              setMessage("");
            }
          }}
          className="glass-input flex-1 min-h-[44px] px-3.5 text-base font-extrabold uppercase tracking-wider num"
        />
        <button
          type="submit"
          disabled={busy}
          className="pl-btn-primary min-h-[44px] px-5 text-sm shrink-0"
          data-redeem-submit=""
        >
          <MaestroIcon name="ticket" size={16} />
          <span>{busy ? "Canjeando…" : "Canjear cupón"}</span>
        </button>
      </div>

      {status === "error" && message ? (
        <p
          role="alert"
          className="m-0 text-xs font-semibold leading-relaxed"
          style={{ color: "var(--pl-danger)" }}
          data-coupon-feedback="error"
        >
          {message}
        </p>
      ) : null}

      {status === "redeemed" && message ? (
        <div
          role="status"
          aria-live="polite"
          className="glass-ring rounded-xl p-3 space-y-1"
          style={{ background: "var(--pl-surface)" }}
          data-coupon-feedback="success"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="pl-pill pl-pill--success num">
              <MaestroIcon name="check" size={13} />
              <span>+{grantedDays ?? 0} días sumados</span>
            </span>
            {newUntilIso ? (
              <span className="text-xs font-semibold num" style={{ color: "var(--pl-text-muted)" }}>
                Vigente hasta {formatCouponDate(newUntilIso)}
              </span>
            ) : null}
          </div>
          <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text)" }}>
            {message}
          </p>
        </div>
      ) : null}
    </form>
  );
}

export interface CanjearCouponViewProps {
  mode: "public" | "club";
  initialCode?: string;
  initialPreview?: CouponPreviewState | null;
  storyOverride?: {
    accountsEnabled?: boolean;
    hasAccountSession?: boolean;
    preview?: CouponPreviewState | null;
    redeemStatus?: "idle" | "redeemed" | "error";
    redeemMessage?: string;
    redeemDays?: number;
  };
}

export function CanjearCouponView({
  mode,
  initialCode = "",
  initialPreview = null,
  storyOverride,
}: CanjearCouponViewProps): React.JSX.Element {
  const {
    accountsEnabled: ctxAccountsEnabled,
    hasAccountSessionAuth: ctxHasAccountSessionAuth,
    navigateTo,
  } = usePlatform();

  const accountsEnabled = storyOverride?.accountsEnabled ?? ctxAccountsEnabled;
  const hasAccountSession = storyOverride?.hasAccountSession ?? ctxHasAccountSessionAuth;
  const normalizedInitial = normalizeInputCode(initialCode);

  const [lookupCode, setLookupCode] = useState<string>(normalizedInitial);
  const [preview, setPreview] = useState<CouponPreviewState | null>(
    storyOverride?.preview !== undefined ? storyOverride.preview : initialPreview,
  );
  const [checkingPreview, setCheckingPreview] = useState<boolean>(false);
  const [redeemSuccess, setRedeemSuccess] = useState<boolean>(
    storyOverride?.redeemStatus === "redeemed",
  );
  const previewInputId = useId();

  const handleCheckCode = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const cleaned = normalizeInputCode(lookupCode);
      if (!cleaned) {
        setPreview({
          valid: false,
          reason: "no_existe",
          error: "Escribe el código de cupón para validarlo.",
        });
        return;
      }
      if (!accountsEnabled) {
        setPreview({
          valid: true,
          coupon: { code: cleaned, days: 15, expiresAtIso: null },
        });
        return;
      }
      setCheckingPreview(true);
      try {
        const res = await fetch(
          `/api/me/coupons/preview?codigo=${encodeURIComponent(cleaned)}`,
          { credentials: "same-origin" },
        );
        const json = (await res.json().catch(() => null)) as CouponPreviewState | null;
        if (json) setPreview(json);
      } catch (err) {
        void err;
        setPreview({
          valid: false,
          error: "No pudimos validar el código en este momento. Intenta de nuevo.",
        });
      } finally {
        setCheckingPreview(false);
      }
    },
    [accountsEnabled, lookupCode],
  );

  const activeCode = preview?.coupon?.code ?? (lookupCode || normalizedInitial);
  const nextClubUrl = activeCode
    ? `/app/canjear?codigo=${encodeURIComponent(activeCode)}`
    : "/app/canjear";

  const content = (
    <div className="max-w-2xl mx-auto space-y-5">
      {!accountsEnabled ? (
        <ExampleNotice>
          Vista previa del canje de cupones. Con cuentas activas valida disponibilidad y suma días reales al socio.
        </ExampleNotice>
      ) : null}

      <section className="glass-lens glass-ring glass-ring--featured relative overflow-hidden rounded-3xl p-5 sm:p-7 space-y-5">
        <LensGlowOrbs />

        <div className="relative z-10 space-y-2">
          <span className="pl-pill pl-pill--brand">
            <MaestroIcon name="gift" size={14} />
            <span>Cupón de acceso · Pase PitchLab Ultra</span>
          </span>
          <h1 className="m-0 text-2xl sm:text-3xl font-extrabold tracking-tight">
            {preview?.valid && preview.coupon
              ? `Este código suma +${preview.coupon.days} ${preview.coupon.days === 1 ? "día" : "días"} gratis`
              : "Canjea un cupón de acceso"}
          </h1>
          <p className="m-0 text-sm leading-relaxed" style={{ color: "var(--pl-text-secondary)" }}>
            Los días del cupón se acumulan al final de tu acceso vigente sin pedir tarjeta ni cobros automáticos.
          </p>
        </div>

        {/* Estado del código detectado por URL o validación */}
        {preview ? (
          <div
            className="relative z-10 glass-ring rounded-2xl p-4 space-y-2"
            style={{ background: "var(--pl-surface)" }}
            data-coupon-preview={preview.valid ? "valid" : "invalid"}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-extrabold tracking-wider num text-base" style={{ color: "var(--pl-text)" }}>
                {preview.coupon?.code ?? activeCode}
              </span>
              {preview.valid && preview.coupon ? (
                <span className="pl-pill pl-pill--success num">
                  <MaestroIcon name="check" size={13} />
                  <span>+{preview.coupon.days} días disponibles</span>
                </span>
              ) : (
                <span className="pl-pill pl-pill--danger">
                  <MaestroIcon name="x" size={13} />
                  <span>No disponible</span>
                </span>
              )}
            </div>

            {preview.valid && preview.coupon?.expiresAtIso ? (
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Válido para canjear hasta el {formatCouponDate(preview.coupon.expiresAtIso)}.
              </p>
            ) : null}

            {!preview.valid && preview.error ? (
              <p className="m-0 text-xs font-semibold" style={{ color: "var(--pl-danger)" }} role="alert">
                {preview.error}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Flujo según sesión */}
        <div className="relative z-10 space-y-4">
          {mode === "public" && !hasAccountSession && accountsEnabled ? (
            <>
              <form onSubmit={handleCheckCode} noValidate className="space-y-2">
                <label
                  htmlFor={previewInputId}
                  className="block text-xs font-semibold"
                  style={{ color: "var(--pl-text-secondary)" }}
                >
                  ¿Tienes otro código? Revísalo aquí
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id={previewInputId}
                    type="text"
                    value={lookupCode}
                    maxLength={32}
                    placeholder="PL-XXXX-XXXX"
                    onChange={(e) => setLookupCode(normalizeInputCode(e.target.value))}
                    className="glass-input flex-1 min-h-[44px] px-3.5 text-base font-extrabold uppercase tracking-wider num"
                  />
                  <button
                    type="submit"
                    disabled={checkingPreview}
                    className="pl-btn-glass glass-ring min-h-[44px] px-4 text-sm shrink-0"
                  >
                    {checkingPreview ? "Validando…" : "Validar código"}
                  </button>
                </div>
              </form>

              <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <a
                  href={`/signup?next=${encodeURIComponent(nextClubUrl)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo(`/signup?next=${encodeURIComponent(nextClubUrl)}`);
                  }}
                  className="pl-btn-primary min-h-[44px] flex-1 text-sm"
                >
                  <span>Crear cuenta y canjear</span>
                  <MaestroIcon name="arrowRight" size={15} />
                </a>
                <a
                  href={`/login?next=${encodeURIComponent(nextClubUrl)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo(`/login?next=${encodeURIComponent(nextClubUrl)}`);
                  }}
                  className="pl-btn-glass glass-ring min-h-[44px] flex-1 text-sm"
                >
                  <span>Ya tengo cuenta · Iniciar sesión</span>
                </a>
              </div>
            </>
          ) : (
            <>
              <CouponRedeemBox
                initialCode={activeCode}
                hasAccountSessionOverride={storyOverride?.hasAccountSession}
                onRedeemed={() => setRedeemSuccess(true)}
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

              {redeemSuccess ? (
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <a
                    href="/app"
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo("/app");
                    }}
                    className="pl-btn-primary min-h-[44px] px-5 text-sm"
                  >
                    <span>Entrar al tablero</span>
                    <MaestroIcon name="arrowRight" size={15} />
                  </a>
                  <a
                    href="/app/account?tab=plan"
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo("/app/account?tab=plan");
                    }}
                    className="pl-btn-glass glass-ring min-h-[44px] px-4 text-sm"
                  >
                    <span>Ver Mi plan</span>
                  </a>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );

  if (mode === "club") {
    return (
      <AtmosphereStage>
        <ClubWorkspaceShell activePath="/app/account">{content}</ClubWorkspaceShell>
      </AtmosphereStage>
    );
  }

  return (
    <AtmosphereStage activePath="/precio">
      <PublicHeaderV4 activePath="/precio" />
      <main id="main" className="pl-page-enter px-4 sm:px-6 pt-8 sm:pt-12 pb-16">
        {content}
      </main>
      <PublicFooterV4 />
    </AtmosphereStage>
  );
}
