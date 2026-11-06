// Image diff — imgdiff-style pixel comparison of changed images, read through
// bb's bundled Git plugin. Git LFS objects are resolved by this plugin's host entry.
import { useMemo, useState } from "react";
import {
  definePluginApp,
  experimental_useRpcKeyedQuery,
  experimental_useRpcQuery,
  useBbContext,
  type ExperimentalThreadTabProps,
  type PluginDiffRendererProps,
  type PluginFileOpenerProps,
} from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { rpcContract } from "./contract";
import { BB_GIT, git, toSideTarget, type ChangedFile, type GitTarget, type SideTarget } from "./git";
import { ImageDiffView, Notice, type ImageSide } from "./image-diff";
import { parsePointer, pointersFromPatch, type LfsPointer } from "./lfs";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif", "svg"] as const;
const extension = (path: string) => (path.split("/").pop() ?? "").split(".").pop()?.toLowerCase() ?? "";
const isImage = (path: string | null) => path !== null && IMAGE_EXTENSIONS.includes(extension(path) as never);
const mimeByExtension: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", ico: "image/x-icon", avif: "image/avif", svg: "image/svg+xml" };
const mimeFor = (path: string) => mimeByExtension[extension(path)] ?? "application/octet-stream";
const safeAtob = (b64: string) => {
  try {
    return atob(b64);
  } catch {
    return "";
  }
};
const ZERO_OID = "0".repeat(64);

function useMergeBaseBranch(environmentId: string | null) {
  const { data, isLoading } = experimental_useRpcKeyedQuery({ pluginId: BB_GIT, contract: git, method: "status", keys: environmentId ? [environmentId] : [] });
  return { branch: (environmentId && data?.[environmentId]?.workspace?.mergeBase?.mergeBaseBranch) || null, isLoading };
}

function useChangedImages(environmentId: string | null, target: GitTarget | null) {
  const query = experimental_useRpcQuery({
    pluginId: BB_GIT,
    contract: git,
    method: "files",
    input: { environmentId: environmentId ?? "-", target: target ?? { type: "uncommitted" }, ignoreWhitespace: false },
    enabled: environmentId !== null && target !== null,
  });
  const images = useMemo(() => (query.data?.files ?? []).filter((f) => isImage(f.path) || isImage(f.previousPath)), [query.data]);
  return { images, mergeBaseRef: query.data?.mergeBaseRef ?? null, outcome: query.data?.outcome, isLoading: query.isLoading, error: query.error };
}

/** One LFS object as an image side, fetched through this plugin's host entry. */
function useLfsObject(scope: { environmentId: string } | { threadId: string }, path: string, pointer: LfsPointer | null): ImageSide {
  const query = experimental_useRpcQuery({
    contract: rpcContract,
    method: "lfsObject",
    input: { ...scope, path, oid: pointer?.oid ?? ZERO_OID, size: pointer?.size ?? 0 },
    enabled: pointer !== null,
  });
  const data = query.data;
  const src = useMemo(() => (data?.outcome === "available" ? `data:${mimeFor(path)};base64,${data.content}` : null), [data, path]);
  if (!pointer) return { kind: "missing" };
  if (query.error) return { kind: "unavailable", message: query.error.message };
  if (!data) return { kind: "loading" };
  if (data.outcome === "unavailable") return { kind: "unavailable", message: data.message };
  return { kind: "image", src: src! };
}

function useSide(environmentId: string, target: SideTarget | null, path: string | null, side: "old" | "new"): ImageSide {
  const enabled = target !== null && path !== null;
  const query = experimental_useRpcQuery({
    pluginId: BB_GIT,
    contract: git,
    method: "fileSide",
    input: { environmentId, query: { ...(target ?? { target: "uncommitted" }), path: path ?? "-", side } },
    enabled,
  });
  const file = query.data?.outcome === "available" ? query.data.file : null;
  // bb's Git plugin base64-encodes anything with an image extension, pointer or not. Pointers are under 1 KiB.
  const pointer = file ? parsePointer(file.contentEncoding === "utf8" ? file.content.slice(0, 1024) : safeAtob(file.content.slice(0, 1400))) : null;
  const lfs = useLfsObject({ environmentId }, path ?? "-", pointer);
  const src = useMemo(() => {
    if (!file || pointer) return null;
    return file.contentEncoding === "base64" ? `data:${mimeFor(path ?? "")};base64,${file.content}` : `data:${mimeFor(path ?? "")};charset=utf-8,${encodeURIComponent(file.content)}`;
  }, [file, pointer, path]);
  if (!enabled) return { kind: "missing" };
  if (query.error) return { kind: "unavailable", message: query.error.message };
  if (!query.data) return { kind: "loading" };
  if (query.data.outcome === "unavailable") return query.data.code === "ENOENT" ? { kind: "missing" } : { kind: "unavailable", message: query.data.message };
  if (pointer) return lfs;
  return { kind: "image", src: src! };
}

function ChangedImageDiff({ environmentId, target, file }: { environmentId: string; target: SideTarget | null; file: ChangedFile }) {
  const before = useSide(environmentId, target, file.changeKind === "added" ? null : (file.previousPath ?? file.path), "old");
  const after = useSide(environmentId, target, file.changeKind === "deleted" ? null : file.path, "new");
  if (!target) return <Notice>Refresh to resolve the comparison revision.</Notice>;
  return <ImageDiffView before={before} after={after} label={file.previousPath ? `${file.previousPath} → ${file.path}` : file.path} />;
}

const TARGETS: { kind: GitTarget["type"]; label: string }[] = [
  { kind: "uncommitted", label: "Uncommitted" },
  { kind: "branch_committed", label: "Branch" },
  { kind: "all", label: "All" },
];

function EnvironmentImages({ environmentId }: { environmentId: string }) {
  const mergeBase = useMergeBaseBranch(environmentId);
  const [kind, setKind] = useState<GitTarget["type"]>("uncommitted");
  const target: GitTarget = kind !== "uncommitted" && kind !== "commit" && mergeBase.branch ? { type: kind, mergeBaseBranch: mergeBase.branch } : { type: "uncommitted" };
  const { images, mergeBaseRef, outcome, isLoading, error } = useChangedImages(environmentId, target);
  const [selected, setSelected] = useState<string | null>(null);
  const file = images.find((f) => f.path === selected) ?? images[0] ?? null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div role="group" aria-label="Compare" className="flex gap-1">
          {TARGETS.map((t) => (
            <Button key={t.kind} variant="ghost" size="sm" aria-pressed={kind === t.kind} disabled={t.kind !== "uncommitted" && !mergeBase.branch} onClick={() => setKind(t.kind)}>
              {t.label}
            </Button>
          ))}
        </div>
        {images.length > 0 ? (
          <select aria-label="Changed image" value={file?.path ?? ""} onChange={(e) => setSelected(e.target.value)} className="h-8 min-w-0 max-w-full flex-1 rounded-md border border-input bg-transparent px-2 text-xs text-foreground">
            {images.map((f) => (
              <option key={f.path} value={f.path}>
                {f.changeKind === "added" ? "+ " : f.changeKind === "deleted" ? "− " : ""}
                {f.path}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <Notice tone="error">{error.message}</Notice>
        ) : outcome === "not_applicable" ? (
          <Notice>This environment is not a Git workspace.</Notice>
        ) : isLoading ? (
          <Notice>Loading changed files…</Notice>
        ) : !file ? (
          <Notice>No changed images for this comparison.</Notice>
        ) : (
          <ChangedImageDiff key={`${kind}:${file.path}`} environmentId={environmentId} target={toSideTarget(target, mergeBaseRef)} file={file} />
        )}
      </div>
    </div>
  );
}

function ImageDiffTab({ environment }: ExperimentalThreadTabProps) {
  return environment ? <EnvironmentImages environmentId={environment.id} /> : <Notice>This thread has no environment.</Notice>;
}

/** The tab is pinned in the panel strip only while the thread has changed images. */
function useHasChangedImages({ environment }: ExperimentalThreadTabProps) {
  const environmentId = environment?.id ?? null;
  const mergeBase = useMergeBaseBranch(environmentId);
  const uncommitted = useChangedImages(environmentId, { type: "uncommitted" });
  const all = useChangedImages(environmentId, mergeBase.branch ? { type: "all", mergeBaseBranch: mergeBase.branch } : null);
  return uncommitted.images.length > 0 || all.images.length > 0;
}

/** Opening a changed image anywhere in bb shows its diff; an unchanged one gets bb's preview. */
function OpenedImage({ environmentId, path, Original }: { environmentId: string; path: string; Original: PluginFileOpenerProps["Original"] }) {
  const mergeBase = useMergeBaseBranch(environmentId);
  const uncommitted = useChangedImages(environmentId, { type: "uncommitted" });
  const all = useChangedImages(environmentId, mergeBase.branch ? { type: "all", mergeBaseBranch: mergeBase.branch } : null);
  const inUncommitted = uncommitted.images.find((f) => f.path === path);
  const inAll = all.images.find((f) => f.path === path);
  if (inUncommitted) return <ChangedImageDiff environmentId={environmentId} target={{ target: "uncommitted" }} file={inUncommitted} />;
  if (inAll && mergeBase.branch) return <ChangedImageDiff environmentId={environmentId} target={toSideTarget({ type: "all", mergeBaseBranch: mergeBase.branch }, all.mergeBaseRef)} file={inAll} />;
  if (mergeBase.isLoading || uncommitted.isLoading || all.isLoading) return <Notice>Checking Git for changes…</Notice>;
  return <Original />;
}

function ImageOpener({ path, source, Original }: PluginFileOpenerProps) {
  const environmentId = source.kind === "workspace" ? source.environmentId : null;
  return environmentId ? <OpenedImage environmentId={environmentId} path={path} Original={Original} /> : <Original />;
}

/**
 * bb's Diff tab shows a Git LFS image as a text diff of its pointer file. The
 * pointer lines carry both object ids, so the image diff renders in place.
 * Every other diff is delegated back to bb's renderer.
 */
function LfsPointerDiff({ threadId, path, pointers }: { threadId: string; path: string; pointers: { old: LfsPointer | null; new: LfsPointer | null } }) {
  const before = useLfsObject({ threadId }, path, pointers.old);
  const after = useLfsObject({ threadId }, path, pointers.new);
  return <ImageDiffView before={before} after={after} label={path} />;
}

function DiffRenderer({ patch, path, experimental_fullFileContents: full, Original }: PluginDiffRendererProps) {
  const { threadId } = useBbContext();
  const pointers = useMemo(() => {
    if (!isImage(path)) return null;
    if (full) {
      const o = parsePointer(full.old.content);
      const n = parsePointer(full.new.content);
      if (o || n) return { old: o, new: n };
    }
    return pointersFromPatch(patch);
  }, [patch, path, full]);
  return pointers && threadId ? <LfsPointerDiff threadId={threadId} path={path} pointers={pointers} /> : <Original />;
}

export default definePluginApp((app) => {
  app.slots.experimental_tab({
    context: { kind: "thread" },
    availability: "fixed",
    id: "image-diff",
    title: "Image diff",
    icon: "Images",
    tooltip: "Pixel diff of changed images",
    layout: "flush",
    component: ImageDiffTab,
    useVisible: useHasChangedImages,
  });
  app.slots.fileOpener({
    id: "image-diff",
    title: "Image diff",
    extensions: IMAGE_EXTENSIONS,
    component: ImageOpener,
  });
  app.slots.experimental_diffRenderer({
    id: "lfs-images",
    title: "Image diff for Git LFS images",
    description: "Shows a pixel diff where bb would show the LFS pointer text; other diffs keep bb's renderer.",
    component: DiffRenderer,
  });
});
