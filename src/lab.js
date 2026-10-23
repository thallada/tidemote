import { GUIDE } from './guide.js';
import { fmt, fmtClock, esc, cssCol, term, spLink, ROLE, LIVING_CSS } from './fmt.js';
import { voiceOf } from './audio/mapping.js';
import { sigilSVG } from './song.js';
import { drawLines, drawNiches, sparkPath, onTap } from './charts.js';
import { lineageModel, cut } from './lineage/model.js';
import { drawMuller, drawTree, layoutTree } from './lineage/draw.js';
import { HEAT_BINS, HEAT_BIN, THERMAL_LEDGER } from './shaders.js';
import { block, disclosure, wireDisclosures } from './ui.js';

/**
 * The Field Lab: the left column. Its Census is what the world is made of and what has happened;
 * the other sections are the records. It collapses to its header. Each section is built once and
 * then updated in place, so controls never vanish under the pointer and lists keep their scroll
 * position.
 */
export function createLab(api) {
  const $ = (id) => document.getElementById(id);
  const root = $('lab'), bodyEl = $('lab-body'), tabs = [...root.querySelectorAll('[data-tab]')], fold = $('lab-close');
  const st = {
    open: api.startOpen, tab: 'census',
    q: '', status: 'thriving', diet: 'all', mobility: 'all', body: 'all', temp: 'all', sort: 'pop',
    linAll: true, linSpan: 'all', linK: 30, linRoot: null, logType: 'all', logQ: '',
    open_: { diet: true }, // census disclosures (by data-disc key), the others folded
  };
  const panes = {};
  let lastUpdate = 0;

  function apply() {
    root.classList.toggle('closed', !st.open);
    root.dataset.tab = st.tab;
    document.body.classList.toggle('lab-open', st.open);
    document.body.classList.toggle('lab-wide', st.open && st.tab !== 'census');
    fold.setAttribute('aria-expanded', String(st.open));
    fold.setAttribute('aria-label', st.open ? 'Collapse the Lab' : 'Open the Lab');
    fold.dataset.hint = st.open ? 'Collapse · K' : 'Open the Lab · K';
    $('lab-open').setAttribute('aria-expanded', String(st.open));
  }
  function open(tab) {
    if (tab) st.tab = tab;
    const was = st.open;
    st.open = true;
    apply();
    show();
    if (!was) api.onFold(true);
  }
  // keep: folded for a moment (the auto camera), not by the reader
  function close({ keep = false } = {}) {
    if (!st.open) return;
    st.open = false;
    apply();
    api.onFold(false, keep);
  }
  function toggle(tab) { if (st.open && (!tab || tab === st.tab)) close(); else open(tab); }
  fold.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  // the whole title bar folds and opens it, not only its chevron (which handles its own click)
  root.querySelector('.lab-title').addEventListener('click', (e) => { if (!e.target.closest('button')) toggle(); });
  tabs.forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.tab; apply(); show(); }));
  $('lab-tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = tabs.findIndex((b) => b.dataset.tab === st.tab);
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    e.preventDefault(); n.click(); n.focus();
  });

  function show() {
    tabs.forEach((b) => { const on = b.dataset.tab === st.tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    for (const [k, p] of Object.entries(panes)) p.el.hidden = k !== st.tab;
    $('pane-census').hidden = st.tab !== 'census'; // part of the page, built or not
    if (!panes[st.tab]) {
      const p = builders[st.tab]();
      panes[st.tab] = p;
      if (!p.el.parentNode) bodyEl.append(p.el);
    }
    panes[st.tab].update(true);
    tabs.find((b) => b.dataset.tab === st.tab)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // a pane: optional fixed controls on top, a scrolling area below
  function pane(ctlHtml, cls = '') {
    const el = document.createElement('div');
    el.className = `pane ${cls}`;
    el.innerHTML = `${ctlHtml ? `<div class="pane-ctl">${ctlHtml}</div>` : ''}<div class="scroll"></div>`;
    return { el, ctl: el.querySelector('.pane-ctl'), scroll: el.querySelector('.scroll') };
  }
  const chips = (key, opts, cur) => opts.map(([v, l]) => `<button type="button" class="chip" data-k="${key}" data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join('');
  const pressChips = (ctl, key) => ctl.querySelectorAll(`[data-k="${key}"]`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st[key])));
  // the pointer is inside: hold the order still so rows don't move under it
  const hovering = (el) => el.matches(':hover');

  // ---------------------------------------------------------- species
  const DIETS = [['all', 'Any'], ['photosynth', 'Photosynth'], ['grazer', 'Grazer'], ['scavenger', 'Scavenger'], ['predator', 'Predator']];
  const MOBS = [['all', 'Any'], ['anchored', 'Anchored'], ['crawler', 'Crawler'], ['swimmer', 'Swimmer'], ['drifter', 'Drifter']];
  // by preferred temperature (thermalGuild): cold-loving, temperate, warmth-loving and thermophile
  const TEMPS = [['all', 'Any'], ['cold-loving', 'Cold'], ['temperate', 'Temperate'], ['warmth-loving', 'Warm'], ['thermophile', 'Hot']];
  const SORTS = { pop: 'Population', peak: 'Peak', newest: 'Newest', oldest: 'Oldest', depth: 'Mutations', swim: 'Swimming', size: 'Size', ...(api.eng.K.heat ? { warm: 'Warmest' } : {}) };
  function matches(sp, F) {
    const f = api.facets(sp.genome);
    if (F.status === 'thriving' && !(sp.alive && sp.established)) return false;
    if (F.status === 'alive' && !sp.alive) return false;
    if (F.status === 'extinct' && sp.alive) return false;
    if (F.diet !== 'all' && f.diet !== F.diet) return false;
    if (F.mobility !== 'all' && f.mobility !== F.mobility) return false;
    if (F.body !== 'all' && f.body !== F.body) return false;
    if (F.temp !== 'all' && f.temp !== F.temp) return false;
    if (F.q && !sp.name.toLowerCase().includes(F.q.toLowerCase())) return false;
    return true;
  }
  const BY = {
    pop: (a, b) => b.pop - a.pop || b.peak - a.peak, peak: (a, b) => b.peak - a.peak,
    newest: (a, b) => b.born - a.born, oldest: (a, b) => a.born - b.born,
    depth: (a, b) => b.genome.depth - a.genome.depth, size: (a, b) => b.genome.size - a.genome.size,
    swim: (a, b) => b.genome.swim * (1 - b.genome.photo) - a.genome.swim * (1 - a.genome.photo),
    warm: (a, b) => b.genome.topt - a.genome.topt,
  };
  function buildSpecies() {
    // the filters: one segmented row each, under a fixed label column
    const seg = (label, key, opts) => `<span class="lbl">${label}</span><div class="segs" role="group" aria-label="${key}">${chips(key, opts, st[key])}</div>`;
    const p = pane(`<div class="qrow"><input type="search" id="lab-q" placeholder="Search by name" aria-label="Search species by name" autocomplete="off"><button type="button" class="chip filt" id="sp-filt" aria-expanded="false" aria-controls="sp-filters">Filters</button></div><div class="filters" id="sp-filters">
      ${seg('Status', 'status', [['thriving', 'Thriving'], ['alive', 'Living'], ['extinct', 'Extinct'], ['all', 'Any']])}
      ${seg(term('diet', 'Diet'), 'diet', DIETS)}
      ${seg('Moves', 'mobility', MOBS)}
      ${seg(term('organism', 'Body'), 'body', [['all', 'Any'], ['multicellular', 'Multicellular'], ['single-cell', 'Single-cell']])}
      ${api.eng.K.heat ? seg(term('optimum', 'Temp'), 'temp', TEMPS) : ''}</div>
      <div class="sum"><span><span id="sp-sum"></span><button type="button" class="link" id="sp-reset" hidden>Reset</button></span><span class="sel"><label class="lbl" for="sp-sort">Sort</label><select id="sp-sort">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><button type="button" class="chip" id="sp-hl">Highlight these</button></span></div>`);
    const list = document.createElement('ol');
    list.className = 'splist';
    p.scroll.append(list);
    const rows = new Map();
    const more = document.createElement('li');
    more.className = 'more';
    const q = p.ctl.querySelector('#lab-q');
    q.addEventListener('input', () => { st.q = q.value; update(true); });
    q.addEventListener('keydown', (e) => { if (e.key === 'Escape' && q.value) { e.stopPropagation(); q.value = ''; st.q = ''; update(true); } });
    const sort = p.ctl.querySelector('#sp-sort');
    sort.addEventListener('change', () => { st.sort = sort.value; sort.blur(); update(true); });
    p.ctl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (b) { st[b.dataset.k] = b.dataset.v; pressChips(p.ctl, b.dataset.k); update(true); return; }
      if (e.target.closest('#sp-reset')) {
        Object.assign(st, { status: 'thriving', diet: 'all', mobility: 'all', body: 'all', temp: 'all' });
        ['status', 'diet', 'mobility', 'body', 'temp'].forEach((k) => pressChips(p.ctl, k));
        update(true);
        return;
      }
      const ft = e.target.closest('#sp-filt');
      if (ft) { const on = !p.ctl.classList.contains('open'); p.ctl.classList.toggle('open', on); ft.setAttribute('aria-expanded', String(on)); return; }
      if (e.target.closest('#sp-hl')) {
        const F = { ...st };
        const parts = [F.status !== 'all' ? F.status : '', F.diet !== 'all' ? F.diet : '', F.mobility !== 'all' ? F.mobility : '', F.body !== 'all' ? F.body : '', F.temp !== 'all' ? F.temp : '', F.q ? `“${F.q}”` : ''].filter(Boolean);
        api.focusPredicate(`Species: ${parts.join(' · ') || 'all'}`, (g, sp) => !!sp && sp.alive && matches(sp, F));
      }
    });
    list.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-serial]');
      if (li && !e.target.closest('a.sp')) api.openSpecies(+li.dataset.serial);
    });
    list.addEventListener('keydown', (e) => {
      const li = e.target.closest('li[data-serial]');
      if (li && (e.key === 'Enter' || e.key === ' ') && e.target === li) { e.preventDefault(); api.openSpecies(+li.dataset.serial); }
    });
    function row(sp) {
      let r = rows.get(sp.serial);
      if (!r) {
        const li = document.createElement('li');
        li.dataset.serial = sp.serial;
        li.tabIndex = 0;
        const f = api.facets(sp.genome);
        li.innerHTML = `<span class="spsig term" data-tip="sigil">${sigilSVG(voiceOf(sp.genome), sp.genome, { size: 26 })}</span><div class="spmain">${spLink(sp.serial, sp.name)}<small>${f.diet} · ${f.mobility} · ${f.body}</small></div><svg viewBox="0 0 78 22" class="spark" aria-hidden="true"><path stroke="${cssCol(sp.genome.col)}"/></svg><div class="spnum"><b></b><span></span></div>`;
        r = { li, path: li.querySelector('path'), b: li.querySelector('.spnum b'), s: li.querySelector('.spnum span'), key: '' };
        rows.set(sp.serial, r);
      }
      return r;
    }
    let sparkAt = 0;
    function update(force) {
      const life = api.life();
      const living = Math.max(1, life.counts[3]);
      const all = [...life.reg.values()].filter((sp) => matches(sp, st)).sort(BY[st.sort]);
      const shown = all.slice(0, 150);
      const tot = all.reduce((a, s) => a + s.pop, 0);
      $('sp-sum').textContent = `${fmt(all.length)} species · ${fmt(tot)} cells · ${((tot / living) * 100).toFixed(1)}% of life`;
      const nf = ['status', 'diet', 'mobility', 'body'].filter((k) => st[k] !== (k === 'status' ? 'thriving' : 'all')).length;
      $('sp-filt').textContent = nf ? `Filters · ${nf}` : 'Filters';
      $('sp-reset').hidden = !nf;
      const now = performance.now();
      const sparks = force || now - sparkAt > 3000;
      if (sparks) sparkAt = now;
      const hl = api.focusKey();
      const keep = !force && hovering(list);
      if (!keep) {
        const want = new Set(shown.map((s) => s.serial));
        for (const [k, r] of rows) if (!want.has(k)) { r.li.remove(); rows.delete(k); }
      }
      let prev = null;
      for (const sp of shown) {
        const known = rows.has(sp.serial);
        if (keep && !known) continue;
        const r = row(sp);
        const share = sp.alive ? `${((sp.pop / living) * 100).toFixed(1)}%` : `ended ${fmtClock(sp.extinct ?? 0)}`;
        const k = `${sp.pop}|${share}`;
        if (k !== r.key) { r.key = k; r.b.textContent = sp.alive ? fmt(sp.pop) : '–'; r.s.textContent = share; }
        r.li.classList.toggle('gone', !sp.alive);
        r.li.classList.toggle('hl', hl === `sp:${sp.serial}`);
        if (sparks || !known) r.path.setAttribute('d', sparkPath(life.history, sp.serial, 78, 22));
        if (!keep) {
          const at = prev ? prev.nextSibling : list.firstChild;
          if (at !== r.li) list.insertBefore(r.li, at);
          prev = r.li;
        }
      }
      if (!keep) {
        more.textContent = all.length > 150 ? `${fmt(all.length - 150)} more; narrow the filters to see them.` : all.length ? '' : 'No species match these filters.';
        if (more.textContent) list.append(more); else more.remove();
      }
    }
    return { ...p, update };
  }

  // ---------------------------------------------------------- lineage
  // The world's lineages (src/lineage/): a Muller plot of the few dozen that held the most life in
  // the span shown, every other species counted with its nearest shown ancestor, over the tree of
  // the same lineages. Narrowing the span (drag across the plot) or following one lineage (its pill)
  // recuts it, so finer lineages appear; every species is a few steps away.
  function buildLineage() {
    const seg = (label, key, opts) => `<span class="lbl">${label}</span><div class="segs" role="group" aria-label="${label}">${chips(key, opts, String(st[key]))}</div>`;
    const p = pane(`<div class="filters">
      ${seg('Show', 'linAll', [['true', 'Every lineage'], ['false', 'Living lineages']])}
      ${seg('Span', 'linSpan', [['all', 'Whole world'], ['3600', 'Last hour'], ['600', 'Last 10 min']])}
      ${seg('Rows', 'linK', [['15', '15'], ['30', '30'], ['60', '60']])}</div>
      <div class="sum"><span><span id="lin-sum"></span><button type="button" class="link" id="lin-back" hidden>All lineages</button></span><span class="lbl lin-key">Height: cells · drag to zoom</span><button type="button" class="chip filt" id="lin-filt" aria-expanded="false">Options</button></div>
      <div class="lin-muller"><canvas id="lin-muller" aria-label="Cells by lineage over time"></canvas><div class="lin-brush" hidden></div></div>`, 'lineage');
    const treeCv = document.createElement('canvas');
    treeCv.className = 'lin-tree';
    treeCv.id = 'lin-tree';
    const list = document.createElement('ul');
    list.className = 'sr-only';
    list.setAttribute('aria-label', 'Lineages');
    const empty = document.createElement('p');
    empty.className = 'note';
    empty.textContent = 'Lineages appear here once species become established.';
    p.scroll.append(empty, treeCv, list);
    const mCv = p.ctl.querySelector('#lin-muller'), brush = p.ctl.querySelector('.lin-brush');
    let model = null, modelKey = '', c = null, box = null, lay = null, eras = [], lastAt = 0, lastKey = '';
    const press = (k) => p.ctl.querySelectorAll(`[data-k="${k}"]`).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === String(st[k]))));
    p.ctl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (b) {
        const k = b.dataset.k;
        st[k] = k === 'linAll' ? b.dataset.v === 'true' : k === 'linK' ? +b.dataset.v : b.dataset.v;
        press(k);
        update(true);
        return;
      }
      const ft = e.target.closest('#lin-filt');
      if (ft) { const on = !p.ctl.classList.contains('open'); p.ctl.classList.toggle('open', on); ft.setAttribute('aria-expanded', String(on)); return; }
      if (e.target.closest('#lin-back')) { st.linRoot = null; st.linSpan = 'all'; press('linSpan'); update(true); }
    });
    // the span on show: the whole world, the last stretch of it, a dragged window, or a followed lineage's life
    function span(T) {
      if (Array.isArray(st.linSpan)) return st.linSpan;
      if (st.linSpan !== 'all') return [Math.max(0, T - +st.linSpan), T];
      const r = rootStrand();
      if (r) { const pad = (Math.min(T, r.end) - r.born) * 0.02; return [Math.max(0, r.born - pad), Math.min(T, r.end + pad)]; }
      return [0, T];
    }
    const rootStrand = () => (st.linRoot != null && model && model.bySerial.get(st.linRoot) ? model.bySerial.get(st.linRoot).strand : null);
    const tAt = (px) => (box && c ? c.t0 + Math.max(0, Math.min(1, (px - box.l) / (box.r - box.l))) * (c.t1 - c.t0) : 0);
    // a drag across the plot narrows the span to it
    let drag = null;
    mCv.addEventListener('pointerdown', (e) => { if (e.button === 0 && box) { drag = { x: e.offsetX, moved: false, id: e.pointerId }; } });
    mCv.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && Math.abs(e.offsetX - drag.x) <= 8) return;
      if (!drag.moved) { drag.moved = true; mCv.setPointerCapture(e.pointerId); }
      const a = Math.max(box.l, Math.min(drag.x, e.offsetX)), b = Math.min(box.r, Math.max(drag.x, e.offsetX));
      Object.assign(brush.style, { left: `${a}px`, width: `${b - a}px`, top: `${box.t}px`, height: `${box.b - box.t}px` });
      brush.hidden = false;
    });
    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      brush.hidden = true;
      if (d.moved && e.type === 'pointerup') {
        const t0 = tAt(Math.min(d.x, e.offsetX)), t1 = tAt(Math.max(d.x, e.offsetX));
        if (t1 - t0 > 5) { st.linSpan = [t0, t1]; press('linSpan'); update(true); }
      }
    };
    mCv.addEventListener('pointerup', endDrag);
    mCv.addEventListener('pointercancel', endDrag);
    // a click acts on what is under it; on touch the first tap names it and a second tap on the same acts
    let lastTap = null;
    const tapped = (cv, e, act) => {
      if (!cv._ch) return;
      const r = cv.getBoundingClientRect(), hit = cv._ch.at(e.clientX - r.left, e.clientY - r.top);
      const k = hit && `${cv.id}:${hit.key}:${!!hit.follow}`;
      const go = hit && (e.pointerType === 'mouse' || lastTap === k);
      lastTap = go ? null : k;
      if (go) act(hit);
    };
    onTap(mCv, (e) => tapped(mCv, e, (hit) => { if (hit.node) api.openSpecies(hit.node.serial); }));
    onTap(treeCv, (e) => tapped(treeCv, e, (hit) => { if (hit.follow) follow(hit.u); else if (hit.node) api.openSpecies(hit.node.serial); }));
    function follow(u) {
      st.linRoot = u.members[0].serial;
      st.linSpan = 'all';
      press('linSpan');
      p.scroll.scrollTop = 0;
      update(true);
    }
    list.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !c) return;
      const u = c.units[+b.dataset.u];
      if (b.dataset.do === 'follow') follow(u); else api.openSpecies(+b.dataset.sp);
    });
    // each drawing lights the lineage the pointer is on in the other
    const drawM = (hot) => { box = drawMuller(mCv, c, eras, { hot, minLeft: 30, onHot: drawT }); };
    const drawT = (hot) => { if (box) drawTree(treeCv, c, lay, eras, { hot, l: box.l, r: box.r, onHot: drawM }); };
    function update(force) {
      const now = performance.now();
      // a long world's records take longer to recut: refresh it less often
      if (!force && (now - lastAt < (model && model.nodes.length > 5000 ? 5000 : 2500) || hovering(p.el))) return;
      lastAt = now;
      const life = api.life(), T = Math.max(1, api.eng.simTime);
      // the model is rebuilt as the census moves on; the cut and the drawings whenever anything shown changes
      const mk = `${life.reg.size}:${Math.floor(T)}`;
      if (!model || mk !== modelKey) { model = lineageModel(life, T); modelKey = mk; }
      if (st.linRoot != null && !rootStrand()) st.linRoot = null;
      const [t0, t1] = span(T);
      const W = Math.max(280, p.scroll.clientWidth - 32);
      const key = `${mk}:${t0}:${t1}:${st.linAll}:${st.linK}:${st.linRoot}:${W}`;
      if (!force && key === lastKey) return;
      lastKey = key;
      eras = api.climate().history.slice(1);
      const r = rootStrand();
      c = cut(model, { t0, t1, k: st.linK, live: !st.linAll, root: r, n: Math.min(320, Math.round(W / 2)) });
      $('lin-sum').textContent = `${r ? `${r.first.name}'s line · ` : ''}${fmt(c.units.length)} of ${fmt(c.lineages)} lineages · ${fmt(c.species)} species`;
      const back = $('lin-back');
      back.hidden = !r && !Array.isArray(st.linSpan);
      back.textContent = r ? '← All lineages' : '← Whole world';
      const any = !!(c.units.length || c.other);
      empty.hidden = any;
      mCv.parentElement.hidden = treeCv.hidden = !any;
      if (!any) { list.innerHTML = ''; return; }
      drawM(null);
      if (!box) return; // not on screen
      lay = layoutTree(c, box.l, box.r);
      treeCv.style.height = `${lay.h}px`;
      drawT(null);
      list.innerHTML = c.units.map((u, i) => {
        const n = u.members.findLast((x) => x.alive) || u.members.at(-1);
        return `<li><button type="button" data-u="${i}" data-sp="${n.serial}">${esc(n.name)}: ${fmt(u.count)} species, ${u.alive ? 'living' : 'extinct'}</button><button type="button" data-u="${i}" data-do="follow">Follow its lineage</button></li>`;
      }).join('');
    }
    return { ...p, update };
  }

  // ---------------------------------------------------------- census
  // The page's overview (matter, counts, the chart and the log, kept current by main.js), with what
  // life is made of below the chart: every row highlights its cells in the world.
  function buildCensus() {
    const el = $('pane-census'), box = $('ov-census');
    let shape = '';
    wireDisclosures(box, (k, on) => { st.open_[k] = on; });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-focus]');
      if (b) { api.focusFacet(b.dataset.focus); update(true); }
    });
    function sections() {
      const life = api.life();
      const roles = life.roles || [0, 0, 0];
      const g = api.groups();
      return [
        ['Diet', 'diet', g.diet.map((d) => ({ key: `diet:${d.name}`, label: d.name, n: d.n, col: d.col }))],
        ['Movement', null, g.mobility.map((d) => ({ key: `mobility:${d.name}`, label: d.name, n: d.n, col: d.col }))],
        ['Body', 'organism', g.body.map((d) => ({ key: `body:${d.name}`, label: d.name, n: d.n, col: d.col }))],
        ...(api.eng.K.heat ? [['Temperature', 'optimum', g.temp.map((d) => ({ key: `temp:${d.name}`, label: d.name, n: d.n, col: d.col }))]] : []),
        ['Cells by type', 'celltype', ROLE.map((r, i) => ({ key: `role:${i}`, label: `${r}-cells`, n: roles[i], col: ['#ffb45e', '#b38cff', '#5fd4c4'][i] }))],
        ['Cell types per species', 'bodyplan', g.types.map((d) => ({ key: `types:${d.name}`, label: `${d.name} type${d.name === '1' ? '' : 's'}`, n: d.n, col: d.col }))],
      ];
    }
    function update(force) {
      if (!api.life()) return; // the Lab opens before the first world is seeded
      const secs = sections();
      const k = secs.map(([t, , r]) => t + r.map((x) => x.key).join()).join('|');
      if (k !== shape) {
        shape = k;
        // each breakdown folds to its heading, which keeps a bar of the shares (Diet starts open)
        const bars = ([title, tip, rows]) => disclosure(title.toLowerCase(), tip ? `<span class="term" data-tip="${tip}">${title}</span>` : title,
          `<div class="bars">${rows.map((r) => `<button type="button" class="barrow" data-focus="${r.key}" aria-pressed="false"><span class="bl">${r.label}</span><span class="meter" style="color:${r.col}"><i></i></span><span class="bn"></span><span class="bp"></span></button>`).join('')}</div>`,
          !!st.open_[title.toLowerCase()], `<span class="sharebar" aria-hidden="true">${rows.map((r) => `<i style="background:${r.col}"></i>`).join('')}</span>`);
        box.innerHTML = secs.map(bars).join('')
          + block('Condition', `<div class="segs even" role="group" aria-label="Condition">
            <button type="button" class="chip" data-focus="state:1" aria-pressed="false" data-hint="Under 35% of the energy needed to divide">Hungry</button>
            <button type="button" class="chip" data-focus="state:2" aria-pressed="false" data-hint="Over 85% of the energy needed to divide">Ready to divide</button>
            <button type="button" class="chip" data-focus="state:3" aria-pressed="false" data-hint="Past 80% of their lifespan">Elderly</button>${api.eng.K.heat ? `
            <button type="button" class="chip" data-focus="state:4" aria-pressed="false" data-hint="Warmer than they can comfortably bear">Heat-stressed</button>
            <button type="button" class="chip" data-focus="state:5" aria-pressed="false" data-hint="Too cold to feed, swim or divide">Torpid</button>` : ''}</div>`);
      }
      const fk = api.focusKey();
      const els = box.querySelectorAll('.bars');
      secs.forEach(([, , rows], si) => {
        const max = Math.max(1, ...rows.map((r) => r.n));
        const tot = Math.max(1, rows.reduce((a, r) => a + r.n, 0));
        const share = els[si].closest('.disc').querySelector('.sharebar').children;
        rows.forEach((r, i) => {
          share[i].style.flexGrow = String(r.n / tot);
          const b = els[si].children[i];
          b.setAttribute('aria-pressed', String(fk === r.key));
          b.querySelector('i').style.width = `${((r.n / max) * 100).toFixed(1)}%`;
          b.querySelector('.bn').textContent = fmt(r.n);
          b.querySelector('.bp').textContent = `${((r.n / tot) * 100).toFixed(1)}%`;
        });
      });
      box.querySelectorAll('.chip[data-focus]').forEach((b) => b.setAttribute('aria-pressed', String(fk === b.dataset.focus)));
      // the chart changes only with a new history sample (main.js redraws it then)
      if (force) api.onCensusShown();
    }
    return { el, update };
  }

  // ---------------------------------------------------------- charts
  const CHARTS = [
    ['Population', null, [{ k: 'living', label: 'living cells', col: LIVING_CSS }, { k: 'husk', label: 'husks', col: '#9a6c4c' }]],
    ['Species', 'diversity', [{ k: 'alive', label: 'alive', col: '#a3bdbe' }, { k: 'thriving', label: 'thriving', col: '#f1e3a0' }, { k: 'diversity', label: 'effective species', col: '#7fe0b0' }]],
    ['Births and deaths per minute', null, [{ k: 'births', label: 'births', col: '#7fe0b0' }, { k: 'starve', label: 'starved', col: '#ff8a6b' }, { k: 'old', label: 'old age', col: '#c9b8ff' }, { k: 'eaten', label: 'eaten', col: '#ff5f3a' }]],
    ['Meals per minute', 'flesh', [{ k: 'bite', label: 'bites of producers', col: '#d9f27a' }, { k: 'scav', label: 'husks', col: '#a87b5c' }, { k: 'prey', label: 'kills', col: '#ff5f3a' }]],
    ['New species and extinctions per minute', 'mutation', [{ k: 'mut', label: 'new species', col: '#c9b8ff' }, { k: 'ext', label: 'extinctions', col: '#ff8a6b' }]],
    ['Climate', 'season', [{ k: 'ambient', label: 'baseline light', col: '#d9f27a' }, { k: 'season', label: 'tide strength', col: '#5fd4c4' }], '%'],
  ];
  // the heat charts, while the world has a heat field
  if (api.eng.K.heat) {
    CHARTS.push(
      ['Temperature', 'water', [{ k: 'temp', label: 'background temperature', col: '#ff8a3a' }], '°'],
      ['Heat deaths per minute', 'scalding', [{ k: 'scald', label: 'scalded', col: '#ff5f3a' }]],
      ['Torpid', 'torpor', [{ k: 'torpid', label: 'share of the living', col: '#7fb0ff' }], '%'],
    );
  }
  function buildCharts() {
    const p = pane('');
    p.scroll.classList.add('stack');
    p.scroll.innerHTML = `<div class="legend"><span><i style="background:var(--sun);height:6px;width:1px"></i>dotted lines mark a new era</span></div>`
      + CHARTS.map(([t, tip, s], i) => block(t, `<canvas class="dyn chart" data-i="${i}" aria-label="${esc(t)}"></canvas><div class="legend">${s.map((x) => `<span><i style="background:${x.col}"></i>${x.label}</span>`).join('')}</div>`, { tip })).join('')
      + (api.eng.K.heat ? block('Thermal niches', `<canvas class="niches chart" aria-label="Each species by the temperature it prefers and its population. Point at a dot to name its species; click to open it."></canvas><div class="legend"><span><i style="background:#ff8a3a;opacity:.4"></i>warmth the living feel</span><span><i style="background:#ff8a3a;height:6px;width:1px"></i>background temperature</span><span>dot size: tolerance · ring: ${term('heatmaker', 'heat-maker')}</span></div>`, { tip: 'optimum' }) : '')
      + block('Eras', '<ol class="eras" id="eras"></ol>');
    const cvs = [...p.scroll.querySelectorAll('canvas.dyn')];
    const niches = p.scroll.querySelector('canvas.niches');
    let erasN = -1, excN = 0;
    function update() {
      const life = api.life(), hist = life.history, eras = api.climate().history;
      cvs.forEach((cv, i) => drawLines(cv, hist, CHARTS[i][2], eras, CHARTS[i][3] || ''));
      if (niches) {
        const sp = [];
        for (const s of life.reg.values()) if (s.alive && s.pop > 0) sp.push({ serial: s.serial, name: s.name, topt: s.genome.topt, tol: s.genome.tol, pop: s.pop, maker: s.genome.thermo > 0.2, col: s.genome.col });
        // the warmth felt over the last half minute or more (the ledger's counts are cumulative)
        const c = life.lastCensus, now = c ? Array.from(c.energy.slice(THERMAL_LEDGER.hist, THERMAL_LEDGER.hist + HEAT_BINS)) : null;
        if (now && (!felt0 || c.simTime - felt0.t > 60 || c.simTime < felt0.t)) felt0 = { t: c.simTime, n: felt1 ? felt1.n : now };
        if (now && (!felt1 || c.simTime - felt1.t > 30 || c.simTime < felt1.t)) felt1 = { t: c.simTime, n: now };
        drawNiches(niches, sp, api.eng.tbg, now ? now.map((v, b) => v - felt0.n[b]) : [], HEAT_BIN);
      }
      const exc = eras.filter((h) => h.excursion).length;
      if (eras.length !== erasN || exc !== excN) {
        erasN = eras.length; excN = exc;
        const water = (h) => (api.eng.K.heat && h.temp != null ? ` · temperature ${Math.round(h.temp)}°${h.excursion ? ` · ${h.excursion.dT > 0 ? 'heat wave' : 'cold snap'} ${h.excursion.dT > 0 ? '+' : '−'}${Math.abs(h.excursion.dT).toFixed(0)}°` : ''}` : '');
        $('eras').innerHTML = eras.slice().reverse().map((h) => `<li><time>${fmtClock(h.t)}</time><b>${esc(h.name)}</b><span>light ${Math.round(h.ambient * 100)}%${water(h)}</span></li>`).join('');
      }
    }
    let felt0 = null, felt1 = null;
    return { ...p, update };
  }

  // ---------------------------------------------------------- log
  const TYPES = [['all', 'All'], ['story', 'Chronicler'], ['est', 'New species'], ['genus', 'New genera'], ['ext', 'Extinctions'], ['top', 'Dominance'], ['era', 'Eras'], ['pond', 'The pool'], ...(api.eng.K.heat ? [['heat', 'Heat']] : [])];
  function buildLog() {
    const p = pane(`<input type="search" id="log-q" placeholder="Search the log" aria-label="Search the log" autocomplete="off">
      <div class="row" role="group" aria-label="Show">${chips('logType', TYPES, st.logType)}</div>`);
    const list = document.createElement('ol');
    list.className = 'log';
    p.scroll.append(list);
    const q = p.ctl.querySelector('#log-q');
    q.addEventListener('input', () => { st.logQ = q.value; update(true); });
    p.ctl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (b) { st.logType = b.dataset.v; pressChips(p.ctl, 'logType'); update(true); }
    });
    let lastKey = '';
    function update(force) {
      const ch = api.life().chronicle;
      const key = `${ch.length}:${ch[0] ? ch[0].t : 0}:${st.logType}:${st.logQ}`;
      if (key === lastKey && !force) return;
      if (!force && hovering(list)) return;
      lastKey = key;
      const ev = ch.filter((e) => (st.logType === 'all' || e.type === st.logType) && (!st.logQ || e.text.toLowerCase().includes(st.logQ.toLowerCase())));
      // keep what the reader is looking at in place as new entries arrive on top
      const before = list.scrollHeight, top = p.scroll.scrollTop;
      list.innerHTML = ev.length ? ev.slice(0, 400).map((e) => `<li${e.type === 'story' ? ' class="story"' : ''}><i style="background:${cssCol(e.col)}"></i><time>${fmtClock(e.t)}</time><span>${e.html}</span></li>`).join('')
        : `<li style="display:block;border:0" class="note">${st.logType === 'story' ? 'The chronicler speaks rarely, only when something notable has happened: a death worth remembering, an arms race, a cycle of boom and bust, a lineage following the water. Nothing yet.' : 'Nothing yet.'}</li>`;
      api.relabel?.(list);
      if (top > 0 && !force) p.scroll.scrollTop = top + (list.scrollHeight - before);
    }
    return { ...p, update };
  }

  // ---------------------------------------------------------- guide
  function buildGuide() {
    const p = pane(`<div class="toc">${GUIDE.map((s, i) => `<button type="button" class="chip" data-g="${s.id}">${String(i + 1).padStart(2, '0')} ${s.short || s.title}</button>`).join('')}</div>`);
    p.scroll.innerHTML = `<div class="guide">${GUIDE.map((s, i) => `<section id="g-${s.id}"><h3 data-n="${String(i + 1).padStart(2, '0')}">${s.title}</h3>${s.html}</section>`).join('')}</div>`;
    p.ctl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-g]');
      if (b) $(`g-${b.dataset.g}`)?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
    return { ...p, update() {} };
  }

  const builders = { species: buildSpecies, lineage: buildLineage, census: buildCensus, charts: buildCharts, log: buildLog, guide: buildGuide };

  apply();
  if (st.open) show();

  // called on every census; while a pointer is held on the Lab nothing is rebuilt under it
  function render(force) {
    if (!st.open || !panes[st.tab]) return;
    const now = performance.now();
    if (!force && (api.held() || now - lastUpdate < 900)) return;
    lastUpdate = now;
    panes[st.tab].update(!!force);
  }
  // A new world: its species reuse the old one's serials (and so their names), so every record
  // built from the old world goes (the census, built from the page and kept current, stays).
  function reset() {
    for (const k of Object.keys(panes)) if (k !== 'census') { panes[k].el.remove(); delete panes[k]; }
    if (st.open) show();
  }
  return {
    open, close, toggle, render, reset, isOpen: () => st.open, tab: () => st.tab,
    // open on one of the records (wider than the census)
    isWide: () => st.open && st.tab !== 'census',
    // back to the census, as the column it was before a record was opened
    narrow() { if (st.open && st.tab !== 'census') { st.tab = 'census'; apply(); show(); } },
  };
}
