import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MetricCards } from "../../src/studio/pages/methods";

describe("methods metric cards", () => {
  test("renders wording guidance for route-page KPIs", () => {
    const markup = renderToStaticMarkup(createElement(MetricCards));

    expect(markup).toContain("Observed average speed");
    expect(markup).toContain("Six-month route trend");
    expect(markup).toContain("Excess wait and observed headways");
    expect(markup).toContain("Daily riders");
    expect(markup).toContain("Rider-hour burden");
    expect(markup).toContain("Bus-lane coverage and treatment posture");
    expect(markup).toContain("Wiki evidence provenance");
    expect(markup).toContain("We call it");
    expect(markup).toContain("Uncited editorial claims");
  });
});
