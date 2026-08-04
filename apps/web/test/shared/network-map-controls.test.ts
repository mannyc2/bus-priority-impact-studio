import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  NetworkMapControls,
  NetworkMapMobileOptions,
} from "../../src/components/route/NetworkMapControls.js";
import type { NetworkView } from "../../src/components/route/network-map-model.js";

const SPEED_ALL: NetworkView = { lens: "speed", period: "all", compare: false };

function controls(overrides: { delayEligible?: boolean; amEligible?: boolean; pmEligible?: boolean }) {
  return renderToStaticMarkup(
    createElement(NetworkMapControls, {
      view: SPEED_ALL,
      delayEligible: overrides.delayEligible ?? false,
      amEligible: overrides.amEligible ?? false,
      pmEligible: overrides.pmEligible ?? false,
      lanesVisible: false,
      lanesAvailable: true,
      routeCount: 348,
      coverage: "May 2026",
      verifiedRouteCount: 315,
      browseExpanded: false,
      onViewChange: () => {},
      onLanesChange: () => {},
      onBrowse: () => {},
      onOpenDataNotes: () => {},
    }),
  );
}

describe("network map chrome", () => {
  test("a toggle with one option is not rendered at all", () => {
    /* Facts-absent state: one "Speed" lens and one "All day" period is a tab
       bar with one tab. */
    const bare = controls({});
    expect(bare).not.toContain("Metric lens");
    expect(bare).not.toContain("Time period");
    expect(bare).not.toContain("Rider delay");
  });

  test("a toggle returns as soon as it has a real choice", () => {
    expect(controls({ delayEligible: true })).toContain("Metric lens");
    expect(controls({ amEligible: true })).toContain("Time period");
    expect(controls({ pmEligible: true })).toContain("Time period");
  });

  test("the mobile sheet suppresses the same degenerate toggles", () => {
    const render = (delayEligible: boolean, amEligible: boolean) =>
      renderToStaticMarkup(
        createElement(NetworkMapMobileOptions, {
          view: SPEED_ALL,
          delayEligible,
          amEligible,
          pmEligible: false,
          lanesVisible: false,
          lanesAvailable: true,
          onViewChange: () => {},
          onLanesChange: () => {},
        }),
      );
    expect(render(false, false)).not.toContain("Metric lens");
    expect(render(true, false)).toContain("Metric lens");
    expect(render(false, true)).toContain("Time period");
  });

  test("the borough selector is gone from both mounts", () => {
    /* Operator direction 2026-08-02: deleted rather than restyled. The
       `?borough=` URL contract survives it — see network-map-search tests. */
    const markup = controls({ delayEligible: true, amEligible: true, pmEligible: true });
    expect(markup).not.toContain("Filter by served borough");
    expect(markup).not.toContain("All boroughs");
  });

  test("coverage and the data-notes control moved into the map chrome", () => {
    const markup = controls({});
    expect(markup).toContain("Data through May 2026.");
    expect(markup).toContain("315/348 verified routes.");
    expect(markup).toContain("Data notes");
  });

  test("missing coverage says so rather than inventing a window", () => {
    const markup = renderToStaticMarkup(
      createElement(NetworkMapControls, {
        view: SPEED_ALL,
        delayEligible: false,
        amEligible: false,
        pmEligible: false,
        lanesVisible: false,
        lanesAvailable: true,
        routeCount: 348,
        coverage: null,
        verifiedRouteCount: 0,
        browseExpanded: false,
        onViewChange: () => {},
        onLanesChange: () => {},
        onBrowse: () => {},
        onOpenDataNotes: () => {},
      }),
    );
    expect(markup).toContain("Release coverage unavailable.");
  });
});
