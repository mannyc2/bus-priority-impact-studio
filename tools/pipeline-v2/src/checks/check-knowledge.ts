const requiredFiles = [
  "knowledge/index.md",
  "knowledge/log.md",
  "knowledge/AGENTS.md",
  "knowledge/raw/source_manifest.yaml",
];

const wikiLinkPattern = /\[\[(wiki\/[^\]|]+)(?:\|[^\]]*)?\]\]/g;

/**
 * Guards the wiki against silent drift: required files exist, every index link
 * resolves, every wiki page is indexed, and frontmatter `status:` stays inside
 * the enum `knowledge/AGENTS.md` declares.
 */
export async function checkKnowledge(root = "."): Promise<string[]> {
  const at = (path: string) => `${root}/${path}`;
  const errors: string[] = [];

  const missing: string[] = [];
  for (const path of requiredFiles) {
    if (!(await Bun.file(at(path)).exists())) {
      missing.push(path);
    }
  }

  if (missing.length > 0) {
    return [`Missing required knowledge files: ${missing.join(", ")}`];
  }

  const index = await Bun.file(at("knowledge/index.md")).text();
  const linked = new Set<string>();

  for (const [, page] of index.matchAll(wikiLinkPattern)) {
    if (page) {
      linked.add(page);
    }
  }

  for (const page of [...linked].sort()) {
    if (!(await Bun.file(at(`knowledge/${page}.md`)).exists())) {
      errors.push(`knowledge/index.md links a page that does not exist: ${page}`);
    }
  }

  const pages: string[] = [];
  for await (const path of new Bun.Glob("knowledge/wiki/**/*.md").scan({ cwd: root })) {
    pages.push(path);
  }
  pages.sort();

  for (const path of pages) {
    const page = path.slice("knowledge/".length, -".md".length);
    if (!linked.has(page)) {
      errors.push(`knowledge/wiki page has no knowledge/index.md entry: ${path}`);
    }
  }

  const agents = await Bun.file(at("knowledge/AGENTS.md")).text();
  const declaredEnum = agents.match(/^status: ([a-z_|]+)$/m)?.[1];

  if (!declaredEnum) {
    return [...errors, "knowledge/AGENTS.md no longer declares a frontmatter status enum"];
  }

  const allowed = new Set(declaredEnum.split("|"));

  for (const path of pages) {
    const status = (await Bun.file(at(path)).text()).match(/^status: (.+)$/m)?.[1]?.trim();

    if (!status) {
      errors.push(`knowledge/wiki page has no frontmatter status: ${path}`);
    } else if (!allowed.has(status)) {
      errors.push(`knowledge/wiki page has status "${status}" outside the AGENTS.md enum: ${path}`);
    }
  }

  return errors;
}

if (import.meta.main) {
  const errors = await checkKnowledge();

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exit(1);
  }

  console.log(`knowledge check passed (${requiredFiles.length} required files)`);
}
