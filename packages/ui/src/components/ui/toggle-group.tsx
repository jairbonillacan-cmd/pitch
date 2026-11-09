"use client";

/**
 * Toggle y ToggleGroup · shadcn/ui (Mira, Base UI). Se usan para filtros de una sola
 * elección (días de la jornada). Base UI resuelve `aria-pressed`, flechas y foco itinerante.
 * Ajuste PitchLab: chips en píldora de 40 px, activo con borde Pulso.
 */
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const toggleVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "rounded-md bg-transparent hover:bg-secondary data-pressed:bg-secondary data-pressed:text-foreground",
        chip: "min-h-10 rounded-full border border-border bg-transparent px-3.5 hover:border-input data-pressed:border-primary data-pressed:text-foreground",
        match: "min-h-11 gap-2 rounded-(--radius-pill) border border-border bg-card py-0 pl-2 pr-3 font-semibold text-foreground transition-[background-color,border-color] hover:border-input data-pressed:border-primary data-pressed:bg-surface-active",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Toggle({
  className,
  variant = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>): React.JSX.Element {
  return <TogglePrimitive data-slot="toggle" className={cn(toggleVariants({ variant, className }))} {...props} />;
}

function ToggleGroup({ className, ...props }: ToggleGroupPrimitive.Props): React.JSX.Element {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={cn("flex w-fit flex-row items-center gap-2", className)}
      {...props}
    />
  );
}

function ToggleGroupItem({
  className,
  variant = "chip",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>): React.JSX.Element {
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(toggleVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Toggle, ToggleGroup, ToggleGroupItem, toggleVariants };
