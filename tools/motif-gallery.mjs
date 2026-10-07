// A gallery of species songs, side by side: founders of every archetype, lineages of mutants
// (each drawn over its parent, what changed outlined), sweeps of one trait at a time, and
// optionally the old generator's line for comparison. Writes an HTML page with each motif's
// piano roll, sigil, description and a recording of it played alone, and prints how alike the
// songs are.
// usage: node tools/motif-gallery.mjs --out gallery [--seed 5] [--per 4] [--chains 6] [--depth 6]
//   [--legacy] [--no-audio]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { archetypeGenome, ARCHETYPE_TYPES, finalizeGenome, mutateLike, roleColor } from '../src/genome.js';
import { voiceOf, archOf } from '../src/audio/mapping.js';
import { describe, compareMotifs, motifDistance, contourWord } from '../src/audio/motif.js';
import { songSVG, sigilSVG } from '../src/song.js';
import { Engine } from '../src/audio/voices.js';
import { Conductor } from '../src/audio/conductor.js';
import { BS } from '../src/audio/ugens.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);
const OUT = arg('out', 'gallery'), SEED = Number(arg('seed', 5)), PER = Number(arg('per', 4));
const CHAINS = Number(arg('chains', 6)), DEPTH = Number(arg('depth', 6));
const LEGACY = flag('legacy'), AUDIO = !flag('no-audio');
fs.mkdirSync(OUT, { recursive: true });

let s = SEED >>> 0;
const rng = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
const css = (rgb) => `rgb(${rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)).join(',')})`;
const colOf = (g) => css(roleColor(g, 0)), col2Of = (g) => css(roleColor(g, 1));
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ── the old generator (before motif.js), for comparison ──────────────────────
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fract = (x) => x - Math.floor(x);
const pick = (arr, u) => arr[Math.min(arr.length - 1, Math.floor(clamp(u, 0, 0.9999) * arr.length))];
const LEGACY_MATS = { reef: ['glass', 'glass', 'swell'], plankton: ['swell', 'swell', 'glass'], filament: ['breath'], grazer: ['cplx', 'cplx', 'tine'], crawler: ['tine', 'cplx'], hunter: ['bite', 'wood', 'wood'], scavenger: ['drop', 'drop', 'tick'] };
function legacyWalk(surf, rec, len) {
  let d = clamp(Math.round((rec[0] + 1) * 2.5), 0, 5);
  const out = [];
  for (let i = 0; i < len; i++) { out.push(d); const x = surf[i % 8]; d = clamp(d + Math.round(x * 2.4) + (Math.abs(x) > 0.92 ? Math.sign(x) * 2 : 0), -3, 10); }
  return out;
}
function legacyVoice(g) {
  const v = voiceOf(g), arch = archOf(g), a = g.roles[0];
  const len = 3 + Math.round(((a.rec[1] + 1) / 2) * 5);
  let rate;
  switch (arch) {
    case 'grazer': rate = g.swim >= 1.1 ? 1 : g.swim >= 0.8 ? 1.5 : 2; break;
    case 'crawler': rate = g.swim >= 0.8 ? 1.5 : g.swim >= 0.5 ? 2 : 3; break;
    case 'hunter': rate = g.force > 11 ? 3 : g.force > 9.5 ? 4 : 6; break;
    case 'reef': rate = g.lifespan > 360 ? 12 : 8; break;
    case 'plankton': rate = g.swim > 0.1 ? 4 : 6; break;
    case 'filament': rate = (g.adhesion || 0) > 0.5 ? 8 : 6; break;
    default: rate = 1;
  }
  const CH = [[0, 2, 4], [0, 4, 7], [0, 2, 7], [0, 4, 9]];
  const seq = arch === 'reef' ? pick(CH, (a.rec[2] + 1) / 2) : legacyWalk(a.surf, a.rec, len);
  const notes = seq.map((deg, k) => ({ deg, at: k * rate, dur: rate, acc: 1, leg: 1 }));
  const motif = { notes, cycle: seq.length * rate, voice2: null, unit: rate, swing: 0, rubato: 0, sync: 1, seq, dev: {}, rate };
  return { ...v, mat: pick(LEGACY_MATS[arch], g.hue), motif, seq };
}

// ── rendering a motif alone ──────────────────────────────────────────────────
const SR = 48000;
function render(v, file) {
  const eng = new Engine(SR, { seed: 7 }), c = new Conductor(eng, { seed: 7 });
  c.bar = () => {}; // no sea, drone or score: the voice alone
  eng.set(c.sea, { amp: 0 });
  c.world = { light: 0.7, tide: 0.5 };
  const end = c.field.phrase(v, 0.25, { amp: 0.2, times: 2 });
  const n = Math.ceil(((end + 2.5) * SR) / BS), L = new Float32Array(n * BS), R = new Float32Array(n * BS);
  const bl = new Float32Array(BS), br = new Float32Array(BS);
  for (let b = 0; b < n; b++) { c.render(bl, br); L.set(bl, b * BS); R.set(br, b * BS); }
  const pcm = Buffer.alloc(L.length * 8);
  for (let i = 0; i < L.length; i++) { pcm.writeFloatLE(L[i], i * 8); pcm.writeFloatLE(R[i], i * 8 + 4); }
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', 'pipe:0', '-b:a', '128k', file], { input: pcm });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
}

// ── the species ──────────────────────────────────────────────────────────────
const traits = (g) => {
  const t = [];
  if (g.photo > 0.4) t.push(`light ${Math.round(g.photo * 100)}%`);
  const sw = g.swim * (1 - g.photo); if (sw > 0.2) t.push(`swims ${sw.toFixed(1)}`);
  if (g.dFlesh > 0.4) t.push(`flesh ${Math.round(g.dFlesh * 100)}%`);
  if (g.dHusk > 0.4) t.push(`husk ${Math.round(g.dHusk * 100)}%`);
  if (g.advect > 0.6) t.push(`drifts ${Math.round(g.advect * 100)}%`);
  if (g.align > 0.5) t.push(`schools ${Math.round(g.align * 100)}%`);
  if ((g.adhesion || 0) > 0.15) t.push('bonded');
  t.push(`lives ${Math.round(g.lifespan)} s`);
  return t.join(' · ');
};
let nAudio = 0;
function card(g, { title, parent = null } = {}) {
  const v = voiceOf(g), d = describe(v), id = `s${nAudio++}`;
  const pv = parent ? voiceOf(parent) : null;
  const diff = pv ? compareMotifs(pv.motif, v.motif) : null;
  let audio = '';
  if (AUDIO) {
    render(v, path.join(OUT, `${id}.mp3`));
    audio += `<audio controls preload="none" src="${id}.mp3"></audio>`;
    if (LEGACY) { render(legacyVoice(g), path.join(OUT, `${id}-old.mp3`)); audio += `<div class="old"><span>old</span><audio controls preload="none" src="${id}-old.mp3"></audio></div>`; }
  }
  return { v, html: `<article class="card">
  <header>${sigilSVG(v, g, { size: 30 })}<div><h3>${esc(title || v.arch)}</h3><p class="tr">${esc(traits(g))}</p></div></header>
  ${songSVG(v.motif, { col: colOf(g), col2: col2Of(g), ghost: pv ? pv.motif : null })}
  <p class="tags">${d.tags.map(esc).join(' · ')}</p><p class="line">${esc(d.line)}</p>
  ${diff ? `<p class="diff">${diff.length ? esc(diff.join(', ')) : 'sounds the same as its parent'}</p>` : ''}
  ${audio}</article>` };
}

const founders = [], foundersHTML = [];
for (const t of ARCHETYPE_TYPES) {
  for (let i = 0; i < PER; i++) {
    const g = finalizeGenome(archetypeGenome(t, rng));
    const c = card(g, { title: `${t} → plays as ${archOf(g)}` });
    founders.push({ g, v: c.v, t }); foundersHTML.push(c.html);
  }
}

const chainsHTML = [], pc = [];
for (let k = 0; k < CHAINS; k++) {
  let g = finalizeGenome(archetypeGenome(ARCHETYPE_TYPES[k % ARCHETYPE_TYPES.length], rng));
  g.serial = 1;
  const row = [card(g, { title: `founder (${ARCHETYPE_TYPES[k % ARCHETYPE_TYPES.length]})` }).html];
  for (let d = 1; d <= DEPTH; d++) {
    const h = mutateLike(g, rng);
    pc.push([voiceOf(g).motif, voiceOf(h).motif]);
    row.push(card(h, { title: `mutation ${d}`, parent: g }).html);
    g = h;
  }
  chainsHTML.push(`<div class="chain">${row.join('')}</div>`);
}

// one trait at a time, from a middling genome: the vibe mapping
const SWEEPS = [
  ['swimming', 'grazer', (g, x) => { g.swim = x * 2.2; }],
  ['hunting', 'grazer', (g, x) => { g.dFlesh = x; g.dGlint = 1 - x; }],
  ['light', 'grazer', (g, x) => { g.photo = x; g.swim *= 1 - x; }],
  ['drifting', 'scavenger', (g, x) => { g.advect = x; g.swim = 0.5 * (1 - x); }],
  ['schooling', 'grazer', (g, x) => { g.align = x; }],
];
const sweepHTML = [];
for (const [name, base, set] of SWEEPS) {
  const g0 = archetypeGenome(base, rng), row = [];
  for (const x of [0, 0.33, 0.66, 1]) {
    const g = structuredClone(g0); set(g, x); finalizeGenome(g);
    row.push(card(g, { title: `${name} ${Math.round(x * 100)}%` }).html);
  }
  sweepHTML.push(`<h3 class="sweep">${esc(name)}</h3><div class="chain">${row.join('')}</div>`);
}

// ── how alike ────────────────────────────────────────────────────────────────
function stats(list) {
  let sum = 0, n = 0; const nn = list.map(() => Infinity);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const d = motifDistance(list[i], list[j]); sum += d; n++;
    nn[i] = Math.min(nn[i], d); nn[j] = Math.min(nn[j], d);
  }
  return { mean: sum / n, nearest: nn.reduce((a, b) => a + b, 0) / nn.length };
}
const newS = stats(founders.map((f) => f.v.motif)), oldS = stats(founders.map((f) => legacyVoice(f.g).motif));
const within = (get) => { let sum = 0, n = 0; for (const t of ARCHETYPE_TYPES) { const st = stats(founders.filter((f) => f.t === t).map((f) => get(f))); sum += st.mean; n++; } return sum / n; };
const newW = within((f) => f.v.motif), oldW = within((f) => legacyVoice(f.g).motif);
const same = pc.filter(([a, b]) => motifDistance(a, b) < 1e-9).length / pc.length;
const pcMean = pc.reduce((acc, [a, b]) => acc + motifDistance(a, b), 0) / pc.length;
const words = new Map(); for (const f of founders) { const w = contourWord(f.v.motif.seq); words.set(w, (words.get(w) || 0) + 1); }
const summary = [
  `founders: mean distance ${newS.mean.toFixed(2)} (old ${oldS.mean.toFixed(2)}), to the nearest other ${newS.nearest.toFixed(2)} (old ${oldS.nearest.toFixed(2)})`,
  `within an archetype: ${newW.toFixed(2)} (old ${oldW.toFixed(2)})`,
  `parent → child: ${Math.round(same * 100)}% sound the same, mean distance ${pcMean.toFixed(2)} (random pairs ${newS.mean.toFixed(2)})`,
  `contours: ${[...words].sort((a, b) => b[1] - a[1]).map(([w, k]) => `${w} ${k}`).join(', ')}`,
];
console.log(summary.join('\n'));

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Species Songs</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Saira:wdth,wght@100..125,300..600&display=swap" rel="stylesheet">
<style>
:root{--bg:#06090a;--panel:#070b0c;--line:rgba(130,205,214,.22);--line-2:rgba(150,222,230,.55);--ink:#e2f1f0;--ink-2:#a3bdbe;--ink-3:#6f8a8c;--cyan:#7fd6df;--hot:#ff5f3a;--sun:#f1e3a0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:400 13px/1.45 Saira,system-ui,sans-serif;padding:24px 16px 64px}
.lede{color:var(--ink-2);max-width:68ch;margin:0 0 10px}h1{font-weight:300;font-stretch:125%;letter-spacing:.06em;text-transform:uppercase;font-size:20px;margin:0 0 6px}
h2{font-weight:500;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--cyan);border-bottom:1px solid var(--line);padding-bottom:6px;margin:32px 0 12px}
h3{margin:0;font-weight:500;font-size:12px;letter-spacing:.06em;text-transform:uppercase}
h3.sweep{color:var(--ink-2);margin:18px 0 8px}
.sum{color:var(--ink-2);margin:0;padding-left:18px}.sum li{margin:2px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
.chain{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px}.chain .card{flex:0 0 320px}
.card{border:1px solid var(--line);background:var(--panel);padding:10px 10px 8px}
.card header{display:flex;gap:10px;align-items:center;margin-bottom:6px}.tr{margin:0;color:var(--ink-3);font-size:11px}
.tags{margin:6px 0 0;color:var(--sun);font-size:11px;letter-spacing:.08em;text-transform:uppercase}.line{margin:2px 0 6px;color:var(--ink-2)}
.diff{margin:0 0 6px;color:var(--hot);font-size:12px}
audio{width:100%;height:32px}.old{display:flex;align-items:center;gap:6px}.old span{color:var(--ink-3);font-size:11px;text-transform:uppercase;letter-spacing:.1em}
svg.song-roll{width:100%;height:auto;display:block}
.song-roll .rail{stroke:var(--line);stroke-width:.6}.song-roll .rail.tonic{stroke:var(--line-2)}
.song-roll .bar{stroke:var(--line-2);stroke-dasharray:2 2;stroke-width:.6}
.song-roll .contour{fill:none;stroke-width:.8;opacity:.45}
.song-roll .v2{fill:none;stroke-width:1;opacity:.75}
.song-roll .ghost{fill:none;stroke:var(--ink-3);stroke-dasharray:2 1.5;stroke-width:.8}
.song-roll .changed{stroke:var(--hot);stroke-width:1.2}
.song-roll .chrom{stroke:var(--sun);stroke-width:1}
.song-roll .ph{display:none}.song-roll .brk{fill:none;stroke:var(--line-2)}.song-roll .tick{fill:none;stroke:var(--line-2);stroke-width:.6}.song-roll .on{stroke-width:.8;opacity:.9}
.sigil .bonds line{opacity:.6;stroke-linecap:round}.sigil .cell{filter:drop-shadow(0 0 1px currentColor)}
</style></head><body>
<h1>Species songs</h1><p class="lede">Each card is one species. The piano roll shows its motif (rows are scale degrees, the ticks below are sixteenth-note steps). The player plays it alone${LEGACY ? '; the one marked OLD plays the previous generator on the same genome' : ''}. Lineage rows show each mutant over its parent: dashed notes are the parent's, orange outlines are notes that moved.</p>
<ul class="sum">${summary.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
<h2>Founders, by archetype</h2><div class="grid">${foundersHTML.join('')}</div>
<h2>Lineages: each mutant over its parent</h2>${chainsHTML.join('')}
<h2>One trait at a time</h2>${sweepHTML.join('')}
</body></html>`;
fs.writeFileSync(path.join(OUT, 'index.html'), page);
console.log(`wrote ${path.join(OUT, 'index.html')} (${nAudio} species${AUDIO ? ', with recordings' : ''})`);
