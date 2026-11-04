#!/usr/bin/env node
// A tour of the built page's words (docs/i18n.md): drives it through its states (the intro and its menu, the
// running world, every Settings and Lab tab, a species and a cell in the specimen panel and each of their
// tabs, the card, the help, the bench, the speed ladder; at laptop and phone sizes) and records every string
// it shows: text nodes, translatable attributes, and what is drawn on canvases (fillText, caught as drawn).
// With a marked build (node build.mjs --mark) each string carries its message id, and --shots also takes a
// screenshot of each state with every message's box, which the text editor shows as where a message sits.
//   npm run build && TIDEMOTE_VK=1 ~/.local/bin/capped -m 900M node tools/i18n/tour.mjs --out runs/i18n/base
//   [--page dist/tidemote.en-XA.html] [--shots] [--sizes laptop,phone] [--n 32768]
// Writes <out>/texts.json ({ states: { name: [{ s, el, attr?, box?, ids? }] } }) and with --shots <out>/<state>.png.
// tools/i18n/textdiff.mjs compares two tours; tools/i18n/coverage.mjs reads a pseudo-locale's.
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { vkOn as vk, vkLaunch, retryAdapter } from '../vk.mjs';

const { values: opt } = parseArgs({ options: { out: { type: 'string', default: 'runs/i18n/tour' }, page: { type: 'string', default: 'dist/tidemote.html' },
  shots: { type: 'boolean' }, sizes: { type: 'string', default: 'laptop,phone' }, n: { type: 'string', default: '16384' }, settle: { type: 'string', default: '12' } } });
const out = path.resolve(opt.out);
fs.mkdirSync(out, { recursive: true });
const html = fs.readFileSync(path.resolve(opt.page));
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch(vk ? vkLaunch(['--enable-unsafe-webgpu'])
  : { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: false, args: ['--enable-unsafe-webgpu'] });

// in the page: every string it shows right now, with the element that shows it
const COLLECT = () => {
  const ATTRS = ['aria-label', 'data-hint', 'alt', 'placeholder', 'title'];
  const START = '\u2063', ZW = ['\u200b', '\u200c', '\u200d', '\u2060'];
  const ids = (s) => { const out = []; for (const [, run] of s.matchAll(/\u2063([\u200b\u200c\u200d\u2060]+)\u2063/g)) { const b = []; for (let i = 0; i + 3 < run.length; i += 4) b.push((ZW.indexOf(run[i]) << 6) | (ZW.indexOf(run[i + 1]) << 4) | (ZW.indexOf(run[i + 2]) << 2) | ZW.indexOf(run[i + 3])); out.push(new TextDecoder().decode(new Uint8Array(b))); } return out; };
  const clean = (s) => s.replace(/\u2063[\u200b\u200c\u200d\u2060]*\u2063/g, '').replace(/\s+/g, ' ').trim();
  const where = (el) => { const p = []; for (let e = el; e && e !== document.body && p.length < 5; e = e.parentElement) p.unshift(e.id ? `#${e.id}` : e.tagName.toLowerCase() + (e.classList[0] ? `.${e.classList[0]}` : '')); return p.join(' > '); };
  // a box only where the element is what a visitor sees there (not under the intro, a panel or off screen)
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0) || getComputedStyle(el).visibility === 'hidden' || el.closest('[hidden]')) return null;
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + Math.min(r.height / 2, 8)));
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return null;
    const top = document.elementFromPoint(x, y);
    if (!top || !(el.contains(top) || top.contains(el) || top.closest('label') === el.closest('label') && top.closest('label'))) return null;
    let o = 1; for (let e = el; e; e = e.parentElement) o *= +getComputedStyle(e).opacity;
    return o > 0.3 ? [r.left, r.top, r.width, r.height].map(Math.round) : null;
  };
  const name = (el) => !!el.closest('[translate="no"]');
  const rows = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('script,style,svg,noscript') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  // a run of text in one element (its text nodes together, inline children's too) is one string
  const seen = new Set();
  for (let n; (n = tw.nextNode());) {
    if (!n.nodeValue.trim()) continue;
    let el = n.parentElement;
    // an inline element's words belong to its block's sentence
    while (el.parentElement && /^(B|I|EM|STRONG|KBD|SMALL|SPAN|A|SUB|SUP|U|CODE)$/.test(el.tagName) && [...el.parentElement.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim())) el = el.parentElement;
    if (seen.has(el)) continue;
    seen.add(el);
    const raw = [...el.childNodes].map((c) => (c.nodeType === 3 ? c.nodeValue : c.nodeType === 1 && !/^(SVG|svg|CANVAS|INPUT|SELECT|TEXTAREA|OL|UL|DIV|P|LI|SECTION|TABLE)$/.test(c.tagName) ? c.textContent : ' ')).join('');
    const s = clean(raw);
    if (s) rows.push({ s, el: where(el), name: name(n.parentElement) || undefined, ids: ids(raw), box: shown(el) || undefined });
  }
  for (const el of document.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v && clean(v)) rows.push({ s: clean(v), el: where(el), attr: a, ids: ids(v), box: shown(el) || undefined });
    }
  }
  for (const el of document.querySelectorAll('input[type=button],input[type=submit]')) rows.push({ s: clean(el.value), el: where(el), attr: 'value', ids: ids(el.value) });
  rows.push({ s: clean(document.title), el: 'title', ids: ids(document.title) });
  // a glossary term: its hint is message gloss.<key>, shown over the term
  for (const el of document.querySelectorAll('[data-tip]')) { const b = shown(el); if (b) rows.push({ s: '', el: where(el), attr: 'data-tip', ids: [`gloss.${el.dataset.tip}`], box: b }); }
  // what canvases drew since the last look
  for (const [s, cv] of (globalThis.__drawn || new Map())) { const c = clean(s); if (c) rows.push({ s: c, el: cv, attr: 'canvas', ids: ids(s) }); }
  globalThis.__drawn = new Map();
  return rows;
};

const states = {}, T0 = Date.now();
const take = async (page, name) => {
  await page.waitForTimeout(350);
  const rows = await page.evaluate(COLLECT);
  states[name] = rows;
  if (opt.shots) await page.screenshot({ path: path.join(out, `${name}.png`) });
  console.log(`${name}: ${rows.length} strings (${((Date.now() - T0) / 1000).toFixed(0)} s)`);
};
const step = async (page, name, fn) => { try { await fn(); await take(page, name); } catch (e) { console.log(`${name}: skipped (${e.message.split('\n')[0]})`); } };

for (const size of opt.sizes.split(',')) {
  const touch = size === 'phone';
  const ctx = await browser.newContext(touch ? { viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1366, height: 657 } });
  await ctx.addInitScript(([n]) => {
    // as a visitor's browser, so the intro holds on Begin with its menu (the page lets an automated one's go by)
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.__MC_MAX = n;
    if (!sessionStorage.getItem('i')) { sessionStorage.setItem('i', '1'); localStorage.clear(); localStorage.setItem('tidemote.sound', JSON.stringify({ on: false, volume: 0.7 })); }
    // canvas text, as it is drawn
    globalThis.__drawn = new Map();
    const P = CanvasRenderingContext2D.prototype, O = typeof OffscreenCanvasRenderingContext2D !== 'undefined' ? OffscreenCanvasRenderingContext2D.prototype : null;
    for (const proto of [P, O].filter(Boolean)) for (const f of ['fillText', 'strokeText']) {
      const orig = proto[f];
      proto[f] = function (s, ...a) { try { const cv = this.canvas; globalThis.__drawn.set(String(s), `canvas#${cv.id || cv.className || 'offscreen'}`); } catch {} return orig.call(this, s, ...a); };
    }
  }, [+opt.n]);
  if (vk) await ctx.addInitScript(retryAdapter);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`page error: ${e.message}`));
  const T = (f, a) => page.evaluate(f, a);
  const p = `${size}.`;
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { polling: 250, timeout: 120000 });
  await page.waitForFunction(() => document.getElementById('intro').classList.contains('ask'), null, { polling: 100, timeout: 120000 }).catch(() => {});
  await take(page, `${p}intro`);
  await step(page, `${p}menu-particles`, async () => { await page.click('#menu-n', { timeout: 4000 }); });
  await step(page, `${p}menu-worlds`, async () => { await page.click('#menu-w', { timeout: 4000 }); });
  await page.keyboard.press('Escape');
  await page.click('#begin').catch(() => page.keyboard.press('Enter'));
  await page.waitForFunction(() => document.body.classList.contains('live'), null, { polling: 250, timeout: 120000 });
  await page.waitForTimeout(+opt.settle * 1000);
  await take(page, `${p}running`);
  // Settings, each tab
  await T(() => document.getElementById('set-open').click());
  for (const tab of await T(() => [...document.querySelectorAll('#set-tabs [data-tab]')].map((b) => b.dataset.tab))) {
    await step(page, `${p}settings-${tab}`, async () => { await T((t) => document.querySelector(`#set-tabs [data-tab="${t}"]`).click(), tab); await page.waitForTimeout(400); });
  }
  await T(() => document.getElementById('set-close').click());
  // the Lab, each tab
  if (touch) await T(() => document.getElementById('lab-open').click());
  for (const tab of await T(() => [...document.querySelectorAll('#lab-tabs [data-tab]')].map((b) => b.dataset.tab))) {
    await step(page, `${p}lab-${tab}`, async () => { await T((t) => document.querySelector(`#lab-tabs [data-tab="${t}"]`).click(), tab); await page.waitForTimeout(700); });
  }
  await T(() => document.querySelector('#lab-tabs [data-tab="census"]').click());
  if (touch) await page.keyboard.press('Escape');
  // a species, then a cell of it, each tab of each
  const top = await T(() => [...globalThis.__tidemote.life().reg.values()].filter((x) => x.alive && x.established).sort((a, b) => b.pop - a.pop)[0]?.serial);
  const specTabs = async (what) => {
    await T(() => { const m = document.getElementById('spec-more'); if (m && m.getAttribute('aria-expanded') === 'false' && m.offsetParent) m.click(); });
    for (const tab of await T(() => [...document.querySelectorAll('#spec-tabs [data-tab]')].map((b) => b.dataset.tab))) {
      await step(page, `${p}${what}-${tab}`, async () => { await T((t) => document.querySelector(`#spec-tabs [data-tab="${t}"]`).click(), tab); await page.waitForTimeout(600); });
    }
  };
  if (top != null) {
    await step(page, `${p}species`, async () => { await T((s) => globalThis.__tidemote.openSpecies(s), top); await page.waitForTimeout(800); });
    await specTabs('species');
    await step(page, `${p}cell`, async () => { await T((s) => globalThis.__tidemote.findMember(s), top); await page.waitForTimeout(2500); });
    await specTabs('cell');
    if (!touch) {
      await step(page, `${p}card`, async () => { await T(() => globalThis.__tidemote.openSpecies([...globalThis.__tidemote.life().reg.values()].filter((x) => x.alive && x.established).sort((a, b) => b.pop - a.pop)[0].serial)); await page.waitForTimeout(500); await page.click('#spec-acts [data-act="save"]', { timeout: 3000 }); await page.waitForTimeout(4000); await page.click('#spec-acts [data-act="card"]', { timeout: 3000 }); await page.waitForTimeout(2500); });
      await page.keyboard.press('Escape');
      await step(page, `${p}cabinet`, async () => { await page.keyboard.press('Escape'); await T(() => document.querySelector('#lab-tabs [data-tab="cabinet"]').click()); await page.waitForTimeout(800); });
    }
    await T(() => globalThis.__tidemote.deselect());
  }
  if (!touch) await step(page, `${p}help`, async () => { await page.keyboard.press('?'); });
  await page.keyboard.press('Escape');
  await step(page, `${p}bench`, async () => { await T(() => document.getElementById('bench-open').click()); await page.waitForTimeout(400); });
  await step(page, `${p}bench-lamp`, async () => { await T(() => document.querySelector('.tile[data-tool="lamp"]')?.click()); await page.waitForTimeout(400); });
  await page.keyboard.press('Escape'); await page.keyboard.press('0');
  await step(page, `${p}ladder`, async () => { await T(() => document.getElementById('t-speed').click()); await page.waitForTimeout(400); });
  await page.keyboard.press('Escape');
  await step(page, `${p}paused`, async () => { await T(() => document.getElementById('t-play').click()); });
  await T(() => document.getElementById('t-play').click());
  await ctx.close();
}
await browser.close();
server.close();
fs.writeFileSync(path.join(out, 'texts.json'), JSON.stringify({ page: opt.page, states }, null, 1));
console.log(`wrote ${path.join(out, 'texts.json')}`);
