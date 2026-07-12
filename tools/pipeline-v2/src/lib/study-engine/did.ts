import type { MatchedStudySegment } from "./matching.ts";
import { type StudyPanelCell, weightedAverage } from "./panel.ts";

export type SegmentDidEstimate = {
  readonly spineSegmentId: string;
  readonly treatedPreMeanMph: number;
  readonly treatedPostMeanMph: number;
  readonly controlPreMeanMph: number;
  readonly controlPostMeanMph: number;
  readonly effectMph: number;
  readonly preTripCount: number;
};

export type MatchedDidEstimate = {
  readonly effectMph: number;
  readonly effectPercent: number | null;
  readonly treatedPreMeanMph: number;
  readonly treatedPostMeanMph: number;
  readonly controlPreMeanMph: number;
  readonly controlPostMeanMph: number;
  readonly perSegment: readonly SegmentDidEstimate[];
};

function windowMean(cells: readonly StudyPanelCell[], months: ReadonlySet<string>): number | null {
  return weightedAverage(
    cells
      .filter((cell) => months.has(cell.month))
      .map((cell) => ({ value: cell.averageSpeedMph, weight: cell.busTripCount })),
  );
}

function controlWindowMean(match: MatchedStudySegment, months: ReadonlySet<string>): number | null {
  return weightedAverage(
    match.controls.flatMap((control) =>
      control.cells
        .filter((cell) => months.has(cell.month))
        .map((cell) => ({ value: cell.averageSpeedMph, weight: cell.busTripCount })),
    ),
  );
}

export function estimateMatchedDid(input: {
  readonly matches: readonly MatchedStudySegment[];
  readonly preMonths: ReadonlySet<string>;
  readonly postMonths: ReadonlySet<string>;
}): MatchedDidEstimate | null {
  const perSegment: SegmentDidEstimate[] = [];
  for (const match of input.matches) {
    const treatedPreMeanMph = windowMean(match.treated.cells, input.preMonths);
    const treatedPostMeanMph = windowMean(match.treated.cells, input.postMonths);
    const controlPreMeanMph = controlWindowMean(match, input.preMonths);
    const controlPostMeanMph = controlWindowMean(match, input.postMonths);
    if (
      treatedPreMeanMph === null ||
      treatedPostMeanMph === null ||
      controlPreMeanMph === null ||
      controlPostMeanMph === null
    ) {
      continue;
    }
    perSegment.push({
      spineSegmentId: match.treated.spineSegmentId,
      treatedPreMeanMph,
      treatedPostMeanMph,
      controlPreMeanMph,
      controlPostMeanMph,
      effectMph: treatedPostMeanMph - treatedPreMeanMph - (controlPostMeanMph - controlPreMeanMph),
      preTripCount: match.treated.preTripCount,
    });
  }
  const effectMph = weightedAverage(
    perSegment.map((segment) => ({ value: segment.effectMph, weight: segment.preTripCount })),
  );
  if (effectMph === null) return null;
  const weighted = (
    field: keyof Pick<
      SegmentDidEstimate,
      "treatedPreMeanMph" | "treatedPostMeanMph" | "controlPreMeanMph" | "controlPostMeanMph"
    >,
  ) =>
    weightedAverage(
      perSegment.map((segment) => ({ value: segment[field], weight: segment.preTripCount })),
    );
  const treatedPreMeanMph = weighted("treatedPreMeanMph");
  const treatedPostMeanMph = weighted("treatedPostMeanMph");
  const controlPreMeanMph = weighted("controlPreMeanMph");
  const controlPostMeanMph = weighted("controlPostMeanMph");
  if (
    treatedPreMeanMph === null ||
    treatedPostMeanMph === null ||
    controlPreMeanMph === null ||
    controlPostMeanMph === null
  ) {
    return null;
  }
  return {
    effectMph,
    effectPercent: treatedPreMeanMph === 0 ? null : (effectMph / treatedPreMeanMph) * 100,
    treatedPreMeanMph,
    treatedPostMeanMph,
    controlPreMeanMph,
    controlPostMeanMph,
    perSegment,
  };
}

export function monthlyMatchedDifferences(
  matches: readonly MatchedStudySegment[],
  months: readonly string[],
): Array<{ readonly month: string; readonly differenceMph: number }> {
  return months.flatMap((month) => {
    const monthSet = new Set([month]);
    const differences = matches.flatMap((match) => {
      const treated = windowMean(match.treated.cells, monthSet);
      const control = controlWindowMean(match, monthSet);
      return treated === null || control === null
        ? []
        : [{ value: treated - control, weight: match.treated.preTripCount }];
    });
    const differenceMph = weightedAverage(differences);
    return differenceMph === null ? [] : [{ month, differenceMph }];
  });
}

export function monthlyMatchedSeries(
  matches: readonly MatchedStudySegment[],
  months: readonly string[],
): Array<{
  readonly month: string;
  readonly treatedMeanMph: number;
  readonly controlMeanMph: number;
  readonly differenceMph: number;
}> {
  return months.flatMap((month) => {
    const monthSet = new Set([month]);
    const treated = weightedAverage(
      matches.flatMap((match) => {
        const mean = windowMean(match.treated.cells, monthSet);
        return mean === null ? [] : [{ value: mean, weight: match.treated.preTripCount }];
      }),
    );
    const control = weightedAverage(
      matches.flatMap((match) => {
        const mean = controlWindowMean(match, monthSet);
        return mean === null ? [] : [{ value: mean, weight: match.treated.preTripCount }];
      }),
    );
    return treated === null || control === null
      ? []
      : [
          {
            month,
            treatedMeanMph: treated,
            controlMeanMph: control,
            differenceMph: treated - control,
          },
        ];
  });
}
