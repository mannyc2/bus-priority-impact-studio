import type { CSSProperties } from "react";

import type { LaneState } from "@/components/LaneGlyph";
import { TreatmentBadgeStrip } from "@/components/TreatmentBadge";
import { legacyToTreatments, type TreatmentItem } from "@/studio/treatment-model";

export function TreatmentRow({
  lane = "none",
  ace = false,
  tsp = false,
  treatments,
  align = "flex-end",
}: {
  lane?: LaneState;
  ace?: boolean;
  tsp?: boolean;
  treatments?: readonly TreatmentItem[] | undefined;
  align?: CSSProperties["justifyContent"];
}) {
  const normalized =
    treatments && treatments.length > 0 ? treatments : legacyToTreatments({ lane, ace, tsp });

  return (
    <TreatmentBadgeStrip treatments={normalized} size="xs" align={align} showFamilyLabels={false} />
  );
}
