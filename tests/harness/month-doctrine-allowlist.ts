export const MONTH_DOCTRINE_RULE_IDS = [
  "analysis-period-identity",
  "identity-phrase",
  "pinned-identity-month",
  "public-month-selector",
  "release-month-identity",
  "retired-identity-token",
  "serialized-release-month",
  "silent-release-default",
] as const;

export type MonthDoctrineRuleId = (typeof MONTH_DOCTRINE_RULE_IDS)[number];

export const MONTH_DOCTRINE_DISPOSITIONS = [
  "retire-079",
  "retire-085",
  "retire-086",
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
export const MONTH_DOCTRINE_ALLOWLIST =
  [] as const satisfies readonly MonthDoctrineAllowlistEntry[];
