// CPU climate rules shared by the page and headless simulation.
export const seasonAt = (t) => 0.55 + 0.45 * Math.sin((t / 300) * Math.PI * 2);
const climateMix = (a, b, t) => a + (b - a) * t;
const climatePick = (r, a) => a[Math.floor(r() * a.length)];
const ERA_ADJ = ['Restless', 'Dim', 'Bright', 'Still', 'Pale', 'Warm', 'Hollow', 'Rising', 'Long', 'Bitter', 'Green', 'Silver'];
const ERA_NOUN = ['Glare', 'Tides', 'Drift', 'Calm', 'Surge', 'Murk', 'Bloom', 'Shallows', 'Gyre', 'Hush'];
// An era that warms or cools by 5° or more is named for it; the others draw from the rest.
const WARMING = ['Warm', 'Rising'], COOLING = ['Bitter', 'Pale'];
const TEMPERATE = ERA_ADJ.filter((a) => !WARMING.includes(a) && !COOLING.includes(a));
export const TEMP_MIN = 4, TEMP_MAX = 28;

/** An excursion's bump in degrees at time t: eased in and out over its duration. */
export function excursionAt(x, t) {
  if (!x || t < x.t || t > x.t + x.dur) return 0;
  return x.dT * Math.sin((Math.PI * (t - x.t)) / x.dur) ** 2;
}

export function createClimate(eng, rng = Math.random) {
  const climate = { tick, reset, onEra: null, onExcursion: null };
  function reset() {
    Object.assign(climate, {
      name: 'The First Tides', started: 0, next: climateMix(600, 900, rng()),
      ambientTo: eng.ambient, chargeTo: eng.chargeMul, tideTo: Array.from(eng.tide.filter((_, i) => i % 4 === 3)),
      tempTo: eng.temp, excursion: null, announced: null,
      flow: null, index: 1,
      history: [{ t: 0, name: 'The First Tides', ambient: eng.ambient, charge: eng.chargeMul, temp: eng.temp }],
    });
  }
  function startEra() {
    const t = eng.simTime;
    const r = rng;
    const amps = [0, 1, 2, 3].map((k) => eng.tide[k * 4 + 3]);
    const idle = amps.indexOf(Math.min(...amps));
    const active = [0, 1, 2, 3].filter((k) => k !== idle);
    const retire = active[Math.floor(r() * active.length)];
    eng.newTideWave(idle, r);
    climate.tideTo[idle] = climateMix(0.6, 1.1, r());
    climate.tideTo[retire] = 0;
    const prevAmb = climate.ambientTo;
    climate.ambientTo = climateMix(0.1, 0.34, r());
    climate.chargeTo = climateMix(0.6, 1.5, r());
    const newWaves = eng.randomizeCurrents(r, new Float32Array(16));
    climate.flow = { from: Float32Array.from(eng.waves), to: newWaves, t0: t, k: [Math.floor(r() * 4), Math.floor(r() * 4)] };
    climate.index++;
    // the water's temperature walks: each era starts from where the last one was heading, so a
    // world's thermal history is its own and lineages can track it
    const prevTemp = climate.tempTo;
    climate.tempTo = Math.min(TEMP_MAX, Math.max(TEMP_MIN, prevTemp + climateMix(-10, 10, r())));
    const dT = climate.tempTo - prevTemp;
    const adj = climatePick(r, dT >= 5 ? WARMING : dT <= -5 ? COOLING : TEMPERATE);
    climate.name = `The ${adj} ${climatePick(r, ERA_NOUN)}`;
    climate.started = t;
    climate.next = t + climateMix(600, 1080, r());
    // a heat wave or a cold snap in about a third of eras, somewhere in its middle
    climate.excursion = r() < 0.35 ? {
      t: t + climateMix(120, Math.max(150, climate.next - t - 300), r()),
      dT: (r() < 0.5 ? -1 : 1) * climateMix(5, 8, r()), dur: climateMix(120, 240, r()),
    } : null;
    climate.history.push({ t, name: climate.name, ambient: climate.ambientTo, charge: climate.chargeTo, temp: climate.tempTo });
    climate.onEra?.(climate.history.at(-1), prevAmb, prevTemp);
  }
  function tick(dt) {
    if (eng.simTime > climate.next) startEra();
    const k = Math.min(1, dt / 60);
    eng.ambient += (climate.ambientTo - eng.ambient) * k;
    eng.chargeMul += (climate.chargeTo - eng.chargeMul) * k;
    // the water changes slowly (about three minutes), so life can follow it
    eng.temp += (climate.tempTo - eng.temp) * Math.min(1, dt / 180);
    const x = climate.excursion;
    eng.excursion = excursionAt(x, eng.simTime);
    if (x && eng.simTime >= x.t && climate.announced !== x) {
      climate.announced = x;
      climate.history.at(-1).excursion = x;
      climate.onExcursion?.(x);
    }
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
