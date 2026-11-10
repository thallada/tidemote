// Drives the Lineage view's navigation on a saved world's records (tools/lineage/capture.mjs), at a laptop's size
// and a phone's, and checks each step: a click on a lineage's row explores it (one tap on a phone), and on its band
// in the plot; the reticle of the row pointed at, and a name in the line of descent, show a species in the water
// and leave the view where it is; the breadcrumbs are the explored lineage's ancestry, each a step up; a dragged span shows as
// its own chip, cleared alone, and keeps the lineage; Esc and Backspace go back the way the view came, then Esc
// takes the Lab back to its census; nothing above the plot moves as the view goes. Screenshots of each step go
// to --out.
//   npm run build && TIDEMOTE_VK=1 tools/capped.sh node tools/lineage/nav-check.mjs --out runs/lineage/nav runs/lineage/wA/t00072m.json
import fs from 'node:fs';
import path from 'node:path';
import { root, start, open, loadRecords } from './browser.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(`--${k}`); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const out = path.resolve(root, arg('out', 'runs/lineage/nav'));
const rec = path.relative(root, path.resolve(args[0] || 'runs/lineage/wA/t00072m.json'));
fs.mkdirSync(out, { recursive: true });
let bad = 0;
const check = (name, ok, extra = '') => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` ${extra}` : ''}`); };

const env = await start();
for (const phone of [false, true]) {
  const tag = phone ? '[phone]' : '[laptop]';
  const page = await open(env, phone ? { viewport: { width: 390, height: 844 }, mobile: true, particles: 16384 } : { viewport: { width: 1366, height: 800 }, particles: 16384 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  // (the intro goes by itself in an automated browser: wait until the world is live, or a first click only ends it)
  await page.waitForFunction(() => document.body.classList.contains('live'), null, { polling: 250, timeout: 120000 });
  await page.waitForTimeout(500);
  await loadRecords(page, rec);
  await page.evaluate(() => globalThis.__tidemote.lab.open('lineage'));
  await page.waitForTimeout(600);
  let n = 0;
  const shot = async (name) => { await page.screenshot({ path: path.join(out, `${phone ? 'phone' : 'laptop'}-${String(++n).padStart(2, '0')}-${name}.png`) }); };
  // where the view says it is: its crumbs (shown and folded), the span chip, and the heights above the plot
  const where = () => page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const lis = [...q('#lin-crumbs ol').children].filter((li) => !li.classList.contains('ell-li'));
    return {
      crumbs: lis.map((li) => li.textContent.trim()),
      shown: lis.filter((li) => getComputedStyle(li).display !== 'none').map((li) => li.textContent.trim()),
      ell: !!q('#lin-crumbs .ell-li') && !q('#lin-crumbs .ell-li').hidden,
      current: q('#lin-crumbs [aria-current="location"]')?.textContent.trim(),
      span: q('#lin-span').hidden ? null : q('#lin-span').textContent.trim(),
      plotTop: Math.round(q('#lin-muller').getBoundingClientRect().top),
      overflow: q('#lin-crumbs').scrollWidth > q('#lin-crumbs').clientWidth + 1,
      tab: q('#lab').dataset.tab,
    };
  });
  // the rows a click explores, with their names, how tall a target each is, and a point on each to press
  const pills = () => page.evaluate(() => {
    const cv = document.getElementById('lin-tree'), r = cv.getBoundingClientRect(), seen = new Map();
    const lim = Math.min(cv.clientHeight, innerHeight - r.top - 80);
    for (let y = Math.max(2, 60 - r.top); y < lim; y += 1) for (let x = 10; x < cv.clientWidth; x += 4) {
      const h = cv._ch.at(x, y);
      if (!h || !h.explore) continue;
      const k = h.key;
      const e = seen.get(k) || { key: k, name: h.lead.name, species: +(cv._ch.plate(h).match(/lineage of ([\d,]+) species/)?.[1].replace(/,/g, '') ?? 1), x0: x, x1: x, y0: y, y1: y, kids: h.u.kids.length };
      e.y1 = Math.max(e.y1, y); e.x0 = Math.min(e.x0, x); e.x1 = Math.max(e.x1, x); seen.set(k, e);
    }
    // (those the scan cut off at its foot left out) the middle of each, to press
    return [...seen.values()].filter((e) => e.y1 < lim - 2).map((e) => ({ ...e, tall: e.y1 - e.y0 + 1, x: r.left + e.x0 + 10, y: r.top + (e.y0 + e.y1) / 2 }));
  });
  // Esc until the species shown is closed and its highlight cleared (an extinct one has none), and no further
  const unshow = async () => { for (let k = 0; k < 3 && await page.evaluate(() => !document.getElementById('spec').hidden || !document.getElementById('focus').hidden); k++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); } };
  const press = async (pt) => { if (phone) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(700); };

  const w0 = await where();
  check(`${tag} at the start the crumbs say where the view is: all lineages`, w0.crumbs.length === 1 && w0.current === 'All lineages' && !w0.span, JSON.stringify(w0));
  await shot('start');
  let ps = await pills();
  check(`${tag} rows explore lineages, each a target at least 24 px tall`, ps.length > 0 && ps.every((p) => p.tall >= 24), ps.map((p) => p.tall).join(','));
  // the first lineage with lineages of its own below it
  const p1 = ps.find((p) => p.kids > 0) || ps[0];
  if (!phone) {
    // pointed at: bracketed, with its reticle; the reticle shows its species in the water and leaves the view be
    await page.mouse.move(p1.x, p1.y); await page.waitForTimeout(250); await shot('row-pointed');
    const ret = await page.evaluate((y) => { const cv = document.getElementById('lin-tree'), r = cv.getBoundingClientRect(); for (let x = 0; x < cv.clientWidth; x++) { const h = cv._ch.at(x, y - r.top); if (h && h.locate) return { x: r.left + x + 12, y, name: h.lead.name, target: h.target.name }; } return null; }, p1.y);
    check(`${tag} the row pointed at has a reticle`, !!ret && ret.name === p1.name, ret && ret.name);
    if (ret) {
      await page.mouse.move(ret.x, ret.y); await page.waitForTimeout(250); await shot('reticle-pointed');
      await page.mouse.click(ret.x, ret.y); await page.waitForTimeout(700);
      const sp = await page.evaluate(() => ({ open: !document.getElementById('spec').hidden, name: document.getElementById('spec-name')?.textContent }));
      check(`${tag} its reticle shows its species in the water, the view left where it was`, sp.open && sp.name === ret.target && (await where()).current === 'All lineages', JSON.stringify(sp));
      await shot('reticle-shown');
      // (Esc closes the species, then clears its highlight, before the view goes back)
      await unshow();
      check(`${tag} Esc closes it and clears its highlight, the view still where it was`, (await where()).current === 'All lineages' && await page.evaluate(() => document.getElementById('spec').hidden));
    }
    // a band of the plot explores its lineage too, then back
    const band = await page.evaluate(() => { const cv = document.getElementById('lin-muller'), r = cv.getBoundingClientRect(); for (let y = r.height * 0.85; y > 10; y -= 3) for (let x = r.width * 0.5; x < r.width - 4; x += 5) { const h = cv._ch.at(x, y); if (h && h.explore) return { x: r.left + x, y: r.top + y, name: h.u.strand && null }; } return null; });
    if (band) {
      const want = await page.evaluate(({ x, y }) => { const cv = document.getElementById('lin-muller'), r = cv.getBoundingClientRect(), h = cv._ch.at(x - r.left, y - r.top); const st = h.u.strand; const n = st.alive ? st.nodes.reduce((m, q) => (q.alive && q.pop > (m ? m.pop : -1) ? q : m), null) : st.nodes[0]; return n.name; }, band);
      await page.mouse.click(band.x, band.y); await page.waitForTimeout(700);
      const wb = await where();
      check(`${tag} a click on a band of the plot explores its lineage`, wb.crumbs.length === 2 && wb.crumbs[0] === 'All lineages', `${wb.current} (${want})`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(700);
      check(`${tag} and Esc comes back`, (await where()).current === 'All lineages');
    }
  }
  // (a frame partway through the zoom into it, on a laptop)
  if (!phone) { await page.mouse.click(p1.x, p1.y); await page.waitForTimeout(120); await shot('zooming'); await page.waitForTimeout(600); } else await press(p1);
  const w1 = await where();
  const own = (await pills()).find((p) => p.name === p1.name);
  check(`${tag} a click on the explored lineage's own row explores nothing more`, !own);
  check(`${tag} one ${phone ? 'tap' : 'click'} on a row explores its lineage`, w1.current === p1.name, `${w1.current} / ${p1.name}`);
  const sp1 = await page.evaluate(() => document.querySelector('[data-r="b"]').textContent.replace(/,/g, ''));
  check(`${tag} the species its row counted are the species it shows`, +sp1 === p1.species, `${p1.species} → ${sp1}`);
  // its line of descent, each name showing its species in the water
  const chain = await page.evaluate(() => [...document.querySelectorAll('.lin-descent:not([hidden]) .lin-chain a.sp')].map((a) => a.textContent));
  check(`${tag} an explored lineage lists its line of descent`, chain.length > 0, chain.slice(0, 3).join(', '));
  check(`${tag} the crumbs run from all lineages down to it`, w1.crumbs[0] === 'All lineages' && w1.crumbs.length >= 2, JSON.stringify(w1.crumbs));
  check(`${tag} nothing above the plot moved`, w1.plotTop === w0.plotTop, `${w0.plotTop} → ${w1.plotTop}`);
  await shot('explored');
  if (chain.length && !phone) {
    await page.click('.lin-chain a.sp'); await page.waitForTimeout(700);
    const sp = await page.evaluate(() => ({ open: !document.getElementById('spec').hidden, name: document.getElementById('spec-name')?.textContent }));
    check(`${tag} a name in it shows that species, the view left where it was`, sp.open && sp.name === chain[0] && (await where()).current === p1.name, JSON.stringify(sp));
    await unshow();
    await page.evaluate(() => { document.querySelector('.pane.lineage .scroll').scrollTop = 0; });
  }
  // one level deeper: a row that is not the explored lineage itself
  ps = await pills();
  const p2 = ps.find((p) => p.name !== p1.name && p.kids > 0) || ps.find((p) => p.name !== p1.name);
  let w2 = w1;
  if (p2) {
    await press(p2);
    w2 = await where();
    check(`${tag} a lineage within it explores deeper, its ancestry in the crumbs`, w2.current === p2.name && w2.crumbs.length > w1.crumbs.length && w2.crumbs.includes(p1.name), JSON.stringify(w2.crumbs));
    check(`${tag} the crumbs above keep their names as the view goes deeper`, w1.crumbs.every((x, i) => w2.crumbs[i] === x), `${JSON.stringify(w1.crumbs)} → ${JSON.stringify(w2.crumbs)}`);
    check(`${tag} the crumbs fit their row (folded where they would not)`, !w2.overflow && w2.shown.at(-1) === p2.name && w2.shown[0] === 'All lineages', JSON.stringify(w2.shown) + (w2.ell ? ' (folded)' : ''));
    check(`${tag} still nothing above the plot moved`, w2.plotTop === w0.plotTop, `${w0.plotTop} → ${w2.plotTop}`);
    await shot('deeper');
    if (w2.ell) { await page.click('#lin-crumbs .crumb.ell'); await page.waitForTimeout(200); const all = await page.$$eval('#lin-crumbs li:not(.ell-li)', (l) => l.every((x) => getComputedStyle(x).display !== 'none')); check(`${tag} the ellipsis shows the whole path`, all); await shot('whole-path'); }
    // a crumb goes up to it
    const up = w2.crumbs.at(-2);
    await page.click(`#lin-crumbs li:nth-last-child(2) button`);
    await page.waitForTimeout(700);
    const w3 = await where();
    check(`${tag} the parent's crumb goes up one lineage`, w3.current === up && w3.crumbs.length === w2.crumbs.length - 1, `${w3.current} / ${up}`);
    await shot('up');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(700);
    const w4 = await where();
    check(`${tag} Backspace goes back to where the view was`, w4.current === p2.name, w4.current);
  }
  // a span dragged across the plot: its own chip, the lineage kept
  const m = await page.locator('#lin-muller').boundingBox();
  const before = await where();
  if (phone) {
    // a finger dragged sideways across the plot (it scrolls the pane only up and down)
    const cdp = await page.context().newCDPSession(page), y = m.y + m.height * 0.5;
    const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: m.x + m.width * x, y }] });
    await touch('touchStart', 0.55);
    for (let k = 1; k <= 8; k++) { await touch('touchMove', 0.55 + 0.35 * (k / 8)); await page.waitForTimeout(16); }
    await touch('touchEnd');
  } else {
    await page.mouse.move(m.x + m.width * 0.55, m.y + m.height * 0.5); await page.mouse.down();
    await page.mouse.move(m.x + m.width * 0.7, m.y + m.height * 0.5, { steps: 4 }); await page.mouse.move(m.x + m.width * 0.9, m.y + m.height * 0.5, { steps: 4 }); await page.mouse.up();
  }
  await page.waitForTimeout(700);
  const w5 = await where();
  check(`${tag} a dragged span shows as a chip and keeps the lineage`, !!w5.span && /\d.*–.*\d/.test(w5.span) && w5.current === before.current, `${w5.span} · ${w5.current}`);
  check(`${tag} and nothing above the plot moved`, w5.plotTop === w0.plotTop, `${w0.plotTop} → ${w5.plotTop}`);
  await shot('span');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  const w6 = await where();
  check(`${tag} Esc goes back: the span gone, the lineage kept`, !w6.span && w6.current === before.current, `${w6.span} · ${w6.current}`);
  // the drag again, cleared by its chip's ×
  if (!phone) {
    await page.mouse.move(m.x + m.width * 0.55, m.y + m.height * 0.5); await page.mouse.down(); await page.mouse.move(m.x + m.width * 0.85, m.y + m.height * 0.5, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(700);
    const ws = await where();
    await page.click('#lin-span');
    await page.waitForTimeout(700);
    const w7 = await where();
    check(`${tag} the span chip's × clears the span alone`, !!ws.span && !w7.span && w7.current === ws.current, `${ws.span} → ${w7.span} · ${w7.current}`);
  }
  // all the way out
  await page.click('#lin-crumbs [data-root=""]');
  await page.waitForTimeout(700);
  const w8 = await where();
  check(`${tag} the first crumb goes back to all lineages`, w8.current === 'All lineages' && w8.crumbs.length === 1, JSON.stringify(w8.crumbs));
  await shot('all');
  // Esc steps back through every place, then (on a laptop) the Lab goes back to its census
  let steps = 0;
  for (; steps < 60; steps++) {
    const had = await page.evaluate(() => globalThis.__tidemote.lab.back());
    if (!had) break;
    await page.waitForTimeout(80);
  }
  check(`${tag} the way back ends`, steps > 0 && steps < 60, `${steps} steps`);
  if (!phone) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check(`${tag} then Esc takes the Lab back to its census`, (await where()).tab === 'census');
  }
  check(`${tag} no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await page.close();
}
await env.close();
console.log(bad ? `\n${bad} failed` : '\nall passed', `· shots in ${path.relative(root, out)}`);
process.exit(bad ? 1 : 0);
