/* ================= small UI helpers ================= */
let toastTimer = 0;
function toast(msg, ms = 3000) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms); }
function busy(on, msg) { if (msg) $('#busyText').textContent = msg; $('#busy').hidden = !on; }
function closeDrawers() { document.body.classList.remove('show-left', 'show-right'); }
const fmtNum = v => (Math.round(v * 100) / 100).toString();
function changed(o) { if (o && o.silent) return; requestRender(); scheduleCommit(); }
function field(label, ctrl) { const id = ctrl && ctrl.id ? ctrl.id : (ctrl && ctrl.querySelector ? (ctrl.querySelector('input,select,textarea') || {}).id : null); return el('div', { class: 'field' }, el('label', { for: id || null, text: label }), ctrl); }
function sec(title, ...kids) { return el('section', { class: 'psec' }, title ? el('h3', { text: title }) : null, ...kids); }
function note(t) { return el('p', { class: 'note', text: t }); }
function head(t, sub) { return el('div', { class: 'phead' }, el('h2', { text: t }), sub ? el('p', { text: sub }) : null); }
function num(obj, key, o = {}) {
  const i = el('input', { type: 'number', id: 'c-' + (o.id || key), step: String(o.step || 1), inputmode: 'decimal' });
  if (o.min != null) i.min = String(o.min); if (o.max != null) i.max = String(o.max);
  i.value = fmtNum(obj[key] ?? 0);
  i.addEventListener('input', () => { const v = parseFloat(i.value); if (!Number.isFinite(v)) return; obj[key] = clamp(v, o.min ?? -1e9, o.max ?? 1e9); if (o.on) o.on(); changed(o); });
  i.addEventListener('change', () => { i.value = fmtNum(obj[key] ?? 0); });
  return i;
}
function rangeCtl(get, set, o) {
  const id = 'c-' + o.id, r = el('input', { type: 'range', id, min: String(o.min), max: String(o.max), step: String(o.step || 1) }), out = el('output', { for: id });
  const show = v => { out.textContent = o.pct ? Math.round(v * 100) + '%' : (Math.round(v * 100) / 100) + (o.unit || ''); };
  r.value = String(get()); show(get());
  r.addEventListener('input', () => { const v = parseFloat(r.value); set(v); show(v); if (o.on) o.on(); changed(o); });
  const w = el('div', { class: 'rng' }, r, out); w.id = id + '-w';
  return w;
}
function range(obj, key, o) { return rangeCtl(() => obj[key] ?? 0, v => { obj[key] = v; }, Object.assign({ id: key }, o)); }
function color(obj, key, o = {}) {
  const i = el('input', { type: 'color', id: 'c-' + (o.id || key) });
  i.value = /^#[0-9a-f]{6}$/i.test(obj[key] || '') ? obj[key] : (o.def || '#000000');
  i.addEventListener('input', () => { obj[key] = i.value; if (o.on) o.on(); changed(o); });
  return i;
}
function chk(obj, key, label, o = {}) {
  const i = el('input', { type: 'checkbox', id: 'c-' + (o.id || key) });
  i.checked = !!obj[key];
  i.addEventListener('change', () => { obj[key] = i.checked; if (o.on) o.on(); changed(o); if (o.rebuild) buildProps(); });
  return el('label', { class: 'chk', for: i.id }, i, el('span', { text: label }));
}
function seg(obj, key, options, o = {}) {
  const g = el('div', { class: 'seg', role: 'group', id: 'c-' + (o.id || key) });
  for (const [v, l] of options) {
    const b = el('button', { type: 'button', class: obj[key] === v ? 'on' : '', 'aria-pressed': String(obj[key] === v), text: l });
    b.addEventListener('click', () => {
      obj[key] = v;
      for (const x of g.children) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }
      if (o.on) o.on(); changed(o); if (o.rebuild) buildProps();
    });
    g.append(b);
  }
  return g;
}
function area(obj, key, o = {}) {
  const t = el('textarea', { id: 'c-' + (o.id || key), rows: o.rows || 3, spellcheck: 'false' });
  t.value = obj[key] || '';
  t.addEventListener('input', () => { obj[key] = t.value; if (o.on) o.on(); changed(o); });
  return t;
}
function btn(label, fn, o = {}) {
  const b = el('button', { type: 'button', class: 'pb' + (o.cls ? ' ' + o.cls : ''), title: o.title || null, 'aria-label': !label && o.title ? o.title : null }, o.icon ? icon(o.icon) : null, label ? el('span', { text: label }) : null);
  b.addEventListener('click', fn);
  return b;
}
function syncSizeFields() { buildProps(); }
function syncZoomField() {
  const w = $('#c-zoom-w'), s = selectedObj();
  if (!w || !s || s.kind !== 'panel' || !s.obj.img) return;
  const a = project.assets[s.obj.img.asset]; if (!a) return;
  const v = Math.round(s.obj.img.s / coverScale(s.obj, a) * 100);
  w.querySelector('input').value = String(v); w.querySelector('output').textContent = v + '%';
}

/* ================= properties panel ================= */
function buildProps() {
  const root = $('#props');
  if (!root || !project) return;
  const keep = root.scrollTop, selId = ed.sel;
  root.textContent = '';
  const s = selectedObj();
  if (!s) propsPage(root);
  else if (s.kind === 'multi') propsMulti(root, s.objs);
  else if (s.kind === 'panel') propsPanel(root, s.obj);
  else if (s.obj.type === 'bubble') propsBubble(root, s.obj);
  else if (s.obj.type === 'text') propsText(root, s.obj);
  else if (s.obj.type === 'effect') propsEffect(root, s.obj);
  else if (s.obj.type === 'image') propsImageItem(root, s.obj);
  else if (s.obj.type === 'shape') propsShape(root, s.obj);
  if (root.dataset.sel === String(selId)) root.scrollTop = keep;
  root.dataset.sel = String(selId);
}
function propsPage(root) {
  const pr = project.page, L = project.layout, page = curPage();
  root.append(head(`${ed.pi + 1}ページ目`, '何も選んでいないときは、ページと作品の設定を表示します'));
  root.append(sec('コマ割り',
    btn('テンプレートから選ぶ', openTemplates, { icon: 'template', cls: 'wide strong' }),
    page.tpl != null ? btn('余白・間隔を反映して作り直す', () => { applyTemplate(curPage(), curPage().tpl); commit(); buildProps(); }, { cls: 'wide', title: '今のテンプレートを、下の余白と間隔で再適用します' }) : null,
    el('div', { class: 'two' }, field('上の余白', num(L, 'mt', { min: 0 })), field('下の余白', num(L, 'mb', { min: 0 }))),
    el('div', { class: 'two' }, field('左の余白', num(L, 'ml', { min: 0 })), field('右の余白', num(L, 'mr', { min: 0 }))),
    el('div', { class: 'two' }, field('左右のコマ間', num(L, 'gx', { min: 0 })), field('上下のコマ間', num(L, 'gy', { min: 0 }))),
    el('div', { class: 'two' }, field('枠線の太さ', num(L, 'bw', { min: 0, step: 0.5 })), field('枠線の色', color(L, 'bc'))),
    field('読み順', seg(L, 'dir', [['rtl', '右から左'], ['ltr', '左から右']])),
    note('余白と間隔は、次にテンプレートやコマ割りツールを使ったときに反映されます。単位はページのピクセルです。')));
  const sizeSel = el('select', { id: 'c-preset' }, PRESETS.map(p => el('option', { value: p.id, text: p.name, selected: p.id === pr.preset })));
  const wI = el('input', { type: 'number', id: 'c-pw', min: '200', max: '20000', value: String(pr.w) }), hI = el('input', { type: 'number', id: 'c-ph', min: '200', max: '20000', value: String(pr.h) });
  sizeSel.addEventListener('change', () => { const p = PRESETS.find(x => x.id === sizeSel.value); if (p && p.w) { wI.value = p.w; hI.value = p.h; } });
  root.append(sec('用紙サイズ（全ページ共通）',
    field('プリセット', sizeSel), el('div', { class: 'two' }, field('幅 px', wI), field('高さ px', hI)),
    btn('このサイズに変更', () => { const w = parseFloat(wI.value), h = parseFloat(hI.value); if (w >= 200 && h >= 200) setPageSize(w, h, sizeSel.value); else toast('幅と高さは200以上にしてください'); }, { cls: 'wide' }),
    note('書き出すときは、この比率のまま好きな解像度に拡大・縮小できます。')));
  root.append(sec('作品とページ',
    field('作品名', (() => { const i = el('input', { type: 'text', id: 'c-name', value: project.name }); i.addEventListener('input', () => { project.name = i.value; $('#projName').value = i.value; scheduleCommit(); }); return i; })()),
    field('ページの背景', color(page, 'bg', { def: '#ffffff' })),
    chk(ed, 'guides', '基本枠のガイド（水色の点線）を表示', { silent: true, on: requestRender }),
    chk(ed, 'numbers', 'コマの読み順番号を表示', { silent: true, on: requestRender }),
    multiModeChk()));
  root.append(sec('使い方',
    el('ul', { class: 'tips' },
      el('li', {}, el('b', { text: '画像' }), '：コマへドラッグ＆ドロップ、またはコマをダブルクリック。複数まとめてドロップすると空きコマへ読み順に入ります'),
      el('li', {}, el('b', { text: 'コマ割り' }), '：ツールを選んでコマの上をドラッグすると分割。選んだコマの角や辺をドラッグで変形（Altで単独）'),
      el('li', {}, el('b', { text: '吹き出し' }), '：ダブルクリックでセリフを編集。赤い丸をドラッグでしっぽの向き'),
      el('li', {}, el('b', { text: '重なり' }), '：背面のものは Alt+クリック か「レイヤー」タブで選べます'),
      el('li', {}, el('b', { text: '図形' }), '：左の「図形」から追加。Shift+クリックで複数選ぶと、合体・型抜きなどの結合や整列ができます'),
      el('li', {}, el('b', { text: 'ショートカット' }), '：Ctrl+Z 元に戻す／Ctrl+D 複製／Delete 削除／Space+ドラッグ 表示移動'))));
}
function imageAdjust(im) {
  return [
    chk(im, 'gray', 'グレースケール（白黒）', { id: 'gray' }),
    field('明るさ', range(im, 'bright', { min: 30, max: 200, unit: '%' })),
    field('コントラスト', range(im, 'contrast', { min: 30, max: 250, unit: '%' })),
    field('表現', seg(im, 'mode', [['normal', 'そのまま'], ['mono', '白黒2値'], ['halftone', '網点トーン']], { rebuild: true })),
    im.mode === 'mono' ? field('しきい値', range(im, 'thr', { min: 1, max: 254 })) : null,
    im.mode === 'halftone' ? field('網点の大きさ', range(im, 'dot', { min: 3, max: 60, step: 0.5 })) : null,
    btn('加工を元に戻す', () => { Object.assign(im, { gray: false, bright: 100, contrast: 100, mode: 'normal' }); changed(); buildProps(); }),
  ];
}
function propsPanel(root, pn) {
  const order = readingOrder(curPage().panels).indexOf(pn) + 1, im = pn.img, a = im && project.assets[im.asset], L = project.layout;
  root.append(head('コマ', `読み順で ${order} 番目のコマ`));
  if (im && a) {
    root.append(sec('画像',
      el('div', { class: 'imgrow' }, el('img', { src: libThumb(im.asset), alt: '' }), el('div', { class: 'imgname', text: a.name })),
      el('div', { class: 'btns' }, btn('差し替え', () => pickImageFor(pn.id), { icon: 'image' }), btn('外す', () => { pn.img = null; commit(); buildProps(); })),
      field('ズーム', rangeCtl(() => Math.round(im.s / coverScale(pn, a) * 100), v => { const s1 = v / 100 * coverScale(pn, a); im.s = s1; }, { id: 'zoom', min: 10, max: 400, unit: '%' })),
      field('回転', range(im, 'rot', { min: -180, max: 180, unit: '°' })),
      el('div', { class: 'btns' },
        btn('コマを埋める', () => { fitImage(pn, 'cover'); changed(); buildProps(); }),
        btn('全体を表示', () => { fitImage(pn, 'contain'); changed(); buildProps(); }),
        btn('左右反転', () => { im.fx = !im.fx; changed(); }),
        btn('上下反転', () => { im.fy = !im.fy; changed(); })),
      note('コマの中をドラッグで位置、ホイールで拡大縮小できます。')));
    root.append(sec('画像の加工', ...imageAdjust(im)));
  } else {
    root.append(sec('画像',
      note('このコマにはまだ画像がありません。'),
      btn('画像を選んで入れる', () => pickImageFor(pn.id), { icon: 'image', cls: 'wide strong' }),
      note('左の画像一覧をクリックしても、このコマに入ります。')));
  }
  const bwMode = pn.bw == null ? 'def' : pn.bw === 0 ? 'none' : 'custom';
  const st = { m: bwMode };
  root.append(sec('コマの見た目',
    field('背景色', color(pn, 'fill', { def: '#ffffff' })),
    field('枠線', seg(st, 'm', [['def', '標準'], ['none', 'なし'], ['custom', '指定']], { id: 'bwmode', silent: true, on: () => { pn.bw = st.m === 'def' ? null : st.m === 'none' ? 0 : (pn.bw || L.bw); commit(); requestRender(); buildProps(); } })),
    bwMode === 'custom' ? el('div', { class: 'two' }, field('太さ', num(pn, 'bw', { min: 0, step: 0.5 })), field('色', color(pn, 'bc', { def: L.bc }))) : null));
  root.append(sec('コマの操作',
    el('div', { class: 'btns' }, btn('上下に分割', () => quickSplit(pn, 'h'), { icon: 'splith' }), btn('左右に分割', () => quickSplit(pn, 'v'), { icon: 'splitv' })),
    el('div', { class: 'btns' }, btn('四角に戻す', () => { const b = polyBBox(pn.pts); pn.pts = rectPts(b.x, b.y, b.w, b.h); commit(); }), btn('前面へ', () => orderSel('top')), btn('背面へ', () => orderSel('bottom'))),
    el('div', { class: 'btns' }, btn('複製', duplicateSel, { icon: 'copy' }), btn('削除', deleteSel, { icon: 'trash', cls: 'danger' })),
    note('辺をドラッグすると隣のコマも一緒に動きます。Altを押しながらだとこのコマだけ。')));
}
function textSection(it, refit) {
  return [
    field('方向', seg(it, 'vertical', [[true, '縦書き'], [false, '横書き']], { on: refit })),
    field('フォント', fontSelect(it, refit)),
    el('div', { class: 'two' }, field('文字サイズ', num(it, 'size', { min: 2, max: 4000, on: refit })), field('文字色', color(it, 'color'))),
    chk(it, 'bold', '太字', { on: refit }),
    field('行間', range(it, 'lh', { min: 0.9, max: 3, step: 0.05, on: refit })),
    field('字間', range(it, 'ls', { min: -0.3, max: 1, step: 0.02, on: refit })),
    field('揃え', seg(it, 'align', [['auto', '自動'], ['start', it.vertical ? '上' : '左'], ['center', '中央'], ['end', it.vertical ? '下' : '右']])),
  ];
}
function fontSelect(it, on) {
  const wrap = el('div', { style: 'display:grid;gap:6px' }), s = el('select', { id: 'c-font' });
  for (const f of FONTS) s.append(el('option', { value: f.id, text: f.name }));
  if (project.fonts.length) { const og = el('optgroup', { label: '読み込んだフォント' }); for (const f of project.fonts) og.append(el('option', { value: 'custom:' + f.name, text: f.name })); s.append(og); }
  s.append(el('option', { value: '__other', text: 'PCのフォント名を入力…' }));
  const known = !!FONT_MAP[it.font] || project.fonts.some(f => 'custom:' + f.name === it.font);
  s.value = known ? it.font : '__other';
  const inp = el('input', { type: 'text', id: 'c-fontname', placeholder: '例：UD Digi Kyokasho NK-B', value: !known && String(it.font).startsWith('custom:') ? it.font.slice(7) : '' });
  inp.hidden = s.value !== '__other';
  const after = () => { layoutCache.clear(); if (on) on(); changed(); };
  s.addEventListener('change', () => { if (s.value === '__other') { inp.hidden = false; inp.focus(); return; } inp.hidden = true; it.font = s.value; after(); });
  inp.addEventListener('input', () => { const v = inp.value.trim(); if (v) { it.font = 'custom:' + v; after(); } });
  wrap.append(s, inp, btn('フォントファイルを読み込む', () => pickFont(it.id), { title: '.ttf / .otf / .woff ファイルを作品に取り込みます' }));
  return wrap;
}
function shapePicker(it, on) {
  const g = el('div', { class: 'shapes', id: 'c-shape' });
  for (const [v, l] of SHAPES) {
    const c = el('canvas', { width: 92, height: 60 }), x = c.getContext('2d');
    const demo = { shape: v, w: 76, h: 46, seed: 11 };
    x.translate(46, 30); x.lineJoin = 'round'; x.lineWidth = 3; x.strokeStyle = '#141414'; x.fillStyle = '#ffffff';
    const p = bubblePath(demo); x.stroke(p); x.fill(p);
    const b = el('button', { type: 'button', class: 'shape' + (it.shape === v ? ' on' : ''), 'aria-pressed': String(it.shape === v), title: l }, c, el('span', { text: l }));
    b.addEventListener('click', () => { it.shape = v; for (const y of g.children) { y.classList.toggle('on', y === b); y.setAttribute('aria-pressed', String(y === b)); } if (on) on(); changed(); });
    g.append(b);
  }
  return g;
}
/* touch screens have no Shift key: this makes every tap add to (or remove from) the selection */
function multiModeChk() { return chk(ed, 'multiMode', '複数選択モード（タップで選択に追加・解除）', { id: 'multimode', silent: true }); }
function commonProps(root, it) {
  const clipSt = { on: !!it.clip };
  root.append(sec('配置',
    field('不透明度', range(it, 'opacity', { min: 0.05, max: 1, step: 0.05, pct: true })),
    field('回転', range(it, 'rot', { min: -180, max: 180, unit: '°' })),
    chk(clipSt, 'on', 'コマの内側だけに表示する', { id: 'clip', silent: true, on: () => {
      if (clipSt.on) { const pn = panelAtPoint(curPage(), [it.x, it.y]); if (pn) it.clip = pn.id; else { toast('中心をコマの上に置いてから選んでください'); clipSt.on = false; } }
      else it.clip = null;
      commit(); requestRender(); buildProps();
    } }),
    it.clip ? btn('下のコマを選ぶ', () => select(it.clip), { title: 'この効果が入っているコマを選択します' }) : null,
    chk(it, 'locked', 'ロック（キャンバスでは選ばれなくなります）', { on: () => { renderLayers(); requestRender(); } }),
    multiModeChk(),
    el('div', { class: 'btns' }, btn('最前面', () => orderSel('top')), btn('前へ', () => orderSel('up')), btn('後ろへ', () => orderSel('down')), btn('最背面', () => orderSel('bottom'))),
    el('div', { class: 'btns' }, btn('複製', duplicateSel, { icon: 'copy' }), btn('削除', deleteSel, { icon: 'trash', cls: 'danger' }))));
}
function propsBubble(root, it) {
  const refit = () => { if (it.autoFit) fitBubble(it); };
  root.append(head('吹き出し'));
  root.append(sec('セリフ', area(it, 'text', { id: 'text', rows: 4, on: () => { refit(); layersSoon(); } }), note('改行で列（縦書き）や行（横書き）が変わります。キャンバスでダブルクリックしても編集できます。')));
  root.append(sec('形', shapePicker(it, refit),
    ['cloud', 'spike', 'burst', 'jagged', 'wavy', 'urchin'].includes(it.shape) ? btn('ギザギザの形を変える', () => { it.seed = newSeed(); changed(); }) : null));
  root.append(sec('文字', ...textSection(it, refit)));
  root.append(sec('線と塗り',
    el('div', { class: 'two' }, field('塗り', color(it, 'fill', { def: '#ffffff' })), field('線', color(it, 'stroke'))),
    field('線の太さ', range(it, 'sw', { min: 0, max: Math.max(24, Math.ceil(it.sw * 3)), step: 0.5 })),
    chk(it, 'dash', '点線にする（心の声など）'),
    chk(it, 'autoFit', 'セリフに合わせて大きさを自動調整', { on: refit, rebuild: true }),
    it.autoFit ? null : el('div', { class: 'two' }, field('幅', num(it, 'w', { min: 10 })), field('高さ', num(it, 'h', { min: 10 })))));
  const T = it.tail;
  root.append(sec('しっぽ',
    chk(T, 'on', 'しっぽを付ける', { id: 'tailon', on: () => { if (T.on && V.len([T.x, T.y]) < Math.max(it.w, it.h) * 0.55) { T.x = it.w * 0.16; T.y = it.h / 2 + U() * 6; } }, rebuild: true }),
    T.on ? field('種類', seg(T, 'style', [['straight', '直線'], ['curve', '曲線'], ['thought', 'もくもく']], { id: 'tailstyle', rebuild: true })) : null,
    T.on && T.style !== 'thought' ? field('根元の太さ', range(T, 'w', { id: 'tailw', min: 0.05, max: 0.7, step: 0.01 })) : null,
    T.on && T.style === 'curve' ? field('曲がり', range(T, 'bend', { id: 'tailbend', min: -1, max: 1, step: 0.05 })) : null,
    T.on ? note('しっぽの先（赤い丸）をドラッグして向きと長さを変えられます。') : null));
  commonProps(root, it);
}
function propsText(root, it) {
  root.append(head(it.font === 'dela' || it.sw2 > 0 ? '効果音・描き文字' : 'テキスト'));
  root.append(sec('文字列', area(it, 'text', { id: 'text', rows: 3, on: layersSoon })));
  root.append(sec('文字', ...textSection(it, null)));
  root.append(sec('フチ',
    el('div', { class: 'two' }, field('内フチの色', color(it, 'sc', { def: '#ffffff' })), field('内フチの太さ', num(it, 'sw', { min: 0, step: 0.5 }))),
    el('div', { class: 'two' }, field('外フチの色', color(it, 'sc2', { def: '#111111' })), field('外フチの太さ', num(it, 'sw2', { min: 0, step: 0.5 }))),
    field('背景', seg(it, 'bg', [['', 'なし'], ['#ffffff', '白'], ['#111111', '黒']])),
    note('四隅のハンドルで文字サイズごと拡大縮小できます。')));
  commonProps(root, it);
}
function propsEffect(root, it) {
  const names = { focus: '集中線', speed: '流線（スピード線）', flash: 'ウニフラッシュ', tone: 'スクリーントーン' };
  root.append(head(names[it.kind]));
  const reroll = btn('線を作り直す', () => { it.seed = newSeed(); changed(); });
  const bgSeg = () => field('背景', seg(it, 'bg', [['', 'なし'], ['#ffffff', '白'], ['#111111', '黒']]));
  if (it.kind === 'focus') root.append(sec('線',
    field('本数', range(it, 'count', { min: 20, max: 600 })), field('太さ', range(it, 'thick', { min: 1, max: Math.max(60, Math.ceil(it.thick * 3)), step: 0.5 })),
    field('中心の空き', range(it, 'ir', { min: 0.05, max: 0.95, step: 0.01, pct: true })), field('ばらつき', range(it, 'jitter', { min: 0, max: 1, step: 0.01, pct: true })),
    el('div', { class: 'two' }, field('線の色', color(it, 'color')), field('　', reroll)), bgSeg(),
    btn('中心をまん中に戻す', () => { it.fx = 0; it.fy = 0; changed(); }), note('赤い丸をドラッグで集中する位置を動かせます。')));
  else if (it.kind === 'speed') root.append(sec('線',
    field('本数', range(it, 'count', { min: 10, max: 400 })), field('太さ', range(it, 'thick', { min: 1, max: Math.max(60, Math.ceil(it.thick * 3)), step: 0.5 })),
    field('最短の長さ', range(it, 'lmin', { min: 0.05, max: 1, step: 0.01, pct: true })), field('最長の長さ', range(it, 'lmax', { min: 0.1, max: 1.2, step: 0.01, pct: true })),
    field('先細り', seg(it, 'taper', [['one', '片側'], ['both', '両側']])), field('中央の空き', range(it, 'gapc', { min: 0, max: 0.9, step: 0.01, pct: true })),
    el('div', { class: 'two' }, field('線の色', color(it, 'color')), field('　', reroll)), bgSeg(),
    note('「回転」で線の向きを変えられます。')));
  else if (it.kind === 'flash') root.append(sec('トゲ',
    field('本数', range(it, 'count', { min: 12, max: 300 })), field('太さ', range(it, 'thick', { min: 1, max: Math.max(80, Math.ceil(it.thick * 3)), step: 0.5 })),
    field('中心の大きさ', range(it, 'ir', { min: 0.05, max: 0.9, step: 0.01, pct: true })), field('長さのばらつき', range(it, 'lmin', { min: 0.05, max: 1, step: 0.01, pct: true })),
    el('div', { class: 'two' }, field('塗り', color(it, 'fill', { def: '#ffffff' })), field('線', color(it, 'color'))),
    field('線の太さ', range(it, 'sw', { min: 0, max: 20, step: 0.5 })), reroll));
  else if (it.kind === 'tone') root.append(sec('トーン',
    field('形', seg(it, 'shape', [['rect', '四角'], ['ellipse', '楕円']])),
    field('模様', seg(it, 'pattern', [['dots', '網点'], ['grad', 'グラデ'], ['lines', '斜線'], ['cross', '格子'], ['solid', 'ベタ']], { rebuild: true })),
    it.pattern !== 'solid' ? field('目の細かさ', range(it, 'pitch', { min: 3, max: 80, step: 0.5 })) : null,
    it.pattern !== 'solid' ? field(it.pattern === 'grad' ? '濃さ（始点）' : '濃さ', range(it, 'dens', { min: 0.02, max: 1, step: 0.01, pct: true })) : null,
    it.pattern === 'grad' ? field('濃さ（終点）', range(it, 'd2', { min: 0, max: 1, step: 0.01, pct: true })) : null,
    it.pattern === 'grad' ? field('グラデの向き', range(it, 'gang', { min: -180, max: 180, unit: '°' })) : null,
    it.pattern !== 'solid' ? field('網の角度', range(it, 'angle', { min: 0, max: 180, unit: '°' })) : null,
    field('色', color(it, 'color')), note('白にすると「白トーン（ハイライト）」になります。')));
  root.append(sec('大きさ',
    el('div', { class: 'two' }, field('幅', num(it, 'w', { min: 10 })), field('高さ', num(it, 'h', { min: 10 }))),
    it.clip ? btn('コマいっぱいに合わせる', () => { const pn = findPanel(it.clip); if (!pn) return; const b = polyBBox(pn.pts), pad = (pn.bw ?? project.layout.bw); it.x = b.cx; it.y = b.cy; it.w = b.w + pad * 2; it.h = b.h + pad * 2; it.rot = 0; commit(); buildProps(); }) : null));
  commonProps(root, it);
}
/* ---- shapes ---- */
let lastFill = '#ffffff', lastStroke = '#111111';
function figurePicker(it) {
  const g = el('div', { class: 'shapes four', id: 'c-figure' }), r = it.radius / Math.max(1, Math.min(it.w, it.h));
  for (const [v, l] of SHAPE_KINDS) {
    if (v === 'path') continue;
    const ar = v === 'polygon' || v === 'star' ? shapeAspect({ shape: v, sides: it.sides, inner: it.inner }) : v === 'rect' ? 1.45 : 1.3;
    const h = 44, w = Math.min(84, h * ar), c = el('canvas', { width: 92, height: 60 }), x = c.getContext('2d');
    x.translate(46, 30);
    drawShape(x, { shape: v, w, h, sides: it.sides, inner: it.inner, radius: v === 'rect' ? r * Math.min(w, h) : 0, fill: '#ffffff', stroke: '#141414', sw: 3, pattern: 'solid', line: 'solid', join: 'miter', salign: 'center' });
    const b = el('button', { type: 'button', class: 'shape' + (it.shape === v ? ' on' : ''), 'aria-pressed': String(it.shape === v), title: l }, c, el('span', { text: l }));
    b.addEventListener('click', () => { if (it.shape === v) return; it.shape = v; changed(); buildProps(); });
    g.append(b);
  }
  return g;
}
function toneFields(it) {
  return [
    field('模様', seg(it, 'pattern', [['dots', '網点'], ['grad', 'グラデ'], ['lines', '斜線'], ['cross', '格子']], { rebuild: true })),
    field('目の細かさ', range(it, 'pitch', { min: 3, max: 80, step: 0.5 })),
    field(it.pattern === 'grad' ? '濃さ（始点）' : '濃さ', range(it, 'dens', { min: 0.02, max: 1, step: 0.01, pct: true })),
    it.pattern === 'grad' ? field('濃さ（終点）', range(it, 'd2', { min: 0, max: 1, step: 0.01, pct: true })) : null,
    it.pattern === 'grad' ? field('グラデの向き', range(it, 'gang', { min: -180, max: 180, unit: '°' })) : null,
    field('網の角度', range(it, 'angle', { min: 0, max: 180, unit: '°' })),
  ];
}
function propsShape(root, it) {
  const editing = vEditing(it), path = it.shape === 'path', pieces = shapePieceCount(it);
  const verts = path ? shapeRings(it).reduce((n, r) => n + r.length, 0) : 0;
  root.append(head(shapeName(it), path ? '頂点 ' + verts + '個' + (pieces > 1 ? '・' + pieces + 'つの部分' : '') : '図形'));
  const title = root.querySelector('.phead h2'), retitle = () => { title.textContent = shapeName(it); };
  root.append(sec('形',
    path ? note('クリックで描いた形や、結合してできた形です。頂点を動かして形を変えられます。') : figurePicker(it),
    it.shape === 'rect' ? field('角の丸み', range(it, 'radius', { min: 0, max: Math.max(1, Math.floor(Math.min(it.w, it.h) / 2)), step: 0.5, on: retitle })) : null,
    it.shape === 'polygon' ? field('角の数', range(it, 'sides', { min: 3, max: 12, on: retitle })) : null,
    it.shape === 'star' ? field('トゲの数', range(it, 'sides', { min: 3, max: 24 })) : null,
    it.shape === 'star' ? field('へこみ', range(it, 'inner', { min: 0.1, max: 0.95, step: 0.01, pct: true })) : null,
    el('div', { class: 'btns' },
      path ? null : btn('縦横比をそろえる', () => { const a = Math.sqrt(shapeAspect(it)), s = Math.sqrt(it.w * it.h); it.w = round(s * a, 10); it.h = round(s / a, 10); commit(); requestRender(); buildProps(); }, { title: '正方形・正円・正多角形の形に戻します（面積はそのまま）' }),
      btn(editing ? '頂点の編集を終える' : '頂点を編集', () => toggleVertexEdit(it), { icon: 'vertex', cls: editing ? 'strong' : '' }),
      pieces > 1 ? btn('ばらばらにする', () => combineSel('fragment'), { icon: 'cb-fragment', title: '離れている部分を、別々の図形に分けます' }) : null),
    editing ? note('頂点をドラッグで移動、辺の中央の○をドラッグで頂点を追加、Alt+クリックかダブルクリックで頂点を削除。Escで終わります。')
      : path ? null : note('「頂点を編集」を押すと、頂点を自由に動かせる「自由形」に変換します。')));
  const fm = { m: !it.fill || it.fill === 'none' ? 'none' : TONE_PATTERNS.includes(it.pattern) ? 'tone' : 'solid' };
  root.append(sec('塗り',
    field('塗り', seg(fm, 'm', [['none', 'なし'], ['solid', 'ベタ'], ['tone', 'トーン']], { id: 'fillmode', silent: true, on: () => {
      if (it.fill && it.fill !== 'none') lastFill = it.fill;
      if (fm.m === 'none') it.fill = '';
      else if (fm.m === 'solid') { it.fill = it.fill || lastFill || '#ffffff'; it.pattern = 'solid'; }
      else { it.fill = !it.fill || /^#f{6}$/i.test(it.fill) ? '#111111' : it.fill; if (!TONE_PATTERNS.includes(it.pattern)) it.pattern = 'dots'; }
      commit(); requestRender(); buildProps();
    } })),
    fm.m === 'none' ? null : field(fm.m === 'tone' ? 'トーンの色' : '色', color(it, 'fill', { def: '#ffffff' })),
    ...(fm.m === 'tone' ? toneFields(it) : [])));
  const sm = { m: it.stroke && it.stroke !== 'none' && it.sw > 0 ? 'on' : 'none' }, on = sm.m === 'on';
  root.append(sec('線',
    field('線', seg(sm, 'm', [['none', 'なし'], ['on', 'あり']], { id: 'strokemode', silent: true, on: () => {
      if (sm.m === 'none') { if (it.stroke && it.stroke !== 'none') lastStroke = it.stroke; it.stroke = ''; }
      else { it.stroke = it.stroke && it.stroke !== 'none' ? it.stroke : lastStroke || '#111111'; if (!(it.sw > 0)) it.sw = Math.max(1, Math.round(0.25 * U() * 2) / 2); }
      commit(); requestRender(); buildProps();
    } })),
    on ? el('div', { class: 'two' }, field('色', color(it, 'stroke', { id: 'scolor', def: '#111111' })), field('太さ', num(it, 'sw', { min: 0.5, step: 0.5 }))) : null,
    on ? field('種類', seg(it, 'line', [['solid', '実線'], ['dashed', '破線'], ['dotted', '点線']])) : null,
    on ? field('角の形', seg(it, 'join', [['miter', 'とがる'], ['round', '丸い'], ['bevel', '面取り']])) : null,
    on ? field('線の位置', seg(it, 'salign', [['center', '中央'], ['inside', '内側'], ['outside', '外側']])) : null));
  root.append(sec('大きさ',
    el('div', { class: 'two' }, field('幅', num(it, 'w', { min: 1 })), field('高さ', num(it, 'h', { min: 1 }))),
    note('Shift+クリックで図形を2つ以上選ぶと、合体・型抜き・交差・中マド・分割ができます。')));
  commonProps(root, it);
}
const COMBINE_HELP = { union: '重ねた図形を1つにまとめます', subtract: 'いちばん後ろの図形から、前にある図形の形をくり抜きます', intersect: 'すべての図形が重なっている部分だけを残します', exclude: '重なっている部分をくり抜きます（中マド）', fragment: '重なりの境目で、ばらばらの図形に分けます' };
function propsMulti(root, objs) {
  const shapes = objs.filter(it => it.type === 'shape');
  root.append(head(objs.length + '個を選択中', 'Shift+クリックで選択に追加・解除できます'));
  root.append(sec('図形の結合',
    shapes.length >= 2 ? el('div', { class: 'combos' }, COMBINE_MODES.map(([m, l]) => btn(l, () => combineSel(m), { icon: 'cb-' + m, title: COMBINE_HELP[m] }))) : null,
    note(shapes.length >= 2 ? '結果は、いちばん後ろの図形の塗りと線を引き継ぎます（分割は、各部分でいちばん前にあった図形）。' + (shapes.length < objs.length ? '図形以外は結合されません。' : '')
      : '図形を2つ以上選ぶと、合体・型抜き・交差・中マド・分割ができます。')));
  root.append(sec('整列',
    el('div', { class: 'btns' }, [['left', '左揃え'], ['hcenter', '左右中央揃え'], ['right', '右揃え'], ['top', '上揃え'], ['vcenter', '上下中央揃え'], ['bottom', '下揃え']].map(([w, t]) => btn('', () => alignSel(w), { icon: 'al-' + w, cls: 'icon', title: t })))));
  root.append(sec('操作',
    el('div', { class: 'btns' }, btn('最前面', () => orderSel('top')), btn('前へ', () => orderSel('up')), btn('後ろへ', () => orderSel('down')), btn('最背面', () => orderSel('bottom'))),
    el('div', { class: 'btns' }, btn('複製', duplicateSel, { icon: 'copy' }), btn('削除', deleteSel, { icon: 'trash', cls: 'danger' })),
    multiModeChk()));
}
function propsImageItem(root, it) {
  const a = project.assets[it.asset];
  root.append(head('画像（フリー配置）', 'コマの枠を飛び出す人物などに'));
  root.append(sec('画像',
    a ? el('div', { class: 'imgrow' }, el('img', { src: libThumb(it.asset), alt: '' }), el('div', { class: 'imgname', text: a.name })) : null,
    chk(it, 'keep', '縦横比を保って拡大縮小（Shiftで一時的に解除）', { silent: true }),
    el('div', { class: 'btns' },
      btn('元の比率に戻す', () => { if (!a) return; const s = Math.sqrt(it.w * it.h / (a.w * a.h)); it.w = a.w * s; it.h = a.h * s; changed(); buildProps(); }),
      btn('左右反転', () => { it.fx = !it.fx; changed(); }), btn('上下反転', () => { it.fy = !it.fy; changed(); })),
    el('div', { class: 'two' }, field('幅', num(it, 'w', { min: 10 })), field('高さ', num(it, 'h', { min: 10 })))));
  root.append(sec('画像の加工', ...imageAdjust(it)));
  commonProps(root, it);
}

/* ================= layers ================= */
let layersTimer = 0;
function layersSoon() { clearTimeout(layersTimer); layersTimer = setTimeout(renderLayers, 200); }
const EFFECT_NAMES = { focus: '集中線', speed: '流線', flash: 'ウニフラッシュ', tone: 'トーン' };
function itemLabel(it) {
  const t = s => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > 12 ? s.slice(0, 12) + '…' : s; };
  if (it.type === 'bubble') return '吹き出し「' + t(it.text) + '」';
  if (it.type === 'text') return 'テキスト「' + t(it.text) + '」';
  if (it.type === 'image') return '画像 ' + t(project.assets[it.asset] ? project.assets[it.asset].name : '');
  if (it.type === 'shape') return '図形 ' + shapeName(it);
  return EFFECT_NAMES[it.kind] || '効果';
}
function shapeIcon(it) { return it.shape === 'rect' ? (it.radius > 0 ? 'rrect' : 'rect') : it.shape === 'polygon' ? (Math.round(it.sides) === 3 ? 'triangle' : 'polygon') : it.shape === 'path' ? 'pen' : it.shape; }
function itemIcon(it) { return it.type === 'bubble' ? 'bubble' : it.type === 'text' ? (it.sw2 > 0 ? 'sfx' : 'text') : it.type === 'image' ? 'image' : it.type === 'shape' ? shapeIcon(it) : it.kind; }
function renderLayers() {
  clearTimeout(layersTimer);
  const root = $('#layers');
  if (!root || !project) return;
  root.textContent = '';
  const page = curPage(), chosen = new Set(selItems().map(x => x.id));
  root.append(el('div', { class: 'lhead', text: 'オブジェクト（上ほど手前・Shift+クリックで複数選択）' }));
  if (!page.items.length) root.append(note('まだありません。左のツールから吹き出しや効果を追加できます。'));
  for (let i = page.items.length - 1; i >= 0; i--) {
    const it = page.items[i], name = itemLabel(it);
    root.append(el('div', { class: 'lyr' + (chosen.has(it.id) ? ' on' : '') + (it.hidden ? ' off' : '') },
      el('button', { type: 'button', class: 'nm', title: name, onclick: ev => (ev.shiftKey || ev.ctrlKey || ev.metaKey || ed.multiMode ? toggleSel(it.id) : select(it.id)) }, icon(itemIcon(it)), el('span', { text: name }), it.clip ? el('small', { text: 'コマ内' }) : null),
      el('button', { type: 'button', class: 'ib', title: it.hidden ? '表示する' : '隠す', 'aria-label': it.hidden ? '表示する' : '隠す', onclick: () => { it.hidden = !it.hidden; commit(); renderLayers(); } }, icon(it.hidden ? 'eyeoff' : 'eye')),
      el('button', { type: 'button', class: 'ib', title: it.locked ? 'ロックを解除' : 'ロックする', 'aria-label': it.locked ? 'ロックを解除' : 'ロックする', onclick: () => { it.locked = !it.locked; commit(); renderLayers(); if (it.id === ed.sel) buildProps(); requestRender(); } }, icon(it.locked ? 'lock' : 'unlock'))));
  }
  root.append(el('div', { class: 'lhead', text: 'コマ（読み順）' }));
  readingOrder(page.panels).forEach((pn, i) => {
    root.append(el('div', { class: 'lyr' + (pn.id === ed.sel ? ' on' : '') },
      el('button', { type: 'button', class: 'nm', onclick: () => select(pn.id) }, icon('template'), el('span', { text: 'コマ ' + (i + 1) }), pn.img ? el('small', { text: '画像あり' }) : null)));
  });
}

/* ================= pages ================= */
let thumbTimer = 0, thumbAll = false;
function scheduleThumbs(all) { if (all) thumbAll = true; clearTimeout(thumbTimer); thumbTimer = setTimeout(() => { if (!project) return; if (thumbAll) { thumbAll = false; project.pages.forEach((_, i) => drawThumb(i)); } else drawThumb(ed.pi); }, 450); }
function drawThumb(i) {
  const c = $('#pageList canvas[data-i="' + i + '"]'), page = project.pages[i];
  if (!c || !page) return;
  const W = project.page.w, H = project.page.h, tw = 200, th = Math.round(tw * H / W);
  if (c.width !== tw || c.height !== th) { c.width = tw; c.height = th; }
  const x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, tw, th); x.setTransform(tw / W, 0, 0, th / H, 0, 0);
  renderPage(x, page);
}
function renderPages() {
  const list = $('#pageList');
  if (!list || !project) return;
  list.textContent = '';
  project.pages.forEach((pg, i) => {
    list.append(el('button', { type: 'button', class: 'pg' + (i === ed.pi ? ' on' : ''), title: (i + 1) + 'ページ目', 'aria-current': i === ed.pi ? 'page' : null, onclick: () => gotoPage(i) }, el('canvas', { 'data-i': String(i) }), el('span', { text: String(i + 1) })));
    drawThumb(i);
  });
  $('#pageCount').textContent = (ed.pi + 1) + ' / ' + project.pages.length;
  $('#pgDel').disabled = project.pages.length <= 1; $('#pgUp').disabled = ed.pi === 0; $('#pgDown').disabled = ed.pi >= project.pages.length - 1;
  const on = list.children[ed.pi]; if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
}
function gotoPage(i) {
  if (i === ed.pi || i < 0 || i >= project.pages.length) return;
  closeInline(); flushCommit(); cancelPen(); endVertexEdit(true);
  ed.pi = i; ed.sel = null;
  renderPages(); buildProps(); renderLayers(); requestRender();
}
function remapPage(pg) {
  const map = new Map();
  pg.id = uid('pg');
  for (const pn of pg.panels) { const n = uid('pn'); map.set(pn.id, n); pn.id = n; }
  for (const it of pg.items) { it.id = uid('it'); if (it.clip) it.clip = map.get(it.clip) || null; }
  return pg;
}
function addPage() {
  const cur = curPage(), pg = newPage();
  pg.panels = cur.panels.map(p => Object.assign(newPanel(clone(p.pts)), { fill: p.fill, bw: p.bw, bc: p.bc }));
  pg.tpl = cur.tpl;
  project.pages.splice(ed.pi + 1, 0, pg); ed.pi++; ed.sel = null;
  commit(); renderPages(); buildProps(); renderLayers(); requestRender();
  toast('同じコマ割りで新しいページを追加しました');
}
function dupPage() {
  const pg = remapPage(clone(curPage()));
  project.pages.splice(ed.pi + 1, 0, pg); ed.pi++; ed.sel = null;
  commit(); renderPages(); buildProps(); renderLayers(); requestRender();
}
async function delPage() {
  if (project.pages.length <= 1) return;
  if (!await confirmBox((ed.pi + 1) + 'ページ目を削除しますか？（元に戻すで復活できます）', '削除する')) return;
  project.pages.splice(ed.pi, 1); ed.pi = Math.min(ed.pi, project.pages.length - 1); ed.sel = null;
  commit(); renderPages(); buildProps(); renderLayers(); requestRender();
}
function movePage(d) {
  const j = ed.pi + d, a = project.pages;
  if (j < 0 || j >= a.length) return;
  [a[ed.pi], a[j]] = [a[j], a[ed.pi]]; ed.pi = j;
  commit(); renderPages(); requestRender();
}
function setPageSize(w, h, preset) {
  const pg = resizeProject(w, h, preset);
  commit(); fitView(); renderPages(); buildProps();
  toast('用紙サイズを ' + pg.w + '×' + pg.h + ' に変更しました');
}

/* ================= image library ================= */
const libThumbs = new Map();
function libThumb(id) {
  let t = libThumbs.get(id);
  if (t) return t;
  const img = imageEl(id), a = project.assets[id];
  if (!a) return '';
  if (!img) return a.src;
  const k = Math.min(1, 220 / Math.max(a.w, a.h)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(a.w * k)); c.height = Math.max(1, Math.round(a.h * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  t = c.toDataURL('image/png'); libThumbs.set(id, t);
  return t;
}
function usedAssets() {
  const s = new Set();
  for (const pg of project.pages) { for (const pn of pg.panels) if (pn.img) s.add(pn.img.asset); for (const it of pg.items) if (it.type === 'image') s.add(it.asset); }
  return s;
}
function renderLibrary() {
  const g = $('#libGrid');
  if (!g || !project) return;
  g.textContent = '';
  const ids = Object.keys(project.assets);
  $('#libCount').textContent = ids.length ? ids.length + '枚' : '';
  if (!ids.length) { g.append(el('div', { class: 'empty', text: '読み込んだ画像がここに並びます。「画像を追加」を押すか、ページへ直接ドロップしてください。' })); return; }
  const used = usedAssets();
  for (const id of ids) {
    const a = project.assets[id];
    const d = el('div', { class: 'li', draggable: 'true', tabindex: '0', role: 'button', title: a.name + '（クリックかドラッグでコマへ）', 'aria-label': a.name + 'をコマに配置' },
      el('img', { src: libThumb(id), alt: '' }),
      used.has(id) ? el('span', { class: 'used', title: '使用中' }) : null,
      el('button', { type: 'button', class: 'rm', title: '一覧から外す', 'aria-label': '一覧から外す', onclick: ev => { ev.stopPropagation(); removeAsset(id); } }, icon('close')));
    d.addEventListener('click', () => placeAssets([id], null));
    d.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); placeAssets([id], null); } });
    d.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/plain', 'komawari-asset:' + id); ev.dataTransfer.effectAllowed = 'copy'; });
    g.append(d);
  }
}
async function removeAsset(id) {
  const used = usedAssets().has(id);
  if (used && !await confirmBox('この画像はページで使われています。ページからも取り除きますか？', '取り除く')) return;
  for (const pg of project.pages) { for (const pn of pg.panels) if (pn.img && pn.img.asset === id) pn.img = null; pg.items = pg.items.filter(it => !(it.type === 'image' && it.asset === id)); }
  delete project.assets[id]; imgCache.delete(id); libThumbs.delete(id); lumCache.delete(id); idbAssets.delete(id);
  if (ed.sel && !selectedObj()) ed.sel = null;
  commit(); renderLibrary(); buildProps(); scheduleAutosave();
}
function setPanelImage(pn, id) { pn.img = newPanelImage(id); fitImage(pn, 'cover'); }
function placeAssets(ids, firstPanel, p) {
  if (!ids.length || !project) return;
  const page = curPage(), rest = [...ids], placed = [], s = selectedObj();
  if (firstPanel) { setPanelImage(firstPanel, rest.shift()); placed.push(firstPanel); }
  else if (s && s.kind === 'panel' && rest.length === 1) { setPanelImage(s.obj, rest.shift()); placed.push(s.obj); }
  for (const pn of readingOrder(page.panels)) { if (!rest.length) break; if (pn.img || placed.includes(pn)) continue; setPanelImage(pn, rest.shift()); placed.push(pn); }
  const c = p || viewCenterPage(), u = U();
  let k = 0, last = null;
  for (const id of rest) { last = makeImageItem(id, c[0] + k * 3 * u, c[1] + k * 3 * u, 45 * u); page.items.push(last); k++; }
  if (last) select(last.id); else if (placed.length) select(placed[placed.length - 1].id);
  commit(); renderLibrary(); renderLayers();
  if (placed.length && !k) toast(placed.length === 1 ? 'コマに画像を入れました。ドラッグで位置、ホイールで大きさを調整できます' : placed.length + 'つのコマに読み順で画像を入れました');
  else if (k) toast(placed.length ? placed.length + 'コマに入れ、残り' + k + '枚は自由配置にしました' : '空いているコマがないので、自由配置の画像として置きました');
}
function autoPlace() {
  const used = usedAssets(), ids = Object.keys(project.assets).filter(id => !used.has(id));
  const empty = curPage().panels.filter(p => !p.img).length;
  if (!ids.length) { toast('まだ使っていない画像はありません'); return; }
  if (!empty) { toast('このページに空いているコマがありません'); return; }
  ed.sel = null;
  placeAssets(ids.slice(0, empty), null);
}

/* ================= modals ================= */
let modalCancel = null;
function openModal(title, body, actions) {
  const m = $('#modal'), sh = $('.sheet', m);
  sh.textContent = '';
  sh.append(
    el('div', { class: 'mh' }, el('h2', { id: 'mtitle', text: title }), el('button', { type: 'button', class: 'ib', 'aria-label': '閉じる', title: '閉じる', onclick: closeModal }, icon('close'))),
    el('div', { class: 'mb' }, body),
    el('div', { class: 'mf' }, actions.map(a => el('button', { type: 'button', class: a.primary ? 'primary' : 'pb', onclick: a.onClick }, a.label))));
  sh.setAttribute('aria-labelledby', 'mtitle');
  m.hidden = false;
  setTimeout(() => { const f = sh.querySelector('.mb input, .mb select, .mf .primary'); if (f) f.focus(); }, 30);
}
function closeModal() { $('#modal').hidden = true; const f = modalCancel; modalCancel = null; if (f) f(); }
function confirmBox(msg, okLabel) {
  return new Promise(res => {
    modalCancel = () => res(false);
    openModal('確認', el('p', { text: msg, style: 'margin:0;font-size:15px' }), [
      { label: 'キャンセル', onClick: closeModal },
      { label: okLabel || 'OK', primary: true, onClick: () => { modalCancel = null; closeModal(); res(true); } }]);
  });
}
function drawTemplateThumb(c, idx) {
  const W = project.page.w, H = project.page.h, tw = 144, th = Math.round(tw * H / W), x = c.getContext('2d');
  c.width = tw; c.height = th;
  x.fillStyle = '#fff'; x.fillRect(0, 0, tw, th);
  x.setTransform(tw / W, 0, 0, th / H, 0, 0);
  x.lineWidth = Math.max(project.layout.bw, W / tw * 2); x.strokeStyle = '#141414'; x.lineJoin = 'miter';
  for (const pn of templatePanels(idx)) x.stroke(polyPath(pn.pts));
}
function openTemplates() {
  const grid = el('div', { class: 'tpls' });
  TEMPLATES.forEach((t, i) => {
    const c = el('canvas'); drawTemplateThumb(c, i);
    grid.append(el('button', { type: 'button', class: 'tpl', onclick: () => { closeModal(); useTemplate(i); } }, c, el('span', { text: t.name })));
  });
  const imgs = curPage().panels.filter(p => p.img).length;
  openModal('コマ割りテンプレート', el('div', { class: 'form' }, note((ed.pi + 1) + 'ページ目のコマ割りを置き換えます。' + (imgs ? '入っている画像（' + imgs + '枚）は読み順に新しいコマへ引き継ぎます。' : '') + '適用後もコマ割りツールや辺のドラッグで自由に変えられます。'), grid), [{ label: '閉じる', onClick: closeModal }]);
}
function useTemplate(i) {
  applyTemplate(curPage(), i); ed.sel = null;
  commit(); buildProps(); renderLayers();
  toast('「' + TEMPLATES[i].name + '」を適用しました');
}
function openNew() {
  const st = { name: '無題のマンガ', preset: 'B5', w: 1820, h: 2570, tpl: 6, pages: 1 };
  const nameI = el('input', { type: 'text', id: 'n-name', value: st.name });
  nameI.addEventListener('input', () => { st.name = nameI.value; });
  const pre = el('select', { id: 'n-preset' }, PRESETS.map(p => el('option', { value: p.id, text: p.name, selected: p.id === st.preset })));
  const wI = el('input', { type: 'number', id: 'n-w', min: '200', max: '20000', value: String(st.w) }), hI = el('input', { type: 'number', id: 'n-h', min: '200', max: '20000', value: String(st.h) });
  pre.addEventListener('change', () => { st.preset = pre.value; const p = PRESETS.find(x => x.id === pre.value); if (p && p.w) { st.w = p.w; st.h = p.h; wI.value = p.w; hI.value = p.h; } });
  wI.addEventListener('input', () => { st.w = +wI.value; pre.value = st.preset = 'custom'; });
  hI.addEventListener('input', () => { st.h = +hI.value; pre.value = st.preset = 'custom'; });
  const tplSel = el('select', { id: 'n-tpl' }, TEMPLATES.map((t, i) => el('option', { value: String(i), text: t.name, selected: i === st.tpl })));
  tplSel.addEventListener('change', () => { st.tpl = +tplSel.value; });
  const pagesI = el('input', { type: 'number', id: 'n-pages', min: '1', max: '100', value: '1' });
  pagesI.addEventListener('input', () => { st.pages = clamp(Math.round(+pagesI.value) || 1, 1, 100); });
  const body = el('div', { class: 'form' }, field('作品名', nameI), field('用紙', pre), el('div', { class: 'two' }, field('幅 px', wI), field('高さ px', hI)), el('div', { class: 'two' }, field('最初のコマ割り', tplSel), field('ページ数', pagesI)),
    ed.changes !== ed.saved ? el('p', { class: 'warn', text: '今の作品に保存していない変更があります。残したい場合は先に「保存」してください。' }) : null);
  openModal('新しい作品', body, [{ label: 'キャンセル', onClick: closeModal }, { label: '作成する', primary: true, onClick: () => { closeModal(); createNew(st); } }]);
}
function createNew(st) {
  const w = clamp(Math.round(st.w) || 1820, 200, 20000), h = clamp(Math.round(st.h) || 2570, 200, 20000), pr = PRESETS.find(p => p.id === st.preset && p.w === w && p.h === h);
  project = newProject(pr ? pr.id : 'custom', String(st.name || '').trim() || '無題のマンガ', pr ? null : { w, h });
  for (let i = 0; i < st.pages; i++) { const pg = newPage(); applyTemplate(pg, st.tpl); project.pages.push(pg); }
  clearCaches(); ed.pi = 0; ed.sel = null; ed.isSample = false; $('#sample').hidden = true;
  resetHistory(); refreshAll(); fitView(); scheduleAutosave();
  toast('新しい作品を作りました。画像をコマにドロップして始めましょう');
}
function clearCaches() { imgCache.clear(); lumCache.clear(); procCache.clear(); layoutCache.clear(); fontReq.clear(); libThumbs.clear(); }
function refreshAll() { $('#projName').value = project.name; renderPages(); renderLibrary(); buildProps(); renderLayers(); requestRender(); updateHistButtons(); updateDirty(); }

/* ================= shape menu (図形) ================= */
function openShapeMenu() {
  const m = $('#shapeMenu'), b = $('#bShape');
  if (!m.hidden) { closeShapeMenu(); return; }
  m.hidden = false; b.setAttribute('aria-expanded', 'true');
  const r = b.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight, W = window.innerWidth, H = window.innerHeight;
  const side = getComputedStyle($('#rail')).flexDirection === 'column';
  m.style.left = (side ? r.right + 6 : clamp(r.left + r.width / 2 - mw / 2, 8, Math.max(8, W - mw - 8))) + 'px';
  m.style.top = (side ? clamp(r.top, 8, Math.max(8, H - mh - 8)) : Math.max(8, r.top - mh - 6)) + 'px';
  const f = m.querySelector('button');
  if (f) f.focus();
}
function closeShapeMenu(focusBack) {
  const m = $('#shapeMenu');
  if (!m || m.hidden) return;
  m.hidden = true; $('#bShape').setAttribute('aria-expanded', 'false');
  if (focusBack) $('#bShape').focus();
}

/* ================= wiring ================= */
function wireUI() {
  for (const i of $$('i[data-i]')) i.innerHTML = iconSVG(i.dataset.i);
  $('#bShape').addEventListener('click', openShapeMenu);
  for (const b of $$('#shapeMenu [data-shape]')) b.addEventListener('click', () => { closeShapeMenu(); addShape(b.dataset.shape); });
  $('#shapeMenu').addEventListener('keydown', e => {
    e.stopPropagation();
    const items = $$('#shapeMenu button'), i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); items[e.key === 'Home' ? 0 : items.length - 1].focus(); }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeShapeMenu(true); }
  });
  document.addEventListener('pointerdown', e => { if (!$('#shapeMenu').hidden && !e.target.closest('#shapeMenu, #bShape')) closeShapeMenu(); }, true);
  window.addEventListener('resize', () => closeShapeMenu());
  $('#bNew').addEventListener('click', openNew);
  $('#bOpen').addEventListener('click', openProjectDialog);
  $('#bSave').addEventListener('click', saveProject);
  $('#bUndo').addEventListener('click', undo);
  $('#bRedo').addEventListener('click', redo);
  $('#bZin').addEventListener('click', () => zoomAt(cw / 2, ch / 2, 1.25));
  $('#bZout').addEventListener('click', () => zoomAt(cw / 2, ch / 2, 0.8));
  $('#bZfit').addEventListener('click', fitView);
  $('#bExport').addEventListener('click', openExport);
  $('#bLeft').addEventListener('click', () => { document.body.classList.remove('show-right'); document.body.classList.toggle('show-left'); });
  $('#bRight').addEventListener('click', () => { document.body.classList.remove('show-left'); document.body.classList.toggle('show-right'); });
  for (const b of $$('#rail [data-tool]')) b.addEventListener('click', () => setTool(b.dataset.tool));
  for (const b of $$('#rail [data-add]')) b.addEventListener('click', () => addAction(b.dataset.add));
  $('#pgAdd').addEventListener('click', addPage);
  $('#pgDup').addEventListener('click', dupPage);
  $('#pgDel').addEventListener('click', delPage);
  $('#pgUp').addEventListener('click', () => movePage(-1));
  $('#pgDown').addEventListener('click', () => movePage(1));
  $('#libAdd').addEventListener('click', () => pickImageFor(null, true));
  $('#libAuto').addEventListener('click', autoPlace);
  for (const t of $$('.rtab')) t.addEventListener('click', () => {
    for (const x of $$('.rtab')) { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', String(x === t)); }
    $('#props').hidden = t.dataset.tab !== 'props'; $('#layers').hidden = t.dataset.tab !== 'layers';
    if (t.dataset.tab === 'layers') renderLayers();
  });
  $('#projName').addEventListener('input', e => { project.name = e.target.value; const n = $('#c-name'); if (n) n.value = project.name; scheduleCommit(); });
  $('#projName').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  $('#modal').addEventListener('pointerdown', e => { if (e.target === $('#modal')) closeModal(); });
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('pointerleave', () => { if (!ed.drag && ed.hover) { ed.hover = null; requestRender(); } if (ed.pen && ed.pen.cur) { ed.pen.cur = null; ed.pen.close = false; requestRender(); } });
  cv.addEventListener('wheel', onWheel, { passive: false });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  inlineEd.addEventListener('input', onInlineInput);
  inlineEd.addEventListener('keydown', e => { e.stopPropagation(); if (e.isComposing || e.keyCode === 229) return; if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); closeInline(); } });
  inlineEd.addEventListener('blur', closeInline);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', e => { if (e.key === ' ') { ed.space = false; setCursor(); } });
  window.addEventListener('blur', () => { ed.space = false; });
  stage.addEventListener('dragover', e => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; if (!project) return; const pn = panelAtPoint(curPage(), toPage(evPos(e))); const id = pn ? pn.id : null; if (id !== ed.dropPanel) { ed.dropPanel = id; requestRender(); } });
  stage.addEventListener('dragleave', e => { if (e.target === cv || !stage.contains(e.relatedTarget)) { ed.dropPanel = null; requestRender(); } });
  stage.addEventListener('drop', onDrop);
  document.addEventListener('paste', onPaste);
  $('#fImg').addEventListener('change', onImageInput);
  $('#fProj').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) openProjectFile(f); });
  $('#fFont').addEventListener('change', onFontInput);
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', fontsReady);
  new ResizeObserver(resizeCanvas).observe(stage);
  setTool('select');
}
