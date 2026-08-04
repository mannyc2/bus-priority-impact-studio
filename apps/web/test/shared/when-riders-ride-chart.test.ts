import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChartFrame } from "../../src/components/ChartFrame";
import { formatHourShort } from "../../src/components/route/route-segment-explorer";
import {
  WHEN_RIDERS_RIDE_HOUR_TICKS,
  whenRidersRideRows,
} from "../../src/components/WhenRidersRide.chart";

const boardings = Array.from({ length: 24 }, (_, hour) => (hour === 8 ? 1240 : 300));

describe("WhenRidersRide chart model", () => {
  test("one row per served hour, with the peak the only emphasized bar", () => {
    const rows = whenRidersRideRows(boardings, { hourOfDay: 8 });

    expect(rows).toHaveLength(24);
    expect(rows[8]).toEqual({ hour: "8", value: 1240, isPeak: true });
    expect(rows.filter((row) => row.isPeak)).toHaveLength(1);
  });

  test("no peak in the profile means no emphasized bar at all", () => {
    expect(whenRidersRideRows(boardings).some((row) => row.isPeak)).toBe(false);
  });

  test("hours past a full day are dropped rather than drawn", () => {
    expect(whenRidersRideRows([...boardings, 999])).toHaveLength(24);
  });

  test("the axis keeps the hand-drawn block's clock labels", () => {
    expect(WHEN_RIDERS_RIDE_HOUR_TICKS.map((hour) => formatHourShort(Number(hour)))).toEqual([
      "12A",
      "6A",
      "12P",
      "6P",
      "11P",
    ]);
  });
});

describe("ChartFrame fill mode", () => {
  test("fill grows the body while `height` stays its floor", () => {
    const filled = renderToStaticMarkup(
      createElement(ChartFrame, {
        title: "Speed history",
        height: 172,
        fill: true,
        children: createElement("p", null, "body"),
      }),
    );

    expect(filled).toContain("flex min-w-0 flex-1 flex-col");
    expect(filled).toContain("min-height:172px");
  });

  test("existing fixed-height callers are untouched", () => {
    const fixed = renderToStaticMarkup(
      createElement(ChartFrame, {
        title: "Monthly ridership",
        height: 148,
        children: createElement("p", null, "body"),
      }),
    );

    expect(fixed).toContain("min-height:148px");
    expect(fixed).not.toContain("flex-1");
  });
});
