"use client";

/**
 * Toggle y ToggleGroup · Primitivas accesibles sobre HTML nativo (`role="group"`,
 * `<button type="button" aria-pressed>`) con tokens de PitchLab (ADR-053).
 * Soporta modo selección única o múltiple, `data-pressed` y navegación con flechas.
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const toggleVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "rounded-md bg-transparent hover:bg-secondary data-pressed:bg-secondary data-pressed:text-foreground",
        chip: "min-h-10 rounded-full border border-border bg-transparent px-3.5 hover:border-input data-pressed:border-primary data-pressed:text-foreground",
        match:
          "min-h-11 gap-2 rounded-(--radius-pill) border border-border bg-card py-0 pl-2 pr-3 font-semibold text-foreground transition-[background-color,border-color] hover:border-input data-pressed:border-primary data-pressed:bg-surface-active",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

type ToggleGroupOrientation = "horizontal" | "vertical";

interface ToggleGroupContextValue {
  values: readonly string[];
  toggleValue: (itemValue: string) => void;
  disabled: boolean;
  orientation: ToggleGroupOrientation;
  loopFocus: boolean;
}

const ToggleGroupContext = React.createContext<ToggleGroupContextValue | null>(null);

function normalizeToggleValues(input: string | readonly string[] | undefined): string[] {
  if (input === undefined) return [];
  if (typeof input === "string") return input ? [input] : [];
  return [...input];
}

function handleGroupArrowNavigation(
  event: React.KeyboardEvent<HTMLButtonElement>,
  orientation: ToggleGroupOrientation,
  loopFocus: boolean,
): void {
  const group = event.currentTarget.closest<HTMLElement>('[data-slot="toggle-group"]');
  if (!group) return;

  const items = Array.from(
    group.querySelectorAll<HTMLButtonElement>(
      'button:not(:disabled):not([aria-disabled="true"])',
    ),
  );
  if (items.length <= 1) return;

  const idx = items.indexOf(event.currentTarget);
  if (idx === -1) return;

  const isRtl =
    orientation === "horizontal" &&
    typeof window !== "undefined" &&
    window.getComputedStyle(group).direction === "rtl";

  const nextKey = orientation === "vertical" ? "ArrowDown" : isRtl ? "ArrowLeft" : "ArrowRight";
  const prevKey = orientation === "vertical" ? "ArrowUp" : isRtl ? "ArrowRight" : "ArrowLeft";

  let nextIdx = -1;
  if (event.key === nextKey) {
    nextIdx = loopFocus ? (idx + 1) % items.length : Math.min(idx + 1, items.length - 1);
  } else if (event.key === prevKey) {
    nextIdx = loopFocus ? (idx - 1 + items.length) % items.length : Math.max(idx - 1, 0);
  } else if (event.key === "Home") {
    nextIdx = 0;
  } else if (event.key === "End") {
    nextIdx = items.length - 1;
  }

  if (nextIdx >= 0 && nextIdx !== idx) {
    event.preventDefault();
    items[nextIdx]?.focus();
  }
}

export interface ToggleProps
  extends Omit<React.ComponentPropsWithRef<"button">, "value">,
    VariantProps<typeof toggleVariants> {
  pressed?: boolean;
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  value?: string;
}

function Toggle({
  className,
  variant = "default",
  pressed: controlledPressed,
  defaultPressed = false,
  onPressedChange,
  value,
  disabled,
  onClick,
  onKeyDown,
  ...props
}: ToggleProps): React.JSX.Element {
  const groupCtx = React.useContext(ToggleGroupContext);
  const [uncontrolledPressed, setUncontrolledPressed] = React.useState(defaultPressed);

  const boundToGroup = Boolean(groupCtx && value !== undefined && controlledPressed === undefined);
  const isPressed = boundToGroup
    ? groupCtx!.values.includes(value!)
    : controlledPressed !== undefined
      ? controlledPressed
      : uncontrolledPressed;
  const isDisabled = Boolean(disabled || groupCtx?.disabled);

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    onClick?.(event);
    if (event.defaultPrevented || isDisabled) return;
    if (boundToGroup && value !== undefined) {
      groupCtx!.toggleValue(value);
      return;
    }
    const next = !isPressed;
    if (controlledPressed === undefined) {
      setUncontrolledPressed(next);
    }
    onPressedChange?.(next);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLButtonElement> = (event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || !groupCtx) return;
    handleGroupArrowNavigation(event, groupCtx.orientation, groupCtx.loopFocus);
  };

  return (
    <button
      type="button"
      data-slot="toggle"
      aria-pressed={isPressed}
      data-pressed={isPressed ? "" : undefined}
      data-state={isPressed ? "on" : "off"}
      data-disabled={isDisabled ? "" : undefined}
      disabled={isDisabled}
      className={cn(toggleVariants({ variant, className }))}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export interface ToggleGroupProps extends Omit<React.ComponentPropsWithRef<"div">, "defaultValue"> {
  /** Permite múltiples botones presionados simultáneamente (`false` = selección única). */
  multiple?: boolean;
  /** Alias compatible (`"single"` | `"multiple"`). */
  type?: "single" | "multiple";
  /** Valores activos en modo controlado. */
  value?: string | readonly string[];
  /** Valores iniciales en modo no controlado. */
  defaultValue?: string | readonly string[];
  /** Callback al cambiar la selección del grupo. */
  onValueChange?: (value: string[]) => void;
  disabled?: boolean;
  orientation?: ToggleGroupOrientation;
  loopFocus?: boolean;
}

function ToggleGroup({
  className,
  multiple,
  type,
  value: controlledValue,
  defaultValue,
  onValueChange,
  disabled = false,
  orientation = "horizontal",
  loopFocus = true,
  ...props
}: ToggleGroupProps): React.JSX.Element {
  const isMultiple = multiple ?? type === "multiple";
  const [uncontrolledValues, setUncontrolledValues] = React.useState<string[]>(() =>
    normalizeToggleValues(defaultValue),
  );

  const isControlled = controlledValue !== undefined;
  const values = React.useMemo(
    () => (isControlled ? normalizeToggleValues(controlledValue) : uncontrolledValues),
    [isControlled, controlledValue, uncontrolledValues],
  );

  const onValueChangeRef = React.useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  const toggleValue = React.useCallback(
    (itemValue: string) => {
      const exists = values.includes(itemValue);
      let next: string[];
      if (isMultiple) {
        next = exists ? values.filter((v) => v !== itemValue) : [...values, itemValue];
      } else {
        next = exists ? [] : [itemValue];
      }
      if (!isControlled) {
        setUncontrolledValues(next);
      }
      onValueChangeRef.current?.(next);
    },
    [values, isMultiple, isControlled],
  );

  const ctxValue = React.useMemo<ToggleGroupContextValue>(
    () => ({
      values,
      toggleValue,
      disabled,
      orientation,
      loopFocus,
    }),
    [values, toggleValue, disabled, orientation, loopFocus],
  );

  return (
    <ToggleGroupContext.Provider value={ctxValue}>
      <div
        role="group"
        data-slot="toggle-group"
        data-orientation={orientation}
        data-multiple={isMultiple ? "" : undefined}
        data-disabled={disabled ? "" : undefined}
        className={cn("flex w-fit flex-row items-center gap-2", className)}
        {...props}
      />
    </ToggleGroupContext.Provider>
  );
}

export interface ToggleGroupItemProps
  extends Omit<React.ComponentPropsWithRef<"button">, "value">,
    VariantProps<typeof toggleVariants> {
  value: string;
  pressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
}

function ToggleGroupItem({
  className,
  variant = "chip",
  value,
  pressed: controlledPressed,
  onPressedChange,
  disabled,
  onClick,
  onKeyDown,
  ...props
}: ToggleGroupItemProps): React.JSX.Element {
  const groupCtx = React.useContext(ToggleGroupContext);
  const isPressed =
    controlledPressed !== undefined
      ? controlledPressed
      : Boolean(groupCtx?.values.includes(value));
  const isDisabled = Boolean(disabled || groupCtx?.disabled);

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    onClick?.(event);
    if (event.defaultPrevented || isDisabled) return;
    if (groupCtx) {
      groupCtx.toggleValue(value);
    }
    onPressedChange?.(!isPressed);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLButtonElement> = (event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || !groupCtx) return;
    handleGroupArrowNavigation(event, groupCtx.orientation, groupCtx.loopFocus);
  };

  return (
    <button
      type="button"
      data-slot="toggle-group-item"
      aria-pressed={isPressed}
      data-pressed={isPressed ? "" : undefined}
      data-state={isPressed ? "on" : "off"}
      data-disabled={isDisabled ? "" : undefined}
      disabled={isDisabled}
      className={cn(toggleVariants({ variant }), className)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export { Toggle, ToggleGroup, ToggleGroupItem, toggleVariants };
