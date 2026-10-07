import { roleShares, roleColor, affinity, CELL_SHAPES, cellShape } from './genome.js';
import { FIRST_LIFE } from './engine.js';
import { tagsOf } from './facets.js';
import { tideAt } from './flow.js';
import { fmt, fmtClock, fmtDur, esc, cssCol, cssRgb, term, spLink, meter, clamp, ROLE, MATTER, CAUSE, cellRadius } from './fmt.js';
import { glyphURL, MATTER_GLYPH } from './glyphs.js';
import { sparkPath } from './charts.js';
import { voiceOf } from './audio/mapping.js';
import { describe, compareMotifs } from './audio/motif.js';
import { songSVG, sigilSVG } from './song.js';
import { createMindView } from './mindview.js';

/**
 * The specimen panel: whatever was picked in the world (a cell, a grain) or opened by name (a species).
 * main.js owns the selection and its tracking; this module only draws it. On a phone the panel is a
 * sheet that peeks above the dock and is pulled up for the details.
 */
export function createSpecimen(api) {
  const { eng, K } = api;
  const $ = (id) => document.getElementById(id);
  const root = $('spec'), body = $('spec-body'), tabsEl = $('spec-tabs'), acts = $('spec-acts'), vit = $('vitals');
  const st = { tab: 'status', mode: '', actKey: '', tabKey: '', lastHtml: '', lastVit: '', lastHead: '', at: 0 };
  const phone = () => matchMedia('(max-width: 720px)').matches;

  // ------------------------------------------------------------ sheet (phone)
  // Collapsed, the sheet shows the picked particle's name, actions and vitals; full, everything.
  // Drag the handle or the header (or, collapsed, anywhere on the sheet) up to open it and down to
  // close it; a tap on the handle or header toggles it; Full record opens it too.
  const more = $('spec-more');
  let drag = null;
  const isFull = () => root.classList.contains('full');
  function setFull(on) {
    root.classList.toggle('full', on);
    more.setAttribute('aria-expanded', String(on));
  }
  more.addEventListener('click', () => setFull(true));
  root.addEventListener('pointerdown', (e) => {
    if (!phone() || e.button > 0) return;
    if (e.target.closest('button, a, input, select, .term, #specimen')) return;
    const head = e.target.closest('.grab, .spec-head');
    if (!head && isFull()) return;
    drag = { id: e.pointerId, y: e.clientY, h: root.getBoundingClientRect().height, moved: false, head: !!head };
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) > 8) {
      drag.moved = true;
      try { root.setPointerCapture(e.pointerId); } catch { /* the pointer already ended */ }
      root.classList.add('dragging');
    }
    if (drag.moved) root.style.height = `${clamp(drag.h - dy, 80, innerHeight)}px`;
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    root.classList.remove('dragging');
    root.style.height = '';
    if (!d.moved) { if (d.head && e.type === 'pointerup') setFull(!isFull()); return; }
    const dy = e.clientY - d.y;
    if (dy < -40) setFull(true);
    else if (dy > 40) { if (isFull()) setFull(false); else api.onClose(); }
  };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);

  $('spec-close').addEventListener('click', () => api.onClose());
  $('vz-in').addEventListener('click', () => { api.state.specCells = clamp(api.state.specCells / 1.4, 0.8, 14); });
  $('vz-out').addEventListener('click', () => { api.state.specCells = clamp(api.state.specCells * 1.4, 0.8, 14); });

  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    st.tab = b.dataset.tab;
    st.tabKey = '';
    render(true);
    body.scrollTop = 0;
  });
  tabsEl.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const bs = [...tabsEl.children], i = bs.findIndex((b) => b.dataset.tab === st.tab);
    const n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length];
    if (n) { e.preventDefault(); n.click(); n.focus(); }
  });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-song]');
    if (b) api.onPlaySong(+b.dataset.song);
  });
  acts.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'follow') api.onFollow();
    else if (a === 'relative') api.onRelative();
    else if (a === 'find') api.onFind();
    else if (a === 'hl') api.onHighlight();
    st.actKey = '';
    render(true);
  });

  // ------------------------------------------------------------ pieces
  const kv = (label, value, tip) => `<div class="kv"><span>${tip ? term(tip, label) : label}</span><b>${value}</b></div>`;
  const trait = (label, v, lo, hi, text, tip) => `<div class="trait"><span>${tip ? term(tip, label) : label}</span>${meter((v - lo) / (hi - lo), 'cyan thin')}<b>${text}</b></div>`;
  const comp = (label, tip, shares, g, text) => `<div class="comp"><div class="tl"><span>${term(tip, label)}</span><b>${shares.map((v, r) => (v > 0.02 ? text(v, r) : '')).filter(Boolean).join(' · ')}</b></div><span class="compbar">${shares.map((v, r) => (v > 0.02 ? `<i style="flex:${v};background:${cssRgb(roleColor(g, r))}"></i>` : '')).join('')}</span></div>`;
  const tags = (g) => `<div class="tags">${tagsOf(g, K).map(([t, k]) => `<span class="term" data-tip="${k}" tabindex="0">${t}</span>`).join('')}</div>`;
  const blk = (title, html) => `<div class="blk"><div class="sub-h"><span>${title}</span></div>${html}</div>`;
  const vital = (label, frac, cls, text, tip) => `<div class="vital"><span>${tip ? term(tip, label) : label}</span>${meter(frac, cls)}<b>${text}</b></div>`;
  const lightAt = (p) => { const [W, H] = eng.grid; return Math.round((eng.ambient + (1 - eng.ambient) * tideAt(p.x, p.y, W, H, eng.simTime, eng.tide, eng.tidePh) * eng.season) * 100); };

  // ------------------------------------------------------------ behaviour (mind.js, mindview.js)
  function spName(kind) {
    const g = api.genomeFor(kind);
    const sp = g && api.life().reg.get(g.serial);
    return sp ? spLink(sp.serial, sp.name) : 'an unnamed species';
  }
  const withSp = (text, kind) => (kind == null ? text : text.replaceAll('{sp}', spName(kind)));
  const signed = (x, d = 3) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`;
  const mv = createMindView({
    K, genomeFor: api.genomeFor,
    nameOf: (kind) => { const g = api.genomeFor(kind); const sp = g && api.life().reg.get(g.serial); return sp ? { serial: sp.serial, name: sp.name } : null; },
    sigil: (g, size) => sigilSVG(songOf(g).v, g, { size }),
  });

  function storyHTML(sel) {
    if (!sel || !sel.story.length) return '';
    return blk('Record', `<ol class="story">${sel.story.map((s) => `<li><time>${fmtClock(s.t)}</time><span>${s.text}</span></li>`).join('')}</ol>`);
  }

  // The cell's own record and, while it lives, its energy budget between meals (from the replay).
  function cellBlock(p, g, past, mind) {
    let h = kv('Cell type', `<span class="greek">${ROLE[p.role]}</span>-cell`, 'celltype');
    h += kv('Origin', CAUSE[p.cause] || 'a founder of this world', 'origin');
    h += kv('Generation', fmt(p.gen), 'generation');
    h += kv('Speed', `${Math.hypot(p.vx, p.vy).toFixed(2)} cells/s`, 'speed');
    if (!past) {
      const b = mind && mind.budget;
      h += kv('Light here', `${lightAt(p)}%${g && g.photo > 0.05 ? ` · ${b ? signed(b.light) : '—'}/s` : ''}`, g && g.photo > 0.05 ? 'photosynth' : 'lighthere');
      const mods = b ? [b.crowding > 0.01 ? `crowding +${Math.round(b.crowding * 100)}%` : '', b.thrift > 0.001 ? `bonds −${Math.round(b.thrift * 100)}%` : '', b.lean < 0.995 ? `lean ×${b.lean.toFixed(2)}` : ''].filter(Boolean).join(' · ') : '';
      h += kv('Upkeep', `${b ? signed(-b.upkeep) : '—'}/s${mods ? ` <em class="mods">${mods}</em>` : ''}`, 'upkeep');
      h += kv('Net', b ? `<span class="${b.net >= 0 ? 'pos' : 'neg'}">${signed(b.net)}/s</span> between meals` : '—', 'mind-net');
    }
    return blk(past ? 'The cell, last seen' : `<span><i class="ico cell"></i>This cell</span>`, h);
  }

  function organismBlock(o, g, past, sel) {
    if (!o || !g) return '';
    let h = '';
    if ((g.adhesion || 0) <= K.adhMin) {
      h += kv('Body', 'a single free cell', 'adhesion');
    } else {
      const count = o.pending ? 'counting…' : `${o.partial ? '≥ ' : ''}${fmt(o.cells)} cell${o.cells === 1 ? '' : 's'}`;
      const first = past || o.pending ? null : sel && sel.orgFirst;
      const delta = first != null && o.cells !== first ? `<em class="delta">${o.cells > first ? '+' : '−'}${fmt(Math.abs(o.cells - first))}</em>` : '';
      h += kv('Body', count + delta, 'organism');
      if (!o.pending) h += kv('Span', `${o.span.toFixed(1)} cells across`);
      h += kv('Moving', `${o.speed.toFixed(2)} cells/s`, 'speed');
      h += kv('Mean energy', o.meanE.toFixed(2), 'energy');
      const tot = o.roles[0] + o.roles[1] + o.roles[2] || 1;
      h += comp('Cell types', 'celltype', o.roles.map((c) => c / tot), g, (v, r) => `${ROLE[r]} ${fmt(o.roles[r])}`);
    }
    // a free cell's neighbours are listed under Neighbours; a body's contacts are its own
    if ((g.adhesion || 0) > K.adhMin) h += kv('Touching', o.touching ? `${o.touching} other species` : 'no other species', 'touching');
    return blk(past ? 'Its organism, last seen' : `<span><i class="ico org"></i>${term('organism', 'Organism')}</span>`, h);
  }

  // the header's emblem: a species' sigil (its song drawn as its organism), or matter's glyph
  const glyphEl = $('glyph');
  function setGlyph(key, html) { if (glyphEl.dataset.k !== key) { glyphEl.dataset.k = key; glyphEl.innerHTML = html; } }
  const speciesGlyph = (g) => setGlyph(`sp${g.serial}`, sigilSVG(songOf(g).v, g, { size: 40 }));
  const plainGlyph = (shape, col) => setGlyph(`g${shape}:${col}`, `<img alt="" src="${glyphURL(shape, col)}">`);

  // ------------------------------------------------------------ song
  // A species' song (audio/motif.js): its motif as a piano roll, in words, and how it differs
  // from its nearest thriving ancestor's (drawn faintly behind). The notes light as the species
  // sings them, here or in the world (songTick).
  const songs = new Map(); // serial -> { v (voice), d (description) }
  function songOf(g) {
    let e = songs.get(g.serial);
    if (!e) {
      const v = voiceOf(g);
      e = { v, d: describe(v) };
      songs.set(g.serial, e);
      if (songs.size > 300) songs.delete(songs.keys().next().value);
    }
    return e;
  }
  function songBlock(g, sp, compact) {
    const { v, d } = songOf(g);
    const anc = sp && sp.ancestor && api.life().reg.get(sp.ancestor);
    const av = anc ? songOf(anc.genome).v : null;
    const diff = av ? compareMotifs(av.motif, v.motif) : null;
    const slot = (sp ? sp.alive : true) && g.slot != null ? g.slot : -1;
    const m = v.motif, pad2 = (n) => String(n).padStart(2, '0');
    let h = `<div class="sub-h"><span>${term('song', 'Song')}</span><span class="song-read"><span><b>${pad2(m.notes.length)}</b> notes</span><span><b>${(m.cycle * 0.18).toFixed(1)}</b> s</span>${m.voice2 ? '<span><b>2</b> voices</span>' : ''}</span><button type="button" class="btn mini" data-song="${g.serial}" data-hint="Hear it alone">Play</button></div>`;
    h += `<div class="song-wrap">${songSVG(v.motif, { col: cssCol(g.col), col2: cssRgb(roleColor(g, 1)), ghost: compact ? null : av && av.motif, h: compact ? 46 : 68, label: `${d.tags.join(', ')}: ${d.line}` })}</div>`;
    h += `<div class="song-tags">${d.tags.map((t, i) => `<span class="term" data-tip="${['instrument', 'register', 'tempo'][i]}" tabindex="0">${esc(t)}</span>`).join('<i>·</i>')}</div>`;
    if (!compact) {
      h += `<p class="note">${esc(d.line)}</p>`;
      if (diff) h += `<p class="note song-diff">${diff.length ? `Compared with ${spLink(anc.serial, anc.name)}’s song (drawn dashed): ${esc(diff.join(', '))}.` : `The same song as its ancestor ${spLink(anc.serial, anc.name)}.`}</p>`;
    }
    return `<div class="blk song" data-slot="${slot}" data-tag="sp${g.serial}">${h}</div>`;
  }
  // light the notes being sung (events from the soundtrack: { at, slot, k, line })
  const HOLD = 240;
  let songKey = '';
  function songTick(now, events) {
    const blk = body.querySelector('.blk.song');
    if (!blk) { songKey = ''; return; }
    const slot = +blk.dataset.slot, tag = blk.dataset.tag;
    let last = null;
    const lit = [];
    for (const e of events) {
      if ((e.slot !== slot || slot < 0) && e.slot !== tag) continue;
      if (e.at > now || now >= e.at + HOLD) continue;
      lit.push(`${e.line}:${e.k}`);
      if (!last || e.at > last.at) last = e;
    }
    const key = lit.sort().join(',') + (last ? `|${last.line}:${last.k}` : '');
    if (key === songKey && blk.dataset.drawn) return;
    songKey = key; blk.dataset.drawn = '1';
    const set = new Set(lit);
    for (const r of blk.querySelectorAll('rect[data-k]')) r.classList.toggle('lit', set.has(`${r.dataset.l}:${r.dataset.k}`));
    const ph = blk.querySelector('.ph');
    if (!ph) return;
    const r = last && blk.querySelector(`rect[data-k="${last.k}"][data-l="${last.line}"]`);
    ph.classList.toggle('on', !!r);
    if (r) { const x = r.getAttribute('x'); ph.setAttribute('x1', x); ph.setAttribute('x2', x); }
  }

  function lineagePath(sp) {
    const life = api.life();
    const chain = [];
    let a = sp && sp.ancestor && life.reg.get(sp.ancestor);
    while (a && chain.length < 6) { chain.push(a); a = a.ancestor && life.reg.get(a.ancestor); }
    return chain;
  }

  function speciesTab(g, snap) {
    const life = api.life();
    const sp = life.reg.get(g.serial);
    const src = sp || snap;
    let h = '';
    if (sp) {
      const d = sparkPath(life.history, sp.serial, 300, 64);
      if (d) h += `<div class="blk"><div class="sub-h"><span>Population</span><span>peak ${fmt(sp.peak)}</span></div><svg class="popchart" viewBox="0 0 300 64" preserveAspectRatio="none" aria-label="Population over time"><path d="${d}" fill="none" stroke="${cssCol(g.col)}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg><div class="legend-note"><span>${fmtClock(life.history[0].t)}</span><span>${fmtClock(life.history[life.history.length - 1].t)}</span></div></div>`;
    }
    let s = '';
    if (sp && sp.alive) {
      s += kv('Population', fmt(sp.pop));
      s += kv('Share of life', `${((sp.pop / Math.max(1, life.counts[3])) * 100).toFixed(1)}%`, 'share');
    } else s += kv('Status', sp ? `extinct at ${fmtClock(sp.extinct ?? 0)} · peak ${fmt(sp.peak)}` : 'never established');
    if (src) {
      s += kv('Arose', `${fmtClock(src.born || 0)}${src.founder ? ` · ${api.originWord(src)}` : ''}`);
      const gen = life.genera.get(src.genus);
      s += kv('Genus', gen ? `${esc(gen.name)}${gen.from ? ` · split from ${esc(gen.from)}` : ''}` : '–', 'genus');
      s += kv('Mutations', `${g.depth} from its founder`, 'depth');
    }
    h += blk(term('species', 'Species'), s);
    h += songBlock(g, sp, false);
    const chain = lineagePath(src);
    if (chain.length) h += blk('Descends from', `<div class="note">${chain.map((a) => spLink(a.serial, a.name)).join(' ← ')}${chain.length === 6 ? ' ← …' : ''}</div>`);
    const kids = [...life.reg.values()].filter((s2) => s2.ancestor === g.serial && s2.established);
    h += blk('Descendants', `<div class="note">${kids.length ? kids.slice(0, 8).map((k) => spLink(k.serial, k.name)).join(', ') + (kids.length > 8 ? ` +${kids.length - 8}` : '') : 'none established'}</div>`);
    return h;
  }

  function genomeTab(g, role) {
    const life = api.life();
    let h = tags(g);
    const diet = [
      ['Light', 'photosynth', g.photo, '#d9f27a', g.photo],
      ['Glint', 'glint', g.dGlint, MATTER[1].css, g.dGlint * (1 - 0.6 * g.photo)],
      ['Husk', 'husk', g.dHusk, MATTER[2].css, g.dHusk * (1 - 0.6 * g.photo)],
      ['Flesh', 'flesh', g.dFlesh, '#ff6b6b', g.dFlesh * (1 - 0.6 * g.photo)],
    ];
    h += blk(term('diet', 'Diet'), diet.map(([l, t, v, c, w]) => `<div class="trait"><span>${term(t, l)}</span><span class="meter thin" style="color:${c}"><i style="width:${(clamp(w, 0, 1) * 100).toFixed(1)}%"></i></span><b>${Math.round(v * 100)}%</b></div>`).join(''));
    const sh = roleShares(g);
    let b = comp('Body plan', 'bodyplan', sh, g, (v, r) => `${ROLE[r]} ${Math.round(v * 100)}%`);
    b += trait('Adhesion', g.adhesion || 0, 0, 1, `${Math.round((g.adhesion || 0) * 100)}%${(g.adhesion || 0) > K.adhMin ? ' · bonds' : ''}`, 'adhesion');
    if (g.calcify > 0.005) b += trait('Calcifying', g.calcify, 0, 1, `${Math.round(g.calcify * 100)}%`, 'calcify');
    b += trait('Size', g.size, 0.45, 2.6, `${g.size.toFixed(2)} · ${CELL_SHAPES[cellShape(g, role)]}`, 'size');
    h += blk('Body', b);
    let m = trait('Swimming', g.swim * (1 - g.photo), 0, 3, (g.swim * (1 - g.photo)).toFixed(2), 'swimming');
    m += trait('Schooling', g.align, 0, 1, `${Math.round(g.align * 100)}%`, 'schooling');
    m += trait('Reach', g.radius, 0.4, 1, g.radius.toFixed(2), 'reach');
    m += trait('Personal space', g.beta, 0.12, 0.5, g.beta.toFixed(2), 'personalspace');
    m += trait('Thrust', g.force, 1, 16, g.force.toFixed(1), 'thrust');
    m += trait('Glide', g.drag, 0.015, 0.4, `${(g.drag * 1000).toFixed(0)} ms`, 'glide');
    m += trait('Current pull', g.advect, 0.03, 1, `${Math.round(g.advect * 100)}%`, 'currentpull');
    h += blk('Movement', m);
    let l = trait('Lifespan', g.lifespan, 20, 500, fmtDur(g.lifespan), 'lifespan');
    l += trait('Divides at', g.reproE, 0.6, 4, g.reproE.toFixed(2), 'dividesat');
    l += trait('Child share', g.share, 0.2, 0.7, `${Math.round(g.share * 100)}%`, 'childshare');
    l += trait('Upkeep', g.metab, 0.01, 0.15, `${g.metab.toFixed(3)}/s`, 'upkeep');
    l += trait('Mutation', g.mutRate, 0.002, 0.08, `${(g.mutRate * 100).toFixed(1)}%`, 'mutation');
    h += blk('Life cycle', l);

    const others = [];
    for (const s of life.reg.values()) if (s.alive && s.established && s.serial !== g.serial) others.push(s);
    others.sort((a, b2) => b2.pop - a.pop);
    const list = [];
    for (let r = 0; r < 3; r++) if (sh[r] > 0.05) list.push({ name: `own ${ROLE[r]}-cells`, v: affinity(g, role, g, r, K), css: cssRgb(roleColor(g, r)) });
    for (const s2 of others.slice(0, 4)) list.push({ name: spLink(s2.serial, s2.name), raw: true, v: affinity(g, role, s2.genome, 0, K), css: cssCol(s2.genome.col) });
    for (let k = 0; k < 4; k++) if (life.matter[k]) list.push({ name: MATTER[k].name, v: affinity(g, role, life.matter[k], 0, K) * K.matterPull, css: MATTER[k].css });
    const dbar = (v) => { const w = (Math.min(1, Math.abs(v)) * 50).toFixed(1); return `<span class="dbar"><i style="left:${v < 0 ? 50 - w : 50}%;width:${w}%;background:${v >= 0 ? 'var(--sun)' : 'var(--cyan)'}"></i></span>`; };
    h += blk(`<span class="greek">${ROLE[role]}</span>-cells drawn to · pushed from`, `<div class="legend-note"><span>pushed</span><span>drawn</span></div><div class="aff">${list.map((it) => `<div><i style="background:${it.css}"></i><span>${it.raw ? it.name : esc(it.name)}</span>${dbar(it.v)}<b>${it.v >= 0 ? '+' : ''}${it.v.toFixed(2)}</b></div>`).join('')}</div>`);
    return h;
  }

  // ------------------------------------------------------------ render
  function setTabs(list) {
    const key = list.join(',');
    if (!list.includes(st.tab)) st.tab = list[0];
    if (key + st.tab === st.tabKey) return;
    st.tabKey = key + st.tab;
    const names = { status: 'Status', species: 'Species', genome: 'Genome' };
    tabsEl.innerHTML = list.length < 2 ? '' : list.map((t) => `<button type="button" role="tab" data-tab="${t}" aria-selected="${t === st.tab}" tabindex="${t === st.tab ? 0 : -1}">${names[t]}</button>`).join('');
  }
  function setActs(key, html) {
    if (key === st.actKey) return;
    st.actKey = key;
    acts.innerHTML = html;
  }
  function setHead(kind, nameHtml, sub) {
    const k = kind + nameHtml + sub;
    if (k === st.lastHead) return;
    st.lastHead = k;
    $('spec-kind').innerHTML = kind;
    $('spec-name').innerHTML = nameHtml;
    $('spec-sub').innerHTML = sub;
  }
  const CODE_TIP = { SP: 'serial', 'Δ': 'depth', ID: 'pid', Pop: 'share', Died: 'origin' };
  const code = (l, v) => `<span class="term" data-tip="${CODE_TIP[l]}" tabindex="0">${l} <b>${v}</b></span>`;

  function render(force) {
    const now = performance.now();
    // a click's own re-render is safe; only background updates wait for the pointer to lift
    if (!force && (api.held() || now - st.at < 250)) return false;
    st.at = now;
    const sel = api.sel(), spView = api.spView();
    let html = '', v = '', fixedKey = '', fixedHtml = '';
    if (spView != null) {
      const life = api.life();
      const sp = life.reg.get(spView);
      if (!sp) { api.onClose(); return true; }
      const g = sp.genome;
      root.classList.add('no-view');
      setHead(sp.alive ? (sp.established ? 'Species · thriving' : 'Species · rare') : 'Species · extinct', esc(sp.name),
        code('SP', fmt(sp.serial)) + code('Δ', g.depth) + (sp.alive ? code('Pop', fmt(sp.pop)) : ''));
      speciesGlyph(g);
      const hl = api.focusKey() === `sp:${sp.serial}`;
      setActs(`sp${sp.alive}${hl}`, sp.alive ? `<button type="button" class="btn" data-act="find">Find one</button><button type="button" class="btn" data-act="hl" aria-pressed="${hl}">Highlight</button>` : '');
      if (sp.alive) v += vital('Share', sp.pop / Math.max(1, life.counts[3]), 'sun', `${((sp.pop / Math.max(1, life.counts[3])) * 100).toFixed(1)}% of life`, 'share');
      setTabs(['species', 'genome']);
      html = st.tab === 'genome' ? genomeTab(g, 0) : speciesTab(g, null);
    } else if (sel) {
      root.classList.remove('no-view');
      const p = sel.particle, mem = sel.memory;
      if (p.kind < FIRST_LIFE) {
        const m = MATTER[p.kind];
        setHead(mem ? `Now ${m.name} · once` : m.name, mem && mem.sp ? spLink(mem.sp.serial, mem.sp.name) : m.name,
          sel.lost ? 'Lost track of it' : (mem && sel.diedAt != null ? code('Died', `${fmtDur(eng.simTime - sel.diedAt)} ago`) : '') + code('ID', fmt(p.id)));
        plainGlyph(MATTER_GLYPH[p.kind][0], MATTER_GLYPH[p.kind][1]);
        setActs(`m${!!mem}`, mem ? '<button type="button" class="btn" data-act="relative">Watch a relative</button>' : '');
        if (p.kind === 1) v += vital('Charge', p.energy, 'cyan', `fades in ${fmtDur(Math.max(0, (p.energy - K.glintMin) / K.leak))}`, 'glint');
        else if (p.kind === 2) v += vital('Energy left', p.energy / 1.2, 'sun', `crumbles in ${fmtDur(Math.max(0, (p.energy - K.huskMin) / K.decay))}`, 'husk');
        else if (p.kind === 3) v += vital('Wears away', clamp(p.energy / 600, 0, 1), 'cyan', `in ${fmtDur(Math.max(0, p.energy))}`, 'stone');
        else v += vital('Light here', lightAt(p) / 100, 'sun', `${lightAt(p)}%`, 'lighthere');
        setTabs(mem ? ['status', 'species', 'genome'] : ['status']);
        if (st.tab === 'status') {
          html += storyHTML(sel);
          let s = `<p class="note">${m.blurb}</p>`;
          s += kv(p.kind === 2 ? 'Dead for' : p.kind === 3 ? 'Stone for' : 'In this state', fmtDur(p.age));
          if (p.kind === 2) s += kv('Cause of death', CAUSE[p.cause] || 'unknown');
          s += kv('Light here', `${lightAt(p)}%`, 'lighthere');
          html += blk(term(m.name.toLowerCase(), m.name), s);
          if (mem) html += `<div class="past">${cellBlock(mem.p, mem.g, true)}${organismBlock(mem.org, mem.g, true, sel)}</div>`;
        } else if (st.tab === 'species') html = speciesTab(mem.g, mem.sp);
        else html = genomeTab(mem.g, mem.role);
      } else {
        const g = api.genomeFor(p.kind);
        const life = api.life();
        const sp = g ? life.reg.get(g.serial) : null;
        const o = sel.org;
        const inBody = !!(o && !o.pending && o.cells > 1 && g && (g.adhesion || 0) > K.adhMin);
        const gr = `<span class="greek">${ROLE[p.role]}</span>`;
        setHead(inBody ? `${gr}-cell of a ${o.partial ? '≥ ' : ''}${fmt(o.cells)}-cell body` : `${gr}-cell`, sp ? esc(sp.name) : 'Unnamed species',
          sel.lost ? 'Lost track of it' : (g ? code('SP', fmt(g.serial)) + code('Δ', g.depth) : 'sequencing…') + code('ID', fmt(p.id)));
        if (g) speciesGlyph(g); else plainGlyph(0, p.col);
        const hl = sp && api.focusKey() === `sp:${sp.serial}`;
        setActs(`c${api.follow()}${hl}${!!sp}`, `<button type="button" class="btn" data-act="follow" aria-pressed="${api.follow()}" data-hint="Keep it in view · C">Follow</button>${sp && sp.alive ? `<button type="button" class="btn" data-act="hl" aria-pressed="${!!hl}">Highlight species</button>` : ''}`);
        if (g) {
          v += vital('Energy', p.energy / g.reproE, 'sun', `${p.energy.toFixed(2)} / ${g.reproE.toFixed(2)}`, 'energy');
          v += vital('Age', p.age / g.lifespan, 'cyan', `${fmtDur(p.age)} / ${fmtDur(g.lifespan)}`, 'lifespan');
          const head = sel.mind && !sel.lost && (sel.mind.head || sel.mind);
          if (!sel.lost) v = `<div class="vital now"><span>${term('mind', 'Now')}</span><b>${head ? withSp(head.text, head.target) : '—'}</b></div>` + v;
        }
        setTabs(g ? ['status', 'species', 'genome'] : ['status']);
        if (st.tab === 'status') {
          // the instruments are built once per cell and update in place (mindview.js); the rest flows below
          if (g && !sel.lost) { fixedKey = `mv:${sel.id}:${p.kind}:${g.serial}`; fixedHtml = tags(g) + mv.html(g, p.kind); } else if (g) html += tags(g);
          if (g) html += songBlock(g, sp, true);
          const cb = cellBlock(p, g, false, sel.lost ? null : sel.mind), ob = organismBlock(o, g, false, sel);
          html += inBody ? ob + cb : cb + ob;
          html += storyHTML(sel);
        } else if (st.tab === 'species') html = speciesTab(g, null);
        else html = genomeTab(g, p.role);
      }
    } else return false;
    if (v !== st.lastVit) { vit.innerHTML = v; st.lastVit = v; }
    if (fixedKey !== st.fixedKey || !body.firstElementChild) {
      body.innerHTML = `<div class="spec-fixed">${fixedHtml}</div><div class="spec-flow">${html}</div>`;
      st.fixedKey = fixedKey; st.lastHtml = html; songKey = '';
      if (fixedKey) { mv.bind(body.firstElementChild); mindUpdate(); }
    } else if (html !== st.lastHtml) { body.lastElementChild.innerHTML = html; st.lastHtml = html; songKey = ''; }
    return true;
  }

  function open() {
    if (root.hidden) {
      root.hidden = false;
      setFull(false);
      document.body.classList.add('spec-open');
    }
    st.lastHtml = ''; st.lastVit = ''; st.actKey = ''; st.tabKey = ''; st.lastHead = ''; st.fixedKey = null;
  }
  function close() {
    root.hidden = true;
    setFull(false);
    document.body.classList.remove('spec-open');
  }
  // the screen area the panel covers, so following can centre the specimen in what is left
  function inset() {
    if (root.hidden) return { right: 0, bottom: 0 };
    const r = root.getBoundingClientRect();
    if (phone()) return { right: 0, bottom: innerHeight - r.top };
    return { right: innerWidth - r.left, bottom: 0 };
  }

  // the viewer's overlay: corner brackets, a reticle, a scale bar and the time
  const ui = $('spec-ui');
  let uiAt = 0;
  function drawViewerUI(now) {
    if (root.hidden || root.classList.contains('no-view')) return;
    // the organism's brackets follow its easing frame every frame; otherwise a few times a second is enough
    const sel0 = api.sel(), box = sel0 && !sel0.lost && sel0.particle.kind >= FIRST_LIFE && (sel0.boxD || sel0.box);
    if (!box && now - uiAt < 250) return;
    uiAt = now;
    const r = Math.min(devicePixelRatio || 1, 2);
    const w = ui.clientWidth, h = ui.clientHeight;
    if (!w || !h) return;
    if (ui.width !== Math.round(w * r)) { ui.width = Math.round(w * r); ui.height = Math.round(h * r); }
    const g = ui.getContext('2d');
    g.setTransform(r, 0, 0, r, 0, 0);
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(150,222,230,0.7)';
    g.lineWidth = 1;
    const c = 12, m = 6.5;
    g.beginPath();
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]]) { g.moveTo(x, y + sy * c); g.lineTo(x, y); g.lineTo(x + sx * c, y); }
    g.stroke();
    const sel = api.sel();
    const pxPerCell = h / api.state.specCells;
    const brackets = (l, t, r, b, c) => { g.beginPath(); for (const [x, y, dx, dy] of [[l, t, 1, 1], [r, t, -1, 1], [l, b, 1, -1], [r, b, -1, -1]]) { g.moveTo(x, y + dy * c); g.lineTo(x, y); g.lineTo(x + dx * c, y); } g.stroke(); };
    g.lineWidth = 1.25;
    if (box) {
      // a body: the organism in the world view's orange, the watched cell (centred) in the panel's cell colour
      const pad = 6, e = m + 2;
      const l = clamp(w / 2 + box[0] * pxPerCell - pad, e, w / 2 - 14), t = clamp(h / 2 + box[1] * pxPerCell - pad, e, h / 2 - 14);
      const r = clamp(w / 2 + box[2] * pxPerCell + pad, w / 2 + 14, w - e), b = clamp(h / 2 + box[3] * pxPerCell + pad, h / 2 + 14, h - e);
      g.strokeStyle = 'rgba(255,95,58,0.9)';
      brackets(l, t, r, b, Math.min(10, (r - l) / 3, (b - t) / 3));
      const R = Math.max(6, cellRadius(sel.particle, api.genomeFor(sel.particle.kind), pxPerCell) * 1.4 + 3), c = Math.max(3, Math.min(10, R * 0.45));
      g.strokeStyle = 'rgba(241,227,160,0.95)';
      brackets(w / 2 - R, h / 2 - R, w / 2 + R, h / 2 + R, c);
    } else {
      g.strokeStyle = sel && sel.lost ? 'rgba(255,255,255,0.3)' : 'rgba(255,95,58,0.9)';
      brackets(w / 2 - 9, h / 2 - 9, w / 2 + 9, h / 2 + 9, 4);
    }
    g.lineWidth = 1;
    const bar = pxPerCell * 0.5;
    g.fillStyle = 'rgba(226,241,240,0.85)';
    g.fillRect(12, h - 14, bar, 1.5);
    g.fillRect(12, h - 18, 1, 6); g.fillRect(12 + bar - 1, h - 18, 1, 6);
    g.font = '500 10px Saira, system-ui, sans-serif';
    g.fillText('½ CELL', 18 + bar, h - 10);
    g.fillStyle = 'rgba(241,227,160,0.95)';
    g.fillText(fmtClock(eng.simTime), 14, 20);
    g.fillStyle = 'rgba(163,189,190,0.9)';
    if (sel) {
      const [W, H] = eng.grid;
      g.textAlign = 'right';
      g.fillText(`X ${(((sel.disp[0] % W) + W) % W).toFixed(1)}  Y ${(((sel.disp[1] % H) + H) % H).toFixed(1)}`, w - 14, 20);
      g.textAlign = 'left';
    }
  }

  // a new reading of the selected cell: update the instruments in place, between renders
  function mindUpdate() {
    const sel = api.sel();
    if (sel && sel.mind && !sel.lost && st.fixedKey) mv.update(sel.mind, sel.particle.kind);
  }

  return { render, open, close, inset, drawViewerUI, songTick, mindUpdate, mindTick: (now) => mv.tick(now), isOpen: () => !root.hidden, invalidate() { st.lastHtml = ''; st.actKey = ''; st.lastHead = ''; st.fixedKey = null; } };
}
