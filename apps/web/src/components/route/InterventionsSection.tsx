import { ArrowRight } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { TreatmentInventory } from "@/components/TreatmentBadge";
import type { StudioRouteDetailResponse, StudioSegment } from "@/studio/api-contract";
import { routeTreatments } from "@/studio/treatment-model";

export function InterventionsSection({
  route,
  segments,
  onShowTimeline,
}: {
  route: StudioRouteDetailResponse["route"];
  segments: readonly StudioSegment[];
  onShowTimeline: () => void;
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

      <div className="flex flex-wrap items-center gap-3 rounded-[3px] bg-[var(--bp-color-paper-deep)] px-4 py-3 text-[12px] text-[var(--bp-color-ink-70)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
        <span>Looking for when each treatment arrived and what changed after?</span>
        <button
          type="button"
          onClick={onShowTimeline}
          className="inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--bp-color-ink-20)] bg-[var(--bp-color-card)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--bp-color-accent)]"
        >
          See Timeline tab
          <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
