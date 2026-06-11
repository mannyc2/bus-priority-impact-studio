import { basename } from "node:path";
import {
  getStudioSeoMetadata,
  injectSeoIntoHtml,
  PUBLIC_STUDIO_ROUTES,
} from "../../../../apps/web/src/studio/seo.js";

const distRoot = "apps/web/dist/client";
const indexPath = `${distRoot}/index.html`;
const badMetadataText = /\b(?:lorem|system gallery)\b/i;

const failures: string[] = [];
const indexFile = Bun.file(indexPath);

if (!(await indexFile.exists())) {
  failures.push(`${indexPath} is missing; run bun --filter @bp/web build first.`);
} else {
  const indexHtml = await indexFile.text();
  const titles = new Set<string>();
  const descriptions = new Set<string>();

  for (const route of PUBLIC_STUDIO_ROUTES) {
    const url = new URL(route.path, "https://example.test");
    const metadata = getStudioSeoMetadata(url);

    if (metadata === null) {
      failures.push(`${route.path}: missing SEO metadata`);
      continue;
    }

    if (metadata.noindex) {
      failures.push(`${route.path}: public route must not be noindex`);
    }

    if (!metadata.title.includes(route.expectedTitleText)) {
      failures.push(
        `${route.path}: title "${metadata.title}" does not include "${route.expectedTitleText}"`,
      );
    }

    if (metadata.description.trim().length < 40) {
      failures.push(`${route.path}: meta description is too short`);
    }

    if (!metadata.canonicalPath.startsWith("/")) {
      failures.push(`${route.path}: canonical path must be root-relative`);
    }

    if (titles.has(metadata.title)) {
      failures.push(`${route.path}: duplicate title "${metadata.title}"`);
    }
    titles.add(metadata.title);

    if (descriptions.has(metadata.description)) {
      failures.push(`${route.path}: duplicate meta description`);
    }
    descriptions.add(metadata.description);

    if (badMetadataText.test(`${metadata.title} ${metadata.description}`)) {
      failures.push(`${route.path}: metadata contains placeholder/debug text`);
    }

    const injected = injectSeoIntoHtml(indexHtml, metadata, url.origin);
    if (!injected.includes(`<title>${escapeForCheck(metadata.title)}</title>`)) {
      failures.push(`${route.path}: injected HTML is missing title`);
    }
    if (
      !injected.includes(`name="description" content="${escapeForCheck(metadata.description)}"`)
    ) {
      failures.push(`${route.path}: injected HTML is missing meta description`);
    }
    if (!injected.includes(`rel="canonical"`)) {
      failures.push(`${route.path}: injected HTML is missing canonical link`);
    }
  }

  const systemMetadata = getStudioSeoMetadata(new URL("/system", "https://example.test"));
  if (systemMetadata?.noindex !== true) {
    failures.push("/system: dev-only route must be noindex in production metadata");
  }

  await checkHashedAssets();
}

if (failures.length > 0) {
  console.error(["web SEO check failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  process.exit(1);
}

console.log(`web SEO check passed (${PUBLIC_STUDIO_ROUTES.length} public routes)`);

async function checkHashedAssets(): Promise<void> {
  const glob = new Bun.Glob("assets/*.{js,css}");
  let assetCount = 0;

  for await (const relativePath of glob.scan({ cwd: distRoot, onlyFiles: true })) {
    assetCount += 1;
    const name = basename(relativePath);
    if (!/^[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{6,}\.(?:js|css)$/.test(name)) {
      failures.push(`${relativePath}: asset filename is not hash-stamped`);
    }
  }

  if (assetCount === 0) {
    failures.push(`${distRoot}/assets: no built JS/CSS assets found`);
  }
}

function escapeForCheck(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
