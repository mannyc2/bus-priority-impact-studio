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
// then rule. Plans 079 and 085-087 must shrink, remove, or explicitly preserve
// their own pairs in the same commit as the production edit.
export const MONTH_DOCTRINE_ALLOWLIST = [
  {
    file: "tools/pipeline-v2/src/commands/export/d1-inputs.ts",
    rule: "release-month-identity",
    count: 7,
    disposition: "permanent-frozen-artifact",
    note: "Four legacy timeline reads plus three detector-readiness reads preserve immutable artifact branches.",
  },
  {
    file: "tools/pipeline-v2/src/commands/export/route-capability-manifest.ts",
    rule: "release-month-identity",
    count: 3,
    disposition: "permanent-frozen-artifact",
    note: "The frozen detector-readiness reader preserves its immutable legacy manifest branch.",
  },
  {
    file: "tools/pipeline-v2/src/commands/plan/source-refresh.ts",
    rule: "identity-phrase",
    count: 1,
    disposition: "retire-087",
    note: "Plan 087 removes the final monthly-release operator prose.",
  },
] as const satisfies readonly MonthDoctrineAllowlistEntry[];
