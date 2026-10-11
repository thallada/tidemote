// Screenshots of the built page's Lab → Lineage pane holding a saved world's records
// (tools/lineage/capture.mjs): the page runs on the GPU, is paused, and is handed the records in
// place of its own, then each scenario (hover, a dragged span, a followed lineage, a phone) is shot.
//   node tools/lineage/page-shots.mjs [--layer DIR] --out runs/lineage/page runs/lineage/wB/t00678m.json ...
import fs from 'node:fs';
import path from 'node:path';
import { root, start, open as openPage } from './browser.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(`--${k}`); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const out = path.resolve(root, arg('out', 'runs/lineage/page'));
const env = await start(arg('layer'));
const only = arg('only', '');
fs.mkdirSync(out, { recursive: true });
const open = async (viewport, mobile = false) => {
  const page = await openPage(env, { viewport, mobile, particles: 16384 });
  await page.waitForTimeout(500);
  return page;
};
// hand the page a saved world's records, paused
const load = (page, rel) => page.evaluate(async (url) => {
  const T = globalThis.__tidemote, snap = await (await fetch(url)).json();
  T.state.paused = true;
  await new Promise((r) => setTimeout(r, 300));
  const life = T.life();
  life.reg = new Map(snap.reg.map((s) => [s.serial, s]));
  // captures from before species kept their own records: rebuild them from the history
  const bare = new Map(snap.reg.filter((s) => !s.series).map((s) => [s.serial, (s.series = { t: [], v: [] })]));
  for (const h of snap.history) for (const [k, v] of h.sp) { const r = bare.get(k); if (r) { r.t.push(h.t); r.v.push(v); } }
  life.history = snap.history;
  T.climate().history = snap.eras;
  T.eng.simTime = snap.simTime;
}, `/${rel}`);
async function lineage(page) {
  if (!(await page.evaluate(() => document.body.classList.contains('lab-open')))) await page.keyboard.press('k');
  await page.waitForTimeout(300);
  await page.click('[data-tab="lineage"]');
  await page.waitForTimeout(400);
}
const shot = async (page, name, el = '#lab') => { await page.locator(el).screenshot({ path: path.join(out, `${name}.png`) }); console.log(name); };
// time one forced redraw of the pane, as the page would on a new census
const time = (page) => page.evaluate(() => { const t = performance.now(); document.querySelector('[data-k="linK"][aria-pressed="true"]').click(); return performance.now() - t; });

for (const s of args) {
  const rel = path.relative(root, path.resolve(s));
  const tag = rel.replace(/^runs\/lineage\//, '').replace(/\.json$/, '').replace(/\//g, '-');
  const page = await open({ width: 1600, height: 1000 });
  await load(page, rel);
  await lineage(page);
  const ms = [];
  for (let i = 0; i < 3; i++) ms.push(await time(page));
  console.log(`${tag}: redraw ${ms.map((x) => x.toFixed(0)).join(', ')} ms`);
  fs.writeFileSync(path.join(out, `${tag}--timing.json`), JSON.stringify({ redrawMs: ms }));
  await page.mouse.move(10, 10);
  await shot(page, `${tag}--1-default`);
  if (only === 'default') { await page.close(); continue; }
  // the pointer on the plot, then on a lineage's pill
  const m = await page.locator('#lin-muller').boundingBox();
  await page.mouse.move(m.x + m.width * 0.55, m.y + m.height * 0.6);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(out, `${tag}--2-hover-muller.png`), clip: { x: 0, y: 0, width: 760, height: 1000 } });
  const tree = await page.locator('canvas.lin-tree').boundingBox();
  const pill = await page.evaluate(() => {
    const cv = document.querySelector('canvas.lin-tree');
    // the first row whose pill follows a lineage
    for (let y = 10; y < 600; y += 6) for (let x = 20; x < cv.clientWidth; x += 8) { const h = cv._ch.at(x, y); if (h && h.follow) return [x, y]; }
    return null;
  });
  if (pill) {
    await page.mouse.move(tree.x + pill[0], tree.y + pill[1]);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(out, `${tag}--3-hover-pill.png`), clip: { x: 0, y: 0, width: 760, height: 1000 } });
    await page.mouse.click(tree.x + pill[0], tree.y + pill[1]);
    await page.waitForTimeout(300);
    await page.mouse.move(10, 10);
    await shot(page, `${tag}--4-followed`);
    await page.click('#lin-back');
    await page.waitForTimeout(200);
  }
  // drag across the last fifth of the plot
  await page.mouse.move(m.x + m.width * 0.78, m.y + m.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(m.x + m.width * 0.9, m.y + m.height * 0.5, { steps: 4 });
  await page.mouse.move(m.x + m.width * 0.98, m.y + m.height * 0.5, { steps: 4 });
  await page.screenshot({ path: path.join(out, `${tag}--5-dragging.png`), clip: { x: 0, y: 0, width: 760, height: 520 } });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.mouse.move(10, 10);
  await shot(page, `${tag}--6-zoomed`);
  await page.click('#lin-back');
  await page.click('[data-k="linAll"][data-v="false"]');
  await page.waitForTimeout(200);
  await shot(page, `${tag}--7-living`);
  await page.click('[data-k="linAll"][data-v="true"]');
  await page.click('[data-k="linK"][data-v="60"]');
  await page.waitForTimeout(200);
  await shot(page, `${tag}--8-rows60`);
  await page.close();
  // a phone
  const ph = await open({ width: 390, height: 844 }, true);
  await load(ph, rel);
  await lineage(ph);
  await ph.screenshot({ path: path.join(out, `${tag}--9-phone.png`) });
  console.log(`${tag}--9-phone`);
  await ph.close();
}
await env.close();
