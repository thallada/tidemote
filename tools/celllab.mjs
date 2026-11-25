// The cell lab: photograph the same living cells, at the same moment of the same world, across zooms, close up in the
// specimen panel and in short clips, so a change to how cells are drawn (cellColor, cellOutline, pointColor, vsPoint in
// DRAW_WGSL) is judged frame against frame. The first run grows a world at Max and saves it (--world); every run loads
// it into the page as now built (rebuild with npm run build between runs; --html photographs an older build).
//   TIDEMOTE_VK=1 ~/.local/bin/capped node tools/celllab.mjs --out runs/cells/NAME [--world runs/cells/world.bin] [--n 65536]
//     [--mature 150] [--zoom 150,400,800,1500] [--spots 10] [--clip 3] [--only REGEX] [--html dist/tidemote.html]
//   node tools/celllab.mjs --compare runs/cells/A runs/cells/B --out runs/cells/A-vs-B
// Spots are living cells chosen once per world, to cover what the renderer draws differently (a tissue mat, a filament,
// a bud on its mother, a cyst, husks about a cell, a producer, an animal, a fast swimmer, a crowd of kinds, more body
// plans), kept with their ids in WORLD.spots.json beside the world and found again by id. Writes OUT/spots.json (what
// each is), OUT/SPOT_zZOOM.png (paused, film grain off, the Normal look), OUT/SPOT_zZOOM_off.png (the look off, one mid
// zoom), OUT/SPOT_specimen.png (the specimen panel's close-up of it, selected; _big: the viewer enlarged to 640x400, zoomed in
// to 0.8 units across), OUT/SPOT_zZOOM.mp4 and
// OUT/SPOT_zZOOM_strip.png (--clip s at speed 1, followed, at the two largest zooms; 8 frames' middles tiled 4x2; the
// world loaded afresh after each) and OUT/sheet_zZOOM.png (every spot's middle). --compare writes A beside B for each
// spot and zoom (A-vs-B/SPOT_zZOOM.png) and per-zoom sheets (A-vs-B/sheet_zZOOM.png); it opens no browser.
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { cliArgs } from './lib/args.mjs';

const v = { out: 'runs/cells/x', world: 'runs/cells/world.bin', n: 65536, mature: 150, zoom: '150,400,800,1500', spots: 10, clip: 3, w: 1280, h: 800, html: 'dist/tidemote.html', ...cliArgs() };
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });
const label = ['-background', '#111', '-fill', '#ddd', '-font', 'DejaVu-Sans', '-pointsize', '15'];
fs.mkdirSync(v.out, { recursive: true });

// ---- --compare A B: no browser
const ci = process.argv.indexOf('--compare');
if (ci > 0) {
  const [A, B] = process.argv.slice(ci + 1, ci + 3), an = path.basename(A), bn = path.basename(B);
  const { spots, zooms } = JSON.parse(fs.readFileSync(path.join(A, 'spots.json'), 'utf8'));
  const crop = (f, o) => run('convert', [f, '-gravity', 'center', '-crop', '560x350+0+0', '+repage', o]);
  for (const z of [...zooms.map((z) => `z${z}`), 'specimen', 'specimen_big']) {
    const pairs = [];
    for (const s of spots) {
      const f = `${s.name}_${z}.png`, fa = path.join(A, f), fb = path.join(B, f);
      if (!fs.existsSync(fa) || !fs.existsSync(fb)) continue;
      run('montage', [...label, '-label', `${s.name} ${an}`, fa, '-label', `${s.name} ${bn}`, fb, '-tile', '2x1', '-geometry', z.startsWith('specimen') ? '+4+4' : '1180x738+4+4', path.join(v.out, f)]);
      if (z.startsWith('specimen')) { pairs.push('-label', `${s.name} ${an}`, fa, '-label', `${s.name} ${bn}`, fb); continue; }
      const ca = path.join(v.out, `.a_${f}`), cb = path.join(v.out, `.b_${f}`);
      crop(fa, ca); crop(fb, cb);
      pairs.push('-label', `${s.name} ${an}`, ca, '-label', `${s.name} ${bn}`, cb);
    }
    if (!pairs.length) continue;
    run('montage', [...label, ...pairs, '-tile', '4x', '-geometry', z === 'specimen_big' ? '560x350+3+3' : z === 'specimen' ? '+3+3' : '+3+3', path.join(v.out, `sheet_${z}.png`)]);
    for (const f of fs.readdirSync(v.out)) if (f.startsWith('.a_') || f.startsWith('.b_')) fs.rmSync(path.join(v.out, f));
  }
  console.log('done', v.out);
  process.exit(0);
}

const { openPage, aim } = await import('./pagelab.mjs');
const { loadBinWorld, saveBinWorld, unpackWorld } = await import('./lib/world.mjs');
const { P_BYTES, FIRST_LIFE, G_WORDS, DEFAULT_K } = await import('../src/shaders.js');
const { readGenome, cellShape, dietGuild, mobilityGuild, growPlan, hasTails, CELL_SHAPES } = await import('../src/genome.js');
const zooms = v.zoom.split(',').map(Number), mid = zooms[Math.floor((zooms.length - 1) / 2)];
const spotFile = v.world.replace(/\.bin$/, '') + '.spots.json';

fs.mkdirSync(path.dirname(v.world), { recursive: true });
const fresh = !fs.existsSync(v.world);
const { page, close } = await openPage({ ...v, mature: fresh ? +v.mature : 1, tmp: 'cells-' });
// (the clips' panel hidden; the close-up's viewer enlarged for SPOT_specimen_big.png)
await page.addStyleTag({ content: 'body.cl-nospec #spec{display:none!important} body.cl-big{--spec-pw:672px!important} body.cl-big .viewer{height:400px!important}' });
if (fresh) {
  fs.writeFileSync(v.world, Buffer.from((await saveBinWorld(page)).b64, 'base64'));
  console.log(`saved ${v.world}`);
}
const worldUrl = `data:application/octet-stream;base64,${fs.readFileSync(v.world).toString('base64')}`;
// the saved moment, a tenth of a second on (so contacts, sway and the stone list are gathered), held still
// (the .bin fetched into the page once, kept there: sent again for every load it runs the capped scope out of memory)
await loadBinWorld(page, worldUrl);
await page.evaluate(async (url) => { globalThis.__clWorld = await (await fetch(url)).arrayBuffer(); }, worldUrl);
const settle = async () => {
  await page.evaluate(async () => {
    const T = globalThis.__tidemote;
    T.loadWorld(globalThis.__unpackWorld(globalThis.__clWorld));
    const t0 = T.eng.simTime;
    T.setSpeed(1);
    while (T.eng.simTime < t0 + 0.1) await new Promise((r) => setTimeout(r, 30));
    T.setSpeed(0);
    T.look.set({ grain: 0 }, 1);
  });
};
await settle();

// ---- the spots: chosen once from the saved world, then kept
const world = unpackWorld(fs.readFileSync(v.world));
let spots;
if (fs.existsSync(spotFile)) spots = JSON.parse(fs.readFileSync(spotFile, 'utf8'));
else {
  const [W, H] = world.cpu.grid, cnt = world.cpu.count, NONE = 0xffffffff;
  const pu = new Uint32Array(world.gpu.parts), pf = new Float32Array(world.gpu.parts), PW = P_BYTES / 4;
  const gu = new Uint32Array(world.gpu.genomes), gf = new Float32Array(world.gpu.genomes), it = new Uint32Array(world.gpu.intent);
  const genomes = new Map(), gen = (k) => { if (!genomes.has(k)) genomes.set(k, readGenome(gu, gf, k)); return genomes.get(k); };
  const wrap = (d, L) => d - L * Math.round(d / L);
  const all = [];
  for (let i = 0; i < cnt; i++) {
    const o = i * PW, kind = pu[o + 4], info = pu[o + 9];
    all.push({ i, x: pf[o], y: pf[o + 1], kind, id: pu[o + 7], age: pf[o + 6], cause: info & 15, role: (info >>> 4) & 3, speed: Math.hypot(pf[o + 2], pf[o + 3]), bonds: (it[i * 4 + 2] !== NONE) + (it[i * 4 + 3] !== NONE) });
  }
  // a grid of one unit for neighbors
  const grid = new Map(), key = (x, y) => `${Math.floor(x) % W},${Math.floor(y) % H}`;
  for (const p of all) { const k = key(p.x, p.y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
  const near = (p, r) => {
    const out = [];
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++)
      for (const q of grid.get(key((p.x + dx + W) % W, (p.y + dy + H) % H)) ?? []) if (q !== p && Math.hypot(wrap(q.x - p.x, W), wrap(q.y - p.y, H)) < r) out.push(q);
    return out;
  };
  const cells = all.filter((p) => p.kind >= FIRST_LIFE).map((p) => {
    const g = gen(p.kind), n = near(p, 0.6), tree = growPlan(g, DEFAULT_K);
    return { ...p, g, plan: cellShape(g, p.role), diet: dietGuild(g), mob: mobilityGuild(g), tree, tails: hasTails(g, DEFAULT_K),
      cyst: p.cause === 14, bud: (p.cause === 9 || p.cause === 8) && p.age < 0.5,
      kin: near(p, 0.22).filter((q) => q.kind === p.kind).length, husks: n.filter((q) => q.kind === 2).length,
      silt: n.filter((q) => q.kind === 0).length, kinds: new Set(n.filter((q) => q.kind >= FIRST_LIFE).map((q) => q.kind)).size, crowd: n.filter((q) => q.kind >= FIRST_LIFE).length };
  });
  // each want: a filter and a score; the best cell of a body plan not yet shown, away from the spots already chosen
  const wants = [
    ['tissue', (c) => !c.cyst && c.g.adhesion > 0.5 && c.kin >= 3, (c) => c.kin + c.g.adhesion],
    ['filament', (c) => !c.cyst && c.tree && c.bonds === 2, (c) => (c.tree.every && c.tree.depth ? 0 : 2) + c.kin * 0.1],
    ['bud', (c) => c.bud && near(c, 0.3).some((q) => q.kind === c.kind && q.age > 1), (c) => 1 - c.age],
    ['cyst', (c) => c.cyst, (c) => c.husks + c.silt * 0.2 + c.crowd * 0.1],
    ['husks', (c) => !c.cyst && c.husks >= 2, (c) => c.husks + c.silt * 0.3],
    ['producer', (c) => !c.cyst && c.diet === 'producer' && c.bonds === 0 && c.kin === 0, (c) => c.g.photo + c.g.size * 0.3],
    ['animal', (c) => !c.cyst && c.g.photo < 0.2 && c.bonds === 0, (c) => (c.diet === 'predator' ? 1 : 0) + c.g.size * 0.3],
    ['swimmer', (c) => !c.cyst && c.bonds === 0 && c.g.swim * (1 - c.g.photo) > 0.5, (c) => c.g.swim * (1 - c.g.photo) + c.speed * 2],
    ['crowd', (c) => !c.cyst, (c) => c.kinds * 2 + c.crowd * 0.2],
    ['tails', (c) => !c.cyst && c.tails && c.bonds >= 1, (c) => c.g.tail[1] + c.kin * 0.1],
    ['plan', (c) => !c.cyst, () => 0],
  ];
  const chosen = [], plans = new Set();
  const free = (c) => chosen.every((s) => Math.hypot(wrap(s.x - c.x, W), wrap(s.y - c.y, H)) > 5);
  for (let pass = 0; chosen.length < +v.spots && pass < 3; pass++) {
    for (const [name, ok, score] of wants) {
      if (chosen.length >= +v.spots || (pass === 0 && chosen.some((s) => s.want === name))) continue;
      const pool = cells.filter((c) => ok(c) && free(c));
      if (!pool.length) { if (pass === 0) console.log(`no ${name} in this world`); continue; }
      // (a plan not yet shown first, then the score; 'plan' takes the commonest plan not yet shown)
      const best = pool.reduce((a, c) => ((plans.has(c.plan) ? 0 : 100) + score(c) > (plans.has(a.plan) ? 0 : 100) + score(a) ? c : a));
      if (pass > 0 && plans.has(best.plan) && name === 'plan') continue;
      plans.add(best.plan);
      chosen.push({ name: `${chosen.length}-${name}${pass ? pass : ''}`, want: name, id: best.id, x: best.x, y: best.y, kind: best.kind, role: best.role,
        plan: CELL_SHAPES[best.plan], diet: best.diet, mobility: best.mob, size: +best.g.size.toFixed(2), photo: +best.g.photo.toFixed(2), swim: +best.g.swim.toFixed(2),
        adhesion: +best.g.adhesion.toFixed(2), growth: best.tree ? (best.tree.every && best.tree.depth ? 'tree' : 'filament') : best.tails ? 'tails' : best.g.adhesion > DEFAULT_K.adhMin ? 'packed' : 'single',
        bonds: best.bonds, kin: best.kin, cyst: best.cyst, budding: best.bud, husks: best.husks, kinds: best.kinds, speed: +best.speed.toFixed(3) });
    }
  }
  spots = chosen;
  fs.writeFileSync(spotFile, JSON.stringify(spots, null, 1));
  console.log(`chose ${spots.length} spots: ${spotFile}`);
}

// each spot's cell now (it moved a little in the tenth of a second), by id
const locate = (s) => page.evaluate(async (s) => {
  const T = globalThis.__tidemote, res = await T.eng.requestPick([s.x, s.y], 4, 0xffffffff, { maxOut: 20000, raw: true });
  const { u32, f32, count } = res.raw;
  for (let i = 0; i < count; i++) if (u32[i * 12 + 7] === s.id) {
    return { x: f32[i * 12], y: f32[i * 12 + 1] };
  }
  return null;
}, s);
const shot = (f) => page.screenshot({ path: path.join(v.out, f) });
const fit = (z) => Math.min(+z, 1500);
const log = [];
if (v.only) spots = spots.filter((s) => new RegExp(v.only).test(s.name));
for (const s of spots) {
  const at = await locate(s);
  if (!at) { console.log(`${s.name}: cell ${s.id} not found (died or moved off?)`); continue; }
  log.push({ ...s, px: Object.fromEntries(zooms.map((z) => [z, +(0.085 * z * s.size * (1 - 0.12 * s.role)).toFixed(1)])) });
  for (const z of zooms) { await aim(page, [at.x, at.y], fit(z)); await page.waitForTimeout(700); await shot(`${s.name}_z${z}.png`); }
}
// the look off, at one mid zoom
await page.evaluate(() => globalThis.__tidemote.look.off());
for (const s of log) { const at = await locate(s); if (at) { await aim(page, [at.x, at.y], fit(mid)); await page.waitForTimeout(700); await shot(`${s.name}_z${mid}_off.png`); } }
await page.evaluate(() => globalThis.__tidemote.look.set({ grain: 0 }, 1));

// select the cell under the view's middle (a click, as a viewer picks one), the pointer then put out of the way
const select = async (s, z) => {
  const at = await locate(s);
  if (!at) return false;
  await aim(page, [at.x, at.y], fit(z));
  await page.waitForTimeout(300);
  await page.mouse.click(v.w / 2, v.h / 2);
  await page.mouse.move(v.w - 2, 2);
  await page.waitForTimeout(300);
  const id = await page.evaluate(() => globalThis.__tidemote.ride.sel()?.id);
  if (id !== s.id) console.log(`${s.name}: the click selected ${id}, not ${s.id}`);
  return true;
};
// the specimen panel's close-up: as the page has it (3 units across), and enlarged to 640x400 at 0.8 units across (the closest its zoom goes)
for (const s of log) {
  if (!(await select(s, zooms.at(-1)))) continue;
  await page.waitForTimeout(1500);
  await page.locator('#specimen').screenshot({ path: path.join(v.out, `${s.name}_specimen.png`) });
  await page.evaluate(() => { document.body.classList.add('cl-big'); globalThis.__tidemote.state.specCells = 0.8; });
  await page.waitForTimeout(1500);
  await page.locator('#specimen').screenshot({ path: path.join(v.out, `${s.name}_specimen_big.png`) });
  await page.evaluate(() => { document.body.classList.remove('cl-big'); globalThis.__tidemote.state.specCells = 3; });
}
await page.evaluate(() => globalThis.__tidemote.deselect());

// the species' names: the registry fills from a census, a second or so of the world run on (the clips load it afresh)
const names = await page.evaluate(async (kinds) => {
  const T = globalThis.__tidemote, t0 = performance.now();
  T.setSpeed(1);
  while (T.life().alive === 0 && performance.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 100));
  T.setSpeed(0);
  return kinds.map((k) => [...T.life().reg.values()].find((sp) => sp.alive && sp.slot === k)?.name ?? null);
}, log.map((s) => s.kind));
log.forEach((s, j) => { s.species = names[j]; });
fs.writeFileSync(path.join(v.out, 'spots.json'), JSON.stringify({ world: v.world, html: v.html, zooms, spots: log }, null, 1));
console.log(log.map((s) => `${s.name}: ${s.species ?? `slot ${s.kind}`} ${s.plan} ${s.diet}/${s.mobility} ${s.growth} size ${s.size}`).join('\n'));

// clips: followed at speed 1, a frame every 1/15 s of simulated time (paused while each is taken), the panel hidden
const frames = Math.round(+v.clip * 15), clips = [];
if (frames > 0) for (const s of log) for (const z of zooms.slice(-2)) {
  await settle();
  if (!(await select(s, z))) continue;
  // (followed by the tool, not the page: the page's follow keeps the cell to the side the panel leaves open)
  const follow = () => page.evaluate(() => { const T = globalThis.__tidemote, d = T.ride.sel()?.disp; if (d) { T.cam.x = d[0]; T.cam.y = d[1]; } });
  await page.evaluate(() => document.body.classList.add('cl-nospec'));
  await page.waitForTimeout(500);
  const dir = path.join(v.out, `${s.name}_z${z}_frames`);
  fs.mkdirSync(dir, { recursive: true });
  for (let k = 0; k < frames; k++) {
    await follow();
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(dir, `f${String(k).padStart(3, '0')}.png`) });
    await page.evaluate(async () => {
      const T = globalThis.__tidemote, t0 = T.eng.simTime;
      T.setSpeed(1);
      while (T.eng.simTime < t0 + 1 / 15 - 1e-4) await new Promise((r) => requestAnimationFrame(r));
      T.setSpeed(0);
    });
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => { document.body.classList.remove('cl-nospec'); globalThis.__tidemote.deselect(); });
  clips.push([dir, path.join(v.out, `${s.name}_z${z}`)]);
  console.log(`clip ${s.name} z${z}`);
}

// sheets: every spot's middle at each zoom
for (const z of [...zooms.map((z) => `z${z}`), `z${mid}_off`]) {
  const list = log.filter((s) => fs.existsSync(path.join(v.out, `${s.name}_${z}.png`)));
  const tmp = list.map((s) => { const f = path.join(v.out, `.c_${s.name}.png`); run('convert', [path.join(v.out, `${s.name}_${z}.png`), '-gravity', 'center', '-crop', '470x294+0+0', '+repage', f]); return f; });
  run('montage', [...label, ...list.flatMap((s, j) => ['-label', `${s.name} ${s.plan} ${z}`, tmp[j]]), '-tile', '5x', '-geometry', '+3+3', path.join(v.out, `sheet_${z}.png`)]);
  tmp.forEach((f) => fs.rmSync(f));
}
for (const z of ['specimen', 'specimen_big']) {
  const sp = log.filter((s) => fs.existsSync(path.join(v.out, `${s.name}_${z}.png`)));
  if (sp.length) run('montage', [...label, ...sp.flatMap((s) => ['-label', s.name, path.join(v.out, `${s.name}_${z}.png`)]), '-tile', z === 'specimen' ? '5x' : '4x', '-geometry', '+3+3', path.join(v.out, `sheet_${z}.png`)]);
}
await close();

// the clips encoded once the browser is gone (x264 beside it runs a capped scope out of memory)
for (const [dir, stem] of clips) {
  run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '15', '-i', path.join(dir, 'f%03d.png'), '-c:v', 'libx264', '-threads', '2', '-pix_fmt', 'yuv420p', '-crf', '18', `${stem}.mp4`]);
  const pick = Array.from({ length: 8 }, (_, j) => path.join(dir, `f${String(Math.round((j * (frames - 1)) / 7)).padStart(3, '0')}.png`));
  run('montage', [...pick, '-gravity', 'center', '-crop', '600x375+0+0', '-tile', '4x2', '-geometry', '+2+2', '-background', '#111', `${stem}_strip.png`]);
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log('done', v.out);
