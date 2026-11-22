"use client";

/**
 * Tooltip · Primitiva accesible (hover + foco + `Escape`, WCAG 1.4.13) sin dependencias
 * externas (ADR-053). Mantiene `role="tooltip"` y `aria-describedby`, permite mover el puntero
 * sobre el contenido sin cerrarlo, nunca roba foco (WCAG 3.2.1) y soporta `render` en el trigger.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "cn";

type TooltipSide = "top" | "bottom" | "left" | "right";
type TooltipAlign = "start" | "center" | "end";

type RenderElement = React.ReactElement<Record<string, unknown>>;
type RenderProp =
  | RenderElement
  | ((props: Record<string, unknown>) => React.ReactElement);

interface TooltipProviderContextValue {
  delay: number;
  closeDelay: number;
}

const TooltipProviderContext = React.createContext<TooltipProviderContextValue>({
  delay: 150,
  closeDelay: 100,
});

interface TooltipContextValue {
  open: boolean;
  tooltipId: string;
  triggerRef: React.RefObject<HTMLElement | null>;
  openNow: () => void;
  scheduleOpen: () => void;
  scheduleClose: () => void;
  closeNow: () => void;
  cancelTimers: () => void;
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

function useTooltipContext(componentName: string): TooltipContextValue {
  const ctx = React.useContext(TooltipContext);
  if (!ctx) {
    throw new Error(`${componentName} debe usarse dentro de <Tooltip>.`);
  }
  return ctx;
}

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
  } else {
    (ref as React.MutableRefObject<T | null>).current = value;
  }
}

function mergeRefs<T>(
  ...refs: Array<React.Ref<T> | undefined>
): React.RefCallback<T> | undefined {
  const active = refs.filter(Boolean);
  if (active.length === 0) return undefined;
  return (node: T | null) => {
    for (const r of active) assignRef(r, node);
  };
}

export interface TooltipProviderProps {
  delay?: number;
  closeDelay?: number;
  children?: React.ReactNode;
}

function TooltipProvider({
  delay = 150,
  closeDelay = 100,
  children,
}: TooltipProviderProps): React.JSX.Element {
  const value = React.useMemo(() => ({ delay, closeDelay }), [delay, closeDelay]);
  return (
    <TooltipProviderContext.Provider value={value}>
      {children}
    </TooltipProviderContext.Provider>
  );
}

export interface TooltipProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  delay?: number;
  children?: React.ReactNode;
}

function Tooltip({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  delay: overrideDelay,
  children,
}: TooltipProps): React.JSX.Element {
  const provider = React.useContext(TooltipProviderContext);
  const delay = overrideDelay ?? provider.delay;
  const closeDelay = provider.closeDelay;

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const tooltipId = React.useId();
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const openTimerRef = React.useRef<number | null>(null);
  const closeTimerRef = React.useRef<number | null>(null);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const onOpenChangeRef = React.useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChangeRef.current?.(next);
    },
    [isControlled],
  );

  const cancelTimers = React.useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openNow = React.useCallback(() => {
    cancelTimers();
    setOpen(true);
  }, [cancelTimers, setOpen]);

  const closeNow = React.useCallback(() => {
    cancelTimers();
    setOpen(false);
  }, [cancelTimers, setOpen]);

  const scheduleOpen = React.useCallback(() => {
    cancelTimers();
    if (delay <= 0 || typeof window === "undefined") {
      setOpen(true);
      return;
    }
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      setOpen(true);
    }, delay);
  }, [cancelTimers, delay, setOpen]);

  const scheduleClose = React.useCallback(() => {
    cancelTimers();
    if (closeDelay <= 0 || typeof window === "undefined") {
      setOpen(false);
      return;
    }
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
    }, closeDelay);
  }, [cancelTimers, closeDelay, setOpen]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeNow();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeNow]);

  React.useEffect(() => cancelTimers, [cancelTimers]);

  const ctxValue = React.useMemo<TooltipContextValue>(
    () => ({
      open,
      tooltipId,
      triggerRef,
      openNow,
      scheduleOpen,
      scheduleClose,
      closeNow,
      cancelTimers,
    }),
    [open, tooltipId, openNow, scheduleOpen, scheduleClose, closeNow, cancelTimers],
  );

  return <TooltipContext.Provider value={ctxValue}>{children}</TooltipContext.Provider>;
}

export type TooltipTriggerProps = React.ComponentPropsWithRef<"button"> & {
  render?: RenderProp;
};

function TooltipTrigger({
  render,
  className,
  children,
  ref,
  "aria-describedby": ariaDescribedBy,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  ...props
}: TooltipTriggerProps): React.JSX.Element {
  const ctx = useTooltipContext("TooltipTrigger");

  const mergedDescribedBy = ctx.open
    ? [ariaDescribedBy, ctx.tooltipId].filter(Boolean).join(" ")
    : ariaDescribedBy;

  const handlePointerEnter = (event: React.PointerEvent<HTMLElement>) => {
    onPointerEnter?.(event as React.PointerEvent<HTMLButtonElement>);
    if (event.pointerType === "touch") return;
    ctx.scheduleOpen();
  };

  const handlePointerLeave = (event: React.PointerEvent<HTMLElement>) => {
    onPointerLeave?.(event as React.PointerEvent<HTMLButtonElement>);
    if (event.pointerType === "touch") return;
    ctx.scheduleClose();
  };

  const handleFocus = (event: React.FocusEvent<HTMLElement>) => {
    onFocus?.(event as React.FocusEvent<HTMLButtonElement>);
    ctx.openNow();
  };

  const handleBlur = (event: React.FocusEvent<HTMLElement>) => {
    onBlur?.(event as React.FocusEvent<HTMLButtonElement>);
    ctx.closeNow();
  };

  const triggerSlotProps: Record<string, unknown> = {
    ...props,
    "data-slot": "tooltip-trigger",
    "data-open": ctx.open ? "" : undefined,
    "data-state": ctx.open ? "open" : "closed",
    "aria-describedby": mergedDescribedBy || undefined,
    className,
    onPointerEnter: handlePointerEnter,
    onPointerLeave: handlePointerLeave,
    onFocus: handleFocus,
    onBlur: handleBlur,
  };

  if (render !== undefined) {
    if (typeof render === "function") {
      return render({
        ...triggerSlotProps,
        ref: mergeRefs(ctx.triggerRef, ref as React.Ref<HTMLElement> | undefined),
        children,
      });
    }

    const renderProps = render.props ?? {};
    const renderRef = renderProps.ref as React.Ref<HTMLElement> | undefined;
    const renderClassName =
      typeof renderProps.className === "string" ? renderProps.className : undefined;
    const renderDescribedBy =
      typeof renderProps["aria-describedby"] === "string"
        ? renderProps["aria-describedby"]
        : undefined;
    const combinedDescribedBy = ctx.open
      ? [renderDescribedBy, ariaDescribedBy, ctx.tooltipId].filter(Boolean).join(" ")
      : [renderDescribedBy, ariaDescribedBy].filter(Boolean).join(" ") || undefined;

    const rEnter = renderProps.onPointerEnter as
      | ((e: React.PointerEvent<HTMLElement>) => void)
      | undefined;
    const rLeave = renderProps.onPointerLeave as
      | ((e: React.PointerEvent<HTMLElement>) => void)
      | undefined;
    const rFocus = renderProps.onFocus as
      | ((e: React.FocusEvent<HTMLElement>) => void)
      | undefined;
    const rBlur = renderProps.onBlur as
      | ((e: React.FocusEvent<HTMLElement>) => void)
      | undefined;

    return React.cloneElement(
      render,
      {
        ...triggerSlotProps,
        ...renderProps,
        "data-slot": "tooltip-trigger",
        "data-open": ctx.open ? "" : undefined,
        "data-state": ctx.open ? "open" : "closed",
        "aria-describedby": combinedDescribedBy,
        className: cn(className, renderClassName) || undefined,
        ref: mergeRefs(ctx.triggerRef, ref as React.Ref<HTMLElement> | undefined, renderRef),
        onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
          rEnter?.(event);
          handlePointerEnter(event);
        },
        onPointerLeave: (event: React.PointerEvent<HTMLElement>) => {
          rLeave?.(event);
          handlePointerLeave(event);
        },
        onFocus: (event: React.FocusEvent<HTMLElement>) => {
          rFocus?.(event);
          handleFocus(event);
        },
        onBlur: (event: React.FocusEvent<HTMLElement>) => {
          rBlur?.(event);
          handleBlur(event);
        },
      },
      children !== undefined ? children : (renderProps.children as React.ReactNode),
    );
  }

  return (
    <button
      ref={mergeRefs(ctx.triggerRef, ref as React.Ref<HTMLElement> | undefined)}
      type="button"
      data-slot="tooltip-trigger"
      data-open={ctx.open ? "" : undefined}
      data-state={ctx.open ? "open" : "closed"}
      aria-describedby={mergedDescribedBy || undefined}
      className={className}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      {...props}
    >
      {children}
    </button>
  );
}

export interface TooltipContentProps extends React.ComponentPropsWithRef<"div"> {
  side?: TooltipSide;
  sideOffset?: number;
  align?: TooltipAlign;
  alignOffset?: number;
}

const VIEWPORT_MARGIN = 8;

function computeTooltipCoords(
  triggerRect: DOMRect,
  contentRect: DOMRect,
  side: TooltipSide,
  sideOffset: number,
  align: TooltipAlign,
  alignOffset: number,
): { top: number; left: number; resolvedSide: TooltipSide } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let resolvedSide: TooltipSide = side;
  if (side === "top" && triggerRect.top - contentRect.height - sideOffset < VIEWPORT_MARGIN) {
    if (triggerRect.bottom + contentRect.height + sideOffset <= vh - VIEWPORT_MARGIN) {
      resolvedSide = "bottom";
    }
  } else if (
    side === "bottom" &&
    triggerRect.bottom + contentRect.height + sideOffset > vh - VIEWPORT_MARGIN
  ) {
    if (triggerRect.top - contentRect.height - sideOffset >= VIEWPORT_MARGIN) {
      resolvedSide = "top";
    }
  } else if (
    side === "left" &&
    triggerRect.left - contentRect.width - sideOffset < VIEWPORT_MARGIN
  ) {
    if (triggerRect.right + contentRect.width + sideOffset <= vw - VIEWPORT_MARGIN) {
      resolvedSide = "right";
    }
  } else if (
    side === "right" &&
    triggerRect.right + contentRect.width + sideOffset > vw - VIEWPORT_MARGIN
  ) {
    if (triggerRect.left - contentRect.width - sideOffset >= VIEWPORT_MARGIN) {
      resolvedSide = "left";
    }
  }

  let top = 0;
  let left = 0;

  if (resolvedSide === "top" || resolvedSide === "bottom") {
    top =
      resolvedSide === "top"
        ? triggerRect.top - contentRect.height - sideOffset
        : triggerRect.bottom + sideOffset;

    if (align === "start") {
      left = triggerRect.left + alignOffset;
    } else if (align === "end") {
      left = triggerRect.right - contentRect.width + alignOffset;
    } else {
      left = triggerRect.left + (triggerRect.width - contentRect.width) / 2 + alignOffset;
    }
  } else {
    left =
      resolvedSide === "left"
        ? triggerRect.left - contentRect.width - sideOffset
        : triggerRect.right + sideOffset;

    if (align === "start") {
      top = triggerRect.top + alignOffset;
    } else if (align === "end") {
      top = triggerRect.bottom - contentRect.height + alignOffset;
    } else {
      top = triggerRect.top + (triggerRect.height - contentRect.height) / 2 + alignOffset;
    }
  }

  const maxLeft = Math.max(VIEWPORT_MARGIN, vw - contentRect.width - VIEWPORT_MARGIN);
  const maxTop = Math.max(VIEWPORT_MARGIN, vh - contentRect.height - VIEWPORT_MARGIN);
  left = Math.min(Math.max(VIEWPORT_MARGIN, left), maxLeft);
  top = Math.min(Math.max(VIEWPORT_MARGIN, top), maxTop);

  return { top, left, resolvedSide };
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 6,
  align = "center",
  alignOffset = 0,
  style,
  children,
  ref,
  onPointerEnter,
  onPointerLeave,
  ...props
}: TooltipContentProps): React.JSX.Element | null {
  const ctx = useTooltipContext("TooltipContent");
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = React.useState<{
    top: number;
    left: number;
    resolvedSide: TooltipSide;
    ready: boolean;
  }>({ top: 0, left: 0, resolvedSide: side, ready: false });

  React.useLayoutEffect(() => {
    if (!ctx.open) {
      setCoords((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return;
    }
    const updatePosition = () => {
      const triggerEl = ctx.triggerRef.current;
      const contentEl = contentRef.current;
      if (!triggerEl || !contentEl) return;
      const next = computeTooltipCoords(
        triggerEl.getBoundingClientRect(),
        contentEl.getBoundingClientRect(),
        side,
        sideOffset,
        align,
        alignOffset,
      );
      setCoords({ ...next, ready: true });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, { capture: true, passive: true });
    window.addEventListener("resize", updatePosition, { passive: true });
    return () => {
      window.removeEventListener("scroll", updatePosition, { capture: true });
      window.removeEventListener("resize", updatePosition);
    };
  }, [ctx.open, ctx.triggerRef, side, sideOffset, align, alignOffset]);

  if (!ctx.open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={mergeRefs(contentRef, ref)}
      id={ctx.tooltipId}
      role="tooltip"
      data-slot="tooltip-content"
      data-open=""
      data-state="open"
      data-side={coords.resolvedSide}
      data-align={align}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        ctx.cancelTimers();
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        ctx.scheduleClose();
      }}
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        visibility: coords.ready ? "visible" : "hidden",
        ...style,
      }}
      className={cn(
        "z-[60] w-fit max-w-xs rounded-md border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-[var(--shadow-overlay)] transition-opacity duration-150",
        className,
      )}
      {...props}
    >
      {children}
    </div>,
    document.body,
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
