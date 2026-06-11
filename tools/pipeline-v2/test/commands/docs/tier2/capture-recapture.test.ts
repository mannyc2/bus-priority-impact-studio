import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { recaptureFailedSources } from "../../../../src/commands/docs/tier2/_recapture.ts";
import {
  executableExists,
  type FetchLike,
  type Tier2CapturedSource,
  type Tier2CaptureManifest,
} from "../../../../src/commands/docs/tier2/_shared.ts";
import { writeJson } from "../../../../src/lib/json.ts";

function makeSource(overrides: Partial<Tier2CapturedSource>): Tier2CapturedSource {
  return {
    sourceId: overrides.sourceId ?? "test_pdf",
    title: overrides.title ?? "Test PDF",
    publisher: overrides.publisher ?? "NYC DOT",
    sourceGroup: overrides.sourceGroup ?? "test",
    intendedUse: overrides.intendedUse ?? ["context"],
    priority: overrides.priority ?? 1,
    sourceUrl: overrides.sourceUrl ?? "https://example.org/test.pdf",
    finalUrl: overrides.finalUrl ?? "https://example.org/test.pdf",
    documentDate: overrides.documentDate ?? null,
    retrievedAt: overrides.retrievedAt ?? "2026-05-31T00:00:00.000Z",
    captureStatus: overrides.captureStatus ?? "captured",
    httpStatus: overrides.httpStatus ?? 200,
    contentType: overrides.contentType ?? "text/html",
    detectedContentType: overrides.detectedContentType ?? "html",
    byteLength: overrides.byteLength ?? 12,
    sha256: overrides.sha256 ?? null,
    rawArtifactKey: overrides.rawArtifactKey ?? "sources/test_pdf/source.html",
    textArtifactKey: overrides.textArtifactKey ?? "sources/test_pdf/text.txt",
    textLength: overrides.textLength ?? 12,
    textExtractionStatus: overrides.textExtractionStatus ?? "html_text",
    ocrHint: overrides.ocrHint ?? "required",
    termsNote: overrides.termsNote ?? null,
    error: overrides.error ?? null,
  };
}

describe("recaptureFailedSources", () => {
  test("source filter can repair an already-captured PDF row without treating it as HTML", async () => {
    if (!(await executableExists("pdfinfo"))) {
      return;
    }

    const runRoot = await mkdtemp(join(tmpdir(), "tier2-recapture-"));
    try {
      const pdf = await PDFDocument.create();
      pdf.addPage([72, 72]);
      const pdfBytes = await pdf.save();
      const pdfBody = pdfBytes.buffer.slice(
        pdfBytes.byteOffset,
        pdfBytes.byteOffset + pdfBytes.byteLength,
      ) as ArrayBuffer;
      const captureManifestPath = join(runRoot, "capture-manifest.json");
      const manifest: Tier2CaptureManifest = {
        version: 1,
        runId: "recapture-test",
        generatedAt: "2026-05-31T00:00:00.000Z",
        backlogPath: "fixture/backlog.json",
        artifactRoot: runRoot,
        runArtifactRoot: runRoot,
        summary: {
          sourceCount: 1,
          capturedCount: 1,
          failedCount: 0,
          htmlTextCount: 1,
          ocrRequiredCount: 0,
          metadataOnlyCount: 0,
          totalBytes: 12,
        },
        sources: [makeSource({})],
      };
      await writeJson(captureManifestPath, manifest);

      const fetcher: FetchLike = async (input) => {
        const url = String(input);
        if (url.includes("/cdx/search/cdx")) {
          return Response.json([
            ["urlkey", "timestamp", "original", "statuscode"],
            ["org,example)/test.pdf", "20260530000000", "https://example.org/test.pdf", "200"],
          ]);
        }
        return new Response(pdfBody, {
          headers: { "content-type": "application/pdf" },
        });
      };

      const audit = await recaptureFailedSources({
        captureManifestPath,
        fetcher,
        sourceIds: ["test_pdf"],
        generatedAt: "2026-05-31T12:00:00.000Z",
      });

      expect(audit.summary).toEqual({
        attempted: 1,
        recaptured: 1,
        noSnapshot: 0,
        failed: 0,
      });
      const repaired = ((await Bun.file(captureManifestPath).json()) as Tier2CaptureManifest)
        .sources[0];
      expect(repaired?.detectedContentType).toBe("pdf");
      expect(repaired?.rawArtifactKey).toBe("sources/test_pdf/source.pdf");
      expect(repaired?.textArtifactKey).toBeNull();
      expect(repaired?.textLength).toBe(0);
      expect(repaired?.textExtractionStatus).toBe("ocr_required");
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });
});
