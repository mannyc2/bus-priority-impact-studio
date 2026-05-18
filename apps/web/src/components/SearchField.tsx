import { Search } from "lucide-react";
import { useEffect, useRef } from "react";

import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

type SearchFieldProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  shortcut?: string;
};

export function SearchField({ className, shortcut, ...inputProps }: SearchFieldProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!shortcut) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== shortcut) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      event.preventDefault();
      ref.current?.focus();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [shortcut]);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[4px] border-[1.5px] border-[var(--bp-color-ink)] bg-[var(--bp-color-card)] px-[18px] py-3 shadow-[0_2px_0_var(--bp-color-ink)]",
        className,
      )}
    >
      <Search size={18} strokeWidth={1.8} aria-hidden className="text-[var(--bp-color-ink)]" />
      <Input
        ref={ref}
        type="search"
        className="h-7 flex-1 rounded-none border-0 bg-transparent px-0 text-[17px] text-[var(--bp-color-ink)] shadow-none focus-visible:border-0 focus-visible:ring-0 placeholder:text-[var(--bp-color-ink-40)] md:text-[17px]"
        {...inputProps}
      />
      {shortcut ? (
        <Kbd className="bg-transparent text-[var(--bp-color-ink-40)] ring-1 ring-[var(--bp-color-ink-20)] ring-inset">
          {shortcut}
        </Kbd>
      ) : null}
    </div>
  );
}
