// Do the contacts vsPoint draws each cell flattened against (contactGather's touch) match the cells it truly presses on,
// on the frames its grid cell does not search (the alternating checkerboard)? Several frames in a row at speed 1, each
// cell's contacts as drawn against a brute-force search on the CPU over the same positions, by the grid cell's turn.
//   tools/gpu-node.sh tools/touchcheck.mjs [--n 32768] [--mature 60] [--zoom 150] [--html dist/tidemote.html] [--layout slot|index]
// layout: index, touch by the particle's sorted index (before 2026-11-13); slot, beside its record in the sway table.
// Needs a build whose touch buffer has COPY_SRC.
import { cliArgs, openPage } from './pagelab.mjs';

const v = { n: 32768, mature: 60, zoom: 150, html: 'dist/tidemote.html', frames: 8, layout: 'slot', speed: 1, contacts: '', ...cliArgs() };
const { page, close } = await openPage({ ...v, tmp: 'touch-' });
const out = await page.evaluate(async ({ zoom, frames, layout, speed, contacts }) => {
  const T = globalThis.__tidemote, e = T.eng, d = e.device, cam = T.cam;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const L = T.life();
  let top = null;
  for (const sp of L.reg.values()) if (sp.alive && (!top || sp.pop > top.pop)) top = sp;
  await T.findMember(top.serial);
  await sleep(300);
  const c0 = { x: cam.x, y: cam.y }; T.deselect(); Object.assign(cam, c0); T.state.follow = false;
  const ppuFit = Math.max(innerWidth / e.grid[0], innerHeight / e.grid[1]);
  cam.zoom = cam.zoomTarget = zoom / ppuFit; cam.anchor = null;
  T.setSpeed(speed);
  // (contacts: the tuner's knob pinned, 0 a quarter of the grid cells searching each frame, 1 half)
  if (contacts !== '') T.setTune({ contacts: +contacts });
  await sleep(2500);
  const read = (buf, size) => { const s = d.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }); const enc = d.createCommandEncoder(); enc.copyBufferToBuffer(buf, 0, s, 0, size); d.queue.submit([enc.finish()]); return s; };
  const snaps = [], orig = e.frame.bind(e);
  const genomes = read(e.b.genomes, e.b.genomes.size);
  await new Promise((done) => {
    e.frame = (o) => {
      orig(o);
      if (snaps.length < frames) snaps.push({ odd: e._gatherN ?? +e._gatherOdd, steps: o.steps, cam: { x: cam.x, y: cam.y }, touch: read(e.b.touch, e.b.touch.size), sway: read(e.b.sway, e.b.sway.size), parts: read(e.b.parts, e.count * 40) });
      else { e.frame = orig; done(); }
    };
  });
  await genomes.mapAsync(GPUMapMode.READ);
  const gf = new Float32Array(genomes.getMappedRange().slice(0));
  const [gw, gh] = e.grid, FIRST_LIFE = 3, NONE = 0xffffffff, W = innerWidth, H = innerHeight;
  const res = [];
  for (const s of snaps) {
    for (const k of ['touch', 'sway', 'parts']) await s[k].mapAsync(GPUMapMode.READ);
    const swb = s.sway.getMappedRange(), t = new Uint32Array(s.touch.getMappedRange()), sw = new Uint32Array(swb), swf = new Float32Array(swb);
    const pb = s.parts.getMappedRange(), f = new Float32Array(pb), u = new Uint32Array(pb);
    const N = e.count, swN = sw.length / 14;
    const size = (i) => gf[u[i * 10 + 4] * 56 + 31] * (1 - 0.12 * ((u[i * 10 + 9] >> 4) & 3));
    // the living by grid cell, for the brute-force search
    const byCell = new Map();
    for (let i = 0; i < N; i++) { if (u[i * 10 + 4] < FIRST_LIFE) continue; const key = Math.floor(f[i * 10]) + gw * Math.floor(f[i * 10 + 1]); (byCell.get(key) || byCell.set(key, []).get(key)).push(i); }
    // the newest record time (the gathering just now)
    let now = -1;
    for (let k = 0; k < swN; k++) if (sw[k * 14] !== 0 && swf[k * 14 + 3] > now) now = swf[k * 14 + 3];
    const st = [0, 1].map(() => ({ cells: 0, exact: 0, jac: 0, drawn: 0, wrong: 0, missing: 0, none: 0 }));
    // newborns in view (cause 9, under BIRTH_T old): how many have a record seen born (LOOK_BORN), and drawn budding
    // from their mother (a shift), which their first sight decides
    const born = { cells: 0, seenBorn: 0, budding: 0 };
    for (let i = 0; i < N; i++) {
      if (u[i * 10 + 4] < FIRST_LIFE) continue;
      const x = f[i * 10], y = f[i * 10 + 1];
      let dx = x - s.cam.x, dy = y - s.cam.y; dx -= gw * Math.round(dx / gw); dy -= gh * Math.round(dy / gh);
      if (Math.abs(dx) > W / (2 * zoom) - 1 || Math.abs(dy) > H / (2 * zoom) - 1) continue;
      const cx = Math.floor(x), cy = Math.floor(y);
      const half = ((cx + cy + (s.odd & 1)) & 1) === 0 ? 1 : 0;
      // truth: the six nearest within reach (contactGather's measure)
      const si = size(i), cand = [];
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const key = ((cx + ox + gw) % gw) + gw * ((cy + oy + gh) % gh);
        for (const j of byCell.get(key) || []) {
          if (j === i) continue;
          let ex = f[j * 10] - x, ey = f[j * 10 + 1] - y; ex -= gw * Math.round(ex / gw); ey -= gh * Math.round(ey / gh);
          const kk = Math.hypot(ex, ey) / (0.085 * 1.3 * (si + size(j)));
          if (kk < 1) cand.push([kk, u[j * 10 + 7]]);
        }
      }
      cand.sort((a, b) => a[0] - b[0]);
      const truth = new Set(cand.slice(0, 6).map((c) => c[1]));
      // drawn: the row vsPoint reads
      let row = -1;
      if (layout === 'index') row = i * 6;
      else {
        const id = u[i * 10 + 7], a = id % swN;
        const b = (() => { const aa = id % swN; const bb = ((Math.imul((id ^ (id >>> 16)) >>> 0, 0x45d9f3b) ^ 0x9e3779b9) >>> 0) % swN; return bb === aa ? (aa + 1) % swN : bb; })();
        const slot = sw[a * 14] === id ? a : sw[b * 14] === id ? b : -1;
        if (slot >= 0 && Math.abs(swf[slot * 14 + 3] - now) < 0.2) row = slot * 6;
      }
      const drawn = new Set();
      if (row >= 0) for (let c = 0; c < 6; c++) { const j = t[row + c]; if (j === NONE) break; if (j < N && u[j * 10 + 4] >= FIRST_LIFE) drawn.add(u[j * 10 + 7]); }
      if ((u[i * 10 + 9] & 15) === 9 && f[i * 10 + 6] < 0.9) {
        const id = u[i * 10 + 7], k = sw[(id % swN) * 14] === id ? id % swN : -1;
        let slot = k;
        if (slot < 0) for (let q = 0; q < swN && slot < 0; q++) if (sw[q * 14] === id) slot = q;
        born.cells++;
        if (slot >= 0 && (sw[slot * 14 + 8] & 0x1000)) { born.seenBorn++; if (sw[slot * 14 + 11] !== 0) born.budding++; }
      }
      const S = st[half];
      S.cells++;
      if (row < 0) S.none++;
      const inter = [...drawn].filter((q) => truth.has(q)).length, uni = new Set([...drawn, ...truth]).size;
      if (inter === uni) S.exact++;
      S.jac += uni ? inter / uni : 1;
      S.drawn += drawn.size; S.wrong += drawn.size - inter; S.missing += truth.size - inter;
    }
    const fmt = (S) => ({ cells: S.cells, exact: +(S.exact / Math.max(1, S.cells)).toFixed(3), jaccard: +(S.jac / Math.max(1, S.cells)).toFixed(3), wrongPerCell: +(S.wrong / Math.max(1, S.cells)).toFixed(2), missingPerCell: +(S.missing / Math.max(1, S.cells)).toFixed(2), noRecord: S.none });
    res.push({ steps: s.steps, odd: s.odd, searched: fmt(st[1]), notSearched: fmt(st[0]), born });
  }
  return res;
}, { zoom: +v.zoom, frames: +v.frames, layout: v.layout, speed: +v.speed, contacts: String(v.contacts) });
for (const r of out) console.log(JSON.stringify(r));
await close();
