"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { formatOddsValue } from "../access-guard";
import { computeParlaySummary } from "../parlay-engine";
import { usePlatform } from "../platform-provider";
import { MaestroIcon } from "./MaestroPrimitives";
import { SgpCopulaAuditCard } from "./SgpCopulaAuditCard";

let cachedCanTransitionDisplay: boolean | undefined;

function canTransitionDisplay(): boolean {
  if (cachedCanTransitionDisplay !== undefined) return cachedCanTransitionDisplay;
  if (typeof window === "undefined" || !window.CSS?.supports?.("transition-behavior", "allow-discrete") || !document.body) {
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
  return typeof window !== "undefined" && Boolean(window.CSS?.supports?.("overlay", "auto")) && canTransitionDisplay();
}

/**
 * Píldora flotante en móvil sobre el tab bar + Bottom-Sheet nativo `<dialog closedby="any">`
 * para revisar, editar o guardar tu Parlay con una mano desde cualquier pantalla del Club.
 */
export function MobileParlaySheet(): React.JSX.Element | null {
  const {
    parlayLegs,
    oddsFormat,
    removePickFromParlay,
    clearParlay,
    sealParlayToJournal,
    navigateTo,
  } = usePlatform();

  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const summary = useMemo(() => computeParlaySummary(parlayLegs), [parlayLegs]);

  const closeSheet = useCallback(async () => {
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
    dialog.close();
    setOpen(false);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.removeAttribute("data-closing");
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Cierre animado en Esc/light-dismiss + fallback de clic fuera para Safari sin `closedby`.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onCancel = (event: Event) => {
      event.preventDefault();
      void closeSheet();
    };
    const onClose = () => setOpen(false);
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onClose);

    const hasClosedBy = typeof HTMLDialogElement !== "undefined" && "closedBy" in HTMLDialogElement.prototype;
    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
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

  const oddsText = formatOddsValue(summary.fairDecimal, oddsFormat);

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
          <span className="pl-parlay-fab-prob num">{(summary.combinedProbability * 100).toFixed(0)} %</span>
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className="pl-bottom-sheet-dialog"
        aria-labelledby={titleId}
        {...({ closedby: "any" } as Record<string, string>)}
        data-mobile-parlay-sheet=""
      >
        <div className="pl-bottom-sheet-inner">
          <div className="pl-bottom-sheet-handle" aria-hidden="true" />
          <header className="pl-bottom-sheet-head">
            <div>
              <h2 id={titleId} className="m-0 text-base font-extrabold">
                Tu parlay ({parlayLegs.length})
              </h2>
              <p className="m-0 text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                Probabilidad {(summary.combinedProbability * 100).toFixed(1)} % · Momio justo {oddsText}
              </p>
            </div>
            <button
              type="button"
              className="pl-icon-btn"
              aria-label="Cerrar boleto de parlay"
              onClick={() => void closeSheet()}
            >
              <MaestroIcon name="x" size={18} />
            </button>
          </header>

          <ul className="pl-bottom-sheet-legs" role="list">
            {parlayLegs.map((leg) => (
              <li key={leg.pick.id} className="pl-bottom-sheet-leg">
                <div className="min-w-0 flex-1">
                  <strong className="block text-sm truncate">{leg.pick.label}</strong>
                  <span className="block text-xs truncate" style={{ color: "var(--pl-text-muted)" }}>
                    {leg.pick.matchLabel} · {(leg.pick.p * 100).toFixed(0)} % · {formatOddsValue(leg.pick.fairDecimal, oddsFormat)}
                  </span>
                </div>
                <button
                  type="button"
                  className="pl-icon-btn"
                  aria-label={`Quitar ${leg.pick.label} del parlay`}
                  onClick={() => removePickFromParlay(leg.pick.id)}
                >
                  <MaestroIcon name="x" size={15} />
                </button>
              </li>
            ))}
          </ul>

          {summary.hasSgpCorrelation ? (
            <SgpCopulaAuditCard
              legs={parlayLegs}
              oddsFormat={oddsFormat}
              compact
            />
          ) : null}

          <footer className="pl-bottom-sheet-actions">
            <button
              type="button"
              className="pl-btn-primary flex-1 min-h-11 text-sm"
              disabled={parlayLegs.length < 2}
              onClick={() => {
                sealParlayToJournal();
                void closeSheet();
              }}
            >
              Guardar en Mi récord
            </button>
            <button
              type="button"
              className="pl-btn-glass min-h-11 px-3 text-sm"
              onClick={() => {
                void closeSheet();
                navigateTo("/app/parlays");
              }}
            >
              Abrir Parlays
            </button>
            <button
              type="button"
              className="pl-btn-glass min-h-11 px-3 text-xs"
              onClick={() => {
                clearParlay();
                void closeSheet();
              }}
            >
              Limpiar
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
