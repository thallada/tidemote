// The bond lab: photograph the same bonded bodies, at the same moment of the same world, across zooms, so a change to how
// bonds are drawn (bondKind and the bondFar/bondAnchor/bondVtx/bondFrag kinds in DRAW_WGSL; docs/look.md, Bonds) is
// judged frame against frame. The first run grows a world at Max and saves it (--world); every run loads it into the
// page as now built (rebuild with npm run build between runs; --html photographs an older build).
//   tools/gpu-node.sh tools/bondlab.mjs --out runs/bonds/NAME [--world runs/bonds/world.bin] [--n 131072] [--mature 1200]
//     [--zoom 50,150,300,800,1500] [--per 2] [--only REGEX] [--html dist/tidemote.html] [--k '{...}'] [--repeat N] [--cells 0] [--look K]
//   (Linux without a display: TIDEMOTE_VK=1 tools/capped.sh node tools/bondlab.mjs ...)
//   (--n must be the world's own count; under WSL, Windows node cannot follow a symlinked world: copy it instead)
//   tools/gpu-node.sh tools/bondlab.mjs --compare runs/bonds/A runs/bonds/B --out runs/bonds/A-vs-B
//   tools/gpu-node.sh tools/bondlab.mjs --sheets runs/bonds/NAME   (the sheets again)
// The default zooms (pixels a world unit) cover the far line alone (50: cells under 6 px), the line crossfading into the
// strip (150, 300) and the strip alone (800, 1500). Bodies (bonded cells joined through their bonds, three or more) are
// chosen once per world and kept in WORLD.bodies.json beside it, found again by a cell's id: up to --per of each kind as
// its species are assigned (bondKindLike, src/genome.js, mirroring bondKind), and a fixed set of four of different build
// (a loose body, one closing toward tissue, a still tree, a beating tree) photographed with K.bondLook forcing every
// bond to each kind in turn. Writes OUT/bodies.json (each body, and how many species, bodies and bonds of the world
// each kind has), OUT/BODY_zZOOM.png (as assigned; paused, film grain off, the Normal look), OUT/BODY_kKIND_zZOOM.png
// (forced), OUT/assigned_zZOOM.png (every assigned body's middle at a zoom) and OUT/forced_BODY.png (a forced body:
// a row a kind, a column a zoom). --repeat N photographs each assigned body N times more, a fifth of a second apart,
// as OUT/BODY_zZOOM_rI.png (the world paused: anything that changes between them flickers); --cells 0 draws no cells,
// only the bonds and hulls (a hull's flicker, say, unhidden by the cells' own motion); --look K draws the assigned
// bodies with every bond forced to kind K (K.bondLook) rather than as assigned. --compare writes A beside B for each picture (A-vs-B/FILE.png) and the sheets again
// with A and B side by side, opening no page. Sheets are laid out by a browser (tools/lib/sheet.mjs: no ImageMagick).
import fs from 'node:fs'; import path from 'node:path';
import { cliArgs } from './lib/args.mjs';
import { contactSheet, sheetBrowser } from './lib/sheet.mjs';

const v = { out: 'runs/bonds/x', world: 'runs/bonds/world.bin', n: 131072, mature: 1200, zoom: '50,150,300,800,1500', per: 2, w: 1280, h: 800, html: 'dist/tidemote.html', repeat: 0, cells: 1, look: -1,
  // (no climate event and no low era in the page's own world, whose climate drives the loaded one: a drought or a frost
  // in one run and not the next changes every picture; --k '{}' lets them be)
  k: '{"lowEras":0,"eventPlan":"none@1000000000"}', ...cliArgs() };
fs.mkdirSync(v.out, { recursive: true });

// ---- the sheets: each assigned body's middle at each zoom; each forced body, a row a kind and a column a zoom. Of one
// run's pictures (dirs [A]), or of two side by side (--compare: dirs [A, B])
async function sheets(ctx, dirs, out) {
  const { bodies, zooms, kinds } = JSON.parse(fs.readFileSync(path.join(dirs[0], 'bodies.json'), 'utf8'));
  const n = dirs.length;
  const cells = (f, label) => dirs.map((d) => ({ file: path.join(d, f), label: n > 1 ? `${label} ${path.basename(d)}` : label }));
  const assigned = bodies.filter((b) => b.set === 'assigned');
  for (const z of zooms)
    if (assigned.length) await contactSheet(ctx, assigned.flatMap((b) => cells(`${b.name}_z${z}.png`, `${b.name} (${b.cells} cells, slot ${b.slot}) z${z}`)), path.join(out, `assigned_z${z}.png`), { cols: 4 });
  for (const b of bodies.filter((b) => b.set === 'forced'))
    await contactSheet(ctx, kinds.flatMap((k, ki) => zooms.flatMap((z) => cells(`${b.name}_k${ki}_z${z}.png`, `${b.name} as ${k} z${z}`))),
      path.join(out, `forced_${b.name}.png`), { cols: zooms.length * n, scale: n > 1 ? 0.5 : 0.6, title: `${b.name}: ${b.cells} cells of slot ${b.slot}, assigned ${b.kindName}${n > 1 ? `; ${dirs.map((d) => path.basename(d)).join(' | ')}` : ''}` });
}
const si = process.argv.indexOf('--sheets');
if (si > 0) {
  const sb = await sheetBrowser();
  await sheets(sb.ctx, [process.argv[si + 1]], process.argv[si + 1]);
  await sb.close();
  console.log('sheets', process.argv[si + 1]);
  process.exit(0);
}

// ---- --compare A B: no page, only sheets (every picture, A beside B whole, then the sheets of both)
const ci = process.argv.indexOf('--compare');
if (ci > 0) {
  const dirs = process.argv.slice(ci + 1, ci + 3);
  const sb = await sheetBrowser();
  for (const f of fs.readdirSync(dirs[0]).filter((f) => /_z\d+\.png$/.test(f) && fs.existsSync(path.join(dirs[1], f))))
    await contactSheet(sb.ctx, dirs.map((d) => ({ file: path.join(d, f), label: `${f.replace(/\.png$/, '')} ${path.basename(d)}` })), path.join(v.out, f), { cols: 2, crop: null, scale: 0.75 });
  await sheets(sb.ctx, dirs, v.out);
  await sb.close();
  console.log('done', v.out);
  process.exit(0);
}

const { openPage, aim } = await import('./pagelab.mjs');
const { loadBinWorld, saveBinWorld, unpackWorld } = await import('./lib/world.mjs');
const { P_BYTES, FIRST_LIFE, DEFAULT_K } = await import('../src/shaders.js');
const { readGenome, cellShape, dietGuild, BOND_KINDS, bondKindLike } = await import('../src/genome.js');
const zooms = v.zoom.split(',').map(Number);
const bodyFile = v.world.replace(/\.bin$/, '') + '.bodies.json';

fs.mkdirSync(path.dirname(v.world), { recursive: true });
const fresh = !fs.existsSync(v.world);
const t0 = Date.now();
const { page, close, simTime, setSpeed } = await openPage({ ...v, mature: 1, tmp: 'bonds-' });
if (fresh) {
  // grown at Max to --mature simulated seconds, saying how far it has come
  await setSpeed(Infinity);
  for (let last = 0, t; (t = await simTime()) < +v.mature; await page.waitForTimeout(250)) {
    if (Date.now() - last > 30000) { last = Date.now(); console.log(`growing: ${t.toFixed(0)} of ${v.mature} s (${((Date.now() - t0) / 1000).toFixed(0)} s)`); }
  }
  await setSpeed(0);
  fs.writeFileSync(v.world, Buffer.from((await saveBinWorld(page)).b64, 'base64'));
  console.log(`saved ${v.world} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
const worldUrl = `data:application/octet-stream;base64,${fs.readFileSync(v.world).toString('base64')}`;
// the saved moment, a tenth of a second on (contacts, sway and the stone list gathered), held still (the .bin fetched
// into the page once and kept there)
await loadBinWorld(page, worldUrl);
await page.evaluate(async (url) => { globalThis.__blWorld = await (await fetch(url)).arrayBuffer(); }, worldUrl);
await page.evaluate(async () => {
  const T = globalThis.__tidemote;
  T.loadWorld(globalThis.__unpackWorld(globalThis.__blWorld));
  const t0 = T.eng.simTime;
  T.setSpeed(1);
  while (T.eng.simTime < t0 + 0.1) await new Promise((r) => setTimeout(r, 30));
  T.setSpeed(0);
  T.look.set({ grain: 0 }, 1);
  T.eng.K.bondLook = -1;
});

// ---- the bodies: chosen once from the saved world, then kept
let chosen;
if (fs.existsSync(bodyFile)) chosen = JSON.parse(fs.readFileSync(bodyFile, 'utf8'));
else {
  const world = unpackWorld(fs.readFileSync(v.world));
  const [W, H] = world.cpu.grid, cnt = world.cpu.count, NONE = 0xffffffff, PW = P_BYTES / 4;
  const pu = new Uint32Array(world.gpu.parts), pf = new Float32Array(world.gpu.parts), it = new Uint32Array(world.gpu.intent);
  const gu = new Uint32Array(world.gpu.genomes), gf = new Float32Array(world.gpu.genomes);
  const genomes = new Map(), gen = (k) => { if (!genomes.has(k)) genomes.set(k, readGenome(gu, gf, k)); return genomes.get(k); };
  const wrap = (d, L) => d - L * Math.round(d / L);
  const kindOf = (i) => pu[i * PW + 4], info = (i) => pu[i * PW + 9];
  // bodies: cells joined through kept bonds (union-find), each bond's kind as its keeper's species draws it
  const up = new Int32Array(cnt).map((_, i) => i);
  const find = (i) => { while (up[i] !== i) { up[i] = up[up[i]]; i = up[i]; } return i; };
  const bonds = [];
  for (let i = 0; i < cnt; i++) {
    if (kindOf(i) < FIRST_LIFE) continue;
    for (const n of [it[i * 4 + 2], it[i * 4 + 3]]) {
      if (n === NONE || n === i || n >= cnt || kindOf(n) < FIRST_LIFE) continue;
      bonds.push([i, n, bondKindLike(gen(kindOf(i)), gen(kindOf(n)), info(i), info(n), DEFAULT_K)]);
      up[find(i)] = find(n);
    }
  }
  const per = BOND_KINDS.map(() => ({ species: new Set(), bonds: 0, bodies: 0 }));
  const groups = new Map();
  for (const [i, n, k] of bonds) {
    per[k].bonds++; per[k].species.add(kindOf(i));
    const r = find(i);
    if (!groups.has(r)) groups.set(r, { cells: new Set(), kinds: new Array(8).fill(0) });
    const gr = groups.get(r);
    gr.cells.add(i); gr.cells.add(n); gr.kinds[k]++;
  }
  const bodies = [];
  for (const gr of groups.values()) {
    if (gr.cells.size < 3) continue;
    const cells = [...gr.cells], o = cells[0] * PW, x0 = pf[o], y0 = pf[o + 1];
    const rel = cells.map((c) => [wrap(pf[c * PW] - x0, W), wrap(pf[c * PW + 1] - y0, H)]);
    const cx = rel.reduce((s, r) => s + r[0], 0) / rel.length, cy = rel.reduce((s, r) => s + r[1], 0) / rel.length;
    const spread = Math.sqrt(rel.reduce((s, r) => s + (r[0] - cx) ** 2 + (r[1] - cy) ** 2, 0) / rel.length);
    // the cell nearest the middle, found again by id
    let mid = 0;
    rel.forEach((r, j) => { if (Math.hypot(r[0] - cx, r[1] - cy) < Math.hypot(rel[mid][0] - cx, rel[mid][1] - cy)) mid = j; });
    const kind = gr.kinds.indexOf(Math.max(...gr.kinds)), g = gen(kindOf(cells[mid]));
    bodies.push({ kind, cells: cells.length, spread, x: (x0 + cx + W) % W, y: (y0 + cy + H) % H, id: pu[cells[mid] * PW + 7],
      off: [cx - rel[mid][0], cy - rel[mid][1]], slot: kindOf(cells[mid]), tree: g.grow[0] >= 0.5, beat: g.beat[0] > 0,
      adhesion: +g.adhesion.toFixed(2), calcify: +g.calcify.toFixed(2), photo: +g.photo.toFixed(2), diet: dietGuild(g), plan: cellShape(g, 0) });
    per[kind].bodies++;
  }
  const counts = Object.fromEntries(BOND_KINDS.map((k, j) => [k, { species: per[j].species.size, bodies: per[j].bodies, bonds: per[j].bonds }]));
  console.log('per kind (species / bodies of 3+ / bonds):', BOND_KINDS.map((k, j) => `${k} ${per[j].species.size}/${per[j].bodies}/${per[j].bonds}`).join('  '));
  // the best bodies to show: a few to a few dozen cells, compact enough to frame at mid zoom, apart from those chosen
  const picked = [];
  const free = (b) => picked.every((s) => Math.hypot(wrap(s.x - b.x, W), wrap(s.y - b.y, H)) > 4);
  const score = (b) => Math.min(b.cells, 24) - 6 * Math.max(0, b.spread - 1.5);
  const take = (pool, name, set) => {
    const best = pool.filter(free).sort((a, b) => score(b) - score(a))[0];
    if (best) picked.push({ name, set, ...best, kindName: BOND_KINDS[best.kind] });
    return best;
  };
  for (const [k, kn] of BOND_KINDS.entries()) for (let j = 0; j < +v.per; j++) if (!take(bodies.filter((b) => b.kind === k), `${kn}${j}`, 'assigned') && j === 0) console.log(`no ${kn} body in this world`);
  // the forced set: bodies of four builds
  const tight = (b) => (b.adhesion - DEFAULT_K.tightFrom) / DEFAULT_K.tightSpan;
  take(bodies.filter((b) => !b.tree && tight(b) <= 0), 'F-loose', 'forced');
  take(bodies.filter((b) => !b.tree && tight(b) > 0 && tight(b) <= 0.5), 'F-closing', 'forced');
  take(bodies.filter((b) => b.tree && !b.beat && tight(b) <= 0.5), 'F-tree', 'forced');
  take(bodies.filter((b) => b.tree && b.beat && tight(b) <= 0.5), 'F-beating', 'forced');
  chosen = { world: v.world, counts, bodies: picked };
  fs.writeFileSync(bodyFile, JSON.stringify(chosen, null, 1));
  console.log(`chose ${picked.length} bodies: ${bodyFile}`);
}
let bodies = chosen.bodies;
if (v.only) bodies = bodies.filter((b) => new RegExp(v.only).test(b.name));

// each body's middle now (its cells moved a little in the tenth of a second), by its middle cell's id
const locate = (b) => page.evaluate(async (b) => {
  const T = globalThis.__tidemote, res = await T.eng.requestPick([b.x - b.off[0], b.y - b.off[1]], 4, 0xffffffff, { maxOut: 20000, raw: true });
  const { u32, f32, count } = res.raw;
  for (let i = 0; i < count; i++) if (u32[i * 12 + 7] === b.id) return [f32[i * 12] + b.off[0], f32[i * 12 + 1] + b.off[1]];
  return null;
}, b);
const shot = (f) => page.screenshot({ path: path.join(v.out, f) });
const look = (k) => page.evaluate((k) => { globalThis.__tidemote.eng.K.bondLook = k; }, k);
if (!+v.cells) await page.evaluate(() => { globalThis.__tidemote.eng.settings.nodes = false; });
const t1 = Date.now();
const found = [];
for (const b of bodies) {
  const at = await locate(b);
  if (!at) { console.log(`${b.name}: cell ${b.id} not found`); continue; }
  found.push(b);
  for (const z of zooms) {
    await aim(page, at, z);
    if (b.set === 'assigned') {
      await look(+v.look); await page.waitForTimeout(500); await shot(`${b.name}_z${z}.png`);
      for (let r = 1; r <= +v.repeat; r++) { await page.waitForTimeout(200); await shot(`${b.name}_z${z}_r${r}.png`); }
      continue;
    }
    for (let k = 0; k < BOND_KINDS.length; k++) { await look(k); await page.waitForTimeout(250); await shot(`${b.name}_k${k}_z${z}.png`); }
  }
}
await look(-1);
fs.writeFileSync(path.join(v.out, 'bodies.json'), JSON.stringify({ world: v.world, html: v.html, zooms, kinds: BOND_KINDS, counts: chosen.counts, bodies: found }, null, 1));
console.log(found.map((b) => `${b.name}: ${b.kindName} ${b.cells} cells, slot ${b.slot}, adhesion ${b.adhesion}${b.tree ? b.beat ? ' beating tree' : ' tree' : ''}, ${b.diet}`).join('\n'));

await sheets(page.context(), [v.out], v.out);
await close();
console.log(`done ${v.out} (photographs ${((Date.now() - t1) / 1000).toFixed(0)} s)`);
