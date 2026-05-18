// Re-export shim — all design-system primitives have moved to flat
// components/<X>.tsx. This barrel is kept alive only until the Phase 6
// mass import rewrite removes it along with the rest of design-system/.

export { AiAttribution } from "@/components/AiAttribution";
export { BeforeAfter } from "@/components/BeforeAfter";
export { ChartFrame } from "@/components/ChartFrame";
export { Cite } from "@/components/Cite";
export { ClaimList } from "@/components/ClaimList";
export { ClaimRow } from "@/components/ClaimRow";
export { CommentBadge } from "@/components/CommentBadge";
export { CommentMarker } from "@/components/CommentMarker";
export { ConfidenceBar } from "@/components/ConfidenceBar";
export { DirIndicator } from "@/components/DirIndicator";
export { DotGlyph } from "@/components/DotGlyph";
export { Heatmap } from "@/components/Heatmap";
export { HourBars } from "@/components/HourBars";
export { HourStrip } from "@/components/HourStrip";
export { KPI, KPISkeleton } from "@/components/KPI";
export { LaneGlyph } from "@/components/LaneGlyph";
export { MapThumb } from "@/components/MapThumb";
export { ReviewerChip, ReviewerStack } from "@/components/Reviewers";
export { RouteBadge } from "@/components/RouteBadge";
export { SectionHeader } from "@/components/SectionHeader";
export {
  SegmentRow,
  SegmentRowHeader,
  SegmentRowSkeleton,
} from "@/components/SegmentRow";
export { Skeleton } from "@/components/ui/skeleton";
export { Skeleton as SkeletonText } from "@/components/ui/skeleton";
export { KPISkeleton as SkeletonKPI } from "@/components/KPI";
export { SegmentRowSkeleton as SkeletonSegmentRow } from "@/components/SegmentRow";
export { Spark } from "@/components/Spark";
export { StrengthBars } from "@/components/StrengthBars";
export { StudioBar } from "@/components/StudioBar";
export { StudioFooter } from "@/components/StudioFooter";
export { StudioMark } from "@/components/StudioMark";
export { Timeline } from "@/components/Timeline";
export { TreatmentRow } from "@/components/TreatmentRow";
export { bpiColors, bpiFonts } from "./tokens.js";
