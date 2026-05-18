import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Tarbell variants — primary / secondary / accent / ghost / danger.
// One `primary` per screen. `secondary` is the default. `accent` is reserved
// for ↗ jumps inside evidence panels. `ghost` for inline tertiary. `danger`
// for destructive (kept outlined — most BPI edits are reversible).
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[3px] border bg-clip-padding font-medium whitespace-nowrap tracking-[0.005em] transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "border-[var(--bp-color-ink-20)] bg-transparent text-foreground hover:bg-muted aria-expanded:bg-muted",
        accent: "border-accent bg-accent text-accent-foreground hover:bg-accent/90",
        ghost:
          "border-transparent bg-transparent text-[var(--bp-color-ink-70)] hover:bg-muted hover:text-foreground",
        danger:
          "border-destructive bg-transparent text-destructive hover:bg-[var(--bp-color-bad-bg)]",
      },
      size: {
        md: "h-9 gap-1.5 px-3.5 text-[12.5px] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        sm: "h-7 gap-1 px-2.5 text-[11.5px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-1.5 px-4.5 text-[13.5px] has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5",
        icon: "size-9",
        "icon-sm": "size-7",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

function Button({
  className,
  variant = "secondary",
  size = "md",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
