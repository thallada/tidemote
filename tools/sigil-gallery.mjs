// Species beside their sigils: species of every archetype (and a few morphs and free-living
// hunters), each with its portrait from a trial world (as the sim draws it), its genome, its
// song, and its sigil (src/song.js) at the Lab list's size, the specimen panel's and close up,
// to check that a sigil looks like the organism.
// usage: node tools/sigil-gallery.mjs --out sigils [--seed 5] [--n 8192] [--seconds 30] [--no-portraits]
import fs from 'node:fs';
import path from 'node:path';
import { archetypeGenome, ARCHETYPE_TYPES, finalizeGenome, roleShares, roleColor, cellShape, CELL_SHAPES, dietGuild, mobilityGuild } from '../src/genome.js';
import { voiceOf } from '../src/audio/mapping.js';
import { describe } from '../src/audio/motif.js';
import { songSVG, sigilSVG } from '../src/song.js';
import { DEFAULT_K } from '../src/shaders.js';
import { portraits } from './species-portraits.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out', 'sigils'), SEED = Number(arg('seed', 5));
fs.mkdirSync(OUT, { recursive: true });
let s = SEED >>> 0;
const rng = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const css = (c) => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(',')})`;

// 21 founders, three of each archetype, and three that stretch the drawing: a free-living
// grazer with two cell types (a morph), a bonded grazer with three, a free-living hunter
const species = [];
for (const t of ARCHETYPE_TYPES) for (let i = 0; i < 3; i++) species.push({ title: t, g: archetypeGenome(t, rng) });
{
  const g = archetypeGenome('grazer', rng); g.dev = [[0.45, 0.55, 0], [0.6, 0.4, 0], [1, 0, 0]]; g.adhesion = 0; species.push({ title: 'grazer morph (two free cell types)', g: finalizeGenome(g) });
  const h = archetypeGenome('grazer', rng); h.dev = [[0.4, 0.35, 0.25], [0.4, 0.35, 0.25], [0.4, 0.35, 0.25]]; h.adhesion = 0.7; species.push({ title: 'bonded grazer, three cell types', g: finalizeGenome(h) });
  const k = archetypeGenome('hunter', rng); k.adhesion = 0; species.push({ title: 'free-living hunter', g: finalizeGenome(k) });
}
species.forEach((sp, i) => { sp.g.serial = i + 1; });

let shots = [];
if (!process.argv.includes('--no-portraits')) {
  const t0 = Date.now();
  shots = await portraits(species.map((sp) => sp.g), { n: Number(arg('n', 8192)), seconds: Number(arg('seconds', 30)), seed: SEED });
  shots.forEach((r, i) => (r.pngs || []).forEach((png, v) => fs.writeFileSync(path.join(OUT, `p${i}-${v}.png`), png)));
  console.log(`portraits: ${shots.filter((r) => r.pngs).length} of ${shots.length} alive after the trial (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

const ROLE = ['α', 'β', 'γ'];
const pct = (x) => `${Math.round(x * 100)}%`;
function genomeTable(g) {
  const sh = roleShares(g), bonded = (g.adhesion || 0) > DEFAULT_K.adhMin;
  const rows = [
    ['Lives as', `${dietGuild(g)} · ${mobilityGuild(g)} · plays as ${voiceOf(g).arch}`],
    ['Diet', `light ${pct(g.photo)} · glint ${pct(g.dGlint)} · husk ${pct(g.dHusk)} · flesh ${pct(g.dFlesh)}`],
    ['Body', `${bonded ? `bonds (adhesion ${pct(g.adhesion)})` : `free cells (adhesion ${pct(g.adhesion || 0)})`} · size ${g.size.toFixed(2)}`],
    ['Cell types', sh.map((v, r) => (v > 0.02 ? `<span class="sw" style="background:${css(roleColor(g, r))}"></span>${ROLE[r]} ${pct(v)} ${CELL_SHAPES[cellShape(g, r)]}` : '')).filter(Boolean).join(' · ')],
    ['Moves', `swims ${(g.swim * (1 - g.photo)).toFixed(2)} · schools ${pct(g.align)} · current ${pct(g.advect)} · thrust ${g.force.toFixed(1)}`],
    ['Life', `lifespan ${Math.round(g.lifespan)} s · mutation ${(g.mutRate * 100).toFixed(1)}%`],
  ];
  return `<dl class="gt">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

const cards = species.map((sp, i) => {
  const g = sp.g, v = voiceOf(g), d = describe(v), shot = shots[i];
  const portrait = shot && shot.pngs ? `<img src="p${i}-0.png" width="160" height="160" alt="${esc(sp.title)} in the sim, close up"><img src="p${i}-1.png" width="160" height="160" alt="${esc(sp.title)} in the sim, its surroundings"><small>above: 1.4 cells across · below: 4 cells across</small>`
    : `<div class="none">${shots.length ? 'died out in the trial world' : 'no portrait'}</div>`;
  const variants = [['Lab list', 22], ['panel', 56], ['close up', 112]].map(([n, size]) => [n, sigilSVG(v, g, { size })]);
  return `<article class="sp">
  <div class="por">${portrait}</div>
  <div class="info"><h3>${esc(sp.title)}</h3>${genomeTable(g)}
    <p class="tags">${d.tags.map(esc).join(' · ')}</p><p class="line">${esc(d.line)}</p>
    <div class="roll">${songSVG(v.motif, { w: 300, h: 56, col: css(roleColor(g, 0)), col2: css(roleColor(g, 1)) })}</div></div>
  <div class="vars">${variants.map(([n, svg]) => `<figure><figcaption>${n}</figcaption>${svg}</figure>`).join('')}</div>
</article>`;
});

// every species at list size, one row per variant, as they would sit in the Lab's species list
const strip = `<div class="strip"><span>list size</span><div>${species.map((sp) => sigilSVG(voiceOf(sp.g), sp.g, { size: 22 })).join('')}</div></div>`;

const page = `<title>Sigil Studies</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Saira:wdth,wght@100..125,300..600&display=swap" rel="stylesheet">
<style>
:root{color-scheme:dark;--bg:#06090a;--panel:#070b0c;--line:rgba(130,205,214,.22);--line-2:rgba(150,222,230,.55);--ink:#e2f1f0;--ink-2:#a3bdbe;--ink-3:#6f8a8c;--cyan:#7fd6df;--hot:#ff5f3a;--sun:#f1e3a0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:400 13px/1.45 Saira,system-ui,sans-serif;padding-block:24px 64px;padding-inline:16px}
h1{font-weight:300;font-stretch:125%;letter-spacing:.06em;text-transform:uppercase;font-size:20px;margin:0 0 6px}
h2{font-weight:500;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--cyan);border-bottom:1px solid var(--line);padding-bottom:6px;margin:28px 0 12px}
h3{margin:0 0 6px;font-weight:500;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
.lede{color:var(--ink-2);max-width:72ch;margin:0 0 6px}.lede b{color:var(--ink);font-weight:500}
.strip{display:grid;grid-template-columns:5.5em 1fr;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)}
.strip span{color:var(--sun);font-size:11px;letter-spacing:.12em;text-transform:uppercase}.strip div{display:flex;flex-wrap:wrap;gap:8px}
.sp{display:grid;grid-template-columns:160px minmax(0,1fr);gap:14px;border:1px solid var(--line);background:var(--panel);padding:12px;margin-bottom:12px}
.por{display:flex;flex-direction:column;gap:6px}.por img{display:block;max-width:100%;height:auto;border:1px solid var(--line)}.por small{color:var(--ink-3);font-size:10.5px}.none{width:160px;height:160px;display:grid;place-items:center;color:var(--ink-3);border:1px dashed var(--line);text-align:center;padding:10px}
.gt{display:grid;grid-template-columns:6.5em minmax(0,1fr);gap:2px 10px;margin:0;font-size:12px}.gt dt{color:var(--ink-3)}.gt dd{margin:0;color:var(--ink-2)}
.sw{display:inline-block;width:8px;height:8px;margin-right:4px;vertical-align:0}
.tags{margin:8px 0 0;color:var(--sun);font-size:11px;letter-spacing:.08em;text-transform:uppercase}.line{margin:2px 0 6px;color:var(--ink-2);max-width:70ch}
.roll{max-width:300px}
.vars{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:10px;border-top:1px solid var(--line);padding-top:10px}
figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px;border:1px solid var(--line);min-width:112px}
figcaption{color:var(--sun);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase}
svg.song-roll{width:100%;height:auto;display:block}
.song-roll .rail{stroke:var(--line);stroke-width:.6}.song-roll .rail.tonic{stroke:var(--line-2)}.song-roll .bar,.song-roll .ph{display:none}
.song-roll .contour{fill:none;stroke-width:.8;opacity:.45}.song-roll .v2{fill:none;stroke-width:1;opacity:.75}.song-roll .chrom{stroke:var(--sun)}
.song-roll .brk{fill:none;stroke:var(--line-2)}.song-roll .tick{fill:none;stroke:var(--line-2);stroke-width:.6}.song-roll .on{stroke-width:.8;opacity:.9}
.sigil .ring{fill:none;stroke:var(--line)}.sigil .rtick{fill:none;stroke:var(--line-2);stroke-width:.6}.sigil .wind{fill:none;stroke-width:1.1;opacity:.8}
.sigil .bonds line{opacity:.6;stroke-linecap:round}.sigil .cell{filter:drop-shadow(0 0 1px currentColor)}
@media (max-width:560px){.sp{grid-template-columns:1fr}.por img{width:160px}}
</style>
<h1>Sigil studies</h1>
<p class="lede">A species' sigil is its song drawn as the organism that sings it. Each note is one of its cells, in the shape and colour of the cell type that sings it (α the melody, β a colony's second voice; a free-living species with several cell types deals its notes among them by its body plan), as large as the note is long and turned by its pitch. The cells are packed on a sunflower spiral in the order they sing, as a colony grows, and <b>bonded only for species that bond</b>, as in the sim. Portraits are from ${shots.length ? 'a short trial world' : 'a trial world (skipped this time)'}: each species where its cells were densest, the others dimmed.</p>
<h2>Every species at the Lab list's size</h2>${strip}
<h2>Species</h2>${cards.join('\n')}`;
fs.writeFileSync(path.join(OUT, 'index.html'), page);
console.log(`wrote ${path.join(OUT, 'index.html')} (${species.length} species)`);
