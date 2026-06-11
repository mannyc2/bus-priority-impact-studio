import { describe, expect, test } from "bun:test";
import {
  buildTier2SourceCoverage,
  MEDIA_CONTENT_TYPES,
  renderTier2SourceCoverageMarkdown,
  type Tier2SourceCoverageInputs,
} from "../../../src/commands/audit/_tier2-source-coverage.ts";

function inputs(overrides: Partial<Tier2SourceCoverageInputs> = {}): Tier2SourceCoverageInputs {
  return {
    generatedAt: "2026-06-06T00:00:00.000Z",
    paths: {
      backlogPath: "backlog.json",
      captureManifestPath: "capture.json",
      verifiedCoveragePath: "verified.json",
      derivedSurfacesManifestPath: "surfaces.json",
      reviewedRecordsPath: "reviewed.json",
      publishablePath: "publishable.json",
    },
    backlog: [
      { sourceId: "promoted_pdf", sourceGroup: "sbs", expectedContentType: "pdf", ocrHint: "required" },
      { sourceId: "reviewed_pdf", sourceGroup: "sbs", expectedContentType: "pdf", ocrHint: "required" },
      { sourceId: "extracted_pdf", sourceGroup: "busway", expectedContentType: "pdf", ocrHint: "required" },
      { sourceId: "ocr_only_pdf", sourceGroup: "busway", expectedContentType: "pdf", ocrHint: "required" },
      { sourceId: "captured_pdf_no_ocr", sourceGroup: "busway", expectedContentType: "pdf", ocrHint: "required" },
      { sourceId: "captured_html", sourceGroup: "ace_able", expectedContentType: "html", ocrHint: "not_needed" },
      { sourceId: "missing_pdf", sourceGroup: "busway", expectedContentType: "pdf", ocrHint: "required" },
      { sourceId: "youtube_walkthrough", sourceGroup: "media", expectedContentType: "youtube" },
    ],
    capture: [
      { sourceId: "promoted_pdf", captureStatus: "captured", detectedContentType: "pdf", byteLength: 1000, textExtractionStatus: "ocr_required" },
      { sourceId: "reviewed_pdf", captureStatus: "captured", detectedContentType: "pdf", byteLength: 2000, textExtractionStatus: "ocr_required" },
      { sourceId: "extracted_pdf", captureStatus: "captured", detectedContentType: "pdf", byteLength: 3000, textExtractionStatus: "ocr_required" },
      { sourceId: "ocr_only_pdf", captureStatus: "captured", detectedContentType: "pdf", byteLength: 1500, textExtractionStatus: "ocr_required" },
      { sourceId: "captured_pdf_no_ocr", captureStatus: "captured", detectedContentType: "pdf", byteLength: 1200, textExtractionStatus: "ocr_required" },
      { sourceId: "captured_html", captureStatus: "captured", detectedContentType: "html", byteLength: 500, textExtractionStatus: "html_text" },
      { sourceId: "failed_pdf", captureStatus: "failed", detectedContentType: "pdf" },
    ],
    verifiedCoverage: [
      { sourceId: "promoted_pdf", surfaceCount: 50 },
      { sourceId: "reviewed_pdf", surfaceCount: 40 },
      { sourceId: "extracted_pdf", surfaceCount: 30 },
    ],
    // ocr_only_pdf has OCR-derived surfaces but is NOT in the verified layer.
    derivedSurfaceSourceIds: ["promoted_pdf", "reviewed_pdf", "extracted_pdf", "ocr_only_pdf"],
    derivedSurfacesSummary: { sourceCount: 368, inputRows: 155886 },
    reviewedRecords: [
      { sourceId: "promoted_pdf" },
      { sourceId: "promoted_pdf" },
      { sourceId: "reviewed_pdf" },
    ],
    publishableInterventions: [{ sourceId: "promoted_pdf", routes: ["B46", { routeId: "B82" }] }],
    ...overrides,
  };
}

describe("tier2-source-coverage builder", () => {
  test("computes the available→have funnel at source grain", () => {
    const a = buildTier2SourceCoverage(inputs());
    // backlog has 8, capture adds failed_pdf (not in backlog) → 9 total.
    expect(a.summary.totalSources).toBe(9);
    expect(a.summary.availableInBacklog).toBe(8);
    expect(a.summary.captured).toBe(6);
    expect(a.summary.captureFailed).toBe(1);
    // missing_pdf + youtube_walkthrough are in backlog but never captured.
    expect(a.summary.notCaptured).toBe(2);
    expect(a.summary.notSuccessfullyCaptured).toBe(3);
    // OCR-derived is a superset of verified: 4 OCR-derived, 3 of them verified.
    expect(a.summary.ocrDerivedSources).toBe(4);
    expect(a.summary.extractedSources).toBe(3);
    expect(a.summary.reviewedSources).toBe(2);
    expect(a.summary.promotedSources).toBe(1);
    expect(a.summary.promotedInterventions).toBe(1);
    expect(a.summary.promotedRoutes).toBe(2);
    expect(a.summary.corpusDerivedSurfaceSources).toBe(368);
  });

  test("assigns the furthest stage reached per source", () => {
    const a = buildTier2SourceCoverage(inputs());
    const byId = new Map(a.sources.map((r) => [r.sourceId, r]));
    expect(byId.get("promoted_pdf")?.stage).toBe("promoted");
    expect(byId.get("reviewed_pdf")?.stage).toBe("reviewed");
    expect(byId.get("extracted_pdf")?.stage).toBe("extracted");
    expect(byId.get("ocr_only_pdf")?.stage).toBe("ocr_derived");
    expect(byId.get("captured_pdf_no_ocr")?.stage).toBe("captured");
    expect(byId.get("captured_html")?.stage).toBe("captured");
    expect(byId.get("failed_pdf")?.stage).toBe("capture_failed");
    expect(byId.get("missing_pdf")?.stage).toBe("not_captured");
  });

  test("treats media as a first-class but deferred lane", () => {
    const a = buildTier2SourceCoverage(inputs());
    const yt = a.sources.find((r) => r.sourceId === "youtube_walkthrough");
    expect(yt?.assetClass).toBe("media");
    expect(yt?.mediaKind).toBe("youtube");
    expect(yt?.gaps).toContain("media_transcription_deferred");
    expect(a.mediaLane.knownMediaSources).toBe(1);
    expect(a.mediaLane.ingestedMediaSources).toBe(0);
    // Recognized media content types always appear in the content-type rollup.
    for (const mt of MEDIA_CONTENT_TYPES) {
      expect(a.byContentType.some((c) => c.contentType === mt)).toBe(true);
    }
  });

  test("media lane is always reported even when empty", () => {
    const a = buildTier2SourceCoverage(
      inputs({ backlog: inputs().backlog.filter((s) => s.expectedContentType !== "youtube") }),
    );
    expect(a.mediaLane.knownMediaSources).toBe(0);
    expect(a.mediaLane.note).toContain("first-class but empty");
    expect(a.byContentType.some((c) => c.contentType === "youtube")).toBe(true);
  });

  test("surfaces the available-vs-have gaps with OCR-derived separated from verified", () => {
    const a = buildTier2SourceCoverage(inputs());
    expect(a.gaps.availableNotCaptured.sample).toContain("missing_pdf");
    // Only a captured PDF with no OCR-derived surface is the OCR gap — not HTML,
    // and not a PDF that already has OCR-derived data.
    expect(a.gaps.capturedPdfNotOcrDerived.sample).toContain("captured_pdf_no_ocr");
    expect(a.gaps.capturedPdfNotOcrDerived.sample).not.toContain("captured_html");
    expect(a.gaps.capturedPdfNotOcrDerived.sample).not.toContain("ocr_only_pdf");
    expect(a.gaps.ocrDerivedNotVerified.sample).toContain("ocr_only_pdf");
    expect(a.gaps.verifiedNotReviewed.sample).toContain("extracted_pdf");
    expect(a.gaps.reviewedNotPromoted.sample).toContain("reviewed_pdf");
    expect(a.gaps.reviewedNotPromoted.sample).not.toContain("promoted_pdf");
  });

  test("reconciles downstream sourceIds against the available/capture universe", () => {
    const a = buildTier2SourceCoverage(
      inputs({
        reviewedRecords: [{ sourceId: "promoted_pdf" }, { sourceId: "ghost_reviewed_source" }],
        publishableInterventions: [
          { sourceId: "promoted_pdf", routes: ["B46"] },
          { sourceId: "ghost_promoted_source", routes: ["Q1"] },
        ],
      }),
    );
    expect(a.reconciliation.reviewedSourcesReferenced).toBe(2);
    expect(a.reconciliation.reviewedSourcesUnmatched.sample).toContain("ghost_reviewed_source");
    expect(a.reconciliation.promotedSourcesUnmatched.sample).toContain("ghost_promoted_source");
    expect(a.reconciliation.extractedReviewedOverlap).toBe(1);
  });

  test("renders markdown with the funnel and media note", () => {
    const md = renderTier2SourceCoverageMarkdown(buildTier2SourceCoverage(inputs()));
    expect(md).toContain("# Tier 2 Source Coverage");
    expect(md).toContain("Pipeline funnel");
    expect(md).toContain("Media lane");
  });
});
