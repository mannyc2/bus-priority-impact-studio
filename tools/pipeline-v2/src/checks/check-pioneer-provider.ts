import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { callPioneerToolCallDirect } from "../commands/docs/tier2/_llm-clients.ts";
import { writeJson } from "../lib/json.ts";

type CheckStatus = "pass" | "warn" | "fail";

type ProviderCheck = {
  id: string;
  status: CheckStatus;
  message: string;
  elapsedMs?: number;
  details?: Record<string, unknown>;
};

type PioneerCapabilityReport = {
  version: 1;
  generatedAt: string;
  provider: "pioneer";
  model: string;
  baseUrl: string;
  outputPath: string;
  summary: {
    status: CheckStatus;
    checkCount: number;
    passCount: number;
    warnCount: number;
    failCount: number;
    elapsedMs: number;
  };
  checks: ProviderCheck[];
};

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]!;
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    index += 1;
  }
  return out;
}

function stringArg(args: Record<string, string | boolean>, key: string, fallback: string): string {
  const value = args[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function numberArg(args: Record<string, string | boolean>, key: string, fallback: number): number {
  const value = args[key];
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numericField(record: Record<string, unknown> | null, key: string): number | null {
  if (record === null) return null;
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function usageShape(body: unknown): Record<string, unknown> | null {
  const root = recordOrNull(body);
  return recordOrNull(root?.["usage"]);
}

function cacheReadTokensFromUsage(usage: Record<string, unknown> | null): number | null {
  if (usage === null) return null;
  const direct = numericField(usage, "cache_read_tokens");
  const details = recordOrNull(usage["prompt_tokens_details"]);
  const nested = numericField(details, "cached_tokens");
  if (direct === null && nested === null) return null;
  return (direct ?? 0) + (nested ?? 0);
}

function toolArguments(body: unknown, expectedToolName: string): Record<string, unknown> | null {
  const root = recordOrNull(body);
  const choice = recordOrNull(arrayOrEmpty(root?.["choices"])[0]);
  const message = recordOrNull(choice?.["message"]);
  const toolCall = recordOrNull(arrayOrEmpty(message?.["tool_calls"])[0]);
  const fn = recordOrNull(toolCall?.["function"]);
  if (typeof fn?.["name"] !== "string" || fn["name"] !== expectedToolName) return null;
  const rawArgs = fn["arguments"];
  if (typeof rawArgs !== "string") return null;
  try {
    return recordOrNull(JSON.parse(rawArgs));
  } catch {
    return null;
  }
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; elapsedMs: number }> {
  const start = performance.now();
  const value = await fn();
  return { value, elapsedMs: Math.round(performance.now() - start) };
}

async function fetchJson(input: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
  const response = await fetch(input, init);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = { rawText: await response.text() };
  }
  return { status: response.status, body };
}

function summarize(checks: ProviderCheck[], elapsedMs: number): PioneerCapabilityReport["summary"] {
  const passCount = checks.filter((check) => check.status === "pass").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;
  const failCount = checks.filter((check) => check.status === "fail").length;
  return {
    status: failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass",
    checkCount: checks.length,
    passCount,
    warnCount,
    failCount,
    elapsedMs,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(Bun.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const model = stringArg(args, "model", "deepseek-ai/DeepSeek-V4-Flash");
  const baseUrl = stringArg(args, "base-url", "https://api.pioneer.ai");
  const openAiBaseUrl = `${baseUrl.replace(/\/+$/, "")}/v1`;
  const maxTokens = Math.round(numberArg(args, "max-tokens", 256));
  const outputPath = stringArg(
    args,
    "output",
    join("data", "artifacts", "provider-smokes", "pioneer-capability-latest.json"),
  );
  const apiKey = process.env["PIONEER_API_KEY"]?.trim() ?? "";
  const checks: ProviderCheck[] = [];
  const suiteStart = performance.now();

  if (apiKey.length === 0) {
    checks.push({
      id: "env",
      status: "fail",
      message:
        "PIONEER_API_KEY is missing. Run through scripts/with-repo-env.sh or bun run check:pioneer-provider.",
    });
  } else {
    checks.push({ id: "env", status: "pass", message: "PIONEER_API_KEY is present." });
  }

  if (apiKey.length > 0) {
    const catalog = await timed(() =>
      fetchJson(`${baseUrl.replace(/\/+$/, "")}/base-models?supports_inference=true`, {
        headers: { "X-API-Key": apiKey },
      }),
    );
    const models = arrayOrEmpty(recordOrNull(catalog.value.body)?.["models"] ?? catalog.value.body);
    const hasModel = JSON.stringify(catalog.value.body).includes(`"id":"${model}"`);
    checks.push({
      id: "catalog",
      status: catalog.value.status === 200 && hasModel ? "pass" : "fail",
      message:
        catalog.value.status === 200 && hasModel
          ? `Live Pioneer catalog includes ${model}.`
          : `Live Pioneer catalog did not confirm ${model}.`,
      elapsedMs: catalog.elapsedMs,
      details: {
        httpStatus: catalog.value.status,
        scannedModelCount: models.length,
      },
    });

    const forcedTool = await timed(() =>
      callPioneerToolCallDirect({
        apiKey,
        model,
        maxTokens,
        toolName: "submit_pioneer_capability",
        messages: [
          {
            role: "system",
            content:
              "You are a provider capability smoke test. Call submit_pioneer_capability exactly once.",
          },
          {
            role: "user",
            content:
              "Return ok=true, provider='pioneer', one bus route mention M15, and one short note.",
          },
        ],
        tools: [
          {
            name: "submit_pioneer_capability",
            description: "Submit the provider capability smoke result.",
            parameters: {
              type: "object",
              additionalProperties: false,
              required: ["ok", "provider", "routes", "note"],
              properties: {
                ok: { type: "boolean" },
                provider: { type: "string", enum: ["pioneer"] },
                routes: { type: "array", items: { type: "string" }, minItems: 1 },
                note: { type: "string" },
              },
            },
          },
        ],
        fetcher: fetch,
        timeoutMs: 120_000,
      }),
    );
    const argsOut = toolArguments(forcedTool.value.body, "submit_pioneer_capability");
    const routes = arrayOrEmpty(argsOut?.["routes"]);
    const forcedOk =
      forcedTool.value.response.ok &&
      argsOut?.["ok"] === true &&
      argsOut?.["provider"] === "pioneer" &&
      routes.some((route) => route === "M15");
    checks.push({
      id: "forced_tool_call",
      status: forcedOk ? "pass" : "fail",
      message: forcedOk
        ? "Pioneer produced the required forced tool call with structured arguments."
        : "Pioneer did not produce the expected forced tool call.",
      elapsedMs: forcedTool.elapsedMs,
      details: {
        httpStatus: forcedTool.value.response.status,
        usage: usageShape(forcedTool.value.body),
        toolArguments: argsOut,
      },
    });

    const stablePrefix = Array.from({ length: 1800 }, (_, index) => `stable${index % 31}`).join(
      " ",
    );
    const cacheRequestBody = {
      model,
      max_tokens: 24,
      temperature: 0,
      messages: [
        { role: "system", content: `Static cache probe prefix. ${stablePrefix}` },
        { role: "user", content: "Reply with OK and nothing else." },
      ],
    };
    const cacheHeaders = {
      Authorization: `Bearer ${apiKey}`,
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    };
    const firstCache = await timed(() =>
      fetchJson(`${openAiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: cacheHeaders,
        body: JSON.stringify(cacheRequestBody),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const secondCache = await timed(() =>
      fetchJson(`${openAiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: cacheHeaders,
        body: JSON.stringify(cacheRequestBody),
      }),
    );
    const firstUsage = usageShape(firstCache.value.body);
    const secondUsage = usageShape(secondCache.value.body);
    const cacheRead = cacheReadTokensFromUsage(secondUsage);
    const cacheStatus =
      firstCache.value.status !== 200 || secondCache.value.status !== 200
        ? "fail"
        : cacheRead !== null && cacheRead > 0
          ? "pass"
          : "warn";
    checks.push({
      id: "openai_usage_shape",
      status: cacheStatus,
      message:
        cacheRead !== null && cacheRead > 0
          ? "Pioneer OpenAI-compatible response exposed cache-read tokens."
          : "Pioneer OpenAI-compatible response worked, but cache-read tokens were not observable.",
      elapsedMs: firstCache.elapsedMs + secondCache.elapsedMs,
      details: {
        firstHttpStatus: firstCache.value.status,
        secondHttpStatus: secondCache.value.status,
        firstUsage,
        secondUsage,
        cacheReadTokensObserved: cacheRead,
      },
    });
  }

  const elapsedMs = Math.round(performance.now() - suiteStart);
  const report: PioneerCapabilityReport = {
    version: 1,
    generatedAt,
    provider: "pioneer",
    model,
    baseUrl,
    outputPath,
    summary: summarize(checks, elapsedMs),
    checks,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, report);
  console.log(
    `pioneer-provider: ${report.summary.status} (${report.summary.passCount} pass, ${report.summary.warnCount} warn, ${report.summary.failCount} fail) output=${outputPath}`,
  );
  for (const check of checks) {
    const elapsed = check.elapsedMs === undefined ? "" : ` ${check.elapsedMs}ms`;
    console.log(`- ${check.status} ${check.id}${elapsed}: ${check.message}`);
  }
  if (report.summary.status === "fail") {
    process.exitCode = 1;
  }
}

await main();
