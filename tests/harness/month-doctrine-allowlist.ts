export const MONTH_DOCTRINE_RULE_IDS = [
  "analysis-period-identity",
  "identity-phrase",
  "pinned-identity-month",
  "public-month-selector",
  "release-month-identity",
  "retired-identity-token",
  "serialized-release-month",
] as const;

export type MonthDoctrineRuleId = (typeof MONTH_DOCTRINE_RULE_IDS)[number];

export const MONTH_DOCTRINE_DISPOSITIONS = [
  "retire-079",
  "retire-085",
  "retire-086",
  "retire-087",
  "permanent-frozen-artifact",
] as const;

export type MonthDoctrineDisposition = (typeof MONTH_DOCTRINE_DISPOSITIONS)[number];

export type MonthDoctrineAllowlistEntry = {
  file: string;
  rule: MonthDoctrineRuleId;
  count: number;
  disposition: MonthDoctrineDisposition;
  note: string;
};

// Exact occurrence counts at Plan 088 landing. Entries are sorted by file,
// then rule. Every entry is retiring initially; Plans 079 and 085-087 must
// shrink or remove their own pairs in the same commit as the production edit.
export const MONTH_DOCTRINE_ALLOWLIST = [
  {
    file: "packages/analytics/src/data-products/registry.ts",
    rule: "identity-phrase",
    count: 34,
    disposition: "retire-086",
    note: "Plan 086 rewrites registry release-month identity prose.",
  },
  {
    file: "packages/analytics/src/data-products/registry.ts",
    rule: "serialized-release-month",
    count: 70,
    disposition: "retire-086",
    note: "Plan 086 renames all serialized release_month cadence literals.",
  },
  {
    file: "packages/domain/src/studio/projections.ts",
    rule: "retired-identity-token",
    count: 4,
    disposition: "retire-086",
    note: "Plan 086 removes the four legacy static-release payload reads.",
  },
  {
    file: "packages/domain/src/studio/release.ts",
    rule: "retired-identity-token",
    count: 1,
    disposition: "retire-086",
    note: "Plan 086 migrates the top-level static release payload identity.",
  },
  {
    file: "tools/pipeline-v2/src/commands/export/d1-inputs.ts",
    rule: "release-month-identity",
    count: 7,
    disposition: "retire-086",
    note: "Plan 086 audits frozen compatibility reads: legacy timeline 4 plus detector readiness 3.",
  },
  {
    file: "tools/pipeline-v2/src/commands/export/d1.ts",
    rule: "analysis-period-identity",
    count: 2,
    disposition: "retire-086",
    note: "Plan 086 migrates D1 export-summary identity to the release triple.",
  },
  {
    file: "tools/pipeline-v2/src/commands/export/route-capability-manifest.ts",
    rule: "release-month-identity",
    count: 3,
    disposition: "retire-086",
    note: "Plan 086 removes the frozen detector-readiness release-month reads.",
  },
  {
    file: "tools/pipeline-v2/src/commands/plan/source-refresh.ts",
    rule: "identity-phrase",
    count: 1,
    disposition: "retire-087",
    note: "Plan 087 removes the final monthly-release operator prose.",
  },
  {
    file: "tools/pipeline-v2/src/commands/publish/r2-artifacts.ts",
    rule: "identity-phrase",
    count: 1,
    disposition: "retire-086",
    note: "Plan 086 rewrites remaining publish help around covered partitions.",
  },
  {
    file: "tools/pipeline-v2/src/commands/studio/release.ts",
    rule: "pinned-identity-month",
    count: 3,
    disposition: "retire-086",
    note: "Plan 086 deletes one hardcoded default and two pinned local D1 paths.",
  },
  {
    file: "tools/pipeline-v2/src/commands/studio/release.ts",
    rule: "retired-identity-token",
    count: 3,
    disposition: "retire-086",
    note: "Plan 086 migrates the static release payload and pinned default identity.",
  },
] as const satisfies readonly MonthDoctrineAllowlistEntry[];
