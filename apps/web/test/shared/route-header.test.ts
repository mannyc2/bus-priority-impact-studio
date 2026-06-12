import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RouteHeader } from "../../src/components/route/RouteHeader";
import { studioRoutes } from "../../src/studio/sample-data";

describe("RouteHeader", () => {
  test("renders the route dossier archetype as header context", () => {
    const route = studioRoutes[0];
    if (!route) throw new Error("Expected studio route fixture");

    const html = renderToStaticMarkup(
      createElement(RouteHeader, {
        route,
        contextLabel: "Flagship dossier",
        metricStrip: createElement("div", null, "metrics"),
      }),
    );

    expect(html).toContain("Flagship dossier");
    expect(html).toContain("metrics");
  });
});
