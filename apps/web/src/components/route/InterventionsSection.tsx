import { SectionHeader } from "@/components/SectionHeader";
import { TreatmentInventory } from "@/components/TreatmentBadge";
import type { StudioRouteDetailResponse, StudioSegment } from "@/studio/api-contract";
import { routeTreatments } from "@/studio/treatment-model";

export function InterventionsSection({
  route,
  segments,
}: {
  route: StudioRouteDetailResponse["route"];
  segments: readonly StudioSegment[];
}) {
  const treatments = routeTreatments(route, segments);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <SectionHeader
          title="What's in place today"
          sub={`Every treatment on ${route.label}${route.sbs ? " SBS" : ""} by family. State and evaluation are separate axes.`}
        />
        <TreatmentInventory treatments={treatments} />
      </div>

    </div>
  );
}
