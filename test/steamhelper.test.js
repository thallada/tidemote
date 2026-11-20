// The desktop shell's Steam client (desktop/steam.js) against fake helpers, so its failure handling is covered
// without Steam: Steam off, a helper that never starts, crashes, hangs, or asks for a relaunch. And the real helper
// (desktop/steam-helper/helper.cjs) under plain Node, where desktop/node_modules is installed: steamworks.js loads,
// Steam is not running here, and it says so.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSteam, HELPER } from '../desktop/steam.js';

const dir = mkdtempSync(join(tmpdir(), 'tidemote-steamhelper-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));

// a helper speaking the protocol, its behavior chosen by MODE
const FAKE = join(dir, 'fake.cjs');
writeFileSync(FAKE, `
const mode = process.env.MODE;
const reply = (id, value) => process.send({ id, ok: true, value });
process.on('disconnect', () => process.exit(0));
process.send({ event: 'hello', protocol: 1 });
process.on('message', ({ id, op, args }) => {
  if (mode === 'hang') return;
  if (op === 'init') {
    if (mode === 'off') return reply(id, { protocol: 1, loaded: true, on: false, why: 'Steam is not running' });
    if (mode === 'restart') return reply(id, { protocol: 1, loaded: true, on: false, restart: true });
    if (mode === 'crash-init') process.exit(3);
    return reply(id, { protocol: 1, loaded: true, on: true, appId: 480, cloud: true, user: 'tester' });
  }
  if (op === 'status') return reply(id, { loaded: true, on: true, appId: 480, cloud: false, user: 'tester' });
  if (op === 'achieve') { if (mode === 'crash-achieve') process.exit(4); return reply(id, args.name === 'GOOD'); }
  if (op === 'deck') return reply(id, true);
  if (op === 'ugc.subscribed') return reply(id, ['123', '18446744073709551615']);
  if (op === 'ugc.slow') return;
  if (op === 'quit') { reply(id, null); setImmediate(() => process.exit(0)); return; }
  process.send({ id, ok: false, error: 'unknown op: ' + op });
});
`);
const launcher = (mode) => () => fork(FAKE, [], { env: { ...process.env, MODE: mode }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'], serialization: 'json' });
const exited = (steam) => new Promise((r) => setTimeout(r, 50)).then(() => steam);

test('Steam on: status, achievements, the Deck, the Workshop, then a clean stop', async () => {
  const steam = createSteam({ launch: launcher('ok') });
  assert.deepEqual(await steam.start({ appId: 480 }), { on: true, appId: 480, cloud: false, user: 'tester' });
  assert.equal(await steam.achieve('GOOD'), true);
  assert.equal(await steam.achieve('BAD'), false);
  assert.equal(await steam.achieve(7), false);
  assert.equal(await steam.deck(), true);
  assert.equal(steam.appId(), 480);
  assert.deepEqual(await steam.ugc('subscribed'), ['123', '18446744073709551615']);
  await assert.rejects(steam.ugc('nonsense'), /unknown op: ugc.nonsense/);
  steam.stop();
  assert.equal(steam.on(), false);
  assert.equal((await steam.status()).on, false);
  assert.equal(await steam.achieve('GOOD'), false);
  await assert.rejects(steam.ugc('subscribed'), /Steam is not running/);
});

test('Steam not running: off with the reason, the addon loaded, the helper stopped', async () => {
  const steam = createSteam({ launch: launcher('off') });
  const s = await steam.start({});
  assert.deepEqual(s, { on: false, loaded: true, why: 'Steam is not running' });
  assert.equal(await steam.achieve('GOOD'), false);
  assert.equal(await steam.keyboard({ x: 1, y: 2, w: 3, h: 4 }), false);
  assert.equal(await steam.ready(), false);
});

test('calls made before start() settles wait for it', async () => {
  const steam = createSteam({ launch: launcher('ok') });
  const started = steam.start({});
  const [st, ok] = await Promise.all([steam.status(), steam.achieve('GOOD')]);
  assert.equal(st.on, true);
  assert.equal(ok, true);
  await started;
  steam.stop();
});

test('a helper that cannot start leaves Steam off', async () => {
  const steam = createSteam({ launch: () => { throw new Error('ENOENT'); } });
  const s = await steam.start({});
  assert.equal(s.on, false);
  assert.match(s.why, /did not start: ENOENT/);
  const missing = createSteam({ launch: () => fork(join(dir, 'missing.cjs'), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] }) });
  const m = await missing.start({});
  assert.equal(m.on, false);
  assert.match(m.why, /exited|not running/);
});

test('a helper that crashes on init, or later, leaves Steam off and fails what was pending', async () => {
  const a = createSteam({ launch: launcher('crash-init') });
  const s = await a.start({});
  assert.equal(s.on, false);
  assert.match(s.why, /exited \(3\)/);

  const b = createSteam({ launch: launcher('crash-achieve') });
  assert.equal((await b.start({})).on, true);
  assert.equal(await b.achieve('GOOD'), false); // the crash, swallowed for the page
  await exited(b);
  assert.equal(b.on(), false);
  assert.match((await b.status()).why, /exited \(4\)/);
  await assert.rejects(b.ugc('subscribed'), /Steam is not running/);
});

test('a helper that never answers times out, and is stopped', async () => {
  const steam = createSteam({ launch: launcher('hang'), timeout: { init: 200 } });
  const s = await steam.start({});
  assert.equal(s.on, false);
  assert.match(s.why, /init timed out after 200 ms/);

  const slow = createSteam({ launch: launcher('ok'), timeout: { 'ugc.slow': 100 } });
  await slow.start({});
  await assert.rejects(slow.ugc('slow'), /ugc.slow timed out after 100 ms/);
  assert.equal(slow.on(), true); // one slow call does not take Steam down
  slow.stop();
});

test('Steam asking for a relaunch resolves restart', async () => {
  const steam = createSteam({ launch: launcher('restart') });
  assert.equal(await steam.start({ appId: 480, restartAppId: 480 }), 'restart');
  steam.stop();
});

test('the helper imports nothing but steamworks.js and Node built-ins (it must hold no GPL code)', () => {
  const src = readFileSync(HELPER, 'utf8');
  const reqs = [...src.matchAll(/\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]/g), ...src.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.deepEqual(reqs.filter((r) => r !== 'steamworks.js' && !r.startsWith('node:')), []);
  assert.match(src, /SPDX-License-Identifier: MIT/);
});

const addon = fileURLToPath(new URL('../desktop/node_modules/steamworks.js/index.js', import.meta.url));
test('the real helper loads steamworks.js and reports Steam not running', { skip: !existsSync(addon) && 'desktop/node_modules not installed' }, async () => {
  // plain Node stands in for the app's executable run as Node (ELECTRON_RUN_AS_NODE)
  const steam = createSteam({ launch: () => fork(HELPER, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'json', env: { ...process.env, SteamAppId: '', SteamGameId: '' } }) });
  const s = await steam.start({ appId: 480 });
  if (s.on) { steam.stop(); return; } // a machine with Steam running: fine too
  assert.equal(s.loaded, true, s.why);
  assert.ok(s.why, 'a reason Steam is off');
});
