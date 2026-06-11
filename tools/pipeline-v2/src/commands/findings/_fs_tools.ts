// Host-side filesystem tools for the Ralph loop (read / write / edit).
//
// Unlike ts_exec/bash_exec (which run inside the sandbox container), these
// run in the orchestrator process and operate directly on the host paths behind
// the container's mounts. They are scoped by an allowlist: write/edit may only
// touch /work/.ralph (the agent's writable workspace); read may also reach the
// read-only corpus roots. The corpus stays read-only regardless of what the
// agent asks — enforced here, not by Docker, since these bypass the container.
// They are extraTools, so they do NOT count against the sandbox tool-call cap.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "@earendil-works/pi-ai";

import { repoRoot } from "../../lib/paths.ts";

const READ_CAP_BYTES = 100_000;

type Root = { prefix: string; hostBase: string; writable: boolean };

function ok(text: string): AgentToolResult<null> {
  return { content: [{ type: "text", text }], details: null };
}

export function buildRalphFsTools(workspaceDir: string): AgentTool[] {
  const roots: Root[] = [
    { prefix: "/work/.ralph", hostBase: resolve(workspaceDir), writable: true },
    { prefix: "/work/data", hostBase: resolve(repoRoot, "data"), writable: false },
    { prefix: "/work/knowledge", hostBase: resolve(repoRoot, "knowledge"), writable: false },
    { prefix: "/work/repo/packages/analytics", hostBase: resolve(repoRoot, "packages/analytics"), writable: false },
    { prefix: "/work/repo/packages/domain", hostBase: resolve(repoRoot, "packages/domain"), writable: false },
  ];

  // Map a container path to its host path, enforcing the allowlist + write scope.
  // Bare/relative paths resolve under the writable workspace.
  function toHost(p: string, needWrite: boolean): string {
    const norm = p.startsWith("/") ? p : `/work/.ralph/${p}`;
    for (const r of roots) {
      if (norm === r.prefix || norm.startsWith(`${r.prefix}/`)) {
        const rel = norm.slice(r.prefix.length).replace(/^\//, "");
        const host = resolve(r.hostBase, rel);
        if (host !== r.hostBase && !host.startsWith(`${r.hostBase}/`)) {
          throw new Error(`path escapes ${r.prefix}`);
        }
        if (needWrite && !r.writable) {
          throw new Error(`${r.prefix} is read-only — only /work/.ralph is writable`);
        }
        return host;
      }
    }
    throw new Error(
      `path '${p}' is outside the allowed roots (/work/.ralph writable; /work/data, /work/knowledge, /work/repo/packages/analytics, /work/repo/packages/domain read-only)`,
    );
  }

  const readParams = Type.Object(
    {
      path: Type.String({ description: "File path, e.g. /work/.ralph/RALPH.md (relative paths resolve under /work/.ralph)." }),
    },
    { additionalProperties: false },
  );
  const writeParams = Type.Object(
    {
      path: Type.String({ description: "File path under /work/.ralph to (over)write." }),
      content: Type.String({ description: "Full file contents." }),
    },
    { additionalProperties: false },
  );
  const editParams = Type.Object(
    {
      path: Type.String({ description: "File path under /work/.ralph to edit." }),
      old: Type.String({ description: "Exact text to replace (must occur exactly once)." }),
      new: Type.String({ description: "Replacement text." }),
    },
    { additionalProperties: false },
  );

  const read: AgentTool<typeof readParams, null> = {
    name: "read",
    label: "Read",
    description:
      "Read a file from /work/.ralph (your workspace) or the read-only corpus roots. Capped at 100 KB — for large corpus data files, slice with ts_exec or bash_exec instead.",
    parameters: readParams,
    execute: async (_id, a: Static<typeof readParams>) => {
      const host = toHost(a.path, false);
      const buf = await readFile(host);
      const slice = buf.subarray(0, READ_CAP_BYTES).toString("utf8");
      const note = buf.length > READ_CAP_BYTES ? `\n[truncated ${buf.length - READ_CAP_BYTES} bytes]` : "";
      return ok(slice.length > 0 ? slice + note : "(empty file)");
    },
  };

  const write: AgentTool<typeof writeParams, null> = {
    name: "write",
    label: "Write",
    description: "Create or overwrite a file under /work/.ralph (your writable workspace). Corpus paths are rejected.",
    parameters: writeParams,
    execute: async (_id, a: Static<typeof writeParams>) => {
      const host = toHost(a.path, true);
      await mkdir(dirname(host), { recursive: true });
      await writeFile(host, a.content);
      return ok(`wrote ${Buffer.byteLength(a.content)} bytes to ${a.path}`);
    },
  };

  const edit: AgentTool<typeof editParams, null> = {
    name: "edit",
    label: "Edit",
    description: "Replace an exact, unique string in a file under /work/.ralph. Fails if `old` is missing or not unique.",
    parameters: editParams,
    execute: async (_id, a: Static<typeof editParams>) => {
      const host = toHost(a.path, true);
      const text = await readFile(host, "utf8");
      const first = text.indexOf(a.old);
      if (first === -1) throw new Error(`'old' text not found in ${a.path}`);
      if (text.indexOf(a.old, first + 1) !== -1) throw new Error(`'old' text is not unique in ${a.path}`);
      await writeFile(host, text.slice(0, first) + a.new + text.slice(first + a.old.length));
      return ok(`edited ${a.path}`);
    },
  };

  return [read, write, edit];
}
