import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  type BuildRouteInterventionInventoryInput,
  buildRouteInterventionInventory,
  canonicalRouteInterventionInventoryBytes,
  promoteRouteInterventionInventoryArtifacts,
  ROUTE_INTERVENTION_INVENTORY_BYTE_BUDGETS,
} from "../../src/lib/route-intervention-inventory.ts";

const hash = "a".repeat(64);
const manifestSha256 = "b".repeat(64);
const publishedAt = "2026-07-20T12:34:56.789Z";
const releaseId = "pub_20260720T123456789Z";
const wikiReleaseId = "v1-rc25";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing fixture ${label}`);
  return value;
}

function route(routeId: "B44" | "B44+") {
  const sbs = routeId === "B44+";
  return {
    routeId,
    routeFamilyId: "B44",
    displayLabel: sbs ? "B44-SBS" : "B44",
    officialLongName: "Sheepshead Bay - Williamsburg",
    designationLiterals: sbs ? ["route_type:SBS"] : ["route_type:Local"],
    serviceModes: sbs ? ["sbs"] : ["local"],
    routeTypes: sbs ? ["SBS"] : ["Local"],
    tripTypes: sbs ? [14] : [1],
  } as const;
}

function evidenceSource() {
  return {
    kind: "mta-wiki-immutable-release",
    wikiRelease: wikiReleaseId,
    manifestSha256,
    routeIdentitySha256: "c".repeat(64),
    routeAnchorSha256: "d".repeat(64),
    trackerRouteInputSha256: "e".repeat(64),
    catalogParity: {
      currentBusRoutesSha256: "f".repeat(64),
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
  } as const;
}

function evidenceBundle(routeId: "B44" | "B44+", treatment = routeId === "B44") {
  const routeIdentity = route(routeId);
  const interventions = treatment
    ? [
        {
          recordId: "treatment-1",
          recordKind: "treatment_component",
          citationKeys: ["citation-1"],
          treatmentKind: "Bus Lane",
          treatmentFamily: "bus_lane",
          title: "Bus Lane",
          description: "Source-backed treatment wording.",
          locations: ["Nostrand Avenue"],
          projectRecordIds: ["project-1"],
        },
      ]
    : [];
  const projects = treatment
    ? [
        {
          recordId: "project-1",
          recordKind: "project",
          citationKeys: ["citation-1"],
          projectName: "Nostrand Avenue priority",
          projectFamily: "bus_priority",
          projectType: "corridor",
          status: "implemented",
          description: null,
          location: "Nostrand Avenue",
          routesServed: [routeId],
        },
      ]
    : [];
  const citations = treatment
    ? [
        {
          key: "citation-1",
          sourceId: "source-1",
          blockId: "block-1",
          evidenceId: "evidence-1",
          sourcePath: "source.pdf",
        },
      ]
    : [];
  return {
    artifactKind: "bp.studio.route_evidence_bundle.v2",
    schemaVersion: 2,
    source: evidenceSource(),
    routeIdentity,
    operationalBindings: [],
    contextualBindings: [],
    routeId,
    routeSlug: routeId === "B44" ? "b44" : "b44-sbs",
    wikiRouteRecordId: treatment ? "route-b44" : null,
    wikiRouteIds: treatment ? ["route-b44"] : [],
    wikiAliases: [],
    coverage: {
      timelineCount: 0,
      interventionCount: interventions.length,
      metricClaimCount: 0,
      projectCount: projects.length,
      sourceGapCount: 0,
      citationCount: citations.length,
    },
    timeline: [],
    interventions,
    metricClaims: [],
    projects,
    sourceGaps: [],
    citations,
  };
}

function release() {
  const identity = {
    releaseId,
    publishedAt,
    coverage: { start: "2025-01", end: "2026-06" },
  };
  return {
    schemaVersion: 3,
    generatedAt: publishedAt,
    ...identity,
    quality: {
      releaseLayer: "published_release",
      completenessStatus: "complete",
      confidence: "high",
      caveats: [],
    },
    routes: [],
    mapRouteFactsMetadata: identity,
    routeFactMetadata: [],
    segments: [],
    routeArtifacts: [],
    methods: [],
    docsSections: [],
    docsEndpoints: [],
  };
}

function importedFile() {
  return { pointer: "fixture.json", path: "fixture.json", bytes: 2, sha256: hash };
}

function relationshipIntegrity() {
  return {
    bundle: importedFile(),
    bundleId: "relationship-integrity-v1",
    contractId: "relationship-contract-v1",
    validationMode: "enforce",
    artifactCount: 1,
    verifiedArtifactCount: 1,
    descriptor: { sourcePath: "fixture.json", bytes: 2, sha256: hash },
    contract: {
      file: importedFile(),
      contractStatus: "enforced",
      enforcementState: "enforced_ready",
      reviewedAt: publishedAt,
      reviewedBy: "fixture",
    },
    enforcementProof: {
      file: importedFile(),
      canonicalSha256: hash,
      proofId: "relationship-contract-v1-enforcement-proof",
      proofStage: "post_promotion_enforced",
      proofStatus: "ready",
      gateCount: 1,
      totalViolationCount: 0,
    },
    transitionReceipt: { file: importedFile(), canonicalSha256: hash },
    endpointMatrix: {
      file: importedFile(),
      canonicalSha256: hash,
      relationCount: 1,
      tupleCount: 1,
    },
    graphAudit: {
      file: importedFile(),
      canonicalRecordCount: 3,
      canonicalRelationCount: 1,
      enforceableViolationCount: 0,
      reviewedNonEnforceableAdvisoryCount: 0,
      informationalOrphanRecordCount: 0,
    },
  };
}

function occurrenceRow() {
  const binding = {
    role: "treatment_definition",
    record_id: "treatment-1",
    source_id: "source-1",
    evidence_id: "evidence-1",
  };
  return {
    schema_version: 2,
    occurrence_id: "occurrence-1",
    occurrence_aliases: [],
    occurrence_review_decision_id: "decision-1",
    founding_key: "founding-1",
    resolution_cluster_id: null,
    observations: [],
    resolved_status: "realized",
    resolved_onset: {
      date: "2025-05-19",
      precision: "day",
      resolver_ids: ["resolver-1"],
      publication_dates: ["2025-05-19"],
      retrieval_dates: ["2026-07-18"],
      evidence_bindings: [binding],
    },
    routes: [
      {
        route_record_id: "route-b44",
        gtfs_route_id: "B44",
        evidence_bindings: [{ ...binding, role: "route_identity", record_id: "route-b44" }],
      },
    ],
    treatment: {
      kind: "atomic",
      member: {
        treatment_record_id: "treatment-1",
        treatment_family: "bus_lane",
        evidence_bindings: [binding],
      },
    },
    source_ids: ["source-1"],
    evidence_bindings: [binding],
    exclusion_reasons: [],
    review_state: "approved",
    study_projection_eligible: true,
    phase_record_ids: ["event-1"],
    phase_relation_record_ids: [],
    phase_relation_evidence_bindings: [],
    phase_relation_disposition: "single_phase",
    physical_scope_record_ids: [],
    physical_scope_relation_record_ids: [],
    physical_scope_evidence_bindings: [],
    provenance: {
      anchor_review_decision_ids: ["anchor-1"],
      event_record_ids: ["event-1"],
      relation_record_ids: ["relation-1"],
      route_record_ids: ["route-b44"],
      treatment_record_ids: ["treatment-1"],
    },
  };
}

function wikiOccurrences(includeOccurrence: boolean) {
  const occurrences = includeOccurrence ? [occurrenceRow()] : [];
  return {
    artifactKind: "bp.studio.mta_wiki_operational_occurrences.v5",
    schemaVersion: 5,
    sourceRelease: {
      manifestVersion: 5,
      releaseId: wikiReleaseId,
      generatorCommit: "fixture",
      manifestPath: "manifest.json",
      manifestSha256,
      operationalOccurrenceContractVersion: 2,
      operationalOccurrenceReviewDecisionContractVersion: 2,
      relationshipIntegrityBundleContractVersion: 1,
      routeIdentityContractVersion: 1,
      producerReviewStatus: { compatibility: "compatible", promotionEligible: true },
      occurrences: importedFile(),
      summary: importedFile(),
      reviewDecisions: importedFile(),
      reviewDecisionCount: occurrences.length,
      reviewSourceDecisionCount: occurrences.length,
      reviewRetirementCount: 0,
      reviewRetirements: [],
      routeIdentitySnapshot: importedFile(),
      relationshipIntegrity: relationshipIntegrity(),
    },
    producerSummary: {
      schema_version: 2,
      occurrence_count: occurrences.length,
      study_projection_eligible_count: occurrences.length,
      atomic_count: occurrences.length,
      bundle_count: 0,
      multi_route_count: 0,
      candidate_projection_count: occurrences.length,
      counts_by_exclusion_reason: {},
    },
    summary: {
      sourceOccurrenceCount: occurrences.length,
      eligibleOccurrenceCount: occurrences.length,
      routeProjectionCount: occurrences.length,
      rejectedOccurrenceCount: 0,
      countsByRejectionReason: {},
      singlePhaseOccurrenceCount: occurrences.length,
      relatedPhaseOccurrenceCount: 0,
      exactPhysicalScopeOccurrenceCount: occurrences.length,
    },
    occurrences,
    projectionRejections: [],
  };
}

function fixture(mode: "mapped" | "unresolved" | "empty" = "mapped", reverse = false) {
  const hasScope = mode !== "empty";
  const includeOccurrence = mode === "mapped";
  const rawValue = mode === "unresolved" ? "unreviewed exact wording" : "Bus Lane";
  const bundles = (["B44", "B44+"] as const).map((routeId) => {
    const value = evidenceBundle(routeId, routeId === "B44" && hasScope);
    const bytes = new TextEncoder().encode(`${JSON.stringify(value)}\n`);
    return { routeId, value, bytes };
  });
  const ordered = reverse ? [...bundles].reverse() : bundles;
  const indexRoutes = ordered.map(({ routeId, value, bytes }) => ({
    routeId,
    routeSlug: value.routeSlug,
    wikiRouteRecordId: value.wikiRouteRecordId,
    artifactName: "route_evidence",
    artifactKey: `studio/v2/wiki/routes/${value.routeSlug}.json`,
    contentType: "application/json",
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
    coverage: value.coverage,
    bundleSchemaVersion: 2,
    routeIdentity: value.routeIdentity,
  }));
  const routeScope = {
    schema_version: 1,
    contract_id: "route-treatment-scope-v1",
    scope_id: "route-treatment-scope:fixture",
    route_record_id: "route-b44",
    route_identity: {
      dataset_id: "mta-nyct-bus",
      gtfs_route_id: "B44",
      source_route_id: "B44",
    },
    treatment_record_id: "treatment-1",
    raw_treatment_kind: rawValue,
    normalized_treatment_family: mode === "unresolved" ? "unknown" : "bus_lane",
    authorization: {
      kinds: includeOccurrence ? ["operational_occurrence"] : ["direct_relation"],
      occurrence_ids: includeOccurrence ? ["occurrence-1"] : [],
      relation_record_ids: ["relation-1"],
    },
    source_ids: ["source-1"],
    evidence_bindings: [
      {
        evidence_id: "evidence-1",
        record_id: "treatment-1",
        role: "treatment_definition",
        source_id: "source-1",
      },
    ],
  };
  const semantics = !hasScope
    ? { schema_version: 1, dispositions: [] }
    : mode === "unresolved"
      ? {
          schema_version: 1,
          dispositions: [
            {
              disposition: "unresolved",
              raw_treatment_kind: rawValue,
              record_ids: ["treatment-1"],
              review_reason: "source meaning remains explicitly unresolved",
            },
          ],
        }
      : {
          schema_version: 1,
          dispositions: [
            {
              disposition: "atomic",
              raw_treatment_kind: rawValue,
              record_ids: ["treatment-1"],
              canonical_kind: "bus_lane",
              family: "bus_priority_lane",
            },
          ],
        };
  const input: BuildRouteInterventionInventoryInput = {
    release: release(),
    interventionCorpus: {
      schemaVersion: 1,
      generatedAt: publishedAt,
      sourceCorpus: {
        path: "fixture.json",
        version: 1,
        generatedAt: publishedAt,
        recordCount: 0,
        sha256: hash,
      },
      records: [],
    },
    routeEvidenceIndex: {
      artifactKind: "bp.studio.route_evidence_index.v2",
      schemaVersion: 2,
      generatedAt: publishedAt,
      sourceArtifactKey: "studio/v2/wiki/all.json",
      source: evidenceSource(),
      summary: {
        routeCount: 2,
        matchedBusRouteCount: hasScope ? 1 : 0,
        citationCount: hasScope ? 1 : 0,
        totalByteLength: bundles.reduce((sum, bundle) => sum + bundle.bytes.byteLength, 0),
      },
      routes: indexRoutes,
    },
    routeEvidenceBundles: ordered.map(({ value, bytes }) => ({
      artifactKey: `studio/v2/wiki/routes/${value.routeSlug}.json`,
      bytes,
    })),
    wikiOccurrences: wikiOccurrences(includeOccurrence),
    wikiTreatmentCompanions: {
      releaseId: wikiReleaseId,
      manifestSha256,
      treatmentSemantics: semantics,
      treatmentVocabularyScopes: hasScope ? [{ rawValue, recordId: "treatment-1" }] : [],
      routeTreatmentScopes: hasScope ? [routeScope] : [],
      routeTreatmentScopeReconciliation: [],
    },
    reviewedOpenDispositions: [],
  };
  return input;
}

describe("route intervention inventory", () => {
  test("keeps exact routes distinct and preserves mapped treatment, occurrence, project, and lineage", () => {
    const built = buildRouteInterventionInventory(fixture("mapped"));
    const b44 = required(
      built.bundles.find((bundle) => bundle.value.route.routeId === "B44"),
      "B44 bundle",
    );
    const b44Sbs = required(
      built.bundles.find((bundle) => bundle.value.route.routeId === "B44+"),
      "B44+ bundle",
    );
    const treatment = required(b44.value.treatments[0], "B44 treatment");
    const occurrence = required(b44.value.occurrences[0], "B44 occurrence");

    expect(b44.value.treatments).toHaveLength(1);
    expect(b44.value.occurrences).toHaveLength(1);
    expect(b44.value.projectRefs).toEqual([
      expect.objectContaining({
        projectId: "project-1",
        treatmentIds: [treatment.treatmentId],
      }),
    ]);
    expect(occurrence.wikiOccurrenceId).toBe("occurrence-1");
    expect(treatment.occurrenceIds).toEqual([occurrence.occurrenceId]);
    expect(b44Sbs.value.treatments).toEqual([]);
    expect(b44Sbs.value.coverageState).toBe("checked_no_positive_evidence");
    expect(built.facetIndex.rows.every((row) => row.routeId === "B44")).toBe(true);
  });

  test("publishes producer-reviewed unresolved scopes as partial source gaps", () => {
    const built = buildRouteInterventionInventory(fixture("unresolved"));
    const b44 = required(
      built.bundles.find((bundle) => bundle.value.route.routeId === "B44"),
      "B44 unresolved bundle",
    );

    expect(b44.value.treatments).toEqual([]);
    expect(b44.value.coverageState).toBe("partial");
    expect(b44.value.sourceGaps).toEqual([
      expect.objectContaining({ gapKind: "unresolved_treatment_semantics" }),
    ]);
    expect(built.reconciliation.summary.unmappedTreatmentCount).toBe(1);
    expect(built.reconciliation.projectionFailures).toEqual([
      expect.objectContaining({ reason: "unresolved_treatment_semantics", rawRouteId: "B44" }),
    ]);
  });

  test("preserves a routed treatment with separate nonprojectable route bindings", () => {
    const input = fixture("mapped");
    const built = buildRouteInterventionInventory({
      ...input,
      wikiTreatmentCompanions: {
        ...input.wikiTreatmentCompanions,
        routeTreatmentScopeReconciliation: [
          {
            schema_version: 1,
            contract_id: "route-treatment-scope-v1",
            treatment_record_id: "treatment-1",
            raw_treatment_kind: "Bus Lane",
            reconciliation_state: "documented_unresolved",
            reason_code: "route_binding_nonprojectable",
            route_record_ids: ["route-nonprojectable"],
            relation_record_ids: ["relation-nonprojectable"],
            project_context_relation_ids: [],
            source_ids: ["source-1"],
            evidence_ids: ["evidence-1"],
          },
        ],
      },
    });
    const b44 = required(
      built.bundles.find((bundle) => bundle.value.route.routeId === "B44"),
      "B44 partially routed bundle",
    );

    expect(b44.value.treatments).toHaveLength(1);
    expect(built.reconciliation.projectionFailures).toContainEqual(
      expect.objectContaining({
        sourceRecordId: "treatment-1",
        reason: "route_binding_nonprojectable",
      }),
    );
  });

  test("keeps local source-gap sentinels out of treatment and occurrence projections", () => {
    const input = fixture("mapped");
    const built = buildRouteInterventionInventory({
      ...input,
      localRegistry: {
        availability: "available",
        rows: [
          {
            event_id: "local-gap-1",
            route_id: "B44+",
            intervention_type: "busway",
            source_id: "nyc_dot_bus_lanes",
            program: "NYC DOT Bus Lanes",
            implementation_date: "2026-05-01T00:00:00.000Z",
            implementation_month: "2026-05",
            event_status: "source_gap",
            description: "Matched geometry lacks a source-backed opening date.",
          },
        ],
      },
      reviewedOpenDispositions: [
        {
          rawValue: "busway",
          disposition: "mapped",
          treatmentKind: "busway",
          treatmentFamily: "bus_priority_lane",
        },
      ],
    });
    const b44Sbs = required(
      built.bundles.find((bundle) => bundle.value.route.routeId === "B44+"),
      "B44+ local-gap bundle",
    );

    expect(b44Sbs.value.treatments).toEqual([]);
    expect(b44Sbs.value.occurrences).toEqual([]);
    expect(b44Sbs.value.coverageState).toBe("partial");
    expect(b44Sbs.value.sourceGaps).toEqual([
      expect.objectContaining({
        gapId: "local_registry:local-gap-1",
        gapKind: "local_registry_source_gap",
        treatmentKind: "busway",
      }),
    ]);
    expect(b44Sbs.value.sourceStates).toContainEqual(
      expect.objectContaining({ sourceKind: "local_registry", availability: "partial" }),
    );
    expect(built.reconciliation.summary.mappedTreatmentCount).toBe(2);
  });

  test("fails closed on missing bundles and release or manifest mismatches", () => {
    const missing = fixture("mapped");
    expect(() => buildRouteInterventionInventory({ ...missing, routeEvidenceBundles: [] })).toThrow(
      "Missing required route evidence bundle",
    );

    const mismatched = fixture("mapped");
    expect(() =>
      buildRouteInterventionInventory({
        ...mismatched,
        wikiTreatmentCompanions: {
          ...mismatched.wikiTreatmentCompanions,
          manifestSha256: "0".repeat(64),
        },
      }),
    ).toThrow("companions do not match");

    const badHash = fixture("mapped");
    const bundles = [...badHash.routeEvidenceBundles];
    bundles[0] = {
      ...required(bundles[0], "evidence bundle"),
      bytes: new TextEncoder().encode("{}\n"),
    };
    expect(() =>
      buildRouteInterventionInventory({ ...badHash, routeEvidenceBundles: bundles }),
    ).toThrow("hash or byte-size mismatch");
  });

  test("is byte deterministic under shuffled inputs and stays within every budget", () => {
    const first = buildRouteInterventionInventory(fixture("mapped", false));
    const second = buildRouteInterventionInventory(fixture("mapped", true));

    expect(first.bundles.map((bundle) => [...bundle.bytes])).toEqual(
      second.bundles.map((bundle) => [...bundle.bytes]),
    );
    expect([...first.routeIndexBytes]).toEqual([...second.routeIndexBytes]);
    expect([...first.facetIndexBytes]).toEqual([...second.facetIndexBytes]);
    expect([...first.reconciliationBytes]).toEqual([...second.reconciliationBytes]);
    for (const bundle of first.bundles) {
      expect(bundle.byteSize).toBe(bundle.bytes.byteLength);
      expect(bundle.sha256).toBe(sha256(bundle.bytes));
      expect(bundle.byteSize).toBeLessThanOrEqual(
        ROUTE_INTERVENTION_INVENTORY_BYTE_BUDGETS.routeBundle,
      );
      const indexRow = first.routeIndex.routes.find(
        (row) => row.route.routeId === bundle.value.route.routeId,
      );
      expect(indexRow).toEqual(
        expect.objectContaining({ sha256: bundle.sha256, byteSize: bundle.byteSize }),
      );
    }
    expect(first.routeIndexBytes.byteLength).toBeLessThanOrEqual(
      ROUTE_INTERVENTION_INVENTORY_BYTE_BUDGETS.routeIndex,
    );
    expect(first.facetIndexBytes.byteLength).toBeLessThanOrEqual(
      ROUTE_INTERVENTION_INVENTORY_BYTE_BUDGETS.facetIndex,
    );
    expect(canonicalRouteInterventionInventoryBytes(first.routeIndex)).toEqual(
      first.routeIndexBytes,
    );
  });

  test("promotes files atomically while preserving unrelated siblings on success and failure", async () => {
    const built = buildRouteInterventionInventory(fixture("mapped"));
    const root = await mkdtemp(join(tmpdir(), "bp-route-inventory-"));
    const failingRoot = await mkdtemp(join(tmpdir(), "bp-route-inventory-fail-"));
    try {
      const sibling = join(root, "studio/v2/routes/b44/dossier.json");
      await mkdir(dirname(sibling), { recursive: true });
      await writeFile(sibling, "sibling\n");
      await promoteRouteInterventionInventoryArtifacts({ artifactRoot: root, build: built });
      expect(await readFile(sibling, "utf8")).toBe("sibling\n");
      const promoted = await readFile(
        join(root, "studio/v2/routes/b44/intervention-inventory.json"),
      );
      expect(sha256(promoted)).toBe(required(built.bundles[0], "promoted bundle").sha256);

      const failingSibling = join(failingRoot, "studio/v2/routes/b44/dossier.json");
      const blockedTarget = join(failingRoot, "studio/v2/routes/b44/intervention-inventory.json");
      await mkdir(blockedTarget, { recursive: true });
      await writeFile(failingSibling, "still-here\n");
      await expect(
        promoteRouteInterventionInventoryArtifacts({ artifactRoot: failingRoot, build: built }),
      ).rejects.toThrow();
      expect(await readFile(failingSibling, "utf8")).toBe("still-here\n");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(failingRoot, { recursive: true, force: true });
    }
  });
});
