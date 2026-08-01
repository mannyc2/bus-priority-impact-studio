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
