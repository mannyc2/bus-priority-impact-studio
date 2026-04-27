import { ingestM1RouteSlice, parseM1SliceCliArgs } from "./m1-slice.js";

const result = await ingestM1RouteSlice(parseM1SliceCliArgs(Bun.argv.slice(2)));

console.log(
  [
    `Fetched ${result.summary.routeId} ${result.summary.isoMonth}`,
    `segmentSpeedRows=${result.summary.normalized.segmentSpeedCount}`,
    `routeShapes=${result.summary.normalized.routeShapeCount}`,
    `stops=${result.summary.normalized.stopCount}`,
    `timepointStops=${result.summary.normalized.timepointStopCount}`,
    `ridershipWindows=${result.summary.normalized.ridershipWindowCount}`,
    `totalRidership=${result.summary.normalized.totalRidership}`,
    `rawDir=${result.rawDir}`,
    `workingDir=${result.workingDir}`,
  ].join(" | "),
);
