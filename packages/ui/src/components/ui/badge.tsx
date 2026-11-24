/**
 * Badge · PitchLab (HTML nativo `<span>`, sin dependencias headless · ADR-053).
 * Variantes: `fav` (favorito / pick, en Pulso), `info` (hoy), `live` (en juego),
 * `success` y `danger` (pick acertado o fallado). Los estados siempre llevan texto, nunca solo color.
 */
import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const pill = "h-6 gap-1.5 rounded-md px-2 text-xs font-semibold tracking-normal normal-case border-0";

const badgeVariants = cva(
  "group/badge inline-flex h-[18px] w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border border-transparent px-1.5 text-[10px] font-bold tracking-[0.06em] whitespace-nowrap uppercase [&>svg]:pointer-events-none [&>svg]:size-2.5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        fav: "bg-primary/12 text-primary",
        info: "bg-[color-mix(in_srgb,var(--info)_11%,transparent)] text-[var(--info)]",
        live: "bg-destructive/12 text-destructive",
        success: "bg-[color-mix(in_srgb,var(--success)_11%,transparent)] text-[var(--success)] normal-case tracking-normal text-xs",
        danger: "bg-destructive/10 text-destructive normal-case tracking-normal text-xs",
        outline: "border-border text-muted-foreground",
        pill: `${pill} bg-[var(--pl-surface-elevated)] text-muted-foreground`,
        "pill-success": `${pill} bg-[var(--pl-pill-success-bg)] text-(--success) motion-safe:[&>.dot]:animate-[pulse_2.4s_var(--ease-out)_infinite]`,
        "pill-info": `${pill} bg-[var(--pl-pill-info-bg)] text-(--info)`,
        "pill-model": `${pill} bg-[var(--pl-pill-brand-bg)] text-(--chart-model)`,
        "pill-warning": `${pill} bg-[var(--pl-pill-warning-bg)] text-(--warning)`,
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
