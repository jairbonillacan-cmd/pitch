/**
 * Badge · shadcn/ui (Mira, Base UI) con las variantes de etiqueta de PitchLab:
 * `fav` (favorito / pick, en Pulso), `info` (hoy), `live` (en juego), `success` y `danger`
 * (pick acertado o fallado). Los estados siempre llevan texto, nunca solo color.
 */
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

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
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>): React.ReactElement {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">({ className: cn(badgeVariants({ variant }), className) }, props),
    render,
    state: { slot: "badge", variant },
  });
}

export { Badge, badgeVariants };
