// Measure the soundtrack note by note: render a capture from tools/listen-capture.mjs through the
// audio-thread code (as listen-render.mjs does, opening a new world first), log every note the
// conductor schedules, and report how repetitive it is: for each instrument, notes per minute and
// how often the same note (instrument and pitch) comes back, and the most repeated sounds overall.
// Several world seeds' openings can be compared (how different their first notes are).
// usage: node tools/listen-score.mjs capture.json [--speed 20] [--secs 120] [--seeds 1,2,3] [--wav out.wav] [--json out.json]
//   --speed: the simulation's speed the capture is played at (sim seconds per second; the warm-up
//   runs at Max, about 20 on a desktop GPU); the capture repeats to fill --secs of audio.
//   --warm S: the world opens in a warm-up that ends after S seconds (then real time); --wav needs one seed.
import fs from 'node:fs';
import { Engine } from '../src/audio/voices.js';
import { Conductor } from '../src/audio/conductor.js';
import { BS } from '../src/audio/ugens.js';
import { voiceOf } from '../src/audio/mapping.js';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const cap = JSON.parse(fs.readFileSync(args[0], 'utf8'));
const speed = Number(arg('speed', 20)), secs = Number(arg('secs', 120)), sr = 48000;
const seeds = String(arg('seeds', '1')).split(',').map(Number);
const warmAt = arg('warm', null);
const midiOf = (f) => Math.round(69 + 12 * Math.log2(f / 440));

// one rendering: the notes (t, def, midi) and, if asked, the audio
function render(seed, { wav = false } = {}) {
  const eng = new Engine(sr, { seed }), cond = new Conductor(eng, { seed });
  const notes = [];
  const spawn0 = eng.spawn.bind(eng);
  eng.spawn = (d, p, id) => { if (id == null && p && p.freq) notes.push({ t: cond.time, def: d, midi: midiOf(p.freq) }); return spawn0(d, p, id); };
  const span = cap.log[cap.log.length - 1].t - cap.log[0].t + 0.5, t0 = cap.log[0].t;
  const nb = Math.ceil((secs * sr) / BS), L = wav ? new Float32Array(nb * BS) : null, R = wav ? new Float32Array(nb * BS) : null;
  const bl = new Float32Array(BS), br = new Float32Array(BS);
  let k = 0, rep = 0, opened = false, warmed = warmAt == null, tSim = t0;
  cond.message({ type: 'reset', seed });
  for (let b = 0; b < nb; b++) {
    const tAudio = (b * BS) / sr;
    if (!opened && tAudio >= 0.3) { opened = true; cond.message({ type: 'open', seed }); if (warmAt != null) cond.message({ type: 'warm', on: true }); }
    if (!warmed && tAudio >= Number(warmAt)) { warmed = true; cond.message({ type: 'warm', on: false }); }
    const sp = warmAt != null && warmed ? 1 : speed; // after the warm-up, real time
    tSim += (BS / sr) * sp;
    for (;;) {
      if (k >= cap.log.length) { k = 0; rep++; }
      const e = cap.log[k], te = e.t + rep * span;
      if (te > tSim) break;
      k++;
      const m = { ...e.msg };
      if (m.type === 'listen') { m.ev = Float32Array.from(m.ev); m.speed = sp; }
      if (m.type === 'slots') m.slots = m.slots.map((x) => (x.genome ? { ...x, voice: voiceOf(x.genome) } : x));
      cond.message(m);
    }
    cond.render(bl, br);
    if (wav) { L.set(bl, b * BS); R.set(br, b * BS); }
  }
  return { notes, L, R };
}

// repetition: per instrument, notes per minute and the share of notes that repeat the same pitch
// within 8 s; overall, the identical sounds heard most per minute
function repetition(notes, secs) {
  const min = secs / 60, by = {}, same = new Map();
  for (const n of notes) {
    const B = (by[n.def] ||= { n: 0, rep: 0, last: new Map(), pitches: new Set() });
    B.n++; B.pitches.add(n.midi);
    const lt = B.last.get(n.midi);
    if (lt != null && n.t - lt < 8) B.rep++;
    B.last.set(n.midi, n.t);
    const key = `${n.def} ${n.midi}`;
    same.set(key, (same.get(key) || 0) + 1);
  }
  const defs = Object.fromEntries(Object.entries(by).map(([d, B]) => [d, { perMin: +(B.n / min).toFixed(1), repeat8s: +(B.rep / B.n).toFixed(2), pitches: B.pitches.size }]));
  const top = [...same].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => [k, +(n / min).toFixed(1)]);
  return { defs, top };
}

// an opening's fingerprint: the score's notes (not the cells') in its first 40 s, as pitch classes
// and onsets, to compare worlds
const SCORE = new Set(['piano', 'strings', 'vibe', 'glass', 'breath', 'cplx', 'pluck', 'wood', 'bite', 'tine']);
function fingerprint(notes) {
  return notes.filter((n) => n.t < 40 && SCORE.has(n.def)).map((n) => `${n.def}:${n.midi}:${Math.round(n.t * 2)}`);
}
const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); let i = 0; for (const x of A) if (B.has(x)) i++; return i / Math.max(1, A.size + B.size - i); };

const out = { speed, secs, seeds: {} };
const prints = [];
for (const seed of seeds) {
  const r = render(seed, { wav: seeds.length === 1 && !!arg('wav') });
  const rp = repetition(r.notes, secs);
  out.seeds[seed] = rp; prints.push(fingerprint(r.notes));
  console.log(`seed ${seed}: ${r.notes.length} notes`);
  for (const [d, s] of Object.entries(rp.defs).sort((a, b) => b[1].perMin - a[1].perMin)) console.log(`  ${d.padEnd(8)} ${String(s.perMin).padStart(6)}/min  same pitch again within 8 s: ${(s.repeat8s * 100).toFixed(0)}%  pitches ${s.pitches}`);
  console.log('  most repeated: ' + rp.top.map(([k, n]) => `${k} ${n}/min`).join(', '));
  if (r.L) {
    const n = r.L.length, buf = Buffer.alloc(44 + n * 8);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 8, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22);
    buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34); buf.write('data', 36); buf.writeUInt32LE(n * 8, 40);
    for (let i = 0; i < n; i++) { buf.writeFloatLE(r.L[i], 44 + i * 8); buf.writeFloatLE(r.R[i], 48 + i * 8); }
    fs.writeFileSync(arg('wav'), buf);
  }
}
if (prints.length > 1) {
  let s = 0, c = 0;
  for (let i = 0; i < prints.length; i++) for (let j = i + 1; j < prints.length; j++) { s += jaccard(prints[i], prints[j]); c++; }
  out.openingSimilarity = +(s / c).toFixed(3);
  console.log(`openings: mean similarity of the first 40 s of score notes between seeds ${out.openingSimilarity} (0 different .. 1 identical)`);
}
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(out, null, 1));
