// Tidemote soundtrack — synth voices (loaded by tidemote_soundtrack.scd)
// Every voice: out (dry bus), revBus, dlyBus. Amps are calibrated so amp = 1
// gives roughly equal loudness across voices.
~defs = [

  // ── Buchla complex oscillator → wavefolder → lowpass gate (grazers, crawlers)
  SynthDef(\cplx, { |out = 64, revBus = 66, dlyBus = 68, freq = 440, amp = 0.1, pan = 0,
      ratio = 2, index = 1, fold = 1, atk = 0.003, dec = 0.3, bright = 0.5, rev = 0.2, dly = 0.1|
    var venv, lpg, idx, mod, car, sig, cut;
    venv = EnvGen.ar(Env.perc(atk, dec, 1, -5));
    lpg  = LagUD.ar(venv, 0.0005, dec * 0.3);
    idx  = index * (0.3 + (0.7 * lpg));
    mod  = SinOsc.ar(freq * ratio + LFNoise2.kr(0.3, 0.4));
    car  = SinOsc.ar(freq * [1, 1.0023], mod * idx);
    sig  = (car * fold.min(2400 / freq) * (0.35 + (0.65 * lpg))).sin;
    sig  = (sig * 0.6) + (SinOsc.ar(freq * [1, 1.0023]) * 0.4);
    cut  = ((freq * 1.2) + (lpg.squared * bright * 9000)).clip(40, 12000);
    sig  = MoogFF.ar(sig, cut, 0.3) * 1.6;      // ladder filter: no onset spikes under fast sweeps
    sig  = [sig[0] + (sig[1] * 0.3), sig[1] + (sig[0] * 0.3)] * 0.77;
    sig  = Balance2.ar(sig[0], sig[1], pan) * lpg * amp * 0.6;
    Line.kr(0, 0, atk + (dec * 1.6) + 0.05, doneAction: 2);
    Out.ar(out, sig); Out.ar(revBus, sig * rev); Out.ar(dlyBus, sig * dly);
  }),

  // ── Legato bloom: complex osc with a slow per-note filter swell (plankton)
  SynthDef(\swell, { |out = 64, revBus = 66, dlyBus = 68, freq = 440, amp = 0.1, pan = 0,
      ratio = 2, index = 1, fold = 1.5, atk = 0.3, hold = 0.3, rel = 0.9, bright = 0.5, rev = 0.3, dly = 0.1|
    var env, fenv, mod, car, sig, cut;
    env  = EnvGen.ar(Env([0, 1, 0.75, 0], [atk, hold, rel], [2, -1, -3]), doneAction: 2);
    fenv = env.squared;
    mod  = SinOsc.ar(freq * ratio * (1 + LFNoise2.kr(0.2, 0.001)));
    car  = SinOsc.ar(freq * [1, 1.003], mod * index * (0.4 + (0.6 * fenv)));
    sig  = (car * fold.min(2400 / freq) * (0.5 + (0.5 * fenv))).sin;
    cut  = (freq + (fenv * bright * 8000)).clip(40, 11000);
    sig  = LPF.ar(RLPF.ar(sig, cut, 0.55), cut * 1.5);
    sig  = [sig[0] + (sig[1] * 0.3), sig[1] + (sig[0] * 0.3)] * 0.77;
    sig  = Balance2.ar(sig[0], sig[1], pan) * env * amp * 0.6;
    Out.ar(out, sig); Out.ar(revBus, sig * rev); Out.ar(dlyBus, sig * dly);
  }),

  // ── Singing glass: modal resonators bowed by soft noise (reefs)
  SynthDef(\glass, { |out = 64, revBus = 66, dlyBus = 68, freq = 220, amp = 0.1, pan = 0,
      atk = 1.5, sus = 2, rel = 4, bright = 0.5, rev = 0.45, dly = 0.05|
    var env, exc, sig;
    env = EnvGen.kr(Env([0, 1, 0.8, 0], [atk, sus, rel], [1.5, 0, -3]), doneAction: 2);
    exc = LPF.ar(PinkNoise.ar, (freq * 8).min(9000)) * (0.3 + (0.7 * env));
    sig = DynKlank.ar(`[[1, 2.003, 3.011, 4.03, 5.08], [1, 0.45, 0.3 * bright, 0.18 * bright, 0.1 * bright],
      [1.2, 0.9, 0.7, 0.5, 0.4]], exc, freq * (1 + LFNoise2.kr(0.15, 0.0015)));
    sig = LPF.ar(sig, (freq * 7).min(11000));
    sig = Pan2.ar(sig * env * amp * 0.0095, pan + LFNoise2.kr(0.1, 0.15));
    Out.ar(out, sig); Out.ar(revBus, sig * rev); Out.ar(dlyBus, sig * dly);
  }),

  // ── Breath reed: noise and a faint saw through resonant formants (filaments)
  SynthDef(\breath, { |out = 64, revBus = 66, dlyBus = 68, freq = 220, amp = 0.1, pan = 0,
      atk = 1, sus = 1, rel = 2, bright = 0.4, glide = 0.02, rev = 0.35, dly = 0.08|
    var env, f, src, sig;
    env = EnvGen.kr(Env([0, 1, 0.8, 0], [atk, sus, rel], [2, 0, -3]), doneAction: 2);
    f   = freq * EnvGen.kr(Env([1 + glide, 1], [atk * 0.8], -3)) * (1 + LFNoise2.kr(3, 0.002));
    src = (Saw.ar(f * [1, 1.003]).sum * 0.25 * bright) + PinkNoise.ar(0.8);
    sig = Resonz.ar(src, f, 0.012) * 9 + (Resonz.ar(src, f * 2, 0.015) * 5) + (Resonz.ar(src, f * 3, 0.02) * 3.5 * bright)
        + (Resonz.ar(src, f * 4, 0.025) * 2.5 * bright) + (Resonz.ar(src, f * 6, 0.03) * 1.5 * bright);
    sig = LPF.ar(sig, (f * 8).min(11000));
    sig = Pan2.ar(sig * env * amp * 1.29, pan);
    Out.ar(out, sig); Out.ar(revBus, sig * rev); Out.ar(dlyBus, sig * dly);
  }),

  // ── Kalimba tine: struck modal bar (grazer / crawler alternative)
  SynthDef(\tine, { |out = 64, revBus = 66, dlyBus = 68, freq = 440, amp = 0.1, pan = 0,
      dec = 1.2, bright = 0.5, rev = 0.25, dly = 0.12|
    var exc, sig;
    exc = Decay2.ar(Impulse.ar(0), 0.0004, 0.003) * (1 + WhiteNoise.ar(0.3 * bright));
    sig = DynKlank.ar(`[[1, 5.95, 13.1], [1, 0.45 * bright, 0.2 * bright], [dec, dec * 0.22, dec * 0.09]], exc, freq);
    sig = LPF.ar(sig, (freq * 16).min(13000));
    sig = Pan2.ar(sig * amp * 0.0332, pan);
    Line.kr(0, 0, dec * 1.3 + 0.05, doneAction: 2);
    Out.ar(out, sig); Out.ar(revBus, sig * rev); Out.ar(dlyBus, sig * dly);
  }),

  // ── Wood: low marimba-like knock (hunters)
  SynthDef(\wood, { |out = 64, revBus = 66, dlyBus = 68, freq = 110, amp = 0.1, pan = 0,
      dec = 0.5, bright = 0.5, rev = 0.15, dly = 0.05|
    var exc, sig;
    exc = Decay2.ar(Impulse.ar(0), 0.0008, 0.006) * (1 + BPF.ar(WhiteNoise.ar, 1800, 0.5, 0.6 * bright));
    sig = DynKlank.ar(`[[1, 3.93, 9.24], [1, 0.3 * bright, 0.1 * bright], [dec, dec * 0.22, dec * 0.06]], exc, freq);
    sig = LPF.ar(sig, (freq * 12).min(9000));
    sig = Pan2.ar(sig * amp * 0.0224, pan);
    Line.kr(0, 0, dec * 1.2 + 0.05, doneAction: 2);
    Out.ar(out, sig); Out.ar(revBus, sig * rev); Out.ar(dlyBus, sig * dly);
  }),

  // ── Bite: low FM thump that drops in pitch, with a shell click (hunters)
  SynthDef(\bite, { |out = 64, revBus = 66, dlyBus = 68, freq = 73, amp = 0.1, pan = 0,
      dec = 0.35, bright = 0.5, rev = 0.12, dly = 0.06|
    var env, penv, sig, click;
    env  = EnvGen.ar(Env.perc(0.002, dec, 1, -4));
    penv = EnvGen.ar(Env([1.9, 1], [0.045], -6));
    sig  = SinOsc.ar(freq * penv, SinOsc.ar(freq * 2 * penv) * env * (1 + (2 * bright)));
    sig  = (sig * 1.3).tanh;
    click = BPF.ar(WhiteNoise.ar, 2200 + (bright * 1500), 0.3) * EnvGen.ar(Env.perc(0.0005, 0.012)) * 0.6;
    sig  = Pan2.ar(((sig * env) + click) * amp * 1.17, pan);
    Line.kr(0, 0, dec * 1.3 + 0.05, doneAction: 2);
    Out.ar(out, sig); Out.ar(revBus, sig * rev); Out.ar(dlyBus, sig * dly);
  }),

  // ── Droplet: a bubble, sine with a rising chirp (scavengers)
  SynthDef(\drop, { |out = 64, revBus = 66, dlyBus = 68, freq = 900, amp = 0.1, pan = 0,
      dec = 0.06, rise = 1.7, rev = 0.35, dly = 0.15|
    var env, f, sig;
    env = EnvGen.ar(Env.perc(0.001, dec, 1, -4));
    f   = freq * (1 + ((rise - 1) * EnvGen.ar(Env([0, 1], [dec], 2))));
    sig = Pan2.ar(SinOsc.ar(f) * env * amp * 1.88, pan);
    Line.kr(0, 0, dec + 0.05, doneAction: 2);
    Out.ar(out, sig); Out.ar(revBus, sig * rev); Out.ar(dlyBus, sig * dly);
  }),

  // ── Tick: a shrimp-like snap, ringing noise burst (scavengers)
  SynthDef(\tick, { |out = 64, revBus = 66, dlyBus = 68, freq = 3000, amp = 0.1, pan = 0,
      dec = 0.03, rev = 0.25, dly = 0.1|
    var sig = Ringz.ar(Decay2.ar(Impulse.ar(0), 0.0002, 0.002) * WhiteNoise.ar(1), freq, dec);
    sig = Pan2.ar(HPF.ar(sig, 400) * amp * 0.5, pan);
    Line.kr(0, 0, dec * 3 + 0.05, doneAction: 2);
    Out.ar(out, sig); Out.ar(revBus, sig * rev); Out.ar(dlyBus, sig * dly);
  }),

  // ── Glint: a tiny high sparkle grain
  SynthDef(\glint, { |out = 64, revBus = 66, dlyBus = 68, freq = 2000, amp = 0.05, pan = 0,
      dec = 0.12, rev = 0.5, dly = 0.2|
    var env = EnvGen.ar(Env.perc(0.002, dec, 1, -6));
    var sig = SinOsc.ar(freq, SinOsc.ar(freq * 2.01) * env * 0.8);
    sig = Pan2.ar(sig * env * amp * 0.91, pan);
    Line.kr(0, 0, dec + 0.05, doneAction: 2);
    Out.ar(out, sig); Out.ar(revBus, sig * rev); Out.ar(dlyBus, sig * dly);
  }),

  // ── Sea: persistent bed. Noise "currents" singing through narrow resonators
  //    tuned to the era's open chord, plus slow surf swells that follow the tide.
  //    A new chord is a new sea faded in over the old one (fade), never a glide.
  SynthDef(\sea, { |out = 64, revBus = 66, amp = 0.1, f1 = 38, f2 = 45, f3 = 50, f4 = 57, f5 = 64,
      tide = 0.5, light = 0.5, sing = 1, surf = 1, swellRate = 0.07, fade = 1, fadeTime = 8, rev = 0.3|
    var fs, res, wav, sig, tl = tide.lag(6), ll = light.lag(6);
    fs  = [f1, f2, f3, f4, f5].midicps;
    res = fs.collect { |f, i|
      Resonz.ar(PinkNoise.ar(1 ! 2), f * (1 + LFNoise2.kr(0.05, 0.002)), 0.004)
        * LFNoise2.kr(0.02 + (i * 0.013)).range(0.15, 1) * (6 / (i + 2))
    }.sum * 9 * sing * (0.5 + ll);
    wav = LPF.ar(BrownNoise.ar(1 ! 2), 180 + (tl * 700) + (ll * 900))
        * SinOsc.kr(swellRate * [1, 1.13], [0, 2]).range(0.15, 1).squared * 0.5 * surf * (0.4 + tl);
    sig = HPF.ar(res + wav, 30) * amp * 1.55 * fade.lag(fadeTime);
    Out.ar(out, sig); Out.ar(revBus, sig * rev);
  }),

  // ── Drone: soft low tone breathing under everything (a new note is a new drone, faded in)
  SynthDef(\drone, { |out = 64, revBus = 66, amp = 0.1, note = 38, light = 0.5, fade = 1, fadeTime = 6, rev = 0.15|
    var f = note.midicps, ll = light.lag(8), sig;
    sig = SinOsc.ar(f * [1, 1.002], SinOsc.ar(f * 2) * (0.3 + (0.8 * ll)) * LFNoise2.kr(0.07).range(0.3, 1)).sum * 0.5;
    sig = sig + (SinOsc.ar(f * 2.001) * 0.18 * ll);
    sig = LPF.ar(sig, f * 6) * amp * 0.52 * LFNoise2.kr(0.05).range(0.7, 1) * fade.lag(fadeTime);
    sig = sig ! 2;
    Out.ar(out, sig); Out.ar(revBus, sig * rev);
  }),

  // ── Felt piano: a soft hammer on two strings a cent apart, six stretched partials each
  //    (felt 0..1: a softer, longer hammer contact excites fewer partials; with a knock of the key)
  SynthDef(\piano, { |out = 64, revBus = 66, dlyBus = 68, freq = 220, amp = 0.1, pan = 0,
      dec = 5, felt = 0.6, rev = 0.3, dly = 0.05|
    var k = (1..6), fs, amps, decs, exc, sig, knock;
    fs   = k * (1 + (0.0003 * k * k)).sqrt;
    amps = [1, 0.5, 0.3, 0.2, 0.12, 0.08];
    decs = (1 + (0.55 * (k - 1))).reciprocal;
    exc  = Decay2.ar(Impulse.ar(0), 0.0004 + (0.0016 * felt), 0.003 + (0.005 * felt));
    sig  = DynKlank.ar(`[(fs * 0.9994) ++ (fs * 1.0006), amps ++ amps, decs ++ decs], exc, freq, 0, dec);
    knock = LPF.ar(WhiteNoise.ar, 260) * EnvGen.ar(Env.perc(0.001, 0.07)) * felt;
    sig  = Pan2.ar(((sig * 0.0045 * (freq / 220).sqrt) + (knock * 0.3)) * amp, pan);
    Line.kr(0, 0, dec * 1.1 + 0.05, doneAction: 2);
    Out.ar(out, sig); Out.ar(revBus, sig * rev); Out.ar(dlyBus, sig * dly);
  }),

  // ── Strings: an ensemble of detuned saws with a slow vibrato; the bow brightens as it swells
  SynthDef(\strings, { |out = 64, revBus = 66, dlyBus = 68, freq = 220, amp = 0.1, pan = 0,
      atk = 3, sus = 2, rel = 5, bright = 0.5, rev = 0.5, dly = 0|
    var env, f, sig;
    env = EnvGen.kr(Env([0, 1, 0.85, 0], [atk, sus, rel], [2, 0, -3]), doneAction: 2);
    f   = freq * (1 + (SinOsc.kr(5.2 + LFNoise2.kr(0.5, 0.6)) * 0.0022 * env));
    sig = [Saw.ar(f * 0.9978) + Saw.ar(f * 1.0013), Saw.ar(f * 1.0024) + Saw.ar(f * 0.9989)];
    sig = HPF.ar(LPF.ar(sig, (freq * (1.5 + (env * bright * 5))).clip(60, 9000)), 80);
    sig = Balance2.ar(sig[0], sig[1], pan) * env * amp * 0.5;
    Out.ar(out, sig); Out.ar(revBus, sig * rev); Out.ar(dlyBus, sig * dly);
  }),

  // ── Vibraphone: a soft mallet on a tuned bar, with the motor's tremolo
  SynthDef(\vibe, { |out = 64, revBus = 66, dlyBus = 68, freq = 440, amp = 0.1, pan = 0,
      dec = 3, bright = 0.5, trem = 4.5, depth = 0.3, rev = 0.35, dly = 0.15|
    var exc, sig;
    exc = Decay2.ar(Impulse.ar(0), 0.0006, 0.004);
    sig = DynKlank.ar(`[[1, 3.99, 10.1], [1, 0.3 * bright, 0.1 * bright], [1, 0.25, 0.08]], exc, freq, 0, dec);
    sig = LPF.ar(sig, (freq * 14).min(12000)) * (1 - (depth * SinOsc.kr(trem, 0, 0.5, 0.5)));
    sig = Pan2.ar(sig * amp * 0.03, pan);
    Line.kr(0, 0, dec * 1.2 + 0.05, doneAction: 2);
    Out.ar(out, sig); Out.ar(revBus, sig * rev); Out.ar(dlyBus, sig * dly);
  }),

  // ── Swarm: a multitude heard from afar. Each band rings a pair of resonators a few cents
  //    apart at random impulses, one per cell sound (d: impulses per second, a: their level):
  //    sparse, they are separate pings; dense, they merge into a shimmering chord.
  SynthDef(\swarm, { |out = 64, revBus = 66, dlyBus = 68, amp = 1, ring = 0.2, rev = 0.6, dly = 0.1,
      f1 = 60, f2 = 60, f3 = 60, f4 = 60, f5 = 60, f6 = 60, f7 = 60, f8 = 60,
      d1 = 0, d2 = 0, d3 = 0, d4 = 0, d5 = 0, d6 = 0, d7 = 0, d8 = 0,
      a1 = 0, a2 = 0, a3 = 0, a4 = 0, a5 = 0, a6 = 0, a7 = 0, a8 = 0|
    var fs = [f1, f2, f3, f4, f5, f6, f7, f8].midicps, ds = [d1, d2, d3, d4, d5, d6, d7, d8], as = [a1, a2, a3, a4, a5, a6, a7, a8];
    var pos = [-0.75, 0.55, -0.35, 0.15, -0.15, 0.35, -0.55, 0.75], sig;
    sig = 8.collect { |i|
      var x = Dust.ar(ds[i]) * as[i];
      Pan2.ar(Ringz.ar(x, fs[i] * 0.9971, ring) + Ringz.ar(x, fs[i] * 1.0029, ring), pos[i])
    }.sum;
    sig = sig * amp;
    Out.ar(out, sig); Out.ar(revBus, sig * rev); Out.ar(dlyBus, sig * dly);
  }),

  // ── Wave: one swell of water washing in and drawing back, brightening as it crests
  SynthDef(\wave, { |out = 64, revBus = 66, amp = 0.1, dur = 7, pan = 0, bright = 0.5, rev = 0.4|
    var env, sig;
    env  = EnvGen.kr(Env([0, 1, 0.3, 0], [dur * 0.4, dur * 0.2, dur * 0.4], [2, -2, -2]), doneAction: 2);
    sig  = LPF.ar([PinkNoise.ar, PinkNoise.ar], 200 + (env.squared * 2400 * bright)) * env;
    sig  = Balance2.ar(sig[0], sig[1], pan + LFNoise2.kr(0.25, 0.3)) * amp;
    Out.ar(out, sig); Out.ar(revBus, sig * rev);
  }),

  // ── Ping-pong delay
  SynthDef(\pingpong, { |in = 68, out = 64, revBus = 66, tl = 0.54, tr = 0.36, fb = 0.45, rev = 0.4|
    var sig = In.ar(in, 2).sum * 0.7, fbIn = LocalIn.ar(1), l, r;
    l = DelayC.ar(sig + (fbIn * fb), 1.5, tl - ControlDur.ir);
    l = LPF.ar(HPF.ar(l, 300), 4200);
    r = DelayC.ar(l, 1.5, tr);
    LocalOut.ar(r);
    Out.ar(out, [l, r]); Out.ar(revBus, [l, r] * rev);
  }),

  // ── 8-line FDN reverb: a large, soft, dark ocean space
  SynthDef(\fdn, { |in = 66, out = 64, decay = 9, damp = 5000, size = 1.3, mix = 0.9|
    var sig, x, times, gains, h, y;
    sig = In.ar(in, 2);
    sig = DelayN.ar(sig, 0.06, 0.035);
    4.do { |i| sig = AllpassC.ar(sig, 0.05, [0.0047, 0.0071, 0.0113, 0.0163][i] * [1, 1.13], 0.3) };
    times = [0.0503, 0.0611, 0.0719, 0.0823, 0.0937, 0.1049, 0.1153, 0.1279] * size;
    x = LocalIn.ar(8) + (sig ++ sig ++ sig ++ sig);
    x = DelayC.ar(x, 0.5, times - ControlDur.ir + LFNoise2.ar(0.12 ! 8).range(0, 0.0015));
    x = LPF.ar(HPF.ar(x, 70), damp);
    gains = 10 ** (-3 * times / decay);
    h = [[1]];
    3.do { h = h.collect { |row| row ++ row } ++ h.collect { |row| row ++ row.neg } };
    y = h.collect { |row| (row * x).sum } * (8.sqrt.reciprocal);
    LocalOut.ar(y * gains);
    y = [x[0] + x[2] + x[4] + x[6], x[1] + x[3] + x[5] + x[7]] * 0.3;
    Out.ar(out, HPF.ar(y, 140) * mix);
  }),

  // ── Master: mono bass, EQ, light-following tone, glue, saturation, limiter
  SynthDef(\master, { |in = 64, out = 0, gain = 1, tone = 16000, toneLag = 6, thresh = 0.3,
      drive = 1.2, ceiling = 0.8|
    var sig = In.ar(in, 2);
    sig = HPF.ar(sig, 28);
    sig = HPF.ar(HPF.ar(sig, 120), 120) + (LPF.ar(LPF.ar(sig, 120), 120).sum * 0.5 ! 2);
    sig = LeakDC.ar(sig);
    sig = BLowShelf.ar(sig, 150, 1, 0);
    sig = BHiShelf.ar(sig, 8000, 1, 2.5);
    sig = BLowPass.ar(sig, tone.lag(toneLag).clip(300, 18000), 0.8);
    sig = sig * gain;
    sig = Compander.ar(sig, sig.sum * 0.5, thresh, 1, 0.5, 0.03, 0.4);
    sig = (sig * drive).tanh / drive.tanh;
    sig = LPF.ar(LPF.ar(sig, 15000), 15000);
    sig = Limiter.ar(sig, ceiling, 0.01).clip2(0.97);
    Out.ar(out, sig);
  })
];
