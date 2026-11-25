'use strict';
// A compact, LLM-readable description of a project, with layout warnings.
const E = require('./engine');
const { K } = E;

const r0 = v => Math.round(v);
const r2 = v => Math.round(v * 100) / 100;
const isRect = pts => pts.length === 4 && pts.every((p, i) => { const q = pts[(i + 1) % 4]; return Math.abs(p[0] - q[0]) < 0.5 || Math.abs(p[1] - q[1]) < 0.5; });

function itemType(it) { return it.role === 'sfx' ? 'sfx' : it.type === 'effect' ? it.kind : it.type; }
function itemBox(it) {
  const sz = K.itemSize(it), a = (it.rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const w = sz.w * c + sz.h * s, h = sz.w * s + sz.h * c;
  return { x: it.x - w / 2, y: it.y - h / 2, w, h };
}
function overlap(a, b) { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; }

function pageInfo(pg, i) {
  const P = K.project, order = K.readingOrder(pg.panels), F = K.innerFrame(), warnings = [];
  const panels = order.map((pn, k) => {
    const b = K.polyBBox(pn.pts), o = { n: k + 1, id: pn.id, box: [r0(b.x), r0(b.y), r0(b.w), r0(b.h)], image: pn.img ? (P.assets[pn.img.asset] || {}).name || pn.img.asset : null };
    if (!isRect(pn.pts)) o.corners = pn.pts.map(q => [r0(q[0]), r0(q[1])]);
    if (pn.img && pn.img.mode && pn.img.mode !== 'normal') o.imageMode = pn.img.mode;
    return o;
  });
  const items = pg.items.map(it => {
    const n = order.findIndex(pn => K.pointInPoly([it.x, it.y], pn.pts)) + 1 || null, ref = n ? K.polyBBox(order[n - 1].pts) : { x: F.x, y: F.y, w: F.w, h: F.h };
    const b = itemBox(it), o = { id: it.id, type: itemType(it), panel: n, at: [r2((it.x - ref.x) / ref.w), r2((it.y - ref.y) / ref.h)], box: [r0(b.x), r0(b.y), r0(b.w), r0(b.h)] };
    if (it.text != null) { o.text = it.text; o.vertical = !!it.vertical; o.font = it.font; o.fontSize = r0(it.size); }
    if (it.type === 'bubble') { o.shape = it.shape; if (it.tail && it.tail.on) { const tip = K.V.add([it.x, it.y], K.V.rot([it.tail.x, it.tail.y], (it.rot || 0) * Math.PI / 180)); o.tailTo = [r2((tip[0] - ref.x) / ref.w), r2((tip[1] - ref.y) / ref.h)]; } }
    if (it.clip) o.clipped = true;
    if (it.rot) o.rotate = r0(it.rot);
    if (it.hidden) o.hidden = true;
    if (it.type === 'image') o.image = (P.assets[it.asset] || {}).name || it.asset;
    return o;
  });
  // warnings an LLM can act on
  const W = P.page.w, H = P.page.h, texty = pg.items.filter(it => !it.hidden && (it.type === 'bubble' || it.type === 'text'));
  for (let a = 0; a < texty.length; a++) for (let b = a + 1; b < texty.length; b++) {
    const A = itemBox(texty[a]), B = itemBox(texty[b]), ov = overlap(A, B);
    if (ov > 0.12 * Math.min(A.w * A.h, B.w * B.h)) warnings.push(`${texty[a].id} と ${texty[b].id} が重なっています`);
  }
  for (const it of pg.items) {
    if (it.hidden || it.clip) continue;
    const b = itemBox(it), m = Math.min(W, H) * 0.01;
    if (b.x < -m || b.y < -m || b.x + b.w > W + m || b.y + b.h > H + m) warnings.push(`${it.id} がページの外にはみ出しています`);
    if ((it.type === 'bubble' || it.type === 'text') && it.vertical && it.role !== 'sfx') {
      const long = String(it.text || '').split('\n').find(l => [...l].length > 12);
      if (long) warnings.push(`${it.id} の「${long.slice(0, 8)}…」は1列が${[...long].length}文字です。縦書きは1列8〜10文字程度で改行すると読みやすくなります`);
    }
  }
  const empty = panels.filter(p => !p.image && !pg.items.some(it => it.clip === order[p.n - 1].id)).map(p => p.n);
  return { page: i + 1, background: pg.bg, panels, items, emptyPanels: empty, warnings };
}
function info(pageNos) {
  const P = K.project, L = P.layout;
  const idx = pageNos && pageNos.length ? pageNos.map(n => n - 1) : P.pages.map((_, i) => i);
  for (const i of idx) if (i < 0 || i >= P.pages.length) throw new E.UserError(`ページ ${i + 1} はありません（全${P.pages.length}ページ）`);
  return {
    title: P.name,
    size: { w: P.page.w, h: P.page.h, preset: P.page.preset, mm: P.page.mm || undefined },
    direction: L.dir || 'rtl',
    frame: { x: r0(L.ml), y: r0(L.mt), w: r0(P.page.w - L.ml - L.mr), h: r0(P.page.h - L.mt - L.mb) },
    gutter: [r0(L.gx), r0(L.gy)], border: L.bw,
    pageCount: P.pages.length,
    assets: Object.values(P.assets).map(a => ({ id: a.id, name: a.name, w: a.w, h: a.h })),
    pages: idx.map(i => pageInfo(P.pages[i], i)),
  };
}
module.exports = { info };
