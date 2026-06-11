import { createHash } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { readJsonIfExists, writeJson } from "../../../lib/json.ts";
import { fromCliPath } from "../../../lib/paths.ts";

const CLEANED_MAP_KIND = "bp.tier2_vocab_map_cleaned.v1";
const MAP_PACK_MANIFEST_KIND = "bp.tier2_vocab_map_pack_manifest.v1";
const MAP_PACK_PROJECTION_KIND = "bp.tier2_vocab_normalization_projection.v1";
const MAP_PACK_SUMMARY_KIND = "bp.tier2_vocab_map_pack_summary.v1";

type SourceFieldCounts = Record<string, number>;

type CanonicalValue = {
  canonicalId: string;
  label: string;
  description: string;
  measurementDimension: string;
  metricFamily: string;
  mergePolicy: "same_leaf_only" | "family_rollup_allowed" | "preserve_raw_preferred";
  countedEntityFamily?: string;
  coarseGroup?: string;
  semanticTags: string[];
  downstreamUses: string[];
  positiveExamples: string[];
  negativeExamples: string[];
};

type EnrichedAlias = {
  rawValue: string;
  normalizedRawValue: string;
  decision: "mapped" | "unresolved" | "preserve_raw";
  canonicalId?: string;
  confidence: number;
  rationale: string;
  reviewFlags: string[];
  inputCount: number;
  sourceFieldCounts: SourceFieldCounts;
  surfaceKindCounts: SourceFieldCounts;
  examples: Array<Record<string, unknown>>;
};

type VocabMapArtifact = {
  artifactKind: string;
  schemaVersion: number;
  generatedAt: string;
  promptVersion?: string;
  sourceGraduationPlanPath: string;
  keyId: string;
  targetPayloadPath: string;
  model: string | null;
  temperature: number | null;
  summary: {
    inputValueCount: number;
    canonicalValueCount: number;
    aliasCount: number;
    mappedCount: number;
    unresolvedCount: number;
    preserveRawCount: number;
    instanceCoverageCount: number;
  };
  canonicalValues: CanonicalValue[];
  aliases: EnrichedAlias[];
  reviewNotes: Array<{
    note: string;
    rawValues: string[];
  }>;
};

type VocabRunArtifact = {
  artifactKind: string;
  schemaVersion: number;
  generatedAt: string;
  outputRoot: string;
  keyIds: string[];
  harness: "v1" | "v2";
  provider: "pioneer" | "deepseek" | null;
  model: string | null;
  temperature: number | null;
  summary: {
    chunkCount: number;
    inputValueCount: number;
    acceptedChunkCount: number;
    rejectedChunkCount: number;
  };
  vocabMapPath: string | null;
  sourceAuditPath: string | null;
};

type SourceAuditArtifact = {
  artifactKind: string;
  schemaVersion: number;
  generatedAt: string;
  keyId: string;
  linkedEvidence?: {
    checkedExampleCount?: number;
    artifactFoundCount?: number;
    fieldSupportVerifiedCount?: number;
    evidencePointerQuoteCount?: number;
    pageMarkdownFoundCount?: number;
    pageTextMatchCount?: number;
    sampleFailures?: unknown[];
  };
  externalMtaSourceScan?: {
    scannedDocumentCount?: number;
    documentWithMatchCount?: number;
    matchedAliasCount?: number;
  };
};

type CleanupAction =
  | "redirect_duplicate_canonical"
  | "exact_canonical_match_remap"
  | "coarse_rollup_added"
  | "modifiers_extracted";

type ExtractedModifiers = {
  routeIds: string[];
  directions: string[];
  periods: string[];
  geographies: string[];
  modes: string[];
};

type AdditiveNormalization = {
  rawValue: string;
  normalizedRawValue: string;
  rawLeafValue: string;
  originalDecision: EnrichedAlias["decision"];
  originalCanonicalId: string | null;
  canonicalLeafId: string | null;
  canonicalLeafLabel: string | null;
  canonicalLeafSource: "model" | "deterministic_exact_match" | null;
  coarseFamily: string;
  measurementDimension: string | null;
  metricFamily: string | null;
  countedEntityFamily: string | null;
  modifiers: ExtractedModifiers;
  evidenceProvenance: {
    inputCount: number;
    sourceFieldCounts: SourceFieldCounts;
    surfaceKindCounts: SourceFieldCounts;
    examples: Array<Record<string, unknown>>;
  };
};

type CleanedAlias = EnrichedAlias & {
  originalDecision: EnrichedAlias["decision"];
  originalCanonicalId: string | null;
  cleanupActions: CleanupAction[];
  normalization: AdditiveNormalization;
};

type CleanedVocabMap = Omit<
  VocabMapArtifact,
  "artifactKind" | "schemaVersion" | "summary" | "aliases"
> & {
  artifactKind: typeof CLEANED_MAP_KIND;
  schemaVersion: 1;
  sourceVocabMapPath: string;
  sourceAuditPath: string | null;
  originalSummary: VocabMapArtifact["summary"];
  summary: VocabMapArtifact["summary"] & {
    duplicateCanonicalMergeCount: number;
    exactAliasRemapCount: number;
    modifierAnnotatedAliasCount: number;
    coarseRollupAliasCount: number;
  };
  cleanup: {
    duplicateCanonicalMerges: Array<{
      duplicateCanonicalId: string;
      canonicalId: string;
      reason: string;
    }>;
    exactAliasRemaps: Array<{
      rawValue: string;
      fromDecision: EnrichedAlias["decision"];
      fromCanonicalId: string | null;
      toCanonicalId: string;
      reason: string;
    }>;
    skippedAmbiguousExactMatches: Array<{
      rawValue: string;
      candidateCanonicalIds: string[];
    }>;
  };
  canonicalValues: CanonicalValue[];
  aliases: CleanedAlias[];
};

export type BuildTier2VocabMapPackArgs = {
  runRoot: string;
  outputRoot?: string;
  generatedAt?: string;
  includeSmoke?: boolean;
};

type MapPackManifest = {
  artifactKind: typeof MAP_PACK_MANIFEST_KIND;
  schemaVersion: 1;
  generatedAt: string;
  sourceRunRoot: string;
  outputRoot: string;
  includeSmoke: boolean;
  mapCount: number;
  summaryPath: string;
  projectionPath: string;
  cleanedMaps: Array<{
    label: string;
    keyId: string;
    sourceRunPath: string;
    sourceVocabMapPath: string;
    sourceVocabMapSha256: string;
    sourceAuditPath: string | null;
    sourceAuditSha256: string | null;
    cleanedVocabMapPath: string;
    cleanedVocabMapSha256: string;
    harness: VocabRunArtifact["harness"];
    provider: VocabRunArtifact["provider"];
    model: string | null;
    temperature: number | null;
    chunks: number;
    acceptedChunks: number;
    rejectedChunks: number;
    originalSummary: VocabMapArtifact["summary"];
    cleanedSummary: CleanedVocabMap["summary"];
    sourceAuditSummary: {
      checkedExampleCount: number;
      artifactFoundCount: number;
      fieldSupportVerifiedCount: number;
      pageMarkdownFoundCount: number;
      pageTextMatchCount: number;
      sampleFailureCount: number;
      externalMatchedAliasCount: number;
    } | null;
  }>;
  totals: {
    aliases: number;
    canonicalValues: number;
    mapped: number;
    preserveRaw: number;
    unresolved: number;
    duplicateCanonicalMerges: number;
    exactAliasRemaps: number;
    modifierAnnotatedAliases: number;
    coarseRollupAliases: number;
    sourceSampleFailures: number;
  };
};

type ProjectionArtifact = {
  artifactKind: typeof MAP_PACK_PROJECTION_KIND;
  schemaVersion: 1;
  generatedAt: string;
  sourceManifestPath: string;
  rowCount: number;
  rows: Array<{
    keyId: string;
    targetPayloadPath: string;
    rawValue: string;
    decision: EnrichedAlias["decision"];
    originalDecision: EnrichedAlias["decision"];
    canonicalLeafId: string | null;
    canonicalLeafLabel: string | null;
    coarseFamily: string;
    modifiers: ExtractedModifiers;
    evidenceProvenance: AdditiveNormalization["evidenceProvenance"];
  }>;
};

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function compactKey(value: string): string {
  const symbolAliases: Record<string, string> = {
    "%": "percent",
    $: "usd",
    "#": "number",
  };
  const trimmed = value.trim();
  if (symbolAliases[trimmed] !== undefined) return symbolAliases[trimmed];
  return trimmed
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/[/_-]+/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function pluralFoldedKey(value: string): string {
  const key = compactKey(value);
  return key.endsWith("s") && key.length > 4 ? key.slice(0, -1) : key;
}

function duplicateKey(canonical: CanonicalValue): string {
  return [
    compactKey(canonical.label),
    canonical.measurementDimension,
    canonical.metricFamily,
    canonical.countedEntityFamily ?? "",
  ].join("|");
}

function hasNoiseOrAmbiguity(alias: EnrichedAlias): boolean {
  const haystack = `${alias.rationale} ${(alias.reviewFlags ?? []).join(" ")}`.toLowerCase();
  return [
    "extraction_noise",
    "likely_extraction_noise",
    "not_entity_type",
    "not_an_event",
    "ambiguous",
    "placeholder",
    "represents_absence",
  ].some((needle) => haystack.includes(needle));
}

function mergeCanonicalValues(winner: CanonicalValue, duplicate: CanonicalValue): CanonicalValue {
  const countedEntityFamily = winner.countedEntityFamily ?? duplicate.countedEntityFamily;
  const coarseGroup = winner.coarseGroup ?? duplicate.coarseGroup;
  const merged: CanonicalValue = {
    ...winner,
    description:
      winner.description.length >= duplicate.description.length
        ? winner.description
        : duplicate.description,
    semanticTags: uniqueSorted([...winner.semanticTags, ...duplicate.semanticTags]),
    downstreamUses: uniqueSorted([...winner.downstreamUses, ...duplicate.downstreamUses]),
    positiveExamples: uniqueSorted([...winner.positiveExamples, ...duplicate.positiveExamples]),
    negativeExamples: uniqueSorted([...winner.negativeExamples, ...duplicate.negativeExamples]),
  };
  if (countedEntityFamily !== undefined) merged.countedEntityFamily = countedEntityFamily;
  if (coarseGroup !== undefined) merged.coarseGroup = coarseGroup;
  return merged;
}

function chooseCanonicalWinner(
  group: readonly CanonicalValue[],
  aliases: readonly EnrichedAlias[],
): CanonicalValue {
  const fallback = group[0];
  if (fallback === undefined) {
    throw new Error("Cannot choose a canonical winner from an empty group.");
  }
  const aliasCounts = new Map<string, number>();
  for (const alias of aliases) {
    if (alias.canonicalId !== undefined)
      aliasCounts.set(alias.canonicalId, (aliasCounts.get(alias.canonicalId) ?? 0) + 1);
  }
  return (
    [...group].sort(
      (left, right) =>
        (aliasCounts.get(right.canonicalId) ?? 0) - (aliasCounts.get(left.canonicalId) ?? 0) ||
        right.positiveExamples.length - left.positiveExamples.length ||
        left.canonicalId.length - right.canonicalId.length ||
        left.canonicalId.localeCompare(right.canonicalId),
    )[0] ?? fallback
  );
}

function buildDuplicateRedirects(map: VocabMapArtifact): {
  canonicalValues: CanonicalValue[];
  redirects: Map<string, string>;
  merges: CleanedVocabMap["cleanup"]["duplicateCanonicalMerges"];
} {
  const byKey = new Map<string, CanonicalValue[]>();
  for (const canonical of map.canonicalValues) {
    const key = duplicateKey(canonical);
    byKey.set(key, [...(byKey.get(key) ?? []), canonical]);
  }

  const redirects = new Map<string, string>();
  const merges: CleanedVocabMap["cleanup"]["duplicateCanonicalMerges"] = [];
  const canonicalById = new Map<string, CanonicalValue>();

  for (const group of byKey.values()) {
    if (group.length === 1) {
      const only = group[0];
      if (only !== undefined) canonicalById.set(only.canonicalId, only);
      continue;
    }
    const winner = chooseCanonicalWinner(group, map.aliases);
    let merged = winner;
    for (const duplicate of group) {
      if (duplicate.canonicalId === winner.canonicalId) continue;
      redirects.set(duplicate.canonicalId, winner.canonicalId);
      merges.push({
        duplicateCanonicalId: duplicate.canonicalId,
        canonicalId: winner.canonicalId,
        reason:
          "same normalized label, measurement dimension, metric family, and counted entity family",
      });
      merged = mergeCanonicalValues(merged, duplicate);
    }
    canonicalById.set(winner.canonicalId, merged);
  }

  return {
    canonicalValues: [...canonicalById.values()].sort((left, right) =>
      left.canonicalId.localeCompare(right.canonicalId),
    ),
    redirects,
    merges,
  };
}

function buildExactCanonicalIndex(
  canonicalValues: readonly CanonicalValue[],
): Map<string, string[]> {
  const byKey = new Map<string, Set<string>>();
  for (const canonical of canonicalValues) {
    const terms = [canonical.canonicalId, canonical.label, ...canonical.positiveExamples];
    for (const term of terms) {
      for (const key of [compactKey(term), pluralFoldedKey(term)]) {
        if (key.length === 0) continue;
        const ids = byKey.get(key) ?? new Set<string>();
        ids.add(canonical.canonicalId);
        byKey.set(key, ids);
      }
    }
  }
  return new Map(
    [...byKey.entries()].map(([key, ids]) => [
      key,
      [...ids].sort((left, right) => left.localeCompare(right)),
    ]),
  );
}

function extractModifiers(value: string): ExtractedModifiers {
  const routeIds = uniqueSorted(
    [
      ...value.matchAll(
        /\b(?:SIM\d{1,2}[A-Z]?|BX\d{1,2}[A-Z]?|B\d{1,3}[A-Z]?|M\d{1,3}[A-Z]?|Q\d{1,3}[A-Z]?|S\d{1,3}[A-Z]?)\b/gi,
      ),
    ]
      .map((match) => match[0].toUpperCase())
      .filter((route) => !["BRT", "SBS", "MTA", "DOT"].includes(route)),
  );

  const directionTerms: Array<[RegExp, string]> = [
    [/\bnorthbound\b|\bNB\b/gi, "northbound"],
    [/\bsouthbound\b|\bSB\b/gi, "southbound"],
    [/\beastbound\b|\bEB\b/gi, "eastbound"],
    [/\bwestbound\b|\bWB\b/gi, "westbound"],
  ];
  const directions = uniqueSorted(
    directionTerms.flatMap(([pattern, label]) => (pattern.test(value) ? [label] : [])),
  );

  const periodTerms: Array<[RegExp, string]> = [
    [/\bam peak\b|\bAM\b/gi, "am_peak"],
    [/\bpm peak\b|\bPM\b/gi, "pm_peak"],
    [/\bpeak period\b|\bpeak\b/gi, "peak"],
    [/\bweekday\b|\bweekdays\b/gi, "weekday"],
    [/\bweekend\b|\bweekends\b/gi, "weekend"],
    [/\bdaily\b|\bper day\b/gi, "daily"],
    [/\bannual\b|\byearly\b|\byear-over-year\b/gi, "annual_or_yearly"],
    [/\bmonthly\b|\bmonth\b/gi, "monthly"],
    [/\bmidday\b/gi, "midday"],
    [/\bevening\b/gi, "evening"],
    [/\bovernight\b|\b12-6am\b/gi, "overnight"],
    [/\b\d{1,2}\s*-\s*\d{1,2}\s*(?:am|pm)\b/gi, "clock_range"],
  ];
  const periods = uniqueSorted(
    periodTerms.flatMap(([pattern, label]) => (pattern.test(value) ? [label] : [])),
  );

  const geographies = uniqueSorted(
    [
      ...value.matchAll(
        /\b[A-Z][A-Za-z0-9'.&/-]*(?:\s+[A-Z][A-Za-z0-9'.&/-]*){0,5}\s+(?:Avenue|Ave|Av|Street|St|Road|Rd|Boulevard|Blvd|Bridge|Corridor|Branch|Parkway|Expressway|Plaza|Station|Mall|Highway|River)\b/g,
      ),
    ].map((match) => match[0].replace(/\s+/g, " ").trim()),
  );

  const lower = value.toLowerCase();
  const modes = uniqueSorted([
    lower.includes("sbs") ? "select_bus_service" : "",
    lower.includes("brt") ? "brt" : "",
    lower.includes("bus") ? "bus" : "",
    lower.includes("rail") || lower.includes("train") ? "rail" : "",
    lower.includes("subway") ? "subway" : "",
    lower.includes("pedestrian") || lower.includes("sidewalk") ? "pedestrian" : "",
    lower.includes("bike") || lower.includes("bicycle") || lower.includes("bicyclist")
      ? "bicycle"
      : "",
    lower.includes("traffic") || lower.includes("vehicle") || lower.includes("car")
      ? "traffic"
      : "",
    lower.includes("parking") || lower.includes("curb") || lower.includes("loading")
      ? "curb_or_parking"
      : "",
  ]);

  return { routeIds, directions, periods, geographies, modes };
}

function stripModifiers(rawValue: string, modifiers: ExtractedModifiers): string {
  let value = rawValue;
  for (const routeId of modifiers.routeIds)
    value = value.replace(new RegExp(`\\b${routeId}\\b`, "gi"), " ");
  for (const geography of modifiers.geographies) value = value.replace(geography, " ");
  value = value
    .replace(
      /\bnorthbound\b|\bsouthbound\b|\beastbound\b|\bwestbound\b|\bNB\b|\bSB\b|\bEB\b|\bWB\b/gi,
      " ",
    )
    .replace(
      /\bam peak\b|\bpm peak\b|\bpeak period\b|\bweekday\b|\bweekend\b|\bdaily\b|\bannual\b|\bmonthly\b/gi,
      " ",
    )
    .replace(/\(\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return value.length === 0 ? rawValue : value;
}

function inferMetricCoarseFamily(text: string, canonical?: CanonicalValue): string {
  const metricFamily = canonical?.metricFamily;
  if (metricFamily !== undefined && metricFamily !== "other" && metricFamily !== "unknown")
    return metricFamily;
  const lower = text.toLowerCase();
  if (/ridership|rider|passenger|boarding|alighting|ons|offs|trip[s]?\b/.test(lower))
    return "ridership";
  if (/speed|mph|travel time|running time|delay|dwell|wait|headway|bunch/.test(lower))
    return "travel_time_speed";
  if (/crash|injur|fatal|collision|safety|ksi/.test(lower)) return "safety";
  if (/width|length|mile|feet|lane|roadway|corridor|street|stop spacing|cross-section/.test(lower))
    return "street_geometry";
  if (/traffic|parking|curb|loading|turn|vehicle volume|double park/.test(lower))
    return "traffic_parking";
  if (
    /population|resident|household|income|jobs|employment|walk score|transit score|equity/.test(
      lower,
    )
  )
    return "demographics_equity";
  if (/comment|survey|respondent|feedback|meeting|stakeholder|mentioned|outreach/.test(lower))
    return "community_feedback";
  if (/cost|funding|budget|dollar|\$/.test(lower)) return "cost_funding";
  if (/service|frequency|schedule|span/.test(lower)) return "service_frequency";
  if (/score|rank|rating|screening/.test(lower)) return "generic_score";
  return metricFamily ?? "other";
}

function inferTreatmentCoarseFamily(text: string): string {
  const lower = text.toLowerCase();
  if (/queue jump|signal priority|tsp|signal timing|transit signal/.test(lower))
    return "signal_priority";
  if (/bus lane|busway|transit lane|lane enforcement|camera/.test(lower)) return "bus_lane";
  if (/fare machine|off-?board fare|fare collection/.test(lower)) return "fare_collection";
  if (/bus bulb|bus stop|station|shelter|real.?time|passenger information|amenit/.test(lower))
    return "stop_station_amenity";
  if (/curb|loading|parking|meter|delivery zone|deliveries|truck loading/.test(lower))
    return "curb_parking_loading";
  if (/pedestrian|sidewalk|island|crosswalk|safety/.test(lower)) return "pedestrian_safety";
  if (/service|headway|frequency|route|sbs|select bus service|launch/.test(lower))
    return "service_planning";
  if (/outreach|meeting|workshop|presentation|feedback|engagement/.test(lower))
    return "outreach_engagement";
  if (/construction|capital|design|implementation|engineering|planning/.test(lower))
    return "capital_delivery";
  if (/rail|train|branch|lirr|freight/.test(lower)) return "rail_non_bus";
  if (/bus priority|brt|transit improvement/.test(lower)) return "bus_priority_program";
  return "other_treatment";
}

function inferEventCoarseFamily(text: string): string {
  const lower = text.toLowerCase();
  if (
    /meeting|workshop|open house|outreach|engagement|presentation|committee|stakeholder/.test(lower)
  )
    return "public_engagement";
  if (/design|planning|study|analysis|proposal|draft/.test(lower)) return "planning_design";
  if (/implementation|construction|install|launch/.test(lower)) return "implementation_delivery";
  if (/rail|train|branch|station/.test(lower)) return "rail_non_bus";
  return "other_event";
}

function inferEntityCoarseFamily(text: string): string {
  const lower = text.toLowerCase();
  if (/route|bus|sbs|service|transit/.test(lower)) return "transit_service";
  if (/street|corridor|avenue|road|bridge|intersection|station|stop|geography/.test(lower))
    return "place_or_facility";
  if (/agency|mta|dot|city|community board|committee/.test(lower)) return "organization";
  if (/resident|rider|passenger|customer|business|worker|student/.test(lower))
    return "people_or_group";
  if (/map|legend|document|url|website/.test(lower)) return "document_artifact";
  return "other_entity";
}

function inferCoarseFamily(keyId: string, rawValue: string, canonical?: CanonicalValue): string {
  const text = `${rawValue} ${canonical?.canonicalId ?? ""} ${canonical?.label ?? ""} ${canonical?.description ?? ""} ${(canonical?.semanticTags ?? []).join(" ")}`;
  if (keyId === "eventTreatmentFamily")
    return canonical?.coarseGroup ?? inferTreatmentCoarseFamily(text);
  if (keyId === "eventSubtype" || keyId === "eventFamily")
    return canonical?.coarseGroup ?? inferEventCoarseFamily(text);
  if (keyId === "entityKind" || keyId === "entityRole")
    return canonical?.coarseGroup ?? inferEntityCoarseFamily(text);
  if (keyId === "metricFamily" || keyId === "metricSubjectFamily" || keyId === "metricUnit") {
    return canonical?.coarseGroup ?? inferMetricCoarseFamily(text, canonical);
  }
  return canonical?.coarseGroup ?? canonical?.metricFamily ?? "other";
}

function sourceAuditSummary(
  audit: SourceAuditArtifact | null,
): MapPackManifest["cleanedMaps"][number]["sourceAuditSummary"] {
  if (audit === null) return null;
  const linked = audit.linkedEvidence ?? {};
  const external = audit.externalMtaSourceScan ?? {};
  return {
    checkedExampleCount: linked.checkedExampleCount ?? 0,
    artifactFoundCount: linked.artifactFoundCount ?? 0,
    fieldSupportVerifiedCount: linked.fieldSupportVerifiedCount ?? 0,
    pageMarkdownFoundCount: linked.pageMarkdownFoundCount ?? 0,
    pageTextMatchCount: linked.pageTextMatchCount ?? 0,
    sampleFailureCount: linked.sampleFailures?.length ?? 0,
    externalMatchedAliasCount: external.matchedAliasCount ?? 0,
  };
}

function recomputeSummary(
  aliases: readonly CleanedAlias[],
  canonicalValues: readonly CanonicalValue[],
): VocabMapArtifact["summary"] {
  return {
    inputValueCount: aliases.length,
    canonicalValueCount: canonicalValues.length,
    aliasCount: aliases.length,
    mappedCount: aliases.filter((alias) => alias.decision === "mapped").length,
    unresolvedCount: aliases.filter((alias) => alias.decision === "unresolved").length,
    preserveRawCount: aliases.filter((alias) => alias.decision === "preserve_raw").length,
    instanceCoverageCount: aliases.reduce((sum, alias) => sum + alias.inputCount, 0),
  };
}

function buildCleanedMap(input: {
  generatedAt: string;
  sourceVocabMapPath: string;
  sourceAuditPath: string | null;
  map: VocabMapArtifact;
}): CleanedVocabMap {
  const deduped = buildDuplicateRedirects(input.map);
  const canonicalById = new Map(
    deduped.canonicalValues.map((canonical) => [canonical.canonicalId, canonical]),
  );
  const exactIndex = buildExactCanonicalIndex(deduped.canonicalValues);
  const exactAliasRemaps: CleanedVocabMap["cleanup"]["exactAliasRemaps"] = [];
  const skippedAmbiguousExactMatches: CleanedVocabMap["cleanup"]["skippedAmbiguousExactMatches"] =
    [];

  const aliases: CleanedAlias[] = input.map.aliases
    .map((alias) => {
      const cleanupActions: CleanupAction[] = [];
      const originalDecision = alias.decision;
      const originalCanonicalId = alias.canonicalId ?? null;
      let decision = alias.decision;
      let canonicalId = alias.canonicalId;
      let canonicalLeafSource: AdditiveNormalization["canonicalLeafSource"] =
        canonicalId === undefined ? null : "model";

      if (canonicalId !== undefined) {
        const redirectedCanonicalId = deduped.redirects.get(canonicalId);
        if (redirectedCanonicalId !== undefined) {
          canonicalId = redirectedCanonicalId;
          cleanupActions.push("redirect_duplicate_canonical");
        }
      }

      if (decision !== "mapped" && !hasNoiseOrAmbiguity(alias)) {
        const candidateIds =
          exactIndex.get(pluralFoldedKey(alias.rawValue)) ??
          exactIndex.get(compactKey(alias.rawValue));
        if (candidateIds !== undefined && candidateIds.length === 1) {
          const exactCandidateId = candidateIds[0];
          if (exactCandidateId !== undefined) {
            decision = "mapped";
            canonicalId = exactCandidateId;
            canonicalLeafSource = "deterministic_exact_match";
            cleanupActions.push("exact_canonical_match_remap");
            exactAliasRemaps.push({
              rawValue: alias.rawValue,
              fromDecision: alias.decision,
              fromCanonicalId: alias.canonicalId ?? null,
              toCanonicalId: exactCandidateId,
              reason:
                "raw value exactly matched a canonical id, canonical label, or positive example after deterministic normalization",
            });
          }
        } else if (candidateIds !== undefined && candidateIds.length > 1) {
          skippedAmbiguousExactMatches.push({
            rawValue: alias.rawValue,
            candidateCanonicalIds: candidateIds,
          });
        }
      }

      const canonical = canonicalId === undefined ? undefined : canonicalById.get(canonicalId);
      const modifiers = extractModifiers(alias.rawValue);
      const hasModifiers = Object.values(modifiers).some((values) => values.length > 0);
      if (hasModifiers) cleanupActions.push("modifiers_extracted");
      const coarseFamily = inferCoarseFamily(input.map.keyId, alias.rawValue, canonical);
      cleanupActions.push("coarse_rollup_added");

      const cleaned: CleanedAlias = {
        ...alias,
        decision,
        ...(canonicalId === undefined ? {} : { canonicalId }),
        originalDecision,
        originalCanonicalId,
        cleanupActions: uniqueSorted(cleanupActions) as CleanupAction[],
        normalization: {
          rawValue: alias.rawValue,
          normalizedRawValue: alias.normalizedRawValue,
          rawLeafValue: stripModifiers(alias.rawValue, modifiers),
          originalDecision,
          originalCanonicalId,
          canonicalLeafId: canonicalId ?? null,
          canonicalLeafLabel: canonical?.label ?? null,
          canonicalLeafSource,
          coarseFamily,
          measurementDimension: canonical?.measurementDimension ?? null,
          metricFamily: canonical?.metricFamily ?? null,
          countedEntityFamily: canonical?.countedEntityFamily ?? null,
          modifiers,
          evidenceProvenance: {
            inputCount: alias.inputCount,
            sourceFieldCounts: alias.sourceFieldCounts,
            surfaceKindCounts: alias.surfaceKindCounts,
            examples: alias.examples,
          },
        },
      };
      if (cleaned.decision !== "mapped") delete cleaned.canonicalId;
      return cleaned;
    })
    .sort(
      (left, right) =>
        right.inputCount - left.inputCount || left.rawValue.localeCompare(right.rawValue),
    );

  const usedCanonicalIds = new Set(
    aliases.flatMap((alias) => (alias.canonicalId === undefined ? [] : [alias.canonicalId])),
  );
  const canonicalValues = deduped.canonicalValues
    .filter((canonical) => usedCanonicalIds.has(canonical.canonicalId))
    .map((canonical) => ({
      ...canonical,
      coarseGroup:
        canonical.coarseGroup ?? inferCoarseFamily(input.map.keyId, canonical.label, canonical),
    }))
    .sort((left, right) => left.canonicalId.localeCompare(right.canonicalId));
  const summary = recomputeSummary(aliases, canonicalValues);
  const modifierAnnotatedAliasCount = aliases.filter((alias) =>
    Object.values(alias.normalization.modifiers).some((values) => values.length > 0),
  ).length;

  return {
    ...input.map,
    artifactKind: CLEANED_MAP_KIND,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    sourceVocabMapPath: input.sourceVocabMapPath,
    sourceAuditPath: input.sourceAuditPath,
    originalSummary: input.map.summary,
    summary: {
      ...summary,
      duplicateCanonicalMergeCount: deduped.merges.length,
      exactAliasRemapCount: exactAliasRemaps.length,
      modifierAnnotatedAliasCount,
      coarseRollupAliasCount: aliases.length,
    },
    cleanup: {
      duplicateCanonicalMerges: deduped.merges,
      exactAliasRemaps,
      skippedAmbiguousExactMatches,
    },
    canonicalValues,
    aliases,
  };
}

async function sha256File(path: string): Promise<string> {
  const buffer = await Bun.file(path).arrayBuffer();
  return createHash("sha256").update(Buffer.from(buffer)).digest("hex");
}

async function discoverRunDirs(runRoot: string, includeSmoke: boolean): Promise<string[]> {
  const entries = await readdir(runRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => includeSmoke || !name.startsWith("01-"))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => join(runRoot, name));
}

function renderSummaryMarkdown(input: { generatedAt: string; manifest: MapPackManifest }): string {
  const lines: string[] = [];
  lines.push("# Tier 2 Vocab Map Pack Cleanup");
  lines.push("");
  lines.push(`Generated: ${input.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Source run root: ${input.manifest.sourceRunRoot}`);
  lines.push(`- Cleaned maps: ${input.manifest.mapCount}`);
  lines.push(`- Aliases: ${input.manifest.totals.aliases}`);
  lines.push(`- Canonical values: ${input.manifest.totals.canonicalValues}`);
  lines.push(`- Mapped: ${input.manifest.totals.mapped}`);
  lines.push(`- Preserve raw: ${input.manifest.totals.preserveRaw}`);
  lines.push(`- Unresolved: ${input.manifest.totals.unresolved}`);
  lines.push(`- Duplicate canonical merges: ${input.manifest.totals.duplicateCanonicalMerges}`);
  lines.push(`- Exact alias remaps: ${input.manifest.totals.exactAliasRemaps}`);
  lines.push(`- Modifier-annotated aliases: ${input.manifest.totals.modifierAnnotatedAliases}`);
  lines.push(`- Source-audit sample failures: ${input.manifest.totals.sourceSampleFailures}`);
  lines.push("");
  lines.push("## Per Map");
  lines.push("");
  lines.push(
    "| Key | Model | Aliases | Canonical | Mapped | Preserve raw | Unresolved | Dedupe | Remaps | Modifiers |",
  );
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const map of input.manifest.cleanedMaps) {
    lines.push(
      [
        `| ${map.keyId}`,
        map.model ?? "unknown",
        String(map.cleanedSummary.aliasCount),
        String(map.cleanedSummary.canonicalValueCount),
        String(map.cleanedSummary.mappedCount),
        String(map.cleanedSummary.preserveRawCount),
        String(map.cleanedSummary.unresolvedCount),
        String(map.cleanedSummary.duplicateCanonicalMergeCount),
        String(map.cleanedSummary.exactAliasRemapCount),
        `${map.cleanedSummary.modifierAnnotatedAliasCount} |`,
      ].join(" | "),
    );
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push(
    "- The source model maps are preserved unchanged; cleaned maps are additive reconciliation artifacts.",
  );
  lines.push(
    "- `normalization.evidenceProvenance` keeps input counts, source field counts, surface kinds, and examples.",
  );
  lines.push(
    "- `canonicalLeafId` is only populated for mapped aliases; raw values remain available for every alias.",
  );
  return `${lines.join("\n")}\n`;
}

export async function buildTier2VocabMapPack(
  args: BuildTier2VocabMapPackArgs,
): Promise<MapPackManifest> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const runRoot = fromCliPath(args.runRoot);
  const outputRoot = fromCliPath(args.outputRoot ?? join(runRoot, "vocab-map-pack-cleaned"));
  const mapsOutputRoot = join(outputRoot, "maps");
  await mkdir(mapsOutputRoot, { recursive: true });

  const cleanedMaps: MapPackManifest["cleanedMaps"] = [];
  const projectionRows: ProjectionArtifact["rows"] = [];
  for (const runDir of await discoverRunDirs(runRoot, args.includeSmoke === true)) {
    const runPath = join(runDir, "vocab-synthesis-run.json");
    const run = await readJsonIfExists<VocabRunArtifact>(runPath);
    if (run?.vocabMapPath === null || run?.vocabMapPath === undefined) continue;
    const map = (await Bun.file(run.vocabMapPath).json()) as VocabMapArtifact;
    const audit =
      run.sourceAuditPath === null
        ? null
        : await readJsonIfExists<SourceAuditArtifact>(run.sourceAuditPath);
    const cleaned = buildCleanedMap({
      generatedAt,
      sourceVocabMapPath: run.vocabMapPath,
      sourceAuditPath: run.sourceAuditPath,
      map,
    });
    const cleanedPath = join(mapsOutputRoot, `vocab-map-${map.keyId}.cleaned.json`);
    await writeJson(cleanedPath, cleaned);
    projectionRows.push(
      ...cleaned.aliases.map((alias) => ({
        keyId: cleaned.keyId,
        targetPayloadPath: cleaned.targetPayloadPath,
        rawValue: alias.rawValue,
        decision: alias.decision,
        originalDecision: alias.originalDecision,
        canonicalLeafId: alias.normalization.canonicalLeafId,
        canonicalLeafLabel: alias.normalization.canonicalLeafLabel,
        coarseFamily: alias.normalization.coarseFamily,
        modifiers: alias.normalization.modifiers,
        evidenceProvenance: alias.normalization.evidenceProvenance,
      })),
    );
    const auditSummary = sourceAuditSummary(audit);
    cleanedMaps.push({
      label: basename(runDir),
      keyId: map.keyId,
      sourceRunPath: runPath,
      sourceVocabMapPath: run.vocabMapPath,
      sourceVocabMapSha256: await sha256File(run.vocabMapPath),
      sourceAuditPath: run.sourceAuditPath,
      sourceAuditSha256:
        run.sourceAuditPath === null ? null : await sha256File(run.sourceAuditPath),
      cleanedVocabMapPath: cleanedPath,
      cleanedVocabMapSha256: await sha256File(cleanedPath),
      harness: run.harness,
      provider: run.provider,
      model: run.model,
      temperature: run.temperature,
      chunks: run.summary.chunkCount,
      acceptedChunks: run.summary.acceptedChunkCount,
      rejectedChunks: run.summary.rejectedChunkCount,
      originalSummary: map.summary,
      cleanedSummary: cleaned.summary,
      sourceAuditSummary: auditSummary,
    });
  }

  const summaryPath = join(outputRoot, "vocab-map-pack-summary.md");
  const projectionPath = join(outputRoot, "vocab-normalization-projection.json");
  const manifestPath = join(outputRoot, "vocab-map-pack-manifest.json");
  const totals = cleanedMaps.reduce<MapPackManifest["totals"]>(
    (acc, map) => ({
      aliases: acc.aliases + map.cleanedSummary.aliasCount,
      canonicalValues: acc.canonicalValues + map.cleanedSummary.canonicalValueCount,
      mapped: acc.mapped + map.cleanedSummary.mappedCount,
      preserveRaw: acc.preserveRaw + map.cleanedSummary.preserveRawCount,
      unresolved: acc.unresolved + map.cleanedSummary.unresolvedCount,
      duplicateCanonicalMerges:
        acc.duplicateCanonicalMerges + map.cleanedSummary.duplicateCanonicalMergeCount,
      exactAliasRemaps: acc.exactAliasRemaps + map.cleanedSummary.exactAliasRemapCount,
      modifierAnnotatedAliases:
        acc.modifierAnnotatedAliases + map.cleanedSummary.modifierAnnotatedAliasCount,
      coarseRollupAliases: acc.coarseRollupAliases + map.cleanedSummary.coarseRollupAliasCount,
      sourceSampleFailures:
        acc.sourceSampleFailures + (map.sourceAuditSummary?.sampleFailureCount ?? 0),
    }),
    {
      aliases: 0,
      canonicalValues: 0,
      mapped: 0,
      preserveRaw: 0,
      unresolved: 0,
      duplicateCanonicalMerges: 0,
      exactAliasRemaps: 0,
      modifierAnnotatedAliases: 0,
      coarseRollupAliases: 0,
      sourceSampleFailures: 0,
    },
  );
  const manifest: MapPackManifest = {
    artifactKind: MAP_PACK_MANIFEST_KIND,
    schemaVersion: 1,
    generatedAt,
    sourceRunRoot: runRoot,
    outputRoot,
    includeSmoke: args.includeSmoke === true,
    mapCount: cleanedMaps.length,
    summaryPath,
    projectionPath,
    cleanedMaps,
    totals,
  };
  const projection: ProjectionArtifact = {
    artifactKind: MAP_PACK_PROJECTION_KIND,
    schemaVersion: 1,
    generatedAt,
    sourceManifestPath: manifestPath,
    rowCount: projectionRows.length,
    rows: projectionRows.sort(
      (left, right) =>
        left.keyId.localeCompare(right.keyId) ||
        right.evidenceProvenance.inputCount - left.evidenceProvenance.inputCount ||
        left.rawValue.localeCompare(right.rawValue),
    ),
  };
  await writeJson(projectionPath, projection);
  await writeJson(manifestPath, manifest);
  await Bun.write(summaryPath, renderSummaryMarkdown({ generatedAt, manifest }));
  await writeJson(join(outputRoot, "vocab-map-pack-summary.json"), {
    artifactKind: MAP_PACK_SUMMARY_KIND,
    schemaVersion: 1,
    generatedAt,
    manifestPath,
    totals,
    maps: cleanedMaps.map((map) => ({
      keyId: map.keyId,
      model: map.model,
      originalSummary: map.originalSummary,
      cleanedSummary: map.cleanedSummary,
      cleanedVocabMapPath: map.cleanedVocabMapPath,
    })),
  });
  return manifest;
}

type CliArgs = {
  runRoot?: string;
  outputRoot?: string;
  generatedAt?: string;
  includeSmoke?: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--run-root") {
      if (value === undefined) throw new Error("--run-root requires a value.");
      args.runRoot = value;
      index += 1;
    } else if (arg === "--output-root") {
      if (value === undefined) throw new Error("--output-root requires a value.");
      args.outputRoot = value;
      index += 1;
    } else if (arg === "--generated-at") {
      if (value === undefined) throw new Error("--generated-at requires a value.");
      args.generatedAt = value;
      index += 1;
    } else if (arg === "--include-smoke") {
      args.includeSmoke = true;
    } else {
      throw new Error(`Unknown docs tier2 vocab-map-pack option: ${arg}`);
    }
  }
  return args;
}

export async function runTier2VocabMapPackFromCli(argv: string[]) {
  const args = parseArgs(argv);
  if (args.runRoot === undefined) {
    throw new Error("Provide --run-root with a completed vocab synthesis queue root.");
  }
  const manifest = await buildTier2VocabMapPack({
    runRoot: args.runRoot,
    ...(args.outputRoot === undefined ? {} : { outputRoot: args.outputRoot }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
    ...(args.includeSmoke === undefined ? {} : { includeSmoke: args.includeSmoke }),
  });
  console.log(
    `tier2-vocab-map-pack: maps=${manifest.mapCount} aliases=${manifest.totals.aliases} remaps=${manifest.totals.exactAliasRemaps} dedupe=${manifest.totals.duplicateCanonicalMerges}`,
  );
  return {
    artifactKind: manifest.artifactKind,
    schemaVersion: manifest.schemaVersion,
    generatedAt: manifest.generatedAt,
    outputRoot: manifest.outputRoot,
    mapCount: manifest.mapCount,
    totals: manifest.totals,
    summaryPath: manifest.summaryPath,
    projectionPath: manifest.projectionPath,
  };
}
