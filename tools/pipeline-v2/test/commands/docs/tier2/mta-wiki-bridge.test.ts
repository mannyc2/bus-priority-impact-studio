import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDocsTier2MtaWikiBridge } from "../../../../src/commands/docs/tier2/mta-wiki-bridge.ts";

async function writeJsonl(path: string, rows: unknown[]): Promise<void> {
  await Bun.write(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

describe("docs tier2 mta-wiki-bridge", () => {
  test("reads canonical JSONL and writes a review queue bridge artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "mta-wiki-bridge-"));
    try {
      const mtaWikiRoot = join(root, "mta-wiki");
      const canonicalRoot = join(mtaWikiRoot, "data", "canonical");
      await mkdir(canonicalRoot, { recursive: true });
      await writeJsonl(join(canonicalRoot, "sources.jsonl"), [
        {
          record_id: "source_m15_report",
          record_kind: "source",
          display_name: "M15 SBS report",
        },
      ]);
      await writeJsonl(join(canonicalRoot, "routes.jsonl"), [
        {
          record_id: "route_m15-sbs",
          record_kind: "route",
          payload: { route_id: "M15 SBS" },
        },
      ]);
      await writeJsonl(join(canonicalRoot, "projects.jsonl"), [
        {
          record_id: "project_m15_sbs",
          record_kind: "project",
          source_id: "source_m15_report",
          payload: { routes_served: ["M15 SBS"] },
          evidence_refs: [{ evidence_id: "source_m15_report#p001_c001" }],
          truth_status: "source_stated",
          review_state: "unreviewed",
        },
      ]);
      await writeJsonl(join(canonicalRoot, "events.jsonl"), [
        {
          record_id: "event_m15_launch",
          record_kind: "event",
          source_id: "source_m15_report",
          payload: { date_normalized: "2010-10-10" },
          truth_status: "source_stated",
          review_state: "unreviewed",
        },
      ]);
      await writeJsonl(join(canonicalRoot, "treatment_components.jsonl"), [
        {
          record_id: "treatment_m15_bus_lane",
          record_kind: "treatment_component",
          source_id: "source_m15_report",
          payload: { treatment_family: "bus_lane" },
          truth_status: "source_stated",
          review_state: "unreviewed",
        },
      ]);
      await writeJsonl(join(canonicalRoot, "relations.jsonl"), [
        {
          record_id: "relation_m15_project",
          record_kind: "relation",
          source_id: "source_m15_report",
          payload: {
            relation_kind: "has_project",
            subject_id: "route_m15-sbs",
            object_id: "project_m15_sbs",
          },
          truth_status: "source_stated",
          review_state: "unreviewed",
        },
      ]);

      const output = join(root, "bridge.json");
      const markdown = join(root, "bridge.md");
      const artifact = await runDocsTier2MtaWikiBridge({
        mtaWikiRoot,
        output,
        markdown,
        generatedAt: "2026-06-11T00:00:00.000Z",
      });

      expect(artifact.outputPath).toBe(output);
      expect(artifact.canonicalRoot).toBe(canonicalRoot);
      expect(artifact.summary.interventionCandidateRecordCount).toBe(3);
      expect(artifact.summary.publicPromotionStatus).toBe("not_ready");
      expect(artifact.reviewGroups[0]?.routeIds).toEqual(["M15"]);
      expect(await Bun.file(output).exists()).toBe(true);
      expect(await Bun.file(markdown).exists()).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
