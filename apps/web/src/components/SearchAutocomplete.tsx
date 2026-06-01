import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

export type AutocompleteSuggestion = {
  id: string;
  primary: ReactNode;
  secondary?: ReactNode;
  meta?: ReactNode;
  haystack: string;
};

export function SearchAutocomplete({
  placeholder,
  shortcut,
  suggestions,
  recent,
  onSelect,
  className,
  defaultValue = "",
}: {
  placeholder?: string;
  shortcut?: ReactNode;
  suggestions: readonly AutocompleteSuggestion[];
  recent?: ReactNode;
  onSelect: (id: string) => void;
  className?: string;
  defaultValue?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [query, setQuery] = useState(defaultValue);
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);

  const filtered = query.trim()
    ? suggestions.filter((s) => s.haystack.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : suggestions.slice(0, 4);

  useEffect(() => {
    function handler(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const inField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const isSlash = event.key === "/" && !inField;
      if (isCmdK || isSlash) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function commit(index: number) {
    const hit = filtered[index];
    if (!hit) return;
    onSelect(hit.id);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit(activeIndex);
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showList = open && filtered.length > 0;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <InputGroup
        className={cn(
          "h-auto rounded-[4px] border-[1.5px] border-[var(--bp-color-ink)] bg-[#fff]! px-[12px] py-[10px] shadow-[0_2px_0_var(--bp-color-ink)]",
          // Focus: keep the resting ink border, hard-kill the shadcn accent (blue) ring. The `!`
          // is required because the base InputGroup's has-[…:focus-visible]:ring-3/ring-ring/50
          // is an arbitrary variant tailwind-merge won't reliably collapse.
          "has-[[data-slot=input-group-control]:focus-visible]:border-[var(--bp-color-ink)]!",
          "has-[[data-slot=input-group-control]:focus-visible]:ring-0!",
        )}
      >
        <InputGroupAddon align="inline-start" className="text-[var(--bp-color-ink)]">
          <Search size={18} strokeWidth={1.8} aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-activedescendant={showList ? `${listboxId}-${activeIndex}` : undefined}
          className="appearance-none px-1 text-[17px] text-[var(--bp-color-ink)] placeholder:text-[var(--bp-color-ink-40)] outline-none! focus:outline-none! focus-visible:outline-none! md:text-[17px] [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {shortcut ? (
          <InputGroupAddon align="inline-end">
            <Kbd>{shortcut}</Kbd>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      {showList ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 m-0 list-none overflow-hidden rounded-[4px] bg-[var(--bp-color-card)] p-0 shadow-[0_2px_0_var(--bp-color-ink-20),0_0_0_1px_var(--bp-color-rule)]"
        >
          {filtered.map((s, i) => (
            <li
              key={s.id}
              id={`${listboxId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(event) => {
                event.preventDefault();
                commit(i);
              }}
              className={cn(
                "flex cursor-pointer items-center gap-3.5 px-[18px] py-[11px] text-[var(--bp-color-ink)]",
                i > 0 && "shadow-[inset_0_1px_0_var(--bp-color-rule)]",
                i === activeIndex && "bg-[var(--bp-color-ink-06)]",
              )}
            >
              <div className="min-w-0 flex-1 text-[13.5px] font-medium">{s.primary}</div>
              {s.meta ? (
                <div className="shrink-0 text-[12px] text-[var(--bp-color-ink-55)]">{s.meta}</div>
              ) : null}
              {i === activeIndex ? <Kbd>&#8629;</Kbd> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {recent ? <div className="mt-3.5">{recent}</div> : null}
    </div>
  );
}
