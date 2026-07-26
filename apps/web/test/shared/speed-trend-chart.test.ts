import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TrendMarker } from "../../src/components/route/intervention-trend-model";
import {
  buildSpeedTrendChartModel,
  SpeedTrendChart,
  type SpeedTrendProps,
} from "../../src/components/SpeedTrend.chart";

function assertSeriesInputTypes(): void {
  // @ts-expect-error Both series shapes are intentionally invalid.
  const both: SpeedTrendProps = { mode: "calendar", points: [], data: [] };
  // @ts-expect-error A calendar mode without points is intentionally invalid.
  const neither: SpeedTrendProps = { mode: "calendar" };
  void both;
  void neither;
}
void assertSeriesInputTypes;

const marker = {
  month: "2024-06",
  label: "2 enforcement starts, Jun 2024",
  count: 2,
  eventIds: ["event-1", "event-2"],
  occurrenceIds: ["occurrence-1", "occurrence-2"],
  treatmentIds: ["treatment-1", "treatment-2"],
  // The chart draws the label only; it never reads the history anchor.
  recordAnchorId: null,
} satisfies TrendMarker;

describe("SpeedTrend chart model", () => {
  test("keeps the legacy number-vector caller and sequential rows", () => {
    const model = buildSpeedTrendChartModel({ data: [8.25, 8.75] });

    expect(model).toMatchObject({
      rows: [
        { period: 1, value: 8.25 },
        { period: 2, value: 8.75 },
      ],
      xAxisDataKey: "period",
      ticks: [],
      hasObservedData: true,
      yDomain: [7, 10],
      lastObservedPoint: { period: 2, value: 8.75 },
      markers: [],
    });
  });

  test("preserves ordered calendar rows and explicit null gaps", () => {
    const model = buildSpeedTrendChartModel({
      mode: "calendar",
      points: [
        { month: "2024-01", value: 8.25 },
        { month: "2024-02", value: null },
        { month: "2024-03", value: 8.75 },
      ],
    });

    expect(model.rows).toEqual([
      { month: "2024-01", value: 8.25 },
      { month: "2024-02", value: null },
      { month: "2024-03", value: 8.75 },
    ]);
    expect(model.xAxisDataKey).toBe("month");
    expect(model.ticks).toEqual(["2024-01", "2024-03"]);
    expect(model.lastObservedPoint).toEqual({ month: "2024-03", value: 8.75 });
  });

  test("ignores null and nonfinite values in the observed y-domain", () => {
    const model = buildSpeedTrendChartModel({
      mode: "calendar",
      points: [
        { month: "2024-01", value: Number.POSITIVE_INFINITY },
        { month: "2024-02", value: 9.2 },
        { month: "2024-03", value: null },
        { month: "2024-04", value: 8.1 },
      ],
    });

    expect(model.yDomain).toEqual([7, 10]);
    expect(model.lastObservedPoint).toEqual({ month: "2024-04", value: 8.1 });
  });

  test("includes a finite scheduled baseline only after observed data exists", () => {
    const observed = buildSpeedTrendChartModel({
      mode: "calendar",
      points: [{ month: "2024-01", value: 8.1 }],
      scheduled: 11.4,
    });
    const scheduledOnly = buildSpeedTrendChartModel({
      mode: "calendar",
      points: [{ month: "2024-01", value: null }],
      scheduled: 11.4,
    });

    expect(observed.yDomain).toEqual([7, 12]);
    expect(scheduledOnly.hasObservedData).toBe(false);
    expect(scheduledOnly.yDomain).toBeNull();
  });

  test("keeps diagnostics for empty and all-null calendar inputs without inventing a domain", () => {
    const empty = buildSpeedTrendChartModel({ mode: "calendar", points: [] });
    const allNull = buildSpeedTrendChartModel({
      mode: "calendar",
      points: [
        { month: "2024-01", value: null },
        { month: "2024-02", value: null },
      ],
    });

    expect(empty).toMatchObject({
      rows: [],
      ticks: [],
      hasObservedData: false,
      yDomain: null,
      lastObservedPoint: null,
    });
    expect(allNull.rows).toEqual([
      { month: "2024-01", value: null },
      { month: "2024-02", value: null },
    ]);
    expect(allNull.ticks).toEqual(["2024-01", "2024-02"]);
    expect(allNull.hasObservedData).toBe(false);
    expect(allNull.yDomain).toBeNull();
  });

  test("retains markers only for the calendar path", () => {
    const calendar = buildSpeedTrendChartModel({
      mode: "calendar",
      points: [{ month: "2024-06", value: 8.4 }],
      markers: [marker],
    });
    const legacy = buildSpeedTrendChartModel({ data: [8.4], markers: [marker] });

    expect(calendar.markers).toEqual([marker]);
    expect(legacy.markers).toEqual([]);
  });
});

describe("SpeedTrend chart structure", () => {
  test("names the owned chart wrapper and associates its hidden marker summary", () => {
    const markup = renderToStaticMarkup(
      createElement(SpeedTrendChart, {
        mode: "calendar",
        points: [
          { month: "2024-05", value: 8.2 },
          { month: "2024-06", value: 8.4 },
        ],
        markers: [marker],
        seriesLabel: "Monthly observed average speed",
      }),
    );
    const descriptionId = markup.match(/aria-describedby="([^"]+)"/)?.[1];

    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Monthly observed average speed"');
    expect(descriptionId).toBeDefined();
    expect(markup).toContain(`id="${descriptionId}"`);
    expect(markup).toContain("Marked interventions: 2 enforcement starts, Jun 2024.");
  });

  test("renders the honest empty state for an all-null calendar series", () => {
    const markup = renderToStaticMarkup(
      createElement(SpeedTrendChart, {
        mode: "calendar",
        points: [{ month: "2024-05", value: null }],
        scheduled: 10,
      }),
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain("No route speed history is attached yet.");
    expect(markup).not.toContain('role="img"');
  });
});
