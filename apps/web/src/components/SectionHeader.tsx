import type { ReactNode } from "react";

export function SectionHeader({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3.5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[19px] font-semibold leading-tight tracking-[-0.015em]">{title}</div>
        {sub ? (
          <div className="mt-1 max-w-[620px] text-[12.5px] leading-normal text-[var(--bp-color-ink-70)]">
            {sub}
          </div>
        ) : null}
      </div>
      {right}
    </div>
  );
}
