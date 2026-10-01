import { GUIDE } from './guide.js';

/**
 * The Lab: a drawer of research tools. Everything it needs from the simulation comes through `api`.
 */
export function createLab(api) {
  const { $, fmt, fmtClock, fmtDur, esc, cssCol, ROLE, MATTER } = api;
  const root = $('lab');
  const body = $('lab-body');
  const tabs = [...root.querySelectorAll('[data-tab]')];
  const st = {
    open: false, tab: 'species',
    q: '', diet: 'all', mobility: 'all', bodyType: 'all', types: 'all', status: 'thriving', sort: 'pop',
    chronType: 'all', chronQ: '', guideAt: 'overview',
  };
  let lastRender = 0;

  function open(tab) {
    st.open = true;
    if (tab) st.tab = tab;
    root.hidden = false;
    document.body.classList.add('lab-open');
    render(true);
  }
  function close() { st.open = false; root.hidden = true; document.body.classList.remove('lab-open'); }
  function toggle(tab) { if (st.open && (!tab || tab === st.tab)) close(); else open(tab); }
  $('lab-close').addEventListener('click', close);
  tabs.forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.tab; render(true); }));

  // ---------------------------------------------------------- species
  const DIETS = ['photosynth', 'grazer', 'scavenger', 'predator', 'omnivore'];
  const MOBS = ['sessile', 'crawler', 'swimmer', 'drifter'];
  const opt = (v, cur, label = v) => `<option value="${v}"${v === cur ? ' selected' : ''}>${label}</option>`;

  function speciesMatches(sp, F = st) {
    const f = api.facets(sp.genome);
    if (F.status === 'thriving' && !(sp.alive && sp.established)) return false;
    if (F.status === 'alive' && !sp.alive) return false;
    if (F.status === 'extinct' && sp.alive) return false;
    if (F.diet !== 'all' && f.diet !== F.diet) return false;
    if (F.mobility !== 'all' && f.mobility !== F.mobility) return false;
    if (F.bodyType !== 'all' && f.body !== F.bodyType) return false;
    if (F.types !== 'all' && String(f.types) !== F.types) return false;
    if (F.q && !sp.name.toLowerCase().includes(F.q.toLowerCase())) return false;
    return true;
  }
  function sortSpecies(list) {
    const k = st.sort;
    const by = {
      pop: (a, b) => b.pop - a.pop, peak: (a, b) => b.peak - a.peak,
      newest: (a, b) => b.born - a.born, oldest: (a, b) => a.born - b.born,
      depth: (a, b) => b.genome.depth - a.genome.depth, size: (a, b) => b.genome.size - a.genome.size,
      upkeep: (a, b) => b.genome.metab - a.genome.metab, swim: (a, b) => b.genome.swim * (1 - b.genome.photo) - a.genome.swim * (1 - a.genome.photo),
    }[k];
    return list.sort(by);
  }

  function speciesFilterPredicate() {
    const F = { ...st };
    return (g, sp) => !!sp && sp.alive && speciesMatches(sp, F);
  }

  function sparkPath(serial, w, h) {
    const hist = api.life().history;
    if (hist.length < 2) return '';
    let max = 1;
    const vals = hist.map((s) => { const e = s.sp.find((q) => q[0] === serial); const v = e ? e[1] : 0; if (v > max) max = v; return v; });
    return vals.map((v, i) => `${i ? 'L' : 'M'}${((i / (vals.length - 1)) * w).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join('');
  }

  function renderSpecies() {
    const life = api.life();
    const all = [...life.reg.values()];
    const list = sortSpecies(all.filter((sp) => speciesMatches(sp)));
    const living = Math.max(1, life.counts[3]);
    const tot = list.reduce((a, s) => a + s.pop, 0);
    let html = `<div class="filters">
      <input id="lab-q" type="search" placeholder="Search names" value="${esc(st.q)}" aria-label="Search species by name">
      <label>Status<select data-f="status">${opt('thriving', st.status)}${opt('alive', st.status, 'all alive')}${opt('extinct', st.status)}${opt('all', st.status, 'everything')}</select></label>
      <label><span class="term" data-tip="diet">Diet</span><select data-f="diet">${opt('all', st.diet)}${DIETS.map((d) => opt(d, st.diet)).join('')}</select></label>
      <label>Mobility<select data-f="mobility">${opt('all', st.mobility)}${MOBS.map((d) => opt(d, st.mobility)).join('')}</select></label>
      <label><span class="term" data-tip="organism">Body</span><select data-f="bodyType">${opt('all', st.bodyType)}${opt('multicellular', st.bodyType)}${opt('single-celled', st.bodyType)}</select></label>
      <label><span class="term" data-tip="bodyplan">Cell types</span><select data-f="types">${opt('all', st.types, 'any')}${opt('1', st.types)}${opt('2', st.types)}${opt('3', st.types)}</select></label>
      <label>Sort<select data-f="sort">${opt('pop', st.sort, 'population')}${opt('peak', st.sort)}${opt('newest', st.sort)}${opt('oldest', st.sort)}${opt('depth', st.sort, 'mutation depth')}${opt('swim', st.sort, 'swimming')}${opt('size', st.sort)}${opt('upkeep', st.sort)}</select></label>
    </div>
    <div class="lab-actions">
      <span class="muted">${fmt(list.length)} species · ${fmt(tot)} cells · ${((tot / living) * 100).toFixed(1)}% of life</span>
      <button type="button" data-act="hl-filter">Highlight these</button>
    </div><ol class="splist">`;
    for (const sp of list.slice(0, 150)) {
      const g = sp.genome;
      const f = api.facets(g);
      const share = sp.alive ? `${((sp.pop / living) * 100).toFixed(1)}%` : 'extinct';
      html += `<li data-serial="${sp.serial}" class="${sp.alive ? '' : 'gone'}">
        <i style="background:${cssCol(g.col)}"></i>
        <div class="spmain"><a href="#" class="sp" data-serial="${sp.serial}">${esc(sp.name)}</a>
          <span class="chips"><em>${f.diet}</em><em>${f.mobility}</em><em>${f.body === 'multicellular' ? `${f.types}-type body` : 'single cell'}</em></span></div>
        <svg viewBox="0 0 70 20" class="spark" aria-hidden="true"><path d="${sparkPath(sp.serial, 70, 20)}" stroke="${cssCol(g.col)}"/></svg>
        <div class="spnum"><b>${sp.alive ? fmt(sp.pop) : '–'}</b><span>${share}</span></div>
      </li>`;
    }
    if (list.length > 150) html += `<li class="more">${list.length - 150} more not shown; narrow the filters.</li>`;
    if (!list.length) html += '<li class="more">No species match these filters.</li>';
    html += '</ol>';
    return html;
  }

  // ---------------------------------------------------------- composition
  function bars(title, rows, tip) {
    const max = Math.max(1, ...rows.map((r) => r.n));
    const tot = Math.max(1, rows.reduce((a, r) => a + r.n, 0));
    return `<div class="sect"><div class="eyebrow">${tip ? `<span class="term" data-tip="${tip}">${title}</span>` : title}</div><div class="bars">${rows.map((r) => `
      <button type="button" class="barrow${api.focusKey() === r.key ? ' on' : ''}" data-focus="${r.key}" title="Highlight ${esc(r.label)} in the simulation">
        <span class="bl">${r.tip ? `<span class="term" data-tip="${r.tip}">${r.label}</span>` : r.label}</span>
        <span class="bt"><i style="width:${((r.n / max) * 100).toFixed(1)}%;background:${r.col}"></i></span>
        <span class="bn">${fmt(r.n)}</span><span class="bp">${((r.n / tot) * 100).toFixed(1)}%</span>
      </button>`).join('')}</div></div>`;
  }

  function renderComposition() {
    const life = api.life();
    const [silt, glint, husk, living] = life.counts;
    const roles = life.roles || [0, 0, 0];
    const groups = api.groups();
    let html = '<p class="muted">Click any bar to highlight it in the simulation. Everything else is dimmed until you clear the highlight.</p>';
    html += bars('Matter and life', [
      { key: 'class:living', label: 'Living cells', n: living, col: 'var(--warm)', tip: 'living' },
      { key: 'class:glint', label: 'Glint', n: glint, col: MATTER[1].css, tip: 'glint' },
      { key: 'class:husk', label: 'Husk', n: husk, col: MATTER[2].css, tip: 'husk' },
      { key: 'class:silt', label: 'Silt', n: silt, col: MATTER[0].css, tip: 'silt' },
    ]);
    html += bars('Cell types', ROLE.map((r, i) => ({ key: `role:${i}`, label: `${r}-cells`, n: roles[i], col: ['#ffb45e', '#b38cff', '#5fd4c4'][i] })), 'celltype');
    html += bars('Diet', groups.diet.map((d) => ({ key: `diet:${d.name}`, label: d.name, n: d.n, col: d.col, tip: d.name === 'omnivore' ? 'diet' : d.name })), 'diet');
    html += bars('Mobility', groups.mobility.map((d) => ({ key: `mobility:${d.name}`, label: d.name, n: d.n, col: d.col, tip: { sessile: 'sessile', drifter: 'drifting', swimmer: 'swimming', crawler: 'thrust' }[d.name] })));
    html += bars('Body', groups.body.map((d) => ({ key: `body:${d.name}`, label: d.name, n: d.n, col: d.col, tip: 'organism' })), 'adhesion');
    html += bars('Cell types per species', groups.types.map((d) => ({ key: `types:${d.name}`, label: `${d.name} type${d.name === '1' ? '' : 's'}`, n: d.n, col: d.col })), 'bodyplan');
    html += `<div class="sect"><div class="eyebrow">Cell condition</div><div class="chiprow">
      <button type="button" class="${api.focusKey() === 'state:1' ? 'on' : ''}" data-focus="state:1">Hungry</button>
      <button type="button" class="${api.focusKey() === 'state:2' ? 'on' : ''}" data-focus="state:2">Ready to divide</button>
      <button type="button" class="${api.focusKey() === 'state:3' ? 'on' : ''}" data-focus="state:3">Elderly</button>
    </div><p class="muted">Hungry: under 35% of the energy needed to divide. Ready: over 85%. Elderly: past 80% of lifespan.</p></div>`;
    return html;
  }

  // ---------------------------------------------------------- dynamics
  function chart(id, title, series, tip) {
    return `<div class="sect"><div class="eyebrow">${tip ? `<span class="term" data-tip="${tip}">${title}</span>` : title}</div>
      <canvas class="dyn" id="${id}" data-series='${JSON.stringify(series)}'></canvas>
      <div class="legend">${series.map((s) => `<span><i style="background:${s.col}"></i>${s.label}</span>`).join('')}</div></div>`;
  }
  function renderDynamics() {
    return '<p class="muted">Sampled from the census; the time window grows with the epoch.</p>'
      + chart('dyn-life', 'Population', [{ k: 'living', label: 'living cells', col: '#ffb45e' }, { k: 'glint', label: 'glint', col: '#b9e6ff' }, { k: 'husk', label: 'husks', col: '#8a6247' }])
      + chart('dyn-sp', 'Species', [{ k: 'alive', label: 'alive', col: '#9aa3b8' }, { k: 'thriving', label: 'thriving', col: '#ffb45e' }, { k: 'diversity', label: 'effective species', col: '#7fe0b0' }], 'diversity')
      + chart('dyn-bd', 'Births and deaths per minute', [{ k: 'births', label: 'births', col: '#7fe0b0' }, { k: 'starve', label: 'starved', col: '#ff8a6b' }, { k: 'old', label: 'old age', col: '#c9b8ff' }, { k: 'eaten', label: 'eaten', col: '#ff5e7a' }])
      + chart('dyn-feed', 'Meals per minute', [{ k: 'graze', label: 'glint', col: '#b9e6ff' }, { k: 'scav', label: 'husks', col: '#a87b5c' }, { k: 'prey', label: 'kills', col: '#ff5e7a' }, { k: 'bite', label: 'bites of plants', col: '#d9f27a' }], 'flesh')
      + chart('dyn-mut', 'Speciation per minute', [{ k: 'mut', label: 'mutant species', col: '#c9b8ff' }, { k: 'ext', label: 'extinctions', col: '#ff8a6b' }], 'mutation')
      + chart('dyn-env', 'Climate', [{ k: 'ambient', label: 'baseline light', col: '#d9f27a' }, { k: 'season', label: 'tide strength', col: '#5fd4c4' }], 'season');
  }
  function drawDynamics() {
    const hist = api.life().history;
    for (const cv of body.querySelectorAll('canvas.dyn')) {
      const series = JSON.parse(cv.dataset.series);
      const r = Math.min(devicePixelRatio || 1, 2);
      const w = cv.clientWidth, h = cv.clientHeight;
      cv.width = Math.round(w * r); cv.height = Math.round(h * r);
      const g = cv.getContext('2d');
      g.setTransform(r, 0, 0, r, 0, 0);
      g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(236,230,245,0.12)';
      g.beginPath(); g.moveTo(0, h - 0.5); g.lineTo(w, h - 0.5); g.moveTo(0, 17.5); g.lineTo(w, 17.5); g.stroke();
      if (hist.length < 2) continue;
      let max = 1e-6;
      for (const s of series) for (const p of hist) if ((p[s.k] ?? 0) > max) max = p[s.k];
      for (const s of series) {
        g.strokeStyle = s.col; g.lineWidth = 1.4; g.beginPath();
        hist.forEach((p, i) => { const x = (i / (hist.length - 1)) * w; const y = h - 2 - ((p[s.k] ?? 0) / max) * (h - 20); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        g.stroke();
      }
      g.fillStyle = 'rgba(236,230,245,0.55)';
      g.font = '9px ui-monospace, monospace';
      g.fillText(max >= 10 ? fmt(Math.round(max)) : max.toFixed(2), 3, 10);
      g.textAlign = 'right';
      g.fillText(`${fmtClock(hist[0].t)} – ${fmtClock(hist[hist.length - 1].t)}`, w - 3, 10);
    }
  }

  // ---------------------------------------------------------- lineage
  let treeRows = [];
  function renderLineage() {
    return `<p class="muted">Every species that became established, from its first appearance to now or to its extinction. Lines join each species to its nearest established ancestor. Click a line to open the species.</p>
      <div class="treewrap"><canvas id="tree"></canvas></div>`;
  }
  function drawLineage() {
    const cv = $('tree');
    if (!cv) return;
    const life = api.life();
    const est = [...life.reg.values()].filter((s) => s.established);
    const kids = new Map();
    const roots = [];
    for (const s of est) {
      const a = s.ancestor && life.reg.get(s.ancestor);
      if (a && a.established) { if (!kids.has(a.serial)) kids.set(a.serial, []); kids.get(a.serial).push(s); }
      else roots.push(s);
    }
    treeRows = [];
    const walk = (s, depth) => { treeRows.push({ s, depth }); (kids.get(s.serial) || []).sort((a, b) => a.born - b.born).forEach((c) => walk(c, depth + 1)); };
    roots.sort((a, b) => a.born - b.born).forEach((s) => walk(s, 0));
    const rowH = 9;
    const r = Math.min(devicePixelRatio || 1, 2);
    const w = cv.parentElement.clientWidth - 2;
    const h = Math.max(60, treeRows.length * rowH + 28);
    cv.style.height = `${h}px`;
    cv.width = Math.round(w * r); cv.height = Math.round(h * r);
    const g = cv.getContext('2d');
    g.setTransform(r, 0, 0, r, 0, 0);
    g.clearRect(0, 0, w, h);
    const T = Math.max(1, api.eng.simTime);
    const X = (t) => 6 + (t / T) * (w - 12);
    const yOf = new Map();
    treeRows.forEach((row, i) => yOf.set(row.s.serial, 8 + i * rowH));
    g.lineWidth = 1;
    for (const row of treeRows) {
      const s = row.s;
      const y = yOf.get(s.serial);
      const a = s.ancestor && yOf.get(s.ancestor);
      if (a != null) { g.strokeStyle = 'rgba(236,230,245,0.18)'; g.beginPath(); g.moveTo(X(s.born), a); g.lineTo(X(s.born), y); g.stroke(); }
    }
    for (const row of treeRows) {
      const s = row.s;
      const y = yOf.get(s.serial);
      const end = s.alive ? T : (s.extinct ?? T);
      g.strokeStyle = cssCol(s.genome.col, s.alive ? 1 : 0.45);
      g.lineWidth = s.alive ? 3 : 2;
      g.beginPath(); g.moveTo(X(s.born), y); g.lineTo(Math.max(X(s.born) + 2, X(end)), y); g.stroke();
    }
    g.fillStyle = 'rgba(236,230,245,0.5)';
    g.font = '9px ui-monospace, monospace';
    g.fillText('0:00', 4, h - 3);
    g.textAlign = 'right';
    g.fillText(fmtClock(T), w - 4, h - 3);
    cv.onclick = (e) => {
      const i = Math.floor((e.offsetY - 4) / rowH);
      const row = treeRows[i];
      if (row) api.openSpecies(row.s.serial);
    };
    cv.onmousemove = (e) => {
      const i = Math.floor((e.offsetY - 4) / rowH);
      const row = treeRows[i];
      cv.title = row ? `${row.s.name} · ${row.s.alive ? `${fmt(row.s.pop)} alive` : 'extinct'} · arose ${fmtClock(row.s.born)}` : '';
    };
  }

  // ---------------------------------------------------------- chronicle
  const TYPES = { all: 'Everything', era: 'Eras', est: 'Established', genus: 'New genera', ext: 'Extinctions', top: 'Dominance' };
  function renderChronicle() {
    const ev = api.life().chronicle.filter((e) => (st.chronType === 'all' || e.type === st.chronType)
      && (!st.chronQ || e.text.toLowerCase().includes(st.chronQ.toLowerCase())));
    return `<div class="filters">
      <input id="chron-q" type="search" placeholder="Search events" value="${esc(st.chronQ)}" aria-label="Search events">
      <label>Show<select data-f="chronType">${Object.entries(TYPES).map(([k, v]) => opt(k, st.chronType, v)).join('')}</select></label>
    </div><p class="muted">${fmt(ev.length)} events, newest first.</p>
    <ol class="events chron">${ev.slice(0, 600).map((e) => `<li><i style="background:${cssCol(e.col)}"></i><time>${fmtClock(e.t)}</time><span>${e.html}</span></li>`).join('')}</ol>`;
  }

  // ---------------------------------------------------------- environment
  function renderEnvironment() {
    const c = api.climate();
    const e = api.eng;
    const tideMode = e.settings.tide;
    return `<div class="sect"><div class="eyebrow">Overlays</div>
      <div class="chiprow">
        <button type="button" data-tide="0" class="${tideMode === 0 ? 'on' : ''}">No tide</button>
        <button type="button" data-tide="1" class="${tideMode === 1 ? 'on' : ''}">Faint tide</button>
        <button type="button" data-tide="2" class="${tideMode === 2 ? 'on' : ''}">Light map</button>
        <button type="button" data-act="currents" class="${api.state.currents ? 'on' : ''}">Currents</button>
      </div>
      <div class="ramp"><span>dark</span><i></i><span>full light</span></div>
      <p class="muted">The light map colours every point by the light a photosynthesising cell would receive there, with a contour every 10%. Glint forms fastest in the bright tide bands. Currents shows the flow that carries silt, glint and drifting cells. Keys: G cycles the tide view, V toggles currents.</p></div>
    <div class="sect"><div class="eyebrow">Right now</div>
      <div class="kv"><span class="term" data-tip="era">Era</span><b>${esc(c.name)} · began ${fmtClock(c.started)}</b></div>
      <div class="kv"><span class="term" data-tip="light">Baseline light</span><b>${Math.round(e.ambient * 100)}% (heading to ${Math.round(c.ambientTo * 100)}%)</b></div>
      <div class="kv"><span class="term" data-tip="season">Tide strength</span><b>${Math.round(e.season * 100)}%</b></div>
      <div class="kv"><span class="term" data-tip="glint">Glint production</span><b>×${e.chargeMul.toFixed(2)}</b></div>
      <div class="kv"><span>Next era</span><b>in about ${fmtDur(Math.max(0, c.next - e.simTime))}</b></div>
    </div>
    <div class="sect"><div class="eyebrow">Eras so far</div><ol class="eras">${c.history.slice().reverse().map((h) => `<li><time>${fmtClock(h.t)}</time><b>${esc(h.name)}</b><span>light ${Math.round(h.ambient * 100)}% · glint ×${h.charge.toFixed(2)}</span></li>`).join('')}</ol></div>`;
  }

  // ---------------------------------------------------------- guide
  function renderGuide() {
    return `<nav class="toc">${GUIDE.map((s) => `<a href="#" data-guide="${s.id}" class="${s.id === st.guideAt ? 'on' : ''}">${s.title}</a>`).join('')}</nav>
      <div class="guide">${GUIDE.map((s) => `<section id="g-${s.id}"><h3>${s.title}</h3>${s.html}</section>`).join('')}</div>`;
  }

  // ---------------------------------------------------------- render + events
  const renderers = { species: renderSpecies, composition: renderComposition, dynamics: renderDynamics, lineage: renderLineage, chronicle: renderChronicle, environment: renderEnvironment, guide: renderGuide };
  let pending = false;
  function flush() { if (pending && !api.held()) render(true); }
  function render(force) {
    if (!st.open) return;
    if (api.held()) { pending = true; return; }
    pending = false;
    const now = performance.now();
    if (!force && now - lastRender < 900) return;
    if (!force && (st.tab === 'guide')) return;
    if (!force && body.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
    lastRender = now;
    tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === st.tab)));
    const focused = document.activeElement && document.activeElement.id;
    const caret = focused && document.activeElement.selectionStart;
    const scroll = body.scrollTop;
    body.innerHTML = renderers[st.tab]();
    if (!force) body.scrollTop = scroll;
    if (focused && $(focused)) { const el = $(focused); el.focus(); if (caret != null && el.setSelectionRange) el.setSelectionRange(caret, caret); }
    if (st.tab === 'dynamics') drawDynamics();
    if (st.tab === 'lineage') drawLineage();
  }

  body.addEventListener('change', (e) => {
    const k = e.target.dataset.f;
    if (k) { st[k] = e.target.value; render(true); }
  });
  body.addEventListener('input', (e) => {
    if (e.target.id === 'lab-q') { st.q = e.target.value; render(true); }
    if (e.target.id === 'chron-q') { st.chronQ = e.target.value; render(true); }
  });
  body.addEventListener('click', (e) => {
    const t = e.target;
    const row = t.closest('.splist li[data-serial]');
    if (row && !t.closest('a.sp')) { api.openSpecies(+row.dataset.serial); return; }
    const fb = t.closest('[data-focus]');
    if (fb) { api.focusFacet(fb.dataset.focus); render(true); return; }
    const tb = t.closest('[data-tide]');
    if (tb) { api.setTide(+tb.dataset.tide); render(true); return; }
    const act = t.closest('[data-act]');
    if (act && act.dataset.act === 'currents') { api.toggleCurrents(); render(true); return; }
    if (act && act.dataset.act === 'hl-filter') {
      const parts = [st.status !== 'all' ? st.status : '', st.diet !== 'all' ? st.diet : '', st.mobility !== 'all' ? st.mobility : '', st.bodyType !== 'all' ? st.bodyType : '', st.types !== 'all' ? `${st.types}-type` : '', st.q ? `“${st.q}”` : ''].filter(Boolean);
      api.focusPredicate(`Species: ${parts.join(' · ') || 'all'}`, speciesFilterPredicate());
      return;
    }
    const ga = t.closest('[data-guide]');
    if (ga) { e.preventDefault(); st.guideAt = ga.dataset.guide; $(`g-${ga.dataset.guide}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  });

  return { open, close, toggle, render, flush, isOpen: () => st.open, tab: () => st.tab };
}
