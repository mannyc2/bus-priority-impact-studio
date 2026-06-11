import { describe, expect, test } from "bun:test";

import { runBash, runTypeScript } from "../../src/lib/sandbox.ts";

const TEST_IMAGE = "bp-sandbox:latest";

const SANDBOX_AVAILABLE = (() => {
  try {
    const r = Bun.spawnSync(["docker", "image", "inspect", TEST_IMAGE], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return r.exitCode === 0;
  } catch {
    return false;
  }
})();

const maybe = SANDBOX_AVAILABLE ? describe : describe.skip;

maybe("sandbox.runBash", () => {
  test("captures stdout and exit 0", async () => {
    const r = await runBash("echo hi", { image: TEST_IMAGE, timeoutSec: 10 });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("hi\n");
    expect(r.timedOut).toBe(false);
    expect(r.stdoutTruncated).toBe(false);
  });

  test("kills a command past the wall-time", async () => {
    const r = await runBash("sleep 30", { image: TEST_IMAGE, timeoutSec: 2 });
    expect(r.timedOut).toBe(true);
    expect(r.durationMs).toBeLessThan(5000);
  });

  test("truncates large stdout at maxStdoutBytes", async () => {
    const r = await runBash("yes x | head -c 100000", {
      image: TEST_IMAGE,
      timeoutSec: 10,
      maxStdoutBytes: 512,
    });
    expect(r.stdoutTruncated).toBe(true);
    expect(r.stdout.length).toBeLessThanOrEqual(512);
  });

  test("blocks network", async () => {
    const r = await runBash(
      "getent hosts cloudflare.com 2>&1; echo end",
      { image: TEST_IMAGE, timeoutSec: 10 },
    );
    expect(r.stdout).toContain("end");
    expect(r.stdout).not.toContain("104.");
  });

  test("rootfs is read-only", async () => {
    const r = await runBash(
      "touch /smoke_marker 2>&1; echo done",
      { image: TEST_IMAGE, timeoutSec: 10 },
    );
    expect(r.stdout).toContain("Read-only file system");
    expect(r.stdout).toContain("done");
  });

  test("artifact mount is readable read-only", async () => {
    const r = await runBash(
      "head -c 20 /work/data/artifacts/findings/detector-specs.json",
      { image: TEST_IMAGE, timeoutSec: 10 },
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(0);
  });

  test("artifact mount is not writable", async () => {
    const r = await runBash(
      "touch /work/data/artifacts/__smoke 2>&1; echo done",
      { image: TEST_IMAGE, timeoutSec: 10 },
    );
    expect(r.stdout).toContain("Read-only file system");
    expect(r.stdout).toContain("done");
  });
});

maybe("sandbox.runTypeScript", () => {
  test("runs TypeScript and prints to stdout", async () => {
    const r = await runTypeScript("console.log(1 + 1)", {
      image: TEST_IMAGE,
      timeoutSec: 10,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("2\n");
  });

  test("analytics registry is importable through the bind-mount", async () => {
    const r = await runTypeScript(
      [
        "import { listAnalyticsDetectors } from '@bp/analytics/registry';",
        "console.log(listAnalyticsDetectors().length);",
      ].join("\n"),
      { image: TEST_IMAGE, timeoutSec: 15 },
    );
    expect(r.exitCode).toBe(0);
    expect(Number(r.stdout.trim())).toBeGreaterThan(10);
  });

  test("propagates non-zero exit on TypeScript error", async () => {
    const r = await runTypeScript(
      "throw new Error('boom')",
      { image: TEST_IMAGE, timeoutSec: 10 },
    );
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("Error");
    expect(r.stderr).toContain("boom");
  });
});
