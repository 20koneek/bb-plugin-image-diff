// Runs on the environment's host: turns a Git LFS object id into the object bytes.
import { execFile } from "node:child_process";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { hostContract } from "./contract";
import { isLfsPointer, pointerText } from "./lfs";

// Two base64 sides must stay under the host RPC's 8 MiB result limit.
const MAX_BYTES = 5 * 1024 * 1024;
const unavailable = (message: string) => ({ outcome: "unavailable" as const, message });

function git(workspace: string, args: string[], stdin: Buffer, signal: AbortSignal) {
  return new Promise<Buffer>((done, fail) => {
    const child = execFile(
      "git",
      ["--no-pager", "-C", workspace, ...args],
      { encoding: "buffer", maxBuffer: MAX_BYTES + 1, timeout: 120_000, signal, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" } },
      (error, stdout, stderr) => (error ? fail(new Error(stderr.toString().trim() || error.message)) : done(stdout)),
    );
    child.stdin?.end(stdin);
  });
}

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    lfsObject: async ({ workspace, path, oid, size }, { signal }) => {
      if (size > MAX_BYTES) return unavailable("Image exceeds the 5 MiB preview limit.");
      try {
        // Resolves from the local LFS store, downloading from the remote when the object is missing.
        const bytes = await git(workspace, ["lfs", "smudge", "--", path], Buffer.from(pointerText({ oid, size })), signal);
        if (isLfsPointer(bytes.toString("utf8", 0, 200))) return unavailable("Git LFS returned the pointer instead of the object; is smudging disabled (GIT_LFS_SKIP_SMUDGE)?");
        return { outcome: "available" as const, content: bytes.toString("base64") };
      } catch (cause) {
        return unavailable(`Git LFS object could not be read: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    },
  },
});
