import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-[3px] border-l-[3px] px-3.5 py-3 text-left text-[12.5px] leading-normal text-[var(--bp-color-ink-70)] has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        warn: "border-l-[var(--bp-color-warn)] bg-[var(--bp-color-warn-bg)]",
        bad: "border-l-[var(--bp-color-bad)] bg-[var(--bp-color-bad-bg)]",
        info: "border-l-[var(--bp-color-accent)] bg-[var(--bp-color-accent-bg)]",
      },
    },
    defaultVariants: {
      variant: "warn",
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

const alertTitleVariants = cva(
  "mb-0.5 font-semibold text-[12.5px] group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3",
  {
    variants: {
      variant: {
        warn: "text-[var(--bp-color-warn)]",
        bad: "text-[var(--bp-color-bad)]",
        info: "text-[var(--bp-color-accent)]",
      },
    },
    defaultVariants: {
      variant: "warn",
    },
  },
);

function AlertTitle({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertTitleVariants>) {
  return (
    <div
      data-slot="alert-title"
      className={cn(alertTitleVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-[12.5px] leading-normal text-[var(--bp-color-ink-70)] [&_a]:underline [&_a]:underline-offset-3 [&_p:not(:last-child)]:mb-2",
        className,
      )}
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="alert-action" className={cn("absolute top-2 right-2", className)} {...props} />
  );
}

export { Alert, AlertAction, AlertDescription, AlertTitle };
