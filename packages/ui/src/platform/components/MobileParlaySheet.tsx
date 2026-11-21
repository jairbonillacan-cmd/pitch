"use client";

import React, { useCallback, useId, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/primitives";
import { formatOddsValue } from "../access-guard";
import { useSafeEffect } from "../hooks";
import { assessParlayRisk, computeParlaySummary } from "../parlay-engine";
import {
  useParlayState,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import type { SgpCopulaAuditView } from "../types";
import { MaestroIcon } from "./MaestroPrimitives";
import { SgpCopulaAuditCard } from "./SgpCopulaAuditCard";
import { useSheetSwipeDismiss } from "./use-sheet-swipe-dismiss";

export interface MobileParlaySheetProps {
  readonly variant?: "global" | "builder";
  readonly offeredCombinedDecimalOdds?: number | null;
}

let cachedCanTransitionDisplay: boolean | undefined;

function canTransitionDisplay(): boolean {
  if (cachedCanTransitionDisplay !== undefined) return cachedCanTransitionDisplay;
  if (
    typeof window === "undefined" ||
    !window.CSS?.supports?.("transition-behavior", "allow-discrete") ||
    !document.body
  ) {
    return false;
  }
  const probe = document.createElement("div");
  probe.style.cssText = "transition: display 1s allow-discrete !important; display: block;";
  document.body.appendChild(probe);
  void getComputedStyle(probe).display;
  probe.style.display = "none";
  cachedCanTransitionDisplay = getComputedStyle(probe).display === "block";
  probe.remove();
  return cachedCanTransitionDisplay;
}

function supportsTopLayerExit(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.CSS?.supports?.("overlay", "auto")) &&
    canTransitionDisplay()
  );
}

function computeSlipFrechetBounds(
  legs: readonly { readonly pick: { readonly gameId: string; readonly p: number } }[],
): { readonly lower: number; readonly upper: number } {
  if (legs.length === 0) return { lower: 0, upper: 0 };
  const byGame = new Map<string, number[]>();
  for (const leg of legs) {
    const p = Math.min(0.99, Math.max(0.01, leg.pick.p));
    const list = byGame.get(leg.pick.gameId) ?? [];
    list.push(p);
    byGame.set(leg.pick.gameId, list);
  }
  let lower = 1;
  let upper = 1;
  for (const probs of byGame.values()) {
    if (probs.length === 1) {
      lower *= probs[0] ?? 0.5;
      upper *= probs[0] ?? 0.5;
    } else {
      const sumP = probs.reduce((acc, v) => acc + v, 0);
      const minP = probs.reduce((acc, v) => Math.min(acc, v), 1);
      const lo = Math.max(0.0001, sumP - (probs.length - 1));
      lower *= lo;
      upper *= Math.max(lo, minP);
    }
  }
  return {
    lower: Math.max(0.0001, Math.min(0.99, lower)),
    upper: Math.max(0.0001, Math.min(0.99, upper)),
  };
}

export function MobileParlaySheet({
  variant = "global",
  offeredCombinedDecimalOdds = null,
}: MobileParlaySheetProps = {}): React.JSX.Element | null {
  const { oddsFormat } = usePlatformCore();
  const { removePickFromParlay, clearParlay, sealParlayToJournal, navigateTo } =
    usePlatformActions();
  const { parlayLegs, parlayStakeUnits } = useParlayState();

  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [resolvedAudit, setResolvedAudit] = useState<SgpCopulaAuditView | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const titleId = useId();
  const summary = useMemo(
    () => computeParlaySummary(parlayLegs, parlayStakeUnits),
    [parlayLegs, parlayStakeUnits],
  );
  const frechetBounds = useMemo(() => computeSlipFrechetBounds(parlayLegs), [parlayLegs]);

  const effectiveProb = useMemo(() => {
    if (parlayLegs.length === 0) return 0;
    const raw =
      summary.hasSgpCorrelation && resolvedAudit && resolvedAudit.nLegs === parlayLegs.length
        ? resolvedAudit.jointProbability
        : summary.combinedProbability;
    return Math.min(frechetBounds.upper, Math.max(frechetBounds.lower, raw));
  }, [frechetBounds.lower, frechetBounds.upper, parlayLegs.length, resolvedAudit, summary]);

  const effectiveFairDecimal = useMemo(() => {
    if (parlayLegs.length === 0) return 1;
    if (
      summary.hasSgpCorrelation &&
      resolvedAudit &&
      resolvedAudit.nLegs === parlayLegs.length &&
      resolvedAudit.fairCombinedDecimal > 1
    ) {
      return resolvedAudit.fairCombinedDecimal;
    }
    return Math.max(1.01, Math.round((1 / Math.max(effectiveProb, 0.0001)) * 100) / 100);
  }, [effectiveProb, parlayLegs.length, resolvedAudit, summary.hasSgpCorrelation]);

  const risk = useMemo(
    () => assessParlayRisk({ ...summary, combinedProbability: effectiveProb }),
    [effectiveProb, summary],
  );

  const closeSheet = useCallback(async () => {
    setConfirmClear(false);
    const dialog = dialogRef.current;
    if (!dialog || !dialog.open) {
      setOpen(false);
      return;
    }
    if (!supportsTopLayerExit()) {
      dialog.setAttribute("data-closing", "");
      const animations = dialog.getAnimations({ subtree: true });
      if (animations.length > 0) {
        await Promise.race([
          Promise.allSettled(animations.map((a) => a.finished)),
          new Promise((r) => window.setTimeout(r, 400)),
        ]);
      }
      if (!dialog.hasAttribute("data-closing")) return;
      dialog.removeAttribute("data-closing");
    }
    dialog.returnValue = "";
    dialog.close();
    setOpen(false);
  }, []);

  const sheetSwipe = useSheetSwipeDismiss({
    onDismiss: () => {
      void closeSheet();
    },
    disabled: !open,
    scrollContainerRef: listRef,
  });

  useSafeEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.removeAttribute("data-closing");
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    } else if (!open && dialog.open) {
      dialog.returnValue = "";
      dialog.close();
    }
  }, [open]);

  useSafeEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onCancel = (event: Event) => {
      event.preventDefault();
      void closeSheet();
    };
    const onClose = () => {
      dialog.returnValue = "";
      setOpen(false);
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onClose);

    const hasClosedBy =
      typeof HTMLDialogElement !== "undefined" && "closedBy" in HTMLDialogElement.prototype;
    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
      );
    };
    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        void closeSheet();
      }
    };
    if (!hasClosedBy) {
      dialog.addEventListener("pointerdown", onPointerDown);
      dialog.addEventListener("pointerup", onPointerUp);
    }

    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onClose);
      if (!hasClosedBy) {
        dialog.removeEventListener("pointerdown", onPointerDown);
        dialog.removeEventListener("pointerup", onPointerUp);
      }
    };
  }, [closeSheet]);

  if (parlayLegs.length === 0) return null;

  const oddsText = formatOddsValue(effectiveFairDecimal, oddsFormat);

  return (
    <>
      <div className="pl-parlay-fab-wrap" data-mobile-parlay-fab="">
        <button
          type="button"
          className="pl-parlay-fab"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <span className="pl-parlay-fab-badge num">{parlayLegs.length}</span>
          <span className="pl-parlay-fab-label">
            Tu parlay · <strong className="num">{oddsText}</strong>
          </span>
          <span className="pl-parlay-fab-prob num">{(effectiveProb * 100).toFixed(0)} %</span>
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className="pl-bottom-sheet-dialog pl-mps-dialog"
        aria-labelledby={titleId}
        {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
        data-mobile-parlay-sheet=""
      >
        <div className="pl-bottom-sheet-inner pl-mps-inner" style={sheetSwipe.sheetStyle}>
          <div className="pl-sheet-drag-zone" {...sheetSwipe.handleProps}>
            <div className="pl-bottom-sheet-handle" aria-hidden="true" />
            <header className="pl-bottom-sheet-head">
              <div className="min-w-0">
                <h2 id={titleId} className="m-0 text-base font-extrabold">
                  Tu parlay ({parlayLegs.length})
                </h2>
                <p className="m-0 text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                  Probabilidad {(effectiveProb * 100).toFixed(1)} % · Momio justo {oddsText} ·{" "}
                  {risk.shortLabel}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Cerrar boleto de parlay"
                onClick={() => void closeSheet()}
              >
                <MaestroIcon name="x" size={18} />
              </Button>
            </header>
          </div>

          {parlayLegs.length === 1 ? (
            <div
              className="rounded-lg p-2.5 text-xs font-semibold"
              role="status"
              style={{
                background: "var(--pl-pill-info-bg)",
                border: "1px solid var(--pl-pill-info-border)",
                color: "var(--pl-pill-info-fg)",
              }}
            >
              Agrega al menos 1 selección compatible más para poder sellar tu parlay.
            </div>
          ) : null}

          <ul ref={listRef} className="pl-bottom-sheet-legs pl-mps-scroll" role="list">
            {parlayLegs.map((leg) => (
              <li key={leg.pick.id} className="pl-bottom-sheet-leg">
                <div className="min-w-0 flex-1">
                  <strong className="block text-sm truncate">{leg.pick.label}</strong>
                  <span
                    className="block text-xs truncate num"
                    style={{ color: "var(--pl-text-muted)" }}
                  >
                    {leg.pick.matchLabel} · {(leg.pick.p * 100).toFixed(0)} % ·{" "}
                    {formatOddsValue(leg.pick.fairDecimal, oddsFormat)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar ${leg.pick.label} del parlay`}
                  onClick={() => removePickFromParlay(leg.pick.id)}
                >
                  <MaestroIcon name="x" size={15} />
                </Button>
              </li>
            ))}
          </ul>

          {summary.hasSgpCorrelation ? (
            <SgpCopulaAuditCard
              legs={parlayLegs}
              oddsFormat={oddsFormat}
              offeredCombinedDecimalOdds={offeredCombinedDecimalOdds}
              onAuditResolved={setResolvedAudit}
              compact
            />
          ) : null}

          {confirmClear ? (
            <div
              className="rounded-xl p-3 flex flex-wrap items-center justify-between gap-2"
              role="alertdialog"
              aria-label="Confirmar vaciado de parlay"
              style={{
                background: "var(--pl-surface-elevated)",
                border: "1px solid var(--pl-border)",
              }}
            >
              <span className="text-xs font-bold">
                ¿Vaciar las {parlayLegs.length} selecciones del boleto?
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="default"
                  autoFocus
                  onClick={() => setConfirmClear(false)}
                >
                  Cancelar
                </Button>
                <Button
                  variant="secondary"
                  tone="danger"
                  size="default"
                  onClick={() => {
                    setConfirmClear(false);
                    clearParlay();
                    void closeSheet();
                  }}
                >
                  Sí, vaciar
                </Button>
              </div>
            </div>
          ) : (
            <footer className="pl-bottom-sheet-actions">
              <Button
                variant="primary"
                size="default"
                className="pl-bottom-sheet-primary"
                disabled={parlayLegs.length < 2}
                onClick={() => {
                  sealParlayToJournal();
                  void closeSheet();
                }}
              >
                {variant === "builder" ? "Guardar boleto" : "Guardar en Mi récord"}
              </Button>
              {variant === "global" ? (
                <Button
                  variant="secondary"
                  size="default"
                  onClick={() => {
                    void closeSheet();
                    navigateTo("/app/parlays");
                  }}
                >
                  Abrir Parlays
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="default"
                onClick={() => {
                  if (parlayLegs.length >= 2) {
                    setConfirmClear(true);
                  } else {
                    clearParlay();
                    void closeSheet();
                  }
                }}
              >
                Limpiar
              </Button>
            </footer>
          )}
        </div>
      </dialog>
    </>
  );
}
