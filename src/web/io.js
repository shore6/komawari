/* ================= import ================= */
function readDataURL(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); }); }
function decodeImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('decode')); i.src = src; }); }
const isImageFile = f => (f.type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(f.name || '');
async function importImageFile(f) {
  const src0 = await readDataURL(f), img = await decodeImage(src0);
  let w = img.naturalWidth, h = img.naturalHeight, src = src0;
  if (!w || !h) throw new Error('empty');
  const MAX = 4096;
  if (Math.max(w, h) > MAX || !/^data:image\//.test(src0)) {
    const k = Math.min(1, MAX / Math.max(w, h)), c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
    src = /jpe?g/i.test(f.type) ? c.toDataURL('image/jpeg', 0.92) : c.toDataURL('image/png');
    w = c.width; h = c.height;
  }
  const id = uid('a');
  project.assets[id] = { id, name: f.name || '画像', src, w, h };
  await loadAssetImage(id);
  return id;
}
async function importImages(files) {
  const ids = [];
  busy(true, '画像を読み込み中…');
  try {
    for (const f of files) {
      try { ids.push(await importImageFile(f)); }
      catch (err) { console.warn(err); toast((f.name || '画像') + ' は読み込めませんでした（PNG・JPEG・WebP・GIFに対応）', 4200); }
    }
  } finally { busy(false); }
  renderLibrary(); scheduleAutosave();
  return ids;
}
function pickImageFor(panelId, libOnly) { ed.pick = { panel: panelId, lib: !!libOnly }; const i = $('#fImg'); i.value = ''; i.click(); }
async function onImageInput(e) {
  const files = [...e.target.files].filter(isImageFile), pick = ed.pick || {};
  e.target.value = ''; ed.pick = null;
  if (!files.length) return;
  const ids = await importImages(files);
  if (!ids.length) return;
  if (pick.lib) { toast(ids.length + '枚の画像を読み込みました。クリックかドラッグでコマに入れられます'); return; }
  placeAssets(ids, pick.panel ? findPanel(pick.panel) : null);
}
function placeFree(ids, p) {
  const page = curPage(), u = U();
  let last = null;
  ids.forEach((id, k) => { last = makeImageItem(id, p[0] + k * 3 * u, p[1] + k * 3 * u, 45 * u); page.items.push(last); });
  if (last) select(last.id);
  commit(); renderLibrary(); renderLayers();
  toast('コマの外なので、自由に動かせる画像として置きました（枠からはみ出す表現に）');
}
async function onDrop(e) {
  e.preventDefault();
  ed.dropPanel = null; requestRender();
  if (!project) return;
  const p = toPage(evPos(e)), pn = panelAtPoint(curPage(), p), dt = e.dataTransfer;
  const txt = dt ? dt.getData('text/plain') : '';
  if (txt && txt.startsWith('komawari-asset:')) {
    const id = txt.slice(15);
    if (!project.assets[id]) return;
    if (pn) { setPanelImage(pn, id); select(pn.id); commit(); renderLibrary(); toast('コマに画像を入れました'); }
    else placeFree([id], p);
    return;
  }
  const files = dt ? [...dt.files] : [];
  if (!files.length) return;
  const proj = files.find(f => /\.json$/i.test(f.name) || f.type === 'application/json');
  if (proj) { openProjectFile(proj); return; }
  const fonts = files.filter(f => /\.(ttf|otf|woff2?)$/i.test(f.name));
  for (const f of fonts) { try { const n = await importFontFile(f); toast('フォント「' + n + '」を読み込みました'); buildProps(); } catch (err) { toast('フォントを読み込めませんでした'); } }
  const imgs = files.filter(isImageFile);
  if (!imgs.length) { if (!fonts.length) toast('画像ファイル（PNG・JPEGなど）をドロップしてください'); return; }
  const ids = await importImages(imgs);
  if (!ids.length) return;
  if (pn) placeAssets(ids, pn, p); else placeFree(ids, p);
}
async function onPaste(e) {
  if (!project || isTyping(e.target) || !$('#modal').hidden) return;
  const files = [...((e.clipboardData && e.clipboardData.files) || [])].filter(isImageFile);
  if (files.length) { e.preventDefault(); const ids = await importImages(files); placeAssets(ids, null); return; }
  if (ed.clip) { e.preventDefault(); pasteClip(); }
}

/* ================= fonts ================= */
function pickFont(itemId) { ed.fontTarget = itemId; const i = $('#fFont'); i.value = ''; i.click(); }
async function importFontFile(f) {
  if (f.size > 40 * 1024 * 1024) throw new Error('big');
  const buf = await f.arrayBuffer(), name = f.name.replace(/\.[^.]+$/, '').replace(/["\\;{}<>]/g, '').trim().slice(0, 60) || 'MyFont';
  const face = new FontFace(name, buf.slice(0));
  await face.load(); document.fonts.add(face);
  const src = await readDataURL(f), ex = project.fonts.find(x => x.name === name);
  if (ex) ex.src = src; else project.fonts.push({ name, src });
  fontReq.clear(); layoutCache.clear(); scheduleAutosave();
  return name;
}
async function onFontInput(e) {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  busy(true, 'フォントを読み込み中…');
  try {
    const name = await importFontFile(f), it = ed.fontTarget && findItem(ed.fontTarget);
    if (it) { it.font = 'custom:' + name; if (it.type === 'bubble' && it.autoFit) fitBubble(it); commit(); }
    buildProps(); toast('フォント「' + name + '」を読み込みました。作品ファイルにも保存されます', 4000);
  } catch (err) { console.warn(err); toast('このフォントは読み込めませんでした（TTF・OTF・WOFF）'); }
  finally { busy(false); ed.fontTarget = null; }
}
async function registerFonts(list) {
  for (const f of list) {
    try {
      const bin = atob(f.src.slice(f.src.indexOf(',') + 1)), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const face = new FontFace(f.name, u8.buffer); await face.load(); document.fonts.add(face);
    } catch (err) { console.warn('font', f.name, err); }
  }
}

/* ================= save / open ================= */
function projectData() { return { app: 'komawari', version: 1, name: project.name, page: project.page, layout: project.layout, pages: project.pages, assets: project.assets, fonts: project.fonts }; }
function safeName(s) { return (String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').trim() || 'manga').slice(0, 80); }
let dlNS = null, dlReady = null;
function initDownloads() {
  try { if (window.claude && typeof window.claude.use === 'function') dlReady = Promise.resolve(window.claude.use('downloads')).then(ns => (dlNS = ns || null)).catch(() => null); }
  catch (err) { dlReady = null; }
}
async function saveBlob(filename, blob) {
  if (dlReady) {
    const ns = dlNS || await Promise.race([dlReady, sleep(4000).then(() => null)]);
    if (ns && typeof ns.save === 'function') {
      try { await ns.save({ filename, data: blob }); toast('保存しました：' + filename, 3600); return true; }
      catch (err) {
        const code = err && err.code;
        const msg = { declined: '保存をキャンセルしました', rate_limited: '少し待ってから、もう一度お試しください', too_large: 'ファイルが大きすぎて保存できません。解像度を下げてお試しください', host_unavailable: 'このアプリでは保存できません。ブラウザかPCで開いてお試しください', rejected_extension: 'この形式はここでは保存できません', extension_not_enabled: 'この形式はここでは保存できません' }[code];
        if (msg) { toast(msg, 4500); return false; }
      }
    }
  }
  try {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast('ダウンロードを開始しました：' + filename, 3600);
    return true;
  } catch (err) { toast('保存できませんでした'); return false; }
}
async function saveProject() {
  if (!project) return;
  closeInline(); flushCommit();
  const json = JSON.stringify(Object.assign(projectData(), { savedAt: new Date().toISOString() }));
  const ok = await saveBlob(safeName(project.name) + '.manga.json', new Blob([json], { type: 'application/json' }));
  if (ok) { ed.saved = ed.changes; updateDirty(); }
}
function openProjectDialog() { const i = $('#fProj'); i.value = ''; i.click(); }
async function openProjectFile(f) {
  if (ed.changes !== ed.saved && !ed.isSample && !await confirmBox('保存していない変更があります。破棄して「' + f.name + '」を開きますか？', '開く')) return;
  busy(true, '作品を読み込み中…');
  try {
    const o = JSON.parse(await f.text());
    await loadProjectObject(o);
    ed.isSample = false; $('#sample').hidden = true;
    toast('「' + project.name + '」を開きました'); scheduleAutosave();
  } catch (err) { console.error(err); toast('このファイルは開けませんでした。コマワリ工房で保存した .json を選んでください', 4500); }
  finally { busy(false); }
}
async function loadProjectObject(o) {
  const prev = project;
  let P = null;
  try { P = normalizeProject(o); } catch (err) { P = null; }
  if (!P) { project = prev; throw new Error('invalid'); }
  project = P; clearCaches();
  await registerFonts(P.fonts);
  await Promise.all(Object.keys(P.assets).map(id => loadAssetImage(id)));
  ed.pi = 0; ed.sel = null; ed.inline = null; inlineEd.hidden = true;
  resetHistory(); refreshAll(); fitView();
}

/* ================= export ================= */
function openExport() {
  if (!project) return;
  closeInline(); flushCommit();
  const W = project.page.w, H = project.page.h, n = project.pages.length, mm = project.page.mm;
  const st = ed.exp || (ed.exp = { scope: 'page', fmt: 'png', width: W, q: 0.92, transparent: false });
  if (n < 2) st.scope = 'page';
  const wI = el('input', { type: 'number', id: 'x-w', min: '16', max: '30000' }), hI = el('input', { type: 'number', id: 'x-h', min: '16', max: '30000' });
  const info = el('p', { class: 'kv' }), warn = el('p', { class: 'warn' });
  const upd = () => {
    const w = Math.max(1, Math.round(st.width)), h = Math.max(1, Math.round(st.width * H / W)), mp = w * h / 1e6;
    info.textContent = '出力：' + w.toLocaleString() + ' × ' + h.toLocaleString() + ' px（' + mp.toFixed(1) + 'メガピクセル）' + (mm ? '／' + mm[0] + '×' + mm[1] + 'mmで約' + Math.round(w / (mm[0] / 25.4)) + 'dpi' : '');
    warn.textContent = w > 16384 || h > 16384 || mp > 200 ? '大きすぎるため書き出せない場合があります（目安：一辺16,384px・2億画素まで）。' : '';
  };
  const setW = w => { st.width = Math.max(16, Math.round(w)); wI.value = String(st.width); hI.value = String(Math.round(st.width * H / W)); upd(); };
  wI.addEventListener('input', () => { const v = parseFloat(wI.value); if (v > 0) { st.width = v; hI.value = String(Math.round(v * H / W)); upd(); } });
  hI.addEventListener('input', () => { const v = parseFloat(hI.value); if (v > 0) { st.width = v * W / H; wI.value = String(Math.round(st.width)); upd(); } });
  const qRow = field('画質', range(st, 'q', { id: 'xq', min: 0.5, max: 1, step: 0.01, pct: true, silent: true }));
  const tRow = chk(st, 'transparent', 'コマの外側（余白）を透明にする', { id: 'xt', silent: true });
  const vis = () => { qRow.hidden = st.fmt === 'png'; tRow.hidden = st.fmt === 'jpeg'; };
  const body = el('div', { class: 'form' },
    n > 1 ? field('対象', seg(st, 'scope', [['page', 'このページ（' + (ed.pi + 1) + '）'], ['all', '全' + n + 'ページ（ZIP）']], { id: 'xscope', silent: true })) : null,
    field('形式', seg(st, 'fmt', [['png', 'PNG'], ['jpeg', 'JPEG'], ['webp', 'WebP']], { id: 'xfmt', silent: true, on: vis })),
    el('div', { class: 'two' }, field('幅 px', wI), field('高さ px', hI)),
    el('div', { class: 'btns' }, [0.5, 1, 2, 3, 4].map(k => btn('×' + k, () => setW(W * k)))),
    el('div', { class: 'btns' }, btn('幅1080px', () => setW(1080)), btn('幅2048px', () => setW(2048)), btn('幅3840px（4K）', () => setW(3840)),
      mm ? btn('印刷用 350dpi', () => setW(mm[0] / 25.4 * 350)) : null, mm ? btn('印刷用 600dpi', () => setW(mm[0] / 25.4 * 600)) : null),
    info, warn, qRow, tRow,
    note('文字・吹き出し・効果線はベクターで描き直すので、大きくしてもにじみません。読み込んだ画像は元の解像度までがきれいに出ます。'));
  setW(st.width); vis();
  openModal('画像として書き出し', body, [{ label: 'キャンセル', onClick: closeModal }, { label: '書き出す', primary: true, onClick: () => { closeModal(); runExport(st); } }]);
}
async function runExport(st) {
  const idxs = st.scope === 'all' ? project.pages.map((_, i) => i) : [ed.pi];
  const W = project.page.w, H = project.page.h, w = Math.max(1, Math.round(st.width)), h = Math.max(1, Math.round(st.width * H / W));
  const mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[st.fmt] || 'image/png';
  busy(true, '書き出し中…');
  try {
    await prepareRender(idxs);
    const files = [];
    for (const i of idxs) {
      busy(true, idxs.length > 1 ? '書き出し中… ' + (files.length + 1) + ' / ' + idxs.length : '書き出し中…');
      await sleep(30);
      const blob = await renderToBlob(project.pages[i], w, h, mime, st.q, st.transparent && st.fmt !== 'jpeg');
      if (!blob) throw new Error('mem');
      const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
      files.push({ name: safeName(project.name) + '_p' + String(i + 1).padStart(2, '0') + '.' + ext, blob });
    }
    if (files.length === 1) { busy(false); await saveBlob(files[0].name, files[0].blob); }
    else { busy(true, 'ZIPにまとめています…'); const zip = await makeZip(files); busy(false); await saveBlob(safeName(project.name) + '.zip', zip); }
  } catch (err) {
    console.error(err);
    toast(err && err.message === 'mem' ? 'メモリが足りず書き出せませんでした。解像度を下げてお試しください' : '書き出しに失敗しました', 4500);
  } finally { busy(false); }
}
async function prepareRender(idxs) {
  const ids = new Set(), items = [];
  for (const i of idxs) {
    const pg = project.pages[i];
    for (const pn of pg.panels) if (pn.img) ids.add(pn.img.asset);
    for (const it of pg.items) { if (it.type === 'image') ids.add(it.asset); if ((it.type === 'bubble' || it.type === 'text') && it.text) items.push(it); }
  }
  await Promise.all([...ids].map(loadAssetImage));
  if (document.fonts && document.fonts.load) {
    await Promise.race([Promise.all(items.map(it => ensureWebFont(fontSpec(it.font)))), sleep(5000)]);
    await Promise.race([Promise.all(items.map(it => document.fonts.load(fontString(it, 32), it.text).catch(() => {}))), sleep(8000)]);
  }
  layoutCache.clear();
  for (const i of idxs) for (const it of project.pages[i].items) if (it.type === 'bubble' && it.autoFit) fitBubble(it);
}
async function renderToBlob(page, w, h, mime, q, transparent) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  if (!x) return null;
  x.setTransform(w / project.page.w, 0, 0, h / project.page.h, 0, 0);
  renderPage(x, page, { transparent: !!transparent });
  const blob = await new Promise(r => { try { c.toBlob(r, mime, q); } catch (err) { r(null); } });
  c.width = c.height = 1;
  return blob;
}
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
async function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [], now = new Date();
  const time = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF, date = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  let offset = 0;
  for (const f of files) {
    const data = new Uint8Array(await f.blob.arrayBuffer()), name = enc.encode(f.name), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(lh.buffer, name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true); cd.setUint16(12, time, true); cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true); cd.setUint16(28, name.length, true);
    cd.setUint16(30, 0, true); cd.setUint16(32, 0, true); cd.setUint16(34, 0, true); cd.setUint16(36, 0, true); cd.setUint32(38, 0, true); cd.setUint32(42, offset, true);
    central.push(cd.buffer, name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((s, b) => s + b.byteLength, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

/* ================= autosave (this browser only) ================= */
let idbConn = null, autoTimer = 0;
function idbOpen() {
  if (idbConn) return Promise.resolve(idbConn);
  return new Promise((res, rej) => {
    try { const r = indexedDB.open('komawari', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { idbConn = r.result; res(idbConn); }; r.onerror = () => rej(r.error); }
    catch (err) { rej(err); }
  });
}
async function idbGet(k) { const db = await idbOpen(); return new Promise((res, rej) => { const q = db.transaction('kv', 'readonly').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function idbSet(k, v) { const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
const idbAssets = new Set();
function scheduleAutosave() {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(async () => {
    if (!project) return;
    try {
      const ids = Object.keys(project.assets);
      for (const id of ids) if (!idbAssets.has(id)) { await idbSet('a:' + id, project.assets[id]); idbAssets.add(id); }
      const d = projectData(); d.assets = {};
      await idbSet('autosave', { at: Date.now(), sample: ed.isSample && ed.changes === 0, assetIds: ids, project: d });
      await pruneAssets(ids);
    } catch (err) { }
  }, 1500);
}
async function pruneAssets(ids) {
  const keep = new Set(ids), db = await idbOpen();
  const keys = await new Promise((res, rej) => { const q = db.transaction('kv', 'readonly').objectStore('kv').getAllKeys(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const dead = keys.filter(k => typeof k === 'string' && k.startsWith('a:') && !keep.has(k.slice(2)));
  if (!dead.length) return;
  await new Promise(res => { const tx = db.transaction('kv', 'readwrite'), st = tx.objectStore('kv'); for (const k of dead) st.delete(k); tx.oncomplete = res; tx.onerror = res; });
  for (const k of dead) idbAssets.delete(k.slice(2));
}
async function loadAutosave() {
  const rec = await idbGet('autosave');
  if (!rec || !rec.project) return null;
  const P = rec.project;
  if (Array.isArray(rec.assetIds)) {
    P.assets = {};
    for (const id of rec.assetIds) { const a = await idbGet('a:' + id).catch(() => null); if (a) { P.assets[id] = a; idbAssets.add(id); } }
  }
  return rec;
}

/* ================= sample page ================= */
function buildSample() {
  project = newProject('B5', 'サンプル　コマワリ工房へようこそ');
  const page = newPage();
  project.pages.push(page);
  applyTemplate(page, 6);
  const [p1, p2, p3, p4, p5] = readingOrder(page.panels), u = U(), bw = project.layout.bw;
  const bb = pn => polyBBox(pn.pts), full = pn => { const b = bb(pn); return { cx: b.cx, cy: b.cy, w: b.w + bw * 2, h: b.h + bw * 2 }; };
  const b1 = bb(p1), b2 = bb(p2), b3 = bb(p3), b4 = bb(p4), b5 = bb(p5);
  page.items.push(makeEffect('tone', full(p1), p1.id, { pattern: 'grad', dens: 0.5, d2: 0, gang: 90, pitch: Math.round(0.75 * u) }));
  page.items.push(makeEffect('focus', full(p3), p3.id, { fx: -0.46, fy: 0.02, ir: 0.3, count: 220 }));
  page.items.push(makeEffect('speed', full(p4), p4.id, { count: 64 }));
  page.items.push(makeEffect('flash', { cx: b5.cx, cy: b5.cy, w: b5.w * 0.94, h: b5.h * 0.9 }, p5.id, { ir: 0.42, count: 80 }));
  const bub = (x, y, o, tip) => { const b = makeBubble(x, y, o); if (tip) { b.tail.x = tip[0]; b.tail.y = tip[1]; } else b.tail.on = false; page.items.push(b); return b; };
  page.items.push(makeText(b1.x + b1.w * 0.13, b1.y + b1.h * 0.3, { text: 'とある\n工房にて', font: 'mincho', bold: false, size: Math.round(1.7 * u), bg: '#ffffff' }));
  bub(b1.x2 - b1.w * 0.26, b1.cy + u, { text: 'ようこそ\nコマワリ工房へ' }, [-5 * u, 15 * u]);
  bub(b2.x + b2.w * 0.6, b2.y + b2.h * 0.4, { text: '画像は\nコマへ\nドロップ…', shape: 'cloud', tail: { style: 'thought' } }, [-7 * u, 13 * u]);
  page.items.push(makeSfx(b3.x + b3.w * 0.25, b3.cy, { text: 'ドンッ', rot: -9 }));
  bub(b3.x2 - b3.w * 0.2, b3.cy - u, { text: '効果線も\n描き文字も\nおまかせ！', shape: 'spike' }, [-10 * u, 11 * u]);
  bub(b4.cx, b4.cy - 2 * u, { text: 'ダブルクリックで\nセリフを編集', shape: 'round' }, [2 * u, 17 * u]);
  bub(b5.cx, b5.cy, { text: '好きな解像度で\n書き出せる！' }, null);
  ed.isSample = true; ed.pi = 0; ed.sel = null;
  clearCaches(); resetHistory();
}

/* ================= boot ================= */
let started = false;
async function start(data) {
  if (started) return;
  started = true;
  wireUI(); initDownloads();
  let ok = false;
  if (data && data.project) {
    try { await loadProjectObject(data.project); ed.pi = clamp(data.pi | 0, 0, project.pages.length - 1); ed.isSample = !!data.sample; ok = true; } catch (err) { }
  }
  if (!ok) {
    try {
      const rec = await Promise.race([loadAutosave(), sleep(4000).then(() => null)]);
      if (rec && rec.project) { await loadProjectObject(rec.project); ok = true; ed.isSample = !!rec.sample; if (!rec.sample) toast('前回の作業を復元しました（このブラウザ内の一時保存です）', 4000); }
    } catch (err) { }
  }
  if (!ok) buildSample();
  $('#sample').hidden = !ed.isSample;
  refreshAll(); fitView();
  try { const hot = window.claude && window.claude.hot; if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => project ? { pi: ed.pi, sample: ed.isSample && ed.changes === 0, project: projectData() } : {}); } catch (err) { }
}
{
  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.ready === 'function') hot.ready(start); else start((hot && hot.data) || {});
}
