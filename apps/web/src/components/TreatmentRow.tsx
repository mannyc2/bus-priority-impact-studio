import type { CSSProperties } from "react";

import { DotGlyph } from "@/components/DotGlyph";
import { LaneGlyph, type LaneState } from "@/components/LaneGlyph";

export function TreatmentRow({
  lane = "none",
  ace = false,
  tsp = false,
  align = "flex-end",
}: {
  lane?: LaneState;
  ace?: boolean;
  tsp?: boolean;
  align?: CSSProperties["justifyContent"];
}) {
  return (
    <div className="flex items-start gap-3.5" style={{ justifyContent: align }}>
      <LaneGlyph state={lane} />
      <DotGlyph label="ACE" on={ace} tone="accent" />
      <DotGlyph label="TSP" on={tsp} tone="good" />
    </div>
  );
}
