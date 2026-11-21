import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "cn";

export type ButtonHierarchy = "primary" | "secondary" | "ghost";
export type ButtonTone = "default" | "danger";
export type ButtonVariant =
  | ButtonHierarchy
  | "default"
  | "outline"
  | "destructive"
  | "link";
export type ButtonSize = "default" | "sm" | "lg" | "tall" | "icon" | "icon-sm";

const buttonStyleVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer no-underline items-center justify-center gap-2 rounded-md border border-transparent bg-clip-padding font-semibold whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      hierarchy: {
        primary: "",
        secondary: "",
        ghost: "",
      },
      tone: {
        default: "",
        danger: "",
      },
      size: {
        default: "min-h-11 h-11 px-4 text-sm",
        sm: "min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 [@media(min-width:768px)_and_(pointer:fine)]:h-9 px-3 text-sm",
        lg: "min-h-12 h-12 px-5 text-base",
        tall: "min-h-[52px] h-[52px] px-4 text-base",
        icon: "min-h-11 min-w-11 size-11",
        "icon-sm":
          "min-h-11 min-w-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 [@media(min-width:768px)_and_(pointer:fine)]:min-w-9 [@media(min-width:768px)_and_(pointer:fine)]:size-9",
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
        hierarchy: "primary",
        tone: "default",
        class:
          "bg-primary text-primary-foreground hover:bg-primary/90 [&_[data-icon=arrow]]:transition-transform hover:[&_[data-icon=arrow]]:translate-x-[3px]",
      },
      {
        hierarchy: "primary",
        tone: "danger",
        class: "bg-destructive text-primary-foreground hover:bg-destructive/90",
      },
      {
        hierarchy: "secondary",
        tone: "default",
        class:
          "border-border bg-secondary text-secondary-foreground hover:bg-surface-active",
      },
      {
        hierarchy: "secondary",
        tone: "danger",
        class:
          "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20",
      },
      {
        hierarchy: "ghost",
        tone: "default",
        class:
          "bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
      },
      {
        hierarchy: "ghost",
        tone: "danger",
        class:
          "bg-transparent text-destructive hover:bg-destructive/15 hover:text-destructive",
      },
      {
        appearance: "d1",
        hierarchy: "secondary",
        tone: "default",
        class: "border-input bg-card hover:bg-secondary",
      },
    ],
    defaultVariants: {
      hierarchy: "primary",
      tone: "default",
      size: "default",
    },
  },
);

function resolveButtonVariant(
  variant: ButtonVariant | null | undefined,
  tone: ButtonTone | null | undefined,
): { hierarchy: ButtonHierarchy; tone: ButtonTone } {
  const requestedTone: ButtonTone = tone === "danger" ? "danger" : "default";
  if (variant === "destructive") {
    return { hierarchy: "secondary", tone: "danger" };
  }
  if (variant === "secondary" || variant === "outline") {
    return { hierarchy: "secondary", tone: requestedTone };
  }
  if (variant === "ghost" || variant === "link") {
    return { hierarchy: "ghost", tone: requestedTone };
  }
  return { hierarchy: "primary", tone: requestedTone };
}

export interface ButtonVariantsInput {
  variant?: ButtonVariant | null;
  tone?: ButtonTone | null;
  size?: ButtonSize | null;
  shape?: "pill" | null;
  appearance?: "d1" | null;
  className?: string;
}

function buttonVariants(options: ButtonVariantsInput = {}): string {
  const resolved = resolveButtonVariant(options.variant, options.tone);
  return buttonStyleVariants({
    hierarchy: resolved.hierarchy,
    tone: resolved.tone,
    size: options.size ?? undefined,
    shape: options.shape ?? undefined,
    appearance: options.appearance ?? undefined,
    className: options.className,
  });
}

type ButtonRenderElement = React.ReactElement<Record<string, unknown>>;
type ButtonRenderProp =
  | ButtonRenderElement
  | ((props: Record<string, unknown>) => React.ReactElement);

export type ButtonProps = React.ComponentPropsWithRef<"button"> & {
  variant?: ButtonVariant;
  tone?: ButtonTone;
  size?: ButtonSize;
  shape?: "pill";
  appearance?: "d1";
  render?: ButtonRenderProp;
  nativeButton?: boolean;
  focusableWhenDisabled?: boolean;
};

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  if ("current" in ref) {
    (ref as { current: T | null }).current = value;
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

function isButtonRef(value: unknown): value is React.Ref<HTMLButtonElement> {
  return (
    typeof value === "function" ||
    (typeof value === "object" && value !== null && "current" in value)
  );
}

function isCssProperties(value: unknown): value is React.CSSProperties {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMouseHandler(
  value: unknown,
): value is React.MouseEventHandler<HTMLButtonElement> {
  return typeof value === "function";
}

function isKeyHandler(
  value: unknown,
): value is React.KeyboardEventHandler<HTMLButtonElement> {
  return typeof value === "function";
}

function Button({
  className,
  variant = "primary",
  tone = "default",
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
  const resolved = resolveButtonVariant(variant, tone);
  const computedClassName = cn(
    buttonVariants({ variant, tone, size, shape, appearance, className }),
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
      "data-hierarchy": resolved.hierarchy,
      "data-tone": resolved.tone,
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
    const renderRef = isButtonRef(renderProps.ref) ? renderProps.ref : undefined;
    const renderOnClick = isMouseHandler(renderProps.onClick)
      ? renderProps.onClick
      : undefined;
    const renderOnKeyDown = isKeyHandler(renderProps.onKeyDown)
      ? renderProps.onKeyDown
      : undefined;
    const renderClassName =
      typeof renderProps.className === "string" ? renderProps.className : undefined;
    const renderStyle = isCssProperties(renderProps.style)
      ? renderProps.style
      : undefined;

    const mergedProps: Record<string, unknown> = {
      ...baseSlotProps,
      ...renderProps,
      "data-slot": "button",
      "data-hierarchy": resolved.hierarchy,
      "data-tone": resolved.tone,
      className: cn(computedClassName, renderClassName),
      style: style || renderStyle ? { ...style, ...renderStyle } : undefined,
      ref: mergeRefs(ref, renderRef),
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        if (disabled) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        renderOnClick?.(event);
        onClick?.(event);
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (disabled && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        renderOnKeyDown?.(event);
        onKeyDown?.(event);
      },
    };

    return children !== undefined
      ? React.cloneElement(render, mergedProps, children)
      : React.cloneElement(render, mergedProps);
  }

  return (
    <button
      {...props}
      ref={ref}
      data-slot="button"
      data-hierarchy={resolved.hierarchy}
      data-tone={resolved.tone}
      data-disabled={disabled ? "" : undefined}
      type={type ?? "button"}
      disabled={focusableWhenDisabled ? undefined : disabled}
      aria-disabled={disabled ? true : props["aria-disabled"]}
      className={computedClassName}
      style={style}
      onClick={focusableWhenDisabled && disabled ? handleClick : onClick}
      onKeyDown={focusableWhenDisabled && disabled ? handleKeyDown : onKeyDown}
    >
      {children}
    </button>
  );
}

export { Button, buttonVariants };
