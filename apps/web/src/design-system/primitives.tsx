// Empty shim — all primitives have been moved to flat components/<X>.tsx.
// Re-exports below keep consumers that still import from "./primitives.js"
// working until the Phase 6 mass-rewrite. Deleted with the rest of
// design-system/ in Phase 6.

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
export { KPI } from "@/components/KPI";
export { LaneGlyph } from "@/components/LaneGlyph";
export { MapThumb } from "@/components/MapThumb";
export { ReviewerChip, ReviewerStack } from "@/components/Reviewers";
export { RouteBadge } from "@/components/RouteBadge";
export { SectionHeader } from "@/components/SectionHeader";
export { SegmentRow, SegmentRowHeader } from "@/components/SegmentRow";
export { Spark } from "@/components/Spark";
export { StrengthBars } from "@/components/StrengthBars";
export { StudioBar } from "@/components/StudioBar";
export { StudioFooter } from "@/components/StudioFooter";
export { StudioMark } from "@/components/StudioMark";
export { Timeline } from "@/components/Timeline";
export { TreatmentRow } from "@/components/TreatmentRow";

// Skeleton aliases — the BPI Skeleton/SkeletonText/SkeletonKPI/
// SkeletonSegmentRow wrappers have been folded into the composites
// they shadowed and into the shadcn Skeleton primitive. Aliases kept
// here for the in-flight migration only.
export { Skeleton, Skeleton as SkeletonText } from "@/components/ui/skeleton";
export { KPISkeleton as SkeletonKPI } from "@/components/KPI";
export { SegmentRowSkeleton as SkeletonSegmentRow } from "@/components/SegmentRow";
