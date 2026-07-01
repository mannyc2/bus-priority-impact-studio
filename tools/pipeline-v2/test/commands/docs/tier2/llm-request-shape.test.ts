// biome-ignore-all lint/style/noNonNullAssertion: Fixture assertions intentionally index rows after explicit length/content checks.
// Tier 2 LLM request-shape characterization tests.
//
// After the pi-harness migration (`lib/llm.ts` -> `@earendil-works/pi-ai`), three
// of the four Tier 2 forced-tool-call requests are emitted by pi-ai's streaming
// OpenAI-completions transport, so their wire bodies legitimately differ from the
// old hand-rolled bytes (they add `stream` / `stream_options`, use
// `max_completion_tokens`, and serialize images as `image_url`). For those we
// assert the load-bearing request semantics instead of pinning every byte:
//   - correct endpoint + model id,
//   - forced `tool_choice` naming the right function,
//   - the function tool present,
//   - DeepSeek thinking disabled (so the forced tool_choice is accepted),
//   - the OCR image page serialized as a base64 `image_url` block.
//
// The rare non-vision OCR `pdf_page` fallback still uses the inline OpenRouter
// client (pi-ai cannot express the `{type:"file"}` block + `plugins.file-parser`),
// so it keeps a byte-exact snapshot oracle.
import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { callDeepSeekInterventionRecords } from "../../../../src/commands/docs/tier2/_intervention-records.ts";
import { callDeepSeekMarkdownCandidates } from "../../../../src/commands/docs/tier2/_ocr-candidates.ts";
import { callOpenRouterPageMarkdownOcr } from "../../../../src/commands/docs/tier2/_ocr-render.ts";
import type { FetchLike, Tier2OcrPlanSource } from "../../../../src/commands/docs/tier2/_shared.ts";

type Captured = { url: string; headers: unknown; body: Record<string, unknown> };

// Spy that captures the outgoing request and returns a terminal SSE stream. The
// pi-ai transport consumes the stream; the callers only inspect the captured
// request here, so an empty `[DONE]` stream is enough to let the call return.
function spyFetcher(): { fetcher: FetchLike; captured: Captured[] } {
  const captured: Captured[] = [];
  const fetcher: FetchLike = async (input, init) => {
    captured.push({
      url: String(input),
      headers: init?.headers,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : (init?.body as never),
    });
    return new Response("data: [DONE]\n\n", {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  };
  return { fetcher, captured };
}

// Spy for the inline (non-pi) OpenRouter client, which does a single non-stream
// POST and parses a JSON body.
function jsonSpyFetcher(): { fetcher: FetchLike; captured: Captured[] } {
  const captured: Captured[] = [];
  const fetcher: FetchLike = async (input, init) => {
    captured.push({
      url: String(input),
      headers: init?.headers,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : (init?.body as never),
    });
    return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [] } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fetcher, captured };
}

const OCR_SOURCE: Tier2OcrPlanSource = {
  sourceId: "test_source",
  title: "Test Source",
  publisher: "NYC DOT",
  sourceGroup: "test_group",
  sourceUrl: "https://example.com/test.pdf",
  finalUrl: "https://example.com/test.pdf",
  rawArtifactKey: "sources/test_source/source.pdf",
  byteLength: 4,
  sha256: "0".repeat(64),
  pageRange: "1",
  inputMode: "openrouter_pdf_file_or_rendered_pages",
  reviewState: "triage_ready",
  nextAction: "ocr",
};

function messageRoles(body: Record<string, unknown>): string[] {
  const messages = (body["messages"] ?? []) as Array<{ role: string }>;
  return messages.map((m) => m.role);
}

function firstUserContent(
  body: Record<string, unknown>,
): Array<{ type: string; [k: string]: unknown }> {
  const messages = (body["messages"] ?? []) as Array<{ role: string; content: unknown }>;
  const user = messages.find((m) => m.role === "user");
  return (user?.content ?? []) as Array<{ type: string; [k: string]: unknown }>;
}

function toolNames(body: Record<string, unknown>): Array<string | undefined> {
  const tools = (body["tools"] ?? []) as Array<{ function?: { name?: string } }>;
  return tools.map((t) => t.function?.name);
}

describe("Tier 2 LLM request shape (pi-harness migration)", () => {
  test("callOpenRouterPageMarkdownOcr — PNG page routes through pi-ai with an image_url block", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tier2-ocr-png-"));
    try {
      const inputPath = join(dir, "page.png");
      await writeFile(inputPath, new Uint8Array([1, 2, 3, 4]));
      const { fetcher, captured } = spyFetcher();
      await callOpenRouterPageMarkdownOcr({
        apiKey: "test-key",
        model: "google/gemini-3.1-flash-lite",
        pdfEngine: "mistral-ocr",
        serviceTier: "flex",
        maxTokens: 4096,
        source: OCR_SOURCE,
        pageNumber: 1,
        pdfPageCount: 3,
        inputPath,
        inputMimeType: "image/png",
        fetcher,
      });
      expect(captured).toHaveLength(1);
      const req = captured[0]!;
      expect(req.url).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect(req.body["model"]).toBe("google/gemini-3.1-flash-lite");
      expect(req.body["tool_choice"]).toEqual({
        type: "function",
        function: { name: "record_tier2_ocr_page" },
      });
      expect(toolNames(req.body)).toEqual(["record_tier2_ocr_page"]);

      const content = firstUserContent(req.body);
      expect(content.map((c) => c.type)).toEqual(["text", "image_url"]);
      expect(content[0]!["text"] as string).toContain("page-level OCR");
      const imageUrl = (content[1]!["image_url"] as { url: string }).url;
      // Bytes [1,2,3,4] -> base64 "AQIDBA==".
      expect(imageUrl).toBe("data:image/png;base64,AQIDBA==");

      // The image path neither sends the file-parser plugin nor a service tier.
      expect(req.body["plugins"]).toBeUndefined();
      expect(req.body["service_tier"]).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("callOpenRouterPageMarkdownOcr — Pioneer PNG page uses direct OpenAI-compatible request", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tier2-ocr-pioneer-png-"));
    try {
      const inputPath = join(dir, "page.png");
      await writeFile(inputPath, new Uint8Array([1, 2, 3, 4]));
      const { fetcher, captured } = jsonSpyFetcher();
      await callOpenRouterPageMarkdownOcr({
        apiKey: "test-key",
        provider: "pioneer",
        model: "gpt-4o-mini",
        pdfEngine: "mistral-ocr",
        serviceTier: "flex",
        maxTokens: 4096,
        source: OCR_SOURCE,
        pageNumber: 1,
        pdfPageCount: 3,
        inputPath,
        inputMimeType: "image/png",
        fetcher,
      });
      expect(captured).toHaveLength(1);
      const req = captured[0]!;
      expect(req.url).toBe("https://api.pioneer.ai/v1/chat/completions");
      expect(req.headers).toMatchObject({
        Authorization: "Bearer test-key",
        "X-API-Key": "test-key",
        "Content-Type": "application/json",
      });
      expect(req.body["model"]).toBe("gpt-4o-mini");
      expect(req.body["tool_choice"]).toEqual({
        type: "function",
        function: { name: "record_tier2_ocr_page" },
      });
      expect(toolNames(req.body)).toEqual(["record_tier2_ocr_page"]);
      const content = firstUserContent(req.body);
      expect(content.map((c) => c.type)).toEqual(["text", "image_url"]);
      expect(content[0]!["text"] as string).toContain("Sparse pages are valid OCR outputs.");
      expect(content[0]!["text"] as string).toContain("do not emit [unclear]");
      expect((content[1]!["image_url"] as { url: string }).url).toBe(
        "data:image/png;base64,AQIDBA==",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("callOpenRouterPageMarkdownOcr — PDF page (inline file-parser fallback) keeps byte-exact wire shape", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tier2-ocr-pdf-"));
    try {
      const inputPath = join(dir, "page.pdf");
      await writeFile(inputPath, new Uint8Array([1, 2, 3, 4]));
      const { fetcher, captured } = jsonSpyFetcher();
      await callOpenRouterPageMarkdownOcr({
        apiKey: "test-key",
        model: "google/gemini-3.1-flash-lite",
        pdfEngine: "mistral-ocr",
        serviceTier: "flex",
        maxTokens: 4096,
        source: OCR_SOURCE,
        pageNumber: 1,
        pdfPageCount: 3,
        inputPath,
        inputMimeType: "application/pdf",
        fetcher,
      });
      expect(captured).toHaveLength(1);
      expect(captured[0]).toMatchSnapshot();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("callDeepSeekMarkdownCandidates — pi-ai DeepSeek request, thinking disabled + forced tool_choice", async () => {
    const { fetcher, captured } = spyFetcher();
    await callDeepSeekMarkdownCandidates({
      apiKey: "test-key",
      model: "deepseek-v4-pro",
      maxTokens: 16384,
      source: OCR_SOURCE,
      pages: [],
      markdownText: "## Page 1\n\nSample OCR text for the SBS corridor.",
      fetcher,
    });
    expect(captured).toHaveLength(1);
    const req = captured[0]!;
    expect(req.url).toBe("https://api.deepseek.com/chat/completions");
    expect(req.body["model"]).toBe("deepseek-v4-pro");
    // Catalog DeepSeek model auto-disables thinking so the forced tool_choice is accepted.
    expect(req.body["thinking"]).toEqual({ type: "disabled" });
    expect(req.body["tool_choice"]).toEqual({
      type: "function",
      function: { name: "record_tier2_ocr_markdown_candidates" },
    });
    expect(toolNames(req.body)).toEqual(["record_tier2_ocr_markdown_candidates"]);
    // System prompt (out-of-band in pi-ai's Context) is restored as a system message,
    // followed by the user payload.
    expect(messageRoles(req.body)).toEqual(["system", "user"]);
    const messages = req.body["messages"] as Array<{ role: string; content: string }>;
    expect(messages[0]!.content).toContain("extracting source-grounded evidence candidates");
    expect(messages[1]!.content).toContain("Source ID: test_source");
  });

  test("callDeepSeekInterventionRecords — pi-ai DeepSeek request, thinking disabled + forced tool_choice", async () => {
    const { fetcher, captured } = spyFetcher();
    await callDeepSeekInterventionRecords({
      apiKey: "test-key",
      model: "deepseek-v4-pro",
      maxTokens: 32768,
      source: {
        sourceId: "test_source",
        title: "Test Source",
        publisher: "NYC DOT",
        sourceGroup: "test_group",
      },
      candidates: [],
      routeCatalogSnippet: null,
      fetcher,
    });
    expect(captured).toHaveLength(1);
    const req = captured[0]!;
    expect(req.url).toBe("https://api.deepseek.com/chat/completions");
    expect(req.body["model"]).toBe("deepseek-v4-pro");
    expect(req.body["thinking"]).toEqual({ type: "disabled" });
    expect(req.body["tool_choice"]).toEqual({
      type: "function",
      function: { name: "record_tier2_document_intervention_records" },
    });
    expect(toolNames(req.body)).toEqual(["record_tier2_document_intervention_records"]);
    expect(messageRoles(req.body)).toEqual(["system", "user"]);
  });
});
