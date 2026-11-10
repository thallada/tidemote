// The tools' shared helpers (tools/lib): what they must agree on with the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PREFS_V, viewPrefs } from '../tools/lib/prefs.mjs';

test('tools write view preferences at the version the page saves', () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const page = main.match(/^const PREFS_V = (\d+);$/m);
  assert.ok(page, 'src/main.js names the version of its view preferences');
  assert.ok(/savePrefs\(\{ v: PREFS_V,/.test(main), 'src/main.js saves its view preferences with that version');
  assert.equal(PREFS_V, +page[1], 'tools/lib/prefs.mjs PREFS_V follows the page (PREFS_V in src/main.js)');
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

// Every browser tool launches through tools/lib/browser.mjs (launchOptions, CHROME, windowFlags) and writes the page's
// view preferences through tools/lib/prefs.mjs (viewPrefs): no copy of the installed Chrome's path, of the Vulkan
// launch or of a preferences object of its own.
test('browser tools launch through tools/lib/browser.mjs', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.mjs') ? [`${dir}/${e.name}`] : []));
  const own = ['tools/lib/browser.mjs', 'tools/vk.mjs'];
  const copies = [];
  for (const f of walk('tools').filter((f) => !own.includes(f))) {
    fs.readFileSync(path.join(root, f), 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return;
      if (/chrome\.exe|Google Chrome\.app|vkLaunch\(|'tidemote\.view', JSON\.stringify\(\{/.test(line)) copies.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(copies, [], 'launch the browser with launchOptions (tools/lib/browser.mjs) and write preferences with viewPrefs (tools/lib/prefs.mjs)');
});

// The launches of the tools that last took up launchOptions: playwright-core replaced by a stub that records what a tool
// asks chromium for and exits, on Windows (where they run, through tools/gpu-node.sh), with TIDEMOTE_VK off and on.
test('browser tools launch as they did', () => {
  const js = (s) => `data:text/javascript,${encodeURIComponent(s)}`;
  const stub = js(`import fs from 'node:fs';
    const rec = (fn, opts) => { fs.writeFileSync(process.env.STUB_OUT, JSON.stringify({ fn, opts })); process.exit(0); };
    export const chromium = { launch: async (o) => rec('launch', o), launchPersistentContext: async (d, o) => rec('launchPersistentContext', o), executablePath: () => '/stub' };`);
  const hooks = js(`export async function resolve(s, c, next) { return s === 'playwright-core' ? { url: ${JSON.stringify(stub)}, shortCircuit: true } : next(s, c); }`);
  const pre = js(`import { register } from 'node:module'; Object.defineProperty(process, 'platform', { value: 'win32' }); register(${JSON.stringify(hooks)});`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-launch-'));
  const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const VK = { headless: true, ignoreDefaultArgs: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'],
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan', '--ignore-gpu-blocklist', '--disable-vulkan-surface'] };
  const shown = (args, extra) => ({ fn: 'launchPersistentContext', opts: { executablePath: CHROME, headless: false, args, ...extra } });
  const film = shown(['--window-size=1000,640', '--no-first-run'], { viewport: { width: 1000, height: 640 } });
  const flash = shown(['--window-size=1600,900', '--autoplay-policy=no-user-gesture-required'], { viewport: null });
  const shots = shown(['--window-size=1600,900', '--window-position=0,0'], { viewport: null });
  // [tool, its arguments, what it launches with TIDEMOTE_VK off, and on]
  const tools = [
    ['tools/swimlab-film.mjs', ['--out', tmp], film, film],
    ['tools/perf/flash.mjs', [], flash, flash],
    ['tools/perf/shots.mjs', ['w', tmp], shots, shots],
    ['tools/i18n/tour.mjs', ['--out', tmp], { fn: 'launch', opts: { executablePath: CHROME, headless: false, args: ['--enable-unsafe-webgpu'] } }, { fn: 'launch', opts: VK }],
  ];
  try {
    for (const [tool, args, off, on] of tools) for (const [vk, want] of [['', off], ['1', on]]) {
      const out = path.join(tmp, 'launch.json');
      fs.rmSync(out, { force: true });
      const env = { ...process.env, STUB_OUT: out, TEMP: tmp, TIDEMOTE_VK: vk };
      if (!vk) delete env.TIDEMOTE_VK;
      delete env.PLAYWRIGHT_CHROMIUM;
      const r = spawnSync(process.execPath, ['--import', pre, tool, ...args], { cwd: fileURLToPath(new URL('../', import.meta.url)), env, encoding: 'utf8' });
      assert.ok(fs.existsSync(out), `${tool} launched no browser: ${r.stderr.slice(0, 400)}`);
      assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), want, `${tool} with TIDEMOTE_VK ${vk ? 'on' : 'off'}`);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
