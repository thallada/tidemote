// The built page opened for an input check (tools/keys-check.mjs, tools/pad-check.mjs): served, in Chrome on the GPU
// (tools/lib/browser.mjs), sound off, a small world, and a scripted gamepad in place of navigator.getGamepads (a pad
// that shows once "plugged in", as a real one shows after its first press). Returns the page and helpers.
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { chromium } from 'playwright-core';
import { vkOn as vk, retryAdapter } from '../vk.mjs';
import { launchOptions } from './browser.mjs';

export const BTN = { S: 0, E: 1, W: 2, N: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

// (in the page) the scripted pad: window.__pad, shown while window.__padOn
function fakePad() {
  const pad = { id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, mapping: 'standard', connected: true, timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0], vibrationActuator: null };
  window.__pad = pad; window.__padOn = false;
  Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value: () => (window.__padOn ? [pad, null, null, null] : [null, null, null, null]) });
}

/**
 * Open the page: { size: { width, height }, intro: keep the intro's menu up (a visitor's browser) }. Resolves to
 * { page, browser, check, done, T(fn), pad: { plug, press, hold, down, up, stick, trig, idle } } once the world runs.
 */
export async function openPage({ size = { width: 1366, height: 768 }, intro = false, file = 'dist/tidemote.html', max = 65536 } = {}) {
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(path.resolve(file)).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch(launchOptions({ args: ['--enable-unsafe-webgpu'] }));
  const ctx = await browser.newContext({ viewport: size });
  if (vk) await ctx.addInitScript(retryAdapter);
  await ctx.addInitScript(fakePad);
  await ctx.addInitScript(({ intro, max }) => {
    if (intro) Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.__MC_MAX = max;
    if (sessionStorage.getItem('i')) return;
    sessionStorage.setItem('i', '1'); localStorage.clear(); localStorage.setItem('tidemote.sound', JSON.stringify({ on: false }));
  }, { intro, max });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { polling: 250, timeout: 180000 });
  if (!intro) {
    if (vk) await page.keyboard.press('Shift');
    await page.waitForFunction(() => document.body.classList.contains('live'), null, { polling: 250, timeout: 120000 });
  }
  let bad = 0;
  const check = (name, ok, extra = '') => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); return ok; };
  const T = (fn, arg) => page.evaluate(fn, arg);
  const set = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  const pad = {
    plug: async (id) => { await set((id) => { if (id) window.__pad.id = id; window.__padOn = true; }, id); await frames(); },
    unplug: async () => { await set(() => { window.__padOn = false; }); await frames(); },
    down: async (b) => { await set((b) => { const x = window.__pad.buttons[b]; x.pressed = true; x.value = 1; window.__pad.timestamp = performance.now(); }, b); await frames(); },
    up: async (b) => { await set((b) => { const x = window.__pad.buttons[b]; x.pressed = false; x.value = 0; window.__pad.timestamp = performance.now(); }, b); await frames(); },
    // (down and up within the page, two frames apart: a tap however slow the tool's round trips to the page)
    press: (b) => page.evaluate((b) => new Promise((r) => {
      const x = window.__pad.buttons[b], f = (n, then) => (n ? requestAnimationFrame(() => f(n - 1, then)) : then());
      x.pressed = true; x.value = 1;
      f(2, () => { x.pressed = false; x.value = 0; f(3, r); });
    }), b),
    hold: async (b, ms = 400) => { await pad.down(b); await page.waitForTimeout(ms); },
    stick: async (x, y, which = 0) => { await set(([x, y, w]) => { window.__pad.axes[w * 2] = x; window.__pad.axes[w * 2 + 1] = y; }, [x, y, which]); await frames(); },
    trig: async (b, v) => { await set(([b, v]) => { const x = window.__pad.buttons[b]; x.value = v; x.pressed = v > 0.1; }, [b, v]); await frames(); },
    idle: async () => { await set(() => { for (const x of window.__pad.buttons) { x.pressed = false; x.value = 0; } window.__pad.axes.fill(0); }); await frames(); },
  };
  const done = async () => {
    check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    await browser.close(); server.close();
    console.log(bad ? `${bad} failed` : 'all ok');
    process.exit(bad ? 1 : 0);
  };
  return { page, browser, check, done, T, pad, frames, errs };
}
