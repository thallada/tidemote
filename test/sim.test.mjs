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
  const cached = '/home/thallada/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
  const executable = process.env.PLAYWRIGHT_CHROMIUM ||
    (existsSync(cached) ? cached : chromium.executablePath());
  const backend = existsSync(executable) ? '--chrome' : '--cpu';
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('../tools/sim.mjs', import.meta.url)),
      backend, '--n', '2048', '--minutes', '0.1', '--out', out], { env: { ...process.env, LP_NUM_THREADS: '2' } });
    let output = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 110_000);
    child.stdout.on('data', (b) => { output += b; });
    child.stderr.on('data', (b) => { output += b; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, output }); });
  });
  if (result.code === 2 && /No WebGPU adapter available/.test(result.output)) {
    t.skip('No WebGPU adapter available'); return;
  }
  assert.equal(result.code, 0, result.output);
  const run = JSON.parse(await readFile(out, 'utf8'));
  assert.ok(run.summary.finalLiving > 0);
  assert.ok(run.samples.length > 0);
});
