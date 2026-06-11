import { ArrowRight } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { CompareContext, type CompareSlot, useCompare } from "@/components/route/CompareContext";
import { RouteCompareIdentity } from "@/components/route/RouteCompareIdentity";
import { RouteCompareMetricStrip } from "@/components/route/RouteCompareMetricStrip";
import { RouteDeltaStrip } from "@/components/route/RouteDeltaStrip";
import { RouteIdentity } from "@/components/route/RouteIdentity";
import { RouteMetricStrip } from "@/components/route/RouteMetricStrip";
import { RoutePicker } from "@/components/route/RoutePicker";
import { getStudioRoute, studioRoutes } from "@/studio/sample-data";

// Dev-only prototyping surface for a *two-route* route-detail header. Both the
// single header and the compare header compose the same shared primitives -
// RouteIdentity for the name/metadata, MetricColumns for the figures - so the
// compare view stops shrinking names and deleting metadata. Variant B is wired
// for real interactivity through a local-state CompareProvider (see below).
// Pick a layout and we lift the header out of route-detail into a RouteHeader.

const a = getStudioRoute("m15-sbs");
const b = getStudioRoute("bx12-sbs");

const headerCard =
  "rounded-[3px] bg-[var(--bp-color-card)] px-7 pb-[18px] pt-6 shadow-[0_0_0_1px_var(--bp-color-rule)]";

export function CompareHeaderDemo() {
  if (!a || !b) return null;

  return (
    <div className="flex flex-col gap-7">
      <Variant
        n="A"
        title="Baseline — single header"
        note="The current route-detail header, composed from the shared RouteIdentity (size lg) + RouteMetricStrip. Reference point for the two-route variants below."
      >
        <SingleHeader route={a} />
      </Variant>

      <Variant
        n="B"
        title="Inline + interactive — change the comparison route"
        note="The comparison (right) route carries a 'Change' picker (the shared SearchAutocomplete) at its top-right; the focus (left) route is fixed by the page. Selection here runs through a local-state CompareProvider; the real page swaps the same provider for the URL-backed one — the picker and header don't change. Try changing the right route."
      >
        <DemoCompareProvider>
          <InteractiveHeader />
        </DemoCompareProvider>
      </Variant>

      <Variant
        n="C"
        title="Inline + computed gap — delta strip"
        note="Same shared identity, but the figures use the existing RouteDeltaStrip (A->B with delta arrows) instead of the inline 'vs' figures — shown for contrast."
      >
        <DeltaHeader />
      </Variant>
    </div>
  );
}

function SingleHeader({ route }: { route: NonNullable<ReturnType<typeof getStudioRoute>> }) {
  return (
    <div className={headerCard}>
      <div className="mb-[18px] flex items-start gap-[18px]">
        <div className="min-w-0 flex-1">
          <RouteIdentity route={route} size="lg" />
        </div>
        <div className="flex shrink-0 items-center gap-2 max-md:hidden">
          <span className="inline-flex items-center rounded-[3px] border border-[var(--bp-color-ink-20)] px-3.5 py-2 text-[12.5px] font-medium">
            Compare with Bx12 SBS
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--bp-color-paper)]">
            Generate brief
            <ArrowRight size={14} />
          </span>
        </div>
      </div>
      <RouteMetricStrip route={route} />
    </div>
  );
}

/** Variant B: the interactive header, reading from whichever CompareProvider is
 * above it. Here that's the local-state one; on the real page it's URL-backed. */
function InteractiveHeader() {
  const { a: routeA, b: routeB } = useCompare();
  return (
    <div className={headerCard}>
      <RouteCompareIdentity a={routeA} b={routeB} actionB={<RoutePicker slot="b" />} />
      <div className="mt-5 border-t border-[var(--bp-color-rule)] pt-4">
        <RouteCompareMetricStrip a={routeA} b={routeB} />
      </div>
    </div>
  );
}

/** Variant C: static fixtures + the existing A->B delta strip. */
function DeltaHeader() {
  if (!a || !b) return null;
  return (
    <div className={headerCard}>
      <RouteCompareIdentity a={a} b={b} />
      <div className="mt-5">
        <RouteDeltaStrip a={a} b={b} />
      </div>
    </div>
  );
}

/**
 * A non-routed implementation of the CompareContext interface: holds the A/B
 * selection in local state instead of the URL. Drop-in for the gallery so the
 * picker/swap actually mutate without a router. Demonstrates that the provider
 * is the only thing that knows *how* the selection is stored.
 */
function DemoCompareProvider({ children }: { children: ReactNode }) {
  const [slugs, setSlugs] = useState({ a: "m15-sbs", b: "bx12-sbs" });
  const value = useMemo(() => {
    const routeA = getStudioRoute(slugs.a);
    const routeB = getStudioRoute(slugs.b);
    if (!routeA || !routeB) return null;
    return {
      a: routeA,
      b: routeB,
      options: studioRoutes,
      swap: () => setSlugs((s) => ({ a: s.b, b: s.a })),
      setSlot: (slot: CompareSlot, slug: string) => setSlugs((s) => ({ ...s, [slot]: slug })),
    };
  }, [slugs]);
  if (!value) return null;
  return <CompareContext value={value}>{children}</CompareContext>;
}

function Variant({
  n,
  title,
  note,
  children,
}: {
  n: string;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2.5">
        <div className="text-[12.5px] font-semibold">
          <span className="mr-2 font-mono text-[var(--bp-color-ink-40)]">{n}</span>
          {title}
        </div>
        <p className="mt-0.5 max-w-[760px] text-[12px] leading-[1.5] text-[var(--bp-color-ink-55)]">
          {note}
        </p>
      </div>
      {children}
    </div>
  );
}
