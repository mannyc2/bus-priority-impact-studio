export type LatticePositionId = string;
export type LatticeCandidate = string;
export type PowersetLatticeState = Readonly<Record<LatticePositionId, readonly LatticeCandidate[]>>;
export type LatticeSolution = Readonly<Record<LatticePositionId, LatticeCandidate>>;

export type LatticeDeductionInput = {
  state: PowersetLatticeState;
  solutions: readonly LatticeSolution[];
  positionIds?: readonly LatticePositionId[];
};

export type LatticeDeductionResult = {
  status: "conflict" | "partial" | "solved";
  deducedState: Record<LatticePositionId, LatticeCandidate[]>;
  survivingSolutionCount: number;
  eliminatedCandidateCount: number;
  singletonPositionCount: number;
  ambiguousPositionCount: number;
  emptyPositions: LatticePositionId[];
  eliminatedByPosition: Record<LatticePositionId, LatticeCandidate[]>;
};

function uniqueInOrder(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function positionOrder(input: LatticeDeductionInput): LatticePositionId[] {
  return input.positionIds === undefined
    ? Object.keys(input.state)
    : uniqueInOrder(input.positionIds);
}

function solutionConsistentWithState(
  solution: LatticeSolution,
  state: PowersetLatticeState,
  positionIds: readonly LatticePositionId[],
): boolean {
  return positionIds.every((positionId) => {
    const value = solution[positionId];
    return value !== undefined && (state[positionId] ?? []).includes(value);
  });
}

export function abstractSolutions(
  solutions: readonly LatticeSolution[],
  positionIds: readonly LatticePositionId[],
): Record<LatticePositionId, LatticeCandidate[]> {
  const abstracted: Record<LatticePositionId, LatticeCandidate[]> = {};
  for (const positionId of positionIds) {
    abstracted[positionId] = uniqueInOrder(
      solutions.flatMap((solution) => {
        const value = solution[positionId];
        return value === undefined ? [] : [value];
      }),
    );
  }
  return abstracted;
}

export function deducePowersetLattice(input: LatticeDeductionInput): LatticeDeductionResult {
  const positionIds = positionOrder(input);
  const state: Record<LatticePositionId, LatticeCandidate[]> = {};
  for (const positionId of positionIds) {
    state[positionId] = uniqueInOrder(input.state[positionId] ?? []);
  }

  const survivingSolutions = input.solutions.filter((solution) =>
    solutionConsistentWithState(solution, state, positionIds),
  );
  const abstracted = abstractSolutions(survivingSolutions, positionIds);
  const deducedState: Record<LatticePositionId, LatticeCandidate[]> = {};
  const eliminatedByPosition: Record<LatticePositionId, LatticeCandidate[]> = {};

  let eliminatedCandidateCount = 0;
  let singletonPositionCount = 0;
  let ambiguousPositionCount = 0;
  const emptyPositions: LatticePositionId[] = [];

  for (const positionId of positionIds) {
    const alive = state[positionId] ?? [];
    const allowed = new Set(abstracted[positionId] ?? []);
    const deduced = alive.filter((candidate) => allowed.has(candidate));
    const eliminated = alive.filter((candidate) => !allowed.has(candidate));

    deducedState[positionId] = deduced;
    eliminatedByPosition[positionId] = eliminated;
    eliminatedCandidateCount += eliminated.length;

    if (deduced.length === 0) emptyPositions.push(positionId);
    if (deduced.length === 1) singletonPositionCount += 1;
    if (deduced.length > 1) ambiguousPositionCount += 1;
  }

  const status =
    emptyPositions.length > 0
      ? "conflict"
      : singletonPositionCount === positionIds.length
        ? "solved"
        : "partial";

  return {
    status,
    deducedState,
    survivingSolutionCount: survivingSolutions.length,
    eliminatedCandidateCount,
    singletonPositionCount,
    ambiguousPositionCount,
    emptyPositions,
    eliminatedByPosition,
  };
}
