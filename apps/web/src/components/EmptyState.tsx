import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

type EmptyStateTone = "neutral" | "warn";

const tonePalette: Record<EmptyStateTone, string> = {
  neutral: "bg-[var(--bp-color-ink-06)] text-[var(--bp-color-ink-55)]",
  warn: "bg-[var(--bp-color-warn-bg)] text-[var(--bp-color-warn)]",
};

export function EmptyState({
  icon = "∅",
  title,
  body,
  primary,
  secondary,
  tone = "neutral",
  className,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  primary?: ReactNode;
  secondary?: ReactNode;
  tone?: EmptyStateTone;
  className?: string;
}) {
  return (
    <Empty className={cn("border-0 px-7 py-10", className)}>
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className={cn("size-11 rounded-full text-xl leading-none", tonePalette[tone])}
        >
          {icon}
        </EmptyMedia>
        <EmptyTitle className="text-[15px] tracking-[-0.01em]">{title}</EmptyTitle>
        {body ? (
          <EmptyDescription className="text-[12.5px] text-[var(--bp-color-ink-70)]">
            {body}
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
      {primary || secondary ? (
        <EmptyContent className="flex-row justify-center gap-2">
          {secondary ? (
            <Button size="sm" variant="secondary">
              {secondary}
            </Button>
          ) : null}
          {primary ? <Button size="sm">{primary}</Button> : null}
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
