import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RouteBadge } from "@/components/RouteBadge";
import { type CompareSlot, useCompare } from "@/components/route/CompareContext";
import { type AutocompleteSuggestion, SearchAutocomplete } from "@/components/SearchAutocomplete";

/**
 * Per-slot "Change route" picker for the compare page. A disclosure that reveals
 * the shared SearchAutocomplete primitive; selecting a route calls the lifted
 * `setSlot` action from CompareContext (the canonical "custom UI inside the
 * provider triggers an action" pattern). No cmdk/Popover deps - same primitive
 * that backs the homepage and /routes search.
 */
export function RoutePicker({ slot }: { slot: CompareSlot }) {
  const { a, b, options, setSlot } = useCompare();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const otherSlug = slot === "a" ? b.slug : a.slug;
  const suggestions: AutocompleteSuggestion[] = options
    .filter((route) => route.slug !== otherSlug)
    .map((route) => ({
      id: route.slug,
      primary: (
        <span className="inline-flex min-w-0 items-center gap-2">
          <RouteBadge route={route.label} sbs={route.sbs} size="sm" />
          <span className="truncate">{route.corridor}</span>
        </span>
      ),
      haystack: `${route.label} ${route.corridor} ${route.borough}`,
    }));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-[3px] border border-[var(--bp-color-ink-20)] px-2 py-1 text-[11px] font-semibold text-[var(--bp-color-ink-70)] hover:bg-[var(--bp-color-paper-deep)]"
      >
        Change
        <ChevronDown size={12} aria-hidden />
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[300px]">
          <SearchAutocomplete
            size="sm"
            autoFocus
            placeholder="Search routes…"
            suggestions={suggestions}
            onSelect={(slug) => {
              setSlot(slot, slug);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
