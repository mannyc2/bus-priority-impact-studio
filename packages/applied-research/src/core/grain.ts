export type ResearchGrain =
  | "feed-day"
  | "route-month"
  | "route-direction-daypart"
  | "route-direction-hour"
  | "route-segment-month"
  | "segment-daypart"
  | "stop-direction-hour"
  | "intervention-window";

export type GrainDescriptor = {
  readonly grain: ResearchGrain;
  readonly rank: number;
  readonly description: string;
  readonly cleanNoHitRequiresShadowAudit: boolean;
};

const GRAIN_DESCRIPTORS: Record<ResearchGrain, GrainDescriptor> = {
  "feed-day": {
    grain: "feed-day",
    rank: 10,
    description: "Source/feed quality state for a day.",
    cleanNoHitRequiresShadowAudit: false,
  },
  "route-month": {
    grain: "route-month",
    rank: 20,
    description: "Coarse route-level release or historical month.",
    cleanNoHitRequiresShadowAudit: true,
  },
  "route-direction-daypart": {
    grain: "route-direction-daypart",
    rank: 40,
    description: "Route, direction, and daypart operating window.",
    cleanNoHitRequiresShadowAudit: true,
  },
  "route-direction-hour": {
    grain: "route-direction-hour",
    rank: 50,
    description: "Route, direction, and hour operating window.",
    cleanNoHitRequiresShadowAudit: true,
  },
  "route-segment-month": {
    grain: "route-segment-month",
    rank: 55,
    description: "Route segment aggregated over a month.",
    cleanNoHitRequiresShadowAudit: true,
  },
  "segment-daypart": {
    grain: "segment-daypart",
    rank: 65,
    description: "Street or route segment by daypart.",
    cleanNoHitRequiresShadowAudit: false,
  },
  "stop-direction-hour": {
    grain: "stop-direction-hour",
    rank: 80,
    description: "Stop, direction, and hour rider-experienced reliability grain.",
    cleanNoHitRequiresShadowAudit: false,
  },
  "intervention-window": {
    grain: "intervention-window",
    rank: 70,
    description: "Treatment/control panel window around a dated intervention.",
    cleanNoHitRequiresShadowAudit: false,
  },
};

export function grainDescriptor(grain: ResearchGrain): GrainDescriptor {
  return GRAIN_DESCRIPTORS[grain];
}

export function compareGrainRank(left: ResearchGrain, right: ResearchGrain): number {
  return grainDescriptor(left).rank - grainDescriptor(right).rank;
}

export function isAtLeastAsFineGrain(candidate: ResearchGrain, required: ResearchGrain): boolean {
  return compareGrainRank(candidate, required) >= 0;
}
