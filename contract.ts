// Shared by server.ts, host.ts and app.tsx: resolving a Git LFS object to bytes.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const workspacePath = z
  .string()
  .min(1)
  .max(4096)
  .refine((p) => !p.startsWith("/") && !p.includes("\0") && !p.split("/").includes(".."), "Expected a workspace-relative path");
const object = {
  path: workspacePath,
  oid: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().min(0),
};
const side = z.union([
  z.object({ outcome: z.literal("available"), content: z.string() }), // base64
  z.object({ outcome: z.literal("unavailable"), message: z.string() }),
]);

export const hostContract = defineRpcContract({
  lfsObject: { input: z.object({ workspace: z.string().min(1), ...object }), output: side },
});

/** Callers name the environment directly, or the thread whose environment holds the file. */
export const rpcContract = defineRpcContract({
  lfsObject: {
    input: z
      .object({ environmentId: z.string().min(1).optional(), threadId: z.string().min(1).optional(), ...object })
      .refine((v) => v.environmentId !== undefined || v.threadId !== undefined, "environmentId or threadId is required"),
    output: side,
  },
});
