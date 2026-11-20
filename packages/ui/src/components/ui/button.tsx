/**
 * Button · Primitiva HTML nativa `<button>` con tokens de PitchLab (ADR-053).
 * Objetivos táctiles de 44 px (RESPONSIVE_RULES §3), radio de control de la marca,
 * sin animaciones sobre `box-shadow` (ADR-051) y soporte opcional `render` para enlaces/slots.
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer no-underline items-center justify-center gap-2 rounded-md border border-transparent bg-clip-padding font-semibold whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:shadow-[0_0_0_4px_var(--glow)] [&_[data-icon=arrow]]:transition-transform hover:[&_[data-icon=arrow]]:translate-x-[3px]",
        outline: "border-border bg-transparent text-foreground hover:bg-secondary",
        secondary: "bg-secondary text-secondary-foreground hover:bg-surface-active",
        ghost: "bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 text-sm",
        sm: "h-9 px-3 text-sm",
        lg: "h-12 px-5 text-base",
        tall: "h-[52px] px-4 text-base",
        icon: "size-11",
        "icon-sm": "size-9",
      },
      shape: {
        pill: "rounded-(--radius-pill)",
      },
      appearance: {
        d1: "bg-clip-border font-[number:var(--weight-button)]",
      },
    },
    compoundVariants: [
      {
        appearance: "d1",
        variant: "secondary",
        class: "border-input bg-card hover:bg-secondary",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonRenderElement = React.ReactElement<Record<string, unknown>>;
type ButtonRenderProp =
  | ButtonRenderElement
  | ((props: Record<string, unknown>) => React.ReactElement);

export type ButtonProps = React.ComponentPropsWithRef<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Elemento o función alternativa para renderizar como enlace u otro control (p. ej. `render={<a href="..." />}`). */
    render?: ButtonRenderProp;
    /** Compatibilidad para callers que renderizan elementos no-button (p. ej. `<a>`) mediante `render`. */
    nativeButton?: boolean;
    /** Mantiene el botón enfocable por teclado cuando está deshabilitado, bloqueando la activación vía `aria-disabled`. */
    focusableWhenDisabled?: boolean;
  };

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

function Button({
  className,
  variant = "default",
  size = "default",
  shape,
  appearance,
  type,
  disabled,
  focusableWhenDisabled = false,
  nativeButton,
  render,
  onClick,
  onKeyDown,
  style,
  ref,
  children,
  ...props
}: ButtonProps): React.JSX.Element {
  const computedClassName = cn(
    buttonVariants({ variant, size, shape, appearance, className }),
  );

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    if (disabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onClick?.(event);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLButtonElement> = (event) => {
    if (disabled && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onKeyDown?.(event);
  };

  if (render !== undefined) {
    const isNativeEl =
      nativeButton ??
      (React.isValidElement(render) && render.type === "button");

    const baseSlotProps: Record<string, unknown> = {
      ...props,
      "data-slot": "button",
      "data-disabled": disabled ? "" : undefined,
      "aria-disabled": disabled ? true : props["aria-disabled"],
      className: computedClassName,
      style,
      ref,
      ...(isNativeEl
        ? {
            type: type ?? "button",
            disabled: focusableWhenDisabled ? undefined : disabled,
          }
        : {}),
      onClick: handleClick,
      onKeyDown: handleKeyDown,
    };

    if (typeof render === "function") {
      return render({ ...baseSlotProps, children });
    }

    const renderProps = render.props ?? {};
    const renderRef = renderProps.ref as React.Ref<HTMLElement> | undefined;
    const renderOnClick = renderProps.onClick as
      | ((event: React.MouseEvent<HTMLElement>) => void)
      | undefined;
    const renderOnKeyDown = renderProps.onKeyDown as
      | ((event: React.KeyboardEvent<HTMLElement>) => void)
      | undefined;
    const renderClassName =
      typeof renderProps.className === "string" ? renderProps.className : undefined;
    const renderStyle = renderProps.style as React.CSSProperties | undefined;

    const mergedProps: Record<string, unknown> = {
      ...baseSlotProps,
      ...renderProps,
      "data-slot": "button",
      className: cn(computedClassName, renderClassName),
      style: style || renderStyle ? { ...style, ...renderStyle } : undefined,
      ref: mergeRefs(ref as React.Ref<HTMLElement> | undefined, renderRef),
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        if (disabled) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        renderOnClick?.(event);
        onClick?.(event as unknown as React.MouseEvent<HTMLButtonElement>);
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        if (disabled && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        renderOnKeyDown?.(event);
        onKeyDown?.(event as unknown as React.KeyboardEvent<HTMLButtonElement>);
      },
    };

    return React.cloneElement(
      render,
      mergedProps,
      children !== undefined ? children : (renderProps.children as React.ReactNode),
    );
  }

  return (
    <button
      ref={ref}
      data-slot="button"
      data-disabled={disabled ? "" : undefined}
      type={type ?? "button"}
      disabled={focusableWhenDisabled ? undefined : disabled}
      aria-disabled={disabled ? true : props["aria-disabled"]}
      className={computedClassName}
      style={style}
      onClick={focusableWhenDisabled && disabled ? handleClick : onClick}
      onKeyDown={focusableWhenDisabled && disabled ? handleKeyDown : onKeyDown}
      {...props}
    >
      {children}
    </button>
  );
}

export { Button, buttonVariants };
