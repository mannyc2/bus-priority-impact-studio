import { z } from "zod";

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

export function parsePanelSpec(input: unknown): PanelSpec {
  return PanelSpecSchema.parse(input) as PanelSpec;
}

export function parsePanelManifest(input: unknown): PanelManifest {
  return PanelManifestSchema.parse(input) as PanelManifest;
}
