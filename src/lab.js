import { GUIDE } from './guide.js';
import { fmt, fmtClock, esc, cssCol, term, spLink, ROLE, MATTER, LIVING_CSS } from './fmt.js';
import { voiceOf } from './audio/mapping.js';
import { sigilSVG } from './song.js';
import { drawLines, sparkPath } from './charts.js';

/**
 * The Lab: the records of this world. Each section is built once and then updated in place, so
 * controls never vanish under the pointer and lists keep their scroll position.
 */
export function createLab(api) {
  const $ = (id) => document.getElementById(id);
  const root = $('lab'), bodyEl = $('lab-body'), tabs = [...root.querySelectorAll('[data-tab]')];
  const st = {
    open: false, tab: 'species',
    q: '', status: 'thriving', diet: 'all', mobility: 'all', body: 'all', sort: 'pop',
    linAll: false, logType: 'all', logQ: '',
  };
  const panes = {};
  let lastUpdate = 0;

  function open(tab) {
    if (tab) st.tab = tab;
    st.open = true;
    root.hidden = false;
    document.body.classList.add('lab-open');
    $('lab-open').setAttribute('aria-expanded', 'true');
    show();
  }
  function close() {
    st.open = false;
    root.hidden = true;
    document.body.classList.remove('lab-open');
    $('lab-open').setAttribute('aria-expanded', 'false');
  }
  function toggle(tab) { if (st.open && (!tab || tab === st.tab)) close(); else open(tab); }
  $('lab-close').addEventListener('click', close);
  tabs.forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.tab; show(); }));
  $('lab-tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = tabs.findIndex((b) => b.dataset.tab === st.tab);
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    e.preventDefault(); n.click(); n.focus();
  });

  function show() {
    tabs.forEach((b) => { const on = b.dataset.tab === st.tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    for (const [k, p] of Object.entries(panes)) p.el.hidden = k !== st.tab;
    if (!panes[st.tab]) {
      const p = builders[st.tab]();
      panes[st.tab] = p;
      bodyEl.append(p.el);
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
  const DIETS = [['all', 'Any'], ['photosynth', 'Photosynth'], ['grazer', 'Grazer'], ['scavenger', 'Scavenger'], ['predator', 'Predator'], ['omnivore', 'Omnivore']];
  const MOBS = [['all', 'Any'], ['sessile', 'Sessile'], ['crawler', 'Crawler'], ['swimmer', 'Swimmer'], ['drifter', 'Drifter']];
  const SORTS = { pop: 'Population', peak: 'Peak', newest: 'Newest', oldest: 'Oldest', depth: 'Mutations', swim: 'Swimming', size: 'Size' };
  function matches(sp, F) {
    const f = api.facets(sp.genome);
    if (F.status === 'thriving' && !(sp.alive && sp.established)) return false;
    if (F.status === 'alive' && !sp.alive) return false;
    if (F.status === 'extinct' && sp.alive) return false;
    if (F.diet !== 'all' && f.diet !== F.diet) return false;
    if (F.mobility !== 'all' && f.mobility !== F.mobility) return false;
    if (F.body !== 'all' && f.body !== F.body) return false;
    if (F.q && !sp.name.toLowerCase().includes(F.q.toLowerCase())) return false;
    return true;
  }
  const BY = {
    pop: (a, b) => b.pop - a.pop || b.peak - a.peak, peak: (a, b) => b.peak - a.peak,
    newest: (a, b) => b.born - a.born, oldest: (a, b) => a.born - b.born,
    depth: (a, b) => b.genome.depth - a.genome.depth, size: (a, b) => b.genome.size - a.genome.size,
    swim: (a, b) => b.genome.swim * (1 - b.genome.photo) - a.genome.swim * (1 - a.genome.photo),
  };
  function buildSpecies() {
    const p = pane(`<div class="qrow"><input type="search" id="lab-q" placeholder="Search by name" aria-label="Search species by name" autocomplete="off"><button type="button" class="chip filt" id="sp-filt" aria-expanded="false" aria-controls="sp-filters">Filters</button></div><div class="filters" id="sp-filters">
      <div class="row" role="group" aria-label="Status"><span class="lbl">Status</span>${chips('status', [['thriving', 'Thriving'], ['alive', 'All alive'], ['extinct', 'Extinct'], ['all', 'All']], st.status)}</div>
      <div class="row" role="group" aria-label="Diet"><span class="lbl">${term('diet', 'Diet')}</span>${chips('diet', DIETS, st.diet)}</div>
      <div class="row" role="group" aria-label="Movement"><span class="lbl">Moves</span>${chips('mobility', MOBS, st.mobility)}</div>
      <div class="row" role="group" aria-label="Body"><span class="lbl">${term('organism', 'Body')}</span>${chips('body', [['all', 'Any'], ['multicellular', 'Many cells'], ['single-celled', 'One cell']], st.body)}</div></div>
      <div class="sum"><span id="sp-sum"></span><span class="sel"><label class="lbl" for="sp-sort">Sort</label><select id="sp-sort">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><button type="button" class="chip" id="sp-hl">Highlight these</button></span></div>`);
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
      const ft = e.target.closest('#sp-filt');
      if (ft) { const on = !p.ctl.classList.contains('open'); p.ctl.classList.toggle('open', on); ft.setAttribute('aria-expanded', String(on)); return; }
      if (e.target.closest('#sp-hl')) {
        const F = { ...st };
        const parts = [F.status !== 'all' ? F.status : '', F.diet !== 'all' ? F.diet : '', F.mobility !== 'all' ? F.mobility : '', F.body !== 'all' ? F.body : '', F.q ? `“${F.q}”` : ''].filter(Boolean);
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
        li.innerHTML = `<span class="spsig term" data-tip="sigil">${sigilSVG(voiceOf(sp.genome), sp.genome, { size: 26 })}</span><div class="spmain">${spLink(sp.serial, sp.name)}<small>${f.diet} · ${f.mobility} · ${f.body === 'multicellular' ? `${f.types}-type body` : 'one cell'}</small></div><svg viewBox="0 0 78 22" class="spark" aria-hidden="true"><path stroke="${cssCol(sp.genome.col)}"/></svg><div class="spnum"><b></b><span></span></div>`;
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
  // Every established species as a bar from its first appearance to now or its extinction, its
  // thickness following its population, joined to its nearest established ancestor where it arose.
  function buildLineage() {
    const p = pane(`<div class="row" role="group" aria-label="Show"><span class="lbl">Show</span>${chips('linAll', [['false', 'Living lineages'], ['true', 'Every species']], String(st.linAll))}</div>
      <div class="sum"><span id="lin-sum"></span><span class="lbl lin-key">Thickness: population</span></div>`, 'lineage');
    const svgWrap = document.createElement('div');
    p.scroll.append(svgWrap);
    p.ctl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      st.linAll = b.dataset.v === 'true';
      p.ctl.querySelectorAll('[data-k]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === String(st.linAll))));
      update(true);
    });
    const open = (e) => { const r = e.target.closest('[data-serial]'); if (r) api.openSpecies(+r.dataset.serial); };
    svgWrap.addEventListener('click', open);
    svgWrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } });
    let lastKey = '', lastAt = 0;
    function update(force) {
      const now = performance.now();
      if (!force && (now - lastAt < (st.linAll ? 6000 : 2500) || hovering(svgWrap))) return;
      lastAt = now;
      const life = api.life();
      const est = [...life.reg.values()].filter((s) => s.established);
      const kids = new Map();
      const roots = [];
      for (const s of est) {
        const a = s.ancestor && life.reg.get(s.ancestor);
        if (a && a.established) { if (!kids.has(a.serial)) kids.set(a.serial, []); kids.get(a.serial).push(s); } else roots.push(s);
      }
      // keep only branches with a living species in them, unless asked for everything
      const live = new Map();
      const hasLive = (s) => {
        if (live.has(s.serial)) return live.get(s.serial);
        const v = s.alive || (kids.get(s.serial) || []).some(hasLive);
        live.set(s.serial, v);
        return v;
      };
      const rows = [];
      const walk = (s, d) => {
        if (!st.linAll && !hasLive(s)) return;
        rows.push({ s, d });
        (kids.get(s.serial) || []).sort((a, b) => a.born - b.born).forEach((c) => walk(c, d + 1));
      };
      roots.sort((a, b) => a.born - b.born).forEach((s) => walk(s, 0));
      $('lin-sum').textContent = `${fmt(rows.length)} species · ${fmt(rows.filter((r) => r.s.alive).length)} alive`;
      const T = Math.max(1, api.eng.simTime);
      const W = Math.max(280, svgWrap.clientWidth);
      const key = `${rows.length}:${W}:${Math.floor(T / 5)}:${st.linAll}:${api.focusKey()}`;
      if (!force && key === lastKey) return;
      lastKey = key;
      const RH = 32, top = 22, padL = 4, padR = 10;
      const X = (t) => padL + (t / T) * (W - padL - padR);
      const H = rows.length * RH + 8;
      const hist = life.history;
      // each species' population at every history sample, gathered in one pass
      const series = new Map();
      hist.forEach((h, i) => { for (const [k, v] of h.sp) { let a = series.get(k); if (!a) series.set(k, (a = new Float32Array(hist.length))); a[i] = v; } });
      const yOf = new Map(rows.map((r, i) => [r.s.serial, i * RH + 22]));
      // time axis, kept in view while the rows scroll under it
      const step = [60, 120, 300, 600, 900, 1800, 3600, 7200].find((s) => T / s <= 6) || 7200;
      let axis = `<svg class="lin-axis" viewBox="0 0 ${W} ${top}" width="${W}" height="${top}" aria-hidden="true">`;
      let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="list" aria-label="Lineage of established species">`;
      for (let t = 0; t <= T; t += step) {
        axis += `<line x1="${X(t)}" x2="${X(t)}" y1="${top - 5}" y2="${top}" stroke="rgba(150,222,230,0.55)"/><text x="${X(t) + 3}" y="12" font-size="10" fill="#6f8a8c" letter-spacing="1">${fmtClock(t)}</text>`;
        svg += `<line x1="${X(t)}" x2="${X(t)}" y1="0" y2="${H}" stroke="rgba(130,205,214,0.08)"/>`;
      }
      axis += `<line x1="0" x2="${W}" y1="${top - 0.5}" y2="${top - 0.5}" stroke="rgba(130,205,214,0.22)"/></svg>`;
      for (const e of api.climate().history.slice(1)) svg += `<line x1="${X(e.t)}" x2="${X(e.t)}" y1="0" y2="${H}" stroke="rgba(241,227,160,0.3)" stroke-dasharray="1 3"/>`;
      // connectors under the bars
      for (const { s } of rows) {
        const a = s.ancestor && yOf.get(s.ancestor);
        if (a == null) continue;
        const x = X(s.born);
        svg += `<path d="M${x},${a + 2} V${yOf.get(s.serial)}" stroke="rgba(163,189,190,0.35)" fill="none"/>`;
      }
      const hl = api.focusKey();
      // one thickness scale for every bar, so a dominant species reads thicker than a minor one
      let peak = 1;
      for (const { s } of rows) if (s.peak > peak) peak = s.peak;
      const k = 6 / Math.sqrt(peak);
      rows.forEach(({ s }) => {
        const y = yOf.get(s.serial);
        const x0 = X(s.born), x1 = Math.max(x0 + 2, X(s.alive ? T : (s.extinct ?? T)));
        const col = cssCol(s.genome.col, s.alive ? 1 : 0.55);
        // population as the bar's thickness
        let band = '';
        if (hist.length > 1) {
          const pts = [];
          const vals = series.get(s.serial);
          if (vals) hist.forEach((h, i) => { if (h.t >= s.born - 1 && h.t <= (s.alive ? T : (s.extinct ?? T)) + 1) pts.push([X(h.t), Math.sqrt(vals[i]) * k]); });
          if (s.alive && pts.length) pts.push([X(T), Math.sqrt(s.pop) * k]);
          if (pts.length > 1) {
            band = `<path d="M${pts.map(([x, v]) => `${x.toFixed(1)},${(y - 0.75 - v).toFixed(1)}`).join('L')}L${pts.map(([x, v]) => `${x.toFixed(1)},${(y + 0.75 + v).toFixed(1)}`).reverse().join('L')}Z" fill="${col}" opacity="0.85"/>`;
          }
        }
        const anchorEnd = x0 > W * 0.62;
        const label = `${esc(s.name)}${s.alive ? '' : ' †'}`;
        const tx = anchorEnd ? Math.min(W - padR, x1) : x0 + 1;
        const tip = `${s.name} · ${s.alive ? `${fmt(s.pop)} alive` : `extinct at ${fmtClock(s.extinct ?? 0)}`} · arose ${fmtClock(s.born)} · peak ${fmt(s.peak)}`;
        svg += `<g class="row" data-serial="${s.serial}" tabindex="0" role="listitem" aria-label="${esc(tip)}">`
          + `<rect class="hit" x="0" y="${y - 22}" width="${W}" height="${RH}" fill="${hl === `sp:${s.serial}` ? 'rgba(255,95,58,0.12)' : 'transparent'}"/>`
          + `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="${col}" stroke-width="1.5"/>${band}`
          + `<circle cx="${x0}" cy="${y}" r="2.2" fill="${col}"/>`
          + `<text x="${tx}" y="${y - 8}" font-size="11.5" fill="${s.alive ? '#e2f1f0' : '#6f8a8c'}" ${anchorEnd ? 'text-anchor="end"' : ''}>${label}</text></g>`;
      });
      svg += '</svg>';
      svgWrap.innerHTML = rows.length ? axis + svg : '<p class="note">Species appear here once they become established.</p>';
    }
    return { ...p, update };
  }

  // ---------------------------------------------------------- census
  function buildCensus() {
    const p = pane('<p class="note">Choose any row to highlight it in the world; everything else dims.</p>');
    const box = document.createElement('div');
    p.scroll.append(box);
    let shape = '';
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-focus]');
      if (b) { api.focusFacet(b.dataset.focus); update(true); }
    });
    function sections() {
      const life = api.life();
      const [silt, glint, husk, living, stone] = life.counts;
      const roles = life.roles || [0, 0, 0];
      const g = api.groups();
      return [
        ['Matter and life', 'living', [
          { key: 'class:living', label: 'Living cells', n: living, col: LIVING_CSS, tip: 'living' },
          { key: 'class:glint', label: 'Glint', n: glint, col: MATTER[1].css, tip: 'glint' },
          { key: 'class:husk', label: 'Husk', n: husk, col: MATTER[2].css, tip: 'husk' },
          { key: 'class:stone', label: 'Stone', n: stone, col: MATTER[3].css, tip: 'stone' },
          { key: 'class:silt', label: 'Silt', n: silt, col: MATTER[0].css, tip: 'silt' }]],
        ['Diet', 'diet', g.diet.map((d) => ({ key: `diet:${d.name}`, label: d.name, n: d.n, col: d.col }))],
        ['Movement', null, g.mobility.map((d) => ({ key: `mobility:${d.name}`, label: d.name, n: d.n, col: d.col }))],
        ['Body', 'organism', g.body.map((d) => ({ key: `body:${d.name}`, label: d.name, n: d.n, col: d.col }))],
        ['Cell types', 'celltype', ROLE.map((r, i) => ({ key: `role:${i}`, label: `${r}-cells`, n: roles[i], col: ['#ffb45e', '#b38cff', '#5fd4c4'][i] }))],
        ['Cell types per species', 'bodyplan', g.types.map((d) => ({ key: `types:${d.name}`, label: `${d.name} type${d.name === '1' ? '' : 's'}`, n: d.n, col: d.col }))],
      ];
    }
    function update() {
      const secs = sections();
      const k = secs.map(([t, , r]) => t + r.map((x) => x.key).join()).join('|');
      if (k !== shape) {
        shape = k;
        box.innerHTML = secs.map(([title, tip, rows]) => `<div class="cblk"><div class="sub-h"><span>${tip ? term(tip, title) : title}</span></div><div class="bars">${rows.map((r) => `<button type="button" class="barrow" data-focus="${r.key}" aria-pressed="false"><span class="bl">${r.label}</span><span class="meter" style="color:${r.col}"><i></i></span><span class="bn"></span><span class="bp"></span></button>`).join('')}</div></div>`).join('')
          + `<div class="cblk"><div class="sub-h"><span>Condition</span></div><div class="row" style="display:flex;flex-wrap:wrap;gap:4px">
            <button type="button" class="chip" data-focus="state:1" aria-pressed="false">Hungry</button>
            <button type="button" class="chip" data-focus="state:2" aria-pressed="false">Ready to divide</button>
            <button type="button" class="chip" data-focus="state:3" aria-pressed="false">Elderly</button></div>
            <p class="note" style="margin-top:8px">Hungry: under 35% of the energy needed to divide. Ready: over 85%. Elderly: past 80% of lifespan.</p></div>`;
      }
      const fk = api.focusKey();
      const els = box.querySelectorAll('.bars');
      secs.forEach(([, , rows], si) => {
        const max = Math.max(1, ...rows.map((r) => r.n));
        const tot = Math.max(1, rows.reduce((a, r) => a + r.n, 0));
        rows.forEach((r, i) => {
          const b = els[si].children[i];
          b.setAttribute('aria-pressed', String(fk === r.key));
          b.querySelector('i').style.width = `${((r.n / max) * 100).toFixed(1)}%`;
          b.querySelector('.bn').textContent = fmt(r.n);
          b.querySelector('.bp').textContent = `${((r.n / tot) * 100).toFixed(1)}%`;
        });
      });
      box.querySelectorAll('.chip[data-focus]').forEach((b) => b.setAttribute('aria-pressed', String(fk === b.dataset.focus)));
    }
    return { ...p, update };
  }

  // ---------------------------------------------------------- charts
  const CHARTS = [
    ['Population', null, [{ k: 'living', label: 'living cells', col: LIVING_CSS }, { k: 'glint', label: 'glint', col: '#b9e6ff' }, { k: 'husk', label: 'husks', col: '#9a6c4c' }]],
    ['Species', 'diversity', [{ k: 'alive', label: 'alive', col: '#a3bdbe' }, { k: 'thriving', label: 'thriving', col: '#f1e3a0' }, { k: 'diversity', label: 'effective species', col: '#7fe0b0' }]],
    ['Births and deaths per minute', null, [{ k: 'births', label: 'births', col: '#7fe0b0' }, { k: 'starve', label: 'starved', col: '#ff8a6b' }, { k: 'old', label: 'old age', col: '#c9b8ff' }, { k: 'eaten', label: 'eaten', col: '#ff5f3a' }]],
    ['Meals per minute', 'flesh', [{ k: 'graze', label: 'glint', col: '#b9e6ff' }, { k: 'scav', label: 'husks', col: '#a87b5c' }, { k: 'prey', label: 'kills', col: '#ff5f3a' }, { k: 'bite', label: 'bites of plants', col: '#d9f27a' }]],
    ['New species and extinctions per minute', 'mutation', [{ k: 'mut', label: 'new species', col: '#c9b8ff' }, { k: 'ext', label: 'extinctions', col: '#ff8a6b' }]],
    ['Climate', 'season', [{ k: 'ambient', label: 'baseline light', col: '#d9f27a' }, { k: 'season', label: 'tide strength', col: '#5fd4c4' }]],
  ];
  function buildCharts() {
    const p = pane('');
    p.scroll.innerHTML = `<div class="legend" style="margin:8px 0 4px"><span><i style="background:var(--sun);height:6px;width:1px"></i>dotted lines mark a new era</span></div>`
      + CHARTS.map(([t, tip, s], i) => `<div class="cblk"><div class="sub-h"><span>${tip ? term(tip, t) : t}</span></div><canvas class="dyn" data-i="${i}" aria-label="${esc(t)}"></canvas><div class="legend">${s.map((x) => `<span><i style="background:${x.col}"></i>${x.label}</span>`).join('')}</div></div>`).join('')
      + '<div class="cblk"><div class="sub-h"><span>Eras</span></div><ol class="eras" id="eras"></ol></div>';
    const cvs = [...p.scroll.querySelectorAll('canvas.dyn')];
    let erasN = -1;
    function update() {
      const hist = api.life().history, eras = api.climate().history;
      cvs.forEach((cv, i) => drawLines(cv, hist, CHARTS[i][2], eras, ''));
      if (eras.length !== erasN) {
        erasN = eras.length;
        $('eras').innerHTML = eras.slice().reverse().map((h) => `<li><time>${fmtClock(h.t)}</time><b>${esc(h.name)}</b><span>light ${Math.round(h.ambient * 100)}% · glint ×${h.charge.toFixed(2)}</span></li>`).join('');
      }
    }
    return { ...p, update };
  }

  // ---------------------------------------------------------- log
  const TYPES = [['all', 'All'], ['est', 'New species'], ['genus', 'New genera'], ['ext', 'Extinctions'], ['top', 'Dominance'], ['era', 'Eras']];
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
      list.innerHTML = ev.length ? ev.slice(0, 400).map((e) => `<li><i style="background:${cssCol(e.col)}"></i><time>${fmtClock(e.t)}</time><span>${e.html}</span></li>`).join('') : '<li style="display:block;border:0" class="note">Nothing yet.</li>';
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

  // called on every census; while a pointer is held on the Lab nothing is rebuilt under it
  function render(force) {
    if (!st.open || !panes[st.tab]) return;
    const now = performance.now();
    if (!force && (api.held() || now - lastUpdate < 900)) return;
    lastUpdate = now;
    panes[st.tab].update(!!force);
  }
  return { open, close, toggle, render, isOpen: () => st.open, tab: () => st.tab };
}
