import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { decodeStrict } from "@bp/domain/decode";
import {
  buildMtaWikiRouteFixtureArtifact,
  MtaWikiRouteFixtureReceiptSchema,
} from "../src/commands/studio/build-mta-wiki-route-fixture.ts";
import type {
  CurrentBusRoutesParityAudit,
  CurrentBusRoutesRouteDesignations,
  MtaWikiRouteIdentitySnapshot,
} from "../src/lib/mta-wiki-route-identities.ts";

const fixedSha = "a".repeat(64);
const fixedCommit = "b".repeat(40);

function identity(input: {
  routeId: string;
  displayLabel: string;
  longName: string;
  mode: "local" | "sbs";
  catalogInEffect: "yes" | "no";
}): MtaWikiRouteIdentitySnapshot["service_identities"][number] {
  return {
    source_route_id: input.routeId,
    gtfs_route_id: input.routeId,
    display_label: input.displayLabel,
    route_long_name: input.longName,
    normalized_service_modes: [input.mode],
    catalog_in_effect: input.catalogInEffect,
  } as unknown as MtaWikiRouteIdentitySnapshot["service_identities"][number];
}

function fixtureInputs(): {
  snapshot: MtaWikiRouteIdentitySnapshot;
  parity: CurrentBusRoutesParityAudit;
  designationsByRouteId: ReadonlyMap<string, CurrentBusRoutesRouteDesignations>;
} {
  const snapshot = {
    contract_id: "route-identity-snapshot-v1",
    schema_version: 1,
    service_identities: [
      identity({
        routeId: "B44+",
        displayLabel: "B44-SBS",
        longName: "Sheepshead Bay - Williamsburg",
        mode: "sbs",
        catalogInEffect: "yes",
      }),
      identity({
        routeId: "Q06",
        displayLabel: "Q06",
        longName: "Historical GTFS-only route",
        mode: "local",
        catalogInEffect: "no",
      }),
      identity({
        routeId: "B44",
        displayLabel: "B44",
        longName: "Sheepshead Bay - Williamsburg",
        mode: "local",
        catalogInEffect: "yes",
      }),
    ],
  } as unknown as MtaWikiRouteIdentitySnapshot;
  const parity: CurrentBusRoutesParityAudit = {
    currentBusRoutesSha256: fixedSha,
    effectiveAsOfDate: "2026-07-18",
    currentCatalogRouteCount: 3,
    gtfsRouteCount: 3,
    catalogInEffectIdentityCount: 2,
    descriptorReconciled: true,
    catalogInEffectSetsEqual: false,
    catalogOnlyRouteIds: ["B44X"],
    gtfsOnlyRouteIds: ["Q06"],
    rawRouteTypeCounts: { "3": 3 },
    scheduledInWindowCounts: { yes: 3 },
    reliabilityStatusCounts: { reliable: 3 },
    nonBusOrUnknownExtendedRouteTypeCount: 0,
    externalOnlyRouteRecordCount: 0,
  };
  return {
    snapshot,
    parity,
    designationsByRouteId: new Map([
      ["B44", { routeShortName: "B44", routeTypes: ["Local"], tripTypes: ["1"] }],
      ["B44+", { routeShortName: "B44-SBS", routeTypes: ["SBS"], tripTypes: ["14"] }],
    ]),
  };
}

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function receiptFixture(): unknown {
  return {
    artifactKind: "bp.studio.mta_wiki_route_fixture_receipt.v1",
    schemaVersion: 1,
    authorization: "non_authorizing_read_only_replay_input",
    generatedAt: "2026-07-18T18:05:27.000Z",
    generator: { command: ["bun", "studio", "build-mta-wiki-route-fixture"], commit: fixedCommit },
    inputs: {
      mtaWikiRoot: "<mta-wiki-root>",
      wikiRelease: "v1-rc24",
      manifestRelativePath: "data/exports/releases/v1-rc24/manifest.json",
      manifestSha256: fixedSha,
      routeIdentityRelativePath: "data/exports/releases/v1-rc24/route_identity_snapshot.json",
      routeIdentitySha256: fixedSha,
      routeIdentityContractId: "route-identity-snapshot-v1",
      routeIdentitySchemaVersion: 1,
      currentBusRoutesPath: "<pinned-current-bus-routes-artifact>",
      currentBusRoutesSha256: fixedSha,
      currentBusRoutesEffectiveAsOfDate: "2026-07-18",
    },
    derivation: {
      predicate: "catalog_in_effect=yes",
      currentCatalogRouteCount: 3,
      catalogInEffectIdentityCount: 2,
      outputRouteCount: 2,
      descriptorReconciled: true,
      catalogInEffectSetsEqual: false,
      outputEqualsCatalogInEffectIdentityUniverse: true,
      catalogOnlyRouteIds: ["B44X"],
      gtfsOnlyRouteIds: ["Q06"],
      typedDisagreementsNonfatalForIntersectionFixture: true,
      zeroAnalytics: true,
    },
    output: { logicalPath: "<isolated-output>/routes.json", bytes: 100, sha256: fixedSha },
    determinism: {
      serializationRunCount: 2,
      byteIdentical: true,
      sha256ByRun: [fixedSha, fixedSha],
    },
    legacyContrast: {
      path: "data/artifacts/studio/v1/routes.json",
      sha256: fixedSha,
      usedAsInput: false,
      reason:
        "Historical analytical route projection is recorded only as contrast; it is not an input to this compatibility fixture.",
    },
    approvalsCreated: false,
    publicationPerformed: false,
    deploymentPerformed: false,
  };
}

describe("MTA Wiki route compatibility fixture", () => {
  test("repeats byte-identically while preserving exact B44/B44+ identity and zero analytics", () => {
    const input = fixtureInputs();
    const first = buildMtaWikiRouteFixtureArtifact({
      generatedAt: "2026-07-18T18:05:27.000Z",
      ...input,
    });
    const second = buildMtaWikiRouteFixtureArtifact({
      generatedAt: "2026-07-18T18:05:27.000Z",
      ...input,
    });

    expect(sha256(bytes(first))).toBe(sha256(bytes(second)));
    expect(bytes(first)).toEqual(bytes(second));
    expect(first.routes.map((route) => [route.routeId, route.slug, route.label])).toEqual([
      ["B44", "b44", "B44"],
      ["B44+", "b44-sbs", "B44-SBS"],
    ]);
    expect(first.routes.every((route) => route.speedMph === 0 && route.dailyRiders === 0)).toBe(
      true,
    );
    expect(first.routes[1]?.sbs).toBe(true);
  });

  test("strictly decodes the non-authorizing receipt and rejects false legacy-input claims", () => {
    const receipt = receiptFixture();
    const decoded = decodeStrict(MtaWikiRouteFixtureReceiptSchema)(receipt);
    expect(decoded.generator.commit).toBe(fixedCommit);
    expect(decoded.legacyContrast.usedAsInput).toBe(false);

    const mutated = structuredClone(receipt) as {
      legacyContrast: { usedAsInput: boolean };
    };
    mutated.legacyContrast.usedAsInput = true;
    expect(() => decodeStrict(MtaWikiRouteFixtureReceiptSchema)(mutated)).toThrow();

    const absoluteSourceIdentity = structuredClone(receipt) as {
      inputs: { mtaWikiRoot: string };
    };
    absoluteSourceIdentity.inputs.mtaWikiRoot = "/worktree-only/mta-wiki";
    expect(() => decodeStrict(MtaWikiRouteFixtureReceiptSchema)(absoluteSourceIdentity)).toThrow();
  });

  test("stops on catalog parity or official-label disagreement", () => {
    const badParity = fixtureInputs();
    Object.assign(badParity.parity, { descriptorReconciled: false });
    expect(() =>
      buildMtaWikiRouteFixtureArtifact({
        generatedAt: "2026-07-18T18:05:27.000Z",
        ...badParity,
      }),
    ).toThrow("descriptor must reconcile");

    const badLabel = fixtureInputs();
    const mutable = badLabel.designationsByRouteId as Map<
      string,
      CurrentBusRoutesRouteDesignations
    >;
    mutable.set("B44+", {
      routeShortName: "B44+",
      routeTypes: ["SBS"],
      tripTypes: ["14"],
    });
    expect(() =>
      buildMtaWikiRouteFixtureArtifact({
        generatedAt: "2026-07-18T18:05:27.000Z",
        ...badLabel,
      }),
    ).toThrow("B44+");
  });
});
