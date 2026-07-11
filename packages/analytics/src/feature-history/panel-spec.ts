import { decodeSchemaStrict } from "../schema-decode.js";
import { Schema } from "effect";

export const SEGMENT_DAYPART_PANEL_V1_ID = "segment_daypart_panel_v1" as const;

export type PanelCoverageState =
  | "available"
  | "available_not_fetched"
  | "upstream_blocked"
  | "downstream_blocked"
  | "derived_not_built"
  | "source_absent";

export type PanelRequiredProduct = {
  readonly productId: string;
  readonly state: PanelCoverageState;
  readonly role: "source" | "derived" | "artifact";
  readonly reason?: string;
};

export type PanelEligibilityRule = {
  readonly ruleId: string;
  readonly description: string;
  readonly threshold?: string | number;
};

export type PanelSpec = {
  readonly panelId: string;
  readonly schemaVersion: number;
  readonly grain: string;
  readonly timeKey: string;
  readonly entityKeys: readonly string[];
  readonly measures: readonly string[];
  readonly joins: readonly string[];
  readonly coverage: readonly string[];
  readonly historyWindow: {
    readonly startMonth: string;
    readonly endMonth: string;
  };
  readonly releaseFilter?: {
    readonly month: string;
  };
  readonly scopeFilter?: {
    readonly routeId?: string;
  };
  readonly requiredProducts: readonly PanelRequiredProduct[];
  readonly eligibilityRules: readonly PanelEligibilityRule[];
  readonly negativeMeaning: string;
};

export type PanelManifest = {
  readonly panelId: string;
  readonly schemaVersion: number;
  readonly generatedAt: string | null;
  readonly spec: PanelSpec;
  readonly inputRefs: readonly {
    readonly refKind: "local_table" | "artifact" | "query" | "fixture";
    readonly refId: string;
    readonly role: string;
    readonly path?: string | null;
    readonly hash?: string | null;
  }[];
  readonly summary: {
    readonly sourceRowCount: number;
    readonly supportedRowCount: number;
    readonly panelRowCount: number;
    readonly routeCount: number;
    readonly entityCount: number;
    readonly monthCount: number;
  };
  readonly limitations: readonly string[];
};

export type SegmentDaypartPanelSpec = {
  readonly panelId: typeof SEGMENT_DAYPART_PANEL_V1_ID;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly minObservationCount: number;
  readonly routeId?: string;
};

const IsoMonthSchema = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/));

export const PanelCoverageStateSchema = Schema.Literals([
  "available",
  "available_not_fetched",
  "upstream_blocked",
  "downstream_blocked",
  "derived_not_built",
  "source_absent",
]);

export const PanelRequiredProductSchema = Schema.Struct({
  productId: Schema.String.check(Schema.isMinLength(1)),
  state: PanelCoverageStateSchema,
  role: Schema.Literals(["source", "derived", "artifact"]),
  reason: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
});

export const PanelEligibilityRuleSchema = Schema.Struct({
  ruleId: Schema.String.check(Schema.isMinLength(1)),
  description: Schema.String.check(Schema.isMinLength(1)),
  threshold: Schema.optionalKey(
    Schema.Union([Schema.String.check(Schema.isMinLength(1)), Schema.Number]),
  ),
});

export const PanelSpecSchema = Schema.Struct({
  panelId: Schema.String.check(Schema.isMinLength(1)),
  schemaVersion: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  grain: Schema.String.check(Schema.isMinLength(1)),
  timeKey: Schema.String.check(Schema.isMinLength(1)),
  entityKeys: Schema.Array(Schema.String.check(Schema.isMinLength(1))).check(Schema.isMinLength(1)),
  measures: Schema.Array(Schema.String.check(Schema.isMinLength(1))).check(Schema.isMinLength(1)),
  joins: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
  coverage: Schema.Array(Schema.String.check(Schema.isMinLength(1))).check(Schema.isMinLength(1)),
  historyWindow: Schema.Struct({
    startMonth: IsoMonthSchema,
    endMonth: IsoMonthSchema,
  }),
  releaseFilter: Schema.optionalKey(
    Schema.Struct({
      month: IsoMonthSchema,
    }),
  ),
  scopeFilter: Schema.optionalKey(
    Schema.Struct({
      routeId: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
    }),
  ),
  requiredProducts: Schema.Array(PanelRequiredProductSchema).check(Schema.isMinLength(1)),
  eligibilityRules: Schema.Array(PanelEligibilityRuleSchema),
  negativeMeaning: Schema.String.check(Schema.isMinLength(1)),
}).check(
  Schema.makeFilter((spec) => {
    const issues: Schema.FilterIssue[] = [];
    if (spec.historyWindow.startMonth > spec.historyWindow.endMonth) {
      issues.push({
        path: ["historyWindow"],
        issue: "Panel history window startMonth must be <= endMonth.",
      });
    }
    if (
      spec.releaseFilter !== undefined &&
      (spec.releaseFilter.month < spec.historyWindow.startMonth ||
        spec.releaseFilter.month > spec.historyWindow.endMonth)
    ) {
      issues.push({
        path: ["releaseFilter", "month"],
        issue: "Panel releaseFilter.month must fall inside the history window.",
      });
    }
    return issues;
  }),
);

export const PanelInputRefSchema = Schema.Struct({
  refKind: Schema.Literals(["local_table", "artifact", "query", "fixture"]),
  refId: Schema.String.check(Schema.isMinLength(1)),
  role: Schema.String.check(Schema.isMinLength(1)),
  path: Schema.optionalKey(Schema.NullOr(Schema.String.check(Schema.isMinLength(1)))),
  hash: Schema.optionalKey(Schema.NullOr(Schema.String.check(Schema.isMinLength(1)))),
});

export const PanelManifestSummarySchema = Schema.Struct({
  sourceRowCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  supportedRowCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  panelRowCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  entityCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  monthCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
});

export const PanelManifestSchema = Schema.Struct({
  panelId: Schema.String.check(Schema.isMinLength(1)),
  schemaVersion: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  generatedAt: Schema.NullOr(Schema.String.check(Schema.isMinLength(1))),
  spec: PanelSpecSchema,
  inputRefs: Schema.Array(PanelInputRefSchema).check(Schema.isMinLength(1)),
  summary: PanelManifestSummarySchema,
  limitations: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
}).check(
  Schema.makeFilter((manifest) => {
    const issues: Schema.FilterIssue[] = [];
    if (manifest.panelId !== manifest.spec.panelId) {
      issues.push({
        path: ["panelId"],
        issue: "PanelManifest.panelId must match PanelManifest.spec.panelId.",
      });
    }
    if (manifest.schemaVersion !== manifest.spec.schemaVersion) {
      issues.push({
        path: ["schemaVersion"],
        issue: "PanelManifest.schemaVersion must match PanelManifest.spec.schemaVersion.",
      });
    }
    return issues;
  }),
);

type PanelInputRef = PanelManifest["inputRefs"][number];

function normalizePanelRequiredProduct(input: {
  readonly productId: string;
  readonly state: PanelCoverageState;
  readonly role: "source" | "derived" | "artifact";
  readonly reason?: string | undefined;
}): PanelRequiredProduct {
  const product: PanelRequiredProduct = {
    productId: input.productId,
    state: input.state,
    role: input.role,
  };
  return input.reason === undefined ? product : { ...product, reason: input.reason };
}

function normalizePanelEligibilityRule(input: {
  readonly ruleId: string;
  readonly description: string;
  readonly threshold?: string | number | undefined;
}): PanelEligibilityRule {
  const rule: PanelEligibilityRule = {
    ruleId: input.ruleId,
    description: input.description,
  };
  return input.threshold === undefined ? rule : { ...rule, threshold: input.threshold };
}

function normalizePanelInputRef(input: {
  readonly refKind: PanelInputRef["refKind"];
  readonly refId: string;
  readonly role: string;
  readonly path?: string | null | undefined;
  readonly hash?: string | null | undefined;
}): PanelInputRef {
  const ref: PanelInputRef = {
    refKind: input.refKind,
    refId: input.refId,
    role: input.role,
  };
  return {
    ...ref,
    ...(input.path === undefined ? {} : { path: input.path }),
    ...(input.hash === undefined ? {} : { hash: input.hash }),
  };
}

export function parsePanelSpec(value: unknown): PanelSpec {
  const parsed = decodeSchemaStrict(PanelSpecSchema, value);
  const spec: PanelSpec = {
    panelId: parsed.panelId,
    schemaVersion: parsed.schemaVersion,
    grain: parsed.grain,
    timeKey: parsed.timeKey,
    entityKeys: parsed.entityKeys,
    measures: parsed.measures,
    joins: parsed.joins,
    coverage: parsed.coverage,
    historyWindow: parsed.historyWindow,
    requiredProducts: parsed.requiredProducts.map(normalizePanelRequiredProduct),
    eligibilityRules: parsed.eligibilityRules.map(normalizePanelEligibilityRule),
    negativeMeaning: parsed.negativeMeaning,
  };
  const scopeFilter =
    parsed.scopeFilter === undefined
      ? undefined
      : parsed.scopeFilter.routeId === undefined
        ? {}
        : { routeId: parsed.scopeFilter.routeId };
  return {
    ...spec,
    ...(parsed.releaseFilter === undefined ? {} : { releaseFilter: parsed.releaseFilter }),
    ...(scopeFilter === undefined ? {} : { scopeFilter }),
  };
}

export function parsePanelManifest(value: unknown): PanelManifest {
  const parsed = decodeSchemaStrict(PanelManifestSchema, value);
  return {
    panelId: parsed.panelId,
    schemaVersion: parsed.schemaVersion,
    generatedAt: parsed.generatedAt,
    spec: parsePanelSpec(parsed.spec),
    inputRefs: parsed.inputRefs.map(normalizePanelInputRef),
    summary: parsed.summary,
    limitations: parsed.limitations,
  };
}

export function segmentDaypartPanelSpecV1(input: SegmentDaypartPanelSpec): PanelSpec {
  const spec: PanelSpec = {
    panelId: SEGMENT_DAYPART_PANEL_V1_ID,
    schemaVersion: 1,
    grain: "route_id + month + direction + segment_id + daypart",
    timeKey: "month",
    entityKeys: ["route_id", "direction", "segment_id", "daypart"],
    measures: ["average_speed_mph", "observation_count", "traversal_count"],
    joins: [],
    coverage: [
      "source_row_count",
      "supported_row_count",
      "segment_daypart_history_month_count",
      "residual_month_daypart_count",
    ],
    historyWindow: {
      startMonth: input.startMonth,
      endMonth: input.endMonth,
    },
    releaseFilter: { month: input.endMonth },
    requiredProducts: [
      {
        productId: "local_route_segment_speed_history",
        state: "available",
        role: "source",
        reason: "Monthly segment daypart speed rows pre-aggregated from local_route_segment_speed.",
      },
    ],
    eligibilityRules: [
      {
        ruleId: "minimum_observation_count",
        description: "Rows with too few source observations are excluded from daypart modeling.",
        threshold: input.minObservationCount,
      },
      {
        ruleId: "positive_traversal_count",
        description: "Rows must have positive traversal support.",
        threshold: "> 0",
      },
    ],
    negativeMeaning:
      "A clean no-hit means the segment-daypart-month was eligible and was not abnormal under this daypart residual model; unsupported rows remain missing/coverage states.",
  };
  return input.routeId === undefined ? spec : { ...spec, scopeFilter: { routeId: input.routeId } };
}
