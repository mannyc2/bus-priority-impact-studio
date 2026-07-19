import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import {
  assertMtaWikiRouteFixtureDestinationSafety,
  assertMtaWikiRouteFixtureGeneratorGitState,
  buildMtaWikiRouteFixtureArtifact,
  MtaWikiRouteFixtureReceiptSchema,
  verifyLegacyRouteArtifactContrast,
} from "../src/commands/studio/build-mta-wiki-route-fixture.ts";
import type {
  CurrentBusRoutesParityAudit,
  CurrentBusRoutesRouteDesignations,
  MtaWikiRouteIdentitySnapshot,
} from "../src/lib/mta-wiki-route-identities.ts";

const fixedSha = "a".repeat(64);
const fixedCommit = "b".repeat(40);
const repositoryRoot = join(import.meta.dir, "../../..");
const rc24ReceiptPath = join(
  repositoryRoot,
  "docs/research/artifacts/mta-wiki-v1-rc24-route-fixture-receipt.json",
);

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
      routeAnchorRelativePath: "data/exports/releases/v1-rc24/route_anchors.jsonl",
      routeAnchorSha256: fixedSha,
      currentBusRoutesPath: "<pinned-current-bus-routes-artifact>",
      currentBusRoutesSha256: fixedSha,
      currentBusRoutesEffectiveAsOfDate: "2026-07-18",
    },
    releaseVerification: {
      addressedManifestFileCount: 258,
      verifiedManifestFileCount: 258,
      completeReleaseFileCount: 259,
      serviceIdentityCount: 399,
      recordBindingCount: 395,
      projectableRecordBindingCount: 274,
      nonProjectableRecordBindingCount: 121,
      routeAnchorCount: 520,
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
      bytes: 1_227_966,
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
    expect(first).toEqual(
      expect.objectContaining({
        releaseId: "pub_20260718T180527000Z",
        publishedAt: "2026-07-18T18:05:27.000Z",
        coverage: { start: null, end: "2026-07" },
      }),
    );
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

    const unsafeLegacyPath = structuredClone(receipt) as {
      legacyContrast: { path: string };
    };
    unsafeLegacyPath.legacyContrast.path = "../routes.json";
    expect(() => decodeStrict(MtaWikiRouteFixtureReceiptSchema)(unsafeLegacyPath)).toThrow();
  });

  test("rejects destinations that could overwrite a release, receipt, or pinned input", async () => {
    const root = await mkdtemp(join(repositoryRoot, ".route-fixture-destinations-"));
    try {
      const release = join(root, "release");
      const output = join(root, "output.json");
      const receipt = join(root, "receipt.json");
      const current = join(root, "current.json");
      const legacy = join(root, "legacy.json");
      await mkdir(release);
      await Promise.all([
        writeFile(join(release, "manifest.json"), "{}\n"),
        writeFile(current, "{}\n"),
        writeFile(legacy, "{}\n"),
      ]);
      const base = {
        outputPath: output,
        receiptPath: receipt,
        releaseDirectory: release,
        currentBusRoutesPath: current,
        legacyRouteArtifactPath: legacy,
      };
      await expect(
        assertMtaWikiRouteFixtureDestinationSafety({ ...base, receiptPath: output }),
      ).rejects.toThrow("must be distinct");
      await expect(
        assertMtaWikiRouteFixtureDestinationSafety({
          ...base,
          receiptPath: join(release, "manifest.json"),
        }),
      ).rejects.toThrow("must not overwrite the pinned MTA Wiki release");
      expect(await Bun.file(output).exists()).toBe(false);
      await expect(
        assertMtaWikiRouteFixtureDestinationSafety({ ...base, outputPath: current }),
      ).rejects.toThrow("must not overwrite a pinned input artifact");
      await expect(assertMtaWikiRouteFixtureDestinationSafety(base)).resolves.toBeUndefined();
      await expect(
        assertMtaWikiRouteFixtureDestinationSafety({
          ...base,
          outputPath: join(root, "nested"),
          receiptPath: join(root, "nested", "receipt.json"),
        }),
      ).rejects.toThrow("must be distinct and disjoint");
      await writeFile(output, "preexisting\n");
      await expect(assertMtaWikiRouteFixtureDestinationSafety(base)).rejects.toThrow(
        "output destination must not already exist",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("requires a portable legacy contrast path whose supplied SHA matches real bytes", async () => {
    const root = await mkdtemp(join(repositoryRoot, ".route-fixture-legacy-"));
    try {
      const path = join(root, "routes.json");
      const content = new TextEncoder().encode('{"legacy":true}\n');
      await writeFile(path, content);
      const logicalPath = relative(repositoryRoot, path).replaceAll("\\", "/");
      await expect(
        verifyLegacyRouteArtifactContrast({
          relativePath: logicalPath,
          expectedSha256: sha256(content),
        }),
      ).resolves.toMatchObject({ logicalPath });
      await expect(
        verifyLegacyRouteArtifactContrast({
          relativePath: logicalPath,
          expectedSha256: fixedSha,
        }),
      ).rejects.toThrow("SHA-256 mismatch");
      await expect(
        verifyLegacyRouteArtifactContrast({
          relativePath: "../routes.json",
          expectedSha256: fixedSha,
        }),
      ).rejects.toThrow();
      await expect(
        verifyLegacyRouteArtifactContrast({
          relativePath: path,
          expectedSha256: fixedSha,
        }),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("requires the supplied generator commit to be exact HEAD with no tracked changes", () => {
    expect(() =>
      assertMtaWikiRouteFixtureGeneratorGitState({
        generatorCommit: fixedCommit,
        headCommit: fixedCommit,
        trackedStatus: "",
      }),
    ).not.toThrow();
    expect(() =>
      assertMtaWikiRouteFixtureGeneratorGitState({
        generatorCommit: fixedCommit,
        headCommit: "c".repeat(40),
        trackedStatus: "",
      }),
    ).toThrow("must exactly equal current HEAD");
    expect(() =>
      assertMtaWikiRouteFixtureGeneratorGitState({
        generatorCommit: fixedCommit,
        headCommit: fixedCommit,
        trackedStatus: " M tools/pipeline-v2/src/lib/mta-wiki-route-identities.ts\n",
      }),
    ).toThrow("requires a clean tracked index and worktree");
  });

  test("binds the checked-in rc24 receipt to the normalized reproducible fixture", async () => {
    const receiptBytes = new Uint8Array(await Bun.file(rc24ReceiptPath).arrayBuffer());
    const serializedReceipt = new TextDecoder().decode(receiptBytes);
    const receipt = decodeStrict(MtaWikiRouteFixtureReceiptSchema)(JSON.parse(serializedReceipt));

    expect(sha256(receiptBytes)).toBe(
      "df0041567fe883e2f2e7ff38dd3e32313a25f266da4d0dfe19a32e5a132c8dde",
    );
    expect(receipt.generator.commit).toBe("0095126a0558dcafc121d1cc2f4a05c43bff2927");
    expect(receipt.inputs).toMatchObject({
      mtaWikiRoot: "<mta-wiki-root>",
      currentBusRoutesPath: "<pinned-current-bus-routes-artifact>",
      routeAnchorRelativePath: "data/exports/releases/v1-rc24/route_anchors.jsonl",
      routeAnchorSha256: "aaf8bb1532587c2aea188a7f7cc84a358b5a0a49106a07282fd6c5d05cfdc222",
    });
    expect(receipt.releaseVerification).toEqual({
      addressedManifestFileCount: 258,
      verifiedManifestFileCount: 258,
      completeReleaseFileCount: 259,
      serviceIdentityCount: 399,
      recordBindingCount: 395,
      projectableRecordBindingCount: 274,
      nonProjectableRecordBindingCount: 121,
      routeAnchorCount: 520,
    });
    expect(
      receipt.releaseVerification.projectableRecordBindingCount +
        receipt.releaseVerification.nonProjectableRecordBindingCount,
    ).toBe(receipt.releaseVerification.recordBindingCount);
    expect(
      receipt.releaseVerification.serviceIdentityCount +
        receipt.releaseVerification.nonProjectableRecordBindingCount,
    ).toBe(receipt.releaseVerification.routeAnchorCount);
    expect(receipt.output).toEqual({
      logicalPath: "<isolated-output>/routes.json",
      bytes: 425_573,
      sha256: "4994963c748a27283b837c1ec08b82ffae7fa2099ae360c611d9a7be32002290",
    });
    expect(receipt.derivation).toMatchObject({
      currentCatalogRouteCount: 386,
      catalogInEffectIdentityCount: 375,
      outputRouteCount: 375,
    });
    expect(receipt.legacyContrast).toMatchObject({
      path: "data/artifacts/studio/v1/routes.json",
      bytes: 1_227_966,
      sha256: "8fa238d0b5d813244ef1fcf64ade28051d11eb4b3e8c55fec9500ce0a614e56f",
      usedAsInput: false,
    });
    expect(serializedReceipt).not.toContain("/home/");
    expect(serializedReceipt).not.toContain("/tmp/");
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
