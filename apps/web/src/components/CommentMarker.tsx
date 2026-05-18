import type { ReactNode } from "react";

export function CommentMarker({ children, marker }: { children: ReactNode; marker: string }) {
  return (
    <>
      <span className="border-b-[1.5px] border-[var(--bp-color-warn)] bg-[var(--bp-color-warn-bg)] px-0.5">
        {children}
      </span>
      <sup className="ml-px text-[9px] font-bold text-[var(--bp-color-accent)]">{marker}</sup>
    </>
  );
}
