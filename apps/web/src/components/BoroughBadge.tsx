import { boroughColor } from "@/lib/borough";

/** Borough chip: colored dot + borough name. The one approved way to show a
 * route's borough (operator 2026-07-06: "we should have some special component
 * for it"). */
export function BoroughBadge({ borough }: { borough: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink-06)] px-2 py-0.5 text-[11px] font-medium text-[var(--bp-color-ink-70)]">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: boroughColor(borough) }}
        aria-hidden
      />
      {borough}
    </span>
  );
}
