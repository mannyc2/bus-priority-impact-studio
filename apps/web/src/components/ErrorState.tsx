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

export function ErrorState({
  title = "Could not load data",
  body,
  retry,
  onRetry,
  className,
}: {
  title?: string;
  body?: ReactNode;
  retry?: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Empty className={cn("border-0 px-6 py-8", className)}>
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="size-10 rounded-full bg-[var(--bp-color-bad-bg)] text-lg font-bold text-[var(--bp-color-bad)]"
        >
          !
        </EmptyMedia>
        <EmptyTitle className="text-sm">{title}</EmptyTitle>
        {body ? (
          <EmptyDescription className="text-xs text-[var(--bp-color-ink-70)]">
            {body}
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
      {retry ? (
        <EmptyContent className="flex-row justify-center">
          <Button size="sm" variant="secondary" onClick={onRetry}>
            {retry}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
