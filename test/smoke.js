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
fs.writeFileSync(path.join(dir, 'shapes.json'), JSON.stringify([
  { op: 'shape', page: 1, panel: 4, shape: 'rect', id: 'rc1', size: 0.5, at: [0.4, 0.5] },
  { op: 'shape', page: 1, panel: 4, shape: 'ellipse', id: 'el1', size: 0.5, at: [0.6, 0.5], fill: '#cccccc', line: 'dashed', pattern: 'dots' },
  { op: 'combine', ids: ['el1', 'rc1'], mode: 'subtract', id: 'cut1' },
  { op: 'shape', page: 2, points: [[0.1, 0.1], [0.4, 0.1], [0.25, 0.4]], id: 'tri', strokeAlign: 'outside' },
]));
const sa = run('apply', path.join(dir, 'story.manga.json'), path.join(dir, 'shapes.json'));
check(sa.ok && sa.results[2].id === 'cut1', '図形を追加して型抜きで結合できる');
const si = run('info', path.join(dir, 'story.manga.json'));
check(si.pages[0].items.some(x => x.id === 'cut1' && x.type === 'shape' && x.shape === 'path' && x.fill === '#ffffff') && !si.pages[0].items.some(x => x.id === 'rc1' || x.id === 'el1') && si.pages[1].items.some(x => x.id === 'tri' && x.vertices === 3), 'info に結合した図形と自由な多角形が出る');
const r = run('render', path.join(dir, 'story.manga.json'), '-o', path.join(dir, 'final', 'p{n}.jpg'), '--page', 'all', '--scale', '0.5');
check(r.ok && r.files.length === 2 && r.files[0].width === 910, 'JPEGで縮小書き出しできる');
let bad;
try { execFileSync(process.execPath, [bin, 'validate', '-'], { input: '[{"op":"bubbel","text":"x"}]', encoding: 'utf8' }); } catch (err) { bad = JSON.parse(err.stdout); }
check(bad && bad.ok === false && /bubble/.test(bad.hint), '間違いには直し方のヒントが返る');
fs.rmSync(dir, { recursive: true, force: true });
console.log('all ok');
