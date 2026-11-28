# komawari（コマワリ工房 CLI）

Webアプリ「コマワリ工房」の描画コアを切り出したコマンドラインツールです。コマ割り・画像・吹き出し・効果音・効果線・トーン・図形をJSONで指定してマンガのページを組み立て、PNG / JPEG / WebP に好きな解像度で書き出します。LLM（Claude Code などのエージェント）がそのまま使えるように、入力も出力もJSONで、間違えたときは直し方のヒントを返します。

作った作品ファイル（`.manga.json`）はWebアプリでそのまま開けるので、「LLMに下書きさせて、人が画面で仕上げる」使い方ができます。

## 必要なもの

- Node.js 18 以上（Windows / macOS / Linux）

## インストール

```sh
cd komawari
npm install          # 描画ライブラリ（@napi-rs/canvas）を入れる
npm link             # どこからでも komawari コマンドで使えるようにする（任意）
komawari --help
```

`npm link` をしない場合は `node bin/komawari.js …` で同じように使えます。

## 3分で試す

```sh
komawari example work                     # サンプルの spec.json と画像をコピー
komawari build work/spec.json --render --annotate --width 1000
komawari info work/spec.manga.json        # コマ番号・アイテムid・警告をJSONで確認
komawari render work/spec.manga.json -o final/ --dpi 600   # 印刷用に書き出し
```

`--annotate` を付けたプレビューには、コマの読み順番号（青丸）とアイテムのid（赤ラベル）が入ります。

## LLMに使わせる

エージェントには次のように頼むと確実です。

> `komawari guide` を読んでから、komawari CLI でマンガのページを作ってください。画像は ./images にあります。spec.json を書いて build し、--annotate 付きのプレビューを見て ops.json で直してください。

- `komawari guide` … LLM向けの使い方（spec・操作・座標・セリフのコツ）。`GUIDE.md` と同じ内容
- `komawari schema` … すべての操作と項目の型をJSONで
- Claude Code で使う場合は `agent/SKILL.md` を `.claude/skills/komawari/SKILL.md` にコピーすると、マンガ制作の依頼で自動的に参照されます

基本は「ページ全体を `spec.json` に書いて `build`」→「プレビューを見て、直す点を操作の配列にして `apply`」の繰り返しです。

## 図形

四角形・角丸四角形・楕円・三角形・多角形・星と、頂点を並べた自由な多角形を置けます。塗りはベタかトーン（網点・グラデ・斜線・格子）、線は色・太さ・実線／破線／点線・角の形・位置（中央／内側／外側）を選べます。重ねた図形は「合体」「型抜き」「交差」「中マド」「分割」で1つの形にまとめられます。

- Webアプリ: 左のツールの「図形」から追加。「自由形」はクリックで頂点を置いて描きます（P キー）。Shift+クリックか、空いた所からの Shift+ドラッグで複数選ぶと、プロパティに結合と整列のボタンが出ます（タッチ操作ではプロパティの「複数選択モード」をオンに）。自由形や結合してできた図形はダブルクリックで頂点を編集でき、ほかの図形もプロパティの「頂点を編集」で自由形に変換して編集できます
- CLI: 操作 `shape` と `combine`（spec ではコマの `shapes` とページの `combine`）。詳しくは `komawari guide`

## フォント

Windows / macOS ではOSの游ゴシック・游明朝・ヒラギノが使われ、セリフの標準（アンチック風：かなは明朝、漢字はゴシック）もそのまま再現されます。効果音用の Dela Gothic One などWebアプリと同じWebフォントは、次のコマンドで Google Fonts から取得します（`~/.komawari/fonts` に保存）。

```sh
komawari fonts                 # 各フォントが何で描かれるかを確認
komawari fonts fetch dela      # 効果音の標準フォント
komawari fonts fetch all       # Webアプリと同じフォントを全部
```

日本語フォントのないLinuxでは `komawari fonts fetch base` も実行してください。会社のネットワークなどプロキシ経由の環境では、`HTTPS_PROXY` に加えて `NODE_USE_ENV_PROXY=1` を設定します（Node 22.21 以降）。

## フォルダの構成

```
src/core.js          共通コア（コマ割り・縦書き組版・吹き出し・効果・描画）。Webアプリと CLI の両方がここから作られる
src/web/             Webアプリ固有の部分（画面・操作・保存）
lib/core.cjs         src/core.js から生成した CLI 用のコア（npm run build で再生成）
lib/                 CLI（engine: 描画と入出力、ops: 操作と spec、info: 状態と警告、cli: コマンド）
web/index.html       Webアプリ（1ファイル。ダブルクリックでオフラインでも使える）
examples/demo/       サンプルの spec.json と画像（画像は動作確認用に作った絵）
GUIDE.md             LLM向けガイド（komawari guide の中身）
```

コアを直したら `npm run build` で `lib/core.cjs` と `web/index.html` の両方を作り直します。`npm test` で図形の結合の検証（test/geometry.js）と簡単な動作確認（test/smoke.js）ができます。

## プログラムから使う

```js
const kw = require('./komawari');
kw.newProject({ size: 'B5', title: 'テスト' });
kw.core.project.pages.push(kw.core.newPage());
await kw.runOps([{ op: 'layout', page: 1, template: 'basic-5' }, { op: 'bubble', page: 1, panel: 1, text: 'やあ' }]);
kw.saveProject('test.manga.json');
const [png] = await kw.renderPages([0], { width: 2000 });   // png.buffer に画像
```

## メモ

- Windows の PowerShell で標準入力に日本語のJSONを流すと文字化けすることがあるため、JSONはファイルに保存して渡すのが確実です
- 書き出せる大きさは一辺16,384px・2億画素までです
- Google Fonts のフォントは SIL Open Font License です
