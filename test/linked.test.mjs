import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { buildPage } from '../build.mjs';
import { encodeCard, decodeCard, cardLink, cardFromPng } from '../src/cabinet.js';
import { archetypeGenome, writeGenome } from '../src/genome.js';
import { PORTRAIT_BOX, CARD_SCALE } from '../src/card.js';
import { G_WORDS } from '../src/shaders.js';
import { vkOn, vkLaunch, retryAdapter } from '../tools/vk.mjs';

// The card page (a card's link opened, as a phone's camera opens its QR code; docs/hand.md, The cabinet), on the page
// as built: the card at once, drawn without the GPU; its portrait drawn in the studio and swapped in, each stage said
// under the card; with no GPU an alert and why; the card's QR code reading back its link, its PNG its genome; Save and
// Open; a broken link passed over. On the GPU with TIDEMOTE_VK=1 (tools/vk.mjs), else SwiftShader (slow to compile).
test('the card page shows a card at once, then its portrait, and says why when it cannot', { timeout: 300_000 }, async (t) => {
  if (!existsSync(chromium.executablePath())) { t.skip('No Playwright Chromium'); return; }
  const html = await buildPage();
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch(vkOn ? vkLaunch(['--enable-unsafe-webgpu']) : { headless: true, args: ['--enable-unsafe-webgpu'] });
  t.after(async () => { await browser.close(); server.close(); });

  const u = new Uint32Array(G_WORDS), f = new Float32Array(u.buffer);
  writeGenome(u, f, 0, archetypeGenome('grazer', () => 0.4));
  // (a branching body: an axis of eight cells, a side branch of three)
  const body = [...Array.from({ length: 8 }, (_, i) => ({ role: 0, bonds: i ? [i - 1] : [] })), { role: 1, bonds: [3] }, { role: 1, bonds: [8] }, { role: 2, bonds: [9] }];
  const words = [...u], bytes = encodeCard({ words, name: 'Velvet Spiralwort', home: 'Warm shallows', body }), link = cardLink(bytes);
  const at = (hash) => `http://127.0.0.1:${server.address().port}/${hash}`;
  const open = async ({ gpu = true, phone = true, hash = new URL(link).hash } = {}) => {
    const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1366, height: 657 } });
    if (gpu) await ctx.addInitScript(retryAdapter); else await ctx.addInitScript(() => { delete Navigator.prototype.gpu; });
    // (every word the status line says, as it says it)
    await ctx.addInitScript(() => addEventListener('DOMContentLoaded', () => {
      const el = document.getElementById('linked-status');
      globalThis.__said = [];
      new MutationObserver(() => { if (globalThis.__said.at(-1) !== el.textContent) globalThis.__said.push(el.textContent); }).observe(el, { subtree: true, childList: true, characterData: true });
    }));
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(at(hash));
    return { ctx, page, errors };
  };
  const state = (page) => page.evaluate(() => { const e = document.getElementById('linked-status'); return { state: e.dataset.state, text: e.textContent, hint: e.dataset.hint || '' }; });
  const cardPng = async (page) => new Uint8Array(await page.evaluate(async () => [...new Uint8Array(await (await fetch(document.getElementById('linked-img').src)).arrayBuffer())]));
  const rect = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; }, sel);
  // the card's portrait as drawn on its PNG: its mean brightness, and how far another's pixels differ from it
  const portraitOf = (png) => {
    const p = PNG.sync.read(Buffer.from(png)), { x, y, w, h } = PORTRAIT_BOX, s = CARD_SCALE, px = [];
    for (let yy = y * s; yy < (y + h) * s; yy += 4) for (let xx = x * s; xx < (x + w) * s; xx += 4) { const o = (yy * p.width + xx) * 4; px.push(p.data[o], p.data[o + 1], p.data[o + 2]); }
    return px;
  };
  const differ = (a, b) => a.reduce((n, v, i) => n + Math.abs(v - b[i]), 0) / a.length;
  const fits = async (page) => {
    const vh = await page.evaluate(() => innerHeight), vw = await page.evaluate(() => innerWidth);
    for (const sel of ['#linked-h', '#linked-img', '#linked-status', '#linked-note', '#linked-go', '#linked-png']) {
      const r = await rect(page, sel);
      assert.ok(r.top >= 0 && r.bottom <= vh + 0.5 && r.left >= 0 && r.right <= vw + 0.5, `${sel} within the ${vw}×${vh} view (${JSON.stringify(r)})`);
    }
  };

  await t.test('with a GPU: the card at once, each stage said, its portrait swapped in, nothing moving', async () => {
    const { ctx, page, errors } = await open();
    const t0 = Date.now();
    await page.waitForFunction(() => document.getElementById('linked-img')?.naturalWidth > 0, null, { timeout: 15_000 });
    const shownMs = Date.now() - t0, first = await cardPng(page), go = await rect(page, '#linked-go');
    assert.ok(shownMs < 10_000, `the card shown in ${shownMs} ms`);
    assert.equal(await page.isVisible('#linked'), true);
    assert.equal(await page.textContent('#linked-h'), 'Velvet Spiralwort');
    // each stage said in turn, then done
    await page.waitForFunction(() => /done|fail/.test(document.getElementById('linked-status').dataset.state), null, { timeout: 240_000 });
    const s = await state(page);
    assert.equal(s.state, 'done', `the portrait drawn (${s.text} ${s.hint})`);
    assert.deepEqual(await page.evaluate(() => globalThis.__said),
      ['Looking for a GPU (1 of 3)', 'Compiling the studio (2 of 3)', 'Drawing its portrait (3 of 3)', 'Portrait drawn']);
    // the card drawn again with its portrait, its genome and its link still in it
    const last = await cardPng(page);
    assert.ok(differ(portraitOf(first), portraitOf(last)) > 4, 'the portrait swapped in for the sigil');
    assert.deepEqual(decodeCard(cardFromPng(last)).words, words);
    assert.deepEqual(decodeCard(cardFromPng(last)).body, body);
    const p = PNG.sync.read(Buffer.from(last));
    assert.equal(jsQR(new Uint8ClampedArray(p.data), p.width, p.height, { inversionAttempts: 'dontInvert' })?.data, link, 'its QR code reads back its link (dark on light)');
    // the status line keeps its room: nothing under it moved; the page fits a phone
    assert.deepEqual(await rect(page, '#linked-go'), go);
    await fits(page);
    // Save the card: its PNG, with the portrait, carrying its genome
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#linked-png')]);
    assert.equal(dl.suggestedFilename(), 'Velvet Spiralwort.png');
    const saved = readFileSync(await dl.path());
    assert.deepEqual(decodeCard(cardFromPng(new Uint8Array(saved))).words, words);
    assert.ok(differ(portraitOf(saved), portraitOf(last)) < 0.01, 'the card saved as shown');
    // Open Tidemote: the card put aside (the world starts)
    await page.click('#linked-go');
    await page.waitForFunction(() => document.getElementById('linked').hidden);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test('without WebGPU: its sigil stands in, an alert says why, its hint the detail', async () => {
    const { ctx, page, errors } = await open({ gpu: false, phone: false });
    await page.waitForFunction(() => document.getElementById('linked-img')?.naturalWidth > 0, null, { timeout: 15_000 });
    await page.waitForFunction(() => document.getElementById('linked-status').dataset.state === 'fail', null, { timeout: 15_000 });
    const s = await state(page);
    assert.match(s.text, /no GPU/);
    assert.match(s.hint, /WebGPU[\s\S]*no WebGPU/);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#linked-status i')).clipPath !== 'none'), true, 'the alert drawn');
    await page.hover('#linked-status');
    await page.waitForFunction(() => !document.getElementById('tip').hidden);
    assert.match(await page.textContent('#tip'), /drawn on the GPU[\s\S]*no WebGPU/);
    const tip = await rect(page, '#tip'), card = await page.evaluate(() => getComputedStyle(document.getElementById('tip')).zIndex);
    assert.ok(tip.height > 0 && +card > 55, 'the hint over the card page');
    await fits(page);
    // its card as first drawn, the QR code and genome as ever
    const png = await cardPng(page);
    assert.deepEqual(decodeCard(cardFromPng(png)).words, words);
    await page.click('#linked-go');
    // (the world cannot start: the page says so)
    await page.waitForFunction(() => document.getElementById('linked').hidden && !document.getElementById('nogpu').hidden);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test('a link that holds no card, or a damaged one, is passed over', async () => {
    const bad = bytes.slice(); bad[20] ^= 1;
    for (const hash of ['#c=12', new URL(cardLink(bad)).hash]) {
      const { ctx, page, errors } = await open({ gpu: false, hash });
      await page.waitForFunction(() => !document.getElementById('nogpu').hidden, null, { timeout: 15_000 });
      assert.equal(await page.isHidden('#linked'), true, hash.slice(0, 12));
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  });
});
