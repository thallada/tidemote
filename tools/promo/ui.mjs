// The interface close up: the page at 1280x720 and device scale 6 (7680x4320 HEVC frames, so the edit can push in 2x
// and stay native 4K), a drawn pointer, every panel's rect logged each frame for the edit's virtual camera. The overview;
// the loupe; the mind compass of a cell deciding; every inspector tab; the species card; the Field Lab (census, charts,
// species, Lineage explored); the maps; the bench's tools in the water (lamp, warm stage to a boil, cold probe to ice,
// needle, pipette drawing up and setting down); riding a body with the keys; the speed ladder. (The glass rod has its
// own takes in hand.mjs, picking a body in pick.mjs, the annotations in notes.mjs.)
//   tools/gpu-node.sh tools/promo/ui.mjs --out /mnt/d/tidemote-promo/lib2/u01 --mature 2000 [--parts ...] [--html ...]
import { cliArgs, aim, openOffline, MEDIA, S, timeline } from './olab.mjs';

const TRACK = ['#spec', '#spec-tabs', '#spec-body', '#spec-acts', '#viewer', '.mv-dial', '.mv-drives', '.mv', '#lab', '#chart', '#lab-body', '#lab-tabs', '#lin-muller', '#lin-crumbs',
  '#maps', '#hud', '#rail', '#dock', '#feed', '#card', '#card-cv', '#bench', '#held', '#ladder', '#__ptr'];
const ALL = 'overview,loupe,mind,tabs,card,lab,lineage,maps,bench,lamp,warm,cold,needle,pipette,ride,ladder';
const v = { out: MEDIA + '/u01', mature: 2000, parts: ALL, ...cliArgs() };
const P = await openOffline({ ...v, ui: true, vw: 1280, vh: 720, scale: +(v.scale ?? 6), hevc: true, track: TRACK, notes: 0 });
const { page, T, setSpeed, wait, spots, cellsInView, esc, lab, glide, stroke } = P;
const W = 1280, H = 720, parts = v.parts.split(',');
const log = (...a) => console.log('[ui]', ...a);
const shot = (name, frames, o = {}) => P.shot(name, frames, { ...o, meta: { cat: 'ui', speed: 1, ...o.meta } });
await setSpeed(1); await wait(5);
await P.calm();
// the best view at zoom z for these keys, the camera there
const bestView = async (z, keys = ['diverse', 'bodies', 'total']) => { const [s] = await P.bestSpots(1, z, keys, { cells: 60 }); await aim(page, s, z); await wait(0.6); return s; };
const park = [W - 60, H - 60];
// Clicks by the element's box through the mouse: an element's own click waits for it to be actionable, forever under
// the page's frozen clock (setDefaultTimeout(0)), and hung the Lineage shot once.
const tapEl = async (h) => { const b = await h?.boundingBox().catch(() => null); if (b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); else log('tap: no box'); return !!b; };
const tapSel = async (sel) => tapEl(await page.$(sel));
const tool = (id) => T((id) => globalThis.__tidemote.hand.set(id), id);

if (parts.includes('overview')) {
  await lab(false);
  // the whole interface as it opens on a living world: rail, dock, log; the camera drifting in a little
  await esc(); await bestView(60, ['diverse', 'dense']); await page.mouse.move(...park);
  await shot('ui_overview', S(8), { pre: 30, meta: { what: 'overview' }, each: async (f) => { if (f >= 0) await T((f) => { const t = globalThis.__tidemote; t.cam.zoom = t.cam.zoomTarget = t.cam.zoom * Math.pow(1.25, 1 / 480); }, f); } });
}
if (parts.includes('loupe')) {
  await lab(false);
  // the loupe in hand, gliding over a busy scene
  await esc(); await bestView(140, ['bodies', 'diverse']);
  await tool('loupe');
  const cs = await cellsInView(), pts = [[W * 0.25, H * 0.6], [W * 0.42, H * 0.38], [W * 0.62, H * 0.55], [W * 0.75, H * 0.35]];
  if (cs.length > 4) for (let k = 0; k < 4; k++) { const c = cs[Math.floor((k + 0.5) / 4 * cs.length)]; pts[k] = [c.x, c.y]; }
  await page.mouse.move(...pts[0]);
  await shot('ui_loupe', S(8), { pre: 30, meta: { what: 'loupe' }, each: timeline(stroke(10, 440, pts)) });
  await tool('none');
}
if (parts.includes('mind')) {
  await lab(false);
  // the mind compass of a cell deciding: fast cells near the middle tried in turn, a dormant one passed over
  await esc(); await bestView(240, ['swift', 'kills', 'bodies']); await page.mouse.move(...park);
  const fast = (await cellsInView()).filter((e) => e.x > W * 0.15 && e.x < W * 0.6 && e.y > H * 0.2 && e.y < H * 0.8).sort((a, b) => b.sp - a.sp).slice(0, 12);
  for (const f of fast) {
    const p = (await cellsInView()).find((q) => q.id === f.id); if (!p) continue;
    await page.mouse.click(p.x, p.y); await wait(1.2);
    const mode = await page.evaluate(() => (document.querySelector('.mv')?.innerText || '').toLowerCase());
    if (mode && !mode.includes('dormant')) break;
    await esc(1);
  }
  await page.mouse.move(W * 0.35, H * 0.85);
  await shot('ui_mind', S(8), { pre: 30, meta: { what: 'mind compass' } });
}
if (parts.includes('tabs')) {
  await lab(false);
  // every inspector tab, held long enough to read
  const tabs = await page.$$('#spec-tabs [data-tab]');
  const acts = []; let f = 20, from = [W * 0.35, H * 0.8];
  for (const t of tabs) { const b = await t.boundingBox(); if (!b) continue; const to = [b.x + b.width / 2, b.y + b.height / 2]; acts.push(...glide(f, 28, from, to), [f + 30, () => tapEl(t)]); f += 150; from = to; }
  acts.push(...glide(f, 30, from, [W * 0.35, H * 0.8]));
  log('tabs', tabs.length);
  await shot('ui_tabs', f + 60, { pre: 12, meta: { what: 'inspector tabs' }, each: timeline(acts) });
}
if (parts.includes('card')) {
  await lab(false);
  // the species card: saved to the cabinet, then opened (portrait, sigil, record, gauges), its song played
  const has = async (sel) => !!(await page.$(sel));
  if (await has('#spec-acts [data-act="save"]')) { await tapSel('#spec-acts [data-act="save"]'); await wait(1.5); }
  const cb = await (await page.$('#spec-acts [data-act="card"]'))?.boundingBox();
  if (cb) {
    const at = [cb.x + cb.width / 2, cb.y + cb.height / 2];
    await page.mouse.move(W * 0.35, H * 0.8);
    await shot('ui_card', S(10), { pre: 20, meta: { what: 'species card' }, each: timeline([...glide(10, 40, [W * 0.35, H * 0.8], at), [52, () => page.mouse.click(...at)],
      [240, async () => { const p = await (await page.$('#card-play'))?.boundingBox(); if (p) { await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2); await page.mouse.click(p.x + p.width / 2, p.y + p.height / 2); } }]]) });
    await esc(2);
  } else log('no card button');
}
if (parts.includes('lab')) {
  // the Field Lab: the census chart swept, then Charts and Species
  await esc(); await bestView(80, ['diverse', 'dense']); await page.mouse.move(...park);
  await page.keyboard.press('k'); await wait(1.5);
  const b = await (await page.$('#chart'))?.boundingBox();
  const tabPos = [];
  for (const id of ['charts', 'species']) { const t = await page.$(`#lab [data-tab="${id}"]`); const tb = await t?.boundingBox(); if (tb) tabPos.push([t, [tb.x + tb.width / 2, tb.y + tb.height / 2]]); }
  await page.keyboard.press('k'); await wait(1);
  const acts = [[10, () => page.keyboard.press('k')]];
  if (b) acts.push(...glide(70, 40, park, [b.x + b.width * 0.1, b.y + b.height * 0.55]), ...glide(112, 170, [b.x + b.width * 0.1, b.y + b.height * 0.55], [b.x + b.width * 0.92, b.y + b.height * 0.45]));
  let f = 310, from = b ? [b.x + b.width * 0.92, b.y + b.height * 0.45] : park;
  for (const [t, p] of tabPos) { acts.push(...glide(f, 30, from, p), [f + 32, () => tapEl(t)]); f += 190; from = p; }
  await shot('ui_lab', f + 60, { pre: 12, meta: { what: 'field lab' }, each: timeline(acts) });
}
if (parts.includes('lineage')) {
  // the Lineage view: opened, a lineage's row clicked to explore it (breadcrumbs, readout), then a band of the plot
  const lt = await page.$('#lab [data-tab="lineage"]');
  await lab(true);
  if (lt) {
    await tapEl(lt); await wait(2);
    // the rows a click explores: the Lineage tree canvas's hit regions (as tools/lineage/nav-check.mjs finds them)
    const rows = await page.evaluate(() => {
      const cv = document.getElementById('lin-tree'); if (!cv || !cv._ch) return [];
      const r = cv.getBoundingClientRect(), seen = new Map(), lim = Math.min(cv.clientHeight, innerHeight - r.top - 80);
      for (let y = Math.max(2, 60 - r.top); y < lim; y += 2) for (let x = 10; x < cv.clientWidth; x += 6) {
        const h = cv._ch.at(x, y); if (!h || !h.explore) continue;
        const e = seen.get(h.key) || { x0: x, y0: y, y1: y }; e.y1 = Math.max(e.y1, y); e.x0 = Math.min(e.x0, x); seen.set(h.key, e);
      }
      return [...seen.values()].filter((e) => e.y1 < lim - 2 && e.y1 - e.y0 >= 6).map((e) => [r.left + e.x0 + 10, r.top + (e.y0 + e.y1) / 2, e.y1 - e.y0]);
    });
    const mb = await (await page.$('#lin-muller'))?.boundingBox();
    log('lineage rows', rows.length, 'muller', !!mb);
    const acts = []; let f = 20, from = park;
    if (mb) { const p = [mb.x + mb.width * 0.55, mb.y + mb.height * 0.5]; acts.push(...glide(f, 40, from, p), ...glide(f + 40, 90, p, [mb.x + mb.width * 0.8, mb.y + mb.height * 0.4])); from = [mb.x + mb.width * 0.8, mb.y + mb.height * 0.4]; f += 150; }
    for (const r of rows.slice(1, 3)) { acts.push(...glide(f, 30, from, [r[0], r[1]]), [f + 34, () => page.mouse.click(r[0], r[1])]); from = [r[0], r[1]]; f += 200; }
    if (mb && !rows.length) { const p = [mb.x + mb.width * 0.5, mb.y + mb.height * 0.6]; acts.push(...glide(f, 30, from, p), [f + 34, () => page.mouse.click(...p)]); f += 200; }
    await shot('ui_lineage', f + 90, { pre: 20, meta: { what: 'lineage' }, each: timeline(acts) });
  }
  await esc(); await lab(false);
}
if (parts.includes('maps')) {
  await lab(false);
  // the maps over the whole world, each switched on well before recording (its legend shown, its toggle text faded)
  await esc(); await aim(page, (await spots(1, 'diverse'))[0], 'fit'); await page.mouse.move(W - 1, 1);
  // (one map at a time: a map's key opens it in place of another, and closes it when it is open)
  const state = () => T(() => { const T = globalThis.__tidemote; return { map: T.state.map, currents: !!T.state.currents }; });
  const KEY = { light: 'g', heat: 'e', tide: 'h' };
  const reach = async (want) => {
    const s = await state(), map = want.map ?? 'off';
    if (s.map !== map) { await page.keyboard.press(KEY[map === 'off' ? s.map : map]); await wait(0.15); }
    if (s.currents !== !!want.currents) { await page.keyboard.press('c'); await wait(0.15); }
  };
  const base = await state();
  for (const [name, o] of [['light', { map: 'light' }], ['heat', { map: 'heat' }], ['tide', { map: 'tide' }], ['currents', { currents: true }]]) {
    await reach(o); await wait(3);
    await shot(`ui_map_${name}`, S(6), { pre: 60, meta: { what: `map ${name}`, zoom: 'fit' } });
  }
  await reach(base);
}
// the bench: the drawer opened and each tool's tile shown, then each tool used in the water (the instrument drawn
// in the water, the pointer over it, the held strip naming it)
if (parts.includes('bench')) {
  await lab(false);
  await esc(); await bestView(160, ['diverse', 'bodies']); await page.mouse.move(...park);
  await page.keyboard.press('b'); await wait(1);
  const tiles = await page.evaluate(() => [...document.querySelectorAll('#bench .tile[data-tool]')].map((t) => { const b = t.getBoundingClientRect(); return [t.dataset.tool, b.x + b.width / 2, b.y + b.height / 2]; }).filter((t) => t[2] > 0));
  await page.keyboard.press('b'); await wait(0.8);
  log('bench tiles', tiles.map((t) => t[0]).join(' '));
  const acts = [[10, () => page.keyboard.press('b')]]; let f = 50, from = park;
  for (const t of tiles.slice(0, 9)) { acts.push(...glide(f, 22, from, [t[1], t[2]])); from = [t[1], t[2]]; f += 40; }
  acts.push([f + 20, () => page.keyboard.press('b')]);
  await shot('ui_bench', f + 80, { pre: 12, meta: { what: 'bench' }, each: timeline(acts) });
  await esc();
}
// a tool held in the water: the pointer moves there, presses, holds while moving along `pts`, lets go
const handShot = async (name, id, z, key, pts, frames, { down = 30, up = frames - 30, setup = null, what = id } = {}) => {
  await esc(); await lab(false); await bestView(z, key);
  if (setup) await setup();
  await tool(id); await page.mouse.move(...pts[0]); await wait(0.6);
  await shot(name, frames, { pre: 30, meta: { what, zoom: z }, each: timeline([[down, () => page.mouse.down()], ...stroke(down + 2, up - down - 4, pts), [up, () => page.mouse.up()]]) });
  await tool('none');
};
if (parts.includes('lamp')) await handShot('hand_lamp', 'lamp', 90, ['dense', 'diverse'], [[W * 0.42, H * 0.5], [W * 0.5, H * 0.46], [W * 0.58, H * 0.52]], S(8), { what: 'lamp' });
if (parts.includes('warm')) await handShot('hand_warm', 'warm', 200, ['dense', 'bodies'], [[W * 0.5, H * 0.5], [W * 0.52, H * 0.5]], S(12), { down: 20, up: S(11.5), what: 'warm stage to a boil' });
if (parts.includes('cold')) await handShot('hand_cold', 'cold', 140, ['dense', 'bodies'], [[W * 0.5, H * 0.5], [W * 0.5, H * 0.52]], S(12), { down: 20, up: S(11.5), what: 'cold probe to ice' });
if (parts.includes('needle')) await handShot('hand_needle', 'needle', 420, ['bodies', 'dense'], [[W * 0.28, H * 0.35], [W * 0.5, H * 0.52], [W * 0.72, H * 0.62]], S(7), { down: 40, up: S(6), what: 'needle cut' });
if (parts.includes('pipette')) {
  await lab(false);
  // drawn up: held over a colony (all in reach), then carried and set down elsewhere (shift held: dispense)
  await esc(); await bestView(260, ['bodies', 'dense']);
  await tool('pipette');
  const cs = await cellsInView(); const c = cs.sort((a, b) => Math.hypot(a.x - W * 0.35, a.y - H * 0.5) - Math.hypot(b.x - W * 0.35, b.y - H * 0.5))[0] || { x: W * 0.35, y: H * 0.5 };
  await page.mouse.move(c.x, c.y); await wait(0.5);
  await shot('hand_pipette', S(12), { pre: 30, meta: { what: 'pipette draw and set down', zoom: 260 }, each: timeline([
    [20, () => page.mouse.down()], [200, () => page.mouse.up()],
    ...glide(240, 90, [c.x, c.y], [W * 0.7, H * 0.45]),
    [350, () => page.keyboard.down('Shift')], [352, () => page.mouse.down()], ...stroke(354, 300, [[W * 0.7, H * 0.45], [W * 0.66, H * 0.55], [W * 0.72, H * 0.6]]), [660, () => page.mouse.up()], [662, () => page.keyboard.up('Shift')],
  ]) });
  await tool('none');
}
if (parts.includes('ride')) {
  await lab(false);
  // riding: a bonded species found, ridden (the camera dives in), steered with WASD around the water
  await esc();
  const serial = await T(() => {
    const T = globalThis.__tidemote, sps = [...T.life().reg.values()].filter((x) => x.alive && x.pop > 0);
    const bonded = sps.filter((x) => (x.genome.adhesion || 0) > T.eng.K.adhMin).sort((a, b) => b.pop - a.pop);
    return (bonded[0] || sps.sort((a, b) => b.pop - a.pop)[0]).serial;
  });
  await T(() => { const T = globalThis.__tidemote; T.cam.zoomTarget = 1; T.cam.zoom = 1; });
  await T((s) => globalThis.__tidemote.findMember(s), serial); await wait(2.5);
  const on = await T(() => globalThis.__tidemote.ride.state.on);
  if (on) { await page.keyboard.press('Enter'); await wait(0.5); }
  await T(() => { const T = globalThis.__tidemote; T.cam.zoomTarget = 2; T.cam.zoom = 2; }); await wait(1);
  const rb = await (await page.$('#spec-acts [data-act="ride"]'))?.boundingBox();
  await page.mouse.move(W * 0.4, H * 0.75);
  const acts = [];
  if (rb) acts.push(...glide(10, 40, [W * 0.4, H * 0.75], [rb.x + rb.width / 2, rb.y + rb.height / 2]), [52, () => page.mouse.click(rb.x + rb.width / 2, rb.y + rb.height / 2)], ...glide(60, 40, [rb.x + rb.width / 2, rb.y + rb.height / 2], [W - 40, H - 40]));
  for (const [f0, f1, k] of [[200, 330, 'KeyW'], [330, 420, 'KeyD'], [420, 560, 'KeyW'], [560, 640, 'KeyA'], [640, 760, 'KeyW']]) { acts.push([f0, () => page.keyboard.down(k)], [f1, () => page.keyboard.up(k)]); }
  await shot('ui_ride', S(14), { pre: 20, meta: { what: 'ride', move: 'follow' }, each: timeline(acts) });
  await page.keyboard.press('Enter').catch(() => {}); await esc();
}
if (parts.includes('ladder')) {
  await lab(false);
  // the speed ladder: the chip opened, the pointer down its rungs, a time-lapse picked, back to real time
  await esc(); await bestView(50, ['diverse']); await page.mouse.move(...park);
  const cb = await (await page.$('#t-speed'))?.boundingBox();
  if (cb) {
    const c = [cb.x + cb.width / 2, cb.y + cb.height / 2];
    await tapSel('#t-speed'); await wait(0.5);
    const r8 = await (await page.$('#ladder .rung[data-v="8"]'))?.boundingBox(), r1 = await (await page.$('#ladder .rung[data-v="1"]'))?.boundingBox();
    await tapSel('#t-speed'); await wait(0.5); await page.keyboard.press('Escape');
    const acts = [...glide(10, 40, park, c), [52, () => page.mouse.click(...c)]];
    if (r8) acts.push(...glide(70, 40, c, [r8.x + r8.width / 2, r8.y + r8.height / 2]), [114, () => page.mouse.click(r8.x + r8.width / 2, r8.y + r8.height / 2)]);
    acts.push(...glide(130, 40, r8 ? [r8.x + r8.width / 2, r8.y + r8.height / 2] : c, park), [400, () => page.keyboard.press('/')]);
    await shot('ui_ladder', S(9), { pre: 12, meta: { what: 'speed ladder' }, each: timeline(acts) });
    await setSpeed(1);
  }
}
await P.close();
console.log('done');
