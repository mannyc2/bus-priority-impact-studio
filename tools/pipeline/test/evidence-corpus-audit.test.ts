import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { auditEvidenceCorpus, evidenceCorpusAuditPath } from "../src/jobs/audit/evidence-corpus.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const month = "2026-03";
const artifactRoot = fromRepoRoot(join("data/working/test-evidence-corpus-audit/artifacts"));

async function resetFixture(): Promise<void> {
  await rm(fromRepoRoot("data/working/test-evidence-corpus-audit"), {
    recursive: true,
    force: true,
  });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

afterEach(resetFixture);

describe("auditEvidenceCorpus", () => {
  test("passes when source eligibility, features, detectors, and queue are linked", async () => {
    await resetFixture();
    await writeJson(join(artifactRoot, "source-coverage", month, "ledger.json"), {
      sources: [
        {
          evidence: {
            detectorEligibility: "automatic_primary",
            primaryEvidenceAllowed: true,
            automaticPromotionAllowed: true,
          },
        },
        {
          evidence: {
            detectorEligibility: "context_only",
            primaryEvidenceAllowed: false,
            automaticPromotionAllowed: false,
          },
        },
      ],
    });
    await writeJson(join(artifactRoot, "findings", month, "signal-features.json"), {
      summary: {
        featureCount: 2,
        contextTouchedFeatureCount: 2,
        contextSourceCount: 3,
      },
    });
    await writeJson(join(artifactRoot, "findings", month, "detector-coverage-audit.json"), {
      detectors: [
        { candidateCount: 1, evidenceCount: 2, coverageCount: 2 },
        { candidateCount: 0, evidenceCount: 0, coverageCount: 2 },
      ],
    });
    await writeJson(join(artifactRoot, "findings", month, "review-queue.json"), {
      totalCandidateCount: 1,
      candidateCount: 1,
      evidenceLinkedCandidateCount: 1,
      unlinkedCandidateCount: 0,
      omittedCandidateCount: 0,
    });

    const audit = await auditEvidenceCorpus({ year: 2026, month: 3, artifactRoot });

    expect(audit.status).toBe("pass");
    expect(audit.sources).toMatchObject({
      sourceCount: 2,
      primaryEvidenceAllowedCount: 1,
      automaticPromotionAllowedCount: 1,
      contextOnlyCount: 1,
    });
    expect(audit.detectors).toMatchObject({
      detectorCount: 2,
      candidateCount: 1,
      evidenceCount: 2,
      coverageCount: 4,
    });
    expect(audit.outputPath).toBe(evidenceCorpusAuditPath(artifactRoot, month));
  });

  test("fails when required artifacts are missing", async () => {
    await resetFixture();

    const audit = await auditEvidenceCorpus({ year: 2026, month: 3, artifactRoot });

    expect(audit.status).toBe("fail");
    expect(audit.gaps).toEqual(
      expect.arrayContaining([
        "source coverage/evidence ledger is missing",
        "route-month signal feature artifact is missing",
        "detector coverage audit artifact is missing",
        "finding review queue artifact is missing",
      ]),
    );
  });
});
