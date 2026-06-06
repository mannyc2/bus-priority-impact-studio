export type ReviewPacketCoverageGateArtifact = {
  readonly summary?: {
    readonly candidateCount?: unknown;
    readonly packetCount?: unknown;
    readonly missingPacketCandidateCount?: unknown;
    readonly packetCompleteDetectorCount?: unknown;
    readonly packetPartialDetectorCount?: unknown;
    readonly packetMissingDetectorCount?: unknown;
    readonly noCandidateDetectorCount?: unknown;
  };
  readonly detectors?: readonly {
    readonly detectorId?: unknown;
    readonly candidateCount?: unknown;
    readonly packetCount?: unknown;
    readonly missingPacketCount?: unknown;
    readonly packetsWithoutPrimaryEvidence?: unknown;
    readonly packetsWithoutCounterEvidence?: unknown;
    readonly packetsWithoutCoverage?: unknown;
    readonly status?: unknown;
  }[];
};

export type ReviewPacketCoverageGate = {
  readonly releaseMonth: string;
  readonly status: "pass" | "warn" | "fail";
  readonly artifactPath: string;
  readonly failOnPartial: boolean;
  readonly summary: {
    readonly candidateCount: number;
    readonly packetCount: number;
    readonly missingPacketCandidateCount: number;
    readonly completeDetectorCount: number;
    readonly partialDetectorCount: number;
    readonly missingDetectorCount: number;
    readonly noCandidateDetectorCount: number;
  };
  readonly gaps: readonly {
    readonly severity: "warn" | "fail";
    readonly detectorId: string;
    readonly status: string;
    readonly candidateCount: number;
    readonly packetCount: number;
    readonly missingPacketCount: number;
    readonly packetsWithoutPrimaryEvidence: number;
    readonly packetsWithoutCounterEvidence: number;
    readonly packetsWithoutCoverage: number;
  }[];
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function evaluateReviewPacketCoverageGate(input: {
  readonly releaseMonth: string;
  readonly artifactPath: string;
  readonly failOnPartial: boolean;
  readonly artifact: ReviewPacketCoverageGateArtifact | null;
}): ReviewPacketCoverageGate {
  if (input.artifact === null) {
    return {
      releaseMonth: input.releaseMonth,
      status: "fail",
      artifactPath: input.artifactPath,
      failOnPartial: input.failOnPartial,
      summary: {
        candidateCount: 0,
        packetCount: 0,
        missingPacketCandidateCount: 0,
        completeDetectorCount: 0,
        partialDetectorCount: 0,
        missingDetectorCount: 0,
        noCandidateDetectorCount: 0,
      },
      gaps: [
        {
          severity: "fail",
          detectorId: "artifact",
          status: "missing",
          candidateCount: 0,
          packetCount: 0,
          missingPacketCount: 0,
          packetsWithoutPrimaryEvidence: 0,
          packetsWithoutCounterEvidence: 0,
          packetsWithoutCoverage: 0,
        },
      ],
    };
  }

  const gaps = (input.artifact.detectors ?? [])
    .map((detector) => {
      const status = text(detector.status) ?? "unknown";
      const candidateCount = numberValue(detector.candidateCount);
      const packetCount = numberValue(detector.packetCount);
      const missingPacketCount = numberValue(detector.missingPacketCount);
      const packetsWithoutPrimaryEvidence = numberValue(detector.packetsWithoutPrimaryEvidence);
      const packetsWithoutCounterEvidence = numberValue(detector.packetsWithoutCounterEvidence);
      const packetsWithoutCoverage = numberValue(detector.packetsWithoutCoverage);
      const severity =
        status === "missing" ||
        missingPacketCount > 0 ||
        packetsWithoutPrimaryEvidence > 0 ||
        packetsWithoutCoverage > 0 ||
        (input.failOnPartial && status === "partial")
          ? "fail"
          : status === "partial" || packetsWithoutCounterEvidence > 0
            ? "warn"
            : null;
      if (severity === null) return null;
      return {
        severity,
        detectorId: text(detector.detectorId) ?? "unknown",
        status,
        candidateCount,
        packetCount,
        missingPacketCount,
        packetsWithoutPrimaryEvidence,
        packetsWithoutCounterEvidence,
        packetsWithoutCoverage,
      };
    })
    .filter((gap): gap is ReviewPacketCoverageGate["gaps"][number] => gap !== null);
  const hasFail = gaps.some((gap) => gap.severity === "fail");
  const status = hasFail ? "fail" : gaps.length > 0 ? "warn" : "pass";
  const summary = input.artifact.summary ?? {};
  return {
    releaseMonth: input.releaseMonth,
    status,
    artifactPath: input.artifactPath,
    failOnPartial: input.failOnPartial,
    summary: {
      candidateCount: numberValue(summary.candidateCount),
      packetCount: numberValue(summary.packetCount),
      missingPacketCandidateCount: numberValue(summary.missingPacketCandidateCount),
      completeDetectorCount: numberValue(summary.packetCompleteDetectorCount),
      partialDetectorCount: numberValue(summary.packetPartialDetectorCount),
      missingDetectorCount: numberValue(summary.packetMissingDetectorCount),
      noCandidateDetectorCount: numberValue(summary.noCandidateDetectorCount),
    },
    gaps,
  };
}
