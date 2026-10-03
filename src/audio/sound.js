// Main-thread side of the soundtrack: the AudioContext, the volume, and the translation of
// each census into what the conductor needs (who is alive, how present, how near).

import { voiceOf } from './mapping.js';
import { digest } from './listen.js';

export const MODES = ['field', 'score', 'both'];
const MODE_NAMES = { field: 'what is in view', score: 'species score', both: 'both' };
export const modeName = (m) => MODE_NAMES[m] || m;
/* global __TIDEMOTE_WORKLET__ */

const KEY = 'tidemote.sound';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Zoom as a 0..1 "closeness": 0 when the view covers the world, 1 at 1/256 of it or less.
export function closeness(viewArea, worldArea) {
  const cover = clamp(viewArea / Math.max(worldArea, 1e-9), 1e-9, 1);
  return clamp(Math.log(1 / cover) / Math.log(256), 0, 1);
}

/**
 * Per-species presence and proximity from a census.
 * pop: living count per slot; view: { n, sx, sy } per slot (counts and summed screen position);
 * z: closeness 0..1; selSlot: selected species slot or -1; isLit(slot): highlight predicate or null.
 */
export function mixFromCensus({ slots, pop, living, view, z, selSlot = -1, isLit = null }) {
  let vLiving = 0;
  for (const s of slots) vLiving += view.n[s];
  const out = [];
  for (const s of slots) {
    const g = pop[s] / Math.max(1, living);
    const vn = view.n[s], inView = vn > 0;
    const v = vLiving > 0 ? vn / vLiving : 0;
    const p = vLiving > 0 ? g + (v - g) * z : g * (1 - 0.6 * z);
    let q = (1 - z) + z * (inView ? 1 : 0);
    if (isLit && !isLit(s)) q *= 0.55;
    const x = inView ? (view.sx[s] / vn / 255) * 1.8 - 0.9 : 0;
    out.push({ slot: s, p, q: s === selSlot ? 1 : q, x, inView, sel: s === selSlot });
  }
  return out;
}

export function createSound({ onChange = () => {}, onError = () => {} } = {}) {
  const pref = load();
  const st = { on: false, volume: clamp(pref.volume ?? 0.7, 0, 1), mode: MODES.includes(pref.mode) ? pref.mode : 'field', starting: null, ctx: null, node: null, gain: null, voices: new Map(), sent: new Map(), speed: 1, lastScan: 0 };
  const persist = () => save({ volume: st.volume, on: st.on, mode: st.mode });
  const notify = () => onChange({ on: st.on, volume: st.volume });

  async function boot() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) throw new Error('Web Audio is not available in this browser');
    const ctx = new AC({ latencyHint: 'playback' });
    // Blob URLs are refused for worklets on file:// pages in Chromium; a data: URL works there.
    const url = URL.createObjectURL(new Blob([__TIDEMOTE_WORKLET__], { type: 'text/javascript' }));
    try { await ctx.audioWorklet.addModule(url); }
    catch { await ctx.audioWorklet.addModule(`data:text/javascript;charset=utf-8,${encodeURIComponent(__TIDEMOTE_WORKLET__)}`); }
    finally { URL.revokeObjectURL(url); }
    const node = new AudioWorkletNode(ctx, 'tidemote-sound', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { seed: (Math.random() * 2 ** 31) | 0 } });
    node.port.onmessage = (e) => {
      if (e.data && e.data.type === 'error') { console.error('soundtrack:', e.data.message); onError(e.data.message); }
      else if (e.data && e.data.type === 'load' && st.onLoad) { st.onLoad(e.data); st.onLoad = null; }
    };
    const gain = ctx.createGain(); gain.gain.value = 0;
    node.connect(gain).connect(ctx.destination);
    Object.assign(st, { ctx, node, gain });
    node.port.postMessage({ type: 'mode', mode: st.mode });
  }
  const level = (v) => (v <= 0 ? 0 : Math.pow(v, 2)); // slider position -> gain (perceptual taper)

  async function setOn(on) {
    if (on === st.on) return;
    st.on = on; persist(); notify();
    try {
      if (on) {
        if (!st.ctx) { st.starting = st.starting || boot(); await st.starting; }
        if (!st.on) return;
        await st.ctx.resume();
        const g = st.gain.gain, t = st.ctx.currentTime;
        g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(level(st.volume), t + 1.2);
      } else if (st.ctx) {
        const g = st.gain.gain, t = st.ctx.currentTime;
        g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 0.4);
        setTimeout(() => { if (!st.on && st.ctx) st.ctx.suspend(); }, 450);
      }
    } catch (err) { st.on = false; notify(); onError(String(err.message || err)); }
  }
  function setVolume(v) {
    st.volume = clamp(v, 0, 1); persist(); notify();
    if (st.ctx && st.on) { const g = st.gain.gain, t = st.ctx.currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(level(st.volume), t, 0.05); }
  }
  const post = (m) => { if (st.node) st.node.port.postMessage(m); };

  // Called on every census. env: { census, reg (serial -> registry entry), z, selSlot, isLit, world }
  function census({ slots, pop, living, view, genomeOf, serialOf, z, selSlot, isLit, world }) {
    if (!st.node || !st.on) return;
    const mixed = mixFromCensus({ slots, pop, living, view, z, selSlot, isLit });
    mixed.sort((a, b) => (b.sel ? 1 : 0) - (a.sel ? 1 : 0) || b.p - a.p);
    const species = [];
    for (const m of mixed.slice(0, 28)) {
      const id = serialOf(m.slot);
      let voice = st.voices.get(id);
      if (!voice) { voice = voiceOf(genomeOf(m.slot)); st.voices.set(id, voice); if (st.voices.size > 4000) st.voices.clear(); }
      species.push({ id, voice, p: m.p, q: m.q, x: m.x, inView: m.inView, sel: m.sel });
    }
    post({ type: 'world', world, species });
    // every living species' slot, for the field mix (voices only when a slot's species changed)
    const all = [];
    for (const s of slots) {
      const serial = serialOf(s);
      let voice = null;
      if (st.sent.get(s) !== serial) { st.sent.set(s, serial); voice = st.voices.get(serial) || voiceOf(genomeOf(s)); st.voices.set(serial, voice); }
      all.push({ slot: s, serial, voice, pop: pop[s] });
    }
    post({ type: 'slots', all: true, slots: all });
  }

  // Called on every listening scan (engine.onListen). Returns keep probabilities for the next scan.
  function listen(data, { selSlot = -1, lit = null } = {}) {
    if (!st.node || !st.on) return null;
    const now = performance.now(), dt = (now - st.lastScan) / 1000;
    st.lastScan = now;
    // the simulation's real speed (sim seconds per second), measured, not the setting
    if (dt > 0.01 && dt < 1) st.speed += (Math.min(500, data.window / dt) - st.speed) * 0.3;
    const { msg, keep } = digest(data, { speed: st.speed, selSlot, lit });
    st.node.port.postMessage(msg, [msg.ev.buffer]);
    return keep;
  }
  function setMode(m) {
    st.mode = MODES.includes(m) ? m : 'field'; persist(); notify();
    post({ type: 'mode', mode: st.mode });
  }
  return {
    get on() { return st.on; }, get volume() { return st.volume; },
    toggle: () => setOn(!st.on), setOn, setVolume,
    census, spark: (pan, near) => post({ type: 'spark', pan, near }), era: (name) => post({ type: 'era', name }),
    reset: () => { st.voices.clear(); st.sent.clear(); post({ type: 'reset' }); },
    listen, setMode, get mode() { return st.mode; },
    _post: (m) => post(m), // for tools and tests: send a raw message to the audio thread
    // audio-thread load: resolves { load (fraction of real time), voices }
    load: () => new Promise((ok) => { if (!st.node) return ok(null); st.onLoad = ok; st.node.port.postMessage({ type: 'load' }); }), cycleMode: () => setMode(MODES[(MODES.indexOf(st.mode) + 1) % MODES.length]),
    wantsOn: !!pref.on,
  };
}
