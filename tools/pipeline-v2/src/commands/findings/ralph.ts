import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { listDetectorStudyCatalogRows } from "@bp/applied-research/detector-runs";
import type { AgentFindingProposal } from "@bp/domain/findings";

import type { Api, Model } from "@earendil-works/pi-ai";
import { defineCommand, z } from "@liche/core";
import { buildStderrEventSink, makeToolLoopRunner } from "../../lib/codemode/index.ts";
import { writeJson } from "../../lib/json.ts";
import {
  deepSeekModel,
  getDeepSeekCatalogModel,
  getOpenRouterCatalogModel,
  openRouterModel,
  pioneerModel,
} from "../../lib/llm.ts";
import { findingsArtifactDir, fromRepoRoot } from "../../lib/paths.ts";
import { loadCorpus } from "./_corpus.ts";
import { buildRalphFsTools } from "./_fs_tools.ts";
import { buildProposal, COMMON_RULES } from "./_runner.ts";
import { buildSubmitFindingProposalsTool, type ProposalStore } from "./_submit_tool.ts";

type LlmProvider = "openrouter" | "deepseek" | "pioneer";

function resolveLlmModel(provider: LlmProvider, modelId: string): Model<Api> {
  if (provider === "deepseek") {
    return getDeepSeekCatalogModel(modelId) ?? deepSeekModel(modelId);
  }
  if (provider === "pioneer") {
    return pioneerModel(modelId);
  }
  return getOpenRouterCatalogModel(modelId) ?? openRouterModel(modelId);
}

// ---------------------------------------------------------------------------
// The Ralph loop: K fresh codemode sessions over one scope. Each iteration owns
// a persistent /work/.ralph workspace (read-write), reads the authoritative
// ledger of what prior iterations accepted, pursues ONE novel finding, updates
// RALPH.md, and submits. Loop-until-dry stop. See ADR 0011. v0 — no G1–G4 gates
// yet; novelty/code_execution are nudged by the prompt so the data can tell us
// where the gates need to bite.

function makeRunId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `ralph-${ts}`;
}

const RALPH_SYSTEM_PROMPT = `You are the **Bus Priority Impact Studio** deep findings researcher, running one iteration of a persistent research loop (the "Ralph" loop).

Your goal is a **novel** finding about NYC bus performance — something the pipeline did NOT already pre-compute, and that prior iterations have NOT already found. Restating a signal-features field (contextTouchedEventCount, hotspotCount, routeWeightedAverageSpeedMph, …) or pointing at an existing promoted finding is NOT novel and wastes the iteration.

${COMMON_RULES}

# Your persistent workspace: /work/.ralph (read-write, survives across iterations)
- Manage these files with the **read / write / edit** tools (host-side, cheap, no container). Reserve ts_exec / bash_exec for data analysis over the corpus.
- FIRST: read /work/.ralph/RALPH.md — your running research log from prior iterations (what was explored, found, ruled out). Do not repeat work recorded there.
- You may write derived scratch (CSV/notes) under /work/.ralph/ to save recompute for later iterations.
- LAST, before submitting: append a concise bullet to /work/.ralph/RALPH.md summarising what you explored, what you found or ruled out, and promising threads for next time. Keep it short.
- /work/.ralph is your working memory ONLY. Cited code_execution evidence is re-run later in a clean container WITHOUT /work/.ralph, so any code you cite must read ONLY the read-only corpus and analytics/domain packages, never /work/.ralph.

# How to find something novel (mandatory workflow)
1. Read RALPH.md, then form ONE hypothesis that goes BELOW the pre-aggregated signals — dig into raw JSON/SQLite corpus files or compose analytics helpers.
2. Quantify it with ts_exec and cite that computation as a \`code_execution\` evidence ref using \`language: "typescript"\` (provide {language, code}; citedValuePath is OPTIONAL — omit it or use "stdout" when your code prints exactly the one number you cite. Do NOT compute or include stdoutHash; the harness runs your code and fills it). A real finding MUST carry at least one code_execution ref. To make a number cross-checkable, declare a metricClaim {variable, value, evidenceRef:<the code_execution>} whose code prints exactly that value — citedValuePath "stdout" then resolves it. For SEVERAL metrics from one computation, print a JSON object (e.g. console.log(JSON.stringify({peak_mph: 5.9, offpeak_mph: 9.7}))) and give each metricClaim variable a key from that object, all citing the same code with citedValuePath "stdout". NOTE: each ts_exec is a FRESH process — re-import modules every call; state does not carry over (persist to /work/.ralph if you need it next call, but never cite workspace-dependent code).
3. Seek a second independent corroborating source, or record an explicit counter-check.
4. Confirm it is not already a promoted finding (findings.promoted_findings).
5. State the mechanism observationally (no causal/policy language — see hard rules).

You have a LARGE tool budget — use it to go deep — but you MUST call submit_finding_proposals before it runs out. Do not explore indefinitely: the moment you have ONE well-supported novel finding, write your RALPH.md note and submit it. Running out of budget without submitting is a failed iteration and wastes the run. fix-and-resubmit on validation errors (≤3 times). If after genuine deep investigation nothing novel exists for this scope, first update RALPH.md, then submit a single proposal with claimStrength "blocked" describing exactly what you ruled out.`;

function ledgerSummary(ledger: AgentFindingProposal[]): string {
  if (ledger.length === 0) return "(none yet — you are the first iteration)";
  return ledger
    .map(
      (p, i) => `${i + 1}. [${p.category}/${p.severity}] route ${p.routeId ?? "—"}: ${p.claimText}`,
    )
    .join("\n");
}

function buildIterationMessage(input: {
  iter: number;
  maxIters: number;
  scope: string;
  ledger: AgentFindingProposal[];
}): string {
  return [
    `# Ralph iteration ${input.iter} of up to ${input.maxIters}`,
    `Scope: ${input.scope}`,
    "",
    "## Findings already accepted by prior iterations (do NOT duplicate these):",
    ledgerSummary(input.ledger),
    "",
    "Read /work/.ralph/RALPH.md, then find ONE novel finding for the scope above that is",
    "not in the list and not already a promoted finding. Back a quantitative claim with a",
    "code_execution ref, append your notes to /work/.ralph/RALPH.md, then submit.",
  ].join("\n");
}

export default defineCommand({
  path: ["findings", "ralph"],
  summary:
    "Run the Ralph deep-findings loop: K fresh codemode sessions over one scope, each with a persistent /work/.ralph workspace and the accepted-findings ledger, hunting novel findings until loop-until-dry. Experimental (ADR 0011).",
  input: {
    options: z.object({
      year: z.coerce.number().int().min(2000).max(2100).describe("Findings year, e.g. 2026."),
      month: z.coerce.number().int().min(1).max(12).describe("Findings month 1-12."),
      route: z.string().describe("Route ID scope for this loop (e.g. B44). One route in v0."),
      iterations: z.coerce
        .number()
        .int()
        .positive()
        .max(50)
        .default(4)
        .describe("Max fresh iterations."),
      dryStop: z.coerce
        .number()
        .int()
        .positive()
        .default(2)
        .describe("Stop after this many consecutive iterations that add no new accepted finding."),
      provider: z.enum(["openrouter", "deepseek", "pioneer"]).default("pioneer"),
      model: z
        .string()
        .min(1)
        .default("gpt-5.5")
        .describe("Model ID. Default gpt-5.5 through Pioneer."),
      maxToolCalls: z.coerce
        .number()
        .int()
        .positive()
        .default(300)
        .describe("Tool-call budget per iteration."),
      maxWallTimeSec: z.coerce
        .number()
        .int()
        .positive()
        .default(1800)
        .describe("Wall-time cap per iteration."),
      maxOutputTokens: z.coerce.number().int().positive().default(8000),
      outRoot: z
        .string()
        .default("/tmp/bp-ralph")
        .describe(
          "Host dir for run outputs + the agent's .ralph workspace. Defaults to /tmp (the repo volume may be full); move to data/working/ralph once space frees up.",
        ),
      execute: z
        .union([z.boolean(), z.string()])
        .default(false)
        .describe("Without --execute, dry run: load corpus, validate scope, print plan, exit."),
    }),
  },
  output: z.object({
    command: z.literal("findings:ralph"),
    runId: z.string(),
    month: z.string(),
    route: z.string(),
    executed: z.boolean(),
    iterationsRun: z.number(),
    acceptedTotal: z.number(),
    stoppedReason: z.string(),
    ledgerPath: z.string().nullable(),
    workspacePath: z.string().nullable(),
  }),
  async run({ input }) {
    const o = input.options;
    const monthIso = `${String(o.year).padStart(4, "0")}-${String(o.month).padStart(2, "0")}`;
    const findingsDir = findingsArtifactDir(monthIso);
    const corpus = await loadCorpus({
      month: monthIso,
      reviewPacketsPath: join(findingsDir, "review-packets.json"),
      promotionQueuePath: join(findingsDir, "promotion-queue.json"),
      promotedFindingsPath: join(findingsDir, "promoted-findings.json"),
      signalFeaturesPath: join(findingsDir, "signal-features.json"),
      contextAppendixPath: join(findingsDir, "context-appendix.json"),
    });

    if (!corpus.routes.has(o.route as never)) {
      throw new Error(`findings:ralph: route ${o.route} not in corpus for ${monthIso}.`);
    }

    const executeFlag =
      typeof o.execute === "string" ? o.execute === "true" || o.execute === "1" : o.execute;

    if (!executeFlag) {
      console.log("findings:ralph (dry run)");
      console.log(`  month=${monthIso} route=${o.route}`);
      console.log(
        `  model=${o.provider}/${o.model} iterations=${o.iterations} dryStop=${o.dryStop}`,
      );
      console.log(`  budget/iter: ${o.maxToolCalls} tool calls, ${o.maxWallTimeSec}s`);
      console.log("  pass --execute to run the loop (writes to data/working/ralph/<runId>/).");
      return {
        command: "findings:ralph" as const,
        runId: "dry-run",
        month: monthIso,
        route: o.route,
        executed: false,
        iterationsRun: 0,
        acceptedTotal: 0,
        stoppedReason: "dry-run",
        ledgerPath: null,
        workspacePath: null,
      };
    }

    const envName =
      o.provider === "deepseek"
        ? "DEEPSEEK_API_KEY"
        : o.provider === "pioneer"
          ? "PIONEER_API_KEY"
          : "OPENROUTER_API_KEY";
    const apiKey = process.env[envName]?.trim() ?? "";
    if (apiKey.length === 0)
      throw new Error(`${envName} is required for findings:ralph --execute.`);

    const runId = makeRunId();
    // Per-SCOPE dir persists across cooks (the compounding artifact): the agent
    // workspace + authoritative ledger live here so a later cook reads earlier
    // work. Per-RUN transcripts/iteration dumps nest under runs/<runId>/.
    const scopeDir = join(o.outRoot, `${o.route}-${monthIso}`);
    const workspaceDir = join(scopeDir, "workspace"); // bind-mounted at /work/.ralph (agent-owned)
    const ledgerPath = join(scopeDir, "ledger.json"); // authoritative, cross-cook, NOT mounted
    const runDir = join(scopeDir, "runs", runId);
    const sessionsRoot = join(runDir, "sessions");
    await mkdir(workspaceDir, { recursive: true });
    await mkdir(sessionsRoot, { recursive: true });
    // Seed RALPH.md only if absent — never clobber a prior cook's notes.
    if (!existsSync(join(workspaceDir, "RALPH.md"))) {
      await writeFile(
        join(workspaceDir, "RALPH.md"),
        `# RALPH.md — deep findings research log\n\nScope: ${o.route} (${monthIso})\n\nAppend one short bullet per iteration: explored / found / ruled out / next threads.\n`,
      );
    }
    // Carry the prior ledger in so novelty dedup spans cooks, not just iterations.
    const ledger: AgentFindingProposal[] = [];
    if (existsSync(ledgerPath)) {
      try {
        const prior = JSON.parse(await readFile(ledgerPath, "utf8")) as {
          ledger?: AgentFindingProposal[];
        };
        if (Array.isArray(prior.ledger)) ledger.push(...prior.ledger);
      } catch {
        // corrupt/partial prior ledger — start fresh rather than fail the run.
      }
    }
    if (ledger.length > 0)
      console.log(`[ralph] loaded ${ledger.length} prior accepted finding(s) from earlier cooks`);

    const baseModel = resolveLlmModel(o.provider, o.model);

    const modelToolLoop = makeToolLoopRunner({
      model: baseModel,
      apiKey,
      maxOutputTokens: o.maxOutputTokens,
      maxToolCalls: o.maxToolCalls,
      maxWallTimeMs: o.maxWallTimeSec * 1000,
      onEvent: buildStderrEventSink(),
      sessionsRoot,
      skillsRoot: fromRepoRoot("tools/agent-codemode/skills"),
      ralphDir: workspaceDir,
      warmContainer: true,
    });

    // Generated analytics/corpus surface, injected into the system prompt:
    // deterministic package entry points and registered detector IDs up front.
    const detectors = listDetectorStudyCatalogRows();
    const apiRef = [
      "# Analytics detector catalog available in ts_exec",
      JSON.stringify({ detectorCount: detectors.length, detectors }, null, 2),
    ].join("\n");
    const systemPrompt = apiRef ? `${RALPH_SYSTEM_PROMPT}\n\n${apiRef}` : RALPH_SYSTEM_PROMPT;

    const scope = `route ${o.route}, month ${monthIso}`;
    const fsTools = buildRalphFsTools(workspaceDir);
    const perIteration: Array<{
      iteration: number;
      accepted: number;
      submitAttempts: number;
      capsHit: string | null;
    }> = [];
    let dryStreak = 0;
    let failStreak = 0;
    let iterationsRun = 0;
    let stoppedReason = "max-iterations";

    for (let iter = 1; iter <= o.iterations; iter += 1) {
      iterationsRun = iter;
      console.log(
        `\n[ralph] iteration ${iter}/${o.iterations} — ledger has ${ledger.length} accepted`,
      );
      const store: ProposalStore = { proposals: [], validations: [], attempts: 0 };
      const submitTool = buildSubmitFindingProposalsTool({
        runId,
        corpus,
        buildProposal,
        store,
      });
      const loopResult = await modelToolLoop({
        systemPrompt,
        userMessage: buildIterationMessage({ iter, maxIters: o.iterations, scope, ledger }),
        extraTools: [submitTool, ...fsTools],
      });
      const accepted = store.proposals.filter((p) => p.validationState === "valid");
      ledger.push(...accepted);
      perIteration.push({
        iteration: iter,
        accepted: accepted.length,
        submitAttempts: store.attempts,
        capsHit: loopResult.capsHit,
      });
      await writeJson(join(runDir, `iteration-${String(iter).padStart(2, "0")}.json`), {
        iteration: iter,
        submitAttempts: store.attempts,
        capsHit: loopResult.capsHit,
        proposals: store.proposals,
        validations: store.validations,
        sessionPath: loopResult.sessionPath ?? null,
      });
      await writeJson(ledgerPath, { runId, month: monthIso, route: o.route, ledger, perIteration });

      if (accepted.length > 0) {
        dryStreak = 0;
        failStreak = 0;
        console.log(`[ralph] +${accepted.length} accepted (total ${ledger.length})`);
      } else if (store.attempts === 0) {
        // Hit the cap / wall-time without ever submitting — a failed iteration,
        // NOT a genuine dry result. Don't let it masquerade as loop-until-dry.
        failStreak += 1;
        console.log(
          `[ralph] iteration submitted nothing (capsHit=${loopResult.capsHit ?? "—"}, fail streak ${failStreak})`,
        );
        if (failStreak >= 2) {
          stoppedReason = "repeated-submit-failure";
          break;
        }
      } else {
        // Submitted, but nothing novel survived validation — genuinely dry.
        dryStreak += 1;
        console.log(
          `[ralph] submitted, no new accepted finding (dry streak ${dryStreak}/${o.dryStop})`,
        );
        if (dryStreak >= o.dryStop) {
          stoppedReason = "loop-until-dry";
          break;
        }
      }
    }

    console.log(
      `\n[ralph] done: ${ledger.length} accepted over ${iterationsRun} iterations (${stoppedReason}).`,
    );
    return {
      command: "findings:ralph" as const,
      runId,
      month: monthIso,
      route: o.route,
      executed: true,
      iterationsRun,
      acceptedTotal: ledger.length,
      stoppedReason,
      ledgerPath,
      workspacePath: workspaceDir,
    };
  },
});
