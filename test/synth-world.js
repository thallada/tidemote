// A synthetic world's species registry, in the shape the page keeps it, for test/lineage.test.js:
// species arise from living ones, grow and fade, and die-offs every so often take most of what lives.
import { record, seal } from '../src/lineage/model.js';

const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

/** { simTime, reg } over `hours`, about `rate` new species a second, a census every `every` s. */
export function synthWorld({ hours = 2, rate = 0.3, every = 30, cap = 200000, dieOffEvery = 5400, seed = 7 } = {}) {
  const r = rng(seed), T = hours * 3600;
  const reg = [], alive = [], fit = new Map(), drift = new Map();
  let serial = 1;
  const spawn = (t, parent) => {
    const s = {
      serial: serial++, name: `sp${serial}`, genome: { col: (r() * 0xffffff) | 0xff000000 }, born: t, ancestor: parent ? parent.serial : null,
      pop: 50, alive: true, established: true, extinct: null, series: { t: [], v: [] },
    };
    fit.set(s, 0.5 + r()); drift.set(s, 0);
    reg.push(s); alive.push(s);
  };
  for (let i = 0; i < 12; i++) spawn(0, null);
  let nextDie = dieOffEvery * (0.6 + r() * 0.8);
  for (let t = 0; t <= T; t += every) {
    const tot = alive.reduce((a, s) => a + s.pop, 0);
    const crash = t >= nextDie;
    if (crash) nextDie += dieOffEvery * (0.6 + r() * 0.8);
    for (const s of alive) {
      drift.set(s, drift.get(s) * 0.9 + (r() - 0.5) * 0.4);
      const g = 0.25 * (fit.get(s) + drift.get(s)) * (1 - tot / cap) - 0.1;
      s.pop = Math.max(0, s.pop * Math.exp(g) * (crash ? 0.02 + r() * 0.2 : 1) + (r() - 0.5) * 6);
    }
    for (let i = alive.length - 1; i >= 0; i--) {
      const s = alive[i];
      if (s.pop >= 3) { record(s.series, t, Math.round(s.pop)); continue; }
      s.alive = false; s.pop = 0; s.extinct = t;
      record(s.series, t, 0);
      s.series = seal(s.series);
      alive.splice(i, 1);
    }
    let births = rate * every * (0.5 + r());
    while (births-- > r() && alive.length) {
      const w = r() * alive.reduce((a, s) => a + Math.sqrt(s.pop), 0);
      let acc = 0, p = alive[0];
      for (const s of alive) { acc += Math.sqrt(s.pop); if (acc >= w) { p = s; break; } }
      spawn(t, p);
    }
    if (!alive.length) spawn(t, null);
  }
  return { simTime: T, reg };
}
