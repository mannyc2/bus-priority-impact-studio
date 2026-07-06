import * as z from "@bp/domain/schema-compat";

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

const IsoMonthSchema = z.string().regex(/^\d{4}-\d{2}$/);

export const PanelCoverageStateSchema = z.enum([
  "available",
  "available_not_fetched",
  "upstream_blocked",
  "downstream_blocked",
  "derived_not_built",
  "source_absent",
]);

export const PanelRequiredProductSchema = z.strictObject({
  productId: z.string().min(1),
  state: PanelCoverageStateSchema,
  role: z.enum(["source", "derived", "artifact"]),
  reason: z.string().min(1).optional(),
});

export const PanelEligibilityRuleSchema = z.strictObject({
  ruleId: z.string().min(1),
  description: z.string().min(1),
  threshold: z.union([z.string().min(1), z.number()]).optional(),
});

export const PanelSpecSchema = z
  .strictObject({
    panelId: z.string().min(1),
    schemaVersion: z.number().int().positive(),
    grain: z.string().min(1),
    timeKey: z.string().min(1),
    entityKeys: z.array(z.string().min(1)).min(1),
    measures: z.array(z.string().min(1)).min(1),
    joins: z.array(z.string().min(1)),
    coverage: z.array(z.string().min(1)).min(1),
    historyWindow: z.strictObject({
      startMonth: IsoMonthSchema,
      endMonth: IsoMonthSchema,
    }),
    releaseFilter: z
      .strictObject({
        month: IsoMonthSchema,
      })
      .optional(),
    scopeFilter: z
      .strictObject({
        routeId: z.string().min(1).optional(),
      })
      .optional(),
    requiredProducts: z.array(PanelRequiredProductSchema).min(1),
    eligibilityRules: z.array(PanelEligibilityRuleSchema),
    negativeMeaning: z.string().min(1),
  })
  .superRefine((spec, context) => {
    if (spec.historyWindow.startMonth > spec.historyWindow.endMonth) {
      context.addIssue({
        code: "custom",
        path: ["historyWindow"],
        message: "Panel history window startMonth must be <= endMonth.",
      });
    }
    if (
      spec.releaseFilter !== undefined &&
      (spec.releaseFilter.month < spec.historyWindow.startMonth ||
        spec.releaseFilter.month > spec.historyWindow.endMonth)
    ) {
      context.addIssue({
        code: "custom",
        path: ["releaseFilter", "month"],
        message: "Panel releaseFilter.month must fall inside the history window.",
      });
    }
  });

export const PanelInputRefSchema = z.strictObject({
  refKind: z.enum(["local_table", "artifact", "query", "fixture"]),
  refId: z.string().min(1),
  role: z.string().min(1),
  path: z.string().min(1).nullable().optional(),
  hash: z.string().min(1).nullable().optional(),
});

export const PanelManifestSummarySchema = z.strictObject({
  sourceRowCount: z.number().int().nonnegative(),
  supportedRowCount: z.number().int().nonnegative(),
  panelRowCount: z.number().int().nonnegative(),
  routeCount: z.number().int().nonnegative(),
  entityCount: z.number().int().nonnegative(),
  monthCount: z.number().int().nonnegative(),
});

export const PanelManifestSchema = z
  .strictObject({
    panelId: z.string().min(1),
    schemaVersion: z.number().int().positive(),
    generatedAt: z.string().min(1).nullable(),
    spec: PanelSpecSchema,
    inputRefs: z.array(PanelInputRefSchema).min(1),
    summary: PanelManifestSummarySchema,
    limitations: z.array(z.string().min(1)),
  })
  .superRefine((manifest, context) => {
    if (manifest.panelId !== manifest.spec.panelId) {
      context.addIssue({
        code: "custom",
        path: ["panelId"],
        message: "PanelManifest.panelId must match PanelManifest.spec.panelId.",
      });
    }
    if (manifest.schemaVersion !== manifest.spec.schemaVersion) {
      context.addIssue({
        code: "custom",
        path: ["schemaVersion"],
        message: "PanelManifest.schemaVersion must match PanelManifest.spec.schemaVersion.",
      });
    }
  });

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
  const parsed = PanelSpecSchema.parse(value);
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
  const parsed = PanelManifestSchema.parse(value);
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
