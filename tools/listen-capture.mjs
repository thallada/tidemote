// Run the ecology headlessly in Chromium and record what the soundtrack would hear from several
// fixed camera views: the same 'listen' and 'slots' messages the page posts to the audio thread.
// usage: node tools/listen-capture.mjs --out capture.json [--n 4096] [--warm 40] [--each 25] [--seed 7]
// Render with tools/listen-render.mjs.
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const out = arg('out', 'capture.json'), N = Number(arg('n', 4096)), WARM = Number(arg('warm', 40)), EACH = Number(arg('each', 25)), SEED = Number(arg('seed', 7));
const root = fileURLToPath(new URL('..', import.meta.url));
const entry = `
import { createEngine, MAXK, FIRST_LIFE } from './src/engine.js';
import { readGenome, genomeSerial } from './src/genome.js';
import { voiceOf } from './src/audio/mapping.js';
import { digest, hearing, D_REF } from './src/audio/listen.js';
import { createClimate, abioRate } from './src/climate.js';
window.capture = async ({ N, WARM, EACH, SEED }) => {
  let s = SEED >>> 0; const rng = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  Math.random = rng;
  const device = await (await navigator.gpu.requestAdapter()).requestDevice();
  const eng = await createEngine(device, 'rgba8unorm', {});
  await eng.allocate(N); eng.resize(1280, 720); eng.seed(N, { aspect: 16 / 9, rng }); eng.censusEvery = 30;
  const climate = createClimate(eng, rng);
  const [GW, GH] = eng.grid;
  const log = []; let phase = 'warm', voices = new Map(), keep = null, lastCensus = null;
  eng.onCensus = (c) => {
    lastCensus = c; eng.abio = abioRate(c.pop[1]);
    if (phase === 'warm') return;
    const slots = [];
    for (let k = FIRST_LIFE; k < MAXK; k++) if (c.pop[k]) {
      const serial = genomeSerial(c.genomeU32, k);
      let v = null;
      let genome = null;
      if (voices.get(k) !== serial) { voices.set(k, serial); genome = readGenome(c.genomeU32, c.genomeF32, k); v = voiceOf(genome); }
      // the genome is kept so tools/listen-render.mjs can re-derive voices with the current mapping
      slots.push({ slot: k, serial, voice: v, genome, pop: c.pop[k] });
    }
    let amp = 0; for (let i = 0; i < 4; i++) amp += eng.tide[i * 4 + 3];
    const tideN = Math.min(1, amp / 3);
    log.push({ t: c.simTime, phase, msg: { type: 'slots', all: true, slots } });
    log.push({ t: c.simTime, phase, msg: { type: 'world', world: { light: Math.min(1.2, eng.ambient * 1.2 + 0.85 * eng.season * tideN), tide: eng.season * tideN } } });
  };
  eng.onListen = (d) => {
    if (phase === 'warm') return;
    const r = digest(d, { speed: 1, vscale: 1 });
    keep = r.keep; eng.listen.keep = keep;
    log.push({ t: d.simTime, phase, msg: r.msg, stats: { living: d.living, speed: d.speed, speedAll: d.speedAll, found: d.found, particles: d.particles } });
  };
  // follow: re-find the best patch of that kind near the camera every 2 s and glide toward it
  const run = async (sec, cam, steps = 1, follow = null) => {
    const frames = Math.round(sec * 60 / steps);
    let target = null;
    for (let f = 0; f < frames; f++) {
      if (follow && f % 120 === 0) target = best(await patches(), follow, cam);
      if (target) {
        let dx = target.x - cam.x, dy = target.y - cam.y; dx -= GW * Math.round(dx / GW); dy -= GH * Math.round(dy / GH);
        cam = { ...cam, x: (cam.x + dx * 0.02 + GW) % GW, y: (cam.y + dy * 0.02 + GH) % GH };
      }
      while (eng.censusStage.every((x) => x.busy) || eng.listenStage.every((x) => x.busy)) await new Promise((r) => setTimeout(r, 0));
      climate.tick(steps / 60);
      eng.frame({ target: null, cam, simDt: 1 / 60, steps, time: eng.simTime });
    }
    while (eng.censusStage.some((x) => x.busy) || eng.listenStage.some((x) => x.busy)) await new Promise((r) => setTimeout(r, 2));
  };
  const whole = { x: GW / 2, y: GH / 2, ppu: 1280 / GW };
  await run(WARM, whole, 4);
  // find calm photosynth patches and busy ones from the particles themselves
  const side = D_REF, nx = Math.floor(GW / side), ny = Math.floor(GH / side);
  const photoOf = new Map();
  const patches = async () => {
    const rb = device.createBuffer({ size: eng.count * 40, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(eng.b.parts, 0, rb, 0, eng.count * 40); device.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ); const pf = new Float32Array(rb.getMappedRange().slice(0)); const pu = new Uint32Array(pf.buffer); rb.unmap(); rb.destroy();
    const c = lastCensus;
    const cells = new Array(nx * ny).fill(0).map(() => ({ n: 0, sp: 0, ph: 0 }));
    for (let i = 0; i < eng.count; i++) {
      const o = i * 10, kind = pu[o + 4]; if (kind < FIRST_LIFE) continue;
      const cx = Math.min(nx - 1, Math.floor(pf[o] / side)), cy = Math.min(ny - 1, Math.floor(pf[o + 1] / side)), e = cells[cy * nx + cx];
      const key = kind + ':' + genomeSerial(c.genomeU32, kind);
      if (!photoOf.has(key)) photoOf.set(key, readGenome(c.genomeU32, c.genomeF32, kind).photo);
      e.n++; e.sp += Math.hypot(pf[o + 2], pf[o + 3]); e.ph += photoOf.get(key) > 0.4 ? 1 : 0;
    }
    return cells.map((e, i) => ({ ...e, x: ((i % nx) + 0.5) * side, y: (Math.floor(i / nx) + 0.5) * side,
      calm: e.n < 4 ? -1 : (e.n * (e.ph / e.n)) / (1 + 8 * (e.sp / e.n)), busy: e.n < 3 ? -1 : e.n * (e.sp / e.n) * (1.2 - e.ph / e.n) }));
  };
  const best = (cells, key, near) => {
    let b = null, bs = -Infinity;
    for (const e of cells) {
      let dx = 0, dy = 0;
      if (near) { dx = e.x - near.x; dy = e.y - near.y; dx -= GW * Math.round(dx / GW); dy -= GH * Math.round(dy / GH); }
      const sc = e[key] - (near ? 0.15 * Math.hypot(dx, dy) * Math.max(1, e[key]) : 0);
      if (sc > bs) { bs = sc; b = e; }
    }
    return b;
  };
  const camFor = (p, d) => { const hx = d * Math.sqrt(16 / 9) / 2; return { x: p.x, y: p.y, ppu: 1280 / (2 * hx) }; };
  const first = await patches();
  const calmP = best(first, 'calm'), busyP = best(first, 'busy');
  eng.listen = { every: 6, keep: null, vscale: 1 };
  const info = { grid: [GW, GH], calm: calmP, busy: busyP, phases: [] };
  for (const [name, cam, follow] of [['far', whole], ['mid', camFor(busyP, 4)], ['calm', camFor(calmP, D_REF), 'calm'], ['busy', camFor(busyP, D_REF * 1.5), 'busy']]) {
    phase = name; info.phases.push({ name, t0: eng.simTime, cam });
    await run(EACH, cam, 1, follow);
  }
  return { info, log };
};`;
const bundle = await build({ stdin: { contents: entry, resolveDir: root }, bundle: true, write: false, format: 'iife', target: 'es2022' });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tidemote-cap-'));
fs.writeFileSync(path.join(dir, 'i.html'), '<!doctype html><meta charset="utf-8"><title>capture</title>');
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--enable-unsafe-webgpu'] });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(0);
  page.on('console', (m) => { if (m.type() === 'error') console.error(m.text()); });
  page.on('pageerror', (e) => console.error(String(e)));
  await page.goto(pathToFileURL(path.join(dir, 'i.html')).href);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const t0 = Date.now();
  const res = await page.evaluate(async (o) => {
    const r = await window.capture(o);
    // typed arrays → plain arrays for JSON
    for (const e of r.log) if (e.msg.ev) e.msg.ev = Array.from(e.msg.ev);
    return r;
  }, { N, WARM, EACH, SEED });
  fs.writeFileSync(out, JSON.stringify(res));
  console.log(`captured ${res.log.length} messages in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${out}`);
  console.log(JSON.stringify(res.info));
} finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
