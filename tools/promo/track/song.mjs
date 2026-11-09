// The promo song ("lc_held", the soundtrack chosen 2026-10-24): sections, tempo map, harmony and parts. Bars of 16
// steps. Composed rather than commercial: no backbeat, a broken kick until the rush drives it straight, a held sub one
// note a bar, tuned wood in a 3-against-4 cycle, the hook answered in canon, an odd-length arp phasing against the bar,
// triad strings with the seventh alone as a quiet glass tone above them. The themes are tidemote's own opening figures
// (score.js THEMES); the last drop lifts a whole step. `d2m` is the audio engine's (conductor.js) the track renders on.
const midicps = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;

const BPM = 112, RUSH = 168, BRK = 108, ROOT = 50, MODE = 'dorian', LIFT = 2, PROG = [0, 6, 3, 4], PROG_BREAK = [3, 0, 6, 4];
// figures from score.js THEMES (0, 1 and 9), and the hook's rhythm: [step in two bars, note of the figure, length]
const HOOKS = [[0, 2, 4, 1, 3], [4, 2, 3, 1, 0], [2, 4, 7, 6, 4]];
const RHY = [[0, 0, 3], [3, 1, 3], [6, 2, 2], [10, 3, 2], [12, 4, 4], [16, 0, 3], [19, 1, 3], [22, 2, 2], [24, 3, 2], [26, 4, 6]];
const ARP = [0, 4, 6, 9, 4, 11, 7];

export function makeSong(d2m) {
  const SECTIONS = [['intro', 4, BPM, BPM], ['build', 8, BPM, BPM], ['drop', 8, BPM, BPM], ['rush', 8, BPM, RUSH],
    ['peak', 4, RUSH, RUSH], ['break', 8, BRK, BRK], ['drop2', 8, BPM + 4, BPM + 4], ['outro', 4, BPM + 4, BPM + 4]];
  let at = 0;
  const sections = SECTIONS.map(([name, bars, b0, b1]) => { const s = { name, bar: at, bars, b0, b1 }; at += bars; return s; });
  const BARS = at;
  const secOf = (bar) => sections.find((s) => bar >= s.bar && bar < s.bar + s.bars) || sections[sections.length - 1];
  return {
    bars: BARS, sections, lead: 0.4, tail: 6,
    bpm(bb) {
      const s = secOf(Math.floor(bb)), x = clamp((bb - s.bar) / s.bars, 0, 1);
      return s.name === 'rush' ? lerp(s.b0, s.b1, x * x * (3 - 2 * x) * 0.4 + x * 0.6) : lerp(s.b0, s.b1, x);
    },
    length() { let t = 0; for (let n = 0; n < BARS * 16; n++) t += 15 / this.bpm(n / 16); return t; },
    harmony(bar) {
      const s = secOf(bar), i = bar - s.bar, lifted = s.name === 'drop2' || s.name === 'outro', root = ROOT + (lifted ? LIFT : 0);
      if (s.name === 'break') return { root, mode: MODE, chord: PROG_BREAK[Math.floor(i / 2) % 4] };
      if (s.name === 'intro' || s.name === 'outro') return { root, mode: MODE, chord: 0 };
      return { root, mode: MODE, chord: PROG[i % 4] };
    },
    bed(bar) {
      const s = secOf(bar).name;
      const f = { intro: 1.0, build: 1.1, drop: 0.85, rush: 1.0, peak: 0.8, break: 1.7, drop2: 0.85, outro: 1.4 }[s];
      const g = { alive: f, birth: f * 1.2, killed: f * 1.3, starved: f, old: f, eaten: f, mutation: f, spark: f * 0.7, charged: f, rustle: f };
      return { sea: { intro: 0.7, break: 0.8, outro: 0.9 }[s] ?? 0.4, drone: { intro: 0.7, break: 0.8, outro: 0.9 }[s] ?? 0.45, tide: 0.6, light: 0.8, field: g };
    },
    parts(c) {
      const P = { c };
      const note = (deg, oct = 0) => d2m(c.pivot + deg, c.root, c.scale) + 12 * oct;
      const play = (layer, t, def, p) => { c.at(t, def, p); c.events?.push([+t.toFixed(4), layer, def, +(p.amp ?? 0).toFixed(3)]); };
      // one pitched note on a named instrument, its parameters filled in for the instrument
      const inst = (layer, t, def, m, amp, len, x = {}) => {
        const f = midicps(m);
        const base = {
          vibe: { freq: f, amp: amp * 1.0, dec: 0.4 + len, bright: 0.7, depth: 0.25, rev: 0.3, dly: 0.2 },
          tine: { freq: f, amp: amp * 0.5, dec: 0.3 + len * 0.6, bright: 0.55, rev: 0.3, dly: 0.22 },
          glass: { freq: f, amp: amp * 0.55, atk: 0.01, sus: len * 0.7, rel: 0.6 + len, bright: 0.7, rev: 0.45, dly: 0.2 },
          piano: { freq: f, amp: amp * 0.85, dec: 2 + len * 2, felt: 0.55, rev: 0.35, dly: 0.12 },
          pluck: { freq: f, amp: amp * 0.9, dec: 0.4 + len * 0.5, bright: 0.65, coef: 0.25, rev: 0.25, dly: 0.22 },
          cplx: { freq: f, amp: amp * 0.7, ratio: 2, index: 1.4, fold: 1.4, dec: 0.12 + len * 0.6, bright: 0.7, rev: 0.25, dly: 0.25 },
        }[def];
        play(layer, t, def, { ...base, ...x });
      };
      // a rise into the next section: soft noise and a strings chord swelling under it
      const swell = (t, dur, amp) => {
        play('fx', t, 'riser', { dur, amp, rev: 0.6, dly: 0.1 });
        for (const [j, d] of [0, 4, 7].entries()) play('fx', t, 'strings', { freq: midicps(note(d, 1)), amp: amp * 0.55, atk: dur * 0.85, sus: dur * 0.1, rel: dur * 0.25, bright: 0.8, pan: [-0.4, 0.4, 0][j], rev: 0.5 });
      };
      P.bar = (ts, b, s16) => {
        const s = secOf(b), i = b - s.bar, last = i === s.bars - 1, bar = s16 * 16, nm = s.name;
        const chord = [0, 2, 4].map((d) => note(d, 0)), drumsUnder = !['break', 'outro'].includes(nm);
        // strings on the triad; under the drums a little lower, the seventh alone as a quiet glass tone above them
        if (nm !== 'intro' && !(nm === 'build' && i < 4)) {
          const amp = { build: 0.05, drop: 0.065, rush: 0.06, peak: 0.075, break: 0.07, drop2: 0.075, outro: 0.08 }[nm];
          const slow = nm === 'break' || nm === 'outro', gain = drumsUnder ? 0.7 : 1, bright = nm.startsWith('drop') || nm === 'peak' ? 0.75 : 0.45;
          for (const [j, m] of chord.entries()) play('pad', ts, 'strings', { freq: midicps(m), amp: amp * gain, atk: slow ? bar * 0.5 : 0.08, sus: bar * 0.6, rel: nm === 'outro' && last ? 5 : bar * 0.5, bright, pan: [-0.5, 0, 0.5][j], rev: 0.35 });
          if (drumsUnder && i % 2 === 0) inst('pad', ts + s16 * 2, 'glass', note(6, 1), amp * 0.9, bar * 1.2, { pan: 0.35, rev: 0.55, bright: 0.4, atk: 0.4 });
        }
        // dub stabs answering the piano in the break's second half, into the echoes
        if (nm === 'break' && i >= 2) for (const k of [3, 11]) for (const m of chord) inst('stab', ts + k * s16, 'cplx', m + 12, 0.05, 0.15, { dly: 0.6, rev: 0.35, index: 0.7, fold: 0.9, pan: k === 3 ? -0.3 : 0.3 });
        // intro: the first theme, slow, rising
        if (nm === 'intro') {
          HOOKS[0].forEach((d, j) => inst('lead', ts + j * s16 * 3 + (i % 2) * s16, 'vibe', note(d + (i >= 2 ? 2 : 0), 1), 0.2, s16 * 2, { rev: 0.6, dly: 0.3 }));
          if (i === 2) swell(ts, bar * 2, 0.06);
        }
        if (i === 0 && ['drop', 'peak', 'drop2', 'outro'].includes(nm)) {
          play('fx', ts, 'boom', { amp: 0.55, dec: nm === 'outro' ? 4 : 2.2, rev: 0.25 });
          for (let j = 0; j < 8; j++) play('fx', ts + j * s16 * 0.5, 'glint', { freq: midicps(note([0, 2, 4, 7][j % 4], 3)), amp: 0.035 * (1 - j / 9), dec: 0.5, rev: 0.6, dly: 0.3, pan: (j % 2 ? 1 : -1) * 0.6 });
        }
        if (nm === 'break' && i === 0) play('fx', ts, 'riser', { dur: bar * 1.5, amp: 0.05, up: false, rev: 0.7, top: 10 });
        if (last && ['build', 'break'].includes(nm)) swell(ts - bar, bar * 2, 0.07);
        if (nm === 'rush' && i === s.bars - 2) swell(ts, bar * 2, 0.08);
        // break: the piano plays the theme slowly over broken chords
        if (nm === 'break') {
          [0, 4, 8, 12].forEach((k, j) => inst('keys', ts + k * s16, 'piano', note([0, 4, 2, 4][j], -1), 0.18, s16 * 4, { pan: -0.2 }));
          const ph = (i % 2) * 16, hk = i < 4 ? HOOKS[0] : HOOKS[2];
          for (const [k, n, len] of RHY) if (k >= ph && k < ph + 16) inst('keys', ts + (k - ph) * s16, 'piano', note(hk[n % hk.length], 1), 0.22, len * s16, { pan: 0.15 });
        }
      };
      P.step = (ts, n, s16) => {
        const b = Math.floor(n / 16), k = n % 16, s = secOf(b), i = b - s.bar, nm = s.name;
        const drums = ['build', 'drop', 'rush', 'peak', 'drop2'].includes(nm);
        const full = ['drop', 'peak', 'drop2', 'rush'].includes(nm);
        const fill = i === s.bars - 1 && ['build', 'rush', 'drop'].includes(nm);
        const early = nm === 'build' && i < 4;
        if (drums) {
          // a broken kick (one, the and of two, three's last sixteenth) until the rush's second half drives it straight
          const kick = (nm === 'rush' && i >= 4) || nm === 'peak' ? k % 4 === 0 : early ? k === 0 : k === 0 || k === 6 || (k === 11 && i % 2 === 0) || (k === 8 && i % 2 === 1);
          if (kick && !(fill && nm === 'build' && k >= 12)) play('kick', ts, 'kick', { amp: 0.62, freq: 46, dec: nm === 'peak' ? 0.3 : 0.42, sweep: 3.2 });
          if (fill && k >= 8) { const x = (k - 8) / 8; play('perc', ts, 'wood', { freq: midicps(note([0, 2, 4, 7][k % 4], 2)), amp: 0.15 + 0.35 * x, dec: 0.12, bright: 0.7, pan: k % 2 ? 0.3 : -0.3, rev: 0.3 }); }
          if (k % 4 === 2) play('hat', ts, 'hat', { amp: 0.11, dec: k === 14 && full ? 0.18 : 0.05, pan: 0.25, rev: 0.05 });
          else if (full) play('hat', ts, 'hat', { amp: 0.035 + (k % 2 ? 0.012 : 0), dec: 0.025, pan: -0.25 });
          // tuned wood every third sixteenth (a cycle of 3 against the bar's 4), walking up the chord
          if ((full || nm === 'build') && n % 3 === 0) play('perc', ts, 'wood', { freq: midicps(note([0, 2, 4, 6, 9][(n / 3) % 5], 1)), amp: nm === 'build' ? 0.05 + 0.05 * (i / 8) : 0.1, dec: 0.3, bright: 0.45, pan: Math.sin(n * 0.37) * 0.6, rev: 0.25, dly: 0.12 });
          if (((nm === 'rush' && i >= 4) || nm === 'peak') && k % 2 === 1) play('perc', ts, 'tick', { freq: 4200 + 800 * Math.sin(n), amp: 0.045, dec: 0.02, pan: Math.sin(n * 1.3) * 0.7, rev: 0.1 });
        }
        // the sub: the chord's root, one note a bar, its filter opening through the rush and the peak
        if ((full || (nm === 'build' && i >= 4)) && k === 0) {
          const open = nm === 'rush' ? 320 + 600 * (i / s.bars) : nm === 'peak' ? 900 : 320;
          play('bass', ts, 'sub', { note: note(0, -2), amp: 0.42 * 0.43, len: s16 * 14.4, atk: 0.05, rel: 0.25, cut: open });
        }
        if (nm === 'build' || full || (nm === 'break' && i >= 4)) {
          const a = ARP[n % ARP.length], up = nm === 'rush' ? Math.floor((i / s.bars) * 2) : 0, acc = n % 5 === 0;
          const amp = (nm === 'build' ? 0.06 + 0.04 * (i / 8) : nm === 'break' ? 0.05 : 0.09) * (acc ? 1.3 : 0.75);
          inst('arp', ts, 'pluck', note(a, 1 + up), amp, s16, { pan: Math.sin(n * 0.7) * 0.5 });
        }
        if (['drop', 'drop2', 'peak'].includes(nm)) {
          const ph = (i % 2) * 16, hk = nm === 'drop2' && i >= 4 ? HOOKS[2] : i % 4 < 2 ? HOOKS[0] : HOOKS[1];
          for (const [kk, idx, len] of RHY) if (kk === ph + k) {
            const m = note(hk[idx % hk.length], nm === 'drop2' ? 2 : 1);
            inst('lead', ts, 'vibe', m, 0.24, len * s16, { pan: -0.15 });
            inst('lead', ts, 'tine', m + 12, 0.12, len * s16, { pan: 0.3 });
            if (nm === 'peak') inst('lead', ts, 'cplx', m + 12, 0.11, len * s16, { pan: -0.35, index: 1.6, fold: 1.5, dly: 0.3 });
            inst('canon', ts + 3 * s16, 'glass', note(hk[idx % hk.length] + 4, nm === 'drop2' ? 1 : 0), 0.13, len * s16, { pan: 0.45, rev: 0.5 });
          }
        }
      };
      return P;
    },
  };
}
