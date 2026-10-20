// The start lab's simulation, for Dawn (tools/startlab.mjs) or headless Chromium (bundled by it).
// cfg: the CLI's options as strings (v); host: { log, saved (a decoded world or null), saveWorld(name, bytes) }.
export async function runLab(device, v, { log = console.error, saved = null, saveWorld: putWorld = null } = {}) {
  const originalRandom = Math.random;
  try {
    let seed = (+v.seed) >>> 0;
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    Math.random = rng;
    const E = await import('../src/engine.js');
    const { readGenome, dietGuild } = await import('../src/genome.js');
    const { communitySample, DIETS } = await import('../src/ecostats.js');
    const { createClimate, seasonAt, abioRate } = await import('../src/climate.js');
    const { encodeWorld } = await import('../src/worlds.js');

    const K = JSON.parse(v.k);
    const eng = await E.createEngine(device, 'rgba8unorm', { K, hasTimestamps: false });
    if (saved) {
      if (!(await eng.allocate(saved.cpu.count))) throw new Error('could not allocate');
      eng.resize(640, 270);
      eng.writeState({ cpu: saved.cpu, gpu: saved.gpu });
      eng.seedValue = (saved.cpu.seedValue ^ Math.imul(+v.rep + 1, 2654435761)) >>> 0;
    } else {
      if (!(await eng.allocate(+v.n))) throw new Error('could not allocate');
      eng.resize(640, 270);
      eng.seed(+v.n, { aspect: +v.aspect, rng });
    }
    const climate = createClimate(eng, rng);
    // a saved world keeps its era (as the page does on loading it)
    if (saved?.page?.climate) Object.assign(climate, saved.page.climate);
    const t0 = eng.simTime, N = eng.count, estAt = Math.max(30, Math.round(N * 0.00025));
    eng.censusEvery = 20;

    // lineages: every serial seen at a census with its parent, so a species' root is found by walking back
    // (founders are serials 1..founders; any other root with parent 0 is a spark of abiogenesis)
    const parentOf = new Map(), peak = new Map();
    const founders = eng.founders;
    if (saved?.page?.life?.reg) for (const [s, r] of saved.page.life.reg) parentOf.set(s, r.parent ?? 0);
    const rootOf = (s) => { for (let n = 0; n < 400; n++) { const p = parentOf.get(s); if (p === undefined) return { s, known: false }; if (!p) return { s, known: true }; s = p; } return { s, known: false }; };
    const hill1 = (xs) => { const n = xs.reduce((a, b) => a + b, 0); if (!n) return 0; let h = 0; for (const x of xs) if (x > 0) h -= (x / n) * Math.log(x / n); return Math.exp(h); };

    const samples = [], spatialS = [];
    let lastSample = -Infinity, latest = null, pending = null;
    eng.onCensus = (c) => {
      eng.abio = abioRate(c.pop[0]);
      const t = c.simTime - t0;
      if (t - lastSample < +v.sample - 1e-6) return;
      lastSample = t;
      const species = [];
      const roots = new Map();
      let abio = 0, unknown = 0, thriving = 0;
      for (let s = E.FIRST_LIFE; s < E.MAXK; s++) {
        const p = c.pop[s]; if (!p) continue;
        const g = readGenome(c.genomeU32, c.genomeF32, s);
        if (!parentOf.has(g.serial)) parentOf.set(g.serial, g.parent);
        const pk = Math.max(peak.get(g.serial) || 0, p); peak.set(g.serial, pk);
        if (pk >= estAt) thriving++;
        species.push({ pop: p, genome: g });
        const r = rootOf(g.serial);
        const key = r.known ? r.s : -1;
        roots.set(key, (roots.get(key) || 0) + p);
        if (!r.known) unknown += p; else if (r.s > founders) abio += p;
      }
      const cs = communitySample(species, eng.K.adhMin);
      const L = cs.living || 1;
      const byGuild = Object.fromEntries(DIETS.map((d) => [d, []]));
      for (const { pop, genome } of species) byGuild[dietGuild(genome)].push(pop);
      const dorm = DIETS.reduce((a, g, gi) => a + (c.demography[gi < 3 ? 57 + gi : 58 + gi] ?? 0), 0);
      latest = {
        t: Math.round(t), living: cs.living / N, cysts: dorm / L, species: cs.species, hill1: cs.effSpecies, hill2: cs.hill2, maxShare: cs.maxShare,
        n1pct: species.filter((s) => s.pop / L >= 0.01).length, n01pct: species.filter((s) => s.pop / L >= 0.001).length, thriving,
        diet: Object.fromEntries(DIETS.map((d) => [d, +cs.diet[d].toFixed(4)])), guildEven: hill1(DIETS.map((d) => cs.diet[d])),
        guildHill1: Object.fromEntries(DIETS.map((d) => [d, +hill1(byGuild[d]).toFixed(2)])),
        lineHill1: hill1([...roots.values()]), abioShare: abio / L, unknownShare: unknown / L,
        movement: cs.movement, bodies: cs.bodies, ambient: eng.ambient, tbg: eng.tbg, era: climate.name,
      };
      samples.push(latest);
    };

    // alpha/gamma/beta over regions of RS grid units square (as ecostats' regional census), and how unevenly
    // the living fill the regions
    async function spatialSample() {
      const p = await eng.readParticles();
      const [gw, gh] = eng.grid, RS = 16, nx = Math.max(1, Math.round(gw / RS)), ny = Math.max(1, Math.round(gh / RS));
      const reg = Array.from({ length: nx * ny }, () => new Map()), all = new Map();
      for (let i = 0; i < eng.count; i++) {
        const k = p.u32[i * 10 + 4]; if (k < E.FIRST_LIFE) continue;
        const r = Math.min(ny - 1, Math.floor(p.f32[i * 10 + 1] / gh * ny)) * nx + Math.min(nx - 1, Math.floor(p.f32[i * 10] / gw * nx));
        reg[r].set(k, (reg[r].get(k) || 0) + 1); all.set(k, (all.get(k) || 0) + 1);
      }
      let hw = 0, n = 0; const dens = [];
      // regions led by different species: the effective number of distinct regional leaders
      const leads = new Map();
      for (const m of reg) {
        const tot = [...m.values()].reduce((a, b) => a + b, 0); dens.push(tot);
        if (!tot) continue;
        hw += Math.log(hill1([...m.values()])) * tot; n += tot;
        let best = [0, 0]; for (const [k, c] of m) if (c > best[1]) best = [k, c];
        leads.set(best[0], (leads.get(best[0]) || 0) + 1);
      }
      const alpha = Math.exp(hw / Math.max(1, n)), gamma = hill1([...all.values()]);
      const dm = dens.reduce((a, b) => a + b, 0) / dens.length;
      const cv = Math.sqrt(dens.reduce((a, b) => a + (b - dm) ** 2, 0) / dens.length) / Math.max(dm, 1e-9);
      spatialS.push({ t: Math.round(eng.simTime - t0), regions: nx * ny, alpha, gamma, beta: gamma / Math.max(alpha, 1e-9), densCV: cv, leaders: hill1([...leads.values()]) });
    }

    // a collapse without the climate: frac of the living die where they are, leaving their bodies as husks
    // (litter from producers), as a starved cell does; mode 'random' (survivors anywhere) or 'refugia:R:M'
    // (survivors only within M discs of radius R grid units)
    async function cull(frac, mode) {
      // only the particles change (read and written back alone: a full state copy of a page-sized world
      // does not fit beside it on the GPU)
      const { u32: u, f32: f } = await eng.readParticles();
      const c = await eng.readCensus(), gu = c.genomeU32, gf = c.genomeF32;
      const gs = new Map();
      const [gw, gh] = eng.grid;
      let keepAt = null;
      if (mode.startsWith('refugia')) {
        const [, R, M] = mode.split(':').map(Number);
        keepAt = Array.from({ length: M }, () => [rng() * gw, rng() * gh, R]);
      }
      const inRefuge = (x, y) => keepAt.some(([cx, cy, R]) => { let dx = x - cx, dy = y - cy; dx -= gw * Math.round(dx / gw); dy -= gh * Math.round(dy / gh); return dx * dx + dy * dy < R * R; });
      let killed = 0, kept = 0;
      for (let i = 0; i < eng.count; i++) {
        const k = u[i * 10 + 4]; if (k < E.FIRST_LIFE) continue;
        const die = keepAt ? !inRefuge(f[i * 10], f[i * 10 + 1]) || rng() < frac : rng() < frac;
        if (!die) { kept++; continue; }
        let g = gs.get(k); if (!g) gs.set(k, (g = readGenome(gu, gf, k)));
        u[i * 10 + 4] = 2; f[i * 10 + 5] = eng.K.bodyE * g.size; f[i * 10 + 6] = 0;
        u[i * 10 + 9] = (u[i * 10 + 9] & 0xffff7fc0) | 1 | (g.photo > 0.4 ? 0x8000 : 0);
        killed++;
      }
      device.queue.writeBuffer(eng.b.parts, 0, u.buffer, 0, eng.count * 40);
      eng.sorted = false;
      log(`cull at ${(eng.simTime - t0).toFixed(0)}s: ${killed} died, ${kept} live on (${mode})`);
    }

    async function saveWorld(file) {
      const st = await eng.readState();
      const meta = { id: `w${Date.now().toString(36)}`, name: file.replace(/.*[\\/]/, '').replace(/\.tidemote$/, ''), savedAt: Date.now(), simTime: eng.simTime, count: eng.count, thriving: latest?.thriving ?? 0, cols: [] };
      await putWorld?.(file, await encodeWorld({ meta, ...st }));
      log(`saved ${file}`);
    }

    const culls = (v.cull || []).map((s) => { const [t, frac, ...m] = s.split(':'); return { t: +t, frac: +frac, mode: m.join(':') || 'random', done: false }; });
    const saves = (v.save || []).map((s) => { const [t, ...file] = s.split(':'); return { t: +t, file: file.join(':'), done: false }; });
    // v.warm: the first seconds in steps of 4 ticks, as the page's warm-up at Max takes them
    const end = +v.minutes * 60, warm = +(v.warm || 0), wall0 = Date.now();
    let nextSpatial = 0;
    for (let fr = 0; eng.simTime - t0 < end - 1e-6; fr++) {
      const t = eng.simTime - t0, dt = t < warm ? 4 / 60 : 1 / 60;
      for (const c of culls) if (!c.done && t >= c.t) { c.done = true; await drain(); await cull(c.frac, c.mode); }
      for (const s of saves) if (!s.done && t >= s.t) { s.done = true; await drain(); await saveWorld(s.file); }
      if (t >= nextSpatial) { nextSpatial += +v.spatialEvery; await drain(); await spatialSample(); }
      eng.season = seasonAt(eng.simTime);
      if (!v['no-eras']) climate.tick(dt);
      const censusNext = (eng.frameNo + 1) % eng.censusEvery === 0;
      while (censusNext && eng.censusStage.every((s) => s.busy)) await new Promise((r) => setTimeout(r, 0));
      eng.frame({ target: null, simDt: dt, time: eng.simTime });
      if (fr % 36000 === 0 && latest) log(`t=${latest.t}s living ${(100 * latest.living).toFixed(1)}% hill1 ${latest.hill1.toFixed(1)} thriving ${latest.thriving} ${JSON.stringify(latest.diet)} ${((Date.now() - wall0) / 1000).toFixed(0)}s wall`);
    }
    await drain();
    await spatialSample();
    for (const s of saves) if (!s.done) await saveWorld(s.file);
    async function drain() { while (eng.censusStage.some((s) => s.busy)) await new Promise((r) => setTimeout(r, 0)); }
    return { samples, spatial: spatialS, eras: climate.history, N, grid: eng.grid, founders };
  } finally { Math.random = originalRandom; }
}
