'use strict';
// Command line front end. Every command prints one JSON object to stdout.
const fs = require('fs');
const path = require('path');
const E = require('./engine');
const OPS = require('./ops');
const { info } = require('./info');
const { K, UserError } = E;
const VERSION = require('../package.json').version;

const USAGE = `komawari ${VERSION} — マンガのページをJSONで組み立てて画像に書き出すCLI（コマワリ工房のコア）

  komawari guide                         LLM向けの使い方（最初にこれを読む）
  komawari schema                        op と spec の項目一覧（JSON）
  komawari templates                     コマ割りテンプレート一覧
  komawari example [フォルダ]            サンプルの spec.json と画像をコピー
  komawari new <作品.manga.json> [--size B5] [--pages 1] [--template basic-5] [--title 名前] [--direction rtl|ltr]
  komawari build <spec.json> [-o 作品.manga.json] [--render [出力先]] [--annotate] [--width W|--scale S|--dpi D]
  komawari apply <作品.manga.json> <ops.json|-> [-o 別名.manga.json] [--render [出力先]] [--annotate]
  komawari validate <spec.json|ops.json|->
  komawari info <作品.manga.json> [--page N]
  komawari render <作品.manga.json> [-o 出力.png|フォルダ] [--page N|1,3|2-4|all]
                  [--width W|--height H|--scale S|--dpi D] [--format png|jpeg|webp] [--quality 0.92] [--transparent] [--annotate]
  komawari fonts                         フォントの状態
  komawari fonts fetch <id…|base|all>    Google Fonts からフォントを取得（~/.komawari/fonts）
  komawari fonts add <file.ttf…> --project <作品.manga.json>   フォントを作品に埋め込む

  共通: --compact（1行のJSONで出力）  -h, --help  -v, --version
  出力はすべてJSON。失敗時は {"ok": false, "error": …, "hint": …} と終了コード1。`;

const FLAGS = new Set(['all', 'annotate', 'transparent', 'compact', 'help', 'version', 'h', 'v']);
const SHORT = { o: 'out', p: 'page', h: 'help', v: 'version' };
function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-' || !a.startsWith('-') || /^-\d/.test(a)) { pos.push(a); continue; }
    let key, val;
    if (a.startsWith('--')) { const eq = a.indexOf('='); if (eq > 0) { key = a.slice(2, eq); val = a.slice(eq + 1); } else key = a.slice(2); }
    else key = SHORT[a.slice(1)] || a.slice(1);
    if (val === undefined) {
      const nx = argv[i + 1];
      if (FLAGS.has(key) || nx === undefined || (nx.startsWith('-') && nx !== '-' && !/^-\d/.test(nx))) val = true;
      else if (key === 'render' && /\.json$/i.test(nx)) val = true;
      else { val = nx; i++; }
    }
    opt[key] = val;
  }
  return { pos, opt };
}
function readJSONInput(src) {
  let text;
  if (src === '-') text = fs.readFileSync(0, 'utf8');
  else { try { text = fs.readFileSync(src, 'utf8'); } catch (err) { throw new UserError(`ファイルを読めません: ${src}`); } }
  try { return JSON.parse(text.replace(/^﻿/, '')); }
  catch (err) { throw new UserError(`JSONとして読めません: ${src === '-' ? '標準入力' : src}（${err.message}）`, 'コメントや末尾のカンマはJSONでは使えません'); }
}
function need(pos, i, what) { if (!pos[i]) throw new UserError(`${what} を指定してください`, 'komawari --help で使い方を確認できます'); return pos[i]; }
function pageList(spec, count) {
  if (spec == null || spec === true) return null;
  const s = String(spec).trim().toLowerCase();
  if (s === 'all') return [...Array(count).keys()].map(i => i + 1);
  const out = [];
  for (const part of s.split(',')) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new UserError(`--page「${spec}」が読めません`, '例: --page 2 / --page 1,3 / --page 2-4 / --page all');
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let n = Math.min(a, b); n <= Math.max(a, b); n++) out.push(n);
  }
  for (const n of out) if (n < 1 || n > count) throw new UserError(`ページ ${n} はありません（全${count}ページ）`);
  return out;
}
const stripExt = f => f.replace(/\.manga\.json$/i, '').replace(/\.json$/i, '');
function outPaths(out, pages, fmt, base) {
  const ext = fmt === 'jpeg' ? 'jpg' : fmt, pad = n => String(n).padStart(2, '0');
  if (!out || out === true) return pages.map(n => `${base}_p${pad(n)}.${ext}`);
  const isDir = /[\\/]$/.test(out) || (fs.existsSync(out) && fs.statSync(out).isDirectory()) || !path.extname(out);
  if (isDir) return pages.map(n => path.join(out, `${path.basename(base)}_p${pad(n)}.${ext}`));
  if (/\{n\}/.test(out)) return pages.map(n => out.replace(/\{n\}/g, pad(n)));
  if (pages.length === 1) return [out];
  const e = path.extname(out);
  return pages.map(n => out.slice(0, -e.length) + `_p${pad(n)}` + e);
}
function formatFrom(opt, out) {
  if (opt.format) return String(opt.format).toLowerCase().replace('jpg', 'jpeg');
  const e = typeof out === 'string' ? path.extname(out).toLowerCase() : '';
  return e === '.jpg' || e === '.jpeg' ? 'jpeg' : e === '.webp' ? 'webp' : 'png';
}
async function doRender(projectFile, opt, pagesOpt, outOpt) {
  const P = K.project, all = P.pages.map((_, i) => i + 1);
  const many = !outOpt || outOpt === true || /\{n\}/.test(outOpt) || /[\\/]$/.test(outOpt) || !path.extname(outOpt) || (fs.existsSync(outOpt) && fs.statSync(outOpt).isDirectory());
  const nums = pageList(pagesOpt, P.pages.length) || (many ? all : [1]);
  const fmt = formatFrom(opt, outOpt), base = stripExt(projectFile);
  const files = outPaths(outOpt, nums, fmt, base);
  const res = await E.renderPages(nums.map(n => n - 1), { width: num(opt.width), height: num(opt.height), scale: num(opt.scale), dpi: num(opt.dpi), format: fmt, quality: num(opt.quality), transparent: !!opt.transparent, annotate: !!opt.annotate });
  const written = res.map((r, i) => { fs.mkdirSync(path.dirname(path.resolve(files[i])), { recursive: true }); fs.writeFileSync(files[i], r.buffer); return { page: r.page, file: path.resolve(files[i]), width: r.width, height: r.height, bytes: r.buffer.length }; });
  return { files: written, warnings: E.fontWarnings(nums.map(n => n - 1)) };
}
const num = v => (v === undefined || v === true ? undefined : Number(v));

const COMMANDS = {
  guide() { return { __raw: fs.readFileSync(path.join(__dirname, '..', 'GUIDE.md'), 'utf8') }; },
  schema() {
    const ops = {};
    for (const [k, v] of Object.entries(OPS.SCHEMA)) ops[k] = v ? Object.fromEntries(Object.entries(v).map(([key, ty]) => [key, Array.isArray(ty) ? ty : ty])) : '対象（id、または page+panel）の種類に応じた項目';
    return {
      ops, required: OPS.REQUIRED, types: OPS.HINT,
      anchors: OPS.ANCHORS, tailDirections: Object.keys(OPS.DIRS),
      spec: { top: ['title', 'size', 'direction', 'margin', 'gutter', 'border', 'borderColor', 'defaults{bubble,text,sfx,effect}', 'pages[]'], page: ['layout', 'background', 'panels[]', 'items[] (type付きの自由配置)'], panel: ['image', 'fill', 'border', 'borderColor', 'effects[]', 'bubbles[]', 'texts[]', 'sfx[]', 'items[]'] },
      fonts: K.FONTS.map(f => f.id), shapes: K.SHAPES.map(s => s[0]), sizes: K.PRESETS.filter(p => p.w).map(p => p.id),
    };
  },
  example(pos) {
    const dest = path.resolve(pos[1] || 'komawari-example'), src = path.join(__dirname, '..', 'examples', 'demo');
    if (fs.existsSync(dest) && fs.readdirSync(dest).length) throw new UserError(`フォルダが空ではありません: ${dest}`, '新しいフォルダ名を指定してください');
    fs.mkdirSync(dest, { recursive: true });
    const files = fs.readdirSync(src);
    for (const f of files) fs.copyFileSync(path.join(src, f), path.join(dest, f));
    return { dir: dest, files, next: `komawari build "${path.join(dest, 'spec.json')}" --render --annotate --width 1000` };
  },
  templates() {
    return { templates: K.TEMPLATES.map((t, i) => { K.project = K.project || K.newProject('B5'); return { n: i + 1, alias: t.alias, name: t.name, panels: K.templatePanels(i).length }; }) };
  },
  async new(pos, opt) {
    const file = need(pos, 1, '作る作品ファイル名（例: story.manga.json）');
    E.newProject({ size: opt.size, title: opt.title || stripExt(path.basename(file)) });
    if (opt.direction) K.project.layout.dir = opt.direction;
    const tpl = OPS.findTemplate(opt.template || 'basic-5'), n = Math.max(1, Math.min(200, parseInt(opt.pages || 1, 10) || 1));
    for (let i = 0; i < n; i++) { const pg = K.newPage(); K.applyTemplate(pg, tpl); K.project.pages.push(pg); }
    return { file: E.saveProject(file), size: [K.project.page.w, K.project.page.h], pages: n, panelsPerPage: K.project.pages[0].panels.length };
  },
  async build(pos, opt) {
    const specFile = need(pos, 1, 'spec ファイル（JSON）'), spec = readJSONInput(specFile);
    const ops = OPS.specToOps(spec);
    const out = opt.out || (specFile === '-' ? 'manga.manga.json' : stripExt(specFile) + '.manga.json');
    E.newProject({ size: spec.size, title: spec.title || stripExt(path.basename(out)) });
    K.project.pages.push(K.newPage());
    const results = await OPS.runOps(ops, { baseDir: specFile === '-' ? process.cwd() : path.dirname(path.resolve(specFile)) });
    const r = { file: E.saveProject(out), pages: K.project.pages.length, created: results.filter(x => x.id).map(x => x.id) };
    if (opt.render) Object.assign(r, { rendered: await doRender(out, opt, opt.page || 'all', opt.render) });
    r.warnings = info().pages.flatMap(p => p.warnings.map(w => `p${p.page}: ${w}`)).concat(r.rendered ? r.rendered.warnings : E.fontWarnings(K.project.pages.map((_, i) => i)));
    if (r.rendered) delete r.rendered.warnings;
    return r;
  },
  async apply(pos, opt) {
    const file = need(pos, 1, '作品ファイル'), src = need(pos, 2, '操作JSONのファイル（標準入力なら -）');
    E.loadProject(file);
    let ops = readJSONInput(src);
    if (ops && !Array.isArray(ops) && Array.isArray(ops.ops)) ops = ops.ops;
    if (ops && !Array.isArray(ops) && ops.op) ops = [ops];
    const results = await OPS.runOps(ops, { baseDir: src === '-' ? process.cwd() : path.dirname(path.resolve(src)) });
    const out = opt.out || file, r = { file: E.saveProject(out), results };
    if (opt.render) Object.assign(r, { rendered: await doRender(out, opt, opt.page, opt.render) });
    r.warnings = info().pages.flatMap(p => p.warnings.map(w => `p${p.page}: ${w}`)).concat(r.rendered ? r.rendered.warnings : []);
    if (r.rendered) delete r.rendered.warnings;
    return r;
  },
  async validate(pos) {
    const src = need(pos, 1, '検査するJSON'), o = readJSONInput(src);
    const isSpec = o && !Array.isArray(o) && Array.isArray(o.pages);
    if (isSpec) { const ops = OPS.specToOps(o); return { kind: 'spec', pages: o.pages.length, ops: ops.length, valid: true }; }
    const ops = Array.isArray(o) ? o : o && Array.isArray(o.ops) ? o.ops : o && o.op ? [o] : null;
    const errs = OPS.validateOps(ops);
    if (errs.length) throw Object.assign(new UserError(`${errs.length}件の問題があります: ${errs[0].where} ${errs[0].error}`, errs[0].hint), { details: errs });
    return { kind: 'ops', ops: ops.length, valid: true, note: 'コマ番号やidの存在は apply のときに確認します' };
  },
  async info(pos, opt) {
    E.loadProject(need(pos, 1, '作品ファイル'));
    return info(pageList(opt.page, K.project.pages.length));
  },
  async render(pos, opt) {
    const file = need(pos, 1, '作品ファイル');
    E.loadProject(file);
    return doRender(file, opt, opt.all ? 'all' : opt.page, opt.out);
  },
  async fonts(pos, opt) {
    K.project = K.project || K.newProject('B5');
    const sub = pos[1];
    if (!sub || sub === 'list') return { fontDir: E.fonts.FONT_DIR, fonts: E.fonts.status(K), note: 'installed:false のフォントは「fetch」の値で komawari fonts fetch <値> を実行すると使えるようになります' };
    if (sub === 'fetch') {
      const ids = pos.slice(2);
      if (!ids.length) throw new UserError('取得するフォントIDを指定してください', '例: komawari fonts fetch base dela（全部なら all）');
      try { return { fontDir: E.fonts.FONT_DIR, fetched: await E.fonts.fetchFonts(ids) }; }
      catch (err) { throw new UserError(err.message, err.hint || 'ネットワークに接続できるか確認してください。プロキシ環境では HTTPS_PROXY と NODE_USE_ENV_PROXY=1 を設定します'); }
    }
    if (sub === 'add') {
      const proj = opt.project;
      if (!proj || proj === true) throw new UserError('--project <作品ファイル> を指定してください');
      E.loadProject(proj);
      const added = [];
      for (const f of pos.slice(2)) {
        const buf = fs.readFileSync(f), name = path.basename(f).replace(/\.[^.]+$/, '');
        const ext = path.extname(f).slice(1).toLowerCase(), src = `data:font/${ext};base64,` + buf.toString('base64');
        const ex = K.project.fonts.find(x => x.name === name);
        if (ex) ex.src = src; else K.project.fonts.push({ name, src });
        added.push({ name, use: `"font": "custom:${name}"` });
      }
      E.fonts.registerProjectFonts(K.project);
      return { file: E.saveProject(proj), added };
    }
    throw new UserError(`fonts ${sub} はありません`, 'komawari fonts / fonts fetch <id> / fonts add <file> --project <作品>');
  },
};
const ALIASES = { help: null, '--help': null };

async function main(argv) {
  const { pos, opt } = parseArgs(argv);
  const cmd = pos[0];
  const print = o => process.stdout.write((o.__raw != null ? o.__raw : JSON.stringify(o, null, opt.compact ? 0 : 2)) + '\n');
  if (opt.version) { print({ ok: true, version: VERSION }); return 0; }
  if (!cmd || opt.help || cmd in ALIASES) { process.stdout.write(USAGE + '\n'); return cmd || opt.help ? 0 : 2; }
  const fn = COMMANDS[cmd];
  if (!fn) { print({ ok: false, error: `コマンド「${cmd}」はありません`, hint: 'komawari --help でコマンド一覧を見られます' }); return 2; }
  try {
    const r = await fn(pos, opt);
    if (r && r.__raw != null) { print(r); return 0; }
    print(Object.assign({ ok: true }, r));
    return 0;
  } catch (err) {
    const o = { ok: false, error: err.message };
    if (err.hint) o.hint = err.hint;
    if (err.details && err.details.length > 1) o.details = err.details.slice(0, 30);
    if (!err.user) { o.error = '内部エラー: ' + err.message; if (process.env.KOMAWARI_DEBUG) o.stack = err.stack; }
    print(o);
    return 1;
  }
}
module.exports = { main, parseArgs };
