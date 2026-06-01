import type { ReactNode } from "react";

const TONE = {
  accent: "var(--bp-color-accent)",
  warn: "var(--bp-color-warn)",
  bad: "var(--bp-color-bad)",
} as const;

export type AnchorTone = keyof typeof TONE;

/**
 * An inline anchor in the brief prose — the span a margin comment is pinned to.
 * Quiet underline at rest, washed + solid when its comment is active. An inline
 * `<span role="button">` so a multi-word anchor still wraps with the text.
 */
export function RvAnchor({
  tone = "accent",
  active = false,
  onClick,
  children,
}: {
  tone?: AnchorTone;
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const color = TONE[tone];
  return (
    <span
      role="button"
      tabIndex={0}
      data-anchor
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
        }
      }}
      className="cursor-pointer rounded-[2px] px-px transition-[background,box-shadow] duration-100"
      style={{
        background: active ? `color-mix(in oklch, ${color} 14%, transparent)` : "transparent",
        boxShadow: `inset 0 -2px 0 ${
          active ? color : `color-mix(in oklch, ${color} 42%, transparent)`
        }`,
      }}
    >
      {children}
    </span>
  );
}
