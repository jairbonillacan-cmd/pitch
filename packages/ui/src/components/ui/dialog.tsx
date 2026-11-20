"use client";

/**
 * Dialog · Primitiva modal sobre `<dialog>` nativo de HTML (ADR-053).
 *
 * Aprovecha `showModal()` del navegador para capa superior (top layer), documento subyacente
 * inerte, retorno automático del foco al invocador, cierre con `Escape` y gesto atrás móvil,
 * `closedby="any"` (con respaldo por coordenadas `pointerdown`/`pointerup` en Safari) y
 * contención de scroll vía `overscroll-behavior: contain` sin mutar `html`/`body`.
 *
 * `DialogContent` es el cuadro modal estándar. `DialogPopup` deja el marco al consumidor
 * (usado por los diálogos D1 de PIN y Análisis en Storybook).
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "cn";
import { Icon } from "../../icons";
import { Button } from "./button";

type RenderElement = React.ReactElement<Record<string, unknown>>;
type RenderProp =
  | RenderElement
  | ((props: Record<string, unknown>) => React.ReactElement);

export type DialogInitialFocus =
  | boolean
  | React.RefObject<HTMLElement | null>
  | (() => HTMLElement | null);

interface DialogContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
  titleId: string;
  descriptionId: string;
  hasTitle: boolean;
  hasDescription: boolean;
  registerTitle: () => () => void;
  registerDescription: () => () => void;
  modal: boolean;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogContext(componentName: string): DialogContextValue {
  const ctx = React.useContext(DialogContext);
  if (!ctx) {
    throw new Error(`${componentName} debe usarse dentro de <Dialog>.`);
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

function renderTriggerOrClose(
  render: RenderProp | undefined,
  nativeButton: boolean | undefined,
  slotProps: Record<string, unknown>,
  children: React.ReactNode,
  ref: React.Ref<HTMLButtonElement> | undefined,
  onActivate: (event: React.MouseEvent<HTMLElement>) => void,
): React.JSX.Element {
  if (render === undefined) {
    const { onClick, type, ...rest } = slotProps as React.ComponentPropsWithoutRef<"button">;
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        {...rest}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) onActivate(event);
        }}
      >
        {children}
      </button>
    );
  }

  const isNativeEl =
    nativeButton ?? (React.isValidElement(render) && render.type === "button");

  if (typeof render === "function") {
    return render({
      ...slotProps,
      ...(isNativeEl ? { type: (slotProps.type as string | undefined) ?? "button" } : {}),
      ref,
      children,
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        (slotProps.onClick as ((e: React.MouseEvent<HTMLElement>) => void) | undefined)?.(event);
        if (!event.defaultPrevented) onActivate(event);
      },
    });
  }

  const renderProps = render.props ?? {};
  const renderRef = renderProps.ref as React.Ref<HTMLElement> | undefined;
  const renderOnClick = renderProps.onClick as
    | ((event: React.MouseEvent<HTMLElement>) => void)
    | undefined;
  const slotOnClick = slotProps.onClick as
    | ((event: React.MouseEvent<HTMLElement>) => void)
    | undefined;
  const slotClassName = typeof slotProps.className === "string" ? slotProps.className : undefined;
  const renderClassName =
    typeof renderProps.className === "string" ? renderProps.className : undefined;

  return React.cloneElement(
    render,
    {
      ...slotProps,
      ...renderProps,
      ...(isNativeEl && renderProps.type === undefined ? { type: "button" } : {}),
      className: cn(slotClassName, renderClassName) || undefined,
      ref: mergeRefs(ref as React.Ref<HTMLElement> | undefined, renderRef),
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        renderOnClick?.(event);
        slotOnClick?.(event);
        if (!event.defaultPrevented) onActivate(event);
      },
    },
    children !== undefined ? children : (renderProps.children as React.ReactNode),
  );
}

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  children?: React.ReactNode;
}

function Dialog({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  modal = true,
  children,
}: DialogProps): React.JSX.Element {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const [titleCount, setTitleCount] = React.useState(0);
  const [descriptionCount, setDescriptionCount] = React.useState(0);
  const baseId = React.useId();

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

  const registerTitle = React.useCallback(() => {
    setTitleCount((c) => c + 1);
    return () => setTitleCount((c) => Math.max(0, c - 1));
  }, []);

  const registerDescription = React.useCallback(() => {
    setDescriptionCount((c) => c + 1);
    return () => setDescriptionCount((c) => Math.max(0, c - 1));
  }, []);

  const value = React.useMemo<DialogContextValue>(
    () => ({
      open,
      setOpen,
      titleId: `${baseId}-title`,
      descriptionId: `${baseId}-desc`,
      hasTitle: titleCount > 0,
      hasDescription: descriptionCount > 0,
      registerTitle,
      registerDescription,
      modal,
    }),
    [open, setOpen, baseId, titleCount, descriptionCount, registerTitle, registerDescription, modal],
  );

  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}

export type DialogTriggerProps = React.ComponentPropsWithRef<"button"> & {
  render?: RenderProp;
  nativeButton?: boolean;
};

function DialogTrigger({
  render,
  nativeButton,
  ref,
  children,
  ...props
}: DialogTriggerProps): React.JSX.Element {
  const ctx = useDialogContext("DialogTrigger");
  return renderTriggerOrClose(
    render,
    nativeButton,
    {
      ...props,
      "data-slot": "dialog-trigger",
      "aria-haspopup": "dialog",
      "aria-expanded": ctx.open,
    },
    children,
    ref,
    () => ctx.setOpen(true),
  );
}

export interface DialogPortalProps {
  container?: Element | DocumentFragment | null;
  children?: React.ReactNode;
}

function DialogPortal({ container, children }: DialogPortalProps): React.JSX.Element | null {
  const ctx = useDialogContext("DialogPortal");
  if (!ctx.open) return null;
  if (typeof document === "undefined") {
    return <>{children}</>;
  }
  return createPortal(children, container ?? document.body);
}

export type DialogCloseProps = React.ComponentPropsWithRef<"button"> & {
  render?: RenderProp;
  nativeButton?: boolean;
};

function DialogClose({
  render,
  nativeButton,
  ref,
  children,
  ...props
}: DialogCloseProps): React.JSX.Element {
  const ctx = useDialogContext("DialogClose");
  return renderTriggerOrClose(
    render,
    nativeButton,
    {
      ...props,
      "data-slot": "dialog-close",
    },
    children,
    ref,
    () => ctx.setOpen(false),
  );
}

export type DialogOverlayProps = React.ComponentPropsWithRef<"div">;

function DialogOverlay({
  className,
  onClick,
  ...props
}: DialogOverlayProps): React.JSX.Element | null {
  const ctx = useDialogContext("DialogOverlay");
  if (!ctx.open) return null;
  return (
    <div
      data-slot="dialog-overlay"
      data-open=""
      aria-hidden="true"
      className={cn(
        "pl-backdrop fixed inset-0 isolate z-50 bg-[var(--backdrop-modal)] transition-opacity duration-200",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && event.target === event.currentTarget) {
          ctx.setOpen(false);
        }
      }}
      {...props}
    />
  );
}

function resolveInitialFocusTarget(initialFocus: DialogInitialFocus | undefined): HTMLElement | null {
  if (!initialFocus || initialFocus === true) return null;
  if (typeof initialFocus === "function") return initialFocus();
  return initialFocus.current;
}

type NativeDialogSurfaceProps = Omit<React.ComponentPropsWithRef<"dialog">, "open"> & {
  initialFocus?: DialogInitialFocus;
  lightDismiss: boolean;
  slotName: "dialog-popup" | "dialog-content";
};

function NativeDialogSurface({
  className,
  children,
  initialFocus,
  lightDismiss,
  slotName,
  ref,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  onClose,
  ...props
}: NativeDialogSurfaceProps): React.JSX.Element | null {
  const ctx = useDialogContext(slotName === "dialog-content" ? "DialogContent" : "DialogPopup");
  const dialogRef = React.useRef<HTMLDialogElement | null>(null);
  const initialFocusRef = React.useRef(initialFocus);
  initialFocusRef.current = initialFocus;
  const setOpenRef = React.useRef(ctx.setOpen);
  setOpenRef.current = ctx.setOpen;

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!ctx.open || !dialog) return;

    const hasNativeModal = ctx.modal && typeof dialog.showModal === "function";
    if (hasNativeModal) {
      if (!dialog.open) {
        try {
          dialog.showModal();
        } catch (err) {
          void err;
          dialog.setAttribute("open", "");
        }
      }
    } else if (typeof dialog.show === "function") {
      if (!dialog.open) {
        try {
          dialog.show();
        } catch (err) {
          void err;
          dialog.setAttribute("open", "");
        }
      }
    } else {
      dialog.setAttribute("open", "");
    }

    const customFocusTarget = resolveInitialFocusTarget(initialFocusRef.current);
    if (customFocusTarget) {
      customFocusTarget.focus({ preventScroll: true });
    }

    const handleNativeClose = () => {
      dialog.returnValue = "";
      setOpenRef.current(false);
    };
    dialog.addEventListener("close", handleNativeClose);

    // Respaldo de light-dismiss para navegadores sin `<dialog closedby>` (p. ej. Safari).
    // Comprueba tanto `pointerdown` como `pointerup` fuera del recuadro para no cerrar al arrastrar selección de texto.
    let cleanupLightDismiss: (() => void) | undefined;
    const supportsClosedBy =
      typeof HTMLDialogElement !== "undefined" && "closedBy" in HTMLDialogElement.prototype;
    if (lightDismiss && !supportsClosedBy) {
      const isOutside = (e: PointerEvent) => {
        const rect = dialog.getBoundingClientRect();
        return (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        );
      };
      let pressedOutside = false;
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) {
          if (typeof dialog.close === "function" && dialog.open) {
            dialog.close();
          } else {
            setOpenRef.current(false);
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

    // Respaldo de Escape solo en entornos sin `showModal()` nativo (p. ej. jsdom en pruebas).
    let cleanupFallbackEscape: (() => void) | undefined;
    if (!hasNativeModal) {
      const onFallbackKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setOpenRef.current(false);
        }
      };
      window.addEventListener("keydown", onFallbackKeyDown);
      cleanupFallbackEscape = () => window.removeEventListener("keydown", onFallbackKeyDown);
    }

    return () => {
      dialog.removeEventListener("close", handleNativeClose);
      cleanupLightDismiss?.();
      cleanupFallbackEscape?.();
      if (typeof dialog.close === "function" && dialog.open) {
        dialog.returnValue = "";
        dialog.close();
      }
    };
  }, [ctx.open, ctx.modal, lightDismiss]);

  if (!ctx.open) return null;

  const resolvedLabelledBy = ariaLabelledBy ?? (ctx.hasTitle ? ctx.titleId : undefined);
  const resolvedDescribedBy = ariaDescribedBy ?? (ctx.hasDescription ? ctx.descriptionId : undefined);

  return (
    <dialog
      ref={mergeRefs(dialogRef, ref)}
      data-slot={slotName}
      data-open=""
      aria-labelledby={resolvedLabelledBy}
      aria-describedby={resolvedDescribedBy}
      {...({
        closedby: lightDismiss ? "any" : "closerequest",
      } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      className={className}
      onClose={onClose}
      {...props}
    >
      {children}
    </dialog>
  );
}

export type DialogPopupProps = Omit<React.ComponentPropsWithRef<"dialog">, "open"> & {
  initialFocus?: DialogInitialFocus;
};

/** Popup sin marco: ocupa la pantalla en capa superior y el consumidor dibuja su propia ventana. */
function DialogPopup({ className, ...props }: DialogPopupProps): React.JSX.Element | null {
  return (
    <NativeDialogSurface
      slotName="dialog-popup"
      lightDismiss={false}
      className={cn(
        "pl-dialog fixed inset-0 z-50 m-0 h-dvh max-h-none w-dvw max-w-none border-0 bg-transparent p-0 text-foreground outline-none overscroll-contain backdrop:overflow-hidden backdrop:overscroll-contain backdrop:bg-transparent",
        className,
      )}
      {...props}
    />
  );
}

export type DialogContentProps = Omit<React.ComponentPropsWithRef<"dialog">, "open"> & {
  showCloseButton?: boolean;
  initialFocus?: DialogInitialFocus;
};

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogContentProps): React.JSX.Element | null {
  return (
    <DialogPortal>
      <NativeDialogSurface
        slotName="dialog-content"
        lightDismiss
        className={cn(
          "fixed top-1/2 left-1/2 z-50 m-0 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 open:grid gap-4 rounded-xl border border-border bg-popover p-6 text-sm text-popover-foreground shadow-[var(--shadow-overlay)] transition-[opacity,transform] duration-200 outline-none overscroll-contain sm:max-w-md backdrop:overflow-hidden backdrop:overscroll-contain backdrop:bg-[var(--backdrop-modal)]",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogClose
            render={<Button variant="ghost" size="icon-sm" className="absolute top-2 right-2" />}
          >
            <Icon name="close" />
            <span className="sr-only">Cerrar</span>
          </DialogClose>
        ) : null}
      </NativeDialogSurface>
    </DialogPortal>
  );
}

function DialogHeader({
  className,
  ...props
}: React.ComponentPropsWithRef<"div">): React.JSX.Element {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  ...props
}: React.ComponentPropsWithRef<"div">): React.JSX.Element {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

function DialogTitle({
  id,
  className,
  ...props
}: React.ComponentPropsWithRef<"h2">): React.JSX.Element {
  const ctx = useDialogContext("DialogTitle");
  const { registerTitle } = ctx;
  React.useEffect(() => registerTitle(), [registerTitle]);

  return (
    <h2
      id={id ?? ctx.titleId}
      data-slot="dialog-title"
      className={cn("text-base font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  id,
  className,
  ...props
}: React.ComponentPropsWithRef<"p">): React.JSX.Element {
  const ctx = useDialogContext("DialogDescription");
  const { registerDescription } = ctx;
  React.useEffect(() => registerDescription(), [registerDescription]);

  return (
    <p
      id={id ?? ctx.descriptionId}
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
