---
name: komawari
description: Make or edit manga pages (panel layouts, images in panels, Japanese speech bubbles, sound effects, speed/focus lines, screentone) and export them as images with the komawari CLI. Use when asked to create a manga/comic page, storyboard, or 4-koma from images or a script.
---

# komawari でマンガのページを作る

1. 最初に `komawari guide` を実行して全文を読む（spec・操作・座標・セリフのコツが書いてある）。項目の一覧は `komawari schema`、コマ割りは `komawari templates`
2. ページ全体を spec.json に書き、`komawari build spec.json -o story.manga.json --render previews/ --annotate --width 1000`
3. previews の画像を必ず見て確認する（青丸=コマの読み順番号、赤ラベル=アイテムid）。出力JSONの warnings にも対応する
4. 直す点を ops.json（操作の配列）にして `komawari apply story.manga.json ops.json --render previews/ --annotate --width 1000`。2〜4を納得いくまで繰り返す
5. 仕上げは `komawari render story.manga.json -o final/ --dpi 600`（または `--width`）。`--annotate` は付けない

- セリフは縦書き・1列8〜10文字以内で改行。吹き出しは読み順（右上→左下）に置き、tail の to は話し手の口元に向ける
- 出力が `"ok": false` なら error と hint を読んで直す
- 完成した .manga.json はWebアプリ「コマワリ工房」で開いて人が手直しできると伝える
