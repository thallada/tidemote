// Species cards (docs/next-level-2026-10-20.md §4.5): the unit of sharing. One species on one canvas, laid out
// as a trading card: its portrait (its mini-card's, its cells drawn alone by the engine as a body in the water is,
// src/studio.js), its sigil (its song drawn), its numbers, its body, diet and thermal niche as gauges, and the chronicler's
// latest sentence about it. Saved as a PNG, with a clip of its song as
// a WAV (sound.js songClip). The viewer may give the species a name of their own here; it is kept in
// the registry, so saved worlds keep it, and the log and the panels use it from then on.
//
// cardData is pure (tested); drawCard draws on any 2D context; createCards is the page's dialog.

import { facets, dietMix } from './facets.js';
import { thermalGuild, roleColor, divEnergy } from './genome.js';
import { voiceOf } from './audio/mapping.js';
import { describe as describeSong } from './audio/motif.js';
import { sigilSVG, songSVG, lightSong } from './song.js';
import { fmt, fmtClock, fmtDur, fmtLen, cssCol, cssRgb, saveFile } from './fmt.js';
import { qr } from './qr.js';
import { tr } from './i18n.js';
import { eraName } from './climate.js';

export const CARD_W = 660, CARD_H = 1050; // about a bridge card's shape
export const CARD_SCALE = 2; // drawn (and saved) at twice that, for sharp text
// where a card's portrait is (card units), and how much of the portrait (a square, its subject framed in the middle
// that a mini-card shows: studio.js SHOWN) it shows across, the middle of it
export const PORTRAIT_BOX = { x: 30, y: 118, w: 600, h: 340 };
export const PORTRAIT_SHOWN = 0.78;

// a gauge's share of its range: where v lies between lo and hi (on a log scale if log)
const share = (v, lo, hi, log = false) => Math.max(0, Math.min(1, log ? Math.log(v / lo) / Math.log(hi / lo) : (v - lo) / (hi - lo)));

/** What a card says about a species (sp, a registry record): its numbers, its gauges, and a few words. */
export function cardData(sp, { reg, K, story = null, simTime = 0, founders = 0, relations = null, history = null }) {
  const g = sp.genome, f = facets(g, K), th = thermalGuild(g);
  const lineage = [];
  let a = sp.ancestor && reg.get(sp.ancestor);
  while (a && lineage.length < 4) { lineage.push(a.name); a = a.ancestor && reg.get(a.ancestor); }
  // i18n: where a species came from, under its name on its card ({time}: when, on the world's clock)
  const origin = sp.founder ? (sp.serial > founders ? tr('card.origin.spark', 'sparked from silt at {time}', { time: fmtClock(sp.born || 0) }) : tr('card.origin.founder', 'a founding lineage'))
    : tr('card.origin.unknown', 'an ancestor too rare to be named');
  const swim = g.swim * (1 - g.photo), div = divEnergy(g, K);
  // what it is, in a word or two each: its diet, how it moves, its body
  // i18n: the three chips under a card's portrait (shown in capitals): its diet, how it moves, its body
  const tags = [tr('card.tag.diet', '{diet, select, photosynth {photosynth} grazer {grazer} scavenger {scavenger} predator {predator} other {{diet}}}', { diet: f.diet }),
    tr('card.tag.motion', '{motion, select, schooling {schooling} anchored {anchored} crawler {crawler} swimmer {swimmer} drifter {drifter} other {{motion}}}', { motion: f.schooling ? 'schooling' : f.mobility }),
    tr('card.tag.body', '{body, select, types {{n, plural, one {# cell type} other {# cell types}}} many {many-celled} other {single cells}}', { body: f.body === 'multicellular' ? (f.types > 1 ? 'types' : 'many') : 'single', n: f.types })];
  // its body as gauges against the ranges species take (the archetypes' and sparks')
  const body = [
    [tr('card.body.speed', 'Speed'), share(swim, 0, 2.2), swim < 0.05 ? tr('card.body.speed-still', 'still') : swim.toFixed(2)],
    [tr('card.body.size', 'Size'), share(g.size, 0.4, 1.8), fmtLen(0.17 * g.size)],
    [tr('card.body.lifespan', 'Lifespan'), share(g.lifespan, 40, 480, true), fmtDur(g.lifespan)],
    // i18n: the energy a cell divides at, {e} in the game's energy units (E)
    [tr('card.body.division', 'Division'), 1 - share(div, 1, 8, true), tr('card.body.division-e', '{e} E', { e: div.toFixed(1) })],
  ];
  // what it lives on: the light, and each of grazing (glint), carrion (husks) and hunting (flesh)
  const DIETS = [tr('card.diet.light', 'Light'), tr('card.diet.grazing', 'Grazing'), tr('card.diet.carrion', 'Carrion'), tr('card.diet.hunting', 'Hunting')];
  const diet = dietMix(g).map(([, v], i) => [DIETS[i], v, tr('card.diet.share', '{p}%', { p: Math.round(v * 100) })]);
  const water = K.heat ? { opt: g.topt ?? 19, tol: g.tol ?? 7, maker: !!th.maker, pref: th.pref } : null;
  const food = relations?.food && reg.get(relations.food), eater = relations?.eater && reg.get(relations.eater);
  const end = sp.alive ? simTime : (sp.extinct ?? simTime);
  // its record, as a card's back gives a player's: not how many live this moment, but what it has done
  const stats = [
    [tr('card.stat.peak', 'Peak'), fmt(sp.peak)],
    [sp.alive ? tr('card.stat.age', 'Age') : tr('card.stat.lived', 'Lived'), fmtDur(end - (sp.born || 0))],
    sp.alive ? [tr('card.stat.arose', 'Arose'), fmtClock(sp.born || 0)] : [tr('card.stat.extinct', 'Extinct at'), fmtClock(sp.extinct ?? 0)],
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
    serial: sp.serial, name: sp.name, binomial: sp.binomial || sp.name, given: !!sp.given, genus: sp.genus,
    tags, body, diet, water, stats, series, lineage, origin, depth: g.depth, story: story ? story.text : null,
    eats: food ? food.name : null, eatenBy: eater ? eater.name : null,
    col: cssRgb(roleColor(g, 0)),
  };
}

// the sigil as an image: its page styles, inlined with literal colors
// i18n-ignore-next
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
 * with its numbers alive in the corner, its portrait large with its sigil inset, what it is in three words, its record in big figures over its numbers through its life, its body and its
 * diet as gauges, the water it likes on a thermometer, and at its foot the chronicler's latest word and the QR
 * code that carries it to any world. Every word at least 17 units tall, so it reads at a third of its size.
 * art: { portrait (a square image, or null), sigil (image) }.
 */
export function drawCard(ctx, d, art = {}) {
  const W = CARD_W, H = CARD_H, F = 'Saira, Bahnschrift, "Segoe UI", system-ui, sans-serif'; // i18n-ignore (a font)
  const M = 30, R = W - M, w = R - M;
  const INK = '#e2f1f0', INK2 = '#a3bdbe', INK3 = '#7d999b', LINE = 'rgba(130,205,214,0.22)', TICK = 'rgba(150,222,230,0.55)';
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
  // i18n: under a card's name: {name} is the species it descends from
  const from = d.given ? d.binomial : d.lineage.length ? tr('card.from', 'from {name}', { name: d.lineage[0] }) : d.origin;
  text(from, M, 100, 19, INK2, 400, nameW);

  // the portrait: its box, the middle of it; without one, its sigil large
  const { x: AX, y: AY, w: AW, h: AH } = PORTRAIT_BOX;
  ctx.save();
  ctx.beginPath(); ctx.rect(AX, AY, AW, AH); ctx.clip();
  if (art.portrait) {
    const pw = art.portrait.width, ph = art.portrait.height, sw = pw * PORTRAIT_SHOWN, sh = (sw * AH) / AW;
    ctx.drawImage(art.portrait, (pw - sw) / 2, (ph - sh) / 2, sw, sh, AX, AY, AW, AH);
  } else {
    const gr = ctx.createRadialGradient(AX + AW / 2, AY + AH / 2, 10, AX + AW / 2, AY + AH / 2, AH * 0.8);
    gr.addColorStop(0, 'rgba(127,214,223,0.10)'); gr.addColorStop(1, 'rgba(6,9,10,1)');
    ctx.fillStyle = gr; ctx.fillRect(AX, AY, AW, AH);
    const S = AH * 0.8;
    if (art.sigil) ctx.drawImage(art.sigil, AX + (AW - S) / 2, AY + (AH - S) / 2, S, S);
  }
  // its serial and mutations in the portrait's corner
  ctx.fillStyle = 'rgba(6,9,10,0.72)'; ctx.fillRect(AX, AY + AH - 36, 230, 36);
  // i18n: in a card portrait's corner (in capitals): its species' serial number, and Δ how many mutations from its founder
  label(tr('card.serial', 'SP {serial, number} · Δ{depth}', { serial: d.serial, depth: d.depth }), AX + 14, AY + AH - 12, INK2);
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
  gauges(M, tr('card.body', 'Body'), d.body);
  gauges(M + colW + gap, tr('card.diet', 'Lives on'), d.diet);
  y += 30 + 4 * 36 + 10;

  // the water it likes: a thermometer from ice to 45°, its band and its best
  if (d.water) {
    const T0 = 0, T1 = 45, bx = M + LW, bw = w - LW - 150, X = (t) => bx + ((Math.max(T0, Math.min(T1, t)) - T0) / (T1 - T0)) * bw;
    label(tr('card.water', 'Water'), M, y + 6, INK2);
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, '#2d6fb8'); g.addColorStop(0.45, '#2f8f7c'); g.addColorStop(0.75, '#c08a2e'); g.addColorStop(1, '#c4462e');
    ctx.globalAlpha = 0.3; ctx.fillStyle = g; ctx.fillRect(bx, y - 10, bw, 16); ctx.globalAlpha = 1;
    ctx.fillStyle = g; ctx.fillRect(X(d.water.opt - d.water.tol), y - 10, X(d.water.opt + d.water.tol) - X(d.water.opt - d.water.tol), 16);
    ctx.fillStyle = INK; ctx.fillRect(X(d.water.opt) - 1.5, y - 16, 3, 28);
    // i18n: the water a species likes, in °C: its best and how far from it it thrives; warms: its cells warm the water
    const range = tr('card.water.range', '{opt}° ± {tol}°{maker, select, yes { · warms} other {}}', { opt: Math.round(d.water.opt), tol: Math.round(d.water.tol), maker: d.water.maker ? 'yes' : 'no' });
    ctx.textAlign = 'right'; text(range, R, y + 6, 18, INK, 500, 146); ctx.textAlign = 'left';
    y += 34;
  }

  // the foot: whom it eats and who eats it, the chronicler's latest word on it; its home water; its QR code
  // (without the chronicler's word, its line of descent)
  const Q = 112, fw = w - Q - 24, qx = R - Q, qy = H - 34 - Q, FY = qy - 14;
  ctx.fillStyle = LINE; ctx.fillRect(M, FY, w, 1);
  // i18n: at a card's foot: {eats} the species it eats most, {eater} the one that eats it most
  const ties = tr('card.ties', '{ties, select, both {Eats {eats} · eaten by {eater}} eats {Eats {eats}} eaten {Eaten by {eater}} other {}}',
    { ties: d.eats && d.eatenBy ? 'both' : d.eats ? 'eats' : d.eatenBy ? 'eaten' : 'none', eats: d.eats, eater: d.eatenBy });
  let ly = FY + 32;
  if (ties) { text(ties, M, ly, 18, INK2, 400, fw); ly += 26; }
  ctx.font = `italic 400 18px ${F}`;
  // i18n: the chronicler's latest sentence about a species, quoted on its card
  const line = d.story ? tr('card.story', '“{story}”', { story: d.story })
    // i18n: {line} is a species' line of descent, its ancestors' names joined by arrows
    : d.lineage.length > 1 ? tr('card.descends', 'Descends from {line}', { line: d.lineage.slice(0, 3).join(' ← ') + (d.lineage.length > 3 ? ' ← …' : '') }) : '';
  const lines = line ? wrap(ctx, line, fw) : [], room = ties ? 2 : 3;
  lines.slice(0, room).forEach((l, i) => text(i === room - 1 && lines.length > room ? `${l} …` : l, M, ly + i * 26, 18, d.story ? '#e8dcc0' : INK3, d.story ? 'italic 400' : 400, fw));
  ctx.font = `600 17px ${F}`;
  label(fit(ctx, eraName(d.home), fw - 20), M, H - 36, INK3);
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
 * A card that came from another world by its link alone (cabinet.js: its genome, name and home water): drawn from
 * what its genome says, its home water for its record, on a canvas of its own. card.genome: the genome read from
 * its words; link: the link its QR code holds. Needs no world (nor the GPU): a phone that scanned it sees it at once.
 */
export async function strangerCard(card, link, K) {
  const sp = { serial: 0, name: card.name, binomial: card.name, genome: card.genome, alive: false, founder: true, born: 0, peak: 0, pop: 0, genus: card.name.split(' ')[0], established: true };
  const d = cardData(sp, { reg: new Map(), K });
  Object.assign(d, {
    stats: [[tr('card.stat.home', 'Home water'), eraName(card.home)], [tr('card.stat.genus', 'Genus'), d.genus], [tr('card.stat.mutations', 'Mutations'), String(card.genome.depth)]], lineage: [],
    // i18n: {home} is the name of the world (its era) a card was carried from
    origin: tr('card.origin.carried', 'carried from {home}', { home: eraName(card.home) }),
    home: card.home, qr: qr(new TextEncoder().encode(link)),
  });
  return cardCanvas(d, { sigil: await sigilArt(card.genome), portrait: null });
}

// a genome's sigil as an image, the card's font loaded
async function sigilArt(genome) {
  const sigil = await svgImage(sigilSVG(voiceOf(genome), genome, { size: 240 }));
  if (document.fonts?.load) await document.fonts.load('500 40px Saira').catch(() => {}); // i18n-ignore (a font)
  return sigil;
}
// a card drawn off screen (in memory: drawn by the GPU, its first raster held the GPU, and the world's frames, for
// about 100 ms)
function cardCanvas(d, art) {
  const c = document.createElement('canvas');
  c.width = CARD_W * CARD_SCALE; c.height = CARD_H * CARD_SCALE;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.setTransform(CARD_SCALE, 0, 0, CARD_SCALE, 0, 0);
  drawCard(ctx, d, art);
  return c;
}

/**
 * The card dialog. api: { life(), K, chron, eng, portrait(serial) -> Promise<image|null> (its species' portrait, taken
 *   if it has none yet), portrayed(serial) (whether it has one to hand),
 *   rename(serial, name), songClip(genome) -> Promise<Blob|null>, flash(msg),
 *   carry(serial) -> { home, touched, link } (where it lives, and the link its QR code holds),
 *   saved(serial) -> its card in the cabinet or null, save(serial), load(serial | card) (into the pipette),
 *   remove(card) (from the cabinet), inspectable(serial | card) -> the serial of its species in this world or null,
 *   inspect(serial) (the specimen panel), play(genome, tag, serial | null) (its song alone, its notes tagged tag) }
 */
export function createCards(api) {
  const $ = (id) => document.getElementById(id);
  const root = $('card'), cv = $('card-cv'), nameIn = $('card-name'), note = $('card-note');
  let cur = null, art = {}, drawn = 0;
  const reg = () => api.life().reg;

  // a species' QR code, made once (its link holds its genome, which does not change)
  let qrLink = null, qrCode = null;
  function data(sp) {
    const L = api.life(), c = api.carry(sp.serial);
    if (qrLink !== c.link) { qrLink = c.link; qrCode = qr(new TextEncoder().encode(c.link)); }
    return { ...cardData(sp, { reg: L.reg, K: api.K, story: api.chron.latest(sp.serial), relations: api.chron.relations(sp.serial), history: L.history, simTime: api.eng.simTime, founders: api.eng.founders }),
      home: c.home, qr: qrCode };
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
  const portraitOf = (serial) => api.portrait(serial).catch(() => null);
  /** A species' card drawn off screen, with its portrait: a canvas (to save to the cabinet). */
  async function render(serial) {
    const sp = reg().get(serial);
    if (!sp) return null;
    const [sigil, portrait] = await Promise.all([sigilArt(sp.genome), portraitOf(serial)]);
    return cardCanvas(data(sp), { sigil, portrait });
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
    // (its portrait to hand drawn with it at once; else taken, its sigil standing in until it comes)
    const sigil = await sigilArt(sp.genome), ready = api.portrayed(serial), portrait = ready ? await portraitOf(serial) : null;
    if (cur !== serial) return;
    art = { sigil, portrait };
    redraw();
    acts();
    tune(sp.genome);
    note.textContent = ready ? '' : tr('card.note.portrait', 'Taking its portrait…');
    root.focus({ preventScroll: true });
    if (ready) return;
    const p = await portraitOf(serial);
    if (cur !== serial) return;
    if (p) { art.portrait = p; redraw(); }
    note.textContent = p ? '' : tr('card.note.no-portrait', 'Its portrait could not be taken: its sigil stands in.');
  }
  // its song: the roll (lit as it plays, songTick), what it is, Play and the WAV
  let tag = '', songKey = null;
  function tune(g) {
    const v = voiceOf(g), d = describeSong(v), m = v.motif;
    tag = saved ? `card:${saved.id}` : `sp${cur}`; songKey = null;
    const [instrument, register, tempo] = d.tags;
    // i18n: the song drawn as a roll, its label: its instrument, register and tempo, then its description
    $('card-roll').innerHTML = songSVG(m, { w: 260, h: 60, col: cssCol(g.col), col2: cssRgb(roleColor(g, 1)), label: tr('card.song.label', '{instrument}, {register}, {tempo}: {line}', { instrument, register, tempo, line: d.line }) });
    // i18n: a song's length: {n} notes (two digits), {s} seconds
    $('card-song-read').innerHTML = tr('card.song.read', '<span><b>{n}</b> notes</span><span><b>{s}</b> s</span>', { n: String(m.notes.length).padStart(2, '0'), s: (m.cycle * 0.18).toFixed(1) });
    $('card-play').dataset.hint = tr('card.play.hint', 'Hear it alone: {instrument}, {register}, {tempo}', { instrument, register, tempo });
  }
  function songTick(now, events) {
    if (root.hidden || !tag) return;
    songKey = lightSong($('card-roll'), now, events, (e) => e.slot === tag, songKey);
  }
  // A card from the cabinet: as it was drawn when saved (its PNG), here or in another world.
  let saved = null, savedUrl = null;
  const img = $('card-img');
  function showing(isSaved) {
    cv.hidden = isSaved; img.hidden = !isSaved;
    $('card-name-row').hidden = isSaved;
    if (savedUrl && !isSaved) { URL.revokeObjectURL(savedUrl); savedUrl = null; }
  }
  function openSaved(card) {
    cur = null; saved = card;
    showing(true);
    if (savedUrl) URL.revokeObjectURL(savedUrl);
    savedUrl = URL.createObjectURL(new Blob([card.png], { type: 'image/png' }));
    img.src = savedUrl;
    img.alt = tr('card.img.alt', 'The card of {name}', { name: card.name });
    // i18n: {home}: the name of the world (its era) a saved card came from
    note.textContent = card.world === api.world() ? '' : tr('card.note.carried', 'Carried from {home}', { home: card.home });
    root.hidden = false;
    acts();
    tune(card.genome);
    root.focus({ preventScroll: true });
  }
  // the buttons for what is showing: saved or not, loading the pipette, its species here to inspect
  function acts() {
    const card = saved || (cur != null && api.saved(cur));
    const sv = $('card-save');
    sv.hidden = !!saved;
    sv.disabled = !!card;
    // i18n: the Save button once its card is in the cabinet: {home} the world it was saved in
    sv.textContent = card ? tr('card.saved', 'Saved · {home}', { home: card.home }) : tr('card.save', 'Save to cabinet');
    $('card-remove').hidden = !card;
    $('card-inspect').hidden = api.inspectable(saved || cur) == null;
  }
  function close() {
    if (root.hidden) return;
    root.hidden = true;
    cur = null; saved = null; tag = '';
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
    if (b) saveFile(b, fileName('png')); else api.flash(tr('card.png.failed', 'Could not make the image'));
  });
  $('card-save').addEventListener('click', async () => { if (cur != null) { await api.save(cur); acts(); } });
  $('card-load').addEventListener('click', () => { api.load(saved || cur); close(); });
  // (a saved card shows only what is in the cabinet: out, it goes; a live one stays open, to be saved again)
  $('card-remove').addEventListener('click', async () => {
    const card = saved || (cur != null && api.saved(cur));
    if (!card) return;
    if (saved) close();
    await api.remove(card);
    acts();
  });
  $('card-inspect').addEventListener('click', () => { const s = api.inspectable(saved || cur); if (s != null) { close(); api.inspect(s); } });
  $('card-play').addEventListener('click', () => {
    const g = saved ? saved.genome : reg().get(cur)?.genome;
    if (g) api.play(g, tag, saved ? null : cur);
  });
  $('card-song').addEventListener('click', async () => {
    const sp = saved ? { genome: saved.genome } : reg().get(cur), btn = $('card-song');
    if (!sp) return;
    btn.disabled = true; note.textContent = tr('card.song.rendering', 'Rendering its song…');
    try {
      const b = await api.songClip(sp.genome);
      if (b) { saveFile(b, fileName('wav')); note.textContent = ''; } else note.textContent = tr('card.song.unsupported', 'This browser cannot render sound offline.');
    } catch (e) { note.textContent = tr('card.song.failed', 'Could not render its song: {error}', { error: String(e.message || e).slice(0, 80) }); }
    btn.disabled = false;
  });
  $('card-close').addEventListener('click', close);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
  function reset() { close(); }
  return { open, openSaved, render, close, reset, songTick, refresh: () => { if (!root.hidden) acts(); }, isOpen: () => !root.hidden };
}

