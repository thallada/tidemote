// Browser-compatible ecology runner; the caller owns the WebGPU device.
import { createClimate, seasonAt, abioRate } from './climate.js';

export async function runHeadless(device, config, { print, width = 640, height = 360, snapshot } = {}) {
  const originalRandom = Math.random;
  const errors = [];
  const onError = (e) => errors.push(e.error.message);
  const checkErrors = () => {
    if (errors.length) throw new Error(`GPU error: ${errors.slice(0, 3).join('; ')}`);
  };
  device.addEventListener('uncapturederror', onError);
  try {
    let seed = config.seed >>> 0;
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    Math.random = rng; // Archetype initialization also uses Math.random.
    const E = await import('./engine.js');
    const { genomeSerial, readGenome } = await import('./genome.js');
    const { communitySample, summarizeRun } = await import('./ecostats.js');
    const { ENERGY_SLOTS } = await import('./shaders.js');
    const eng = await E.createEngine(device, 'rgba8unorm', { K: config.k, hasTimestamps: device.features.has('timestamp-query') });
    if (!(await eng.allocate(config.n))) throw new Error(`could not allocate ${config.n} particles`);
    const W = width, H = height;
    eng.resize(W, H);

    eng.seed(config.n, { aspect: W / H, rng });
    eng.censusEvery = 20;
    const climate = createClimate(eng, rng);
    const samples = [];
    const ledger = { births: 2, mutants: 3, starved: 5, oldAge: 6, kills: 7, extinctions: 8, grazes: 9, scavenges: 10, bites: 11 };
    let lastSample = -Infinity, lastPrint = -Infinity, prevG, prevD, prevE, prevT, latest;
    let minLivingFrac = null, collapses = 0, collapsed = false;
    const established = new Set(), lost = new Set();
    const genomes = new Array(E.MAXK);
    eng.onCensus = (c) => {
      const pop = c.pop, t = c.simTime;
      const species = [];
      for (let s = E.FIRST_LIFE; s < E.MAXK; s++) if (pop[s]) {
        const serial = genomeSerial(c.genomeU32, s);
        let cached = genomes[s];
        if (!cached || cached.serial !== serial) genomes[s] = cached = { serial, genome: readGenome(c.genomeU32, c.genomeF32, s) };
        species.push({ pop: pop[s], genome: cached.genome });
      }
      const community = communitySample(species, eng.K.adhMin);
      const { living, diet } = community;
      const fraction = living / eng.count;
      eng.abio = abioRate(pop[1]);
      if (t > 60) {
        minLivingFrac = Math.min(minLivingFrac ?? 1, fraction);
        if (fraction < 0.02 && !collapsed) collapses++;
        collapsed = fraction < 0.02;
      }
      for (const key in diet) {
        if (diet[key] > 0.05) established.add(key);
        if (diet[key] === 0 && established.has(key)) lost.add(key);
      }
      latest = { t, silt: pop[0], glint: pop[1], husk: pop[2], stone: pop[3], ...community,
        ambient: eng.ambient, chargeMul: eng.chargeMul, season: eng.season,
        era: climate.name };
      if (t - lastSample >= config.sample - 1e-6 || c.frameNo === frames) record(c);
      if (t - lastPrint >= config.print - 1e-6) {
        print?.(`t=${t.toFixed(0)}s living=${living}/${eng.count} species=${community.species} effective=${latest.effSpecies.toFixed(2)} era="${climate.name}"`);
        lastPrint = t;
      }
    };
    function record(c) {
      const rates = {};
      for (const [key, i] of Object.entries(ledger)) rates[key] = prevG && c.simTime > prevT ? ((c.globals[i] - prevG[i]) >>> 0) * 60 / (c.simTime - prevT) : 0;
      const demography = {}, meals = {};
      const guilds = ['producer', 'grazer', 'predator', 'scavenger', 'omnivore'];
      for (const [g, guild] of guilds.entries()) {
        demography[guild] = {};
        for (const [e, event] of ['births', 'starved', 'oldAge', 'eaten'].entries()) {
          const i = g * 4 + e;
          demography[guild][event] = prevD && c.simTime > prevT ? ((c.demography[i] - prevD[i]) >>> 0) * 60 / (c.simTime - prevT) : 0;
        }
        meals[guild] = {};
        for (const [v, victim] of guilds.entries()) {
          const i = 32 + g * 5 + v;
          meals[guild][victim] = prevD && c.simTime > prevT ? ((c.demography[i] - prevD[i]) >>> 0) * 60 / (c.simTime - prevT) : 0;
        }
      }
      // energy flows per guild per simulated minute (the ledger counts thousandths)
      const energy = {};
      for (const [g, guild] of guilds.entries()) {
        energy[guild] = {};
        for (const [k, slot] of ENERGY_SLOTS.entries()) {
          const i = g * 8 + k;
          energy[guild][slot] = prevE && c.simTime > prevT ? ((c.energy[i] - prevE[i]) >>> 0) / 1000 * 60 / (c.simTime - prevT) : 0;
        }
      }
      samples.push({ ...latest, rates, demography, meals, energy });
      prevG = Array.from(c.globals); prevD = Array.from(c.demography); prevE = Array.from(c.energy); prevT = lastSample = c.simTime;
    }
    // config.step: each step covers step/60 s (coarse steps), so fewer steps fill the minutes
    const step = config.step || 1, dt = step / 60, perMinute = Math.round(3600 / step);
    const frames = Math.max(1, Math.round(config.minutes * perMinute)), t0 = Date.now();
    // config.profile: every simulated minute, time 30 steps pass by pass (in place of 30 frames)
    const profile = [];
    let prof = null;
    for (let f = 0; f < frames; f++) {
      if (config.profile && eng.timing && f % perMinute === perMinute >> 1 && f + 30 < frames) prof = { t: eng.simTime, n: 0, passes: {} };
      if (prof) {
        eng.season = seasonAt(eng.simTime);
        if (config.eras) climate.tick(dt);
        for (const [name, ms] of await eng.profileStep(dt)) prof.passes[name] = (prof.passes[name] || 0) + ms;
        if (++prof.n === 30) {
          const passes = Object.fromEntries(Object.entries(prof.passes).map(([k, ms]) => [k, +(ms / prof.n).toFixed(4)]));
          profile.push({ t: Math.round(prof.t), living: latest?.living ?? null, total: +Object.values(passes).reduce((a, b) => a + b, 0).toFixed(4), passes });
          prof = null;
        }
        checkErrors();
        continue;
      }
      eng.season = seasonAt(eng.simTime);
      if (config.eras) climate.tick(dt);
      if (f === frames - 1) eng.censusEvery = 1;
      // Before a census frame, wait until a staging buffer is free so no census is skipped. The other
      // buffer may still be in flight, so the GPU keeps working while the CPU reads the previous census,
      // which lags by at most one census (20 frames), as on the page. On the last frame wait for all.
      // (Never call queue.onSubmittedWorkDone() here: in the webgpu npm package on lavapipe async
      // callbacks can corrupt memory and abort the process.)
      const censusNext = f === frames - 1 || (eng.frameNo + 1) % eng.censusEvery === 0;
      while (censusNext && (f === frames - 1 ? eng.censusStage.some((s) => s.busy) : eng.censusStage.every((s) => s.busy))) {
        checkErrors();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      eng.frame({ target: null, simDt: dt, time: f * dt });
      checkErrors();
    }
    while (eng.censusStage.some((s) => s.busy)) {
      checkErrors();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (!latest) throw new Error('No census received');
    const wallSeconds = (Date.now() - t0) / 1000;
    const mature = samples.filter((s) => s.t > 60);
    const summary = { finalLiving: latest.living, finalLivingFrac: latest.living / eng.count, minLivingFrac,
      meanEffSpecies: mature.length ? mature.reduce((sum, s) => sum + s.effSpecies, 0) / mature.length : null,
      finalEffSpecies: latest.effSpecies, collapses, guildLosses: lost.size, erasSeen: climate.history.length,
      frames, msPerFrame: wallSeconds * 1000 / frames, wallSeconds, ...(profile.length ? { profile } : {}) };
    if (snapshot) await snapshot(eng, frames);
    checkErrors();
    return { config, samples, eras: climate.history, summary, outcome: summarizeRun(samples, { count: eng.count }) };
  } finally {
    Math.random = originalRandom;
    device.removeEventListener('uncapturederror', onError);
  }
}

/**
 * Matched-start forks: grow a world for config.warm simulated seconds in 1/60 s steps, set it aside, then
 * run that same moment forward for config.horizon seconds config.reps times under each of
 * config.variants ({ name, step, k }: step length in ticks, tunables on top of config.k, each set compiled
 * once), and report each fork's event rates and energy ledger per guild, its living cells by energy, and
 * with K.diag the per-guild diagnostics. Forks of one rep share their random seed, so variants compare
 * pair by pair (tools/fastforward/fork-meta.cjs, fork-diag.cjs, fork-hist.cjs).
 */
export async function runForks(device, config, { print } = {}) {
  const errors = [];
  const onError = (e) => errors.push(e.error.message);
  device.addEventListener('uncapturederror', onError);
  const originalRandom = Math.random;
  try {
    let seed = config.seed >>> 0;
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    Math.random = rng;
    const E = await import('./engine.js');
    const { readGenome, dietGuild } = await import('./genome.js');
    const { communitySample, DIETS } = await import('./ecostats.js');
    const { ENERGY_SLOTS, P_BYTES, DIAG_SLOTS, DIAG_STRIDE } = await import('./shaders.js');
    const eng = await E.createEngine(device, 'rgba8unorm', { K: config.k, hasTimestamps: false });
    if (!(await eng.allocate(config.n))) throw new Error(`could not allocate ${config.n} particles`);
    eng.resize(64, 36);
    eng.seed(config.n, { aspect: 16 / 9, rng });
    eng.censusEvery = 20;
    const climate = createClimate(eng, rng);
    eng.onCensus = (c) => { eng.abio = abioRate(c.pop[1]); };
    const warm = Math.round(config.warm * 60);
    for (let f = 0; f < warm; f++) {
      eng.season = seasonAt(eng.simTime);
      if (config.eras) climate.tick(1 / 60);
      while ((eng.frameNo + 1) % eng.censusEvery === 0 && eng.censusStage.every((s) => s.busy)) await new Promise((r) => setTimeout(r, 0));
      eng.frame({ target: null, simDt: 1 / 60, time: f / 60 });
    }
    while (eng.censusStage.some((s) => s.busy)) await new Promise((r) => setTimeout(r, 0));
    eng.onCensus = null;
    const snap = eng.snapshot();
    const guilds = (c) => {
      const species = [];
      for (let s = E.FIRST_LIFE; s < E.MAXK; s++) if (c.pop[s]) species.push({ pop: c.pop[s], genome: readGenome(c.genomeU32, c.genomeF32, s) });
      const cs = communitySample(species, eng.K.adhMin);
      return { living: cs.living, ...Object.fromEntries(DIETS.map((g) => [g, cs.living * cs.diet[g]])), effSpecies: cs.effSpecies };
    };
    // an engine per distinct tunables, each loaded with the same moment
    const engines = new Map([['{}', eng]]);
    for (const v of config.variants) {
      const key = JSON.stringify(v.k || {});
      if (engines.has(key)) continue;
      const e2 = await E.createEngine(device, 'rgba8unorm', { K: { ...config.k, ...(v.k || {}) }, hasTimestamps: false });
      if (!(await e2.allocate(config.n))) throw new Error('could not allocate a variant engine');
      e2.resize(64, 36);
      e2.count = eng.count; e2.grid = eng.grid.slice();
      engines.set(key, e2);
    }
    // K.diag's counters per guild: means over the once-a-second samples (scaled back from their fixed
    // point), food in reach per hungry sample, the kill funnel per cell-second, contact per hunter sample
    const SCALE = { crowd: 16, silt: 16, pack: 16, kin: 16, speed: 1000, photo: 1000, light: 1000, force: 100, energy: 1000, overlap: 16 };
    const diagOf = (c0, c1) => {
      const out = {};
      DIETS.forEach((g, gi) => {
        const dd = (k) => (c1.diag[DIAG_STRIDE * gi + DIAG_SLOTS.indexOf(k)] - c0.diag[DIAG_STRIDE * gi + DIAG_SLOTS.indexOf(k)]) >>> 0;
        const n = dd('samples');
        if (!n) return;
        const o = (out[g] = { samples: n });
        for (const k of Object.keys(SCALE)) o[k] = dd(k) / SCALE[k] / n;
        o.hungry = dd('hungry') / n;
        o.foodInReach = dd('hungry') ? dd('hungryFood') / dd('hungry') : 0;
        for (const k of ['killOpp', 'preyInReach', 'tried', 'missed', 'lost', 'won']) o[`kill.${k}`] = dd(k) / n;
        if (dd('huntSamples')) { o.preyNear = dd('preyNear') / 16 / dd('huntSamples'); o.preyNear2 = dd('preyNear2') / 16 / dd('huntSamples'); }
      });
      return out;
    };
    const forks = [];
    for (let r = 0; r < config.reps; r++) {
      for (const v of config.variants) {
        const eng = engines.get(JSON.stringify(v.k || {}));
        eng.restore(snap);
        eng.seedValue = (snap.cpu.seedValue ^ Math.imul(r + 1, 2654435761)) >>> 0;
        eng.censusEvery = 1 << 30;
        const c0 = await eng.readCensus(), g0 = guilds(c0);
        const frames = Math.round((config.horizon * 60) / v.step), dt = v.step / 60;
        for (let f = 0; f < frames; f++) {
          eng.season = seasonAt(eng.simTime);
          eng.frame({ target: null, simDt: dt, time: eng.simTime });
        }
        const c1 = await eng.readCensus(), g1 = guilds(c1);
        // each guild's living cells by energy as a share of their division mark
        const parts = await eng.readParticles();
        const W = P_BYTES / 4, edges = [0.05, 0.1, 0.25, 0.5, 1, 2];
        const hist = {}, gOf = new Map();
        for (let n = 0; n < eng.count; n++) {
          const kind = parts.u32[n * W + 4];
          if (kind < E.FIRST_LIFE) continue;
          let gk = gOf.get(kind);
          if (!gk) { const gen = readGenome(c1.genomeU32, c1.genomeF32, kind); gk = { guild: dietGuild(gen), reproE: gen.reproE }; gOf.set(kind, gk); }
          const x = parts.f32[n * W + 5] / gk.reproE;
          const h = (hist[gk.guild] ??= new Array(edges.length + 1).fill(0));
          let b = 0; while (b < edges.length && x >= edges[b]) b++;
          h[b]++;
        }
        if (errors.length) throw new Error(`GPU error: ${errors.slice(0, 3).join('; ')}`);
        const span = c1.simTime - c0.simTime;
        const d = (a, b, i) => ((b[i] - a[i]) >>> 0) * 60 / span;
        const out = { rep: r, variant: v.name, span, start: g0, end: g1, rates: {}, hist };
        if (eng.K.diag) out.diag = diagOf(c0, c1);
        const G = { births: 2, mutants: 3, starved: 5, oldAge: 6, kills: 7, grazes: 9, scavenges: 10, bites: 11 };
        for (const [k, i] of Object.entries(G)) out.rates[k] = d(c0.globals, c1.globals, i);
        DIETS.forEach((g, gi) => {
          ['births', 'starved', 'oldAge', 'eaten'].forEach((e, ei) => { out.rates[`${g}.${e}`] = d(c0.demography, c1.demography, gi * 4 + ei); });
          DIETS.forEach((v2, vi) => { out.rates[`${g}>${v2}`] = d(c0.demography, c1.demography, 32 + gi * 5 + vi); });
          // the energy ledger counts thousandths
          ENERGY_SLOTS.forEach((slot, si) => { out.rates[`${g}.E.${slot}`] = d(c0.energy, c1.energy, gi * 8 + si) / 1000; });
        });
        forks.push(out);
        print?.(`rep ${r} ${v.name}: living ${g0.living} -> ${g1.living}, kills ${out.rates.kills.toFixed(0)}/min`);
      }
    }
    return { config, start: guilds(await (async () => { eng.restore(snap); return eng.readCensus(); })()), forks };
  } finally {
    Math.random = originalRandom;
    device.removeEventListener('uncapturederror', onError);
  }
}
