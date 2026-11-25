# komawari ガイド（LLM・エージェント向け）

komawari は「コマワリ工房」のコアを切り出したCLIです。JSONでマンガのページ（コマ割り・画像・吹き出し・効果音・効果線・トーン）を組み立て、PNG / JPEG / WebP に好きな解像度で書き出します。作品ファイル（`.manga.json`）はWebアプリ版コマワリ工房でそのまま開いて手直しできます。

出力はすべて1つのJSONです。`"ok": false` のときは `error` と `hint`（複数あれば `details`）を読んで直してください。`warnings` には重なり・はみ出し・長すぎる列・足りないフォントが出ます。

## 基本の流れ

1. 形をつかむ（任意）: `komawari example work` でサンプルの `spec.json` と画像がコピーされる
2. ページ全体を `spec.json` に書いて作る:
   `komawari build spec.json -o story.manga.json --render previews/ --annotate --width 1000`
3. `previews/*.png` を目で確認する。`--annotate` 付きだと、コマの読み順番号（青い丸）とアイテムのid（赤いラベル）が描き込まれる
4. 直す点を操作の配列 `ops.json` に書いて適用する:
   `komawari apply story.manga.json ops.json --render previews/ --annotate --width 1000`
5. 仕上げの書き出し: `komawari render story.manga.json -o final/ --dpi 600`（`--width 3000`、`--scale 2` も可）

状態の確認は `komawari info story.manga.json`（コマの番号・位置、アイテムのid・位置・テキスト、警告）。

## コマンド

| コマンド | 内容 |
|---|---|
| `guide` / `schema` / `templates` | このガイド／全項目のJSON一覧／テンプレート一覧 |
| `example [dir]` | サンプル一式をコピー |
| `new <file> [--size B5] [--pages N] [--template basic-5] [--title 名前]` | 空の作品を作る |
| `build <spec.json\|-> [-o file] [--render [出力先]] [--annotate] [--width W]` | spec から作品を作る（`-` は標準入力） |
| `apply <file> <ops.json\|-> [-o 別ファイル] [--render [出力先]] [--annotate]` | 操作を適用（既定は上書き保存） |
| `validate <json>` | spec / ops を検査だけする |
| `info <file> [--page N]` | 作品の中身をJSONで表示 |
| `render <file> [-o 出力] [--page N\|1,3\|2-4\|all] [--width W\|--height H\|--scale S\|--dpi D] [--format png\|jpeg\|webp] [--quality 0.92] [--transparent] [--annotate]` | 画像に書き出す |
| `fonts` / `fonts fetch <id…\|base\|all>` / `fonts add <ttf…> --project <file>` | フォントの状態／取得／作品への埋め込み |

`-o` がフォルダ（末尾が `/` か拡張子なし）なら `作品名_p01.png` のように並びます。`{n}` を含めるとページ番号に置き換わります。

## 座標と大きさ

- `page` は1から。`panel` はそのページのコマを**読み順**（右綴じなら右上→左下）で数えた番号（1から）。コマ割りを変えると番号も変わるので、変えた後は `info` か `--annotate` で確かめる
- `at`: 位置。`panel` を書くとそのコマの外接矩形に対する `[x, y]`（0〜1、左上が `[0, 0]`）。`panel` がないときはページの基本枠（余白の内側）に対する比率。名前でも書ける: `center` `top` `bottom` `left` `right` `top-left` `top-right` `bottom-left` `bottom-right`
- `xy`: ページのピクセル座標 `[x, y]`（`at` の代わり）
- `fontSize` はページのピクセル。`scale` は標準の文字サイズに対する倍率（吹き出し 2.1%、テキスト 2.2%、効果音 8% ×用紙の短辺）
- `width` / `height` はコマ（または基本枠）に対する比率
- 用紙: B5 は 1820×2570px（1mm=10px）。ほかに A5, A4, B4, square, 4:5, 9:16, 16:9, `"1600x2400"`
- 吹き出しとテキストは、コマに置くと既定でコマの内側に収まるよう寄せられる（`"inside": false` で無効）

## spec（ページ全体を1つのJSONで書く）

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

- トップ: `title` `size` `direction`（rtl / ltr）`margin`（px、数値か `[上下, 左右]` か `[上, 右, 下, 左]`）`gutter`（px、数値か `[左右の間, 上下の間]`）`border` `borderColor` `defaults`（`bubble` / `text` / `sfx` / `effect` ごとの既定値）`pages`
- ページ: `layout` `background` `panels`（読み順。`null` で飛ばす）`items`（`type` 付きの自由配置。`at` は基本枠に対する比率）
- コマ: `image`（パス文字列か画像の操作）`fill` `border`（0 で枠なし、null で標準）`borderColor` `effects` `bubbles` `texts` `sfx` `items`
- 画像パスは spec ファイルのある場所から相対。2ページ目以降で `layout` を省くと前のページと同じコマ割りになる
- 中身は下の操作と同じ項目で書ける（`page` と `panel` は自動で入る）

### コマ割り（layout）

- テンプレート: 別名・日本語名・番号のどれでも（`komawari templates`）。`single` `2-tier` `3-tier` `4koma` `grid-2x2` `4koma-2col` `basic-5` `basic-6` `3-tier-mid-split` `2-over-big` `big-over-2` `tall-1-plus-2` `3-columns` `diagonal-3` `diagonal-5` `action`
- `rows`: `[[1], [1, 1], [2, 1]]` のように行ごとに列の幅比。列は**読み順**に並べる（右綴じなら最初が右）。行の高さ比は `{"h": 2, "cols": [1, 1]}`
- `cuts`: `[[x1, y1, x2, y2], …]` 基本枠に対する0〜1の線分で順に切る。線分が触れたコマが、その線を延長した直線で分かれる。斜めのコマもこれで作る（例: 斜めの2段 `[[0, 0.55, 1, 0.42]]`）

## 操作（ops）

`apply` には操作の配列（または `{"ops": [...]}`）を渡します。すべて検査してから順に実行し、途中で失敗したら保存しません。作ったアイテムのidが `results` に返ります（`"id"` を自分で付けてもよい）。

| op | 主な項目 |
|---|---|
| `bubble` | `text`（必須）`page` `panel` `at`/`xy` `shape` `tail` `vertical` `font` `fontSize`/`scale` `bold` `lineHeight` `letterSpacing` `align` `color` `fill` `stroke` `strokeWidth` `dashed` `width` `height` `rotate` `opacity` `clip` `inside` `id` |
| `text` | `text`（必須）＋文字の項目、`outline` `outlineWidth` `outline2` `outline2Width` `background`（ナレーション箱なら `"#ffffff"`） |
| `sfx` | `text` の効果音向け既定（極太・二重フチ・少し傾き）。項目は `text` と同じ |
| `image` | `src` か `asset`、`page` `panel` `fit`（cover / contain）`zoom` `focus` `at` `rotate` `flipX` `flipY` `gray` `brightness` `contrast` `mode`（normal / mono / halftone）`threshold` `dot`。`free: true` か `panel` なしで自由配置（`width` / `height` / `rotate` / `clip`） |
| `effect` | `kind`（focus / speed / flash / tone、必須）`page` `panel` `at`+`size` ほか下記 |
| `layout` | `page` と `template` / `rows` / `cuts` のどれか。画像は読み順で新しいコマへ引き継がれる |
| `split` | `page` `panel` `dir`（h=上下に分ける横線 / v=左右に分ける縦線）`at`（0〜1、既定0.5）`angle`（傾き°） |
| `panel` | `page` `panel` `fill` `border` `borderColor` |
| `page.add` | `after`（既定は末尾）`template`/`rows`/`cuts`（省略で前のページと同じ）`background` |
| `page.remove` / `page.move` / `page.set` | `page` ／ `page` `to` ／ `page` `background` |
| `meta` | `title` `size`（中身ごと拡大縮小）`direction` `margin` `gutter` `border` `borderColor` |
| `set` | `id`（または `page`+`panel`）と変えたい項目。種類ごとの項目がそのまま使える。`at` だけ書けば移動 |
| `remove` | `id`（アイテムかコマ）、または `page`+`panel`（コマとその中の効果を削除） |
| `clear` | `page` `what`（items / images / all） |

コマの画像だけ調整するときは `src` なしの `image`（例: `{"op": "image", "page": 1, "panel": 2, "zoom": 1.4, "focus": [0.5, 0.3]}`）。

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

## 吹き出しとセリフ

- 縦書きが既定（`"vertical": false` で横書き）。**1列は8〜10文字以内**で `\n` 改行し、1つの吹き出しは2〜4列までに。長いセリフは吹き出しを分ける
- 吹き出しの大きさはセリフに合わせて自動。`width`/`height` を指定すると固定になる
- 1つのコマの中も読み順に置く（右綴じなら先に話す吹き出しを右上、次を左下へ）
- `tail`: 省略で下向き。`false` でなし。向き `"down"` `"down-left"` `"up-right"` など、または話し手の口元の位置 `[x, y]`（`at` と同じ座標）。`{"to": [x, y], "style": "curve", "bend": 0.4, "width": 0.24}`。`style` は straight / curve / thought（もくもく）
- `shape`: `ellipse` 通常／`round` 穏やかな会話／`rect` ナレーション／`cloud` 心の声（しっぽは自動でもくもく）／`spike` 叫び／`burst` 驚き／`jagged` 電話・機械音／`wavy` 震え声・恐怖／`urchin` 衝撃。心の声は `"dashed": true` も使える
- 縦書きでは「!?」「!!」や2桁の数字が1マスに横並びで入る（縦中横）。句読点・カギ括弧・長音・「…」は縦書きの向きになる
- 効果音は `sfx`（既定は Dela Gothic One、白フチ＋黒フチ、-8°）。`rotate` `scale` で迫力を調整
- `font`: `antique`（マンガのセリフ用。かなが明朝・漢字がゴシック）`gothic` `mincho` `maru` `ud` `klee` `yusei` `kurenaido` `hachi` `kaisei` `dela` `reggae` `rocknroll` `rampart` `potta` `yuji` `mochiy` `dot`、またはPCのフォント名 `"custom:フォント名"`

## 画像

- コマに入れる画像は、既定でコマを埋める大きさ（`fit: "cover"`）で中央に置かれる
- `zoom`: その大きさに対する倍率（1.5 で寄り）。`focus`: 画像の中で見せたい点（0〜1、例: 顔の位置）。そこがコマの中央（`at` があればその位置）に来て、コマが埋まるように自動で寄せる
- `mode`: `halftone`（網点。`dot` は網点の間隔px）、`mono`（白黒2値。`threshold` 0〜255）。`gray` `brightness` `contrast`（%）
- 枠からはみ出す人物などは自由配置（`free: true` か `panel` なし）。透過PNGが向いている
- 4096pxを超える画像は取り込み時に縮小。同じ画像は1回だけ作品に入る

## 効果（effect）

既定ではコマいっぱいに置かれ、コマの内側で切り抜かれ（`clip: false` で解除）、吹き出しより下に重なります。一部分だけなら `at` と `size`（数値なら短辺に対する比率、`[幅, 高さ]` ならコマに対する比率）。

- `focus`（集中線）: `center`（集中する位置）`inner`（中心の空き 0〜1）`count` `thickness` `jitter` `color` `background`
- `speed`（流線）: `angle`（線の向き°）`count` `thickness` `minLength` `maxLength`（0〜1）`taper`（one / both）`centerGap` `background`
- `flash`（ウニフラッシュ）: `inner` `count` `thickness` `minLength` `fill` `color` `strokeWidth`
- `tone`（スクリーントーン）: `pattern`（dots / grad / lines / cross / solid）`pitch` `density` `density2` `gradientAngle` `angle` `shape`（rect / ellipse）`color`（白で白トーン）

## フォント

`komawari fonts` で各フォントが何で描かれるかを確認できます。Windows / macOS ではOSの游ゴシック・游明朝・ヒラギノが使われます。Webフォント（`dela` `maru` など）や日本語フォントのないLinuxでは `komawari fonts fetch base dela`（全部は `all`）で Google Fonts から `~/.komawari/fonts` に取得します（`KOMAWARI_FONT_DIR` で場所を変更）。手持ちのフォントは `fonts add <ttf> --project <file>` で作品に埋め込み、`"font": "custom:名前"` で使えます。

## よくあるエラー

- `ページ1にコマ 6 はありません（5コマ）` → コマ割りのコマ数と `panels` の数が合っていない。`templates` でコマ数を確認する
- `bubble に「tial」という項目はありません／もしかして「tail」？` → 項目名の誤り。`komawari schema` に全項目がある
- `画像ファイルがありません` → パスは spec / ops ファイルのある場所から相対
- 警告「〜が重なっています」→ `set` で `at` を動かすか、文字を減らす
