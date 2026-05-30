import { defineCommand, z } from "@liche/core";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

import type { Api, Context, Model, ThinkingLevel } from "@earendil-works/pi-ai";

import {
  agentProposalsDir,
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
import { runAgentPropose, type ModelCompletion } from "./_runner.ts";
import {
  makeToolLoopRunner,
  type ModelToolLoop,
  type ToolLoopEventSink,
} from "./_tool_loop.ts";
import { summarizeCorpusInventory } from "./_tools.ts";

function makeRunId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `agent-propose-${ts}`;
}

// Live status printer for codemode runs. pi-agent-core emits a rich event
// stream (turn_start, tool_execution_start/end, turn_end with per-message
// usage, agent_end). The CLI prints one line per significant transition to
// stderr so the JSON result on stdout stays parseable. Everything is best-
// effort — exceptions are swallowed by the loop wrapper.
function buildStderrEventSink(): ToolLoopEventSink {
  let turn = 0;
  const turnStartMs = new Map<number, number>();
  const toolStartMs = new Map<string, number>();
  const write = (line: string) => {
    process.stderr.write(`[codemode] ${line}\n`);
  };
  return (event) => {
    if (event.type === "agent_start") {
      write("agent_start");
      return;
    }
    if (event.type === "turn_start") {
      turn += 1;
      turnStartMs.set(turn, Date.now());
      write(`turn ${turn} start`);
      return;
    }
    if (event.type === "tool_execution_start") {
      toolStartMs.set(event.toolCallId, Date.now());
      const code = (event.args as { code?: string } | undefined)?.code ?? "";
      const preview = code.replace(/\s+/g, " ").slice(0, 80);
      write(`tool ${event.toolName} (${event.toolCallId.slice(0, 8)}): ${preview}${code.length > 80 ? "…" : ""}`);
      return;
    }
    if (event.type === "tool_execution_end") {
      const started = toolStartMs.get(event.toolCallId);
      const elapsed = started === undefined ? "?" : `${Date.now() - started}ms`;
      const detail = event.result as { details?: { exitCode?: number; stdout?: string } } | undefined;
      const exitCode = detail?.details?.exitCode ?? "?";
      const stdoutBytes = detail?.details?.stdout?.length ?? "?";
      write(
        `tool ${event.toolName} (${event.toolCallId.slice(0, 8)}) done: exit=${exitCode} stdout=${stdoutBytes}b ${elapsed}${event.isError ? " ERROR" : ""}`,
      );
      return;
    }
    if (event.type === "turn_end") {
      const started = turnStartMs.get(turn);
      const elapsed = started === undefined ? "?" : `${Date.now() - started}ms`;
      const usage = (event.message as { usage?: { input: number; output: number; cost: { total: number } } }).usage;
      const usageStr = usage
        ? ` in=${usage.input}tok out=${usage.output}tok cost=$${usage.cost.total.toFixed(4)}`
        : "";
      write(`turn ${turn} end (${elapsed})${usageStr}`);
      return;
    }
    if (event.type === "agent_end") {
      write(`agent_end (${event.messages.length} messages)`);
      return;
    }
    if (event.type === "session_before_compact") {
      write(
        `compact start: tokensBefore=${event.preparation.tokensBefore} keepRecent=${event.preparation.settings.keepRecentTokens}`,
      );
      return;
    }
    if (event.type === "session_compact") {
      const entry = event.compactionEntry;
      write(
        `compact end: firstKept=${entry.firstKeptEntryId.slice(0, 8)} tokensBefore=${entry.tokensBefore}`,
      );
      return;
    }
  };
}

function defaultCorpusPaths(input: {
  month: string;
  tier2CorpusDir: string | null;
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
}): ModelCompletion {
  let model: Model<Api>;
  if (input.provider === "deepseek") {
    model = deepSeekModel(input.modelId);
  } else {
    // Prefer pi-ai's catalog model so reasoning + thinkingLevelMap come along.
    // Fall back to a custom model for ids the catalog does not know.
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
    // DeepSeek's direct API expresses thinking through provider-specific body
    // fields, not pi-ai's reasoning level. When --provider deepseek with a
    // thinking level, pass `thinking: {type: "enabled"}` + `reasoning_effort`.
    // For pi-ai catalog models (openrouter v4-flash etc.) the `reasoning:` flag
    // is the right knob and the catalog model carries the thinkingLevelMap.
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
      // Drop response_format: json_object when reasoning is on — many thinking
      // models reject the constraint or treat it as the final-text shape rather
      // than the post-thinking shape. The runner's extractJsonObject already
      // strips code fences and tolerates leading prose.
      responseFormatJson: input.reasoning === null,
      ...(useDeepSeekDirectThinking
        ? { providerOptions: deepSeekProviderOptions }
        : {}),
      ...(input.reasoning !== null && !useDeepSeekDirectThinking
        ? { reasoning: input.reasoning }
        : {}),
      appName: "bp-findings-agent-propose",
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
      `findings:agent-propose: requested routes not in corpus: ${missing.join(", ")}`,
    );
  }
  return inCorpus;
}

export default defineCommand({
  path: ["findings", "agent-propose"],
  summary:
    "Generate LLM-authored finding proposals from the existing corpus (offline). Proposals never become public findings — they enter the human review queue after deterministic validation.",
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
          "Comma-separated route IDs to scope the run (e.g. B44,Q65,M15). Omit to run every route present in the corpus.",
        ),
      tier2Corpus: z
        .string()
        .optional()
        .describe(
          "Path to a tier 2 corpus dir under data/artifacts/docs/. Provides intervention-publishable-v1.json + intervention-records.json + v5 document candidates. Omit to skip tier 2 context.",
        ),
      provider: z
        .enum(["openrouter", "deepseek"])
        .default("openrouter")
        .describe(
          "LLM provider. `openrouter` proxies to many models via OPENROUTER_API_KEY; `deepseek` calls DeepSeek's API directly via DEEPSEEK_API_KEY.",
        ),
      model: z
        .string()
        .min(1)
        .default("deepseek/deepseek-v4-flash")
        .describe(
          "Model ID. Defaults to `deepseek/deepseek-v4-flash` (via openrouter — has a pi-ai catalog entry with thinkingLevelMap and proper cost data). With --provider openrouter use e.g. `deepseek/deepseek-v4-flash`, `deepseek/deepseek-chat-v3-0324`, or `anthropic/claude-3.5-sonnet`. With --provider deepseek use e.g. `deepseek-chat` or `deepseek-reasoner`.",
        ),
      maxProposalsPerRoute: z.coerce
        .number()
        .int()
        .positive()
        .default(3)
        .describe("Cap on proposals the model may emit per route."),
      maxOutputTokens: z.coerce
        .number()
        .int()
        .positive()
        .default(8000)
        .describe("LLM max output tokens per call."),
      timeoutMs: z.coerce
        .number()
        .int()
        .positive()
        .default(180_000)
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
          "Reasoning/thinking level. Only effective on catalog models with thinkingLevelMap (e.g. deepseek/deepseek-v4-flash via openrouter). Omit to leave thinking off.",
        ),
      execute: z
        .union([z.boolean(), z.string()])
        .default(false)
        .describe(
          "Without --execute (default false), the command does a dry run: load corpus, print inventory, print first route digest, exit. With --execute, calls the LLM and writes artifacts.",
        ),
      enableCodemode: z
        .union([z.boolean(), z.string()])
        .default(false)
        .describe(
          "Run the agent with python_exec + bash_exec tools backed by the bp-sandbox Docker image. Loads knowledge/wiki/data/agent_corpus_map.md into the system prompt. Requires the image to be built (`bun run sandbox:build`). Cited code_execution evidence refs are re-executed at validation time.",
        ),
      persistSessions: z
        .union([z.boolean(), z.string()])
        .default(false)
        .describe(
          "Persist the AgentHarness transcript to <agent-proposals-dir>/<runId>/sessions/. Disabled by default — sessions stay in memory for ephemeral runs.",
        ),
    }),
  },
  output: z.object({
    command: z.literal("findings:agent-propose"),
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
    toolCallCount: z.number(),
    durationMs: z.number(),
  }),
  async run({ input }) {
    const options = input.options;
    const monthIso = `${String(options.year).padStart(4, "0")}-${String(options.month).padStart(2, "0")}`;
    const tier2CorpusDir = options.tier2Corpus ? fromCliPath(options.tier2Corpus) : null;
    const paths = defaultCorpusPaths({ month: monthIso, tier2CorpusDir });

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
    });

    const inventory = summarizeCorpusInventory(corpus);
    const requested = (options.routes ?? "")
      .split(",")
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
    const routesToRun = pickRoutes(corpus, requested);

    const executeFlag =
      typeof options.execute === "string"
        ? options.execute === "true" || options.execute === "1"
        : options.execute;
    const enableCodemodeFlag =
      typeof options.enableCodemode === "string"
        ? options.enableCodemode === "true" || options.enableCodemode === "1"
        : options.enableCodemode;

    if (!executeFlag) {
      console.log("findings:agent-propose (dry run)");
      console.log(`  month=${monthIso}`);
      console.log(`  model=${options.model}`);
      console.log(`  routes=${routesToRun.length}`);
      console.log(`  codemode=${enableCodemodeFlag}`);
      console.log("  corpus inventory:");
      for (const [k, v] of Object.entries(inventory)) {
        console.log(`    ${k}: ${v}`);
      }
      console.log(
        `  pass --execute to call the LLM and write to ${agentProposalsDir(monthIso, "<runId>")}`,
      );
      return {
        command: "findings:agent-propose" as const,
        runId: "dry-run",
        month: monthIso,
        routesProcessed: routesToRun.length,
        executed: false,
        inventory,
        artifacts: null,
        summary: null,
        toolCallCount: 0,
        durationMs: 0,
      };
    }

    const envName = options.provider === "deepseek" ? "DEEPSEEK_API_KEY" : "OPENROUTER_API_KEY";
    const apiKey = process.env[envName]?.trim() ?? "";
    if (apiKey.length === 0) {
      throw new Error(`${envName} is required for findings:agent-propose --execute.`);
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

    const persistSessionsFlag =
      typeof options.persistSessions === "string"
        ? options.persistSessions === "true" || options.persistSessions === "1"
        : options.persistSessions;

    let modelToolLoop: ModelToolLoop | undefined;
    if (enableCodemodeFlag) {
      const baseModel: Model<Api> =
        options.provider === "deepseek"
          ? deepSeekModel(options.model)
          : (getOpenRouterCatalogModel(options.model) ?? openRouterModel(options.model));
      const onEvent: ToolLoopEventSink = buildStderrEventSink();
      const sessionsRoot = persistSessionsFlag
        ? join(agentProposalsDir(monthIso, runId), "sessions")
        : undefined;
      if (sessionsRoot !== undefined) {
        await mkdir(sessionsRoot, { recursive: true });
        console.log(`  sessions=${sessionsRoot}`);
      }
      // SKILL.md files at tools/agent-corpus-lib/skills/ are inlined into the
      // system prompt by _tool_loop.ts (replaces the prior ad-hoc read of
      // knowledge/wiki/data/agent_corpus_map.md). To customize, point
      // skillsRoot at another directory or set it to undefined to suppress.
      const skillsRoot = fromRepoRoot("tools/agent-corpus-lib/skills");
      modelToolLoop = makeToolLoopRunner({
        model: baseModel,
        apiKey,
        maxOutputTokens: options.maxOutputTokens,
        ...(reasoning === null ? {} : { reasoning }),
        onEvent,
        ...(sessionsRoot === undefined ? {} : { sessionsRoot }),
        skillsRoot,
      });
    }

    const result = await runAgentPropose({
      corpus,
      routes: routesToRun,
      maxProposalsPerRoute: options.maxProposalsPerRoute,
      runId,
      model: {
        provider: options.provider,
        modelId: options.model,
        temperature: null,
        maxOutputTokens: options.maxOutputTokens,
      },
      modelComplete,
      ...(enableCodemodeFlag
        ? {
            enableCodemode: true,
            modelToolLoop: modelToolLoop!,
          }
        : {}),
    });

    const outputDir = agentProposalsDir(monthIso, runId);
    await mkdir(outputDir, { recursive: true });
    const proposalsPath = join(outputDir, "agent-finding-proposals.json");
    const validationPath = join(outputDir, "agent-finding-proposal-validation.json");
    await writeJson(proposalsPath, {
      ...result.proposalsArtifact,
      toolCallCount: counter.tokens,
    });
    await writeJson(validationPath, {
      ...result.validationArtifact,
      proposalsArtifactPath: proposalsPath,
    });

    return {
      command: "findings:agent-propose" as const,
      runId,
      month: monthIso,
      routesProcessed: routesToRun.length,
      executed: true,
      inventory,
      artifacts: { proposals: proposalsPath, validation: validationPath },
      summary: result.proposalsArtifact.summary,
      toolCallCount: counter.tokens,
      durationMs: result.durationMs,
    };
  },
});
