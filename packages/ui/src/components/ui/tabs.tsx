"use client";

/**
 * Tabs · shadcn/ui (Mira, Base UI). Navegación con flechas, Inicio/Fin y roles ARIA
 * resueltos por Base UI. Ajuste PitchLab: pestañas de 36 px como mínimo y la activa
 * marcada con borde Pulso (el patrón de chips aprobado en D1).
 */
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props): React.JSX.Element {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex gap-2 data-horizontal:flex-col", className)}
      {...props}
    />
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

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>): React.JSX.Element {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props): React.JSX.Element {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        "data-active:bg-background data-active:text-foreground",
        "group-data-[variant=chips]/tabs-list:rounded-full group-data-[variant=chips]/tabs-list:border-border group-data-[variant=chips]/tabs-list:bg-transparent group-data-[variant=chips]/tabs-list:data-active:border-primary group-data-[variant=chips]/tabs-list:data-active:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props): React.JSX.Element {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
