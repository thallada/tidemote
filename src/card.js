// Species cards (docs/next-level-2026-10-20.md §4.5): the unit of sharing. One species on one canvas:
// its portrait (a close-up of a living member, drawn by the engine as the specimen viewer draws one),
// its sigil and song, its lineage back to its founder or spark, its diet, body plan and thermal niche
// in words, and the chronicler's latest sentence about it. Saved as a PNG, with a clip of its song as
// a WAV (sound.js songClip). The viewer may give the species a name of their own here; it is kept in
// the registry, so saved worlds keep it, and the log and the panels use it from then on.
//
// cardData is pure (tested); drawCard draws on any 2D context; createCards is the page's dialog.

import { describe, facets } from './facets.js';
import { thermalGuild, growPlan, describeGrowth, roleColor, roleShares, divEnergy } from './genome.js';
import { voiceOf } from './audio/mapping.js';
import { describe as describeSong } from './audio/motif.js';
import { songSVG, sigilSVG } from './song.js';
import { fmt, fmtClock, fmtDur, fmtLen, cssRgb, saveFile } from './fmt.js';
import { qr } from './qr.js';
import { G_WORDS } from './shaders.js';

export const CARD_W = 660, CARD_H = 1050; // about a bridge card's shape
export const CARD_SCALE = 2; // drawn (and saved) at twice that, for sharp text

/** What a card says about a species (sp, a registry record), in words. */
export function cardData(sp, { reg, genera, K, story = null, simTime = 0, era = '', founders = 0, living = 0, relations = null, history = null }) {
  const g = sp.genome, f = facets(g, K), th = thermalGuild(g);
  const lineage = [];
  let a = sp.ancestor && reg.get(sp.ancestor);
  while (a && lineage.length < 4) { lineage.push(a.name); a = a.ancestor && reg.get(a.ancestor); }
  const more = !!a;
  const origin = sp.founder ? (sp.serial > founders ? `sparked from silt at ${fmtClock(sp.born || 0)}` : 'a founding lineage') : 'an ancestor too rare to be named';
  const gen = genera?.get(sp.genus);
  const multi = f.body === 'multicellular';
  const plan = multi ? describeGrowth(growPlan(g), g) : null;
  const sh = roleShares(g).filter((v) => v > 0.1).length;
  const facts = [
    ['Diet', `${f.diet === 'photosynth' ? 'lives on light' : f.diet}${g.photo > 0.25 && g.photo <= 0.55 ? ', part photosynth' : ''}`],
    ['Body', `${multi ? 'many-celled' : 'single cells'}${sh > 1 ? `, ${sh} cell types` : ''}`],
    ['Moves', [f.mobility, f.schooling ? 'schooling' : '', K.phototaxis > 0 && Math.abs(g.phototaxis || 0) > 0.2 ? (g.phototaxis > 0 ? 'seeks light' : 'shuns light') : ''].filter(Boolean).join(', ')],
    ...(plan ? [['Grows', plan]] : []),
    // whom it eats and who eats it most, as the chronicler counted their meals
    ...(relations?.food && reg.get(relations.food) ? [['Eats', `mostly ${reg.get(relations.food).name}`]] : []),
    ...(relations?.eater && reg.get(relations.eater) ? [['Eaten by', `mostly ${reg.get(relations.eater).name}`]] : []),
    ...(K.heat ? [['Water', `${[th.pref, th.breadth, th.maker ? 'heat-maker' : ''].filter(Boolean).join(', ')}, best near ${Math.round(g.topt ?? 19)}° ± ${Math.round(g.tol ?? 7)}°`]] : []),
    ['Swims', g.swim * (1 - g.photo) < 0.05 ? 'not at all' : `${(g.swim * (1 - g.photo)).toFixed(2)}${g.align > 0.5 ? ', in schools' : ''}`],
  ];
  // its record, as the specimen panel's Species section keeps it
  const kids = [...reg.values()].filter((o) => o.ancestor === sp.serial && o.established).sort((x, y) => (y.alive - x.alive) || y.peak - x.peak);
  const record = [
    ['Arose', `${fmtClock(sp.born || 0)} · ${sp.founder ? (sp.serial > founders ? 'sparked from silt' : 'a founder') : 'a mutant'}`],
    ['Genus', `${sp.genus}${gen?.from ? `, from ${gen.from}` : ''}`],
    ['Mutations', `${g.depth} from its founder`],
    ['Offspring', kids.length ? `${kids.length} species, ${kids[0].name}${kids.length > 1 ? '…' : ''}` : 'none established'],
    ['Cell size', fmtLen(0.17 * g.size)],
    ['Lifespan', fmtDur(g.lifespan)],
    ['Divides at', `${divEnergy(g, K).toFixed(2)} energy, ${Math.round(g.share * 100)}% to the child`],
  ];
  const end = sp.alive ? simTime : (sp.extinct ?? simTime);
  const stats = [
    sp.alive ? ['Population', fmt(sp.pop)] : ['Extinct at', fmtClock(sp.extinct ?? 0)],
    sp.alive ? ['Share of life', living ? `${((sp.pop / living) * 100).toFixed(sp.pop / living < 0.01 ? 2 : 1)}%` : '–'] : ['Lived', fmtDur(end - (sp.born || 0))],
    ['Peak', fmt(sp.peak)],
    [sp.alive ? 'Age' : 'Thriving', sp.alive ? fmtDur(end - (sp.born || 0)) : sp.established ? 'yes' : 'never'],
  ];
  // its numbers over its life: from the census history (evenly spaced, unlike the lineage view's record, which
  // keeps its older points ever more sparsely), else that record
  let series = null;
  if (history && history.length) {
    const t0 = sp.born || 0, t1 = sp.alive ? Infinity : (sp.extinct ?? Infinity);
    const pts = history.filter((h) => h.t >= t0 && h.t <= t1).map((h) => [h.t, (h.sp.find((x) => x[0] === sp.serial) || [0, 0])[1]]);
    if (pts.length > 1) series = { t: pts.map((x) => x[0]), v: pts.map((x) => x[1]) };
  }
  if (!series && sp.series && sp.series.t && sp.series.t.length > 1) series = { t: Array.from(sp.series.t), v: Array.from(sp.series.v) };
  // ending at its count now, as the strip above it says
  if (series && sp.alive && simTime > series.t[series.t.length - 1]) { series.t.push(simTime); series.v.push(sp.pop); }
  return {
    serial: sp.serial, name: sp.name, binomial: sp.binomial || sp.name, given: !!sp.given,
    desc: describe(g, K), facts, record, stats, series, lineage, more, origin, alive: sp.alive, depth: g.depth, story: story ? story.text : null, when: `${fmtClock(simTime)}${era ? ` · ${era}` : ''}`,
    col: cssRgb(roleColor(g, 0)), col2: cssRgb(roleColor(g, 1)),
  };
}

// the song roll and the sigil as images: their page styles, inlined with literal colors
const SVG_CSS = `.brk{fill:none;stroke:rgba(150,222,230,.55);stroke-width:1}.tick{fill:none;stroke:rgba(150,222,230,.55);stroke-width:.6}
.on{stroke-width:.8;opacity:.9}.rail{stroke:rgba(130,205,214,.22);stroke-width:.6}.rail.tonic{stroke:rgba(150,222,230,.55);stroke-width:.7}
.bar{stroke:rgba(150,222,230,.55);stroke-dasharray:2 2;stroke-width:.6}.contour{fill:none;stroke-width:.8;opacity:.4}.v2{fill:none;stroke-width:1;opacity:.75}
.ghost{display:none}.chrom{stroke:#f1e3a0;stroke-width:1}.ph{display:none}.bonds line{opacity:.6;stroke-linecap:round}`;
function svgImage(svg) {
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
// an L at each corner of the box x0..x1 × y0..y1, arm long
function corners(ctx, x0, y0, x1, y1, arm) {
  ctx.beginPath();
  for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) { ctx.moveTo(x, y + sy * arm); ctx.lineTo(x, y); ctx.lineTo(x + sx * arm, y); }
  ctx.stroke();
}
const fit = (ctx, text, w) => { if (ctx.measureText(text).width <= w) return text; let s = text; while (s.length > 1 && ctx.measureText(`${s}…`).width > w) s = s.slice(0, -1); return `${s.trimEnd()}…`; };

const FOOT = 140; // the footer's height: its home water, its genome, its QR code
/**
 * Draw a card (cardData's d) at CARD_W × CARD_H on ctx, shaped like a trading card (5:7) and laid out like
 * a baseball card: its name, its portrait (its own cells lit, the rest dimmed), a strip of its numbers and
 * its population over its life, then how it lives and its record in two columns, its song, its line of
 * descent and the chronicler's latest word on it. art: { portrait (a square image or canvas, or null;
 * .subject: its subject's reach as a share of the half-width), sigil (image), song (image, 680 × 60) }.
 */
export function drawCard(ctx, d, art = {}) {
  const W = CARD_W, H = CARD_H, F = 'Saira, Bahnschrift, "Segoe UI", system-ui, sans-serif';
  const M = 26, R = W - M, w = R - M;
  const INK = '#e2f1f0', INK2 = '#a3bdbe', INK3 = '#6f8a8c', LINE = 'rgba(130,205,214,0.22)';
  const rule = (y) => { ctx.fillStyle = LINE; ctx.fillRect(M, y, w, 1); };
  const label = (t, x, y) => { ctx.fillStyle = INK3; ctx.font = `500 11px ${F}`; ctx.fillText(t.toUpperCase(), x, y); };
  ctx.save();
  ctx.fillStyle = '#06090a';
  ctx.fillRect(0, 0, W, H);
  // a border inside the edge, in the species' color
  ctx.strokeStyle = d.col; ctx.globalAlpha = 0.55; ctx.lineWidth = 2;
  ctx.strokeRect(11, 11, W - 22, H - 22);
  ctx.globalAlpha = 1;

  // the head: its name, and the sigil beside it
  label('Tidemote · species card', M, 44);
  ctx.textAlign = 'right'; ctx.fillText(`SP ${fmt(d.serial)} · Δ${d.depth}`, R, 44); ctx.textAlign = 'left';
  const nameW = w - 76;
  let size = 36;
  ctx.font = `500 ${size}px ${F}`;
  while (size > 24 && ctx.measureText(d.name).width > nameW) { size -= 2; ctx.font = `500 ${size}px ${F}`; }
  ctx.fillStyle = INK; ctx.fillText(fit(ctx, d.name, nameW), M, 84);
  ctx.font = `400 15px ${F}`; ctx.fillStyle = INK2;
  const sub = d.given ? `${d.binomial} · named by its watcher` : d.desc;
  ctx.fillText(fit(ctx, sub, nameW), M, 108);
  if (art.sigil) ctx.drawImage(art.sigil, R - 66, 52, 66, 66);

  // what goes under the portrait, measured first: the portrait takes what room is left (within bounds)
  const gap = 22, colW = (w - gap) / 2, LW = 70;
  ctx.font = `400 14px ${F}`;
  const colH = (rows) => 26 + rows.reduce((h, [, v]) => h + 6 + Math.min(2, wrap(ctx, v, colW - LW).length) * 17, 0);
  const linText = d.lineage.length ? `${d.lineage.join(' ← ')}${d.more ? ' ← …' : ''}` : d.origin;
  const linN = Math.min(2, wrap(ctx, linText, w - 110).length);
  ctx.font = `italic 400 14px ${F}`;
  const storyN = d.story ? Math.min(4, wrap(ctx, `“${d.story}”`, w).length) : 0;
  const lower = 26 + 60 + (d.series ? 94 : 26) + Math.max(colH(d.facts), colH(d.record)) + 4
    + (art.song ? (w - 50) * 60 / 680 + 6 : 0) + 16 + linN * 18 + (storyN ? 22 + storyN * 18 : 0);
  // the portrait: cropped to its box, the species lit and the rest dimmed; without one, its sigil large
  const AX = M, AY = 126, AW = w, AH = Math.max(220, Math.min(380, H - FOOT - 14 - AY - lower));
  ctx.save();
  ctx.beginPath(); ctx.rect(AX, AY, AW, AH); ctx.clip();
  if (art.portrait) {
    const pw = art.portrait.width, ph = art.portrait.height, k = Math.max(AW / pw, AH / ph);
    const sw = AW / k, sh = AH / k;
    ctx.drawImage(art.portrait, (pw - sw) / 2, (ph - sh) / 2, sw, sh, AX, AY, AW, AH);
    // brackets around its subject
    const r = Math.min((art.portrait.subject || 0.2) * (pw / 2) * k + 6, AH / 2 - 14), ox = AX + AW / 2, oy = AY + AH / 2;
    ctx.strokeStyle = 'rgba(255,95,58,0.9)'; ctx.lineWidth = 1.5;
    corners(ctx, ox - r, oy - r, ox + r, oy + r, Math.min(12, r / 2.5));
  } else {
    const gr = ctx.createRadialGradient(AX + AW / 2, AY + AH / 2, 10, AX + AW / 2, AY + AH / 2, AH * 0.8);
    gr.addColorStop(0, 'rgba(127,214,223,0.10)'); gr.addColorStop(1, 'rgba(6,9,10,1)');
    ctx.fillStyle = gr; ctx.fillRect(AX, AY, AW, AH);
    const S = AH * 0.8;
    if (art.sigil) ctx.drawImage(art.sigil, AX + (AW - S) / 2, AY + (AH - S) / 2, S, S);
  }
  ctx.restore();
  ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.strokeRect(AX + 0.5, AY + 0.5, AW - 1, AH - 1);
  ctx.strokeStyle = 'rgba(150,222,230,0.55)'; ctx.lineWidth = 1.5;
  const m = 8;
  corners(ctx, AX + m, AY + m, AX + AW - m, AY + AH - m, 14);
  ctx.fillStyle = 'rgba(226,241,240,0.8)'; ctx.font = `500 12px ${F}`;
  ctx.fillText(art.portrait ? (d.alive ? 'A living member, its kind lit' : 'Last seen, close up') : 'Its sigil: its song drawn as its body', AX + m + 6, AY + AH - m - 6);

  // the numbers: a strip of four, as on the back of a baseball card
  let y = AY + AH + 12;
  ctx.fillStyle = d.col; ctx.fillRect(M, y, 56, 3); ctx.fillStyle = d.col2; ctx.fillRect(M + 60, y, 18, 3);
  y += 14;
  const cw = w / 4;
  d.stats.forEach(([k, v], i) => {
    const x = M + i * cw;
    if (i) { ctx.fillStyle = LINE; ctx.fillRect(x, y, 1, 48); }
    label(k, x + (i ? 12 : 0), y + 14);
    ctx.fillStyle = INK; ctx.font = `400 22px ${F}`;
    ctx.fillText(fit(ctx, v, cw - 16), x + (i ? 12 : 0), y + 44);
  });
  y += 60;
  // its population over its life
  if (d.series) {
    const sx = M, sw = w, sh = 44, t0 = d.series.t[0], t1 = d.series.t[d.series.t.length - 1] || t0 + 1;
    const vmax = Math.max(1, ...d.series.v);
    const X = (t) => sx + ((t - t0) / Math.max(1e-6, t1 - t0)) * sw, Y = (v) => y + sh - (v / vmax) * (sh - 4);
    ctx.beginPath(); ctx.moveTo(X(t0), y + sh);
    d.series.t.forEach((t, i) => ctx.lineTo(X(t), Y(d.series.v[i])));
    ctx.lineTo(X(t1), y + sh); ctx.closePath();
    ctx.globalAlpha = 0.18; ctx.fillStyle = d.col; ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath();
    d.series.t.forEach((t, i) => (i ? ctx.lineTo(X(t), Y(d.series.v[i])) : ctx.moveTo(X(t), Y(d.series.v[i]))));
    ctx.strokeStyle = d.col; ctx.lineWidth = 1.5; ctx.stroke();
    rule(y + sh);
    ctx.font = `400 11px ${F}`; ctx.fillStyle = INK3;
    ctx.fillText(fmtClock(t0), sx, y + sh + 14);
    ctx.textAlign = 'right'; ctx.fillText(fmtClock(t1), sx + sw, y + sh + 14); ctx.textAlign = 'center';
    ctx.fillText('ITS NUMBERS OVER ITS LIFE', sx + sw / 2, y + sh + 14); ctx.textAlign = 'left';
    y += sh + 50;
  } else { rule(y); y += 26; }

  // two columns: how it lives, and its record
  const column = (x, title, rows, y0) => {
    let yy = y0;
    ctx.fillStyle = INK2; ctx.font = `500 12px ${F}`; ctx.fillText(title.toUpperCase(), x, yy);
    ctx.fillStyle = LINE; ctx.fillRect(x, yy + 7, colW, 1);
    yy += 26;
    for (const [k, v] of rows) {
      label(k, x, yy);
      ctx.fillStyle = INK; ctx.font = `400 14px ${F}`;
      const all = wrap(ctx, v, colW - LW), lines = all.slice(0, 2);
      lines.forEach((l, i) => ctx.fillText(i === 1 && all.length > 2 ? fit(ctx, `${l} …`, colW - LW) : l, x + LW, yy + i * 17));
      yy += 6 + lines.length * 17;
    }
    return yy;
  };
  const yl = column(M, 'How it lives', d.facts, y);
  const yr = column(M + colW + gap, 'Its record', d.record, y);
  y = Math.max(yl, yr) + 4;

  // its song, across the card
  if (art.song) {
    label('Song', M, y + 12);
    ctx.drawImage(art.song, M + 50, y, w - 50, (w - 50) * 60 / 680);
    y += (w - 50) * 60 / 680 + 6;
  }
  // its line of descent
  label('Descends from', M, y + 12);
  ctx.fillStyle = INK2; ctx.font = `400 14px ${F}`;
  const linLines = wrap(ctx, linText, w - 110).slice(0, 2);
  linLines.forEach((l, i) => ctx.fillText(l, M + 110, y + 12 + i * 18));
  y += 12 + linLines.length * 18 + 4;
  // the chronicler's latest word on it, as much as fits above the footer
  if (d.story) {
    rule(y); y += 22;
    ctx.fillStyle = '#e8dcc0'; ctx.font = `italic 400 14px ${F}`;
    const lines = wrap(ctx, `“${d.story}”`, w);
    const room = Math.max(0, Math.floor((H - FOOT - 12 - y) / 18) + 1);
    lines.slice(0, room).forEach((l, i) => ctx.fillText(i === room - 1 && lines.length > room ? fit(ctx, `${l} …`, w) : l, M, y + i * 18));
  }
  // the footer: its home water and whether its world was touched, its genome, the moment it was drawn; and in the
  // corner its QR code, a link that carries it to any world (cabinet.js), light on dark in a bracketed frame
  rule(H - FOOT);
  const Q = 112, qx = R - Q, qy = H - FOOT + 8;
  if (d.qr) {
    // whole device pixels a module (crisp edges read best), a quiet zone of two modules inside the frame
    const k = Math.max(1, Math.floor((Q * CARD_SCALE) / (d.qr.size + 4))) / CARD_SCALE, side = (d.qr.size + 4) * k;
    const ox = Math.round((qx + (Q - side) / 2 + 2 * k) * CARD_SCALE) / CARD_SCALE, oy = Math.round((qy + (Q - side) / 2 + 2 * k) * CARD_SCALE) / CARD_SCALE;
    ctx.fillStyle = '#7fd6df';
    for (let yy = 0; yy < d.qr.size; yy++) for (let xx = 0; xx < d.qr.size; xx++) if (d.qr.at(xx, yy)) ctx.fillRect(ox + xx * k, oy + yy * k, k, k);
    ctx.strokeStyle = 'rgba(150,222,230,0.55)'; ctx.lineWidth = 1;
    corners(ctx, qx - 2, qy - 2, qx + Q + 2, qy + Q + 2, 9);
  }
  const fw = w - (d.qr ? Q + 24 : 0);
  label(fit(ctx, [d.home, d.touched ? 'touched' : 'wild', d.bred ? 'bred' : ''].filter(Boolean).join(' · '), fw), M, H - FOOT + 26);
  ctx.font = `400 13px ${F}`; ctx.fillStyle = INK3;
  ctx.fillText(fit(ctx, `Drawn at ${d.when}`, fw), M, H - FOOT + 50);
  ctx.fillText(fit(ctx, `Genome TM·G1 · ${d.words} words`, fw), M, H - FOOT + 70);
  ctx.fillStyle = d.touched ? '#f1e3a0' : INK3;
  ctx.fillText(d.touched ? 'From a touched world' : 'tidemote.com', M, H - FOOT + 90);
  ctx.restore();
}

/**
 * The card dialog. api: { life(), K, chron, climate(), eng, portrait(serial) -> Promise<canvas|null>,
 *   rename(serial, name), songClip(genome) -> Promise<Blob|null>, flash(msg),
 *   carry(serial) -> { home, touched, bred, link } (where it lives, and the link its QR code holds),
 *   saved(serial) -> its card in the cabinet or null, save(serial), load(serial | card) (into the pipette),
 *   remove(card) (from the cabinet) }
 */
export function createCards(api) {
  const $ = (id) => document.getElementById(id);
  const root = $('card'), cv = $('card-cv'), nameIn = $('card-name'), note = $('card-note');
  const portraits = new Map(); // serial -> canvas (the last taken; a dead species keeps its last)
  let cur = null, art = {}, drawn = 0;
  const reg = () => api.life().reg;

  // a species' QR code, made once (its link holds its genome, which does not change)
  const qrs = new Map();
  function data(sp) {
    const L = api.life(), c = api.carry(sp.serial);
    if (!qrs.has(c.link)) { qrs.clear(); qrs.set(c.link, qr(new TextEncoder().encode(c.link))); }
    return { ...cardData(sp, { reg: L.reg, genera: L.genera, K: api.K, story: api.chron.latest(sp.serial), relations: api.chron.relations(sp.serial), history: L.history, simTime: api.eng.simTime, era: api.climate().name, founders: api.eng.founders, living: L.counts[3] }),
      home: c.home, touched: c.touched, bred: c.bred, words: G_WORDS, qr: qrs.get(c.link) };
  }
  function paint(d) {
    const ctx = cv.getContext('2d');
    ctx.setTransform(CARD_SCALE, 0, 0, CARD_SCALE, 0, 0);
    drawCard(ctx, d, art);
    drawn = performance.now();
  }
  function redraw() {
    const sp = cur && reg().get(cur);
    if (sp) paint(data(sp));
  }
  // its sigil and song as images, and the card's font loaded
  async function artOf(sp) {
    const v = voiceOf(sp.genome);
    const [sigil, song] = await Promise.all([svgImage(sigilSVG(v, sp.genome, { size: 240 })), svgImage(songSVG(v.motif, { w: 680, h: 60, col: cssRgb(roleColor(sp.genome, 0)), col2: cssRgb(roleColor(sp.genome, 1)) }))]);
    if (document.fonts?.load) await document.fonts.load('500 40px Saira').catch(() => {});
    return { sigil, song, portrait: portraits.get(sp.serial) || null };
  }
  /** A species' card drawn off screen, its portrait taken if it lives: a canvas (to save to the cabinet). */
  async function render(serial) {
    const sp = reg().get(serial);
    if (!sp) return null;
    const a = await artOf(sp);
    if (sp.alive && !a.portrait) { const p = await api.portrait(serial).catch(() => null); if (p) { portraits.set(serial, p); a.portrait = p; } }
    const c = document.createElement('canvas');
    c.width = CARD_W * CARD_SCALE; c.height = CARD_H * CARD_SCALE;
    const ctx = c.getContext('2d');
    ctx.setTransform(CARD_SCALE, 0, 0, CARD_SCALE, 0, 0);
    drawCard(ctx, data(sp), a);
    return c;
  }
  /**
   * A card that came from another world by its link alone (cabinet.js: its genome, name and home water): drawn
   * from what its genome says, its home water for its record. card.genome: the genome read from its words.
   */
  async function renderStranger(card, link) {
    const sp = { serial: 0, name: card.name, binomial: card.name, genome: card.genome, alive: false, founder: true, born: 0, peak: 0, pop: 0, genus: card.name.split(' ')[0], established: true };
    const d = cardData(sp, { reg: new Map(), K: api.K });
    const g = card.genome;
    Object.assign(d, {
      stats: [['Home water', card.home], ['Cell size', fmtLen(0.17 * g.size)], ['Lifespan', fmtDur(g.lifespan)], ['Mutations', String(g.depth)]],
      record: d.record.filter(([k]) => ['Cell size', 'Lifespan', 'Divides at'].includes(k)), origin: `carried from ${card.home}`, when: card.home,
      home: card.home, touched: card.touched, bred: card.bred, words: G_WORDS, qr: qr(new TextEncoder().encode(link)),
    });
    const a = await artOf(sp);
    const c = document.createElement('canvas');
    c.width = CARD_W * CARD_SCALE; c.height = CARD_H * CARD_SCALE;
    const ctx = c.getContext('2d');
    ctx.setTransform(CARD_SCALE, 0, 0, CARD_SCALE, 0, 0);
    drawCard(ctx, d, a);
    return c;
  }
  async function open(serial) {
    const sp = reg().get(serial);
    if (!sp) return;
    cur = serial; saved = null;
    showing(false);
    root.hidden = false;
    nameIn.value = sp.given ? sp.name : '';
    nameIn.placeholder = sp.binomial || sp.name;
    cv.width = CARD_W * CARD_SCALE; cv.height = CARD_H * CARD_SCALE;
    const a = await artOf(sp);
    if (cur !== serial) return;
    art = a;
    redraw();
    acts();
    const v = voiceOf(sp.genome);
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
  // A card from the cabinet: as it was drawn when saved (its PNG), here or in another world.
  let saved = null, savedUrl = null;
  const img = $('card-img');
  function showing(isSaved) {
    cv.hidden = isSaved; img.hidden = !isSaved;
    $('card-name-row').hidden = isSaved;
    $('card-remove').hidden = !isSaved;
    if (savedUrl && !isSaved) { URL.revokeObjectURL(savedUrl); savedUrl = null; }
  }
  function openSaved(card) {
    cur = null; saved = card;
    showing(true);
    if (savedUrl) URL.revokeObjectURL(savedUrl);
    savedUrl = URL.createObjectURL(new Blob([card.png], { type: 'image/png' }));
    img.src = savedUrl;
    img.alt = `The card of ${card.name}`;
    note.textContent = card.world === api.world() ? '' : `Carried from ${card.home}`;
    root.hidden = false;
    acts();
    root.focus({ preventScroll: true });
  }
  // the buttons for what is showing: saved or not, loading the pipette
  function acts() {
    const card = saved || (cur != null && api.saved(cur));
    const sv = $('card-save');
    sv.hidden = !!saved;
    sv.disabled = !!card;
    sv.textContent = card ? `Saved · ${card.home}` : 'Save to cabinet';
  }
  function close() {
    if (root.hidden) return;
    root.hidden = true;
    cur = null; saved = null;
  }
  const fileName = (ext) => {
    const name = saved ? saved.name : reg().get(cur)?.name || 'species';
    return `${name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}-tidemote.${ext}`;
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
    if (v) { d.name = v; d.given = true; } else { d.name = d.binomial; d.given = false; }
    paint(d);
  });
  $('card-png').addEventListener('click', async () => {
    if (saved) { saveFile(new Blob([saved.png], { type: 'image/png' }), fileName('png')); return; }
    rename();
    const b = await api.png(cv, cur);
    if (b) saveFile(b, fileName('png')); else api.flash('Could not make the image');
  });
  $('card-save').addEventListener('click', async () => { if (cur != null) { await api.save(cur, cv); acts(); } });
  $('card-load').addEventListener('click', () => { api.load(saved || cur); close(); });
  $('card-remove').addEventListener('click', () => { if (saved) { api.remove(saved); close(); } });
  $('card-song').addEventListener('click', async () => {
    const sp = saved ? { genome: saved.genome } : reg().get(cur), btn = $('card-song');
    if (!sp) return;
    btn.disabled = true; note.textContent = 'Rendering its song…';
    try {
      const b = await api.songClip(sp.genome);
      if (b) { saveFile(b, fileName('wav')); note.textContent = ''; } else note.textContent = 'This browser cannot render sound offline.';
    } catch (e) { note.textContent = `Could not render its song: ${String(e.message || e).slice(0, 80)}`; }
    btn.disabled = false;
  });
  $('card-close').addEventListener('click', close);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
  // a new world reuses serials: its portraits go
  function reset() { portraits.clear(); close(); }
  return { open, openSaved, render, renderStranger, close, reset, refresh: () => { if (!root.hidden) acts(); }, isOpen: () => !root.hidden };
}

