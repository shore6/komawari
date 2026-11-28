'use strict';
// npm test: the shape boolean operations (合体・型抜き・交差・中マド・分割) on known
// cases, including the degenerate ones (shared edges, touching corners, identical
// shapes, holes), plus a randomised check that the modes agree with each other.
const E = require('../lib/engine');
const { K } = E;
let failed = 0;
const check = (cond, msg) => { if (!cond) { failed++; console.error('NG:', msg); } else console.log('ok:', msg); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

E.newProject({ size: 'B5' });
K.project.pages.push(K.newPage());

const sq = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const run = (mode, ...polys) => K.boolOp(polys.map(p => ({ rings: [p] })), mode);
const ringsOf = res => res.flatMap(r => r.rings);
const area = res => ringsOf(res).reduce((s, r) => s + K.polyArea(r), 0);
const verts = res => ringsOf(res).map(r => r.length).sort((a, b) => a - b).join(',');
function expect(name, res, a, ringCount, vertices, eps = 1e-3) {
  const ok = near(area(res), a, eps) && (ringCount == null || ringsOf(res).length === ringCount) && (vertices == null || verts(res) === vertices);
  check(ok, `${name}: 面積 ${a}${ringCount != null ? '・輪郭' + ringCount + '本' : ''}${vertices ? '・頂点 ' + vertices : ''}（結果: ${area(res).toFixed(4)}, ${ringsOf(res).length}本, ${verts(res)}）`);
}

// overlapping squares
const A = sq(0, 0, 10, 10), B = sq(5, 5, 10, 10);
expect('重なる四角 合体', run('union', A, B), 175, 1, '8');
expect('重なる四角 交差', run('intersect', A, B), 25, 1, '4');
expect('重なる四角 型抜き', run('subtract', A, B), 75, 1, '6');
expect('重なる四角 中マド', run('exclude', A, B), 150, 2, '6,6');
const fr = run('fragment', A, B);
check(fr.length === 3 && near(area([fr[0]]), 75) && fr[0].src === 0 && fr.slice(1).every(r => r.src === 1) && near(area(fr), 175), '重なる四角 分割: 3つの領域（後ろだけ・重なり・前だけ）');

// shared edge
const R = sq(10, 0, 10, 10);
expect('辺を共有 合体', run('union', A, R), 200, 1, '4');
expect('辺を共有 交差（空）', run('intersect', A, R), 0, 0);
expect('辺を共有 型抜き', run('subtract', A, R), 100, 1, '4');
expect('辺を共有 中マド', run('exclude', A, R), 200, 1, '4');

// identical shapes
expect('同じ四角 合体', run('union', A, sq(0, 0, 10, 10)), 100, 1, '4');
expect('同じ四角 交差', run('intersect', A, sq(0, 0, 10, 10)), 100, 1, '4');
expect('同じ四角 型抜き（空）', run('subtract', A, sq(0, 0, 10, 10)), 0, 0);
expect('同じ四角 中マド（空）', run('exclude', A, sq(0, 0, 10, 10)), 0, 0);
expect('向きが逆の同じ四角 合体', run('union', A, sq(0, 0, 10, 10).reverse()), 100, 1, '4');

// nested: a hole
const O = sq(0, 0, 20, 20), I = sq(5, 5, 10, 10);
const hole = run('subtract', O, I);
expect('入れ子 型抜き（穴）', hole, 300, 2, '4,4');
check(ringsOf(hole).filter(r => K.polyArea(r) < 0).length === 1, '入れ子 型抜き: 穴の輪郭は逆向き');
expect('入れ子 合体', run('union', O, I), 400, 1, '4');
expect('入れ子 交差', run('intersect', O, I), 100, 1, '4');
const nf = run('fragment', O, I);
check(nf.length === 2 && K.ringPieces(nf[0].rings).length === 1 && K.ringPieces(nf[0].rings)[0].length === 2, '入れ子 分割: 外側は穴あきの1片');

// touching corners
expect('角だけ接触 合体', run('union', A, sq(10, 10, 10, 10)), 200, 2, '4,4');
expect('角だけ接触 交差（空）', run('intersect', A, sq(10, 10, 10, 10)), 0, 0);

// collinear partial overlap and T-junction
const C = sq(5, 0, 10, 10);
expect('一部の辺が重なる 合体', run('union', A, C), 150, 1, '4');
expect('一部の辺が重なる 交差', run('intersect', A, C), 50, 1, '4');
expect('一部の辺が重なる 型抜き', run('subtract', A, C), 50, 1, '4');
expect('一部の辺が重なる 中マド', run('exclude', A, C), 100, 2, '4,4');
expect('T字に接する 合体', run('union', A, sq(10, 2, 5, 5)), 125, 1, '8');
expect('3つが並ぶ 合体', run('union', A, C, sq(10, 0, 10, 10)), 200, 1, '4');

// a cut that leaves two pieces, then breaking it apart
const bar = run('subtract', sq(0, 0, 30, 10), sq(10, -5, 10, 20));
expect('棒を型抜きで2つに', bar, 200, 2, '4,4');
check(K.ringPieces(ringsOf(bar)).length === 2, 'ばらばらにすると2片');

// self-intersecting bow tie
const bow = run('fragment', [[0, 0], [10, 10], [10, 0], [0, 10]]);
check(bow.length === 1 && K.ringPieces(bow[0].rings).length === 2 && near(area(bow), 50), '交差する多角形（蝶ネクタイ）を分割すると2つの三角形');

// curves: circle and square. Coordinates are snapped to 1/256 px, so areas
// move by at most about perimeter × 0.003.
const circle = { shape: 'ellipse', w: 20, h: 20 }, cr = K.shapeRings(circle, 0.01)[0], ca = Math.abs(K.polyArea(cr));
expect('円と四角 交差（4分の1円）', run('intersect', cr, sq(0, 0, 20, 20)), ca / 4, 1, null, 0.1);
expect('円から四角を型抜き', run('subtract', cr, sq(0, 0, 20, 20)), ca * 3 / 4, 1, null, 0.1);
check(near(ca, Math.PI * 100, 0.5), '円の折れ線近似の面積は πr² に近い');

// tiny offsets far from the origin (snapping)
const big = run('union', sq(1000.001, 1000.002, 500, 300), sq(1000.003, 1300, 500, 300));
check(near(area(big), 300000, 2), 'ページ座標の大きな値と微小なずれ（合体）');

// randomised: the modes must agree (|A∪B| = |A| + |B| − |A∩B| and so on)
const rnd = K.mulberry32(20261126);
const perim = p => p.reduce((s, q, i) => s + Math.hypot(p[(i + 1) % p.length][0] - q[0], p[(i + 1) % p.length][1] - q[1]), 0);
function randPoly(tangled) {
  const t = rnd();
  if (t < 0.25) { const ox = rnd() * 60, oy = rnd() * 60; return K.shapeRings({ shape: 'ellipse', w: 20 + rnd() * 80, h: 20 + rnd() * 80 }, 0.2)[0].map(q => [q[0] + ox + (tangled ? rnd() * 30 : 0), q[1] + oy + (tangled ? rnd() * 30 : 0)]); }
  if (t < 0.4) return sq(Math.round(rnd() * 60), Math.round(rnd() * 60), Math.round(10 + rnd() * 60), Math.round(10 + rnd() * 60));
  // star-shaped around c with every angular gap under 180°, so it is a simple polygon
  const n = 3 + Math.floor(rnd() * 7), c = [rnd() * 80, rnd() * 80], r = 15 + rnd() * 50;
  const pts = Array.from({ length: n }, (_, i) => (i + rnd() * 0.45) / n * Math.PI * 2).map(a => [c[0] + Math.cos(a) * r * (0.6 + rnd() * 0.4), c[1] + Math.sin(a) * r * (0.6 + rnd() * 0.4)]);
  return tangled ? pts.sort(() => rnd() - 0.5) : pts;
}
let bad = 0;
for (let i = 0; i < 600; i++) {
  const P = randPoly(false), Q = randPoly(false), aP = Math.abs(K.polyArea(P)), aQ = Math.abs(K.polyArea(Q));
  const u = area(run('union', P, Q)), n = area(run('intersect', P, Q)), s = area(run('subtract', P, Q)), x = area(run('exclude', P, Q)), f = area(run('fragment', P, Q));
  const tol = 0.003 * (perim(P) + perim(Q)) + 1e-3;
  if (!(near(u, aP + aQ - n, tol) && near(s, aP - n, tol) && near(x, u - n, 1e-3) && near(f, u, 1e-3) && n <= Math.min(aP, aQ) + tol)) { bad++; if (bad < 4) console.error('  mismatch', { aP, aQ, u, n, s, x, f }); }
}
check(bad === 0, `ランダムな単純多角形600組で、合体・交差・型抜き・中マド・分割の面積が矛盾しない（不一致 ${bad}）`);
bad = 0;
for (let i = 0; i < 300; i++) {
  const P = randPoly(true), Q = randPoly(true);
  const u = area(run('union', P, Q)), n = area(run('intersect', P, Q)), s = area(run('subtract', P, Q)), s2 = area(run('subtract', Q, P)), x = area(run('exclude', P, Q)), f = area(run('fragment', P, Q));
  if (!(near(x, u - n, 1e-3) && near(f, u, 1e-3) && near(u, s + s2 + n, 0.05))) { bad++; if (bad < 4) console.error('  mismatch', { u, n, s, s2, x, f }); }
}
check(bad === 0, `自己交差するランダムな多角形300組でも各モードの面積が矛盾しない（不一致 ${bad}）`);

// combineShapes on page items: two 200×100 rectangles, both turned 30°, 100px apart.
// In their own frame the offset is (100cos30°, -100sin30°) = (86.6, -50).
const page = K.project.pages[0];
const s1 = K.makeShape('rect', 500, 500, { w: 200, h: 100, rot: 30, fill: '#ff0000' }), s2 = K.makeShape('rect', 600, 500, { w: 200, h: 100, rot: 30, fill: '#0000ff' });
const txt = K.makeText(100, 100);
page.items.push(txt, s1, s2);
const dx = 100 * Math.cos(Math.PI / 6), overlapArea = (200 - dx) * (100 - 50);
const res = K.combineShapes(page, [s2, s1], 'union');
check(res.length === 1 && page.items.length === 2 && page.items[1] === res[0] && res[0].fill === '#ff0000', '合体: 後ろの図形の色を引き継ぎ、その重なり順に入る');
check(near(res[0].rot, 30) && near(res[0].w, 200 + dx, 0.02) && near(res[0].h, 150, 0.02), `同じ回転の図形を合体すると回転が保たれ、その向きの枠になる（${res[0].w.toFixed(2)}×${res[0].h.toFixed(2)}）`);
const ringArea = it => K.shapeRings(it).reduce((s, r) => s + K.polyArea(r), 0);
check(near(ringArea(res[0]), 40000 - overlapArea, 0.5), `合体した図形の面積が正しい（${ringArea(res[0]).toFixed(2)} / ${(40000 - overlapArea).toFixed(2)}）`);
const p1 = K.makeShape('ellipse', 300, 300, { w: 100, h: 100 }), p2 = K.makeShape('ellipse', 380, 300, { w: 100, h: 100 });
page.items.push(p1, p2);
const frag = K.combineShapes(page, [p1, p2], 'fragment');
check(frag.length === 3 && frag.every(it => it.type === 'shape' && it.shape === 'path'), '2つの円を分割すると3つの図形');
check(K.combineShapes(page, [frag[0], frag[2]], 'intersect').length === 0 && page.items.includes(frag[0]), '重ならない図形の交差は空で、元の図形は残る');
check(K.combineShapes(page, [frag[0]], 'union') === null, '合体には図形が2つ以上必要');
const turned = [K.makeShape('rect', 0, 0, { w: 10, h: 10, rot: 10 }), K.makeShape('ellipse', 5, 5, { w: 10, h: 10 })];
page.items.push(...turned);
check(K.combineShapes(page, turned, 'union')[0].rot === 0, '回転がそろっていない図形の結果は回転0');

// shapes survive a save / load round trip
const o = JSON.parse(JSON.stringify(E.projectData()));
const P2 = K.normalizeProject(o), shapes = P2.pages[0].items.filter(it => it.type === 'shape');
check(shapes.length === page.items.filter(it => it.type === 'shape').length && shapes.every(it => it.shape === 'path' && it.rings.length), '保存して読み込んでも図形が残る');
check(K.normalizeItem({ type: 'shape', shape: 'path', rings: [[[0, 0], [1, 1]]] }) === null, '頂点が足りない自由形は読み込まない');
const fixed = K.normalizeItem({ type: 'shape', shape: 'star', w: 'x', sides: 'y' });
check(fixed && fixed.w > 0 && fixed.sides === 5, '数値でない項目は既定値に戻す');

if (failed) { console.error(`${failed} 件失敗`); process.exit(1); }
console.log('geometry all ok');
