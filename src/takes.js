// Takes: replaying the tape (docs/takes.md). The viewer marks a moment; the world goes on (take 1); later it is
// put back as it was at the mark and runs again (take 2, 3...), under the same weather (the climate's stream is
// part of the world, climate.js) but with fresh dice (eng.chance). Would the same world come out the same way?
//
// Every take is followed by the lineages living at the mark (its stock): every later species is counted under the
// species alive at the mark it descends from, so takes whose new species differ entirely can still be compared,
// and how alike two takes are is how alike their stocks' shares of the living are (1 - Bray-Curtis).
//
// Pure: no DOM, no GPU. The page calls mark() with its registry at the moment, observe() on each census and
// replay() when it puts the world back; the Lab's Takes pane reads takes(), river() and alike(). Tested in
// test/takes.test.js.

const SAMPLE = 10; // simulated seconds between samples of a take
const KEEP = 0.002; // a stock under this share of the living is counted as "other" in a sample
export const OTHER = 0;

/** The species alive at the mark that sp descends from (its serial), or OTHER: through reg's parents and ancestors. */
export function stockOf(sp, reg, stock, memo = new Map()) {
  const seen = [];
  let s = sp, found = OTHER;
  for (let hop = 0; s && hop < 4096; hop++) {
    if (memo.has(s.serial)) { found = memo.get(s.serial); break; }
    seen.push(s.serial);
    if (stock.has(s.serial)) { found = s.serial; break; }
    s = reg.get(s.parent) || (s.ancestor != null ? reg.get(s.ancestor) : null);
  }
  for (const k of seen) memo.set(k, found);
  return found;
}

/** How alike two samples' stocks are, 0..1 (1 - Bray-Curtis over shares; 1 for two empty worlds). */
export function similarity(a, b) {
  const keys = new Set([...Object.keys(a.stocks), ...Object.keys(b.stocks)]);
  if (!a.living && !b.living) return 1;
  if (!a.living || !b.living) return 0;
  let d = 0;
  for (const k of keys) d += Math.abs((a.stocks[k] || 0) / a.living - (b.stocks[k] || 0) / b.living);
  return Math.max(0, 1 - d / 2);
}

export function createTakes() {
  const S = { mark: null, takes: [], next: 1 };
  const cur = () => S.takes[S.takes.length - 1] || null;

  /**
   * Mark this moment: t (simulated seconds), reg (the page's species registry), the world's bytes (kept to put it
   * back) and the chronicle's length then. A new mark forgets the takes of the last.
   */
  function mark(t, reg, bytes, chronicled = 0) {
    const stock = new Map();
    for (const sp of reg.values()) if (sp.alive && sp.pop > 0) stock.set(sp.serial, { name: sp.name, col: sp.genome.col, pop: sp.pop });
    S.mark = { t, stock, bytes, chronicled };
    S.takes = [];
    S.next = 1;
    begin();
    observe(t, reg, [], true);
  }
  function begin() {
    S.takes.push({ n: S.next++, samples: [], stories: [], memo: new Map(), until: S.mark.t });
  }

  /** A census: t, the registry, and the chronicle's newest entries first (the page's life.chronicle). */
  function observe(t, reg, chronicle = [], force = false) {
    const k = cur();
    if (!S.mark || !k) return;
    if (t < S.mark.t - 1) return; // (a world loaded from before it: not this tape)
    k.until = Math.max(k.until, t);
    if (!force && k.samples.length && t - k.samples[k.samples.length - 1].t < SAMPLE) return;
    const stocks = {};
    let living = 0;
    for (const sp of reg.values()) {
      if (!sp.alive || !sp.pop) continue;
      living += sp.pop;
      const s = stockOf(sp, reg, S.mark.stock, k.memo);
      stocks[s] = (stocks[s] || 0) + sp.pop;
    }
    for (const s of Object.keys(stocks)) if (+s !== OTHER && stocks[s] < KEEP * living) { stocks[OTHER] = (stocks[OTHER] || 0) + stocks[s]; delete stocks[s]; }
    k.samples.push({ t, living, stocks });
    // what the chronicler told since the mark, newest first (kept for the take once it is set aside)
    k.stories = chronicle.filter((e) => e.t >= S.mark.t && e.t <= t).slice(0, 60).map((e) => ({ t: e.t, type: e.type, html: e.html, text: e.text, col: e.col }));
  }

  /** The world is being put back as it was at the mark: the take running is set aside and a new one begins. */
  function replay() {
    if (!S.mark) return null;
    const first = S.takes[0]?.samples[0];
    begin();
    // it starts where every take starts: the world at the mark
    if (first) cur().samples.push(first);
    return cur().n;
  }

  /** Each take's sample nearest time t (or null, when the take has not reached it). */
  function at(k, t) {
    const s = k.samples;
    if (!s.length || t > s[s.length - 1].t + SAMPLE) return null;
    let lo = 0, hi = s.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (s[m].t < t) lo = m + 1; else hi = m; }
    return lo > 0 && Math.abs(s[lo - 1].t - t) < Math.abs(s[lo].t - t) ? s[lo - 1] : s[lo];
  }

  /** How alike take b is to take a over time: [[t, 0..1]], every sample of b that a has reached too. */
  function alike(a, b) {
    const out = [];
    for (const sb of b.samples) { const sa = at(a, sb.t); if (sa) out.push([sb.t, similarity(sa, sb)]); }
    return out;
  }

  /**
   * The stocks to draw, the same order and colors in every take: the n largest at their largest in any take (the
   * rest as OTHER), each { serial, name, col }.
   */
  function stocks(n = 10) {
    if (!S.mark) return [];
    const top = new Map();
    for (const k of S.takes) for (const s of k.samples) for (const [key, v] of Object.entries(s.stocks)) {
      if (+key === OTHER) continue;
      top.set(+key, Math.max(top.get(+key) || 0, v / Math.max(1, s.living)));
    }
    return [...top].sort((a, b) => b[1] - a[1]).slice(0, n).map(([serial]) => ({ serial, ...S.mark.stock.get(serial) }));
  }

  /** A take's shares of the given stocks over time: [{ t, shares: [..., other] }]. */
  function river(k, shown) {
    return k.samples.map((s) => {
      const shares = shown.map((x) => (s.stocks[x.serial] || 0) / Math.max(1, s.living));
      shares.push(Math.max(0, 1 - shares.reduce((a, b) => a + b, 0)));
      return { t: s.t, shares };
    });
  }

  /** The leading stock of a take at its latest sample: { serial, share } or null. */
  function leader(k) {
    const s = k.samples[k.samples.length - 1];
    if (!s) return null;
    let best = null;
    for (const [key, v] of Object.entries(s.stocks)) if (+key !== OTHER && (!best || v > best.v)) best = { serial: +key, v };
    return best && { serial: best.serial, share: best.v / Math.max(1, s.living) };
  }

  return {
    mark, observe, replay, alike, stocks, river, leader, at,
    get marked() { return S.mark; },
    takes: () => S.takes,
    current: cur,
    forget() { S.mark = null; S.takes = []; S.next = 1; },
  };
}
