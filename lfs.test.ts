import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePointer, pointerText, pointersFromPatch } from "./lfs.ts";

const A = "e816a616100384554e224e27ba96f49fee8cddf7194ebb89923c13a0ddb74837";
const B = "b027d3f4eccfdd97b837ec996deb3808ef454cca35a159a632f0c053b70333aa";

test("parsePointer round-trips pointerText and rejects non-pointers", () => {
  assert.deepEqual(parsePointer(pointerText({ oid: A, size: 120959 })), { oid: A, size: 120959 });
  assert.equal(parsePointer("\x89PNG\r\n"), null);
  assert.equal(parsePointer("version https://git-lfs.github.com/spec/v1\nsize 3\n"), null);
});

test("pointersFromPatch reads a modified pointer, keeping shared context lines on both sides", () => {
  const patch = [
    "diff --git a/x.png b/x.png",
    "--- a/x.png",
    "+++ b/x.png",
    "@@ -1,3 +1,3 @@",
    " version https://git-lfs.github.com/spec/v1",
    `-oid sha256:${A}`,
    `+oid sha256:${B}`,
    " size 120959",
  ].join("\n");
  assert.deepEqual(pointersFromPatch(patch), { old: { oid: A, size: 120959 }, new: { oid: B, size: 120959 } });
});

test("pointersFromPatch handles added files and non-pointer diffs", () => {
  const added = ["@@ -0,0 +1,3 @@", "+version https://git-lfs.github.com/spec/v1", `+oid sha256:${B}`, "+size 7"].join("\n");
  assert.deepEqual(pointersFromPatch(added), { old: null, new: { oid: B, size: 7 } });
  assert.equal(pointersFromPatch("@@ -1 +1 @@\n-const a = 1;\n+const a = 2;"), null);
});
