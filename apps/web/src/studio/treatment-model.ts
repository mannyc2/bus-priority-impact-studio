import type { StudioRouteDetailResponse, StudioSegment } from "@/studio/api-contract";

export type TreatmentFamilyId = "street" | "enf" | "sig" | "stop" | "svc" | "curb" | "prog";

export type TreatmentType =
  | "bus_lane"
  | "busway"
  | "offset_lane"
  | "ace"
  | "bus_mounted_cam"
  | "tsp"
  | "queue_jump"
  | "signal_retiming"
  | "stop_consolidation"
  | "off_board_fare"
  | "all_door"
  | "sbs"
  | "limited"
  | "curb_management"
  | "capital_milestone"
  | "proposal";

export type TreatmentState =
  | "active"
  | "implemented"
  | "pilot"
  | "planned"
  | "proposed"
  | "future"
  | "historical_context"
  | "source_gap"
  | "unknown";

export type TreatmentItem = {
  type: TreatmentType;
  state: TreatmentState;
  coverage?: number;
  note?: string;
  source?: string;
};

export const TREATMENT_FAMILIES: readonly {
  id: TreatmentFamilyId;
  label: string;
  short: string;
}[] = [
  { id: "street", label: "Street priority", short: "Street" },
  { id: "enf", label: "Enforcement", short: "Enforce" },
  { id: "sig", label: "Signals", short: "Signals" },
  { id: "stop", label: "Stops & boarding", short: "Stops" },
  { id: "svc", label: "Service pattern", short: "Service" },
  { id: "curb", label: "Curb / access / safety", short: "Curb" },
  { id: "prog", label: "Program / capital", short: "Program" },
];

export const TREATMENT_META: Record<
  TreatmentType,
  {
    code: string;
    label: string;
    family: TreatmentFamilyId;
    priority: number;
  }
> = {
  busway: { code: "BWY", label: "Busway", family: "street", priority: 1 },
  offset_lane: { code: "OL", label: "Offset bus lane", family: "street", priority: 2 },
  bus_lane: { code: "BL", label: "Bus lane", family: "street", priority: 3 },
  ace: { code: "ACE", label: "ACE cameras", family: "enf", priority: 1 },
  bus_mounted_cam: { code: "BCM", label: "Bus-mounted camera", family: "enf", priority: 2 },
  tsp: { code: "TSP", label: "Transit signal priority", family: "sig", priority: 1 },
  queue_jump: { code: "QJ", label: "Queue jump", family: "sig", priority: 2 },
  signal_retiming: { code: "SR", label: "Signal retiming", family: "sig", priority: 3 },
  stop_consolidation: { code: "SC", label: "Stop consolidation", family: "stop", priority: 1 },
  off_board_fare: { code: "OBF", label: "Off-board fare", family: "stop", priority: 2 },
  all_door: { code: "AD", label: "All-door boarding", family: "stop", priority: 3 },
  sbs: { code: "SBS", label: "Select Bus Service", family: "svc", priority: 1 },
  limited: { code: "LTD", label: "Limited-stop pattern", family: "svc", priority: 2 },
  curb_management: { code: "CR", label: "Curb management", family: "curb", priority: 1 },
  capital_milestone: { code: "CAP", label: "Capital milestone", family: "prog", priority: 1 },
  proposal: { code: "PR", label: "Proposal", family: "prog", priority: 2 },
};

export const TREATMENT_STATE_META: Record<
  TreatmentState,
  {
    label: string;
    short: string;
    present: boolean | null;
    tone: "good" | "warn" | "accent" | "neutral";
  }
> = {
  active: { label: "Active", short: "Active", present: true, tone: "good" },
  implemented: { label: "Implemented", short: "In place", present: true, tone: "good" },
  pilot: { label: "Pilot", short: "Pilot", present: true, tone: "accent" },
  planned: { label: "Planned", short: "Planned", present: false, tone: "warn" },
  proposed: { label: "Proposed", short: "Proposed", present: false, tone: "warn" },
  future: { label: "Future", short: "Future", present: false, tone: "neutral" },
  historical_context: {
    label: "Historical context",
    short: "History",
    present: false,
    tone: "neutral",
  },
  source_gap: { label: "Source gap", short: "Gap", present: null, tone: "warn" },
  unknown: { label: "Unknown", short: "Unknown", present: null, tone: "neutral" },
};

type LegacyTreatmentInput = Pick<StudioSegment, "ace" | "lane" | "tsp">;

export function legacyToTreatments({
  lane = "none",
  ace = false,
  tsp = false,
}: Partial<LegacyTreatmentInput> = {}): TreatmentItem[] {
  const items: TreatmentItem[] = [];
  if (lane === "yes") items.push({ type: "bus_lane", state: "active", coverage: 1 });
  if (lane === "partial") items.push({ type: "bus_lane", state: "active", coverage: 0.5 });
  if (lane === "minimal") items.push({ type: "bus_lane", state: "active", coverage: 0.2 });
  if (ace) items.push({ type: "ace", state: "active" });
  if (tsp) items.push({ type: "tsp", state: "active" });
  return items;
}

export function routeTreatments(
  route: StudioRouteDetailResponse["route"],
  segments: readonly StudioSegment[],
): TreatmentItem[] {
  const items: TreatmentItem[] = [];
  const routeText = [
    route.reliability,
    route.diagnosis,
    ...route.flags,
    ...route.interventions.flatMap((event) => [event.title, event.detail]),
  ]
    .join(" ")
    .toLowerCase();

  if (routeText.includes("busway")) {
    items.push({ type: "busway", state: "active", source: "Route flags / intervention record" });
  } else if (routeText.includes("concrete lane") || routeText.includes("offset")) {
    items.push({
      type: "offset_lane",
      state: "active",
      coverage: route.laneCoverage / 100,
      source: "Route flags / intervention record",
    });
  } else if (route.laneCoverage > 0) {
    items.push({
      type: "bus_lane",
      state: "active",
      coverage: route.laneCoverage / 100,
      source: "Route lane coverage",
    });
  }

  if (route.aceStatus === "active") {
    items.push({
      type: "ace",
      state: "active",
      source: "Route ACE program record",
      ...(route.aceSince ? { note: `since ${route.aceSince}` } : {}),
    });
  }

  if (route.tspCoverage !== "none") {
    const tspSegments = segments.filter((segment) => segment.tsp).length;
    items.push({
      type: "tsp",
      state: "active",
      source: "Route TSP coverage",
      ...(segments.length ? { coverage: tspSegments / segments.length } : {}),
      ...(route.tspCoverage === "partial" ? { note: "partial route coverage" } : {}),
    });
  }

  if (route.sbs) items.push({ type: "sbs", state: "active", source: "Route service type" });
  else if (routeText.includes("limited")) {
    items.push({ type: "limited", state: "active", source: "Route service type" });
  }

  if (routeText.includes("off-board fare")) {
    items.push({
      type: "off_board_fare",
      state: "implemented",
      source: "Intervention record",
    });
  }
  if (routeText.includes("all-door")) {
    items.push({ type: "all_door", state: "implemented", source: "Intervention record" });
  }
  if (routeText.includes("stop consolidation")) {
    items.push({
      type: "stop_consolidation",
      state: "implemented",
      source: "Intervention record",
    });
  }
  if (routeText.includes("signal timing") || routeText.includes("retiming")) {
    items.push({ type: "signal_retiming", state: "proposed", source: "Route diagnosis" });
  }
  if (routeText.includes("loading") || routeText.includes("curb")) {
    items.push({ type: "curb_management", state: "proposed", source: "Route diagnosis" });
  }
  if (routeText.includes("capital")) {
    items.push({
      type: "capital_milestone",
      state: "planned",
      source: "Intervention record",
    });
  }
  if (routeText.includes("proposal") || routeText.includes("proposed")) {
    items.push({ type: "proposal", state: "proposed", source: "Intervention record" });
  }

  return uniqueTreatments(items);
}

export function groupTreatments(treatments: readonly TreatmentItem[]) {
  const groups = new Map<TreatmentFamilyId, TreatmentItem[]>();
  for (const family of TREATMENT_FAMILIES) groups.set(family.id, []);
  for (const treatment of treatments) {
    const meta = TREATMENT_META[treatment.type];
    groups.get(meta.family)?.push(treatment);
  }
  for (const items of groups.values()) {
    items.sort((a, b) => {
      const presentA = TREATMENT_STATE_META[a.state].present === true ? 0 : 1;
      const presentB = TREATMENT_STATE_META[b.state].present === true ? 0 : 1;
      if (presentA !== presentB) return presentA - presentB;
      return TREATMENT_META[a.type].priority - TREATMENT_META[b.type].priority;
    });
  }
  return groups;
}

export function countTreatmentStates(treatments: readonly TreatmentItem[]) {
  return treatments.reduce(
    (counts, treatment) => {
      const present = TREATMENT_STATE_META[treatment.state].present;
      if (present === true) counts.inPlace += 1;
      else if (present === null) counts.gaps += 1;
      else counts.planned += 1;
      return counts;
    },
    { inPlace: 0, planned: 0, gaps: 0 },
  );
}

function uniqueTreatments(items: readonly TreatmentItem[]): TreatmentItem[] {
  const byKey = new Map<string, TreatmentItem>();
  for (const item of items) {
    const key = `${item.type}:${item.state}`;
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return [...byKey.values()];
}
