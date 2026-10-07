// AudioWorklet entry: the DSP engine and the conductor, on the audio thread.
// Bundled separately by build.mjs and loaded from a Blob URL, so the page stays one file.
//
// It watches its own load (time spent rendering per second of audio) and keeps it in budget: a
// device that can't keep up (a phone, or any machine once it heats up and slows) would otherwise
// miss its deadlines and crackle. Over budget, fewer notes may sound at once and the oldest fade
// out; with room to spare, the limit creeps back up.
import { Engine } from './voices.js';
import { Conductor } from './conductor.js';
import { BS } from './ugens.js';

class TidemoteSound extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const seed = (options.processorOptions && options.processorOptions.seed) || 1;
    this.eng = new Engine(sampleRate, { seed });
    this.cond = new Conductor(this.eng, { seed });
    this.cond.post = (m) => this.port.postMessage(m);
    this.L = new Float32Array(BS); this.R = new Float32Array(BS); this.have = 0; // leftover samples of the last block
    this.failed = false;
    this.busy = 0; this.span = 0; this.load = 0; this.lastPost = 0;
    this.eng.maxVoices = VOICES[1];
    this.port.onmessage = (e) => {
      try { this.cond.message(e.data); } catch (err) { this.report(err); }
    };
  }
  report(err) { if (!this.failed) { this.failed = true; this.port.postMessage({ type: 'error', message: String(err && err.stack || err) }); } }
  process(inputs, outputs) {
    const out = outputs[0], l = out[0], r = out[1] || out[0], n = l.length;
    if (this.failed) { l.fill(0); r.fill(0); return true; }
    const t0 = Date.now(); // Date's millisecond steps average out: P(a step lands inside a call) ∝ its length
    try {
      let o = 0;
      while (o < n) {
        if (this.have === 0) { this.cond.render(this.L, this.R); this.have = BS; }
        const take = Math.min(this.have, n - o), from = BS - this.have;
        l.set(this.L.subarray(from, from + take), o);
        if (r !== l) r.set(this.R.subarray(from, from + take), o);
        this.have -= take; o += take;
      }
    } catch (err) { this.report(err); l.fill(0); r.fill(0); }
    this.busy += Date.now() - t0; this.span += (n / sampleRate) * 1000;
    if (this.span >= 500) this.adapt();
    return true;
  }
  adapt() {
    const load = this.busy / this.span, e = this.eng, live = e.voices.length - e.fading;
    this.load += (load - this.load) * 0.5;
    if (load > 0.7) e.maxVoices = Math.max(VOICES[0], Math.min(e.maxVoices, Math.floor(live * 0.75)));
    else if (load > 0.5) e.maxVoices = Math.max(VOICES[0], e.maxVoices - 4);
    else if (load < 0.3) e.maxVoices = Math.min(VOICES[2], e.maxVoices + 2);
    this.busy = 0; this.span = 0;
    if (currentTime - this.lastPost >= 2) { this.lastPost = currentTime; this.port.postMessage({ type: 'load', load: this.load }); }
  }
}
const VOICES = [16, 72, 96]; // the voice limit's floor, start and ceiling
registerProcessor('tidemote-sound', TidemoteSound);
