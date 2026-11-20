"use client";

/**
 * Tabs · Primitiva WAI-ARIA accesible con HTML nativo (`<button type="button" role="tab">`)
 * y tokens de PitchLab (ADR-053). Soporta navegación con flechas (RTL-aware), Inicio/Fin,
 * foco itinerante (`roving tabindex`) y selección automática o manual.
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

type TabsOrientation = "horizontal" | "vertical";
type TabsActivationMode = "automatic" | "manual";

interface TabsContextValue {
  value: string;
  setValue: (next: string) => void;
  orientation: TabsOrientation;
  activationMode: TabsActivationMode;
  baseId: string;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext(componentName: string): TabsContextValue {
  const ctx = React.useContext(TabsContext);
  if (!ctx) {
    throw new Error(`${componentName} debe usarse dentro de <Tabs>.`);
  }
  return ctx;
}

function toSafeIdSegment(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export interface TabsProps extends Omit<React.ComponentPropsWithRef<"div">, "defaultValue"> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: TabsOrientation;
  activationMode?: TabsActivationMode;
}

function Tabs({
  className,
  value: controlledValue,
  defaultValue = "",
  onValueChange,
  orientation = "horizontal",
  activationMode = "automatic",
  ...props
}: TabsProps): React.JSX.Element {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const baseId = React.useId();

  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolledValue;

  const onValueChangeRef = React.useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  const setValue = React.useCallback(
    (next: string) => {
      if (!isControlled) {
        setUncontrolledValue(next);
      }
      onValueChangeRef.current?.(next);
    },
    [isControlled],
  );

  const ctxValue = React.useMemo<TabsContextValue>(
    () => ({
      value,
      setValue,
      orientation,
      activationMode,
      baseId,
    }),
    [value, setValue, orientation, activationMode, baseId],
  );

  return (
    <TabsContext.Provider value={ctxValue}>
      <div
        data-slot="tabs"
        data-orientation={orientation}
        className={cn("group/tabs flex gap-2 data-horizontal:flex-col", className)}
        {...props}
      />
    </TabsContext.Provider>
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center text-muted-foreground group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "gap-1 rounded-lg bg-secondary p-[3px]",
        chips: "gap-1 overflow-x-auto [scrollbar-width:none]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type TabsListProps = React.ComponentPropsWithRef<"div"> &
  VariantProps<typeof tabsListVariants>;

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsListProps): React.JSX.Element {
  const ctx = useTabsContext("TabsList");
  return (
    <div
      role="tablist"
      aria-orientation={ctx.orientation}
      data-slot="tabs-list"
      data-variant={variant}
      data-orientation={ctx.orientation}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

export interface TabsTriggerProps extends Omit<React.ComponentPropsWithRef<"button">, "value"> {
  value: string;
}

function TabsTrigger({
  className,
  value,
  disabled,
  onClick,
  onKeyDown,
  ...props
}: TabsTriggerProps): React.JSX.Element {
  const ctx = useTabsContext("TabsTrigger");
  const isActive = ctx.value === value;
  const tabId = `${ctx.baseId}-tab-${toSafeIdSegment(value)}`;

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    onClick?.(event);
    if (event.defaultPrevented || disabled) return;
    ctx.setValue(value);
    event.currentTarget.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLButtonElement> = (event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    const list = event.currentTarget.closest<HTMLElement>('[role="tablist"]');
    if (!list) return;

    const tabs = Array.from(
      list.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]:not(:disabled):not([aria-disabled="true"])',
      ),
    );
    if (tabs.length === 0) return;

    const currentIndex = tabs.indexOf(event.currentTarget);
    if (currentIndex === -1) return;

    const isRtl =
      ctx.orientation === "horizontal" &&
      typeof window !== "undefined" &&
      window.getComputedStyle(list).direction === "rtl";

    const nextKey =
      ctx.orientation === "vertical"
        ? "ArrowDown"
        : isRtl
          ? "ArrowLeft"
          : "ArrowRight";
    const prevKey =
      ctx.orientation === "vertical"
        ? "ArrowUp"
        : isRtl
          ? "ArrowRight"
          : "ArrowLeft";

    let targetIndex = -1;
    if (event.key === nextKey) {
      targetIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === prevKey) {
      targetIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      targetIndex = 0;
    } else if (event.key === "End") {
      targetIndex = tabs.length - 1;
    }

    if (targetIndex < 0) return;
    event.preventDefault();
    const target = tabs[targetIndex];
    if (!target) return;
    target.focus();
    target.scrollIntoView?.({ block: "nearest", inline: "nearest" });

    if (ctx.activationMode === "automatic") {
      const nextValue = target.dataset.tabValue;
      if (nextValue !== undefined) {
        ctx.setValue(nextValue);
      }
    }
  };

  return (
    <button
      id={tabId}
      type="button"
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      data-slot="tabs-trigger"
      data-tab-value={value}
      data-active={isActive ? "" : undefined}
      data-state={isActive ? "active" : "inactive"}
      data-disabled={disabled ? "" : undefined}
      className={cn(
        "relative inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        "data-active:bg-background data-active:text-foreground aria-selected:bg-background aria-selected:text-foreground",
        "group-data-[variant=chips]/tabs-list:rounded-full group-data-[variant=chips]/tabs-list:border-border group-data-[variant=chips]/tabs-list:bg-transparent group-data-[variant=chips]/tabs-list:data-active:border-primary group-data-[variant=chips]/tabs-list:data-active:text-foreground group-data-[variant=chips]/tabs-list:aria-selected:border-primary group-data-[variant=chips]/tabs-list:aria-selected:text-foreground",
        className,
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export interface TabsContentProps extends React.ComponentPropsWithRef<"div"> {
  value: string;
  keepMounted?: boolean;
}

function TabsContent({
  className,
  value,
  keepMounted = false,
  tabIndex,
  ...props
}: TabsContentProps): React.JSX.Element | null {
  const ctx = useTabsContext("TabsContent");
  const isActive = ctx.value === value;
  const safeVal = toSafeIdSegment(value);
  const tabId = `${ctx.baseId}-tab-${safeVal}`;
  const panelId = `${ctx.baseId}-panel-${safeVal}`;

  if (!isActive && !keepMounted) {
    return null;
  }

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      hidden={!isActive}
      tabIndex={isActive ? (tabIndex ?? 0) : undefined}
      data-slot="tabs-content"
      data-active={isActive ? "" : undefined}
      data-state={isActive ? "active" : "inactive"}
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
