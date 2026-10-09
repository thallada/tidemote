import { roleShares, roleColor, affinity, CELL_SHAPES, cellShape, thermalPerf, thermalGuild } from './genome.js';
import { FIRST_LIFE } from './engine.js';
import { FRAMBOID, stoneGrain } from './shaders.js';
import { tagsOf } from './facets.js';
import { tideAt } from './flow.js';
import { fmt, fmtClock, fmtDur, esc, cssCol, cssRgb, term, spLink, meter, clamp, ROLE, MATTER, CAUSE, cellRadius, fmtLen, NICE_UM, UM_PER_UNIT } from './fmt.js';
import { glyphURL, MATTER_GLYPH } from './glyphs.js';
import { sparkPath } from './charts.js';
import { voiceOf } from './audio/mapping.js';
import { describe, compareMotifs } from './audio/motif.js';
import { songSVG, sigilSVG } from './song.js';
import { createMindView } from './mindview.js';
import { block, kv, trait, section, subHead } from './ui.js';

/**
 * The specimen panel: whatever was picked in the world (a cell, a grain) or opened by name (a species).
 * main.js owns the selection and its tracking; this module only draws it. On a phone the panel is a
 * sheet that peeks above the dock and is pulled up for the details.
 */
export function createSpecimen(api) {
  const { eng, K } = api;
  const $ = (id) => document.getElementById(id);
  const root = $('spec'), body = $('spec-body'), tabsEl = $('spec-tabs'), acts = $('spec-acts'), vit = $('vitals');
  const st = { active: '', mode: '', actKey: '', tabKey: '', lastVit: '', lastHead: '', at: 0, flow: new Map(), flowKey: '' };
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

  // The details are one scroll of sections; the bar above them jumps between the sections and
  // marks the one being read, so what lies further down is never hidden behind a tab.
  const sectionEl = (id) => body.querySelector(`[data-sx="${id}"]`);
  // a jump holds its section at the top for a moment, while sections above it are redrawn
  let pin = null;
  function jump(id) {
    const el = sectionEl(id);
    if (!el) return;
    pin = { id, until: performance.now() + 1500 };
    body.scrollTop = Math.max(0, el.offsetTop - 2);
    mark(id);
  }
  const unpin = () => { pin = null; };
  body.addEventListener('wheel', unpin, { passive: true });
  body.addEventListener('touchstart', unpin, { passive: true });
  function mark(id) {
    if (id === st.active) return;
    st.active = id;
    for (const b of tabsEl.children) { const on = b.dataset.tab === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
  }
  // the section at the top of the scroll (the last one, once scrolled to the end)
  function spy() {
    if (pin && performance.now() < pin.until) return;
    const secs = [...body.querySelectorAll('[data-sx]')];
    if (!secs.length) return;
    let cur = secs[0];
    if (body.scrollTop + body.clientHeight >= body.scrollHeight - 4) cur = secs[secs.length - 1];
    else for (const el of secs) if (el.offsetTop - body.scrollTop <= 24) cur = el;
    mark(cur.dataset.sx);
  }
  body.addEventListener('scroll', spy, { passive: true });
  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) jump(b.dataset.tab);
  });
  tabsEl.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const bs = [...tabsEl.children], i = bs.findIndex((b) => b.dataset.tab === st.active);
    const n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length];
    if (n) { e.preventDefault(); jump(n.dataset.tab); n.focus(); }
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
  // A mix of cell types on one row, like the traits around it: a dotted meter split into each type's
  // share in its colour, and the shares as α54 β41 γ5 (a sliver under 1% reads <1). hint: the
  // full figures, on hover.
  const comp = (label, tip, shares, g, hint) => {
    const types = [0, 1, 2].filter((r) => shares[r] > 0.0005);
    const pct = (v) => (v < 0.01 ? '<1' : String(Math.round(v * 100)));
    const seg = types.map((r) => `<i style="flex:${Math.max(shares[r], 0.015)};color:${cssRgb(roleColor(g, r))}"></i>`).join('');
    const val = types.map((r) => `<s><em class="greek" style="color:${cssRgb(roleColor(g, r))}">${ROLE[r]}</em>${pct(shares[r])}</s>`).join('');
    return `<div class="trait mixrow"><span>${term(tip, label)}</span><span class="mixbar">${seg}</span><b class="term" tabindex="0" data-hint="${esc(hint)}">${val}</b></div>`;
  };
  // the species at a glance, under its name in the header: its diet first, then how it is built
  // and lives (g null: none). Set only when the species changes.
  const tagsEl = $('spec-tags');
  function setTags(g) {
    const key = g ? `sp${g.serial}` : '';
    if (tagsEl.dataset.k === key) return;
    tagsEl.dataset.k = key;
    const all = g ? tagsOf(g, K) : [];
    const chip = ([t, k]) => `<span class="term" data-tip="${k}" tabindex="0">${t}</span>`;
    tagsEl.innerHTML = all.map(chip).join('');
    // more than two lines: the last that fit give way to a +n chip naming the rest
    if (!tagsEl.clientHeight && all.length) { tagsEl.dataset.k = ''; return; } // not laid out yet: measure on the next render
    const fits = () => tagsEl.scrollHeight <= tagsEl.clientHeight + 1;
    for (let n = all.length - 1; n > 0 && !fits(); n--) {
      const rest = all.slice(n).map(([t]) => t);
      tagsEl.innerHTML = all.slice(0, n).map(chip).join('') + `<span class="more" tabindex="0" data-hint="Also: ${esc(rest.join(', '))}">+${rest.length}</span>`;
    }
  }
  const blk = (title, html, opts) => block(title, html, opts);
  const vital = (label, frac, cls, text, tip) => `<div class="vital"><span>${tip ? term(tip, label) : label}</span>${meter(frac, cls)}<b>${text}</b></div>`;
  // How warm a cell is against its species' range: a needle on a cold-to-hot scale running two
  // tolerances either side of its optimum, over the band where it works at its best.
  const warmthVital = (m, g, text) => {
    const at = (t) => (clamp((t - (g.topt - 2 * g.tol)) / (4 * g.tol), 0, 1) * 100).toFixed(1);
    const lo = at(g.topt - K.thermalFlat * g.tol), hi = at(g.topt + K.thermalFlat * g.tol);
    return `<div class="vital"><span>${term('thermal', 'Warmth')}</span><span class="tgauge${m.x > 0.8 || m.torpid ? ' alarm' : ''}"><em style="left:${lo}%;width:${(hi - lo).toFixed(1)}%"></em><i style="left:${at(m.warmth)}%"></i></span><b>${text}</b></div>`;
  };
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

  // a fixed window onto the record, newest first, scrolling once it fills, so nothing below it moves
  function storyHTML(sel) {
    if (!sel) return '';
    return blk('Record', `<ol class="story">${sel.story.map((s) => `<li><time>${fmtClock(s.t)}</time><span>${s.text}</span></li>`).join('')}</ol>`);
  }

  // The cell's own record and, while it lives, its energy budget between meals (from the replay).
  function cellBlock(p, g, past, mind) {
    let h = kv('Cell type', `<span class="greek">${ROLE[p.role]}</span>-cell`, 'celltype');
    // the warmth meter above shows the reading; here, what it means for this cell
    const m = mind && mind.m;
    if (K.heat && !past && g) {
      h += kv('Warmth', !m ? '—' : m.torpid ? `${Math.round(m.warmth)}° · torpid, ${Math.max(1, Math.round(g.topt - g.tol * K.torporAt - m.warmth))}° below its range`
        : m.x > 0.8 ? `${Math.round(m.warmth)}° · scalding, best ${Math.round(g.topt)}°`
          : `${Math.round(m.warmth)}° · works ${Math.round(m.perf * 100)}%, best ${Math.round(g.topt)}°${m.warmth - m.water > 0.4 ? ` · runs ${Math.round(m.warmth - m.water)}° warm` : ''}`, 'thermal');
    }
    h += kv('Origin', CAUSE[p.cause] || 'a founder of this world', 'origin');
    h += kv('Generation', fmt(p.gen), 'generation');
    h += kv('Speed', fmtLen(Math.hypot(p.vx, p.vy), '/s'), 'speed');
    return blk(past ? 'The cell, last seen' : '<i class="ico cell"></i>This cell', h);
  }

  // While it lives, its energy budget between meals (from the replay): one row per term, always
  // all of them, so the figures change in place and nothing below moves.
  function budgetBlock(p, g, mind) {
    const b = mind && mind.budget, none = '<span class="nil">none</span>';
    let h = kv('Light here', `${lightAt(p)}%`, 'lighthere');
    if (g && g.photo > 0.05) h += kv('Photosynthesis', b ? `<span class="pos">${signed(b.light)}/s</span>` : '—', 'photosynth');
    h += kv('Upkeep', b ? `<span class="neg">${signed(-b.upkeep)}/s</span>` : '—', 'upkeep');
    h += kv('Crowding', !b ? '—' : b.crowding > 0.01 ? `upkeep +${Math.round(b.crowding * 100)}%` : none, 'crowding');
    if (g && (g.adhesion || 0) > K.adhMin) h += kv('Bond share', !b ? '—' : b.thrift > 0.001 ? `upkeep −${Math.round(b.thrift * 100)}%` : none, 'bondthrift');
    if (K.heat) h += kv('Heat stress', !b ? '—' : mind.m.torpid ? `torpid: burns ${Math.round(K.torporCost * 100)}% of its upkeep` : b.stress > 0.01 ? `upkeep +${Math.round(b.stress * 100)}%` : none, 'thermal');
    if (K.heat && (g.thermo || 0) > 0.005) h += kv('Heat-making', b ? `<span class="neg">${signed(-b.heatMaking)}/s</span>` : '—', 'heatmaker');
    h += kv('Saving energy', !b ? '—' : b.lean < 0.995 ? `burns ${Math.round(b.lean * 100)}% of its upkeep` : none, 'lean');
    h += kv('Net', b ? `<span class="${b.net >= 0 ? 'pos' : 'neg'}">${signed(b.net)}/s</span> between meals` : '—', 'mind-net');
    return blk('Energy budget', h, { tip: 'energy' });
  }

  function organismBlock(o, g, past, sel) {
    if (!o || !g) return '';
    let h = '';
    if ((g.adhesion || 0) <= K.adhMin) {
      h += kv('Body', 'single-cell', 'singlecelled');
    } else {
      const count = o.pending ? 'counting…' : `${o.partial ? '≥ ' : ''}${fmt(o.cells)} cell${o.cells === 1 ? '' : 's'}`;
      const first = past || o.pending ? null : sel && sel.orgFirst;
      const delta = first != null && o.cells !== first ? `<em class="delta">${o.cells > first ? '+' : '−'}${fmt(Math.abs(o.cells - first))}</em>` : '';
      h += kv('Body', count + delta, 'organism');
      h += kv('Span', o.pending ? '—' : `${fmtLen(o.span)} across`);
      h += kv('Moving', fmtLen(o.speed, '/s'), 'speed');
      h += kv('Mean energy', o.meanE.toFixed(2), 'energy');
      const tot = o.roles[0] + o.roles[1] + o.roles[2] || 1;
      h += comp('Cell types', 'celltype', o.roles.map((c) => c / tot), g, `Of its ${fmt(tot)} cells: ${[0, 1, 2].filter((r) => o.roles[r]).map((r) => `${fmt(o.roles[r])} ${ROLE[r]}`).join(', ')}.`);
    }
    // a free cell's neighbours are listed under Neighbours; a body's contacts are its own
    if ((g.adhesion || 0) > K.adhMin) h += kv('Touching', o.touching ? `${o.touching} other species` : 'no other species', 'touching');
    return blk(past ? 'Its organism, last seen' : `<i class="ico org"></i>${term('organism', 'Organism')}`, h);
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
    let h = subHead('Song', `<span class="song-read"><span><b>${pad2(m.notes.length)}</b> notes</span><span><b>${(m.cycle * 0.18).toFixed(1)}</b> s</span>${m.voice2 ? '<span><b>2</b> voices</span>' : ''}</span><button type="button" class="btn mini" data-song="${g.serial}" data-hint="Hear it alone">Play</button>`, 'song');
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
      if (d) h += `<div class="blk">${subHead('Population', `peak ${fmt(sp.peak)}`)}<svg class="popchart" viewBox="0 0 300 64" preserveAspectRatio="none" aria-label="Population over time"><path d="${d}" fill="none" stroke="${cssCol(g.col)}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg><div class="legend-note"><span>${fmtClock(life.history[0].t)}</span><span>${fmtClock(life.history[life.history.length - 1].t)}</span></div></div>`;
    }
    let s = '';
    if (sp && sp.alive) {
      s += kv('Population', fmt(sp.pop));
      s += kv('Share of life', `${((sp.pop / Math.max(1, life.counts[3])) * 100).toFixed(1)}%`, 'share');
    } else {
      // as many rows as a living species has, so an extinction moves nothing below
      s += kv('Status', sp ? `extinct at ${fmtClock(sp.extinct ?? 0)}` : 'never established');
      s += kv('Peak', sp ? fmt(sp.peak) : '—');
    }
    if (src) {
      s += kv('Arose', `${fmtClock(src.born || 0)}${src.founder ? ` · ${api.originWord(src)}` : ''}`);
      const gen = life.genera.get(src.genus);
      s += kv('Genus', gen ? `${esc(gen.name)}${gen.from ? ` · split from ${esc(gen.from)}` : ''}` : '–', 'genus');
      s += kv('Mutations', `${g.depth} from its founder`, 'depth');
      if (K.heat) s += kv('Thermal niche', nicheWords(g), 'optimum');
    }
    h += blk('At a glance', s, { tip: 'species' });
    h += songBlock(g, sp, false);
    const chain = lineagePath(src);
    // two lines each, always: a lineage that grows never moves what follows
    h += blk('Descends from', `<div class="note two">${chain.length ? chain.map((a) => spLink(a.serial, a.name)).join(' ← ') + (chain.length === 6 ? ' ← …' : '') : src && src.founder ? 'a founding lineage' : 'no established ancestor'}</div>`);
    const kids = [...life.reg.values()].filter((s2) => s2.ancestor === g.serial && s2.established);
    h += blk('Descendants', `<div class="note two">${kids.length ? kids.slice(0, 6).map((k) => spLink(k.serial, k.name)).join(', ') + (kids.length > 6 ? ` and ${kids.length - 6} more` : '') : 'none established'}</div>`, { aside: kids.length ? fmt(kids.length) : '' });
    return h;
  }

  // role: the cell type whose size and shape to show; cellRole: a picked cell's type (null for a species)
  function genomeTab(g, role, cellRole = null) {
    const life = api.life();
    let h = '';
    const diet = [
      ['Light', 'photosynth', g.photo, '#d9f27a', g.photo],
      ['Glint', 'glint', g.dGlint, MATTER[1].css, g.dGlint * (1 - 0.6 * g.photo)],
      ['Husk', 'husk', g.dHusk, MATTER[2].css, g.dHusk * (1 - 0.6 * g.photo)],
      ['Flesh', 'flesh', g.dFlesh, '#ff6b6b', g.dFlesh * (1 - 0.6 * g.photo)],
    ];
    h += blk('Diet', diet.map(([l, t, v, c, w]) => `<div class="trait"><span>${term(t, l)}</span><span class="meter thin" style="color:${c}"><i style="width:${(clamp(w, 0, 1) * 100).toFixed(1)}%"></i></span><b>${Math.round(v * 100)}%</b></div>`).join(''), { tip: 'diet' });
    const sh = roleShares(g);
    let b = comp('Body plan', 'bodyplan', sh, g, `Of every 100 cells it grows: ${[0, 1, 2].filter((r) => sh[r] > 0.0005).map((r) => `${(sh[r] * 100).toFixed(sh[r] < 0.01 ? 1 : 0)} ${ROLE[r]}`).join(', ')}.`);
    b += trait('Adhesion', g.adhesion || 0, 0, 1, `${Math.round((g.adhesion || 0) * 100)}%${(g.adhesion || 0) > K.adhMin ? ' · bonds' : ''}`, 'adhesion');
    if (g.calcify > 0.005) b += trait('Calcifying', g.calcify, 0, 1, `${Math.round(g.calcify * 100)}%`, 'calcify');
    b += trait('Size', g.size, 0.45, 2.6, fmtLen(0.17 * g.size), 'size');
    b += kv('Shape', CELL_SHAPES[cellShape(g, role)], 'size');
    h += blk('Body', b);
    let m = trait('Swimming', g.swim * (1 - g.photo), 0, 3, (g.swim * (1 - g.photo)).toFixed(2), 'swimming');
    m += trait('Schooling', g.align, 0, 1, `${Math.round(g.align * 100)}%`, 'schooling');
    m += trait('Reach', g.radius, 0.4, 1, fmtLen(g.radius), 'reach');
    m += trait('Personal space', g.beta, 0.12, 0.5, `${Math.round(g.beta * 100)}% of reach`, 'personalspace');
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
    if (K.heat) h += blk('Temperature', thermalBlock(g), { tip: 'thermal' });

    // How each of its cell types reacts to what it meets: one column per cell type it grows, one row
    // per thing it can meet (its own cell types, the most numerous other species, matter). Warm:
    // drawn toward it; cool: pushed away. A picked cell's own column is marked.
    const types = [0, 1, 2].filter((r) => sh[r] > 0.05);
    const others = [];
    for (const s of life.reg.values()) if (s.alive && s.established && s.serial !== g.serial) others.push(s);
    others.sort((a, b2) => b2.pop - a.pop);
    const rows = [];
    for (const r of types) rows.push({ name: `own <span class="greek">${ROLE[r]}</span>-cells`, css: cssRgb(roleColor(g, r)), v: (t) => affinity(g, t, g, r, K) });
    for (const s2 of others.slice(0, 4)) rows.push({ name: spLink(s2.serial, s2.name), css: cssCol(s2.genome.col), v: (t) => affinity(g, t, s2.genome, 0, K) });
    for (let k = 0; k < 4; k++) if (life.matter[k]) rows.push({ name: esc(MATTER[k].name), css: MATTER[k].css, v: (t) => affinity(g, t, life.matter[k], 0, K) * K.matterPull });
    const heat = (v) => {
      const a = Math.min(1, Math.abs(v));
      const sign = Math.abs(v) < 0.005 ? '' : v > 0 ? '+' : '−';
      return `<b class="pull ${v >= 0 ? 'to' : 'away'}" style="--a:${(0.08 + 0.5 * a).toFixed(2)}">${sign}${Math.abs(v).toFixed(2)}</b>`;
    };
    const cols = `grid-template-columns: minmax(0, 1fr) repeat(${types.length}, 5.4em)`;
    let t = `<div class="pulls-t" style="${cols}"><span class="pt-h">Meets</span>${types.map((r) => `<span class="pt-h pt-col${cellRole === r ? ' mine' : ''}" style="color:${cssRgb(roleColor(g, r))}"><span><span class="greek">${ROLE[r]}</span>-cells</span>${cellRole === r ? '<i>this cell</i>' : ''}</span>`).join('')}`;
    for (const it of rows) t += `<span class="pt-name"><i style="background:${it.css}"></i><span>${it.name}</span></span>${types.map((r) => heat(it.v(r))).join('')}`;
    t += '</div><div class="pulls-key"><span><i class="to"></i>drawn toward</span><span><i class="away"></i>pushed away</span></div>';
    h += blk('How its cells react', t, { tip: 'affinity' });
    return h;
  }

  // A species' thermal niche: its genes, and its performance curve (thermalPerf) from 0 to 45°, the
  // narrow specialist's peak higher, against the background water now (rounded, so it rarely redraws).
  function nicheWords(g) {
    const t = thermalGuild(g);
    return [t.pref, t.breadth, t.maker ? 'heat-maker' : ''].filter(Boolean).join(', ') + `, ${Math.round(g.topt)}° ± ${Math.round(g.tol)}°`;
  }
  function thermalBlock(g) {
    let h = trait('Optimum', g.topt, 0, 45, `${g.topt.toFixed(1)}°`, 'optimum');
    h += trait('Tolerance', g.tol, 2, 15, `±${g.tol.toFixed(1)}°`, 'tolerance');
    h += trait('Heat output', g.thermo || 0, 0, 1, (g.thermo || 0) > 0.005 ? `${Math.round(g.thermo * 100)}% · +${(K.thermoCost * g.thermo).toFixed(3)}/s` : 'none', 'heatmaker');
    const W = 300, H = 60, X = (t) => (t / 45) * W, Y = (v) => H - 4 - (v / 1.45) * (H - 10);
    let d = '';
    for (let t = 0; t <= 45; t += 0.5) d += `${t ? 'L' : 'M'}${X(t).toFixed(1)},${Y(thermalPerf(g, t, K).perf).toFixed(1)}`;
    const water = Math.round(eng.tbg * 2) / 2, live = thermalPerf(g, water, K);
    h += `<svg class="niche" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="How well it works from 0 to 45°">`
      + `<line x1="0" x2="${W}" y1="${Y(1)}" y2="${Y(1)}" class="n-one"/>`
      + `<path d="${d}" class="n-curve"/>`
      + `<line x1="${X(water)}" x2="${X(water)}" y1="0" y2="${H}" class="n-water"/><circle cx="${X(water)}" cy="${Y(live.perf)}" r="2.5" class="n-dot"/></svg>`
      + `<div class="legend-note"><span>0°</span><span>open water ${water}° · ${Math.round(live.perf * 100)}%</span><span>45°</span></div>`;
    return h;
  }

  // ------------------------------------------------------------ render
  // the section bar: [id, label] for every section, in order
  function setTabs(list) {
    const key = list.map(([id, l]) => id + l).join(',');
    if (key === st.tabKey) return;
    st.tabKey = key;
    if (!list.some(([id]) => id === st.active)) st.active = list.length ? list[0][0] : '';
    tabsEl.innerHTML = list.length < 2 ? '' : list.map(([id, l]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${id === st.active}" tabindex="${id === st.active ? 0 : -1}">${l}</button>`).join('');
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
    let v = '', fixedKey = '', fixedHtml = '';
    const flow = []; // [id, label, html] of the sections below the fixed one
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
      setTags(g);
      flow.push(['species', 'Species', speciesTab(g, null)], ['genome', 'Genome', genomeTab(g, 0)]);
    } else if (sel) {
      root.classList.remove('no-view');
      const p = sel.particle, mem = sel.memory;
      if (p.kind < FIRST_LIFE) {
        const framboid = p.kind === FRAMBOID;
        const m = MATTER[p.kind];
        // a stone is named and drawn as the kind of grain the world draws it as (reef stone keeps a little
        // of its builder's tint)
        const grain = p.kind === 3 ? stoneGrain(p.id, p.info) : null;
        setHead(mem ? `Now ${m.name} · once` : m.name, mem && mem.sp ? spLink(mem.sp.serial, mem.sp.name) : grain ? grain.name : m.name,
          sel.lost ? 'Lost track of it' : (mem && sel.diedAt != null ? code('Died', `${fmtDur(eng.simTime - sel.diedAt)} ago`) : '') + code('ID', fmt(p.id)));
        if (grain) {
          // its colour (reef stone keeps a little of its builder's tint), dark grains lifted so the emblem reads
          const t = (p.info & 15) !== 0 ? 0.3 : 0, rgb = grain.col.map((x, i) => x + t * (((p.col >>> (8 * i)) & 255) / 255 - x));
          const lift = Math.max(0, 0.45 - (0.3 * rgb[0] + 0.5 * rgb[1] + 0.2 * rgb[2]));
          const c = rgb.map((x) => Math.round(255 * Math.min(1, x + lift)));
          plainGlyph(16 + grain.kind, (0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0);
        } else plainGlyph(MATTER_GLYPH[p.kind][0], MATTER_GLYPH[p.kind][1]);
        setActs(`m${!!mem}`, mem ? '<button type="button" class="btn" data-act="relative">Watch a relative</button>' : '');
        // in water at the background temperature (warm water wears glint and husks faster)
        const q10 = (q) => (K.heat ? q ** ((eng.tbg - K.tRef) / 10) : 1);
        if (p.kind === 1) v += vital('Charge', p.energy, 'cyan', `fades in ${fmtDur(Math.max(0, (p.energy - K.glintMin) / (K.leak * q10(K.glintQ10))))}`, 'glint');
        else if (p.kind === 2) v += vital('Energy left', p.energy / 1.2, 'sun', `${q10(K.rotQ10) > 1.3 ? 'rotting fast · ' : ''}crumbles in ${fmtDur(Math.max(0, (p.energy - K.huskMin) / (K.decay * q10(K.rotQ10))))}`, 'husk');
        else if (framboid) v += vital('Fuel', clamp(p.energy / K.framboidLife, 0, 1), 'warm', `burns out in about ${fmtDur(Math.max(0, p.energy / q10(2)))}`, 'framboid');
        else if (p.kind === 3) v += vital('Wears away', clamp(p.energy / 600, 0, 1), 'cyan', `in ${fmtDur(Math.max(0, p.energy))}`, 'stone');
        else v += vital('Light here', lightAt(p) / 100, 'sun', `${lightAt(p)}%`, 'lighthere');
        setTags(mem ? mem.g : null); // what it was
        let s = `<p class="note">${m.blurb}</p>`;
        s += kv(p.kind === 2 ? 'Dead for' : framboid ? 'Burning for' : p.kind === 3 ? 'Stone for' : 'In this state', fmtDur(p.age));
        if (p.kind === 2) s += kv('Cause of death', CAUSE[p.cause] || 'unknown');
        s += kv('Light here', `${lightAt(p)}%`, 'lighthere');
        flow.push(['state', m.name, blk('', s) + storyHTML(sel)]);
        if (mem) {
          flow.push(['body', 'Body', cellBlock(mem.p, mem.g, true) + organismBlock(mem.org, mem.g, true, sel)]);
          flow.push(['species', 'Species', speciesTab(mem.g, mem.sp)], ['genome', 'Genome', genomeTab(mem.g, mem.role, mem.role)]);
        }
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
        setTags(g);
        const hl = sp && api.focusKey() === `sp:${sp.serial}`;
        setActs(`c${api.follow()}${hl}${!!sp}`, `<button type="button" class="btn" data-act="follow" aria-pressed="${api.follow()}" data-hint="Keep it in view · C">Follow</button>${sp && sp.alive ? `<button type="button" class="btn" data-act="hl" aria-pressed="${!!hl}">Highlight species</button>` : ''}`);
        if (g) {
          v += vital('Energy', p.energy / g.reproE, 'sun', `${p.energy.toFixed(2)} / ${g.reproE.toFixed(2)}`, 'energy');
          v += vital('Age', p.age / g.lifespan, 'cyan', `${fmtDur(p.age)} / ${fmtDur(g.lifespan)}`, 'lifespan');
          const m = !sel.lost && sel.mind && sel.mind.m;
          if (K.heat && m) {
            v += warmthVital(m, g, `${Math.round(m.warmth)}°`);
          }
          const head = sel.mind && !sel.lost && (sel.mind.head || sel.mind);
          if (!sel.lost) v = `<div class="vital now"><span>${term('mind', 'Now')}</span><b>${head ? withSp(head.text, head.target) : '—'}</b></div>` + v;
        }
        // the instruments are built once per cell and update in place (mindview.js); the rest flows below
        if (g && !sel.lost) { fixedKey = `mv:${sel.id}:${p.kind}:${g.serial}`; fixedHtml = section('behaviour', 'Behaviour', mv.html(g, p.kind)); }
        // a bonded species' organism first, a free cell's own record first: fixed by the genome, so
        // the order never flips as a trace comes in
        const cb = cellBlock(p, g, false, sel.lost ? null : sel.mind), ob = organismBlock(o, g, false, sel), bb = sel.lost ? '' : budgetBlock(p, g, sel.mind);
        const bonded = g && (g.adhesion || 0) > K.adhMin;
        flow.push(['body', 'Body', (bonded ? ob + cb : cb + ob) + bb + storyHTML(sel)]);
        if (g) flow.push(['species', 'Species', speciesTab(g, null)], ['genome', 'Genome', genomeTab(g, p.role, p.role)]);
      }
    } else return false;
    if (v !== st.lastVit) { vit.innerHTML = v; st.lastVit = v; }
    setTabs([...(fixedKey ? [['behaviour', 'Behaviour']] : []), ...flow.map(([id, l]) => [id, l])]);
    const flowKey = flow.map(([id]) => id).join(',');
    if (fixedKey !== st.fixedKey || flowKey !== st.flowKey || !body.firstElementChild) {
      // the same cell's panel rebuilt (the watch moved to another cell of its body) keeps its place
      const keep = body.scrollTop;
      body.innerHTML = `<div class="spec-fixed">${fixedHtml}</div><div class="spec-flow">${flow.map(([id, l]) => section(id, l, '')).join('')}</div>`;
      st.fixedKey = fixedKey; st.flowKey = flowKey; st.flow.clear(); songKey = '';
      if (fixedKey) { mv.bind(body.firstElementChild); mindUpdate(); }
      restoreTop = keep;
    }
    // each section is replaced only when what it shows changed, so the others keep their hover and selection
    for (const [id, , html] of flow) {
      if (st.flow.get(id) === html) continue;
      const el = sectionEl(id);
      if (el) { el.querySelector('.sx-b').innerHTML = html; st.flow.set(id, html); songKey = ''; }
    }
    if (restoreTop != null) { body.scrollTop = restoreTop; restoreTop = null; }
    if (pin && performance.now() < pin.until) { const el = sectionEl(pin.id); if (el) body.scrollTop = Math.max(0, el.offsetTop - 2); mark(pin.id); return true; }
    pin = null;
    spy();
    return true;
  }
  let restoreTop = null;

  function open() {
    if (root.hidden) {
      root.hidden = false;
      setFull(false);
      document.body.classList.add('spec-open');
    }
    st.lastVit = ''; st.actKey = ''; st.tabKey = ''; st.lastHead = ''; st.fixedKey = null; st.flowKey = ''; st.flow.clear(); st.active = '';
    body.scrollTop = 0;
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
      // the watched cell's brackets first: the organism's frame leaves room for them around every cell
      const R = Math.max(6, cellRadius(sel.particle, api.genomeFor(sel.particle.kind), pxPerCell) * 1.4 + 3), c = Math.max(3, Math.min(10, R * 0.45));
      const pad = R + 6, e = m + 2;
      const l = clamp(w / 2 + box[0] * pxPerCell - pad, e, w / 2 - R - 4), t = clamp(h / 2 + box[1] * pxPerCell - pad, e, h / 2 - R - 4);
      const r = clamp(w / 2 + box[2] * pxPerCell + pad, w / 2 + R + 4, w - e), b = clamp(h / 2 + box[3] * pxPerCell + pad, h / 2 + R + 4, h - e);
      g.strokeStyle = 'rgba(255,95,58,0.9)';
      brackets(l, t, r, b, Math.min(10, (r - l) / 3, (b - t) / 3));
      g.strokeStyle = 'rgba(241,227,160,0.95)';
      brackets(w / 2 - R, h / 2 - R, w / 2 + R, h / 2 + R, c);
    } else {
      g.strokeStyle = sel && sel.lost ? 'rgba(255,255,255,0.3)' : 'rgba(255,95,58,0.9)';
      brackets(w / 2 - 9, h / 2 - 9, w / 2 + 9, h / 2 + 9, 4);
    }
    g.lineWidth = 1;
    // the longest round length that fits a third of the viewer
    const um = [...NICE_UM].reverse().find((u) => (u / UM_PER_UNIT) * pxPerCell <= w * 0.34) || 1;
    const bar = (um / UM_PER_UNIT) * pxPerCell;
    g.fillStyle = 'rgba(226,241,240,0.85)';
    g.fillRect(12, h - 14, bar, 1.5);
    g.fillRect(12, h - 18, 1, 6); g.fillRect(12 + bar - 1, h - 18, 1, 6);
    g.font = '500 10px Saira, system-ui, sans-serif';
    g.fillText(fmtLen(um / UM_PER_UNIT), 18 + bar, h - 10); // not upper-cased: µ would become Μ
    g.fillStyle = 'rgba(241,227,160,0.95)';
    g.fillText(fmtClock(eng.simTime), 14, 20);
    g.fillStyle = 'rgba(163,189,190,0.9)';
    if (sel) {
      const [W, H] = eng.grid;
      g.textAlign = 'right';
      const mm = (v, n) => ((((v % n) + n) % n) * UM_PER_UNIT / 1000).toFixed(2);
      g.fillText(`X ${mm(sel.disp[0], W)}  Y ${mm(sel.disp[1], H)} MM`, w - 14, 20);
      g.textAlign = 'left';
    }
  }

  // a new reading of the selected cell: update the instruments in place, between renders
  function mindUpdate() {
    const sel = api.sel();
    if (sel && sel.mind && !sel.lost && st.fixedKey) mv.update(sel.mind, sel.particle.kind);
  }

  // a new world reuses serials: forget everything cached by one
  function reset() { songs.clear(); glyphEl.dataset.k = ''; tagsEl.dataset.k = ''; }
  return { reset, render, open, close, inset, drawViewerUI, songTick, mindUpdate, mindTick: (now) => mv.tick(now), isOpen: () => !root.hidden, invalidate() { st.flow.clear(); st.actKey = ''; st.lastHead = ''; st.fixedKey = null; } };
}
