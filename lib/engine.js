'use strict';
// The Node engine: the shared core (lib/core.cjs, built from src/core.js) drawing
// through @napi-rs/canvas, plus project files, image import and export.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createCanvas, Path2D, loadImage } = require('@napi-rs/canvas');
const createCore = require('./core.cjs');
const fonts = require('./fonts');

class UserError extends Error {
  constructor(message, hint) { super(message); this.hint = hint || null; this.user = true; }
}

fonts.init();
const images = new Map();
const PLATFORM = {
  createCanvas: (w, h) => createCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h))),
  Path2D,
  image: id => images.get(id) || null,
  missingImage: () => {},
  needFont: () => {},
  splitFont: it => (it.font === 'antique' ? fonts.antiqueFaces(it) : null),
  supportsFilter: true,
};
const K = createCore(PLATFORM);

const SIZE_ALIASES = { square: 'SQ', '1:1': 'SQ', '4:5': 'P45', '9:16': 'P916', '16:9': 'L169', sns: 'P45', phone: 'P916', wide: 'L169' };
function parseSize(size) {
  if (size == null || size === '') return { preset: 'B5' };
  if (typeof size === 'object' && size.w > 0 && size.h > 0) return { w: Math.round(size.w), h: Math.round(size.h) };
  const s = String(size).trim(), m = s.match(/^(\d{3,5})\s*[x×*]\s*(\d{3,5})$/i);
  if (m) return { w: +m[1], h: +m[2] };
  const id = SIZE_ALIASES[s.toLowerCase()] || s.toUpperCase();
  const pr = K.PRESETS.find(p => p.id === id && p.w);
  if (!pr) throw new UserError(`用紙サイズ「${size}」は使えません`, '使える値: ' + K.PRESETS.filter(p => p.w).map(p => p.id).join(', ') + '、square, 4:5, 9:16, 16:9、または "1600x2400"');
  return { preset: pr.id };
}
function newProject(opts = {}) {
  const sz = parseSize(opts.size);
  K.project = sz.preset ? K.newProject(sz.preset, opts.title) : K.newProject('custom', opts.title, { w: clampInt(sz.w, 200, 20000), h: clampInt(sz.h, 200, 20000) });
  images.clear(); K.layoutCache.clear(); K.lumCache.clear(); K.procCache.clear();
  return K.project;
}
const clampInt = (v, a, b) => Math.max(a, Math.min(b, Math.round(v)));

function loadProject(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (err) { throw new UserError(`ファイルを読めません: ${file}`, '作品ファイル（.manga.json）のパスを確認してください'); }
  let o;
  try { o = JSON.parse(text); } catch (err) { throw new UserError(`JSONとして読めません: ${file} (${err.message})`); }
  const P = K.normalizeProject(o);
  if (!P) throw new UserError(`コマワリ工房の作品ファイルではありません: ${file}`, 'komawari new か build で作ったファイル、またはWebアプリで保存したファイルを指定してください');
  K.project = P;
  images.clear(); K.layoutCache.clear(); K.lumCache.clear(); K.procCache.clear();
  fonts.registerProjectFonts(P);
  return P;
}
function projectData() {
  const P = K.project;
  return { app: 'komawari', version: 1, name: P.name, page: P.page, layout: P.layout, pages: P.pages, assets: P.assets, fonts: P.fonts, savedAt: new Date().toISOString() };
}
function saveProject(file) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(projectData()));
  return path.resolve(file);
}

/* ---------- images ---------- */
function sniffMime(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 6 && buf.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length > 2 && buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp';
  if (buf.length > 12 && buf.toString('ascii', 4, 8) === 'ftyp' && /avi[fs]/.test(buf.toString('ascii', 8, 12))) return 'image/avif';
  return null;
}
const assetHash = new Map();
function hashOf(id) {
  let h = assetHash.get(id);
  if (!h) { const a = K.project.assets[id]; h = crypto.createHash('sha1').update(a.src).digest('hex'); assetHash.set(id, h); }
  return h;
}
async function importImage(file, baseDir) {
  const abs = path.resolve(baseDir || process.cwd(), file);
  let buf;
  try { buf = fs.readFileSync(abs); } catch (err) { throw new UserError(`画像ファイルがありません: ${file}`, `探した場所: ${abs}`); }
  const mime = sniffMime(buf);
  if (!mime) throw new UserError(`画像として読めません: ${file}`, 'PNG・JPEG・WebP・GIF・BMP・AVIF に対応しています');
  let img;
  try { img = await loadImage(buf); } catch (err) { throw new UserError(`画像を開けません: ${file} (${err.message})`); }
  let w = img.width, h = img.height, src;
  const MAX = 4096;
  if (Math.max(w, h) > MAX || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) {
    const k = Math.min(1, MAX / Math.max(w, h)), c = createCanvas(Math.round(w * k), Math.round(h * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const jpeg = mime === 'image/jpeg';
    src = 'data:' + (jpeg ? 'image/jpeg' : 'image/png') + ';base64,' + c.toBuffer(jpeg ? 'image/jpeg' : 'image/png', 92).toString('base64');
    w = c.width; h = c.height;
  } else src = 'data:' + mime + ';base64,' + buf.toString('base64');
  const hash = crypto.createHash('sha1').update(src).digest('hex');
  for (const id of Object.keys(K.project.assets)) if (hashOf(id) === hash) return id;
  let n = Object.keys(K.project.assets).length + 1;
  while (K.project.assets['img' + n]) n++;
  const id = 'img' + n;
  K.project.assets[id] = { id, name: path.basename(file), src, w, h };
  assetHash.set(id, hash);
  return id;
}
async function preloadImages(pages) {
  const ids = new Set();
  for (const pg of pages) { for (const pn of pg.panels) if (pn.img) ids.add(pn.img.asset); for (const it of pg.items) if (it.type === 'image') ids.add(it.asset); }
  for (const id of ids) {
    if (images.has(id)) continue;
    const a = K.project.assets[id];
    if (!a) continue;
    try { images.set(id, await loadImage(fonts.dataUrlBuffer(a.src))); } catch (err) { /* broken image data: panel renders empty */ }
  }
}

/* ---------- rendering ---------- */
function outputSize(opts) {
  const P = K.project, W = P.page.w, H = P.page.h;
  let w = W;
  if (opts.width) w = +opts.width;
  else if (opts.height) w = +opts.height * W / H;
  else if (opts.scale) w = W * +opts.scale;
  else if (opts.dpi) {
    if (!P.page.mm) throw new UserError('この用紙サイズには実寸（mm）がないため --dpi は使えません', '--width か --scale を使ってください');
    w = P.page.mm[0] / 25.4 * +opts.dpi;
  }
  if (!(w > 0)) throw new UserError('出力サイズが正しくありません', '--width 3640 / --scale 2 / --dpi 350 のように指定します');
  w = Math.max(16, Math.round(w));
  const h = Math.max(16, Math.round(w * H / W));
  if (w > 16384 || h > 16384 || w * h > 200e6) throw new UserError(`出力サイズが大きすぎます（${w}×${h}px）`, '一辺16,384px・2億画素までにしてください');
  return { w, h };
}
async function renderPages(indices, opts = {}) {
  const P = K.project, pages = indices.map(i => P.pages[i]);
  await preloadImages(pages);
  K.layoutCache.clear();
  for (const pg of pages) for (const it of pg.items) if (it.type === 'bubble' && it.autoFit) K.fitBubble(it);
  const { w, h } = outputSize(opts), fmt = (opts.format || 'png').toLowerCase().replace('jpg', 'jpeg');
  if (!['png', 'jpeg', 'webp'].includes(fmt)) throw new UserError(`形式「${opts.format}」には対応していません`, 'png / jpeg / webp から選んでください');
  const q = Math.round(Math.max(0.1, Math.min(1, opts.quality == null ? 0.92 : +opts.quality)) * 100);
  const out = [];
  for (const i of indices) {
    const c = createCanvas(w, h), ctx = c.getContext('2d');
    ctx.setTransform(w / P.page.w, 0, 0, h / P.page.h, 0, 0);
    K.renderPage(ctx, P.pages[i], { transparent: !!opts.transparent && fmt !== 'jpeg' });
    if (opts.annotate) annotate(ctx, P.pages[i]);
    const buffer = fmt === 'png' ? c.toBuffer('image/png') : c.toBuffer('image/' + fmt, q);
    out.push({ page: i + 1, width: w, height: h, format: fmt, buffer });
  }
  return out;
}
// Overlay for checking a layout by eye: panel numbers in reading order and item ids.
function annotate(ctx, page) {
  const u = K.U(), order = K.readingOrder(page.panels);
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  order.forEach((pn, i) => {
    const b = K.polyBBox(pn.pts), r = 2.4 * u, x = b.x2 - r - 1.2 * u, y = b.y1 + r + 1.2 * u;
    ctx.strokeStyle = 'rgba(22,137,214,.9)'; ctx.lineWidth = 0.3 * u; ctx.setLineDash([u, 0.6 * u]); ctx.stroke(K.polyPath(pn.pts)); ctx.setLineDash([]);
    ctx.fillStyle = '#1689d6'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `700 ${2.8 * u}px "Noto Sans CJK JP", sans-serif`; ctx.fillText(String(i + 1), x, y + 0.1 * u);
  });
  const clipCount = new Map();
  for (const it of page.items) {
    if (it.hidden) continue;
    const sz = K.itemSize(it), rad = (it.rot || 0) * Math.PI / 180, host = it.clip && page.panels.find(p => p.id === it.clip);
    let lx, ly;
    const label = it.id, fs = 1.5 * u;
    if (host) {
      // effects clipped to a panel: label them inside the panel's top-left corner, no box
      const b = K.polyBBox(host.pts), k = clipCount.get(host.id) || 0;
      clipCount.set(host.id, k + 1);
      lx = b.x1 + 1.2 * u; ly = b.y1 + 1.2 * u + fs * 1.4 * (k + 1);
    } else {
      ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(rad);
      ctx.strokeStyle = 'rgba(226,53,42,.85)'; ctx.lineWidth = 0.2 * u; ctx.setLineDash([0.8 * u, 0.5 * u]); ctx.strokeRect(-sz.w / 2, -sz.h / 2, sz.w, sz.h); ctx.setLineDash([]);
      ctx.restore();
      lx = it.x - sz.w / 2; ly = it.y - sz.h / 2;
    }
    ctx.font = `700 ${fs}px "Noto Sans CJK JP", sans-serif`;
    const tw = ctx.measureText(label).width + fs;
    ctx.fillStyle = 'rgba(226,53,42,.92)'; ctx.fillRect(lx, ly - fs * 1.4, tw, fs * 1.4);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(label, lx + fs / 2, ly - fs * 0.68); ctx.textAlign = 'center';
  }
  ctx.restore();
}
function fontWarnings(indices) {
  const items = [];
  for (const i of indices) items.push(...K.project.pages[i].items.filter(it => !it.hidden));
  return fonts.warningsFor(K, items);
}

module.exports = { K, PLATFORM, UserError, images, fonts, parseSize, newProject, loadProject, saveProject, projectData, importImage, preloadImages, renderPages, outputSize, fontWarnings, sniffMime };
