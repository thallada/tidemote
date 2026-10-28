// Species cards (docs/next-level-2026-10-20.md §4.5): the unit of sharing. One species on one canvas, laid out
// as a trading card: its portrait (a close-up of a living member, drawn by the engine as the specimen viewer draws
// one), its sigil (its song drawn), its numbers, its body, diet and thermal niche as gauges, and the chronicler's
// latest sentence about it. Saved as a PNG, with a clip of its song as
// a WAV (sound.js songClip). The viewer may give the species a name of their own here; it is kept in
// the registry, so saved worlds keep it, and the log and the panels use it from then on.
//
// cardData is pure (tested); drawCard draws on any 2D context; createCards is the page's dialog.

import { facets } from './facets.js';
import { thermalGuild, roleColor, divEnergy } from './genome.js';
import { voiceOf } from './audio/mapping.js';
import { describe as describeSong } from './audio/motif.js';
import { sigilSVG } from './song.js';
import { fmt, fmtClock, fmtDur, fmtLen, cssRgb, saveFile } from './fmt.js';
import { qr } from './qr.js';

export const CARD_W = 660, CARD_H = 1050; // about a bridge card's shape
export const CARD_SCALE = 2; // drawn (and saved) at twice that, for sharp text

// a gauge's share of its range: where v lies between lo and hi (on a log scale if log)
const share = (v, lo, hi, log = false) => Math.max(0, Math.min(1, log ? Math.log(v / lo) / Math.log(hi / lo) : (v - lo) / (hi - lo)));

/** What a card says about a species (sp, a registry record): its numbers, its gauges, and a few words. */
export function cardData(sp, { reg, genera, K, story = null, simTime = 0, era = '', founders = 0, relations = null, history = null }) {
  const g = sp.genome, f = facets(g, K), th = thermalGuild(g);
  const lineage = [];
  let a = sp.ancestor && reg.get(sp.ancestor);
  while (a && lineage.length < 4) { lineage.push(a.name); a = a.ancestor && reg.get(a.ancestor); }
  const origin = sp.founder ? (sp.serial > founders ? `sparked from silt at ${fmtClock(sp.born || 0)}` : 'a founding lineage') : 'an ancestor too rare to be named';
  const swim = g.swim * (1 - g.photo), div = divEnergy(g, K);
  // what it is, in a word or two each: its diet, how it moves, its body
  const tags = [f.diet === 'photosynth' ? 'photosynth' : f.diet, f.schooling ? 'schooling' : f.mobility, f.body === 'multicellular' ? `${f.types > 1 ? `${f.types} cell types` : 'many-celled'}` : 'single cells'];
  // its body as gauges against the ranges species take (the archetypes' and sparks')
  const body = [
    ['Speed', share(swim, 0, 2.2), swim < 0.05 ? 'still' : swim.toFixed(2)],
    ['Size', share(g.size, 0.4, 1.8), fmtLen(0.17 * g.size)],
    ['Lifespan', share(g.lifespan, 40, 480, true), fmtDur(g.lifespan)],
    ['Division', 1 - share(div, 1, 8, true), `${div.toFixed(1)} E`],
  ];
  // what it lives on: the light, and each of grazing (glint), carrion (husks) and hunting (flesh)
  const eat = 1 - g.photo, dw = (g.dGlint || 0) + (g.dHusk || 0) + (g.dFlesh || 0) || 1;
  const diet = [['Light', g.photo], ['Grazing', (eat * (g.dGlint || 0)) / dw], ['Carrion', (eat * (g.dHusk || 0)) / dw], ['Hunting', (eat * (g.dFlesh || 0)) / dw]]
    .map(([k, v]) => [k, v, `${Math.round(v * 100)}%`]);
  const water = K.heat ? { opt: g.topt ?? 19, tol: g.tol ?? 7, maker: !!th.maker, pref: th.pref } : null;
  const food = relations?.food && reg.get(relations.food), eater = relations?.eater && reg.get(relations.eater);
  const end = sp.alive ? simTime : (sp.extinct ?? simTime);
  // its record, as a card's back gives a player's: not how many live this moment, but what it has done
  const stats = [
    ['Peak', fmt(sp.peak)],
    [sp.alive ? 'Age' : 'Lived', fmtDur(end - (sp.born || 0))],
    sp.alive ? ['Arose', fmtClock(sp.born || 0)] : ['Extinct at', fmtClock(sp.extinct ?? 0)],
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
    serial: sp.serial, name: sp.name, binomial: sp.binomial || sp.name, given: !!sp.given, genus: sp.genus, kin: genera?.get(sp.genus)?.from || null,
    tags, body, diet, water, stats, series, lineage, origin, alive: sp.alive, depth: g.depth, story: story ? story.text : null,
    eats: food ? food.name : null, eatenBy: eater ? eater.name : null, when: `${fmtClock(simTime)}${era ? ` · ${era}` : ''}`,
    col: cssRgb(roleColor(g, 0)), col2: cssRgb(roleColor(g, 1)),
  };
}

// the sigil as an image: its page styles, inlined with literal colors
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

/**
 * Draw a card (cardData's d) at CARD_W × CARD_H on ctx, shaped and laid out like a trading card: its name banner
 * with its numbers alive in the corner, its portrait large (its own cells lit, the rest dimmed) with its sigil
 * inset, what it is in three words, its record in big figures over its numbers through its life, its body and its
 * diet as gauges, the water it likes on a thermometer, and at its foot the chronicler's latest word and the QR
 * code that carries it to any world. Every word at least 17 units tall, so it reads at a third of its size.
 * art: { portrait (a square image or canvas, or null; .subject: its subject's reach as a share of the half-width),
 * sigil (image) }.
 */
export function drawCard(ctx, d, art = {}) {
  const W = CARD_W, H = CARD_H, F = 'Saira, Bahnschrift, "Segoe UI", system-ui, sans-serif';
  const M = 30, R = W - M, w = R - M;
  const INK = '#e2f1f0', INK2 = '#a3bdbe', INK3 = '#7d999b', LINE = 'rgba(130,205,214,0.22)', TICK = 'rgba(150,222,230,0.55)', SUN = '#f1e3a0';
  const label = (t, x, y, col = INK3, size = 17) => { ctx.fillStyle = col; ctx.font = `600 ${size}px ${F}`; ctx.letterSpacing = '0.08em'; ctx.fillText(t.toUpperCase(), x, y); ctx.letterSpacing = '0px'; };
  const text = (t, x, y, size, col = INK, weight = 400, maxW = Infinity) => { ctx.fillStyle = col; ctx.font = `${weight} ${size}px ${F}`; ctx.fillText(fit(ctx, t, maxW), x, y); };
  ctx.save();
  ctx.fillStyle = '#06090a';
  ctx.fillRect(0, 0, W, H);
  // the frame: a hairline inside the edge in the species' color, bracketed at the corners
  ctx.strokeStyle = d.col; ctx.globalAlpha = 0.45; ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, W - 24, H - 24);
  ctx.globalAlpha = 1; ctx.lineWidth = 3;
  corners(ctx, 12, 12, W - 12, H - 12, 34);

  // the banner: its name, where it comes from; its sigil in the corner, as a card's emblem
  const SG = 90;
  if (art.sigil) ctx.drawImage(art.sigil, R - SG + 6, 18, SG, SG);
  const nameW = w - SG - 16;
  let size = 42;
  ctx.font = `500 ${size}px ${F}`;
  while (size > 26 && ctx.measureText(d.name).width > nameW) { size -= 2; ctx.font = `500 ${size}px ${F}`; }
  text(d.name, M, 74, size, INK, 500, nameW);
  const from = d.given ? d.binomial : d.lineage.length ? `from ${d.lineage[0]}` : d.origin;
  text(from, M, 100, 19, INK2, 400, nameW);

  // the portrait: its box, the species lit and the rest dimmed; without one, its sigil large
  const AX = M, AY = 118, AW = w, AH = 340;
  ctx.save();
  ctx.beginPath(); ctx.rect(AX, AY, AW, AH); ctx.clip();
  if (art.portrait) {
    const pw = art.portrait.width, ph = art.portrait.height, k = Math.max(AW / pw, AH / ph);
    const sw = AW / k, sh = AH / k;
    ctx.drawImage(art.portrait, (pw - sw) / 2, (ph - sh) / 2, sw, sh, AX, AY, AW, AH);
    const r = Math.min((art.portrait.subject || 0.2) * (pw / 2) * k + 6, AH / 2 - 14), ox = AX + AW / 2, oy = AY + AH / 2;
    ctx.strokeStyle = 'rgba(255,95,58,0.9)'; ctx.lineWidth = 1.5;
    corners(ctx, ox - r, oy - r, ox + r, oy + r, Math.min(14, r / 2.5));
  } else {
    const gr = ctx.createRadialGradient(AX + AW / 2, AY + AH / 2, 10, AX + AW / 2, AY + AH / 2, AH * 0.8);
    gr.addColorStop(0, 'rgba(127,214,223,0.10)'); gr.addColorStop(1, 'rgba(6,9,10,1)');
    ctx.fillStyle = gr; ctx.fillRect(AX, AY, AW, AH);
    const S = AH * 0.8;
    if (art.sigil) ctx.drawImage(art.sigil, AX + (AW - S) / 2, AY + (AH - S) / 2, S, S);
  }
  // its serial and mutations in the portrait's corner
  ctx.fillStyle = 'rgba(6,9,10,0.72)'; ctx.fillRect(AX, AY + AH - 36, 230, 36);
  label(`SP ${fmt(d.serial)} · Δ${d.depth}`, AX + 14, AY + AH - 12, INK2);
  ctx.restore();
  ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.strokeRect(AX + 0.5, AY + 0.5, AW - 1, AH - 1);

  // what it is: three chips in its colors
  let y = AY + AH + 16, cx = M;
  ctx.font = `600 18px ${F}`; ctx.letterSpacing = '0.08em';
  d.tags.forEach((t, i) => {
    const s = t.toUpperCase(), tw = ctx.measureText(s).width + 26;
    ctx.fillStyle = i ? 'rgba(130,205,214,0.07)' : d.col; ctx.globalAlpha = i ? 1 : 0.16; ctx.fillRect(cx, y, tw, 34); ctx.globalAlpha = 1;
    ctx.strokeStyle = i ? LINE : d.col; ctx.strokeRect(cx + 0.5, y + 0.5, tw - 1, 33);
    ctx.fillStyle = i ? INK2 : INK; ctx.fillText(s, cx + 13, y + 24);
    cx += tw + 10;
  });
  ctx.letterSpacing = '0px';

  // its record in big figures, and its numbers over its life beneath
  y += 52;
  const st = d.stats, cw = w / st.length;
  st.forEach(([k, v], i) => {
    const x = M + i * cw + (i ? 18 : 0);
    if (i) { ctx.fillStyle = LINE; ctx.fillRect(M + i * cw, y, 1, 64); }
    label(k, x, y + 18);
    text(v, x, y + 56, 32, INK, 400, cw - 24);
  });
  y += 76;
  if (d.series) {
    const sh = 40, t0 = d.series.t[0], t1 = d.series.t[d.series.t.length - 1] || t0 + 1, vmax = Math.max(1, ...d.series.v);
    const X = (t) => M + ((t - t0) / Math.max(1e-6, t1 - t0)) * w, Y = (v) => y + sh - (v / vmax) * (sh - 4);
    ctx.beginPath(); ctx.moveTo(X(t0), y + sh);
    d.series.t.forEach((t, i) => ctx.lineTo(X(t), Y(d.series.v[i])));
    ctx.lineTo(X(t1), y + sh); ctx.closePath();
    ctx.globalAlpha = 0.2; ctx.fillStyle = d.col; ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath();
    d.series.t.forEach((t, i) => (i ? ctx.lineTo(X(t), Y(d.series.v[i])) : ctx.moveTo(X(t), Y(d.series.v[i]))));
    ctx.strokeStyle = d.col; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.fillStyle = LINE; ctx.fillRect(M, y + 40, w, 1);
  y += 66;

  // its body and its diet as gauges: segmented bars, the species' color filling its share
  const gap = 28, colW = (w - gap) / 2, LW = 100, VW = 80;
  const gauges = (x, title, rows) => {
    label(title, x, y, INK2);
    rows.forEach(([k, v, val], i) => {
      const yy = y + 30 + i * 36, bx = x + LW, bw = colW - LW - VW, n = 10, sw = bw / n;
      label(k, x, yy + 6, INK3, 17);
      for (let s = 0; s < n; s++) {
        const on = Math.min(1, Math.max(0, v * n - s));
        ctx.fillStyle = LINE; ctx.fillRect(bx + s * sw, yy - 10, sw - 3, 16);
        if (on > 0) { ctx.fillStyle = d.col; ctx.fillRect(bx + s * sw, yy - 10, (sw - 3) * on, 16); }
      }
      ctx.textAlign = 'right'; text(val, x + colW, yy + 6, 18, INK, 500, VW - 6); ctx.textAlign = 'left';
    });
  };
  gauges(M, 'Body', d.body);
  gauges(M + colW + gap, 'Lives on', d.diet);
  y += 30 + 4 * 36 + 10;

  // the water it likes: a thermometer from ice to 45°, its band and its best
  if (d.water) {
    const T0 = 0, T1 = 45, bx = M + LW, bw = w - LW - 150, X = (t) => bx + ((Math.max(T0, Math.min(T1, t)) - T0) / (T1 - T0)) * bw;
    label('Water', M, y + 6, INK2);
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, '#2d6fb8'); g.addColorStop(0.45, '#2f8f7c'); g.addColorStop(0.75, '#c08a2e'); g.addColorStop(1, '#c4462e');
    ctx.globalAlpha = 0.3; ctx.fillStyle = g; ctx.fillRect(bx, y - 10, bw, 16); ctx.globalAlpha = 1;
    ctx.fillStyle = g; ctx.fillRect(X(d.water.opt - d.water.tol), y - 10, X(d.water.opt + d.water.tol) - X(d.water.opt - d.water.tol), 16);
    ctx.fillStyle = INK; ctx.fillRect(X(d.water.opt) - 1.5, y - 16, 3, 28);
    ctx.textAlign = 'right'; text(`${Math.round(d.water.opt)}° ± ${Math.round(d.water.tol)}°${d.water.maker ? ' · warms' : ''}`, R, y + 6, 18, INK, 500, 146); ctx.textAlign = 'left';
    y += 34;
  }

  // the foot: whom it eats and who eats it, the chronicler's latest word on it; its home water; its QR code
  // (without the chronicler's word, its line of descent)
  const Q = 112, fw = w - Q - 24, qx = R - Q, qy = H - 34 - Q, FY = qy - 14;
  ctx.fillStyle = LINE; ctx.fillRect(M, FY, w, 1);
  const ties = [d.eats ? `eats ${d.eats}` : '', d.eatenBy ? `eaten by ${d.eatenBy}` : ''].filter(Boolean).join(' · ').replace(/^./, (c) => c.toUpperCase());
  let ly = FY + 32;
  if (ties) { text(ties, M, ly, 18, INK2, 400, fw); ly += 26; }
  ctx.font = `italic 400 18px ${F}`;
  const line = d.story ? `“${d.story}”` : d.lineage.length > 1 ? `Descends from ${d.lineage.slice(0, 3).join(' ← ')}${d.lineage.length > 3 ? ' ← …' : ''}` : '';
  const lines = line ? wrap(ctx, line, fw) : [], room = ties ? 2 : 3;
  lines.slice(0, room).forEach((l, i) => text(i === room - 1 && lines.length > room ? `${l} …` : l, M, ly + i * 26, 18, d.story ? '#e8dcc0' : INK3, d.story ? 'italic 400' : 400, fw));
  ctx.font = `600 17px ${F}`;
  label(fit(ctx, [d.home, d.touched ? 'touched' : 'wild', d.bred ? 'bred' : ''].filter(Boolean).join(' · '), fw - 20), M, H - 36, d.touched ? SUN : INK3);
  if (d.qr) {
    // whole device pixels a module (crisp edges read best), a quiet zone of two modules inside the frame
    const k = Math.max(1, Math.floor((Q * CARD_SCALE) / (d.qr.size + 4))) / CARD_SCALE, side = (d.qr.size + 4) * k;
    const ox = Math.round((qx + (Q - side) / 2 + 2 * k) * CARD_SCALE) / CARD_SCALE, oy = Math.round((qy + (Q - side) / 2 + 2 * k) * CARD_SCALE) / CARD_SCALE;
    ctx.fillStyle = '#7fd6df';
    for (let yy = 0; yy < d.qr.size; yy++) for (let xx = 0; xx < d.qr.size; xx++) if (d.qr.at(xx, yy)) ctx.fillRect(ox + xx * k, oy + yy * k, k, k);
    ctx.strokeStyle = TICK; ctx.lineWidth = 1;
    corners(ctx, qx - 2, qy - 2, qx + Q + 2, qy + Q + 2, 9);
  }
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
    return { ...cardData(sp, { reg: L.reg, genera: L.genera, K: api.K, story: api.chron.latest(sp.serial), relations: api.chron.relations(sp.serial), history: L.history, simTime: api.eng.simTime, era: api.climate().name, founders: api.eng.founders }),
      home: c.home, touched: c.touched, bred: c.bred, qr: qrs.get(c.link) };
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
  // its sigil as an image, and the card's font loaded
  async function artOf(sp) {
    const sigil = await svgImage(sigilSVG(voiceOf(sp.genome), sp.genome, { size: 240 }));
    if (document.fonts?.load) await document.fonts.load('500 40px Saira').catch(() => {});
    return { sigil, portrait: portraits.get(sp.serial) || null };
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
      stats: [['Home water', card.home], ['Genus', d.genus], ['Mutations', String(g.depth)]], lineage: [], origin: `carried from ${card.home}`, when: card.home,
      home: card.home, touched: card.touched, bred: card.bred, qr: qr(new TextEncoder().encode(link)),
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

