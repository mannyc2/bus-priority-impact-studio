import {
  type StudioRouteEvidenceBundleV2,
  type StudioRouteEvidenceIndexRouteV2,
  type StudioRouteEvidenceIndexV2,
  type StudioRouteIdentityPresentation,
  studioRouteEvidenceBundleKey,
} from "@bp/domain/studio";

export type ExactD1RouteEvidenceIdentity = {
  readonly slug: string;
  readonly presentation: StudioRouteIdentityPresentation;
};

type IndexClosureInput = {
  readonly kind: "index";
  readonly index: StudioRouteEvidenceIndexV2;
  readonly expectedRoutes: ReadonlyMap<string, ExactD1RouteEvidenceIdentity>;
};

type BundleClosureInput = {
  readonly kind: "bundle";
  readonly index: StudioRouteEvidenceIndexV2;
  readonly indexRow: StudioRouteEvidenceIndexRouteV2;
  readonly expectedRoute: ExactD1RouteEvidenceIdentity;
  readonly artifactKey: string;
  readonly bundle: StudioRouteEvidenceBundleV2;
  readonly byteLength: number;
  readonly sha256: string;
};

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertExactIndexRow(
  row: StudioRouteEvidenceIndexRouteV2,
  expected: ExactD1RouteEvidenceIdentity,
): void {
  const expectedKey = studioRouteEvidenceBundleKey(expected.slug);
  if (
    row.routeId !== expected.presentation.routeId ||
    row.routeSlug !== expected.slug ||
    row.artifactKey !== expectedKey ||
    !sameJson(row.routeIdentity, expected.presentation)
  ) {
    throw new Error(`Route evidence index identity mismatch for ${row.routeId}`);
  }
}

function assertIndexClosure(input: IndexClosureInput): void {
  const routeIds = new Set<string>();
  const routeSlugs = new Set<string>();
  const artifactKeys = new Set<string>();
  let matchedBusRouteCount = 0;
  let citationCount = 0;
  let totalByteLength = 0;

  for (const row of input.index.routes) {
    if (
      routeIds.has(row.routeId) ||
      routeSlugs.has(row.routeSlug) ||
      artifactKeys.has(row.artifactKey)
    ) {
      throw new Error("Route evidence index contains a duplicate exact identity or artifact key");
    }
    routeIds.add(row.routeId);
    routeSlugs.add(row.routeSlug);
    artifactKeys.add(row.artifactKey);
    const expected = input.expectedRoutes.get(row.routeId);
    if (expected === undefined) {
      throw new Error(`Route evidence index route ${row.routeId} is absent from D1`);
    }
    assertExactIndexRow(row, expected);
    if (row.wikiRouteRecordId !== null) matchedBusRouteCount += 1;
    citationCount += row.coverage.citationCount;
    totalByteLength += row.byteLength;
  }

  if (
    routeIds.size !== input.expectedRoutes.size ||
    [...input.expectedRoutes.keys()].some((routeId) => !routeIds.has(routeId))
  ) {
    throw new Error("Route evidence index does not cover the exact D1 route universe");
  }
  if (
    input.index.summary.routeCount !== input.index.routes.length ||
    input.index.summary.matchedBusRouteCount !== matchedBusRouteCount ||
    input.index.summary.citationCount !== citationCount ||
    input.index.summary.totalByteLength !== totalByteLength
  ) {
    throw new Error("Route evidence index summary does not reconcile with its exact rows");
  }
}

function assertBundleClosure(input: BundleClosureInput): void {
  const expected = input.expectedRoute;
  const routeId = expected.presentation.routeId;
  assertExactIndexRow(input.indexRow, expected);
  if (
    input.artifactKey !== input.indexRow.artifactKey ||
    input.byteLength !== input.indexRow.byteLength ||
    input.sha256 !== input.indexRow.sha256
  ) {
    throw new Error(`Route evidence bundle bytes do not match the exact index row for ${routeId}`);
  }
  if (
    input.bundle.routeId !== routeId ||
    input.bundle.routeSlug !== expected.slug ||
    input.bundle.wikiRouteRecordId !== input.indexRow.wikiRouteRecordId ||
    !sameJson(input.bundle.source, input.index.source) ||
    !sameJson(input.bundle.routeIdentity, expected.presentation) ||
    !sameJson(input.bundle.routeIdentity, input.indexRow.routeIdentity) ||
    !sameJson(input.bundle.coverage, input.indexRow.coverage)
  ) {
    throw new Error(`Route evidence bundle identity or presentation mismatch for ${routeId}`);
  }
  if (
    new Set(input.bundle.wikiRouteIds).size !== input.bundle.wikiRouteIds.length ||
    input.bundle.wikiRouteIds.some((candidate) => candidate !== routeId)
  ) {
    throw new Error(`Route evidence bundle contains crossed exact Wiki identities for ${routeId}`);
  }
  const expectedCoverage = {
    timelineCount: input.bundle.timeline.length,
    interventionCount: input.bundle.interventions.length,
    metricClaimCount: input.bundle.metricClaims.length,
    projectCount: input.bundle.projects.length,
    sourceGapCount: input.bundle.sourceGaps.length,
    citationCount: input.bundle.citations.length,
  };
  if (!sameJson(input.bundle.coverage, expectedCoverage)) {
    throw new Error(`Route evidence bundle coverage does not reconcile for ${routeId}`);
  }
  for (const binding of input.bundle.operationalBindings) {
    if (
      !binding.projectable ||
      binding.identityScope !== "exact_service" ||
      binding.sourceRouteId !== routeId ||
      binding.gtfsRouteId !== routeId ||
      binding.routeFamilyId !== expected.presentation.routeFamilyId
    ) {
      throw new Error(
        `Route evidence bundle contains a crossed operational binding for ${routeId}`,
      );
    }
  }
  const presentationPrimaries = input.bundle.operationalBindings.filter(
    (binding) => binding.presentationPrimary,
  );
  if (
    (input.bundle.wikiRouteRecordId === null && presentationPrimaries.length !== 0) ||
    (input.bundle.wikiRouteRecordId !== null &&
      (presentationPrimaries.length !== 1 ||
        presentationPrimaries[0]?.routeRecordId !== input.bundle.wikiRouteRecordId))
  ) {
    throw new Error(`Route evidence bundle primary Wiki binding does not reconcile for ${routeId}`);
  }
  for (const binding of input.bundle.contextualBindings) {
    if (binding.projectable || binding.presentationPrimary) {
      throw new Error(
        `Route evidence bundle contains an operational contextual binding for ${routeId}`,
      );
    }
    if (
      binding.identityScope === "exact_service" &&
      (binding.sourceRouteId !== routeId ||
        binding.gtfsRouteId !== routeId ||
        binding.routeFamilyId !== expected.presentation.routeFamilyId)
    ) {
      throw new Error(
        `Route evidence bundle contains a crossed exact contextual binding for ${routeId}`,
      );
    }
  }
}

export function assertStudioRouteEvidenceV2ServingClosure(
  input: IndexClosureInput | BundleClosureInput,
): void {
  if (input.kind === "index") {
    assertIndexClosure(input);
    return;
  }
  assertBundleClosure(input);
}
