// The slice of bb's bundled Git plugin (`bb--git`) RPC this plugin reads.
// `bb plugin rpc inspect bb--git` prints the full schemas.
import type { PluginRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const BB_GIT = "bb--git";

/**
 * Identity with inference, the same shape the SDK's contract helper returns.
 * Declared here so app.tsx never imports the SDK root at runtime: git installs
 * build the app bundle without devDependencies, where the SDK package lives.
 */
export const defineContract = <const C extends PluginRpcContract>(contract: C) => contract;

export const gitTarget = z.discriminatedUnion("type", [
  z.object({ type: z.literal("uncommitted") }),
  z.object({ type: z.literal("branch_committed"), mergeBaseBranch: z.string() }),
  z.object({ type: z.literal("all"), mergeBaseBranch: z.string() }),
  z.object({ type: z.literal("commit"), sha: z.string() }),
]);
export type GitTarget = z.infer<typeof gitTarget>;

/** The target prefix of a `fileSide` query; `path` and `side` are added per read. */
export const sideTarget = z.union([
  z.object({ target: z.literal("uncommitted") }),
  z.object({ target: z.enum(["branch_committed", "all"]), mergeBaseRef: z.string() }),
  z.object({ target: z.literal("commit"), sha: z.string() }),
]);
export type SideTarget = z.infer<typeof sideTarget>;

const changedFile = z.looseObject({
  path: z.string(),
  previousPath: z.string().nullable(),
  changeKind: z.string(),
  binary: z.boolean(),
});
export type ChangedFile = z.infer<typeof changedFile>;

export const git = defineContract({
  status: {
    input: z.object({ keys: z.array(z.string()) }),
    output: z.record(
      z.string(),
      z.looseObject({
        outcome: z.string(),
        workspace: z
          .looseObject({
            mergeBase: z.looseObject({ mergeBaseBranch: z.string() }).nullable(),
          })
          .optional(),
      }),
    ),
  },
  files: {
    input: z.object({ environmentId: z.string(), target: gitTarget, ignoreWhitespace: z.boolean() }),
    output: z.looseObject({
      outcome: z.string(),
      files: z.array(changedFile).optional(),
      mergeBaseRef: z.string().nullable().optional(),
    }),
  },
  fileSide: {
    input: z.object({
      environmentId: z.string(),
      query: z.union([
        z.object({ target: z.literal("uncommitted"), path: z.string(), side: z.enum(["old", "new"]) }),
        z.object({
          target: z.enum(["branch_committed", "all"]),
          mergeBaseRef: z.string(),
          path: z.string(),
          side: z.enum(["old", "new"]),
        }),
        z.object({ target: z.literal("commit"), sha: z.string(), path: z.string(), side: z.enum(["old", "new"]) }),
      ]),
    }),
    output: z.union([
      z.object({
        outcome: z.literal("available"),
        file: z.looseObject({
          content: z.string(),
          contentEncoding: z.enum(["base64", "utf8"]),
          mimeType: z.string(),
          sizeBytes: z.number(),
        }),
      }),
      z.object({ outcome: z.literal("unavailable"), code: z.string(), message: z.string() }),
    ]),
  },
});

/** Resolve the `files` target plus its returned merge-base ref into a `fileSide` target. */
export function toSideTarget(target: GitTarget, mergeBaseRef: string | null): SideTarget | null {
  switch (target.type) {
    case "uncommitted":
      return { target: "uncommitted" };
    case "commit":
      return { target: "commit", sha: target.sha };
    default:
      return mergeBaseRef ? { target: target.type, mergeBaseRef } : null;
  }
}
