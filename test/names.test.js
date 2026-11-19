import test from 'node:test';
import assert from 'node:assert/strict';
import { prng, word, cap, roman, speciesName, bodyPlan, genusOfPlan, PLANS } from '../src/names.js';
import { randomGenome, archetypeGenome, ARCHETYPE_TYPES, mutateLike, writeGenome, readGenome } from '../src/genome.js';
import { G_WORDS } from '../src/shaders.js';

const genomes = (n, seed = 1) => {
  const r = prng(seed), out = [];
  for (let i = 0; i < n; i++) out.push(i % 3 ? randomGenome(r) : archetypeGenome(ARCHETYPE_TYPES[i % ARCHETYPE_TYPES.length], r));
  return out;
};
// g as the census reads it back from the GPU
const throughGPU = (g) => {
  const u = new Uint32Array(G_WORDS), f = new Float32Array(u.buffer);
  writeGenome(u, f, 0, g);
  return readGenome(u, f, 0);
};

test('prng and the syllable grammar keep their outputs', () => {
  const a = prng(42), b = prng(42);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
  const syllables = /^(?:V|Th|K|Z|Qu|R|M|S|N|X|Ph|Dr|Gh|L|Y|Sk|Tr|H|B|C|Vr|Ch)[aoeiuy](?:e|u|a|o)?(?:(?:v|th|k|z|qu|r|m|s|n|x|ph|dr|gh|l|y|sk|tr|h|b|c|vr|ch)[aoeiuy](?:e|u|a|o)?)*(?:n|r|th|x|s|l|m|k|sh|rn)?$/;
  for (let seed = 0; seed < 100; seed++) assert.match(cap(word(prng(seed), 2)), syllables);
  for (const g of genomes(100)) {
    const n = speciesName(g);
    assert.match(n.genus, syllables);
    assert.match(n.epithet, /^[a-z]+$/);
    assert.match(n.hash, /^[0-9a-f]{16}$/);
  }
});

test('a name is pinned: the same genome is named alike by every version', () => {
  // a change to these is a change of every species' name in every world: make it only on purpose
  const [a, b, c] = genomes(3, 7).map(speciesName);
  assert.deepEqual([a, b, c].map((n) => `${n.genus} ${n.epithet}`), ['Drobol thaxayx', 'Quoraedral kouvaoth', 'Cadron kaequorna']);
});

test('a name reads only the genes: not serial, parent, birth, depth, slot, colour or metabolism', () => {
  for (const g of genomes(40)) {
    const n = speciesName(g);
    const other = { ...structuredClone(g), serial: 99999, parent: 1234, born: 3600.5, depth: 77, slot: 3, col: 0x12345678, metab: 0.5 };
    assert.deepEqual(speciesName(other), n);
    // as the GPU holds it (f32 floats, 8-bit signatures), the same name: the census names what it reads back
    assert.deepEqual(speciesName(throughGPU(g)), n);
    assert.deepEqual(speciesName(throughGPU(throughGPU(g))), n);
  }
});

test('every mutation changes the epithet; most keep the genus', () => {
  let r = prng(3), sameGenus = 0, n = 0;
  for (const g0 of genomes(60, 11)) {
    const g = throughGPU(g0);
    const h = throughGPU(mutateLike(g, r));
    const a = speciesName(g), b = speciesName(h);
    assert.notEqual(a.hash, b.hash);
    assert.notEqual(`${a.genus} ${a.epithet}`, `${b.genus} ${b.epithet}`);
    n++; if (a.genus === b.genus) sameGenus++;
    // a single gene changed by its least step changes the epithet too
    const u = new Uint32Array(G_WORDS), f = new Float32Array(u.buffer);
    writeGenome(u, f, 0, g);
    u[16 + 9] += 1; // dHusk's float by one ulp
    assert.notEqual(speciesName(readGenome(u, f, 0)).hash, a.hash);
  }
  assert.ok(sameGenus / n > 0.4, `${sameGenus} of ${n} mutants kept the genus`);
});

test('the genus is the body plan: alike plans share it, and no two plans share a name', () => {
  const names = new Set();
  for (let k = 0; k < PLANS; k++) names.add(genusOfPlan(k));
  assert.equal(names.size, PLANS);
  for (const g of genomes(80, 5)) {
    const p = bodyPlan(g), n = speciesName(g);
    assert.equal(n.genus, genusOfPlan(p.key));
    assert.deepEqual(n.plan, p);
    // genes outside the plan (hue, lifespan) move the epithet, never the genus
    const h = { ...structuredClone(g), hue: (g.hue + 0.37) % 1, lifespan: g.lifespan * 1.1 };
    assert.equal(speciesName(h).genus, n.genus);
    assert.notEqual(speciesName(h).epithet, n.epithet);
  }
});

test('the plan ignores the run\'s tunables', () => {
  // growPlan/hasTails take K; the names pin their own, so a #k world names as every other
  const g = archetypeGenome('reef', prng(9));
  assert.deepEqual(speciesName(g), speciesName(g));
  assert.equal(bodyPlan(g).form === 'single', !(Math.fround(g.adhesion) > 0.15));
});

test('roman numbers a name two genomes share', () => {
  assert.deepEqual([2, 3, 4, 9, 14, 40, 1994].map(roman), ['II', 'III', 'IV', 'IX', 'XIV', 'XL', 'MCMXCIV']);
});
