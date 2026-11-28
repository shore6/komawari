---
name: komawari
description: Make or edit manga pages (panel layouts, images in panels, Japanese speech bubbles, sound effects, speed/focus lines, screentone, shapes that can be merged or cut out) and export them as images with the komawari CLI. Use when asked to create a manga/comic page, storyboard, or 4-koma from images or a script.
---

# Making manga pages with komawari

1. First run `komawari guide` and read all of it (it covers specs, operations, coordinates and dialogue tips). The field list is in `komawari schema`, layouts in `komawari templates`
2. Write the whole page in spec.json, then run `komawari build spec.json -o story.manga.json --render previews/ --annotate --width 1000`
3. Always look at the preview images (blue circles = panel reading-order numbers, red labels = item ids). Also address any `warnings` in the output JSON
4. Write fixes in ops.json (an array of operations) and run `komawari apply story.manga.json ops.json --render previews/ --annotate --width 1000`. Repeat steps 2–4 until it looks right
5. Final export: `komawari render story.manga.json -o final/ --dpi 600` (or `--width`). Do not pass `--annotate`

- Dialogue is vertical; break lines so each column is 8–10 characters or fewer. Place bubbles in reading order (top-right to bottom-left) and point the tail's `to` at the speaker's mouth
- If the output has `"ok": false`, read `error` and `hint` and fix the input (messages are in Japanese)
- Tell the user the finished .manga.json can be opened and touched up by hand in the "コマワリ工房" (Komawari Kobo) web app
