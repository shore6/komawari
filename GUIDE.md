# komawari guide (for LLMs and agents)

komawari is a CLI extracted from the core of "コマワリ工房" (Komawari Kobo). You build manga pages in JSON (panel layouts, images, speech bubbles, sound effects, effect lines, screentone, shapes) and export them as PNG / JPEG / WebP at any resolution. Project files (`.manga.json`) open as-is in the Komawari Kobo web app for manual touch-ups.

Every command prints a single JSON object. When it contains `"ok": false`, read `error` and `hint` (and `details` when there are several problems) and fix the input. `warnings` reports overlaps, items sticking out of their panel, columns that are too long, and missing fonts.

Note: error messages, hints and warnings are printed in Japanese. The common ones are listed under "Common errors" below.

## Basic workflow

1. Get a feel for the format (optional): `komawari example work` copies a sample `spec.json` and its images
2. Write the whole page in `spec.json` and build it:
   `komawari build spec.json -o story.manga.json --render previews/ --annotate --width 1000`
3. Look at `previews/*.png`. With `--annotate`, panel reading-order numbers (blue circles) and item ids (red labels) are drawn on the image
4. Write the fixes as an array of operations in `ops.json` and apply them:
   `komawari apply story.manga.json ops.json --render previews/ --annotate --width 1000`
5. Final export: `komawari render story.manga.json -o final/ --dpi 600` (`--width 3000` or `--scale 2` also work)

Inspect the current state with `komawari info story.manga.json` (panel numbers and positions, item ids / positions / text, warnings).

## Commands

| Command | Description |
|---|---|
| `guide` / `schema` / `templates` | This guide / JSON list of every field / list of layout templates |
| `example [dir]` | Copy the sample files |
| `new <file> [--size B5] [--pages N] [--template basic-5] [--title name]` | Create an empty project |
| `build <spec.json\|-> [-o file] [--render [outdir]] [--annotate] [--width W]` | Build a project from a spec (`-` reads stdin) |
| `apply <file> <ops.json\|-> [-o other-file] [--render [outdir]] [--annotate]` | Apply operations (overwrites the file by default) |
| `validate <json>` | Only validate a spec / ops file |
| `info <file> [--page N]` | Print the project contents as JSON |
| `render <file> [-o output] [--page N\|1,3\|2-4\|all] [--width W\|--height H\|--scale S\|--dpi D] [--format png\|jpeg\|webp] [--quality 0.92] [--transparent] [--annotate]` | Export images |
| `fonts` / `fonts fetch <id…\|base\|all>` / `fonts add <ttf…> --project <file>` | Font status / download / embed into a project |

If `-o` is a folder (ends with `/` or has no extension), files are named like `<title>_p01.png`. If it contains `{n}`, that is replaced with the page number.

## Coordinates and sizes

- `page` starts at 1. `panel` is the panel's number in **reading order** on that page (right-to-left books: top-right to bottom-left), starting at 1. Changing the layout renumbers panels, so check with `info` or `--annotate` afterwards
- `at`: position. With `panel`, it is `[x, y]` relative to the panel's bounding box (0–1, top-left is `[0, 0]`). Without `panel`, it is relative to the page's live area (inside the margins). Named positions also work: `center` `top` `bottom` `left` `right` `top-left` `top-right` `bottom-left` `bottom-right`
- `xy`: page pixel coordinates `[x, y]` (instead of `at`)
- `fontSize` is in page pixels. `scale` is a multiplier on the standard text size (bubbles 2.1%, text 2.2%, sfx 8% × the paper's short side)
- `width` / `height` are ratios of the panel (or live area)
- Paper: B5 is 1820×2570px (1mm = 10px). Also A5, A4, B4, square, 4:5, 9:16, 16:9, or `"1600x2400"`
- Bubbles and text placed in a panel are nudged to stay inside it by default (disable with `"inside": false`)

## spec (the whole project in one JSON)

```json
{
  "title": "ほうきの空",
  "size": "B5",
  "direction": "rtl",
  "defaults": { "bubble": { "font": "antique" } },
  "pages": [
    {
      "layout": "basic-5",
      "panels": [
        { "image": { "src": "sky.jpg", "zoom": 1.15, "focus": [0.5, 0.4] },
          "texts": [{ "text": "ある晴れた\n日のこと――", "at": "top-right", "font": "mincho", "background": "#ffffff" }] },
        { "image": "person.jpg",
          "bubbles": [{ "text": "今日こそ\n飛べる\n気がする！", "at": [0.28, 0.3], "tail": { "to": [0.52, 0.42] } }] },
        { "image": { "src": "hills.jpg", "mode": "halftone" },
          "effects": [{ "kind": "speed", "angle": -12 }],
          "sfx": [{ "text": "ビュンッ", "at": [0.3, 0.5], "rotate": -12 }],
          "bubbles": [{ "text": "わああ\nああっ!!", "shape": "spike", "at": [0.8, 0.42], "tail": "down-left" }] },
        { "effects": [{ "kind": "focus" }],
          "bubbles": [{ "text": "ねこ!?", "shape": "burst", "tail": false, "scale": 1.3 }] },
        null
      ]
    },
    {
      "layout": { "rows": [[1], [1, 1], [1]] },
      "panels": [ { "image": "sky.jpg" } ],
      "items": [{ "type": "image", "src": "chara.png", "at": [0.5, 0.64], "width": 0.3, "rotate": -6 }]
    }
  ]
}
```

- Top level: `title` `size` `direction` (rtl / ltr) `margin` (px; a number, `[top/bottom, left/right]`, or `[top, right, bottom, left]`) `gutter` (px; a number or `[horizontal gap, vertical gap]`) `border` `borderColor` `defaults` (defaults per `bubble` / `text` / `sfx` / `effect` / `shape`) `pages`
- Page: `layout` `background` `panels` (in reading order; `null` skips a panel) `items` (free placement with `type`; `at` is relative to the live area) `combine` (shape merging; see "Shapes" below)
- Panel: `image` (a path string or an image operation) `fill` `border` (0 = no border, null = default) `borderColor` `effects` `shapes` `bubbles` `texts` `sfx` `items`
- Image paths are relative to the spec file. If `layout` is omitted on page 2 or later, the previous page's layout is reused
- Contents use the same fields as the operations below (`page` and `panel` are filled in automatically)

### Panel layout (layout)

- Templates: by alias, Japanese name, or number (`komawari templates`). `single` `2-tier` `3-tier` `4koma` `grid-2x2` `4koma-2col` `basic-5` `basic-6` `3-tier-mid-split` `2-over-big` `big-over-2` `tall-1-plus-2` `3-columns` `diagonal-3` `diagonal-5` `action`
- `rows`: column width ratios per row, e.g. `[[1], [1, 1], [2, 1]]`. List columns in **reading order** (for rtl, the first is the rightmost). Row height ratio: `{"h": 2, "cols": [1, 1]}`
- `cuts`: `[[x1, y1, x2, y2], …]` line segments (0–1, relative to the live area) applied in order. Every panel the segment touches is split along the infinite line through it. Use this for diagonal panels too (e.g. a diagonal two-tier page: `[[0, 0.55, 1, 0.42]]`)

## Operations (ops)

`apply` takes an array of operations (or `{"ops": [...]}`). All operations are validated first, then executed in order; if any fails, nothing is saved. The ids of created items are returned in `results` (you may also set `"id"` yourself).

| op | Main fields |
|---|---|
| `bubble` | `text` (required) `page` `panel` `at`/`xy` `shape` `tail` `vertical` `font` `fontSize`/`scale` `bold` `lineHeight` `letterSpacing` `align` `color` `fill` `stroke` `strokeWidth` `dashed` `width` `height` `rotate` `opacity` `clip` `inside` `id` |
| `text` | `text` (required) + text fields, `outline` `outlineWidth` `outline2` `outline2Width` `background` (`"#ffffff"` for a narration box) |
| `sfx` | `text` with sound-effect defaults (extra bold, double outline, slight tilt). Same fields as `text` |
| `image` | `src` or `asset`, `page` `panel` `fit` (cover / contain) `zoom` `focus` `at` `rotate` `flipX` `flipY` `gray` `brightness` `contrast` `mode` (normal / mono / halftone) `threshold` `dot`. With `free: true` or no `panel`, it is placed freely (`width` / `height` / `rotate` / `clip`) |
| `effect` | `kind` (focus / speed / flash / tone, required) `page` `panel` `at`+`size`, plus the fields below |
| `shape` | `shape` (rect / ellipse / polygon / star) or `points` (free polygon), `page` `panel` `at`/`xy` `size` `width` `height` `fill` `stroke` `strokeWidth`, plus the fields below |
| `combine` | `ids` (shape ids, required) `mode` (union / subtract / intersect / exclude / fragment; default union) `id` |
| `layout` | `page` and one of `template` / `rows` / `cuts`. Images carry over to the new panels in reading order |
| `split` | `page` `panel` `dir` (h = horizontal line splitting top/bottom / v = vertical line splitting left/right) `at` (0–1, default 0.5) `angle` (tilt in degrees) |
| `panel` | `page` `panel` `fill` `border` `borderColor` |
| `page.add` | `after` (default: end) `template`/`rows`/`cuts` (omit to reuse the previous page's layout) `background` |
| `page.remove` / `page.move` / `page.set` | `page` / `page` `to` / `page` `background` |
| `meta` | `title` `size` (scales the contents too) `direction` `margin` `gutter` `border` `borderColor` |
| `set` | `id` (or `page`+`panel`) and the fields to change. Any field of that item's type works. Giving only `at` moves it |
| `remove` | `id` (item or panel), or `page`+`panel` (removes the panel and its effects) |
| `clear` | `page` `what` (items / images / all) |

To adjust only a panel's image, use `image` without `src` (e.g. `{"op": "image", "page": 1, "panel": 2, "zoom": 1.4, "focus": [0.5, 0.3]}`).

```json
[
  { "op": "set", "id": "b2", "text": "まって！\nまだ\n準備が…", "tail": { "to": [0.3, 0.7] } },
  { "op": "bubble", "page": 1, "panel": 4, "text": "にゃ", "shape": "round", "at": "bottom-left", "tail": "up-right" },
  { "op": "split", "page": 2, "panel": 1, "dir": "v", "at": 0.4 },
  { "op": "image", "page": 2, "panel": 2, "src": "face.png", "zoom": 1.3, "focus": [0.5, 0.35] },
  { "op": "page.add", "template": "4koma" },
  { "op": "remove", "id": "e2" }
]
```

## Speech bubbles and dialogue

- Vertical text is the default (`"vertical": false` for horizontal). Keep **each column to 8–10 characters or fewer**, breaking lines with `\n`, and keep a bubble to 2–4 columns. Split long lines of dialogue into multiple bubbles
- Bubble size fits the text automatically. Setting `width`/`height` fixes it
- Within a panel, also place bubbles in reading order (for rtl, the first speaker's bubble at top-right, the next toward bottom-left)
- `tail`: points down if omitted. `false` = no tail. A direction such as `"down"` `"down-left"` `"up-right"`, or the speaker's mouth position `[x, y]` (same coordinates as `at`). Full form: `{"to": [x, y], "style": "curve", "bend": 0.4, "width": 0.24}`. `style` is straight / curve / thought (puffy thought-bubble dots)
- `shape`: `ellipse` normal / `round` calm conversation / `rect` narration / `cloud` inner thoughts (tail becomes thought dots automatically) / `spike` shouting / `burst` surprise / `jagged` phone or machine voice / `wavy` trembling voice or fear / `urchin` shock. Inner thoughts can also use `"dashed": true`
- In vertical text, "!?", "!!" and two-digit numbers are set side by side in one cell (tate-chu-yoko). Punctuation, brackets, long-vowel marks and "…" are rotated for vertical writing
- Sound effects use `sfx` (default font Dela Gothic One, white + black outline, -8°). Tune impact with `rotate` and `scale`
- `font`: `antique` (for manga dialogue: mincho kana with gothic kanji) `gothic` `mincho` `maru` `ud` `klee` `yusei` `kurenaido` `hachi` `kaisei` `dela` `reggae` `rocknroll` `rampart` `potta` `yuji` `mochiy` `dot`, or a system font name as `"custom:FontName"`

## Images

- A panel image is centered and sized to fill the panel by default (`fit: "cover"`)
- `zoom`: multiplier on that size (1.5 = closer). `focus`: the point in the image to show (0–1, e.g. a face position). It is moved to the panel center (or to `at` if given), adjusted automatically so the panel stays filled
- `mode`: `halftone` (`dot` = dot spacing in px), `mono` (black-and-white threshold; `threshold` 0–255). `gray` `brightness` `contrast` (%)
- For figures that break out of the panel frame, use free placement (`free: true` or no `panel`). Transparent PNGs work well
- Images larger than 4096px are downscaled on import. Identical images are stored only once in the project

## Effects (effect)

By default an effect fills the panel, is clipped to the panel (`clip: false` to disable), and sits below bubbles. For a partial effect, use `at` and `size` (a number is a ratio of the short side; `[width, height]` is a ratio of the panel).

- `focus` (concentration lines): `center` (focal point) `inner` (empty center, 0–1) `count` `thickness` `jitter` `color` `background`
- `speed` (speed lines): `angle` (line direction in degrees) `count` `thickness` `minLength` `maxLength` (0–1) `taper` (one / both) `centerGap` `background`
- `flash` (spiky "uni" flash): `inner` `count` `thickness` `minLength` `fill` `color` `strokeWidth`
- `tone` (screentone): `pattern` (dots / grad / lines / cross / solid) `pitch` `density` `density2` `gradientAngle` `angle` `shape` (rect / ellipse) `color` (white for white tone)

## Shapes (shape) and combining (combine)

You can place rectangles, ellipses, polygons, stars, and free polygons defined by vertices. The default is a white fill with a black stroke, layered below bubbles and text (shapes may extend outside the panel).

- `shape`: `rect` (rectangle; `radius` = corner radius in px) `ellipse` `polygon` (regular polygon; `sides` = number of corners) `star` (`sides` = number of points, `inner` = indentation 0–1)
- Free polygon via `points`: `[[x, y], …]` (3 or more; 0–1 relative to the panel or live area, like `at`). `shape` is not needed then
- Position with `at` / `xy`. Size with `size` (a number is a ratio of the short side and keeps a square / circle / regular shape; `[width, height]` is a ratio of the panel) or `width` / `height` (giving only one keeps the aspect ratio). Default is 0.4 of the short side
- Fill: `fill` (color; `"none"` for no fill) `pattern` (`solid`, or `dots` / `grad` / `lines` / `cross` for tone; pattern color is `fill`) `pitch` `density` `density2` `gradientAngle` `angle`
- Stroke: `stroke` (color; `"none"` for none) `strokeWidth` (px; 0 for none) `line` (solid / dashed / dotted) `join` (corner style: miter / round / bevel) `strokeAlign` (stroke position: center / inside / outside)
- `rotate` `opacity` `clip` (show only inside the panel) `locked` `hidden`. The same fields can be changed with `set` (`points` replaces the whole shape)

`combine` merges the shapes in `ids` (two or more; stacking order is handled automatically) into one, as below. The original shapes are removed and the new shape's id is returned in `results` (you can name it with `id`, and may reuse an id of one of the combined shapes).

| `mode` | Result |
|---|---|
| `union` | Merge the overlapping shapes into one |
| `subtract` | Cut the other shapes out of the backmost (first placed) shape |
| `intersect` | Keep only the area where all shapes overlap |
| `exclude` | Cut out the overlapping areas |
| `fragment` | Split into separate shapes along the overlap boundaries (`ids` may be several; `id` cannot be used). With a single shape, its disconnected parts become separate shapes |

The result inherits the fill, stroke and stacking position of the backmost shape (for `fragment`, each piece takes the look of the frontmost shape covering it). In a spec, write the same objects in the page's `combine`.

```json
{
  "layout": "basic-5",
  "panels": [
    { "shapes": [
        { "id": "full", "shape": "ellipse", "at": [0.4, 0.5], "size": 0.6, "fill": "#ffe066" },
        { "id": "bite", "shape": "ellipse", "at": [0.58, 0.42], "size": 0.55 } ] }
  ],
  "combine": [{ "ids": ["full", "bite"], "mode": "subtract", "id": "moon" }]
}
```

## Fonts

`komawari fonts` shows what each font is rendered with. On Windows / macOS the OS fonts Yu Gothic, Yu Mincho and Hiragino are used. For web fonts (`dela`, `maru`, etc.) or on Linux without Japanese fonts, run `komawari fonts fetch base dela` (`all` for everything) to download them from Google Fonts into `~/.komawari/fonts` (change the location with `KOMAWARI_FONT_DIR`). Embed your own fonts into a project with `fonts add <ttf> --project <file>` and use them via `"font": "custom:name"`.

## Common errors

Messages are printed in Japanese; the patterns below are what you will see.

- `ページ1にコマ 6 はありません（5コマ）` ("page 1 has no panel 6 (5 panels)") → the layout's panel count does not match the number of `panels`. Check panel counts with `templates`
- `bubble に「tial」という項目はありません` / `もしかして「tail」？` ("bubble has no field 'tial'" / "did you mean 'tail'?") → misspelled field name. `komawari schema` lists every field
- `画像ファイルがありません` ("image file not found") → paths are relative to the spec / ops file
- Warning `〜が重なっています` ("… overlap") → move one with `set` and `at`, or shorten the text
- `id「e1」はすでに使われています` ("id 'e1' is already in use") → clashes with an auto-assigned id (bubble `b1`, text `t1`, sfx `s1`, effect `e1`, image `i1`, shape `sh1`, …). Use a different name
- `交差の結果が空です` ("the intersection is empty") → the shapes in `combine` do not overlap. Check positions and sizes via `box` in `info`
