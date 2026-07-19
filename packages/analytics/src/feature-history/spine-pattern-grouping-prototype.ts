import {
  classifyRouteSpeedSpineArtifact,
  type RouteSpeedSpineArtifact,
  type RouteSpeedSpineReadinessAudit,
  type RouteSpeedSpineSegment,
} from "./route-speed-spine.js";

export type SpinePatternGroupingMonthAudit = {
  month: string;
  beforeCoverageShare: number;
  afterCoverageShare: number;
  observedSegmentCount: number;
  expectedSegmentCount: number;
  profileId: string | null;
};

export type ExactAliasGroup = {
  canonicalSegmentId: string;
  segmentIds: [string, string];
  endpointSignatures: string[];
};

export type RecurringPatternProfile = {
  profileId: string;
  segmentIds: string[];
  months: string[];
};

export type ExactAliasCanonicalizationResult = {
  strategy: "exact_alias_set_canonicalization";
  before: RouteSpeedSpineReadinessAudit;
  after: RouteSpeedSpineReadinessAudit;
  monthCoverage: SpinePatternGroupingMonthAudit[];
  acceptedAliasGroups: ExactAliasGroup[];
  rejectedAmbiguousSegmentIds: string[];
  rejectedConcurrentPairs: Array<[string, string]>;
};

export type RecurringPatternProfileResult = {
  strategy: "recurring_exact_pattern_profiles";
  before: RouteSpeedSpineReadinessAudit;
  after: RouteSpeedSpineReadinessAudit;
  monthCoverage: SpinePatternGroupingMonthAudit[];
  profiles: RecurringPatternProfile[];
  profiledMonthCount: number;
  unprofiledMonthCount: number;
  rejectedReason:
    | "fewer_than_two_recurring_profiles"
    | "recurring_profiles_do_not_cover_union"
    | null;
};

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].toSorted((left, right) => left.localeCompare(right));
}

function segmentIdsByMonth(artifact: RouteSpeedSpineArtifact): Map<string, string[]> {
  const result = new Map(artifact.monthCoverage.map((row) => [row.month, [] as string[]]));
  for (const segment of artifact.segments) {
    for (const month of segment.months) {
      result.get(month)?.push(segment.segmentId);
    }
  }
  for (const [month, segmentIds] of result) {
    result.set(month, sortedUnique(segmentIds));
  }
  return result;
}

function reclassifyWithMonthCoverage(input: {
  artifact: RouteSpeedSpineArtifact;
  expectedSegmentCount: number;
  monthCoverage: SpinePatternGroupingMonthAudit[];
}): RouteSpeedSpineReadinessAudit {
  const coverageByMonth = new Map(input.monthCoverage.map((row) => [row.month, row]));
  const monthCoverage = input.artifact.monthCoverage.map((row) => {
    const prototype = coverageByMonth.get(row.month);
    if (prototype === undefined) {
      throw new Error(`Prototype coverage is missing month ${row.month}.`);
    }
    return {
      ...row,
      spineSegmentCount: prototype.observedSegmentCount,
      coverageShare: prototype.afterCoverageShare,
    };
  });
  const partialCoverageMonthCount = monthCoverage.filter((row) => row.coverageShare < 1).length;
  return classifyRouteSpeedSpineArtifact({
    ...input.artifact,
    summary: {
      ...input.artifact.summary,
      spineSegmentCount: input.expectedSegmentCount,
      monthsWithPartialSpineCoverageCount: partialCoverageMonthCount,
    },
    monthCoverage,
  });
}

function endpointSignatures(segment: RouteSpeedSpineSegment): string[] {
  return sortedUnique(
    (segment.raw.sourceKeys ?? [])
      .filter((sourceKey) => sourceKey.status === "keyed")
      .map(({ key }) => JSON.stringify([key.direction, key.fromStopId, key.toStopId])),
  );
}

function pairKey(left: string, right: string): string {
  return JSON.stringify([left, right].toSorted((a, b) => a.localeCompare(b)));
}

function parsePairKey(value: string): [string, string] {
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== "string" ||
    typeof parsed[1] !== "string"
  ) {
    throw new Error(`Invalid prototype segment pair: ${value}`);
  }
  return [parsed[0], parsed[1]];
}

function setsAreDisjoint(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  for (const value of left) {
    if (right.has(value)) return false;
  }
  return true;
}

/**
 * Prototype A. Two existing spine segments may share one canonical identity
 * only when an exact direction/from-stop/to-stop signature proves the alias,
 * their observed months are disjoint, and the match is one-to-one. No
 * similarity, order, or proximity fallback is permitted.
 */
export function prototypeExactAliasCanonicalization(
  artifact: RouteSpeedSpineArtifact,
): ExactAliasCanonicalizationResult {
  const before = classifyRouteSpeedSpineArtifact(artifact);
  const segmentsById = new Map(artifact.segments.map((segment) => [segment.segmentId, segment]));
  const segmentIdsByEndpoint = new Map<string, string[]>();
  for (const segment of artifact.segments) {
    for (const signature of endpointSignatures(segment)) {
      const segmentIds = segmentIdsByEndpoint.get(signature) ?? [];
      segmentIds.push(segment.segmentId);
      segmentIdsByEndpoint.set(signature, segmentIds);
    }
  }

  const neighbors = new Map<string, Set<string>>();
  const signaturesByPair = new Map<string, Set<string>>();
  const concurrentPairs = new Set<string>();
  const globallyAmbiguousSegmentIds = new Set<string>();
  for (const [signature, values] of segmentIdsByEndpoint) {
    const segmentIds = sortedUnique(values);
    if (segmentIds.length > 2) {
      for (const segmentId of segmentIds) globallyAmbiguousSegmentIds.add(segmentId);
      continue;
    }
    for (let leftIndex = 0; leftIndex < segmentIds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < segmentIds.length; rightIndex += 1) {
        const leftId = segmentIds[leftIndex];
        const rightId = segmentIds[rightIndex];
        if (leftId === undefined || rightId === undefined) continue;
        const left = segmentsById.get(leftId);
        const right = segmentsById.get(rightId);
        if (left === undefined || right === undefined) continue;
        const key = pairKey(leftId, rightId);
        if (!setsAreDisjoint(new Set(left.months), new Set(right.months))) {
          concurrentPairs.add(key);
          globallyAmbiguousSegmentIds.add(leftId);
          globallyAmbiguousSegmentIds.add(rightId);
          continue;
        }
        const leftNeighbors = neighbors.get(leftId) ?? new Set<string>();
        const rightNeighbors = neighbors.get(rightId) ?? new Set<string>();
        leftNeighbors.add(rightId);
        rightNeighbors.add(leftId);
        neighbors.set(leftId, leftNeighbors);
        neighbors.set(rightId, rightNeighbors);
        const signatures = signaturesByPair.get(key) ?? new Set<string>();
        signatures.add(signature);
        signaturesByPair.set(key, signatures);
      }
    }
  }

  const acceptedPairKeys = new Set<string>();
  for (const [segmentId, segmentNeighbors] of neighbors) {
    if (segmentNeighbors.size !== 1 || globallyAmbiguousSegmentIds.has(segmentId)) continue;
    const neighborId = [...segmentNeighbors][0];
    if (
      neighborId === undefined ||
      neighbors.get(neighborId)?.size !== 1 ||
      globallyAmbiguousSegmentIds.has(neighborId)
    ) {
      continue;
    }
    acceptedPairKeys.add(pairKey(segmentId, neighborId));
  }

  const canonicalBySegmentId = new Map(
    artifact.segments.map((segment) => [segment.segmentId, segment.segmentId]),
  );
  const acceptedAliasGroups = [...acceptedPairKeys]
    .map((key) => {
      const segmentIds = parsePairKey(key);
      const canonicalSegmentId = segmentIds[0];
      canonicalBySegmentId.set(segmentIds[0], canonicalSegmentId);
      canonicalBySegmentId.set(segmentIds[1], canonicalSegmentId);
      return {
        canonicalSegmentId,
        segmentIds,
        endpointSignatures: sortedUnique(signaturesByPair.get(key) ?? []),
      } satisfies ExactAliasGroup;
    })
    .toSorted((left, right) => left.canonicalSegmentId.localeCompare(right.canonicalSegmentId));

  const canonicalSegmentIds = new Set(canonicalBySegmentId.values());
  const observedByMonth = segmentIdsByMonth(artifact);
  const beforeCoverageByMonth = new Map(
    artifact.monthCoverage.map((row) => [row.month, row.coverageShare]),
  );
  const monthCoverage = artifact.monthCoverage.map((row) => {
    const observedCanonicalIds = new Set(
      (observedByMonth.get(row.month) ?? []).map(
        (segmentId) => canonicalBySegmentId.get(segmentId) ?? segmentId,
      ),
    );
    return {
      month: row.month,
      beforeCoverageShare: beforeCoverageByMonth.get(row.month) ?? 0,
      afterCoverageShare:
        canonicalSegmentIds.size === 0
          ? 0
          : round(observedCanonicalIds.size / canonicalSegmentIds.size),
      observedSegmentCount: observedCanonicalIds.size,
      expectedSegmentCount: canonicalSegmentIds.size,
      profileId: null,
    } satisfies SpinePatternGroupingMonthAudit;
  });

  return {
    strategy: "exact_alias_set_canonicalization",
    before,
    after: reclassifyWithMonthCoverage({
      artifact,
      expectedSegmentCount: canonicalSegmentIds.size,
      monthCoverage,
    }),
    monthCoverage,
    acceptedAliasGroups,
    rejectedAmbiguousSegmentIds: sortedUnique([
      ...globallyAmbiguousSegmentIds,
      ...[...neighbors].filter(([, values]) => values.size > 1).map(([segmentId]) => segmentId),
    ]),
    rejectedConcurrentPairs: [...concurrentPairs]
      .map(parsePairKey)
      .toSorted((left, right) => pairKey(...left).localeCompare(pairKey(...right))),
  };
}

function patternKey(segmentIds: readonly string[]): string {
  return JSON.stringify(segmentIds);
}

/**
 * Prototype B. Repeated exact segment sets are treated as candidate service
 * profiles only when at least two distinct profiles recur and their union is
 * the full spine. Months that do not exactly match one of those profiles keep
 * the union-spine denominator. Segment identities are never merged.
 */
export function prototypeRecurringPatternProfiles(
  artifact: RouteSpeedSpineArtifact,
  options: { minRecurringMonths?: number } = {},
): RecurringPatternProfileResult {
  const minRecurringMonths = options.minRecurringMonths ?? 2;
  if (!Number.isInteger(minRecurringMonths) || minRecurringMonths < 2) {
    throw new Error("minRecurringMonths must be an integer greater than or equal to 2.");
  }
  const before = classifyRouteSpeedSpineArtifact(artifact);
  const observedByMonth = segmentIdsByMonth(artifact);
  const monthsByPattern = new Map<string, string[]>();
  for (const row of artifact.monthCoverage) {
    const key = patternKey(observedByMonth.get(row.month) ?? []);
    const months = monthsByPattern.get(key) ?? [];
    months.push(row.month);
    monthsByPattern.set(key, months);
  }

  const recurring = [...monthsByPattern]
    .filter(([, months]) => months.length >= minRecurringMonths)
    .map(([key, months], index) => ({
      profileId: `pattern-${String(index + 1).padStart(2, "0")}`,
      segmentIds: JSON.parse(key) as string[],
      months: months.toSorted((left, right) => left.localeCompare(right)),
    }))
    .toSorted((left, right) =>
      patternKey(left.segmentIds).localeCompare(patternKey(right.segmentIds)),
    )
    .map((profile, index) => ({
      ...profile,
      profileId: `pattern-${String(index + 1).padStart(2, "0")}`,
    }));
  const unionSegmentIds = sortedUnique(artifact.segments.map((segment) => segment.segmentId));
  const recurringUnion = new Set(recurring.flatMap((profile) => profile.segmentIds));
  const rejectedReason =
    recurring.length < 2
      ? "fewer_than_two_recurring_profiles"
      : recurringUnion.size !== unionSegmentIds.length ||
          unionSegmentIds.some((segmentId) => !recurringUnion.has(segmentId))
        ? "recurring_profiles_do_not_cover_union"
        : null;
  const profiles = rejectedReason === null ? recurring : [];
  const profileByPattern = new Map(
    profiles.map((profile) => [patternKey(profile.segmentIds), profile]),
  );
  const beforeCoverageByMonth = new Map(
    artifact.monthCoverage.map((row) => [row.month, row.coverageShare]),
  );
  const monthCoverage = artifact.monthCoverage.map((row) => {
    const observedSegmentIds = observedByMonth.get(row.month) ?? [];
    const profile = profileByPattern.get(patternKey(observedSegmentIds));
    const expectedSegmentCount = profile?.segmentIds.length ?? unionSegmentIds.length;
    return {
      month: row.month,
      beforeCoverageShare: beforeCoverageByMonth.get(row.month) ?? 0,
      afterCoverageShare:
        expectedSegmentCount === 0 ? 0 : round(observedSegmentIds.length / expectedSegmentCount),
      observedSegmentCount: observedSegmentIds.length,
      expectedSegmentCount,
      profileId: profile?.profileId ?? null,
    } satisfies SpinePatternGroupingMonthAudit;
  });

  return {
    strategy: "recurring_exact_pattern_profiles",
    before,
    after: reclassifyWithMonthCoverage({
      artifact,
      expectedSegmentCount: unionSegmentIds.length,
      monthCoverage,
    }),
    monthCoverage,
    profiles,
    profiledMonthCount: monthCoverage.filter((row) => row.profileId !== null).length,
    unprofiledMonthCount: monthCoverage.filter((row) => row.profileId === null).length,
    rejectedReason,
  };
}
