// Run with `npm test` (node --test, no framework).
import assert from "node:assert/strict";
import { test } from "node:test";
import { diffPixels, type Pixels } from "./pixel-diff.ts";

const image = (width: number, height: number, px: (x: number, y: number) => [number, number, number, number]): Pixels => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(px(x, y), (y * width + x) * 4);
  return { width, height, data };
};
const at = (d: Uint8ClampedArray, w: number, x: number, y: number) => Array.from(d.subarray((y * w + x) * 4, (y * w + x) * 4 + 4));

test("same pixels paint white or After, changed pixels paint magenta", () => {
  const before = image(2, 1, () => [10, 20, 30, 255]);
  const after = image(2, 1, (x) => (x === 0 ? [10, 20, 30, 255] : [99, 20, 30, 255]));
  const white = diffPixels(before, after, { same: "white", changed: "magenta" });
  assert.equal(white.changed, 1);
  assert.equal(white.total, 2);
  assert.deepEqual(at(white.data, 2, 0, 0), [255, 255, 255, 255]);
  assert.deepEqual(at(white.data, 2, 1, 0), [255, 0, 255, 255]);
  const original = diffPixels(before, after, { same: "after", changed: "after" });
  assert.equal(original.changed, 1);
  assert.deepEqual(at(original.data, 2, 0, 0), [10, 20, 30, 255]);
  assert.deepEqual(at(original.data, 2, 1, 0), [99, 20, 30, 255]);
});

test("different sizes compare over the union; outside pixels are changed", () => {
  const before = image(1, 1, () => [1, 1, 1, 255]);
  const after = image(2, 2, () => [1, 1, 1, 255]);
  const diff = diffPixels(before, after, { same: "after", changed: "magenta" });
  assert.equal(diff.width, 2);
  assert.equal(diff.height, 2);
  assert.equal(diff.changed, 3);
  assert.deepEqual(at(diff.data, 2, 0, 0), [1, 1, 1, 255]);
  assert.deepEqual(at(diff.data, 2, 1, 1), [255, 0, 255, 255]);
  // Area outside After stays transparent when painted "after".
  const plain = diffPixels(after, before, { same: "after", changed: "after" });
  assert.deepEqual(at(plain.data, 2, 1, 1), [0, 0, 0, 0]);
});
