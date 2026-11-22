import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { matchKey, isMoveKey, zoomKey, keyWay, BTN, BTN_NAME, PAD_MAP, padBinding, helpRows, TOOL_IDS, ROSE_TOOLS, ROSE_VIEW } from '../src/input/actions.js';
import { glyph, familyOf, padGlyphFor, FAMILIES } from '../src/input/glyphs.js';
import { controlsTable } from '../src/input/controls.js';

const key = (k, shiftKey = false) => matchKey({ key: k, code: '', shiftKey });

// Every key of the shortcut map as it was before the action table (the keydown chain in main.js), and what it did,
// so the table cannot change a key unnoticed. Changed on purpose since: the movement keys pan the view when not
// riding (they no longer start a ride), and − = zoom (they set the volume).
const KEYS = {
  Escape: 'back', Backspace: 'lineage-back', ' ': 'pause', ',': 'slower', '.': 'faster', '/': 'realtime', '<': 'realtime', '>': 'max',
  '?': 'help', Enter: 'ride', Tab: 'hop', t: 'trails', T: 'trails', y: 'glow', Y: 'glow', o: 'look', O: 'look', g: 'map-light', G: 'map-light',
  e: 'map-heat', E: 'map-heat', h: 'map-tide', H: 'map-tide', l: 'map-signal', L: 'map-signal', c: 'currents', C: 'currents', b: 'bench', B: 'bench', v: 'settings', V: 'settings',
  k: 'lab', K: 'lab', '[': 'reach-down', ']': 'reach-up', p: 'auto', P: 'auto', x: 'next-scene', X: 'next-scene', r: 'film',
  m: 'sound', M: 'sound', u: 'interface', U: 'interface', i: 'readouts', I: 'readouts', f: 'fullscreen', F: 'fullscreen', z: 'zoom-reset', Z: 'zoom-reset',
};

test('every key of the shortcut map does what it did', () => {
  for (const [k, id] of Object.entries(KEYS)) assert.equal(key(k), id, k);
  TOOL_IDS.forEach((t, d) => assert.equal(key(String(d)), `tool-${t}`));
  assert.equal(key('9'), null);
  assert.equal(key('q'), null);
});

test('Shift+R discards the world; R alone films', () => {
  assert.equal(key('R', true), 'reset-world');
  assert.equal(key('r'), 'film');
});

test('the movement keys and − = are held, not pressed', () => {
  for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) assert.ok(isMoveKey(c), c);
  assert.ok(!isMoveKey('KeyQ'));
  assert.deepEqual(keyWay(new Set(['KeyW'])), [0, -1]);
  assert.equal(zoomKey('='), 1); assert.equal(zoomKey('+'), 1); assert.equal(zoomKey('-'), -1); assert.equal(zoomKey('_'), -1);
  assert.equal(zoomKey('a'), 0);
  for (const k of ['w', 'a', 's', 'd', '-', '=', '+', '_']) assert.equal(key(k), null, `${k} is held, not an action`);
});

test('no pad button does two things in one context', () => {
  for (const [ctx, map] of Object.entries(PAD_MAP)) {
    for (const [b, bind] of Object.entries(map)) {
      assert.ok(BTN_NAME[b], `${ctx}: ${b} is a button`);
      assert.ok(!(bind.press && (bind.tap || bind.hold)), `${ctx}: ${BTN_NAME[b]} both presses and taps or holds`);
    }
  }
});

test('the world, a tool, a ride and a panel each read the face buttons their own way', () => {
  assert.equal(padBinding(BTN.S, 'world').press, 'select');
  assert.equal(padBinding(BTN.S, 'tool').press, 'apply');
  assert.equal(padBinding(BTN.W, 'tool').press, 'pipette-mode');
  // (View is the Lab only: no hold that a slow press could turn into the Controls)
  assert.deepEqual(padBinding(BTN.VIEW, 'world'), { press: 'lab' });
  assert.equal(padBinding(BTN.S, 'ride').press, 'hop');
  assert.equal(padBinding(BTN.S, 'panel').press, 'activate');
  assert.equal(padBinding(BTN.E, 'world').press, 'back');
  assert.equal(padBinding(BTN.E, 'panel').press, 'panel-back');
  assert.equal(padBinding(BTN.LB, 'world').hold, 'rose-tools');
  assert.equal(padBinding(BTN.LB, 'panel').press, 'tab-prev');
  assert.ok(padBinding(BTN.UP, 'panel').repeat);
});

test('every action a pad button asks for is one the page carries out', () => {
  // the ids act() in main.js handles (its switch), read from its source
  const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const handled = new Set([...src.matchAll(/case '([a-z:-]+)'/g)].map((m) => m[1]));
  for (const map of Object.values(PAD_MAP)) {
    for (const bind of Object.values(map)) {
      for (const id of [bind.press, bind.tap, bind.hold].filter(Boolean)) assert.ok(handled.has(id), `act() handles ${id}`);
      if (bind.hold) assert.ok(handled.has(`${bind.hold}:end`), `act() handles ${bind.hold}:end`);
    }
  }
  for (const id of Object.values(KEYS)) assert.ok(handled.has(id), `act() handles ${id}`);
  for (const id of ROSE_VIEW) assert.ok(handled.has(id), `act() handles the view rose's ${id}`);
  assert.deepEqual([...ROSE_TOOLS].sort(), TOOL_IDS.filter((t) => t !== 'none').sort());
});

test('the Controls dialog lists both columns for every row, every glyph drawn in every family', () => {
  const rows = helpRows().flatMap((g) => g.rows);
  assert.ok(rows.length > 20);
  for (const r of rows) {
    assert.ok(r.text && r.keys.length && r.pad.length, r.text);
    for (const t of r.pad) if (t.p) for (const f of FAMILIES) assert.ok(glyph(t.p, f), `${t.p} in ${f}`);
  }
  for (const f of FAMILIES) {
    const html = controlsTable(f);
    assert.match(html, /<table class="keys">/);
    assert.equal((html.match(/<tbody>/g) || []).length, helpRows().length);
  }
});

test('glyphs name their buttons for screen readers', () => {
  assert.match(glyph('S', 'xbox'), /aria-label="A"/);
  assert.match(glyph('S', 'switch'), /aria-label="B"/); // a Switch pad's bottom button is its B
  assert.match(glyph('S', 'ps'), /aria-label="Cross"/);
  assert.match(glyph('LB', 'deck'), /L1/);
  assert.match(glyph('UP', 'xbox'), /aria-label="D-pad up"/);
  assert.equal(glyph('nonsense', 'xbox'), '');
  assert.match(padGlyphFor('pause', 'xbox'), /D-pad down/);
  assert.match(padGlyphFor('rose-tools', 'xbox'), /held/);
  assert.equal(padGlyphFor('film', 'xbox'), null);
});

test('a pad is known by its id', () => {
  assert.equal(familyOf('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'), 'ps');
  assert.equal(familyOf('054c-09cc-Wireless Controller'), 'ps');
  assert.equal(familyOf('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)'), 'switch');
  assert.equal(familyOf('Steam Deck (Vendor: 28de Product: 1205)'), 'deck');
  assert.equal(familyOf('Xbox 360 Controller (XInput STANDARD GAMEPAD)'), 'xbox');
  assert.equal(familyOf('Steam Virtual Gamepad (STANDARD GAMEPAD Vendor: 28de Product: 11ff)'), 'xbox');
  assert.equal(familyOf('Steam Virtual Gamepad (STANDARD GAMEPAD Vendor: 28de Product: 11ff)', { steamDeck: true }), 'deck');
  assert.equal(familyOf(null), 'xbox');
});
