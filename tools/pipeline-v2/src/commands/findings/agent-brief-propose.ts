import { defineCommand, z } from "@liche/core";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

import type { Api, Context, Model, ThinkingLevel } from "@earendil-works/pi-ai";

import {
  agentBriefProposalsDir,
  findingsArtifactDir,
  fromCliPath,
  fromRepoRoot,
} from "../../lib/paths.ts";
import { writeJson } from "../../lib/json.ts";
import {
  completeJson,
  deepSeekModel,
  getOpenRouterCatalogModel,
  openRouterModel,
} from "../../lib/llm.ts";

import { loadCorpus, type LoadedCorpus } from "./_corpus.ts";
import {
  runAgentBriefPropose,
  type BriefModelCompletion,
} from "./_brief_runner.ts";
import { summarizeCorpusInventory } from "./_tools.ts";

function makeRunId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `agent-brief-propose-${ts}`;
}

function defaultCorpusPaths(input: {
  month: string;
  tier2CorpusDir: string | null;
  briefsPath: string | null;
}): {
  reviewPackets: string;
  promotionQueue: string;
  promotedFindings: string;
  signalFeatures: string;
  contextAppendix: string;
  interventionPublishable: string | null;
  interventionPublishableByRoute: string | null;
  interventionRecords: string | null;
  documentCandidates: string | null;
  briefs: string;
} {
  const findingsDir = findingsArtifactDir(input.month);
  const tier2 = input.tier2CorpusDir;
  return {
    reviewPackets: join(findingsDir, "review-packets.json"),
    promotionQueue: join(findingsDir, "promotion-queue.json"),
    promotedFindings: join(findingsDir, "promoted-findings.json"),
    signalFeatures: join(findingsDir, "signal-features.json"),
    contextAppendix: join(findingsDir, "context-appendix.json"),
    interventionPublishable: tier2 ? join(tier2, "intervention-publishable-v1.json") : null,
    interventionPublishableByRoute: tier2
      ? join(tier2, "intervention-publishable-v1-by-route.json")
      : null,
    interventionRecords: tier2 ? join(tier2, "intervention-records.json") : null,
    documentCandidates: tier2
      ? join(tier2, "ocr-markdown-candidates-corpus-v5-with-text-2026-05-27.json")
      : null,
    briefs: input.briefsPath ?? fromRepoRoot("data/artifacts/studio/v1/briefs.json"),
  };
}

type LlmProvider = "openrouter" | "deepseek";

function buildLlmRunner(input: {
  provider: LlmProvider;
  apiKey: string;
  modelId: string;
  maxOutputTokens: number;
  timeoutMs: number;
  maxAttempts: number;
  reasoning: ThinkingLevel | null;
  counter: { tokens: number };
}): BriefModelCompletion {
  let model: Model<Api>;
  if (input.provider === "deepseek") {
    model = deepSeekModel(input.modelId);
  } else {
    model = getOpenRouterCatalogModel(input.modelId) ?? openRouterModel(input.modelId);
  }
  return async ({ systemPrompt, userMessage }) => {
    const context: Context = {
      systemPrompt,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: userMessage }],
          timestamp: Date.now(),
        },
      ],
    };
    const useDeepSeekDirectThinking =
      input.provider === "deepseek" && input.reasoning !== null;
    const deepSeekProviderOptions: Record<string, unknown> = useDeepSeekDirectThinking
      ? { thinking: { type: "enabled" }, reasoning_effort: input.reasoning }
      : {};
    const { text } = await completeJson(model, context, {
      apiKey: input.apiKey,
      timeoutMs: input.timeoutMs,
      maxAttempts: input.maxAttempts,
      maxOutputTokens: input.maxOutputTokens,
      responseFormatJson: input.reasoning === null,
      ...(useDeepSeekDirectThinking
        ? { providerOptions: deepSeekProviderOptions }
        : {}),
      ...(input.reasoning !== null && !useDeepSeekDirectThinking
        ? { reasoning: input.reasoning }
        : {}),
      appName: "bp-findings-agent-brief-propose",
    });
    input.counter.tokens += 1;
    return text;
  };
}

function pickRoutes(corpus: LoadedCorpus, requested: string[]): string[] {
  if (requested.length === 0) return [...corpus.routes].sort();
  const inCorpus: string[] = [];
  const missing: string[] = [];
  for (const id of requested) {
    if (corpus.routes.has(id as never)) inCorpus.push(id);
    else missing.push(id);
  }
  if (missing.length > 0) {
    throw new Error(
      `findings:agent-brief-propose: requested routes not in corpus: ${missing.join(", ")}`,
    );
  }
  return inCorpus;
}

export default defineCommand({
  path: ["findings", "agent-brief-propose"],
  summary:
    "Generate LLM-authored brief proposals from the existing corpus (offline). Drafts never publish — they enter the reviewer queue with status=Draft after deterministic validation.",
  input: {
    options: z.object({
      year: z.coerce
        .number()
        .int()
        .min(2000)
        .max(2100)
        .describe("Calendar year of the findings month, e.g. 2026."),
      month: z.coerce
        .number()
        .int()
        .min(1)
        .max(12)
        .describe("Calendar month 1-12."),
      routes: z
        .string()
        .optional()
        .describe(
          "Comma-separated route IDs to scope the run (e.g. Q65,Q17,B44,BX12,M15). Omit to run every route present in the corpus.",
        ),
      tier2Corpus: z
        .string()
        .optional()
        .describe(
          "Path to a tier 2 corpus dir under data/artifacts/docs/. Provides intervention-publishable-v1.json + intervention-records.json + v5 document candidates. Omit to skip tier 2 context.",
        ),
      briefs: z
        .string()
        .optional()
        .describe(
          "Path to studio briefs artifact (defaults to data/artifacts/studio/v1/briefs.json). Used for duplicate-detection against already-published briefs.",
        ),
      provider: z
        .enum(["openrouter", "deepseek"])
        .default("openrouter")
        .describe(
          "LLM provider. `openrouter` proxies many models via OPENROUTER_API_KEY; `deepseek` calls DeepSeek's API directly via DEEPSEEK_API_KEY.",
        ),
      model: z
        .string()
        .min(1)
        .describe(
          "Model ID. With --provider openrouter use e.g. `deepseek/deepseek-v4-flash` or `anthropic/claude-3.5-sonnet`. With --provider deepseek use e.g. `deepseek-v4-flash` or `deepseek-reasoner`. Required — no default.",
        ),
      maxOutputTokens: z.coerce
        .number()
        .int()
        .positive()
        .default(16000)
        .describe("LLM max output tokens per call. Briefs are larger than findings — default higher."),
      timeoutMs: z.coerce
        .number()
        .int()
        .positive()
        .default(240_000)
        .describe("Per-call LLM timeout, milliseconds."),
      maxAttempts: z.coerce
        .number()
        .int()
        .positive()
        .default(2)
        .describe("Max LLM retry attempts on transient failure."),
      thinking: z
        .enum(["off", "minimal", "low", "medium", "high", "xhigh"])
        .optional()
        .describe(
          "Reasoning/thinking level. Only effective on catalog models with thinkingLevelMap or on deepseek-v4-flash via the deepseek provider. Omit to leave thinking off.",
        ),
      execute: z
        .union([z.boolean(), z.string()])
        .default(false)
        .describe(
          "Without --execute (default false), the command does a dry run: load corpus, print inventory + brief count, exit. With --execute, calls the LLM and writes artifacts.",
        ),
    }),
  },
  output: z.object({
    command: z.literal("findings:agent-brief-propose"),
    runId: z.string(),
    month: z.string(),
    routesProcessed: z.number(),
    executed: z.boolean(),
    inventory: z.object({
      routes: z.number(),
      reviewPackets: z.number(),
      promotedFindings: z.number(),
      signalFeatureRoutes: z.number(),
      interventionRecords: z.number(),
      publishableInterventions: z.number(),
      documentCandidates: z.number(),
      contextAppendixRoutes: z.number(),
      briefs: z.number(),
    }),
    artifacts: z
      .object({
        proposals: z.string(),
        validation: z.string(),
      })
      .nullable(),
    summary: z
      .object({
        totalProposals: z.number(),
        validCount: z.number(),
        rejectedCount: z.number(),
      })
      .nullable(),
    rejectionsByCheck: z.record(z.string(), z.number()),
    toolCallCount: z.number(),
    durationMs: z.number(),
  }),
  async run({ input }) {
    const options = input.options;
    const monthIso = `${String(options.year).padStart(4, "0")}-${String(options.month).padStart(2, "0")}`;
    const tier2CorpusDir = options.tier2Corpus ? fromCliPath(options.tier2Corpus) : null;
    const briefsPath = options.briefs ? fromCliPath(options.briefs) : null;
    const paths = defaultCorpusPaths({ month: monthIso, tier2CorpusDir, briefsPath });

    const corpus = await loadCorpus({
      month: monthIso,
      reviewPacketsPath: paths.reviewPackets,
      promotionQueuePath: paths.promotionQueue,
      promotedFindingsPath: paths.promotedFindings,
      signalFeaturesPath: paths.signalFeatures,
      contextAppendixPath: paths.contextAppendix,
      interventionPublishablePath: paths.interventionPublishable,
      interventionPublishableByRoutePath: paths.interventionPublishableByRoute,
      interventionRecordsPath: paths.interventionRecords,
      documentCandidatesPath: paths.documentCandidates,
      briefsPath: paths.briefs,
    });

    const baseInventory = summarizeCorpusInventory(corpus);
    const inventory = { ...baseInventory, briefs: corpus.briefs.size };
    const requested = (options.routes ?? "")
      .split(",")
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
    const routesToRun = pickRoutes(corpus, requested);

    const executeFlag =
      typeof options.execute === "string"
        ? options.execute === "true" || options.execute === "1"
        : options.execute;

    if (!executeFlag) {
      console.log("findings:agent-brief-propose (dry run)");
      console.log(`  month=${monthIso}`);
      console.log(`  model=${options.model}`);
      console.log(`  routes=${routesToRun.length}`);
      console.log(`  briefsPath=${paths.briefs}`);
      console.log("  corpus inventory:");
      for (const [k, v] of Object.entries(inventory)) {
        console.log(`    ${k}: ${v}`);
      }
      console.log(
        `  pass --execute to call the LLM and write to ${agentBriefProposalsDir(monthIso, "<runId>")}`,
      );
      return {
        command: "findings:agent-brief-propose" as const,
        runId: "dry-run",
        month: monthIso,
        routesProcessed: routesToRun.length,
        executed: false,
        inventory,
        artifacts: null,
        summary: null,
        rejectionsByCheck: {},
        toolCallCount: 0,
        durationMs: 0,
      };
    }

    const envName = options.provider === "deepseek" ? "DEEPSEEK_API_KEY" : "OPENROUTER_API_KEY";
    const apiKey = process.env[envName]?.trim() ?? "";
    if (apiKey.length === 0) {
      throw new Error(`${envName} is required for findings:agent-brief-propose --execute.`);
    }

    const runId = makeRunId();
    const counter = { tokens: 0 };
    const reasoning =
      options.thinking !== undefined && options.thinking !== "off"
        ? (options.thinking as ThinkingLevel)
        : null;
    const modelComplete = buildLlmRunner({
      provider: options.provider,
      apiKey,
      modelId: options.model,
      maxOutputTokens: options.maxOutputTokens,
      timeoutMs: options.timeoutMs,
      maxAttempts: options.maxAttempts,
      reasoning,
      counter,
    });

    const result = await runAgentBriefPropose({
      corpus,
      routes: routesToRun,
      runId,
      model: {
        provider: options.provider,
        modelId: options.model,
        temperature: null,
        maxOutputTokens: options.maxOutputTokens,
      },
      modelComplete,
      briefsPath: paths.briefs,
    });

    const outputDir = agentBriefProposalsDir(monthIso, runId);
    await mkdir(outputDir, { recursive: true });
    const proposalsPath = join(outputDir, "agent-brief-proposals.json");
    const validationPath = join(outputDir, "agent-brief-proposal-validation.json");
    await writeJson(proposalsPath, {
      ...result.proposalsArtifact,
      toolCallCount: counter.tokens,
    });
    await writeJson(validationPath, {
      ...result.validationArtifact,
      proposalsArtifactPath: proposalsPath,
    });

    const rejectionsByCheck: Record<string, number> = {};
    for (const v of result.validationArtifact.validations) {
      for (const err of v.errors) {
        const match = err.match(/^\[([^\]]+)\]/);
        const key = match?.[1] ?? "unknown";
        rejectionsByCheck[key] = (rejectionsByCheck[key] ?? 0) + 1;
      }
    }

    return {
      command: "findings:agent-brief-propose" as const,
      runId,
      month: monthIso,
      routesProcessed: routesToRun.length,
      executed: true,
      inventory,
      artifacts: { proposals: proposalsPath, validation: validationPath },
      summary: result.proposalsArtifact.summary,
      rejectionsByCheck,
      toolCallCount: counter.tokens,
      durationMs: result.durationMs,
    };
  },
});
