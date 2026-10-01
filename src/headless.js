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
    const { readGenome, dietGuild, mobilityGuild } = await import('./genome.js');
    const eng = await E.createEngine(device, 'rgba8unorm', { K: config.k });
    if (!(await eng.allocate(config.n))) throw new Error(`could not allocate ${config.n} particles`);
    const W = width, H = height;
    eng.resize(W, H);

    eng.seed(config.n, { aspect: W / H, rng });
    eng.censusEvery = 20;
    const climate = createClimate(eng, rng);
    const samples = [];
    const ledger = { births: 2, mutants: 3, starved: 5, oldAge: 6, kills: 7, extinctions: 8, grazes: 9, scavenges: 10, bites: 11 };
    let lastSample = -Infinity, lastPrint = -Infinity, prevG, prevT, latest;
    let minLivingFrac = null, collapses = 0, collapsed = false;
    const established = new Set(), lost = new Set();
    eng.onCensus = (c) => {
      const pop = c.pop, t = c.simTime;
      let living = 0, species = 0, entropy = 0, bodies = 0;
      const diet = { producer: 0, grazer: 0, predator: 0, scavenger: 0, omnivore: 0 };
      const movement = { sessile: 0, crawler: 0, swimmer: 0, drifter: 0 };
      for (let s = E.FIRST_LIFE; s < E.MAXK; s++) {
        if (!pop[s]) continue;
        living += pop[s]; species++;
        const g = readGenome(c.genomeU32, c.genomeF32, s);
        diet[dietGuild(g)] += pop[s]; movement[mobilityGuild(g)] += pop[s];
        if ((g.adhesion || 0) > eng.K.adhMin) bodies += pop[s];
      }
      for (let s = E.FIRST_LIFE; s < E.MAXK; s++) if (pop[s]) { const p = pop[s] / living; entropy -= p * Math.log(p); }
      for (const shares of [diet, movement]) for (const key in shares) shares[key] /= Math.max(1, living);
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
      latest = { t, living, silt: pop[0], glint: pop[1], husk: pop[2], species,
        effSpecies: living ? Math.exp(entropy) : 0, diet, movement, bodies: bodies / Math.max(1, living),
        ambient: eng.ambient, chargeMul: eng.chargeMul, season: eng.season,
        era: climate.name };
      if (t - lastSample >= config.sample - 1e-6 || c.frameNo === frames) record(c);
      if (t - lastPrint >= config.print - 1e-6) {
        print?.(`t=${t.toFixed(0)}s living=${living}/${eng.count} species=${species} effective=${latest.effSpecies.toFixed(2)} era="${climate.name}"`);
        lastPrint = t;
      }
    };
    function record(c) {
      const rates = {};
      for (const [key, i] of Object.entries(ledger)) rates[key] = prevG && c.simTime > prevT ? ((c.globals[i] - prevG[i]) >>> 0) * 60 / (c.simTime - prevT) : 0;
      samples.push({ ...latest, rates });
      prevG = Array.from(c.globals); prevT = lastSample = c.simTime;
    }
    const frames = Math.max(1, Math.round(config.minutes * 3600)), t0 = Date.now();
    for (let f = 0; f < frames; f++) {
      eng.season = seasonAt(eng.simTime);
      if (config.eras) climate.tick(1 / 60);
      if (f === frames - 1) eng.censusEvery = 1;
      eng.frame({ target: null, simDt: 1 / 60, time: f / 60 });
      // Pace the loop on the census readback: wait for it to land before continuing, so the CPU-side rules
      // never lag and the queue never runs ahead. (Never call queue.onSubmittedWorkDone() here: in the
      // webgpu npm package on lavapipe async callbacks can corrupt memory and abort the process.)
      while (eng.censusStage.some((s) => s.busy)) {
        checkErrors();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      checkErrors();
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
    return { config, samples, eras: climate.history, summary };
  } finally {
    Math.random = originalRandom;
    device.removeEventListener('uncapturederror', onError);
  }
}
