import { spawn } from "node:child_process";

import { repoRoot } from "./paths.ts";

export type SandboxLanguage = "bash" | "typescript";

export type SandboxResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  timedOut: boolean;
};

export type SandboxOptions = {
  timeoutSec?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  memoryMb?: number;
  image?: string;
  ralphDir?: string;
};

const DEFAULTS: Required<Omit<SandboxOptions, "ralphDir">> & { timeoutSecMax: number } = {
  timeoutSec: 30,
  timeoutSecMax: 120,
  maxStdoutBytes: 256 * 1024,
  maxStderrBytes: 64 * 1024,
  memoryMb: 1024,
  image: "bp-sandbox:latest",
};

type ResolvedSandboxOptions = Required<Omit<SandboxOptions, "timeoutSec" | "ralphDir">> & {
  ralphDir?: string;
};

function dockerArgs(opts: ResolvedSandboxOptions): string[] {
  const args = [
    "run",
    "--rm",
    "-i",
    "--network=none",
    "--read-only",
    `--memory=${opts.memoryMb}m`,
    `--memory-swap=${opts.memoryMb}m`,
    "--cpus=1",
    "--pids-limit=64",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--tmpfs",
    "/tmp:rw,size=64m",
    "--tmpfs",
    "/home/agent:rw,size=8m",
    "-e",
    "HOME=/home/agent",
    "-e",
    "BUN_RUNTIME_TRANSPILER_CACHE_PATH=/tmp/bun-transpiler-cache",
    "-v",
    `${repoRoot}data/artifacts:/work/data/artifacts:ro`,
    "-v",
    `${repoRoot}data/raw:/work/data/raw:ro`,
    "-v",
    `${repoRoot}data/local:/work/data/local:ro`,
    "-v",
    `${repoRoot}knowledge:/work/knowledge:ro`,
    "-v",
    `${repoRoot}packages/analytics:/work/repo/packages/analytics:ro`,
    "-v",
    `${repoRoot}packages/domain:/work/repo/packages/domain:ro`,
    "-v",
    `${repoRoot}node_modules:/work/repo/node_modules:ro`,
    "-w",
    "/work",
    "--user",
    "1000:1000",
    opts.image,
  ];
  if (opts.ralphDir !== undefined) {
    args.splice(args.length - 3, 0, "-v", `${opts.ralphDir}:/work/.ralph:rw`);
  }
  return args;
}

function interpreterFor(language: SandboxLanguage): string[] {
  if (language === "bash") return ["bash", "-s"];
  return [
    "bash",
    "-lc",
    [
      "set -euo pipefail",
      "mkdir -p /tmp/codemode/node_modules/@bp",
      "ln -sfn /work/repo/packages/analytics /tmp/codemode/node_modules/@bp/analytics",
      "ln -sfn /work/repo/packages/domain /tmp/codemode/node_modules/@bp/domain",
      "cat > /tmp/codemode/main.ts",
      "cd /tmp/codemode",
      "bun main.ts",
    ].join("\n"),
  ];
}

export async function runCode(
  language: SandboxLanguage,
  code: string,
  options: SandboxOptions = {},
): Promise<SandboxResult> {
  const resolved = {
    timeoutSec: Math.min(options.timeoutSec ?? DEFAULTS.timeoutSec, DEFAULTS.timeoutSecMax),
    maxStdoutBytes: options.maxStdoutBytes ?? DEFAULTS.maxStdoutBytes,
    maxStderrBytes: options.maxStderrBytes ?? DEFAULTS.maxStderrBytes,
    memoryMb: options.memoryMb ?? DEFAULTS.memoryMb,
    image: options.image ?? DEFAULTS.image,
    ...(options.ralphDir === undefined ? {} : { ralphDir: options.ralphDir }),
  };
  const interpreter = interpreterFor(language);
  const args = [
    ...dockerArgs({
      maxStdoutBytes: resolved.maxStdoutBytes,
      maxStderrBytes: resolved.maxStderrBytes,
      memoryMb: resolved.memoryMb,
      image: resolved.image,
      ...(resolved.ralphDir === undefined ? {} : { ralphDir: resolved.ralphDir }),
    }),
    ...interpreter,
  ];
  return runDocker(
    args,
    code,
    resolved.timeoutSec * 1000,
    resolved.maxStdoutBytes,
    resolved.maxStderrBytes,
  );
}

export function runBash(command: string, options?: SandboxOptions): Promise<SandboxResult> {
  return runCode("bash", command, options);
}

export function runTypeScript(code: string, options?: SandboxOptions): Promise<SandboxResult> {
  return runCode("typescript", code, options);
}

function runDocker(
  args: string[],
  stdinContent: string,
  timeoutMs: number,
  maxStdout: number,
  maxStderr: number,
): Promise<SandboxResult> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const proc = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let settled = false;

    const settle = (result: SandboxResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    proc.stdout.on("data", (chunk: Buffer) => {
      if (stdoutTruncated) return;
      const remaining = maxStdout - stdoutBytes;
      if (chunk.length > remaining) {
        if (remaining > 0) stdoutChunks.push(chunk.subarray(0, remaining));
        stdoutTruncated = true;
        stdoutBytes = maxStdout;
        proc.stdout.destroy();
      } else {
        stdoutChunks.push(chunk);
        stdoutBytes += chunk.length;
      }
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      if (stderrTruncated) return;
      const remaining = maxStderr - stderrBytes;
      if (chunk.length > remaining) {
        if (remaining > 0) stderrChunks.push(chunk.subarray(0, remaining));
        stderrTruncated = true;
        stderrBytes = maxStderr;
        proc.stderr.destroy();
      } else {
        stderrChunks.push(chunk);
        stderrBytes += chunk.length;
      }
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeoutMs);

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code) => {
      settle({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode: code ?? -1,
        durationMs: Date.now() - start,
        stdoutTruncated,
        stderrTruncated,
        timedOut,
      });
    });

    proc.stdin.on("error", () => {
      // Container may close stdin if it exits before reading all input.
    });
    proc.stdin.write(stdinContent);
    proc.stdin.end();
  });
}
