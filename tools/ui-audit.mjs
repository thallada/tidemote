// The page's layout at the screen sizes people use: screenshots of its main states and an audit of
// what is too small to read or press, what spills off screen, and what axe-core finds.
//   npm run build && tools/gpu-node.sh tools/ui-audit.mjs --out runs/ui/before [--sizes l1366,p390] [--settle 25]
// --page FILE audits another build of the page (a copy of dist/tidemote.html kept from before a change).
// Writes <out>/<size>-<state>.png and <out>/audit.json, and prints a summary. Under WSL it drives Windows
// Chrome on the GPU (tools/gpu-node.sh); elsewhere pass --chrome PATH or use Playwright's Chromium.
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { chromium } from 'playwright-core';
import { vkOn as vk, vkLaunch, retryAdapter } from './vk.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']] : a), []));
const out = path.resolve(args.out || 'runs/ui/audit');
fs.mkdirSync(out, { recursive: true });
const settle = +(args.settle || 25);
const chrome = args.chrome || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);

// CSS viewports: a laptop screen less the browser's own bars (about 110 px), and phones
const SIZES = [
  { id: 'l1280', w: 1280, h: 645, dpr: 1.5, note: '1920×1080 at 150%' },
  { id: 'l1366', w: 1366, h: 657, dpr: 1, note: '1366×768' },
  { id: 'l1536', w: 1536, h: 730, dpr: 1.25, note: '1920×1080 at 125%' },
  { id: 'l1440', w: 1440, h: 789, dpr: 2, note: 'MacBook Air 13' },
  { id: 'd1920', w: 1920, h: 969, dpr: 1, note: '1920×1080 desktop' },
  { id: 'p390', w: 390, h: 700, dpr: 3, touch: true, note: 'phone, portrait' },
  { id: 'p844', w: 844, h: 340, dpr: 3, touch: true, note: 'phone, landscape' },
].filter((s) => !args.sizes || args.sizes.split(',').includes(s.id));

const MIN_TEXT = 11, MIN_TARGET = 24, MIN_TOUCH = 44;

const dist = path.resolve('dist');
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  // the page, else what the site serves beside it (fresh-shaders.txt: without it every page load logged a 404)
  let file = url === '/tidemote.html' && args.page ? path.resolve(args.page) : path.join(dist, url === '/' ? 'tidemote.html' : url);
  if (!fs.existsSync(file)) file = path.join(path.resolve('site'), url);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const axe = fs.readFileSync(path.resolve('node_modules/axe-core/axe.min.js'), 'utf8');

// on Linux without a display (TIDEMOTE_VK): headless, on the GPU through Vulkan
const flags = ['--enable-unsafe-webgpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-first-run'];
const browser = await chromium.launch({ executablePath: chrome, ...(vk ? vkLaunch(flags) : { headless: false, args: flags }) });

// measured in the page: everything the reader sees and presses
function measure({ MIN_TEXT, MIN_TARGET, MIN_TOUCH, touch }) {
  const vis = (el) => {
    if (!el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    }
    return r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  };
  const name = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    else if (el.classList.length) s += `.${[...el.classList].slice(0, 2).join('.')}`;
    const p = el.parentElement && el.parentElement.closest('[id]');
    return p ? `${p.id} › ${s}` : s;
  };
  const small = new Map();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('svg') || el.closest('.sr-only') || !vis(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < MIN_TEXT) {
      const k = `${name(el)} ${fs}px`;
      const e = small.get(k) || { el: name(el), px: fs, n: 0, sample: n.textContent.trim().slice(0, 30) };
      e.n++; small.set(k, e);
    }
  }
  const min = touch ? MIN_TOUCH : MIN_TARGET;
  const targets = [];
  for (const el of document.querySelectorAll('button, a[href], a.sp, input, select, [role="button"], [role="tab"]')) {
    if (!vis(el) || el.closest('.sr-only')) continue;
    const r = el.getBoundingClientRect();
    // inline links in running text are exempt (WCAG 2.5.8)
    if (el.matches('a.sp') && getComputedStyle(el).display === 'inline') continue;
    if (r.width < min || r.height < min) targets.push({ el: name(el), w: Math.round(r.width), h: Math.round(r.height), aa: r.width >= MIN_TARGET && r.height >= MIN_TARGET });
  }
  const box = (id) => { const e = document.getElementById(id) || document.querySelector(id); if (!e || !vis(e)) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const compass = document.querySelector('#spec .compass'), body = document.getElementById('spec-body');
  let compassShown = null;
  if (compass && body && vis(document.getElementById('spec'))) {
    const c = compass.getBoundingClientRect(), b = body.getBoundingClientRect();
    compassShown = { compassBottom: Math.round(c.bottom), visibleBottom: Math.round(Math.min(b.bottom, innerHeight)), ok: c.height > 0 && c.top >= b.top - 1 && c.bottom <= Math.min(b.bottom, innerHeight) + 1 && vis(compass) };
    // Judged where it can be met: a phone's sheet that only peeks keeps the compass in its full record (the
    // cell-full state), and a screen under 500px tall (a phone on its side, 340) has no room for it under the
    // panel's name, close-up and actions (about 230px of its 250), so there it is reported, not failed.
    if (b.height < 1) compassShown.na = 'peek';
    else if (innerHeight < 500) compassShown.na = `${innerHeight}px tall`;
  }
  const over = [];
  for (const id of ['lab', 'spec', 'settings', 'help', 'rail', 'dock']) {
    const e = document.getElementById(id) || document.querySelector(`.${id}`);
    if (!e || !vis(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.left < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) over.push({ id, l: Math.round(r.left), r: Math.round(r.right), b: Math.round(r.bottom) });
  }
  // rows of the dock or the rail that wrapped or clipped
  const clipped = [];
  for (const el of document.querySelectorAll('.rail *, .dock *, .lab-head *, .spec-head *')) {
    if (!vis(el) || el.children.length) continue;
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible' && getComputedStyle(el).textOverflow !== 'ellipsis') clipped.push(name(el));
  }
  return {
    vw: innerWidth, vh: innerHeight, hscroll: document.documentElement.scrollWidth > innerWidth,
    smallText: [...small.values()].sort((a, b) => a.px - b.px), smallTargets: targets,
    boxes: { lab: box('lab'), spec: box('spec'), specBody: box('spec-body'), viewer: box('viewer'), census: box('ov-census'), chart: box('chart'), log: box('feed'), settings: box('settings') },
    compass: compassShown, offscreen: over, clipped,
  };
}

async function axeRun(page) {
  await page.addScriptTag({ content: axe });
  return page.evaluate(async () => {
    const r = await globalThis.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'], resultTypes: ['violations'] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, nodes: v.nodes.slice(0, 6).map((n) => `${n.target.join(' ')} · ${(n.any[0] || n.all[0] || n.none[0] || {}).message || ''}`.slice(0, 220)) }));
  });
}

const report = { when: new Date().toISOString(), base, sizes: {} };
for (const s of SIZES) {
  console.log(`— ${s.id} ${s.w}×${s.h} (${s.note})`);
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr, hasTouch: !!s.touch, isMobile: !!s.touch });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('ui-init')) return;
    sessionStorage.setItem('ui-init', '1');
    localStorage.clear();
    localStorage.setItem('tidemote.sound', JSON.stringify({ on: false, volume: 0.7 }));
  });
  if (vk) await ctx.addInitScript(retryAdapter);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await page.goto(`${base}/tidemote.html`);
  await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running', null, { polling: 250, timeout: 120000 });
  // without a user gesture (headless) the page holds the world on its intro: a key lets it begin
  if (vk) await page.keyboard.press('Shift');
  await page.waitForFunction(() => globalThis.__tidemote?.state.phase === 'running' && document.body.classList.contains('live'), null, { polling: 250, timeout: 120000 });
  await page.waitForTimeout(settle * 1000);
  const rec = report.sizes[s.id] = { ...s, states: {}, errors: errs };
  const snap = async (state) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(out, `${s.id}-${state}.png`) });
    rec.states[state] = await page.evaluate(measure, { MIN_TEXT, MIN_TARGET, MIN_TOUCH, touch: !!s.touch });
  };
  const open = (sel) => page.evaluate((sel) => { const b = document.querySelector(sel); if (b && !b.hidden) b.click(); }, sel);
  // the default view: the Lab open on its census (a phone opens it from the dock)
  if (s.touch) await open('#lab-open');
  await snap('census');
  rec.axe = await axeRun(page);
  // a living cell of the most numerous species, picked as a click would pick it
  if (s.touch) await page.evaluate(() => document.getElementById('lab-close')?.click());
  const picked = await page.evaluate(async () => {
    const T = globalThis.__tidemote, life = T.life();
    const sp = [...life.reg.values()].filter((x) => x.alive).sort((a, b) => b.pop - a.pop)[0];
    if (!sp) return false;
    await T.findMember(sp.serial);
    return sp.name;
  });
  await page.waitForTimeout(2500);
  rec.picked = picked;
  await snap('cell');
  if (s.touch) {
    await open('#spec-more');
    await snap('cell-full');
  } else {
    rec.axeCell = await axeRun(page);
  }
  // the species card of the cell's species (its portrait taken), then the chronicler's log
  // (an older build, --page, may have no cards)
  if (await page.evaluate(() => !!globalThis.__tidemote.cards)) {
    await page.evaluate(() => { const T = globalThis.__tidemote, life = T.life(); const sp = [...life.reg.values()].filter((x) => x.alive).sort((a, b) => b.pop - a.pop)[0]; if (sp) T.cards.open(sp.serial); });
    await page.waitForTimeout(2500);
    await snap('card');
    if (!s.touch) rec.axeCard = await axeRun(page);
    await page.evaluate(() => globalThis.__tidemote.cards.close());
  }
  await page.evaluate(() => globalThis.__tidemote.deselect());
  await page.evaluate(() => { globalThis.__tidemote.lab.open('log'); document.querySelector('[data-k="logType"][data-v="story"]')?.click(); });
  await snap('log');
  if (s.touch) await page.evaluate(() => globalThis.__tidemote.lab.close()); else await page.evaluate(() => globalThis.__tidemote.lab.narrow());
  await open('#set-btn, [aria-controls="settings"]');
  await snap('settings');
  // the Perf tab: its readouts filled in
  await open('#set-tabs [data-tab="performance"]');
  await page.waitForTimeout(1500);
  await snap('perf');
  await ctx.close();
}
await browser.close(); server.close();
fs.writeFileSync(path.join(out, 'audit.json'), JSON.stringify(report, null, 1));

// the summary
for (const [id, r] of Object.entries(report.sizes)) {
  console.log(`\n${id} ${r.w}×${r.h} (${r.note})${r.errors.length ? `  errors: ${r.errors.slice(0, 2).join(' | ')}` : ''}`);
  for (const [st, m] of Object.entries(r.states)) {
    const tgt = m.smallTargets.filter((t) => !t.aa).length;
    console.log(`  ${st.padEnd(10)} text<${MIN_TEXT}px: ${String(m.smallText.reduce((a, x) => a + x.n, 0)).padStart(3)}  targets<${r.touch ? MIN_TOUCH : MIN_TARGET}: ${String(m.smallTargets.length).padStart(3)} (under 24: ${tgt})`
      + `  hscroll: ${m.hscroll ? 'YES' : 'no'}  offscreen: ${m.offscreen.map((o) => o.id).join(',') || '-'}  clipped: ${m.clipped.length}`
      + (m.boxes.specBody ? `  spec scroll h: ${m.boxes.specBody.h}` : '') + (m.compass ? `  compass: ${m.compass.ok ? 'ok' : m.compass.na ? `n/a, ${m.compass.na}${m.compass.na === 'peek' ? '' : ` (below the fold: ${m.compass.compassBottom} > ${m.compass.visibleBottom})`}` : `HIDDEN (${m.compass.compassBottom} > ${m.compass.visibleBottom})`}` : ''));
  }
  for (const a of [...(r.axe || []), ...(r.axeCell || []), ...(r.axeCard || [])]) console.log(`  axe ${a.impact} ${a.id} ×${a.n}: ${a.help}`);
}
console.log(`\n${out}`);
