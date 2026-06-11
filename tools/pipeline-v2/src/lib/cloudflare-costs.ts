export const CLOUDFLARE_PRICING_AS_OF = "2026-05-24";
export const CLOUDFLARE_WORKERS_PLAN = "workers-paid-standard";

const MILLION = 1_000_000;
const BILLION = 1_000_000_000;

export type CloudflareCostMetric =
  | "d1_rows_read"
  | "d1_rows_written"
  | "d1_storage_gb_month"
  | "r2_class_a_operations"
  | "r2_class_b_operations"
  | "r2_standard_storage_gb_month";

export type CloudflareCostLineInput = {
  metric: CloudflareCostMetric;
  quantity: number;
  includedMonthly: number;
  unit: string;
  billableUnitSize: number;
  pricePerBillableUnitUsd: number;
  notes?: readonly string[];
};

export type CloudflareCostLine = CloudflareCostLineInput & {
  billableQuantityFromZero: number;
  estimatedOverageUsdFromZero: number;
  withinIncludedFromZero: boolean;
};

export type CloudflareCostSummary = {
  schemaVersion: 1;
  pricingAsOf: string;
  accountPlan: typeof CLOUDFLARE_WORKERS_PLAN;
  incrementalBaseSubscriptionUsd: 0;
  estimatedOverageUsdFromZero: number;
  overageLikelyFromThisOperationAlone: boolean;
  lines: CloudflareCostLine[];
  notes: string[];
};

function roundMoney(value: number): number {
  return Math.round(value * 100_000_000) / 100_000_000;
}

function roundUsage(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function billableQuantityFromZero(
  quantity: number,
  includedMonthly: number,
  unitSize: number,
): number {
  const overIncluded = Math.max(0, quantity - includedMonthly);
  if (overIncluded === 0) return 0;
  return Math.ceil(overIncluded / unitSize) * unitSize;
}

export function buildCloudflareCostSummary(
  lines: readonly CloudflareCostLineInput[],
  notes: readonly string[] = [],
): CloudflareCostSummary {
  const estimatedLines = lines.map((line) => {
    const billableQuantity = billableQuantityFromZero(
      line.quantity,
      line.includedMonthly,
      line.billableUnitSize,
    );
    const estimatedOverage =
      (billableQuantity / line.billableUnitSize) * line.pricePerBillableUnitUsd;
    return {
      ...line,
      quantity: roundUsage(line.quantity),
      billableQuantityFromZero: roundUsage(billableQuantity),
      estimatedOverageUsdFromZero: roundMoney(estimatedOverage),
      withinIncludedFromZero: billableQuantity === 0,
    };
  });
  const estimatedOverageUsdFromZero = roundMoney(
    estimatedLines.reduce((sum, line) => sum + line.estimatedOverageUsdFromZero, 0),
  );

  return {
    schemaVersion: 1,
    pricingAsOf: CLOUDFLARE_PRICING_AS_OF,
    accountPlan: CLOUDFLARE_WORKERS_PLAN,
    incrementalBaseSubscriptionUsd: 0,
    estimatedOverageUsdFromZero,
    overageLikelyFromThisOperationAlone: estimatedOverageUsdFromZero > 0,
    lines: estimatedLines,
    notes: [
      "Estimates assume the account is already on the Workers Paid Standard plan, so the existing $5/month subscription is not counted as incremental cost.",
      "The overage check is from zero monthly usage. Compare the quantities with Cloudflare dashboard or GraphQL Analytics API usage for the current billing period before executing near a limit.",
      ...notes,
    ],
  };
}

export function d1PaidCostLines(input: {
  rowsRead?: number;
  rowsWritten?: number;
  storageGbMonth?: number;
}): CloudflareCostLineInput[] {
  return [
    {
      metric: "d1_rows_read",
      quantity: input.rowsRead ?? 0,
      includedMonthly: 25 * BILLION,
      unit: "rows read",
      billableUnitSize: MILLION,
      pricePerBillableUnitUsd: 0.001,
    },
    {
      metric: "d1_rows_written",
      quantity: input.rowsWritten ?? 0,
      includedMonthly: 50 * MILLION,
      unit: "rows written",
      billableUnitSize: MILLION,
      pricePerBillableUnitUsd: 1,
      notes: ["D1 index maintenance can add rows written beyond table-row inserts and deletes."],
    },
    {
      metric: "d1_storage_gb_month",
      quantity: input.storageGbMonth ?? 0,
      includedMonthly: 5,
      unit: "GB-month",
      billableUnitSize: 1,
      pricePerBillableUnitUsd: 0.75,
    },
  ];
}

export function estimateD1PaidCost(
  input: Parameters<typeof d1PaidCostLines>[0],
  notes: readonly string[] = [],
): CloudflareCostSummary {
  return buildCloudflareCostSummary(d1PaidCostLines(input), notes);
}

export function r2StandardCostLines(input: {
  classAOperations?: number;
  classBOperations?: number;
  storageGbMonth?: number;
}): CloudflareCostLineInput[] {
  return [
    {
      metric: "r2_class_a_operations",
      quantity: input.classAOperations ?? 0,
      includedMonthly: 1 * MILLION,
      unit: "operations",
      billableUnitSize: MILLION,
      pricePerBillableUnitUsd: 4.5,
    },
    {
      metric: "r2_class_b_operations",
      quantity: input.classBOperations ?? 0,
      includedMonthly: 10 * MILLION,
      unit: "operations",
      billableUnitSize: MILLION,
      pricePerBillableUnitUsd: 0.36,
    },
    {
      metric: "r2_standard_storage_gb_month",
      quantity: input.storageGbMonth ?? 0,
      includedMonthly: 10,
      unit: "GB-month",
      billableUnitSize: 1,
      pricePerBillableUnitUsd: 0.015,
      notes: ["R2 Standard egress is free; this line only estimates stored data."],
    },
  ];
}

export function estimateR2StandardCost(
  input: Parameters<typeof r2StandardCostLines>[0],
  notes: readonly string[] = [],
): CloudflareCostSummary {
  return buildCloudflareCostSummary(r2StandardCostLines(input), notes);
}
