/* ================= editor state & view ================= */
const ed = { pi: 0, sel: null, tool: 'select', view: { z: 0.3, ox: 0, oy: 0 }, autoFit: true, drag: null, hover: null, dropPanel: null, space: false, guides: true, numbers: false, clip: null, inline: null, changes: 0, saved: 0, pinch: null, lastTap: null, exp: null, pick: null, fontTarget: null, isSample: false };
const stage = $('#stage'), cv = $('#cv'), ctx = cv.getContext('2d'), inlineEd = $('#inlineEd');
const BLUE = '#1689d6', RED = '#e2352a';
let dpr = 1, cw = 0, ch = 0, rafId = 0;
const curPage = () => project.pages[ed.pi];
function findPanel(id, page) { page = page || curPage(); return page.panels.find(p => p.id === id) || null; }
function findItem(id, page) { page = page || curPage(); return page.items.find(p => p.id === id) || null; }
function selectedObj() {
  if (!ed.sel || !project) return null;
  const pn = findPanel(ed.sel); if (pn) return { kind: 'panel', obj: pn };
  const it = findItem(ed.sel); if (it) return { kind: 'item', obj: it };
  return null;
}
const S = (x, y) => [x * ed.view.z + ed.view.ox, y * ed.view.z + ed.view.oy];
const toPage = sp => [(sp[0] - ed.view.ox) / ed.view.z, (sp[1] - ed.view.oy) / ed.view.z];
function evPos(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
const viewCenterPage = () => toPage([cw / 2, ch / 2]);

function resizeCanvas() {
  const r = stage.getBoundingClientRect();
  const nw = Math.max(1, Math.round(r.width)), nh = Math.max(1, Math.round(r.height));
  const first = !cw, dx = (nw - cw) / 2, dy = (nh - ch) / 2;
  dpr = window.devicePixelRatio || 1; cw = nw; ch = nh;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  if (first || ed.autoFit) fitView(); else { ed.view.ox += dx; ed.view.oy += dy; }
  requestRender();
}
function fitView() {
  if (!project || !cw) return;
  const W = project.page.w, H = project.page.h, pad = cw < 600 ? 14 : 34, bottom = cw < 600 ? 10 : 40;
  const z = Math.max(0.01, Math.min((cw - pad * 2) / W, (ch - pad - bottom) / H));
  ed.view.z = z; ed.view.ox = (cw - W * z) / 2; ed.view.oy = pad + Math.max(0, (ch - pad - bottom - H * z) / 2);
  ed.autoFit = true; updateZoomLabel(); requestRender();
}
function zoomAt(sx, sy, f) {
  const v = ed.view, z1 = clamp(v.z * f, 0.02, 12), k = z1 / v.z;
  v.ox = sx - (sx - v.ox) * k; v.oy = sy - (sy - v.oy) * k; v.z = z1;
  ed.autoFit = false; updateZoomLabel(); requestRender();
}
function updateZoomLabel() { const b = $('#bZfit'); if (b) b.textContent = Math.round(ed.view.z * 100) + '%'; }
function requestRender() { if (!rafId) rafId = requestAnimationFrame(draw); }
function draw() {
  rafId = 0;
  if (!project || !cw) return;
  const W = project.page.w, H = project.page.h, v = ed.view;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6; ctx.fillStyle = '#fff'; ctx.fillRect(v.ox, v.oy, W * v.z, H * v.z); ctx.restore();
  ctx.setTransform(dpr * v.z, 0, 0, dpr * v.z, dpr * v.ox, dpr * v.oy);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); renderPage(ctx, curPage(), { panelHint: (c, pn) => drawPanelHint(c, pn, v.z) }); ctx.restore();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawOverlay();
}

/* ================= overlay ================= */
function tracePoly(c, pts) { c.beginPath(); pts.forEach((p, i) => { const s = S(p[0], p[1]); if (i) c.lineTo(s[0], s[1]); else c.moveTo(s[0], s[1]); }); c.closePath(); }
function drawOverlay() {
  const page = curPage(), z = ed.view.z, c = ctx, d = ed.drag;
  c.save(); c.lineWidth = 1;
  if (ed.guides) {
    const F = innerFrame(), a = S(F.x, F.y);
    c.strokeStyle = 'rgba(22,137,214,.6)'; c.setLineDash([5, 4]);
    c.strokeRect(Math.round(a[0]) + 0.5, Math.round(a[1]) + 0.5, Math.round(F.w * z), Math.round(F.h * z)); c.setLineDash([]);
  }
  c.textAlign = 'center'; c.textBaseline = 'middle';
  if (ed.numbers) {
    c.font = '700 13px system-ui, sans-serif';
    readingOrder(page.panels).forEach((pn, i) => { const b = polyBBox(pn.pts), s = S(b.x2, b.y1); c.fillStyle = BLUE; c.beginPath(); c.arc(s[0] - 15, s[1] + 15, 11, 0, TAU); c.fill(); c.fillStyle = '#fff'; c.fillText(String(i + 1), s[0] - 15, s[1] + 15.5); });
  }
  if (ed.dropPanel) { const pn = findPanel(ed.dropPanel); if (pn) { tracePoly(c, pn.pts); c.fillStyle = 'rgba(22,137,214,.16)'; c.fill(); c.strokeStyle = BLUE; c.lineWidth = 3; c.stroke(); } }
  if (ed.hover && !d) { const pn = findPanel(ed.hover); if (pn && pn.id !== ed.sel) { tracePoly(c, pn.pts); c.strokeStyle = ed.tool === 'knife' ? 'rgba(226,53,42,.65)' : 'rgba(22,137,214,.55)'; c.lineWidth = 2; c.stroke(); } }
  if (d && d.type === 'knife' && d.moved) drawKnife(c, d);
  const sel = selectedObj();
  if (sel && !(d && d.type === 'knife')) { if (sel.kind === 'panel') drawPanelSel(c, sel.obj); else drawItemSel(c, sel.obj); }
  c.restore();
}
function drawPanelHint(c, pn, z) {
  const b = polyBBox(pn.pts);
  if (b.w * z < 120 || b.h * z < 80) return;
  const ce = polyCentroid(pn.pts), k = 1 / z, hx = 80 / z, hy = 44 / z;
  for (const it of curPage().items) {
    if (it.hidden || it.clip) continue;
    const sz = itemSize(it), r = Math.hypot(sz.w, sz.h) / 2;
    if (Math.abs(it.x - ce[0]) < hx + r && Math.abs(it.y - ce[1]) < hy + r) return;
  }
  c.save(); c.translate(ce[0], ce[1]); c.scale(k, k);
  c.strokeStyle = c.fillStyle = 'rgba(112,120,130,.75)'; c.lineWidth = 1.5; c.lineJoin = 'round';
  c.strokeRect(-13, -34, 26, 20);
  c.beginPath(); c.moveTo(-13, -18); c.lineTo(-5, -26); c.lineTo(2, -19); c.lineTo(6, -23); c.lineTo(13, -16); c.stroke();
  c.font = '500 13px "Zen Kaku Gothic New", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('画像をドロップ', 0, 2);
  c.fillStyle = 'rgba(112,120,130,.55)'; c.fillText('またはダブルクリック', 0, 20);
  c.restore();
}
function drawKnife(c, d) {
  const page = curPage(), dir = V.norm(V.sub(d.b, d.a));
  if (!dir[0] && !dir[1]) return;
  const W = project.page.w, H = project.page.h, far = (W + H) * 2, gap = gapFor(dir) * ed.view.z;
  const p1 = S(...V.sub(d.a, V.mul(dir, far))), p2 = S(...V.add(d.a, V.mul(dir, far)));
  for (const pn of page.panels) {
    if (!segTouchesPoly(d.a, d.b, pn.pts)) continue;
    c.save(); tracePoly(c, pn.pts); c.fillStyle = 'rgba(226,53,42,.07)'; c.fill(); c.clip();
    c.strokeStyle = 'rgba(226,53,42,.35)'; c.lineWidth = Math.max(2, gap); c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.stroke(); c.restore();
  }
  const a = S(...d.a), b = S(...d.b);
  c.strokeStyle = RED; c.lineWidth = 2; c.setLineDash([]); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
  c.fillStyle = RED; for (const q of [a, b]) { c.beginPath(); c.arc(q[0], q[1], 4, 0, TAU); c.fill(); }
}
function drawPanelSel(c, pn) {
  tracePoly(c, pn.pts); c.strokeStyle = BLUE; c.lineWidth = 2; c.stroke();
  const n = pn.pts.length;
  for (let i = 0; i < n; i++) {
    const a = pn.pts[i], b = pn.pts[(i + 1) % n], m = S((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    c.save(); c.translate(m[0], m[1]); c.rotate(Math.atan2(b[1] - a[1], b[0] - a[0]));
    c.fillStyle = '#fff'; c.strokeStyle = BLUE; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-6, -3.5); c.arcTo(10, -3.5, 10, 3.5, 3.5); c.arcTo(10, 3.5, -10, 3.5, 3.5); c.arcTo(-10, 3.5, -10, -3.5, 3.5); c.arcTo(-10, -3.5, 10, -3.5, 3.5); c.closePath(); c.fill(); c.stroke(); c.restore();
  }
  for (const p of pn.pts) { const s = S(p[0], p[1]); c.fillStyle = '#fff'; c.strokeStyle = BLUE; c.lineWidth = 1.5; c.fillRect(s[0] - 5, s[1] - 5, 10, 10); c.strokeRect(s[0] - 5, s[1] - 5, 10, 10); }
}
function itemHandles(it) {
  const sz = itemSize(it), r = rad(it.rot || 0), z = ed.view.z, hs = [];
  const W = (lx, ly) => V.add([it.x, it.y], V.rot([lx, ly], r));
  if (it.type === 'bubble' && it.tail && it.tail.on) hs.push({ k: 'tail', pos: W(it.tail.x, it.tail.y) });
  if (it.type === 'effect' && it.kind === 'focus') hs.push({ k: 'center', pos: W((it.fx || 0) * it.w / 2, (it.fy || 0) * it.h / 2) });
  hs.push({ k: 'rotate', pos: W(0, -sz.h / 2 - 28 / z) });
  if (it.type === 'text') { for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) hs.push({ k: 'scale', hx: x, hy: y, pos: W(x * sz.w / 2, y * sz.h / 2) }); }
  else {
    const small = Math.min(sz.w, sz.h) * z < 44;
    for (const hx of [-1, 0, 1]) for (const hy of [-1, 0, 1]) if ((hx || hy) && !(small && (!hx || !hy))) hs.push({ k: 'resize', hx, hy, pos: W(hx * sz.w / 2, hy * sz.h / 2) });
  }
  return hs;
}
function drawItemSel(c, it) {
  const sz = itemSize(it), r = rad(it.rot || 0);
  const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => S(...V.add([it.x, it.y], V.rot([x * sz.w / 2, y * sz.h / 2], r))));
  if (it.clip) { const pn = findPanel(it.clip); if (pn) { tracePoly(c, pn.pts); c.strokeStyle = 'rgba(22,137,214,.5)'; c.setLineDash([3, 3]); c.lineWidth = 1; c.stroke(); c.setLineDash([]); } }
  c.beginPath(); cs.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath();
  c.strokeStyle = BLUE; c.lineWidth = 1.5; c.setLineDash(it.locked ? [5, 4] : []); c.stroke(); c.setLineDash([]);
  if (it.locked) return;
  for (const h of itemHandles(it)) {
    const s = S(h.pos[0], h.pos[1]);
    if (h.k === 'rotate') {
      const top = S(...V.add([it.x, it.y], V.rot([0, -sz.h / 2], r)));
      c.strokeStyle = BLUE; c.lineWidth = 1.2; c.beginPath(); c.moveTo(top[0], top[1]); c.lineTo(s[0], s[1]); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(s[0], s[1], 6.5, 0, TAU); c.fill(); c.stroke();
    } else if (h.k === 'tail' || h.k === 'center') {
      c.fillStyle = RED; c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.beginPath(); c.arc(s[0], s[1], 7.5, 0, TAU); c.fill(); c.stroke();
    } else {
      c.save(); c.translate(s[0], s[1]); c.rotate(r); c.fillStyle = '#fff'; c.strokeStyle = BLUE; c.lineWidth = 1.5; c.fillRect(-5, -5, 10, 10); c.strokeRect(-5, -5, 10, 10); c.restore();
    }
  }
}

/* ================= hit testing ================= */
function hitItem(it, p) {
  const l = V.rot(V.sub(p, [it.x, it.y]), -rad(it.rot || 0)), sz = itemSize(it), tol = 4 / ed.view.z;
  if (Math.abs(l[0]) <= sz.w / 2 + tol && Math.abs(l[1]) <= sz.h / 2 + tol) return true;
  if (it.type === 'bubble') {
    const g = tailGeom(it);
    if (g) {
      if (it.tail.style === 'thought') return thoughtDots(it, g).some(([x, y, r]) => Math.hypot(l[0] - x, l[1] - y) <= r + tol);
      const m = Math.min(it.w, it.h) / 2, bw = clamp(it.tail.w, 0.02, 1) * m, B = V.mul(g.u, g.r * 0.62);
      return pointInPoly(l, [V.add(B, V.mul(g.v, bw + tol)), g.T, V.sub(B, V.mul(g.v, bw + tol))]);
    }
  }
  return false;
}
function hitStack(p) {
  const page = curPage(), out = [], ids = new Set(page.panels.map(x => x.id));
  for (let i = page.items.length - 1; i >= 0; i--) { const it = page.items[i]; if (it.hidden || it.locked || (it.clip && ids.has(it.clip))) continue; if (hitItem(it, p)) out.push({ kind: 'item', id: it.id }); }
  for (let k = page.panels.length - 1; k >= 0; k--) {
    const pn = page.panels[k];
    if (!pointInPoly(p, pn.pts)) continue;
    for (let i = page.items.length - 1; i >= 0; i--) { const it = page.items[i]; if (it.hidden || it.locked || it.clip !== pn.id) continue; if (hitItem(it, p)) out.push({ kind: 'item', id: it.id }); }
    out.push({ kind: 'panel', id: pn.id });
  }
  return out;
}
function handleAt(sp, sel) {
  if (!sel) return null;
  if (sel.kind === 'panel') {
    const pts = sel.obj.pts, n = pts.length;
    for (let i = 0; i < n; i++) { const s = S(...pts[i]); if (Math.hypot(s[0] - sp[0], s[1] - sp[1]) <= 9) return { k: 'vertex', i }; }
    for (let i = 0; i < n; i++) { const a = S(...pts[i]), b = S(...pts[(i + 1) % n]); if (distToSeg(sp, a, b) <= 7) return { k: 'edge', i }; }
    return null;
  }
  if (sel.obj.locked) return null;
  for (const h of itemHandles(sel.obj)) { const s = S(...h.pos); if (Math.hypot(s[0] - sp[0], s[1] - sp[1]) <= (h.k === 'tail' || h.k === 'center' ? 12 : 9)) return h; }
  return null;
}
function handleCursor(h, sel) {
  if (h.k === 'vertex') return 'move';
  if (h.k === 'edge') { const p = sel.obj.pts, a = p[h.i], b = p[(h.i + 1) % p.length], ang = Math.abs(Math.atan2(b[1] - a[1], b[0] - a[0])) % Math.PI; return ang < 0.5 || ang > Math.PI - 0.5 ? 'ns-resize' : Math.abs(ang - Math.PI / 2) < 0.5 ? 'ew-resize' : 'move'; }
  if (h.k === 'tail' || h.k === 'center') return 'crosshair';
  if (h.k === 'rotate') return 'grab';
  const a = (Math.atan2(h.hy, h.hx) + rad(sel.obj.rot || 0)) * 180 / Math.PI, i = ((Math.round(a / 45) % 4) + 4) % 4;
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][i];
}
function setCursor(c) { cv.style.cursor = c || (ed.space || ed.tool === 'hand' ? 'grab' : ed.tool === 'knife' ? 'crosshair' : 'default'); }

/* ================= pointer handling ================= */
const pointers = new Map();
function onDown(e) {
  if (e.button === 2 || !project) return;
  if (document.body.classList.contains('show-left') || document.body.classList.contains('show-right')) { if (window.matchMedia('(max-width: 1180px)').matches) closeDrawers(); }
  if (ed.inline) closeInline();
  try { cv.setPointerCapture(e.pointerId); } catch (err) { }
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size >= 2) { ed.drag = null; ed.pinch = null; requestRender(); return; }
  const sp = evPos(e), p = toPage(sp);
  if (e.button === 1 || ed.space || ed.tool === 'hand') { ed.drag = { type: 'view', sp, ox: ed.view.ox, oy: ed.view.oy, moved: false }; setCursor('grabbing'); return; }
  if (ed.tool === 'knife') { ed.drag = { type: 'knife', a: p, b: p, sp, moved: false }; return; }
  const sel = selectedObj(), h = handleAt(sp, sel);
  if (h) { startHandle(sel, h, p, sp, e); return; }
  const hits = hitStack(p);
  if (!hits.length) { if (sel) select(null); ed.drag = { type: 'view', sp, ox: ed.view.ox, oy: ed.view.oy, moved: false }; return; }
  let t = hits[0];
  if (e.altKey && sel) { const i = hits.findIndex(x => x.id === sel.obj.id); if (i >= 0) t = hits[(i + 1) % hits.length]; }
  if (!sel || sel.obj.id !== t.id) select(t.id);
  if (t.kind === 'item') { const o = findItem(t.id); ed.drag = { type: 'move', id: o.id, start: p, ox: o.x, oy: o.y, sp, moved: false }; }
  else { const o = findPanel(t.id); ed.drag = o.img ? { type: 'panimg', id: o.id, start: p, ocx: o.img.cx, ocy: o.img.cy, sp, moved: false } : { type: 'view', sp, ox: ed.view.ox, oy: ed.view.oy, moved: false, keep: true }; }
}
function startHandle(sel, h, p, sp, e) {
  if (sel.kind === 'panel') {
    const pn = sel.obj;
    if (h.k === 'vertex') ed.drag = { type: 'vertex', id: pn.id, i: h.i, orig: clone(pn.pts), start: p, sp, moved: false };
    else {
      const a = pn.pts[h.i], b = pn.pts[(h.i + 1) % pn.pts.length], e0 = V.norm(V.sub(b, a));
      const links = e.altKey ? [{ id: pn.id, i: h.i }] : linkedEdges(curPage(), pn.id, h.i), orig = new Map();
      for (const l of links) if (!orig.has(l.id)) orig.set(l.id, clone(findPanel(l.id).pts));
      ed.drag = { type: 'edge', id: pn.id, nrm: [-e0[1], e0[0]], links, orig, start: p, sp, moved: false };
    }
    return;
  }
  const it = sel.obj;
  ed.drag = { type: h.k, id: it.id, o: clone(it), h, start: p, sp, moved: false };
}
function onMove(e) {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size >= 2) { doPinch(); return; }
  if (!project) return;
  const sp = evPos(e), p = toPage(sp), d = ed.drag;
  if (!d) { updateHover(sp, p); return; }
  if (!d.moved) { if (Math.hypot(sp[0] - d.sp[0], sp[1] - d.sp[1]) < 3) return; d.moved = true; }
  const sh = e.shiftKey;
  switch (d.type) {
    case 'view': ed.view.ox = d.ox + sp[0] - d.sp[0]; ed.view.oy = d.oy + sp[1] - d.sp[1]; ed.autoFit = false; setCursor('grabbing'); break;
    case 'knife': d.b = snapKnife(d.a, p, sh, e.altKey); break;
    case 'move': { const it = findItem(d.id); if (!it) break; let dx = p[0] - d.start[0], dy = p[1] - d.start[1]; if (sh) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; } it.x = d.ox + dx; it.y = d.oy + dy; break; }
    case 'panimg': { const pn = findPanel(d.id); if (!pn || !pn.img) break; pn.img.cx = d.ocx + p[0] - d.start[0]; pn.img.cy = d.ocy + p[1] - d.start[1]; setCursor('grabbing'); break; }
    case 'resize': doResize(d, p, sh); break;
    case 'scale': {
      const it = findItem(d.id), o = d.o; if (!it) break;
      const f = clamp(V.dist(p, [o.x, o.y]) / Math.max(1, V.dist(d.start, [o.x, o.y])), 0.05, 40);
      it.size = clamp(round(o.size * f, 10), 2, 4000); it.sw = round((o.sw || 0) * f, 10); it.sw2 = round((o.sw2 || 0) * f, 10); break;
    }
    case 'rotate': {
      const it = findItem(d.id), o = d.o; if (!it) break;
      let r = o.rot + (Math.atan2(p[1] - o.y, p[0] - o.x) - Math.atan2(d.start[1] - o.y, d.start[0] - o.x)) * 180 / Math.PI;
      r = ((r + 180) % 360 + 360) % 360 - 180;
      r = sh ? Math.round(r / 15) * 15 : (Math.abs(r) < 2 ? 0 : r);
      it.rot = round(r, 10); break;
    }
    case 'tail': { const it = findItem(d.id); if (!it) break; const l = V.rot(V.sub(p, [it.x, it.y]), -rad(it.rot || 0)); it.tail.x = round(l[0], 10); it.tail.y = round(l[1], 10); break; }
    case 'center': { const it = findItem(d.id); if (!it) break; const l = V.rot(V.sub(p, [it.x, it.y]), -rad(it.rot || 0)); it.fx = clamp(l[0] / (it.w / 2), -1.5, 1.5); it.fy = clamp(l[1] / (it.h / 2), -1.5, 1.5); break; }
    case 'vertex': { const pn = findPanel(d.id); if (!pn) break; const pts = clone(d.orig); pts[d.i] = e.altKey ? p : snapPt(p, d.id); if (validPoly(pts, d.orig)) pn.pts = pts; break; }
    case 'edge': moveEdgeDrag(d, p); break;
  }
  requestRender();
}
function onUp(e) {
  pointers.delete(e.pointerId);
  if (ed.pinch || pointers.size) { if (!pointers.size) ed.pinch = null; return; }
  const d = ed.drag; ed.drag = null;
  if (!d) return;
  const sp = evPos(e);
  if (d.type === 'knife') { if (d.moved) doKnife(d.a, d.b); requestRender(); return; }
  if (d.type === 'view') { setCursor(); if (!d.moved) checkDoubleTap(sp); return; }
  if (d.moved) {
    if (d.type === 'move') { const it = findItem(d.id); if (it && it.clip) { const pn = panelAtPoint(curPage(), [it.x, it.y]); if (pn && pn.id !== it.clip) it.clip = pn.id; } }
    if (d.type === 'resize' || d.type === 'scale' || d.type === 'rotate') syncSizeFields();
    if (d.type === 'vertex') refitEffects(curPage(), d.id, d.orig);
    if (d.type === 'edge') for (const [id, pts] of d.orig) refitEffects(curPage(), id, pts);
    commit(); requestRender(); return;
  }
  checkDoubleTap(sp);
}
function checkDoubleTap(sp) {
  const now = performance.now(), lt = ed.lastTap;
  if (lt && now - lt.t < 400 && Math.hypot(sp[0] - lt.sp[0], sp[1] - lt.sp[1]) < 12) { ed.lastTap = null; onDouble(toPage(sp)); }
  else ed.lastTap = { t: now, sp };
}
function onDouble(p) {
  if (ed.tool !== 'select') return;
  for (const h of hitStack(p)) {
    if (h.kind === 'item') {
      const it = findItem(h.id);
      if (it.type === 'bubble' || it.type === 'text') { select(it.id); openInline(it); return; }
      if (it.type === 'image') { select(it.id); return; }
      continue;
    }
    select(h.id); pickImageFor(h.id); return;
  }
}
function updateHover(sp, p) {
  let cur = '', hov = null;
  if (ed.space || ed.tool === 'hand') cur = 'grab';
  else if (ed.tool === 'knife') { cur = 'crosshair'; const pn = panelAtPoint(curPage(), p); hov = pn ? pn.id : null; }
  else {
    const sel = selectedObj(), h = handleAt(sp, sel);
    if (h) cur = handleCursor(h, sel);
    else { const hits = hitStack(p); if (hits.length) { const t = hits[0]; if (t.kind === 'item') cur = 'move'; else { hov = t.id; const pn = findPanel(t.id); cur = pn.img && pn.id === ed.sel ? 'grab' : 'pointer'; } } }
  }
  if (hov !== ed.hover) { ed.hover = hov; requestRender(); }
  setCursor(cur);
}
function doPinch() {
  const pts = [...pointers.values()];
  if (pts.length < 2) return;
  const [a, b] = pts, dist = Math.hypot(a[0] - b[0], a[1] - b[1]), r = cv.getBoundingClientRect(), mid = [(a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top];
  if (!ed.pinch) { ed.pinch = { dist: Math.max(1, dist), mid, z: ed.view.z, ox: ed.view.ox, oy: ed.view.oy }; return; }
  const P = ed.pinch, z1 = clamp(P.z * dist / P.dist, 0.02, 12), px = (P.mid[0] - P.ox) / P.z, py = (P.mid[1] - P.oy) / P.z;
  ed.view.z = z1; ed.view.ox = mid[0] - px * z1; ed.view.oy = mid[1] - py * z1; ed.autoFit = false;
  updateZoomLabel(); requestRender();
}
function onWheel(e) {
  if (!project) return;
  e.preventDefault();
  const sp = evPos(e);
  if (e.ctrlKey || e.metaKey) { zoomAt(sp[0], sp[1], Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025))); return; }
  const sel = selectedObj(), p = toPage(sp);
  if (sel && sel.kind === 'panel' && sel.obj.img && pointInPoly(p, sel.obj.pts) && !e.shiftKey) { zoomPanelImage(sel.obj, p, Math.exp(-e.deltaY * (e.deltaMode ? 0.03 : 0.0015))); return; }
  const k = e.deltaMode ? 30 : 1;
  ed.view.ox -= (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * k; ed.view.oy -= (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * k;
  ed.autoFit = false; requestRender();
}
function zoomPanelImage(pn, p, f) {
  const im = pn.img, a = project.assets[im.asset];
  if (!a) return;
  const cover = coverScale(pn, a), s1 = clamp(im.s * f, cover * 0.05, cover * 20), k = s1 / im.s;
  im.cx = p[0] + (im.cx - p[0]) * k; im.cy = p[1] + (im.cy - p[1]) * k; im.s = s1;
  requestRender(); scheduleCommit(); syncZoomField();
}
function snapKnife(a, b, shift, alt) {
  if (alt) return b;
  const v = V.sub(b, a), L = V.len(v);
  if (L < 1e-6) return b;
  let ang = Math.atan2(v[1], v[0]);
  const step = shift ? Math.PI / 12 : Math.PI / 2, sn = Math.round(ang / step) * step;
  if (shift || Math.abs(ang - sn) < rad(3.5)) ang = sn;
  return [a[0] + Math.cos(ang) * L, a[1] + Math.sin(ang) * L];
}
function snapPt(p, exId) {
  const tol = 8 / ed.view.z, page = curPage(), F = innerFrame(), W = project.page.w, H = project.page.h;
  const xs = [F.x, F.x + F.w, 0, W], ys = [F.y, F.y + F.h, 0, H];
  for (const pn of page.panels) if (pn.id !== exId) for (const q of pn.pts) { xs.push(q[0]); ys.push(q[1]); }
  let bx = null, by = null, dx = tol, dy = tol;
  for (const x of xs) { const d = Math.abs(x - p[0]); if (d < dx) { dx = d; bx = x; } }
  for (const y of ys) { const d = Math.abs(y - p[1]); if (d < dy) { dy = d; by = y; } }
  return [bx ?? p[0], by ?? p[1]];
}
function doResize(d, p, shift) {
  const it = findItem(d.id), o = d.o;
  if (!it) return;
  const r = rad(o.rot || 0), q = V.rot(V.sub(p, [o.x, o.y]), -r), { hx, hy } = d.h, min = 8;
  let x1 = -o.w / 2, x2 = o.w / 2, y1 = -o.h / 2, y2 = o.h / 2;
  if (hx === -1) x1 = Math.min(q[0], x2 - min); if (hx === 1) x2 = Math.max(q[0], x1 + min);
  if (hy === -1) y1 = Math.min(q[1], y2 - min); if (hy === 1) y2 = Math.max(q[1], y1 + min);
  let w = x2 - x1, h = y2 - y1;
  const keep = it.type === 'image' && it.keep !== false ? !shift : shift, ar = o.w / o.h;
  if (keep) {
    if (hx && hy) { if (w / h > ar) h = w / ar; else w = h * ar; if (hx === -1) x1 = x2 - w; else x2 = x1 + w; if (hy === -1) y1 = y2 - h; else y2 = y1 + h; }
    else if (hx) { h = w / ar; y1 = -h / 2; y2 = h / 2; }
    else { w = h * ar; x1 = -w / 2; x2 = w / 2; }
  }
  const cw0 = V.add([o.x, o.y], V.rot([(x1 + x2) / 2, (y1 + y2) / 2], r));
  it.x = cw0[0]; it.y = cw0[1]; it.w = round(w, 10); it.h = round(h, 10);
  if (it.type === 'bubble') {
    it.autoFit = false;
    const tip = V.add([o.x, o.y], V.rot([o.tail.x, o.tail.y], r)), l = V.rot(V.sub(tip, cw0), -r);
    it.tail.x = round(l[0], 10); it.tail.y = round(l[1], 10);
  }
}
function linkedEdges(page, id, i) {
  const L = project.layout, maxGap = Math.max(L.gx, L.gy) * 1.6 + (L.bw || 0) * 2 + 4;
  const key = (pid, j) => pid + ':' + j, seen = new Set([key(id, i)]), out = [{ id, i }], queue = [{ id, i }];
  const edgeOf = (pn, j) => [pn.pts[j], pn.pts[(j + 1) % pn.pts.length]];
  while (queue.length) {
    const cur = queue.shift(), cp = findPanel(cur.id, page), [ca, cb] = edgeOf(cp, cur.i), ce = V.norm(V.sub(cb, ca)), cn = [-ce[1], ce[0]], clen = V.dist(ca, cb);
    for (const pn of page.panels) for (let j = 0; j < pn.pts.length; j++) {
      const k = key(pn.id, j);
      if (seen.has(k)) continue;
      const [c, d] = edgeOf(pn, j), f = V.norm(V.sub(d, c));
      if (Math.abs(V.cross(ce, f)) > 0.02) continue;
      const dist = Math.abs(V.dot(cn, V.sub(c, ca))), t1 = V.dot(ce, V.sub(c, ca)), t2 = V.dot(ce, V.sub(d, ca)), lo = Math.min(t1, t2), hi = Math.max(t1, t2);
      let ok = false;
      if (dist > 0.5 && dist <= maxGap) ok = Math.min(hi, clen) - Math.max(lo, 0) > Math.min(clen, hi - lo) * 0.3;
      else if (dist <= 0.5 && pn.id !== cur.id) ok = lo - clen <= maxGap && -hi <= maxGap;
      if (ok) { seen.add(k); out.push({ id: pn.id, i: j }); queue.push({ id: pn.id, i: j }); }
    }
  }
  return out;
}
function moveEdgeOn(pts, ref, i, T) {
  const n = ref.length, ia = i, ib = (i + 1) % n, a = ref[ia], b = ref[ib], prev = ref[(ia - 1 + n) % n], next = ref[(ib + 1) % n];
  const e = V.norm(V.sub(b, a)), nrm = [-e[1], e[0]], off = V.mul(nrm, V.dot(T, nrm)), a2 = V.add(a, off), b2 = V.add(b, off);
  pts[ia] = lineIntersect(prev, V.sub(a, prev), a2, e) || a2;
  pts[ib] = lineIntersect(next, V.sub(b, next), b2, e) || b2;
}
function moveEdgeDrag(d, p) {
  const T = V.mul(d.nrm, V.dot(V.sub(p, d.start), d.nrm)), next = new Map();
  for (const [id, pts] of d.orig) next.set(id, clone(pts));
  for (const l of d.links) moveEdgeOn(next.get(l.id), d.orig.get(l.id), l.i, T);
  for (const [id, pts] of next) if (!validPoly(pts, d.orig.get(id))) return;
  for (const [id, pts] of next) { const pn = findPanel(id); if (pn) pn.pts = pts; }
}
function refitEffects(page, id, oldPts) {
  const pn = findPanel(id, page);
  if (!pn) return;
  const ob = polyBBox(oldPts), nb = polyBBox(pn.pts), pad = pn.bw ?? project.layout.bw;
  for (const it of page.items) {
    if (it.type !== 'effect' || it.clip !== id || it.rot) continue;
    if (Math.abs(it.x - ob.cx) < ob.w * 0.06 + pad * 2 && Math.abs(it.y - ob.cy) < ob.h * 0.06 + pad * 2 && Math.abs(it.w - ob.w) < ob.w * 0.12 + pad * 4 && Math.abs(it.h - ob.h) < ob.h * 0.12 + pad * 4) { it.x = nb.cx; it.y = nb.cy; it.w = nb.w + pad * 2; it.h = nb.h + pad * 2; }
  }
}
function doKnife(a, b) {
  if (V.dist(a, b) < 4 / ed.view.z) return;
  const page = curPage(), r = cutPanelList(page.panels, a, b);
  if (!r.count) { toast('分割できるコマがありません。コマの上を横切るようにドラッグしてください'); return; }
  page.panels = r.panels; page.tpl = null; reclip(page);
  if (ed.sel && !selectedObj()) ed.sel = null;
  commit(); buildProps();
}

/* ================= history ================= */
const H = { stack: [], i: -1 };
let commitTimer = 0;
function snap() { return JSON.stringify({ name: project.name, page: project.page, layout: project.layout, pages: project.pages }); }
function resetHistory() { clearTimeout(commitTimer); commitTimer = 0; H.stack = [snap()]; H.i = 0; ed.changes = 0; ed.saved = 0; updateHistButtons(); updateDirty(); }
function commit() {
  clearTimeout(commitTimer); commitTimer = 0;
  if (!project) return;
  const s = snap();
  if (s === H.stack[H.i]) return;
  H.stack.length = H.i + 1; H.stack.push(s);
  if (H.stack.length > 150) H.stack.shift();
  H.i = H.stack.length - 1; ed.changes++;
  afterChange();
}
function scheduleCommit() { clearTimeout(commitTimer); commitTimer = setTimeout(commit, 400); }
function flushCommit() { if (commitTimer) commit(); }
function undo() { flushCommit(); if (H.i <= 0) return; H.i--; restoreSnap(H.stack[H.i]); }
function redo() { flushCommit(); if (H.i >= H.stack.length - 1) return; H.i++; restoreSnap(H.stack[H.i]); }
function restoreSnap(s) {
  const o = JSON.parse(s), sized = o.page.w !== project.page.w || o.page.h !== project.page.h;
  project.name = o.name; project.page = o.page; project.layout = o.layout; project.pages = o.pages;
  ed.pi = clamp(ed.pi, 0, project.pages.length - 1);
  if (ed.sel && !selectedObj()) ed.sel = null;
  ed.changes++; layoutCache.clear();
  $('#projName').value = project.name;
  if (sized) fitView();
  afterChange(); buildProps(); renderPages(); renderLayers();
}
function afterChange() { updateHistButtons(); updateDirty(); requestRender(); scheduleThumbs(); scheduleAutosave(); layersSoon(); }
function updateHistButtons() { $('#bUndo').disabled = H.i <= 0; $('#bRedo').disabled = H.i >= H.stack.length - 1; }
function updateDirty() { $('#dirty').classList.toggle('on', ed.changes !== ed.saved); }

/* ================= actions ================= */
function select(id) {
  if (ed.inline && ed.inline !== id) closeInline();
  ed.sel = id || null;
  buildProps(); renderLayers(); requestRender();
  $('#bRight').classList.toggle('ping', !!id);
}
function setTool(t) {
  ed.tool = t;
  $$('#rail [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  $('#hint').textContent = HINTS[t] || '';
  setCursor(); requestRender();
}
const HINTS = {
  select: 'クリックで選択・ドラッグで移動／コマ内のドラッグで画像を動かし、ホイールで拡大縮小／Alt+クリックで背面を選択',
  knife: 'コマの上をドラッグして分割（水平・垂直に吸着／Shiftで15°刻み／Altで自由な角度）',
  hand: 'ドラッグで表示を移動／Ctrl+ホイールで拡大縮小',
};
function targetPanel() {
  const s = selectedObj();
  if (s && s.kind === 'panel') return s.obj;
  if (s && s.kind === 'item' && s.obj.clip) return findPanel(s.obj.clip);
  return panelAtPoint(curPage(), viewCenterPage());
}
function addAction(kind) {
  if (!project) return;
  if (kind === 'template') { openTemplates(); return; }
  if (kind === 'image') { pickImageFor(null); return; }
  setTool('select');
  if (kind === 'panel') { addPanel(); return; }
  const page = curPage(), u = U(), pn = targetPanel();
  const c = pn ? polyCentroid(pn.pts) : viewCenterPage();
  const pad = pn ? (pn.bw ?? project.layout.bw) : 0, bb = pn ? polyBBox(pn.pts) : null;
  const box = pn ? { cx: bb.cx, cy: bb.cy, w: bb.w + pad * 2, h: bb.h + pad * 2 } : { cx: c[0], cy: c[1], w: 40 * u, h: 30 * u };
  let it;
  if (kind === 'bubble') it = makeBubble(c[0], c[1]);
  else if (kind === 'text') it = makeText(c[0], c[1]);
  else if (kind === 'sfx') it = makeSfx(c[0], c[1]);
  else if (kind === 'focus' || kind === 'speed' || kind === 'tone') it = makeEffect(kind, box, pn ? pn.id : null);
  else if (kind === 'flash') { const m = Math.min(box.w, box.h); it = makeEffect('flash', { cx: c[0], cy: c[1], w: Math.min(box.w, m * 1.3), h: m }, pn ? pn.id : null); }
  if (!it) return;
  if (it.type === 'effect') { const idx = page.items.findIndex(x => x.type !== 'effect'); if (idx >= 0) page.items.splice(idx, 0, it); else page.items.push(it); }
  else page.items.push(it);
  select(it.id); commit();
  if (it.type === 'bubble' || it.type === 'text') openInline(it);
}
function addPanel() {
  const page = curPage(), F = innerFrame(), c = viewCenterPage(), w = F.w * 0.4, h = F.h * 0.25;
  const pn = newPanel(rectPts(clamp(c[0] - w / 2, 0, project.page.w - w), clamp(c[1] - h / 2, 0, project.page.h - h), w, h));
  page.panels.push(pn); page.tpl = null; select(pn.id); commit();
  toast('コマを追加しました。角や辺をドラッグして形を整えられます');
}
function quickSplit(pn, dir) {
  const d = dir === 'h' ? [1, 0] : [0, 1], r = splitPanelObj(pn, polyCentroid(pn.pts), d, gapFor(d));
  if (!r) { toast('このコマはこれ以上分割できません'); return; }
  const page = curPage(); page.panels.splice(page.panels.indexOf(pn), 1, ...r); page.tpl = null; reclip(page);
  select(r[0].id); commit();
}
function deleteSel() {
  const s = selectedObj();
  if (!s) return;
  const page = curPage();
  if (s.kind === 'item') page.items = page.items.filter(x => x !== s.obj);
  else { page.panels = page.panels.filter(x => x !== s.obj); page.tpl = null; page.items = page.items.filter(it => !(it.clip === s.obj.id && it.type === 'effect')); for (const it of page.items) if (it.clip === s.obj.id) it.clip = null; }
  select(null); commit();
}
function duplicateSel() {
  const s = selectedObj();
  if (!s) return;
  const page = curPage(), u = U(), o = clone(s.obj);
  if (s.kind === 'item') { o.id = uid('it'); o.x += 2 * u; o.y += 2 * u; o.locked = false; page.items.splice(page.items.indexOf(s.obj) + 1, 0, o); }
  else { o.id = uid('pn'); o.pts = o.pts.map(q => [q[0] + 2 * u, q[1] + 2 * u]); if (o.img) { o.img.cx += 2 * u; o.img.cy += 2 * u; } page.panels.push(o); }
  select(o.id); commit();
}
function orderSel(where) {
  const s = selectedObj();
  if (!s) return;
  const page = curPage(), arr = s.kind === 'item' ? page.items : page.panels, i = arr.indexOf(s.obj);
  arr.splice(i, 1);
  const j = where === 'top' ? arr.length : where === 'bottom' ? 0 : where === 'up' ? Math.min(arr.length, i + 1) : Math.max(0, i - 1);
  arr.splice(j, 0, s.obj); commit(); renderLayers();
}
function nudge(dx, dy) {
  const s = selectedObj();
  if (!s) return;
  if (s.kind === 'item') { if (s.obj.locked) return; s.obj.x += dx; s.obj.y += dy; }
  else if (s.obj.img) { s.obj.img.cx += dx; s.obj.img.cy += dy; }
  requestRender(); scheduleCommit();
}
function copySel() { const s = selectedObj(); if (!s) return false; ed.clip = { kind: s.kind, obj: clone(s.obj) }; toast(s.kind === 'item' ? 'コピーしました' : 'コマをコピーしました'); return true; }
function pasteClip() {
  if (!ed.clip) return;
  const page = curPage(), u = U(), o = clone(ed.clip.obj);
  if (ed.clip.kind === 'item') { o.id = uid('it'); o.x += 2 * u; o.y += 2 * u; if (o.clip && !findPanel(o.clip)) { o.clip = 'gone'; page.items.push(o); reclip(page); } else page.items.push(o); }
  else { o.id = uid('pn'); o.pts = o.pts.map(q => [q[0] + 2 * u, q[1] + 2 * u]); if (o.img) { if (!project.assets[o.img.asset]) o.img = null; else { o.img.cx += 2 * u; o.img.cy += 2 * u; } } page.panels.push(o); }
  ed.clip.obj = clone(o);
  select(o.id); commit();
}

/* ================= inline text editor ================= */
function openInline(it) {
  if (!it || it.locked) return;
  ed.inline = it.id;
  const sz = itemSize(it), s = S(it.x, it.y), z = ed.view.z, w = Math.min(280, cw - 16);
  let left = s[0] - w / 2, top = s[1] + sz.h * z / 2 + 14;
  if (top + 120 > ch) top = s[1] - sz.h * z / 2 - 134;
  inlineEd.style.width = w + 'px';
  inlineEd.style.left = clamp(left, 8, Math.max(8, cw - w - 8)) + 'px';
  inlineEd.style.top = clamp(top, 8, Math.max(8, ch - 120)) + 'px';
  inlineEd.value = it.text; inlineEd.hidden = false;
  inlineEd.focus(); inlineEd.select();
}
function closeInline() {
  if (!ed.inline) return;
  ed.inline = null; inlineEd.hidden = true;
  commit(); requestRender(); layersSoon();
}
function onInlineInput() {
  const it = findItem(ed.inline);
  if (!it) return;
  it.text = inlineEd.value;
  if (it.type === 'bubble' && it.autoFit) fitBubble(it);
  const ta = $('#c-text'); if (ta && ta !== document.activeElement) ta.value = it.text;
  requestRender();
}

/* ================= keyboard ================= */
function isTyping(t) { return !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || (t.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button', 'color', 'file'].includes(t.type))); }
function onKey(e) {
  if (!project) return;
  if (!$('#modal').hidden) { if (e.key === 'Escape') { e.preventDefault(); closeModal(); } return; }
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 's') { e.preventDefault(); saveProject(); return; }
  if (mod && k === 'o') { e.preventDefault(); openProjectDialog(); return; }
  if (mod && k === 'e') { e.preventDefault(); openExport(); return; }
  if (isTyping(e.target)) return;
  if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (mod && k === 'y') { e.preventDefault(); redo(); return; }
  if (mod && k === 'd') { e.preventDefault(); duplicateSel(); return; }
  if (mod && k === 'c') { copySel(); return; }
  if (mod && k === 'x') { if (copySel()) deleteSel(); return; }
  if (mod && k === '0') { e.preventDefault(); fitView(); return; }
  if (mod && (k === '=' || k === '+' || k === ';')) { e.preventDefault(); zoomAt(cw / 2, ch / 2, 1.25); return; }
  if (mod && k === '-') { e.preventDefault(); zoomAt(cw / 2, ch / 2, 0.8); return; }
  if (mod || e.altKey) return;
  if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'range' && (k.startsWith('arrow') || k === 'home' || k === 'end')) return;
  if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSel(); }
  else if (k === 'escape') { if (ed.drag && ed.drag.type === 'knife') ed.drag = null; select(null); setTool('select'); }
  else if (k === 'v') setTool('select');
  else if (k === 'k') setTool('knife');
  else if (k === 'h') setTool('hand');
  else if (k === ' ') { e.preventDefault(); if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur(); if (!ed.space) { ed.space = true; setCursor('grab'); } }
  else if (k.startsWith('arrow')) { e.preventDefault(); const st = e.shiftKey ? 10 : 1; nudge(k === 'arrowleft' ? -st : k === 'arrowright' ? st : 0, k === 'arrowup' ? -st : k === 'arrowdown' ? st : 0); }
  else if (k === 'pagedown') gotoPage(Math.min(project.pages.length - 1, ed.pi + 1));
  else if (k === 'pageup') gotoPage(Math.max(0, ed.pi - 1));
  else if (k === 'enter') { const s = selectedObj(); if (s && s.kind === 'item' && (s.obj.type === 'bubble' || s.obj.type === 'text')) { e.preventDefault(); openInline(s.obj); } }
}
