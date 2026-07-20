import { Schema } from "effect";
import { IsoMonthSchema } from "../primitives/index.js";
import {
  routeIdToStudioSlug,
  StudioRouteIdentityPresentationSchema,
} from "./route-presentation.js";
import { CoverageWindowSchema, ReleaseIdentitySchema } from "./shared.js";

const StrictParseOptions = {
  parseOptions: { onExcessProperty: "error" },
} as const;

const ShortStringSchema = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(160));
const MediumStringSchema = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512));
const NonNegativeIntegerSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u));
const TreatmentIdSchema = Schema.String.check(Schema.isPattern(/^treatment:v1:[0-9a-f]{24}$/u));
const OccurrenceIdSchema = Schema.String.check(Schema.isPattern(/^occurrence:v1:[0-9a-f]{24}$/u));
const ShortStringArraySchema = Schema.Array(ShortStringSchema).check(Schema.isMaxLength(256));
const MediumStringArraySchema = Schema.Array(MediumStringSchema).check(Schema.isMaxLength(256));
const TreatmentIdArraySchema = Schema.Array(TreatmentIdSchema).check(Schema.isMaxLength(256));
const OccurrenceIdArraySchema = Schema.Array(OccurrenceIdSchema).check(Schema.isMaxLength(256));
const NonEmptyTreatmentIdArraySchema = TreatmentIdArraySchema.check(Schema.isMinLength(1));

export const STUDIO_INTERVENTION_TREATMENT_KINDS = [
  "bus_lane",
  "busway",
  "transit_signal_priority",
  "queue_jump",
  "stop_consolidation",
  "stop_relocation",
  "bus_bulb",
  "neckdown",
  "red_paint",
  "off_board_fare_collection",
  "all_door_boarding",
  "automated_bus_lane_enforcement",
  "route_redesign",
  "pedestrian_improvement",
  "signal_retiming",
  "select_bus_service",
  "stop_change",
  "capital_project_milestone",
  "frequency_change",
  "turn_restriction",
  "other_documented",
] as const;

export const STUDIO_INTERVENTION_TREATMENT_FAMILIES = [
  "bus_priority_lane",
  "signal_priority",
  "stop_change",
  "street_design",
  "boarding_and_fare",
  "enforcement",
  "service_change",
  "service_package",
  "capital",
  "other",
] as const;

export const STUDIO_INTERVENTION_LIFECYCLE_STATES = [
  "current_confirmed",
  "implemented",
  "historical_confirmed",
  "planned",
  "proposed",
  "under_consideration",
  "candidate",
] as const;

export const STUDIO_ROUTE_INTERVENTION_SOURCE_KINDS = [
  "intervention_corpus",
  "route_evidence",
  "operational_occurrences",
  "local_registry",
] as const;

export const StudioInterventionTreatmentKindSchema = Schema.Literals(
  STUDIO_INTERVENTION_TREATMENT_KINDS,
);
export const StudioInterventionTreatmentFamilySchema = Schema.Literals(
  STUDIO_INTERVENTION_TREATMENT_FAMILIES,
);
export const StudioInterventionLifecycleStateSchema = Schema.Literals(
  STUDIO_INTERVENTION_LIFECYCLE_STATES,
);
export const StudioInterventionDatePrecisionSchema = Schema.Literals([
  "day",
  "month",
  "season",
  "year",
  "range",
  "unknown",
]);
export const StudioInterventionGeographyScopeSchema = Schema.Literals([
  "route",
  "corridor",
  "segment",
  "intersection",
  "source_only",
]);
export const StudioRouteInterventionCoverageStateSchema = Schema.Literals([
  "available",
  "partial",
  "checked_no_positive_evidence",
]);
export const StudioRouteInterventionSourceKindSchema = Schema.Literals(
  STUDIO_ROUTE_INTERVENTION_SOURCE_KINDS,
);

export const StudioRouteInterventionSourceStateSchema = Schema.Struct({
  sourceKind: StudioRouteInterventionSourceKindSchema,
  requirement: Schema.Literals(["required", "optional"]),
  availability: Schema.Literals(["available", "partial", "unavailable"]),
  checkedCoverage: Schema.NullOr(CoverageWindowSchema),
  recordCount: NonNegativeIntegerSchema,
})
  .check(
    Schema.makeFilter((state) => {
      if (state.availability === "unavailable") {
        return state.checkedCoverage === null && state.recordCount === 0
          ? []
          : [
              {
                path: ["checkedCoverage"],
                issue: "An unavailable source has no checked coverage or records.",
              },
            ];
      }
      return state.checkedCoverage === null
        ? [
            {
              path: ["checkedCoverage"],
              issue: "An available or partial source must declare checked coverage.",
            },
          ]
        : [];
    }),
  )
  .annotate(StrictParseOptions);

export const StudioRouteInterventionTreatmentSchema = Schema.Struct({
  treatmentId: TreatmentIdSchema,
  sourceNamespace: ShortStringSchema,
  sourceRecordId: ShortStringSchema,
  sourceId: ShortStringSchema,
  componentCollection: Schema.Literals(["primary", "custom", "wiki", "registry"]),
  componentPosition: NonNegativeIntegerSchema,
  rawKind: ShortStringSchema,
  rawLabel: Schema.NullOr(MediumStringSchema),
  treatmentKind: StudioInterventionTreatmentKindSchema,
  treatmentFamily: StudioInterventionTreatmentFamilySchema,
  lifecycleState: StudioInterventionLifecycleStateSchema,
  statusAsOf: Schema.NullOr(ShortStringSchema),
  effectiveDate: Schema.NullOr(ShortStringSchema),
  datePrecision: StudioInterventionDatePrecisionSchema,
  geographyScope: StudioInterventionGeographyScopeSchema,
  sourceRefs: MediumStringArraySchema,
  occurrenceIds: OccurrenceIdArraySchema,
  projectIds: ShortStringArraySchema,
}).annotate(StrictParseOptions);

export const StudioRouteInterventionRegistryLineageSchema = Schema.Struct({
  dataProductId: Schema.Literal("local_intervention_events_release"),
  eventId: ShortStringSchema,
  rawRouteId: ShortStringSchema,
  rawInterventionType: ShortStringSchema,
  sourceId: ShortStringSchema,
  rawStatus: ShortStringSchema,
  program: ShortStringSchema,
  implementationDate: ShortStringSchema,
  implementationMonth: IsoMonthSchema,
}).annotate(StrictParseOptions);

export const StudioRouteInterventionOccurrenceSchema = Schema.Struct({
  occurrenceId: OccurrenceIdSchema,
  sourceNamespace: ShortStringSchema,
  sourceOccurrenceId: ShortStringSchema,
  sourceId: ShortStringSchema,
  producerPhaseOrPosition: ShortStringSchema,
  routeId: ShortStringSchema,
  treatmentIds: NonEmptyTreatmentIdArraySchema,
  lifecycleState: StudioInterventionLifecycleStateSchema,
  phase: Schema.NullOr(ShortStringSchema),
  rawStatus: Schema.NullOr(ShortStringSchema),
  program: Schema.NullOr(ShortStringSchema),
  effectiveDate: Schema.NullOr(ShortStringSchema),
  datePrecision: StudioInterventionDatePrecisionSchema,
  geographyScope: StudioInterventionGeographyScopeSchema,
  sourceRefs: MediumStringArraySchema,
  projectIds: ShortStringArraySchema,
  wikiOccurrenceId: Schema.NullOr(ShortStringSchema),
  registryLineage: Schema.NullOr(StudioRouteInterventionRegistryLineageSchema),
}).annotate(StrictParseOptions);

export const StudioRouteInterventionCurrentStateSchema = Schema.Struct({
  treatmentKind: StudioInterventionTreatmentKindSchema,
  treatmentFamily: StudioInterventionTreatmentFamilySchema,
  lifecycleState: StudioInterventionLifecycleStateSchema,
  effectiveDate: Schema.NullOr(ShortStringSchema),
  datePrecision: StudioInterventionDatePrecisionSchema,
  treatmentIds: NonEmptyTreatmentIdArraySchema,
  occurrenceIds: OccurrenceIdArraySchema,
}).annotate(StrictParseOptions);

export const StudioRouteInterventionProjectRefSchema = Schema.Struct({
  projectId: ShortStringSchema,
  treatmentIds: TreatmentIdArraySchema,
  occurrenceIds: OccurrenceIdArraySchema,
  citationKeys: ShortStringArraySchema,
}).annotate(StrictParseOptions);

export const StudioRouteInterventionSourceGapSchema = Schema.Struct({
  gapId: ShortStringSchema,
  sourceKind: StudioRouteInterventionSourceKindSchema,
  sourceId: ShortStringSchema,
  treatmentKind: Schema.NullOr(StudioInterventionTreatmentKindSchema),
  gapKind: ShortStringSchema,
  sourceRefs: MediumStringArraySchema,
  projectIds: ShortStringArraySchema,
}).annotate(StrictParseOptions);

const ExpectedSourceRequirements = {
  intervention_corpus: "required",
  route_evidence: "required",
  operational_occurrences: "required",
  local_registry: "optional",
} as const;

function sourceStateIssues(
  states: readonly (typeof StudioRouteInterventionSourceStateSchema.Type)[],
) {
  const byKind = new Map(states.map((state) => [state.sourceKind, state]));
  const issues: Array<{ readonly path: readonly (string | number)[]; readonly issue: string }> = [];
  for (const [sourceKind, requirement] of Object.entries(ExpectedSourceRequirements)) {
    const state = byKind.get(sourceKind as keyof typeof ExpectedSourceRequirements);
    if (state === undefined) {
      issues.push({ path: ["sourceStates"], issue: `Missing source state: ${sourceKind}.` });
      continue;
    }
    if (state.requirement !== requirement) {
      issues.push({
        path: ["sourceStates"],
        issue: `${sourceKind} must be marked ${requirement}.`,
      });
    }
    if (requirement === "required" && state.availability === "unavailable") {
      issues.push({
        path: ["sourceStates"],
        issue: `Required source ${sourceKind} cannot be unavailable in a published bundle.`,
      });
    }
  }
  if (byKind.size !== states.length) {
    issues.push({ path: ["sourceStates"], issue: "Source states must be unique by source kind." });
  }
  return issues;
}

export const StudioRouteInterventionInventoryBundleSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.route_intervention_inventory_bundle.v1"),
  schemaVersion: Schema.Literal(1),
  ...ReleaseIdentitySchema.fields,
  route: StudioRouteIdentityPresentationSchema,
  routeSlug: ShortStringSchema,
  coverageState: StudioRouteInterventionCoverageStateSchema,
  sourceStates: Schema.Array(StudioRouteInterventionSourceStateSchema).check(
    Schema.isMinLength(4),
    Schema.isMaxLength(4),
  ),
  treatments: Schema.Array(StudioRouteInterventionTreatmentSchema).check(Schema.isMaxLength(512)),
  occurrences: Schema.Array(StudioRouteInterventionOccurrenceSchema).check(Schema.isMaxLength(512)),
  currentState: Schema.Array(StudioRouteInterventionCurrentStateSchema).check(
    Schema.isMaxLength(64),
  ),
  projectRefs: Schema.Array(StudioRouteInterventionProjectRefSchema).check(Schema.isMaxLength(512)),
  sourceGaps: Schema.Array(StudioRouteInterventionSourceGapSchema).check(Schema.isMaxLength(256)),
})
  .check(
    Schema.makeFilter((bundle) => {
      const issues = sourceStateIssues(bundle.sourceStates);
      if (bundle.routeSlug !== routeIdToStudioSlug(bundle.route.routeId)) {
        issues.push({
          path: ["routeSlug"],
          issue: "Route slug must be derived from the exact route identity.",
        });
      }
      if (
        bundle.coverageState === "checked_no_positive_evidence" &&
        (bundle.treatments.length > 0 ||
          bundle.occurrences.length > 0 ||
          bundle.currentState.length > 0)
      ) {
        issues.push({
          path: ["coverageState"],
          issue: "Checked-empty bundles cannot contain positive treatment state.",
        });
      }
      if (
        bundle.coverageState === "available" &&
        bundle.sourceStates.some((state) => state.availability !== "available")
      ) {
        issues.push({
          path: ["coverageState"],
          issue: "Available coverage requires every declared source to be available.",
        });
      }
      if (
        bundle.coverageState === "partial" &&
        bundle.sourceStates.every((state) => state.availability === "available")
      ) {
        issues.push({
          path: ["coverageState"],
          issue: "Partial coverage requires a partial or unavailable source.",
        });
      }
      return issues;
    }),
  )
  .annotate(StrictParseOptions);

export const StudioRouteInterventionFamilyCountSchema = Schema.Struct({
  treatmentFamily: StudioInterventionTreatmentFamilySchema,
  count: NonNegativeIntegerSchema,
}).annotate(StrictParseOptions);

export const StudioRouteInterventionStateCountSchema = Schema.Struct({
  lifecycleState: StudioInterventionLifecycleStateSchema,
  count: NonNegativeIntegerSchema,
}).annotate(StrictParseOptions);

export const StudioRouteInterventionSourceStateSummarySchema = Schema.Struct({
  availableCount: NonNegativeIntegerSchema,
  partialCount: NonNegativeIntegerSchema,
  unavailableCount: NonNegativeIntegerSchema,
}).annotate(StrictParseOptions);

export const StudioRouteInterventionInventoryIndexRouteSchema = Schema.Struct({
  route: StudioRouteIdentityPresentationSchema,
  routeSlug: ShortStringSchema,
  bundleKey: MediumStringSchema,
  sha256: Sha256Schema,
  byteSize: NonNegativeIntegerSchema,
  coverageState: StudioRouteInterventionCoverageStateSchema,
  familyCounts: Schema.Array(StudioRouteInterventionFamilyCountSchema).check(
    Schema.isMaxLength(STUDIO_INTERVENTION_TREATMENT_FAMILIES.length),
  ),
  stateCounts: Schema.Array(StudioRouteInterventionStateCountSchema).check(
    Schema.isMaxLength(STUDIO_INTERVENTION_LIFECYCLE_STATES.length),
  ),
  sourceStateSummary: StudioRouteInterventionSourceStateSummarySchema,
}).annotate(StrictParseOptions);

export const StudioRouteInterventionInventoryIndexSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.route_intervention_inventory_index.v1"),
  schemaVersion: Schema.Literal(1),
  ...ReleaseIdentitySchema.fields,
  summary: Schema.Struct({
    routeCount: NonNegativeIntegerSchema,
    checkedEmptyRouteCount: NonNegativeIntegerSchema,
    totalByteSize: NonNegativeIntegerSchema,
  }),
  routes: Schema.Array(StudioRouteInterventionInventoryIndexRouteSchema).check(
    Schema.isMaxLength(1_000),
  ),
}).annotate(StrictParseOptions);

export const StudioInterventionFacetIndexRowSchema = Schema.Struct({
  facetId: ShortStringSchema,
  sourceNamespace: ShortStringSchema,
  sourceRecordId: ShortStringSchema,
  sourceOccurrenceId: Schema.NullOr(ShortStringSchema),
  occurrenceId: Schema.NullOr(OccurrenceIdSchema),
  routeId: ShortStringSchema,
  routeSlug: ShortStringSchema,
  treatmentIds: NonEmptyTreatmentIdArraySchema,
  treatmentKinds: Schema.Array(StudioInterventionTreatmentKindSchema).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(64),
  ),
  treatmentFamilies: Schema.Array(StudioInterventionTreatmentFamilySchema).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(STUDIO_INTERVENTION_TREATMENT_FAMILIES.length),
  ),
  lifecycleState: StudioInterventionLifecycleStateSchema,
  effectiveDate: Schema.NullOr(ShortStringSchema),
  datePrecision: StudioInterventionDatePrecisionSchema,
  projectIds: ShortStringArraySchema,
  bundleKey: MediumStringSchema,
}).annotate(StrictParseOptions);

export const StudioInterventionFacetIndexSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.intervention_facet_index.v1"),
  schemaVersion: Schema.Literal(1),
  ...ReleaseIdentitySchema.fields,
  summary: Schema.Struct({
    rowCount: NonNegativeIntegerSchema,
    routeCount: NonNegativeIntegerSchema,
    treatmentCount: NonNegativeIntegerSchema,
    occurrenceCount: NonNegativeIntegerSchema,
  }),
  rows: Schema.Array(StudioInterventionFacetIndexRowSchema).check(Schema.isMaxLength(10_000)),
}).annotate(StrictParseOptions);

export const StudioRouteInterventionProjectionFailureSchema = Schema.Struct({
  sourceNamespace: ShortStringSchema,
  sourceRecordId: ShortStringSchema,
  rawRouteId: Schema.NullOr(ShortStringSchema),
  reason: ShortStringSchema,
}).annotate(StrictParseOptions);

export const StudioRouteInterventionVocabularySourceCountSchema = Schema.Struct({
  sourceNamespace: ShortStringSchema,
  literalCount: NonNegativeIntegerSchema,
}).annotate(StrictParseOptions);

export const StudioRouteInterventionInventoryReconciliationSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.route_intervention_inventory_reconciliation.v1"),
  schemaVersion: Schema.Literal(1),
  ...ReleaseIdentitySchema.fields,
  summary: Schema.Struct({
    sourceRecordCount: NonNegativeIntegerSchema,
    sourceTreatmentCount: NonNegativeIntegerSchema,
    sourceOccurrenceCount: NonNegativeIntegerSchema,
    mappedTreatmentCount: NonNegativeIntegerSchema,
    otherDocumentedTreatmentCount: NonNegativeIntegerSchema,
    unmappedTreatmentCount: NonNegativeIntegerSchema,
    projectedTreatmentCount: NonNegativeIntegerSchema,
    projectedOccurrenceCount: NonNegativeIntegerSchema,
    projectTreatmentRelationshipCount: NonNegativeIntegerSchema,
    projectOccurrenceRelationshipCount: NonNegativeIntegerSchema,
    routeProjectionFailureCount: NonNegativeIntegerSchema,
    checkedEmptyRouteCount: NonNegativeIntegerSchema,
  }),
  sourceStates: Schema.Array(StudioRouteInterventionSourceStateSchema).check(
    Schema.isMinLength(4),
    Schema.isMaxLength(4),
  ),
  familyCounts: Schema.Array(StudioRouteInterventionFamilyCountSchema).check(
    Schema.isMaxLength(STUDIO_INTERVENTION_TREATMENT_FAMILIES.length),
  ),
  stateCounts: Schema.Array(StudioRouteInterventionStateCountSchema).check(
    Schema.isMaxLength(STUDIO_INTERVENTION_LIFECYCLE_STATES.length),
  ),
  projectionFailures: Schema.Array(StudioRouteInterventionProjectionFailureSchema).check(
    Schema.isMaxLength(10_000),
  ),
  reviewedOpenVocabulary: Schema.Struct({
    sha256: Sha256Schema,
    literalCount: NonNegativeIntegerSchema,
    sourceCounts: Schema.Array(StudioRouteInterventionVocabularySourceCountSchema).check(
      Schema.isMaxLength(32),
    ),
  }),
}).annotate(StrictParseOptions);

export type StudioInterventionTreatmentKind = typeof StudioInterventionTreatmentKindSchema.Type;
export type StudioInterventionTreatmentFamily = typeof StudioInterventionTreatmentFamilySchema.Type;
export type StudioInterventionLifecycleState = typeof StudioInterventionLifecycleStateSchema.Type;
export type StudioInterventionDatePrecision = typeof StudioInterventionDatePrecisionSchema.Type;
export type StudioInterventionGeographyScope = typeof StudioInterventionGeographyScopeSchema.Type;
export type StudioRouteInterventionCoverageState =
  typeof StudioRouteInterventionCoverageStateSchema.Type;
export type StudioRouteInterventionSourceKind = typeof StudioRouteInterventionSourceKindSchema.Type;
export type StudioRouteInterventionSourceState =
  typeof StudioRouteInterventionSourceStateSchema.Type;
export type StudioRouteInterventionTreatment = typeof StudioRouteInterventionTreatmentSchema.Type;
export type StudioRouteInterventionRegistryLineage =
  typeof StudioRouteInterventionRegistryLineageSchema.Type;
export type StudioRouteInterventionOccurrence = typeof StudioRouteInterventionOccurrenceSchema.Type;
export type StudioRouteInterventionCurrentState =
  typeof StudioRouteInterventionCurrentStateSchema.Type;
export type StudioRouteInterventionProjectRef = typeof StudioRouteInterventionProjectRefSchema.Type;
export type StudioRouteInterventionSourceGap = typeof StudioRouteInterventionSourceGapSchema.Type;
export type StudioRouteInterventionInventoryBundle =
  typeof StudioRouteInterventionInventoryBundleSchema.Type;
export type StudioRouteInterventionFamilyCount =
  typeof StudioRouteInterventionFamilyCountSchema.Type;
export type StudioRouteInterventionStateCount = typeof StudioRouteInterventionStateCountSchema.Type;
export type StudioRouteInterventionSourceStateSummary =
  typeof StudioRouteInterventionSourceStateSummarySchema.Type;
export type StudioRouteInterventionInventoryIndexRoute =
  typeof StudioRouteInterventionInventoryIndexRouteSchema.Type;
export type StudioRouteInterventionInventoryIndex =
  typeof StudioRouteInterventionInventoryIndexSchema.Type;
export type StudioInterventionFacetIndexRow = typeof StudioInterventionFacetIndexRowSchema.Type;
export type StudioInterventionFacetIndex = typeof StudioInterventionFacetIndexSchema.Type;
export type StudioRouteInterventionProjectionFailure =
  typeof StudioRouteInterventionProjectionFailureSchema.Type;
export type StudioRouteInterventionVocabularySourceCount =
  typeof StudioRouteInterventionVocabularySourceCountSchema.Type;
export type StudioRouteInterventionInventoryReconciliation =
  typeof StudioRouteInterventionInventoryReconciliationSchema.Type;
