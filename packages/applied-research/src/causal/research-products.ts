export type PulseCandidate = {
  readonly candidateId: string;
  readonly eventId: string;
  readonly routeId: string;
  readonly interventionType: string;
  readonly interventionDate: string | null;
  readonly treatedScopeKind: string;
  readonly treatedScopeId: string;
  readonly preWindowStart: string | null;
  readonly preWindowEnd: string | null;
  readonly postWindowStart: string | null;
  readonly postWindowEnd: string | null;
  readonly controlRouteCount: number;
  readonly effectEstimateMph: number | null;
  readonly matchedPeerDeltaMph: number | null;
  readonly gateDisposition: "candidate_causal" | "screening_effect" | "screening_only";
};

export type PulseCandidateSetArtifact = {
  readonly artifactKind: "applied_research_pulse_candidate_set";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly historyWindow: {
    readonly startMonth: string;
    readonly endMonth: string;
  };
  readonly artifactPath: string;
  readonly sourcePanelPath: string;
  readonly summary: {
    readonly candidateCount: number;
    readonly routeCount: number;
    readonly eventCount: number;
    readonly candidateCausalCount: number;
    readonly screeningEffectCount: number;
  };
  readonly candidates: readonly PulseCandidate[];
  readonly limitations: readonly string[];
};

export type PulseEventOverlapRow = {
  readonly overlapId: string;
  readonly candidateId: string;
  readonly eventId: string;
  readonly routeId: string;
  readonly interventionDate: string | null;
  readonly preWindowStart: string | null;
  readonly preWindowEnd: string | null;
  readonly postWindowStart: string | null;
  readonly postWindowEnd: string | null;
  readonly overlapGrain: "route_month_window";
  readonly targetPanelGrain: "segment_daypart_month";
  readonly hasPreWindow: boolean;
  readonly hasPostWindow: boolean;
};

export type PulseEventOverlapArtifact = {
  readonly artifactKind: "applied_research_pulse_event_overlap";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly historyWindow: PulseCandidateSetArtifact["historyWindow"];
  readonly artifactPath: string;
  readonly sourceCandidateSetPath: string;
  readonly segmentDaypartPanelPath: string;
  readonly summary: {
    readonly overlapRowCount: number;
    readonly routeCount: number;
    readonly eventCount: number;
    readonly completeWindowCount: number;
  };
  readonly rows: readonly PulseEventOverlapRow[];
  readonly limitations: readonly string[];
};

export type EventEffectContrastRow = {
  readonly contrastId: string;
  readonly candidateId: string;
  readonly eventId: string;
  readonly routeId: string;
  readonly interventionType: string;
  readonly interventionDate: string | null;
  readonly eventStudyEstimateMph: number;
  readonly matchedPeerDeltaMph: number | null;
  readonly controlRouteCount: number;
  readonly gateDisposition: PulseCandidate["gateDisposition"];
};

export type EventEffectContrastArtifact = {
  readonly artifactKind: "applied_research_event_effect_contrast";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly historyWindow: PulseCandidateSetArtifact["historyWindow"];
  readonly artifactPath: string;
  readonly sourceCandidateSetPath: string;
  readonly summary: {
    readonly contrastCount: number;
    readonly routeCount: number;
    readonly eventCount: number;
    readonly candidateCausalContrastCount: number;
    readonly medianAbsEffectEstimateMph: number | null;
  };
  readonly rows: readonly EventEffectContrastRow[];
  readonly limitations: readonly string[];
};

export type MechanismCorroborationStatus =
  | "corroborated"
  | "mixed"
  | "single_method_signal"
  | "weak_signal";

export type EffectDirection = "improvement" | "deterioration" | "flat";

export type MechanismCorroborationRow = {
  readonly mechanismId: string;
  readonly contrastId: string;
  readonly candidateId: string;
  readonly eventId: string;
  readonly routeId: string;
  readonly interventionFamily: string;
  readonly interventionType: string;
  readonly interventionDate: string | null;
  readonly effectDirection: EffectDirection;
  readonly matchedPeerDirection: EffectDirection | null;
  readonly effectEstimateMph: number;
  readonly matchedPeerDeltaMph: number | null;
  readonly corroborationStatus: MechanismCorroborationStatus;
  readonly evidenceSignals: readonly string[];
  readonly requiresTier2FullCorpusReview: boolean;
};

export type MechanismCorroborationArtifact = {
  readonly artifactKind: "applied_research_mechanism_corroboration";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly historyWindow: PulseCandidateSetArtifact["historyWindow"];
  readonly artifactPath: string;
  readonly sourceEventEffectContrastPath: string;
  readonly summary: {
    readonly rowCount: number;
    readonly routeCount: number;
    readonly eventCount: number;
    readonly familyCount: number;
    readonly corroboratedCount: number;
    readonly mixedCount: number;
    readonly singleMethodSignalCount: number;
    readonly weakSignalCount: number;
  };
  readonly rows: readonly MechanismCorroborationRow[];
  readonly limitations: readonly string[];
};

export type EventFamilyTimeRegime =
  | "pre_2024"
  | "2024_to_2025"
  | "2026_plus"
  | "unknown_date";

export type EventFamilyEffectPanelRow = {
  readonly panelId: string;
  readonly interventionFamily: string;
  readonly timeRegime: EventFamilyTimeRegime;
  readonly contrastCount: number;
  readonly eventCount: number;
  readonly routeCount: number;
  readonly medianEffectEstimateMph: number | null;
  readonly medianAbsEffectEstimateMph: number | null;
  readonly improvementCount: number;
  readonly deteriorationCount: number;
  readonly flatCount: number;
  readonly corroboratedCount: number;
  readonly mixedCount: number;
  readonly singleMethodSignalCount: number;
  readonly weakSignalCount: number;
  readonly candidateCausalContrastCount: number;
};

export type EventFamilyEffectPanelArtifact = {
  readonly artifactKind: "applied_research_event_family_effect_panel";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly historyWindow: EventEffectContrastArtifact["historyWindow"];
  readonly artifactPath: string;
  readonly sourceEventEffectContrastPath: string;
  readonly sourceMechanismCorroborationPath: string;
  readonly summary: {
    readonly panelRowCount: number;
    readonly familyCount: number;
    readonly regimeCount: number;
    readonly comparableFamilyCount: number;
    readonly contrastCount: number;
    readonly corroboratedContrastCount: number;
    readonly mixedContrastCount: number;
  };
  readonly rows: readonly EventFamilyEffectPanelRow[];
  readonly limitations: readonly string[];
};

export type EventFamilyDriftDirection =
  | "stable"
  | "attenuated"
  | "amplified"
  | "reversed"
  | "insufficient_history";

export type EventFamilyResponseDriftRow = {
  readonly driftId: string;
  readonly interventionFamily: string;
  readonly firstRegime: EventFamilyTimeRegime | null;
  readonly lastRegime: EventFamilyTimeRegime | null;
  readonly firstMedianEffectMph: number | null;
  readonly lastMedianEffectMph: number | null;
  readonly driftEstimateMph: number | null;
  readonly driftDirection: EventFamilyDriftDirection;
  readonly comparableRegimeCount: number;
  readonly totalContrastCount: number;
};

export type EventFamilyResponseDriftStudyArtifact = {
  readonly artifactKind: "applied_research_event_family_response_drift_study";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly historyWindow: EventFamilyEffectPanelArtifact["historyWindow"];
  readonly artifactPath: string;
  readonly sourceEventFamilyEffectPanelPath: string;
  readonly summary: {
    readonly familyCount: number;
    readonly comparableFamilyCount: number;
    readonly stableFamilyCount: number;
    readonly attenuatedFamilyCount: number;
    readonly amplifiedFamilyCount: number;
    readonly reversedFamilyCount: number;
    readonly insufficientHistoryFamilyCount: number;
  };
  readonly rows: readonly EventFamilyResponseDriftRow[];
  readonly limitations: readonly string[];
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function countUnique(values: Iterable<string>): number {
  return new Set(values).size;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) return null;
  if (sorted.length % 2 !== 0) return upper;
  const lower = sorted[middle - 1];
  return lower === undefined ? null : (lower + upper) / 2;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function effectDirection(value: number): EffectDirection {
  if (Math.abs(value) < 0.1) return "flat";
  return value > 0 ? "improvement" : "deterioration";
}

function interventionFamily(interventionType: string): string {
  const normalized = interventionType.toLowerCase();
  if (normalized.includes("busway") || normalized.includes("bus_lane")) return "bus_priority_lane";
  if (normalized.includes("camera") || normalized.includes("ace") || normalized.includes("able"))
    return "camera_enforcement";
  if (normalized.includes("signal") || normalized.includes("tsp")) return "transit_signal_priority";
  if (normalized.includes("stop")) return "stop_or_station_change";
  if (normalized.includes("source_gap")) return "source_gap_or_unclassified";
  return normalized.replaceAll(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unclassified";
}

function corroborationStatus(row: EventEffectContrastRow): MechanismCorroborationStatus {
  const primary = effectDirection(row.eventStudyEstimateMph);
  const peer =
    row.matchedPeerDeltaMph === null ? null : effectDirection(row.matchedPeerDeltaMph);
  if (primary === "flat") return "weak_signal";
  if (peer === null || peer === "flat") return "single_method_signal";
  return peer === primary ? "corroborated" : "mixed";
}

function timeRegime(interventionDate: string | null): EventFamilyTimeRegime {
  if (interventionDate === null) return "unknown_date";
  const year = Number(interventionDate.slice(0, 4));
  if (!Number.isFinite(year)) return "unknown_date";
  if (year < 2024) return "pre_2024";
  if (year < 2026) return "2024_to_2025";
  return "2026_plus";
}

function regimeOrder(regime: EventFamilyTimeRegime): number {
  switch (regime) {
    case "pre_2024":
      return 0;
    case "2024_to_2025":
      return 1;
    case "2026_plus":
      return 2;
    case "unknown_date":
      return 3;
  }
}

function driftDirection(input: {
  readonly first: number | null;
  readonly last: number | null;
  readonly comparableRegimeCount: number;
}): EventFamilyDriftDirection {
  if (input.comparableRegimeCount < 2 || input.first === null || input.last === null) {
    return "insufficient_history";
  }
  const firstDirection = effectDirection(input.first);
  const lastDirection = effectDirection(input.last);
  if (firstDirection !== "flat" && lastDirection !== "flat" && firstDirection !== lastDirection) {
    return "reversed";
  }
  const firstMagnitude = Math.abs(input.first);
  const lastMagnitude = Math.abs(input.last);
  if (firstMagnitude < 0.1 && lastMagnitude < 0.1) return "stable";
  if (lastMagnitude < firstMagnitude * 0.75) return "attenuated";
  if (lastMagnitude > firstMagnitude * 1.25) return "amplified";
  return "stable";
}

function gateDisposition(row: Record<string, unknown>): PulseCandidate["gateDisposition"] {
  const eventStudyEstimate = numberValue(row["eventStudyEstimate"]);
  const controlStatus = text(row["controlEligibilityStatus"]);
  const statuses = [
    text(row["preTrendStatus"]),
    text(row["placeboInTimeStatus"]) ?? text(row["placeboStatus"]),
    text(row["placeboInSpaceStatus"]) ?? text(row["placeboStatus"]),
    text(row["autocorrelationStatus"]),
    text(row["methodDivergenceStatus"]),
  ];
  if (controlStatus === "eligible" && statuses.every((status) => status === "passes")) {
    return "candidate_causal";
  }
  return eventStudyEstimate === null ? "screening_only" : "screening_effect";
}

function candidateFromPanelRow(row: Record<string, unknown>): PulseCandidate | null {
  const eventId = text(row["eventId"]);
  const routeId = text(row["treatedScopeId"]);
  const interventionType = text(row["interventionType"]);
  const treatedScopeKind = text(row["treatedScopeKind"]);
  if (eventId === null || routeId === null || interventionType === null || treatedScopeKind === null) {
    return null;
  }
  const interventionDate = text(row["interventionDate"]);
  const disposition = gateDisposition(row);
  return {
    candidateId: [eventId, treatedScopeKind, routeId].join(":"),
    eventId,
    routeId,
    interventionType,
    interventionDate,
    treatedScopeKind,
    treatedScopeId: routeId,
    preWindowStart: text(row["preWindowStart"]),
    preWindowEnd: text(row["preWindowEnd"]),
    postWindowStart: text(row["postWindowStart"]),
    postWindowEnd: text(row["postWindowEnd"]),
    controlRouteCount: arrayValue(row["controlScopeIds"]).length,
    effectEstimateMph: numberValue(row["eventStudyEstimate"]),
    matchedPeerDeltaMph: numberValue(row["matchedPeerDelta"]),
    gateDisposition: disposition,
  };
}

export function buildPulseCandidateSetArtifact(input: {
  readonly treatmentEventPanel: unknown;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly historyStartMonth: string;
  readonly artifactPath: string;
  readonly sourcePanelPath: string;
}): PulseCandidateSetArtifact {
  const root = objectValue(input.treatmentEventPanel);
  const historyWindow = objectValue(root?.["historyWindow"]);
  const candidates = arrayValue(root?.["rows"])
    .map(objectValue)
    .filter((row): row is Record<string, unknown> => row !== null)
    .map(candidateFromPanelRow)
    .filter((candidate): candidate is PulseCandidate => candidate !== null);
  return {
    artifactKind: "applied_research_pulse_candidate_set",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    historyWindow: {
      startMonth: text(historyWindow?.["startMonth"]) ?? input.historyStartMonth,
      endMonth: text(historyWindow?.["endMonth"]) ?? input.releaseMonth,
    },
    artifactPath: input.artifactPath,
    sourcePanelPath: input.sourcePanelPath,
    summary: {
      candidateCount: candidates.length,
      routeCount: countUnique(candidates.map((candidate) => candidate.routeId)),
      eventCount: countUnique(candidates.map((candidate) => candidate.eventId)),
      candidateCausalCount: candidates.filter(
        (candidate) => candidate.gateDisposition === "candidate_causal",
      ).length,
      screeningEffectCount: candidates.filter(
        (candidate) => candidate.gateDisposition === "screening_effect",
      ).length,
    },
    candidates,
    limitations: [
      "Candidates are association-screening hypotheses from treatment_event_panel_v1, not public causal claims.",
      "Rows preserve route-level treated scopes; segment-level overlap enumeration remains a follow-up.",
    ],
  };
}

export function buildPulseEventOverlapArtifact(input: {
  readonly candidateSet: PulseCandidateSetArtifact;
  readonly generatedAt: string;
  readonly artifactPath: string;
  readonly sourceCandidateSetPath: string;
  readonly segmentDaypartPanelPath: string;
}): PulseEventOverlapArtifact {
  const rows = input.candidateSet.candidates.map((candidate) => ({
    overlapId: candidate.candidateId,
    candidateId: candidate.candidateId,
    eventId: candidate.eventId,
    routeId: candidate.routeId,
    interventionDate: candidate.interventionDate,
    preWindowStart: candidate.preWindowStart,
    preWindowEnd: candidate.preWindowEnd,
    postWindowStart: candidate.postWindowStart,
    postWindowEnd: candidate.postWindowEnd,
    overlapGrain: "route_month_window" as const,
    targetPanelGrain: "segment_daypart_month" as const,
    hasPreWindow: candidate.preWindowStart !== null && candidate.preWindowEnd !== null,
    hasPostWindow: candidate.postWindowStart !== null && candidate.postWindowEnd !== null,
  }));
  return {
    artifactKind: "applied_research_pulse_event_overlap",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.candidateSet.releaseMonth,
    historyWindow: input.candidateSet.historyWindow,
    artifactPath: input.artifactPath,
    sourceCandidateSetPath: input.sourceCandidateSetPath,
    segmentDaypartPanelPath: input.segmentDaypartPanelPath,
    summary: {
      overlapRowCount: rows.length,
      routeCount: countUnique(rows.map((row) => row.routeId)),
      eventCount: countUnique(rows.map((row) => row.eventId)),
      completeWindowCount: rows.filter((row) => row.hasPreWindow && row.hasPostWindow).length,
    },
    rows,
    limitations: [
      "Overlap rows currently describe route-month intervention windows over the segment-daypart panel.",
      "They do not yet enumerate every route segment crossed by the event geometry.",
    ],
  };
}

export function buildEventEffectContrastArtifact(input: {
  readonly candidateSet: PulseCandidateSetArtifact;
  readonly generatedAt: string;
  readonly artifactPath: string;
  readonly sourceCandidateSetPath: string;
}): EventEffectContrastArtifact {
  const rows = input.candidateSet.candidates
    .filter((candidate) => candidate.effectEstimateMph !== null)
    .map((candidate) => ({
      contrastId: candidate.candidateId,
      candidateId: candidate.candidateId,
      eventId: candidate.eventId,
      routeId: candidate.routeId,
      interventionType: candidate.interventionType,
      interventionDate: candidate.interventionDate,
      eventStudyEstimateMph: candidate.effectEstimateMph ?? 0,
      matchedPeerDeltaMph: candidate.matchedPeerDeltaMph,
      controlRouteCount: candidate.controlRouteCount,
      gateDisposition: candidate.gateDisposition,
    }));
  return {
    artifactKind: "applied_research_event_effect_contrast",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.candidateSet.releaseMonth,
    historyWindow: input.candidateSet.historyWindow,
    artifactPath: input.artifactPath,
    sourceCandidateSetPath: input.sourceCandidateSetPath,
    summary: {
      contrastCount: rows.length,
      routeCount: countUnique(rows.map((row) => row.routeId)),
      eventCount: countUnique(rows.map((row) => row.eventId)),
      candidateCausalContrastCount: rows.filter(
        (row) => row.gateDisposition === "candidate_causal",
      ).length,
      medianAbsEffectEstimateMph: median(rows.map((row) => Math.abs(row.eventStudyEstimateMph))),
    },
    rows,
    limitations: [
      "Contrasts are screening estimates from treatment_event_panel_v1.",
      "Human methodology review and stronger mechanism corroboration are required before causal claims.",
    ],
  };
}

export function buildMechanismCorroborationArtifact(input: {
  readonly eventEffectContrast: EventEffectContrastArtifact;
  readonly generatedAt: string;
  readonly artifactPath: string;
  readonly sourceEventEffectContrastPath: string;
}): MechanismCorroborationArtifact {
  const rows = input.eventEffectContrast.rows.map((row) => {
    const family = interventionFamily(row.interventionType);
    const primaryDirection = effectDirection(row.eventStudyEstimateMph);
    const peerDirection =
      row.matchedPeerDeltaMph === null ? null : effectDirection(row.matchedPeerDeltaMph);
    const status = corroborationStatus(row);
    const evidenceSignals = [
      `event_study:${primaryDirection}`,
      row.matchedPeerDeltaMph === null ? "matched_peer:not_available" : `matched_peer:${peerDirection}`,
      `control_routes:${row.controlRouteCount}`,
    ];
    return {
      mechanismId: row.contrastId,
      contrastId: row.contrastId,
      candidateId: row.candidateId,
      eventId: row.eventId,
      routeId: row.routeId,
      interventionFamily: family,
      interventionType: row.interventionType,
      interventionDate: row.interventionDate,
      effectDirection: primaryDirection,
      matchedPeerDirection: peerDirection,
      effectEstimateMph: row.eventStudyEstimateMph,
      matchedPeerDeltaMph: row.matchedPeerDeltaMph,
      corroborationStatus: status,
      evidenceSignals,
      requiresTier2FullCorpusReview: true,
    } satisfies MechanismCorroborationRow;
  });
  return {
    artifactKind: "applied_research_mechanism_corroboration",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.eventEffectContrast.releaseMonth,
    historyWindow: input.eventEffectContrast.historyWindow,
    artifactPath: input.artifactPath,
    sourceEventEffectContrastPath: input.sourceEventEffectContrastPath,
    summary: {
      rowCount: rows.length,
      routeCount: countUnique(rows.map((row) => row.routeId)),
      eventCount: countUnique(rows.map((row) => row.eventId)),
      familyCount: countUnique(rows.map((row) => row.interventionFamily)),
      corroboratedCount: rows.filter((row) => row.corroborationStatus === "corroborated").length,
      mixedCount: rows.filter((row) => row.corroborationStatus === "mixed").length,
      singleMethodSignalCount: rows.filter(
        (row) => row.corroborationStatus === "single_method_signal",
      ).length,
      weakSignalCount: rows.filter((row) => row.corroborationStatus === "weak_signal").length,
    },
    rows,
    limitations: [
      "Mechanism rows are screening corroboration from available contrast methods, not proof that an intervention caused the movement.",
      "Every row still requires Tier 2 full-corpus review before use in public causal prose.",
    ],
  };
}

export function buildEventFamilyEffectPanelArtifact(input: {
  readonly eventEffectContrast: EventEffectContrastArtifact;
  readonly mechanismCorroboration: MechanismCorroborationArtifact;
  readonly generatedAt: string;
  readonly artifactPath: string;
  readonly sourceEventEffectContrastPath: string;
  readonly sourceMechanismCorroborationPath: string;
}): EventFamilyEffectPanelArtifact {
  const mechanismByContrastId = new Map(
    input.mechanismCorroboration.rows.map((row) => [row.contrastId, row]),
  );
  const grouped = new Map<string, EventEffectContrastRow[]>();
  for (const row of input.eventEffectContrast.rows) {
    const mechanism = mechanismByContrastId.get(row.contrastId);
    const family = mechanism?.interventionFamily ?? interventionFamily(row.interventionType);
    const regime = timeRegime(row.interventionDate);
    const key = `${family}:${regime}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  const rows = [...grouped.entries()]
    .map(([key, contrasts]) => {
      const first = contrasts[0];
      const [family, rawRegime] = key.split(":");
      const regime = rawRegime as EventFamilyTimeRegime;
      const mechanismRows = contrasts
        .map((contrast) => mechanismByContrastId.get(contrast.contrastId))
        .filter((row): row is MechanismCorroborationRow => row !== undefined);
      return {
        panelId: key,
        interventionFamily: family ?? interventionFamily(first?.interventionType ?? "unclassified"),
        timeRegime: regime,
        contrastCount: contrasts.length,
        eventCount: countUnique(contrasts.map((contrast) => contrast.eventId)),
        routeCount: countUnique(contrasts.map((contrast) => contrast.routeId)),
        medianEffectEstimateMph: median(
          contrasts.map((contrast) => contrast.eventStudyEstimateMph),
        ),
        medianAbsEffectEstimateMph: median(
          contrasts.map((contrast) => Math.abs(contrast.eventStudyEstimateMph)),
        ),
        improvementCount: contrasts.filter(
          (contrast) => effectDirection(contrast.eventStudyEstimateMph) === "improvement",
        ).length,
        deteriorationCount: contrasts.filter(
          (contrast) => effectDirection(contrast.eventStudyEstimateMph) === "deterioration",
        ).length,
        flatCount: contrasts.filter(
          (contrast) => effectDirection(contrast.eventStudyEstimateMph) === "flat",
        ).length,
        corroboratedCount: mechanismRows.filter(
          (row) => row.corroborationStatus === "corroborated",
        ).length,
        mixedCount: mechanismRows.filter((row) => row.corroborationStatus === "mixed").length,
        singleMethodSignalCount: mechanismRows.filter(
          (row) => row.corroborationStatus === "single_method_signal",
        ).length,
        weakSignalCount: mechanismRows.filter(
          (row) => row.corroborationStatus === "weak_signal",
        ).length,
        candidateCausalContrastCount: contrasts.filter(
          (contrast) => contrast.gateDisposition === "candidate_causal",
        ).length,
      } satisfies EventFamilyEffectPanelRow;
    })
    .sort(
      (left, right) =>
        left.interventionFamily.localeCompare(right.interventionFamily) ||
        regimeOrder(left.timeRegime) - regimeOrder(right.timeRegime),
    );
  const regimesByFamily = new Map<string, Set<EventFamilyTimeRegime>>();
  for (const row of rows) {
    const regimes = regimesByFamily.get(row.interventionFamily) ?? new Set();
    regimes.add(row.timeRegime);
    regimesByFamily.set(row.interventionFamily, regimes);
  }
  return {
    artifactKind: "applied_research_event_family_effect_panel",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.eventEffectContrast.releaseMonth,
    historyWindow: input.eventEffectContrast.historyWindow,
    artifactPath: input.artifactPath,
    sourceEventEffectContrastPath: input.sourceEventEffectContrastPath,
    sourceMechanismCorroborationPath: input.sourceMechanismCorroborationPath,
    summary: {
      panelRowCount: rows.length,
      familyCount: regimesByFamily.size,
      regimeCount: countUnique(rows.map((row) => row.timeRegime)),
      comparableFamilyCount: [...regimesByFamily.values()].filter((regimes) => regimes.size >= 2)
        .length,
      contrastCount: input.eventEffectContrast.rows.length,
      corroboratedContrastCount: input.mechanismCorroboration.rows.filter(
        (row) => row.corroborationStatus === "corroborated",
      ).length,
      mixedContrastCount: input.mechanismCorroboration.rows.filter(
        (row) => row.corroborationStatus === "mixed",
      ).length,
    },
    rows,
    limitations: [
      "Families are normalized from intervention type labels and should be reviewed before use as a policy taxonomy.",
      "Panel rows summarize screening contrasts; they are not a replacement for a reviewed causal design.",
    ],
  };
}

export function buildEventFamilyResponseDriftStudyArtifact(input: {
  readonly eventFamilyEffectPanel: EventFamilyEffectPanelArtifact;
  readonly generatedAt: string;
  readonly artifactPath: string;
  readonly sourceEventFamilyEffectPanelPath: string;
}): EventFamilyResponseDriftStudyArtifact {
  const rowsByFamily = new Map<string, EventFamilyEffectPanelRow[]>();
  for (const row of input.eventFamilyEffectPanel.rows) {
    rowsByFamily.set(row.interventionFamily, [
      ...(rowsByFamily.get(row.interventionFamily) ?? []),
      row,
    ]);
  }
  const rows = [...rowsByFamily.entries()]
    .map(([family, familyRows]) => {
      const ordered = [...familyRows]
        .filter((row) => row.timeRegime !== "unknown_date")
        .sort((left, right) => regimeOrder(left.timeRegime) - regimeOrder(right.timeRegime));
      const first = ordered[0] ?? null;
      const last = ordered.at(-1) ?? null;
      const firstEffect = first?.medianEffectEstimateMph ?? null;
      const lastEffect = last?.medianEffectEstimateMph ?? null;
      const direction = driftDirection({
        first: firstEffect,
        last: lastEffect,
        comparableRegimeCount: ordered.length,
      });
      return {
        driftId: family,
        interventionFamily: family,
        firstRegime: first?.timeRegime ?? null,
        lastRegime: last?.timeRegime ?? null,
        firstMedianEffectMph: firstEffect,
        lastMedianEffectMph: lastEffect,
        driftEstimateMph:
          firstEffect === null || lastEffect === null ? null : round(lastEffect - firstEffect),
        driftDirection: direction,
        comparableRegimeCount: ordered.length,
        totalContrastCount: familyRows.reduce((sum, row) => sum + row.contrastCount, 0),
      } satisfies EventFamilyResponseDriftRow;
    })
    .sort((left, right) => left.interventionFamily.localeCompare(right.interventionFamily));
  return {
    artifactKind: "applied_research_event_family_response_drift_study",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.eventFamilyEffectPanel.releaseMonth,
    historyWindow: input.eventFamilyEffectPanel.historyWindow,
    artifactPath: input.artifactPath,
    sourceEventFamilyEffectPanelPath: input.sourceEventFamilyEffectPanelPath,
    summary: {
      familyCount: rows.length,
      comparableFamilyCount: rows.filter((row) => row.driftDirection !== "insufficient_history")
        .length,
      stableFamilyCount: rows.filter((row) => row.driftDirection === "stable").length,
      attenuatedFamilyCount: rows.filter((row) => row.driftDirection === "attenuated").length,
      amplifiedFamilyCount: rows.filter((row) => row.driftDirection === "amplified").length,
      reversedFamilyCount: rows.filter((row) => row.driftDirection === "reversed").length,
      insufficientHistoryFamilyCount: rows.filter(
        (row) => row.driftDirection === "insufficient_history",
      ).length,
    },
    rows,
    limitations: [
      "Response-drift rows are exploratory comparisons across coarse time regimes.",
      "Small family counts, route mix changes, and partial Tier 2 extraction must stay visible in review.",
    ],
  };
}
