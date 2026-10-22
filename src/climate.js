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

// The pool's events (docs/catastrophes.md), rare and each with a run-up: a drought (the water falls and the pool
// parts into basins, then rain refills it), a storm (clouds, cold rain, raindrops' ring waves, rough water) and a
// leaf (it floats onto the pool and shades the water under it for some minutes). `eventPlan` in K forces events
// for tests: "drought@900,leaf@2400" (simulated seconds).
export const EVENT_TYPES = ['drought', 'storm', 'leaf'];
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const ramp = (t, a, b) => ease((t - a) / Math.max(b - a, 1e-6));

/** An event's effect on the pool at time t: level (below the era's), rain, sky, drying, currents, temperature, leaf. */
export function eventAt(ev, t, levelTo) {
  const out = { level: levelTo, rain: 0, sky: 1, evap: 0, turb: 1, dT: 0, leaf: null, phase: null };
  if (!ev || t < ev.t) return out;
  const u = t - ev.t;
  if (ev.type === 'drought') {
    const { fall, hold, refill } = ev, low = ev.low;
    if (u < fall) {
      // the water falls, slowly at first, in warm dry weather
      out.level = levelTo + (low - levelTo) * ease(u / fall); out.evap = Math.sin(Math.PI * u / fall);
      out.dT = 3 * ease(u / fall); out.sky = 1 + 0.1 * ease(u / fall); out.phase = 'drying';
    } else if (u < fall + hold) {
      out.level = low - 0.03 * (u - fall) / hold; out.evap = 0.25; out.dT = 3; out.sky = 1.1; out.phase = 'dry';
    } else if (u < fall + hold + refill) {
      // rain: it refills the pool, cold and dark under cloud, the water rough
      const v = (u - fall - hold) / refill;
      out.level = low - 0.03 + (levelTo - low + 0.03) * ease(v);
      out.rain = Math.min(1, v * 6, (1 - v) * 4 + 0.3); out.sky = 1 - 0.55 * out.rain; out.turb = 1 + 1.2 * out.rain;
      out.dT = 3 - 6 * ease(v * 3); out.phase = 'rain';
    } else {
      const v = (u - fall - hold - refill) / 120;
      if (v < 1) { out.rain = 0.3 * (1 - v); out.sky = 1 - 0.2 * (1 - v); out.dT = -3 * (1 - ease(v)); out.phase = 'after'; }
    }
  } else if (ev.type === 'storm') {
    const r = Math.min(ramp(u, 0, 40), 1 - ramp(u, ev.dur - 60, ev.dur));
    out.rain = r; out.sky = 1 - 0.6 * r; out.turb = 1 + 1.6 * r; out.dT = -4 * Math.min(ramp(u, 0, 120), 1 - ramp(u, ev.dur, ev.dur + 240));
    out.level = Math.min(1, levelTo + 0.04 * r); out.phase = u < ev.dur ? 'storm' : u < ev.dur + 240 ? 'after' : null;
  } else if (ev.type === 'leaf') {
    const r = Math.min(ramp(u, 0, 40), 1 - ramp(u, ev.dur - 120, ev.dur));
    if (r > 0) {
      out.leaf = [ev.x + ev.vx * u, ev.y + ev.vy * u, ev.len, ev.dark * r, ev.angle + ev.spin * u, ev.seed, ev.width, 0];
      out.phase = 'leaf';
    }
  }
  return out;
}

/** A drawn event of `type` starting at t (sizes relative to a world of w × h units; ranges from K, DEFAULT_K's). */
export function makeEvent(type, t, rng, w, h, K = {}) {
  const pick = (r, d) => climateMix(...(r || d), rng());
  if (type === 'drought') return { type, t, fall: pick(K.droughtFall, [300, 480]), hold: pick(K.droughtHold, [150, 300]), refill: pick(K.droughtRefill, [90, 150]), low: pick(K.droughtLow, [0.35, 0.6]) };
  if (type === 'storm') return { type, t, dur: pick(K.stormDur, [240, 420]) };
  const len = pick(K.leafLen, [0.18, 0.32]) * Math.min(w, h), a = rng() * Math.PI * 2, sp = climateMix(0.01, 0.04, rng());
  return { type, t, dur: pick(K.leafDur, [420, 720]), x: rng() * w, y: rng() * h, len, dark: pick(K.leafDark, [0.75, 0.92]),
    angle: rng() * Math.PI * 2, spin: (rng() - 0.5) * 0.002, seed: rng() * 100, width: climateMix(0.35, 0.55, rng()), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp };
}
/** How long an event lasts, run-up and aftermath included. */
export const eventSpan = (ev) => (ev.type === 'drought' ? ev.fall + ev.hold + ev.refill + 120 : ev.type === 'storm' ? ev.dur + 240 : ev.dur);

export function createClimate(eng, rng = Math.random) {
  const climate = { tick, reset, onEra: null, onExcursion: null, onEvent: null, force };
  const K = eng.K || {};
  const plan = () => String(K.eventPlan || '').split(',').filter(Boolean).map((x) => { const [type, at] = x.split('@'); return { type, at: +at }; });
  // the first event comes no sooner than eventFirst minutes, then one about every eventEvery (0: none)
  const gap = () => climateMix(0.5, 1.5, rng()) * (K.eventEvery ?? 60) * 60;
  function reset() {
    Object.assign(climate, {
      name: 'The First Tides', started: 0, next: climateMix(600, 900, rng()),
      ambientTo: eng.ambient, tideTo: Array.from(eng.tide.filter((_, i) => i % 4 === 3)),
      tempTo: eng.temp, excursion: null, announced: null,
      flow: null, index: 1,
      history: [{ t: 0, name: 'The First Tides', ambient: eng.ambient, temp: eng.temp }],
      levelTo: 1, event: null, events: [], phase: null, plan: plan(),
      nextEvent: (K.eventEvery ?? 60) > 0 && !K.eventPlan ? (K.eventFirst ?? 25) * 60 + gap() * 0.5 : Infinity,
    });
  }
  /** Start an event of `type` now (or in `delay` s), as the climate would (the page's tools and tests). */
  function force(type, delay = 0) {
    climate.event = makeEvent(type, eng.simTime + delay, rng, eng.grid[0], eng.grid[1], K);
    climate.event.startLevel = climate.levelTo;
    climate.events.push(climate.event);
    return climate.event;
  }
  function eventTick(dt) {
    const t = eng.simTime;
    for (const p of climate.plan) if (!p.done && t >= p.at) { p.done = true; force(p.type); }
    if (t >= climate.nextEvent && !climate.event) {
      const w = K.eventMix || [0.45, 0.3, 0.25];
      let r = rng() * w.reduce((a, b) => a + b, 0), k = 0;
      while (k < w.length - 1 && r >= w[k]) { r -= w[k]; k++; }
      force(EVENT_TYPES[k]);
      climate.nextEvent = t + eventSpan(climate.event) + gap();
    }
    const ev = climate.event;
    // between events the level follows the era's (some eras are low water: sandbars and islands)
    const e = eventAt(ev, t, climate.levelTo);
    const before = climate.phase;
    climate.phase = e.phase;
    if (ev && t > ev.t + eventSpan(ev)) climate.event = null;
    if (ev && e.phase !== before) climate.onEvent?.(ev, e.phase, before);
    eng.level = ev && t >= ev.t ? e.level : eng.level + (climate.levelTo - eng.level) * Math.min(1, dt / 120);
    eng.rain = e.rain; eng.sky = e.sky; eng.evap = e.evap; eng.turb = e.turb;
    climate.eventTemp = e.dT;
    if (e.leaf) eng.leaf.set(e.leaf); else eng.leaf.fill(0);
    // raindrops: each a ring wave from where it fell, about one a second in full rain, four at a time at most
    if (e.rain > 0 && rng() < e.rain * 1.2 * dt) {
      const k = climate.dropSlot = ((climate.dropSlot ?? -1) + 1) % 4;
      eng.drops.set([rng() * eng.grid[0], rng() * eng.grid[1], t, climateMix(1.0, 3.0, rng())], k * 4);
    }
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
    // the pool's floor shows in some eras: low water leaves sandbars and islands (moving geography)
    climate.levelTo = r() < (K.lowEras ?? 0.35) ? climateMix(0.88, 0.98, r()) : 1;
    // and the floor itself shifts a little as sediment moves, so each low water shows new bars and islands
    if (K.pond ?? 1) eng.shiftFloor?.(climate.index, K.floorDrift ?? 0.3);
    climate.history.push({ t, name: climate.name, ambient: climate.ambientTo, temp: climate.tempTo, level: climate.levelTo });
    climate.onEra?.(climate.history.at(-1), prevAmb, prevTemp);
  }
  function tick(dt) {
    if (eng.simTime > climate.next) startEra();
    const k = Math.min(1, dt / 60);
    eng.ambient += (climate.ambientTo - eng.ambient) * k;
    // the water changes slowly (about three minutes), so life can follow it
    eng.temp += (climate.tempTo - eng.temp) * Math.min(1, dt / 180);
    const x = climate.excursion;
    if ((K.pond ?? 1) && eng.leaf) { eventTick(dt); eng.stepFloor?.(); }
    eng.excursion = excursionAt(x, eng.simTime) + (climate.eventTemp || 0);
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

// abiogenesis: about one spark of life every 30 s in the world, spread over its silt grains (per grain per frame)
export function abioRate(silt) {
  return (1 / 30) / (Math.max(1, silt) * 60);
}
