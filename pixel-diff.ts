// Pure pixel comparison, DOM-free so it runs under `node --test`.
export type Pixels = { width: number; height: number; data: Uint8ClampedArray };

export type DiffStyle = {
  /** What an unchanged pixel becomes: white, or the After image's pixel. */
  same: "white" | "after";
  /** What a changed pixel becomes: solid magenta, or the After image's pixel (nothing highlighted). */
  changed: "magenta" | "after";
};

/**
 * Compare two images over the union of their sizes. A pixel outside either image
 * counts as changed. Exact RGBA equality, like imgdiff: no tolerance.
 */
export function diffPixels(before: Pixels, after: Pixels, style: DiffStyle) {
  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  const data = new Uint8ClampedArray(width * height * 4);
  let changed = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const a = offset(before, x, y);
      const b = offset(after, x, y);
      const same =
        a !== null &&
        b !== null &&
        before.data[a] === after.data[b] &&
        before.data[a + 1] === after.data[b + 1] &&
        before.data[a + 2] === after.data[b + 2] &&
        before.data[a + 3] === after.data[b + 3];
      if (!same) changed++;
      const paint = same ? style.same : style.changed;
      if (paint === "magenta") {
        data[o] = data[o + 2] = data[o + 3] = 255;
      } else if (paint === "white") {
        data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 255;
      } else if (b !== null) {
        data[o] = after.data[b];
        data[o + 1] = after.data[b + 1];
        data[o + 2] = after.data[b + 2];
        data[o + 3] = after.data[b + 3];
      }
      // "after" outside the After image stays transparent.
    }
  }
  return { width, height, data, changed, total: width * height };
}

function offset(p: Pixels, x: number, y: number) {
  return x < p.width && y < p.height ? (y * p.width + x) * 4 : null;
}
