import { useNavigate } from "@tanstack/react-router";
import { createContext, type ReactNode, use, useMemo } from "react";
import type { StudioRoute } from "@/studio/api-contract";

export type CompareSlot = "a" | "b";

type CompareContextValue = {
  a: StudioRoute;
  b: StudioRoute;
  /** Full route list used to populate the per-slot route picker. */
  options: readonly StudioRoute[];
  /** Swap which route sits in slot A vs slot B. */
  swap: () => void;
  /** Replace one slot with a different route slug. */
  setSlot: (slot: CompareSlot, slug: string) => void;
};

/** Exported so alternative (non-routed) providers - e.g. a local-state provider
 * in a prototype or test - can supply the same interface that `useCompare`
 * reads. The URL-backed `CompareProvider` below is the production one. */
export const CompareContext = createContext<CompareContextValue | null>(null);

/**
 * Lifts the compare selection actions out of the page. The selection itself
 * lives in the URL (`?a=&b=`), so this provider holds no mutable state - it just
 * turns swap/setSlot into navigations. Any descendant (cards, swap button, the
 * route picker) can call an action without prop-drilling `navigate` + slugs.
 */
export function CompareProvider({
  a,
  b,
  options,
  children,
}: {
  a: StudioRoute;
  b: StudioRoute;
  options: readonly StudioRoute[];
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const value = useMemo<CompareContextValue>(
    () => ({
      a,
      b,
      options,
      swap: () => navigate({ to: "/compare", search: { a: b.slug, b: a.slug } }),
      setSlot: (slot, slug) =>
        navigate({
          to: "/compare",
          search: slot === "a" ? { a: slug, b: b.slug } : { a: a.slug, b: slug },
        }),
    }),
    [a, b, options, navigate],
  );
  return <CompareContext value={value}>{children}</CompareContext>;
}

export function useCompare(): CompareContextValue {
  const value = use(CompareContext);
  if (value === null) {
    throw new Error("useCompare must be used within a CompareProvider");
  }
  return value;
}
