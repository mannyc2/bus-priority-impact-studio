import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export type FilterChipOption<T extends string> = { id: T; label: string };

const CHIP_CLASSNAME = cn(
  "h-auto min-w-0 rounded-[3px] bg-[var(--bp-color-ink-06)] px-[7px] py-[2px] text-[11px] font-medium tracking-[0.02em] text-[var(--bp-color-ink-70)]",
  "hover:bg-[var(--bp-color-ink-10)] hover:text-[var(--bp-color-ink)]",
  "data-[state=on]:bg-[var(--bp-color-ink)] data-[state=on]:text-[var(--bp-color-paper)]",
  "aria-pressed:bg-[var(--bp-color-ink)] aria-pressed:text-[var(--bp-color-paper)]",
  "focus-visible:ring-0 focus-visible:outline-none",
);

export function FilterChips<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly FilterChipOption<T>[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <ToggleGroup
      aria-label={ariaLabel}
      value={[value]}
      onValueChange={(v) => {
        const next = Array.isArray(v) ? v[0] : v;
        if (typeof next === "string" && next.length > 0) onChange(next as T);
      }}
      className={cn("gap-1.5", className)}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.id} value={o.id} className={CHIP_CLASSNAME}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
