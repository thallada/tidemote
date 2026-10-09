// Main-thread side of the soundtrack: the AudioContext, the volume, and the messages to the
// audio thread (species voices from the census, the GPU listening scans). The audio thread
// reports back the motif notes it is about to play; onSang hears them as page-clock events, with
// the cell that sings each (where it was and where it was going), for the song panel and marks.

import { voiceOf } from './mapping.js';
import { digest, recordCells } from './listen.js';
/* global __TIDEMOTE_WORKLET__ */

const KEY = 'tidemote.sound';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function createSound({ onChange = () => {}, onError = () => {}, onSang = null } = {}) {
  const pref = load();
  const st = { on: false, volume: clamp(pref.volume ?? 0.7, 0, 1), starting: null, ctx: null, node: null, gain: null, sent: new Map(), speed: 1, lastScan: 0, seq: 0, scans: new Map() };
  const persist = () => save({ volume: st.volume, on: st.on });
  const notify = () => onChange({ on: st.on, volume: st.volume });

  async function boot() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) throw new Error('Web Audio is not available in this browser');
    // Created before any click, the context starts suspended where autoplay is blocked; unlock()
    // resumes it from the first gesture.
    const ctx = new AC({ latencyHint: 'playback' });
    st.ctx = ctx;
    // Blob URLs are refused for worklets on file:// pages in Chromium; a data: URL works there.
    const url = URL.createObjectURL(new Blob([__TIDEMOTE_WORKLET__], { type: 'text/javascript' }));
    try { await ctx.audioWorklet.addModule(url); }
    catch { await ctx.audioWorklet.addModule(`data:text/javascript;charset=utf-8,${encodeURIComponent(__TIDEMOTE_WORKLET__)}`); }
    finally { URL.revokeObjectURL(url); }
    const node = new AudioWorkletNode(ctx, 'tidemote-sound', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { seed: (Math.random() * 2 ** 31) | 0 } });
    node.port.onmessage = (e) => {
      if (!e.data) return;
      if (e.data.type === 'sang') sang(e.data.notes);
      else if (e.data.type === 'load') st.load = e.data.load;
      else if (e.data.type === 'error') { console.error('soundtrack:', e.data.message); onError(e.data.message); }
    };
    const gain = ctx.createGain(); gain.gain.value = 0;
    node.connect(gain).connect(ctx.destination);
    Object.assign(st, { node, gain });
  }
  const level = (v) => (v <= 0 ? 0 : Math.pow(v, 2)); // slider position -> gain (perceptual taper)
  const ramp = (to, sec) => { const g = st.gain.gain, t = st.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + sec); };

  async function setOn(on) {
    if (on === st.on) return;
    st.on = on; persist(); notify();
    try {
      if (on) {
        st.starting = st.starting || boot();
        await st.starting;
        if (!st.on) return;
        await st.ctx.resume(); // pending until the browser allows audio
        if (st.on) ramp(level(st.volume), 1.2);
      } else if (st.gain) {
        ramp(0, 0.4);
        setTimeout(() => { if (!st.on && st.ctx) st.ctx.suspend(); }, 450);
      }
    } catch (err) { st.on = false; notify(); onError(String(err.message || err)); }
  }
  function setVolume(v) {
    st.volume = clamp(v, 0, 1); persist(); notify();
    if (st.gain && st.on) { const g = st.gain.gain; g.cancelScheduledValues(st.ctx.currentTime); g.setTargetAtTime(level(st.volume), st.ctx.currentTime, 0.05); }
  }
  const post = (m) => { if (st.node) st.node.port.postMessage(m); };

  // Called on every census. species: [slot, genome] of each living species (its voice is sent
  // only when a slot's species changed); world: { light, tide }.
  function census({ species, pop, world }) {
    if (!st.node || !st.on) return;
    const all = [];
    for (const [s, g] of species) {
      const voice = st.sent.get(s) !== g.serial ? voiceOf(g) : null;
      st.sent.set(s, g.serial);
      all.push({ slot: s, serial: g.serial, voice, pop: pop[s] });
    }
    post({ type: 'slots', all: true, slots: all });
    post({ type: 'world', world });
  }

  // notes the audio thread is about to play: [slot, seconds from now, note, line, scan, record, seconds it sounds, seconds a step]
  // → { at (performance.now() ms), dur (ms), step (ms), whole (from a whole song: a species picked or played), slot, k, line, cell: { x, y, vx, vy, t (sim time), id } | null }
  function sang(notes) {
    if (!onSang) return;
    const lat = st.ctx ? (st.ctx.outputLatency || 0) + (st.ctx.baseLatency || 0) : 0, now = performance.now();
    onSang(notes.map(([slot, dt, k, line, scan, rec, dur, step]) => {
      const S = st.scans.get(scan);
      const c = S && rec >= 0 ? S.cells.subarray(rec * 5, rec * 5 + 5) : null;
      return { at: now + (dt + lat) * 1000, dur: (dur || 0) * 1000, step: (step || 0) * 1000, whole: scan === -1, slot, k, line, cell: c && c.length === 5 ? { x: c[0], y: c[1], vx: c[2], vy: c[3], id: c[4], t: S.sim } : null };
    }));
  }

  // Called on every listening scan (engine.onListen). Returns keep probabilities for the next scan.
  function listen(data, { selSlot = -1, lit = null } = {}) {
    if (!st.node || !st.on) return null;
    const seq = ++st.seq;
    if (onSang) {
      st.scans.set(seq, { cells: recordCells(data.records, data.view), sim: data.simTime });
      st.scans.delete(seq - 16);
    }
    const now = performance.now(), dt = (now - st.lastScan) / 1000;
    st.lastScan = now;
    // the simulation's real speed (sim seconds per second), measured, not the setting
    if (dt > 0.01 && dt < 1) st.speed += (Math.min(500, data.window / dt) - st.speed) * 0.3;
    const { msg, keep } = digest(data, { speed: st.speed, selSlot, lit, seq });
    // This scan sampled the picked species' cells in full and the rest at the keep it was given
    // (the last one returned); the audio thread weights them back to their real share.
    msg.sampled = { sel: st.lastSel ?? -1, keep: st.lastKeep ?? 0.05 };
    st.lastSel = selSlot; st.lastKeep = keep ? keep[8] : st.lastKeep;
    st.node.port.postMessage(msg, [msg.ev.buffer]);
    return keep;
  }
  return {
    get on() { return st.on; }, get volume() { return st.volume; },
    // the audio thread's load: the share of real time it spends rendering (null when off)
    get load() { return st.on ? st.load ?? null : null; },
    // on, and the browser lets it play
    get playing() { return st.on && !!st.ctx && st.ctx.state === 'running'; },
    // resume from inside a click or key press, where autoplay is blocked
    unlock: () => { if (st.on && st.ctx) st.ctx.resume(); },
    toggle: () => setOn(!st.on), setOn, setVolume,
    census, listen, era: (name) => post({ type: 'era', name }),
    // play a species' motif alone (its genome; tag names its notes in onSang). Turns sound on.
    async audition(genome, tag) {
      if (!st.on) await setOn(true);
      if (st.starting) await st.starting;
      if (st.on) post({ type: 'audition', slot: tag, voice: voiceOf(genome) });
    },
    reset: () => { st.sent.clear(); post({ type: 'reset' }); },
    // a new world begins: its era's song plays as soon as the soundtrack is heard
    async overture() { if (st.starting) await st.starting.catch(() => {}); if (st.on) post({ type: 'open' }); },
    wantsOn: pref.on ?? true,
  };
}
