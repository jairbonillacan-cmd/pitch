"use client";

import React, { useCallback, useId, useState } from "react";
import { Button, SofascoreCard } from "../../components/ui/primitives";
import { useSafeEffect } from "../hooks";
import { usePlatformActions, usePlatformCore } from "../platform-provider";
import { lookupPreviewCoupon, redeemPreviewCoupon } from "../preview-spei-store";
import { MaestroIcon } from "./MaestroPrimitives";
import {
  AtmosphereStage,
  ClubWorkspaceShell,
  PublicFooterV4,
  PublicHeaderV4,
} from "./ShellChrome";

export interface CouponPreviewState {
  valid: boolean;
  reason?:
    | "no_existe"
    | "inactivo"
    | "vencido"
    | "agotado"
    | "ya_canjeado"
    | "cuenta_distinta"
    | "no_configurado";
  error?: string;
  coupon?: {
    code: string;
    days: number;
    maxRedemptions?: number | null;
    expiresAtIso: string | null;
    isTransferCoupon?: boolean;
    isPersonal?: boolean;
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

function sanitizeCouponPreviewState(
  raw: CouponPreviewState | null,
): CouponPreviewState | null {
  if (!raw) return null;
  if (raw.reason === "cuenta_distinta") {
    return {
      valid: false,
      reason: "cuenta_distinta",
      error: raw.error ?? "Este cupón está reservado para otra cuenta.",
      coupon: null,
    };
  }
  return raw;
}

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
  const { accountsEnabled, hasAccountSessionAuth } = usePlatformCore();
  const { pushToast } = usePlatformActions();
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
  const errorId = useId();

  useSafeEffect(() => {
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
        const previewRes = redeemPreviewCoupon(cleaned);
        if (!previewRes.ok) {
          setStatus("error");
          setMessage(previewRes.error);
          return;
        }
        setStatus("redeemed");
        setGrantedDays(previewRes.days);
        setNewUntilIso(previewRes.newAccessUntilIso);
        const untilPreview = formatCouponDate(previewRes.newAccessUntilIso);
        const okPreview = previewRes.transferActivated
          ? `¡Cupón ${previewRes.code} canjeado! Tu suscripción Pase PitchLab Ultra quedó activa por +${previewRes.days} días${
              untilPreview ? ` (hasta el ${untilPreview})` : ""
            }.`
          : `Vista previa lista: con cuentas activas el código ${previewRes.code} sumaría +${previewRes.days} días a tu cuenta.`;
        setMessage(okPreview);
        pushToast(`+${previewRes.days} días abonados a tu pase`, "success");
        onRedeemed?.({
          code: previewRes.code,
          days: previewRes.days,
          newAccessUntilIso: previewRes.newAccessUntilIso,
        });
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
          transferActivated?: boolean;
          newAccessUntilIso?: string | null;
          error?: string;
        } | null;

        if (!res.ok || !json?.ok) {
          setStatus("error");
          setMessage(
            json?.error ?? "No se pudo canjear el cupón. Revisa el código e intenta de nuevo.",
          );
          return;
        }

        const redeemedDays = json.days ?? 1;
        setStatus("redeemed");
        setGrantedDays(redeemedDays);
        setNewUntilIso(json.newAccessUntilIso ?? null);
        const untilText = formatCouponDate(json.newAccessUntilIso);
        const okText = json.transferActivated
          ? `¡Cupón ${json.code ?? cleaned} canjeado! Tu suscripción Pase PitchLab Ultra quedó activa por +${redeemedDays} días${
              untilText ? ` (hasta el ${untilText})` : ""
            }.`
          : untilText
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
        className="block text-xs font-semibold text-[var(--pl-text-secondary)]"
      >
        Código de cupón
      </label>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <input
          id={inputId}
          type="text"
          name="codigo"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="done"
          maxLength={32}
          placeholder="PL-XXXX-XXXX"
          aria-invalid={status === "error" ? "true" : undefined}
          aria-describedby={status === "error" ? errorId : undefined}
          value={code}
          onChange={(e) => {
            setCode(normalizeInputCode(e.target.value));
            if (status === "error") {
              setStatus("idle");
              setMessage("");
            }
          }}
          className="flex-1 min-w-0 min-h-11 rounded-xl border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] px-3.5 text-base font-extrabold uppercase tracking-wider text-[var(--pl-text)] num focus-visible:outline-2 focus-visible:outline-[var(--pl-brand)] focus-visible:outline-offset-1"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={busy}
          data-redeem-submit=""
          className="shrink-0"
        >
          <MaestroIcon name="ticket" size={16} />
          <span>{busy ? "Canjeando…" : "Canjear cupón"}</span>
        </Button>
      </div>

      {status === "error" && message ? (
        <p
          id={errorId}
          role="alert"
          className="m-0 text-xs font-semibold leading-relaxed text-[var(--pl-danger)]"
          data-coupon-feedback="error"
        >
          {message}
        </p>
      ) : null}

      {status === "redeemed" && message ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-[var(--pl-pill-success-border)] bg-[var(--pl-surface-elevated)] p-3 space-y-1.5"
          data-coupon-feedback="success"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="pl-pill pl-pill--success num">
              <MaestroIcon name="check" size={13} />
              <span>+{grantedDays ?? 0} días sumados</span>
            </span>
            {newUntilIso ? (
              <span className="text-xs font-semibold num text-[var(--pl-text-muted)]">
                Vigente hasta {formatCouponDate(newUntilIso)}
              </span>
            ) : null}
          </div>
          <p className="m-0 text-xs leading-relaxed text-[var(--pl-text)]">{message}</p>
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
  } = usePlatformCore();
  const { navigateTo } = usePlatformActions();

  const accountsEnabled = storyOverride?.accountsEnabled ?? ctxAccountsEnabled;
  const hasAccountSession = storyOverride?.hasAccountSession ?? ctxHasAccountSessionAuth;
  const normalizedInitial = normalizeInputCode(initialCode);

  const [lookupCode, setLookupCode] = useState<string>(normalizedInitial);
  const [preview, setPreview] = useState<CouponPreviewState | null>(() =>
    sanitizeCouponPreviewState(
      storyOverride?.preview !== undefined ? storyOverride.preview : initialPreview,
    ),
  );
  const [checkingPreview, setCheckingPreview] = useState<boolean>(false);
  const [redeemSuccess, setRedeemSuccess] = useState<boolean>(
    storyOverride?.redeemStatus === "redeemed",
  );
  const previewInputId = useId();

  useSafeEffect(() => {
    if (accountsEnabled || storyOverride || !normalizedInitial) return;
    const looked = lookupPreviewCoupon(normalizedInitial);
    if (looked.found) {
      setPreview(
        sanitizeCouponPreviewState({
          valid: looked.valid,
          reason: looked.reason,
          error: looked.error,
          coupon: looked.coupon ?? null,
        }),
      );
    }
  }, [accountsEnabled, normalizedInitial, storyOverride]);

  const handleCheckCode = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const cleaned = normalizeInputCode(lookupCode);
      if (!cleaned) {
        setPreview({
          valid: false,
          reason: "no_existe",
          error: "Escribe el código de cupón para validarlo.",
          coupon: null,
        });
        return;
      }
      if (!accountsEnabled) {
        const looked = lookupPreviewCoupon(cleaned);
        if (looked.found) {
          setPreview(
            sanitizeCouponPreviewState({
              valid: looked.valid,
              reason: looked.reason,
              error: looked.error,
              coupon: looked.coupon ?? null,
            }),
          );
          return;
        }
        setPreview({
          valid: true,
          coupon: { code: cleaned, days: 15, maxRedemptions: 1, expiresAtIso: null },
        });
        return;
      }
      if (!hasAccountSession) {
        setPreview({
          valid: false,
          error: "Inicia sesión o crea tu cuenta para validar y canjear este cupón.",
          coupon: null,
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
        if (json) {
          setPreview(sanitizeCouponPreviewState(json));
        } else {
          setPreview({
            valid: false,
            error: "No pudimos validar el código en este momento. Intenta de nuevo.",
            coupon: null,
          });
        }
      } catch (err) {
        void err;
        setPreview({
          valid: false,
          error: "No pudimos validar el código en este momento. Intenta de nuevo.",
          coupon: null,
        });
      } finally {
        setCheckingPreview(false);
      }
    },
    [accountsEnabled, hasAccountSession, lookupCode],
  );

  const safePreview = sanitizeCouponPreviewState(preview);
  const isRestrictedOtherAccount = safePreview?.reason === "cuenta_distinta";
  const activeCode = isRestrictedOtherAccount
    ? ""
    : (safePreview?.coupon?.code ?? (lookupCode || normalizedInitial));
  const nextClubUrl = activeCode
    ? `/app/canjear?codigo=${encodeURIComponent(activeCode)}`
    : "/app/canjear";

  const content = (
    <div className="max-w-2xl mx-auto space-y-5 min-w-0">
      {!accountsEnabled ? (
        <div
          role="note"
          data-example-notice=""
          className="flex flex-col gap-1.5 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3.5 py-3 min-w-0"
          style={{ borderInlineStart: "3px solid var(--pl-warning)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="pl-pill pl-pill--warning" data-example-badge="">
              <MaestroIcon name="eye" size={13} />
              <span>Ejemplo</span>
            </span>
            <strong className="text-[13px] font-bold text-[var(--pl-text)]">
              Contenido de ejemplo
            </strong>
          </div>
          <p className="m-0 text-[13px] leading-relaxed text-[var(--pl-text-secondary)]">
            Vista previa del canje de cupones. Con cuentas activas valida disponibilidad y suma días
            reales al socio.
          </p>
        </div>
      ) : null}

      <SofascoreCard as="section" className="min-w-0">
        <div className="space-y-5 p-1 sm:p-2">
          <div className="space-y-2.5">
            <span className="pl-pill pl-pill--brand">
              <MaestroIcon name="gift" size={14} />
              <span>Cupón de acceso · Pase PitchLab Ultra</span>
            </span>
            <h1 className="m-0 text-2xl sm:text-3xl font-extrabold tracking-tight [text-wrap:balance] text-[var(--pl-text)]">
              {safePreview?.valid && safePreview.coupon
                ? `Canjea un cupón de acceso · +${safePreview.coupon.days} ${safePreview.coupon.days === 1 ? "día" : "días"}`
                : "Canjea un cupón de acceso"}
            </h1>
            <p className="m-0 text-sm leading-relaxed [text-wrap:pretty] text-[var(--pl-text-secondary)]">
              Si confirmamos tu transferencia SPEI, ingresa aquí el cupón de un solo uso que
              recibiste desde <strong className="num">noreply@pitchlab.mx</strong> para activar tu
              suscripción. Los días se acumulan sin pedir tarjeta ni cobros automáticos.
            </p>
          </div>

          {safePreview ? (
            <div
              className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] p-4 space-y-2"
              data-coupon-preview={safePreview.valid ? "valid" : "invalid"}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  {!isRestrictedOtherAccount && (safePreview.coupon?.code || activeCode) ? (
                    <span className="font-extrabold tracking-wider num text-base text-[var(--pl-text)] break-all">
                      {safePreview.coupon?.code ?? activeCode}
                    </span>
                  ) : null}
                  {!isRestrictedOtherAccount && safePreview.coupon?.maxRedemptions === 1 ? (
                    <span className="pl-pill pl-pill--info">Un solo uso</span>
                  ) : null}
                  {!isRestrictedOtherAccount &&
                  (safePreview.coupon?.isTransferCoupon || safePreview.coupon?.isPersonal) ? (
                    <span className="pl-pill pl-pill--brand">Transferencia SPEI</span>
                  ) : null}
                </div>
                {safePreview.valid && safePreview.coupon ? (
                  <span className="pl-pill pl-pill--success num">
                    <MaestroIcon name="check" size={13} />
                    <span>+{safePreview.coupon.days} días disponibles</span>
                  </span>
                ) : (
                  <span className="pl-pill pl-pill--danger">
                    <MaestroIcon name="x" size={13} />
                    <span>No disponible</span>
                  </span>
                )}
              </div>

              {!isRestrictedOtherAccount && safePreview.coupon?.expiresAtIso ? (
                <p className="m-0 text-xs text-[var(--pl-text-muted)]">
                  Vigencia para canjear: hasta el {formatCouponDate(safePreview.coupon.expiresAtIso)}.
                </p>
              ) : null}

              {!safePreview.valid && safePreview.error ? (
                <p
                  className="m-0 text-xs font-semibold text-[var(--pl-danger)]"
                  role="alert"
                >
                  {safePreview.error}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-4">
            {mode === "public" && !hasAccountSession && accountsEnabled ? (
              <>
                <form onSubmit={handleCheckCode} noValidate className="space-y-2">
                  <label
                    htmlFor={previewInputId}
                    className="block text-xs font-semibold text-[var(--pl-text-secondary)]"
                  >
                    ¿Tienes otro código? Revísalo aquí
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      id={previewInputId}
                      type="text"
                      value={lookupCode}
                      maxLength={32}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      enterKeyHint="done"
                      placeholder="PL-XXXX-XXXX"
                      onChange={(e) => setLookupCode(normalizeInputCode(e.target.value))}
                      className="flex-1 min-w-0 min-h-11 rounded-xl border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] px-3.5 text-base font-extrabold uppercase tracking-wider text-[var(--pl-text)] num focus-visible:outline-2 focus-visible:outline-[var(--pl-brand)] focus-visible:outline-offset-1"
                    />
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={checkingPreview}
                      className="shrink-0"
                    >
                      {checkingPreview ? "Validando…" : "Validar código"}
                    </Button>
                  </div>
                </form>

                <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <Button
                    variant="primary"
                    nativeButton={false}
                    className="flex-1"
                    render={
                      <a
                        href={`/signup?next=${encodeURIComponent(nextClubUrl)}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigateTo(`/signup?next=${encodeURIComponent(nextClubUrl)}`);
                        }}
                      />
                    }
                  >
                    <span>Crear cuenta y canjear</span>
                    <MaestroIcon name="arrowRight" size={15} />
                  </Button>
                  <Button
                    variant="secondary"
                    nativeButton={false}
                    className="flex-1"
                    render={
                      <a
                        href={`/login?next=${encodeURIComponent(nextClubUrl)}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigateTo(`/login?next=${encodeURIComponent(nextClubUrl)}`);
                        }}
                      />
                    }
                  >
                    <span>Ya tengo cuenta · Iniciar sesión</span>
                  </Button>
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
                    <Button
                      variant="primary"
                      nativeButton={false}
                      render={
                        <a
                          href="/app"
                          onClick={(e) => {
                            e.preventDefault();
                            navigateTo("/app");
                          }}
                        />
                      }
                    >
                      <span>Entrar al tablero</span>
                      <MaestroIcon name="arrowRight" size={15} />
                    </Button>
                    <Button
                      variant="secondary"
                      nativeButton={false}
                      render={
                        <a
                          href="/app/account?tab=plan"
                          onClick={(e) => {
                            e.preventDefault();
                            navigateTo("/app/account?tab=plan");
                          }}
                        />
                      }
                    >
                      <span>Ver Mi plan</span>
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </SofascoreCard>
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
      <main id="main" tabIndex={-1} className="pl-page-enter px-4 sm:px-6 pt-8 sm:pt-12 pb-16">
        {content}
      </main>
      <PublicFooterV4 />
    </AtmosphereStage>
  );
}
