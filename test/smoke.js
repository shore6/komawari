'use strict';
// npm test: build the example, edit it, render it, and check the results.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const bin = path.join(__dirname, '..', 'bin', 'komawari.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'komawari-'));
const run = (...args) => JSON.parse(execFileSync(process.execPath, [bin, ...args, '--compact'], { encoding: 'utf8' }));
const check = (cond, msg) => { if (!cond) { console.error('NG:', msg); process.exit(1); } console.log('ok:', msg); };

const ex = run('example', path.join(dir, 'work'));
check(ex.ok && ex.files.includes('spec.json'), 'example をコピーできる');
const b = run('build', path.join(dir, 'work', 'spec.json'), '-o', path.join(dir, 'story.manga.json'), '--render', path.join(dir, 'prev'), '--width', '600');
check(b.ok && b.pages === 2 && b.rendered.files.length === 2, 'spec から2ページを作って書き出せる');
check(b.rendered.files.every(f => fs.statSync(f.file).size > 1000 && f.width === 600), 'プレビュー画像が幅600pxで出る');
fs.writeFileSync(path.join(dir, 'ops.json'), JSON.stringify([{ op: 'bubble', page: 1, panel: 4, text: 'テスト', id: 'smoke1' }, { op: 'split', page: 2, panel: 1, dir: 'v' }]));
const a = run('apply', path.join(dir, 'story.manga.json'), path.join(dir, 'ops.json'));
check(a.ok && a.results[0].id === 'smoke1', '操作を適用できる');
const i = run('info', path.join(dir, 'story.manga.json'), '--page', '1');
check(i.ok && i.pages[0].items.some(x => x.id === 'smoke1' && x.panel === 4), 'info に追加した吹き出しが出る');
const r = run('render', path.join(dir, 'story.manga.json'), '-o', path.join(dir, 'final', 'p{n}.jpg'), '--page', 'all', '--scale', '0.5');
check(r.ok && r.files.length === 2 && r.files[0].width === 910, 'JPEGで縮小書き出しできる');
let bad;
try { execFileSync(process.execPath, [bin, 'validate', '-'], { input: '[{"op":"bubbel","text":"x"}]', encoding: 'utf8' }); } catch (err) { bad = JSON.parse(err.stdout); }
check(bad && bad.ok === false && /bubble/.test(bad.hint), '間違いには直し方のヒントが返る');
fs.rmSync(dir, { recursive: true, force: true });
console.log('all ok');
