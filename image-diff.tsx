import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { diffPixels, type Pixels } from "./pixel-diff";

export type ImageSide =
  | { kind: "image"; src: string }
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "unavailable"; message: string };

/** imgdiff's three modes: same pixels white, same pixels original, or differences blinking. */
type Mode = "white" | "original" | "blink";
const MODES: { id: Mode; label: string }[] = [
  { id: "white", label: "White background" },
  { id: "original", label: "Original background" },
  { id: "blink", label: "Blinking" },
];
const CHECKER =
  "bg-[length:16px_16px] bg-[position:0_0,8px_8px] bg-[linear-gradient(45deg,#8884_25%,transparent_25%,transparent_75%,#8884_75%),linear-gradient(45deg,#8884_25%,transparent_25%,transparent_75%,#8884_75%)]";

async function decode(src: string): Promise<Pixels> {
  const img = new Image();
  img.src = src;
  await img.decode();
  if (!img.naturalWidth || !img.naturalHeight) throw new Error("This image has no intrinsic size.");
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable.");
  ctx.drawImage(img, 0, 0);
  const { width, height, data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width, height, data };
}

export function Notice({ children, tone }: { children: ReactNode; tone?: "error" }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("px-3 py-3 text-xs", tone === "error" ? "text-destructive" : "text-muted-foreground")}>
      {children}
    </div>
  );
}

function Pane({ title, detail, fit, children }: { title: string; detail?: string; fit: boolean; children: ReactNode }) {
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 flex items-baseline gap-2 text-xs">
        <strong className="text-foreground">{title}</strong>
        {detail ? <span className="text-muted-foreground">{detail}</span> : null}
      </figcaption>
      <div className={cn("overflow-auto rounded-md border border-border", CHECKER, fit ? "" : "max-h-[70vh]")}>{children}</div>
    </figure>
  );
}

function SideImage({ side, fit, alt }: { side: ImageSide; fit: boolean; alt: string }) {
  if (side.kind === "image") {
    return <img src={side.src} alt={alt} draggable={false} className={cn("block", fit ? "h-auto max-w-full" : "max-w-none")} />;
  }
  return <Notice tone={side.kind === "unavailable" ? "error" : undefined}>{side.kind === "loading" ? "Loading…" : side.kind === "missing" ? "Not present in this revision." : side.message}</Notice>;
}

export function ImageDiffView({ before, after, label }: { before: ImageSide; after: ImageSide; label: string }) {
  const [mode, setMode] = useState<Mode>("original");
  const [fit, setFit] = useState(true);
  const beforeSrc = before.kind === "image" ? before.src : null;
  const afterSrc = after.kind === "image" ? after.src : null;
  const [pair, setPair] = useState<{ before: Pixels; after: Pixels } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPair(null);
    setError(null);
    if (!beforeSrc || !afterSrc) return;
    let active = true;
    Promise.all([decode(beforeSrc), decode(afterSrc)]).then(
      ([b, a]) => active && setPair({ before: b, after: a }),
      (cause) => active && setError(cause instanceof Error ? cause.message : String(cause)),
    );
    return () => {
      active = false;
    };
  }, [beforeSrc, afterSrc]);

  const diff = useMemo(
    () => pair && diffPixels(pair.before, pair.after, { same: mode === "white" ? "white" : "after", changed: "magenta" }),
    [pair, mode],
  );
  const plain = useMemo(() => (mode === "blink" && pair ? diffPixels(pair.before, pair.after, { same: "after", changed: "after" }) : null), [pair, mode]);

  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (mode !== "blink") {
      setFlash(false);
      return;
    }
    const id = setInterval(() => setFlash((f) => !f), 500);
    return () => clearInterval(id);
  }, [mode]);

  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const shown = flash && plain ? plain : diff;
    const target = canvas.current;
    if (!target || !shown) return;
    target.width = shown.width;
    target.height = shown.height;
    target.getContext("2d")?.putImageData(new ImageData(shown.data, shown.width, shown.height), 0, 0);
  }, [diff, plain, flash]);

  const dims = (p: Pixels | undefined) => (p ? `${p.width} × ${p.height}` : undefined);
  const percent = diff ? ((diff.changed / diff.total) * 100).toFixed(diff.changed && diff.changed < diff.total / 1000 ? 2 : 1) : null;

  return (
    <div className="@container flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <span className="min-w-0 truncate font-medium text-foreground" title={label}>
          {label}
        </span>
        {diff ? (
          <span className="text-muted-foreground">
            {diff.changed.toLocaleString()} of {diff.total.toLocaleString()} px differ ({percent}%)
            {pair && (pair.before.width !== pair.after.width || pair.before.height !== pair.after.height) ? " · sizes differ" : ""}
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-1">
          <div role="group" aria-label="Diff mode" className="flex gap-1">
            {MODES.map((m) => (
              <Button key={m.id} variant="ghost" size="sm" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
                {m.label}
              </Button>
            ))}
          </div>
          <div role="group" aria-label="Zoom" className="flex gap-1">
            <Button variant="ghost" size="sm" aria-pressed={fit} onClick={() => setFit(true)}>
              Fit
            </Button>
            <Button variant="ghost" size="sm" aria-pressed={!fit} onClick={() => setFit(false)}>
              100%
            </Button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 @min-[48rem]:grid-cols-3">
        <Pane title="Before" detail={dims(pair?.before)} fit={fit}>
          <SideImage side={before} fit={fit} alt={`Before: ${label}`} />
        </Pane>
        <Pane title="Diff" detail={diff ? dims(diff) : undefined} fit={fit}>
          {error ? (
            <Notice tone="error">{error}</Notice>
          ) : !beforeSrc || !afterSrc ? (
            <Notice>{before.kind === "loading" || after.kind === "loading" ? "Loading…" : "Nothing to compare: only one side has an image."}</Notice>
          ) : !diff ? (
            <Notice>Comparing…</Notice>
          ) : (
            <canvas ref={canvas} aria-label={`Pixel diff: ${label}`} className={cn("block", fit ? "h-auto max-w-full" : "max-w-none")} />
          )}
        </Pane>
        <Pane title="After" detail={dims(pair?.after)} fit={fit}>
          <SideImage side={after} fit={fit} alt={`After: ${label}`} />
        </Pane>
      </div>
    </div>
  );
}
