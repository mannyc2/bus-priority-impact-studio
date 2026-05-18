import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Tarbell chip semantics — sharp 3px radius (no pills), 11px text, BPI color
// pairs. Neutral chips are for tags and filter values. Coloured variants are
// reserved for severity, treatment status, brief status — anything that
// carries meaning. See design-system.html §05.
const badgeVariants = cva(
  "inline-flex h-fit w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-[3px] border border-transparent px-[7px] py-0.5 text-[11px] font-medium tracking-[0.02em] transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        neutral: "bg-[var(--bp-color-ink-06)] text-[var(--bp-color-ink-70)]",
        accent: "bg-[var(--bp-color-accent-bg)] text-[var(--bp-color-accent)]",
        good: "bg-[var(--bp-color-good-bg)] text-[var(--bp-color-good)]",
        warn: "bg-[var(--bp-color-warn-bg)] text-[var(--bp-color-warn)]",
        bad: "bg-[var(--bp-color-bad-bg)] text-[var(--bp-color-bad)]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

function Badge({
  className,
  variant = "neutral",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants };
