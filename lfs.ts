// Git LFS pointer parsing. Pure, DOM-free, so it runs under `node --test`.
export type LfsPointer = { oid: string; size: number };

export const isLfsPointer = (text: string) => /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\n/.test(text);

/** Parse one pointer file's text; null when it is not a pointer. */
export function parsePointer(text: string): LfsPointer | null {
  if (!isLfsPointer(text)) return null;
  const oid = /^oid sha256:([0-9a-f]{64})$/m.exec(text)?.[1];
  const size = /^size (\d+)$/m.exec(text)?.[1];
  return oid && size ? { oid, size: Number(size) } : null;
}

/**
 * Recover both sides' pointers from a unified diff of a pointer file. Context
 * lines belong to both sides; `-` lines to old, `+` lines to new. Returns null
 * when the patch is not a pointer diff.
 */
export function pointersFromPatch(patch: string): { old: LfsPointer | null; new: LfsPointer | null } | null {
  const old: string[] = [];
  const next: string[] = [];
  let inHunk = false;
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    const mark = line[0];
    const body = line.slice(1);
    if (mark === " ") old.push(body), next.push(body);
    else if (mark === "-") old.push(body);
    else if (mark === "+") next.push(body);
  }
  const o = parsePointer(old.join("\n") + "\n");
  const n = parsePointer(next.join("\n") + "\n");
  return o || n ? { old: o, new: n } : null;
}

/** The pointer text `git lfs smudge` expects on stdin. */
export const pointerText = ({ oid, size }: LfsPointer) => `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${size}\n`;
