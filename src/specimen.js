import { roleShares, roleColor, affinity, CELL_SHAPES, cellShape, thermalPerf, thermalGuild, divEnergy, growPlan, describeGrowth } from './genome.js';
import { FIRST_LIFE } from './engine.js';
import { FRAMBOID, stoneGrain } from './shaders.js';
import { tagsOf } from './facets.js';
import { tideAt, duckShade } from './flow.js';
import { fmt, fmtClock, fmtDur, esc, cssCol, cssRgb, term, spLink, meter, clamp, ROLE, MATTER, CAUSE, cellRadius, fmtLen, NICE_UM, UM_PER_UNIT } from './fmt.js';
import { glyphURL, MATTER_GLYPH } from './glyphs.js';
import { drawLines, popOf } from './charts.js';
import { voiceOf } from './audio/mapping.js';
import { describe, compareMotifs } from './audio/motif.js';
import { songSVG, sigilSVG, lightSong } from './song.js';
import { createMindView } from './mindview.js';
import { belowRange } from './mind.js';
import { block, kv, trait, section, subHead } from './ui.js';
import { setHTML } from './live.js';
import { tr } from './i18n.js';

/**
 * The specimen panel: whatever was picked in the world (a cell, a grain) or opened by name (a species).
 * main.js owns the selection and its tracking; this module only draws it. On a phone the panel is a
 * sheet that peeks above the dock and is pulled up for the details.
 */
// after a ride that ended in its death (or lost track of it): ride the nearest of its kind instead
const RIDE_REL = `<button type="button" class="btn" data-act="riderel" data-hint="${tr('spec.act.ride-relative.hint', 'Ride the nearest of its kind · Enter')}">${tr('spec.act.ride-relative', 'Ride a relative')}</button>`;

export function createSpecimen(api) {
  const { eng, K } = api;
  const $ = (id) => document.getElementById(id);
  const root = $('spec'), body = $('spec-body'), tabsEl = $('spec-tabs'), acts = $('spec-acts'), vit = $('vitals');
  const st = { active: '', mode: '', actKey: '', tabKey: '', lastVit: '', vitEl: null, lastHead: '', at: 0, flow: new Map(), flowKey: '' };
  const phone = () => matchMedia('(max-width: 720px)').matches;
  const peek = () => phone() && !root.classList.contains('full');

  // ------------------------------------------------------------ sheet (phone)
  // Collapsed, the sheet shows the picked particle's name, actions and vitals; full, everything.
  // Drag the handle or the header (or, collapsed, anywhere on the sheet) up to open it and down to
  // close it; a tap on the handle or header toggles it; Full record opens it too.
  const more = $('spec-more');
  let drag = null;
  const isFull = () => root.classList.contains('full');
  function setFull(on, redraw = true) {
    if (on === isFull()) return;
    root.classList.toggle('full', on);
    more.setAttribute('aria-expanded', String(on));
    if (redraw) render(true); // the vitals move between the header and the scroll
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
    if (a === 'ride') api.onRide();
    else if (a === 'riderel') api.onRideRelative();
    else if (a === 'relative') api.onRelative();
    else if (a === 'find') api.onFind();
    else if (a === 'hl') api.onHighlight();
    else if (a === 'card') { api.onCard?.(); return; }
    else if (a === 'save') { api.onSave(); return; }
    st.actKey = '';
    render(true);
  });

  // ------------------------------------------------------------ pieces
  // its card: Save keeps it in the cabinet (to carry to any world); once kept, Card opens it (to name it, share it)
  const cardBtn = (serial) => (api.saved(serial)
    ? `<button type="button" class="btn" data-act="card" data-hint="${tr('spec.act.card.hint', 'Its card: name it, share it, load the pipette with it')}">${tr('spec.act.card', 'Card')}</button>`
    : `<button type="button" class="btn" data-act="save" data-hint="${tr('spec.act.save.hint', 'Save its card to the cabinet, to carry it to any world')}">${tr('spec.act.save', 'Save')}</button>`);
  // A mix of cell types on one row, like the traits around it: a dotted meter split into each type's
  // share in its color, and the shares as α54 β41 γ5 (a sliver under 1% reads <1). hint: the
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
  let allTags = ''; // every chip, for when the +n chip is opened
  function setTags(g) {
    const key = g ? `sp${g.serial}` : '';
    if (tagsEl.dataset.k === key) return;
    tagsEl.dataset.k = key;
    tagsEl.classList.remove('all'); // each species starts collapsed
    const all = g ? tagsOf(g, K) : [];
    const chip = ([t, k]) => `<span class="term" data-tip="${k}" tabindex="0">${t}</span>`;
    tagsEl.innerHTML = allTags = all.map(chip).join('');
    // more than a line: the last that fit give way to a +n chip naming the rest
    if (!tagsEl.clientHeight && all.length) { tagsEl.dataset.k = ''; return; } // not laid out yet: measure on the next render
    const fits = () => tagsEl.scrollHeight <= tagsEl.clientHeight + 1;
    for (let n = all.length - 1; n > 0 && !fits(); n--) {
      const rest = all.slice(n).map(([t]) => t);
      // i18n: the hint of the +n chip that stands for the species' tags that did not fit: {tags} lists them
      tagsEl.innerHTML = all.slice(0, n).map(chip).join('') + `<span class="more" role="button" tabindex="0" data-hint="${tr('spec.tags.more.hint', 'Also: {tags}. Show them all', { tags: esc(rest.join(', ')) })}">+${rest.length}</span>`;
    }
  }
  // the +n chip opens to every tag, until the species changes or the panel opens again
  function expandTags(e) {
    if (!e.target.closest('.more')) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    tagsEl.classList.add('all');
    tagsEl.innerHTML = allTags;
    document.activeElement?.blur?.(); // hand focus back so shortcuts keep working
  }
  tagsEl.addEventListener('click', expandTags);
  tagsEl.addEventListener('keydown', expandTags);
  const blk = (title, html, opts) => block(title, html, opts);
  const vital = (label, frac, cls, text, tip) => `<div class="vital"><span>${tip ? term(tip, label) : label}</span>${meter(frac, cls)}<b>${text}</b></div>`;
  // How warm a cell is against its species' range: a needle on a cold-to-hot scale running two
  // tolerances either side of its optimum, over the band where it works at its best.
  const warmthVital = (m, g, text) => {
    const at = (t) => (clamp((t - (g.topt - 2 * g.tol)) / (4 * g.tol), 0, 1) * 100).toFixed(1);
    const lo = at(g.topt - K.thermalFlat * g.tol), hi = at(g.topt + K.thermalFlat * g.tol);
    return `<div class="vital"><span>${term('thermal', tr('spec.vital.warmth', 'Warmth'))}</span><span class="tgauge${m.x > 0.8 || m.torpid ? ' alarm' : ''}"><em style="left:${lo}%;width:${(hi - lo).toFixed(1)}%"></em><i style="left:${at(m.warmth)}%"></i></span><b>${text}</b></div>`;
  };
  // as lifeMain has it (lightAt): the baseline and the Tide's bands by the season, under the sky and any duckweed
  const lightAt = (p) => { const [W, H] = eng.grid; return Math.round((eng.ambient + (1 - eng.ambient) * tideAt(p.x, p.y, W, H, eng.simTime, eng.tide, eng.tidePh) * eng.season) * eng.sky * (1 - duckShade(p.x, p.y, eng.duck, W, H)) * 100); };

  // ------------------------------------------------------------ behavior (mind.js, mindview.js)
  function spName(kind) {
    const g = api.genomeFor(kind);
    const sp = g && api.life().reg.get(g.serial);
    return sp ? spLink(sp.serial, sp.name) : tr('mind.unnamed-in-text', 'an unnamed species');
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
    return blk(tr('spec.record', 'Record'), `<ol class="storylist">${sel.story.map((s) => `<li><time>${fmtClock(s.t)}</time><span>${s.text}</span></li>`).join('')}</ol>`);
  }

  // The cell's own record and, while it lives, its energy budget between meals (from the replay).
  function cellBlock(p, g, past, mind) {
    // i18n: {role} is a cell type's Greek letter (α, β, γ)
    let h = kv(tr('spec.cell.type', 'Cell type'), tr('spec.cell.type.value', '{role}-cell', { role: `<span class="greek">${ROLE[p.role]}</span>` }), 'celltype');
    // the warmth meter above shows the reading; here, what it means for this cell
    const m = mind && mind.m;
    if (K.heat && !past && g) {
      // i18n: a cell's temperature ({t}) against its species' best ({opt}): {below} and {warm} are degrees, {perf} a percentage
      h += kv(tr('spec.cell.warmth', 'Warmth'), !m ? '—' : m.torpid ? tr('spec.cell.warmth.torpid', '{t}° · torpid, {below}° below its range', { t: Math.round(m.warmth), below: belowRange(g, K, m.warmth) })
        : m.x > 0.8 ? tr('spec.cell.warmth.scalding', '{t}° · scalding, best {opt}°', { t: Math.round(m.warmth), opt: Math.round(g.topt) })
          // i18n: {t} its temperature, {opt} its species' best; {warm} degrees above the water (a heat-maker's)
          : tr('spec.cell.warmth.works', '{t}° · works {perf}%, best {opt}°{own, select, yes { · runs {warm}° warm} other {}}', { t: Math.round(m.warmth), perf: Math.round(m.perf * 100), opt: Math.round(g.topt), own: m.warmth - m.water > 0.4 ? 'yes' : 'no', warm: Math.round(m.warmth - m.water) }), 'thermal');
    }
    h += kv(tr('spec.cell.origin', 'Origin'), CAUSE[p.cause] || tr('spec.cell.origin.founder', 'a founder of this world'), 'origin');
    h += kv(tr('spec.cell.generation', 'Generation'), fmt(p.gen), 'generation');
    h += kv(tr('spec.cell.speed', 'Speed'), fmtLen(Math.hypot(p.vx, p.vy), '/s'), 'speed');
    return blk(past ? tr('spec.cell.title-past', 'The cell, last seen') : `<i class="corner cell"></i>${tr('spec.cell.title', 'This cell')}`, h);
  }

  // While it lives, its energy budget between meals (from the replay): one row per term, always
  // all of them, so the figures change in place and nothing below moves.
  function budgetBlock(p, g, mind) {
    const b = mind && mind.budget, none = `<span class="nil">${tr('spec.none', 'none')}</span>`;
    // i18n: the energy budget's rows: {p} is a percentage; {rate} energy a second, signed (+0.012)
    let h = kv(tr('spec.light-here', 'Light here'), `${lightAt(p)}%`, 'lighthere');
    if (g && g.photo > 0.05) h += kv(tr('spec.budget.photosynth', 'Photosynthesis'), b ? `<span class="pos">${signed(b.light)}/s</span>` : '—', 'photosynth');
    h += kv(tr('spec.budget.upkeep', 'Upkeep'), b ? `<span class="neg">${signed(-b.upkeep)}/s</span>` : '—', 'upkeep');
    // i18n: {p} a percentage
    h += kv(tr('spec.budget.crowding', 'Crowding'), !b ? '—' : b.crowding > 0.01 ? tr('spec.budget.upkeep-more', 'upkeep +{p}%', { p: Math.round(b.crowding * 100) }) : none, 'crowding');
    if (g && (g.adhesion || 0) > K.adhMin) h += kv(tr('spec.budget.bond-share', 'Bond share'), !b ? '—' : b.thrift > 0.001 ? tr('spec.budget.upkeep-less', 'upkeep −{p}%', { p: Math.round(b.thrift * 100) }) : none, 'bondthrift');
    if (K.heat) h += kv(tr('spec.budget.heat-stress', 'Heat stress'), !b ? '—' : mind.m.torpid ? tr('spec.budget.torpid', 'torpid: burns {p}% of its upkeep', { p: Math.round(K.torporCost * 100) }) : b.stress > 0.01 ? tr('spec.budget.upkeep-more', 'upkeep +{p}%', { p: Math.round(b.stress * 100) }) : none, 'thermal');
    if (K.heat && g && (g.thermo || 0) > 0.005) h += kv(tr('spec.budget.heat-making', 'Heat-making'), b ? `<span class="neg">${signed(-b.heatMaking)}/s</span>` : '—', 'heatmaker');
    // i18n: {p} a percentage
    if (g && (1 - g.photo) ** 2 > 0.1) h += kv(tr('spec.budget.gut', 'Gut'), !b ? '—' : b.gut > 0.01 ? tr('spec.budget.gut-full', '{p}% full', { p: Math.round(b.gut * 100) }) : `<span class="nil">${tr('spec.budget.gut-empty', 'empty')}</span>`, 'mind-gut');
    h += kv(tr('spec.budget.lean', 'Saving energy'), !b ? '—' : b.lean < 0.995 ? tr('spec.budget.lean-burns', 'burns {p}% of its upkeep', { p: Math.round(b.lean * 100) }) : none, 'lean');
    // i18n: <net> wraps the figure, colored by its sign
    h += kv(tr('spec.budget.net', 'Net'), b ? tr('spec.budget.net-value', '<net>{rate}/s</net> between meals', { rate: signed(b.net), net: (c) => `<span class="${b.net >= 0 ? 'pos' : 'neg'}">${c.join('')}</span>` }) : '—', 'mind-net');
    return blk(tr('spec.budget', 'Energy budget'), h, { tip: 'energy' });
  }

  function organismBlock(o, g, past, sel) {
    if (!o || !g) return '';
    let h = '';
    if ((g.adhesion || 0) <= K.adhMin) {
      h += kv(tr('spec.org.body', 'Body'), tr('spec.org.single-cell', 'single-cell'), 'singlecelled');
    } else {
      // i18n: a body's size in cells; {partial} yes when the count is a lower bound (≥)
      const count = o.pending ? tr('spec.org.counting', 'counting…') : tr('spec.org.cells', '{partial, select, yes {≥ } other {}}{n, plural, one {# cell} other {# cells}}', { partial: o.partial ? 'yes' : 'no', n: o.cells });
      const first = past || o.pending ? null : sel && sel.orgFirst;
      const delta = first != null && o.cells !== first ? `<em class="delta">${o.cells > first ? '+' : '−'}${fmt(Math.abs(o.cells - first))}</em>` : '';
      h += kv(tr('spec.org.body', 'Body'), count + delta, 'organism');
      // i18n: {len} is a length (120 µm)
      h += kv(tr('spec.org.span', 'Span'), o.pending ? '—' : tr('spec.org.span-value', '{len} across', { len: fmtLen(o.span) }));
      h += kv(tr('spec.org.moving', 'Moving'), fmtLen(o.speed, '/s'), 'speed');
      h += kv(tr('spec.org.mean-energy', 'Mean energy'), o.meanE.toFixed(2), 'energy');
      const tot = o.roles[0] + o.roles[1] + o.roles[2] || 1;
      // i18n: a hint: {n} cells in the body; {mix} how many of each type (12 α, 3 β)
      h += comp(tr('spec.org.cell-types', 'Cell types'), 'celltype', o.roles.map((c) => c / tot), g, tr('spec.org.cell-types.hint', 'Of its {n, plural, other {# cells}}: {mix}.', { n: tot, mix: [0, 1, 2].filter((r) => o.roles[r]).map((r) => `${fmt(o.roles[r])} ${ROLE[r]}`).join(', ') }));
    }
    // a free cell's neighbors are listed under Neighbors; a body's contacts are its own
    // i18n: {n} species it touches
    if ((g.adhesion || 0) > K.adhMin) h += kv(tr('spec.org.touching', 'Touching'), o.touching ? tr('spec.org.touching-n', '{n} other species', { n: o.touching }) : tr('spec.org.touching-none', 'no other species'), 'touching');
    return blk(past ? tr('spec.org.title-past', 'Its organism, last seen') : `<i class="corner org"></i>${term('organism', tr('spec.org.title', 'Organism'))}`, h);
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
    // i18n: the song's figures: {n} notes (two digits, 04), {s} seconds a cycle, and 2 voices when it has a second
    let h = subHead(tr('spec.song', 'Song'), `<span class="song-read"><span>${tr('spec.song.notes', '<b>{n}</b> notes', { n: pad2(m.notes.length) })}</span><span>${tr('spec.song.seconds', '<b>{s}</b> s', { s: (m.cycle * 0.18).toFixed(1) })}</span>${m.voice2 ? `<span>${tr('spec.song.voices', '<b>{n}</b> voices', { n: 2 })}</span>` : ''}</span><button type="button" class="btn mini" data-song="${g.serial}" data-hint="${tr('spec.song.play.hint', 'Hear it alone')}">${tr('spec.song.play', 'Play')}</button>`, 'song');
    // i18n: the song's aria label: {tags} its instrument, register and tempo; {line} a sentence on it
    h += `<div class="song-wrap">${songSVG(v.motif, { col: cssCol(g.col), col2: cssRgb(roleColor(g, 1)), ghost: compact ? null : av && av.motif, h: compact ? 46 : 68, label: tr('spec.song.label', '{tags}: {line}', { tags: d.tags.join(', '), line: d.line }) })}</div>`;
    h += `<div class="song-tags">${d.tags.map((t, i) => `<span class="term" data-tip="${['instrument', 'register', 'tempo'][i]}" tabindex="0">${esc(t)}</span>`).join('<i>·</i>')}</div>`;
    if (!compact) {
      h += `<p class="note">${esc(d.line)}</p>`;
      // i18n: {name} is the ancestor species' name (a link); {diff} lists how the songs differ
      if (diff) h += `<p class="note song-diff">${diff.length ? tr('spec.song.diff', 'Compared with {name}’s song (drawn dashed): {diff}.', { name: spLink(anc.serial, anc.name), diff: esc(diff.join(', ')) }) : tr('spec.song.same', 'The same song as its ancestor {name}.', { name: spLink(anc.serial, anc.name) })}</p>`;
    }
    return `<div class="blk song" data-slot="${slot}" data-tag="sp${g.serial}">${h}</div>`;
  }
  // the song's roll lit as it is sung (song.js lightSong): the picked species' notes in the world, and its own played
  let songKey = '';
  function songTick(now, events) {
    const blk = body.querySelector('.blk.song');
    if (!blk) { songKey = ''; return; }
    const slot = +blk.dataset.slot, tag = blk.dataset.tag;
    songKey = lightSong(blk, now, events, (e) => (e.slot === slot && slot >= 0) || e.slot === tag, blk.dataset.drawn ? songKey : null);
    blk.dataset.drawn = '1';
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
      // i18n: the most cells the species has had at once
      if (life.history.length > 1) h += `<div class="blk">${subHead(tr('spec.pop.chart', 'Population'), tr('spec.pop.peak', 'peak {n, number}', { n: sp.peak }))}<canvas class="popchart chart" data-chart="pop:${sp.serial}" aria-label="${tr('spec.pop.chart.aria', 'Population over time')}"></canvas></div>`;
    }
    let s = '';
    if (sp && sp.alive) {
      s += kv(tr('spec.sp.population', 'Population'), fmt(sp.pop));
      s += kv(tr('spec.sp.share', 'Share of life'), `${((sp.pop / Math.max(1, life.counts[3])) * 100).toFixed(1)}%`, 'share');
    } else {
      // as many rows as a living species has, so an extinction moves nothing below
      // i18n: {at} a time on the world's clock (1:02:03)
      s += kv(tr('spec.sp.status', 'Status'), sp ? tr('spec.sp.extinct-at', 'extinct at {at}', { at: fmtClock(sp.extinct ?? 0) }) : tr('spec.sp.never', 'never established'));
      s += kv(tr('spec.sp.peak', 'Peak'), sp ? fmt(sp.peak) : '—');
    }
    if (src) {
      // i18n: {at} a time on the world's clock; {origin} how a founder came to be (a founder's only)
      s += kv(tr('spec.sp.arose', 'Arose'), tr('spec.sp.arose-value', '{at}{founder, select, yes { · {origin}} other {}}', { at: fmtClock(src.born || 0), founder: src.founder ? 'yes' : 'no', origin: src.founder ? api.originWord(src) : '' }));
      const gen = life.genera.get(src.genus);
      // i18n: {name} a genus' name; {from} the genus it split from
      s += kv(tr('spec.sp.genus', 'Genus'), gen ? (gen.from ? tr('spec.sp.genus-split', '{name} · split from {from}', { name: esc(gen.name), from: esc(gen.from) }) : esc(gen.name)) : '–', 'genus');
      // i18n: {n} mutations
      s += kv(tr('spec.sp.mutations', 'Mutations'), tr('spec.sp.mutations-value', '{n} from its founder', { n: g.depth }), 'depth');
      if (K.heat) s += kv(tr('spec.sp.niche', 'Thermal niche'), nicheWords(g), 'optimum');
    }
    h += blk(tr('spec.sp.glance', 'At a glance'), s, { tip: 'species' });
    h += songBlock(g, sp, false);
    const chain = lineagePath(src);
    // two lines each, always: a lineage that grows never moves what follows
    h += blk(tr('spec.sp.descends', 'Descends from'), `<div class="note two">${chain.length ? chain.map((a) => spLink(a.serial, a.name)).join(' ← ') + (chain.length === 6 ? ' ← …' : '') : src && src.founder ? tr('spec.sp.founding', 'a founding lineage') : tr('spec.sp.no-ancestor', 'no established ancestor')}</div>`);
    const kids = [...life.reg.values()].filter((s2) => s2.ancestor === g.serial && s2.established);
    const kidList = kids.slice(0, 6).map((k) => spLink(k.serial, k.name)).join(', ');
    // i18n: {list} names six descendant species (links); {n} how many more there are
    h += blk(tr('spec.sp.descendants', 'Descendants'), `<div class="note two">${kids.length ? (kids.length > 6 ? tr('spec.sp.descendants-more', '{list} and {n} more', { list: kidList, n: kids.length - 6 }) : kidList) : tr('spec.sp.no-descendants', 'none established')}</div>`, { aside: kids.length ? fmt(kids.length) : '' });
    return h;
  }

  // role: the cell type whose size and shape to show; cellRole: a picked cell's type (null for a species)
  function genomeTab(g, role, cellRole = null) {
    const life = api.life();
    let h = '';
    const diet = [
      // i18n: what a species lives on: the Diet block's rows
      [tr('spec.diet.light', 'Light'), 'photosynth', g.photo, '#d9f27a', g.photo],
      [tr('spec.diet.grazing', 'Grazing'), 'graze', g.dGlint, '#d9f27a', g.dGlint * (1 - 0.6 * g.photo)],
      [tr('spec.diet.husk', 'Husk'), 'husk', g.dHusk, MATTER[2].css, g.dHusk * (1 - 0.6 * g.photo)],
      [tr('spec.diet.flesh', 'Flesh'), 'flesh', g.dFlesh, '#ff6b6b', g.dFlesh * (1 - 0.6 * g.photo)],
    ];
    h += blk(tr('spec.diet', 'Diet'), diet.map(([l, t, v, c, w]) => `<div class="trait"><span>${term(t, l)}</span><span class="meter thin" style="color:${c}"><i style="width:${(clamp(w, 0, 1) * 100).toFixed(1)}%"></i></span><b>${Math.round(v * 100)}%</b></div>`).join(''), { tip: 'diet' });
    const sh = roleShares(g);
    // i18n: a hint: {mix} how many of every 100 cells are of each type (54 α, 41 β)
    let b = comp(tr('spec.body.plan', 'Body plan'), 'bodyplan', sh, g, tr('spec.body.plan.hint', 'Of every 100 cells it grows: {mix}.', { mix: [0, 1, 2].filter((r) => sh[r] > 0.0005).map((r) => `${(sh[r] * 100).toFixed(sh[r] < 0.01 ? 1 : 0)} ${ROLE[r]}`).join(', ') }));
    // i18n: {p} a percentage; {bonds} yes when it is sticky enough to bond
    b += trait(tr('spec.body.adhesion', 'Adhesion'), g.adhesion || 0, 0, 1, tr('spec.body.adhesion-value', '{p}%{bonds, select, yes { · bonds} other {}}', { p: Math.round((g.adhesion || 0) * 100), bonds: (g.adhesion || 0) > K.adhMin ? 'yes' : 'no' }), 'adhesion');
    if ((g.adhesion || 0) > K.adhMin) b += kv(tr('spec.body.growth', 'Growth'), describeGrowth(growPlan(g, K), g, K), 'growth');
    if (g.calcify > 0.005) b += trait(tr('spec.body.calcify', 'Calcifying'), g.calcify, 0, 1, `${Math.round(g.calcify * 100)}%`, 'calcify');
    b += trait(tr('spec.body.size', 'Size'), g.size, 0.45, 2.6, fmtLen(0.17 * g.size), 'size');
    b += kv(tr('spec.body.shape', 'Shape'), CELL_SHAPES[cellShape(g, role)], 'size');
    h += blk(tr('spec.body', 'Body'), b);
    let m = trait(tr('spec.move.swimming', 'Swimming'), g.swim * (1 - g.photo), 0, 3, (g.swim * (1 - g.photo)).toFixed(2), 'swimming');
    m += trait(tr('spec.move.schooling', 'Schooling'), g.align, 0, 1, `${Math.round(g.align * 100)}%`, 'schooling');
    const pt = g.phototaxis || 0;
    // i18n: {p} a percentage; {dir} whether it swims toward the light or away from it
    if (K.phototaxis > 0) m += trait(tr('spec.move.phototaxis', 'Phototaxis'), Math.abs(pt), 0, 1, Math.abs(pt) > 0.005 ? tr('spec.move.phototaxis-value', '{p}% {dir, select, toward {toward} other {away from}} light', { p: Math.round(Math.abs(pt) * 100), dir: pt > 0 ? 'toward' : 'away' }) : tr('spec.none', 'none'), 'phototaxis');
    m += trait(tr('spec.move.reach', 'Reach'), g.radius, 0.4, 1, fmtLen(g.radius), 'reach');
    // i18n: {p} a percentage of its reach
    m += trait(tr('spec.move.space', 'Personal space'), g.beta, 0.12, 0.5, tr('spec.move.space-value', '{p}% of reach', { p: Math.round(g.beta * 100) }), 'personalspace');
    m += trait(tr('spec.move.thrust', 'Thrust'), g.force, 1, 16, g.force.toFixed(1), 'thrust');
    // i18n: milliseconds
    m += trait(tr('spec.move.glide', 'Glide'), g.drag, 0.015, 0.4, tr('spec.move.glide-value', '{ms} ms', { ms: (g.drag * 1000).toFixed(0) }), 'glide');
    m += trait(tr('spec.move.current', 'Current pull'), g.advect, 0.03, 1, `${Math.round(g.advect * 100)}%`, 'currentpull');
    h += blk(tr('spec.move', 'Movement'), m);
    let l = trait(tr('spec.life.lifespan', 'Lifespan'), g.lifespan, 20, 500, fmtDur(g.lifespan), 'lifespan');
    const dv = divEnergy(g, K);
    l += trait(tr('spec.life.divides-at', 'Divides at'), dv, 1, 8, dv.toFixed(2), 'dividesat');
    l += trait(tr('spec.life.child-share', 'Child share'), g.share, 0.2, 0.7, `${Math.round(g.share * 100)}%`, 'childshare');
    l += trait(tr('spec.life.upkeep', 'Upkeep'), g.metab, 0.01, 0.15, `${g.metab.toFixed(3)}/s`, 'upkeep');
    l += trait(tr('spec.life.mutation', 'Mutation'), g.mutRate, 0.002, 0.08, `${(g.mutRate * 100).toFixed(1)}%`, 'mutation');
    h += blk(tr('spec.life', 'Life cycle'), l);
    if (K.heat) h += blk(tr('spec.temp', 'Temperature'), thermalBlock(g), { tip: 'thermal' });

    // How each of its cell types reacts to what it meets: one column per cell type it grows, one row
    // per thing it can meet (its own cell types, the most numerous other species, matter). Warm:
    // drawn toward it; cool: pushed away. A picked cell's own column is marked.
    const types = [0, 1, 2].filter((r) => sh[r] > 0.05);
    const others = [];
    for (const s of life.reg.values()) if (s.alive && s.established && s.serial !== g.serial) others.push(s);
    others.sort((a, b2) => b2.pop - a.pop);
    const rows = [];
    // i18n: {role} is a cell type's Greek letter (α, β, γ)
    for (const r of types) rows.push({ name: tr('spec.pulls.own', 'own {role}-cells', { role: `<span class="greek">${ROLE[r]}</span>` }), css: cssRgb(roleColor(g, r)), v: (t) => affinity(g, t, g, r, K) });
    for (const s2 of others.slice(0, 4)) rows.push({ name: spLink(s2.serial, s2.name), css: cssCol(s2.genome.col), v: (t) => affinity(g, t, s2.genome, 0, K) });
    for (let k = 0; k < 4; k++) if (life.matter[k] && MATTER[k]) rows.push({ name: esc(MATTER[k].name), css: MATTER[k].css, v: (t) => affinity(g, t, life.matter[k], 0, K) * K.matterPull });
    const heat = (v) => {
      const a = Math.min(1, Math.abs(v));
      const sign = Math.abs(v) < 0.005 ? '' : v > 0 ? '+' : '−';
      return `<b class="pull ${v >= 0 ? 'to' : 'away'}" style="--a:${(0.08 + 0.5 * a).toFixed(2)}">${sign}${Math.abs(v).toFixed(2)}</b>`;
    };
    const cols = `grid-template-columns: minmax(0, 1fr) repeat(${types.length}, 5.4em)`; // i18n-ignore (CSS)
    // i18n: the table's heads: what a row's cells meet, and a column per cell type ({role} its Greek letter), the picked cell's marked "this cell"
    let t = `<div class="pulls-t" style="${cols}"><span class="pt-h">${tr('spec.pulls.meets', 'Meets')}</span>${types.map((r) => `<span class="pt-h pt-col${cellRole === r ? ' mine' : ''}" style="color:${cssRgb(roleColor(g, r))}"><span>${tr('spec.pulls.col', '{role}-cells', { role: `<span class="greek">${ROLE[r]}</span>` })}</span>${cellRole === r ? `<i>${tr('spec.pulls.this-cell', 'this cell')}</i>` : ''}</span>`).join('')}`;
    for (const it of rows) t += `<span class="pt-name"><i style="background:${it.css}"></i><span>${it.name}</span></span>${types.map((r) => heat(it.v(r))).join('')}`;
    t += `</div><div class="pulls-key"><span><i class="to"></i>${tr('spec.pulls.toward', 'drawn toward')}</span><span><i class="away"></i>${tr('spec.pulls.away', 'pushed away')}</span></div>`;
    h += blk(tr('spec.pulls', 'How its cells react'), t, { tip: 'affinity' });
    return h;
  }

  // A species' thermal niche: its genes, and its performance curve (thermalPerf) from 0 to 45°, the
  // narrow specialist's peak higher, against the background water now (rounded, so it rarely redraws).
  function nicheWords(g) {
    const t = thermalGuild(g);
    // i18n: a species' thermal niche: {words} its preference, breadth and whether it makes heat (warm, narrow); {opt} its best temperature, {tol} its tolerance either side
    return tr('spec.niche', '{words}, {opt}° ± {tol}°', { words: [t.pref, t.breadth, t.maker ? tr('spec.niche.maker', 'heat-maker') : ''].filter(Boolean).join(', '), opt: Math.round(g.topt), tol: Math.round(g.tol) });
  }
  function thermalBlock(g) {
    let h = trait(tr('spec.temp.optimum', 'Optimum'), g.topt, 0, 45, `${g.topt.toFixed(1)}°`, 'optimum');
    h += trait(tr('spec.temp.tolerance', 'Tolerance'), g.tol, 2, 15, `±${g.tol.toFixed(1)}°`, 'tolerance');
    h += trait(tr('spec.temp.heat-output', 'Heat output'), g.thermo || 0, 0, 1, (g.thermo || 0) > 0.005 ? `${Math.round(g.thermo * 100)}% · +${(K.thermoCost * g.thermo).toFixed(3)}/s` : tr('spec.none', 'none'), 'heatmaker');
    const W = 300, H = 60, X = (t) => (t / 45) * W, Y = (v) => H - 4 - (v / 1.45) * (H - 10);
    let d = '';
    for (let t = 0; t <= 45; t += 0.5) d += `${t ? 'L' : 'M'}${X(t).toFixed(1)},${Y(thermalPerf(g, t, K).perf).toFixed(1)}`;
    const water = Math.round(eng.tbg * 2) / 2, live = thermalPerf(g, water, K);
    h += `<svg class="niche" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="${tr('spec.temp.curve.aria', 'How well it works from 0 to 45°')}">`
      + `<line x1="0" x2="${W}" y1="${Y(1)}" y2="${Y(1)}" class="n-one"/>`
      + `<path d="${d}" class="n-curve"/>`
      + `<line x1="${X(water)}" x2="${X(water)}" y1="0" y2="${H}" class="n-water"/><circle cx="${X(water)}" cy="${Y(live.perf)}" r="2.5" class="n-dot"/></svg>`
      // i18n: under the curve: the open water's temperature ({t}) and how well the species works in it ({perf}, a percentage)
      + `<div class="legend-note"><span>0°</span><span>${tr('spec.temp.water', 'open water {t}° · {perf}%', { t: water, perf: Math.round(live.perf * 100) })}</span><span>45°</span></div>`;
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
    setHTML($('spec-kind'), kind);
    setHTML($('spec-name'), nameHtml);
    setHTML($('spec-sub'), sub);
  }
  const CODE_TIP = { sp: 'serial', delta: 'depth', id: 'pid', pop: 'share', died: 'origin' };
  // i18n: the header's short codes, each before a figure: a species' serial number, a particle's id, a species'
  // population, how long ago a cell died (Δ, mutations from its founder, is a symbol)
  const CODE = { sp: tr('spec.code.sp', 'SP'), delta: 'Δ', id: tr('spec.code.id', 'ID'), pop: tr('spec.code.pop', 'Pop'), died: tr('spec.code.died', 'Died') };
  const code = (k, v) => `<span class="term" data-tip="${CODE_TIP[k]}" tabindex="0">${CODE[k]} <b>${v}</b></span>`;

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
      setHead(sp.alive ? (sp.established ? tr('spec.head.thriving', 'Species · thriving') : tr('spec.head.rare', 'Species · rare')) : tr('spec.head.extinct', 'Species · extinct'), esc(sp.name),
        code('sp', fmt(sp.serial)) + code('delta', g.depth) + (sp.alive ? code('pop', fmt(sp.pop)) : ''));
      speciesGlyph(g);
      const hl = api.focusKey() === `sp:${sp.serial}`;
      const card = cardBtn(sp.serial);
      setActs(`sp${sp.alive}${hl}${card.length}`, sp.alive ? `<button type="button" class="btn" data-act="find">${tr('spec.act.find', 'Find one')}</button><button type="button" class="btn" data-act="hl" aria-pressed="${hl}">${tr('spec.act.highlight', 'Highlight')}</button>${card}` : card);
      // i18n: {p} a percentage, to a decimal
      if (sp.alive) v += vital(tr('spec.vital.share', 'Share'), sp.pop / Math.max(1, life.counts[3]), 'sun', tr('spec.vital.share-value', '{p}% of life', { p: ((sp.pop / Math.max(1, life.counts[3])) * 100).toFixed(1) }), 'share');
      setTags(g);
      flow.push(['species', tr('spec.tab.species', 'Species'), speciesTab(g, null)], ['genome', tr('spec.tab.genome', 'Genome'), genomeTab(g, 0)]);
    } else if (sel) {
      root.classList.remove('no-view');
      const p = sel.particle, mem = sel.memory;
      if (p.kind < FIRST_LIFE) {
        const framboid = p.kind === FRAMBOID;
        const m = MATTER[p.kind];
        // a stone is named and drawn as the kind of grain the world draws it as (reef stone keeps a little
        // of its builder's tint)
        const grain = p.kind === 3 ? stoneGrain(p.id, p.info) : null;
        // i18n: the header over matter that was once a cell: {matter} what it is now (Husk)
        setHead(mem ? tr('spec.head.once', 'Now {matter} · once', { matter: m.name }) : m.name, mem && mem.sp ? spLink(mem.sp.serial, mem.sp.name) : grain ? grain.name : m.name,
          // i18n: {dur} a duration (3m 05s)
          sel.lost ? tr('spec.lost', 'Lost track of it') : (mem && sel.diedAt != null ? code('died', tr('spec.code.died-ago', '{dur} ago', { dur: fmtDur(eng.simTime - sel.diedAt) })) : '') + code('id', fmt(p.id)));
        if (grain) {
          // its color (reef stone keeps a little of its builder's tint), dark grains lifted so the emblem reads
          const t = (p.info & 15) !== 0 ? 0.3 : 0, rgb = grain.col.map((x, i) => x + t * (((p.col >>> (8 * i)) & 255) / 255 - x));
          const lift = Math.max(0, 0.45 - (0.3 * rgb[0] + 0.5 * rgb[1] + 0.2 * rgb[2]));
          const c = rgb.map((x) => Math.round(255 * Math.min(1, x + lift)));
          plainGlyph(16 + grain.kind, (0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0);
        } else plainGlyph(MATTER_GLYPH[p.kind][0], MATTER_GLYPH[p.kind][1]);
        const re = api.rideEnded();
        setActs(`m${!!mem}${re}`, mem ? (re ? RIDE_REL : '') + `<button type="button" class="btn" data-act="relative">${tr('spec.act.relative', 'Watch a relative')}</button>` : '');
        // in water at the background temperature (warm water wears husks faster)
        const q10 = (q) => (K.heat ? q ** ((eng.tbg - K.tRef) / 10) : 1);
        // i18n: the vitals of matter: {dur} a duration (3m 05s); {fast} yes when warm water rots a husk fast
        if (p.kind === 2) v += vital(tr('spec.vital.energy-left', 'Energy left'), p.energy / 1.2, 'sun', tr('spec.vital.crumbles', '{fast, select, yes {rotting fast · } other {}}crumbles in {dur}', { fast: q10(K.rotQ10) > 1.3 ? 'yes' : 'no', dur: fmtDur(Math.max(0, (p.energy - K.huskMin) / (K.decay * q10(K.rotQ10)))) }), 'husk');
        else if (framboid) v += vital(tr('spec.vital.fuel', 'Fuel'), clamp(p.energy / K.framboidLife, 0, 1), 'warm', tr('spec.vital.burns-out', 'burns out in about {dur}', { dur: fmtDur(Math.max(0, p.energy / q10(2))) }), 'framboid');
        // i18n: how long until a grain of stone wears to silt: {dur} a duration (3m 05s)
        else if (p.kind === 3) v += vital(tr('spec.vital.wears', 'Wears away'), clamp(p.energy / 600, 0, 1), 'cyan', tr('spec.vital.wears-in', 'in {dur}', { dur: fmtDur(Math.max(0, p.energy)) }), 'stone');
        else v += vital(tr('spec.light-here', 'Light here'), lightAt(p) / 100, 'sun', `${lightAt(p)}%`, 'lighthere');
        setTags(mem ? mem.g : null); // what it was
        let s = `<p class="note">${m.blurb}</p>`;
        // i18n: how long a particle has been what it is: a husk dead, a framboid burning, stone stone, silt silt
        s += kv(p.kind === 2 ? tr('spec.matter.dead-for', 'Dead for') : framboid ? tr('spec.matter.burning-for', 'Burning for') : p.kind === 3 ? tr('spec.matter.stone-for', 'Stone for') : tr('spec.matter.in-state', 'In this state'), fmtDur(p.age));
        if (p.kind === 2) s += kv(tr('spec.matter.cause', 'Cause of death'), CAUSE[p.cause] || tr('spec.matter.cause-unknown', 'unknown'));
        s += kv(tr('spec.light-here', 'Light here'), `${lightAt(p)}%`, 'lighthere');
        flow.push(['state', m.name, blk('', s) + storyHTML(sel)]);
        if (mem) {
          flow.push(['body', tr('spec.tab.body', 'Body'), cellBlock(mem.p, mem.g, true) + organismBlock(mem.org, mem.g, true, sel)]);
          flow.push(['species', tr('spec.tab.species', 'Species'), speciesTab(mem.g, mem.sp)], ['genome', tr('spec.tab.genome', 'Genome'), genomeTab(mem.g, mem.role, mem.role)]);
        }
      } else {
        const g = api.genomeFor(p.kind);
        const life = api.life();
        const sp = g ? life.reg.get(g.serial) : null;
        const o = sel.org;
        const inBody = !!(o && !o.pending && o.cells > 1 && g && (g.adhesion || 0) > K.adhMin);
        const gr = `<span class="greek">${ROLE[p.role]}</span>`;
        // i18n: the header over a living cell: {role} its type's Greek letter; in a body, {n} the body's cells ({partial} yes: at least that many)
        setHead(inBody ? tr('spec.head.cell-of-body', '{role}-cell of a {partial, select, yes {≥ } other {}}{n, number}-cell body', { role: gr, partial: o.partial ? 'yes' : 'no', n: o.cells }) : tr('spec.cell.type.value', '{role}-cell', { role: gr }), sp ? `<span translate="no">${esc(sp.name)}</span>` : tr('spec.head.unnamed', 'Unnamed species'),
          sel.lost ? tr('spec.lost', 'Lost track of it') : (g ? code('sp', fmt(g.serial)) + code('delta', g.depth) : tr('spec.head.sequencing', 'sequencing…')) + code('id', fmt(p.id)));
        if (g) speciesGlyph(g); else plainGlyph(0, p.col);
        setTags(g);
        const hl = sp && api.focusKey() === `sp:${sp.serial}`;
        const ride = api.riding();
        const cardB = sp ? cardBtn(sp.serial) : '';
        // i18n: the cell's actions; a hint ends with its key (Enter)
        const rideB = sel.lost ? (api.rideEnded() ? RIDE_REL : '') : `<button type="button" class="btn" data-act="ride" aria-pressed="${ride}" data-hint="${ride ? tr('spec.act.ride.off-hint', 'Get off · Enter') : tr('spec.act.ride.hint', 'Ride it: the view follows it; WASD, the arrows or a held click steer · Enter')}">${tr('spec.act.ride', 'Ride')}</button>`;
        setActs(`c${sel.lost}${api.rideEnded()}${hl}${!!sp}${ride}${cardB.length}`, `${rideB}${sp && sp.alive ? `<button type="button" class="btn" data-act="hl" aria-pressed="${!!hl}" data-hint="${tr('spec.act.highlight.hint', 'Highlight its species')}">${tr('spec.act.highlight', 'Highlight')}</button>` : ''}${cardB}`);
        if (g) {
          const dv = divEnergy(g, K);
          v += vital(tr('spec.vital.energy', 'Energy'), p.energy / dv, 'sun', `${p.energy.toFixed(2)} / ${dv.toFixed(2)}`, 'energy');
          v += vital(tr('spec.vital.age', 'Age'), p.age / g.lifespan, 'cyan', `${fmtDur(p.age)} / ${fmtDur(g.lifespan)}`, 'lifespan');
          const m = !sel.lost && sel.mind && sel.mind.m;
          if (K.heat && m) {
            v += warmthVital(m, g, `${Math.round(m.warmth)}°`);
          }
          // in the header (a phone's peek) what it is doing leads; in the Behavior section its mode and target say it
          const head = sel.mind && !sel.lost && (sel.mind.head || sel.mind);
          if (!sel.lost && peek()) v = `<div class="vital now"><span>${term('mind', tr('spec.vital.now', 'Now'))}</span><b>${head ? withSp(head.text, head.target) : '—'}</b></div>` + v;
        }
        // the instruments are built once per cell and update in place (mindview.js); the rest flows below
        if (g && !sel.lost) { const rd = api.riding(); fixedKey = `mv:${sel.id}:${p.kind}:${g.serial}:${rd}`; fixedHtml = section('behavior', tr('spec.tab.behavior', 'Behavior'), mv.html(g, p.kind, rd)); }
        // a bonded species' organism first, a free cell's own record first: fixed by the genome, so
        // the order never flips as a trace comes in
        const cb = cellBlock(p, g, false, sel.lost ? null : sel.mind), ob = organismBlock(o, g, false, sel), bb = sel.lost ? '' : budgetBlock(p, g, sel.mind);
        const bonded = g && (g.adhesion || 0) > K.adhMin;
        flow.push(['body', tr('spec.tab.body', 'Body'), (bonded ? ob + cb : cb + ob) + bb + storyHTML(sel)]);
        if (g) flow.push(['species', tr('spec.tab.species', 'Species'), speciesTab(g, null)], ['genome', tr('spec.tab.genome', 'Genome'), genomeTab(g, p.role, p.role)]);
      }
    } else return false;
    setTabs([...(fixedKey ? [['behavior', tr('spec.tab.behavior', 'Behavior')]] : []), ...flow.map(([id, l]) => [id, l])]);
    const flowKey = flow.map(([id]) => id).join(',');
    if (fixedKey !== st.fixedKey || flowKey !== st.flowKey || !body.firstElementChild) {
      // the same cell's panel rebuilt (the watch moved to another cell of its body) keeps its place
      const keep = body.scrollTop;
      // the vitals lead the scroll (in the Behavior section, under the compass, when there is one)
      body.innerHTML = `<div class="spec-fixed">${fixedHtml}</div>${fixedHtml ? '' : '<div class="vitals spec-vit"></div>'}<div class="spec-flow">${flow.map(([id, l]) => section(id, l, '')).join('')}</div>`;
      st.fixedKey = fixedKey; st.flowKey = flowKey; st.flow.clear(); songKey = ''; st.lastVit = '';
      if (fixedKey) { mv.bind(body.firstElementChild); mindUpdate(); }
      restoreTop = keep;
    }
    // each section is replaced only when what it shows changed, so the others keep their hover and selection
    for (const [id, , html] of flow) {
      if (st.flow.get(id) === html) continue;
      const el = sectionEl(id);
      if (!el) continue;
      // a chart that is still shown stays the same canvas, so a pointer on it keeps its place
      const sx = el.querySelector('.sx-b'), kept = [...sx.querySelectorAll('canvas[data-chart]')];
      // (only what changed: a translated page keeps its translation of the rest)
      setHTML(sx, html);
      for (const cv of kept) { const n = sx.querySelector(`canvas[data-chart="${cv.dataset.chart}"]`); if (n && n !== cv) n.replaceWith(cv); }
      st.flow.set(id, html); songKey = '';
    }
    // the vitals: in the header while a phone's sheet only peeks, else at the top of the scroll
    const vitEl = peek() ? vit : body.querySelector('.mv-vitals, .spec-vit');
    if (vitEl !== st.vitEl) { if (st.vitEl) setHTML(st.vitEl, ''); st.vitEl = vitEl; st.lastVit = ''; }
    if (vitEl && v !== st.lastVit) { setHTML(vitEl, v); st.lastVit = v; }
    drawPopChart();
    if (restoreTop != null) { body.scrollTop = restoreTop; restoreTop = null; }
    if (pin && performance.now() < pin.until) { const el = sectionEl(pin.id); if (el) body.scrollTop = Math.max(0, el.offsetTop - 2); mark(pin.id); return true; }
    pin = null;
    spy();
    return true;
  }
  let restoreTop = null;
  // the species' population over the census history, on the Lab charts' axes
  function drawPopChart() {
    const cv = body.querySelector('canvas.popchart');
    const sp = cv && api.life().reg.get(+cv.dataset.chart.slice(4));
    if (sp) drawLines(cv, api.life().history, [{ label: tr('spec.pop.series', 'cells'), col: cssCol(sp.genome.col), get: popOf(sp.serial) }], null);
  }

  function open() {
    if (root.hidden) {
      root.hidden = false;
      tagsEl.dataset.k = ''; // its tags collapse again
      setFull(false, false);
      document.body.classList.add('spec-open');
    }
    st.lastVit = ''; st.actKey = ''; st.tabKey = ''; st.lastHead = ''; st.fixedKey = null; st.flowKey = ''; st.flow.clear(); st.active = '';
    body.scrollTop = 0;
  }
  function close() {
    root.hidden = true;
    setFull(false, false);
    document.body.classList.remove('spec-open');
  }
  // the screen area the panel covers, so following can center the specimen in what is left
  function inset() {
    if (root.hidden || document.body.classList.contains('ui-off')) return { right: 0, bottom: 0 };
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
      // a body: the organism in the world view's orange, the watched cell (centered) in the panel's cell color
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
    g.font = '500 11px Saira, system-ui, sans-serif'; // i18n-ignore (a CSS font)
    g.fillText(fmtLen(um / UM_PER_UNIT), 18 + bar, h - 10); // not upper-cased: µ would become Μ
    g.fillStyle = 'rgba(241,227,160,0.95)';
    g.fillText(fmtClock(eng.simTime), 14, 20);
    g.fillStyle = 'rgba(163,189,190,0.9)';
    if (sel) {
      const [W, H] = eng.grid;
      g.textAlign = 'right';
      const mm = (v, n) => ((((v % n) + n) % n) * UM_PER_UNIT / 1000).toFixed(2);
      // i18n: the close-up's corner: where the cell is in the world, in millimeters (two spaces between X and Y)
      g.fillText(tr('spec.view.xy', 'X {x}  Y {y} MM', { x: mm(sel.disp[0], W), y: mm(sel.disp[1], H) }), w - 14, 20);
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
