"use client";

import React, { useEffect, useRef, useState } from "react";
import { getLogoPath } from "@pitchlab/sports-assets";
import { LeagueBadge, TeamBadge } from "../../sports";
import {
  canRevealPickOnShare,
  formatEdgePts,
  formatOddsValue,
  getSessionWatermark,
  pickReferenceDecimal,
} from "../access-guard";
import { usePlatform } from "../platform-provider";
import { downloadTicketPng, type TicketRasterContent } from "./share-ticket-raster";
import { TIPSTER_CREATORS } from "../spacetime-catalog";
import type { MatchPick, PlatformGame, ViewerRole } from "../types";
import {
  ExampleBadge,
  LensGlowOrbs,
  MaestroIcon,
  type MaestroIconName,
} from "./MaestroPrimitives";

export function TopLayerModalDialog({
  open,
  onClose,
  ariaLabel,
  ariaLabelledBy,
  variant = "modal",
  maxWidth = "32rem",
  children,
}: {
  open: boolean;
  onClose: () => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  variant?: "modal" | "drawer";
  maxWidth?: string;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.open) {
      dialog.showModal();
    }

    const handleClose = () => {
      // En desarrollo (StrictMode) el efecto se monta dos veces: el «close» del
      // primer desmontaje llega cuando el diálogo ya se volvió a abrir.
      if (dialog.open) return;
      dialog.returnValue = "";
      onCloseRef.current();
    };
    dialog.addEventListener("close", handleClose);

    let cleanupLightDismiss: (() => void) | undefined;
    if (
      typeof HTMLDialogElement !== "undefined" &&
      !("closedBy" in HTMLDialogElement.prototype)
    ) {
      const isOutside = (e: PointerEvent) => {
        if (e.target !== dialog) return false;
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        );
      };
      let pressedOutside = false;
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) {
          dialog.close();
        }
      };
      dialog.addEventListener("pointerdown", onPointerDown);
      dialog.addEventListener("pointerup", onPointerUp);
      cleanupLightDismiss = () => {
        dialog.removeEventListener("pointerdown", onPointerDown);
        dialog.removeEventListener("pointerup", onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener("close", handleClose);
      cleanupLightDismiss?.();
      if (dialog.open) {
        dialog.close();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      className={variant === "drawer" ? "pl-native-drawer" : "pl-native-dialog"}
      style={
        variant === "modal"
          ? ({ "--pl-dialog-max-w": maxWidth } as React.CSSProperties)
          : undefined
      }
    >
      {children}
    </dialog>
  );
}

export function ParlayFloatingDock(): React.JSX.Element | null {
  const {
    parlaySummary,
    oddsFormat,
    clearParlay,
    sealParlayToJournal,
    openShareTicket,
    navigateTo,
  } = usePlatform();

  if (parlaySummary.legs.length === 0) {
    return null;
  }

  return (
    <aside
      className="parlay-dock glass-pill-bar glass-ring"
      aria-label="Boleto combinado activo"
      data-parlay-dock=""
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="pl-pill pl-pill--brand num inline-flex items-center gap-1.5">
            <MaestroIcon name="layers" size={13} />
            {parlaySummary.legs.length}{" "}
            {parlaySummary.legs.length === 1 ? "pick" : "picks"}
          </span>
          {parlaySummary.hasSgpCorrelation ? (
            <span className="pl-pill pl-pill--info">Mismo partido</span>
          ) : null}
          <div className="min-w-0">
            <p className="m-0 text-sm font-bold truncate">
              Prob. conjunta{" "}
              <span className="num">
                {(parlaySummary.combinedProbability * 100).toFixed(1)} %
              </span>{" "}
              · Cuota{" "}
              <span className="num">
                {formatOddsValue(parlaySummary.bookDecimal, oddsFormat)}
              </span>
            </p>
            <p
              className="m-0 text-xs"
              style={{ color: "var(--pl-text-muted)" }}
            >
              Justa Geodesic:{" "}
              <span className="num">
                {formatOddsValue(parlaySummary.fairDecimal, oddsFormat)}
              </span>{" "}
              · Retorno est.{" "}
              <span
                className="num font-semibold"
                style={{ color: "var(--pl-success)" }}
              >
                {parlaySummary.projectedReturnUnits.toFixed(2)}u
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="pl-btn-glass text-xs"
            onClick={() => navigateTo("/app/parlays")}
          >
            Ver boleto
          </button>
          <button
            type="button"
            className="pl-btn-glass text-xs inline-flex items-center gap-1.5"
            onClick={() =>
              openShareTicket({
                kind: "parlay",
                title: `Combinada PitchLab (${parlaySummary.legs.length} picks)`,
                subtitle: parlaySummary.hasSgpCorrelation
                  ? "Mismo partido, con ajuste por correlación"
                  : "Multi-liga calibrada con Spacetime Suite v3.0",
                leagueLabel: "Parlay Inteligente",
                pickLabel: parlaySummary.legs
                  .map((l) => l.pick.label)
                  .join(" + "),
                probability: parlaySummary.combinedProbability,
                fairDecimal: parlaySummary.fairDecimal,
                marketDecimal: parlaySummary.bookDecimal,
                units: parlaySummary.stakeUnits,
                gameStatus: "NS",
              })
            }
          >
            <MaestroIcon name="share" size={13} />
            Compartir
          </button>
          <button
            type="button"
            className="pl-btn-primary text-xs inline-flex items-center gap-1.5"
            disabled={parlaySummary.legs.length < 2}
            onClick={() => sealParlayToJournal()}
          >
            <MaestroIcon name="check" size={13} />
            Sellar {parlaySummary.stakeUnits.toFixed(1)}u
          </button>
          <button
            type="button"
            className="pl-btn-glass px-2.5 text-xs"
            aria-label="Vaciar boleto combinado"
            onClick={clearParlay}
          >
            <MaestroIcon name="x" size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export function PickComposerModal(): React.JSX.Element | null {
  const { composerPick, closeComposer, sealPickToJournal, oddsFormat } =
    usePlatform();
  const [units, setUnits] = useState<number>(1.5);
  const [userDec, setUserDec] = useState<string>("1.95");
  const [oddsMode, setOddsMode] = useState<"observed" | "manual">("observed");
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    if (composerPick) {
      setUnits(composerPick.suggestedUnits);
      setUserDec(pickReferenceDecimal(composerPick).toFixed(2));
      setOddsMode("observed");
      setNote("");
    }
  }, [composerPick]);

  if (!composerPick) return null;

  const parsedDec = Math.max(
    1.05,
    Number(userDec.replace(",", ".")) || pickReferenceDecimal(composerPick),
  );
  const clvLivePct =
    Math.round((parsedDec / composerPick.fairDecimal - 1) * 1000) / 10;
  const evLivePct = Math.round((composerPick.p * parsedDec - 1) * 1000) / 10;
  const edgeLive = Math.round((composerPick.p - 1 / parsedDec) * 1000) / 10;

  const valuePresetDec = Number((composerPick.fairDecimal * 1.05).toFixed(2));
  const quickPresets = [
    {
      id: "fair",
      label: "Justa",
      dec: Number(composerPick.fairDecimal.toFixed(2)),
      mode: "manual" as const,
    },
    {
      id: "market",
      label: "Mercado",
      dec: Number(pickReferenceDecimal(composerPick).toFixed(2)),
      mode: "observed" as const,
    },
    {
      id: "value",
      label: "Valor +5%",
      dec: valuePresetDec,
      mode: "manual" as const,
    },
  ];

  const stepUnits = (delta: number) => {
    setUnits((u) => {
      const next = Math.round((u + delta) * 100) / 100;
      return Math.min(5, Math.max(0.25, next));
    });
  };

  return (
    <TopLayerModalDialog
      open={Boolean(composerPick)}
      onClose={closeComposer}
      ariaLabelledBy="composer-modal-title"
      maxWidth="30rem"
    >
      <div className="glass-lens glass-ring glass-ring--featured relative overflow-hidden w-full rounded-2xl p-6">
        <LensGlowOrbs subtle />
        <div className="relative z-10 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="pl-pill pl-pill--brand inline-flex items-center gap-1">
                  <MaestroIcon name="shield" size={12} />
                  Sellado antes del partido
                </span>
                <span className="pl-pill pl-pill--neutral">{composerPick.categoryLabel}</span>
              </div>
              <h2
                id="composer-modal-title"
                className="m-0 mt-2 text-lg font-extrabold leading-snug"
              >
                {composerPick.label}
              </h2>
              <p
                className="m-0 mt-0.5 text-xs"
                style={{ color: "var(--pl-text-muted)" }}
              >
                {composerPick.leagueLabel} · {composerPick.matchLabel}
              </p>
            </div>
            <button
              type="button"
              className="pl-btn-glass px-2.5 shrink-0"
              aria-label="Cerrar ventana de sellado"
              onClick={closeComposer}
            >
              <MaestroIcon name="x" size={15} />
            </button>
          </div>

          <div className="ticket-perf" />

          <div className="grid grid-cols-3 gap-2.5 text-sm">
            <div
              className="glass-card glass-ring rounded-xl p-3"
              style={{ background: "var(--pl-surface)" }}
            >
              <span
                className="block text-[11px]"
                style={{ color: "var(--pl-text-muted)" }}
              >
                Prob. Suite
              </span>
              <strong className="num text-base font-extrabold">
                {(composerPick.p * 100).toFixed(1)} %
              </strong>
            </div>
            <div
              className="glass-card glass-ring rounded-xl p-3"
              style={{ background: "var(--pl-surface)" }}
            >
              <span
                className="block text-[11px]"
                style={{ color: "var(--pl-text-muted)" }}
              >
                Momio justo
              </span>
              <strong className="num text-base font-extrabold">
                {formatOddsValue(composerPick.fairDecimal, oddsFormat)}
              </strong>
            </div>
            <div
              className="glass-card glass-ring rounded-xl p-3"
              style={{ background: "var(--pl-surface)" }}
            >
              <span
                className="block text-[11px]"
                style={{ color: "var(--pl-text-muted)" }}
              >
                Retorno est.
              </span>
              <strong
                className="num text-base font-extrabold"
                style={{ color: "var(--pl-success)" }}
              >
                {(units * parsedDec).toFixed(2)}u
              </strong>
            </div>
          </div>

          <div className="space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="block text-sm font-semibold">
                  Unidades simuladas (0.25u – 5.0u)
                </span>
                <span
                  className="block text-xs"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  Paso fino de 0.25u para gestión disciplinada
                </span>
              </div>
              <div
                className="sl-stepper glass-ring"
                role="group"
                aria-label="Ajustar unidades"
              >
                <button
                  type="button"
                  aria-label="Restar un cuarto de unidad"
                  disabled={units <= 0.25}
                  onClick={() => stepUnits(-0.25)}
                >
                  <MaestroIcon name="minus" size={14} />
                </button>
                <span className="num font-extrabold">{units.toFixed(2)}u</span>
                <button
                  type="button"
                  aria-label="Sumar un cuarto de unidad"
                  disabled={units >= 5}
                  onClick={() => stepUnits(0.25)}
                >
                  <MaestroIcon name="plus" size={14} />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="composer-odds-input"
                  className="text-xs font-semibold"
                >
                  Cuota decimal para auditoría CLV
                </label>
                <div
                  className="seg-well glass-ring"
                  role="group"
                  aria-label="Modo de captura de cuota"
                >
                  <button
                    type="button"
                    className="seg-btn !min-h-[26px] !px-2.5 !text-[11px]"
                    aria-pressed={oddsMode === "observed"}
                    onClick={() => {
                      setOddsMode("observed");
                      setUserDec(pickReferenceDecimal(composerPick).toFixed(2));
                    }}
                  >
                    Cuota observada
                  </button>
                  <button
                    type="button"
                    className="seg-btn !min-h-[26px] !px-2.5 !text-[11px]"
                    aria-pressed={oddsMode === "manual"}
                    onClick={() => setOddsMode("manual")}
                  >
                    Manual
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {quickPresets.map((preset) => {
                  const isActive =
                    Math.abs(parsedDec - preset.dec) < 0.005 &&
                    oddsMode === preset.mode;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => {
                        setOddsMode(preset.mode);
                        setUserDec(preset.dec.toFixed(2));
                      }}
                      className="pl-btn-glass !min-h-[28px] !px-2.5 text-xs num inline-flex items-center gap-1"
                      style={
                        isActive
                          ? {
                              borderColor: "var(--pl-pill-brand-border)",
                              background: "var(--pl-pill-brand-bg)",
                              color: "var(--pl-pill-brand-fg)",
                            }
                          : undefined
                      }
                    >
                      <span>{preset.label}</span>
                      <span className="font-extrabold">
                        {preset.dec.toFixed(2)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="composer-odds-input"
                  type="text"
                  autoFocus
                  inputMode="decimal"
                  value={userDec}
                  onChange={(e) => {
                    setOddsMode("manual");
                    setUserDec(e.target.value);
                  }}
                  className="glass-input w-full px-3 py-2 text-sm num font-bold"
                />
                <span
                  className={`pl-pill num shrink-0 ${
                    evLivePct >= 0 ? "pl-pill--success" : "pl-pill--warning"
                  }`}
                >
                  CLV {clvLivePct >= 0 ? "+" : ""}
                  {clvLivePct.toFixed(1)} % · EV {evLivePct >= 0 ? "+" : ""}
                  {evLivePct.toFixed(1)} %
                </span>
              </div>

              <p
                className="m-0 text-xs num font-semibold"
                style={{
                  color:
                    edgeLive >= 0 ? "var(--pl-success)" : "var(--pl-warning)",
                }}
              >
                {edgeLive >= 0
                  ? `Ventaja positiva +${edgeLive.toFixed(1)} pts sobre la cuota (${oddsMode === "observed" ? "Cuota observada" : "Captura manual"})`
                  : `Margen en contra ${edgeLive.toFixed(1)} pts frente al momio justo Geodesic`}
              </p>
            </div>

            <div>
              <label
                htmlFor="composer-note-input"
                className="block text-xs font-semibold mb-1"
              >
                Nota táctica opcional
              </label>
              <input
                id="composer-note-input"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. Tomada antes del reporte de bajas"
                className="glass-input w-full px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              className="pl-btn-glass"
              onClick={closeComposer}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="pl-btn-primary inline-flex items-center gap-1.5 num"
              onClick={() =>
                sealPickToJournal(
                  composerPick,
                  units,
                  parsedDec,
                  note || undefined,
                )
              }
            >
              <MaestroIcon name="check" size={15} />
              Sellar en Bitácora ({units.toFixed(2)}u)
            </button>
          </div>
        </div>
      </div>
    </TopLayerModalDialog>
  );
}

export function ShareTicketModal(): React.JSX.Element | null {
  const {
    shareTicket,
    closeShareTicket,
    viewerRole,
    oddsFormat,
    pushToast,
    viewerIdentity,
    memberReferralsSnapshot,
  } = usePlatform();
  const [aspect, setAspect] = useState<"4:5" | "9:16">("4:5");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const ticketRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCopyState("idle");
  }, [shareTicket]);

  if (!shareTicket) return null;

  const isTipsterPromo = shareTicket.kind === "tipster";
  const revealSelection = canRevealPickOnShare(
    shareTicket.gameStatus,
    viewerRole,
    isTipsterPromo,
  );
  const watermark = getSessionWatermark(viewerRole, viewerIdentity);
  const slug = shareTicket.pickSlug || (isTipsterPromo ? "sofia-sem" : "");
  const codeParam =
    shareTicket.promoCode ||
    memberReferralsSnapshot?.referralCode ||
    viewerIdentity?.referralCode ||
    "";
  const sharePath = slug
    ? `/p/${encodeURIComponent(slug)}${codeParam ? `?code=${encodeURIComponent(codeParam)}` : ""}`
    : codeParam
      ? `/i/${encodeURIComponent(codeParam)}`
      : "/precio";

  const handleCopyShareLink = async () => {
    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}${sharePath}`
        : `https://pitchlab.mx${sharePath}`;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("no_clipboard");
      }
      await navigator.clipboard.writeText(shareUrl);
      setCopyState("copied");
      pushToast(
        codeParam
          ? "Enlace del boleto copiado con tu código."
          : "Enlace del boleto copiado.",
        "success",
      );
    } catch (err) {
      void err;
      setCopyState("error");
      pushToast("No se pudo copiar automáticamente. Selecciona y copia el enlace.", "warning");
    }
  };

  const handleDownloadTicket = () => {
    const card = ticketRef.current;
    if (!card) return;
    const units = `${shareTicket.units.toFixed(1)}u`;
    const footerLine = shareTicket.promoCode
      ? `CÓDIGO: ${shareTicket.promoCode} · 5 días gratis`
      : "7 días gratis + 15d ambos al suscribirse";
    const base = {
      aspect,
      leagueLabel: shareTicket.leagueLabel,
      title: shareTicket.title,
      subtitle: shareTicket.subtitle,
      units,
      footerLine,
      footerSub: "pitchlab.mx · +18 · Unidades simuladas",
      watermark,
    };
    const content: TicketRasterContent = revealSelection
      ? {
          ...base,
          badge: isTipsterPromo
            ? (shareTicket.originBadge ?? "PICK ABIERTO DE LA SEMANA")
            : "RESULTADO AUDITADO FT",
          badgeTone: "success",
          mainLine: shareTicket.pickLabel,
          detailLine: `Prob. ${(shareTicket.probability * 100).toFixed(1)} % · Momio ${formatOddsValue(shareTicket.marketDecimal, oddsFormat)} (Justa ${formatOddsValue(shareTicket.fairDecimal, oddsFormat)})`,
        }
      : {
          ...base,
          badge: "SELECCIÓN SELLADA HASTA EL INICIO",
          badgeTone: "warning",
          mainLine: `Pick registrado en Bitácora PitchLab (${(shareTicket.probability * 100).toFixed(0)} % conf.)`,
          detailLine: "La selección exacta se revela al inicio del partido.",
        };
    const fileName = `pitchlab-boleto-${aspect === "9:16" ? "9x16" : "4x5"}.png`;
    downloadTicketPng(content, card, fileName).then(
      () => pushToast(`Boleto ${aspect === "9:16" ? "1080×1920" : "1080×1350"} descargado.`, "success"),
      () => pushToast("No se pudo generar la imagen del boleto.", "danger"),
    );
  };

  return (
    <TopLayerModalDialog
      open={Boolean(shareTicket)}
      onClose={closeShareTicket}
      ariaLabelledBy="share-modal-title"
      maxWidth="34rem"
    >
      <div className="glass-lens glass-ring glass-ring--featured relative overflow-hidden w-full rounded-2xl p-5">
        <LensGlowOrbs subtle />
        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="share-modal-title" className="m-0 text-base font-bold">
                Boleto Oficial para Redes Sociales
              </h2>
              <p
                className="m-0 text-xs"
                style={{ color: "var(--pl-text-muted)" }}
              >
                Protección anti-fuga activa antes del inicio (Q12)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="seg-well glass-ring"
                role="group"
                aria-label="Formato de historia"
              >
                <button
                  type="button"
                  className="seg-btn !min-h-[30px] !px-2.5 text-xs"
                  aria-pressed={aspect === "4:5"}
                  onClick={() => setAspect("4:5")}
                >
                  4:5 Feed
                </button>
                <button
                  type="button"
                  className="seg-btn !min-h-[30px] !px-2.5 text-xs"
                  aria-pressed={aspect === "9:16"}
                  onClick={() => setAspect("9:16")}
                >
                  9:16 Stories
                </button>
              </div>
              <button
                type="button"
                className="pl-btn-glass px-2.5"
                aria-label="Cerrar vista de boleto"
                onClick={closeShareTicket}
              >
                <MaestroIcon name="x" size={15} />
              </button>
            </div>
          </div>

          <div
            className={`share-ticket-card relative overflow-hidden mx-auto flex flex-col justify-between transition-all duration-200 ${
              aspect === "9:16" ? "px-5 py-7" : "p-5"
            }`}
            style={{
              maxWidth: aspect === "9:16" ? 306 : 382,
              minHeight: aspect === "9:16" ? 476 : 368,
            }}
            data-share-ticket=""
            data-share-aspect={aspect}
            ref={ticketRef}
          >
            <LensGlowOrbs
              primaryColor="var(--pl-aura-default-home)"
              secondaryColor="var(--pl-aura-default-away)"
            />

            <div className="relative z-10 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <img
                    src={getLogoPath("horizontal", "dark")}
                    alt="PitchLab"
                    className="h-5 w-auto object-contain"
                  />
                  <span
                    className="text-[10px] font-extrabold"
                    style={{ color: "var(--share-card-accent)" }}
                  >
                    SUITE v3.0
                  </span>
                </div>
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-bold num"
                  style={{
                    background: "var(--share-card-surface)",
                    color: "var(--share-card-fg)",
                  }}
                >
                  {shareTicket.leagueLabel}
                </span>
              </div>

              {shareTicket.tipsterHandle ? (
                <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={{
                    background: "var(--share-card-surface)",
                    color: "var(--share-card-accent)",
                  }}
                >
                  <MaestroIcon name="crown" size={12} />
                  <span>@{shareTicket.tipsterHandle} · Perfil de ejemplo</span>
                </div>
              ) : null}

              <div>
                <h3 className="m-0 text-lg font-extrabold leading-snug">
                  {shareTicket.title}
                </h3>
                <p
                  className="m-0 text-xs mt-1 leading-relaxed"
                  style={{ color: "var(--share-card-muted)" }}
                >
                  {shareTicket.subtitle}
                </p>
              </div>

              <div className="ticket-perf" />

              {revealSelection ? (
                <div
                  className="rounded-xl p-3.5 space-y-1.5"
                  style={{ background: "var(--share-card-surface)" }}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span
                      style={{ color: "var(--share-card-success)" }}
                      className="font-bold inline-flex items-center gap-1.5"
                    >
                      <MaestroIcon name="shield" size={13} />
                      {isTipsterPromo
                        ? shareTicket.originBadge ?? "PICK ABIERTO DE LA SEMANA"
                        : "RESULTADO AUDITADO FT"}
                    </span>
                    <span className="num font-extrabold">
                      {shareTicket.units.toFixed(1)}u
                    </span>
                  </div>
                  <p className="m-0 text-base font-extrabold">
                    {shareTicket.pickLabel}
                  </p>
                  <p
                    className="m-0 text-xs num"
                    style={{ color: "var(--share-card-secondary)" }}
                  >
                    Prob. {(shareTicket.probability * 100).toFixed(1)} % · Momio{" "}
                    {formatOddsValue(shareTicket.marketDecimal, oddsFormat)}{" "}
                    (Justa {formatOddsValue(shareTicket.fairDecimal, oddsFormat)}
                    )
                  </p>
                </div>
              ) : (
                <div
                  className="rounded-xl p-3.5 space-y-1.5"
                  style={{ background: "var(--share-card-surface)" }}
                  data-sealed-prekickoff=""
                >
                  <div className="flex items-center justify-between text-xs">
                    <span
                      style={{ color: "var(--share-card-warning)" }}
                      className="font-bold inline-flex items-center gap-1.5"
                    >
                      <MaestroIcon name="lock" size={13} />
                      SELECCIÓN SELLADA HASTA EL INICIO
                    </span>
                    <span className="num font-extrabold">
                      {shareTicket.units.toFixed(1)}u
                    </span>
                  </div>
                  <p className="m-0 text-sm font-bold">
                    Pick registrado en Bitácora PitchLab (
                    {(shareTicket.probability * 100).toFixed(0)} % conf.)
                  </p>
                  <p
                    className="m-0 text-xs leading-relaxed"
                    style={{ color: "var(--share-card-muted)" }}
                  >
                    La selección exacta permanece encriptada antes del kickoff
                    para proteger la ventaja de los socios.
                  </p>
                </div>
              )}
            </div>

            <div className="relative z-10 space-y-2.5 pt-4">
              <div className="ticket-perf" />
              <div
                className="rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs"
                style={{ background: "var(--share-card-surface)" }}
              >
                <div>
                  <span
                    className="block font-extrabold tracking-wide"
                    style={{ color: "var(--share-card-fg)" }}
                  >
                    {shareTicket.promoCode
                      ? `CÓDIGO: ${shareTicket.promoCode} · 5 días gratis`
                      : "7 días gratis + 15d ambos al suscribirse"}
                  </span>
                  <span style={{ color: "var(--share-card-muted)" }}>
                    pitchlab.mx · +18 Unidades simuladas
                  </span>
                </div>
                <span className="num font-bold opacity-70">{watermark}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className="text-xs"
              style={{ color: copyState === "error" ? "var(--pl-warning)" : "var(--pl-text-muted)" }}
              role={copyState === "error" ? "status" : undefined}
            >
              {copyState === "error"
                ? `No se pudo acceder al portapapeles. Enlace: pitchlab.mx${sharePath}`
                : revealSelection
                  ? "Selección visible (Partido cerrado o Pick abierto semanal de Tipster)."
                  : "Selección sellada automáticamente porque el encuentro aún no inicia."}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="pl-btn-glass text-xs inline-flex items-center gap-1.5"
                onClick={handleDownloadTicket}
              >
                <MaestroIcon name="download" size={14} />
                Descargar PNG
              </button>
              <button
                type="button"
                autoFocus
                className="pl-btn-primary text-xs inline-flex items-center gap-1.5"
                onClick={() => void handleCopyShareLink()}
              >
                <MaestroIcon name={copyState === "copied" ? "check" : "copy"} size={14} />
                {copyState === "copied"
                  ? "Enlace copiado"
                  : codeParam
                    ? "Copiar enlace con código"
                    : "Copiar enlace"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </TopLayerModalDialog>
  );
}

const CLUB_COMMAND_VIEWS: ReadonlyArray<{
  label: string;
  subtitle: string;
  href: string;
  icon: MaestroIconName;
}> = [
  {
    label: "Jornada y Partidos de Hoy",
    subtitle: "Cartelera en vivo de las 7 ligas",
    href: "/app",
    icon: "calendar",
  },
  {
    label: "Buscar picks",
    subtitle: "Escudo, Principal, Totales, Táctico y Valor",
    href: "/app/picks",
    icon: "sparkles",
  },
  {
    label: "Armar parlay",
    subtitle: "Combinadas de 2 a 6 selecciones sin selecciones opuestas",
    href: "/app/parlays",
    icon: "layers",
  },
  {
    label: "Compara tu momio",
    subtitle: "Comparativa de probabilidad estimada vs momio justo",
    href: "/app/momios",
    icon: "sliders",
  },
  {
    label: "Props de jugadores (próximamente)",
    subtitle: "Simulador interactivo de líneas individuales",
    href: "/app/props",
    icon: "activity",
  },
  {
    label: "Comunidad",
    subtitle: "Boletos compartidos, conversación y tablero de socios",
    href: "/app/social",
    icon: "users",
  },
  {
    label: "Portal Tipster Oficial",
    subtitle: "1 pick abierto semanal y seguimiento de comisiones",
    href: "/app/tipster",
    icon: "crown",
  },
  {
    label: "Resultados",
    subtitle: "Marcadores cerrados y registro público sin ediciones",
    href: "/app/historial",
    icon: "shield",
  },
  {
    label: "Mi Bitácora & Vigilancia",
    subtitle: "Unidades simuladas, ventaja promedio y alertas de partido",
    href: "/app/lab",
    icon: "chart",
  },
  {
    label: "Tecnología y precisión",
    subtitle: "Cómo estimamos probabilidades y calibramos el momio justo",
    href: "/app/tech",
    icon: "cpu",
  },
  {
    label: "Cuenta y referidos (+7 días)",
    subtitle: "Embajador 5 amigos, unidad base y facturación SAT",
    href: "/app/account",
    icon: "gift",
  },
  {
    label: "Consola Founder Admin",
    subtitle: "Interruptor Mes 1 Sin Tarjeta, códigos y telemetría",
    href: "/app/admin",
    icon: "bolt",
  },
];

export function CommandPaletteModal(): React.JSX.Element | null {
  const { cmdkOpen, setCmdkOpen, dataset, navigateTo, viewerRole, allowRoleSimulation } =
    usePlatform();
  const [query, setQuery] = useState<string>("");

  if (!cmdkOpen) return null;

  const q = query.trim().toLowerCase();

  const matchingGames = dataset.games
    .filter((g) => {
      if (!q) return true;
      return (
        g.home.name.toLowerCase().includes(q) ||
        g.away.name.toLowerCase().includes(q) ||
        g.home.shortName.toLowerCase().includes(q) ||
        g.away.shortName.toLowerCase().includes(q) ||
        g.leagueLabel.toLowerCase().includes(q) ||
        g.league.toLowerCase().includes(q)
      );
    })
    .slice(0, 6);

  const matchingLeagues = dataset.leagues.filter((lg) => {
    if (!q) return true;
    return (
      lg.label.toLowerCase().includes(q) ||
      lg.league.toLowerCase().includes(q) ||
      lg.roundLabel.toLowerCase().includes(q)
    );
  });

  const matchingTipsters = TIPSTER_CREATORS.filter((c) => {
    if (!q) return true;
    return (
      c.handle.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.specialty.toLowerCase().includes(q) ||
      c.promoCode.toLowerCase().includes(q)
    );
  });

  const canSeeAdmin = viewerRole === "admin" || allowRoleSimulation;
  const quickRoutes = CLUB_COMMAND_VIEWS.filter(
    (r) =>
      (r.href !== "/app/admin" || canSeeAdmin) &&
      (!q ||
        r.label.toLowerCase().includes(q) ||
        r.subtitle.toLowerCase().includes(q)),
  );

  const hasResults =
    matchingGames.length > 0 ||
    matchingLeagues.length > 0 ||
    matchingTipsters.length > 0 ||
    quickRoutes.length > 0;

  return (
    <TopLayerModalDialog
      open={cmdkOpen}
      onClose={() => setCmdkOpen(false)}
      ariaLabel="Buscar en PitchLab"
      maxWidth="38rem"
    >
      <div className="glass-lens glass-ring glass-ring--featured relative overflow-hidden w-full rounded-2xl p-4">
        <LensGlowOrbs subtle />
        <div className="relative z-10 space-y-3">
          <div className="flex items-center gap-2">
            <MaestroIcon
              name="search"
              size={18}
              style={{ color: "var(--pl-brand)" }}
            />
            <input
              type="search"
              autoFocus
              aria-label="Buscar equipo, liga, partido o módulo"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar partido, liga, @tipster o módulo (⌘K)..."
              className="glass-input w-full px-3 py-2.5 text-sm"
            />
            <button
              type="button"
              className="pl-btn-glass px-3 text-xs shrink-0"
              onClick={() => setCmdkOpen(false)}
            >
              Cerrar
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto space-y-4 pr-1">
            {!hasResults ? (
              <div
                className="rounded-xl p-6 text-center text-sm"
                style={{ color: "var(--pl-text-muted)" }}
              >
                Sin coincidencias para «{query}». Prueba con NFL, Liga MX,
                @sofia_nfl o Parlays.
              </div>
            ) : null}

            {matchingGames.length > 0 ? (
              <div>
                <p
                  className="m-0 mb-1.5 text-[11px] font-bold"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  Partidos y Match Studio
                </p>
                <div className="space-y-1">
                  {matchingGames.map((g) => (
                    <a
                      key={g.id}
                      href={`/app/${g.league}/games/${g.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setCmdkOpen(false);
                        navigateTo(`/app/${g.league}/games/${g.id}`);
                      }}
                      className="flex items-center justify-between rounded-xl px-3 py-2 text-sm no-underline row-hover"
                    >
                      <span className="flex items-center gap-2 font-semibold min-w-0">
                        <LeagueBadge
                          league={g.league}
                          label={g.leagueLabel}
                          size={18}
                        />
                        <span className="truncate">
                          {g.home.shortName} vs {g.away.shortName}
                        </span>
                      </span>
                      <span
                        className="text-xs num shrink-0 inline-flex items-center gap-1.5"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        <span>
                          {g.leagueLabel} ·{" "}
                          {g.status === "FT" ? "Final" : g.kickoffLocal}
                        </span>
                        <MaestroIcon name="chevronRight" size={14} />
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {matchingLeagues.length > 0 ? (
              <div>
                <p
                  className="m-0 mb-1.5 text-[11px] font-bold"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  7 Ligas Oficiales
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {matchingLeagues.map((lg) => (
                    <a
                      key={lg.league}
                      href={`/app/${lg.league}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setCmdkOpen(false);
                        navigateTo(`/app/${lg.league}`);
                      }}
                      className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold no-underline row-hover"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <LeagueBadge
                          league={lg.league}
                          label={lg.label}
                          size={18}
                        />
                        <span className="truncate">{lg.label}</span>
                      </span>
                      <span
                        className="num shrink-0"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        {lg.totalGames} juegos
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {matchingTipsters.length > 0 ? (
              <div>
                <p
                  className="m-0 mb-1.5 text-[11px] font-bold"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  Tipsters Verificados (CLV Auditado)
                </p>
                <div className="space-y-1">
                  {matchingTipsters.map((creator) => (
                    <a
                      key={creator.handle}
                      href={`/app/u/${creator.handle}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setCmdkOpen(false);
                        navigateTo(`/app/u/${creator.handle}`);
                      }}
                      className="flex items-center justify-between rounded-xl px-3 py-2 text-sm no-underline row-hover"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="avatar-ring inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-extrabold shrink-0"
                          style={{
                            background: creator.avatarGradVar,
                            color: "var(--pl-on-solid)",
                          }}
                        >
                          {creator.avatarInitials}
                        </span>
                        <span className="min-w-0 truncate">
                          <strong className="font-semibold">
                            {creator.name}
                          </strong>{" "}
                          {creator.isExample ? <ExampleBadge /> : null}{" "}
                          <span
                            className="text-xs"
                            style={{ color: "var(--pl-text-muted)" }}
                          >
                            @{creator.handle} · {creator.specialty}
                          </span>
                        </span>
                      </span>
                      <span className="pl-pill pl-pill--success num shrink-0">
                        {creator.verifiedUnits} · CLV {creator.clvAvg}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {quickRoutes.length > 0 ? (
              <div>
                <p
                  className="m-0 mb-1.5 text-[11px] font-bold"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  Vistas y Herramientas del Club
                </p>
                <div className="space-y-1">
                  {quickRoutes.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={(e) => {
                        e.preventDefault();
                        setCmdkOpen(false);
                        navigateTo(item.href);
                      }}
                      className="flex items-center justify-between rounded-xl px-3 py-2 text-sm no-underline row-hover"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <MaestroIcon
                          name={item.icon}
                          size={15}
                          style={{ color: "var(--pl-brand)" }}
                        />
                        <span className="min-w-0">
                          <span className="block font-semibold truncate">
                            {item.label}
                          </span>
                          <span
                            className="block text-xs truncate"
                            style={{ color: "var(--pl-text-muted)" }}
                          >
                            {item.subtitle}
                          </span>
                        </span>
                      </span>
                      <span
                        className="text-xs font-semibold shrink-0 inline-flex items-center gap-1"
                        style={{ color: "var(--pl-brand)" }}
                      >
                        <span>Ir</span>
                        <MaestroIcon name="chevronRight" size={13} />
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </TopLayerModalDialog>
  );
}

export function BetaPinModal(): React.JSX.Element | null {
  const { betaPinOpen, closeBetaPin, submitBetaPin } = usePlatform();
  const [digits, setDigits] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  useEffect(() => {
    if (!betaPinOpen) {
      setDigits("");
      setError("");
      setBusy(false);
    }
  }, [betaPinOpen]);

  const triggerVerify = async (code: string) => {
    setBusy(true);
    setError("");
    const res = await submitBetaPin(code);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Código incorrecto.");
      setDigits("");
    }
  };

  const handleDigit = (d: string) => {
    if (busy || digits.length >= 4) return;
    const next = `${digits}${d}`;
    setDigits(next);
    setError("");
    if (next.length === 4) {
      void triggerVerify(next);
    }
  };

  if (!betaPinOpen) return null;

  return (
    <TopLayerModalDialog
      open={betaPinOpen}
      onClose={closeBetaPin}
      ariaLabelledBy="beta-pin-modal-title"
      maxWidth="24rem"
    >
      <div className="pin-dialog glass-lens glass-ring glass-ring--featured relative overflow-hidden w-full rounded-2xl p-6">
        <LensGlowOrbs subtle />
        <div className="relative z-10 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="pl-pill pl-pill--brand inline-flex items-center gap-1">
                <MaestroIcon name="shield" size={12} />
                Acceso Inmediato de Socio
              </span>
              <h2
                id="beta-pin-modal-title"
                className="m-0 mt-2 text-lg font-extrabold"
              >
                Ingresa tu PIN de 4 dígitos
              </h2>
            </div>
            <button
              type="button"
              className="pl-btn-glass px-2.5"
              aria-label="Cerrar acceso con PIN"
              onClick={closeBetaPin}
            >
              <MaestroIcon name="x" size={15} />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2.5 py-1" aria-live="polite">
            {[0, 1, 2, 3].map((idx) => {
              const char = digits[idx] ?? "";
              return (
                <div
                  key={idx}
                  className="h-12 rounded-xl flex items-center justify-center text-xl font-extrabold num"
                  style={{
                    background: "var(--pl-surface-elevated)",
                    border: char
                      ? "1.5px solid var(--pl-brand)"
                      : "1px solid var(--pl-border)",
                  }}
                >
                  {char ? "•" : ""}
                </div>
              );
            })}
          </div>

          {error ? (
            <p
              className="pin-feedback error m-0 text-xs font-semibold text-center"
              role="alert"
              style={{ color: "var(--pl-danger)" }}
            >
              {error}
            </p>
          ) : (
            <p
              className="m-0 text-xs text-center"
              style={{ color: "var(--pl-text-muted)" }}
            >
              Sesión encriptada por 30 días en este dispositivo.
            </p>
          )}

          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button
                key={d}
                type="button"
                autoFocus={d === "1"}
                data-pin-digit={d}
                disabled={busy}
                className="pin-key pl-btn-glass h-11 text-base font-bold num"
                onClick={() => handleDigit(d)}
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              disabled={busy || digits.length === 0}
              className="pl-btn-glass h-11 text-xs font-semibold"
              onClick={() => setDigits("")}
            >
              Limpiar
            </button>
            <button
              type="button"
              data-pin-digit="0"
              disabled={busy}
              className="pin-key pl-btn-glass h-11 text-base font-bold num"
              onClick={() => handleDigit("0")}
            >
              0
            </button>
            <button
              type="button"
              disabled={busy || digits.length === 0}
              aria-label="Borrar último dígito"
              className="pl-btn-glass h-11 text-sm font-bold"
              onClick={() => setDigits((prev) => prev.slice(0, -1))}
            >
              ⌫
            </button>
          </div>
        </div>
      </div>
    </TopLayerModalDialog>
  );
}

function isClubAppRoute(path: string): boolean {
  return path === "/app" || path.startsWith("/app/");
}

export function RoleSimulatorBar({
  activePath,
}: {
  activePath?: string;
} = {}): React.JSX.Element | null {
  const { allowRoleSimulation, viewerRole, setViewerRole } = usePlatform();
  const [expanded, setExpanded] = useState<boolean>(false);
  const [clientPath, setClientPath] = useState<string>(activePath ?? "");

  useEffect(() => {
    if (activePath !== undefined) {
      setClientPath(activePath);
      return;
    }
    try {
      setClientPath(window.location.pathname);
    } catch (err) {
      void err;
    }
  }, [activePath]);

  const effectivePath = activePath ?? clientPath;
  if (!allowRoleSimulation || !isClubAppRoute(effectivePath)) return null;

  const roles: Array<{ id: ViewerRole; label: string; short: string }> = [
    { id: "visitor", label: "Visitante (Cero-Fuga)", short: "Visitante" },
    { id: "member", label: "Socio Pase PitchLab Ultra", short: "Socio" },
    { id: "tipster", label: "Tipster (@sofia_nfl)", short: "Tipster" },
    { id: "admin", label: "Admin Founder", short: "Admin" },
  ];

  const activeRole = roles.find((r) => r.id === viewerRole) ?? roles[0]!;

  return (
    <div
      className="role-sim-pill glass-pill-bar glass-ring"
      role="region"
      aria-label="Simulador de rol de usuario"
      data-role-simulator=""
    >
      <button
        type="button"
        className="seg-btn text-xs min-h-7 px-2.5 inline-flex items-center gap-1.5"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <MaestroIcon
          name="eye"
          size={13}
          style={{ color: "var(--pl-brand)" }}
        />
        <span style={{ color: "var(--pl-brand)" }} className="font-extrabold">
          Rol:
        </span>
        <span>{activeRole.short}</span>
        <span aria-hidden="true">{expanded ? "✕" : "▾"}</span>
      </button>
      {expanded
        ? roles.map((r) => (
            <button
              key={r.id}
              type="button"
              className="seg-btn text-xs min-h-7 px-2.5"
              aria-pressed={viewerRole === r.id}
              data-sim-role={r.id}
              onClick={() => {
                setViewerRole(r.id);
                setExpanded(false);
              }}
            >
              {r.label}
            </button>
          ))
        : null}
    </div>
  );
}

export function ToastViewport(): React.JSX.Element | null {
  const { toasts } = usePlatform();
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="glass-pill-bar glass-ring rounded-xl px-4 py-2.5 text-xs font-semibold shadow-lg flex items-center gap-2.5"
        >
          <span
            className="dot"
            aria-hidden="true"
            style={{
              color:
                t.tone === "success"
                  ? "var(--pl-success)"
                  : t.tone === "warning"
                    ? "var(--pl-warning)"
                    : t.tone === "danger"
                      ? "var(--pl-danger)"
                      : "var(--pl-brand)",
            }}
          />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
