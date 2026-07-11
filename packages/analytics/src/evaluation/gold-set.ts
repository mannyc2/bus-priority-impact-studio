export type GoldSetExpectation = {
  scopeId: string;
  shouldFlag: boolean;
};

export type GoldSetEvaluation = {
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
};

export function evaluateGoldSet(input: {
  expectations: readonly GoldSetExpectation[];
  flaggedScopes: ReadonlySet<string>;
}): GoldSetEvaluation {
  const result: GoldSetEvaluation = {
    truePositive: 0,
    falsePositive: 0,
    trueNegative: 0,
    falseNegative: 0,
  };

  const expectedScopes = new Set(input.expectations.map((expectation) => expectation.scopeId));
  for (const expectation of input.expectations) {
    const flagged = input.flaggedScopes.has(expectation.scopeId);
    if (expectation.shouldFlag && flagged) result.truePositive += 1;
    else if (expectation.shouldFlag) result.falseNegative += 1;
    else if (flagged) result.falsePositive += 1;
    else result.trueNegative += 1;
  }

  for (const scopeId of input.flaggedScopes) {
    if (!expectedScopes.has(scopeId)) result.falsePositive += 1;
  }

  return result;
}
