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

  const begin = useCallback(
    (clientY: number) => {
      if (disabled) return;
      if (scrollContainerRef?.current && scrollContainerRef.current.scrollTop > 0) return;
      startYRef.current = clientY;
      lastYRef.current = clientY;
      startTimeRef.current = Date.now();
      setState({ offsetY: 0, dragging: true });
    },
    [disabled, scrollContainerRef],
  );

  const move = useCallback(
    (clientY: number) => {
      if (disabled || startYRef.current === null) return;
      const delta = clientY - startYRef.current;
      lastYRef.current = clientY;
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
    const offset = Math.max(0, lastYRef.current - startYRef.current);
    const elapsed = Math.max(1, Date.now() - startTimeRef.current);
    const velocity = offset / elapsed;
    startYRef.current = null;
    activePointerIdRef.current = null;
    if (shouldDismissSheetSwipe(offset, velocity, thresholdPx, velocityPxPerMs)) {
      setState({ offsetY: 0, dragging: false });
      onDismiss();
    } else {
      setState({ offsetY: 0, dragging: false });
    }
  }, [onDismiss, thresholdPx, velocityPxPerMs]);

  const cancel = useCallback(() => {
    startYRef.current = null;
    activePointerIdRef.current = null;
    setState({ offsetY: 0, dragging: false });
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      const touch = e.touches[0];
      if (!touch) return;
      begin(touch.clientY);
    },
    [begin],
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
      if (e.pointerType === "touch") return; // Ya lo manejan onTouch*
      if (e.button !== 0) return;
      activePointerIdRef.current = e.pointerId;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (err) {
        void err;
      }
      begin(e.clientY);
    },
    [begin],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      move(e.clientY);
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
