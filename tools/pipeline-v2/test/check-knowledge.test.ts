import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkKnowledge } from "../src/checks/check-knowledge.ts";

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

/** Writes a minimal, passing knowledge tree, then applies the given overrides. */
async function fixture(overrides: Record<string, string | null> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "check-knowledge-"));
  roots.push(root);

  const files: Record<string, string | null> = {
    "knowledge/index.md": "# Wiki Index\n\n- [[wiki/data/speeds|Speeds]]\n",
    "knowledge/log.md": "# Log\n",
    "knowledge/AGENTS.md":
      "```yaml\nstatus: draft|active|needs_schema_probe|blocked|archived\n```\n",
    "knowledge/raw/source_manifest.yaml": "sources: []\n",
    "knowledge/wiki/data/speeds.md": "---\nstatus: active\n---\n\n# Speeds\n",
    ...overrides,
  };

  for (const [path, contents] of Object.entries(files)) {
    if (contents !== null) {
      await Bun.write(join(root, path), contents);
    }
  }

  return root;
}

test("passes on a tree where every page is indexed and every link resolves", async () => {
  expect(await checkKnowledge(await fixture())).toEqual([]);
});

test("fails when a required knowledge file is missing", async () => {
  const errors = await checkKnowledge(await fixture({ "knowledge/log.md": null }));

  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain("knowledge/log.md");
});

test("fails when the index links a page that does not exist", async () => {
  const errors = await checkKnowledge(
    await fixture({
      "knowledge/index.md":
        "# Wiki Index\n\n- [[wiki/data/speeds|Speeds]]\n- [[wiki/data/gone|Gone]]\n",
    }),
  );

  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain("wiki/data/gone");
});

test("fails when a wiki page has no index entry", async () => {
  const errors = await checkKnowledge(
    await fixture({ "knowledge/wiki/data/orphan.md": "---\nstatus: active\n---\n" }),
  );

  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain("knowledge/wiki/data/orphan.md");
});

test("fails when frontmatter status falls outside the enum AGENTS.md declares", async () => {
  const errors = await checkKnowledge(
    await fixture({ "knowledge/wiki/data/speeds.md": "---\nstatus: complete\n---\n" }),
  );

  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain('status "complete"');
});

test("fails when a wiki page carries no frontmatter status at all", async () => {
  const errors = await checkKnowledge(
    await fixture({ "knowledge/wiki/data/speeds.md": "# Speeds\n" }),
  );

  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain("no frontmatter status");
});
