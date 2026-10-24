// The chronicler: natural history written from what the simulation already keeps (docs/chronicler.md).
//
// It watches the census, the species ledger (SPL_* in shaders.js: each species' births and deaths by
// cause, who tried to eat whom among the watched species and how often they ate, and where each
// species' cells gather) and the climate's announcements, and now and then writes a sentence or two
// about something that truly happened: a post-mortem, an arms race, a boom and bust, a cycle between
// hunter and hunted, a lineage following the water's warmth, a reign's end, the last of a guild, what
// an event or an era did. It only reads; nothing it does touches the simulation.
//
// It speaks rarely. Every candidate story carries a score (how notable it is), and a budget refilled
// in simulated time (STORY_EVERY seconds a story, at most STORY_CAP in hand), a gap in real time (so a
// fast world does not flood the log) and cooldowns per kind and per species decide which, if any, is
// told. A story that loses its turn may wait a few minutes for the next.
//
// Pure: no DOM, no GPU. The page calls observe() on every census and note() on the climate's news,
// and pushes what they return into the log. Tested in test/chronicler.test.js.

import { dietGuild, mobilityGuild, thermalGuild, growPlan, roleShares, affinity } from './genome.js';
import { fmt, fmtClock, esc, UM_PER_UNIT } from './fmt.js';
import { MAXK, FIRST_LIFE, SPL_WATCH, SPL_CAUSE, SPL_CAUSES, SPL_PAIR, SPL_RANGE, DEFAULT_K } from './shaders.js';

const NC = SPL_CAUSES.length;
const C = Object.fromEntries(SPL_CAUSES.map((k, i) => [k, i])); // born, starved, old, eaten, scalded, stranded, cyst, woke
const MIN = 60;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
// drop the entries of a time series ([t, ...] in order) from before t0, in one splice
const trim = (arr, t0) => { let k = 0; while (k < arr.length && arr[k][0] < t0) k++; if (k) arr.splice(0, k); };
const wrap01 = (d) => d - Math.round(d);

// How often the chronicler may speak, and when it may not.
export const TUNE = {
  storyEvery: 10 * MIN, // simulated seconds per story in the budget
  storyCap: 2, // stories it may hold in hand
  gapReal: 30000, // ms of real time between stories, however fast the world runs
  gapSim: 90, // simulated seconds between stories, however slow
  warm: 8 * MIN, // a new world's first minutes settle without comment (a collapse aside)
  need: 0.6, // the score a story needs while the budget holds one
  borrow: 0.85, // the score that may borrow against the next story
  wait: 5 * MIN, // how long a story that lost its turn may wait for the next
  kindGap: 8 * MIN, // the same kind of story at most this often
  subjectGap: 15 * MIN, // the same species at most this often
  sample: 10, // simulated seconds between samples of a species
  short: 20 * MIN, // how far back the fine samples reach
  long: 4 * 3600, // and the coarse ones (one a minute)
};

const GUILD = {
  producer: { one: 'producer', many: 'producers', none: 'nothing in the pool lives on light any longer', eat: 'graze' },
  grazer: { one: 'grazer', many: 'grazers', none: 'no mouth in all the pool now crops the meadows', eat: 'graze' },
  scavenger: { one: 'scavenger', many: 'scavengers', none: 'the dead lie where they fall, and none comes to take them', eat: 'scavenge' },
  predator: { one: 'hunter', many: 'hunters', none: 'nothing hunts, and the hunted may at last rest', eat: 'hunt' },
};
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const numWord = (n) => (n >= 0 && n < NUM.length ? NUM[n] : fmt(n));
const Cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** A span of simulated time in words: "40 seconds", "12 minutes", "1 hour 5 minutes". */
export function durWords(s) {
  s = Math.max(0, s);
  if (s < 90) return `${Math.max(1, Math.round(s / 5) * 5)} seconds`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h === 1 ? 'an hour' : `${h} hours`}${r ? ` ${r} minute${r === 1 ? '' : 's'}` : ''}`;
}
/** A share in words: "nearly all", "three quarters", "half"... */
export function shareWords(f) {
  return f >= 0.9 ? 'nearly all' : f >= 0.72 ? 'three quarters' : f >= 0.6 ? 'two thirds' : f >= 0.45 ? 'half'
    : f >= 0.3 ? 'a third' : f >= 0.2 ? 'a quarter' : 'a few';
}
const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
// the four quarters of the world's map, as on a slide (x east, y down the view, so south)
const compass = (x, y) => {
  const ns = y < 0.33 ? 'north' : y > 0.67 ? 'south' : '', ew = x < 0.33 ? 'west' : x > 0.67 ? 'east' : '';
  return ns && ew ? `${ns}-${ew}` : ns || ew || 'middle';
};
const heading = (dx, dy) => {
  const a = Math.atan2(dy, dx) * 180 / Math.PI; // y grows southward
  return ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][((Math.round(a / 45) % 8) + 8) % 8];
};
const lenWords = (u) => { const mm = (u * UM_PER_UNIT) / 1000; return mm >= 1 ? `${mm.toFixed(mm >= 10 ? 0 : 1)} mm` : `${Math.round(mm * 1000)} µm`; };

/**
 * How well a hunter's receptors fit a quarry's surface, as mealMissed in shaders.js weighs recognition
 * (its cell types by their share, against the quarry's first type's surface): -1..1.
 */
export function fitOf(h, q, K = DEFAULT_K) {
  const sh = roleShares(h);
  let f = 0;
  for (let r = 0; r < 3; r++) if (sh[r] > 0.001) f += sh[r] * affinity(h, r, q, 0, K);
  return f;
}

/** The world's firsts a species may bring (key, words), from its genome. */
export function firstsOf(g, K = DEFAULT_K) {
  const out = [];
  const guild = dietGuild(g);
  out.push([`guild:${guild}`, { producer: 'to live on light', grazer: 'to graze', scavenger: 'to live on the dead', predator: 'to hunt living prey' }[guild]]);
  const multi = (g.adhesion || 0) > K.adhMin;
  if (multi) out.push(['multi', 'to live as a many-celled body']);
  if (multi && growPlan(g)) out.push(['tree', 'to grow as a branching tree']);
  if (multi && g.swim * (1 - g.photo) >= 0.8) out.push(['swimbody', 'many-celled body that swims']);
  if ((g.calcify || 0) > 0.1) out.push(['calcify', 'to build reef stone']);
  if ((g.thermo || 0) > 0.2) out.push(['heat', 'heat-maker, warming the water around it']);
  if (K.heat && (g.topt ?? 19) > 38) out.push(['thermophile', 'thermophile, at home above 38°']);
  if (K.heat && (g.topt ?? 19) < 10) out.push(['cold', 'cold-lover, at home below 10°']);
  if (roleShares(g).filter((v) => v > 0.1).length === 3) out.push(['types3', 'to grow three kinds of cell']);
  return out;
}
const FIRST_LEAD = { multi: 'many-celled organism', swimbody: 'many-celled body that swims', heat: 'heat-maker, warming the water around it', thermophile: 'thermophile, at home in water above 38°', cold: 'cold-lover, at home in water below 10°' };

/** A circular mean on the torus from summed (cos + 1) * 127 terms: [position 0..1, concentration 0..1]. */
function circ(sc, ss, n) {
  const c = sc / n / 127 - 1, s = ss / n / 127 - 1;
  const R = Math.hypot(c, s);
  return [((Math.atan2(s, c) / (2 * Math.PI)) + 1) % 1, R];
}

/**
 * createChronicler({ K, link, founders }):
 *   link(serial, name) -> html for a species' name (the page's spLink); name(serial) its current name
 * Returns { observe, note, watch, latest, save, load, reset }.
 */
export function createChronicler({ K = DEFAULT_K, link = (s, n) => esc(n), tune = {} } = {}) {
  const T = { ...TUNE, ...tune };
  let S;
  function reset() {
    S = {
      sp: new Map(), // serial -> stats
      pairs: new Map(), // h · 2^26 + q -> { h, q, bins: [[t, tries, meals]] } (one bin a minute, the last hour)
      watch: { version: 0, serials: new Array(SPL_WATCH).fill(0) },
      versions: new Map(), // watch map version -> serials by index
      prevPairs: null, prevVer: -1, prevSlot: null, prevCause: null,
      tokens: T.storyCap, lastStory: -1e9, lastReal: -1e9, lastTick: -1e9, slowAt: {}, slowNext: 0,
      told: new Map(), // kind -> t, "kind:key" -> t, "sp:serial" -> t
      pending: null, latest: new Map(), // serial -> { t, text }
      top: { serial: 0, since: 0 }, guilds: null, guildGone: {},
      firsts: null, maxLiving: 0, collapsed: false, record: 0,
      eraMark: null, eventMark: null, excursion: null, genusMarks: [], stoneMarks: [],
      ext: [], // [t, serial] of established species lost, for waves of extinction
      voice: {}, // per kind, how many times it has spoken (vary: its turns of phrase take turns)
    };
  }
  reset();

  // ------------------------------------------------------------------ bookkeeping
  function statsOf(sp, t) {
    let st = S.sp.get(sp.serial);
    if (!st) {
      st = { serial: sp.serial, s: [], l: [], acc: new Array(NC).fill(0), cum: new Array(NC).fill(0), rng: [], diet: new Map(), eaters: new Map(), firstT: t, lastS: -1e9, lastL: -1e9, reign: 0, low: null };
      S.sp.set(sp.serial, st);
    }
    return st;
  }
  // the sample nearest to t - ago (fine samples first, then coarse)
  function popAgo(st, t, ago) {
    const want = t - ago;
    const arr = ago <= T.short ? st.s : st.l;
    let best = null;
    for (const x of arr) if (x[0] <= want + T.sample) best = x; else break;
    return best ? best[1] : null;
  }
  // deaths and births in (t0, t1]: [born, starved, old, eaten, scalded, stranded, cyst, woke]
  function causesIn(st, t0, t1 = Infinity) {
    const out = new Array(NC).fill(0);
    for (const x of st.s) if (x[0] > t0 && x[0] <= t1) for (let i = 0; i < NC; i++) out[i] += x[2][i];
    return out;
  }
  function peakIn(st, t0) {
    let p = null;
    for (const x of st.s) if (x[0] >= t0 && (!p || x[1] > p[1])) p = x;
    return p;
  }
  // meals between species, by minute
  // keyed by both serials in one number (serials stay far below 2^26)
  function pairOf(h, q) {
    const key = h * 67108864 + q;
    let p = S.pairs.get(key);
    if (!p) S.pairs.set(key, (p = { h, q, bins: [], fit: null }));
    return p;
  }
  function pairSum(p, t0, t1 = Infinity) {
    let tries = 0, meals = 0;
    for (const b of p.bins) if (b[0] > t0 && b[0] <= t1) { tries += b[1]; meals += b[2]; }
    return [tries, meals];
  }

  // The species the page should watch in the species ledger: the established, by numbers (consumers
  // weighted up: they are fewer, and they make the stories), each keeping its index while it lives.
  function chooseWatch(reg) {
    const W = S.watch;
    const alive = [];
    for (const sp of reg.values()) if (sp.alive && sp.established) alive.push(sp);
    const rank = new Map(alive.map((sp) => [sp, sp.pop * (dietGuild(sp.genome) === 'producer' ? 1 : 3)]));
    alive.sort((a, b) => rank.get(b) - rank.get(a));
    const keepTo = new Set(alive.slice(0, SPL_WATCH + 32).map((sp) => sp.serial));
    const want = alive.slice(0, SPL_WATCH).map((sp) => sp.serial);
    const next = W.serials.map((s) => (s && keepTo.has(s) ? s : 0));
    const have = new Set(next.filter(Boolean));
    let i = 0;
    for (const s of want) {
      if (have.has(s)) continue;
      while (i < next.length && next[i]) i++;
      if (i >= next.length) break;
      next[i] = s; have.add(s);
    }
    if (next.some((s, k) => s !== W.serials[k])) {
      W.version = (W.version + 1) >>> 0 || 1;
      W.serials = next;
      S.versions.set(W.version, next.slice());
      for (const v of S.versions.keys()) if (S.versions.size > 6 && v !== W.version) S.versions.delete(v);
    }
  }

  // the species ledger: per-slot causes (cumulative, zeroed when a slot is claimed), watched pairs, ranges
  function ingestSpl(spl, slotSerial, t) {
    // causes, by slot: a slot's counts belong to the species in it now; a new species' started at zero
    const cause = spl.subarray(SPL_CAUSE, SPL_CAUSE + MAXK * NC);
    if (S.prevCause) {
      for (let k = FIRST_LIFE; k < MAXK; k++) {
        const serial = slotSerial[k];
        if (!serial) continue;
        const st = S.sp.get(serial);
        if (!st) continue;
        const same = S.prevSlot[k] === serial;
        for (let i = 0; i < NC; i++) {
          const d = same ? (cause[k * NC + i] - S.prevCause[k * NC + i]) >>> 0 : cause[k * NC + i];
          if (d < 1e8) st.acc[i] += d;
        }
      }
    }
    S.prevCause = cause.slice();
    S.prevSlot = slotSerial.slice();
    // pairs, by watched index: counted only across an interval in which both indices kept their species
    const ver = spl[0], ser = S.versions.get(ver);
    const pairs = spl.subarray(SPL_PAIR, SPL_PAIR + SPL_WATCH * SPL_WATCH * 2);
    const prevSer = S.versions.get(S.prevVer);
    if (S.prevPairs && ser && prevSer) {
      const bin = Math.floor(t / MIN) * MIN;
      for (let a = 0; a < SPL_WATCH; a++) {
        const h = ser[a];
        if (!h || prevSer[a] !== h) continue;
        for (let b = 0; b < SPL_WATCH; b++) {
          const q = ser[b];
          if (!q || prevSer[b] !== q || q === h) continue;
          const o = (a * SPL_WATCH + b) * 2;
          const dt = (pairs[o] - S.prevPairs[o]) >>> 0, dm = (pairs[o + 1] - S.prevPairs[o + 1]) >>> 0;
          if (!dt || dt > 1e8) continue;
          const p = pairOf(h, q);
          const last = p.bins[p.bins.length - 1];
          if (last && last[0] === bin) { last[1] += dt; last[2] += dm; } else p.bins.push([bin, dt, dm]);
          const hs = S.sp.get(h), qs = S.sp.get(q);
          if (hs && dm) hs.diet.set(q, (hs.diet.get(q) || 0) + dm);
          if (qs && dm) qs.eaters.set(h, (qs.eaters.get(h) || 0) + dm);
        }
      }
    }
    S.prevPairs = pairs.slice();
    S.prevVer = ser ? ver : -1;
    // where each species is
    for (let k = FIRST_LIFE; k < MAXK; k++) {
      const o = SPL_RANGE + k * 5, n = spl[o + 4];
      if (n < 12) continue;
      const st = S.sp.get(slotSerial[k]);
      if (!st) continue;
      const [x, Rx] = circ(spl[o], spl[o + 1], n), [y, Ry] = circ(spl[o + 2], spl[o + 3], n);
      st.where = [t, x, y, Rx, Ry];
    }
  }

  // ------------------------------------------------------------------ the observation
  /**
   * obs: { t, now (ms, real), reg (serial -> species record), genera, living, stone, count, est,
   *   founders, slotSerial (Uint32Array by slot, or null), spl (the species ledger, or null),
   *   temp (the water's background), light (ambient), world: [W, H], event: { type, phase } | null,
   *   excursion (the heat wave or cold snap under way, or null), focus (a serial the viewer is looking at) }
   * Returns the stories to log now: [{ html, text, col, kind, subjects, score }].
   */
  function observe(obs) {
    const t0 = T.prof ? performance.now() : 0;
    const out = observe_(obs);
    if (T.prof) T.prof.total = (T.prof.total || 0) + performance.now() - t0;
    return out;
  }
  function observe_(obs) {
    const { t, reg } = obs;
    // species: their numbers, sampled every T.sample simulated seconds; between samples only the
    // species ledger is read (a census at real time costs next to nothing)
    const fresh = t - S.lastTick >= T.sample;
    if (!fresh && !obs.spl) return [];
    if (obs.living == null) { let living = 0; for (const sp of reg.values()) if (sp.alive) living += sp.pop; obs.living = living; }
    const mark = (k, t1) => { if (T.prof) T.prof[k] = (T.prof[k] || 0) + performance.now() - t1; return T.prof ? performance.now() : 0; };
    let tm = T.prof ? performance.now() : 0;
    for (const sp of reg.values()) {
      if (!sp.established || (!sp.alive && !S.sp.has(sp.serial))) continue;
      statsOf(sp, t);
    }
    tm = mark('sync', tm);
    if (obs.spl && obs.slotSerial) { const t1 = T.prof ? performance.now() : 0; ingestSpl(obs.spl, obs.slotSerial, t); if (T.prof) T.prof.ingest = (T.prof.ingest || 0) + performance.now() - t1; }
    if (!S.eraMark && obs.era) S.eraMark = { t, name: obs.era, snap: snapshot(reg, obs.living) };
    tm = T.prof ? performance.now() : 0;
    // the watch list matters for the next copy of the species ledger: chosen as one arrives
    if (obs.spl || !S.watch.version) chooseWatch(reg);
    tm = mark('watch', tm);
    if (!fresh) return [];
    S.lastTick = t;
    for (const st of S.sp.values()) {
      const sp = reg.get(st.serial);
      const pop = sp && sp.alive ? sp.pop : 0;
      st.s.push([t, pop, st.acc]);
      for (let i = 0; i < NC; i++) st.cum[i] += st.acc[i];
      st.acc = new Array(NC).fill(0);
      trim(st.s, t - T.short);
      if (t - st.lastL >= MIN) { st.l.push([t, pop]); st.lastL = t; trim(st.l, t - T.long); }
      if (st.where && t - (st.rng.at(-1)?.[0] ?? -1e9) >= MIN) { st.rng.push(st.where); trim(st.rng, t - 40 * MIN); }
    }
    for (const p of S.pairs.values()) if (p.bins.length && p.bins[0][0] < t - 60 * MIN) trim(p.bins, t - 60 * MIN);
    tm = mark('sample', tm);
    // the candidates
    const cands = [];
    const add = (c) => { if (c && c.score > 0) cands.push(c); };
    const ctx = { ...obs, living: obs.living };
    tm = T.prof ? performance.now() : 0;
    // T.prof (tools): milliseconds spent in each detector
    const run = T.prof ? (f, ...a) => { const t0 = performance.now(); const r = f(...a); T.prof[f.name] = (T.prof[f.name] || 0) + performance.now() - t0; return r; } : (f, ...a) => f(...a);
    run(detectCollapse, ctx, add);
    run(detectGuilds, ctx, add);
    run(detectExtinctions, ctx, add);
    run(detectReign, ctx, add);
    run(detectSwings, ctx, add);
    run(detectFirsts, ctx, add);
    if (S.eraMark?.pending) add(run(eraStory, ctx));
    if (S.eventMark?.done) add(run(eventStory, ctx));
    if (S.excursion && t > S.excursion.end) add(run(excursionStory, ctx));
    // the slow detectors (minute-scale stories) take turns, one a tick, so no census pays for them all
    const slow = SLOW[S.slowNext % SLOW.length];
    if (t - (S.slowAt[slow.name] ?? -1e9) >= MIN) {
      S.slowAt[slow.name] = t;
      S.slowNext++;
      run(slow, ctx, add);
    } else S.slowNext++;
    // forget the long dead
    tm = T.prof ? performance.now() : 0;
    for (const [serial] of S.sp) {
      const sp = reg.get(serial);
      if (!sp || (!sp.alive && t - (sp.extinct ?? t) > 30 * MIN)) S.sp.delete(serial);
    }
    for (const [k, p] of S.pairs) if (!p.bins.length) S.pairs.delete(k);
    tm = mark('cleanup', tm);
    const out = choose(cands, obs);
    mark('choose', tm);
    return out;
  }

  // ------------------------------------------------------------------ telling
  const toldAt = (key) => S.told.get(key) ?? -1e9;
  function choose(cands, obs) {
    const { t } = obs;
    const now = obs.now ?? 0;
    S.tokens = Math.min(T.storyCap, S.tokens + (t - (S.lastBudget ?? t)) / T.storyEvery);
    S.lastBudget = t;
    if (S.pending && t > S.pending.until) S.pending = null;
    if (S.pending) cands.push(S.pending);
    for (const c of cands) {
      // the viewer's own come first: a species they named, or the one they are looking at
      c.rank = c.score;
      for (const s of c.subjects || []) {
        const sp = obs.reg.get(s);
        if (sp && sp.given) c.rank += 0.15;
        if (obs.focus === s) c.rank += 0.05;
      }
    }
    // a species just written about waits (a weightier story only a while; a death, the end of its story, not at all)
    const subjectGap = (c) => (c.final ? T.subjectGap / 3 : c.rank >= 0.7 ? T.subjectGap / 3 : T.subjectGap);
    const ok = (c) => (c.force || t - toldAt(c.kind) >= T.kindGap)
      && (c.force || !(c.subjects || []).some((s) => t - toldAt(`sp:${s}`) < subjectGap(c)))
      && (!c.key || t - toldAt(c.key) >= (c.keyGap ?? 30 * MIN));
    const live = cands.filter(ok).sort((a, b) => b.rank - a.rank);
    T.debug?.(t, cands, live);
    if (!live.length) return [];
    const best = live[0];
    const settling = t < T.warm && !best.force;
    const gapOk = now - S.lastReal >= T.gapReal && t - S.lastStory >= T.gapSim;
    const afford = S.tokens >= 1 ? best.rank >= T.need : best.rank >= T.borrow && S.tokens > -1;
    if (settling || !afford) return [];
    if (!gapOk) {
      if (best.rank >= 0.6 && best !== S.pending && (!S.pending || best.rank > S.pending.rank)) S.pending = { ...best, until: t + T.wait };
      return [];
    }
    S.pending = null;
    S.tokens -= 1;
    S.lastStory = t; S.lastReal = now;
    S.told.set(best.kind, t);
    if (best.key) S.told.set(best.key, t);
    for (const s of best.subjects || []) { S.told.set(`sp:${s}`, t); S.told.set(`last:${s}`, best.kind); }
    const text = best.html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    for (const s of best.subjects || []) S.latest.set(s, { t, text, html: best.html });
    best.onTold?.();
    return [{ html: best.html, text, col: best.col, kind: best.kind, subjects: best.subjects || [], score: best.score }];
  }

  // ------------------------------------------------------------------ helpers for the stories
  // the narrator's turns of phrase for a kind of story, one after another, so the same words do not come every time
  const vary = (kind, list) => { const n = S.voice[kind] = (S.voice[kind] || 0) + 1; return list[(n - 1) % list.length]; };
  const L = (reg, serial) => { const sp = reg.get(serial); return sp ? link(serial, sp.name) : 'an unrecorded species'; };
  const guildOf = (sp) => dietGuild(sp.genome);
  const descendants = (reg, serial) => {
    const out = [];
    for (const sp of reg.values()) {
      if (!sp.alive || !sp.established || sp.serial === serial) continue;
      let a = sp.ancestor, n = 0;
      while (a && n++ < 200) { if (a === serial) { out.push(sp); break; } a = reg.get(a)?.ancestor; }
    }
    return out.sort((a, b) => b.pop - a.pop);
  };
  const genusAlive = (reg, genus) => { for (const sp of reg.values()) if (sp.alive && sp.genus === genus) return true; return false; };
  const genusCount = (reg, genus) => { let n = 0; for (const sp of reg.values()) if (sp.genus === genus && sp.established) n++; return n; };
  const topBy = (m) => { let k = null, v = 0, sum = 0; for (const [a, b] of m) { sum += b; if (b > v) { v = b; k = a; } } return [k, v, sum]; };

  // why a species is dwindling (or went): the deaths that took it over [t0, t], read against its
  // hunters, its food and the water. Returns { phrase, cause, by }.
  function whyDeclined(ctx, sp, st, t0) {
    const { reg, t } = ctx;
    const c = causesIn(st, t0, t);
    const deaths = c[C.starved] + c[C.old] + c[C.eaten] + c[C.scalded] + c[C.stranded];
    if (deaths < 8) return null;
    const share = (i) => c[i] / deaths;
    const births = c[C.born];
    const before = causesIn(st, t0 - (t - t0), t0)[C.born];
    const guild = guildOf(sp);
    const ev = ctx.event;
    // its hunters over the stretch
    const eaters = new Map();
    for (const p of S.pairs.values()) if (p.q === sp.serial) { const [, m] = pairSum(p, t0, t); if (m) eaters.set(p.h, m); }
    const [eater, em, esum] = topBy(eaters);
    if (share(C.eaten) >= 0.45) {
      if (eater && em >= 0.4 * esum && reg.get(eater)) {
        const eg = guildOf(reg.get(eater));
        const verb = guild === 'producer' ? 'grazed down' : eg === 'predator' ? 'hunted down' : 'eaten';
        return { cause: 'eaten', by: eater, phrase: `was ${verb} by ${L(reg, eater)}, which pursued it without rest` };
      }
      return { cause: 'eaten', phrase: guild === 'producer' ? 'was grazed away by a thousand mouths' : 'was devoured by a host of enemies at once' };
    }
    if (share(C.stranded) >= 0.35) {
      return { cause: 'stranded', phrase: ev?.type === 'frost' ? 'was taken by the ice' : ev?.type === 'drought' ? 'was left to perish upon the mud as the water fled' : 'was stranded in the shallows' };
    }
    if (share(C.scalded) >= 0.35) {
      const g = sp.genome;
      return { cause: 'scalded', phrase: ctx.excursion && ctx.excursion.dT > 0 ? 'perished in the fever of the heat wave' : `was scalded, the water grown to ${Math.round(ctx.temp)}° and it made for ${Math.round(g.topt)}°` };
    }
    if (share(C.starved) >= 0.4) {
      if (guild === 'producer') {
        if (ev?.type === 'duckweed') return { cause: 'starved', phrase: 'starved in the shadow of the duckweed' };
        if (ev?.type === 'storm' || ev?.type === 'frost') return { cause: 'starved', phrase: 'starved beneath a sky that gave no light' };
        if ((ctx.light ?? 1) < 0.16) return { cause: 'starved', phrase: 'starved in the failing light' };
        return { cause: 'starved', phrase: 'starved, its place in the light taken by others' };
      }
      // its food: what it ate before the decline
      const [food, fm, fsum] = topBy(st.diet);
      const fsp = food && reg.get(food);
      if (fsp && fm >= 0.35 * fsum) {
        if (!fsp.alive) return { cause: 'starved', by: food, phrase: `starved when ${L(reg, food)}, its daily bread, vanished from the world` };
        const fst = S.sp.get(food);
        const was = fst && popAgo(fst, t, t - t0 + 5 * MIN);
        if (was && fsp.pop < 0.5 * was) return { cause: 'starved', by: food, phrase: `starved as ${L(reg, food)}, upon which it fed, dwindled away` };
        return { cause: 'starved', by: food, phrase: `starved, though ${L(reg, food)}, its food, endured` };
      }
      return { cause: 'starved', phrase: guild === 'grazer' ? 'starved as the meadows thinned' : guild === 'scavenger' ? 'starved, for even the dead grew scarce' : 'starved for want of prey' };
    }
    if (share(C.old) >= 0.4 && births < 0.4 * Math.max(1, before)) {
      // a rival of its own guild, rising
      let rival = null, gain = 0;
      for (const o of reg.values()) {
        if (!o.alive || !o.established || o.serial === sp.serial || guildOf(o) !== guild) continue;
        const ost = S.sp.get(o.serial);
        const was = ost && popAgo(ost, t, t - t0);
        if (was != null && o.pop - was > gain && o.pop > 2 * was) { gain = o.pop - was; rival = o; }
      }
      return { cause: 'old', by: rival?.serial, phrase: rival ? `was outbred, it would seem, by ${L(reg, rival.serial)}; it ceased to divide, and its cells grew old and died` : 'ceased to divide, and its cells grew old and died' };
    }
    return null;
  }

  // ------------------------------------------------------------------ detectors
  // Life all but gone, and life come back.
  function detectCollapse(ctx, add) {
    const { t, living } = ctx;
    if (living > S.maxLiving) { S.maxLiving = living; S.maxAt = t; }
    if (!S.collapsed && S.maxLiving >= 2000 && living < 0.03 * S.maxLiving) {
      S.collapsed = { t, low: living };
      add({ kind: 'collapse', force: true, score: 1, col: 0xff6a6aff,
        html: `<b>Life has all but failed.</b> Of the ${fmt(S.maxLiving)} cells that lived at ${fmtClock(S.maxAt)}, ${fmt(living)} remain; from these few, or from the silt itself, the next world must be made, as every world before it was.` });
    } else if (S.collapsed) {
      S.collapsed.low = Math.min(S.collapsed.low, living);
      if (living >= 0.25 * S.maxLiving) {
        const top = [...ctx.reg.values()].filter((s) => s.alive && s.established).sort((a, b) => b.pop - a.pop)[0];
        const since = S.collapsed.t;
        S.collapsed = false;
        add({ kind: 'collapse', force: true, score: 0.8, col: 0xff7fe0b0, subjects: top ? [top.serial] : [],
          html: `<b>Life has returned</b>, as it returns to all who wait: ${fmt(living)} cells, ${durWords(t - since)} after it fell to almost nothing${top ? `, and ${L(ctx.reg, top.serial)} the first among them` : ''}.` });
      }
    }
  }

  // The last of a guild gone, and a guild's return.
  function detectGuilds(ctx, add) {
    const { reg, t, living } = ctx;
    const cells = { producer: 0, grazer: 0, scavenger: 0, predator: 0 }, last = {};
    for (const sp of reg.values()) {
      if (!sp.alive) continue;
      const g = guildOf(sp);
      cells[g] += sp.pop;
      if (sp.established && (!last[g] || sp.pop > last[g].pop)) last[g] = sp;
    }
    const prev = S.guilds;
    S.guilds = { cells, t, last, peak: prev ? Object.fromEntries(Object.keys(cells).map((g) => [g, Math.max(cells[g], (prev.peak[g] || 0) * (t - prev.t > 600 ? 0.9 : 1))])) : cells };
    if (!prev) return;
    for (const g of Object.keys(cells)) {
      const had = S.guilds.peak[g] >= Math.max(50, 0.005 * living);
      if (prev.cells[g] > 0 && cells[g] === 0 && had && !S.guildGone[g]) {
        S.guildGone[g] = t;
        const lastSp = prev.last[g];
        add({ kind: 'guild', force: true, score: 0.95, col: 0xffff5e7a, subjects: lastSp ? [lastSp.serial] : [],
          html: `<b>The last ${GUILD[g].one} is gone.</b> ${lastSp ? `With ${L(reg, lastSp.serial)} perished, ${GUILD[g].none}` : Cap(GUILD[g].none)}.` });
      } else if (S.guildGone[g] && last[g] && cells[g] > 0) {
        const since = S.guildGone[g];
        delete S.guildGone[g];
        if (t - since < 5 * MIN) continue;
        const sp = last[g], anc = sp.ancestor && reg.get(sp.ancestor);
        const origin = sp.founder ? 'sparked from silt' : anc ? `descended from ${L(reg, anc.serial)}, ${/^[aeiou]/.test(GUILD[guildOf(anc)].one) ? 'an' : 'a'} ${GUILD[guildOf(anc)].one}` : 'of unrecorded ancestry';
        add({ kind: 'guild', score: 0.75, col: 0xff7fe0b0, subjects: [sp.serial],
          html: `<b>${Cap(GUILD[g].many)} are back.</b> ${L(reg, sp.serial)}, ${origin}, is the first ${GUILD[g].one} the pool has known since ${fmtClock(since)}; what is lost is seldom lost for ever.` });
      }
    }
  }

  // Post-mortems, the end of a genus, and waves of extinction.
  function detectExtinctions(ctx, add) {
    const { reg, t } = ctx;
    for (const [serial, st] of S.sp) {
      const sp = reg.get(serial);
      if (!sp || sp.alive || st.gone) continue;
      st.gone = t;
      const life = (sp.extinct ?? t) - (sp.born || 0);
      const peakShare = st.peakShare || 0;
      const reigned = st.reign || 0;
      // the end of a genus that lasted: four species or more over half an hour
      const gen = ctx.genera?.get(sp.genus);
      const genusEnds = !genusAlive(reg, sp.genus) && genusCount(reg, sp.genus) >= 4 && t - (gen?.born ?? t) >= 30 * MIN;
      // a species of some weight: a fiftieth of the living at its height
      if (sp.peak >= 3 * ctx.est && peakShare >= 0.02) S.ext.push([t, serial]);
      const notable = sp.peak >= 3 * ctx.est && ((peakShare >= 0.02 && life >= 20 * MIN) || (peakShare >= 0.08 && life >= 12 * MIN) || reigned >= 5 * MIN || sp.given || genusEnds);
      if (!notable) continue;
      // its decline: from its last peak (within twenty minutes) to its end
      const pk = peakIn(st, t - 20 * MIN);
      const t0 = Math.min(pk ? pk[0] : t - 10 * MIN, t - 3 * MIN);
      const why = whyDeclined(ctx, sp, st, t0);
      const bits = [];
      if (why) bits.push(`It ${why.phrase}.`);
      // a hunter it outlived
      const [hunter, hm, hsum] = topBy(st.eaters);
      const hsp = hunter && reg.get(hunter);
      if (hsp && !hsp.alive && hm >= 0.25 * hsum && hsp.extinct && hsp.extinct < t - MIN && why?.by !== hunter) {
        bits.push(`${L(reg, hunter)} had hunted it, and went before it to the grave.`);
      }
      const kids = descendants(reg, serial);
      if (genusEnds) bits.push(`With it ends the house of <b>${esc(sp.genus)}</b>, after ${numWord(genusCount(reg, sp.genus))} species.`);
      else if (kids.length) bits.push(`Yet its line endures in ${L(reg, kids[0].serial)}${kids.length > 1 ? ` and ${numWord(kids.length - 1)} other${kids.length > 2 ? 's' : ''}` : ''}.`);
      const head = `${L(reg, serial)} is no more, after ${durWords(life)} of life${reigned >= 10 * MIN ? `, ${durWords(reigned)} of them as sovereign of the pool` : ''}.`;
      // its crash told lately, its death adds little
      const lately = t - toldAt(`sp:${serial}`) < 20 * MIN && S.told.get(`last:${serial}`) === 'crash';
      const score = 0.5 + (reigned >= 10 * MIN ? 0.2 : 0) + 0.15 * Math.min(1, life / 3600) + 0.15 * Math.min(1, peakShare / 0.2) + (genusEnds ? 0.1 : 0) + (why ? 0.05 : -0.1) - (lately ? 0.25 : 0);
      add({ kind: 'obit', score, col: sp.genome.col, subjects: [serial], key: `obit:${serial}`, final: true,
        html: `${head} ${bits.join(' ')}`.trim() });
    }
    // a wave of extinctions: species of weight lost at three times the pace of the hour before
    S.ext = S.ext.filter(([x]) => x > t - 70 * MIN);
    const recent = S.ext.filter(([x]) => x > t - 10 * MIN), lost = recent.length;
    const base = (S.ext.length - lost) / 6;
    let weighty = 0;
    for (const sp of reg.values()) if (sp.alive && sp.established && (S.sp.get(sp.serial)?.peakShare || 0) >= 0.02) weighty++;
    if (t >= 30 * MIN && lost >= Math.max(5, 0.3 * (weighty + lost), 3 * base) && t - toldAt('mass') >= 20 * MIN) {
      const named = recent.map(([, s]) => reg.get(s)).filter(Boolean).sort((a, b) => b.peak - a.peak).slice(0, 2).map((sp) => L(reg, sp.serial));
      const ev = ctx.event || (S.eventMark && t - (S.eventMark.end ?? t) < 10 * MIN ? S.eventMark : null);
      const what = ev ? { drought: 'The drought', storm: 'The storm', frost: 'The frost', duckweed: 'The duckweed’s shade' }[ev.type] : null;
      add({ kind: 'mass', score: 0.9, col: 0xffff5e7a, subjects: [], force: true,
        html: `${what ? `In ten minutes ${what.toLowerCase()} has carried off` : '<b>A great dying.</b> In ten minutes'} ${numWord(lost)} species${what ? '' : ' have perished'}${named.length ? `, ${andList(named)} among them` : ''}.` });
    }
  }

  // The most numerous species: a long reign, and its end.
  function detectReign(ctx, add) {
    const { reg, t, living } = ctx;
    let best = null;
    for (const sp of reg.values()) if (sp.alive && sp.established && (!best || sp.pop > best.pop)) best = sp;
    for (const sp of reg.values()) {
      if (!sp.alive || !sp.established) continue;
      const st = S.sp.get(sp.serial);
      if (st && living > 0) st.peakShare = Math.max(st.peakShare || 0, sp.pop / living);
    }
    const R = S.top;
    const cur = reg.get(R.serial);
    if (!best) return;
    if (!cur || !cur.alive || (best.serial !== R.serial && best.pop > cur.pop * 1.25)) {
      const was = cur && R.serial ? { serial: R.serial, len: t - R.since } : null;
      S.top = { serial: best.serial, since: t, marks: 0 };
      if (was && was.len >= 20 * MIN && t > T.warm) {
        const wst = S.sp.get(was.serial);
        const why = cur && cur.alive && wst ? whyDeclined(ctx, cur, wst, t - 10 * MIN) : null;
        add({ kind: 'reign', score: 0.55 + Math.min(0.3, was.len / 7200), col: best.genome.col, subjects: [was.serial, best.serial],
          html: `After ${durWords(was.len)}, the reign of ${L(reg, was.serial)} is ended${why ? `: it ${why.phrase}` : ''}. ${L(reg, best.serial)}, ${describeShort(best)}, now holds the pool.` });
      }
      return;
    }
    const st = S.sp.get(R.serial);
    if (st) st.reign = t - R.since;
    const len = t - R.since, marks = [3600, 7200, 14400, 28800];
    const m = marks.findIndex((x) => len < x);
    const passed = m < 0 ? marks.length : m;
    if (passed > (R.marks || 0)) {
      R.marks = passed;
      add({ kind: 'reign', score: 0.35 + 0.05 * passed, col: cur.genome.col, subjects: [R.serial], key: `reign:${R.serial}:${passed}`,
        html: `For ${durWords(len)} ${L(reg, R.serial)} has held the pool, ${shareWords(cur.pop / Math.max(1, living)) === 'a few' ? `${fmt(cur.pop)} cells strong` : `${shareWords(cur.pop / Math.max(1, living))} of all that lives`}; few reigns last so long.` });
    }
  }
  const describeShort = (sp) => {
    const g = sp.genome, guild = GUILD[dietGuild(g)].one, mob = mobilityGuild(g);
    const multi = (g.adhesion || 0) > K.adhMin;
    const how = mob === 'sessile' ? 'anchored' : mob === 'swimmer' ? 'swimming' : mob === 'drifter' ? 'drifting' : 'crawling';
    const w = `${how} ${multi ? 'many-celled ' : ''}${guild}`;
    return `${/^[aeiou]/.test(w) ? 'an' : 'a'} ${w}`;
  };

  // Crashes, booms and comebacks of single species.
  function detectSwings(ctx, add) {
    const { reg, t, living, est } = ctx;
    if (t < T.warm) return;
    for (const st of S.sp.values()) {
      const sp = reg.get(st.serial);
      if (!sp || !sp.alive || !sp.established) continue;
      // every swing told is of a species of some weight (a crash from 2% of the living, a boom to 5%, a comeback from 1.5%)
      if ((st.peakShare || 0) < 0.015 && sp.pop < 0.01 * living && !st.low) continue;
      const pk = peakIn(st, t - 15 * MIN);
      if (!pk) continue;
      // a crash: down to a quarter or less of a big peak within ten minutes, a peak near the highest it has
      // known this hour (a species that booms and busts every few minutes is cycling, not crashing)
      const high = st.l.reduce((m, x) => (x[0] >= t - 60 * MIN ? Math.max(m, x[1]) : m), 0);
      if (pk[1] >= Math.max(4 * est, 0.02 * living) && pk[1] >= 0.8 * high && sp.pop <= 0.25 * pk[1] && t - pk[0] <= 10 * MIN && st.crashed !== pk[0]) {
        st.crashed = pk[0];
        const why = whyDeclined(ctx, sp, st, pk[0]);
        // meadows boom and bust as grazers find them: only the great ones are news
        const share = pk[1] / Math.max(1, living);
        add({ kind: 'crash', score: 0.4 + 0.25 * Math.min(1, share / 0.2) + (why ? 0.05 : 0) - (guildOf(sp) === 'producer' ? 0.05 : 0), col: sp.genome.col, subjects: [sp.serial], key: `crash:${sp.serial}`, keyGap: 60 * MIN,
          html: `${vary('crash', ['How swiftly fortune turns:', 'So fall the mighty:', 'Pride goes before the fall:'])} in ${durWords(t - pk[0])} ${L(reg, sp.serial)} has gone from ${fmt(pk[1])} cells to ${fmt(sp.pop)}.${why ? ` It ${why.phrase}.` : ''}` });
      }
      // near extinction: remember the low, and its recovery
      if (st.low && t - st.low.t > 40 * MIN) st.low = null;
      if (pk[1] >= Math.max(4 * est, 0.015 * living) && sp.pop <= Math.max(3, 0.05 * pk[1]) && (!st.low || sp.pop < st.low.n)) st.low = { n: sp.pop, t, peak: pk[1] };
      if (st.low && sp.pop >= 0.5 * st.low.peak && sp.pop >= 3 * est && t - st.low.t >= 2 * MIN) {
        const c = causesIn(st, st.low.t - 2 * MIN, t);
        const slept = c[C.woke] > 0.3 * sp.pop;
        add({ kind: 'comeback', score: 0.65, col: sp.genome.col, subjects: [sp.serial], key: `back:${sp.serial}`, keyGap: 40 * MIN,
          html: `<b>Back from the brink.</b> ${L(reg, sp.serial)}, brought down to ${fmt(st.low.n)} cell${st.low.n === 1 ? '' : 's'} at ${fmtClock(st.low.t)}, now numbers ${fmt(sp.pop)}${slept ? ', its sleeping cysts having woken to save it' : ''}. ${vary('comeback', ['All wisdom is in two words: wait, and hope.', 'Patience is the courage of the humble.', 'The grave had been dug, and stood empty.'])}` });
        st.low = null;
      }
      // a boom: five times its numbers ten minutes ago, to a new height and a twentieth of the living
      const was = popAgo(st, t, 10 * MIN);
      const hist = st.l.reduce((m, x) => (x[0] < t - 10 * MIN ? Math.max(m, x[1]) : m), 0);
      if (was != null && was > 0 && sp.pop >= 5 * was && sp.pop >= 0.05 * living && sp.pop >= 10 * est && sp.pop > 1.5 * hist) {
        const [food, fm, fsum] = topBy(st.diet);
        const on = food && fm >= 0.4 * fsum && reg.get(food) ? `, which feasts upon ${L(reg, food)}` : '';
        add({ kind: 'boom', score: 0.45 + 0.2 * Math.min(1, sp.pop / living / 0.25), col: sp.genome.col, subjects: [sp.serial], key: `boom:${sp.serial}`,
          html: `${vary('boom', ['Fortune smiles upon', 'The tide has turned for', 'Providence favours'])} ${L(reg, sp.serial)}${on}: ${fmt(was)} cells ten minutes ago, ${fmt(sp.pop)} now.` });
      }
    }
  }

  // The world's firsts.
  function detectFirsts(ctx, add) {
    const { reg, t } = ctx;
    if (!S.firsts) S.firsts = new Set();
    for (const sp of reg.values()) {
      if (!sp.established || !sp.alive) continue;
      const st = S.sp.get(sp.serial);
      if (!st || st.firstsDone) continue;
      st.firstsDone = true;
      for (const [key, words] of firstsOf(sp.genome, K)) {
        if (S.firsts.has(key)) continue;
        S.firsts.add(key);
        // a world's first minutes set what it starts with
        if (t < 3 * MIN) continue;
        add({ kind: 'first', score: key === 'multi' || key === 'guild:predator' ? 0.75 : 0.65, col: sp.genome.col, subjects: [sp.serial], key: `first:${key}`, keyGap: Infinity,
          html: `<b>Never before in this world:</b> ${L(reg, sp.serial)} is the first ${FIRST_LEAD[key] || `species ${words}`}.` });
      }
    }
  }

  // Arms races: a hunter genus losing (or finding) its grip on a prey genus as their signatures drift.
  function detectArms(ctx, add) {
    const { reg, t } = ctx;
    if (t < 25 * MIN) return;
    const G = new Map(); // "hg|qg" -> { a: [tries, meals, fitSum], b: [...], h: Map, q: Map }
    for (const p of S.pairs.values()) {
      const h = reg.get(p.h), q = reg.get(p.q);
      if (!h || !q || h.genus === q.genus) continue;
      const key = `${h.genus}|${q.genus}`;
      let g = G.get(key);
      if (!g) G.set(key, (g = { hg: h.genus, qg: q.genus, a: [0, 0, 0], b: [0, 0, 0], hb: new Map(), qb: new Map(), hguild: guildOf(h), qguild: guildOf(q) }));
      const fit = p.fit ?? (p.fit = fitOf(h.genome, q.genome, K));
      const [ta, ma] = pairSum(p, t - 20 * MIN, t - 10 * MIN), [tb, mb] = pairSum(p, t - 6 * MIN, t);
      g.a[0] += ta; g.a[1] += ma; g.a[2] += ta * fit;
      g.b[0] += tb; g.b[1] += mb; g.b[2] += tb * fit;
      if (tb) { g.hb.set(p.h, (g.hb.get(p.h) || 0) + tb); g.qb.set(p.q, (g.qb.get(p.q) || 0) + tb); }
    }
    for (const g of G.values()) {
      if (g.a[0] < 150 || g.b[0] < 150 || g.hguild === 'scavenger') continue;
      const ra = g.a[1] / g.a[0], rb = g.b[1] / g.b[0];
      const fa = g.a[2] / g.a[0], fb = g.b[2] / g.b[0];
      const losing = ra >= 0.12 && rb <= 0.55 * ra && fb <= fa - 0.15;
      const winning = rb >= 0.12 && rb >= 1.8 * ra && fb >= fa + 0.15;
      if (!losing && !winning) continue;
      const [qs] = topBy(g.qb), [hs] = topBy(g.hb);
      const oneIn = (r) => `one in ${numWord(Math.max(1, Math.round(1 / Math.max(r, 1e-3))))}`;
      const verb = g.qguild === 'producer' ? 'bites land on' : 'catch';
      const hgB = `<b>${esc(g.hg)}</b>`, qgB = `<b>${esc(g.qg)}</b>`;
      const html = losing
        ? `The ${qgB} are slipping from the grasp of the ${hgB}. Their ${GUILD[g.hguild].many} now ${verb === 'catch' ? 'take' : 'land bites on'} ${oneIn(rb)} of those they pursue, where ten minutes since it was ${oneIn(ra)}; for the newer ${qgB}, such as ${L(reg, qs)}, wear a face that ${L(reg, hs)} scarcely knows.`
        : `The ${hgB} have taken the measure of the ${qgB}: ${oneIn(rb)} of their attempts now succeeds, where it was ${oneIn(ra)}, for their newer kind, as ${L(reg, hs)}, know the face of the ${qgB} all too well.`;
      add({ kind: 'arms', score: 0.7, col: reg.get(hs)?.genome.col ?? 0xffffffff, subjects: [hs, qs], key: `arms:${g.hg}|${g.qg}`, keyGap: 40 * MIN, html });
    }
  }

  // A consumer living almost entirely on one species, and that food failing.
  function detectDiets(ctx, add) {
    const { reg, t } = ctx;
    if (t < T.warm) return;
    const recent = new Map(); // h -> Map(q -> meals)
    for (const p of S.pairs.values()) {
      const [, m] = pairSum(p, t - 10 * MIN, t);
      if (!m) continue;
      if (!recent.has(p.h)) recent.set(p.h, new Map());
      recent.get(p.h).set(p.q, m);
    }
    for (const [h, m] of recent) {
      const [q, qm, sum] = topBy(m);
      const hsp = reg.get(h), qsp = reg.get(q);
      if (!hsp || !qsp || !hsp.alive || sum < 80 || qm < 0.75 * sum || hsp.genus === qsp.genus) continue;
      // species of some weight only: a hundredth of the living
      if (hsp.pop < 0.01 * ctx.living) continue;
      add({ kind: 'diet', score: 0.4, col: hsp.genome.col, subjects: [h, q], key: `diet:${h}:${q}`, keyGap: Infinity,
        html: `${L(reg, h)} has bound its fate to ${L(reg, q)}: ${shareWords(qm / sum)} of all it eats.` });
      const qst = S.sp.get(q), pk = qst && peakIn(qst, t - 15 * MIN);
      if (qsp.alive && pk && qsp.pop <= 0.4 * pk[1] && pk[1] >= Math.max(3 * ctx.est, 0.01 * ctx.living)) {
        add({ kind: 'diet', score: 0.55 + 0.1 * Math.min(1, hsp.pop / ctx.living / 0.05), col: qsp.genome.col, subjects: [q, h], key: `food:${h}:${q}`, keyGap: 30 * MIN,
          html: `${L(reg, q)}, which is ${shareWords(qm / sum)} of what ${L(reg, h)} eats, has fallen from ${fmt(pk[1])} cells to ${fmt(qsp.pop)}. Where the one goes, the other may soon follow.` });
      }
    }
  }

  // Hunter and hunted cycling: the prey booms, the hunter follows, both crash, again and again.
  function peaksOf(series, rel = 0.35) {
    // zigzag: turning points whose swing is at least rel of the larger side
    const out = [];
    if (series.length < 5) return out;
    let dir = 0, ext = series[0];
    for (const x of series) {
      if (dir >= 0) {
        if (x[1] >= ext[1]) ext = x;
        else if (x[1] <= ext[1] * (1 - rel)) { if (dir === 1 || out.length || ext !== series[0]) out.push(['peak', ...ext]); dir = -1; ext = x; }
      } else {
        if (x[1] <= ext[1]) ext = x;
        else if (x[1] >= Math.max(1, ext[1]) * (1 + rel / (1 - rel))) { out.push(['low', ...ext]); dir = 1; ext = x; }
      }
    }
    return out.filter((p) => p[0] === 'peak').map((p) => p[1]);
  }
  function detectCycles(ctx, add) {
    const { reg, t } = ctx;
    if (t < 40 * MIN) return;
    const byH = new Map();
    for (const p of S.pairs.values()) {
      const [, m] = pairSum(p, t - 60 * MIN, t);
      if (m < 60) continue;
      if (!byH.has(p.h)) byH.set(p.h, []);
      byH.get(p.h).push([p.q, m]);
    }
    for (const [h, list] of byH) {
      const sum = list.reduce((a, b) => a + b[1], 0);
      for (const [q, m] of list) {
        if (m < 0.4 * sum) continue;
        const hs = S.sp.get(h), qs = S.sp.get(q), hsp = reg.get(h), qsp = reg.get(q);
        if (!hs || !qs || !hsp?.alive || !qsp?.alive) continue;
        const pq = peaksOf(qs.l.filter((x) => x[0] > t - 90 * MIN)), ph = peaksOf(hs.l.filter((x) => x[0] > t - 90 * MIN));
        let n = 0, lag = 0;
        for (let i = 0; i < pq.length; i++) {
          const next = pq[i + 1] ?? Infinity;
          const f = ph.find((x) => x > pq[i] + 30 && x < Math.min(next, pq[i] + 15 * MIN));
          if (f != null) { n++; lag += f - pq[i]; }
        }
        if (n < 3) continue;
        add({ kind: 'cycle', score: 0.7, col: hsp.genome.col, subjects: [h, q], key: `cycle:${h}:${q}`, keyGap: 90 * MIN,
          html: `${L(reg, h)} and ${L(reg, q)} are bound together as hunter and hunted: ${numWord(n)} times now ${L(reg, q)} has flourished, ${L(reg, h)} has followed it some ${durWords(lag / n)} later, and both have fallen together.` });
      }
    }
  }

  // Where species live: on the move, spreading out, or pushed into a corner.
  function detectRanges(ctx, add) {
    const { reg, t, living, world } = ctx;
    if (t < T.warm || !world) return;
    for (const st of S.sp.values()) {
      const sp = reg.get(st.serial);
      if (!sp?.alive || !sp.established || sp.pop < 0.03 * living || st.rng.length < 3) continue;
      const now = st.rng[st.rng.length - 1], then = st.rng.find((x) => x[0] >= t - 12 * MIN && x[0] <= t - 8 * MIN);
      if (!then || now[0] < t - 2 * MIN) continue;
      const tight = (r) => Math.min(r[3], r[4]), loose = (r) => Math.max(r[3], r[4]);
      if (tight(now) >= 0.45 && tight(then) >= 0.45) {
        const dx = wrap01(now[1] - then[1]), dy = wrap01(now[2] - then[2]);
        const d = Math.hypot(dx * world[0], dy * world[1]);
        if (d >= 0.2 * Math.min(world[0], world[1])) {
          // chasing its food?
          const [food, fm, fsum] = topBy(st.diet);
          const fst = food && fm >= 0.4 * fsum && S.sp.get(food);
          const fn = fst?.rng.at(-1), ft = fst?.rng.find((x) => x[0] >= t - 12 * MIN && x[0] <= t - 8 * MIN);
          const chase = fn && ft && Math.min(fn[3], fn[4]) >= 0.35 && wrap01(fn[1] - ft[1]) * dx + wrap01(fn[2] - ft[2]) * dy > 0.5 * (dx * dx + dy * dy);
          add({ kind: 'range', score: chase ? 0.6 : 0.45, col: sp.genome.col, subjects: chase ? [sp.serial, food] : [sp.serial], key: `move:${sp.serial}`, keyGap: 30 * MIN,
            html: chase ? `${L(reg, sp.serial)} has pursued ${L(reg, food)}, its quarry, ${heading(dx, dy)} across the pool: ${lenWords(d)} in ${durWords(now[0] - then[0])}.`
              : `${L(reg, sp.serial)} is on the move: its cells have shifted ${lenWords(d)} ${heading(dx, dy)} in ${durWords(now[0] - then[0])}, to the ${compass(now[1], now[2])} of the pool.` });
        }
      }
      const was = popAgo(st, t, 10 * MIN);
      if (tight(then) >= 0.6 && loose(now) <= 0.25 && was != null && sp.pop >= 2 * was) {
        add({ kind: 'range', score: 0.55, col: sp.genome.col, subjects: [sp.serial], key: `spread:${sp.serial}`, keyGap: 60 * MIN,
          html: `${L(reg, sp.serial)} has broken from its refuge in the ${compass(then[1], then[2])} and spread across the pool: ${fmt(was)} cells ten minutes ago, ${fmt(sp.pop)} now.` });
      } else if (loose(then) <= 0.25 && tight(now) >= 0.6 && was != null && sp.pop <= 0.5 * was) {
        add({ kind: 'range', score: 0.5, col: sp.genome.col, subjects: [sp.serial], key: `pocket:${sp.serial}`, keyGap: 60 * MIN,
          html: `${L(reg, sp.serial)}, which once was everywhere, is reduced to a last refuge in the ${compass(now[1], now[2])} of the pool.` });
      }
    }
  }

  // A genus radiating: many new species at once.
  function detectRadiation(ctx, add) {
    const { reg, t } = ctx;
    if (t < T.warm) return;
    const fresh = new Map();
    for (const sp of reg.values()) {
      if (!sp.established || (sp.establishedAt ?? 0) < t - 15 * MIN) continue;
      if (!fresh.has(sp.genus)) fresh.set(sp.genus, []);
      fresh.get(sp.genus).push(sp);
    }
    for (const [genus, list] of fresh) {
      const alive = list.filter((sp) => sp.alive);
      if (list.length < 6 || alive.length < 4) continue;
      // a radiation spreads into new ways of living: three kinds at least (diet, movement, body)
      const kinds = new Set(list.map((sp) => describeShort(sp)));
      if (kinds.size < 3) continue;
      const sorted = [...kinds];
      const range = `, from ${sorted[0].replace(/^an? /, '')}s to ${sorted[sorted.length - 1].replace(/^an? /, '')}s`;
      const lead = alive.sort((a, b) => b.pop - a.pop)[0];
      add({ kind: 'radiation', score: Math.min(0.75, 0.45 + 0.05 * kinds.size), col: lead.genome.col, subjects: [lead.serial], key: `rad:${genus}`, keyGap: 40 * MIN,
        html: `The house of <b>${esc(genus)}</b> flourishes: ${numWord(list.length)} new species in ${durWords(t - Math.min(...list.map((sp) => sp.establishedAt ?? t)))}${range}, with ${L(reg, lead.serial)} at their head.` });
    }
  }

  // Lineages tracking the water, and growing or shrinking, over the last hour.
  function detectTrends(ctx, add) {
    const { reg, t } = ctx;
    if (t - (S.genusMarks.at(-1)?.t ?? -1e9) >= 5 * MIN) {
      const mark = { t, temp: ctx.temp, g: new Map() };
      for (const sp of reg.values()) {
        if (!sp.alive || !sp.established) continue;
        let m = mark.g.get(sp.genus);
        if (!m) mark.g.set(sp.genus, (m = { n: 0, topt: 0, size: 0, swim: 0, multi: 0, pop: 0 }));
        const g = sp.genome, w = sp.pop;
        m.pop += w; m.n++;
        m.topt += w * (g.topt ?? 19); m.size += w * g.size; m.swim += w * g.swim * (1 - g.photo); m.multi += w * ((g.adhesion || 0) > K.adhMin ? 1 : 0);
      }
      for (const m of mark.g.values()) for (const k of ['topt', 'size', 'swim', 'multi']) m[k] /= Math.max(1, m.pop);
      S.genusMarks.push(mark);
      while (S.genusMarks.length && S.genusMarks[0].t < t - 2 * 3600) S.genusMarks.shift();
    }
    if (t < 40 * MIN) return;
    const now = S.genusMarks.at(-1);
    const then = S.genusMarks.find((m) => m.t >= t - 50 * MIN && m.t <= t - 30 * MIN);
    if (!now || !then) return;
    for (const [genus, a] of now.g) {
      const b = then.g.get(genus);
      if (!b || a.pop < 0.02 * ctx.living || b.pop < 3 * ctx.est || genusCount(reg, genus) < 3) continue;
      const lead = [...reg.values()].filter((sp) => sp.alive && sp.genus === genus).sort((x, y) => y.pop - x.pop)[0];
      if (!lead) continue;
      const ago = durWords(now.t - then.t);
      const dT = a.topt - b.topt, dW = now.temp - then.temp;
      if (K.heat && Math.abs(dT) >= 5 && Math.abs(dW) >= 4 && Math.sign(dT) === Math.sign(dW)) {
        add({ kind: 'trend', score: 0.6, col: lead.genome.col, subjects: [lead.serial], key: `temp:${genus}`, keyGap: 60 * MIN,
          html: `The <b>${esc(genus)}</b> have followed the water as it ${dW > 0 ? 'warmed' : 'cooled'}: in ${ago} their cells have come to thrive near ${Math.round(a.topt)}°, where once they wanted ${Math.round(b.topt)}°.` });
      } else if (a.size >= 1.3 * b.size || a.size <= b.size / 1.3) {
        const up = a.size > b.size, r = up ? a.size / b.size : b.size / a.size;
        const by = r >= 1.9 ? `${up ? 'twice' : 'half'} the size they were` : r >= 1.45 ? `${up ? 'half again as large as' : 'a third smaller than'} they were` : `a ${up ? 'third larger' : 'quarter smaller'} than they were`;
        add({ kind: 'trend', score: 0.5, col: lead.genome.col, subjects: [lead.serial], key: `size:${genus}`, keyGap: 60 * MIN,
          html: `In ${ago} the <b>${esc(genus)}</b> have ${up ? 'grown' : 'dwindled'}: their cells are now ${by}, and ${L(reg, lead.serial)} the greatest of their number.` });
      } else if (a.swim - b.swim >= 0.35) {
        add({ kind: 'trend', score: 0.5, col: lead.genome.col, subjects: [lead.serial], key: `swim:${genus}`, keyGap: 60 * MIN,
          html: `In ${ago} the <b>${esc(genus)}</b> have learned to swim: ${L(reg, lead.serial)} and its kin now swim ${a.swim / Math.max(0.05, b.swim) >= 2 ? 'twice' : 'far'} as hard as their forebears did.` });
      } else if (a.multi >= 0.6 && b.multi <= 0.2) {
        add({ kind: 'trend', score: 0.55, col: lead.genome.col, subjects: [lead.serial], key: `multi:${genus}`, keyGap: 90 * MIN,
          html: `The <b>${esc(genus)}</b>, solitary once, now live in bodies: in ${ago} their single cells gave way to many-celled kin such as ${L(reg, lead.serial)}.` });
      }
    }
  }

  // The rest: elders, records, reefs, life from the silt, daughters overtaking their mothers.
  function detectMisc(ctx, add) {
    const { reg, t, living } = ctx;
    if (t < T.warm) return;
    let oldest = null, thriving = 0;
    for (const sp of reg.values()) {
      if (!sp.alive || !sp.established) continue;
      thriving++;
      if (!oldest || sp.born < oldest.born) oldest = sp;
    }
    if (oldest) {
      const age = t - oldest.born, marks = [7200, 14400, 28800];
      const m = marks.filter((x) => age >= x).length;
      const st = S.sp.get(oldest.serial);
      if (st && m > (st.elder || 0)) {
        st.elder = m;
        const kin = genusCount(reg, oldest.genus) - 1;
        add({ kind: 'elder', score: 0.4 + 0.05 * m, col: oldest.genome.col, subjects: [oldest.serial], key: `elder:${oldest.serial}:${m}`, keyGap: Infinity,
          html: `${L(reg, oldest.serial)} has lived ${durWords(age)}, the eldest in all the pool${kin >= 3 ? `; it has seen ${numWord(kin)} species of its own house arise, and many of them perish` : ''}.` });
      }
    }
    // diversity at a new height
    if (t >= 20 * MIN && thriving > Math.max(8, S.record * 1.15)) {
      if (S.record) add({ kind: 'record', score: 0.45, col: 0xff7fe0b0, subjects: [], key: 'record', keyGap: 30 * MIN,
        html: `Never has the pool been so rich: ${numWord(thriving)} species thrive in it at once.` });
      S.record = thriving;
    } else if (thriving > S.record) S.record = thriving;
    // reef stone spreading
    if (ctx.stone != null) {
      S.stoneMarks.push([t, ctx.stone]);
      while (S.stoneMarks.length && S.stoneMarks[0][0] < t - 20 * MIN) S.stoneMarks.shift();
      const then = S.stoneMarks.find((x) => x[0] >= t - 16 * MIN);
      if (then && t - then[0] >= 12 * MIN && ctx.stone >= 1.5 * then[1] && ctx.stone - then[1] >= 0.005 * (ctx.count || 1)) {
        const builder = [...reg.values()].filter((sp) => sp.alive && sp.established && (sp.genome.calcify || 0) > 0.05).sort((a, b) => b.pop * b.genome.calcify - a.pop * a.genome.calcify)[0];
        if (builder) add({ kind: 'reef', score: 0.5, col: builder.genome.col, subjects: [builder.serial], key: 'reef', keyGap: 45 * MIN,
          html: `The reefs are rising: ${ctx.stone >= 2 * then[1] ? 'twice' : 'half again'} the stone there was ${durWords(t - then[0])} ago, laid down grain upon patient grain by ${L(reg, builder.serial)} and its like.` });
      }
    }
    for (const sp of reg.values()) {
      if (!sp.alive || !sp.established) continue;
      // life from the silt, taking a tenth of the pool
      if (sp.founder && sp.serial > (ctx.founders ?? Infinity) && sp.pop >= 0.1 * living && living > 500) {
        add({ kind: 'spark', score: 0.6, col: sp.genome.col, subjects: [sp.serial], key: `spark:${sp.serial}`, keyGap: Infinity,
          html: `From a grain of silt, a dynasty: ${L(reg, sp.serial)}, sparked into life at ${fmtClock(sp.born)}, now holds ${shareWords(sp.pop / living) === 'a few' ? 'a tenth' : shareWords(sp.pop / living)} of the pool.` });
      }
      // a daughter overtaking the species it came from
      const anc = sp.ancestor && reg.get(sp.ancestor);
      if (anc && anc.alive && anc.established && sp.pop >= 3 * anc.pop && sp.pop >= 0.03 * living) {
        const a = S.sp.get(anc.serial), b = S.sp.get(sp.serial);
        const aw = a && popAgo(a, t, 10 * MIN), bw = b && popAgo(b, t, 10 * MIN);
        if (aw != null && bw != null && aw >= 2 * bw) {
          add({ kind: 'succession', score: 0.45, col: sp.genome.col, subjects: [sp.serial, anc.serial], key: `succ:${sp.serial}`, keyGap: Infinity,
            html: `The child has eclipsed the parent: ${L(reg, sp.serial)} now outnumbers ${L(reg, anc.serial)}, from which it descends, ${fmt(sp.pop)} cells to ${fmt(anc.pop)}, where ten minutes ago it had ${fmt(bw)} to ${fmt(aw)}.` });
        }
      }
    }
  }

  const SLOW = [detectArms, detectDiets, detectCycles, detectRanges, detectRadiation, detectTrends, detectMisc];

  // ------------------------------------------------------------------ the climate's news
  function snapshot(reg, living) {
    const pops = new Map(), cum = new Map(), guilds = { producer: 0, grazer: 0, scavenger: 0, predator: 0 }, genera = new Set(), generaPop = new Map();
    for (const sp of reg.values()) {
      if (!sp.alive) continue;
      guilds[guildOf(sp)] += sp.pop;
      genera.add(sp.genus);
      generaPop.set(sp.genus, (generaPop.get(sp.genus) || 0) + sp.pop);
      if (!sp.established) continue;
      pops.set(sp.serial, sp.pop);
      const st = S.sp.get(sp.serial);
      if (st) cum.set(sp.serial, st.cum.slice());
    }
    return { pops, cum, guilds, genera, generaPop, living };
  }
  /**
   * The page's news: note('era', { t, name, prev, reg, living }) as an era begins; note('event', { t,
   * type, phase, reg, living }) as one of the pool's events begins (phase its first), turns and ends
   * (phase null); note('excursion', { t, dT, dur, reg, living }) as a heat wave or cold snap begins.
   */
  function note(kind, d) {
    if (kind === 'era') {
      const was = S.eraMark;
      S.eraMark = { t: d.t, name: d.name, snap: snapshot(d.reg, d.living) };
      if (was) S.eraMark.pending = { from: was, name: d.prev ?? was.name, newName: d.name };
    } else if (kind === 'event') {
      const m = S.eventMark;
      // its first phase begins it; its later phases go on with it; none ends it
      if (d.phase && (!m || m.end != null || m.type !== d.type)) S.eventMark = { type: d.type, t: d.t, snap: snapshot(d.reg, d.living) };
      else if (!d.phase && m && m.type === d.type && m.end == null) { m.end = d.t; m.done = true; }
    } else if (kind === 'excursion') {
      S.excursion = { t: d.t, dT: d.dT, end: d.t + d.dur, snap: snapshot(d.reg, d.living) };
    }
  }

  // an era's character: who rose, who fell, the genera lost
  function eraStory(ctx) {
    const { reg, t, living } = ctx;
    const pend = S.eraMark.pending;
    S.eraMark.pending = null;
    const from = pend.from.snap, to = S.eraMark.snap;
    if (t - pend.from.t < 5 * MIN) return null;
    let rise = null, fall = null;
    for (const [serial, p1] of to.pops) {
      const p0 = from.pops.get(serial) || 0;
      if (p1 >= 0.05 * to.living && p1 >= 2 * Math.max(1, p0) && (!rise || p1 - p0 > rise[2])) rise = [serial, p0, p1 - p0];
    }
    for (const [serial, p0] of from.pops) {
      const p1 = to.pops.get(serial) || 0;
      if (p0 >= 0.05 * from.living && p1 <= 0.4 * p0 && (!fall || p0 - p1 > fall[2])) fall = [serial, p0, p0 - p1, p1];
    }
    // genera of weight lost: a fiftieth of the living when the era began
    const lostGenera = [...from.generaPop].filter(([g, n]) => !to.genera.has(g) && n >= 0.02 * from.living).map(([g]) => g);
    const lost = [...from.pops.keys()].filter((s) => !to.pops.has(s)).length;
    const born = [...to.pops.keys()].filter((s) => !from.pops.has(s)).length;
    const share = (snap, g) => snap.guilds[g] / Math.max(1, Object.values(snap.guilds).reduce((a, b) => a + b, 0));
    let best = null, bd = 0;
    for (const g of Object.keys(GUILD)) { const dd = share(to, g) - share(from, g); if (dd > bd) { bd = dd; best = g; } }
    const character = bd >= 0.1 ? `${/^[aeiou]/.test(GUILD[best].one) ? 'an' : 'a'} ${GUILD[best].one}s’ era`
      : lost >= 8 ? 'an era of losses' : born >= 10 ? 'an era of new species' : living >= 1.5 * from.living ? 'a flourishing era' : living <= 0.5 * from.living ? 'a lean era' : null;
    const bits = [];
    if (rise && reg.get(rise[0])) bits.push(`${L(reg, rise[0])} rose to ${fmt(to.pops.get(rise[0]))} cells`);
    if (fall && reg.get(fall[0])) bits.push(fall[3] ? `${L(reg, fall[0])} fell from ${fmt(fall[1])} to ${fmt(fall[3])}` : `${L(reg, fall[0])} was lost`);
    if (lostGenera.length) bits.push(lostGenera.length <= 2 ? `the house${lostGenera.length > 1 ? 's' : ''} of ${andList(lostGenera.map((g) => `<b>${esc(g)}</b>`))} died out` : `${numWord(lostGenera.length)} genera of note died out`);
    const score = 0.2 + (rise ? 0.12 : 0) + (fall ? 0.15 : 0) + (lostGenera.length ? 0.08 : 0) + (bd >= 0.1 ? 0.2 : character ? 0.05 : 0);
    if (!bits.length) return null;
    const subj = [rise?.[0], fall?.[0]].filter((s) => s && reg.get(s));
    return { kind: 'era', score, col: 0xffa0e3f1, subjects: subj, force: score >= 0.7, key: 'era', keyGap: 30 * MIN,
      html: `<b>${esc(pend.name)}</b> has passed into history${character ? `, ${character}` : ''}: ${andList(bits)}.` };
  }

  // what one of the pool's events did, and to whom
  function eventStory(ctx) {
    const { reg, living } = ctx;
    const ev = S.eventMark;
    ev.done = false;
    const from = ev.snap;
    // the species of weight it took (a hundredth of the living as it began)
    const lost = [...from.pops].filter(([s, p0]) => p0 >= 0.01 * from.living && !reg.get(s)?.alive).map(([s]) => reg.get(s)).filter(Boolean).sort((a, b) => b.peak - a.peak);
    let win = null, slept = null, sank = null;
    for (const [serial, p0] of from.pops) {
      const sp = reg.get(serial);
      if (!sp?.alive) continue;
      if (sp.pop >= 2 * Math.max(1, p0) && sp.pop - p0 >= 0.01 * living && (!win || sp.pop - p0 > win[1])) win = [serial, sp.pop - p0, p0];
      const st = S.sp.get(serial), c0 = from.cum.get(serial);
      if (st && c0) {
        const c = st.cum.map((x, i) => x - c0[i]);
        if (c[C.cyst] + c[C.woke] >= 0.3 * Math.max(10, p0) && p0 >= 3 * ctx.est && (!slept || p0 > slept[1])) slept = [serial, p0];
        if (p0 >= 0.03 * from.living && sp.pop <= 0.3 * p0 && (!sank || p0 - sp.pop > sank[1])) sank = [serial, p0 - sp.pop, p0];
      }
    }
    const bits = [];
    if (slept) bits.push(`${L(reg, slept[0])} ${ev.type === 'drought' ? 'lay sleeping as cysts upon the mud and woke with the rain' : ev.type === 'frost' ? 'slept in the ice as cysts and woke with the thaw' : 'withdrew into cysts and waited for better days'}`);
    if (win) bits.push(`${L(reg, win[0])} flourished, from ${fmt(win[2])} cells to ${fmt(reg.get(win[0]).pop)}`);
    if (sank && sank[0] !== slept?.[0]) bits.push(`${L(reg, sank[0])} lost ${shareWords(sank[1] / sank[2])} of its cells`);
    if (lost.length) bits.push(lost.length <= 2 ? `${andList(lost.map((sp) => L(reg, sp.serial)))} did not live to see it end` : `${numWord(lost.length)} species did not live to see it end, ${L(reg, lost[0].serial)} the greatest of them`);
    if (!bits.length) return null;
    const score = 0.45 + 0.1 * bits.length + (lost.length >= 3 ? 0.1 : 0);
    const over = { drought: 'The drought is past', storm: 'The storm is spent', frost: 'The frost has lifted', duckweed: 'The duckweed has drifted on' }[ev.type] || 'It is over';
    return { kind: 'aftermath', score, col: 0xff9ad6e8, subjects: [slept?.[0], win?.[0], sank?.[0], lost[0]?.serial].filter(Boolean).slice(0, 3), force: true,
      html: `${over}. ${Cap(bits.join('; '))}.` };
  }

  // a heat wave's scalding, or a cold snap's sleep
  function excursionStory(ctx) {
    const { reg } = ctx;
    const x = S.excursion;
    S.excursion = null;
    let total = 0, worst = null, slept = null;
    for (const [serial, c0] of x.snap.cum) {
      const st = S.sp.get(serial), sp = reg.get(serial);
      if (!st || !sp) continue;
      const scald = st.cum[C.scalded] - c0[C.scalded], cyst = st.cum[C.cyst] - c0[C.cyst];
      total += scald;
      if (scald > (worst?.[1] ?? 0)) worst = [serial, scald];
      if (cyst > (slept?.[1] ?? 0) && cyst >= 0.3 * (x.snap.pops.get(serial) || 1)) slept = [serial, cyst];
    }
    if (x.dT > 0 && worst && total >= 0.03 * Math.max(1, x.snap.living)) {
      const g = reg.get(worst[0]).genome;
      return { kind: 'heat', score: 0.5 + Math.min(0.2, total / x.snap.living), col: 0xff3a8aff, subjects: [worst[0]],
        html: `The heat wave has scalded ${fmt(total)} cells, ${worst[1] >= 0.5 * total ? 'most' : 'many'} of them ${L(reg, worst[0])}, a creature made for ${Math.round(g.topt)}°.` };
    }
    if (x.dT < 0 && slept) {
      return { kind: 'heat', score: 0.45, col: 0xffd68a3d, subjects: [slept[0]],
        html: `When the cold came, ${L(reg, slept[0])} withdrew into ${fmt(slept[1])} cysts, to wait for better days.` };
    }
    return null;
  }

  // ------------------------------------------------------------------ the page's API
  return {
    observe, note, reset,
    /** Its tunables, live (tools set .prof = {} to time the detectors). */
    tune: T,
    /** The species ledger's watch list: { version, serials (SPL_WATCH, 0 free) }. */
    watch: () => S.watch,
    /** What a species eats most and what eats it most, among the watched (serials, or null), from the meals counted. */
    relations(serial) {
      const st = S.sp.get(serial);
      if (!st) return { food: null, eater: null };
      const top = (m) => { let k = null, v = 0, sum = 0; for (const [a, b] of m) { sum += b; if (b > v) { v = b; k = a; } } return k && v >= 0.25 * sum && v >= 5 ? k : null; };
      return { food: top(st.diet), eater: top(st.eaters) };
    },
    /** The latest story told about a species, or null: { t, text, html }. */
    latest: (serial) => S.latest.get(serial) || null,
    /** What a saved world keeps of the chronicler (the stories' memory, not the ledger's baselines). */
    save() {
      const keep = { ...S, prevPairs: null, prevVer: -1, prevSlot: null, prevCause: null, pending: null, versions: new Map(), lastReal: -1e9 };
      keep.firsts = S.firsts ? [...S.firsts] : null;
      keep.eraMark = S.eraMark ? { ...S.eraMark, snap: null, pending: null } : null;
      keep.eventMark = null; keep.excursion = null;
      return keep;
    },
    load(o) {
      reset();
      if (!o) return;
      Object.assign(S, o, { firsts: o.firsts ? new Set(o.firsts) : null, versions: new Map(), watch: { version: (o.watch?.version || 0) + 1, serials: new Array(SPL_WATCH).fill(0) }, lastReal: -1e9 });
      if (S.eraMark && !S.eraMark.snap) S.eraMark = null;
    },
  };
}

/** The watch map for the engine (eng.setWatch): slot -> index + 1, from the watch list and each species' slot. */
export function watchMap(watch, reg, out = new Uint32Array(MAXK)) {
  out.fill(0);
  watch.serials.forEach((s, i) => {
    const sp = s && reg.get(s);
    if (sp && sp.alive && sp.slot >= FIRST_LIFE && sp.slot < MAXK) out[sp.slot] = i + 1;
  });
  return out;
}
