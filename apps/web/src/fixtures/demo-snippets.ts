// Demo fixtures consumed by apps/web/src/dev/examples/*.tsx (the dev-only
// shadcn-style example gallery). These are the swap point for real API
// data — replace any of the named exports below with a fetch from the
// production endpoint once available.

import type { ClaimRow } from "@/components/ClaimRow";
import type { ReviewState } from "@/components/Reviewers";

export const demoHeatmap = {
  rows: ["NB", "SB"] as const,
  cols: ["6", "9", "12", "15", "18", "21"] as const,
  values: [
    [6.1, 4.8, 5.2, 4.1, 5.7, 7.4],
    [7.2, 5.6, 4.9, 4.4, 6.1, 8.0],
  ] as const,
};

export const demoClaims: ReadonlyArray<Parameters<typeof ClaimRow>[0]> = [
  {
    n: 1,
    title: "Madison Av is the current rider-impact bottleneck.",
    strength: 5,
    evidence: 4,
    caveats: 1,
    active: true,
  },
  {
    n: 2,
    title: "ACE coverage does not explain the full PM-peak decline.",
    strength: 3,
    evidence: 2,
    caveats: 2,
    weak: true,
  },
];

export const demoReviewers: ReadonlyArray<{ initials: string; state: ReviewState }> = [
  { initials: "JL", state: "reviewing" },
  { initials: "SR", state: "approved" },
  { initials: "CP", state: "requested-changes" },
];

export const demoTimeline = [
  { date: "2024", title: "Bus lane installed", tone: "good" as const },
  { date: "2025", title: "ACE camera active", tone: "accent" as const },
  { date: "2026", title: "PM-peak slowdown persists", tone: "bad" as const },
];

export const demoSpark = [8.2, 7.4, 6.2, 4.8, 5.1, 6.6, 6.1] as const;

export const demoHourBars = [8.1, 7.8, 7.5, 7.1, 6.8, 6.1, 5.2, 4.8, 4.4, 4.9, 5.8, 6.4] as const;

export const demoHourStrip = [0.1, 0.2, 0.4, 0.7, 0.8, 0.6, 0.3, 0.2, 0.5, 0.8, 0.9, 0.5] as const;

export const demoSegment = {
  dir: "NB" as const,
  from: "Madison Av / E 28 St",
  to: "Madison Av / E 58 St",
  mph: 4.2,
  sched: 7.1,
  riderHours: 18420,
  hours: demoHourStrip,
  lane: "partial" as const,
};

export const demoFooterSources = [
  "MTA Bus Speeds",
  "GTFS-RT",
  "ACE program",
  "NYC DOT bus lanes",
] as const;
