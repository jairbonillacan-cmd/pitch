"use client";

import React, { useEffect, useRef, useState } from "react";
import { parseStrictFiniteNumber, sportForLeague } from "@pitchlab/contracts";
import { getLogoPath } from "@pitchlab/sports-assets";
import {
  canRevealPickOnShare,
  formatOddsValue,
  getSessionWatermark,
  pickReferenceDecimal,
} from "../access-guard";
import { normalizePickLabelWithUnit } from "../club/record/record-audit-helpers";
import { useMediaQuery } from "../hooks";
import {
  useOverlayState,
  useParlayState,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import { assessParlayRisk } from "../parlay-engine";
import { downloadTicketPng, type TicketRasterContent, type TicketTone } from "./share-ticket-raster";
import { triggerHaptic } from "../navigation-helpers";
import type { ShareTicketLegItem, ShareTicketPayload } from "../platform-storage";
import type { OddsFormat, ViewerRole } from "../types";
import { MaestroIcon } from "./MaestroPrimitives";
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

const DIALOG_DRAG_HEADER_SELECTOR =
  ".pl-sheet-drag-zone, .pl-prefs-modal-head, .pl-home-fmodal-head, .pl-com-sheet-head, .pl-native-modal-head, .pl-cmd-head, header";

const DIALOG_SCROLL_CONTAINER_SELECTORS = [
  ".pl-sheet-scroll",
  ".pl-prefs-modal-body",
  ".pl-more-sheet-inner",
  ".pl-home-fmodal-checklist",
  ".pl-home-fmodal-body",
  ".pl-com-picker-list",
  ".pl-cmd-list",
  ".pl-native-modal-body",
  ".pl-news-reader-body",
].join(", ");

function resolveSwipeTargetElement(target: EventTarget | null): Element | null {
  if (!target || typeof target !== "object") return null;
  if ("closest" in target && typeof (target as Element).closest === "function") {
    return target as Element;
  }
  if ("parentElement" in target) {
    return (target as Node).parentElement ?? null;
  }
  return null;
}

export function detectDialogScrollContainer(
  dialog: HTMLElement | null,
  target: EventTarget | null,
  explicitScrollRef?: React.RefObject<HTMLElement | null>,
): HTMLElement | null {
  if (!dialog) return explicitScrollRef?.current ?? null;
  if (explicitScrollRef?.current && explicitScrollRef.current.scrollTop > 0) {
    return explicitScrollRef.current;
  }
  const targetEl = resolveSwipeTargetElement(target);
  let cur: Element | null = targetEl;
  while (cur && cur !== dialog) {
    if (cur instanceof HTMLElement && cur.scrollTop > 0) {
      return cur;
    }
    cur = cur.parentElement;
  }
  if (explicitScrollRef?.current) {
    return explicitScrollRef.current;
  }
  if (targetEl) {
    const matchedAncestor = targetEl.closest(DIALOG_SCROLL_CONTAINER_SELECTORS);
    if (matchedAncestor instanceof HTMLElement && dialog.contains(matchedAncestor)) {
      return matchedAncestor;
    }
  }
  const detected = dialog.querySelector(DIALOG_SCROLL_CONTAINER_SELECTORS);
  if (detected instanceof HTMLElement) {
    return detected;
  }
  return dialog;
}

export function shouldAllowDialogSwipeStart(params: {
  dialog: HTMLElement | null;
  target: EventTarget | null;
  explicitScrollRef?: React.RefObject<HTMLElement | null>;
}): { allow: boolean; scrollElement: HTMLElement | null } {
  const { dialog, target, explicitScrollRef } = params;
  if (!dialog) return { allow: false, scrollElement: null };
  const targetEl = resolveSwipeTargetElement(target);
  if (targetEl && targetEl.closest(DIALOG_DRAG_HEADER_SELECTOR)) {
    return { allow: true, scrollElement: null };
  }
  const scrollElement = detectDialogScrollContainer(dialog, target, explicitScrollRef);
  if (dialog.scrollTop > 0) {
    return { allow: false, scrollElement: dialog };
  }
  if (scrollElement && scrollElement.scrollTop > 0) {
    return { allow: false, scrollElement };
  }
  return { allow: true, scrollElement };
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
  scrollContainerRef,
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
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const resolvedScrollRef = useRef<HTMLElement | null>(null);
  const touchSwipeAllowedRef = useRef<boolean>(false);
  const pointerSwipeAllowedRef = useRef<boolean>(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const isMobileViewport = useMediaQuery("(max-width: 767px)", false);

  const restorePreviousFocus = () => {
    const target = previousFocusRef.current;
    previousFocusRef.current = null;
    if (!target || !target.isConnected) return;
    if (
      document.activeElement === document.body ||
      document.activeElement === null ||
      (dialogRef.current && dialogRef.current.contains(document.activeElement))
    ) {
      target.focus({ preventScroll: true });
    }
  };

  const sheetSwipe = useSheetSwipeDismiss({
    onDismiss: () => {
      onCloseRef.current();
    },
    disabled: !open || !isMobileViewport,
    scrollContainerRef: resolvedScrollRef,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    let cancelled = false;

    const closeWithExitFallback = async () => {
      if (!dialog.open) return;
      if (supportsTopLayerExit() || typeof dialog.getAnimations !== "function") {
        dialog.close();
        restorePreviousFocus();
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
      if (dialog.open) {
        dialog.close();
        restorePreviousFocus();
      }
    };

    if (!open) {
      if (dialog.open) {
        void closeWithExitFallback();
      }
      return () => {
        cancelled = true;
      };
    }

    if (
      typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement &&
      !dialog.contains(document.activeElement)
    ) {
      previousFocusRef.current = document.activeElement;
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
      if (dialog.open) return;
      dialog.removeAttribute("data-closing");
      dialog.returnValue = "";
      restorePreviousFocus();
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
        restorePreviousFocus();
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
  const swipeProps: React.HTMLAttributes<HTMLDialogElement> = isMobileViewport
    ? {
        onTouchStart: (event) => {
          const check = shouldAllowDialogSwipeStart({
            dialog: dialogRef.current,
            target: event.target,
            explicitScrollRef: scrollContainerRef,
          });
          touchSwipeAllowedRef.current = check.allow;
          resolvedScrollRef.current = check.scrollElement;
          if (check.allow) {
            sheetSwipe.handleProps.onTouchStart(event);
          }
        },
        onTouchMove: (event) => {
          if (!touchSwipeAllowedRef.current) return;
          sheetSwipe.handleProps.onTouchMove(event);
        },
        onTouchEnd: () => {
          const allowed = touchSwipeAllowedRef.current;
          touchSwipeAllowedRef.current = false;
          if (allowed) {
            sheetSwipe.handleProps.onTouchEnd();
          }
        },
        onTouchCancel: () => {
          const allowed = touchSwipeAllowedRef.current;
          touchSwipeAllowedRef.current = false;
          if (allowed) {
            sheetSwipe.handleProps.onTouchCancel();
          }
        },
        onPointerDown: (event) => {
          const check = shouldAllowDialogSwipeStart({
            dialog: dialogRef.current,
            target: event.target,
            explicitScrollRef: scrollContainerRef,
          });
          pointerSwipeAllowedRef.current = check.allow;
          resolvedScrollRef.current = check.scrollElement;
          if (check.allow) {
            sheetSwipe.handleProps.onPointerDown(event);
          }
        },
        onPointerMove: (event) => {
          if (!pointerSwipeAllowedRef.current) return;
          sheetSwipe.handleProps.onPointerMove(event);
        },
        onPointerUp: () => {
          const allowed = pointerSwipeAllowedRef.current;
          pointerSwipeAllowedRef.current = false;
          if (allowed) {
            sheetSwipe.handleProps.onPointerUp();
          }
        },
        onPointerCancel: () => {
          const allowed = pointerSwipeAllowedRef.current;
          pointerSwipeAllowedRef.current = false;
          if (allowed) {
            sheetSwipe.handleProps.onPointerCancel();
          }
        },
      }
    : {};

  return (
    <dialog
      ref={dialogRef}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      className={dialogClassName ? `${baseClass} ${dialogClassName}` : baseClass}
      style={Object.keys(dialogStyle).length > 0 ? dialogStyle : undefined}
      {...swipeProps}
    >
      {children}
    </dialog>
  );
}

export function ParlayFloatingDock(): React.JSX.Element | null {
  const { dataset, oddsFormat } = usePlatformCore();
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
              onClick={() => {
                const gamesById = new Map(dataset.games.map((g) => [g.id, g]));
                const formattedLegs = parlaySummary.legs.map(({ pick }) => {
                  const gm = gamesById.get(pick.gameId);
                  const sport = gm ? gm.sport : sportForLeague(pick.league);
                  const fullLabel = normalizePickLabelWithUnit({
                    pickLabel: pick.label,
                    market: pick.market,
                    leagueLabel: pick.leagueLabel,
                    sport,
                  });
                  const matchName = gm
                    ? `${gm.home.shortName} vs ${gm.away.shortName}`
                    : pick.matchLabel;
                  return {
                    label: fullLabel,
                    matchLabel: `${matchName} · ${pick.kickoffLocal}`,
                    summaryLine: `${matchName}: ${fullLabel}`,
                    p: pick.p,
                    fairDecimal: pick.fairDecimal,
                    marketDecimal: pick.marketDecimal,
                    kickoffLocal: pick.kickoffLocal,
                    status: "pending" as const,
                  };
                });
                const uniqueLeagues = Array.from(
                  new Set(parlaySummary.legs.map((l) => l.pick.leagueLabel)),
                );
                openShareTicket({
                  kind: "parlay",
                  title:
                    parlaySummary.legs.length === 1
                      ? "Parlay · 1 selección"
                      : `Parlay · ${parlaySummary.legs.length} selecciones`,
                  subtitle: parlaySummary.hasSgpCorrelation
                    ? "Mismo partido · Ajuste por correlación"
                    : "Combinada calibrada · PitchLab",
                  leagueLabel: uniqueLeagues.length === 1 ? uniqueLeagues[0]! : "Multi-Liga",
                  pickLabel: formattedLegs.map((l) => l.summaryLine).join(" · "),
                  legs: formattedLegs.map((l) => ({
                    label: l.label,
                    matchLabel: l.matchLabel,
                    p: l.p,
                    fairDecimal: l.fairDecimal,
                    marketDecimal: l.marketDecimal,
                    kickoffLocal: l.kickoffLocal,
                    status: l.status,
                  })),
                  revealLegs: true,
                  settlementStatus: "pending",
                  probability: parlaySummary.combinedProbability,
                  fairDecimal: parlaySummary.fairDecimal,
                  marketDecimal: parlaySummary.bookDecimal,
                  units: parlaySummary.stakeUnits,
                  gameStatus: "NS",
                });
              }}
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
  const [sealing, setSealing] = useState<boolean>(false);
  const sealingRef = useRef<boolean>(false);
  const isCompactOrCoarse = useMediaQuery("(max-width: 768px), (pointer: coarse)", false);

  useEffect(() => {
    if (composerPick) {
      setUnits(composerPick.suggestedUnits);
      setUserDec(pickReferenceDecimal(composerPick).toFixed(2));
      setOddsMode("observed");
      setNote("");
      sealingRef.current = false;
      setSealing(false);
    }
  }, [composerPick]);

  if (!composerPick) return null;

  const parsedDec = Math.max(
    1.05,
    parseStrictFiniteNumber(userDec.replace(",", ".")) || pickReferenceDecimal(composerPick),
  );
  const clvLivePct =
    Math.round((parsedDec / composerPick.fairDecimal - 1) * 1000) / 10;
  const evLivePct = Math.round((composerPick.p * parsedDec - 1) * 1000) / 10;
  const edgeLive = Math.round((composerPick.p - 1 / parsedDec) * 1000) / 10;

  const valuePresetDec =
    parseStrictFiniteNumber((composerPick.fairDecimal * 1.05).toFixed(2)) ??
    composerPick.fairDecimal;
  const quickPresets = [
    {
      id: "fair",
      label: "Justa",
      dec:
        parseStrictFiniteNumber(composerPick.fairDecimal.toFixed(2)) ??
        composerPick.fairDecimal,
      mode: "manual" as const,
    },
    {
      id: "market",
      label: "Mercado",
      dec:
        parseStrictFiniteNumber(pickReferenceDecimal(composerPick).toFixed(2)) ??
        pickReferenceDecimal(composerPick),
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

  const handleSeal = () => {
    if (sealingRef.current || sealing) return;
    sealingRef.current = true;
    setSealing(true);
    const submission: unknown = sealPickToJournal(
      composerPick,
      units,
      parsedDec,
      note || undefined,
    );
    if (submission instanceof Promise) {
      void submission.finally(() => {
        sealingRef.current = false;
        setSealing(false);
      });
    }
  };

  return (
    <TopLayerModalDialog
      open={Boolean(composerPick)}
      onClose={closeComposer}
      ariaLabelledBy="composer-modal-title"
      maxWidth="30rem"
    >
      <div className="glass-lens glass-ring glass-ring--featured relative overflow-hidden w-full rounded-2xl p-6">
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
              className="pl-btn-glass min-h-11 min-w-11 px-2.5 shrink-0"
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
                    className="seg-btn min-h-11 md:min-h-7 px-2.5 text-[11px]"
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
                    className="seg-btn min-h-11 md:min-h-7 px-2.5 text-[11px]"
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
                      className="pl-btn-glass min-h-11 md:min-h-7 px-2.5 text-xs num inline-flex items-center gap-1"
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
                  autoFocus={!isCompactOrCoarse}
                  inputMode="decimal"
                  value={userDec}
                  onChange={(e) => {
                    setOddsMode("manual");
                    setUserDec(e.target.value);
                  }}
                  className="glass-input w-full px-3 py-2 text-base md:text-sm num font-bold"
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
                className="glass-input w-full px-3 py-2 text-base md:text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              className="pl-btn-glass min-h-11"
              onClick={closeComposer}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="pl-btn-primary min-h-11 inline-flex items-center gap-1.5 num"
              disabled={sealing}
              aria-busy={sealing}
              onClick={handleSeal}
            >
              <MaestroIcon name="check" size={15} />
              {sealing ? "Sellando..." : `Sellar en Mi récord (${units.toFixed(2)}u)`}
            </button>
          </div>
        </div>
      </div>
    </TopLayerModalDialog>
  );
}

function formatSignedUnitsLabel(units: number): string {
  const clean = Math.round(units * 100) / 100;
  return `${clean >= 0 ? "+" : "−"}${Math.abs(clean).toFixed(2)}u`;
}

function resolveToneCssColor(tone: TicketTone): string {
  if (tone === "success") return "var(--share-card-success)";
  if (tone === "danger") return "var(--share-card-danger)";
  if (tone === "warning") return "var(--share-card-warning)";
  return "var(--share-card-secondary)";
}

function resolveShareTicketStatus(
  ticket: ShareTicketPayload,
  showExpandedLegs: boolean,
  revealSelection: boolean,
  isTipsterPromo: boolean,
): { label: string; shortPill: string; tone: TicketTone; icon: "check" | "x" | "push-void" | "shield" | "lock" } {
  const st = ticket.settlementStatus;
  if (st === "won") {
    return {
      label: showExpandedLegs ? "Parlay ganado · Verificado" : "Pick ganado · Verificado",
      shortPill: "Ganado",
      tone: "success",
      icon: "check",
    };
  }
  if (st === "lost") {
    return {
      label: showExpandedLegs
        ? ticket.legSummaryLabel
          ? `Parlay perdido · ${ticket.legSummaryLabel}`
          : "Parlay perdido"
        : "Pick cerrado · Perdido",
      shortPill: "Perdido",
      tone: "danger",
      icon: "x",
    };
  }
  if (st === "push") {
    return {
      label: showExpandedLegs ? "Parlay empatado · Push" : "Pick cerrado · Push",
      shortPill: "Push",
      tone: "neutral",
      icon: "push-void",
    };
  }
  if (showExpandedLegs) {
    return {
      label: ticket.legSummaryLabel ? `Parlay · ${ticket.legSummaryLabel}` : "Parlay · PitchLab",
      shortPill: ticket.gameStatus === "LIVE" ? "En vivo" : "Activo",
      tone: "success",
      icon: "shield",
    };
  }
  if (revealSelection) {
    return {
      label: isTipsterPromo
        ? (ticket.originBadge ?? "Pick abierto de la semana")
        : "Resultado final verificado",
      shortPill: isTipsterPromo ? "Abierto" : "Verificado",
      tone: "success",
      icon: "shield",
    };
  }
  return {
    label: "Protección prepartido",
    shortPill: "Sellado",
    tone: "warning",
    icon: "lock",
  };
}

function formatTicketLegMetrics(
  leg: ShareTicketLegItem,
  oddsFormat: OddsFormat,
): { probLabel: string; oddsLabel: string; tone: TicketTone } {
  const statusTone: TicketTone =
    leg.status === "won"
      ? "success"
      : leg.status === "lost"
        ? "danger"
        : leg.status === "push"
          ? "neutral"
          : "success";
  const probLabel =
    leg.p !== null && Number.isFinite(leg.p)
      ? `${(leg.p * 100).toFixed(1)} %`
      : leg.status === "won"
        ? "Cumplida"
        : leg.status === "lost"
          ? "Fallada"
          : leg.status === "push"
            ? "Push"
            : "Activa";
  const oddsLabel =
    leg.fairDecimal !== null && Number.isFinite(leg.fairDecimal) && leg.fairDecimal > 1
      ? `Justo ${formatOddsValue(leg.fairDecimal, oddsFormat)}`
      : "";
  return { probLabel, oddsLabel, tone: statusTone };
}

export function ShareTicketModal(): React.JSX.Element | null {
  const { shareTicket } = useOverlayState();
  const {
    viewerRole,
    oddsFormat,
    viewerIdentity,
    memberReferralsSnapshot,
  } = usePlatformCore();
  const { closeShareTicket, pushToast } = usePlatformActions();
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
    const ranked = shareTicket.legs
      .map((leg, idx) => ({ idx, p: leg.p }))
      .filter(
        (item): item is { idx: number; p: number } =>
          item.p !== null && Number.isFinite(item.p),
      );
    if (ranked.length < 3) {
      return new Set<number>();
    }
    const highlightCount = shareTicket.legs.length >= 4 ? 2 : 1;
    ranked.sort((a, b) => b.p - a.p || a.idx - b.idx);
    return new Set(ranked.slice(0, highlightCount).map((r) => r.idx));
  })();
  const isSettledTicket = Boolean(
    shareTicket.settlementStatus && shareTicket.settlementStatus !== "pending",
  );
  const statusInfo = resolveShareTicketStatus(
    shareTicket,
    showExpandedLegs,
    revealSelection,
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

  const settledSummaryLeft =
    shareTicket.marketDecimal > 1
      ? formatOddsValue(shareTicket.marketDecimal, oddsFormat)
      : formatOddsValue(shareTicket.fairDecimal, oddsFormat);
  const settledSummaryRight =
    shareTicket.netUnits !== null && shareTicket.netUnits !== undefined
      ? formatSignedUnitsLabel(shareTicket.netUnits)
      : (shareTicket.legSummaryLabel ?? `${shareTicket.legs?.length ?? 0}`);
  const pendingFairValue =
    oddsFormat === "american"
      ? `${formatOddsValue(shareTicket.fairDecimal, "american")} (${shareTicket.fairDecimal.toFixed(2)})`
      : `${shareTicket.fairDecimal.toFixed(2)} (${formatOddsValue(shareTicket.fairDecimal, "american")})`;
  const pendingProbValue = `${(shareTicket.probability * 100).toFixed(1)} %`;

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
          badge: statusInfo.label,
          badgeTone: statusInfo.tone,
          mainLine: isSettledTicket
            ? settledSummaryLeft
            : `${formatOddsValue(shareTicket.fairDecimal, oddsFormat)}`,
          detailLine: isSettledTicket
            ? `Balance ${settledSummaryRight}`
            : `Probabilidad ${pendingProbValue}`,
          summaryLeftLabel: isSettledTicket ? "CUOTA SELLADA" : "MOMIO JUSTO",
          summaryLeftValue: isSettledTicket ? settledSummaryLeft : pendingFairValue,
          summaryRightLabel: isSettledTicket
            ? shareTicket.netUnits !== null && shareTicket.netUnits !== undefined
              ? "RESULTADO"
              : "SELECCIONES"
            : "PROBABILIDAD",
          summaryRightValue: isSettledTicket ? settledSummaryRight : pendingProbValue,
          summaryTone: isSettledTicket ? statusInfo.tone : undefined,
          legs: shareTicket.legs.map((leg, idx) => {
            const metrics = formatTicketLegMetrics(leg, oddsFormat);
            return {
              rank: idx + 1,
              label: leg.label,
              subLabel: leg.matchLabel,
              probLabel: metrics.probLabel,
              oddsLabel: metrics.oddsLabel,
              highlight: topLegIndices.has(idx),
              status: leg.status,
            };
          }),
        }
      : revealSelection
      ? {
          ...base,
          badge: statusInfo.label,
          badgeTone: statusInfo.tone,
          mainLine: shareTicket.pickLabel,
          detailLine:
            isSettledTicket &&
            shareTicket.netUnits !== null &&
            shareTicket.netUnits !== undefined
              ? `Cuota ${formatOddsValue(shareTicket.marketDecimal, oddsFormat)} · ${formatSignedUnitsLabel(shareTicket.netUnits)}`
              : `Probabilidad ${pendingProbValue} · Momio ${formatOddsValue(shareTicket.marketDecimal, oddsFormat)} (justo ${formatOddsValue(shareTicket.fairDecimal, oddsFormat)})`,
        }
      : {
          ...base,
          badge: "Protección prepartido",
          badgeTone: "warning",
          mainLine: `Pick registrado en PitchLab · ${(shareTicket.probability * 100).toFixed(0)} % de probabilidad`,
          detailLine: "La selección exacta se desbloquea en el inicio.",
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

  const modalSubtitle = showExpandedLegs
    ? [
        `${shareTicket.legs?.length ?? 0} selecciones`,
        shareTicket.leagueLabel,
        shareTicket.legSummaryLabel,
      ]
        .filter(Boolean)
        .join(" · ")
    : !revealSelection
      ? "Oculta la selección hasta el inicio del partido."
      : shareTicket.subtitle;

  return (
    <TopLayerModalDialog
      open={Boolean(shareTicket)}
      onClose={closeShareTicket}
      ariaLabelledBy="share-modal-title"
      maxWidth="34rem"
    >
      <div className="pl-share-modal">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="share-modal-title" className="m-0 text-base font-extrabold">
              Comparte tu boleto
            </h2>
            <p
              className="m-0 text-xs mt-0.5 truncate"
              style={{ color: "var(--pl-text-muted)" }}
            >
              {modalSubtitle}
            </p>
          </div>
          <button
            type="button"
            className="pl-btn-glass min-h-11 min-w-11 px-2.5 shrink-0 inline-flex items-center justify-center"
            aria-label="Cerrar vista de boleto"
            onClick={closeShareTicket}
          >
            <MaestroIcon name="x" size={15} />
          </button>
        </div>

        <div className="seg-well w-fit" role="group" aria-label="Formato de historia">
          <button
            type="button"
            className="seg-btn !min-h-[44px] sm:!min-h-[34px] !px-3.5 text-xs"
            aria-pressed={aspect === "4:5"}
            onClick={() => setAspect("4:5")}
          >
            4:5 · Publicación
          </button>
          <button
            type="button"
            className="seg-btn !min-h-[44px] sm:!min-h-[34px] !px-3.5 text-xs"
            aria-pressed={aspect === "9:16"}
            onClick={() => setAspect("9:16")}
          >
            9:16 · Historia
          </button>
        </div>

        <div
          className={`share-ticket-card pl-share-ticket ${aspect === "9:16" ? "is-tall" : ""}`.trim()}
          data-share-ticket=""
          data-share-aspect={aspect}
          ref={ticketRef}
        >
          <div className="flex items-center justify-between gap-2">
            <img
              src={getLogoPath("horizontal", "dark")}
              alt="PitchLab"
              loading="lazy"
              decoding="async"
              className="h-5 w-auto object-contain"
            />
            <div className="flex items-center gap-1.5 min-w-0">
              {isSettledTicket ? (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-extrabold whitespace-nowrap"
                  style={{
                    background: `color-mix(in oklab, ${resolveToneCssColor(statusInfo.tone)} 16%, transparent)`,
                    color: resolveToneCssColor(statusInfo.tone),
                  }}
                >
                  {statusInfo.shortPill}
                </span>
              ) : null}
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-bold num truncate"
                style={{
                  background: "var(--share-card-surface)",
                  color: "var(--share-card-fg)",
                }}
              >
                {shareTicket.leagueLabel}
              </span>
            </div>
          </div>

          {shareTicket.tipsterHandle ? (
            <div
              className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={{
                background: "var(--share-card-surface)",
                color: "var(--share-card-accent)",
              }}
            >
              <MaestroIcon name="crown" size={12} />
              <span>@{shareTicket.tipsterHandle} · Perfil oficial</span>
            </div>
          ) : null}

          <div>
            <h3 className="m-0 text-base font-extrabold leading-snug">
              {shareTicket.title}
            </h3>
            <p
              className="m-0 text-xs mt-1 leading-relaxed"
              style={{ color: "var(--share-card-muted)" }}
            >
              {shareTicket.legSummaryLabel && shareTicket.sealedAtLabel
                ? `${shareTicket.legSummaryLabel} · ${shareTicket.sealedAtLabel}`
                : shareTicket.subtitle}
            </p>
          </div>

          <div className="ticket-perf pl-ticket-perf" />

          {showExpandedLegs && shareTicket.legs ? (
            <div className="space-y-2.5" data-share-multi-legs="">
              <ol className="pl-share-legs" role="list" aria-label="Selecciones del boleto">
                {shareTicket.legs.map((leg, idx) => {
                  const isTop = topLegIndices.has(idx);
                  const metrics = formatTicketLegMetrics(leg, oddsFormat);
                  const isWonLeg = leg.status === "won";
                  const isLostLeg = leg.status === "lost";
                  const isPushLeg = leg.status === "push";
                  const legClass = isWonLeg
                    ? "pl-share-leg is-won"
                    : isLostLeg
                      ? "pl-share-leg is-lost"
                      : isPushLeg
                        ? "pl-share-leg is-push"
                        : isTop
                          ? "pl-share-leg is-most-likely"
                          : "pl-share-leg";
                  const rankClass = isWonLeg
                    ? "pl-share-leg-rank is-won num"
                    : isLostLeg
                      ? "pl-share-leg-rank is-lost num"
                      : isPushLeg
                        ? "pl-share-leg-rank is-push num"
                        : isTop
                          ? "pl-share-leg-rank is-top num"
                          : "pl-share-leg-rank num";
                  const rightColor = isWonLeg
                    ? "var(--share-card-success)"
                    : isLostLeg
                      ? "var(--share-card-danger)"
                      : isPushLeg
                        ? "var(--share-card-muted)"
                        : isTop
                          ? "var(--share-card-success)"
                          : "var(--share-card-accent)";

                  return (
                    <li key={`${idx}-${leg.label}`} className={legClass}>
                      <span className={rankClass} aria-hidden="true">
                        {isWonLeg ? (
                          <MaestroIcon name="check" size={12} />
                        ) : isLostLeg ? (
                          <MaestroIcon name="x" size={12} />
                        ) : isPushLeg ? (
                          "—"
                        ) : (
                          idx + 1
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <strong className="text-xs font-extrabold truncate">{leg.label}</strong>
                          {isTop ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold"
                              style={{
                                background:
                                  "color-mix(in oklab, var(--share-card-success) 18%, transparent)",
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
                          style={{ color: rightColor }}
                        >
                          {metrics.probLabel}
                        </span>
                        {metrics.oddsLabel ? (
                          <span
                            className="block text-[10px]"
                            style={{ color: "var(--share-card-muted)" }}
                          >
                            {metrics.oddsLabel}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div
                className="pl-share-summary num"
                style={{
                  borderColor: isSettledTicket
                    ? resolveToneCssColor(statusInfo.tone)
                    : "var(--share-card-accent)",
                }}
              >
                <div>
                  <span
                    className="block text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: "var(--share-card-muted)" }}
                  >
                    {isSettledTicket ? "Cuota · Stake" : "Momio justo"}
                  </span>
                  <strong className="text-base font-extrabold">
                    {isSettledTicket
                      ? `${settledSummaryLeft} · ${shareTicket.units.toFixed(1)}u`
                      : pendingFairValue}
                  </strong>
                </div>
                <div className="text-right">
                  <span
                    className="block text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: "var(--share-card-muted)" }}
                  >
                    {isSettledTicket
                      ? shareTicket.netUnits !== null && shareTicket.netUnits !== undefined
                        ? "Balance"
                        : "Estado"
                      : "Probabilidad"}
                  </span>
                  <strong
                    className="text-base font-extrabold"
                    style={{
                      color: isSettledTicket
                        ? resolveToneCssColor(statusInfo.tone)
                        : "var(--share-card-success)",
                    }}
                  >
                    {isSettledTicket ? settledSummaryRight : pendingProbValue}
                  </strong>
                </div>
              </div>
            </div>
          ) : revealSelection ? (
            <div
              className="rounded-xl p-3.5 space-y-1.5"
              style={{
                background: "var(--share-card-surface)",
                border: `1px solid ${resolveToneCssColor(statusInfo.tone)}`,
              }}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span
                  style={{ color: resolveToneCssColor(statusInfo.tone) }}
                  className="font-bold inline-flex items-center gap-1.5"
                >
                  <MaestroIcon name={statusInfo.icon} size={13} />
                  {statusInfo.label}
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
                {isSettledTicket &&
                shareTicket.netUnits !== null &&
                shareTicket.netUnits !== undefined
                  ? `Cuota ${formatOddsValue(shareTicket.marketDecimal, oddsFormat)} · Balance ${formatSignedUnitsLabel(shareTicket.netUnits)}`
                  : `Probabilidad ${pendingProbValue} · Momio ${formatOddsValue(shareTicket.marketDecimal, oddsFormat)} (justo ${formatOddsValue(shareTicket.fairDecimal, oddsFormat)})`}
              </p>
            </div>
          ) : (
            <div
              className="rounded-xl p-3.5 space-y-1.5"
              style={{
                background: "var(--share-card-surface)",
                border: "1px solid var(--share-card-border)",
              }}
              data-sealed-prekickoff=""
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span
                  style={{ color: "var(--share-card-warning)" }}
                  className="font-bold inline-flex items-center gap-1.5"
                >
                  <MaestroIcon name="lock" size={13} />
                  Selección protegida
                </span>
                <span className="num font-extrabold">
                  {shareTicket.units.toFixed(1)}u
                </span>
              </div>
              <p className="m-0 text-sm font-bold">
                Pick registrado en PitchLab · {(shareTicket.probability * 100).toFixed(0)} % de probabilidad
              </p>
              <p
                className="m-0 text-xs leading-relaxed"
                style={{ color: "var(--share-card-muted)" }}
              >
                Visible automáticamente al arranque.
              </p>
            </div>
          )}

          {aspect === "9:16" && (shareTicket.bookLabel || shareTicket.sealedAtLabel) ? (
            <div
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[11px] num"
              style={{
                background: "var(--share-card-surface)",
                color: "var(--share-card-secondary)",
              }}
            >
              <span>{shareTicket.bookLabel ? `Casa · ${shareTicket.bookLabel}` : "Registro PitchLab"}</span>
              <span>{shareTicket.sealedAtLabel ?? `${shareTicket.units.toFixed(1)}u`}</span>
            </div>
          ) : null}

          <div className="ticket-perf pl-ticket-perf" />

          <div className="pl-share-footer-card">
            <div className="flex items-center justify-between gap-2">
              <span
                className="font-extrabold truncate"
                style={{ color: "var(--share-card-fg)" }}
              >
                {shareTicket.promoCode
                  ? `Código ${shareTicket.promoCode} · 5 días gratis`
                  : "Prueba PitchLab 7 días gratis"}
              </span>
              <span className="num font-bold whitespace-nowrap shrink-0 text-[10px] opacity-80">
                {watermark}
              </span>
            </div>
            <span className="block mt-0.5 text-[11px]" style={{ color: "var(--share-card-muted)" }}>
              pitchlab.mx · Solo +18 · Unidades simuladas
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
          <span
            className="text-xs"
            style={{ color: copyState === "error" ? "var(--pl-warning)" : "var(--pl-text-muted)" }}
            role={copyState === "error" ? "status" : undefined}
          >
            {copyState === "error"
              ? `No se pudo acceder al portapapeles. Enlace: pitchlab.mx${sharePath}`
              : copyState === "copied"
                ? "Enlace copiado al portapapeles."
                : "Formato 4:5 o 9:16 listo para compartir."}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="pl-btn-glass min-h-11 sm:min-h-9 text-xs inline-flex items-center gap-1.5"
              onClick={handleDownloadTicket}
            >
              <MaestroIcon name="download" size={14} />
              Descargar PNG
            </button>
            <button
              type="button"
              autoFocus
              className="pl-btn-primary min-h-11 sm:min-h-9 text-xs inline-flex items-center gap-1.5"
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
    </TopLayerModalDialog>
  );
}

export { CommandPaletteModal, type CommandPaletteModalProps } from "./CommandPaletteModal";

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
              className="pl-btn-glass min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 px-2.5 inline-flex items-center justify-center"
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

export type RenderedToastItem = {
  id: string;
  tone: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  closing?: boolean;
};

export function computeNextRenderedToasts(
  prev: readonly RenderedToastItem[],
  toasts: readonly Omit<RenderedToastItem, "closing">[],
): { next: RenderedToastItem[]; newlyClosingIds: string[] } {
  const activeMap = new Map(toasts.map((t) => [t.id, t]));
  const prevMap = new Map(prev.map((item) => [item.id, item]));
  const next: RenderedToastItem[] = [];
  const newlyClosingIds: string[] = [];

  for (const item of prev) {
    const fresh = activeMap.get(item.id);
    if (fresh) {
      next.push({ ...fresh, closing: false });
    } else if (!item.closing) {
      newlyClosingIds.push(item.id);
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

  return { next, newlyClosingIds };
}

function areRenderedToastsEqual(
  a: readonly RenderedToastItem[],
  b: readonly RenderedToastItem[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i];
    const bi = b[i];
    if (
      !ai ||
      !bi ||
      ai.id !== bi.id ||
      ai.tone !== bi.tone ||
      ai.text !== bi.text ||
      ai.actionLabel !== bi.actionLabel ||
      ai.onAction !== bi.onAction ||
      Boolean(ai.closing) !== Boolean(bi.closing)
    ) {
      return false;
    }
  }
  return true;
}

export function ToastViewport(): React.JSX.Element | null {
  const { toasts } = useOverlayState();
  const { dismissToast, setToastPaused } = usePlatformActions();
  const [rendered, setRendered] = useState<RenderedToastItem[]>(() =>
    toasts.map((t) => ({ ...t, closing: false })),
  );
  const prevRenderedRef = useRef<RenderedToastItem[]>(rendered);
  const closingTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const timers = closingTimersRef.current;
    for (const toast of toasts) {
      const pendingTimer = timers.get(toast.id);
      if (pendingTimer !== undefined) {
        window.clearTimeout(pendingTimer);
        timers.delete(toast.id);
      }
    }

    const prev = prevRenderedRef.current;
    const { next, newlyClosingIds } = computeNextRenderedToasts(prev, toasts);
    if (!areRenderedToastsEqual(prev, next)) {
      prevRenderedRef.current = next;
      setRendered(next);
    }

    for (const id of newlyClosingIds) {
      if (timers.has(id)) continue;
      const timerId = window.setTimeout(() => {
        timers.delete(id);
        const current = prevRenderedRef.current;
        const filtered = current.filter(
          (item) => !(item.id === id && item.closing),
        );
        if (filtered.length !== current.length) {
          prevRenderedRef.current = filtered;
          setRendered(filtered);
        }
      }, 260);
      timers.set(id, timerId);
    }
  }, [toasts]);

  useEffect(() => {
    const timers = closingTimersRef.current;
    return () => {
      for (const timerId of timers.values()) {
        window.clearTimeout(timerId);
      }
      timers.clear();
    };
  }, []);

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
          aria-hidden={t.closing ? true : undefined}
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
              disabled={Boolean(t.closing)}
              tabIndex={t.closing ? -1 : undefined}
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
