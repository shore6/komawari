/* ================= browser platform (web app only) =================
   The shared core (src/core.js) draws through PLATFORM; this file supplies the
   browser versions: DOM helpers, web fonts, image elements and canvas creation. */
const PLATFORM = {
  createCanvas: (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; },
  image: id => imageEl(id),
  missingImage: id => { loadAssetImage(id); },
  needFont: it => needFont(it),
  splitFont: null,
  supportsFilter: (() => { try { const c = document.createElement('canvas').getContext('2d'); if (!('filter' in c)) return false; c.filter = 'grayscale(1)'; return c.filter === 'grayscale(1)'; } catch (e) { return false; } })(),
};

const $ = (s, r = document) => r.querySelector(s);

const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (typeof v === 'boolean' || (typeof v === 'number' && k in e)) { if (k in e) e[k] = v; else e.setAttribute(k, ''); }
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c instanceof Node ? c : String(c));
  return e;
}

/* ================= icons (static markup) ================= */
const ICONS = {
  select: '<path d="M5.5 3.5l13 8-6 1.5-3 5.6z"/>',
  knife: '<path d="M3 4.5h8.4L8.7 19.5H3z"/><path d="M14.8 4.5H21v15h-9z"/>',
  hand: '<path d="M7.5 12.5V6a1.5 1.5 0 0 1 3 0v5"/><path d="M10.5 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M13.5 11V5.8a1.5 1.5 0 0 1 3 0V14c0 4-2.6 6.5-6.2 6.5-2.6 0-4.3-1.4-5.4-3.6l-1.7-3.5a1.4 1.4 0 0 1 2.4-1.4l1.4 2"/>',
  template: '<rect x="3.5" y="3.5" width="17" height="17" rx="1"/><path d="M3.5 10.5h17M12 3.5v7M9.5 10.5v10"/>',
  addpanel: '<rect x="3.5" y="4.5" width="11.5" height="15" rx="1"/><path d="M19 9v7M15.5 12.5h7"/>',
  bubble: '<path d="M12 4c5 0 8.5 2.9 8.5 6.6S17 17.2 12 17.2c-.9 0-1.8-.1-2.6-.3L4.5 20l1.6-4.2C4.4 14.6 3.5 12.7 3.5 10.6 3.5 6.9 7 4 12 4z"/>',
  text: '<path d="M5 7V4.5h14V7M12 4.5v15M9 19.5h6"/>',
  sfx: '<path d="M12 2.8l1.9 4.6 4.6-2.2-1.6 4.8 4.8 1.3-4.4 2.2 2.6 4.3-5-.9-.6 5-2.3-4.4-3.9 3.2.4-5L3.6 14l4.2-2.7L4.9 7l5 .8z"/>',
  focus: '<path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5M5.2 5.2l3.4 3.4M15.4 15.4l3.4 3.4M18.8 5.2l-3.4 3.4M8.6 15.4l-3.4 3.4"/>',
  speed: '<path d="M3 6.5h13M7 10.5h14M3 14.5h11M9 18.5h12"/>',
  flash: '<circle cx="12" cy="12" r="3.4"/><path d="M12 2.5v4.2M12 17.3v4.2M2.5 12h4.2M17.3 12h4.2M5.3 5.3l3 3M15.7 15.7l3 3M18.7 5.3l-3 3M8.3 15.7l-3 3"/>',
  tone: '<g fill="currentColor" stroke="none"><circle cx="5.5" cy="5.5" r="1.7"/><circle cx="12" cy="5.5" r="1.7"/><circle cx="18.5" cy="5.5" r="1.7"/><circle cx="8.75" cy="10.5" r="1.7"/><circle cx="15.25" cy="10.5" r="1.7"/><circle cx="5.5" cy="15.5" r="1.7"/><circle cx="12" cy="15.5" r="1.7"/><circle cx="18.5" cy="15.5" r="1.7"/><circle cx="8.75" cy="20.2" r="1.4"/><circle cx="15.25" cy="20.2" r="1.4"/></g>',
  image: '<rect x="3" y="4.5" width="18" height="15" rx="1.5"/><path d="M3 16l5-5 4.5 4.5 3-3L21 18"/><circle cx="15.5" cy="9" r="1.5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  new: '<path d="M6 3h8.5L19 7.5V21H6z"/><path d="M14 3v5h5M12.5 11v6M9.5 14h6"/>',
  open: '<path d="M3 6.5h6l2 2h10v10.5H3z"/>',
  save: '<path d="M4 4h12.5L20 7.5V20H4z"/><path d="M8 4v5h7.5V4M7.5 20v-6h9v6"/>',
  export: '<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4 16.5v4h16v-4"/>',
  zoomin: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5M8 10.5h5M10.5 8v5"/>',
  zoomout: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5M8 10.5h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="1.5"/><path d="M5.5 15.5H4V4h11.5v1.5"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 5.6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.4 6.4C3.9 8.2 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1.1"/>',
  lock: '<rect x="5" y="11" width="14" height="9.5" rx="1.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  unlock: '<rect x="5" y="11" width="14" height="9.5" rx="1.5"/><path d="M8 11V7.5a4 4 0 0 1 7.7-1.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  pages: '<rect x="4" y="3.5" width="11" height="15" rx="1"/><path d="M8 20.5h11V7"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  auto: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5"/>',
  splith: '<rect x="4" y="3.5" width="16" height="17" rx="1"/><path d="M4 12h16"/>',
  splitv: '<rect x="4" y="3.5" width="16" height="17" rx="1"/><path d="M12 3.5v17"/>',
  shapes: '<rect x="3.5" y="10" width="10.5" height="10.5" rx="1"/><circle cx="15.5" cy="8.5" r="5"/>',
  rect: '<rect x="3.5" y="6" width="17" height="12" rx=".8"/>',
  rrect: '<rect x="3.5" y="6" width="17" height="12" rx="4"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>',
  triangle: '<path d="M12 4.5l8.5 15H3.5z"/>',
  polygon: '<path d="M12 3.5l7.4 4.25v8.5L12 20.5l-7.4-4.25v-8.5z"/>',
  star: '<path d="M12 3.6l2.35 5.76 6.21.46-4.76 4.02 1.49 6.04L12 16.6l-5.29 3.28 1.49-6.04-4.76-4.02 6.21-.46z"/>',
  pen: '<path d="M4.5 18.5L7 6l6.5 3.5L19.5 5l-1.5 13.5z"/><g fill="currentColor" stroke="none"><circle cx="4.5" cy="18.5" r="1.7"/><circle cx="7" cy="6" r="1.7"/><circle cx="13.5" cy="9.5" r="1.7"/><circle cx="19.5" cy="5" r="1.7"/><circle cx="18" cy="18.5" r="1.7"/></g>',
  vertex: '<path d="M5 18l3-12 11 4-3 9z"/><g fill="currentColor" stroke="none"><rect x="3.2" y="16.2" width="3.6" height="3.6"/><rect x="6.2" y="4.2" width="3.6" height="3.6"/><rect x="17.2" y="8.2" width="3.6" height="3.6"/><rect x="14.2" y="17.2" width="3.6" height="3.6"/></g>',
  'cb-union': '<path d="M4 4h10v6h6v10H10v-6H4z" fill="currentColor" fill-opacity=".35"/>',
  'cb-subtract': '<path d="M4 4h10v6h-4v4H4z" fill="currentColor" fill-opacity=".35"/><path d="M10 10h10v10H10z" stroke-dasharray="2 2"/>',
  'cb-intersect': '<path d="M4 4h10v10H4zM10 10h10v10H10z" stroke-dasharray="2 2"/><path d="M10 10h4v4h-4z" fill="currentColor" fill-opacity=".5"/>',
  'cb-exclude': '<path d="M4 4h10v6h6v10H10v-6H4zM10 10h4v4h-4z" fill="currentColor" fill-opacity=".35" fill-rule="evenodd"/>',
  'cb-fragment': '<path d="M3 3h10v5H8v5H3z"/><path d="M10 10h4v4h-4z" fill="currentColor" fill-opacity=".5"/><path d="M21 21H11v-5h5v-5h5z"/>',
  'al-left': '<path d="M4 3.5v17"/><rect x="7" y="6" width="12" height="4.5" rx="1"/><rect x="7" y="13.5" width="7.5" height="4.5" rx="1"/>',
  'al-hcenter': '<path d="M12 3.5v17"/><rect x="5" y="6" width="14" height="4.5" rx="1"/><rect x="7.5" y="13.5" width="9" height="4.5" rx="1"/>',
  'al-right': '<path d="M20 3.5v17"/><rect x="5" y="6" width="12" height="4.5" rx="1"/><rect x="9.5" y="13.5" width="7.5" height="4.5" rx="1"/>',
  'al-top': '<path d="M3.5 4h17"/><rect x="6" y="7" width="4.5" height="12" rx="1"/><rect x="13.5" y="7" width="4.5" height="7.5" rx="1"/>',
  'al-vcenter': '<path d="M3.5 12h17"/><rect x="6" y="5" width="4.5" height="14" rx="1"/><rect x="13.5" y="7.5" width="4.5" height="9" rx="1"/>',
  'al-bottom': '<path d="M3.5 20h17"/><rect x="6" y="5" width="4.5" height="12" rx="1"/><rect x="13.5" y="9.5" width="4.5" height="7.5" rx="1"/>',
};
const iconSVG = n => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || '') + '</svg>';
function icon(n) { const s = document.createElement('span'); s.className = 'ic'; s.innerHTML = iconSVG(n); return s; }

const webFonts = new Map();
const fontReq = new Set();
let fontTimer = 0;

function ensureWebFont(f) {
  if (!f || !f.web) return Promise.resolve();
  let p = webFonts.get(f.id);
  if (p) return p;
  p = new Promise(res => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + f.web + '&display=swap';
    l.onload = () => { fontReq.clear(); fontsReady(); res(); };
    l.onerror = () => res();
    document.head.appendChild(l);
  });
  webFonts.set(f.id, p);
  return p;
}

function needFont(it) {
  const f = fontSpec(it.font);
  if (f.web) ensureWebFont(f);
  if (!document.fonts || !document.fonts.load) return;
  const fs = fontString(it, 32), key = fs + '\u0001' + (it.text || '');
  if (fontReq.has(key)) return;
  if (fontReq.size > 3000) fontReq.clear();
  fontReq.add(key);
  document.fonts.load(fs, it.text || 'あ').then(list => { if (list && list.length) fontsReady(); }).catch(() => {});
}

function fontsReady() {
  clearTimeout(fontTimer);
  fontTimer = setTimeout(() => { layoutCache.clear(); refitAllBubbles(); requestRender(); scheduleThumbs(true); }, 80);
}

/* ================= images (browser) ================= */
const imgCache = new Map();
function loadAssetImage(id) {
  const a = project && project.assets[id];
  if (!a) return Promise.resolve(null);
  let rec = imgCache.get(id);
  if (rec) return rec.p;
  const img = new Image();
  const p = new Promise(res => {
    img.onload = () => { res(img); requestRender(); scheduleThumbs(true); };
    img.onerror = () => res(null);
  });
  img.src = a.src;
  imgCache.set(id, rec = { img, p });
  return p;
}
function imageEl(id) { const r = imgCache.get(id); return r && r.img.complete && r.img.naturalWidth ? r.img : null; }
