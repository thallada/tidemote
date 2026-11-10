// The tools' shared helpers (tools/lib): what they must agree on with the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PREFS_V, viewPrefs } from '../tools/lib/prefs.mjs';

test('tools write view preferences at the version the page saves', () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const saved = [...main.matchAll(/savePrefs\(\{ v: (\d+),/g)].map((m) => +m[1]);
  assert.ok(saved.length > 0, 'src/main.js saves its view preferences with a version');
  for (const v of saved) assert.equal(PREFS_V, v, 'tools/lib/prefs.mjs PREFS_V follows the page (persist in src/main.js)');
  assert.deepEqual(viewPrefs({ particles: 8192, auto: false }), { v: PREFS_V, particles: 8192, auto: false });
});

test('a world packed as a .bin unpacks to the same state', async () => {
  const { packWorld, unpackWorld } = await import('../tools/lib/world.mjs');
  const bytes = (n, s) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + s) & 255).buffer;
  const st = { cpu: { count: 3, grid: [8, 4], founders: 24, seen: new Float32Array([0.5, -2]) }, gpu: { parts: bytes(120, 1), genomes: bytes(224, 2), thermal: bytes(0, 3) } };
  const bin = packWorld(st);
  // the layout the tools' saved worlds have: a u32 head length, the JSON head, then each buffer
  const head = bin.readUInt32LE(0);
  assert.deepEqual(JSON.parse(bin.subarray(4, 4 + head)), { cpu: { ...st.cpu, seen: [0.5, -2] }, sizes: [['parts', 120], ['genomes', 224], ['thermal', 0]] });
  assert.equal(bin.length, 4 + head + 344);
  const back = unpackWorld(bin);
  assert.deepEqual(back.cpu, { ...st.cpu, seen: [0.5, -2] });
  for (const k of Object.keys(st.gpu)) assert.deepEqual(new Uint8Array(back.gpu[k]), new Uint8Array(st.gpu[k]));
  assert.deepEqual(unpackWorld(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length)).cpu, back.cpu);
});

test('the loose command-line readers', async () => {
  const { cliArgs, arg } = await import('../tools/lib/args.mjs');
  const keep = process.argv;
  try {
    process.argv = ['node', 'tool.mjs', '--out', 'runs/x', '--phone', '--n', '4096', 'stray', '--k', '{"a":1}', '--last'];
    assert.deepEqual(cliArgs(), { out: 'runs/x', phone: '1', n: '4096', k: '{"a":1}', last: '1' });
    assert.equal(arg('n', '8'), '4096');
    assert.equal(arg('seed', '5'), '5');
    assert.equal(arg('last', 'x'), undefined);
  } finally { process.argv = keep; }
});
