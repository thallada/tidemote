// Species cards (docs/next-level-2026-10-20.md §4.5): the unit of sharing. One species on one canvas:
// its portrait (a close-up of a living member, drawn by the engine as the specimen viewer draws one),
// its sigil and song, its lineage back to its founder or spark, its diet, body plan and thermal niche
// in words, and the chronicler's latest sentence about it. Saved as a PNG, with a clip of its song as
// a WAV (sound.js songClip). The viewer may give the species a name of their own here; it is kept in
// the registry, so saved worlds keep it, and the log and the panels use it from then on.
//
// cardData is pure (tested); drawCard draws on any 2D context; createCards is the page's dialog.

import { describe, facets } from './facets.js';
import { thermalGuild, growPlan, describeGrowth, roleColor, roleShares } from './genome.js';
import { voiceOf } from './audio/mapping.js';
import { describe as describeSong } from './audio/motif.js';
import { songSVG, sigilSVG } from './song.js';
import { fmt, fmtClock, fmtDur, cssRgb, clamp } from './fmt.js';

export const CARD_W = 750, CARD_H = 1050; // a trading card's 5:7
export const CARD_SCALE = 2; // drawn (and saved) at twice that, for sharp text

/** What a card says about a species (sp, a registry record), in words. */
export function cardData(sp, { reg, genera, K, story = null, simTime = 0, era = '', founders = 0, living = 0, relations = null }) {
  const g = sp.genome, f = facets(g, K), th = thermalGuild(g);
  const lineage = [];
  let a = sp.ancestor && reg.get(sp.ancestor);
  while (a && lineage.length < 4) { lineage.push(a.name); a = a.ancestor && reg.get(a.ancestor); }
  const more = !!a;
  const origin = sp.founder ? (sp.serial > founders ? `sparked from silt at ${fmtClock(sp.born || 0)}` : 'a founding lineage') : `arose at ${fmtClock(sp.born || 0)}`;
  const gen = genera?.get(sp.genus);
  const multi = f.body === 'multicellular';
  const plan = multi ? describeGrowth(growPlan(g), g) : null;
  const sh = roleShares(g).filter((v) => v > 0.1).length;
  const facts = [
    ['Diet', f.diet === 'photosynth' ? 'lives on light' : f.diet],
    ['Body', `${multi ? 'many-celled' : 'single cells'}${sh > 1 ? `, ${sh} cell types` : ''}`],
    ['Moves', f.schooling ? `${f.mobility}, schooling` : f.mobility],
    ...(plan ? [['Grows', plan]] : []),
    // whom it eats and who eats it most, as the chronicler counted their meals
    ...(relations?.food && reg.get(relations.food) ? [['Eats', `mostly ${reg.get(relations.food).name}`]] : []),
    ...(relations?.eater && reg.get(relations.eater) ? [['Eaten by', `mostly ${reg.get(relations.eater).name}`]] : []),
    ...(K.heat ? [['Water', `${[th.pref, th.breadth, th.maker ? 'heat-maker' : ''].filter(Boolean).join(', ')}, best near ${Math.round(g.topt ?? 19)}° ± ${Math.round(g.tol ?? 7)}°`]] : []),
  ];
  const status = sp.alive ? `${fmt(sp.pop)} cells${living ? ` · ${((sp.pop / living) * 100).toFixed(sp.pop / living < 0.01 ? 2 : 1)}% of life` : ''}` : `extinct at ${fmtClock(sp.extinct ?? 0)} after ${fmtDur((sp.extinct ?? simTime) - (sp.born || 0))}`;
  return {
    serial: sp.serial, name: sp.name, binomial: sp.binomial || sp.name, given: !!sp.given,
    genus: sp.genus, genusFrom: gen?.from || null, desc: describe(g, K), facts, lineage, more, origin, status,
    peak: sp.peak, alive: sp.alive, depth: g.depth, story: story ? story.text : null, when: `${fmtClock(simTime)}${era ? ` · ${era}` : ''}`,
    col: cssRgb(roleColor(g, 0)), col2: cssRgb(roleColor(g, 1)),
  };
}

// the song roll and the sigil as images: their page styles, inlined with literal colours
const SVG_CSS = `.brk{fill:none;stroke:rgba(150,222,230,.55);stroke-width:1}.tick{fill:none;stroke:rgba(150,222,230,.55);stroke-width:.6}
.on{stroke-width:.8;opacity:.9}.rail{stroke:rgba(130,205,214,.22);stroke-width:.6}.rail.tonic{stroke:rgba(150,222,230,.55);stroke-width:.7}
.bar{stroke:rgba(150,222,230,.55);stroke-dasharray:2 2;stroke-width:.6}.contour{fill:none;stroke-width:.8;opacity:.4}.v2{fill:none;stroke-width:1;opacity:.75}
.ghost{display:none}.chrom{stroke:#f1e3a0;stroke-width:1}.ph{display:none}.bonds line{opacity:.6;stroke-linecap:round}`;
export function svgImage(svg) {
  const src = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/(<svg[^>]*>)/, `$1<style>${SVG_CSS}</style>`);
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
  });
}

// lines of text no wider than w (a word longer than w stands alone)
function wrap(ctx, text, w) {
  const out = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > w && line) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  return out;
}
const fit = (ctx, text, w) => { if (ctx.measureText(text).width <= w) return text; let s = text; while (s.length > 1 && ctx.measureText(`${s}…`).width > w) s = s.slice(0, -1); return `${s.trimEnd()}…`; };

/**
 * Draw a card (cardData's d) at CARD_W × CARD_H on ctx, shaped like a trading card (5:7): its name
 * above, its portrait as the art, then its way of life, song, lineage and story. art: { portrait (a
 * square image or canvas, or null; .subject: its subject's reach as a share of the half-width),
 * sigil (image), song (image) }.
 */
export function drawCard(ctx, d, art = {}) {
  const W = CARD_W, H = CARD_H, F = 'Saira, Bahnschrift, "Segoe UI", system-ui, sans-serif';
  const M = 34, R = W - M, w = R - M;
  ctx.save();
  ctx.fillStyle = '#06090a';
  ctx.fillRect(0, 0, W, H);
  // a hairline border inside the edge, in the species' colour
  ctx.strokeStyle = d.col; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, W - 24, H - 24);
  ctx.globalAlpha = 1;
  // the head: its name, and the sigil beside it
  let y = 56;
  ctx.fillStyle = '#6f8a8c'; ctx.font = `500 14px ${F}`;
  ctx.fillText('TIDEMOTE · SPECIES CARD', M, y);
  ctx.textAlign = 'right'; ctx.fillText(`SP ${fmt(d.serial)} · Δ${d.depth}`, R, y); ctx.textAlign = 'left';
  y += 46;
  const nameW = w - 84;
  ctx.fillStyle = '#e2f1f0'; ctx.font = `500 38px ${F}`;
  let size = 38;
  while (size > 26 && ctx.measureText(d.name).width > nameW) { size -= 2; ctx.font = `500 ${size}px ${F}`; }
  ctx.fillText(fit(ctx, d.name, nameW), M, y);
  ctx.font = `400 16px ${F}`; ctx.fillStyle = '#a3bdbe';
  const sub = d.given ? `${d.binomial} · named by its watcher` : `genus ${d.genus}${d.genusFrom ? `, split from ${d.genusFrom}` : ''}`;
  ctx.fillText(fit(ctx, sub, nameW), M, y + 28);
  if (art.sigil) ctx.drawImage(art.sigil, R - 72, y - 34, 72, 72);
  // what goes under the art, measured first, so the art gives way to a story
  const LW = 86;
  ctx.font = `400 15px ${F}`;
  const lin = d.lineage.length ? `from ${d.lineage.join(' ← ')}${d.more ? ' ← …' : ''}` : d.origin;
  const linLines = wrap(ctx, lin, w - LW).slice(0, 2);
  ctx.font = `italic 400 15px ${F}`;
  const story = d.story ? wrap(ctx, `“${d.story}”`, w) : [];
  const songH = art.song ? (w - LW) * 68 / 420 + 4 : 0;
  const lower = 46 + d.facts.length * 26 + songH + 16 + linLines.length * 20 + (story.length ? 24 + Math.min(5, story.length) * 20 : 0);
  // the art: its portrait, cropped to the box; without one, its sigil large on a dark field
  const AX = M, AY = 162, AW = w, AH = clamp(H - 64 - AY - lower, 280, 540);
  ctx.save();
  ctx.beginPath(); ctx.rect(AX, AY, AW, AH); ctx.clip();
  if (art.portrait) {
    const pw = art.portrait.width, ph = art.portrait.height, k = Math.max(AW / pw, AH / ph);
    const sw = AW / k, sh = AH / k;
    ctx.drawImage(art.portrait, (pw - sw) / 2, (ph - sh) / 2, sw, sh, AX, AY, AW, AH);
    // its subject in the viewer's orange brackets
    const r = Math.min((art.portrait.subject || 0.2) * (pw / 2) * k + 6, AH / 2 - 16), cb = Math.min(14, r / 2.5), ox = AX + AW / 2, oy = AY + AH / 2;
    ctx.strokeStyle = 'rgba(255,95,58,0.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const [x, yy, sx, sy] of [[ox - r, oy - r, 1, 1], [ox + r, oy - r, -1, 1], [ox - r, oy + r, 1, -1], [ox + r, oy + r, -1, -1]]) { ctx.moveTo(x, yy + sy * cb); ctx.lineTo(x, yy); ctx.lineTo(x + sx * cb, yy); }
    ctx.stroke();
  } else {
    const gr = ctx.createRadialGradient(AX + AW / 2, AY + AH / 2, 10, AX + AW / 2, AY + AH / 2, AH * 0.75);
    gr.addColorStop(0, 'rgba(127,214,223,0.10)'); gr.addColorStop(1, 'rgba(6,9,10,1)');
    ctx.fillStyle = gr; ctx.fillRect(AX, AY, AW, AH);
    const S = AH * 0.78;
    if (art.sigil) ctx.drawImage(art.sigil, AX + (AW - S) / 2, AY + (AH - S) / 2, S, S);
  }
  ctx.restore();
  // the box's frame and corner brackets, as the viewer draws them
  ctx.strokeStyle = 'rgba(130,205,214,0.22)'; ctx.lineWidth = 1; ctx.strokeRect(AX + 0.5, AY + 0.5, AW - 1, AH - 1);
  ctx.strokeStyle = 'rgba(150,222,230,0.55)'; ctx.lineWidth = 1.5;
  const c = 18, m = 10;
  ctx.beginPath();
  for (const [x, yy, sx, sy] of [[AX + m, AY + m, 1, 1], [AX + AW - m, AY + m, -1, 1], [AX + m, AY + AH - m, 1, -1], [AX + AW - m, AY + AH - m, -1, -1]]) { ctx.moveTo(x, yy + sy * c); ctx.lineTo(x, yy); ctx.lineTo(x + sx * c, yy); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(226,241,240,0.8)'; ctx.font = `500 13px ${F}`;
  ctx.fillText(art.portrait ? (d.alive ? 'A living member, close up' : 'Last seen, close up') : 'Its sigil: its song drawn as its body', AX + m + 6, AY + AH - m - 8);
  // its colours, under the art
  y = AY + AH + 14;
  ctx.fillStyle = d.col; ctx.fillRect(M, y, 56, 3); ctx.fillStyle = d.col2; ctx.fillRect(M + 60, y, 18, 3);
  y += 32;
  // the facts, as labelled rows
  for (const [k, v] of d.facts) {
    ctx.fillStyle = '#6f8a8c'; ctx.font = `500 13px ${F}`; ctx.fillText(k.toUpperCase(), M, y);
    ctx.fillStyle = '#e2f1f0'; ctx.font = `400 17px ${F}`; ctx.fillText(fit(ctx, v, w - LW), M + LW, y);
    y += 26;
  }
  // its song
  ctx.font = `500 13px ${F}`;
  if (art.song) {
    const sw = w - LW, sh = sw * 68 / 420;
    ctx.fillStyle = '#6f8a8c'; ctx.fillText('SONG', M, y + 14);
    ctx.drawImage(art.song, M + LW, y - 6, sw, sh);
    y += sh + 4;
  }
  // lineage
  ctx.fillStyle = '#6f8a8c'; ctx.fillText('LINEAGE', M, y + 10);
  ctx.fillStyle = '#a3bdbe'; ctx.font = `400 15px ${F}`;
  linLines.forEach((l, i) => ctx.fillText(l, M + LW, y + 10 + i * 20));
  y += 10 + linLines.length * 20 + 6;
  // the chronicler's latest sentence, as much as fits above the footer
  if (story.length) {
    ctx.fillStyle = 'rgba(130,205,214,0.22)'; ctx.fillRect(M, y, w, 1);
    y += 24;
    ctx.fillStyle = '#e8dcc0'; ctx.font = `italic 400 15px ${F}`;
    const lines = story;
    const room = Math.max(0, Math.floor((H - 72 - y) / 20) + 1);
    lines.slice(0, room).forEach((l, i) => ctx.fillText(i === room - 1 && lines.length > room ? fit(ctx, `${l} …`, w) : l, M, y + i * 20));
  }
  // the footer: its numbers and the moment
  ctx.fillStyle = 'rgba(130,205,214,0.22)'; ctx.fillRect(M, H - 62, w, 1);
  ctx.font = `400 14px ${F}`; ctx.fillStyle = '#a3bdbe';
  ctx.fillText(fit(ctx, `${d.status} · peak ${fmt(d.peak)}`, w), M, H - 38);
  ctx.fillStyle = '#6f8a8c';
  ctx.fillText(fit(ctx, d.when, w), M, H - 18 - 2);
  ctx.restore();
}

/**
 * The card dialog. api: { life(), K, chron, climate(), eng, portrait(serial) -> Promise<canvas|null>,
 *   rename(serial, name), songClip(genome) -> Promise<Blob|null>, flash(msg), onClose() }
 */
export function createCards(api) {
  const $ = (id) => document.getElementById(id);
  const root = $('card'), cv = $('card-cv'), nameIn = $('card-name'), note = $('card-note');
  const portraits = new Map(); // serial -> canvas (the last taken; a dead species keeps its last)
  let cur = null, art = {}, drawn = 0;
  const reg = () => api.life().reg;

  function data(sp) {
    const L = api.life();
    return cardData(sp, { reg: L.reg, genera: L.genera, K: api.K, story: api.chron.latest(sp.serial), relations: api.chron.relations(sp.serial), simTime: api.eng.simTime, era: api.climate().name, founders: api.eng.founders, living: L.counts[3] });
  }
  function redraw() {
    const sp = cur && reg().get(cur);
    if (!sp) return;
    const ctx = cv.getContext('2d');
    ctx.setTransform(CARD_SCALE, 0, 0, CARD_SCALE, 0, 0);
    drawCard(ctx, data(sp), art);
    drawn = performance.now();
  }
  async function open(serial) {
    const sp = reg().get(serial);
    if (!sp) return;
    cur = serial;
    root.hidden = false;
    document.body.classList.add('card-open');
    nameIn.value = sp.given ? sp.name : '';
    nameIn.placeholder = sp.binomial || sp.name;
    cv.width = CARD_W * CARD_SCALE; cv.height = CARD_H * CARD_SCALE;
    const v = voiceOf(sp.genome);
    const [sigil, song] = await Promise.all([svgImage(sigilSVG(v, sp.genome, { size: 240 })), svgImage(songSVG(v.motif, { w: 420, h: 68, col: cssRgb(roleColor(sp.genome, 0)), col2: cssRgb(roleColor(sp.genome, 1)) }))]);
    if (cur !== serial) return;
    art = { sigil, song, portrait: portraits.get(serial) || null };
    if (document.fonts?.load) await document.fonts.load('500 40px Saira').catch(() => {});
    redraw();
    note.textContent = sp.alive ? 'Taking its portrait…' : art.portrait ? '' : 'Extinct, and never portrayed: its sigil stands in.';
    root.focus({ preventScroll: true });
    if (sp.alive) {
      const p = await api.portrait(serial).catch(() => null);
      if (cur !== serial) return;
      if (p) { portraits.set(serial, p); if (portraits.size > 48) portraits.delete(portraits.keys().next().value); art.portrait = p; redraw(); }
      note.textContent = p ? '' : 'No member could be found to portray: its sigil stands in.';
    }
    const desc = describeSong(v);
    $('card-song').dataset.hint = `Its song: ${desc.tags.join(', ')}. A short clip, in this world's key`;
  }
  function close() {
    if (root.hidden) return;
    root.hidden = true;
    cur = null;
    document.body.classList.remove('card-open');
    api.onClose?.();
  }
  const fileName = (ext) => {
    const sp = reg().get(cur);
    return `${(sp ? sp.name : 'species').replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}-tidemote.${ext}`;
  };
  const download = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  // the name: given as typed (and kept), cleared back to its binomial
  function rename() {
    const sp = reg().get(cur);
    if (!sp) return;
    const v = nameIn.value.trim().replace(/\s+/g, ' ').slice(0, 48);
    if ((v || '') === (sp.given ? sp.name : '')) return;
    api.rename(cur, v);
    redraw();
  }
  nameIn.addEventListener('change', rename);
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); rename(); nameIn.blur(); } });
  nameIn.addEventListener('input', () => {
    // the card follows the name as it is typed
    const sp = reg().get(cur);
    if (!sp || performance.now() - drawn < 60) return;
    const d = data(sp), v = nameIn.value.trim();
    if (v) { d.name = v; d.given = true; } else { d.name = sp.binomial || sp.name; d.given = false; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(CARD_SCALE, 0, 0, CARD_SCALE, 0, 0);
    drawCard(ctx, d, art);
  });
  $('card-png').addEventListener('click', () => {
    rename();
    cv.toBlob((b) => { if (b) download(b, fileName('png')); else api.flash('Could not make the image'); }, 'image/png');
  });
  $('card-song').addEventListener('click', async () => {
    const sp = reg().get(cur), btn = $('card-song');
    if (!sp) return;
    btn.disabled = true; note.textContent = 'Rendering its song…';
    try {
      const b = await api.songClip(sp.genome);
      if (b) { download(b, fileName('wav')); note.textContent = ''; } else note.textContent = 'This browser cannot render sound offline.';
    } catch (e) { note.textContent = `Could not render its song: ${String(e.message || e).slice(0, 80)}`; }
    btn.disabled = false;
  });
  $('card-close').addEventListener('click', close);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
  // a new world reuses serials: its portraits go
  function reset() { portraits.clear(); close(); }
  return { open, close, reset, isOpen: () => !root.hidden, refresh: () => { if (cur != null && !root.hidden) redraw(); } };
}

