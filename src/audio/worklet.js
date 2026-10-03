// AudioWorklet entry: the DSP engine and the conductor, on the audio thread.
// Bundled separately by build.mjs and loaded from a Blob URL, so the page stays one file.
import { Engine } from './voices.js';
import { Conductor } from './conductor.js';
import { BS } from './ugens.js';

class TidemoteSound extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const seed = (options.processorOptions && options.processorOptions.seed) || 1;
    this.eng = new Engine(sampleRate, { seed });
    this.cond = new Conductor(this.eng, { seed });
    this.L = new Float32Array(BS); this.R = new Float32Array(BS); this.have = 0; // leftover samples of the last block
    this.failed = false;
    this.busyMs = 0; this.frames = 0;
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === 'load') { // fraction of real time spent rendering, since the last ask
        this.port.postMessage({ type: 'load', load: this.frames ? this.busyMs / ((this.frames / sampleRate) * 1000) : 0, voices: this.eng.voices.length });
        this.busyMs = 0; this.frames = 0; return;
      }
      try { this.cond.message(e.data); } catch (err) { this.report(err); }
    };
  }
  report(err) { if (!this.failed) { this.failed = true; this.port.postMessage({ type: 'error', message: String(err && err.stack || err) }); } }
  process(inputs, outputs) {
    const out = outputs[0], l = out[0], r = out[1] || out[0], n = l.length;
    if (this.failed) { l.fill(0); r.fill(0); return true; }
    const t0 = Date.now();
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
    this.busyMs += Date.now() - t0; this.frames += n;
    return true;
  }
}
registerProcessor('tidemote-sound', TidemoteSound);
