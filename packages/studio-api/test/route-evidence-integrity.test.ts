import { describe, expect, it } from "bun:test";
import type {
  StudioRouteEvidenceBinding,
  StudioRouteEvidenceBundleV2,
  StudioRouteEvidenceIndexRouteV2,
  StudioRouteEvidenceIndexV2,
  StudioRouteEvidenceSourceV2,
  StudioRouteIdentityPresentation,
} from "@bp/domain/studio";
import {
  assertStudioRouteEvidenceV2ServingClosure,
  type ExactD1RouteEvidenceIdentity,
} from "../src/studio/route-evidence-integrity.js";

const source: StudioRouteEvidenceSourceV2 = {
  kind: "mta-wiki-immutable-release",
  wikiRelease: "v1-rc24",
  manifestSha256: "1".repeat(64),
  routeIdentitySha256: "2".repeat(64),
  routeAnchorSha256: "3".repeat(64),
  trackerRouteInputSha256: "4".repeat(64),
  catalogParity: {
    currentBusRoutesSha256: "5".repeat(64),
    effectiveAsOfDate: "2026-07-18",
    currentCatalogRouteCount: 2,
    catalogInEffectIdentityCount: 2,
    gtfsRouteCount: 2,
    descriptorReconciled: true,
    catalogInEffectSetsEqual: true,
    catalogOnlyRouteIds: [],
    gtfsOnlyRouteIds: [],
    rawRouteTypeCounts: { "3": 2 },
    scheduledInWindowCounts: { yes: 2 },
    reliabilityStatusCounts: { reliable: 2 },
    nonBusOrUnknownExtendedRouteTypeCount: 0,
    externalOnlyRouteRecordCount: 0,
  },
};

const localPresentation: StudioRouteIdentityPresentation = {
  routeId: "B44",
  routeFamilyId: "B44",
  displayLabel: "B44",
  officialLongName: "Sheepshead Bay - Williamsburg",
  designationLiterals: ["route_type:Local", "trip_type:1"],
  serviceModes: ["local"],
  routeTypes: ["Local"],
  tripTypes: ["1"],
};

const sbsPresentation: StudioRouteIdentityPresentation = {
  routeId: "B44+",
  routeFamilyId: "B44",
  displayLabel: "B44-SBS",
  officialLongName: "Sheepshead Bay - Williamsburg",
  designationLiterals: ["route_type:SBS", "trip_type:14"],
  serviceModes: ["sbs"],
  routeTypes: ["SBS"],
  tripTypes: ["14"],
};

const emptyCoverage = {
  timelineCount: 0,
  interventionCount: 0,
  metricClaimCount: 0,
  projectCount: 0,
  sourceGapCount: 0,
  citationCount: 0,
};

function binding(input: {
  routeId: "B44" | "B44+";
  routeRecordId: string;
  projectable: boolean;
  presentationPrimary: boolean;
  serviceVariant?: StudioRouteEvidenceBinding["serviceVariant"];
}): StudioRouteEvidenceBinding {
  return {
    routeRecordId: input.routeRecordId,
    routeFamilyId: "B44",
    datasetId: "mta-nyct-bus",
    componentFeedIds: ["nyct-brooklyn"],
    sourceRouteId: input.routeId,
    gtfsRouteId: input.routeId,
    serviceVariant: input.serviceVariant ?? (input.routeId === "B44+" ? "sbs" : "local"),
    identityScope: "exact_service",
    serviceClass: "regular_mta_bus",
    recordTemporalScope: input.projectable ? "current_description" : "historical_description",
    projectable: input.projectable,
    presentationPrimary: input.presentationPrimary,
    derivation: "fixture",
    evidenceIds: ["source#route"],
    canonicalRecordFingerprint: "6".repeat(64),
  };
}

function indexRow(input: {
  routeId: "B44" | "B44+";
  routeSlug: "b44" | "b44-sbs";
  presentation: StudioRouteIdentityPresentation;
}): StudioRouteEvidenceIndexRouteV2 {
  return {
    routeId: input.routeId,
    routeSlug: input.routeSlug,
    wikiRouteRecordId: input.routeId === "B44" ? "route_b44-local" : "route_b44-sbs",
    artifactName: "route_evidence",
    artifactKey: `studio/v2/wiki/routes/${input.routeSlug}.json`,
    contentType: "application/json",
    byteLength: 100,
    sha256: "a".repeat(64),
    coverage: { ...emptyCoverage },
    bundleSchemaVersion: 2,
    routeIdentity: input.presentation,
  };
}

function fixture(): {
  bundle: StudioRouteEvidenceBundleV2;
  expectedRoutes: Map<string, ExactD1RouteEvidenceIdentity>;
  index: StudioRouteEvidenceIndexV2;
} {
  const localRow = indexRow({ routeId: "B44", routeSlug: "b44", presentation: localPresentation });
  const sbsRow = indexRow({
    routeId: "B44+",
    routeSlug: "b44-sbs",
    presentation: sbsPresentation,
  });
  return {
    expectedRoutes: new Map([
      ["B44", { slug: "b44", presentation: localPresentation }],
      ["B44+", { slug: "b44-sbs", presentation: sbsPresentation }],
    ]),
    index: {
      artifactKind: "bp.studio.route_evidence_index.v2",
      schemaVersion: 2,
      generatedAt: "2026-07-18T18:05:27.000Z",
      sourceArtifactKey: "studio/v2/wiki/route-evidence.json",
      source,
      summary: {
        routeCount: 2,
        matchedBusRouteCount: 2,
        citationCount: 0,
        totalByteLength: 200,
      },
      routes: [localRow, sbsRow],
    },
    bundle: {
      artifactKind: "bp.studio.route_evidence_bundle.v2",
      schemaVersion: 2,
      source,
      routeIdentity: localPresentation,
      operationalBindings: [
        binding({
          routeId: "B44",
          routeRecordId: "route_b44-local",
          projectable: true,
          presentationPrimary: true,
        }),
      ],
      contextualBindings: [
        binding({
          routeId: "B44",
          routeRecordId: "route_b44-historical",
          projectable: false,
          presentationPrimary: false,
          serviceVariant: "limited_stop",
        }),
      ],
      routeId: "B44",
      routeSlug: "b44",
      wikiRouteRecordId: "route_b44-local",
      wikiRouteIds: ["B44"],
      wikiAliases: ["B44"],
      coverage: { ...emptyCoverage },
      timeline: [],
      interventions: [],
      metricClaims: [],
      projects: [],
      sourceGaps: [],
      citations: [],
    },
  };
}

function assertBundle(input: ReturnType<typeof fixture>): void {
  const indexRow = input.index.routes[0];
  const expectedRoute = input.expectedRoutes.get("B44");
  if (indexRow === undefined || expectedRoute === undefined) throw new Error("Incomplete fixture");
  assertStudioRouteEvidenceV2ServingClosure({
    kind: "bundle",
    index: input.index,
    indexRow,
    expectedRoute,
    artifactKey: "studio/v2/wiki/routes/b44.json",
    bundle: input.bundle,
    byteLength: 100,
    sha256: "a".repeat(64),
  });
}

describe("route evidence v2 exact serving closure", () => {
  it("accepts a byte-pinned B44 index and bundle bound to the exact D1 presentation", () => {
    const value = fixture();
    expect(() =>
      assertStudioRouteEvidenceV2ServingClosure({
        kind: "index",
        index: value.index,
        expectedRoutes: value.expectedRoutes,
      }),
    ).not.toThrow();
    expect(() => assertBundle(value)).not.toThrow();
  });

  it.each([
    ["B44+ sibling presentation", { routeIdentity: sbsPresentation }],
    [
      "forged official label",
      { routeIdentity: { ...localPresentation, displayLabel: "B44 Local" } },
    ],
    [
      "forged service mode",
      {
        routeIdentity: {
          ...localPresentation,
          designationLiterals: ["route_type:SBS", "trip_type:14"],
          serviceModes: ["sbs"],
          routeTypes: ["SBS"],
          tripTypes: ["14"],
        },
      },
    ],
  ])("rejects an index row carrying %s", (_label, mutation) => {
    const value = fixture();
    Object.assign(value.index.routes[0] ?? {}, mutation);
    expect(() =>
      assertStudioRouteEvidenceV2ServingClosure({
        kind: "index",
        index: value.index,
        expectedRoutes: value.expectedRoutes,
      }),
    ).toThrow("Route evidence index identity mismatch");
  });

  it("rejects forged bytes and a forged bundle/index coverage pair", () => {
    const badHash = fixture();
    const indexRow = badHash.index.routes[0];
    if (indexRow === undefined) throw new Error("Missing index row fixture");
    Object.assign(indexRow, { sha256: "b".repeat(64) });
    expect(() => assertBundle(badHash)).toThrow("bundle bytes do not match");

    const forgedCoverage = fixture();
    const forgedIndexRow = forgedCoverage.index.routes[0];
    if (forgedIndexRow === undefined) throw new Error("Missing index row fixture");
    Object.assign(forgedCoverage.bundle.coverage, { timelineCount: 1 });
    Object.assign(forgedIndexRow.coverage, { timelineCount: 1 });
    expect(() => assertBundle(forgedCoverage)).toThrow("coverage does not reconcile");
  });

  it("rejects missing primary identity and crossed exact contextual siblings", () => {
    const missingPrimary = fixture();
    const primary = missingPrimary.bundle.operationalBindings[0];
    if (primary === undefined) throw new Error("Missing operational binding fixture");
    Object.assign(primary, { presentationPrimary: false });
    expect(() => assertBundle(missingPrimary)).toThrow("primary Wiki binding does not reconcile");

    const crossedContext = fixture();
    const contextual = crossedContext.bundle.contextualBindings[0];
    if (contextual === undefined) throw new Error("Missing contextual binding fixture");
    Object.assign(
      contextual,
      binding({
        routeId: "B44+",
        routeRecordId: "route_b44-sbs-historical",
        projectable: false,
        presentationPrimary: false,
      }),
    );
    expect(() => assertBundle(crossedContext)).toThrow("crossed exact contextual binding");
  });

  it("rejects a crossed B44+ operational binding while allowing an exact historical variant", () => {
    const historicalVariant = fixture();
    expect(historicalVariant.bundle.contextualBindings[0]?.serviceVariant).toBe("limited_stop");
    expect(() => assertBundle(historicalVariant)).not.toThrow();

    const crossedOperational = fixture();
    const operational = crossedOperational.bundle.operationalBindings[0];
    if (operational === undefined) throw new Error("Missing operational binding fixture");
    Object.assign(
      operational,
      binding({
        routeId: "B44+",
        routeRecordId: "route_b44-sbs",
        projectable: true,
        presentationPrimary: true,
      }),
    );
    Object.assign(crossedOperational.bundle, { wikiRouteRecordId: "route_b44-sbs" });
    const indexRow = crossedOperational.index.routes[0];
    if (indexRow === undefined) throw new Error("Missing index row fixture");
    Object.assign(indexRow, { wikiRouteRecordId: "route_b44-sbs" });
    expect(() => assertBundle(crossedOperational)).toThrow("crossed operational binding");
  });
});
