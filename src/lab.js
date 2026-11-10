import { GUIDE } from './guide.js';
import { fmt, fmtClock, esc, cssCol, term, spLink, ROLE, LIVING_CSS } from './fmt.js';
import { voiceOf } from './audio/mapping.js';
import { sigilSVG } from './song.js';
import { drawLines, drawNiches, sparkPath, onTap } from './charts.js';
import { lineageModel, cut } from './lineage/model.js';
import { drawMuller, drawTree, layoutTree, target } from './lineage/draw.js';
import { ancestry, strandLead, history, sameLoc, fitCrumbs } from './lineage/nav.js';
import { HEAT_BINS, HEAT_BIN, THERMAL_LEDGER } from './shaders.js';
import { block, subHead, disclosure, wireDisclosures } from './ui.js';
import { setText, setHTML } from './live.js';
import { filterCards } from './cabinet.js';
import { FACET_NAME } from './facets.js';
import { tr } from './i18n.js';
import { eraName } from './climate.js';
import { wireCardDrag, setStatus } from './minicard.js';

/**
 * The Field Lab: the left column. Its Census is what the world is made of and what has happened;
 * the other sections are the records. It collapses to its header. Each section is built once and
 * then updated in place, so controls never vanish under the pointer and lists keep their scroll
 * position.
 */
export function createLab(api) {
  const $ = (id) => document.getElementById(id);
  const root = $('lab'), bodyEl = $('lab-body'), tabs = [...root.querySelectorAll('[data-tab]')], fold = $('lab-close'), titleBar = root.querySelector('.lab-title');
  const st = {
    open: api.startOpen, tab: 'census',
    q: '', status: 'thriving', diet: 'all', mobility: 'all', body: 'all', temp: 'all', sort: 'pop',
    linAll: true, linSpan: 'all', linK: 30, linRoot: null, logType: 'all', logQ: '',
    cabQ: '', cabFrom: 'any', cabDiet: 'all', cabBody: 'all',
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
    fold.setAttribute('aria-label', st.open ? tr('lab.close.aria', 'Collapse the Lab') : tr('lab.fold.open.aria', 'Open the Lab'));
    // the title bar folds and opens it too, so it hints as the chevron does
    fold.dataset.hint = titleBar.dataset.hint = st.open ? tr('lab.close.hint', 'Collapse · K') : tr('lab.fold.open.hint', 'Open the Lab · K');
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
  titleBar.addEventListener('click', (e) => { if (!e.target.closest('button')) toggle(); });
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
  const seg = (label, key, opts) => `<span class="lbl">${label}</span><div class="segs" role="group" aria-label="${label.replace(/<[^>]*>/g, '')}">${chips(key, opts, st[key])}</div>`;
  // a click on a filter chip sets its key, on the Filters button (#id) opens or closes the filters: true if either
  function filterClick(e, ctl, id, update) {
    const b = e.target.closest('[data-k]');
    if (b) { st[b.dataset.k] = b.dataset.v; pressChips(ctl, b.dataset.k); update(true); return true; }
    const ft = e.target.closest(`#${id}`);
    if (ft) { const on = !ctl.classList.contains('open'); ctl.classList.toggle('open', on); ft.setAttribute('aria-expanded', String(on)); return true; }
    return false;
  }
  // the pointer is inside: hold the order still so rows don't move under it
  const hovering = (el) => el.matches(':hover');

  // ---------------------------------------------------------- species
  // i18n: a filter chip (Lab → Species, Lab → Cabinet) that filters nothing out
  const ANY = tr('lab.filter.any', 'Any');
  // i18n: filter chips (Lab → Species, Lab → Cabinet): the diets, the movements
  const DIETS = [['all', ANY], ['photosynth', tr('lab.filter.photosynth', 'Photosynth')], ['grazer', tr('lab.filter.grazer', 'Grazer')], ['scavenger', tr('lab.filter.scavenger', 'Scavenger')], ['predator', tr('lab.filter.predator', 'Predator')]];
  const MOBS = [['all', ANY], ['anchored', tr('lab.filter.anchored', 'Anchored')], ['crawler', tr('lab.filter.crawler', 'Crawler')], ['swimmer', tr('lab.filter.swimmer', 'Swimmer')], ['drifter', tr('lab.filter.drifter', 'Drifter')]];
  // by preferred temperature (thermalGuild): cold-loving, temperate, warmth-loving and thermophile
  // i18n: filter chips (Lab → Species, Temp): species by the temperature they prefer: cold-loving, temperate, warmth-loving, thermophile
  const TEMPS = [['all', ANY], ['cold-loving', tr('lab.filter.cold', 'Cold')], ['temperate', tr('lab.filter.temperate', 'Temperate')], ['warmth-loving', tr('lab.filter.warm', 'Warm')], ['thermophile', tr('lab.filter.hot', 'Hot')]];
  // i18n: filter chips (Lab → Species, Lab → Cabinet, Body): bonded into bodies, or never
  const BODIES = [['all', ANY], ['multicellular', tr('lab.filter.multicellular', 'Multicellular')], ['single-cell', tr('lab.filter.single-cell', 'Single-cell')]];
  // i18n: Lab → Species, Sort: what the list is ordered by (most cells, highest peak, newest, oldest, most mutations from the founder, best swimmers, largest, warmest preferred temperature)
  const SORTS = { pop: tr('lab.sort.pop', 'Population'), peak: tr('lab.sort.peak', 'Peak'), newest: tr('lab.sort.newest', 'Newest'), oldest: tr('lab.sort.oldest', 'Oldest'), depth: tr('lab.sort.depth', 'Mutations'),
    swim: tr('lab.sort.swim', 'Swimming'), size: tr('lab.sort.size', 'Size'), ...(api.eng.K.heat ? { warm: tr('lab.sort.warm', 'Warmest') } : {}) };
  // i18n: a highlight's name in the bar under the top rail, from Lab → Species → Highlight these: its filters, lower case
  const STATUS_NAME = { thriving: tr('lab.sp.focus.thriving', 'thriving'), alive: tr('lab.sp.focus.alive', 'alive'), extinct: tr('lab.sp.focus.extinct', 'extinct') };
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
    const p = pane(`<div class="qrow"><input type="search" id="lab-q" placeholder="${tr('lab.sp.search.ph', 'Search by name')}" aria-label="${tr('lab.sp.search.aria', 'Search species by name')}" autocomplete="off"><button type="button" class="chip filt" id="sp-filt" aria-expanded="false" aria-controls="sp-filters">${tr('lab.filter.button', 'Filters')}</button></div><div class="filters" id="sp-filters">
      ${seg(tr('lab.filter.status', 'Status'), 'status', [['thriving', tr('lab.filter.thriving', 'Thriving')], ['alive', tr('lab.filter.living', 'Living')], ['extinct', tr('lab.filter.extinct', 'Extinct')], ['all', ANY]])}
      ${seg(term('diet', tr('lab.filter.diet', 'Diet')), 'diet', DIETS)}
      ${seg(tr('lab.filter.moves', 'Moves'), 'mobility', MOBS)}
      ${seg(term('organism', tr('lab.filter.body', 'Body')), 'body', BODIES)}
      ${api.eng.K.heat ? seg(term('optimum', tr('lab.filter.temp', 'Temp')), 'temp', TEMPS) : ''}</div>
      <div class="sum"><span><span id="sp-sum"></span><button type="button" class="link" id="sp-reset" hidden>${tr('lab.filter.reset', 'Reset')}</button></span><span class="sel"><label class="lbl" for="sp-sort">${tr('lab.sp.sort', 'Sort')}</label><select id="sp-sort">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><button type="button" class="chip" id="sp-hl">${tr('lab.sp.highlight', 'Highlight these')}</button></span></div>`);
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
      if (filterClick(e, p.ctl, 'sp-filt', update)) return;
      if (e.target.closest('#sp-reset')) {
        Object.assign(st, { status: 'thriving', diet: 'all', mobility: 'all', body: 'all', temp: 'all' });
        ['status', 'diet', 'mobility', 'body', 'temp'].forEach((k) => pressChips(p.ctl, k));
        update(true);
        return;
      }
      if (e.target.closest('#sp-hl')) {
        const F = { ...st };
        const N = (k) => FACET_NAME[k] ?? k;
        // i18n: {q} is what was typed in the search box
        const parts = [F.status !== 'all' ? STATUS_NAME[F.status] ?? F.status : '', F.diet !== 'all' ? N(F.diet) : '', F.mobility !== 'all' ? N(F.mobility) : '', F.body !== 'all' ? N(F.body) : '', F.temp !== 'all' ? N(F.temp) : '', F.q ? tr('lab.sp.focus.q', '“{q}”', { q: F.q }) : ''].filter(Boolean);
        // i18n: {filters} is the filters chosen, joined by " · " (thriving · predator · swimmer), or the word for all of them
        api.focusPredicate(tr('lab.sp.focus', 'Species: {filters}', { filters: parts.join(' · ') || tr('lab.sp.focus.all', 'all') }), (g, sp) => !!sp && sp.alive && matches(sp, F));
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
        li.innerHTML = `<span class="spsig term" data-tip="sigil">${sigilSVG(voiceOf(sp.genome), sp.genome, { size: 26 })}</span><div class="spmain">${spLink(sp.serial, sp.name)}<small>${tr('lab.sp.row', '{diet} · {mobility} · {body}', { diet: FACET_NAME[f.diet] ?? f.diet, mobility: FACET_NAME[f.mobility] ?? f.mobility, body: FACET_NAME[f.body] ?? f.body })}</small></div><svg viewBox="0 0 78 22" class="spark" aria-hidden="true"><path stroke="${cssCol(sp.genome.col)}"/></svg><div class="spnum"><b></b><span></span></div>`;
        r = { li, path: li.querySelector('path'), b: li.querySelector('.spnum b'), s: li.querySelector('.spnum span'), a: li.querySelector('a.sp'), name: sp.name, key: '' };
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
      // i18n: the species the filters show, their living cells and their share of all life ({share}: a percentage, 12.5)
      setText($('sp-sum'), tr('lab.sp.sum', '{species, plural, other {# species}} · {cells, plural, other {# cells}} · {share}% of life', { species: all.length, cells: tot, share: ((tot / living) * 100).toFixed(1) }));
      const nf = ['status', 'diet', 'mobility', 'body', 'temp'].filter((k) => st[k] !== (k === 'status' ? 'thriving' : 'all')).length;
      // i18n: the Filters button, with how many filters are set
      setText($('sp-filt'), nf ? tr('lab.filter.button-n', 'Filters · {n}', { n: nf }) : tr('lab.filter.button', 'Filters'));
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
        // i18n: a species' row: its share of all living cells (12.5%), or when it died out ({t}: a clock)
        const share = sp.alive ? tr('lab.sp.share', '{share}%', { share: ((sp.pop / living) * 100).toFixed(1) }) : tr('lab.sp.ended', 'ended {t}', { t: fmtClock(sp.extinct ?? 0) });
        const k = `${sp.pop}|${share}`;
        if (k !== r.key) { r.key = k; setText(r.b, sp.alive ? fmt(sp.pop) : '–'); setText(r.s, share); }
        // (a name given, or cleared, since the row was made)
        if (r.name !== sp.name) { r.name = sp.name; setText(r.a, sp.name); }
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
        // i18n: under a list cut short: how many species more match
        setText(more, all.length > 150 ? tr('lab.sp.more', '{n, plural, other {# more}}; narrow the filters to see them.', { n: all.length - 150 }) : all.length ? '' : tr('lab.sp.none', 'No species match these filters.'));
        if (more.textContent) list.append(more); else more.remove();
      }
    }
    return { ...p, update };
  }

  // ---------------------------------------------------------- lineage
  // The world's lineages (src/lineage/): a Muller plot of the few dozen that held the most life in
  // the span shown, every other species counted with its nearest shown ancestor, over the tree of
  // the same lineages. Narrowing the span (drag across the plot) or exploring one lineage (a click on
  // its row or its band) recuts it, so finer lineages appear; every species is a few steps away. Where
  // the view is (src/lineage/nav.js) shows as breadcrumbs, the lineage's real ancestry, each a step up,
  // beside the span it is narrowed to (its own chip, cleared alone), over a readout of what is shown;
  // Esc or Backspace goes back the way the view came. A species is shown in the water (openSpecies)
  // from the reticle on the row pointed at, or from an explored lineage's line of descent.
  let lineageBack = () => false;
  function buildLineage() {
    const seg = (label, key, opts) => `<span class="lbl">${label}</span><div class="segs" role="group" aria-label="${label}">${chips(key, opts, String(st[key]))}</div>`;
    const read = (k) => `<div><span data-r="${k}l"></span><b data-r="${k}"></b></div>`;
    const SPANS = [['all', tr('lab.lin.span.all', 'All time')], ['3600', tr('lab.lin.span.hour', 'Last hour')], ['600', tr('lab.lin.span.ten-min', 'Last 10 min')]];
    // i18n: Lab → Lineage: the breadcrumbs (where you are among the lineages), the chip of a narrowed span of time (× widens it), the options: which lineages (all, or only those still alive), over what span of time, how many rows at most
    const p = pane(`<div class="lin-nav"><nav class="crumbs" id="lin-crumbs" aria-label="${tr('lab.lin.crumbs.aria', 'Where you are in the lineages')}"><ol></ol></nav><button type="button" class="chip lin-span" id="lin-span" hidden data-hint="${tr('lab.lin.span.chip.hint', 'Back to all time')}"><span></span><svg aria-hidden="true"><use href="#i-close"/></svg></button><button type="button" class="chip filt" id="lin-filt" aria-expanded="false" aria-controls="lin-opts">${tr('lab.lin.options', 'Options')}</button></div>
      <div class="filters" id="lin-opts">
      ${seg(tr('lab.lin.show', 'Show'), 'linAll', [['true', tr('lab.lin.show.every', 'Every lineage')], ['false', tr('lab.lin.show.living', 'Living lineages')]])}
      ${seg(tr('lab.lin.span', 'Span'), 'linSpan', SPANS)}
      ${seg(tr('lab.lin.rows', 'Rows'), 'linK', [['15', '15'], ['30', '30'], ['60', '60']])}</div>
      <div class="readout lin-read" id="lin-read">${read('a')}${read('b')}${read('c')}${read('d')}</div>
      ${subHead(tr('lab.lin.plot.head', 'Cells by lineage'), `<span class="lin-key">${tr('lab.lin.key', 'drag across to zoom')}</span>`)}
      <div class="lin-muller"><canvas id="lin-muller" aria-label="${tr('lab.lin.plot.aria', 'Cells by lineage over time')}"></canvas><div class="lin-brush" hidden></div></div>`, 'lineage');
    const treeHead = document.createElement('div');
    // i18n: the heading over the lineage tree, and how to use it with a mouse ({ret}: the reticle's icon) and on a touch screen
    treeHead.innerHTML = subHead(tr('lab.lin.tree.head', 'Lineages'), `<span class="hov">${tr('lab.lin.tree.how', 'click one to explore it · its <ret></ret> shows it in the water', { ret: () => '<svg class="ret-i" aria-hidden="true"><use href="#i-ret"/></svg>' })}</span><span class="tch">${tr('lab.lin.tree.how-touch', 'tap one to explore it')}</span>`);
    const descent = document.createElement('div');
    descent.className = 'lin-descent';
    descent.hidden = true;
    // i18n: an explored lineage's line of descent: the species it passed through, oldest first, each a link
    descent.innerHTML = block(tr('lab.lin.descent', 'Line of descent'), '<ol class="lin-chain"></ol>', { aside: tr('lab.lin.descent.aside', 'a name shows it in the water') });
    const chainOl = descent.querySelector('ol');
    const treeCv = document.createElement('canvas');
    treeCv.className = 'lin-tree';
    treeCv.id = 'lin-tree';
    const list = document.createElement('ul');
    list.className = 'sr-only';
    list.setAttribute('aria-label', tr('lab.lin.list.aria', 'Lineages'));
    const empty = document.createElement('p');
    empty.className = 'note';
    empty.textContent = tr('lab.lin.empty', 'Lineages appear here once species become established.');
    p.scroll.append(empty, treeHead.firstElementChild, treeCv, descent, list);
    const mCv = p.ctl.querySelector('#lin-muller'), brush = p.ctl.querySelector('.lin-brush');
    const crumbsEl = p.ctl.querySelector('#lin-crumbs'), crumbOl = crumbsEl.firstElementChild, spanBtn = p.ctl.querySelector('#lin-span');
    let model = null, modelKey = '', c = null, box = null, lay = null, eras = [], lastAt = 0, lastKey = '';
    const press = (k) => p.ctl.querySelectorAll(`[data-k="${k}"]`).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === String(st[k]))));
    // where the view is and the way back: every move remembers the place it left
    const past = history();
    const here = () => ({ root: st.linRoot, span: st.linSpan });
    let zoom = null; // the drawing and span the view leaves, for the zoom from it to the next
    function go(to) {
      const from = here();
      if (sameLoc(to, from)) return;
      past.go(from);
      move(to);
    }
    function move(to) {
      if (c && box) zoom = { t0: c.t0, t1: c.t1, box: { ...box } };
      // (the name plate named what was under the pointer in the view it leaves: let it go)
      mCv._hot = treeCv._hot = null;
      st.linRoot = to.root; st.linSpan = to.span;
      press('linSpan');
      p.scroll.scrollTop = 0;
      update(true);
    }
    lineageBack = () => {
      if (st.tab !== 'lineage' || !st.open) return false;
      const to = past.back();
      if (!to) return false;
      move(to);
      return true;
    };
    p.ctl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (b) {
        const k = b.dataset.k;
        if (k === 'linSpan') { go({ root: st.linRoot, span: b.dataset.v }); return; }
        st[k] = k === 'linAll' ? b.dataset.v === 'true' : +b.dataset.v;
        press(k);
        update(true);
        return;
      }
      const ft = e.target.closest('#lin-filt');
      if (ft) { const on = !p.ctl.classList.contains('open'); p.ctl.classList.toggle('open', on); ft.setAttribute('aria-expanded', String(on)); return; }
      const cr = e.target.closest('[data-root]');
      if (cr) { go({ root: cr.dataset.root ? +cr.dataset.root : null, span: st.linSpan }); return; }
      if (e.target.closest('.crumb.ell')) { crumbsEl.classList.add('full'); return; }
      if (e.target.closest('#lin-span')) go({ root: st.linRoot, span: 'all' });
    });
    // the span on show: the whole world, the last stretch of it, a dragged window, or an explored lineage's life
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
        if (t1 - t0 > 5) go({ root: st.linRoot, span: [t0, t1] });
      }
    };
    mCv.addEventListener('pointerup', endDrag);
    mCv.addEventListener('pointercancel', endDrag);
    // a click on a lineage explores it; on the reticle of the row pointed at, shows its species in the water. On
    // touch (no pointing, so no reticle) a tap on a row explores it at once, and a band of the plot, thinner, is
    // named by a first tap and explored by a second
    let lastTap = null;
    const at = (cv, e) => { const r = cv.getBoundingClientRect(); return cv._ch ? cv._ch.at(e.clientX - r.left, e.clientY - r.top) : null; };
    onTap(mCv, (e) => {
      const hit = at(mCv, e), k = hit && hit.key, mouse = e.pointerType === 'mouse';
      const now = hit && hit.explore && (mouse || lastTap === k);
      lastTap = now ? null : k;
      if (now) explore(hit.u);
    });
    onTap(treeCv, (e) => {
      const hit = at(treeCv, e);
      if (!hit) return;
      if (hit.locate && e.pointerType === 'mouse') api.openSpecies(hit.target.serial);
      else if (hit.explore) explore(hit.u);
    });
    // the pointer says what a click would do
    treeCv.addEventListener('pointermove', (e) => { const hit = e.pointerType === 'mouse' && at(treeCv, e); treeCv.style.cursor = hit && (hit.explore || hit.locate) ? 'pointer' : 'default'; });
    const explore = (u) => go({ root: u.strand.first.serial, span: st.linSpan });
    list.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !c) return;
      const u = c.units[+b.dataset.u];
      if (b.dataset.do === 'explore') explore(u); else api.openSpecies(+b.dataset.sp);
    });
    // the breadcrumbs: the whole world, then the explored lineage's ancestry down to it (each named as its
    // row in the tree is, in its color); those that don't fit fold into an ellipsis, the parent
    // kept longest
    let crumbKey = '';
    function crumbs(r, T) {
      const path = r ? ancestry(r) : [];
      const key = `${path.map((x) => x.first.serial).join(',')}:${Math.floor(T / 30)}:${crumbsEl.clientWidth}`;
      if (key === crumbKey) return;
      crumbKey = key;
      crumbsEl.classList.remove('full');
      const items = [{ name: tr('lab.lin.crumbs.all', 'All lineages'), root: '' }, ...path.map((x) => { const n = strandLead(x); return { name: n.name, root: x.first.serial, col: cssCol(n.s.genome.col) }; })];
      setHTML(crumbOl, items.map((it, i) => {
        const dot = it.col ? `<i style="background:${it.col}"></i>` : '';
        return i === items.length - 1
          ? `<li><span class="crumb cur" aria-current="location">${dot}${esc(it.name)}</span></li>`
          : `${i === 1 ? `<li class="ell-li" hidden><button type="button" class="crumb ell" aria-label="${tr('lab.lin.crumbs.more.aria', 'Show the whole path')}">…</button></li>` : ''}<li><button type="button" class="crumb" data-root="${it.root}">${dot}${esc(it.name)}</button></li>`;
      }).join(''));
      const lis = [...crumbOl.children].filter((li) => !li.classList.contains('ell-li')), ell = crumbOl.querySelector('.ell-li');
      if (!ell) return;
      ell.hidden = false;
      const ew = ell.offsetWidth;
      ell.hidden = true;
      const keep = fitCrumbs(lis.map((li) => li.offsetWidth), crumbsEl.clientWidth, ew);
      lis.forEach((li, i) => li.classList.toggle('fold', !keep.includes(i)));
      ell.hidden = !keep.includes(-1);
    }
    // a move of the span zooms the plot from the one it leaves: the old drawing stretches to where its
    // span falls in the new one as it fades, and the new one grows out from where it fell in the old
    function zoomFrom(z) {
      if (!z || !box || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const W = (b) => b.r - b.l, place = (t, t0, t1, b) => b.l + ((t - t0) / (t1 - t0)) * W(b);
      // where the old span lands in the new plot, and the new span in the old
      const oa = place(z.t0, c.t0, c.t1, box), ob = place(z.t1, c.t0, c.t1, box);
      const na = place(c.t0, z.t0, z.t1, z.box), nb = place(c.t1, z.t0, z.t1, z.box);
      if (Math.abs(oa - box.l) < 2 && Math.abs(ob - box.r) < 2) return; // the same span
      const tf = (a, b, from) => { const k = (b - a) / W(from); return `translateX(${a - from.l * k}px) scaleX(${k})`; };
      const ghost = z.img;
      ghost.className = 'lin-ghost';
      mCv.parentElement.append(ghost);
      const o = { duration: 380, easing: 'cubic-bezier(.3,.7,.2,1)' };
      ghost.animate([{ transform: 'none', opacity: 1 }, { transform: tf(oa, ob, z.box), opacity: 0 }], o).finished.then(() => ghost.remove(), () => ghost.remove());
      mCv.animate([{ transform: tf(na, nb, box), opacity: 0 }, { transform: 'none', opacity: 1 }], o);
      treeCv.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    }
    // the readout: the world's lineages, or the explored lineage's own record
    const rd = Object.fromEntries([...p.ctl.querySelectorAll('[data-r]')].map((x) => [x.dataset.r, x]));
    const put = (k, label, value) => { setText(rd[`${k}l`], label); setText(rd[k], value); };
    function readout(r) {
      if (!r) {
        // i18n: Lab → Lineage's readout over all lineages: how many lineages and species in the span, how many species live, the span of time shown ({from}–{to}, clocks)
        put('a', tr('lab.lin.read.lineages', 'Lineages'), fmt(c.lineages));
        put('b', tr('lab.lin.read.species', 'Species'), fmt(c.species));
        put('c', tr('lab.lin.read.living', 'Living'), fmt(model.nodes.reduce((a, n) => a + (n.alive ? 1 : 0), 0)));
        put('d', tr('lab.lin.read.time', 'Time shown'), tr('lab.lin.span.range', '{from}–{to}', { from: fmtClock(c.t0), to: fmtClock(c.t1) }));
        return;
      }
      // the clade's cells at each sample, and what of it lives now
      let peak = 0, now = 0, end = 0;
      for (let i = 0; i < c.ts.length; i++) { let v = 0; for (const u of c.units) v += u.vals[i]; if (v > peak) peak = v; }
      const walk = (st) => { if (st.end > end) end = st.end; for (const n of st.nodes) if (n.alive) now += n.pop; st.kids.forEach(walk); };
      walk(r);
      // i18n: Lab → Lineage's readout for an explored lineage: when it arose, its species, the most cells it held at once, its cells now or when it died out
      put('a', tr('lab.lin.read.arose', 'Arose'), fmtClock(r.born));
      put('b', tr('lab.lin.read.species', 'Species'), fmt(c.species));
      put('c', tr('lab.lin.read.peak', 'Peak cells'), fmt(Math.round(peak)));
      if (r.live) put('d', tr('lab.lin.read.now', 'Cells now'), fmt(now)); else put('d', tr('lab.lin.read.extinct', 'Extinct'), fmtClock(end));
    }
    // an explored lineage's line of descent: the species its strand passed through, oldest first, each
    // a link that shows it in the water (fmt.js spLink, opened by main.js)
    let chainKey = '';
    function chain(r) {
      descent.hidden = !r;
      if (!r) { chainKey = ''; return; }
      const key = r.nodes.map((n) => `${n.serial}:${n.alive ? n.pop : 'x'}`).join(',');
      if (key === chainKey) return;
      chainKey = key;
      const MAX = 12, nodes = r.nodes.length > MAX ? [...r.nodes.slice(0, MAX - 1), r.nodes.at(-1)] : r.nodes;
      // i18n: the line of descent: how many species are left out of a long one ({n}), and each species' arising ({born}: a clock) and its cells now or when it died out ({end}: a clock)
      setHTML(chainOl, nodes.map((n, i) => `${i === MAX - 1 && r.nodes.length > MAX ? `<li class="more">${tr('lab.lin.descent.more', '{n} more', { n: fmt(r.nodes.length - MAX) })}</li>` : ''}<li${n.alive ? '' : ' class="gone"'}><i style="background:${cssCol(n.s.genome.col)}"></i>${spLink(n.serial, n.name)}<span>${tr('lab.lin.descent.arose', 'arose {born}', { born: fmtClock(n.born) })}</span><span>${n.alive ? tr('lab.lin.descent.cells', '{n} cells', { n: fmt(n.pop) }) : tr('lab.lin.descent.extinct', 'extinct {end}', { end: fmtClock(n.end) })}</span></li>`).join(''));
    }
    // each drawing lights the lineage the pointer is on in the other
    const drawM = (hot) => { box = drawMuller(mCv, c, eras, { hot, minLeft: 30, onHot: drawT, root: rootStrand() }); };
    const drawT = (hot) => { if (box) drawTree(treeCv, c, lay, eras, { hot, l: box.l, r: box.r, onHot: drawM, root: rootStrand(), rode: new Set(api.life().rode || []) }); };
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
      eras = api.climate().history.filter((e) => e.t > 0);
      const r = rootStrand();
      c = cut(model, { t0, t1, k: st.linK, live: !st.linAll, root: r, n: Math.min(320, Math.round(W / 2)) });
      crumbs(r, T);
      readout(r);
      chain(r);
      const sp = st.linSpan !== 'all';
      spanBtn.hidden = !sp;
      if (sp) {
        // i18n: the span chip's words: a stretch of time narrowed to ({from}–{to}, clocks), or one of the span choices
        const text = Array.isArray(st.linSpan) ? tr('lab.lin.span.range', '{from}–{to}', { from: fmtClock(st.linSpan[0]), to: fmtClock(st.linSpan[1]) }) : SPANS.find(([v]) => v === st.linSpan)[1];
        setText(spanBtn.firstElementChild, text);
        // i18n: the span chip, for screen readers: {span} is the stretch of time shown (a range of clocks, or Last hour...)
        spanBtn.setAttribute('aria-label', tr('lab.lin.span.chip.aria', 'Showing {span}: back to all time', { span: text }));
      }
      const any = !!(c.units.length || c.other);
      empty.hidden = any;
      mCv.parentElement.hidden = treeCv.hidden = !any;
      if (!any) { setHTML(list, ''); zoom = null; return; }
      // (the drawing the view leaves, before it is drawn over)
      if (zoom) { const img = document.createElement('canvas'); img.width = mCv.width; img.height = mCv.height; img.getContext('2d').drawImage(mCv, 0, 0); zoom.img = img; }
      drawM(null);
      if (!box) { zoom = null; return; } // not on screen
      lay = layoutTree(c, box.l, box.r);
      treeCv.style.height = `${lay.h}px`;
      drawT(null);
      if (zoom) { zoomFrom(zoom); zoom = null; }
      setHTML(list, c.units.map((u, i) => {
        const n = strandLead(u.strand), tg = target(u);
        // i18n: for screen readers, each lineage on the plot: a button to explore it ({name}: its leading species, how many species it holds, living or extinct) and one to show a species ({name}) in the water
        return `<li>${u.strand !== r ? `<button type="button" data-u="${i}" data-do="explore">${tr('lab.lin.item.explore', 'Explore {name}’s lineage: {count, plural, other {# species}}, {alive, select, yes {living} other {extinct}}', { name: esc(n.name), count: u.count, alive: u.alive ? 'yes' : 'no' })}</button>` : ''}<button type="button" data-u="${i}" data-sp="${tg.serial}">${tr('lab.lin.item.show', 'Show {name} in the water', { name: esc(tg.name) })}</button></li>`;
      }).join(''));
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
      const N = (k) => FACET_NAME[k] ?? k;
      // [key (data-disc), heading, glossary term, rows]
      // i18n: Lab → Census: the breakdowns of the living, each a heading that folds over a bar per kind
      return [
        ['diet', tr('census.by.diet', 'Diet'), 'diet', g.diet.map((d) => ({ key: `diet:${d.name}`, label: N(d.name), n: d.n, col: d.col }))],
        ['movement', tr('census.by.movement', 'Movement'), null, g.mobility.map((d) => ({ key: `mobility:${d.name}`, label: N(d.name), n: d.n, col: d.col }))],
        ['body', tr('census.by.body', 'Body'), 'organism', g.body.map((d) => ({ key: `body:${d.name}`, label: N(d.name), n: d.n, col: d.col }))],
        ...(api.eng.K.heat ? [['temperature', tr('census.by.temperature', 'Temperature'), 'optimum', g.temp.map((d) => ({ key: `temp:${d.name}`, label: N(d.name), n: d.n, col: d.col }))]] : []),
        // i18n: {role} is a cell type's letter: α, β or γ
        ['cells by type', tr('census.by.role', 'Cells by type'), 'celltype', ROLE.map((r, i) => ({ key: `role:${i}`, label: tr('census.role', '{role}-cells', { role: r }), n: roles[i], col: ['#ffb45e', '#b38cff', '#5fd4c4'][i] }))], // i18n-ignore: data-disc key
        ['cell types per species', tr('census.by.types', 'Cell types per species'), 'bodyplan', g.types.map((d) => ({ key: `types:${d.name}`, label: tr('census.types', '{n, plural, one {# type} other {# types}}', { n: +d.name }), n: d.n, col: d.col }))], // i18n-ignore: data-disc key
      ];
    }
    function update(force) {
      if (!api.life()) return; // the Lab opens before the first world is seeded
      const secs = sections();
      const k = secs.map(([key, , , r]) => key + r.map((x) => x.key).join()).join('|');
      if (k !== shape) {
        shape = k;
        // each breakdown folds to its heading, which keeps a bar of the shares (Diet starts open)
        const bars = ([key, title, tip, rows]) => disclosure(key, tip ? `<span class="term" data-tip="${tip}">${title}</span>` : title,
          `<div class="bars">${rows.map((r) => `<button type="button" class="barrow" data-focus="${r.key}" aria-pressed="false"><span class="bl">${r.label}</span><span class="meter" style="color:${r.col}"><i></i></span><span class="bn"></span><span class="bp"></span></button>`).join('')}</div>`,
          !!st.open_[key], `<span class="sharebar" aria-hidden="true">${rows.map((r) => `<i style="background:${r.col}"></i>`).join('')}</span>`);
        box.innerHTML = secs.map(bars).join('')
          // i18n: Lab → Census, Condition: chips that highlight the cells in a state, each with its hint
          + block(tr('census.cond', 'Condition'), `<div class="segs even" role="group" aria-label="${tr('census.cond.aria', 'Condition')}">
            <button type="button" class="chip" data-focus="state:1" aria-pressed="false" data-hint="${tr('census.cond.hungry.hint', 'Under 35% of the energy needed to divide')}">${tr('census.cond.hungry', 'Hungry')}</button>
            <button type="button" class="chip" data-focus="state:2" aria-pressed="false" data-hint="${tr('census.cond.ready.hint', 'Over 85% of the energy needed to divide')}">${tr('census.cond.ready', 'Ready to divide')}</button>
            <button type="button" class="chip" data-focus="state:3" aria-pressed="false" data-hint="${tr('census.cond.elderly.hint', 'Past 80% of their lifespan')}">${tr('census.cond.elderly', 'Elderly')}</button>${api.eng.K.heat ? `
            <button type="button" class="chip" data-focus="state:4" aria-pressed="false" data-hint="${tr('census.cond.heat.hint', 'Warmer than they can comfortably bear')}">${tr('census.cond.heat', 'Heat-stressed')}</button>
            <button type="button" class="chip" data-focus="state:5" aria-pressed="false" data-hint="${tr('census.cond.torpid.hint', 'Too cold to feed, swim or divide')}">${tr('census.cond.torpid', 'Torpid')}</button>` : ''}</div>`);
      }
      const fk = api.focusKey();
      const els = box.querySelectorAll('.bars');
      secs.forEach(([, , , rows], si) => {
        const max = Math.max(1, ...rows.map((r) => r.n));
        const tot = Math.max(1, rows.reduce((a, r) => a + r.n, 0));
        const share = els[si].closest('.disc').querySelector('.sharebar').children;
        rows.forEach((r, i) => {
          share[i].style.flexGrow = String(r.n / tot);
          const b = els[si].children[i];
          b.setAttribute('aria-pressed', String(fk === r.key));
          b.querySelector('i').style.width = `${((r.n / max) * 100).toFixed(1)}%`;
          setText(b.querySelector('.bn'), fmt(r.n));
          setText(b.querySelector('.bp'), `${((r.n / tot) * 100).toFixed(1)}%`);
        });
      });
      box.querySelectorAll('.chip[data-focus]').forEach((b) => b.setAttribute('aria-pressed', String(fk === b.dataset.focus)));
      // the chart changes only with a new history sample (main.js redraws it then)
      if (force) api.onCensusShown();
    }
    return { el, update };
  }

  // ---------------------------------------------------------- charts
  // i18n: Lab → Charts: each chart's heading (also its canvas's label) and the names of its lines (its legend, and the plate that reads them at a moment)
  const CHARTS = [
    [tr('lab.graph.population', 'Population'), null, [{ k: 'living', label: tr('lab.graph.population.living', 'living cells'), col: LIVING_CSS }, { k: 'husk', label: tr('lab.graph.population.husks', 'husks'), col: '#9a6c4c' }]],
    [tr('lab.graph.species', 'Species'), 'diversity', [{ k: 'alive', label: tr('lab.graph.species.alive', 'alive'), col: '#a3bdbe' }, { k: 'thriving', label: tr('lab.graph.species.thriving', 'thriving'), col: '#f1e3a0' }, { k: 'diversity', label: tr('lab.graph.species.diversity', 'effective species'), col: '#7fe0b0' }]],
    [tr('lab.graph.births', 'Births and deaths per minute'), null, [{ k: 'births', label: tr('lab.graph.births.births', 'births'), col: '#7fe0b0' }, { k: 'starve', label: tr('lab.graph.births.starved', 'starved'), col: '#ff8a6b' }, { k: 'old', label: tr('lab.graph.births.old', 'old age'), col: '#c9b8ff' }, { k: 'eaten', label: tr('lab.graph.births.eaten', 'eaten'), col: '#ff5f3a' }]],
    [tr('lab.graph.meals', 'Meals per minute'), 'flesh', [{ k: 'bite', label: tr('lab.graph.meals.bites', 'bites of producers'), col: '#d9f27a' }, { k: 'scav', label: tr('lab.graph.meals.husks', 'husks'), col: '#a87b5c' }, { k: 'eaten', label: tr('lab.graph.meals.kills', 'kills'), col: '#ff5f3a' }]],
    [tr('lab.graph.turnover', 'New species and extinctions per minute'), 'mutation', [{ k: 'mut', label: tr('lab.graph.turnover.new', 'new species'), col: '#c9b8ff' }, { k: 'ext', label: tr('lab.graph.turnover.ext', 'extinctions'), col: '#ff8a6b' }]],
    [tr('lab.graph.climate', 'Climate'), 'season', [{ k: 'ambient', label: tr('lab.graph.climate.light', 'baseline light'), col: '#d9f27a' }, { k: 'season', label: tr('lab.graph.climate.tide', 'tide strength'), col: '#5fd4c4' }], '%'],
  ];
  // the heat charts, while the world has a heat field
  if (api.eng.K.heat) {
    CHARTS.push(
      [tr('lab.graph.temperature', 'Temperature'), 'water', [{ k: 'temp', label: tr('lab.graph.temperature.water', 'background temperature'), col: '#ff8a3a' }], '°'],
      [tr('lab.graph.heat-deaths', 'Heat deaths per minute'), 'scalding', [{ k: 'scald', label: tr('lab.graph.heat-deaths.scalded', 'scalded'), col: '#ff5f3a' }]],
      [tr('lab.graph.torpid', 'Torpid'), 'torpor', [{ k: 'torpid', label: tr('lab.graph.torpid.share', 'share of the living'), col: '#7fb0ff' }], '%'],
    );
  }
  function buildCharts() {
    const p = pane('');
    p.scroll.classList.add('stack');
    p.scroll.innerHTML = `<div class="legend"><span><i style="background:var(--sun);height:6px;width:1px"></i>${tr('lab.graph.era-key', 'dotted lines mark a new era')}</span></div>`
      + CHARTS.map(([t, tip, s], i) => block(t, `<canvas class="dyn chart" data-i="${i}" aria-label="${esc(t)}"></canvas><div class="legend">${s.map((x) => `<span><i style="background:${x.col}"></i>${x.label}</span>`).join('')}</div>`, { tip })).join('')
      // i18n: Lab → Charts, Thermal niches: its heading, its canvas's label and its legend (the shaded bars, the dotted line, the dots)
      + (api.eng.K.heat ? block(tr('lab.graph.niches', 'Thermal niches'), `<canvas class="niches chart" aria-label="${tr('lab.graph.niches.aria', 'Each species by the temperature it prefers and its population. Point at a dot to name its species; click to open it.')}"></canvas><div class="legend"><span><i style="background:#ff8a3a;opacity:.4"></i>${tr('lab.graph.niches.felt', 'warmth the living feel')}</span><span><i style="background:#ff8a3a;height:6px;width:1px"></i>${tr('lab.graph.niches.water', 'background temperature')}</span><span>${tr('lab.graph.niches.dots', 'dot size: tolerance · ring: <term>heat-maker</term>', { term: (c) => term('heatmaker', c.join('')) })}</span></div>`, { tip: 'optimum' }) : '')
      + block(tr('lab.graph.eras', 'Eras'), '<ol class="eras" id="eras"></ol>');
    const cvs = [...p.scroll.querySelectorAll('canvas.dyn')];
    const niches = p.scroll.querySelector('canvas.niches');
    let erasKey = '';
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
        drawNiches(niches, sp, api.eng.tbg, now ? now.map((v, b) => (v - felt0.n[b]) >>> 0) : [], HEAT_BIN);
      }
      // (the record keeps the last eras, so its length stops changing: the last era's start tells a new one)
      const ek = `${eras.length}:${eras.at(-1)?.t}:${eras.filter((h) => h.excursion).length}`;
      if (ek !== erasKey) {
        erasKey = ek;
        // i18n: an era in Lab → Charts → Eras, after its start and name: its baseline light (percent), the water's temperature
        // (degrees) and a heat wave or cold snap in it, by how many degrees ({dT}) it warmed or cooled the water
        const line = (h) => {
          const light = Math.round(h.ambient * 100);
          if (!(api.eng.K.heat && h.temp != null)) return tr('lab.graph.era', 'light {light}%', { light });
          const temp = Math.round(h.temp);
          if (!h.excursion) return tr('lab.graph.era-temp', 'light {light}% · temperature {temp}°', { light, temp });
          // i18n: {dT}: by how many degrees the heat wave warmed (or the cold snap cooled) the water
          return tr('lab.graph.era-excursion', 'light {light}% · temperature {temp}° · {kind, select, wave {heat wave +{dT}°} other {cold snap −{dT}°}}',
            { light, temp, kind: h.excursion.dT > 0 ? 'wave' : 'snap', dT: Math.abs(h.excursion.dT).toFixed(0) });
        };
        setHTML($('eras'), eras.slice().reverse().map((h) => `<li><time>${fmtClock(h.t)}</time><b>${esc(eraName(h.name))}</b><span>${line(h)}</span></li>`).join(''));
      }
    }
    let felt0 = null, felt1 = null;
    return { ...p, update };
  }

  // ---------------------------------------------------------- log
  // i18n: Lab → Log: chips that show one kind of entry: all, the chronicler's stories, new species, new genera, extinctions, which species dominates, eras, the pool's events, heat
  const TYPES = [['all', tr('lab.feed.all', 'All')], ['story', tr('lab.feed.story', 'Chronicler')], ['est', tr('lab.feed.est', 'New species')], ['genus', tr('lab.feed.genus', 'New genera')], ['ext', tr('lab.feed.ext', 'Extinctions')],
    ['top', tr('lab.feed.top', 'Dominance')], ['era', tr('lab.feed.era', 'Eras')], ['pond', tr('lab.feed.pond', 'The pool')], ...(api.eng.K.heat ? [['heat', tr('lab.feed.heat', 'Heat')]] : [])];
  function buildLog() {
    const p = pane(`<input type="search" id="log-q" placeholder="${tr('lab.feed.search.ph', 'Search the log')}" aria-label="${tr('lab.feed.search.aria', 'Search the log')}" autocomplete="off">
      <div class="row" role="group" aria-label="${tr('lab.feed.show.aria', 'Show')}">${chips('logType', TYPES, st.logType)}</div>`);
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
      setHTML(list, ev.length ? ev.slice(0, 400).map((e) => `<li${e.type === 'story' ? ' class="story"' : ''}><i style="background:${cssCol(e.col)}"></i><time>${fmtClock(e.t)}</time><span>${e.html}</span></li>`).join('')
        : `<li style="display:block;border:0" class="note">${st.logType === 'story' ? tr('lab.feed.empty-story', 'The chronicler speaks rarely, only when something notable has happened: a death worth remembering, an arms race, a cycle of boom and bust, a lineage following the water. Nothing yet.') : tr('lab.feed.empty', 'Nothing yet.')}</li>`);
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

  // ---------------------------------------------------------- cabinet: every card saved, in every world (cabinet.js)
  // api.cabinet: { cards(), world(), facets(card), mini(card), status(card) (minicard.js setStatus), open(card), load(card),
  // place(card, x, y), remove(card), undo(), removed() }: a card tapped opens it, dragged onto the bench (its button, the
  // pipette's tool or strip) loads the pipette, onto the world sets a colony of it down there; its × takes it out
  // (Undo puts back the last for a while)
  function buildCabinet() {
    // i18n: Lab → Cabinet's filters: From, where a card was saved (this world, or another)
    const p = pane(`<div class="qrow"><input type="search" id="cab-q" placeholder="${tr('lab.cab.search.ph', 'Search the cabinet')}" aria-label="${tr('lab.cab.search.aria', 'Search the cabinet')}" autocomplete="off"><button type="button" class="chip filt" id="cab-filt" aria-expanded="false" aria-controls="cab-filters">${tr('lab.filter.button', 'Filters')}</button></div><div class="filters" id="cab-filters">
      ${seg(tr('lab.cab.from', 'From'), 'cabFrom', [['any', ANY], ['this', tr('lab.cab.from.this', 'This world')], ['other', tr('lab.cab.from.other', 'Other waters')]])}
      ${seg(term('diet', tr('lab.filter.diet', 'Diet')), 'cabDiet', DIETS)}
      ${seg(term('organism', tr('lab.filter.body', 'Body')), 'cabBody', BODIES)}</div>
      <div class="sum"><span id="cab-sum"></span><span class="lbl" id="cab-order">${tr('lab.cab.order', 'Newest first')}</span><span id="cab-undo" hidden></span></div>`, 'cabinet');
    const grid = document.createElement('div');
    grid.className = 'cab-grid';
    p.scroll.append(grid);
    const q = p.ctl.querySelector('#cab-q');
    q.addEventListener('input', () => { st.cabQ = q.value; update(true); });
    p.ctl.addEventListener('click', (e) => filterClick(e, p.ctl, 'cab-filt', update));
    const byId = (id) => api.cabinet.cards().find((c) => c.id === id);
    const drag = wireCardDrag(grid, {
      tap: (id) => { const c = byId(id); if (c) api.cabinet.open(c); },
      drop: (id, x, y, el) => {
        const c = byId(id);
        if (!c) return;
        if (el?.id === 'stage') api.cabinet.place(c, x, y);
        else if (el?.closest('#bench-open, #bench, #held, [data-tool="pipette"]')) api.cabinet.load(c);
      },
    });
    grid.addEventListener('click', (e) => { const b = e.target.closest('[data-out]'), c = b && byId(b.dataset.out); if (c) api.cabinet.remove(c); });
    p.ctl.addEventListener('click', (e) => { if (e.target.closest('#cab-undo button')) api.cabinet.undo(); });
    // Undo, while the card last taken out can be put back
    let undoKey = '';
    function undo() {
      const c = api.cabinet.removed(), el = p.ctl.querySelector('#cab-undo'), k = c ? c.id : '';
      if (k === undoKey) return;
      undoKey = k;
      el.hidden = !c; p.ctl.querySelector('#cab-order').hidden = !!c;
      // i18n: after a card is taken out of the cabinet ({name}: its species), and the button that puts it back
      el.innerHTML = c ? `<span>${tr('lab.cab.taken-out', '{name} taken out', { name: esc(c.name) })}</span> <button type="button" class="link">${tr('lab.cab.undo', 'Undo')}</button>` : '';
    }
    let key = '';
    function update(force) {
      const all = api.cabinet.cards(), world = api.cabinet.world();
      const shown = filterCards(all, { q: st.cabQ, from: st.cabFrom, world, test: (c) => {
        const f = api.cabinet.facets(c);
        return (st.cabDiet === 'all' || f.diet === st.cabDiet) && (st.cabBody === 'all' || f.body === st.cabBody);
      } });
      // i18n: the cards in the cabinet, and how many of them were saved in this world
      setText(p.ctl.querySelector('#cab-sum'), tr('lab.cab.sum', '{cards, plural, one {# card} other {# cards}} · {here, number} from this world', { cards: all.length, here: all.filter((c) => c.world === world).length }));
      const k = shown.map((c) => c.id).join(',');
      undo();
      if (drag.dragging()) return;
      // (the same cards: how each species does here, in place)
      if (k === key && !force) {
        const ids = new Map(shown.map((c) => [c.id, c]));
        for (const el of grid.querySelectorAll('.mc-st')) { const c = ids.get(el.parentElement.dataset.key); if (c) setStatus(el, api.cabinet.status(c)); }
        return;
      }
      key = k;
      grid.innerHTML = shown.length ? shown.map((c) => `<div class="cab-card">${api.cabinet.mini(c)}<button type="button" class="cab-out" data-out="${esc(c.id)}" aria-label="${tr('lab.cab.out.aria', 'Take {name}’s card out of the cabinet', { name: esc(c.name) })}" data-hint="${tr('lab.cab.out.hint', 'Out of the cabinet')}"><svg aria-hidden="true"><use href="#i-close"/></svg></button></div>`).join('')
        : `<div class="pip-empty"><b>${all.length ? tr('lab.cab.none', 'No card matches.') : tr('lab.cab.empty', 'The cabinet is empty.')}</b><span>${all.length ? tr('lab.cab.none.sub', 'Try other filters.') : tr('lab.cab.empty.sub', 'Save a species from the specimen panel (Save), or drop a species card’s PNG on the page: its card comes here, to be carried to any world.')}</span></div>`;
    }
    return { ...p, update };
  }

  const builders = { cabinet: buildCabinet, species: buildSpecies, lineage: buildLineage, census: buildCensus, charts: buildCharts, log: buildLog, guide: buildGuide };

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
  // built from the old world goes (the census, built from the page and kept current, stays; so does the cabinet, every
  // world's, redrawn for the new one as it next shows: built again, its cards' drag left three listeners on the window)
  function reset() {
    for (const k of Object.keys(panes)) if (k !== 'census' && k !== 'cabinet') { panes[k].el.remove(); delete panes[k]; }
    st.linRoot = null; // (the lineage explored was the old world's)
    if (st.open) show();
  }
  return {
    open, close, toggle, render, reset, isOpen: () => st.open, tab: () => st.tab,
    // open on one of the records (wider than the census)
    isWide: () => st.open && st.tab !== 'census',
    // back to the census, as the column it was before a record was opened
    narrow() { if (st.open && st.tab !== 'census') { st.tab = 'census'; apply(); show(); } },
    // the Lineage view back the way it came (Esc, Backspace): false if it is not on show or has nowhere to go
    back: () => lineageBack(),
  };
}
