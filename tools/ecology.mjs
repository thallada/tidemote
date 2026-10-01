// Headless ecology run: steps the simulation on a GPU through Dawn (the `webgpu` npm package)
// and prints a census of the biosphere at intervals. Used to tune the ecology without a browser.
//
//   npm install
//   node ecology.mjs                      # 16k particles, 10 simulated minutes
//   N=32768 MINUTES=5 SEED=11 node ecology.mjs
//   OUT=world.png ZOOM=1,4 node ecology.mjs   # also render the final frame at each zoom
//   K='{"guildCap":0.4}' node ecology.mjs     # override simulation constants (see DEFAULT_K)
//
// Without a hardware GPU, Mesa's lavapipe works (slowly):
//   VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json node ecology.mjs
import fs from 'node:fs';
import { create, globals } from 'webgpu';
import { PNG } from 'pngjs';

Object.assign(globalThis, globals);
const E = await import(new URL('../src/engine.js', import.meta.url));

const env = process.env;
const W = +env.W || 640, H = +env.H || 360;
const N = +env.N || 16384;
const FRAMES = Math.round((+env.MINUTES || 10) * 3600);
const PRINT = +env.PRINT || 30;
const K = env.K ? JSON.parse(env.K) : {};

const gpu = create([]); // keep a reference: the instance must outlive the device
const adapter = await gpu.requestAdapter();
const device = await adapter.requestDevice();
const errors = [];
device.addEventListener('uncapturederror', (e) => errors.push(e.error.message));

const eng = await E.createEngine(device, 'rgba8unorm', { K });
if (!(await eng.allocate(N))) throw new Error(`could not allocate ${N} particles`);
eng.resize(W, H);
let seed = +env.SEED || 23;
const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
eng.seed(N, { aspect: W / H, rng });
eng.censusEvery = 20;

const pct = (o, total) => Object.entries(o).map(([k, v]) => `${k} ${Math.round((v / Math.max(1, total)) * 100)}%`).join(', ');
let lastPrint = -Infinity;
eng.onImmigrate = (e) => console.log(`  immigrants: ${e.type} colony (rare guild: ${e.guild}) at ${e.t.toFixed(0)}s`);
eng.onCensus = (c) => {
  const pop = c.pop;
  let living = 0, species = 0;
  for (let s = E.FIRST_LIFE; s < E.MAXK; s++) if (pop[s]) { living += pop[s]; species++; }
  // abiogenesis at the same rate the page uses: about one new lineage every 30 s, faster in a crisis
  const crisis = living / eng.count < 0.02;
  eng.abio = (crisis ? 3 : c.simTime < 25 ? 1.2 : 1 / 30) / (Math.max(1, pop[1]) * 60);

  if (c.simTime - lastPrint < PRINT) return;
  lastPrint = c.simTime;
  const diet = {}, mob = {}, body = {};
  for (let s = E.FIRST_LIFE; s < E.MAXK; s++) {
    if (!pop[s]) continue;
    const g = E.readGenome(c.genomeU32, c.genomeF32, s);
    const swim = g.swim * (1 - g.photo);
    let d = 'omnivore';
    if (g.photo > 0.55) d = 'producer';
    else if (g.dFlesh > 0.55) d = 'predator';
    else if (g.dHusk > 0.55) d = 'scavenger';
    else if (g.dGlint > 0.55) d = 'grazer';
    const m = g.advect < 0.2 && swim < 0.2 ? 'sessile' : swim >= 0.8 ? 'swimmer' : g.advect > 0.7 && swim < 0.4 ? 'drifter' : 'crawler';
    const b = (g.adhesion || 0) > eng.K.adhMin ? 'bodies' : 'free cells';
    diet[d] = (diet[d] || 0) + pop[s];
    mob[m] = (mob[m] || 0) + pop[s];
    body[b] = (body[b] || 0) + pop[s];
  }
  const G = c.globals;
  console.log(`t=${c.simTime.toFixed(0)}s  living ${living} of ${eng.count}, ${species} species | silt ${pop[0]} glint ${pop[1]} husk ${pop[2]}`);
  console.log(`  diet: ${pct(diet, living)}`);
  console.log(`  movement: ${pct(mob, living)} | ${pct(body, living)}`);
  console.log(`  totals: births ${G[2]}, mutant species ${G[3]}, starved ${G[5]}, old age ${G[6]}, kills ${G[7]}, extinctions ${G[8]} | light reaching plants ×${eng.turbid.toFixed(2)}`);
};

const t0 = Date.now();
for (let f = 0; f < FRAMES; f++) {
  eng.season = 0.55 + 0.45 * Math.sin((eng.simTime / 300) * Math.PI * 2);
  eng.frame({ target: null, simDt: 1 / 60, time: f / 60 });
  if (f % 30 === 0) await device.queue.onSubmittedWorkDone();
  if (errors.length) { console.error('GPU error:', errors.slice(0, 3)); process.exit(1); }
}
await device.queue.onSubmittedWorkDone();
console.log(`${FRAMES} frames, ${((Date.now() - t0) / FRAMES).toFixed(1)} ms/frame`);

if (env.OUT) {
  const tex = device.createTexture({ size: [W, H], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  for (const z of (env.ZOOM || '1').split(',').map(Number)) {
    eng.clearAccum = true;
    const ppu = Math.max(W / eng.grid[0], H / eng.grid[1]) * z;
    eng.frame({ target: tex.createView(), cam: { x: eng.grid[0] / 2, y: eng.grid[1] / 2, ppu }, paused: true, time: FRAMES / 60 });
    const bpr = Math.ceil((W * 4) / 256) * 256;
    const buf = device.createBuffer({ size: bpr * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr }, [W, H]);
    device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange());
    const png = new PNG({ width: W, height: H });
    for (let y = 0; y < H; y++) png.data.set(src.subarray(y * bpr, y * bpr + W * 4), y * W * 4);
    const file = env.OUT.replace(/\.png$/, `_z${z}.png`);
    fs.writeFileSync(file, PNG.sync.write(png));
    buf.unmap();
    console.log(`wrote ${file}`);
  }
}
process.exit(0);
