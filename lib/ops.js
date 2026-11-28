'use strict';
// Operations (the JSON an LLM writes) and the page spec that expands into them.
const E = require('./engine');
const { K, UserError } = E;

const ANCHORS = { center: [0.5, 0.5], top: [0.5, 0.2], bottom: [0.5, 0.8], left: [0.2, 0.5], right: [0.8, 0.5], 'top-left': [0.22, 0.22], 'top-right': [0.78, 0.22], 'bottom-left': [0.22, 0.78], 'bottom-right': [0.78, 0.78] };
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], 'up-left': [-0.7, -1], 'up-right': [0.7, -1], 'down-left': [-0.7, 1], 'down-right': [0.7, 1] };
const SHAPE_IDS = K.SHAPES.map(s => s[0]);
const FONT_IDS = K.FONTS.map(f => f.id);
const DEFAULT_SIZE = { bubble: 2.1, text: 2.2, sfx: 8 };

/* ---------------- schema ---------------- */
const T = {
  int: v => Number.isInteger(v),
  num: v => typeof v === 'number' && isFinite(v),
  str: v => typeof v === 'string',
  bool: v => typeof v === 'boolean',
  color: v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v),
  colorOrNone: v => v === '' || v === null || v === 'none' || T.color(v),
  pos: v => (typeof v === 'string' && v in ANCHORS) || (Array.isArray(v) && v.length === 2 && v.every(T.num)),
  xy: v => Array.isArray(v) && v.length === 2 && v.every(T.num),
  font: v => typeof v === 'string' && (FONT_IDS.includes(v) || v.startsWith('custom:')),
  tail: v => v === false || v === null || v === 'none' || (typeof v === 'string' && (v in DIRS || v in ANCHORS)) || T.xy(v) || (!!v && typeof v === 'object' && !Array.isArray(v)),
  nums: v => T.num(v) || (Array.isArray(v) && v.length >= 1 && v.length <= 4 && v.every(T.num)),
  size: v => typeof v === 'string' || (!!v && typeof v === 'object' && T.num(v.w) && T.num(v.h)),
  size2: v => T.num(v) || (Array.isArray(v) && v.length === 2 && v.every(T.num)),
  rows: v => Array.isArray(v) && v.length > 0 && v.every(r => (Array.isArray(r) && r.every(T.num)) || (!!r && typeof r === 'object' && Array.isArray(r.cols))),
  cuts: v => Array.isArray(v) && v.every(c => Array.isArray(c) && c.length === 4 && c.every(T.num)),
  tpl: v => typeof v === 'string' || Number.isInteger(v),
  numOrNull: v => v === null || T.num(v),
  pts: v => Array.isArray(v) && v.length >= 3 && v.every(q => Array.isArray(q) && q.length === 2 && q.every(T.num)),
  ids: v => Array.isArray(v) && v.length >= 1 && v.every(x => typeof x === 'string'),
};
const HINT = {
  int: '整数（1, 2, …）', num: '数値', str: '文字列', bool: 'true か false', color: '"#rrggbb" 形式の色', colorOrNone: '"#rrggbb" か ""（なし）',
  pos: '[x, y]（コマ内の相対位置 0〜1）か ' + Object.keys(ANCHORS).join(' / '), xy: '[x, y]（ページのピクセル座標）',
  font: 'フォントID: ' + FONT_IDS.join(', ') + '、または "custom:フォント名"', tail: 'false / 方向（' + Object.keys(DIRS).join(', ') + '）/ [x, y] / { "to": [x, y], "style": "curve" }',
  nums: '数値か [上下, 左右] / [上, 右, 下, 左]', size: '"B5" などのプリセット名か "1600x2400"', size2: '数値（短辺に対する比率）か [幅, 高さ]（比率）',
  rows: '[[1,1],[1],[2,1]] のような行の配列（各行は読み順の列の幅比）', cuts: '[[x1, y1, x2, y2], …]（基本枠に対する 0〜1 の線分）', tpl: 'テンプレート名・別名・番号（komawari templates）', numOrNull: '数値か null（標準に戻す）',
  pts: '[[x, y], [x, y], [x, y], …]（3点以上。at と同じ 0〜1 の座標）', ids: '["sh1", "sh2"] のような図形の id の配列',
};
const ITEM = { page: 'int', panel: 'int', id: 'str', at: 'pos', xy: 'xy', rotate: 'num', opacity: 'num', clip: 'bool', locked: 'bool', hidden: 'bool', seed: 'int' };
const TEXT = { text: 'str', vertical: 'bool', font: 'font', fontSize: 'num', scale: 'num', bold: 'bool', lineHeight: 'num', letterSpacing: 'num', align: ['auto', 'start', 'center', 'end'], color: 'color', inside: 'bool' };
const IMG_ADJ = { gray: 'bool', brightness: 'num', contrast: 'num', mode: ['normal', 'mono', 'halftone'], threshold: 'num', dot: 'num', flipX: 'bool', flipY: 'bool' };
const LAYOUT = { template: 'tpl', rows: 'rows', cuts: 'cuts' };
const SCHEMA = {
  meta: { title: 'str', size: 'size', direction: ['rtl', 'ltr'], margin: 'nums', gutter: 'nums', border: 'num', borderColor: 'color' },
  'page.add': { after: 'int', ...LAYOUT, copy: 'bool', background: 'color' },
  'page.remove': { page: 'int' },
  'page.move': { page: 'int', to: 'int' },
  'page.set': { page: 'int', background: 'color' },
  layout: { page: 'int', ...LAYOUT },
  split: { page: 'int', panel: 'int', dir: ['h', 'v'], at: 'num', angle: 'num' },
  panel: { page: 'int', panel: 'int', fill: 'colorOrNone', border: 'numOrNull', borderColor: 'color' },
  image: { page: 'int', panel: 'int', id: 'str', src: 'str', asset: 'str', free: 'bool', fit: ['cover', 'contain'], zoom: 'num', focus: 'xy', at: 'pos', xy: 'xy', width: 'num', height: 'num', rotate: 'num', opacity: 'num', clip: 'bool', locked: 'bool', hidden: 'bool', ...IMG_ADJ },
  bubble: { ...ITEM, ...TEXT, shape: SHAPE_IDS, tail: 'tail', fill: 'color', stroke: 'color', strokeWidth: 'num', dashed: 'bool', width: 'num', height: 'num' },
  text: { ...ITEM, ...TEXT, outline: 'color', outlineWidth: 'num', outline2: 'color', outline2Width: 'num', background: 'colorOrNone' },
  effect: { ...ITEM, kind: ['focus', 'speed', 'flash', 'tone'], size: 'size2', center: 'pos', inner: 'num', count: 'int', thickness: 'num', jitter: 'num', color: 'color', background: 'colorOrNone', angle: 'num', minLength: 'num', maxLength: 'num', taper: ['one', 'both'], centerGap: 'num', fill: 'color', strokeWidth: 'num', pattern: ['dots', 'grad', 'lines', 'cross', 'solid'], pitch: 'num', density: 'num', density2: 'num', gradientAngle: 'num', shape: ['rect', 'ellipse'] },
  shape: {
    page: 'int', panel: 'int', id: 'str', at: 'pos', xy: 'xy', rotate: 'num', opacity: 'num', clip: 'bool', locked: 'bool', hidden: 'bool',
    shape: K.SHAPE_KINDS.map(s => s[0]), size: 'size2', width: 'num', height: 'num', points: 'pts', sides: 'int', inner: 'num', radius: 'num',
    fill: 'colorOrNone', pattern: ['solid', ...K.TONE_PATTERNS], pitch: 'num', density: 'num', density2: 'num', angle: 'num', gradientAngle: 'num',
    stroke: 'colorOrNone', strokeWidth: 'num', line: ['solid', 'dashed', 'dotted'], join: ['miter', 'round', 'bevel'], strokeAlign: ['center', 'inside', 'outside'],
  },
  combine: { ids: 'ids', mode: K.COMBINE_MODES.map(m => m[0]), id: 'str' },
  set: null,
  remove: { id: 'str', page: 'int', panel: 'int' },
  clear: { page: 'int', what: ['items', 'images', 'all'] },
};
SCHEMA.sfx = SCHEMA.text;
const REQUIRED = { bubble: ['text'], text: ['text'], sfx: ['text'], effect: ['kind'], combine: ['ids'], split: ['panel', 'dir'], 'page.remove': ['page'], 'page.move': ['page', 'to'], set: [], remove: [] };
const ignoredKey = k => k === 'op' || k === 'note' || k.startsWith('_') || k.startsWith('//');

function lev(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
function suggest(word, list) {
  let best = null, bd = 99;
  for (const c of list) { const d = lev(String(word).toLowerCase(), c.toLowerCase()); if (d < bd) { bd = d; best = c; } }
  return best && bd <= Math.max(2, Math.floor(String(word).length / 3)) ? `もしかして「${best}」？ 使える項目: ${list.join(', ')}` : `使える項目: ${list.join(', ')}`;
}
function checkType(ty, v) { return Array.isArray(ty) ? ty.includes(v) : T[ty](v); }
function typeHint(ty) { return Array.isArray(ty) ? 'どれか: ' + ty.join(' / ') : HINT[ty]; }
function checkKeys(o, schema, name, where, errs) {
  for (const [k, v] of Object.entries(o)) {
    if (ignoredKey(k) || k === '__where') continue;
    const ty = schema[k];
    if (!ty) { errs.push({ where, error: `${name} に「${k}」という項目はありません`, hint: suggest(k, Object.keys(schema)) }); continue; }
    if (!checkType(ty, v)) errs.push({ where, error: `${name}.${k} の値が正しくありません: ${JSON.stringify(v)}`, hint: typeHint(ty) });
  }
}
function validateOp(op, where) {
  const errs = [];
  if (!op || typeof op !== 'object' || Array.isArray(op)) return [{ where, error: '操作は { "op": … } のオブジェクトにしてください' }];
  if (!(op.op in SCHEMA)) return [{ where, error: `不明な op「${op.op}」`, hint: suggest(op.op, Object.keys(SCHEMA)) }];
  for (const k of REQUIRED[op.op] || []) if (op[k] == null) errs.push({ where, error: `${op.op} には「${k}」が必要です` });
  if (op.op === 'set' || op.op === 'remove') { if (op.id == null && op.panel == null) errs.push({ where, error: `${op.op} には「id」か「page」+「panel」が必要です`, hint: 'id は komawari info で確認できます' }); }
  if (op.op === 'layout' && op.template == null && op.rows == null && op.cuts == null) errs.push({ where, error: 'layout には template・rows・cuts のどれかが必要です' });
  if (op.op === 'shape' && op.shape === 'path' && op.points == null) errs.push({ where, error: 'shape: "path" には points が必要です', hint: HINT.pts });
  if (op.op === 'combine' && op.mode === 'fragment' && op.id != null) errs.push({ where, error: 'fragment（分割）は図形がいくつできるか決まらないため id を指定できません', hint: 'できた図形の id は results の ids に返ります' });
  if (SCHEMA[op.op]) checkKeys(op, SCHEMA[op.op], op.op, where, errs);
  return errs;
}
function validateOps(ops) {
  if (!Array.isArray(ops)) return [{ where: '(root)', error: '操作は配列（[ {…}, {…} ]）か { "ops": [ … ] } にしてください' }];
  return ops.flatMap((op, i) => validateOp(op, (op && op.__where) || `ops[${i}]`));
}

/* ---------------- addressing helpers ---------------- */
function getPage(n) {
  const P = K.project, i = (n == null ? 1 : n) - 1;
  if (i < 0 || i >= P.pages.length) throw new UserError(`ページ ${n} はありません（全${P.pages.length}ページ）`, 'page は 1 から数えます');
  return P.pages[i];
}
function panelByNo(page, n, pageNo) {
  const order = K.readingOrder(page.panels);
  if (!Number.isInteger(n) || n < 1 || n > order.length) throw new UserError(`ページ${pageNo || 1}にコマ ${n} はありません（${order.length}コマ）`, 'panel は読み順（右上から）で 1 から数えます。komawari info で確かめられます');
  return order[n - 1];
}
function boxOf(page, panelNo, pageNo) {
  if (panelNo != null) { const pn = panelByNo(page, panelNo, pageNo), b = K.polyBBox(pn.pts); return { x: b.x, y: b.y, w: b.w, h: b.h, cx: b.cx, cy: b.cy, pn }; }
  const F = K.innerFrame();
  return { x: F.x, y: F.y, w: F.w, h: F.h, cx: F.x + F.w / 2, cy: F.y + F.h / 2, pn: null };
}
function toAbs(at, box, def) {
  const r = at == null ? ANCHORS[def || 'center'] : typeof at === 'string' ? ANCHORS[at] : at;
  if (!r) throw new UserError(`位置「${at}」は使えません`, HINT.pos);
  return [box.x + r[0] * box.w, box.y + r[1] * box.h];
}
function findById(id) {
  const P = K.project;
  for (let i = 0; i < P.pages.length; i++) {
    const pg = P.pages[i], it = pg.items.find(x => x.id === id);
    if (it) return { page: pg, pageNo: i + 1, kind: 'item', obj: it };
    const pn = pg.panels.find(x => x.id === id);
    if (pn) return { page: pg, pageNo: i + 1, kind: 'panel', obj: pn };
  }
  return null;
}
function allIds() { const s = new Set(); for (const pg of K.project.pages) { for (const it of pg.items) s.add(it.id); for (const pn of pg.panels) s.add(pn.id); } return s; }
function newId(o, prefix) {
  const used = allIds();
  if (o.id != null) { if (used.has(o.id)) throw new UserError(`id「${o.id}」はすでに使われています`, '別の id にするか、変更なら op: "set" を使ってください'); return String(o.id); }
  let n = 1;
  while (used.has(prefix + n)) n++;
  return prefix + n;
}
function insertItem(page, it) {
  const items = page.items;
  let i = -1;
  if (it.type === 'effect') i = items.findIndex(x => x.type !== 'effect');
  else if (it.type === 'image' || it.type === 'shape') i = items.findIndex(x => x.type === 'bubble' || x.type === 'text');
  if (i < 0) items.push(it); else items.splice(i, 0, it);
}
function panelOfItem(page, it) { return K.readingOrder(page.panels).findIndex(pn => K.pointInPoly([it.x, it.y], pn.pts)) + 1 || null; }
function findTemplate(t) {
  if (Number.isInteger(t)) { if (t >= 1 && t <= K.TEMPLATES.length) return t - 1; }
  else {
    const s = String(t).trim(), i = K.TEMPLATES.findIndex(x => x.name === s || x.alias === s.toLowerCase());
    if (i >= 0) return i;
  }
  throw new UserError(`テンプレート「${t}」はありません`, '使える名前: ' + K.TEMPLATES.map((x, i) => `${i + 1}:${x.alias}(${x.name})`).join(', '));
}
function layoutPanels(o) {
  if (o.template != null) return { panels: K.templatePanels(findTemplate(o.template)), tpl: findTemplate(o.template) };
  if (o.rows) return { panels: K.cutsPanels(K.rowsToCuts(o.rows, K.project.layout.dir)), tpl: null };
  if (o.cuts) return { panels: K.cutsPanels(o.cuts), tpl: null };
  return null;
}
function clampInside(it, box, w, h) {
  const m = K.U() * 1.2;
  it.x = w + 2 * m <= box.w ? Math.min(Math.max(it.x, box.x + m + w / 2), box.x + box.w - m - w / 2) : box.cx;
  it.y = h + 2 * m <= box.h ? Math.min(Math.max(it.y, box.y + m + h / 2), box.y + box.h - m - h / 2) : box.cy;
}
const r1 = v => Math.round(v * 10) / 10;

/* ---------------- property application ---------------- */
function applyCommon(it, o) {
  if (o.rotate != null) it.rot = o.rotate;
  if (o.opacity != null) it.opacity = Math.max(0, Math.min(1, o.opacity));
  if (o.locked != null) it.locked = o.locked;
  if (o.hidden != null) it.hidden = o.hidden;
  if (o.seed != null) it.seed = o.seed;
}
function applyText(it, o, role) {
  if (o.text != null) it.text = String(o.text);
  if (o.vertical != null) it.vertical = o.vertical;
  if (o.font != null) it.font = o.font;
  if (o.fontSize != null) it.size = Math.max(2, o.fontSize);
  else if (o.scale != null) it.size = Math.max(2, Math.round(K.U() * DEFAULT_SIZE[role] * o.scale));
  if (o.bold != null) it.bold = o.bold;
  if (o.lineHeight != null) it.lh = o.lineHeight;
  if (o.letterSpacing != null) it.ls = o.letterSpacing;
  if (o.align != null) it.align = o.align;
  if (o.color != null) it.color = o.color;
}
function setTail(it, tail, box) {
  if (tail === undefined) return;
  if (tail === false || tail === null || tail === 'none') { it.tail.on = false; return; }
  const sp = typeof tail === 'object' && !Array.isArray(tail) ? tail : { to: tail };
  for (const k of Object.keys(sp)) if (!['to', 'dir', 'style', 'width', 'bend', 'length'].includes(k)) throw new UserError(`tail に「${k}」という項目はありません`, '使える項目: to, dir, style(straight/curve/thought), width, bend, length');
  if (sp.style != null) { if (!['straight', 'curve', 'thought'].includes(sp.style)) throw new UserError(`tail.style「${sp.style}」は使えません`, 'straight / curve / thought'); it.tail.style = sp.style; }
  if (sp.width != null) it.tail.w = +sp.width;
  if (sp.bend != null) it.tail.bend = +sp.bend;
  const to = sp.to != null ? sp.to : sp.dir != null ? sp.dir : null;
  if (to == null) { it.tail.on = true; return; }
  let tip;
  if (typeof to === 'string' && DIRS[to]) {
    const l = Math.hypot(DIRS[to][0], DIRS[to][1]), v = [DIRS[to][0] / l, DIRS[to][1] / l];
    const r = K.ellR(it.w / 2, it.h / 2, Math.atan2(v[1], v[0])), len = r + Math.min(it.w, it.h) * 0.45 * (sp.length == null ? 1 : +sp.length);
    tip = [it.x + v[0] * len, it.y + v[1] * len];
  } else if (typeof to === 'string' || T.xy(to)) tip = toAbs(to, box);
  else throw new UserError(`tail の向き「${JSON.stringify(to)}」は使えません`, HINT.tail);
  const l = K.V.rot([tip[0] - it.x, tip[1] - it.y], -(it.rot || 0) * Math.PI / 180);
  it.tail.on = true; it.tail.x = r1(l[0]); it.tail.y = r1(l[1]);
}
function placeItem(it, o, box, sizeFn, isNew) {
  if (o.xy || o.at != null || isNew) { const p = o.xy || toAbs(o.at, box, 'center'); it.x = p[0]; it.y = p[1]; }
  if (box.pn && o.inside !== false && (isNew || o.at != null || o.xy)) { const s = sizeFn(); clampInside(it, box, s.w, s.h); }
}
function applyBubble(it, o, box, isNew) {
  applyText(it, o, 'bubble'); applyCommon(it, o);
  if (o.shape != null) { it.shape = o.shape; if (isNew && o.shape === 'cloud' && !(o.tail && o.tail.style)) it.tail.style = 'thought'; }
  if (o.fill != null) it.fill = o.fill;
  if (o.stroke != null) it.stroke = o.stroke;
  if (o.strokeWidth != null) it.sw = Math.max(0, o.strokeWidth);
  if (o.dashed != null) it.dash = o.dashed;
  if (o.width != null || o.height != null) { it.autoFit = false; if (o.width != null) it.w = Math.max(10, o.width * box.w); if (o.height != null) it.h = Math.max(10, o.height * box.h); }
  if (it.autoFit) K.fitBubble(it);
  placeItem(it, o, box, () => ({ w: it.w, h: it.h }), isNew);
  if (isNew) {
    const t = o.tail === undefined ? {} : o.tail;
    if (t === false || t === null || t === 'none') setTail(it, false, box);
    else {
      const sp = typeof t === 'object' && !Array.isArray(t) ? Object.assign({}, t) : { to: t };
      if (sp.to == null && sp.dir == null) sp.dir = it.shape === 'cloud' ? 'down-left' : 'down';
      setTail(it, sp, box);
    }
  } else setTail(it, o.tail, box);
}
function applyTextItem(it, o, box, role, isNew) {
  applyText(it, o, role); applyCommon(it, o);
  if (o.outline != null) it.sc = o.outline;
  if (o.outlineWidth != null) it.sw = Math.max(0, o.outlineWidth);
  if (o.outline2 != null) it.sc2 = o.outline2;
  if (o.outline2Width != null) it.sw2 = Math.max(0, o.outline2Width);
  if (o.background !== undefined) it.bg = o.background && o.background !== 'none' ? o.background : '';
  placeItem(it, o, box, () => K.textBox(it), isNew);
}
function applyEffect(it, o, box) {
  applyCommon(it, o);
  const k = it.kind;
  if (o.color != null) it.color = o.color;
  if (o.count != null) it.count = o.count;
  if (o.thickness != null) it.thick = o.thickness;
  if (k === 'focus' || k === 'speed') { if (o.background !== undefined) it.bg = o.background && o.background !== 'none' ? o.background : ''; }
  if (k === 'focus') {
    if (o.inner != null) it.ir = o.inner;
    if (o.jitter != null) it.jitter = o.jitter;
    if (o.center != null) { const c = toAbs(o.center, box), l = K.V.rot([c[0] - it.x, c[1] - it.y], -(it.rot || 0) * Math.PI / 180); it.fx = l[0] / (it.w / 2); it.fy = l[1] / (it.h / 2); }
  } else if (k === 'speed') {
    if (o.angle != null) it.rot = o.angle;
    if (o.minLength != null) it.lmin = o.minLength;
    if (o.maxLength != null) it.lmax = o.maxLength;
    if (o.taper != null) it.taper = o.taper;
    if (o.centerGap != null) it.gapc = o.centerGap;
  } else if (k === 'flash') {
    if (o.inner != null) it.ir = o.inner;
    if (o.minLength != null) it.lmin = o.minLength;
    if (o.fill != null) it.fill = o.fill;
    if (o.strokeWidth != null) it.sw = o.strokeWidth;
  } else if (k === 'tone') {
    if (o.pattern != null) it.pattern = o.pattern;
    if (o.pitch != null) it.pitch = o.pitch;
    if (o.density != null) it.dens = o.density;
    if (o.density2 != null) it.d2 = o.density2;
    if (o.gradientAngle != null) it.gang = o.gradientAngle;
    if (o.angle != null) it.angle = o.angle;
    if (o.shape != null) it.shape = o.shape;
  }
}
function effectRect(o, box) {
  const pad = box.pn ? (box.pn.bw == null ? K.project.layout.bw : box.pn.bw) : 0;
  if (o.at != null || o.xy || o.size != null) {
    const c = o.xy || toAbs(o.at, box, 'center');
    let w, h;
    if (o.size == null) { w = box.w; h = box.h; }
    else if (Array.isArray(o.size)) { w = o.size[0] * box.w; h = o.size[1] * box.h; }
    else { w = h = o.size * Math.min(box.w, box.h); }
    return { cx: c[0], cy: c[1], w: Math.max(10, w), h: Math.max(10, h) };
  }
  if (o.kind === 'flash') { const m = Math.min(box.w, box.h) * 0.95; return { cx: box.cx, cy: box.cy, w: Math.min(box.w, m * 1.25), h: m }; }
  return { cx: box.cx, cy: box.cy, w: box.w + pad * 2, h: box.h + pad * 2 };
}
/* size of a shape from size / width / height (ratios of the panel or frame box). A
   number size, or only one of width / height, keeps the shape's natural proportions
   (square, circle, regular polygon); on set, only one of width / height keeps the current ones. */
function sizeShape(it, o, box, isNew) {
  const nat = K.shapeAspect(it), a = isNew ? nat : it.w / it.h;
  let w = null, h = null;
  if (o.size != null) {
    if (Array.isArray(o.size)) { w = o.size[0] * box.w; h = o.size[1] * box.h; }
    else { const s = o.size * Math.min(box.w, box.h); w = nat >= 1 ? s : s * nat; h = nat >= 1 ? s / nat : s; }
  } else if (o.width != null || o.height != null) {
    w = o.width != null ? o.width * box.w : null; h = o.height != null ? o.height * box.h : null;
    if (w == null) w = h * a; else if (h == null) h = w / a;
  } else if (isNew) {
    const s = 0.4 * Math.min(box.w, box.h); w = nat >= 1 ? s : s * nat; h = nat >= 1 ? s / nat : s;
  }
  if (w != null) { it.w = Math.max(1, w); it.h = Math.max(1, h); }
}
function applyShape(it, o, box, isNew) {
  if (o.points) {
    const p = K.makePathShape([o.points.map(q => toAbs(q, box))]);
    Object.assign(it, { shape: 'path', x: p.x, y: p.y, w: p.w, h: p.h, rings: p.rings, rot: 0, radius: 0 });
  } else if (o.shape === 'path') K.shapeToPath(it);
  else if (o.shape != null) { it.shape = o.shape; it.rings = null; }
  if (o.sides != null) it.sides = Math.max(3, Math.min(64, o.sides));
  if (o.inner != null) it.inner = Math.max(0.05, Math.min(1, o.inner));
  if (o.radius != null) it.radius = Math.max(0, o.radius);
  if (!o.points) {
    sizeShape(it, o, box, isNew);
    if (o.xy || o.at != null || isNew) { const c = o.xy || toAbs(o.at, box, 'center'); it.x = c[0]; it.y = c[1]; }
  }
  if (o.fill !== undefined) it.fill = o.fill && o.fill !== 'none' ? o.fill : '';
  if (o.pattern != null) it.pattern = o.pattern;
  if (o.pitch != null) it.pitch = Math.max(1.5, o.pitch);
  if (o.density != null) it.dens = o.density;
  if (o.density2 != null) it.d2 = o.density2;
  if (o.angle != null) it.angle = o.angle;
  if (o.gradientAngle != null) it.gang = o.gradientAngle;
  if (o.stroke !== undefined) it.stroke = o.stroke && o.stroke !== 'none' ? o.stroke : '';
  if (o.strokeWidth != null) it.sw = Math.max(0, o.strokeWidth);
  if (o.line != null) it.line = o.line;
  if (o.join != null) it.join = o.join;
  if (o.strokeAlign != null) it.salign = o.strokeAlign;
  applyCommon(it, o);
}
function applyImageAdj(im, o) {
  if (o.gray != null) im.gray = o.gray;
  if (o.brightness != null) im.bright = o.brightness;
  if (o.contrast != null) im.contrast = o.contrast;
  if (o.mode != null) im.mode = o.mode;
  if (o.threshold != null) im.thr = o.threshold;
  if (o.dot != null) im.dot = o.dot;
  if (o.flipX != null) im.fx = o.flipX;
  if (o.flipY != null) im.fy = o.flipY;
}
function placePanelImage(pn, o, box, refit) {
  const im = pn.img, a = K.project.assets[im.asset];
  if (refit && o.fit) K.fitImage(pn, o.fit);
  if (o.zoom != null) { const b = K.polyBBox(pn.pts), base = o.fit === 'contain' ? Math.min(b.w / a.w, b.h / a.h) : K.coverScale(pn, a); im.s = base * Math.max(0.01, o.zoom); }
  if (o.rotate != null) im.rot = o.rotate;
  applyImageAdj(im, o);
  if (o.focus || o.at != null || o.xy || o.zoom != null || o.rotate != null) {
    const f = o.focus || null;
    if (f || o.at != null || o.xy) {
      const fx = f ? f[0] : 0.5, fy = f ? f[1] : 0.5;
      let v = [(fx - 0.5) * a.w * im.s, (fy - 0.5) * a.h * im.s];
      if (im.fx) v[0] = -v[0];
      if (im.fy) v[1] = -v[1];
      v = K.V.rot(v, (im.rot || 0) * Math.PI / 180);
      const t = o.xy || toAbs(o.at, box, 'center');
      im.cx = t[0] - v[0]; im.cy = t[1] - v[1];
    }
    // keep the panel covered (like CSS object-position) when the image is big enough
    if (!((im.rot || 0) % 360)) {
      const bb = K.polyBBox(pn.pts), hw = a.w * im.s / 2, hh = a.h * im.s / 2;
      if (2 * hw >= bb.w - 0.5) im.cx = Math.min(Math.max(im.cx, bb.x2 - hw), bb.x1 + hw);
      if (2 * hh >= bb.h - 0.5) im.cy = Math.min(Math.max(im.cy, bb.y2 - hh), bb.y1 + hh);
    }
  }
}
async function resolveAsset(o, ctx) {
  if (o.asset) { if (!K.project.assets[o.asset]) throw new UserError(`画像 asset「${o.asset}」はこの作品にありません`, 'komawari info の assets を確認してください'); return o.asset; }
  return E.importImage(o.src, ctx.baseDir);
}

/* ---------------- operations ---------------- */
const RUN = {
  meta(o) {
    const P = K.project, L = P.layout;
    if (o.title != null) P.name = o.title;
    if (o.direction != null) L.dir = o.direction;
    if (o.margin != null) { const m = Array.isArray(o.margin) ? o.margin : [o.margin]; const [t, r = t, b = t, l = r] = m; L.mt = t; L.mr = r; L.mb = b; L.ml = l; }
    if (o.gutter != null) { const g = Array.isArray(o.gutter) ? o.gutter : [o.gutter, o.gutter]; L.gx = g[0]; L.gy = g[1] == null ? g[0] : g[1]; }
    if (o.border != null) L.bw = Math.max(0, o.border);
    if (o.borderColor != null) L.bc = o.borderColor;
    if (o.size != null) { const sz = E.parseSize(o.size), pr = sz.preset ? K.PRESETS.find(p => p.id === sz.preset) : null; K.resizeProject(pr ? pr.w : sz.w, pr ? pr.h : sz.h, sz.preset || 'custom'); }
    return { title: P.name, size: [P.page.w, P.page.h] };
  },
  'page.add'(o) {
    const P = K.project, after = o.after == null ? P.pages.length : o.after;
    if (after < 0 || after > P.pages.length) throw new UserError(`after は 0〜${P.pages.length} にしてください`);
    const pg = K.newPage(), lay = layoutPanels(o);
    if (lay) { pg.panels = lay.panels; pg.tpl = lay.tpl; }
    else if (o.copy !== false && after > 0) { const src = P.pages[after - 1]; pg.panels = src.panels.map(p => Object.assign(K.newPanel(K.clone(p.pts)), { fill: p.fill, bw: p.bw, bc: p.bc })); pg.tpl = src.tpl; }
    else { const i = findTemplate('basic-5'); pg.panels = K.templatePanels(i); pg.tpl = i; }
    if (o.background) pg.bg = o.background;
    P.pages.splice(after, 0, pg);
    return { page: after + 1, panels: pg.panels.length };
  },
  'page.remove'(o) { const P = K.project; getPage(o.page); if (P.pages.length < 2) throw new UserError('最後の1ページは削除できません'); P.pages.splice(o.page - 1, 1); return { pages: P.pages.length }; },
  'page.move'(o) { const P = K.project, pg = getPage(o.page); if (o.to < 1 || o.to > P.pages.length) throw new UserError(`to は 1〜${P.pages.length} にしてください`); P.pages.splice(o.page - 1, 1); P.pages.splice(o.to - 1, 0, pg); return { page: o.to }; },
  'page.set'(o) { const pg = getPage(o.page); if (o.background) pg.bg = o.background; return { page: o.page || 1 }; },
  layout(o) {
    const page = getPage(o.page), lay = layoutPanels(o);
    K.applyPanels(page, lay.panels); page.tpl = lay.tpl;
    return { page: o.page || 1, panels: page.panels.length };
  },
  split(o) {
    const pageNo = o.page || 1, page = getPage(pageNo), pn = panelByNo(page, o.panel, pageNo), b = K.polyBBox(pn.pts), t = o.at == null ? 0.5 : o.at, a = (o.angle || 0) * Math.PI / 180;
    const P0 = o.dir === 'h' ? [b.cx, b.y + t * b.h] : [b.x + t * b.w, b.cy];
    const d = o.dir === 'h' ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)];
    const r = K.splitPanelObj(pn, P0, d, K.gapFor(d));
    if (!r) throw new UserError(`コマ ${o.panel} はその位置で分割できません`, 'at を 0.2〜0.8 にするか、角度を小さくしてください');
    page.panels.splice(page.panels.indexOf(pn), 1, ...r); page.tpl = null; K.reclip(page);
    return { page: pageNo, panels: page.panels.length };
  },
  panel(o) {
    const pageNo = o.page || 1, pn = panelByNo(getPage(pageNo), o.panel, pageNo);
    if (o.fill !== undefined) pn.fill = o.fill && o.fill !== 'none' ? o.fill : 'none';
    if (o.border !== undefined) pn.bw = o.border;
    if (o.borderColor != null) pn.bc = o.borderColor;
    return { id: pn.id, panel: o.panel };
  },
  async image(o, ctx) {
    const pageNo = o.page || 1, page = getPage(pageNo);
    if (o.panel != null && !o.free) {
      const pn = panelByNo(page, o.panel, pageNo), box = boxOf(page, o.panel, pageNo);
      for (const k of ['width', 'height', 'id', 'clip', 'opacity', 'locked', 'hidden']) if (o[k] != null) throw new UserError(`コマに入れる画像に「${k}」は使えません`, '枠からはみ出す自由配置の画像にするなら "free": true を付けてください');
      if (o.src || o.asset) { pn.img = K.newPanelImage(await resolveAsset(o, ctx)); K.fitImage(pn, o.fit === 'contain' ? 'contain' : 'cover'); }
      else if (!pn.img) throw new UserError(`コマ ${o.panel} にはまだ画像がありません`, 'src に画像ファイルのパスを指定してください');
      placePanelImage(pn, o, box, !(o.src || o.asset));
      return { panel: o.panel, asset: pn.img.asset };
    }
    const box = boxOf(page, o.panel, pageNo), id = await resolveAsset(o, ctx), a = K.project.assets[id];
    if (o.zoom != null || o.focus != null || o.fit != null) throw new UserError('zoom・focus・fit はコマに入れる画像用です', '自由配置の画像は width か height（基準の枠に対する比率）で大きさを決めます');
    const c = o.xy || toAbs(o.at, box, 'center'), it = K.makeImageItem(id, c[0], c[1], 10);
    let w = o.width != null ? o.width * box.w : o.height != null ? o.height * box.h * a.w / a.h : Math.min(box.w, box.h) * 0.6 * a.w / Math.max(a.w, a.h);
    it.w = Math.max(10, w); it.h = o.width != null && o.height != null ? o.height * box.h : it.w * a.h / a.w;
    it.id = newId(o, 'i');
    applyCommon(it, o); applyImageAdj(it, o);
    if (box.pn && o.clip) it.clip = box.pn.id;
    insertItem(page, it);
    return { id: it.id };
  },
  bubble(o) {
    const pageNo = o.page || 1, page = getPage(pageNo), box = boxOf(page, o.panel, pageNo), it = K.makeBubble(box.cx, box.cy, { text: '' });
    it.id = newId(o, 'b');
    applyBubble(it, o, box, true);
    if (box.pn && o.clip) it.clip = box.pn.id;
    insertItem(page, it);
    return { id: it.id, size: [r1(it.w), r1(it.h)] };
  },
  text(o) { return makeTextOp(o, 'text'); },
  sfx(o) { return makeTextOp(o, 'sfx'); },
  shape(o) {
    const pageNo = o.page || 1, page = getPage(pageNo), box = boxOf(page, o.panel, pageNo);
    const it = K.makeShape(o.shape && o.shape !== 'path' ? o.shape : 'rect', box.cx, box.cy);
    it.id = newId(o, 'sh');
    applyShape(it, o, box, true);
    if (box.pn && o.clip) it.clip = box.pn.id;
    insertItem(page, it);
    return { id: it.id, box: [r1(it.x - it.w / 2), r1(it.y - it.h / 2), r1(it.w), r1(it.h)] };
  },
  combine(o) {
    const mode = o.mode || 'union', hits = o.ids.map(id => {
      const h = findById(id);
      if (!h) throw new UserError(`id「${id}」が見つかりません`, 'komawari info で id を確認してください');
      if (h.kind !== 'item' || h.obj.type !== 'shape') throw new UserError(`「${id}」は図形ではありません`, '結合できるのは op: "shape" で作った図形だけです');
      return h;
    });
    if (hits.some(h => h.page !== hits[0].page)) throw new UserError('別のページにある図形どうしは結合できません');
    if (mode !== 'fragment' && new Set(o.ids).size < 2) throw new UserError(`${mode} には図形が2つ以上必要です`, '1つの図形の離れた部分を分けるなら mode: "fragment" を使います');
    if (o.id != null) { const used = allIds(); for (const id of o.ids) used.delete(id); if (used.has(o.id)) throw new UserError(`id「${o.id}」はすでに使われています`, '別の id にしてください（結合する図形の id は使えます）'); }
    const out = K.combineShapes(hits[0].page, hits.map(h => h.obj), mode);
    if (!out || !out.length) throw new UserError(mode === 'intersect' ? 'すべての図形が重なっている部分がないため、交差の結果が空です' : '結合の結果が空になります（すべてくり抜かれます）', 'komawari info の box で図形の位置と大きさを確かめてください');
    for (const it of out) it.id = newId(out.length === 1 && o.id != null ? { id: o.id } : {}, 'sh');
    return out.length === 1 ? { mode, id: out[0].id } : { mode, ids: out.map(it => it.id) };
  },
  effect(o) {
    const pageNo = o.page || 1, page = getPage(pageNo), box = boxOf(page, o.panel, pageNo);
    const it = K.makeEffect(o.kind, effectRect(o, box), box.pn && o.clip !== false ? box.pn.id : null);
    it.id = newId(o, 'e');
    applyEffect(it, o, box);
    if (it.rot && o.size == null && o.at == null && !o.xy && it.kind !== 'flash') {
      const a = it.rot * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)), w = it.w, h = it.h;
      it.w = w * c + h * s; it.h = w * s + h * c;
    }
    insertItem(page, it);
    return { id: it.id };
  },
  async set(o, ctx) {
    let hit;
    if (o.id != null) { hit = findById(o.id); if (!hit) throw new UserError(`id「${o.id}」が見つかりません`, 'komawari info で id を確認してください'); }
    else { const pageNo = o.page || 1, page = getPage(pageNo); hit = { page, pageNo, kind: 'panel', obj: panelByNo(page, o.panel, pageNo) }; }
    const errs = [];
    if (hit.kind === 'panel') {
      checkKeys(o, Object.assign({ id: 'str', op: 'str' }, SCHEMA.panel), 'set（コマ）', o.__where || 'set', errs);
      if (errs.length) throw Object.assign(new UserError(errs[0].error, errs[0].hint), { details: errs });
      const pn = hit.obj;
      if (o.fill !== undefined) pn.fill = o.fill && o.fill !== 'none' ? o.fill : 'none';
      if (o.border !== undefined) pn.bw = o.border;
      if (o.borderColor != null) pn.bc = o.borderColor;
      return { id: pn.id };
    }
    const it = hit.obj, role = it.role === 'sfx' ? 'sfx' : it.type, schema = Object.assign({}, SCHEMA[role === 'image' ? 'image' : role], { op: 'str', id: 'str' });
    if (it.type === 'effect') delete schema.kind;
    checkKeys(o, schema, `set（${role}）`, o.__where || 'set', errs);
    if (errs.length) throw Object.assign(new UserError(errs[0].error, errs[0].hint), { details: errs });
    const pageNo = hit.pageNo, panelNo = o.panel != null ? o.panel : panelOfItem(hit.page, it), box = boxOf(hit.page, panelNo, pageNo);
    if (it.type === 'bubble') applyBubble(it, o, box, false);
    else if (it.type === 'text') applyTextItem(it, o, box, role, false);
    else if (it.type === 'effect') {
      if (o.at != null || o.xy || o.size != null) { const r = effectRect(Object.assign({ kind: it.kind }, o), box); it.x = r.cx; it.y = r.cy; it.w = r.w; it.h = r.h; }
      applyEffect(it, o, box);
    } else if (it.type === 'shape') applyShape(it, o, box, false);
    else if (it.type === 'image') {
      if (o.src || o.asset) it.asset = await resolveAsset(o, ctx);
      const a = K.project.assets[it.asset];
      if (o.at != null || o.xy) { const c = o.xy || toAbs(o.at, box, 'center'); it.x = c[0]; it.y = c[1]; }
      if (o.width != null) { it.w = o.width * box.w; if (o.height == null) it.h = it.w * a.h / a.w; }
      if (o.height != null) { it.h = o.height * box.h; if (o.width == null) it.w = it.h * a.w / a.h; }
      applyCommon(it, o); applyImageAdj(it, o);
    }
    if (o.clip != null) it.clip = o.clip && box.pn ? box.pn.id : null;
    return { id: it.id };
  },
  remove(o) {
    if (o.id != null) {
      const hit = findById(o.id);
      if (!hit) throw new UserError(`id「${o.id}」が見つかりません`, 'komawari info で id を確認してください');
      if (hit.kind === 'item') { hit.page.items = hit.page.items.filter(x => x !== hit.obj); return { removed: o.id }; }
      return removePanel(hit.page, hit.obj);
    }
    const pageNo = o.page || 1, page = getPage(pageNo);
    return removePanel(page, panelByNo(page, o.panel, pageNo));
  },
  clear(o) {
    const page = getPage(o.page), what = o.what || 'items';
    if (what === 'items' || what === 'all') page.items = [];
    if (what === 'images' || what === 'all') for (const pn of page.panels) pn.img = null;
    return { page: o.page || 1, cleared: what };
  },
};
function removePanel(page, pn) {
  page.panels = page.panels.filter(x => x !== pn); page.tpl = null;
  page.items = page.items.filter(it => !(it.clip === pn.id && it.type === 'effect'));
  for (const it of page.items) if (it.clip === pn.id) it.clip = null;
  return { removed: pn.id, panels: page.panels.length };
}
function makeTextOp(o, role) {
  const pageNo = o.page || 1, page = getPage(pageNo), box = boxOf(page, o.panel, pageNo);
  const it = role === 'sfx' ? K.makeSfx(box.cx, box.cy) : K.makeText(box.cx, box.cy);
  if (role === 'sfx') it.role = 'sfx';
  it.id = newId(o, role === 'sfx' ? 's' : 't');
  applyTextItem(it, o, box, role, true);
  if (box.pn && o.clip) it.clip = box.pn.id;
  insertItem(page, it);
  return { id: it.id };
}

async function runOps(ops, ctx = {}) {
  const errs = validateOps(ops);
  if (errs.length) throw Object.assign(new UserError(`${errs.length}件の問題があります: ${errs[0].where} ${errs[0].error}`, errs[0].hint), { details: errs });
  const results = [];
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i], where = o.__where || `ops[${i}]`;
    try { const r = await RUN[o.op](o, ctx); results.push(Object.assign({ op: o.op }, r)); }
    catch (err) { if (err.user) err.message = `${where}: ${err.message}`; throw err; }
  }
  return results;
}

/* ---------------- spec (whole pages in one JSON) ---------------- */
const SPEC_TOP = { title: 'str', size: 'size', direction: ['rtl', 'ltr'], margin: 'nums', gutter: 'nums', border: 'num', borderColor: 'color', defaults: 'obj', pages: 'arr', $schema: 'str' };
const SPEC_PAGE = { layout: 'any', background: 'color', panels: 'arr', items: 'arr', combine: 'arr' };
const SPEC_PANEL = { image: 'any', fill: 'colorOrNone', border: 'numOrNull', borderColor: 'color', effects: 'arr', shapes: 'arr', bubbles: 'arr', texts: 'arr', sfx: 'arr', items: 'arr' };
Object.assign(T, { obj: v => !!v && typeof v === 'object' && !Array.isArray(v), arr: Array.isArray, any: () => true });
Object.assign(HINT, { obj: 'オブジェクト', arr: '配列', any: '' });
function layoutFromSpec(l, where, errs) {
  if (l == null) return null;
  if (typeof l === 'string' || Number.isInteger(l)) return { template: l };
  if (Array.isArray(l)) return { rows: l };
  if (T.obj(l)) { checkKeys(l, LAYOUT, 'layout', where, errs); return Object.assign({}, l); }
  errs.push({ where, error: 'layout はテンプレート名か { "rows": … } / { "cuts": … } にしてください' });
  return null;
}
function specToOps(spec) {
  const errs = [], ops = [];
  if (!T.obj(spec)) throw new UserError('spec は { "pages": [ … ] } のオブジェクトにしてください');
  checkKeys(spec, SPEC_TOP, 'spec', '(root)', errs);
  if (!Array.isArray(spec.pages) || !spec.pages.length) errs.push({ where: '(root)', error: 'pages に1ページ以上を書いてください' });
  const D = T.obj(spec.defaults) ? spec.defaults : {};
  for (const k of Object.keys(D)) if (!['bubble', 'text', 'sfx', 'effect', 'shape'].includes(k)) errs.push({ where: 'defaults', error: `defaults に「${k}」はありません`, hint: 'bubble / text / sfx / effect / shape' });
  const meta = {};
  for (const k of ['title', 'direction', 'margin', 'gutter', 'border', 'borderColor']) if (spec[k] != null) meta[k] = spec[k];
  if (Object.keys(meta).length) ops.push(Object.assign({ op: 'meta', __where: '(root)' }, meta));
  (spec.pages || []).forEach((p, pi) => {
    const pw = `pages[${pi}]`, page = pi + 1;
    if (!T.obj(p)) { errs.push({ where: pw, error: 'ページはオブジェクトにしてください' }); return; }
    checkKeys(p, SPEC_PAGE, 'page', pw, errs);
    const lay = layoutFromSpec(p.layout, pw + '.layout', errs);
    if (pi === 0) ops.push(Object.assign({ op: 'layout', page: 1, __where: pw + '.layout' }, lay || { template: 'basic-5' }));
    else ops.push(Object.assign({ op: 'page.add', __where: pw }, lay || {}));
    if (p.background) ops.push({ op: 'page.set', page, background: p.background, __where: pw });
    const effectsLast = [];
    (p.panels || []).forEach((pn, k) => {
      const w = `${pw}.panels[${k}]`, panel = k + 1;
      if (pn == null) return;
      if (!T.obj(pn)) { errs.push({ where: w, error: 'コマはオブジェクト（または null）にしてください' }); return; }
      checkKeys(pn, SPEC_PANEL, 'panel', w, errs);
      if (pn.image != null) ops.push(Object.assign({ op: 'image', page, panel, __where: w + '.image' }, typeof pn.image === 'string' ? { src: pn.image } : pn.image));
      if (pn.fill !== undefined || pn.border !== undefined || pn.borderColor != null) { const o = { op: 'panel', page, panel, __where: w }; for (const key of ['fill', 'border', 'borderColor']) if (pn[key] !== undefined) o[key] = pn[key]; ops.push(o); }
      (pn.effects || []).forEach((e, j) => ops.push(Object.assign({ op: 'effect' }, D.effect || {}, e, { page, panel, __where: `${w}.effects[${j}]` })));
      for (const [key, op] of [['shapes', 'shape'], ['bubbles', 'bubble'], ['texts', 'text'], ['sfx', 'sfx']]) (pn[key] || []).forEach((b, j) => effectsLast.push(Object.assign({ op }, D[op] || {}, b, { page, panel, __where: `${w}.${key}[${j}]` })));
      (pn.items || []).forEach((it, j) => { const { type, ...rest } = it || {}; if (!type) { errs.push({ where: `${w}.items[${j}]`, error: 'items の各要素には type（bubble / text / sfx / image / effect / shape）が必要です' }); return; } effectsLast.push(Object.assign({ op: type }, D[type] || {}, rest, { page, panel, __where: `${w}.items[${j}]` })); });
    });
    (p.items || []).forEach((it, j) => { const { type, ...rest } = it || {}; if (!type) { errs.push({ where: `${pw}.items[${j}]`, error: 'items の各要素には type（bubble / text / sfx / image / effect / shape）が必要です' }); return; } effectsLast.push(Object.assign({ op: type }, D[type] || {}, rest, { page, __where: `${pw}.items[${j}]` })); });
    (p.combine || []).forEach((c, j) => effectsLast.push(Object.assign({ op: 'combine' }, T.obj(c) ? c : {}, { __where: `${pw}.combine[${j}]` })));
    ops.push(...effectsLast);
  });
  errs.push(...validateOps(ops).filter(e => !errs.some(x => x.where === e.where && x.error === e.error)));
  if (errs.length) throw Object.assign(new UserError(`spec に${errs.length}件の問題があります: ${errs[0].where} ${errs[0].error}`, errs[0].hint), { details: errs });
  return ops;
}

module.exports = { SCHEMA, ANCHORS, DIRS, REQUIRED, HINT, validateOps, runOps, specToOps, findTemplate, getPage, panelByNo };
