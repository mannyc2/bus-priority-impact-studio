import { CompareRouteTag } from "@/components/route/compare/CompareRouteTag";
import { COMPARE_SERIES } from "@/components/route/compare/series";
import type { CompareSides } from "@/components/route/compare/types";
import { RouteDeltaStrip } from "@/components/route/RouteDeltaStrip";
import { SectionHeader } from "@/components/SectionHeader";
import { TreatmentInventory } from "@/components/TreatmentBadge";
import type { StudioRouteDetailResponse } from "@/studio/api-contract";
import { routeTreatments } from "@/studio/treatment-model";

export function InterventionsCompareSection({ a, b }: CompareSides) {
  return (
    <div className="flex flex-col gap-7">
      <RouteDeltaStrip a={a.route} b={b.route} />

      <div>
        <SectionHeader
          title="What's in place on each corridor"
          sub="Priority treatments grouped by family. Lane, ACE, and TSP coverage deltas are in the KPI strip above; this is the per-route inventory."
        />
        <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
          <InventoryColumn detail={a} color={COMPARE_SERIES.a} />
          <InventoryColumn detail={b} color={COMPARE_SERIES.b} />
        </div>
      </div>
    </div>
  );
}

function InventoryColumn({ detail, color }: { detail: StudioRouteDetailResponse; color: string }) {
  return (
    <div>
      <div className="mb-2.5">
        <CompareRouteTag route={detail.route} color={color} />
      </div>
      <TreatmentInventory treatments={routeTreatments(detail.route, detail.segments)} />
    </div>
  );
}
