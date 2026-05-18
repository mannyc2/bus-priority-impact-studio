import type { CSSProperties } from "react";

import { StrengthBars } from "@/components/StrengthBars";
import { Badge } from "@/components/ui/badge";

export function ClaimRow({
  n,
  title,
  strength,
  evidence,
  caveats,
  active = false,
  editing = false,
  weak = false,
  reorderable = false,
  density = "comfortable",
  onClick,
}: {
  n: number;
  title: string;
  strength: number;
  evidence?: number;
  caveats?: number;
  active?: boolean;
  editing?: boolean;
  weak?: boolean;
  reorderable?: boolean;
  density?: "compact" | "comfortable";
  onClick?: () => void;
}) {
  const dense = density === "compact";
  const border = editing
    ? "1.5px solid var(--bp-color-accent)"
    : active
      ? "1.5px solid var(--bp-color-ink)"
      : "1px solid transparent";
  const background = editing
    ? "var(--bp-color-accent-bg)"
    : active
      ? "var(--bp-color-card)"
      : "transparent";

  const className = "mb-1 flex w-full gap-2 rounded-[3px] text-left transition-colors";
  const style: CSSProperties = {
    background,
    border,
    cursor: onClick ? "pointer" : "default",
    padding: dense ? "8px 10px" : "11px 12px",
  };
  const content = (
    <>
      {reorderable ? (
        <span className="mt-0.5 cursor-grab select-none text-xs leading-none tracking-[-0.1em] text-[var(--bp-color-ink-20)]">
          ⋮⋮
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className="shrink-0 font-mono font-bold tracking-[0.02em] text-[var(--bp-color-ink-55)]"
            style={{ fontSize: dense ? 10 : 11 }}
          >
            0{n}
          </span>
          <span
            className="flex-1 leading-snug tracking-[-0.005em]"
            style={{ fontSize: dense ? 12 : 13, fontWeight: active || editing ? 600 : 500 }}
          >
            {title}
          </span>
          {editing ? <Badge variant="accent">EDITING</Badge> : null}
        </div>
        <div
          className="mt-1.5 flex items-center gap-2 font-mono text-[var(--bp-color-ink-55)]"
          style={{ fontSize: dense ? 9.5 : 10.5 }}
        >
          <StrengthBars strength={strength} />
          {evidence !== undefined ? <span>{evidence} evidence</span> : null}
          {caveats !== undefined ? (
            <>
              <span className="text-[var(--bp-color-ink-20)]">·</span>
              <span>
                {caveats} caveat{caveats === 1 ? "" : "s"}
              </span>
            </>
          ) : null}
          {weak ? (
            <>
              <span className="text-[var(--bp-color-ink-20)]">·</span>
              <span className="font-bold text-[var(--bp-color-warn)]">weak</span>
            </>
          ) : null}
        </div>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} style={style} onClick={onClick}>
        {content}
      </button>
    );
  }

  return (
    <div className={className} style={style}>
      {content}
    </div>
  );
}
