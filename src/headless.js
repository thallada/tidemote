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
    const frames = Math.max(1, Math.round(config.minutes * 3600)), t0 = Date.now();
    for (let f = 0; f < frames; f++) {
      eng.season = seasonAt(eng.simTime);
      if (config.eras) climate.tick(1 / 60);
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
      eng.frame({ target: null, simDt: 1 / 60, time: f / 60 });
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
      frames, msPerFrame: wallSeconds * 1000 / frames, wallSeconds };
    if (snapshot) await snapshot(eng, frames);
    checkErrors();
    return { config, samples, eras: climate.history, summary, outcome: summarizeRun(samples, { count: eng.count }) };
  } finally {
    Math.random = originalRandom;
    device.removeEventListener('uncapturederror', onError);
  }
}
