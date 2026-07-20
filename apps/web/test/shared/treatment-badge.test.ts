import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { routeInterventionViewModel } from "../../src/components/route/route-intervention-model";
import { TreatmentBadgeRow, TreatmentInventory } from "../../src/components/TreatmentBadge";
import type {
  StudioInterventionLifecycleState,
  StudioInterventionTreatmentFamily,
  StudioInterventionTreatmentKind,
  StudioRouteInterventionInventoryBundle,
  StudioRouteInterventionTreatment,
} from "../../src/studio/api-contract";
import { isoMonthFixture } from "./schema-fixtures";

function treatment(
  position: number,
  treatmentKind: StudioInterventionTreatmentKind,
  treatmentFamily: StudioInterventionTreatmentFamily,
  lifecycleState: StudioInterventionLifecycleState,
): StudioRouteInterventionTreatment {
  const id = `treatment:v1:${String(position).padStart(24, "0")}`;
  return {
    treatmentId: id,
    sourceNamespace: "reviewed_intervention_corpus",
    sourceRecordId: `record-${position}`,
    sourceId: "fixture-source",
    componentCollection: "primary",
    componentPosition: position,
    rawKind: treatmentKind,
    rawLabel: null,
    treatmentKind,
    treatmentFamily,
    lifecycleState,
    statusAsOf: null,
    effectiveDate: null,
    datePrecision: "unknown",
    geographyScope: "route",
    sourceRefs: ["source:fixture"],
    occurrenceIds: [],
    projectIds: [],
  };
}

function fixtureBundle(): StudioRouteInterventionInventoryBundle {
  return {
    artifactKind: "bp.studio.route_intervention_inventory_bundle.v1",
    schemaVersion: 1,
    releaseId: "pub_20260718T180527000Z",
    publishedAt: "2026-07-18T18:05:27.000Z",
    coverage: { start: null, end: isoMonthFixture("2026-03") },
    route: {
      routeId: "B44+",
      routeFamilyId: "B44",
      displayLabel: "B44 SBS",
      officialLongName: null,
      designationLiterals: ["route_type:SBS"],
      serviceModes: ["sbs"],
      routeTypes: ["SBS"],
      tripTypes: ["14"],
    },
    routeSlug: "b44-sbs",
    coverageState: "available",
    sourceStates: [],
    treatments: [
      treatment(1, "busway", "bus_priority_lane", "implemented"),
      treatment(2, "transit_signal_priority", "signal_priority", "planned"),
      treatment(3, "automated_bus_lane_enforcement", "enforcement", "current_confirmed"),
    ],
    occurrences: [],
    currentState: [],
    projectRefs: [],
    sourceGaps: [],
  };
}

describe("typed treatment badges", () => {
  const rows = routeInterventionViewModel(fixtureBundle()).treatments;

  test("compact overflow has one keyboard trigger and exposes every hidden full name in SSR", () => {
    const markup = renderToStaticMarkup(
      createElement(TreatmentBadgeRow, { treatments: rows, max: 1 }),
    );

    expect(markup).toContain("Automated bus lane enforcement, Current");
    expect(markup).toContain('aria-label="Show 2 more route treatments"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("Transit signal priority, Planned");
    expect(markup).toContain("Busway, Implemented");
    expect(markup.match(/<button\b/g)).toHaveLength(1);
    expect(markup).not.toMatch(/<button\b[^>]*>[\s\S]*<button\b/u);
  });

  test("the full inventory remains unbounded and gives every record a stable focus target", () => {
    const markup = renderToStaticMarkup(createElement(TreatmentInventory, { treatments: rows }));

    for (const row of rows) {
      expect(markup).toContain(`id="${row.anchorId}"`);
      expect(markup).toContain(row.presentation.label);
      expect(markup).toContain(row.lifecycleLabel);
    }
  });
});
