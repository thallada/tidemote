// Film the jelly's wall at work (K.sheath, docs/ecosystem.md, Jelly): from one saved world, the hungry piercers in or
// beside a jelly body of another species, each followed for a few seconds at 1× (a frame every --every s) at each
// zoom, and strangers pressed against a hull that cannot pierce it. Frames go to OUT/SPOT_zZOOM_fI.png, one sheet a
// spot (OUT/SPOT.png), and OUT/spots.json says who each spot follows.
//   tools/gpu-node.sh tools/jellyfilm.mjs --world runs/perf/worlds/jelly1m.bin --n 1048576 --out runs/jelly/film/NAME
//     [--zoom 250,600] [--secs 3] [--every 0.25] [--spots 4] [--html dist/tidemote.html] [--k '{...}']
import fs from 'node:fs'; import path from 'node:path';
import { cliArgs } from './lib/args.mjs';
import { contactSheet } from './lib/sheet.mjs';
import { openPage, aim } from './pagelab.mjs';
import { loadBinWorld, unpackWorld } from './lib/world.mjs';
import { P_BYTES, FIRST_LIFE, CYST, DEFAULT_K } from '../src/shaders.js';
import { readGenome, growPlan, sheathOf, pierceOf, divEnergy } from '../src/genome.js';

const v = { world: 'runs/perf/worlds/jelly1m.bin', n: 1048576, out: 'runs/jelly/film/x', zoom: '250,600', secs: 3, every: 0.25, spots: 4,
  html: 'dist/tidemote.html', k: '{"lowEras":0,"eventPlan":"none@1000000000"}', ...cliArgs() };
fs.mkdirSync(v.out, { recursive: true });
const K = { ...DEFAULT_K, ...JSON.parse(v.k) };
const zooms = String(v.zoom).split(',').map(Number);

// ---- the spots, from the saved world on the CPU
const world = unpackWorld(fs.readFileSync(v.world));
const [W, H] = world.cpu.grid, cnt = world.cpu.count, NONE = 0xffffffff, PW = P_BYTES / 4;
const pu = new Uint32Array(world.gpu.parts), pf = new Float32Array(world.gpu.parts), it = new Uint32Array(world.gpu.intent);
const gu = new Uint32Array(world.gpu.genomes), gf = new Float32Array(world.gpu.genomes);
const gs = new Map(), gen = (k) => { if (!gs.has(k)) gs.set(k, readGenome(gu, gf, k)); return gs.get(k); };
const wrap = (d, L) => d - L * Math.round(d / L);
const jelly = [], cells = [];
for (let i = 0; i < cnt; i++) {
  const o = i * PW, kind = pu[o + 4];
  if (kind < FIRST_LIFE || (pu[o + 9] & 15) === CYST) continue;
  cells.push(i);
  const g = gen(kind), bonded = it[i * 4 + 2] !== NONE || it[i * 4 + 3] !== NONE;
  if (sheathOf(g) && bonded && g.adhesion > K.adhMin && !growPlan(g, K) && (g.adhesion - K.tightFrom) / K.tightSpan <= 0.9) jelly.push(i);
}
const cell = 0.5, gx = Math.ceil(W / cell), gy = Math.ceil(H / cell), grid = new Map();
for (const i of jelly) { const key = Math.floor(pf[i * PW] / cell) + gx * Math.floor(pf[i * PW + 1] / cell); (grid.get(key) || grid.set(key, []).get(key)).push(i); }
// each living cell's nearest jelly cell of another species, and how many such within a unit (how deep in a body it is)
const near = (i) => {
  const x = pf[i * PW], y = pf[i * PW + 1], kind = pu[i * PW + 4], cx = Math.floor(x / cell), cy = Math.floor(y / cell);
  let best = Infinity, n = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) for (const j of grid.get(((cx + dx + gx) % gx) + gx * ((cy + dy + gy) % gy)) || []) {
    if (pu[j * PW + 4] === kind) continue;
    const r = Math.hypot(wrap(pf[j * PW] - x, W), wrap(pf[j * PW + 1] - y, H));
    best = Math.min(best, r); if (r < 1) n++;
  }
  return { best, n };
};
const inside = [], pressed = [];
for (const i of cells) {
  const g = gen(pu[i * PW + 4]);
  const hungry = pf[i * PW + 5] < divEnergy(g, K) * K.sated;
  const { best, n } = near(i);
  if (best > 0.4 || n < 4) continue;
  const s = { id: pu[i * PW + 7], x: pf[i * PW], y: pf[i * PW + 1], slot: pu[i * PW + 4], depth: n, gap: +best.toFixed(3) };
  if (pierceOf(g) && hungry) inside.push({ ...s, what: best < 0.085 * (g.size || 1) + K.sheathGap ? 'piercer inside' : 'piercer at the wall' });
  else if (!pierceOf(g) && (g.dGlint > 0.3 || g.dFlesh > 0.3)) pressed.push({ ...s, what: 'eater held off' });
}
const picked = [];
const free = (b) => picked.every((s) => Math.hypot(wrap(s.x - b.x, W), wrap(s.y - b.y, H)) > 6);
for (const pool of [inside.sort((a, b) => b.depth - a.depth), pressed.sort((a, b) => b.depth - a.depth)]) {
  let n = 0;
  for (const b of pool) { if (n >= Math.ceil(+v.spots / (pool === inside ? 1 : 2))) break; if (free(b)) { picked.push({ name: `s${picked.length}`, ...b }); n++; } }
}
console.log(`${jelly.length} jelly cells; ${inside.length} hungry piercers in or at a jelly body, ${pressed.length} eaters beside one; filming ${picked.length}`);

// ---- the page: the saved world, run at 1× with the camera on each spot's cell
const { page, close } = await openPage({ ...v, mature: 1, tmp: 'jelly-' });
const worldUrl = `data:application/octet-stream;base64,${fs.readFileSync(v.world).toString('base64')}`;
await loadBinWorld(page, worldUrl);
await page.evaluate(() => { const T = globalThis.__tidemote; T.setSpeed(0); T.look.set({ grain: 0 }, 1); });
const locate = (s, at) => page.evaluate(async ([s, at]) => {
  const T = globalThis.__tidemote, res = await T.eng.requestPick(at, 3, 0xffffffff, { maxOut: 20000, raw: true });
  const { u32, f32, count } = res.raw;
  for (let i = 0; i < count; i++) if (u32[i * 12 + 7] === s.id) return [f32[i * 12], f32[i * 12 + 1]];
  return null;
}, [s, at]);
const shots = [];
for (const s of picked.filter((s) => !v.only || new RegExp(v.only).test(s.name))) {
  for (const z of zooms) {
    // (each zoom from the saved moment again, so the zooms show the same seconds)
    await loadBinWorld(page, worldUrl);
    await page.evaluate(() => globalThis.__tidemote.setSpeed(0));
    let at = [s.x, s.y];
    const frames = Math.round(+v.secs / +v.every);
    for (let f = 0; f <= frames; f++) {
      const now = await locate(s, at);
      if (now) at = now;
      await aim(page, at, z);
      await page.waitForTimeout(120);
      const file = `${s.name}_z${z}_f${String(f).padStart(2, '0')}.png`;
      await page.screenshot({ path: path.join(v.out, file) });
      shots.push({ spot: s.name, z, f, file, found: !!now });
      await page.evaluate(async (dt) => {
        const T = globalThis.__tidemote, t0 = T.eng.simTime;
        T.setSpeed(1);
        while (T.eng.simTime < t0 + dt) await new Promise((r) => setTimeout(r, 15));
        T.setSpeed(0);
      }, +v.every);
    }
  }
  console.log(`${s.name}: ${s.what} (slot ${s.slot}, ${s.depth} jelly cells within a unit, ${s.gap} from the nearest)`);
}
fs.writeFileSync(path.join(v.out, 'spots.json'), JSON.stringify({ world: v.world, html: v.html, zooms, spots: picked, shots }, null, 1));
for (const s of picked) await contactSheet(page.context(), shots.filter((x) => x.spot === s.name && x.f % 2 === 0).map((x) => ({ file: path.join(v.out, x.file), label: `${s.name} ${s.what} z${x.z} t=${(x.f * v.every).toFixed(2)}s` })),
  path.join(v.out, `${s.name}.png`), { cols: Math.ceil(Math.round(+v.secs / +v.every) / 2) + 1, crop: [700, 440], scale: 0.5, title: `${s.name}: ${s.what}` });
await close();
console.log(`done ${v.out}`);
