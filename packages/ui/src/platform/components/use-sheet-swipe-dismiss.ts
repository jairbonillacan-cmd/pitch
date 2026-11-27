"use client";

import { useCallback, useRef, useState } from "react";
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

  const touchActiveRef = useRef<boolean>(false);

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      if (
        disabled ||
        isInteractiveSwipeTarget(e.target) ||
        hasScrolledAncestor(e.target, e.currentTarget) ||
        !isWithinDragHandle(e.target, dragHandleSelector)
      ) {
        return;
      }
      const touch = e.touches[0];
      if (!touch) return;
      if (begin(touch.clientY)) {
        touchActiveRef.current = true;
      }
    },
    [begin, disabled, dragHandleSelector],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      if (scrollContainerRef?.current && scrollContainerRef.current.scrollTop > 0) {
        touchActiveRef.current = false;
        cancel();
        return;
      }
      const touch = e.touches[0];
      if (!touch) return;
      move(touch.clientY);
    },
    [cancel, move, scrollContainerRef],
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
      if (disabled || touchActiveRef.current) return;
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
    },
    [begin, disabled, dragHandleSelector],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (touchActiveRef.current || activePointerIdRef.current !== e.pointerId) return;
      if (scrollContainerRef?.current && scrollContainerRef.current.scrollTop > 0) {
        cancel();
        return;
      }
      move(e.clientY, e);
    },
    [cancel, move, scrollContainerRef],
  );

  const onPointerUp = useCallback(() => {
    if (touchActiveRef.current || activePointerIdRef.current === null) return;
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
      onPointerCancel: cancel,
    },
  };
}
