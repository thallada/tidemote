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
