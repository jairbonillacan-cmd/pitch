"use client";

import React, { useEffect, useRef, useState } from "react";
import { canonicalGameHref, canonicalTeamHref, isNationalCompetition } from "@pitchlab/contracts";
import { getLogoPath } from "@pitchlab/sports-assets";
import { LeagueBadge, TeamBadge } from "../../sports";
import {
  canRevealPickOnShare,
  formatEdgePts,
  formatOddsValue,
  getSessionWatermark,
  pickReferenceDecimal,
} from "../access-guard";
import {
  useOverlayState,
  useParlayState,
  usePlatform,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import { shortDateLabel } from "../club/home/home-model";
import { assessParlayRisk } from "../parlay-engine";
import { downloadTicketPng, type TicketRasterContent } from "./share-ticket-raster";
import { triggerHaptic } from "../navigation-helpers";
import { TIPSTER_CREATORS } from "../spacetime-catalog";
import { PersonAvatar } from "../club/team/PersonAvatar";
import type { MatchPick, PlatformGame, ViewerRole } from "../types";
import {
  ExampleBadge,
  LensGlowOrbs,
  MaestroIcon,
  type MaestroIconName,
} from "./MaestroPrimitives";
import { useSheetSwipeDismiss } from "./use-sheet-swipe-dismiss";

let cachedDisplayTransitionSupport: boolean | undefined;

function canTransitionDialogDisplay(): boolean {
  if (cachedDisplayTransitionSupport !== undefined) return cachedDisplayTransitionSupport;
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    !window.CSS?.supports?.("transition-behavior", "allow-discrete") ||
    !document.body
  ) {
    return false;
  }
  const probe = document.createElement("div");
  probe.style.cssText = "transition: display 1s allow-discrete !important; display: block;";
  document.body.appendChild(probe);
  window.getComputedStyle(probe).display;
  probe.style.display = "none";
  cachedDisplayTransitionSupport = window.getComputedStyle(probe).display === "block";
  probe.remove();
  return cachedDisplayTransitionSupport;
}

function supportsTopLayerExit(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.CSS?.supports?.("overlay", "auto")) && canTransitionDialogDisplay();
}

export function TopLayerModalDialog({
  open,
  onClose,
  ariaLabel,
  ariaLabelledBy,
  variant = "modal",
  maxWidth = "32rem",
  dialogClassName,
  keepMounted = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  variant?: "modal" | "drawer";
  maxWidth?: string;
  dialogClassName?: string;
  keepMounted?: boolean;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsMobileViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const sheetSwipe = useSheetSwipeDismiss({
    onDismiss: () => {
      onCloseRef.current();
    },
    disabled: !open || !isMobileViewport,
    scrollContainerRef: dialogRef,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    let cancelled = false;

    const closeWithExitFallback = async () => {
      if (!dialog.open) return;
      if (supportsTopLayerExit() || typeof dialog.getAnimations !== "function") {
        dialog.close();
        return;
      }
      dialog.setAttribute("data-closing", "");
      const animations = dialog.getAnimations({ subtree: true });
      if (animations.length > 0) {
        await Promise.race([
          Promise.allSettled(animations.map((a) => a.finished)),
          new Promise<void>((resolve) => setTimeout(resolve, 400)),
        ]);
      }
      if (cancelled || !dialog.hasAttribute("data-closing")) return;
      dialog.removeAttribute("data-closing");
      if (dialog.open) dialog.close();
    };

    if (!open) {
      if (dialog.open) {
        void closeWithExitFallback();
      }
      return () => {
        cancelled = true;
      };
    }

    dialog.removeAttribute("data-closing");
    if (!dialog.open) {
      dialog.showModal();
    }

    const handleCancel = (event: Event) => {
      if (!keepMounted || supportsTopLayerExit()) return;
      event.preventDefault();
      onCloseRef.current();
    };

    const handleClose = () => {
      // En desarrollo (StrictMode) el efecto se monta dos veces: el «close» del
      // primer desmontaje llega cuando el diálogo ya se volvió a abrir.
      if (dialog.open) return;
      dialog.removeAttribute("data-closing");
      dialog.returnValue = "";
      onCloseRef.current();
    };
    dialog.addEventListener("cancel", handleCancel);
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
          if (!keepMounted || supportsTopLayerExit()) {
            dialog.close();
          } else {
            onCloseRef.current();
          }
        }
      };
      dialog.addEventListener("pointerdown", onPointerDown);
      dialog.addEventListener("pointerup", onPointerUp);
      cleanupLightDismiss = () => {
        dialog.removeEventListener("pointerdown", onPointerDown);
        dialog.removeEventListener("pointerup", onPointerUp);
      };
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dialog.open) {
        e.preventDefault();
        if (!keepMounted || supportsTopLayerExit()) {
          dialog.close();
        } else {
          onCloseRef.current();
        }
      }
    };
    window.addEventListener("keydown", handleEscape);

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", handleEscape);
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
      cleanupLightDismiss?.();
      if (!keepMounted && dialog.open) {
        dialog.close();
      }
    };
  }, [open, keepMounted]);

  if (!keepMounted && !open) return null;

  const baseClass = variant === "drawer" ? "pl-native-drawer" : "pl-native-dialog";
  const dialogStyle: React.CSSProperties = {
    ...(variant === "modal"
      ? ({ "--pl-dialog-max-w": maxWidth } as React.CSSProperties)
      : {}),
    ...(isMobileViewport ? sheetSwipe.sheetStyle : {}),
  };
  return (
    <dialog
      ref={dialogRef}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      className={dialogClassName ? `${baseClass} ${dialogClassName}` : baseClass}
      style={Object.keys(dialogStyle).length > 0 ? dialogStyle : undefined}
      {...(isMobileViewport ? sheetSwipe.handleProps : {})}
    >
      {children}
    </dialog>
  );
}

export function ParlayFloatingDock(): React.JSX.Element | null {
  const { oddsFormat } = usePlatformCore();
  const { clearParlay, sealParlayToJournal, openShareTicket, navigateTo } = usePlatformActions();
  const { parlaySummary } = useParlayState();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  if (parlaySummary.legs.length === 0) {
    return null;
  }

  const dockRisk = assessParlayRisk(parlaySummary);
  const dockRiskColor =
    dockRisk.tone === "success"
      ? "var(--pl-success)"
      : dockRisk.tone === "warning"
        ? "var(--pl-warning)"
        : dockRisk.tone === "danger"
          ? "var(--pl-danger)"
          : "var(--pl-brand)";

  return (
    <>
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
            <span
              className="pl-pill num text-xs font-extrabold"
              data-dock-risk={dockRisk.level}
              style={{ color: dockRiskColor }}
            >
              {dockRisk.shortLabel}
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
                Momio justo:{" "}
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
              onClick={() => {
                if (parlaySummary.legs.length >= 2) {
                  setConfirmClearOpen(true);
                } else {
                  clearParlay();
                }
              }}
            >
              <MaestroIcon name="x" size={14} />
            </button>
          </div>
        </div>
      </aside>

      <ConfirmActionDialog
        open={confirmClearOpen}
        title={`¿Vaciar parlay de ${parlaySummary.legs.length} selecciones?`}
        description="Se quitarán todas las selecciones del boleto actual. Podrás deshacerlo durante unos segundos desde el aviso inferior."
        confirmLabel="Vaciar boleto"
        onConfirm={clearParlay}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </>
  );
}

export function PickComposerModal(): React.JSX.Element | null {
  const { oddsFormat } = usePlatformCore();
  const { closeComposer, sealPickToJournal } = usePlatformActions();
  const { composerPick } = useOverlayState();
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
                  Tu momio en decimal
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
                  Ventaja {clvLivePct >= 0 ? "+" : ""}
                  {clvLivePct.toFixed(1)} % · Valor esperado {evLivePct >= 0 ? "+" : ""}
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
                  : `Margen en contra ${edgeLive.toFixed(1)} pts frente al momio justo`}
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
              Sellar en Mi récord ({units.toFixed(2)}u)
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
  const showExpandedLegs = Boolean(
    shareTicket.legs &&
      shareTicket.legs.length > 0 &&
      (revealSelection || shareTicket.revealLegs),
  );
  const topLegIndices = (() => {
    if (!showExpandedLegs || !shareTicket.legs || shareTicket.legs.length < 3) {
      return new Set<number>();
    }
    const highlightCount = shareTicket.legs.length >= 4 ? 2 : 1;
    const ranked = shareTicket.legs
      .map((leg, idx) => ({ idx, p: leg.p }))
      .sort((a, b) => b.p - a.p || a.idx - b.idx);
    return new Set(ranked.slice(0, highlightCount).map((r) => r.idx));
  })();
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
      triggerHaptic(8);
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
      ? `Código ${shareTicket.promoCode} · 5 días gratis`
      : codeParam
        ? `Prueba PitchLab 7 días gratis · /i/${codeParam}`
        : "Prueba PitchLab 7 días gratis";
    const base = {
      aspect,
      leagueLabel: shareTicket.leagueLabel,
      title: shareTicket.title,
      subtitle: shareTicket.subtitle,
      units,
      footerLine,
      footerSub: "pitchlab.mx · Solo +18 · Unidades simuladas",
      watermark,
    };
    const content: TicketRasterContent = showExpandedLegs && shareTicket.legs
      ? {
          ...base,
          badge: "Parlay verificado PitchLab",
          badgeTone: "success",
          mainLine: `${formatOddsValue(shareTicket.fairDecimal, oddsFormat)}`,
          detailLine: `Probabilidad ${(shareTicket.probability * 100).toFixed(1)} %`,
          summaryLeftLabel: "MOMIO JUSTO COMBINADO",
          summaryLeftValue:
            oddsFormat === "american"
              ? `${formatOddsValue(shareTicket.fairDecimal, "american")} (${shareTicket.fairDecimal.toFixed(2)})`
              : `${shareTicket.fairDecimal.toFixed(2)} (${formatOddsValue(shareTicket.fairDecimal, "american")})`,
          summaryRightLabel: "PROBABILIDAD",
          summaryRightValue: `${(shareTicket.probability * 100).toFixed(1)} %`,
          legs: shareTicket.legs.map((leg, idx) => ({
            rank: idx + 1,
            label: leg.label,
            subLabel: leg.matchLabel,
            probLabel: `${(leg.p * 100).toFixed(1)} %`,
            oddsLabel: `Justo ${formatOddsValue(leg.fairDecimal, oddsFormat)}`,
            highlight: topLegIndices.has(idx),
          })),
        }
      : revealSelection
      ? {
          ...base,
          badge: isTipsterPromo
            ? (shareTicket.originBadge ?? "Pick abierto de la semana")
            : "Resultado final verificado",
          badgeTone: "success",
          mainLine: shareTicket.pickLabel,
          detailLine: `Probabilidad ${(shareTicket.probability * 100).toFixed(1)} % · Momio ${formatOddsValue(shareTicket.marketDecimal, oddsFormat)} (justo ${formatOddsValue(shareTicket.fairDecimal, oddsFormat)})`,
        }
      : {
          ...base,
          badge: "Selección oculta hasta el inicio",
          badgeTone: "warning",
          mainLine: `Pick registrado en PitchLab · ${(shareTicket.probability * 100).toFixed(0)} % de probabilidad`,
          detailLine: "La selección exacta se revela al inicio del partido.",
        };
    const fileName = `pitchlab-boleto-${aspect === "9:16" ? "9x16" : "4x5"}.png`;
    downloadTicketPng(content, card, fileName).then(
      (mode) => {
        triggerHaptic(8);
        pushToast(
          mode === "shared"
            ? `Boleto ${aspect === "9:16" ? "1080×1920" : "1080×1350"} listo para compartir.`
            : `Boleto ${aspect === "9:16" ? "1080×1920" : "1080×1350"} descargado.`,
          "success",
        );
      },
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
                Comparte tu boleto
              </h2>
              <p
                className="m-0 text-xs"
                style={{ color: "var(--pl-text-muted)" }}
              >
                La selección se oculta hasta que empieza el partido.
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
                  4:5 · Publicación
                </button>
                <button
                  type="button"
                  className="seg-btn !min-h-[30px] !px-2.5 text-xs"
                  aria-pressed={aspect === "9:16"}
                  onClick={() => setAspect("9:16")}
                >
                  9:16 · Historia
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
                    loading="lazy"
                    decoding="async"
                    className="h-5 w-auto object-contain"
                  />
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

              {showExpandedLegs && shareTicket.legs ? (
                <div className="space-y-2.5" data-share-multi-legs="">
                  <ol className="pl-share-legs" role="list" aria-label="Selecciones del boleto">
                    {shareTicket.legs.map((leg, idx) => {
                      const isTop = topLegIndices.has(idx);
                      return (
                        <li
                          key={`${idx}-${leg.label}`}
                          className={isTop ? "pl-share-leg is-most-likely" : "pl-share-leg"}
                        >
                          <span
                            className={isTop ? "pl-share-leg-rank is-top num" : "pl-share-leg-rank num"}
                            aria-hidden="true"
                          >
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <strong className="text-xs font-extrabold truncate">{leg.label}</strong>
                              {isTop ? (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold"
                                  style={{
                                    background: "color-mix(in oklab, var(--share-card-success) 18%, transparent)",
                                    color: "var(--share-card-success)",
                                  }}
                                >
                                  <MaestroIcon name="check" size={10} />
                                  <span>Más probable</span>
                                </span>
                              ) : null}
                            </div>
                            <span
                              className="block text-[11px] truncate"
                              style={{ color: "var(--share-card-muted)" }}
                            >
                              {leg.matchLabel}
                            </span>
                          </div>
                          <div className="text-right shrink-0 num">
                            <span
                              className="block text-xs font-extrabold"
                              style={{ color: isTop ? "var(--share-card-success)" : "var(--share-card-accent)" }}
                            >
                              {(leg.p * 100).toFixed(1)} %
                            </span>
                            <span
                              className="block text-[10px]"
                              style={{ color: "var(--share-card-muted)" }}
                            >
                              Justo {formatOddsValue(leg.fairDecimal, oddsFormat)}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>

                  <div
                    className="rounded-xl p-3 flex items-center justify-between gap-2 num"
                    style={{
                      background: "var(--share-card-surface)",
                      border: "1px solid var(--share-card-accent)",
                    }}
                  >
                    <div>
                      <span
                        className="block text-[10px] font-bold uppercase tracking-wide"
                        style={{ color: "var(--share-card-muted)" }}
                      >
                        Momio justo
                      </span>
                      <strong className="text-base font-extrabold">
                        {oddsFormat === "american"
                          ? `${formatOddsValue(shareTicket.fairDecimal, "american")} (${shareTicket.fairDecimal.toFixed(2)})`
                          : `${shareTicket.fairDecimal.toFixed(2)} (${formatOddsValue(shareTicket.fairDecimal, "american")})`}
                      </strong>
                    </div>
                    <div className="text-right">
                      <span
                        className="block text-[10px] font-bold uppercase tracking-wide"
                        style={{ color: "var(--share-card-muted)" }}
                      >
                        Probabilidad
                      </span>
                      <strong
                        className="text-base font-extrabold"
                        style={{ color: "var(--share-card-success)" }}
                      >
                        {(shareTicket.probability * 100).toFixed(1)} %
                      </strong>
                    </div>
                  </div>
                </div>
              ) : revealSelection ? (
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
                        ? shareTicket.originBadge ?? "Pick abierto de la semana"
                        : "Resultado final verificado"}
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
                    Probabilidad {(shareTicket.probability * 100).toFixed(1)} % · Momio{" "}
                    {formatOddsValue(shareTicket.marketDecimal, oddsFormat)}{" "}
                    (justo {formatOddsValue(shareTicket.fairDecimal, oddsFormat)}
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
                      Selección oculta hasta el inicio
                    </span>
                    <span className="num font-extrabold">
                      {shareTicket.units.toFixed(1)}u
                    </span>
                  </div>
                  <p className="m-0 text-sm font-bold">
                    Pick registrado en PitchLab ·{" "}
                    {(shareTicket.probability * 100).toFixed(0)} % de probabilidad
                  </p>
                  <p
                    className="m-0 text-xs leading-relaxed"
                    style={{ color: "var(--share-card-muted)" }}
                  >
                    La selección se muestra cuando empiece el partido.
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
                    className="block font-extrabold"
                    style={{ color: "var(--share-card-fg)" }}
                  >
                    {shareTicket.promoCode
                      ? `Código ${shareTicket.promoCode} · 5 días gratis`
                      : "Prueba PitchLab 7 días gratis"}
                  </span>
                  <span style={{ color: "var(--share-card-muted)" }}>
                    pitchlab.mx · Solo +18 · Unidades simuladas
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
                : showExpandedLegs
                  ? "Tarjeta lista para compartir con probabilidades claras y enlace de socio."
                  : revealSelection
                    ? "Selección visible: el partido ya terminó o es el pick abierto de la semana."
                    : "La selección queda oculta porque el partido aún no empieza."}
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
    label: "Comparar H2H",
    subtitle: "Equipos cara a cara y jugadores lado a lado",
    href: "/app/comparar",
    icon: "sliders",
  },
  {
    label: "Compara tu momio",
    subtitle: "Comparativa de probabilidad estimada vs momio justo",
    href: "/app/momios",
    icon: "sliders",
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
    label: "Mi récord y vigilancia",
    subtitle: "Unidades, estadísticas, privacidad y alertas de partido",
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

interface CommandPlayerHit {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  jersey: string | null;
  positionLabel: string;
  teamSlug: string;
  teamName: string;
  league: string;
  leagueLabel: string;
  photoKey: string | null;
  fallbackPhotoKey: string | null;
  href: string;
}

export function CommandPaletteModal({
  initialQuery = "",
}: {
  initialQuery?: string;
} = {}): React.JSX.Element | null {
  const { dataset, viewerRole, allowRoleSimulation } = usePlatformCore();
  const { setCmdkOpen, navigateTo } = usePlatformActions();
  const { cmdkOpen } = useOverlayState();
  const [query, setQuery] = useState<string>(initialQuery);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [rendered, setRendered] = useState<boolean>(cmdkOpen);
  const [matchingPlayers, setMatchingPlayers] = useState<CommandPlayerHit[]>([]);
  const [playersLoading, setPlayersLoading] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!cmdkOpen) return;
    setRendered(true);
    setQuery(initialQuery);
    setActiveIndex(0);
    const frame =
      typeof window !== "undefined"
        ? window.requestAnimationFrame(() => inputRef.current?.focus())
        : null;
    return () => {
      if (frame !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [cmdkOpen, initialQuery]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!cmdkOpen || trimmed.length < 2 || typeof fetch !== "function") {
      setMatchingPlayers([]);
      setPlayersLoading(false);
      return;
    }
    const controller = new AbortController();
    setPlayersLoading(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/search/players?q=${encodeURIComponent(trimmed)}&limit=6`, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((payload: { items?: CommandPlayerHit[] } | null) => {
          if (controller.signal.aborted) return;
          setMatchingPlayers(Array.isArray(payload?.items) ? payload.items : []);
          setPlayersLoading(false);
        })
        .catch((err) => {
          void err;
          if (!controller.signal.aborted) {
            setMatchingPlayers([]);
            setPlayersLoading(false);
          }
        });
    }, 150);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cmdkOpen, query]);

  if (!rendered && !cmdkOpen) return null;

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

  const indexedTeams = (() => {
    const rawList = (() => {
      if (dataset.teams && dataset.teams.length > 0) return dataset.teams;
      const seen = new Map<
        string,
        {
          id: string;
          league: typeof dataset.leagues[number]["league"];
          leagueLabel: string;
          slug: string;
          name: string;
          shortName: string;
          code: string;
          rank: number | null;
          href: string;
        }
      >();
      const leagueLabelMap = new Map(dataset.leagues.map((l) => [l.league, l.label]));
      for (const lg of dataset.leagues) {
        lg.standings.forEach((row, idx) => {
          const slug = row.teamId.includes(".") ? row.teamId.split(".")[1]! : row.teamId;
          const key = `${lg.league}:${slug}`;
          if (!seen.has(key)) {
            seen.set(key, {
              id: row.teamId,
              league: lg.league,
              leagueLabel: lg.label,
              slug,
              name: row.name,
              shortName: row.shortName,
              code: row.code,
              rank: idx + 1,
              href: canonicalTeamHref(lg.league, slug),
            });
          }
        });
      }
      for (const g of dataset.games) {
        for (const side of [g.home, g.away]) {
          const key = `${g.league}:${side.slug}`;
          if (!seen.has(key)) {
            seen.set(key, {
              id: key,
              league: g.league,
              leagueLabel: leagueLabelMap.get(g.league) ?? g.leagueLabel,
              slug: side.slug,
              name: side.name,
              shortName: side.shortName,
              code: side.code,
              rank: null,
              href: canonicalTeamHref(g.league, side.slug),
            });
          }
        }
      }
      return [...seen.values()];
    })();

    const upcomingKeys = new Set<string>();
    for (const g of dataset.games) {
      if (g.status !== "FT") {
        upcomingKeys.add(`${g.league}:${g.home.slug}`);
        upcomingKeys.add(`${g.league}:${g.away.slug}`);
      }
    }
    const deduped = new Map<string, (typeof rawList)[number]>();
    for (const item of rawList) {
      const dedupeKey = isNationalCompetition(item.league)
        ? `national:${item.slug}`
        : `club:${item.league}:${item.slug}`;
      const current = deduped.get(dedupeKey);
      if (!current) {
        deduped.set(dedupeKey, item);
        continue;
      }
      const nextUpcoming = upcomingKeys.has(`${item.league}:${item.slug}`);
      const curUpcoming = upcomingKeys.has(`${current.league}:${current.slug}`);
      if (nextUpcoming && !curUpcoming) {
        deduped.set(dedupeKey, item);
      }
    }
    return [...deduped.values()];
  })();

  const normSearch = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const nq = normSearch(q);

  const matchingTeams = indexedTeams
    .filter((t) => {
      if (!nq) return false;
      return (
        normSearch(t.name).includes(nq) ||
        normSearch(t.shortName).includes(nq) ||
        normSearch(t.code).includes(nq) ||
        normSearch(t.leagueLabel).includes(nq)
      );
    })
    .slice(0, 8);

  const orderedTargets: string[] = [
    ...matchingTeams.map((t) => t.href),
    ...matchingPlayers.map((p) => p.href),
    ...matchingGames.map((g) => canonicalGameHref(g.league, g)),
    ...matchingLeagues.map((lg) => `/app/${lg.league}`),
    ...matchingTipsters.map((c) => `/app/u/${c.handle}`),
    ...quickRoutes.map((r) => r.href),
  ];

  const hasResults = orderedTargets.length > 0;
  const clampedActive =
    orderedTargets.length > 0
      ? Math.min(Math.max(activeIndex, 0), orderedTargets.length - 1)
      : -1;

  const teamsOffset = 0;
  const playersOffset = teamsOffset + matchingTeams.length;
  const gamesOffset = playersOffset + matchingPlayers.length;
  const leaguesOffset = gamesOffset + matchingGames.length;
  const tipstersOffset = leaguesOffset + matchingLeagues.length;
  const routesOffset = tipstersOffset + matchingTipsters.length;

  const selectHref = (href: string) => {
    setCmdkOpen(false);
    navigateTo(href);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (orderedTargets.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = (clampedActive + 1) % orderedTargets.length;
      setActiveIndex(next);
      resultsRef.current
        ?.querySelector<HTMLElement>(`[data-cmd-idx="${next}"]`)
        ?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = (clampedActive - 1 + orderedTargets.length) % orderedTargets.length;
      setActiveIndex(next);
      resultsRef.current
        ?.querySelector<HTMLElement>(`[data-cmd-idx="${next}"]`)
        ?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && clampedActive >= 0) {
      // IME-safe enter-to-submit: bloquear navegación mientras el usuario confirma caracteres IME
      if (event.nativeEvent.isComposing || event.keyCode === 229) {
        return;
      }
      const target = orderedTargets[clampedActive];
      if (target) {
        event.preventDefault();
        selectHref(target);
      }
    }
  };

  return (
    <TopLayerModalDialog
      open={cmdkOpen}
      onClose={() => setCmdkOpen(false)}
      ariaLabel="Buscar en PitchLab"
      maxWidth="40rem"
      dialogClassName="pl-cmd-dialog"
      keepMounted
    >
      <div className="pl-cmd-shell" onKeyDown={handleKeyDown}>
        <div className="pl-cmd-head">
          <div className="pl-cmd-searchbox">
            <MaestroIcon name="search" size={16} className="pl-cmd-search-icon shrink-0" />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              aria-label="Buscar partido, equipo, jugador, liga o @socio"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              placeholder="Buscar partido, equipo, jugador, liga o @socio..."
              className="pl-cmd-input"
            />
            {query.length > 0 ? (
              <button
                type="button"
                className="pl-cmd-clear"
                aria-label="Limpiar búsqueda"
                onClick={() => {
                  setQuery("");
                  setActiveIndex(0);
                  inputRef.current?.focus();
                }}
              >
                <MaestroIcon name="x" size={13} />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="pl-cmd-close"
            aria-label="Cerrar buscador"
            onClick={() => setCmdkOpen(false)}
          >
            <MaestroIcon name="x" size={14} className="sm:hidden" />
            <span className="hidden sm:inline">Esc</span>
          </button>
        </div>

        <p className="sr-only" aria-live="polite">
          {q.length >= 2 && !playersLoading
            ? `${orderedTargets.length} resultados para ${query}`
            : ""}
        </p>

        <div ref={resultsRef} className="pl-cmd-results">
          {!hasResults && !playersLoading ? (
            <div className="pl-cmd-empty">
              <p className="m-0 text-sm font-semibold" style={{ color: "var(--pl-text)" }}>
                Sin coincidencias para «{query}»
              </p>
              <p className="m-0 mt-1 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Prueba con MLB, Liga MX, un equipo, un jugador o un @socio.
              </p>
            </div>
          ) : null}

          {matchingTeams.length > 0 ? (
            <section className="pl-cmd-group" aria-label="Equipos y selecciones">
              <div className="pl-cmd-group-head">
                <span>Equipos y selecciones</span>
                <span className="pl-cmd-group-count num">{matchingTeams.length}</span>
              </div>
              <div className="pl-cmd-list">
                {matchingTeams.map((teamItem, i) => {
                  const idx = teamsOffset + i;
                  const active = idx === clampedActive;
                  return (
                    <a
                      key={teamItem.id}
                      href={teamItem.href}
                      data-cmd-idx={idx}
                      data-active={active ? "true" : undefined}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={(e) => {
                        e.preventDefault();
                        selectHref(teamItem.href);
                      }}
                      className={active ? "pl-cmd-row is-active" : "pl-cmd-row"}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <TeamBadge
                          league={teamItem.league}
                          slug={teamItem.slug}
                          name={teamItem.name}
                          size={22}
                        />
                        <span className="truncate font-semibold">{teamItem.name}</span>
                      </span>
                      <span className="pl-cmd-row-meta num">
                        <span>
                          {teamItem.leagueLabel}
                          {teamItem.rank !== null ? ` · #${teamItem.rank}` : ""}
                        </span>
                        <MaestroIcon name="chevronRight" size={13} className="pl-cmd-row-arrow" />
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          ) : null}

          {matchingPlayers.length > 0 ? (
            <section className="pl-cmd-group" aria-label="Jugadores" data-cmd-players-group="">
              <div className="pl-cmd-group-head">
                <span>Jugadores</span>
                <span className="pl-cmd-group-count num">{matchingPlayers.length}</span>
              </div>
              <div className="pl-cmd-list">
                {matchingPlayers.map((playerItem, i) => {
                  const idx = playersOffset + i;
                  const active = idx === clampedActive;
                  return (
                    <a
                      key={playerItem.id}
                      href={playerItem.href}
                      data-cmd-idx={idx}
                      data-active={active ? "true" : undefined}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={(e) => {
                        e.preventDefault();
                        selectHref(playerItem.href);
                      }}
                      className={active ? "pl-cmd-row is-active" : "pl-cmd-row"}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <PersonAvatar
                          photoKey={playerItem.photoKey}
                          fallbackPhotoKey={playerItem.fallbackPhotoKey}
                          role="player"
                          size={26}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{playerItem.name}</span>
                          <span
                            className="block truncate text-[11px]"
                            style={{ color: "var(--pl-text-muted)" }}
                          >
                            {playerItem.teamName} · {playerItem.leagueLabel}
                          </span>
                        </span>
                      </span>
                      <span className="pl-cmd-row-meta num">
                        <span className="pl-pill text-[10px] px-1.5 py-0">
                          {playerItem.positionLabel}
                          {playerItem.jersey ? ` #${playerItem.jersey}` : ""}
                        </span>
                        <MaestroIcon name="chevronRight" size={13} className="pl-cmd-row-arrow" />
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          ) : null}

          {matchingGames.length > 0 ? (
            <section className="pl-cmd-group" aria-label="Partidos y Match Studio">
              <div className="pl-cmd-group-head">
                <span>Partidos y Match Studio</span>
                <span className="pl-cmd-group-count num">{matchingGames.length}</span>
              </div>
              <div className="pl-cmd-list">
                {matchingGames.map((g, i) => {
                  const idx = gamesOffset + i;
                  const active = idx === clampedActive;
                  const href = canonicalGameHref(g.league, g);
                  return (
                    <a
                      key={g.id}
                      href={href}
                      data-cmd-idx={idx}
                      data-active={active ? "true" : undefined}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={(e) => {
                        e.preventDefault();
                        selectHref(href);
                      }}
                      className={active ? "pl-cmd-row is-active" : "pl-cmd-row"}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex items-center gap-1 shrink-0">
                          <TeamBadge
                            league={g.league}
                            slug={g.home.slug}
                            name={g.home.name}
                            size={18}
                          />
                          <TeamBadge
                            league={g.league}
                            slug={g.away.slug}
                            name={g.away.name}
                            size={18}
                          />
                        </span>
                        <span className="truncate font-semibold">
                          {g.home.shortName} vs {g.away.shortName}
                        </span>
                      </span>
                      <span className="pl-cmd-row-meta num">
                        <span className="inline-flex items-center gap-1.5">
                          <LeagueBadge league={g.league} label={g.leagueLabel} size={14} />
                          <span>
                            {g.leagueLabel} · {shortDateLabel(g.dayId)} ·{" "}
                            {g.status === "FT" ? "Final" : g.kickoffLocal}
                          </span>
                        </span>
                        <MaestroIcon name="chevronRight" size={13} className="pl-cmd-row-arrow" />
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          ) : null}

          {matchingLeagues.length > 0 ? (
            <section className="pl-cmd-group" aria-label="Ligas oficiales">
              <div className="pl-cmd-group-head">
                <span>Ligas oficiales</span>
                <span className="pl-cmd-group-count num">{matchingLeagues.length}</span>
              </div>
              <div className="pl-cmd-league-grid">
                {matchingLeagues.map((lg, i) => {
                  const idx = leaguesOffset + i;
                  const active = idx === clampedActive;
                  const href = `/app/${lg.league}`;
                  return (
                    <a
                      key={lg.league}
                      href={href}
                      data-cmd-idx={idx}
                      data-active={active ? "true" : undefined}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={(e) => {
                        e.preventDefault();
                        selectHref(href);
                      }}
                      className={
                        active ? "pl-cmd-league-tile is-active" : "pl-cmd-league-tile"
                      }
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <LeagueBadge league={lg.league} label={lg.label} size={18} />
                        <span className="truncate font-semibold">{lg.label}</span>
                      </span>
                      <span
                        className="text-[11px] font-medium num shrink-0"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        {lg.totalGames} {lg.totalGames === 1 ? "juego" : "juegos"}
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          ) : null}

          {matchingTipsters.length > 0 ? (
            <section className="pl-cmd-group" aria-label="Tipsters verificados">
              <div className="pl-cmd-group-head">
                <span>Tipsters verificados</span>
                <span className="pl-cmd-group-count num">{matchingTipsters.length}</span>
              </div>
              <div className="pl-cmd-list">
                {matchingTipsters.map((creator, i) => {
                  const idx = tipstersOffset + i;
                  const active = idx === clampedActive;
                  const href = `/app/u/${creator.handle}`;
                  return (
                    <a
                      key={creator.handle}
                      href={href}
                      data-cmd-idx={idx}
                      data-active={active ? "true" : undefined}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={(e) => {
                        e.preventDefault();
                        selectHref(href);
                      }}
                      className={active ? "pl-cmd-row is-active" : "pl-cmd-row"}
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
                          <strong className="font-semibold">{creator.name}</strong>{" "}
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
                        {creator.verifiedUnits} · Ventaja {creator.clvAvg}
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          ) : null}

          {quickRoutes.length > 0 ? (
            <section className="pl-cmd-group" aria-label="Explorar PitchLab">
              <div className="pl-cmd-group-head">
                <span>Explorar PitchLab</span>
                <span className="pl-cmd-group-count num">{quickRoutes.length}</span>
              </div>
              <div className="pl-cmd-list">
                {quickRoutes.map((item, i) => {
                  const idx = routesOffset + i;
                  const active = idx === clampedActive;
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      data-cmd-idx={idx}
                      data-active={active ? "true" : undefined}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={(e) => {
                        e.preventDefault();
                        selectHref(item.href);
                      }}
                      className={active ? "pl-cmd-row is-active" : "pl-cmd-row"}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className="pl-cmd-icon-well" aria-hidden="true">
                          <MaestroIcon
                            name={item.icon}
                            size={14}
                            style={{ color: "var(--pl-brand)" }}
                          />
                        </span>
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
                      <span className="pl-cmd-row-go">
                        <span>Ir</span>
                        <MaestroIcon name="chevronRight" size={13} className="pl-cmd-row-arrow" />
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>

        <div className="pl-cmd-foot">
          <div className="hidden sm:flex items-center gap-3 text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
            <span className="inline-flex items-center gap-1.5">
              <kbd className="pl-header-kbd">↑</kbd>
              <kbd className="pl-header-kbd">↓</kbd>
              <span>Navegar</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <kbd className="pl-header-kbd">↵</kbd>
              <span>Abrir</span>
            </span>
          </div>
          <span className="text-[11px] font-medium num" style={{ color: "var(--pl-text-muted)" }}>
            {orderedTargets.length} resultados
          </span>
        </div>
      </div>
    </TopLayerModalDialog>
  );
}

export function BetaPinModal(): React.JSX.Element | null {
  const { closeBetaPin, submitBetaPin } = usePlatformActions();
  const { betaPinOpen } = useOverlayState();
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
  const { allowRoleSimulation, viewerRole } = usePlatformCore();
  const { setViewerRole } = usePlatformActions();
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
      className="role-sim-pill glass-pill-bar glass-ring hidden lg:inline-flex h-auto self-end"
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

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "brand";
  onConfirm: () => void;
  onCancel: () => void;
}): React.JSX.Element | null {
  const titleId = React.useId();
  const descId = React.useId();

  return (
    <TopLayerModalDialog
      open={open}
      onClose={onCancel}
      ariaLabelledBy={titleId}
      maxWidth="24rem"
    >
      <div className="p-5 space-y-4" data-confirm-action-dialog="">
        <div className="space-y-1.5">
          <h2 id={titleId} className="m-0 text-base font-extrabold">
            {title}
          </h2>
          <p id={descId} className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-secondary)" }}>
            {description}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          {/* Foco inicial en la acción segura (modern-web-guidance/dialog) */}
          <button
            type="button"
            autoFocus
            className="pl-btn-glass min-h-11 px-4 text-xs font-bold"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === "danger" ? "pl-btn-danger min-h-11 px-4 text-xs font-bold" : "pl-btn-primary min-h-11 px-4 text-xs font-bold"}
            data-confirm-action-btn=""
            onClick={() => {
              onConfirm();
              onCancel();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </TopLayerModalDialog>
  );
}

export function ToastViewport(): React.JSX.Element | null {
  const { toasts } = useOverlayState();
  const { dismissToast, setToastPaused } = usePlatformActions();
  const [rendered, setRendered] = useState<
    Array<{
      id: string;
      tone: string;
      text: string;
      actionLabel?: string;
      onAction?: () => void;
      closing?: boolean;
    }>
  >(() => toasts.map((t) => ({ ...t })));

  useEffect(() => {
    const activeIds = new Set(toasts.map((t) => t.id));
    let hasNewlyClosing = false;

    setRendered((prev) => {
      const prevMap = new Map(prev.map((item) => [item.id, item]));
      const next: Array<{
        id: string;
        tone: string;
        text: string;
        actionLabel?: string;
        onAction?: () => void;
        closing?: boolean;
      }> = [];

      for (const item of prev) {
        if (activeIds.has(item.id)) {
          const fresh = toasts.find((t) => t.id === item.id)!;
          next.push({ ...fresh, closing: false });
        } else if (!item.closing) {
          hasNewlyClosing = true;
          next.push({ ...item, closing: true });
        } else {
          next.push(item);
        }
      }

      for (const t of toasts) {
        if (!prevMap.has(t.id)) {
          next.push({ ...t, closing: false });
        }
      }

      return next;
    });

    if (!hasNewlyClosing) return;
    const timer = window.setTimeout(() => {
      setRendered((prev) => prev.filter((item) => !item.closing));
    }, 260);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  if (rendered.length === 0) return null;

  return (
    <div
      className="pl-toast-viewport"
      aria-live="polite"
    >
      {rendered.map((t) => (
        <div
          key={t.id}
          data-closing={t.closing ? "" : undefined}
          className="pl-toast-item glass-pill-bar glass-ring rounded-xl px-4 py-2.5 text-xs font-semibold shadow-lg flex items-center gap-2.5"
          onMouseEnter={() => {
            if (t.actionLabel) setToastPaused(t.id, true);
          }}
          onMouseLeave={() => {
            if (t.actionLabel) setToastPaused(t.id, false);
          }}
          onFocusCapture={() => {
            if (t.actionLabel) setToastPaused(t.id, true);
          }}
          onBlurCapture={() => {
            if (t.actionLabel) setToastPaused(t.id, false);
          }}
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
          <span className="flex-1 min-w-0">{t.text}</span>
          {t.actionLabel && t.onAction ? (
            <button
              type="button"
              className="pl-toast-action-btn"
              data-toast-undo=""
              onClick={() => {
                t.onAction?.();
                dismissToast(t.id);
              }}
            >
              {t.actionLabel}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
