// CPU climate rules shared by the page and headless simulation.
export const seasonAt = (t) => 0.55 + 0.45 * Math.sin((t / 300) * Math.PI * 2);
const climateMix = (a, b, t) => a + (b - a) * t;
const climatePick = (r, a) => a[Math.floor(r() * a.length)];
const ERA_ADJ = ['Restless', 'Dim', 'Bright', 'Still', 'Pale', 'Warm', 'Hollow', 'Rising', 'Long', 'Bitter', 'Green', 'Silver'];
const ERA_NOUN = ['Glare', 'Tides', 'Drift', 'Calm', 'Surge', 'Murk', 'Bloom', 'Shallows', 'Gyre', 'Hush'];

export function createClimate(eng, rng = Math.random) {
  const climate = { tick, reset, onEra: null };
  function reset() {
    Object.assign(climate, {
      name: 'The First Tides', started: 0, next: climateMix(600, 900, rng()),
      ambientTo: eng.ambient, chargeTo: eng.chargeMul, tideTo: Array.from(eng.tide.filter((_, i) => i % 4 === 3)),
      flow: null, index: 1,
      history: [{ t: 0, name: 'The First Tides', ambient: eng.ambient, charge: eng.chargeMul }],
    });
  }
  function startEra() {
    const t = eng.simTime;
    const r = rng;
    const amps = [0, 1, 2, 3].map((k) => eng.tide[k * 4 + 3]);
    const idle = amps.indexOf(Math.min(...amps));
    const active = [0, 1, 2, 3].filter((k) => k !== idle);
    const retire = active[Math.floor(r() * active.length)];
    let a = 0, b = 0;
    while (a === 0 && b === 0) { a = Math.round(climateMix(-3, 3, r())); b = Math.round(climateMix(-3, 3, r())); }
    eng.tide[idle * 4] = a; eng.tide[idle * 4 + 1] = b;
    eng.tide[idle * 4 + 2] = (r() < 0.5 ? -1 : 1) * climateMix(0.008, 0.035, r());
    climate.tideTo[idle] = climateMix(0.6, 1.1, r());
    climate.tideTo[retire] = 0;
    const prevAmb = climate.ambientTo;
    climate.ambientTo = climateMix(0.1, 0.34, r());
    climate.chargeTo = climateMix(0.6, 1.5, r());
    const newWaves = eng.randomizeCurrents(r, new Float32Array(16));
    climate.flow = { from: Float32Array.from(eng.waves), to: newWaves, t0: t, k: [Math.floor(r() * 4), Math.floor(r() * 4)] };
    climate.index++;
    climate.name = `The ${climatePick(r, ERA_ADJ)} ${climatePick(r, ERA_NOUN)}`;
    climate.started = t;
    climate.next = t + climateMix(600, 1080, r());
    climate.history.push({ t, name: climate.name, ambient: climate.ambientTo, charge: climate.chargeTo });
    climate.onEra?.(climate.history.at(-1), prevAmb);
  }
  function tick(dt) {
    if (eng.simTime > climate.next) startEra();
    const k = Math.min(1, dt / 60);
    eng.ambient += (climate.ambientTo - eng.ambient) * k;
    eng.chargeMul += (climate.chargeTo - eng.chargeMul) * k;
    for (let i = 0; i < 4; i++) eng.tide[i * 4 + 3] += (climate.tideTo[i] - eng.tide[i * 4 + 3]) * k;
    const f = climate.flow;
    if (f) {
      const u = (eng.simTime - f.t0) / 45;
      for (const w of new Set(f.k)) {
        if (u < 1) eng.waves[w * 4 + 3] = f.from[w * 4 + 3] * (1 - u);
        else if (u < 2) {
          for (let c = 0; c < 3; c++) eng.waves[w * 4 + c] = f.to[w * 4 + c];
          eng.waves[w * 4 + 3] = f.to[w * 4 + 3] * (u - 1);
        } else { eng.waves[w * 4 + 3] = f.to[w * 4 + 3]; }
      }
      if (u >= 2) climate.flow = null;
    }
  }

  reset();
  return climate;
}

export function abioRate(glint) {
  return (1 / 30) / (Math.max(1, glint) * 60);
}
