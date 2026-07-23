import { describe, expect, test } from "bun:test";
import {
  routeRiderDelayHoursForProjection,
  routeScheduleEvidenceCoverage,
  routeScheduledSpeedMphForProjection,
} from "../../../src/commands/studio/_release-segments.ts";
import type { RouteBriefInputArtifact } from "../../../src/commands/studio/_release-types.ts";

describe("Studio release segment evidence", () => {
  test("classifies incomplete scheduled evidence without synthesizing a speed", () => {
    const artifact: RouteBriefInputArtifact = {
      segments: [
        {
          segmentId: "M104:2026-05:S:1:840115:403152",
          direction: "S",
          averageRoadDistanceMiles: 1.2,
        },
        {
          segmentId: "M104:2026-05:S:14:403152:405249",
          direction: "S",
          averageRoadDistanceMiles: 0.5,
        },
      ],
      scheduleComparisons: [
        {
          segmentId: "M104:2026-05:S:1:840115:403152",
          direction: "S",
          scheduledMedianTravelTimeMinutes: null,
        },
        {
          segmentId: "M104:2026-05:S:14:403152:405249",
          direction: "S",
          scheduledMedianTravelTimeMinutes: 4,
        },
      ],
    };

    expect(routeScheduleEvidenceCoverage("M104", artifact)).toEqual({
      status: "incomplete",
      segmentCount: 2,
      matchedSegmentCount: 1,
      missingSegmentIds: ["M104:2026-05:S:1:840115:403152"],
    });
    expect(routeScheduledSpeedMphForProjection("M104", artifact, "incomplete")).toBeNull();
    expect(() => routeScheduledSpeedMphForProjection("M104", artifact, "complete")).toThrow(
      "Missing complete scheduled travel-time evidence",
    );
    expect(routeRiderDelayHoursForProjection("M104", artifact, "incomplete")).toBeNull();
    expect(() => routeRiderDelayHoursForProjection("M104", artifact, "complete")).toThrow(
      "Missing observed-minus-scheduled travel-time evidence",
    );
  });
});
