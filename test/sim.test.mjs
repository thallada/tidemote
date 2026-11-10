import test from 'node:test';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('headless ecology produces living cells and samples', { timeout: 120_000 }, async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tidemote-sim-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const out = path.join(dir, 'run.json');
  const executable = process.env.PLAYWRIGHT_CHROMIUM || chromium.executablePath();
  const backend = existsSync(executable) ? '--chrome' : '--cpu';
  const deadline = Date.now() + 110_000;
  const runSim = (backend) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('../tools/sim.mjs', import.meta.url)),
      backend, '--n', '2048', '--minutes', '0.1', '--out', out], { env: { ...process.env, LP_NUM_THREADS: '2' } });
    let output = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), Math.max(1000, deadline - Date.now()));
    child.stdout.on('data', (b) => { output += b; });
    child.stderr.on('data', (b) => { output += b; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, output }); });
  });
  // (said in the test's output, as a skip would be: which backend ran, and why not Chromium)
  if (backend === '--cpu') t.diagnostic(`Playwright's Chromium is not installed (${executable}): sim.mjs --cpu on Dawn's lavapipe instead`);
  let result = await runSim(backend), ran = backend;
  // An installed browser may still be unable to launch in a restricted environment.
  if (backend === '--chrome' && result.code !== 0 && /browserType\.launch:/.test(result.output)) {
    t.diagnostic(`Chromium would not launch (${/browserType\.launch:[^\n]*/.exec(result.output)[0].slice(0, 160)}): sim.mjs --cpu on Dawn's lavapipe instead`);
    result = await runSim(ran = '--cpu');
  }
  if (result.code === 2 && /No WebGPU adapter available/.test(result.output)) {
    t.skip(`No WebGPU adapter available to sim.mjs ${ran}${ran === '--cpu' ? ' (Mesa lavapipe: /usr/share/vulkan/icd.d/lvp_icd.json)' : ''}`); return;
  }
  if (result.code !== 0) console.error(result.output);
  assert.equal(result.code, 0, result.output);
  const run = JSON.parse(await readFile(out, 'utf8'));
  assert.deepEqual(Object.keys(run), ['config', 'samples', 'eras', 'events', 'summary', 'outcome']);
  assert.ok(run.summary.finalLiving > 0);
  assert.ok(run.samples.length > 0);
  assert.ok(Number.isInteger(run.summary.guildLosses) && run.summary.guildLosses >= 0);
});
