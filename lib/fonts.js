'use strict';
// Font handling for the Node side: system fonts, the font cache, fonts embedded
// in a project, and the per-glyph faces that give the アンチック look.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { GlobalFonts } = require('@napi-rs/canvas');

const FONT_DIR = process.env.KOMAWARI_FONT_DIR || path.join(os.homedir(), '.komawari', 'fonts');
const BASE_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/';

// Font id (same ids as the web app) -> Google Fonts files that provide it.
const CATALOG = {
  base: ['zenkakugothicnew/ZenKakuGothicNew-Regular.ttf', 'zenkakugothicnew/ZenKakuGothicNew-Bold.ttf', 'zenoldmincho/ZenOldMincho-Regular.ttf', 'zenoldmincho/ZenOldMincho-Bold.ttf', 'zenantique/ZenAntique-Regular.ttf'],
  maru: ['zenmarugothic/ZenMaruGothic-Medium.ttf', 'zenmarugothic/ZenMaruGothic-Black.ttf'],
  klee: ['kleeone/KleeOne-Regular.ttf', 'kleeone/KleeOne-SemiBold.ttf'],
  yusei: ['yuseimagic/YuseiMagic-Regular.ttf'],
  kurenaido: ['zenkurenaido/ZenKurenaido-Regular.ttf'],
  hachi: ['hachimarupop/HachiMaruPop-Regular.ttf'],
  kaisei: ['kaiseidecol/KaiseiDecol-Regular.ttf', 'kaiseidecol/KaiseiDecol-Bold.ttf'],
  dela: ['delagothicone/DelaGothicOne-Regular.ttf'],
  reggae: ['reggaeone/ReggaeOne-Regular.ttf'],
  rocknroll: ['rocknrollone/RocknRollOne-Regular.ttf'],
  rampart: ['rampartone/RampartOne-Regular.ttf'],
  potta: ['pottaone/PottaOne-Regular.ttf'],
  yuji: ['yujisyuku/YujiSyuku-Regular.ttf'],
  mochiy: ['mochiypopone/MochiyPopOne-Regular.ttf'],
  dot: ['dotgothic16/DotGothic16-Regular.ttf'],
};
// Faces for the アンチック style: kana from a mincho, everything else from a gothic.
const KANA_CSS = '"Yu Mincho", YuMincho, "Hiragino Mincho ProN", "Noto Serif CJK JP", "Noto Serif JP", "Zen Old Mincho", "Zen Antique", serif';
const OTHER_CSS = '"Yu Gothic", YuGothic, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans CJK JP", "Noto Sans JP", "Zen Kaku Gothic New", sans-serif';
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui']);

let started = false;
function init() {
  if (started) return;
  started = true;
  try { if (fs.existsSync(FONT_DIR)) GlobalFonts.loadFontsFromDir(FONT_DIR); } catch (err) { /* unreadable cache: system fonts still work */ }
}
function antiqueFaces(it) { return [{ w: it.bold ? 800 : 600, css: KANA_CSS }, { w: it.bold ? 900 : 700, css: OTHER_CSS }]; }
function families(css) {
  return String(css).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}
const has = f => { try { return GlobalFonts.has(f); } catch (err) { return false; } };
function firstAvailable(css) { for (const f of families(css)) { if (GENERIC.has(f)) return null; if (has(f)) return f; } return null; }
function dataUrlBuffer(src) { const i = src.indexOf(','); return Buffer.from(src.slice(i + 1), 'base64'); }
function registerProjectFonts(project) {
  const out = [];
  for (const f of project.fonts || []) {
    try { if (GlobalFonts.register(dataUrlBuffer(f.src), f.name)) out.push(f.name); } catch (err) { /* skip broken font */ }
  }
  return out;
}
// What a font id resolves to here. `primary` is the family the font id asks for first.
function resolve(K, id) {
  if (id === 'antique') {
    const kana = firstAvailable(KANA_CSS), other = firstAvailable(OTHER_CSS);
    return { ok: !!(kana && other), family: kana && other ? kana + ' + ' + other : null, fetch: kana && other ? null : 'base' };
  }
  const spec = K.fontSpec(id), fams = families(spec.css);
  if (CATALOG[id] || String(id).startsWith('custom:')) {
    const primary = fams[0];
    if (has(primary)) return { ok: true, family: primary, fetch: null };
    return { ok: false, family: firstAvailable(spec.css), fetch: CATALOG[id] ? id : null };
  }
  const found = firstAvailable(spec.css);
  return found ? { ok: true, family: found, fetch: null } : { ok: false, family: null, fetch: 'base' };
}
function status(K) {
  return K.FONTS.map(f => { const r = resolve(K, f.id); return { id: f.id, name: f.name, installed: r.ok, family: r.family, fetch: r.ok ? null : r.fetch }; });
}
function warningsFor(K, items) {
  const seen = new Map();
  for (const it of items) if (it.text && (it.type === 'bubble' || it.type === 'text') && !seen.has(it.font)) seen.set(it.font, resolve(K, it.font));
  const out = [];
  for (const [id, r] of seen) {
    if (r.ok) continue;
    out.push(`フォント「${id}」が見つからないため代わりのフォントで描画しました` + (r.fetch ? `。komawari fonts fetch ${r.fetch} で入手できます` : '。PCに入っているフォント名か、作品に取り込んだフォントを指定してください'));
  }
  return out;
}
async function fetchFonts(ids, log) {
  let want = ids.includes('all') ? Object.keys(CATALOG) : ids;
  const bad = want.filter(id => !CATALOG[id]);
  if (bad.length) { const e = new Error(`取得できるフォントIDではありません: ${bad.join(', ')}`); e.hint = '使えるID: ' + Object.keys(CATALOG).join(', ') + ', all'; throw e; }
  fs.mkdirSync(FONT_DIR, { recursive: true });
  const done = [];
  for (const id of want) {
    for (const file of CATALOG[id]) {
      const dest = path.join(FONT_DIR, path.basename(file));
      if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) { done.push({ id, file: dest, status: 'cached' }); continue; }
      if (log) log(`downloading ${file}`);
      const res = await fetch(BASE_URL + file);
      if (!res.ok) throw new Error(`ダウンロードに失敗しました (${res.status}): ${BASE_URL + file}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buf);
      GlobalFonts.registerFromPath(dest);
      done.push({ id, file: dest, status: 'downloaded' });
    }
  }
  return done;
}
function registerFile(file) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`フォントファイルがありません: ${file}`);
  return GlobalFonts.registerFromPath(abs);
}

module.exports = { FONT_DIR, CATALOG, init, antiqueFaces, registerProjectFonts, status, resolve, warningsFor, fetchFonts, registerFile, dataUrlBuffer };
