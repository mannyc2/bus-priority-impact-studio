// Source-asset coverage index for the Tier 2 document/media corpus.
//
// This joins the *available* universe (the reviewed/augmented source backlog)
// against what we actually *have* at each downstream stage — captured, extracted
// to verified surfaces, reviewed into intervention records, and promoted to the
// publishable timeline — at the source grain. It is the "what is available vs
// what we have" inventory; the existing `audit tier2-structured-data` indexes
// extraction *artifacts*, and `docs tier2 discovery-coverage` works at the OCR
// page-window grain. Neither answers the source-asset question this does.
//
// Media (YouTube / audio / video) is a first-class but currently-empty lane:
// the corpus has no media sources yet (transcription is deferred), so the index
// always reports the media lane explicitly rather than hiding the gap.

// Content types that mean "this is a media asset, not a text document". None are
// ingested today; the lane exists so adding a media source flows through as
// available-but-not-captured with transcription deferred.
export const MEDIA_CONTENT_TYPES = ["youtube", "video", "audio", "podcast", "media"] as const;

export type Tier2AssetClass = "document" | "media";

export type Tier2SourceStage =
  | "not_captured"
  | "capture_failed"
  | "captured"
  | "ocr_derived"
  | "extracted"
  | "reviewed"
  | "promoted";

export type Tier2BacklogSource = {
  sourceId: string;
  title?: string | null;
  publisher?: string | null;
  sourceGroup?: string | null;
  priority?: number | null;
  url?: string | null;
  expectedContentType?: string | null;
  ocrHint?: string | null;
  intendedUse?: string[] | null;
};

export type Tier2CaptureSource = {
  sourceId: string;
  title?: string | null;
  publisher?: string | null;
  sourceGroup?: string | null;
  priority?: number | null;
  finalUrl?: string | null;
  captureStatus?: string | null;
  detectedContentType?: string | null;
  byteLength?: number | null;
  textExtractionStatus?: string | null;
  ocrHint?: string | null;
};

export type Tier2VerifiedCoverageRow = {
  sourceId: string;
  surfaceCount?: number | null;
};

export type Tier2RecordRef = { sourceId?: string | null };

export type Tier2PublishableRef = {
  sourceId?: string | null;
  routes?: Array<string | { routeId?: string | null } | null> | null;
};

export type Tier2DerivedSurfacesSummary = {
  sourceCount?: number | null;
  inputRows?: number | null;
} | null;

export type Tier2SourceCoverageRow = {
  sourceId: string;
  title: string | null;
  publisher: string | null;
  sourceGroup: string;
  priority: number | null;
  url: string | null;
  expectedContentType: string | null;
  detectedContentType: string | null;
  assetClass: Tier2AssetClass;
  mediaKind: string | null;
  intendedUse: string[];
  inBacklog: boolean;
  captureStatus: "captured" | "failed" | "not_attempted";
  byteLength: number | null;
  textExtractionStatus: string | null;
  ocrRequired: boolean;
  ocrDerived: boolean;
  verifiedSurfaceCount: number;
  extracted: boolean;
  reviewedRecordCount: number;
  reviewed: boolean;
  publishableInterventionCount: number;
  promoted: boolean;
  stage: Tier2SourceStage;
  gaps: string[];
};

export type Tier2SourceCoverageArtifact = {
  version: 1;
  generatedAt: string;
  inputs: {
    backlogPath: string | null;
    captureManifestPath: string | null;
    verifiedCoveragePath: string | null;
    derivedSurfacesManifestPath: string | null;
    reviewedRecordsPath: string | null;
    publishablePath: string | null;
  };
  summary: {
    totalSources: number;
    availableInBacklog: number;
    captured: number;
    captureFailed: number;
    notCaptured: number;
    notSuccessfullyCaptured: number;
    ocrDerivedSources: number;
    extractedSources: number;
    reviewedSources: number;
    promotedSources: number;
    promotedInterventions: number;
    promotedRoutes: number;
    capturedBytes: number;
    ocrRequiredSources: number;
    corpusDerivedSurfaceSources: number | null;
    corpusDerivedSurfaceRows: number | null;
  };
  funnel: Array<{ stage: string; sources: number }>;
  // The extracted layer and the reviewed/promoted layer are produced by different
  // corpus runs whose sourceId namespaces have drifted, so downstream stages do
  // not cleanly join onto the available/capture universe. Surface that honestly
  // instead of silently undercounting.
  reconciliation: {
    reviewedSourcesReferenced: number;
    reviewedSourcesMatched: number;
    reviewedSourcesUnmatched: { count: number; sample: string[] };
    promotedSourcesReferenced: number;
    promotedSourcesMatched: number;
    promotedSourcesUnmatched: { count: number; sample: string[] };
    extractedReviewedOverlap: number;
    note: string;
  };
  byAssetClass: Record<Tier2AssetClass, number>;
  byContentType: Array<{
    contentType: string;
    assetClass: Tier2AssetClass;
    available: number;
    captured: number;
  }>;
  bySourceGroup: Array<{
    sourceGroup: string;
    available: number;
    captured: number;
    ocrDerived: number;
    extracted: number;
    promoted: number;
  }>;
  mediaLane: {
    recognizedContentTypes: string[];
    knownMediaSources: number;
    ingestedMediaSources: number;
    note: string;
  };
  gaps: {
    availableNotCaptured: { count: number; sample: string[] };
    capturedPdfNotOcrDerived: { count: number; sample: string[] };
    ocrDerivedNotVerified: { count: number; sample: string[] };
    verifiedNotReviewed: { count: number; sample: string[] };
    reviewedNotPromoted: { count: number; sample: string[] };
  };
  sources: Tier2SourceCoverageRow[];
};

function classifyContentType(contentType: string | null | undefined): {
  assetClass: Tier2AssetClass;
  mediaKind: string | null;
} {
  const value = (contentType ?? "").toLowerCase();
  if ((MEDIA_CONTENT_TYPES as readonly string[]).includes(value)) {
    return { assetClass: "media", mediaKind: value === "media" ? null : value };
  }
  return { assetClass: "document", mediaKind: null };
}

function sample(ids: string[], limit = 25): { count: number; sample: string[] } {
  return { count: ids.length, sample: ids.slice(0, limit) };
}

export type Tier2SourceCoverageInputs = {
  generatedAt: string;
  paths: Tier2SourceCoverageArtifact["inputs"];
  backlog: Tier2BacklogSource[];
  capture: Tier2CaptureSource[];
  verifiedCoverage: Tier2VerifiedCoverageRow[];
  // Sources with any OCR-derived surface (the document-derived-surfaces-v1 layer).
  // A superset of the verified-coverage sources.
  derivedSurfaceSourceIds: string[];
  derivedSurfacesSummary: Tier2DerivedSurfacesSummary;
  reviewedRecords: Tier2RecordRef[];
  publishableInterventions: Tier2PublishableRef[];
};

export function buildTier2SourceCoverage(
  input: Tier2SourceCoverageInputs,
): Tier2SourceCoverageArtifact {
  const backlogById = new Map(input.backlog.map((s) => [s.sourceId, s]));
  const captureById = new Map(input.capture.map((s) => [s.sourceId, s]));
  const verifiedById = new Map(
    input.verifiedCoverage.map((r) => [r.sourceId, Math.max(0, Math.trunc(r.surfaceCount ?? 0))]),
  );
  const derivedSet = new Set(input.derivedSurfaceSourceIds);

  const reviewedCountById = new Map<string, number>();
  for (const r of input.reviewedRecords) {
    if (!r.sourceId) continue;
    reviewedCountById.set(r.sourceId, (reviewedCountById.get(r.sourceId) ?? 0) + 1);
  }

  const publishableCountById = new Map<string, number>();
  const promotedRoutes = new Set<string>();
  for (const r of input.publishableInterventions) {
    if (r.sourceId) {
      publishableCountById.set(r.sourceId, (publishableCountById.get(r.sourceId) ?? 0) + 1);
    }
    for (const route of r.routes ?? []) {
      const routeId = typeof route === "string" ? route : (route?.routeId ?? null);
      if (routeId) promotedRoutes.add(routeId);
    }
  }

  const allIds = new Set<string>([...backlogById.keys(), ...captureById.keys()]);
  const rows: Tier2SourceCoverageRow[] = [];

  for (const sourceId of allIds) {
    const backlog = backlogById.get(sourceId);
    const capture = captureById.get(sourceId);

    const expectedContentType = backlog?.expectedContentType ?? null;
    const detectedContentType = capture?.detectedContentType ?? null;
    const { assetClass, mediaKind } = classifyContentType(
      expectedContentType ?? detectedContentType,
    );

    const captureStatusRaw = capture?.captureStatus ?? null;
    const captureStatus: Tier2SourceCoverageRow["captureStatus"] =
      captureStatusRaw === "captured"
        ? "captured"
        : captureStatusRaw === null
          ? "not_attempted"
          : "failed";

    const ocrRequired =
      capture?.textExtractionStatus === "ocr_required" ||
      capture?.ocrHint === "required" ||
      backlog?.ocrHint === "required";

    const ocrDerived = derivedSet.has(sourceId);
    const verifiedSurfaceCount = verifiedById.get(sourceId) ?? 0;
    const extracted = verifiedSurfaceCount > 0;
    const reviewedRecordCount = reviewedCountById.get(sourceId) ?? 0;
    const reviewed = reviewedRecordCount > 0;
    const publishableInterventionCount = publishableCountById.get(sourceId) ?? 0;
    const promoted = publishableInterventionCount > 0;

    let stage: Tier2SourceStage;
    if (promoted) stage = "promoted";
    else if (reviewed) stage = "reviewed";
    else if (extracted) stage = "extracted";
    else if (ocrDerived) stage = "ocr_derived";
    else if (captureStatus === "captured") stage = "captured";
    else if (captureStatus === "failed") stage = "capture_failed";
    else stage = "not_captured";

    // A captured PDF with no OCR-derived surface is the real OCR gap. HTML/JSON
    // sources carry text directly and never need OCR, so they are not flagged.
    const isOcrCandidate =
      assetClass === "document" && (expectedContentType === "pdf" || detectedContentType === "pdf");

    const gaps: string[] = [];
    if (captureStatus === "not_attempted") gaps.push("available_not_captured");
    if (captureStatus === "failed") gaps.push("capture_failed");
    if (captureStatus === "captured" && isOcrCandidate && !ocrDerived) {
      gaps.push("captured_pdf_not_ocr_derived");
    }
    if (ocrDerived && !extracted) gaps.push("ocr_derived_not_verified");
    if (extracted && !reviewed) gaps.push("verified_not_reviewed");
    if (reviewed && !promoted) gaps.push("reviewed_not_promoted");
    if (assetClass === "media") gaps.push("media_transcription_deferred");

    rows.push({
      sourceId,
      title: backlog?.title ?? capture?.title ?? null,
      publisher: backlog?.publisher ?? capture?.publisher ?? null,
      sourceGroup: backlog?.sourceGroup ?? capture?.sourceGroup ?? "(unknown)",
      priority: backlog?.priority ?? capture?.priority ?? null,
      url: backlog?.url ?? capture?.finalUrl ?? null,
      expectedContentType,
      detectedContentType,
      assetClass,
      mediaKind,
      intendedUse: backlog?.intendedUse ?? [],
      inBacklog: backlog !== undefined,
      captureStatus,
      byteLength: capture?.byteLength ?? null,
      textExtractionStatus: capture?.textExtractionStatus ?? null,
      ocrRequired,
      ocrDerived,
      verifiedSurfaceCount,
      extracted,
      reviewedRecordCount,
      reviewed,
      publishableInterventionCount,
      promoted,
      stage,
      gaps,
    });
  }

  rows.sort((a, b) => a.sourceId.localeCompare(b.sourceId));

  // Rollups.
  const byContentTypeMap = new Map<
    string,
    { assetClass: Tier2AssetClass; available: number; captured: number }
  >();
  const bySourceGroupMap = new Map<
    string,
    { available: number; captured: number; ocrDerived: number; extracted: number; promoted: number }
  >();
  const byAssetClass: Record<Tier2AssetClass, number> = { document: 0, media: 0 };

  let captured = 0;
  let captureFailed = 0;
  let notCaptured = 0;
  let capturedBytes = 0;
  let ocrRequiredSources = 0;
  let knownMediaSources = 0;

  for (const row of rows) {
    byAssetClass[row.assetClass] += 1;
    if (row.assetClass === "media") knownMediaSources += 1;
    if (row.ocrRequired) ocrRequiredSources += 1;

    if (row.captureStatus === "captured") {
      captured += 1;
      capturedBytes += row.byteLength ?? 0;
    } else if (row.captureStatus === "failed") {
      captureFailed += 1;
    } else {
      notCaptured += 1;
    }

    const ctKey = row.expectedContentType ?? row.detectedContentType ?? "(unknown)";
    const ct = byContentTypeMap.get(ctKey) ?? {
      assetClass: row.assetClass,
      available: 0,
      captured: 0,
    };
    if (row.inBacklog) ct.available += 1;
    if (row.captureStatus === "captured") ct.captured += 1;
    byContentTypeMap.set(ctKey, ct);

    const grp = bySourceGroupMap.get(row.sourceGroup) ?? {
      available: 0,
      captured: 0,
      ocrDerived: 0,
      extracted: 0,
      promoted: 0,
    };
    if (row.inBacklog) grp.available += 1;
    if (row.captureStatus === "captured") grp.captured += 1;
    if (row.ocrDerived) grp.ocrDerived += 1;
    if (row.extracted) grp.extracted += 1;
    if (row.promoted) grp.promoted += 1;
    bySourceGroupMap.set(row.sourceGroup, grp);
  }

  const availableInBacklog = rows.filter((r) => r.inBacklog).length;
  const ocrDerivedSources = rows.filter((r) => r.ocrDerived).length;
  const extractedSources = rows.filter((r) => r.extracted).length;
  const reviewedSources = rows.filter((r) => r.reviewed).length;
  const promotedSources = rows.filter((r) => r.promoted).length;
  const promotedInterventions = [...publishableCountById.values()].reduce((a, b) => a + b, 0);

  // Reconcile downstream sourceId namespaces against the available/capture universe.
  const reviewedReferenced = new Set([...reviewedCountById.keys()]);
  const promotedReferenced = new Set([...publishableCountById.keys()]);
  const reviewedUnmatched = [...reviewedReferenced].filter((id) => !allIds.has(id)).sort();
  const promotedUnmatched = [...promotedReferenced].filter((id) => !allIds.has(id)).sort();
  const extractedReviewedOverlap = rows.filter((r) => r.extracted && r.reviewed).length;

  // Always include the media lane in the content-type rollup even at zero, so the
  // gap is visible rather than implied by absence.
  for (const mediaType of MEDIA_CONTENT_TYPES) {
    if (!byContentTypeMap.has(mediaType)) {
      byContentTypeMap.set(mediaType, { assetClass: "media", available: 0, captured: 0 });
    }
  }

  return {
    version: 1,
    generatedAt: input.generatedAt,
    inputs: input.paths,
    summary: {
      totalSources: rows.length,
      availableInBacklog,
      captured,
      captureFailed,
      notCaptured,
      notSuccessfullyCaptured: captureFailed + notCaptured,
      ocrDerivedSources,
      extractedSources,
      reviewedSources,
      promotedSources,
      promotedInterventions,
      promotedRoutes: promotedRoutes.size,
      capturedBytes,
      ocrRequiredSources,
      corpusDerivedSurfaceSources: input.derivedSurfacesSummary?.sourceCount ?? null,
      corpusDerivedSurfaceRows: input.derivedSurfacesSummary?.inputRows ?? null,
    },
    funnel: [
      { stage: "available", sources: availableInBacklog },
      { stage: "captured", sources: captured },
      { stage: "OCR-derived surfaces", sources: ocrDerivedSources },
      { stage: "verified/materialized surfaces", sources: extractedSources },
      { stage: "reviewed (intervention records)", sources: reviewedSources },
      { stage: "promoted (publishable)", sources: promotedSources },
    ],
    reconciliation: {
      reviewedSourcesReferenced: reviewedReferenced.size,
      reviewedSourcesMatched: reviewedReferenced.size - reviewedUnmatched.length,
      reviewedSourcesUnmatched: sample(reviewedUnmatched),
      promotedSourcesReferenced: promotedReferenced.size,
      promotedSourcesMatched: promotedReferenced.size - promotedUnmatched.length,
      promotedSourcesUnmatched: sample(promotedUnmatched),
      extractedReviewedOverlap,
      note: "Extracted (verified surfaces) and reviewed/promoted come from different corpus runs whose sourceId namespaces have drifted; cross-stage source overlap is partial and some downstream sources are not in the available/capture universe. A unified full-corpus reviewed layer keyed to the captured sources is still missing.",
    },
    byAssetClass,
    byContentType: [...byContentTypeMap.entries()]
      .map(([contentType, v]) => ({ contentType, ...v }))
      .sort((a, b) => b.available - a.available || a.contentType.localeCompare(b.contentType)),
    bySourceGroup: [...bySourceGroupMap.entries()]
      .map(([sourceGroup, v]) => ({ sourceGroup, ...v }))
      .sort((a, b) => b.available - a.available || a.sourceGroup.localeCompare(b.sourceGroup)),
    mediaLane: {
      recognizedContentTypes: [...MEDIA_CONTENT_TYPES],
      knownMediaSources,
      ingestedMediaSources: rows.filter(
        (r) => r.assetClass === "media" && r.captureStatus === "captured",
      ).length,
      note:
        knownMediaSources === 0
          ? "No YouTube/audio/video sources are in the backlog yet. The media lane is a first-class but empty slot; add a source with expectedContentType=youtube|audio|video to register it. Transcription/ingest is deferred — such sources will report as available-but-not-captured until a transcription path exists."
          : "Media sources are registered but transcription/ingest is deferred; they report as available-but-not-captured until a transcription path exists.",
    },
    gaps: {
      availableNotCaptured: sample(
        rows.filter((r) => r.captureStatus === "not_attempted").map((r) => r.sourceId),
      ),
      capturedPdfNotOcrDerived: sample(
        rows.filter((r) => r.gaps.includes("captured_pdf_not_ocr_derived")).map((r) => r.sourceId),
      ),
      ocrDerivedNotVerified: sample(
        rows.filter((r) => r.ocrDerived && !r.extracted).map((r) => r.sourceId),
      ),
      verifiedNotReviewed: sample(
        rows.filter((r) => r.extracted && !r.reviewed).map((r) => r.sourceId),
      ),
      reviewedNotPromoted: sample(
        rows.filter((r) => r.reviewed && !r.promoted).map((r) => r.sourceId),
      ),
    },
    sources: rows,
  };
}

export function renderTier2SourceCoverageMarkdown(artifact: Tier2SourceCoverageArtifact): string {
  const s = artifact.summary;
  const lines: string[] = [];
  lines.push("# Tier 2 Source Coverage", "");
  lines.push(`Generated: ${artifact.generatedAt}`, "");
  lines.push(
    "Source-grain inventory of the Tier 2 corpus: what is **available** (the source backlog) versus what we **have** at each processing stage. Media (YouTube/audio/video) is a first-class lane and currently empty.",
    "",
  );

  lines.push("## Pipeline funnel (by source)", "");
  lines.push("| Stage | Sources |", "| --- | ---: |");
  for (const step of artifact.funnel) lines.push(`| ${step.stage} | ${step.sources} |`);
  lines.push("");

  lines.push("## Capture state", "");
  lines.push("| Metric | Count |", "| --- | ---: |");
  lines.push(`| Available in backlog | ${s.availableInBacklog} |`);
  lines.push(`| Captured | ${s.captured} |`);
  lines.push(`| Capture failed | ${s.captureFailed} |`);
  lines.push(`| Available, not captured | ${s.notCaptured} |`);
  lines.push(
    `| Not successfully captured (failed + not attempted) | ${s.notSuccessfullyCaptured} |`,
  );
  lines.push(`| OCR-required sources | ${s.ocrRequiredSources} |`);
  lines.push(`| Sources with OCR-derived surfaces | ${s.ocrDerivedSources} |`);
  lines.push(`| Sources promoted to verified/materialized | ${s.extractedSources} |`);
  lines.push(`| Captured bytes | ${(s.capturedBytes / 1_000_000).toFixed(1)} MB |`);
  if (s.corpusDerivedSurfaceSources !== null) {
    lines.push(
      `| Corpus discovery surfaces | ${s.corpusDerivedSurfaceRows ?? "?"} across ${s.corpusDerivedSurfaceSources} sources |`,
    );
  }
  lines.push("");

  const rec = artifact.reconciliation;
  lines.push("## Cross-run reconciliation", "");
  lines.push("| Metric | Count |", "| --- | ---: |");
  lines.push(
    `| Reviewed sources referenced | ${rec.reviewedSourcesReferenced} (matched ${rec.reviewedSourcesMatched}, unmatched ${rec.reviewedSourcesUnmatched.count}) |`,
  );
  lines.push(
    `| Promoted sources referenced | ${rec.promotedSourcesReferenced} (matched ${rec.promotedSourcesMatched}, unmatched ${rec.promotedSourcesUnmatched.count}) |`,
  );
  lines.push(`| Extracted ∩ reviewed sources | ${rec.extractedReviewedOverlap} |`);
  lines.push("");
  lines.push(`> ${rec.note}`, "");

  lines.push("## Content types (media lane shown explicitly)", "");
  lines.push("| Content type | Class | Available | Captured |", "| --- | --- | ---: | ---: |");
  for (const ct of artifact.byContentType) {
    lines.push(`| ${ct.contentType} | ${ct.assetClass} | ${ct.available} | ${ct.captured} |`);
  }
  lines.push("");
  lines.push(`> **Media lane:** ${artifact.mediaLane.note}`, "");

  lines.push("## Source groups", "");
  lines.push(
    "| Source group | Available | Captured | OCR-derived | Verified | Promoted |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const grp of artifact.bySourceGroup) {
    lines.push(
      `| ${grp.sourceGroup} | ${grp.available} | ${grp.captured} | ${grp.ocrDerived} | ${grp.extracted} | ${grp.promoted} |`,
    );
  }
  lines.push("");

  lines.push("## Gaps (available vs have)", "");
  lines.push("| Gap | Sources |", "| --- | ---: |");
  lines.push(`| Available, not captured | ${artifact.gaps.availableNotCaptured.count} |`);
  lines.push(
    `| Captured PDFs, no OCR-derived surface | ${artifact.gaps.capturedPdfNotOcrDerived.count} |`,
  );
  lines.push(
    `| OCR-derived, not verified/materialized | ${artifact.gaps.ocrDerivedNotVerified.count} |`,
  );
  lines.push(`| Verified, not reviewed | ${artifact.gaps.verifiedNotReviewed.count} |`);
  lines.push(`| Reviewed, not promoted | ${artifact.gaps.reviewedNotPromoted.count} |`);
  lines.push("");

  return `${lines.join("\n")}\n`;
}
