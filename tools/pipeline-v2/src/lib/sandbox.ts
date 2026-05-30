import { spawn } from "node:child_process";

import { repoRoot } from "./paths.ts";

export type SandboxLanguage = "bash" | "python";

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
};

const DEFAULTS = {
  timeoutSec: 30,
  timeoutSecMax: 120,
  maxStdoutBytes: 256 * 1024,
  maxStderrBytes: 64 * 1024,
  memoryMb: 1024,
  image: "bp-sandbox:latest",
};

function dockerArgs(opts: Required<Omit<SandboxOptions, "timeoutSec">>): string[] {
  return [
    "run", "--rm", "-i",
    "--network=none",
    "--read-only",
    `--memory=${opts.memoryMb}m`,
    `--memory-swap=${opts.memoryMb}m`,
    "--cpus=1",
    "--pids-limit=64",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--tmpfs", "/tmp:rw,size=64m",
    "--tmpfs", "/home/agent:rw,size=8m",
    "-e", "HOME=/home/agent",
    "-e", "PYTHONPATH=/work/agent-corpus-lib",
    "-v", `${repoRoot}data/artifacts:/work/data/artifacts:ro`,
    "-v", `${repoRoot}data/raw:/work/data/raw:ro`,
    "-v", `${repoRoot}data/local:/work/data/local:ro`,
    "-v", `${repoRoot}knowledge:/work/knowledge:ro`,
    "-v", `${repoRoot}tools/agent-corpus-lib:/work/agent-corpus-lib:ro`,
    "-w", "/work",
    "--user", "1000:1000",
    opts.image,
  ];
}

export async function runCode(
  language: SandboxLanguage,
  code: string,
  options: SandboxOptions = {},
): Promise<SandboxResult> {
  const resolved = {
    timeoutSec: Math.min(
      options.timeoutSec ?? DEFAULTS.timeoutSec,
      DEFAULTS.timeoutSecMax,
    ),
    maxStdoutBytes: options.maxStdoutBytes ?? DEFAULTS.maxStdoutBytes,
    maxStderrBytes: options.maxStderrBytes ?? DEFAULTS.maxStderrBytes,
    memoryMb: options.memoryMb ?? DEFAULTS.memoryMb,
    image: options.image ?? DEFAULTS.image,
  };
  const interpreter = language === "python" ? ["python3", "-"] : ["bash", "-s"];
  const args = [...dockerArgs({
    maxStdoutBytes: resolved.maxStdoutBytes,
    maxStderrBytes: resolved.maxStderrBytes,
    memoryMb: resolved.memoryMb,
    image: resolved.image,
  }), ...interpreter];
  return runDocker(
    args,
    code,
    resolved.timeoutSec * 1000,
    resolved.maxStdoutBytes,
    resolved.maxStderrBytes,
  );
}

export function runPython(code: string, options?: SandboxOptions): Promise<SandboxResult> {
  return runCode("python", code, options);
}

export function runBash(command: string, options?: SandboxOptions): Promise<SandboxResult> {
  return runCode("bash", command, options);
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
