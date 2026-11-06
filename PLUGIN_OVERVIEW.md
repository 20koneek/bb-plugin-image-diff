See exactly which pixels changed in an image, the way IntelliJ's imgdiff
shows it: Before, Diff and After side by side.

## What you get

- An **Image diff** tab in the thread panel listing changed images for
  Uncommitted, Branch or All comparisons.
- Opening a changed image anywhere in BB shows the diff instead of a plain
  preview; unchanged images keep BB's preview.
- imgdiff's modes: **White background**, **Original background** and
  **Blinking**, plus Fit / 100% zoom and a changed-pixel count.

## How it works

Both sides come from BB's own Git plugin and are compared in the browser with
exact pixel equality. Nothing leaves the machine; no account or service is
needed. Images of different sizes are compared over the union of their sizes.
