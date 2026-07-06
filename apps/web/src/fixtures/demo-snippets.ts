// Demo fixtures consumed by apps/web/src/dev/examples/*.tsx (the dev-only
// shadcn-style example gallery). These are the swap point for real API
// data once a route surface needs it.

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
