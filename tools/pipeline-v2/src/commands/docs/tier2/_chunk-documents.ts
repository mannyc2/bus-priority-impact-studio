// Tier 2 document-chunking step, extracted from the former _shared.ts monolith
// during the per-step decomposition. Splits candidate-bundle source text and
// OCR annotation text into retrieval chunks and emits the chunks artifact.
// Imports shared types, JSON/annotation readers, and path/CLI helpers from the
// core module; the core module never imports back here.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Tier2CandidateSourceRef } from "@bp/domain/documents/candidates";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import { writeJson } from "../../../lib/json.ts";
import {
  annotationTextBlocks,
  candidateBundlePath,
  documentChunksPath,
  latestDocsRunId,
  parseCliOptions,
  readJsonArtifact,
  sha256,
  type ChunkCliArgs,
  type ChunkTier2DocumentsArgs,
  type CliOption,
  type Tier2CandidateBundle,
  type Tier2DocumentChunk,
  type Tier2DocumentChunksArtifact,
} from "./_shared.ts";

function normalizedChunkText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function splitDocumentText(value: string, maxChars = 1400): string[] {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((paragraph) => normalizedChunkText(paragraph))
    .filter((paragraph) => paragraph.length > 0);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.length > 0) {
      chunks.push(current);
      current = "";
    }
  };

  for (const paragraph of paragraphs.length > 0 ? paragraphs : [normalizedChunkText(value)]) {
    if (paragraph.length > maxChars) {
      flush();
      for (let index = 0; index < paragraph.length; index += maxChars) {
        const chunk = paragraph.slice(index, index + maxChars).trim();
        if (chunk.length > 0) {
          chunks.push(chunk);
        }
      }
      continue;
    }
    const next = current.length === 0 ? paragraph : `${current}\n\n${paragraph}`;
    if (next.length > maxChars) {
      flush();
      current = paragraph;
    } else {
      current = next;
    }
  }
  flush();
  return chunks;
}

function chunkExcerpt(value: string): string {
  const normalized = normalizedChunkText(value);
  return normalized.length <= 280 ? normalized : `${normalized.slice(0, 277).trimEnd()}...`;
}

export function documentChunk(input: {
  sourceId: string;
  extractionMode: Tier2DocumentChunk["extractionMode"];
  artifactKey: string;
  pageRefs: number[];
  index: number;
  text: string;
}): Tier2DocumentChunk {
  return {
    chunkId: `chunk:${input.sourceId}:${input.extractionMode}:${input.index + 1}`,
    sourceId: input.sourceId,
    extractionMode: input.extractionMode,
    artifactKey: input.artifactKey,
    pageRefs: input.pageRefs,
    textHash: sha256(new TextEncoder().encode(input.text)),
    charLength: input.text.length,
    excerpt: chunkExcerpt(input.text),
    text: input.text,
  };
}

function sourceRefsForBundle(bundle: Tier2CandidateBundle): Tier2CandidateSourceRef[] {
  const refs: Tier2CandidateSourceRef[] = [];
  for (const candidate of [
    ...bundle.documentEvidenceCandidates,
    ...bundle.reviewQuestionCandidates,
    ...bundle.followupOcrCandidates,
  ]) {
    refs.push(candidate.sourceRef);
  }
  return refs;
}

export async function chunkTier2Documents(
  args: ChunkTier2DocumentsArgs,
): Promise<Tier2DocumentChunksArtifact> {
  const bundle = (await Bun.file(args.candidateBundlePath).json()) as Tier2CandidateBundle;
  const runRoot = dirname(args.candidateBundlePath);
  const chunks: Tier2DocumentChunk[] = [];

  for (const source of [...bundle.documentSourceCandidates].toSorted((a, b) =>
    a.sourceId.localeCompare(b.sourceId),
  )) {
    if (source.textArtifactKey === null) {
      continue;
    }
    const textPath = join(runRoot, source.textArtifactKey);
    if (!(await Bun.file(textPath).exists())) {
      continue;
    }
    const text = await Bun.file(textPath).text();
    for (const [index, chunkText] of splitDocumentText(text).entries()) {
      chunks.push(
        documentChunk({
          sourceId: source.sourceId,
          extractionMode: "html_text",
          artifactKey: source.textArtifactKey,
          pageRefs: [],
          index,
          text: chunkText,
        }),
      );
    }
  }

  const ocrArtifactRefs = new Map<string, Tier2CandidateSourceRef>();
  for (const sourceRef of sourceRefsForBundle(bundle)) {
    const artifactKey = sourceRef.artifactKeys.ocrAnnotations;
    if (artifactKey !== null && !ocrArtifactRefs.has(artifactKey)) {
      ocrArtifactRefs.set(artifactKey, sourceRef);
    }
  }

  for (const [artifactKey, sourceRef] of [...ocrArtifactRefs.entries()].toSorted((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const artifactPath = join(runRoot, artifactKey);
    const artifact = await readJsonArtifact(artifactPath);
    if (!artifact.exists || artifact.parseError) {
      continue;
    }
    const blocks = annotationTextBlocks(artifact.parsed);
    let chunkIndex = 0;
    for (const block of blocks) {
      for (const chunkText of splitDocumentText(block)) {
        chunks.push(
          documentChunk({
            sourceId: sourceRef.sourceId,
            extractionMode: "ocr_annotation_text",
            artifactKey,
            pageRefs: sourceRef.pages,
            index: chunkIndex,
            text: chunkText,
          }),
        );
        chunkIndex += 1;
      }
    }
  }

  const artifact: Tier2DocumentChunksArtifact = {
    version: 1,
    runId: bundle.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    candidateBundlePath: args.candidateBundlePath,
    outputPath: args.outputPath ?? null,
    summary: {
      sourceCount: new Set(chunks.map((chunk) => chunk.sourceId)).size,
      chunkCount: chunks.length,
      htmlChunkCount: chunks.filter((chunk) => chunk.extractionMode === "html_text").length,
      ocrChunkCount: chunks.filter((chunk) => chunk.extractionMode === "ocr_annotation_text")
        .length,
    },
    chunks,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, artifact);
  }

  return artifact;
}

function parseChunkCliArgs(args: string[]): ChunkCliArgs {
  const options: CliOption<ChunkCliArgs>[] = [
    {
      flags: ["--candidate-bundle"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.candidateBundlePath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.runId = value;
        }
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.outputPath = fromCliPath(value);
        }
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveChunkPaths(args: ChunkCliArgs): Promise<ChunkTier2DocumentsArgs> {
  if (args.candidateBundlePath !== undefined) {
    return {
      candidateBundlePath: args.candidateBundlePath,
      outputPath:
        args.outputPath ?? join(dirname(args.candidateBundlePath), "document-chunks.json"),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --candidate-bundle.");
  }

  return {
    candidateBundlePath: candidateBundlePath(artifactRoot, runId),
    outputPath: args.outputPath ?? documentChunksPath(artifactRoot, runId),
  };
}

export async function chunkTier2DocumentsFromCli(
  args: string[],
): Promise<Tier2DocumentChunksArtifact> {
  return chunkTier2Documents(await resolveChunkPaths(parseChunkCliArgs(args)));
}
