import type { ReactNode } from "react";

import { ClaimRow } from "@/components/ClaimRow";

export function ClaimList({
  claims,
  reorderable = false,
  density = "comfortable",
  onAdd,
  summary,
  onSelect,
}: {
  claims: ReadonlyArray<Parameters<typeof ClaimRow>[0]>;
  reorderable?: boolean;
  density?: "compact" | "comfortable";
  onAdd?: () => void;
  summary?: ReactNode;
  onSelect?: (claim: Parameters<typeof ClaimRow>[0]) => void;
}) {
  return (
    <div>
      {claims.map((claim) => {
        const onClick = onSelect ? () => onSelect(claim) : claim.onClick;
        return (
          <ClaimRow
            key={claim.n}
            {...claim}
            reorderable={reorderable}
            density={density}
            {...(onClick ? { onClick } : {})}
          />
        );
      })}
      {onAdd ? (
        <button
          type="button"
          className="mt-1.5 w-full rounded-[3px] border-[1.5px] border-dashed border-[var(--bp-color-ink-20)] bg-transparent text-left text-[11.5px] font-medium text-[var(--bp-color-ink-55)]"
          style={{ padding: density === "compact" ? "8px 10px" : "10px 12px" }}
          onClick={onAdd}
        >
          + Add claim
        </button>
      ) : null}
      {summary ? (
        <div className="mt-2.5 rounded-[3px] bg-[var(--bp-color-ink-06)] px-3 py-2.5 font-mono text-[11px] leading-normal text-[var(--bp-color-ink-55)]">
          {summary}
        </div>
      ) : null}
    </div>
  );
}
