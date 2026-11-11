"use client";

/**
 * Dialog · shadcn/ui (Mira, Base UI) adaptado a PitchLab.
 *
 * Base UI resuelve lo difícil: trampa de foco, Escape, bloqueo de scroll, retorno del foco
 * al elemento que abrió el diálogo y `aria-modal`. Las transiciones usan
 * `data-starting-style` y `data-ending-style` (entrada y salida animadas sin JS).
 *
 * `DialogContent` es la pieza estándar de shadcn para diálogos nuevos. `DialogPopup` deja el
 * marco a cargo del consumidor: lo usan el análisis y el PIN, que conservan su diseño D1.
 */
import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { Icon } from "../../icons";
import { Button } from "./button";

function Dialog({ ...props }: DialogPrimitive.Root.Props): React.JSX.Element {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props): React.JSX.Element {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props): React.JSX.Element {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props): React.JSX.Element {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props): React.JSX.Element {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "pl-backdrop fixed inset-0 isolate z-50 bg-[var(--backdrop-modal)] backdrop-blur-[4px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

/** Popup sin marco: ocupa la pantalla y el consumidor dibuja su propia ventana. */
function DialogPopup({ className, ...props }: DialogPrimitive.Popup.Props): React.JSX.Element {
  return (
    <DialogPrimitive.Popup
      data-slot="dialog-popup"
      className={cn("pl-dialog fixed inset-0 z-50 text-foreground outline-none", className)}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & { showCloseButton?: boolean }): React.JSX.Element {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-popover p-6 text-sm text-popover-foreground shadow-[var(--shadow-overlay)] transition-[opacity,transform] duration-200 outline-none sm:max-w-md data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={<Button variant="ghost" size="icon-sm" className="absolute top-2 right-2" />}
          >
            <Icon name="close" />
            <span className="sr-only">Cerrar</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props): React.JSX.Element {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("text-base font-semibold", className)} {...props} />;
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props): React.JSX.Element {
  return (
    <DialogPrimitive.Description
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
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
