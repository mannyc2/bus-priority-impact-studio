import { describe, expect, test } from "bun:test";

const forbiddenRuntimeImports = [
  "@bp/analytics",
  "@bp/applied-research",
  "@bp/sources",
  "@bp/pipeline",
  "@bp/pipeline-v2",
  "@bp/db/local",
  "tools/pipeline",
  "tools/pipeline-v2",
  "knowledge/",
];

const requiredRootScripts = {
  pipeline: "bun --filter @bp/pipeline-v2 cli --",
  "check:knowledge": "bun run tools/pipeline-v2/src/checks/check-knowledge.ts",
  "check:web-architecture": "bun test tests/harness/production-boundaries.test.ts --timeout 5000",
  "check:publish-completeness":
    "bun run tools/pipeline-v2/src/checks/check-publish-completeness.ts",
} as const;

async function readFiles(root: string): Promise<Array<{ path: string; text: string }>> {
  const glob = new Bun.Glob("**/*.{ts,tsx}");
  const files: Array<{ path: string; text: string }> = [];

  for await (const path of glob.scan({ cwd: root, onlyFiles: true })) {
    files.push({
      path: `${root}/${path}`,
      text: await Bun.file(`${root}/${path}`).text(),
    });
  }

  return files;
}

function extractModuleSpecifiers(text: string): string[] {
  const specifiers: string[] = [];
  const moduleSpecifierPattern =
    /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of text.matchAll(moduleSpecifierPattern)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

function importsForbiddenSpecifier(text: string, forbiddenSpecifier: string): boolean {
  return extractModuleSpecifiers(text).some((specifier) => {
    if (forbiddenSpecifier.endsWith("/") || forbiddenSpecifier.endsWith(":")) {
      return specifier.startsWith(forbiddenSpecifier);
    }

    return specifier === forbiddenSpecifier || specifier.startsWith(`${forbiddenSpecifier}/`);
  });
}

function importsForbiddenPathSpecifier(text: string, forbiddenPath: string): boolean {
  return extractModuleSpecifiers(text).some((specifier) => {
    const normalized = specifier.replaceAll("\\", "/");
    return (
      normalized === forbiddenPath ||
      normalized.startsWith(`${forbiddenPath}/`) ||
      normalized.includes(`/${forbiddenPath}/`) ||
      normalized.endsWith(`/${forbiddenPath}`)
    );
  });
}

function importsProductionFixture(text: string): string | null {
  return (
    extractModuleSpecifiers(text).find(
      (specifier) =>
        specifier.includes("fixtures/demo-snippets") ||
        specifier.includes("studio/sample-data") ||
        specifier.endsWith("/sample-data.js") ||
        specifier === "../sample-data.js",
    ) ?? null
  );
}

function isPrivateStudioStorageKeyAllowed(path: string): boolean {
  return (
    path.includes("/worker/") ||
    path.endsWith("/studio/sample-data.ts") ||
    path.includes("/scripts/")
  );
}

function hasWildcardReExport(text: string): boolean {
  return /export\s+\*\s+(?:as\s+\w+\s+)?from\s+["'][^"']+["']/.test(text);
}

async function fileExists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

async function findSrcTestFiles(): Promise<string[]> {
  const testFileGlob = new Bun.Glob("**/*.{test,spec}.ts");
  const roots = ["apps", "packages", "tools"];
  const testFiles: string[] = [];

  for (const root of roots) {
    for await (const path of testFileGlob.scan({
      cwd: root,
      onlyFiles: true,
    })) {
      if (path.includes("/src/")) {
        testFiles.push(`${root}/${path}`);
      }
    }
  }

  return testFiles;
}

describe("production boundary harness", () => {
  test("root package exposes v2 pipeline entrypoints and no stale v1 script paths", async () => {
    const rootPackage = (await Bun.file("package.json").json()) as {
      scripts?: Record<string, string>;
    };
    const pipelinePackage = (await Bun.file("tools/pipeline-v2/package.json").json()) as {
      name?: string;
      scripts?: Record<string, string>;
    };

    expect(pipelinePackage.name).toBe("@bp/pipeline-v2");
    const pipelineCliScript = "cli";
    expect(pipelinePackage.scripts?.[pipelineCliScript]).toBe("bun run src/cli.ts");

    for (const [script, command] of Object.entries(requiredRootScripts)) {
      expect(rootPackage.scripts?.[script], `root package ${script} drifted`).toBe(command);
    }

    for (const [script, command] of Object.entries(rootPackage.scripts ?? {})) {
      expect(
        /tools\/pipeline(?!-v2)\//.test(command),
        `root package ${script} still references deleted tools/pipeline`,
      ).toBe(false);
      expect(
        /@bp\/pipeline(?!-v2)\b/.test(command),
        `root package ${script} still references @bp/pipeline`,
      ).toBe(false);
    }
  });

  test("public app code does not import local analytics, source fetchers, pipeline code, or wiki files", async () => {
    const files = await readFiles("apps/web/src");

    for (const file of files) {
      for (const forbiddenImport of forbiddenRuntimeImports) {
        expect(
          importsForbiddenSpecifier(file.text, forbiddenImport),
          `${file.path} imports ${forbiddenImport}`,
        ).toBe(false);
      }
    }
  });

  test("production runtime does not import Studio seed data or dev demo fixtures", async () => {
    const files = (await readFiles("apps/web/src")).filter(
      (file) =>
        !file.path.includes("/dev/") &&
        !file.path.includes("/fixtures/") &&
        !file.path.endsWith("/studio/sample-data.ts"),
    );

    for (const file of files) {
      expect(
        importsProductionFixture(file.text),
        `${file.path} must use /api/v1/studio/* contracts or release artifacts instead of production fixture imports`,
      ).toBeNull();
    }
  });

  test("public Studio runtime keeps R2 projection keys private behind REST resources", async () => {
    const files = (await readFiles("apps/web/src")).filter(
      (file) =>
        !file.path.includes("/dev/") &&
        !file.path.includes("/fixtures/") &&
        !file.path.endsWith("/studio/sample-data.ts"),
    );

    for (const file of files) {
      expect(
        file.text.includes("X-Studio-Projection"),
        `${file.path} must expose RESTful resources, not private R2 projection paths`,
      ).toBe(false);

      if (!isPrivateStudioStorageKeyAllowed(file.path)) {
        // Match `studio/v1/` only as an R2 key — not as part of a URL host
        // like `api.bpi.studio/v1/...`. R2 keys appear as plain identifiers,
        // never preceded by `.` (which would indicate the `.studio` TLD).
        const matches = file.text.match(/(^|[^.])studio\/v1\//);
        expect(
          matches !== null,
          `${file.path} must call /api/v1/studio/* instead of private studio/v1/* storage keys`,
        ).toBe(false);
      }
    }
  });

  test("Plan 097 centralizes Studio R2 reads and leaves only the verified map loader direct", async () => {
    const publicApi = await Bun.file("packages/studio-api/src/public-api.ts").text();
    const projections = await Bun.file("packages/studio-api/src/studio/projections.ts").text();
    const readHandlers = await Bun.file("packages/studio-api/src/studio/read-handlers.ts").text();
    const directGetPattern = /ARTIFACTS\.get\(/g;

    expect(projections.match(directGetPattern) ?? []).toHaveLength(0);
    expect(readHandlers.match(directGetPattern) ?? []).toHaveLength(0);
    expect(publicApi.match(directGetPattern) ?? []).toHaveLength(1);
    expect(publicApi).toContain("env.ARTIFACTS.get(catalog.manifestKey)");
    expect(publicApi).toContain("PLAN097_RECOVERY_NAMESPACE");
  });

  test("Plan 097 keeps production mutation behind the protected atomic transport", async () => {
    const workflow = await Bun.file(".github/workflows/ci.yml").text();
    const productionWrangler = await Bun.file("apps/web/wrangler.jsonc").text();
    const legacyPublisher = await Bun.file("scripts/publish-serving-release.sh").text();
    const recoveryCli = await Bun.file("tools/pipeline-v2/src/commands/publish/recovery.ts").text();
    const operationHandler = await Bun.file(
      "apps/web/src/worker/operations/plan097-recovery.ts",
    ).text();
    const workerFiles = await readFiles("apps/web/src/worker");

    expect(workflow).not.toMatch(/wrangler d1 execute[^\n]*--file/);
    expect(productionWrangler).toContain('"PLAN097_RECOVERY_ENABLED": "true"');
    expect(productionWrangler).toContain(
      '"PLAN097_PREVIOUS_RELEASE_ID": "pub_20260605T183601689Z"',
    );
    expect(productionWrangler).not.toContain("PLAN097_RECOVERY_OPERATION_ENABLED");
    expect(productionWrangler).not.toContain("PLAN097_OPERATIONS");
    expect(legacyPublisher).toContain("Remote execution is disabled during Plan 097");
    expect(recoveryCli).not.toContain("wrangler");
    expect(recoveryCli).not.toContain("d1 execute");
    expect(operationHandler.match(/\.batch\(/g) ?? []).toHaveLength(1);

    for (const file of workerFiles) {
      if (file.path.endsWith("/operations/plan097-recovery.ts")) {
        continue;
      }
      expect(file.text.includes(".batch("), `${file.path} bypasses the Plan 097 batch owner`).toBe(
        false,
      );
    }
  });

  test("Plan 097 proof template cannot bind or route to production", async () => {
    const proofConfig = await Bun.file("apps/web/wrangler.plan097-proof.example.jsonc").text();
    const productionConfig = await Bun.file("apps/web/wrangler.jsonc").text();
    const productionD1Id = productionConfig.match(/"database_id":\s*"([0-9a-f-]{36})"/u)?.[1];

    expect(productionD1Id).toBeDefined();
    expect(proofConfig).not.toContain(productionD1Id);
    expect(proofConfig).not.toMatch(/"database_name":\s*"bus-priority-serving"/u);
    expect(proofConfig).not.toMatch(/"bucket_name":\s*"bus-priority-artifacts"/u);
    expect(proofConfig).not.toMatch(/"routes"\s*:/u);
    expect(proofConfig).not.toMatch(/"triggers"\s*:/u);
    expect(proofConfig).toContain('"workers_dev": true');
    expect(proofConfig).toContain('"preview_urls": false');
    expect(proofConfig).toContain('"PLAN097_PROOF_MODE": "true"');
    expect(proofConfig).toContain('"PLAN097_RECOVERY_ENABLED": "true"');
    expect(proofConfig).toContain('"PLAN097_PREVIOUS_RELEASE_ID": "<previous-release-id>"');
  });

  test("Plan 097 operation templates disable preview-URL bypass", async () => {
    for (const path of [
      "apps/web/wrangler.plan097-preflight.example.jsonc",
      "apps/web/wrangler.plan097-proof.example.jsonc",
      "apps/web/wrangler.plan097-activation.example.jsonc",
    ]) {
      const config = await Bun.file(path).text();
      expect(config).toContain('"workers_dev": true');
      expect(config).toContain('"preview_urls": false');
      expect(config).toContain('"PLAN097_ACCESS_TEAM_DOMAIN"');
      expect(config).toContain('"PLAN097_ACCESS_AUD"');
      expect(config).toContain('"PLAN097_ACCESS_SERVICE_TOKEN_ID"');
      expect(config).not.toContain("PLAN097_SERVICE_TOKEN_SECRET");
      expect(config).not.toMatch(/"routes"\s*:/u);
      expect(config).not.toMatch(/"triggers"\s*:/u);
    }
  });

  test("Plan 097 reader predeploy is receipt-backed and rolls the Worker back on failure", async () => {
    const workflow = await Bun.file(".github/workflows/ci.yml").text();

    expect(workflow).toContain("wrangler deployments status --json");
    expect(workflow).toContain("prior_version_id");
    expect(workflow).toContain("check-plan097-recovery-reader.ts");
    expect(workflow).toContain("plan097-reader-deploy.receipt.json");
    expect(workflow).toContain("plan097-reader-deploy.receipt.sha256");
    expect(workflow).toContain("Roll back Worker on postdeploy failure");
    expect(workflow).toContain("wrangler rollback");
    expect(workflow).toContain("if: failure()");
    expect(workflow).toContain("Upload Plan 097 rollback evidence");
    expect(workflow).toContain("if-no-files-found: error");
    expect(workflow.indexOf("Upload Plan 097 reader predeploy receipts")).toBeLessThan(
      workflow.indexOf("Roll back Worker on postdeploy failure"),
    );
  });

  test("domain package remains infrastructure-free", async () => {
    const files = await readFiles("packages/domain/src");
    const forbiddenImports = [
      "cloudflare",
      "@bp/db",
      "@bp/sources",
      "@bp/analytics",
      "react",
      "fs",
      "node:",
    ];

    for (const file of files) {
      for (const forbiddenImport of forbiddenImports) {
        expect(
          importsForbiddenSpecifier(file.text, forbiddenImport),
          `${file.path} imports ${forbiddenImport}`,
        ).toBe(false);
      }
    }
  });

  test("@bp/analytics stays pure and does not import storage, applied-research, filesystem, or dataframe runtimes", async () => {
    const files = await readFiles("packages/analytics/src");
    const forbiddenImports = [
      "@bp/db",
      "@bp/applied-research",
      "bun:sqlite",
      "fs",
      "node:fs",
      "node:fs/",
      "@tidy-ts/dataframe",
    ];

    for (const file of files) {
      for (const forbiddenImport of forbiddenImports) {
        expect(
          importsForbiddenSpecifier(file.text, forbiddenImport),
          `${file.path} imports ${forbiddenImport}`,
        ).toBe(false);
      }
    }
  });

  test("@bp/applied-research package stays removed after the hard cutover", async () => {
    const tsconfig = (await Bun.file("tsconfig.base.json").json()) as {
      compilerOptions?: { paths?: Record<string, unknown> };
    };
    const pipelinePackage = (await Bun.file("tools/pipeline-v2/package.json").json()) as {
      dependencies?: Record<string, string>;
    };

    expect(await fileExists("packages/applied-research/package.json")).toBe(false);
    expect(tsconfig.compilerOptions?.paths?.["@bp/applied-research"]).toBeUndefined();
    expect(tsconfig.compilerOptions?.paths?.["@bp/applied-research/*"]).toBeUndefined();
    expect(pipelinePackage.dependencies?.["@bp/applied-research"]).toBeUndefined();
  });

  test("Studio API package stays a Cloudflare runtime boundary without UI, pipeline, analytics, or source fetchers", async () => {
    const files = await readFiles("packages/studio-api/src");
    const forbiddenImports = [
      "@/",
      "@bp/analytics",
      "@bp/applied-research",
      "@bp/db/local",
      "@bp/sources",
      "@bp/pipeline",
      "@bp/pipeline-v2",
      "@bp/studio-api",
      "@tanstack/react-router",
      "@tanstack/router-plugin",
      "@vitejs/plugin-react",
      "maplibre-gl",
      "react",
      "react-dom",
      "vite",
      "wrangler",
    ];
    const forbiddenPaths = ["apps", "tools", "knowledge"];

    for (const file of files) {
      for (const forbiddenImport of forbiddenImports) {
        expect(
          importsForbiddenSpecifier(file.text, forbiddenImport),
          `${file.path} imports ${forbiddenImport}`,
        ).toBe(false);
      }

      for (const forbiddenPath of forbiddenPaths) {
        expect(
          importsForbiddenPathSpecifier(file.text, forbiddenPath),
          `${file.path} imports ${forbiddenPath}`,
        ).toBe(false);
      }
    }
  });

  test("pipeline-v2 imports analytics only through package subpaths", async () => {
    const files = await readFiles("tools/pipeline-v2/src");

    for (const file of files) {
      expect(
        importsForbiddenPathSpecifier(file.text, "packages/analytics/src"),
        `${file.path} reaches into packages/analytics/src instead of using @bp/analytics subpaths`,
      ).toBe(false);
    }
  });

  test("Effect-zone source code consumes nyc-transit-kit through native packages, not compat", async () => {
    const files = [
      ...(await readFiles("tools/pipeline-v2/src")),
      ...(await readFiles("packages/sources/src")),
    ];
    const packageJsons = [
      "tools/pipeline-v2/package.json",
      "packages/sources/package.json",
    ] as const;

    for (const file of files) {
      expect(
        importsForbiddenSpecifier(file.text, "@nyc-transit-kit/compat"),
        `${file.path} imports @nyc-transit-kit/compat; Effect-zone code must use native kit APIs/layers`,
      ).toBe(false);
    }

    for (const path of packageJsons) {
      const packageJson = (await Bun.file(path).json()) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };

      const dependencySections = [
        packageJson.dependencies,
        packageJson.devDependencies,
        packageJson.optionalDependencies,
        packageJson.peerDependencies,
      ];

      expect(
        dependencySections.some((dependencies) => dependencies?.["@nyc-transit-kit/compat"]),
        `${path} depends on @nyc-transit-kit/compat; only Promise-edge packages may keep compat`,
      ).toBe(false);
    }
  });

  test("pipeline-v2 command modules keep SQLite runtime construction behind Effect services", async () => {
    const files = await readFiles("tools/pipeline-v2/src/commands");

    for (const file of files) {
      expect(
        /import\s*\{[^}]*\bDatabase\b[^}]*\}\s*from\s*["']bun:sqlite["']/.test(file.text),
        `${file.path} imports bun:sqlite at runtime instead of using an Effect/database boundary`,
      ).toBe(false);
      expect(
        file.text.includes("Database as BunDatabase"),
        `${file.path} imports BunDatabase directly instead of using an Effect/database boundary`,
      ).toBe(false);
      expect(
        file.text.includes("new Database("),
        `${file.path} constructs SQLite directly instead of using an Effect/database boundary`,
      ).toBe(false);
      expect(
        file.text.includes("new BunDatabase("),
        `${file.path} constructs SQLite directly instead of using an Effect/database boundary`,
      ).toBe(false);
      expect(
        file.text.includes("createBunSqliteServingDb"),
        `${file.path} constructs a D1 replay DB directly instead of using the D1 replay boundary`,
      ).toBe(false);
    }
  });

  test("package root barrels use explicit re-exports", async () => {
    const glob = new Bun.Glob("packages/*/src/index.ts");

    for await (const path of glob.scan({ onlyFiles: true })) {
      const text = await Bun.file(path).text();

      expect(hasWildcardReExport(text), `${path} uses a wildcard barrel export`).toBe(false);
    }
  });

  test("@bp/sources exposes only intentional subpath exports", async () => {
    const packageJson = (await Bun.file("packages/sources/package.json").json()) as {
      exports?: Record<string, Record<string, string>>;
    };
    const exportsMap = packageJson.exports ?? {};
    const removedExports = [
      "./mta",
      "./socrata",
      "./nyc-public-data",
      "./nyc-geoclient",
      "./clients/socrata",
      "./clients/socrata/catalog",
      "./clients/socrata/soql",
    ];

    expect(exportsMap["."], "@bp/sources must not expose a root barrel").toBeUndefined();
    for (const exportKey of removedExports) {
      expect(exportsMap[exportKey], `@bp/sources still exposes ${exportKey}`).toBeUndefined();
    }

    for (const [exportKey, conditions] of Object.entries(exportsMap)) {
      for (const [condition, target] of Object.entries(conditions)) {
        expect(
          await fileExists(`packages/sources/${target.replace(/^\.\//, "")}`),
          `@bp/sources export ${exportKey}.${condition} points at missing ${target}`,
        ).toBe(true);
      }
    }
  });

  test("@bp/sources is SODA3-only and keeps Bun/runtime adapters isolated", async () => {
    const files = await readFiles("packages/sources/src");
    const bunAllowed = new Set([
      "packages/sources/src/registry/loaders/bun-yaml.ts",
      "packages/sources/src/probes/transports/bun-curl.ts",
    ]);
    const forbiddenImports = ["apps/", "tools/", "knowledge/", "@bp/db", "@bp/analytics"];

    for (const file of files) {
      expect(file.text.includes("process.env"), `${file.path} reads process.env`).toBe(false);
      expect(file.text.includes("/resource/"), `${file.path} contains a SODA2 /resource path`).toBe(
        false,
      );
      expect(file.text.includes("buildSocrataRowsUrl"), `${file.path} exposes SODA2 rows URL`).toBe(
        false,
      );
      expect(
        file.text.includes("SocrataClient.fromSource"),
        `${file.path} exposes old client`,
      ).toBe(false);

      if (!bunAllowed.has(file.path)) {
        expect(file.text.includes("Bun."), `${file.path} uses Bun outside an adapter`).toBe(false);
      }

      expect(
        extractModuleSpecifiers(file.text).includes("gtfs-realtime-bindings"),
        `${file.path} imports GTFS-RT vendor bindings directly`,
      ).toBe(false);

      for (const forbiddenImport of forbiddenImports) {
        expect(
          importsForbiddenSpecifier(file.text, forbiddenImport),
          `${file.path} imports ${forbiddenImport}`,
        ).toBe(false);
      }
    }
  });

  test("repo code imports @bp/sources through explicit subpaths only", async () => {
    const files = [
      ...(await readFiles("apps")),
      ...(await readFiles("packages")),
      ...(await readFiles("tools")),
      ...(await readFiles("tests")),
    ];

    for (const file of files) {
      expect(
        extractModuleSpecifiers(file.text).includes("@bp/sources"),
        `${file.path} imports the @bp/sources root barrel`,
      ).toBe(false);
    }
  });

  test("repo code does not import zod directly", async () => {
    const files = [
      ...(await readFiles("apps")),
      ...(await readFiles("packages")),
      ...(await readFiles("scripts")),
      ...(await readFiles("tools")),
      ...(await readFiles("tests")),
    ];

    for (const file of files) {
      const zodSpecifier = extractModuleSpecifiers(file.text).find(
        (specifier) => specifier === "zod" || specifier.startsWith("zod/"),
      );

      expect(zodSpecifier, `${file.path} imports ${zodSpecifier ?? "zod"}`).toBeUndefined();
    }
  });

  test("repo code does not import the removed schema compatibility facade", async () => {
    const files = [
      ...(await readFiles("apps")),
      ...(await readFiles("packages")),
      ...(await readFiles("scripts")),
      ...(await readFiles("tools")),
      ...(await readFiles("tests")),
    ];

    const removedCompatibilitySpecifier = `schema-${"compat"}`;
    for (const file of files) {
      const compatibilitySpecifier = extractModuleSpecifiers(file.text).find((specifier) =>
        specifier.includes(removedCompatibilitySpecifier),
      );

      expect(
        compatibilitySpecifier,
        `${file.path} imports ${compatibilitySpecifier ?? removedCompatibilitySpecifier}`,
      ).toBeUndefined();
    }
  });

  test("repo code does not recreate deleted Socrata source-client imports", async () => {
    const files = [
      ...(await readFiles("apps")),
      ...(await readFiles("packages")),
      ...(await readFiles("tools")),
      ...(await readFiles("tests")),
    ];
    const forbiddenSocrataImports = [
      `@bp/sources/clients/${"socrata"}`,
      `@bp/sources/clients/${"socrata"}/catalog`,
      `@bp/sources/clients/${"socrata"}/soql`,
    ];

    for (const file of files) {
      for (const forbiddenImport of forbiddenSocrataImports) {
        expect(
          extractModuleSpecifiers(file.text).includes(forbiddenImport),
          `${file.path} imports deleted ${forbiddenImport}`,
        ).toBe(false);
      }
    }
  });

  test("browser-facing web modules do not import transit kit or source packages", async () => {
    const files = await readFiles("apps/web/src");

    for (const file of files) {
      if (file.path.includes("/worker/")) {
        continue;
      }

      expect(
        importsForbiddenSpecifier(file.text, "@nyc-transit-kit"),
        `${file.path} imports @nyc-transit-kit outside the Worker boundary`,
      ).toBe(false);
      expect(
        importsForbiddenSpecifier(file.text, "@bp/sources"),
        `${file.path} imports @bp/sources outside the Worker boundary`,
      ).toBe(false);
    }
  });

  test("Studio API and web runtime do not import @bp/sources", async () => {
    const files = [
      ...(await readFiles("apps/web/src")),
      ...(await readFiles("packages/studio-api/src")),
    ];

    for (const file of files) {
      expect(
        importsForbiddenSpecifier(file.text, "@bp/sources"),
        `${file.path} imports @bp/sources in runtime code`,
      ).toBe(false);
    }
  });

  test("tests stay out of production src trees", async () => {
    expect(await findSrcTestFiles()).toEqual([]);
  });

  test("new D1 query modules use Drizzle repositories instead of raw D1 prepare calls", async () => {
    const files = await readFiles("packages/db/src/d1/queries");

    for (const file of files) {
      expect(
        file.text.includes(".prepare("),
        `${file.path} uses raw D1 prepare instead of the Drizzle repository surface`,
      ).toBe(false);
    }
  });
});
