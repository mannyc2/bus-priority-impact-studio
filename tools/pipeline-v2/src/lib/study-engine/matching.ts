import type { EligibleStudySegment } from "./panel.ts";

export type MatchedStudySegment = {
  readonly treated: EligibleStudySegment;
  readonly controls: readonly EligibleStudySegment[];
};

export type StudySegmentMatchingResult = {
  readonly matches: readonly MatchedStudySegment[];
  readonly droppedInsufficientControlsCount: number;
};

export function matchStudyControls(input: {
  readonly treated: readonly EligibleStudySegment[];
  readonly candidates: readonly EligibleStudySegment[];
  readonly maximumMatches?: number | undefined;
  readonly minimumMatches?: number | undefined;
  readonly speedCaliperShare?: number | undefined;
}): StudySegmentMatchingResult {
  const maximumMatches = input.maximumMatches ?? 4;
  const minimumMatches = input.minimumMatches ?? 2;
  const speedCaliperShare = input.speedCaliperShare ?? 0.2;
  const matches: MatchedStudySegment[] = [];
  let droppedInsufficientControlsCount = 0;

  for (const treated of input.treated) {
    const maximumDifference = Math.abs(treated.preMeanSpeedMph) * speedCaliperShare;
    const controls = input.candidates
      .filter(
        (candidate) =>
          candidate.spineSegmentId !== treated.spineSegmentId &&
          Math.abs(candidate.preMeanSpeedMph - treated.preMeanSpeedMph) <= maximumDifference,
      )
      .toSorted(
        (left, right) =>
          Math.abs(left.preMeanSpeedMph - treated.preMeanSpeedMph) -
            Math.abs(right.preMeanSpeedMph - treated.preMeanSpeedMph) ||
          left.spineSegmentId.localeCompare(right.spineSegmentId),
      )
      .slice(0, maximumMatches);
    if (controls.length < minimumMatches) {
      droppedInsufficientControlsCount += 1;
      continue;
    }
    matches.push({ treated, controls });
  }

  return { matches, droppedInsufficientControlsCount };
}
