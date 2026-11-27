"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../navigation-helpers";

export interface SheetSwipeDismissOptions {
  readonly onDismiss: () => void;
  readonly thresholdPx?: number;
  readonly velocityPxPerMs?: number;
  readonly disabled?: boolean;
  readonly scrollContainerRef?: React.RefObject<HTMLElement | null>;
  readonly dragHandleSelector?: string;
}

export interface SheetSwipeState {
  readonly offsetY: number;
  readonly dragging: boolean;
}

const INTERACTIVE_SWIPE_SELECTOR =
  'button, a, input, select, textarea, summary, label, [role="button"], [role="link"], [role="tab"], [role="option"], [role="switch"], [role="menuitem"], [role="checkbox"], [role="radio"], [contenteditable="true"]';

const BLOCKED_GESTURE_STRIP_SELECTOR =
  '[role="tablist"], .pl-notif-tabs, .pl-notif-chips, .pl-com-picker-mode';

const DRAG_ACTIVATION_SLOP_PX = 8;

function resolveTargetElement(target: EventTarget | null): Element | null {
  if (!target || typeof target !== "object") return null;
  if ("closest" in target && typeof (target as Element).closest === "function") {
    return target as Element;
  }
  if ("parentElement" in target) {
    return (target as Node).parentElement ?? null;
  }
  return null;
}

export function isInteractiveSwipeTarget(target: EventTarget | null): boolean {
  const candidate = resolveTargetElement(target);
  if (!candidate || typeof candidate.closest !== "function") return false;
  return candidate.closest(INTERACTIVE_SWIPE_SELECTOR) !== null;
}

export function hasScrolledAncestor(
  target: EventTarget | null,
  boundary: EventTarget | null = null,
): boolean {
  const startEl = resolveTargetElement(target);
  if (!startEl) return false;
  if (
    startEl.closest(BLOCKED_GESTURE_STRIP_SELECTOR) !== null &&
    startEl.closest(".pl-sheet-drag-zone") === null
  ) {
    return true;
  }
  const stopNode =
    typeof Node !== "undefined" && boundary instanceof Node ? boundary : null;
  let cursor: Element | null = startEl;
  while (cursor) {
    if (cursor.scrollTop > 0) return true;
    if (stopNode && cursor === stopNode) break;
    cursor = cursor.parentElement;
  }
  return false;
}

function isWithinDragHandle(target: EventTarget | null, selector?: string): boolean {
  if (!selector) return true;
  const candidate = resolveTargetElement(target);
  if (!candidate || typeof candidate.closest !== "function") return false;
  return candidate.closest(selector) !== null;
}

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

export function useSheetSwipeDismiss({
  onDismiss,
  thresholdPx = 92,
  velocityPxPerMs = 0.55,
  disabled = false,
  scrollContainerRef,
  dragHandleSelector,
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
    onPointerUp: (e?: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (e?: React.PointerEvent<HTMLElement>) => void;
  };
} {
  const [state, setState] = useState<SheetSwipeState>({ offsetY: 0, dragging: false });
  const startYRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastYRef = useRef<number>(0);
  const activePointerIdRef = useRef<number | null>(null);
  const pointerHostRef = useRef<HTMLElement | null>(null);
  const capturedTargetRef = useRef<HTMLElement | null>(null);
  const draggingActiveRef = useRef<boolean>(false);
  const touchActiveRef = useRef<boolean>(false);
  const windowCleanupRef = useRef<(() => void) | null>(null);

  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const thresholdPxRef = useRef(thresholdPx);
  thresholdPxRef.current = thresholdPx;
  const velocityPxPerMsRef = useRef(velocityPxPerMs);
  velocityPxPerMsRef.current = velocityPxPerMs;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const scrollContainerRefRef = useRef(scrollContainerRef);
  scrollContainerRefRef.current = scrollContainerRef;

  const detachWindowListeners = useCallback(() => {
    const cleanup = windowCleanupRef.current;
    if (cleanup) {
      windowCleanupRef.current = null;
      cleanup();
    }
  }, []);

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

  const begin = useCallback((clientY: number): boolean => {
    if (disabledRef.current) return false;
    const scroller = scrollContainerRefRef.current?.current;
    if (scroller && scroller.scrollTop > 0) return false;
    startYRef.current = clientY;
    lastYRef.current = clientY;
    startTimeRef.current = Date.now();
    draggingActiveRef.current = false;
    return true;
  }, []);

  const move = useCallback(
    (clientY: number, captureTarget?: HTMLElement | null, pointerId?: number) => {
      if (disabledRef.current || startYRef.current === null) return;
      const delta = clientY - startYRef.current;
      lastYRef.current = clientY;
      if (!draggingActiveRef.current) {
        if (delta < DRAG_ACTIVATION_SLOP_PX) return;
        draggingActiveRef.current = true;
        if (captureTarget && pointerId !== undefined) {
          try {
            if (typeof captureTarget.setPointerCapture === "function") {
              captureTarget.setPointerCapture(pointerId);
              capturedTargetRef.current = captureTarget;
            }
          } catch (err) {
            void err;
          }
        }
      }
      const clamped = delta > 0 ? Math.min(delta, 420) : 0;
      setState((prev) =>
        prev.offsetY === clamped && prev.dragging ? prev : { offsetY: clamped, dragging: true },
      );
    },
    [],
  );

  const finish = useCallback(() => {
    detachWindowListeners();
    if (startYRef.current === null) {
      activePointerIdRef.current = null;
      pointerHostRef.current = null;
      return;
    }
    const wasDragging = draggingActiveRef.current;
    const offset = Math.max(0, lastYRef.current - startYRef.current);
    const elapsed = Math.max(1, Date.now() - startTimeRef.current);
    const velocity = offset / elapsed;
    releaseCapture();
    startYRef.current = null;
    activePointerIdRef.current = null;
    pointerHostRef.current = null;
    draggingActiveRef.current = false;
    if (!wasDragging) return;
    setState({ offsetY: 0, dragging: false });
    if (
      shouldDismissSheetSwipe(
        offset,
        velocity,
        thresholdPxRef.current,
        velocityPxPerMsRef.current,
      )
    ) {
      onDismissRef.current();
    }
  }, [detachWindowListeners, releaseCapture]);

  const cancel = useCallback(() => {
    detachWindowListeners();
    const wasDragging = draggingActiveRef.current;
    releaseCapture();
    startYRef.current = null;
    activePointerIdRef.current = null;
    pointerHostRef.current = null;
    draggingActiveRef.current = false;
    if (wasDragging) {
      setState({ offsetY: 0, dragging: false });
    }
  }, [detachWindowListeners, releaseCapture]);

  useEffect(() => {
    if (disabled) {
      cancel();
    }
  }, [disabled, cancel]);

  useEffect(
    () => () => {
      detachWindowListeners();
      releaseCapture();
      startYRef.current = null;
      activePointerIdRef.current = null;
      pointerHostRef.current = null;
      draggingActiveRef.current = false;
    },
    [detachWindowListeners, releaseCapture],
  );

  const attachWindowListeners = useCallback(
    (pointerId: number) => {
      detachWindowListeners();
      if (typeof window === "undefined") return;
      const onWinPointerMove = (ev: Event) => {
        const pointerEv = ev as PointerEvent;
        if (touchActiveRef.current || activePointerIdRef.current !== pointerId) return;
        if (pointerEv.pointerId !== undefined && pointerEv.pointerId !== pointerId) return;
        const scroller = scrollContainerRefRef.current?.current;
        if (scroller && scroller.scrollTop > 0) {
          cancel();
          return;
        }
        if (typeof pointerEv.clientY !== "number") return;
        move(pointerEv.clientY, pointerHostRef.current, pointerId);
      };
      const onWinPointerUp = (ev: Event) => {
        const pointerEv = ev as PointerEvent;
        if (touchActiveRef.current || activePointerIdRef.current !== pointerId) return;
        if (pointerEv.pointerId !== undefined && pointerEv.pointerId !== pointerId) return;
        finish();
      };
      const onWinPointerCancel = (ev: Event) => {
        const pointerEv = ev as PointerEvent;
        if (touchActiveRef.current || activePointerIdRef.current !== pointerId) return;
        if (pointerEv.pointerId !== undefined && pointerEv.pointerId !== pointerId) return;
        cancel();
      };
      window.addEventListener("pointermove", onWinPointerMove);
      window.addEventListener("pointerup", onWinPointerUp);
      window.addEventListener("pointercancel", onWinPointerCancel);
      windowCleanupRef.current = () => {
        window.removeEventListener("pointermove", onWinPointerMove);
        window.removeEventListener("pointerup", onWinPointerUp);
        window.removeEventListener("pointercancel", onWinPointerCancel);
      };
    },
    [cancel, detachWindowListeners, finish, move],
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      if (
        disabledRef.current ||
        isInteractiveSwipeTarget(e.target) ||
        hasScrolledAncestor(e.target, e.currentTarget) ||
        !isWithinDragHandle(e.target, dragHandleSelector)
      ) {
        return;
      }
      const touch = e.touches[0];
      if (!touch) return;
      detachWindowListeners();
      releaseCapture();
      activePointerIdRef.current = null;
      pointerHostRef.current = null;
      if (begin(touch.clientY)) {
        touchActiveRef.current = true;
      }
    },
    [begin, detachWindowListeners, dragHandleSelector, releaseCapture],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      const scroller = scrollContainerRefRef.current?.current;
      if (scroller && scroller.scrollTop > 0) {
        touchActiveRef.current = false;
        cancel();
        return;
      }
      const touch = e.touches[0];
      if (!touch) return;
      move(touch.clientY);
    },
    [cancel, move],
  );

  const onTouchEndWrapped = useCallback(() => {
    touchActiveRef.current = false;
    finish();
  }, [finish]);

  const onTouchCancelWrapped = useCallback(() => {
    touchActiveRef.current = false;
    cancel();
  }, [cancel]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabledRef.current || touchActiveRef.current) return;
      if (e.button !== 0 && e.pointerType === "mouse") return;
      if (
        isInteractiveSwipeTarget(e.target) ||
        hasScrolledAncestor(e.target, e.currentTarget) ||
        !isWithinDragHandle(e.target, dragHandleSelector)
      ) {
        return;
      }
      if (!begin(e.clientY)) return;
      activePointerIdRef.current = e.pointerId;
      pointerHostRef.current = e.currentTarget;
      attachWindowListeners(e.pointerId);
    },
    [attachWindowListeners, begin, dragHandleSelector],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (touchActiveRef.current || activePointerIdRef.current !== e.pointerId) return;
      const scroller = scrollContainerRefRef.current?.current;
      if (scroller && scroller.scrollTop > 0) {
        cancel();
        return;
      }
      move(e.clientY, e.currentTarget, e.pointerId);
    },
    [cancel, move],
  );

  const onPointerUp = useCallback(
    (e?: React.PointerEvent<HTMLElement>) => {
      if (touchActiveRef.current || activePointerIdRef.current === null) return;
      if (e && e.pointerId !== undefined && e.pointerId !== activePointerIdRef.current) return;
      finish();
    },
    [finish],
  );

  const onPointerCancel = useCallback(
    (e?: React.PointerEvent<HTMLElement>) => {
      if (touchActiveRef.current || activePointerIdRef.current === null) return;
      if (e && e.pointerId !== undefined && e.pointerId !== activePointerIdRef.current) return;
      cancel();
    },
    [cancel],
  );

  const reduced = prefersReducedMotion();
  const sheetStyle: React.CSSProperties =
    state.offsetY > 0 || state.dragging
      ? {
          transform: `translate3d(0, ${state.offsetY}px, 0)`,
          transition: state.dragging || reduced ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: state.dragging ? "transform" : undefined,
        }
      : {};

  return {
    offsetY: state.offsetY,
    dragging: state.dragging,
    sheetStyle,
    handleProps: {
      onTouchStart,
      onTouchMove,
      onTouchEnd: onTouchEndWrapped,
      onTouchCancel: onTouchCancelWrapped,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}
