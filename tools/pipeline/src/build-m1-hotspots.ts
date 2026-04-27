import { buildM1HotspotsFromCli } from "./m1-hotspots.js";

const result = await buildM1HotspotsFromCli(Bun.argv.slice(2));

console.log(
  [
    `Built hotspots for ${result.routeId} ${result.isoMonth}`,
    `hotspots=${result.hotspotCount}`,
    `topScore=${result.topHotspotScore}`,
    result.topRiderImpactScore === undefined
      ? "ridershipWeighted=false"
      : `topRiderImpactScore=${result.topRiderImpactScore}`,
    `artifact=${result.artifactPath}`,
    `summary=${result.summaryPath}`,
  ].join(" | "),
);
