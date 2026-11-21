"use client";

import { useCallback, useRef, useState } from "react";
import { prefersReducedMotion } from "../navigation-helpers";

export interface SheetSwipeDismissOptions {
  /** Llamado cuando el usuario supera el umbral de arrastre o velocidad hacia abajo. */
  readonly onDismiss: () => void;
  /** Distancia mínima en px para cerrar al soltar (default: 92 px). */
  readonly thresholdPx?: number;
  /** Velocidad mínima en px/ms hacia abajo para cerrar con flick corto (default: 0.55). */
  readonly velocityPxPerMs?: number;
  /** Desactiva el gesto temporalmente (p. ej. escritorio o sheet bloqueado). */
  readonly disabled?: boolean;
  /** Contenedor desplazable opcional: solo inicia arrastre si `scrollTop <= 0`. */
  readonly scrollContainerRef?: React.RefObject<HTMLElement | null>;
}

export interface SheetSwipeState {
  readonly offsetY: number;
  readonly dragging: boolean;
}

const INTERACTIVE_SWIPE_SELECTOR =
  'button, a, input, select, textarea, summary, label, [role="button"], [role="link"], [role="tab"], [role="option"], [role="switch"], [role="menuitem"], [role="checkbox"], [role="radio"], [contenteditable="true"]';

const DRAG_ACTIVATION_SLOP_PX = 8;

/**
 * Evita que el gesto *swipe-to-dismiss* capture clics o toques sobre controles interactivos
 * (botones, enlaces, entradas, pestañas) montados dentro de la hoja o su cabecera.
 */
export function isInteractiveSwipeTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const candidate =
    "closest" in target && typeof (target as Element).closest === "function"
      ? (target as Element)
      : "parentElement" in target
        ? ((target as Node).parentElement ?? null)
        : null;
  if (!candidate || typeof candidate.closest !== "function") return false;
  return candidate.closest(INTERACTIVE_SWIPE_SELECTOR) !== null;
}

/**
 * Decisión pura para pruebas unitarias: determina si un arrastre hacia abajo cierra la hoja.
 */
export function shouldDismissSheetSwipe(
  offsetY: number,
  velocityPxPerMs: number,
  thresholdPx = 92,
  minVelocity = 0.55,
): boolean {
  if (!Number.isFinite(offsetY) || offsetY <= 0) return false;
  if (offsetY >= thresholdPx) return true;
  if (offsetY >= 32 && Number.isFinite(velocityPxPerMs) && velocityPxPerMs >= minVelocity) {
    return true;
  }
  return false;
}

/**
 * Hook reutilizable de física táctil *swipe-to-dismiss* para bottom sheets móviles (ADR-053).
 * Mueve el panel en GPU vía `transform: translateY(...)` siguiendo el dedo, cierra al superar
 * distancia o velocidad y vuelve con resorte suave si el usuario cancela.
 */
export function useSheetSwipeDismiss({
  onDismiss,
  thresholdPx = 92,
  velocityPxPerMs = 0.55,
  disabled = false,
  scrollContainerRef,
}: SheetSwipeDismissOptions): {
  readonly offsetY: number;
  readonly dragging: boolean;
  readonly sheetStyle: React.CSSProperties;
  readonly handleProps: {
    onTouchStart: (e: React.TouchEvent<HTMLElement>) => void;
    onTouchMove: (e: React.TouchEvent<HTMLElement>) => void;
    onTouchEnd: () => void;
    onTouchCancel: () => void;
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
  };
} {
  const [state, setState] = useState<SheetSwipeState>({ offsetY: 0, dragging: false });
  const startYRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastYRef = useRef<number>(0);
  const activePointerIdRef = useRef<number | null>(null);
  const capturedTargetRef = useRef<HTMLElement | null>(null);
  const draggingActiveRef = useRef<boolean>(false);

  const releaseCapture = useCallback(() => {
    const target = capturedTargetRef.current;
    const pointerId = activePointerIdRef.current;
    capturedTargetRef.current = null;
    if (target && pointerId !== null) {
      try {
        if (typeof target.hasPointerCapture === "function" && target.hasPointerCapture(pointerId)) {
          target.releasePointerCapture(pointerId);
        }
      } catch (err) {
        void err;
      }
    }
  }, []);

  const begin = useCallback(
    (clientY: number): boolean => {
      if (disabled) return false;
      if (scrollContainerRef?.current && scrollContainerRef.current.scrollTop > 0) return false;
      startYRef.current = clientY;
      lastYRef.current = clientY;
      startTimeRef.current = Date.now();
      draggingActiveRef.current = false;
      return true;
    },
    [disabled, scrollContainerRef],
  );

  const move = useCallback(
    (clientY: number, pointerEvent?: React.PointerEvent<HTMLElement>) => {
      if (disabled || startYRef.current === null) return;
      const delta = clientY - startYRef.current;
      lastYRef.current = clientY;
      if (!draggingActiveRef.current) {
        if (delta < DRAG_ACTIVATION_SLOP_PX) return;
        draggingActiveRef.current = true;
        if (pointerEvent) {
          try {
            pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
            capturedTargetRef.current = pointerEvent.currentTarget;
          } catch (err) {
            void err;
          }
        }
      }
      // Permite ligera resistencia hacia arriba (hasta 0) y arrastre 1:1 hacia abajo
      const clamped = delta > 0 ? Math.min(delta, 420) : 0;
      setState((prev) =>
        prev.offsetY === clamped && prev.dragging ? prev : { offsetY: clamped, dragging: true },
      );
    },
    [disabled],
  );

  const finish = useCallback(() => {
    if (startYRef.current === null) return;
    const wasDragging = draggingActiveRef.current;
    const offset = Math.max(0, lastYRef.current - startYRef.current);
    const elapsed = Math.max(1, Date.now() - startTimeRef.current);
    const velocity = offset / elapsed;
    releaseCapture();
    startYRef.current = null;
    activePointerIdRef.current = null;
    draggingActiveRef.current = false;
    if (!wasDragging) return;
    if (shouldDismissSheetSwipe(offset, velocity, thresholdPx, velocityPxPerMs)) {
      setState({ offsetY: 0, dragging: false });
      onDismiss();
    } else {
      setState({ offsetY: 0, dragging: false });
    }
  }, [onDismiss, releaseCapture, thresholdPx, velocityPxPerMs]);

  const cancel = useCallback(() => {
    const wasDragging = draggingActiveRef.current;
    releaseCapture();
    startYRef.current = null;
    activePointerIdRef.current = null;
    draggingActiveRef.current = false;
    if (wasDragging) {
      setState({ offsetY: 0, dragging: false });
    }
  }, [releaseCapture]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      if (disabled || isInteractiveSwipeTarget(e.target)) return;
      const touch = e.touches[0];
      if (!touch) return;
      begin(touch.clientY);
    },
    [begin, disabled],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      const touch = e.touches[0];
      if (!touch) return;
      move(touch.clientY);
    },
    [move],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled) return;
      if (e.pointerType === "touch") return; // Ya lo manejan onTouch*
      if (e.button !== 0) return;
      if (isInteractiveSwipeTarget(e.target)) return;
      if (!begin(e.clientY)) return;
      activePointerIdRef.current = e.pointerId;
    },
    [begin, disabled],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      move(e.clientY, e);
    },
    [move],
  );

  const onPointerUp = useCallback(() => {
    if (activePointerIdRef.current === null) return;
    finish();
  }, [finish]);

  const reduced = prefersReducedMotion();
  const sheetStyle: React.CSSProperties =
    state.offsetY > 0 || state.dragging
      ? {
          transform: `translate3d(0, ${state.offsetY}px, 0)`,
          transition: state.dragging || reduced ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: state.dragging ? "transform" : undefined,
        }
      : {
          transition: reduced ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        };

  return {
    offsetY: state.offsetY,
    dragging: state.dragging,
    sheetStyle,
    handleProps: {
      onTouchStart,
      onTouchMove,
      onTouchEnd: finish,
      onTouchCancel: cancel,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: cancel,
    },
  };
}
