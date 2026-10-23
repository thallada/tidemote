// CPU climate rules shared by the page and headless simulation.
import { DEFAULT_K } from './shaders.js';

export const seasonAt = (t) => 0.55 + 0.45 * Math.sin((t / 300) * Math.PI * 2);
const climateMix = (a, b, t) => a + (b - a) * t;
const climatePick = (r, a) => a[Math.floor(r() * a.length)];
const ERA_ADJ = ['Restless', 'Dim', 'Bright', 'Still', 'Pale', 'Warm', 'Hollow', 'Rising', 'Long', 'Bitter', 'Green', 'Silver'];
const ERA_NOUN = ['Glare', 'Tides', 'Drift', 'Calm', 'Surge', 'Murk', 'Bloom', 'Shallows', 'Gyre', 'Hush'];
// An era that warms or cools by 5° or more is named for it; the others draw from the rest.
const WARMING = ['Warm', 'Rising'], COOLING = ['Bitter', 'Pale'];
const TEMPERATE = ERA_ADJ.filter((a) => !WARMING.includes(a) && !COOLING.includes(a));
export const TEMP_MIN = 4, TEMP_MAX = 28;
// the background water's temperature at the depth of a frost's night (°C)
export const FROST_WATER = 0.5;

/** An excursion's bump in degrees at time t: eased in and out over its duration. */
export function excursionAt(x, t) {
  if (!x || t < x.t || t > x.t + x.dur) return 0;
  return x.dT * Math.sin((Math.PI * (t - x.t)) / x.dur) ** 2;
}

// The pool's events (docs/catastrophes.md), rare and each with a run-up: a drought (the water falls and the pool
// parts into basins, then rain refills it), a storm (clouds, cold rain, raindrops' ring waves, rough water) and a
// duckweed (a few fronds of Lemna drift onto the pool and shade the water under them for some minutes) and a frost (a cold night: ice
// grains grow over the thin pool, pushing cells into the veins of water left between them, then thaw). `eventPlan` in K forces events
// for tests: "drought@900,duckweed@2400" (simulated seconds).
export const EVENT_TYPES = ['drought', 'storm', 'duckweed', 'frost'];
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const ramp = (t, a, b) => ease((t - a) / Math.max(b - a, 1e-6));

/** An event's effect on the pool at time t: level (below the era's), rain, sky, drying, currents, temperature, duckweed. */
export function eventAt(ev, t, levelTo) {
  const out = { level: levelTo, rain: 0, sky: 1, evap: 0, turb: 1, dT: 0, chill: 0, duck: null, frost: 0, freezing: 0, parch: 0, phase: null };
  if (!ev || t < ev.t) return out;
  const u = t - ev.t;
  // how cold, dark and rough its rain is (rainCold, rainDark, rainTurb: multiples of the defaults)
  const cold = ev.rainCold, dark = ev.rainDark, rough = ev.rainTurb;
  if (ev.type === 'drought') {
    const { fall, hold, refill } = ev, low = ev.low;
    if (u < fall) {
      // the water falls, slowly at first, in warm dry weather
      out.level = levelTo + (low - levelTo) * ease(u / fall); out.evap = Math.sin(Math.PI * u / fall);
      out.dT = 3 * ease(u / fall); out.sky = 1 + 0.1 * ease(u / fall); out.phase = 'drying';
      // the bared floor bakes as it goes (drawn: pale, then cracked; a low-water era's bars stay damp)
      out.parch = ease(u / fall);
    } else if (u < fall + hold) {
      out.level = low - 0.03 * (u - fall) / hold; out.evap = 0.25; out.dT = 3; out.sky = 1.1; out.parch = 1; out.phase = 'dry';
    } else if (u < fall + hold + refill) {
      // rain: it refills the pool, cold and dark under cloud, the water rough
      const v = (u - fall - hold) / refill;
      out.level = low - 0.03 + (levelTo - low + 0.03) * ease(v);
      out.rain = Math.min(1, v * 6, (1 - v) * 4 + 0.3); out.sky = 1 - 0.55 * dark * out.rain; out.turb = 1 + 1.2 * rough * out.rain;
      out.dT = 3 - (3 + 3 * cold) * ease(v * 3); out.parch = 1; out.phase = 'rain';
    } else {
      const v = (u - fall - hold - refill) / 120;
      if (v < 1) { out.rain = 0.3 * (1 - v); out.sky = 1 - 0.2 * dark * (1 - v); out.dT = -3 * cold * (1 - ease(v)); out.parch = 1 - ease(v); out.phase = 'after'; }
    }
  } else if (ev.type === 'storm') {
    const r = Math.min(ramp(u, 0, 40), 1 - ramp(u, ev.dur - 60, ev.dur));
    out.rain = r; out.sky = 1 - 0.6 * dark * r; out.turb = 1 + 1.6 * rough * r; out.dT = -4 * cold * Math.min(ramp(u, 0, 120), 1 - ramp(u, ev.dur, ev.dur + 240));
    out.level = Math.min(1, levelTo + 0.04 * r); out.phase = u < ev.dur ? 'storm' : u < ev.dur + 240 ? 'after' : null;
  } else if (ev.type === 'frost') {
    // night falls and the water chills; ice grows from the shallows and grain centres, holds, then thaws
    const { cool, grow, hold, thaw } = ev;
    const night = Math.min(ramp(u, 0, cool), 1 - ramp(u, cool + grow + hold, cool + grow + hold + thaw + 120));
    out.sky = 1 - 0.6 * ev.dark * night; out.chill = ev.cold * night;
    if (u < cool) out.phase = 'cooling';
    // (eased twice: the frozen share is the frost, so a patch's radius goes as its square root, and a once-eased
    // frost would still open each patch at speed; twice, every patch grows from nothing and gathers pace, and on
    // the thaw shrinks back to nothing the same way)
    else if (u < cool + grow) { const v = (u - cool) / grow; out.frost = ev.max * ease(v) ** 2; out.freezing = Math.sin(Math.PI * v); out.phase = 'freezing'; }
    else if (u < cool + grow + hold) { out.frost = ev.max; out.phase = 'frozen'; }
    else if (u < cool + grow + hold + thaw) { out.frost = ev.max * (1 - ease((u - cool - grow - hold) / thaw)) ** 2; out.phase = 'thaw'; }
    else if (u < cool + grow + hold + thaw + 120) out.phase = 'after';
  } else if (ev.type === 'duckweed') {
    const r = Math.min(ramp(u, 0, 40), 1 - ramp(u, ev.dur - 120, ev.dur));
    if (r > 0) {
      out.duck = [ev.x + ev.vx * u, ev.y + ev.vy * u, ev.len, ev.dark * r, ev.angle + ev.spin * u, ev.seed, ev.width, ev.buds];
      out.phase = 'duckweed';
    }
  }
  return out;
}

/** A drawn event of `type` starting at t (sizes relative to a world of w × h units; ranges from K). */
export function makeEvent(type, t, rng, w, h, K = DEFAULT_K) {
  const pick = (r) => climateMix(...r, rng());
  const rain = { rainCold: K.rainCold, rainDark: K.rainDark, rainTurb: K.rainTurb };
  if (type === 'drought') return { type, t, fall: pick(K.droughtFall), hold: pick(K.droughtHold), refill: pick(K.droughtRefill), low: pick(K.droughtLow), ...rain };
  if (type === 'storm') return { type, t, dur: pick(K.stormDur), ...rain };
  if (type === 'frost') return { type, t, cool: 90, grow: pick(K.frostGrow), hold: pick(K.frostHold), thaw: pick(K.frostThaw), max: pick(K.frostMax), cold: K.frostCold, dark: K.frostDark };
  // duckweed: a mother frond (len: half its length) and one to three daughters budding from its node
  const len = pick(K.duckLen) * Math.min(w, h), a = rng() * Math.PI * 2, sp = climateMix(K.duckDrift[0], K.duckDrift[1], rng());
  return { type, t, dur: pick(K.duckDur), x: rng() * w, y: rng() * h, len, dark: pick(K.duckDark),
    angle: rng() * Math.PI * 2, spin: (rng() - 0.5) * 0.004, seed: rng() * 100, width: climateMix(0.55, 0.72, rng()), buds: 1 + Math.floor(rng() * 3),
    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp };
}
/** How long an event lasts, run-up and aftermath included. */
export const eventSpan = (ev) => (ev.type === 'drought' ? ev.fall + ev.hold + ev.refill + 120 : ev.type === 'storm' ? ev.dur + 240
  : ev.type === 'frost' ? ev.cool + ev.grow + ev.hold + ev.thaw + 120 : ev.dur);

export function createClimate(eng, rng = Math.random) {
  // allowed: the event types the climate may draw (the page's Settings → Climate), all of them by default
  const climate = { tick, reset, onEra: null, onExcursion: null, onEvent: null, force, allowed: new Set(EVENT_TYPES) };
  const K = { ...DEFAULT_K, ...eng.K };
  const plan = () => String(K.eventPlan || '').split(',').filter(Boolean).map((x) => { const [type, at] = x.split('@'); return { type, at: +at }; });
  // the first event comes no sooner than eventFirst minutes, then one about every eventEvery (0: none)
  const gap = () => climateMix(0.5, 1.5, rng()) * K.eventEvery * 60;
  function reset() {
    Object.assign(climate, {
      name: 'The First Tides', started: 0, next: climateMix(600, 900, rng()),
      ambientTo: eng.ambient, tideTo: Array.from(eng.tide.filter((_, i) => i % 4 === 3)),
      tempTo: eng.temp, excursion: null, announced: null,
      flow: null, index: 1,
      history: [{ t: 0, name: 'The First Tides', ambient: eng.ambient, temp: eng.temp }],
      levelTo: 1, event: null, events: [], phase: null, plan: plan(),
      nextEvent: K.eventEvery > 0 && !K.eventPlan ? K.eventFirst * 60 + gap() * 0.5 : Infinity,
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
    // an event of a kind just turned off ends at once (the water returns to its level over a couple of minutes)
    if (climate.event && !climate.allowed.has(climate.event.type) && !climate.plan.length) climate.event = null;
    if (t >= climate.nextEvent && !climate.event && !EVENT_TYPES.some((x) => climate.allowed.has(x))) climate.nextEvent = t + gap();
    if (t >= climate.nextEvent && !climate.event) {
      const w = K.eventMix.map((x, i) => (climate.allowed.has(EVENT_TYPES[i]) ? x : 0));
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
    // between events the level eases to the era's through two lags (about two minutes in all), so it sets off
    // gently and the first islands grow from nothing rather than opening at speed
    if (ev && t >= ev.t) { eng.level = e.level; climate.levelMid = e.level; } else {
      const k = Math.min(1, dt / 60);
      climate.levelMid ??= eng.level;
      climate.levelMid += (climate.levelTo - climate.levelMid) * k;
      eng.level += (climate.levelMid - eng.level) * k;
    }
    eng.rain = e.rain; eng.sky = e.sky; eng.evap = e.evap; eng.turb = e.turb; eng.frost = e.frost; eng.freezing = e.freezing;
    climate.eventTemp = e.dT; climate.eventChill = e.chill;
    // the seconds since a drought's rain began (raindrops wetting its mud), 0 outside one
    const rainAt = ev?.type === 'drought' ? ev.t + ev.fall + ev.hold : Infinity;
    eng.mudRain = t >= rainAt ? t - rainAt : 0;
    eng.parch = e.parch;
    if (e.duck) eng.duck.set(e.duck); else eng.duck.fill(0);
    // raindrops: each a ring wave from where it fell, about one a second in full rain, four at a time at most
    if (e.rain > 0 && rng() < e.rain * 1.2 * K.rainDrops * dt) {
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
    climate.levelTo = r() < K.lowEras ? climateMix(K.lowLevel[0], K.lowLevel[1], r()) : 1;
    // and the floor itself shifts a little as sediment moves, so each low water shows new bars and islands
    if (K.pond) eng.shiftFloor?.(climate.index, K.floorDrift);
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
    if (K.pond && eng.duck) { eventTick(dt); eng.stepFloor?.(); }
    const ex = excursionAt(x, eng.simTime);
    // a frost's night chills the water toward freezing (FROST_WATER) whatever the era's warmth
    const base = eng.tbg != null ? eng.tbg - eng.excursion : eng.temp;
    eng.excursion = ex + (climate.eventTemp || 0) + (climate.eventChill || 0) * (FROST_WATER - base - ex);
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
