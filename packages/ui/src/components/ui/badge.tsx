/**
 * Badge · PitchLab (HTML nativo `<span>`, sin runtime de `@base-ui/react` · ADR-053).
 * Variantes: `fav` (favorito / pick, en Pulso), `info` (hoy), `live` (en juego),
 * `success` y `danger` (pick acertado o fallado). Los estados siempre llevan texto, nunca solo color.
 */
import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const pill = "h-6 gap-1.5 rounded-(--radius-pill) px-2 text-xs font-semibold tracking-normal normal-case";

const badgeVariants = cva(
  "group/badge inline-flex h-[18px] w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border border-transparent px-1.5 text-[10px] font-bold tracking-[0.06em] whitespace-nowrap uppercase [&>svg]:pointer-events-none [&>svg]:size-2.5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        fav: "bg-primary/15 text-primary",
        info: "bg-[color-mix(in_srgb,var(--info)_14%,transparent)] text-[var(--info)]",
        live: "bg-destructive/15 text-destructive",
        success: "bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--success)] normal-case tracking-normal text-xs",
        danger: "bg-destructive/12 text-destructive normal-case tracking-normal text-xs",
        outline: "border-border text-muted-foreground",
        pill: `${pill} border-border text-muted-foreground`,
        "pill-success": `${pill} border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-(--success) motion-safe:[&>.dot]:animate-[pulse_2.4s_var(--ease-out)_infinite]`,
        "pill-info": `${pill} border-[color-mix(in_srgb,var(--info)_40%,transparent)] text-(--info)`,
        "pill-model": `${pill} border-[color-mix(in_srgb,var(--chart-model)_40%,transparent)] text-(--chart-model)`,
        "pill-warning": `${pill} border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-(--warning)`,
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentPropsWithoutRef<"span"> & VariantProps<typeof badgeVariants>): React.ReactElement {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
