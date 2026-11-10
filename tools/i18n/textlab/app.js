// The text editor's page (tools/i18n/textlab.mjs serves it): the list of messages, the one being rewritten, and
// where it sits. Every keystroke is saved (after a pause); a save the server has not confirmed waits in this
// browser's storage and goes again, so an edit survives a closed tab or a stopped server.
import { parse, TYPE } from '@formatjs/icu-messageformat-parser';
import { pretty, same } from './pretty.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v); } e.append(...kids.flat().filter((x) => x != null)); return e; };
// (replaceChildren with what may be null)
const put = (node, ...kids) => node.replaceChildren(...kids.flat().filter((x) => x != null));

const AREAS = { meta: 'Page title and sharing', stage: 'The world', rail: 'Status rail', dock: 'Dock', settings: 'Settings', readout: 'Performance readout', ladder: 'Speed ladder', bench: 'Bench', tool: 'Tools', film: 'Filming', filming: 'Filming', highlight: 'Highlight', warm: 'Warm-up', maps: 'Maps', spec: 'Specimen', mind: 'Specimen: what it is doing', lab: 'Field Lab', census: 'Census', help: 'Keyboard help', card: 'Species card', intro: 'Intro', menu: 'Opening menu', linked: 'Shared card link', nogpu: 'No WebGPU / errors', fmt: 'Numbers and units', matter: 'Matter', cause: 'Causes', gloss: 'Glossary (hover hints)', guide: 'Field guide', chron: 'Chronicle (the log)', ach: 'Achievements', song: 'Songs', climate: 'Climate', mix: 'Audio mix', err: 'Errors', worlds: 'Saved worlds', log: 'Log', caption: 'Captions', flash: 'Flash messages', lineage: 'Lineage', chart: 'Charts', facet: 'Facets', minicard: 'Mini-cards', genome: 'Genome', cabinet: 'Cabinet', desktop: 'Desktop app', loader: 'Loading', notes: 'Live annotations', story: 'Specimen: its story', hand: 'The hand (tools)', speed: 'Speed', origin: 'Origins' };
const SINKS = { html: 'Visible text', textContent: 'Visible text', innerText: 'Visible text', innerHTML: 'Visible text (with markup)', '[aria-label]': 'Screen reader label', '[data-hint]': 'Hover hint', '[alt]': 'Image description', '[placeholder]': 'Placeholder', '[title]': 'Title', '[content]': 'Sharing preview', canvas: 'Drawn on a canvas', value: 'Text the code passes along', title: 'Title', placeholder: 'Placeholder', download: 'File name' };
const STATUS = { '': 'Not yet', draft: 'Draft', done: 'Done', kept: 'Kept', flagged: 'Needs a look', approved: 'Approved', promoted: 'In the page' };
const FILTERS = [['todo', 'To do'], ['draft', 'Draft'], ['done', 'Done'], ['flagged', 'Needs a look'], ['approved', 'Approved'], ['all', 'All']];

const S = { data: null, sel: null, filter: 'todo', area: '', q: '', visible: [], pending: load('textlab.pending', {}), saving: 0, lastSaved: null, error: null };
function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
function keep(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

const area = (id) => id.split('.')[0];
const statusOf = (id) => S.data.review[id]?.status || '';
const textOf = (id) => S.data.catalog[id] ?? S.data.source[id];

// ---- a message as plain words, values as ‹name› (the list) ----
function flat(els, pick = {}) {
  let s = '';
  for (const e of els) {
    if (e.type === TYPE.literal) s += e.value;
    else if (e.type === TYPE.argument || e.type === TYPE.number || e.type === TYPE.date || e.type === TYPE.time) s += `‹${e.value}›`;
    else if (e.type === TYPE.pound) s += '#';
    else if (e.type === TYPE.tag) s += flat(e.children, pick);
    else if (e.options) { const o = e.options[pick[e.value]] || e.options.other || Object.values(e.options)[0]; s += flat(o.value, pick); }
  }
  return s;
}
const flatOf = (m) => { try { return flat(parse(m)); } catch { return m; } };

// ---- a message drawn: values as chips, tags as marked runs; plural/select with the given choices ----
function draw(els, pick, n, onArg) {
  const out = [];
  for (const e of els) {
    if (e.type === TYPE.literal) out.push(document.createTextNode(e.value));
    else if (e.type === TYPE.pound) out.push(document.createTextNode(String(n ?? '#')));
    else if (e.type === TYPE.tag) {
      const t = el('span', { class: `tagged ${e.value}` }, draw(e.children, pick, n, onArg));
      out.push(t, el('span', { class: 'tagname', text: e.value }));
    } else if (e.type === TYPE.plural || e.type === TYPE.select) {
      const v = pick?.[e.value];
      let key = 'other';
      if (e.type === TYPE.plural && typeof v === 'number') key = e.options[`=${v}`] ? `=${v}` : new Intl.PluralRules('en', { type: e.pluralType || 'cardinal' }).select(v - (e.offset || 0));
      else if (v != null && e.options[v]) key = v;
      const o = e.options[key] || e.options.other;
      out.push(el('span', { class: 'branch', title: `${e.value}: ${key}` }, draw(o.value, pick, typeof v === 'number' ? v - (e.offset || 0) : n, onArg)));
    } else {
      const chip = onArg ? el('button', { type: 'button', class: 'arg', title: 'Insert into your text', onclick: () => onArg(e.value) }, e.value) : el('span', { class: 'arg' }, e.value);
      out.push(chip);
    }
  }
  return out;
}
// the choices worth showing: each plural at 1 and at 3 (and its exact cases), each select's options
function variants(els) {
  const dims = new Map();
  const walk = (xs) => { for (const e of xs) { if (e.type === TYPE.plural) { const v = new Set([1, 3]); for (const k of Object.keys(e.options)) if (k.startsWith('=')) v.add(+k.slice(1)); dims.set(e.value, [...v]); } else if (e.type === TYPE.select) dims.set(e.value, Object.keys(e.options)); if (e.children) walk(e.children); if (e.options) for (const o of Object.values(e.options)) walk(o.value); } };
  walk(els);
  let out = [{}];
  for (const [k, vs] of dims) { const next = []; for (const o of out) for (const v of vs) next.push({ ...o, [k]: v }); out = next.slice(0, 24); }
  return out;
}

// ---- saving ----
let timer = null;
function queueSave(id, text, status) {
  S.pending[id] = { text, status };
  keep('textlab.pending', S.pending);
  clearTimeout(timer);
  timer = setTimeout(flush, 450);
  showSaved();
}
async function flush() {
  const entries = Object.entries(S.pending);
  if (!entries.length) return;
  S.saving++;
  showSaved();
  for (const [id, { text, status }] of entries) {
    try {
      const r = await fetch('/api/msg', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, text, status }) });
      if (!r.ok) throw new Error(`the server said ${r.status}`);
      const res = await r.json();
      if (!res.ok) throw new Error(res.problems?.[0]?.msg || res.error || 'not saved');
      // (a newer edit to the same message may have come while this one went)
      if (S.pending[id]?.text === text && S.pending[id]?.status === status) delete S.pending[id];
      S.data.review[id] = res.review;
      if (text != null) { if (same(text, S.data.source[id])) delete S.data.catalog[id]; else S.data.catalog[id] = text; }
      if (id === S.sel) showProblems(res.problems);
      S.lastSaved = Date.now(); S.error = null;
      live('set', id, textOf(id));
      updateRow(id);
    } catch (e) { S.error = e.message; break; }
  }
  keep('textlab.pending', S.pending);
  S.saving--;
  showSaved();
  progress();
  if (S.error) { clearTimeout(timer); timer = setTimeout(flush, 4000); }
}
function showSaved() {
  const n = Object.keys(S.pending).length, s = $('saved');
  s.classList.toggle('bad', !!S.error);
  s.textContent = S.error ? `Not saved yet (${S.error}): ${n} edit${n === 1 ? '' : 's'} kept here, trying again` : n ? 'Saving…' : S.lastSaved ? `All changes saved · ${new Date(S.lastSaved).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'All changes saved';
}
addEventListener('beforeunload', (e) => { if (Object.keys(S.pending).length) { flush(); e.preventDefault(); } });

// ---- the list ----
function matches(id) {
  const st = statusOf(id);
  if (S.filter === 'todo' && ['done', 'kept', 'approved', 'promoted'].includes(st)) return false;
  if (S.filter === 'draft' && st !== 'draft') return false;
  if (S.filter === 'done' && st !== 'done' && st !== 'kept') return false;
  if (S.filter === 'flagged' && st !== 'flagged' && !openFindings(id).length) return false;
  if (S.filter === 'approved' && st !== 'approved' && st !== 'promoted') return false;
  if (S.area && area(id) !== S.area) return false;
  if (S.q) { const q = S.q.toLowerCase(); if (!id.toLowerCase().includes(q) && !S.data.source[id].toLowerCase().includes(q) && !(S.data.catalog[id] || '').toLowerCase().includes(q)) return false; }
  return true;
}
const openFindings = (id) => (S.data.review[id]?.findings || []).filter((f) => !f.resolved && !f.stale && f.level !== 'ok');
function renderList() {
  const list = $('list');
  list.textContent = '';
  S.visible = S.data.order.filter(matches);
  let cur = null, grp = null, count = 0;
  const frag = document.createDocumentFragment();
  const close = () => { if (grp) grp.lastChild.textContent = count; };
  for (const id of S.visible) {
    const a = area(id);
    if (a !== cur) { close(); cur = a; count = 0; grp = el('li', { class: 'grp' }, el('span', { text: AREAS[a] || a }), el('span')); frag.append(grp); }
    count++;
    frag.append(row(id));
  }
  close();
  list.append(frag);
  if (!S.visible.length) list.append(el('li', { class: 'grp', text: 'Nothing here' }));
}
function row(id) {
  const st = statusOf(id);
  return el('li', { class: 'it', 'data-id': id, 'aria-current': String(id === S.sel), onclick: () => select(id) },
    el('span', { class: `dot st-${st}`, title: STATUS[st] }), el('div', { class: 't', text: flatOf(textOf(id)) }), el('div', { class: 'i', text: id }));
}
function updateRow(id) {
  const old = $('list').querySelector(`.it[data-id="${CSS.escape(id)}"]`);
  if (old) old.replaceWith(row(id));
}
function progress() {
  const order = S.data.order, n = order.length;
  const c = { approved: 0, done: 0, kept: 0, draft: 0, flagged: 0, promoted: 0 };
  for (const id of order) { const s = statusOf(id); if (s in c) c[s]++; }
  const bar = $('bar');
  bar.textContent = '';
  for (const [k, v] of [['promoted', 'var(--ok)'], ['approved', 'var(--ok)'], ['done', 'var(--done)'], ['kept', 'var(--kept)'], ['flagged', 'var(--err)'], ['draft', 'var(--warn)']]) bar.append(el('i', { style: `width:${(100 * c[k]) / n}%;background:${v}` }));
  const finished = c.approved + c.done + c.kept + c.promoted;
  $('prog-t').textContent = `${finished.toLocaleString()} of ${n.toLocaleString()} settled · ${c.draft} draft${c.flagged ? ` · ${c.flagged} need a look` : ''}`;
}

// ---- one message ----
function select(id, { focus = true } = {}) {
  if (!S.data.source[id]) return;
  if (S.sel && S.pending[S.sel]) flush();
  S.sel = id;
  history.replaceState(null, '', `#${encodeURIComponent(id)}`);
  for (const r of $('list').querySelectorAll('.it[aria-current="true"]')) r.setAttribute('aria-current', 'false');
  const r = $('list').querySelector(`.it[data-id="${CSS.escape(id)}"]`);
  if (r) { r.setAttribute('aria-current', 'true'); r.scrollIntoView({ block: 'nearest' }); }
  $('empty').hidden = true; $('msg').hidden = false;
  const src = S.data.source[id], ctx = S.data.context[id] || { refs: [] };
  $('m-area').textContent = AREAS[area(id)] || area(id);
  $('m-id').textContent = id;
  setStatus(id);
  const sinks = area(id) === 'gloss' ? ['Hover hint over a dotted term'] : [...new Set(ctx.refs.map((r) => SINKS[r.sink] || r.sink))];
  put($('m-sinks'), ...sinks.map((s) => el('span', { text: s })), ctx.refs.length > 1 ? el('span', { text: `used in ${ctx.refs.length} places` }) : null);
  const note = ctx.refs.map((r) => r.note).filter(Boolean).join(' ');
  $('m-note').hidden = !note; $('m-note').textContent = note;
  let ast = null;
  try { ast = parse(src); } catch {}
  const insert = (name) => { const ta = $('m-text'); const s = ta.selectionStart, e = ta.selectionEnd; ta.setRangeText(`{${name}}`, s, e, 'end'); ta.focus(); onInput(); };
  // (a message with choices shows them all, as laid out for editing; the rest drawn with their values as chips)
  const choices = /\{\s*\w+\s*,\s*(plural|select|selectordinal)\s*,/.test(src);
  $('m-orig').classList.toggle('raw', choices);
  $('m-orig').replaceChildren(...(!ast ? [src] : choices ? pretty(src).split(/(\{\w+\}|#)/).map((x) => (/^\{\w+\}$/.test(x) ? el('button', { type: 'button', class: 'arg', title: 'Insert into your text', onclick: () => insert(x.slice(1, -1)) }, x.slice(1, -1)) : document.createTextNode(x))) : draw(ast, {}, null, insert)));
  const args = new Set();
  const walk = (xs) => { for (const e of xs || []) { if (e.type !== TYPE.literal && e.type !== TYPE.pound && e.type !== TYPE.tag) args.add(e.value); walk(e.children); if (e.options) for (const o of Object.values(e.options)) walk(o.value); } };
  walk(ast);
  $('m-args').replaceChildren(...(args.size ? [el('span', { class: 'cap', text: 'Values it is given: ' }), ...[...args].map((a) => el('button', { type: 'button', class: 'arg', title: 'Insert', onclick: () => insert(a) }, `{${a}}`))] : []));
  const ta = $('m-text');
  ta.value = pretty(textOf(id));
  autosize();
  showProblems([]);
  preview();
  findings(id);
  hist(id);
  where(id);
  if (focus) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}
function setStatus(id) {
  const st = statusOf(id), p = $('m-status');
  p.className = `pill st-${st}`; p.textContent = STATUS[st];
}
function autosize() { const ta = $('m-text'); ta.style.height = 'auto'; ta.style.height = `${Math.min(innerHeight * 0.5, ta.scrollHeight + 4)}px`; }
function localProblems(text) {
  try { parse(text); return []; } catch (e) { return [{ level: 'error', msg: `Not a valid message: ${e.message.replace(/_/g, ' ').toLowerCase()}. A { or } meant as text is written '{' and '}'.` }]; }
}
function showProblems(list) {
  $('m-probs').replaceChildren(...list.map((p) => el('div', { class: p.level, text: `${p.level === 'error' ? '✖' : '⚠'} ${p.msg}` })));
}
function onInput() {
  const id = S.sel, text = $('m-text').value;
  autosize();
  const local = localProblems(text);
  showProblems(local);
  preview();
  if (local.length) return; // (an unfinished brace: saved once it parses; the draft stays in this browser)
  const st = statusOf(id);
  queueSave(id, text, same(text, S.data.source[id]) && !S.data.catalog[id] && !st ? undefined : 'draft');
  if (statusOf(id) !== 'draft') { S.data.review[id] = { ...(S.data.review[id] || {}), status: 'draft' }; setStatus(id); updateRow(id); }
}
function preview() {
  const text = $('m-text').value;
  let ast;
  try { ast = parse(text); } catch { $('m-preview').replaceChildren(); return; }
  const vs = variants(ast);
  put($('m-preview'), ...vs.map((pick) => el('div', { class: 'v' },
    Object.keys(pick).length ? el('span', { class: 'when', text: Object.entries(pick).map(([k, v]) => `${k} = ${v}`).join(', ') }) : null,
    ...draw(ast, pick, null))));
  $('m-preview-wrap').hidden = !text.trim();
}
function findings(id) {
  const list = S.data.review[id]?.findings || [];
  $('m-findings-wrap').hidden = !list.length;
  put($('m-findings'), ...list.map((f, i) => el('div', { class: `f ${f.level || 'warn'}${f.resolved || f.stale ? ' resolved' : ''}` },
    el('div', { class: 'k', text: `${f.kind || 'review'}${f.by ? ` · ${f.by}` : ''}${f.resolved ? ' · resolved' : f.stale ? ' · text changed since' : ''}` }),
    el('div', { class: 's', text: f.msg }),
    f.suggest ? el('div', { class: 's' }, 'Suggested: ', el('code', { text: f.suggest })) : null,
    f.reply ? el('div', { class: 's', text: `You: ${f.reply}` }) : null,
    !f.resolved ? el('div', { class: 'fa' },
      f.suggest ? el('button', { type: 'button', onclick: () => { $('m-text').value = f.suggest; onInput(); answer(id, i, true, 'took the suggestion'); } }, 'Use suggestion') : null,
      el('button', { type: 'button', onclick: () => answer(id, i, true, 'fixed') }, 'Fixed'),
      el('button', { type: 'button', onclick: () => { const why = prompt('Why keep it as it is? (optional)') ?? null; if (why !== null) answer(id, i, true, why || 'kept as written'); } }, 'Keep mine')) : null)));
}
async function answer(id, index, resolved, reply) {
  const r = await fetch('/api/finding', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, index, resolved, reply }) }).then((x) => x.json());
  if (r.ok) { S.data.review[id] = r.review; if (id === S.sel) findings(id); updateRow(id); }
}
function hist(id) {
  const prev = S.data.review[id]?.prev || [];
  $('m-hist-wrap').hidden = !prev.length;
  put($('m-hist'), ...prev.map((p) => el('li', { title: 'Put this version back', onclick: () => { $('m-text').value = p.text; onInput(); } }, flatOf(p.text), p.at ? el('span', { class: 'cap', text: `  · ${new Date(p.at).toLocaleString()}` }) : null)));
}

function next(dir = 1, { unsettled = false } = {}) {
  const v = S.visible.length ? S.visible : S.data.order;
  let i = v.indexOf(S.sel);
  for (let k = 0; k < v.length; k++) {
    i = (i + dir + v.length) % v.length;
    const st = statusOf(v[i]);
    if (!unsettled || !['done', 'kept', 'approved', 'promoted'].includes(st)) return select(v[i]);
  }
}
function settle(status) {
  const id = S.sel, text = $('m-text').value;
  if (localProblems(text).length) { $('m-text').focus(); return; }
  if (status === 'kept') { $('m-text').value = S.data.source[id]; queueSave(id, S.data.source[id], 'kept'); }
  else queueSave(id, text, same(text, S.data.source[id]) ? 'kept' : 'done');
  S.data.review[id] = { ...(S.data.review[id] || {}), status: status === 'kept' || same(text, S.data.source[id]) ? 'kept' : 'done' };
  setStatus(id); updateRow(id); progress();
  flush();
  next(1, { unsettled: true });
}

// ---- where it sits ----
const STATE_NAMES = (s) => s.replace(/^laptop\./, 'Laptop · ').replace(/^phone\./, 'Phone · ').replace(/-/g, ' ');
const shotCache = new Map();
const image = (st) => { if (!shotCache.has(st)) { const im = new Image(); im.src = `/shots/${st}.png`; shotCache.set(st, new Promise((res) => { im.onload = () => res(im); im.onerror = () => res(null); })); } return shotCache.get(st); };
async function where(id) {
  const at = S.data.shots.at?.[id] || [];
  const box = $('w-shots');
  box.replaceChildren();
  $('w-cap').textContent = at.length ? '' : S.data.shots.taken ? 'Not seen on the tour of the page: it shows in moments the tour does not reach (a story in the log, an error, a rare state). The code below says when.' : 'No screenshots yet: Capture runs a tour of the page (several minutes) and shows where each message sits.';
  const job = S.data.shots.job, active = job && !job.done;
  if (active) $('w-cap').textContent = `Capturing: ${job.log?.at(-1) || 'starting'}`;
  else if (job?.error) $('w-cap').textContent = `Capture failed: ${job.error}. ${job.log?.join('\n') || ''}`;
  box.append(el('button', { type: 'button', onclick: capture, disabled: !!active }, active ? 'Capturing…' : S.data.shots.taken ? 'Recapture screenshots' : 'Capture screenshots'));
  for (const [st, b, attr] of at) {
    const im = await image(st);
    if (!im || S.sel !== id) continue;
    const dpr = st.startsWith('phone.') ? 2 : 1;
    const [x, y, w, h] = b.map((v) => v * dpr);
    // a window around the box, at least 420×240, inside the shot
    const W = Math.min(im.width, Math.max(420 * dpr, w + 160 * dpr)), H = Math.min(im.height, Math.max(240 * dpr, h + 120 * dpr));
    const sx = Math.max(0, Math.min(im.width - W, x + w / 2 - W / 2)), sy = Math.max(0, Math.min(im.height - H, y + h / 2 - H / 2));
    const cv = el('canvas', { width: W, height: H });
    const g = cv.getContext('2d');
    g.drawImage(im, sx, sy, W, H, 0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, W, H);
    g.drawImage(im, x - 2, y - 2, w + 4, h + 4, x - sx - 2, y - sy - 2, w + 4, h + 4);
    g.strokeStyle = '#ffcf4a'; g.lineWidth = 2 * dpr; g.strokeRect(x - sx - 3, y - sy - 3, w + 6, h + 6);
    cv.onclick = () => { const z = el('div', { class: 'zoom', onclick: () => z.remove() }); const big = el('canvas', { width: im.width, height: im.height }); const bg = big.getContext('2d'); bg.drawImage(im, 0, 0); bg.strokeStyle = '#ffcf4a'; bg.lineWidth = 3 * dpr; bg.strokeRect(x - 4, y - 4, w + 8, h + 8); z.append(big); document.body.append(z); };
    const how = attr === 'data-tip' ? 'the hint over this term' : attr === 'data-hint' ? 'its hover hint' : attr === 'aria-label' ? 'its screen reader label' : attr === 'canvas' ? 'drawn here' : '';
    box.append(el('div', { class: 'shot' }, el('div', { class: 'lbl' }, el('span', { text: STATE_NAMES(st) }), how ? el('span', { text: how }) : null), cv));
  }
  const refs = S.data.context[id]?.refs || [];
  put($('w-refs'), ...refs.map((r) => el('div', { class: 'ref' },
    el('div', { class: 'where' }, el('a', { href: `vscode://file/${S.root}/${r.file}:${r.line}`, text: `${r.file}:${r.line}` }), r.fn ? el('code', { text: `${r.fn}()` }) : null, el('span', { class: 'cap', text: SINKS[r.sink] || r.sink })),
    r.code ? el('pre', { text: r.code }) : null)));
}
let capturePoll = null;
function pollCapture() {
  clearTimeout(capturePoll);
  capturePoll = setTimeout(async () => {
    try {
      const r = await fetch('/api/state');
      if (!r.ok) throw new Error(`Status request failed (${r.status})`);
      const d = await r.json();
      S.data.shots = d.shots;
      if (!d.shots.job || d.shots.job.done) shotCache.clear();
      if (S.sel) where(S.sel);
      if (d.shots.job && !d.shots.job.done) pollCapture();
    } catch (e) {
      $('w-cap').textContent = `Cannot check capture: ${e.message}. Retrying…`;
      pollCapture();
    }
  }, 3000);
}
async function capture() {
  try {
    const r = await fetch('/api/capture', { method: 'POST' });
    if (!r.ok) throw new Error(`Capture request failed (${r.status})`);
    S.data.shots.job = { started: Date.now() };
    if (S.sel) where(S.sel);
    pollCapture();
  } catch (e) { $('w-cap').textContent = e.message; }
}

// ---- the live page ----
const frame = $('live');
function live(kind, id, text) { try { frame.contentWindow?.postMessage({ kind: `textlab-${kind}`, id, text }, location.origin); } catch {} }
addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.data?.kind !== 'textlab-pick') return;
  const ids = e.data.ids.filter((x) => S.data.source[x]);
  if (!ids.length) return;
  if (!S.visible.includes(ids[0])) { S.filter = 'all'; S.area = ''; S.q = ''; $('q').value = ''; $('area').value = ''; chips(); renderList(); }
  select(ids[0]);
  if (ids.length > 1) $('m-note').hidden = false, $('m-note').textContent = `That spot shows ${ids.length} messages: ${ids.join(', ')}. Showing the first; Alt-click again on the others' words, or search for their ids.`;
});
function tab(which) {
  $('tab-where').setAttribute('aria-selected', String(which === 'where'));
  $('tab-live').setAttribute('aria-selected', String(which === 'live'));
  $('pane-where').hidden = which !== 'where';
  $('pane-live').hidden = which !== 'live';
  if (which === 'live' && !frame.src) frame.src = '/preview';
  keep('textlab.tab', which);
}
$('tab-where').onclick = () => tab('where');
$('tab-live').onclick = () => tab('live');
$('b-rebuild').onclick = async (e) => { e.target.disabled = true; e.target.textContent = 'Building…'; await flush(); await fetch('/api/rebuild', { method: 'POST' }); frame.src = '/preview'; e.target.disabled = false; e.target.textContent = 'Rebuild with my text'; };

// ---- wiring ----
function chips() {
  $('st-chips').replaceChildren(...FILTERS.map(([k, l]) => el('button', { type: 'button', 'aria-pressed': String(S.filter === k), onclick: () => { S.filter = k; keep('textlab.filter', k); chips(); renderList(); } }, l)));
}
$('q').addEventListener('input', () => { S.q = $('q').value.trim(); renderList(); });
$('area').addEventListener('change', () => { S.area = $('area').value; renderList(); });
$('m-text').addEventListener('input', onInput);
$('b-done').onclick = () => settle('done');
$('b-keep').onclick = () => settle('kept');
$('b-reset').onclick = () => { $('m-text').value = pretty(S.data.source[S.sel]); onInput(); };
$('b-next').onclick = () => next(1);
$('b-prev').onclick = () => next(-1);
$('help-btn').onclick = () => $('help').showModal();
addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === 'Enter' && S.sel) { e.preventDefault(); settle('done'); }
  else if (mod && (e.key === 'k' || e.key === 'K') && S.sel) { e.preventDefault(); settle('kept'); }
  else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); next(1); }
  else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); next(-1); }
  else if (e.key === '/' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); $('q').focus(); }
});

async function start() {
  const d = await fetch('/api/state').then((r) => r.json());
  S.data = d;
  S.root = d.root || '';
  S.filter = load('textlab.filter', 'todo');
  const areas = [...new Set(d.order.map(area))];
  $('area').replaceChildren(el('option', { value: '', text: 'Every area' }), ...areas.map((a) => el('option', { value: a, text: `${AREAS[a] || a} (${d.order.filter((x) => area(x) === a).length})` })));
  chips();
  renderList();
  progress();
  // edits this browser kept but the server never confirmed: send them now
  if (Object.keys(S.pending).length) { for (const [id, p] of Object.entries(S.pending)) { if (p.text != null) S.data.catalog[id] = p.text; } flush(); }
  showSaved();
  if (d.errors?.length) $('saved').textContent = `The source has ${d.errors.length} message errors (see the server's output)`;
  const want = decodeURIComponent(location.hash.slice(1));
  if (want && d.source[want]) select(want, { focus: false }); else if (S.visible[0]) select(S.visible[0], { focus: false });
  tab(load('textlab.tab', 'where'));
  if (d.shots.job && !d.shots.job.done) pollCapture();
}
addEventListener('hashchange', () => { const id = decodeURIComponent(location.hash.slice(1)); if (id !== S.sel && S.data?.source[id]) select(id); });
start();
