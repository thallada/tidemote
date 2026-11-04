import test from 'node:test';
import assert from 'node:assert/strict';
import { lineageModel, cut, packBlocks, record, seal, valAt, memberAt, SERIES_MAX } from '../src/lineage/model.js';
import { synthWorld } from './synth-world.js';

const lifeOf = (w) => ({ reg: new Map(w.reg.map((s) => [s.serial, s])) });
const world = synthWorld({ hours: 3, rate: 0.3, seed: 3 });
const fresh = () => lineageModel(lifeOf(world), world.simTime);

test('a species record halves when full and keeps its ends', () => {
  const s = { t: [], v: [] };
  for (let i = 0; i < 1000; i++) record(s, i, i * 2);
  assert.ok(s.t.length <= SERIES_MAX && s.t.length > SERIES_MAX / 2);
  assert.equal(s.t[0], 0);
  assert.equal(s.t.at(-1), 999);
  for (let i = 1; i < s.t.length; i++) assert.ok(s.t[i] > s.t[i - 1]);
  record(s, 999, 5);
  assert.equal(s.v.at(-1), 5, 'a second point at the same moment replaces the first');
  const sealed = seal(s);
  assert.ok(sealed.t instanceof Float32Array && sealed.t.length === s.t.length);
  record(sealed, 1000, 1);
  assert.equal(sealed.t.at(-1), 1000, 'a sealed record that is seen again takes new points');
});

test('strands follow each lineage through its heir and partition the species', () => {
  const m = fresh();
  assert.equal(m.nodes.length, world.reg.length);
  const seen = new Set();
  for (const st of m.strands) {
    for (let i = 0; i < st.nodes.length; i++) {
      const n = st.nodes[i];
      assert.ok(!seen.has(n)); seen.add(n);
      assert.equal(n.strand, st);
      if (i) assert.equal(st.nodes[i - 1].heir, n);
    }
    if (st.parent) assert.equal(st.first.parent.strand, st.parent);
    for (const n of st.nodes) if (n.alive) assert.ok(st.live);
  }
  assert.equal(seen.size, m.nodes.length);
  for (const n of m.nodes) if (n.heir) for (const k of n.kids) assert.ok(k.cw <= n.heir.cw);
});

test('a cut keeps k lineages with their ancestry and counts every cell once', () => {
  const m = fresh();
  for (const [t0, t1] of [[0, m.T], [m.T * 0.6, m.T * 0.8]]) {
    const c = cut(m, { t0, t1, k: 20, n: 120 });
    assert.ok(c.units.length <= 20 && c.units.length > 0);
    for (const u of c.units) if (u.strand.parent) assert.equal(u.parent ? u.parent.strand : null, u.strand.parent, 'a shown lineage hangs from its own parent lineage');
    for (const i of [0, 30, 60, 119]) {
      const t = c.ts[i];
      const all = m.nodes.reduce((a, n) => a + valAt(n, t), 0);
      const shown = c.units.reduce((a, u) => a + u.vals[i], 0) + (c.other ? c.other.vals[i] : 0);
      assert.ok(Math.abs(all - shown) < 1e-3 * Math.max(1, all), `${all} cells, ${shown} shown at ${t}`);
    }
    const lived = m.nodes.filter((nd) => nd.end >= t0 && nd.born <= t1).length;
    assert.equal(c.species, lived);
    assert.equal(c.units.reduce((a, u) => a + u.count, 0) + c.outside, lived, 'every species of the span is counted once');
  }
});

test('a cut can follow one clade, or only the living', () => {
  const m = fresh();
  const top = cut(m, { k: 10 }).units.filter((u) => u.parent).sort((a, b) => b.weight - a.weight)[0];
  const c = cut(m, { root: top.strand, k: 15 });
  const under = (st) => { for (let s = st; s; s = s.parent) if (s === top.strand) return true; return false; };
  for (const u of c.units) assert.ok(under(u.strand));
  assert.equal(c.other, null);
  const live = cut(m, { live: true, k: 50 });
  for (const u of live.units) assert.ok(u.strand.live);
  const u = live.units.find((x) => x.alive);
  assert.ok(memberAt(u, m.T) === null || memberAt(u, m.T).strand === u.strand);
});

test('tidy blocks keep each subtree below its root and never overlap', () => {
  const m = fresh();
  const items = m.nodes.map((n) => ({ n, born: n.born, end: n.end }));
  const of = new Map(items.map((it) => [it.n, it]));
  for (const it of items) it.parent = it.n.parent ? of.get(it.n.parent) : null;
  const lanes = packBlocks(items, 10);
  const byLane = new Map();
  for (const it of items) { if (!byLane.has(it.lane)) byLane.set(it.lane, []); byLane.get(it.lane).push(it); }
  for (const list of byLane.values()) {
    list.sort((a, b) => a.born - b.born);
    for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].end + 10 <= list[i].born + 1e-9, 'a lane never holds two lineages at once');
  }
  for (const it of items) if (it.parent) assert.ok(it.lane > it.parent.lane, 'a child sits below its parent');
  assert.ok(lanes < items.length);
});

test('the path above an explored lineage is its ancestry, each crumb a step up', async () => {
  const { ancestry, strandName } = await import('../src/lineage/nav.js');
  const m = fresh();
  let deep = 0;
  for (const st of m.strands) {
    const path = ancestry(st);
    assert.equal(path[0].parent, null, 'the path starts at a root');
    assert.equal(path.at(-1), st);
    for (let i = 1; i < path.length; i++) assert.equal(path[i].parent, path[i - 1]);
    deep = Math.max(deep, path.length);
    // every crumb's clade holds the one below it: exploring a crumb keeps the lineage below in it
    for (let i = 1; i < path.length; i++) assert.ok(path[i - 1].kids.includes(path[i]));
    const name = strandName(st);
    if (!st.alive) assert.equal(name, st.nodes[0].name);
    else assert.ok(st.nodes.some((n) => n.alive && n.name === name), 'a living lineage is named for a living species');
  }
  assert.ok(deep >= 3, 'the synthetic world has lineages a few levels deep');
});

test('the way back remembers each place once, the latest first, and only so many', async () => {
  const { history, sameLoc } = await import('../src/lineage/nav.js');
  const h = history(3);
  assert.equal(h.back(), null);
  h.go({ root: null, span: 'all' });
  h.go({ root: null, span: 'all' });
  h.go({ root: 7, span: 'all' });
  assert.ok(sameLoc(h.back(), { root: 7, span: 'all' }));
  assert.ok(sameLoc(h.back(), { root: null, span: 'all' }));
  assert.equal(h.back(), null, 'the same place twice in a row is one step');
  h.go({ root: null, span: 'all' });
  h.go({ root: 7, span: 'all' });
  h.go({ root: 7, span: [10, 20] });
  h.go({ root: 9, span: [10, 20] });
  assert.ok(sameLoc(h.back(), { root: 9, span: [10, 20] }));
  assert.ok(sameLoc(h.back(), { root: 7, span: [10, 20] }));
  assert.ok(sameLoc(h.back(), { root: 7, span: 'all' }));
  assert.equal(h.back(), null, 'the oldest fell off past the limit');
  assert.ok(!sameLoc({ root: 1, span: [1, 2] }, { root: 1, span: [1, 3] }));
});

test('breadcrumbs that do not fit fold into an ellipsis, keeping the world, the parent and the lineage', async () => {
  const { fitCrumbs } = await import('../src/lineage/nav.js');
  assert.deepEqual(fitCrumbs([80, 100, 100], 400, 20), [0, 1, 2]);
  assert.deepEqual(fitCrumbs([80, 100], 50, 20), [0, 1], 'two crumbs are never folded');
  assert.deepEqual(fitCrumbs([80, 100, 100, 100, 120], 340, 20), [0, -1, 3, 4], 'the parent kept before those above it');
  assert.deepEqual(fitCrumbs([80, 100, 100, 100, 120], 430, 20), [0, -1, 2, 3, 4]);
  assert.deepEqual(fitCrumbs([80, 100, 100, 100, 120], 150, 20), [0, -1, 4], 'the lineage itself always stays');
});
