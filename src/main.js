import { createSound } from './audio/sound.js';
import { V_SCALE } from './audio/listen.js';
import { createEngine, MAXK, FIRST_LIFE } from './engine.js';
import { genomeSerial, readGenome, parseParticle, affinity, roleShares, roleColor, unpackUnorm, CELL_SHAPES, cellShape } from './genome.js';
import { seasonAt, createClimate, abioRate } from './climate.js';
import { GLOSSARY } from './guide.js';
import { createLab } from './lab.js';
import { genusName, speciesEpithet } from './names.js';
import { facets, describe, tagsOf, DIET_COL, MOB_COL } from './facets.js';
import { traceBody, retraceBody, settleMembers, nearBody } from './trace.js';
import { PICK_WORDS } from './shaders.js';
import { tideAt, flowAt } from './flow.js';
import { Director } from './director.js';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const overlay = $('overlay');
const octx = overlay.getContext('2d');
const isCoarse = matchMedia('(pointer: coarse)').matches;
const NONE = 0xffffffff;
const TAU = Math.PI * 2;
const nf = new Intl.NumberFormat('en-US');
const fmt = (n) => nf.format(n);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;
const pad = (n) => String(n).padStart(2, '0');
const fmtClock = (s) => { s = Math.floor(s); const h = Math.floor(s / 3600); const m = Math.floor(s / 60) % 60; return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`; };
const fmtDur = (s) => (s < 60 ? `${Math.round(s)} s` : s < 3600 ? `${Math.floor(s / 60)}m ${pad(Math.floor(s % 60))}s` : `${Math.floor(s / 3600)}h ${pad(Math.floor(s / 60) % 60)}m`);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const cssCol = (u, k = 1) => { const c = unpackUnorm(u); return `rgb(${c.slice(0, 3).map((v) => Math.round(clamp(v * k, 0, 1) * 255)).join(',')})`; };
const cssRgb = (c, k = 1) => `rgb(${c.map((v) => Math.round(clamp(v * k, 0, 1) * 255)).join(',')})`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const term = (key, label) => `<span class="term" data-tip="${key}">${label}</span>`;

const MATTER = [
  { name: 'Silt', css: '#566079', blurb: 'Inert mineral grit carried on the currents. The Tide charges it into glint, and cells build their offspring out of it.' },
  { name: 'Glint', css: '#b9e6ff', blurb: 'Silt charged by the Tide: free-floating food. Its charge fades back to silt if nothing eats it.' },
  { name: 'Husk', css: '#8a6247', blurb: 'The remains of a dead cell. Scavengers feed on what energy is left; the rest crumbles back into silt.' },
  { name: 'Stone', css: '#b8ae9f', blurb: 'Bedrock, or the skeleton a calcifying cell left where it settled. Stone never drifts and the living cannot pass through it. Prey shelters in its crevices, and it slowly wears back into silt.' },
];
const CAUSE = { 0: '', 1: 'starved', 2: 'died of old age', 3: 'was consumed', 4: 'crumbled from a husk', 5: 'charged by the Tide', 6: 'faded back to silt', 7: 'wore away from stone', 8: 'sparked into life from glint', 9: 'built from silt by its parent' };
const ROLE = ['α', 'β', 'γ'];

function fail(title, detail) {
  $('nogpu-title').textContent = title;
  $('nogpu-detail').textContent = detail;
  $('nogpu').hidden = false;
  $('hud').hidden = true;
  $('intro').hidden = true;
  $('inspector').hidden = true;
}


async function boot() {
  if (!navigator.gpu) {
    fail('This browser has no WebGPU', 'Tidemote simulates its biosphere on your graphics card through WebGPU. Try a current Chrome, Edge or Safari, or Firefox on Windows.');
    return;
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) { fail('No GPU adapter available', 'WebGPU is present but no graphics adapter was offered. Hardware acceleration may be turned off in your browser settings.'); return; }
  const hasTS = adapter.features.has('timestamp-query');
  const lim = adapter.limits;
  const device = await adapter.requestDevice({
    requiredFeatures: hasTS ? ['timestamp-query'] : [],
    requiredLimits: {
      maxStorageBufferBindingSize: Math.min(lim.maxStorageBufferBindingSize, 2 ** 31 - 4),
      maxBufferSize: Math.min(lim.maxBufferSize, 2 ** 31 - 4),
      maxStorageBuffersPerShaderStage: Math.min(lim.maxStorageBuffersPerShaderStage, 10),
    },
  });
  device.lost.then((info) => { if (info.reason !== 'destroyed') fail('The GPU device was lost', `${info.message || 'The driver reset the device.'} Reload the page to start a new universe.`); });
  device.addEventListener('uncapturederror', (e) => console.error('[tidemote]', e.error.message));

  const format = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext('webgpu');
  ctx.configure({ device, format, alphaMode: 'opaque' });
  const specCtx = $('specimen').getContext('webgpu');
  specCtx.configure({ device, format, alphaMode: 'opaque' });
  let eng;
  try { eng = await createEngine(device, format, { hasTimestamps: hasTS }); }
  catch (e) { fail('The simulation failed to compile', String(e.message || e)); return; }
  run(eng, device, ctx, specCtx, hasTS);
}

// Time multipliers. Above 1× the page runs several whole 1/60 s steps per rendered frame, exactly as the
// headless runs do; below 1× it shortens the step instead. Infinity is "Max": as many steps as fit.
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4, 8, 16, 32, 64, Infinity];
const MAX_FRAME_MS = 30; // GPU time a frame may take when running fast (about 30 fps)
const fmtSpeed = (s) => (s === Infinity ? 'Max' : `×${s}`);

function run(eng, device, ctx, specCtx, hasTS) {
  const K = eng.K;
  const state = {
    phase: 'calibrating', busy: true, paused: false, speedIdx: SPEEDS.indexOf(1),
    hud: true, keys: false, follow: false, confirmReset: 0,
    loupe: !isCoarse, loupeMag: 3.5, census: innerWidth > 900, currents: false, specCells: 3,
  };
  // While a pointer is held down on a panel, nothing re-renders under it: replacing the element
  // between pointerdown and pointerup swallows the click.
  let uiHoldUntil = 0;
  const panelSel = '.panel, .plate, .lab, .inspector, .focus-chip';
  document.addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest(panelSel)) uiHoldUntil = Infinity; }, true);
  const releaseHold = () => { if (uiHoldUntil === Infinity) uiHoldUntil = performance.now() + 150; };
  document.addEventListener('pointerup', releaseHold, true);
  document.addEventListener('pointercancel', releaseHold, true);
  const uiHeld = () => performance.now() < uiHoldUntil;
  let eventsPending = false;

  const trailLevels = [0, 0.45, 0.7, 0.88];
  const trailNames = ['Trails off', 'Short trails', 'Long trails', 'Long exposure'];
  let trailIdx = 1;
  eng.settings.trails = trailLevels[trailIdx];

  // ------------------------------------------------------------ sizing
  let renderScale = 1;
  let dpr = 1;
  function fit() {
    const base = Math.min(devicePixelRatio || 1, 2);
    dpr = base * renderScale;
    const maxDim = device.limits.maxTextureDimension2D;
    canvas.width = Math.min(maxDim, Math.max(1, Math.round(innerWidth * dpr)));
    canvas.height = Math.min(maxDim, Math.max(1, Math.round(innerHeight * dpr)));
    overlay.width = Math.round(innerWidth * base);
    overlay.height = Math.round(innerHeight * base);
    eng.resize(canvas.width, canvas.height);
  }
  fit();
  addEventListener('resize', fit);

  // ------------------------------------------------------------ camera
  const cam = { x: 0, y: 0, zoom: 1, zoomTarget: 1, anchor: null };
  const fitPPU = () => Math.max(canvas.width / eng.grid[0], canvas.height / eng.grid[1]);
  const ppu = () => fitPPU() * cam.zoom;
  const cssPPU = () => ppu() / dpr;
  const MAX_PPU = 1500; // css px per world unit at full zoom
  const maxZoom = () => Math.max(1, (MAX_PPU * dpr) / fitPPU());
  const toWorld = (sx, sy) => { const p = ppu(); return [cam.x + (sx * dpr - canvas.width / 2) / p, cam.y + (sy * dpr - canvas.height / 2) / p]; };
  const wrapD = (d, W) => d - W * Math.round(d / W);
  function toScreen(wx, wy) {
    const p = cssPPU();
    return [innerWidth / 2 + wrapD(wx - cam.x, eng.grid[0]) * p, innerHeight / 2 + wrapD(wy - cam.y, eng.grid[1]) * p];
  }
  function wrapCam() { const [W, H] = eng.grid; cam.x = ((cam.x % W) + W) % W; cam.y = ((cam.y % H) + H) % H; }
  function zoomAt(factor, sx, sy) {
    cam.zoomTarget = clamp(cam.zoomTarget * factor, 1, maxZoom());
    cam.anchor = [sx, sy];
  }

  // ------------------------------------------------------------ loupe
  const hover = { x: 0, y: 0, on: false };
  function loupeGeom() {
    if (!state.loupe || !hover.on || ptr.dragging || state.phase !== 'running' || director.active) return null;
    const base = cssPPU();
    // the loupe magnifies until the view itself is as close as the old zoom limit allowed (40 of 220 px per unit)
    if (base >= 40 * MAX_PPU / 220) return null;
    const R = Math.round(clamp(Math.min(innerWidth, innerHeight) * 0.2, 90, 170));
    const lp = clamp(base * state.loupeMag, 8, MAX_PPU);
    const [cx, cy] = toWorld(hover.x, hover.y);
    return { sx: hover.x, sy: hover.y, R, cssPPU: lp, cx, cy };
  }

  // ------------------------------------------------------------ perf
  const perf = { samples: [], gpu: 0, fps: 0, frames: 0, fpsT: performance.now(), rafDt: [], goodWindows: 0, lastAdjust: performance.now(),
    stepMs: 0, rate: 1, rateT: performance.now(), rateSim: 0 };
  let calibWait = null;
  const frameWaiters = [];
  eng.onGpuTime = (ms, n, steps) => {
    // Per-step cost, render included (an overestimate that shrinks as more steps share one render).
    if (steps > 0) perf.stepMs = perf.stepMs ? perf.stepMs * 0.85 + (ms / steps) * 0.15 : ms / steps;
    perf.gpu = perf.gpu ? perf.gpu * 0.9 + ms * 0.1 : ms;
    perf.samples.push(ms);
    if (perf.samples.length > 240) perf.samples.shift();
    if (calibWait && perf.samples.length >= calibWait.need) { const w = calibWait; calibWait = null; w.res(median(perf.samples)); }
  };
  const waitFrames = (n) => new Promise((res) => frameWaiters.push({ n, res }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function measure(need = 36, warm = 16) {
    await Promise.race([waitFrames(warm), sleep(2500)]);
    perf.samples.length = 0;
    return new Promise((res) => {
      calibWait = { need, res };
      setTimeout(() => {
        if (!calibWait) return;
        const w = calibWait;
        calibWait = null;
        w.res(perf.samples.length ? median(perf.samples) : 1000);
      }, 4500);
    });
  }

  // ------------------------------------------------------------ climate eras
  let climate;
  function resetClimate() {
    climate = createClimate(eng);
    climate.onEra = (era, prevAmb) => {
      const lightWord = era.ambient > prevAmb + 0.05 ? 'light rises' : era.ambient < prevAmb - 0.05 ? 'light dims' : 'light holds';
      pushEvent(`A new era: <b>${esc(climate.name)}</b> · ${lightWord} to ${Math.round(era.ambient * 100)}% · glint ×${era.charge.toFixed(1)} · currents shift`, 0xffd6c7ff, 'era');
      flash(climate.name);
      sound.era(climate.name);
    };
  }

  // ------------------------------------------------------------ world + life bookkeeping
  let life;
  function resetLife() {
    life = {
      reg: new Map(), genera: new Map(), orphan: new Map(), chronicle: [], history: [], histEvery: 3, lastHist: -1e9,
      counts: [0, 0, 0, 0, 0], roles: [0, 0, 0], alive: 0, thriving: 0, arisen: 0, maxDepth: 0, top: 0, lastCensus: null, matter: [],
      estThreshold: 30, births: 0, prevG: null, prevT: 0,
    };
    renderEvents();
  }
  resetLife();

  function seedWorld(n) {
    eng.seed(n, { aspect: innerWidth / Math.max(1, innerHeight) });
    const g = eng.grid;
    cam.x = g[0] / 2; cam.y = g[1] / 2; cam.zoom = cam.zoomTarget = 1; cam.anchor = null;
    resetDirector();
    resetLife();
    resetClimate();
    sound.reset();
    life.estThreshold = Math.max(30, Math.round(n * 0.00025));
    deselect();
    clearFocus();
  }

  async function allocDown(n) {
    state.busy = true;
    await device.queue.onSubmittedWorkDone();
    n = Math.max(16384, Math.floor(n / 4096) * 4096);
    while (n >= 16384) {
      if (await eng.allocate(n)) return n;
      n = Math.floor((n * 0.75) / 4096) * 4096;
    }
    throw new Error('Could not allocate particle memory on this GPU.');
  }

  const calText = $('calib');
  async function calibrate() {
    const lim = device.limits;
    const hardCap = Math.floor(Math.min(lim.maxStorageBufferBindingSize, lim.maxBufferSize) / 40 / 4096) * 4096;
    const maxN = Math.min(hardCap, 4194304, Math.floor(262144 * K.density * 0.95), window.__MC_MAX || Infinity);
    const target = hasTS ? 7.5 : 9;
    const clampN = (x) => clamp(Math.round(x / 4096) * 4096, Math.min(32768, maxN), maxN);
    let n = await allocDown(Math.min(isCoarse ? 131072 : 262144, maxN));
    seedWorld(n);
    state.busy = false;
    calText.textContent = `Sounding your GPU with ${fmt(n)} particles`;
    let t = await measure();
    let next = clampN((n * target) / t);
    if (next > n * 1.2) {
      next = await allocDown(next);
      seedWorld(next);
      state.busy = false;
      calText.textContent = `Trying ${fmt(next)} particles`;
      const t2 = await measure();
      n = next;
      t = t2;
      next = clampN((n * target) / t);
      if (next > n) next = Math.min(next, clampN(n * 1.3));
    }
    const final = next === n ? n : await allocDown(next);
    seedWorld(final);
    state.busy = false;
    calText.textContent = `Universe fixed at ${fmt(final)} particles`;
    return final;
  }

  function groups() {
    const out = { diet: {}, mobility: {}, body: {}, types: {} };
    for (const sp of life.reg.values()) {
      if (!sp.alive) continue;
      const f = facets(sp.genome, K);
      out.diet[f.diet] = (out.diet[f.diet] || 0) + sp.pop;
      out.mobility[f.mobility] = (out.mobility[f.mobility] || 0) + sp.pop;
      out.body[f.body] = (out.body[f.body] || 0) + sp.pop;
      out.types[f.types] = (out.types[f.types] || 0) + sp.pop;
    }
    return {
      diet: Object.keys(DIET_COL).map((k) => ({ name: k, n: out.diet[k] || 0, col: DIET_COL[k] })),
      mobility: Object.keys(MOB_COL).map((k) => ({ name: k, n: out.mobility[k] || 0, col: MOB_COL[k] })),
      body: [{ name: 'multicellular', n: out.body.multicellular || 0, col: '#ffb45e' }, { name: 'single-celled', n: out.body['single-celled'] || 0, col: '#9aa3b8' }],
      types: ['1', '2', '3'].map((k, i) => ({ name: k, n: out.types[k] || 0, col: ['#9aa3b8', '#b38cff', '#5fd4c4'][i] })),
    };
  }
  const spLink = (serial, name) => `<a href="#" class="sp" data-serial="${serial}">${esc(name)}</a>`;

  // ------------------------------------------------------------ focus (dim everything outside a filter)
  const focus = { key: null, label: '', pred: null, roleMask: 7, stateMode: 0, matter: [false, false, false, false] };
  let members = null;
  let memberKind = NONE;
  function pushFocus() {
    let kinds = null;
    if (focus.key) {
      kinds = new Uint32Array(MAXK / 32);
      for (let m = 0; m < 4; m++) if (focus.matter[m]) kinds[0] |= 1 << m;
      const c = life.lastCensus;
      if (c && focus.pred) {
        for (let s = FIRST_LIFE; s < MAXK; s++) {
          if (!c.pop[s]) continue;
          const sp = life.reg.get(genomeSerial(c.genomeU32, s));
          const g = sp ? sp.genome : readGenome(c.genomeU32, c.genomeF32, s);
          if (g.serial && focus.pred(g, sp)) kinds[s >> 5] |= (1 << (s & 31)) >>> 0;
        }
      }
    }
    eng.setFocus({ kinds, roleMask: focus.roleMask, stateMode: focus.stateMode, mute: 0.045, members, memberKind });
    $('focus-chip').hidden = !focus.key;
    $('focus-label').textContent = focus.label;
  }
  function setFocus(key, label, { pred = null, roleMask = 7, stateMode = 0, matter = [false, false, false] } = {}) {
    Object.assign(focus, { key, label, pred, roleMask, stateMode, matter });
    pushFocus();
    lab.render(true);
  }
  function clearFocus() {
    if (!focus.key) return;
    focus.key = null; focus.pred = null;
    pushFocus();
    if (typeof lab !== 'undefined') lab.render(true);
  }
  $('focus-clear').addEventListener('click', clearFocus);
  const allLiving = () => true;
  function focusFacet(key) {
    if (focus.key === key) { clearFocus(); return; }
    const [kind, val] = key.split(':');
    if (kind === 'class') {
      if (val === 'living') setFocus(key, 'All living cells', { pred: allLiving });
      else setFocus(key, MATTER[{ silt: 0, glint: 1, husk: 2, stone: 3 }[val]].name, { matter: [val === 'silt', val === 'glint', val === 'husk', val === 'stone'] });
    } else if (kind === 'role') setFocus(key, `${ROLE[+val]}-cells`, { pred: allLiving, roleMask: 1 << +val });
    else if (kind === 'state') setFocus(key, ['', 'Hungry cells', 'Cells ready to divide', 'Elderly cells'][+val], { pred: allLiving, stateMode: +val });
    else if (kind === 'diet') setFocus(key, `Diet: ${val}`, { pred: (g) => facets(g, K).diet === val });
    else if (kind === 'mobility') setFocus(key, `Mobility: ${val}`, { pred: (g) => facets(g, K).mobility === val });
    else if (kind === 'body') setFocus(key, val === 'multicellular' ? 'Multicellular species' : 'Single-celled species', { pred: (g) => facets(g, K).body === val });
    else if (kind === 'types') setFocus(key, `${val} cell type${val === '1' ? '' : 's'}`, { pred: (g) => String(facets(g, K).types) === val });
  }
  function focusSpecies(sp) {
    const key = `sp:${sp.serial}`;
    if (focus.key !== key) setFocus(key, sp.name, { pred: (g) => g.serial === sp.serial });
  }
  function setMembers(ids, kind) {
    members = ids && ids.length ? ids : null;
    memberKind = members ? kind : NONE;
    pushFocus();
  }

  // ------------------------------------------------------------ census → registry, events, history
  function gdist(a, b) {
    let s = 0;
    for (let r = 0; r < 3; r++) for (let i = 0; i < 8; i++) s += (a.roles[r].surf[i] - b.roles[r].surf[i]) ** 2 + (a.roles[r].rec[i] - b.roles[r].rec[i]) ** 2;
    let d = Math.sqrt(s / 48);
    d += 0.5 * (Math.abs(a.dGlint - b.dGlint) + Math.abs(a.dHusk - b.dHusk) + Math.abs(a.dFlesh - b.dFlesh));
    d += 0.4 * Math.abs(a.photo - b.photo) + 0.15 * Math.abs(a.swim - b.swim) + 0.3 * Math.abs((a.adhesion || 0) - (b.adhesion || 0));
    const dh = Math.abs(a.hue - b.hue);
    return d + Math.min(dh, 1 - dh);
  }
  function newGenus(g, from) {
    const name = genusName(g.serial, life.genera);
    life.genera.set(name, { name, founder: g, from, born: g.born, announced: false });
    return name;
  }
  function register(g) {
    let genus;
    const parent = life.reg.get(g.parent);
    if (parent) {
      const gen = life.genera.get(parent.genus);
      genus = gen && gdist(g, gen.founder) < 0.5 ? parent.genus : null;
      if (!genus) genus = newGenus(g, parent.genus);
    } else if (g.parent === 0) {
      genus = newGenus(g, null);
    } else {
      const key = g.parent;
      if (!life.orphan.has(key)) life.orphan.set(key, newGenus(g, null));
      genus = life.orphan.get(key);
    }
    const epithet = speciesEpithet(g.serial);
    const sp = {
      serial: g.serial, slot: g.slot, genome: g, genus, name: `${genus} ${epithet}`,
      parent: g.parent, parentName: parent ? parent.name : null, born: g.born,
      ancestor: parent ? (parent.established ? parent.serial : parent.ancestor) : null,
      pop: 0, peak: 0, alive: true, established: false, extinct: null, founder: g.parent === 0,
    };
    life.reg.set(g.serial, sp);
    return sp;
  }
  function originWord(sp) {
    return sp.serial > eng.founders ? 'sparked from glint' : 'a founding lineage';
  }
  function pushEvent(html, col, type = 'misc') {
    const text = html.replace(/<[^>]+>/g, '');
    life.chronicle.unshift({ t: eng.simTime, html, text, col, type });
    if (life.chronicle.length > 3000) life.chronicle.length = 3000;
    renderEvents();
  }

  // ------------------------------------------------------------ soundtrack
  const sound = createSound({
    onChange: renderSound,
    onError: (m) => flash(`Sound unavailable: ${String(m).split('\n')[0].slice(0, 80)}`),
  });
  let litSlots = null;
  function renderSound() {
    // the GPU only listens while the soundtrack plays
    if (sound.on && !eng.listen) eng.listen = { every: 6, keep: null, vscale: V_SCALE };
    else if (!sound.on) eng.listen = null;
    const b = $('snd'), v = $('vol');
    b.setAttribute('aria-pressed', String(sound.on));
    v.hidden = !sound.on;
    v.value = String(Math.round(sound.volume * 100));
  }
  function feedSound(pop, species) {
    if (!sound.on) return;
    litSlots = focus.key && focus.pred ? species.filter(([, g]) => focus.pred(g)).map(([s]) => s) : null;
    let ampSum = 0;
    for (let k = 0; k < 4; k++) ampSum += eng.tide[k * 4 + 3];
    const tide = eng.season * Math.min(1, ampSum / 3);
    sound.census({ species, pop, world: { light: Math.min(1.2, eng.ambient * 1.2 + 0.85 * tide), tide } });
  }
  eng.onListen = (d) => {
    if (state.phase !== 'running') return;
    const selSlot = sel && sel.particle && sel.particle.kind >= FIRST_LIFE && !sel.lost ? sel.particle.kind : -1;
    const keep = sound.listen(d, { selSlot, lit: litSlots });
    if (keep && eng.listen) { eng.listen.keep = keep; eng.listen.selKind = selSlot >= 0 ? selSlot : 0xffffffff; }
  };
  function toggleSound() {
    sound.toggle().then(() => flash(sound.on ? 'Sound on' : 'Sound off'));
  }
  function nudgeVolume(d) {
    if (!sound.on) { toggleSound(); return; }
    sound.setVolume(sound.volume + d);
    flash(`Volume ${Math.round(sound.volume * 100)}%`);
  }

  eng.onCensus = (c) => {
    if (state.phase !== 'running') return;
    life.lastCensus = c;
    const pop = c.pop;
    const t = c.simTime;
    life.counts = [pop[0], pop[1], pop[2], 0, pop[3]];
    life.roles = [c.globals[12], c.globals[13], c.globals[14]];
    life.matter = [0, 1, 2, 3].map((s) => readGenome(c.genomeU32, c.genomeF32, s));
    life.arisen = c.globals[1];
    life.births = c.globals[2];
    const seen = new Set();
    const audio = []; // [slot, genome] of every living species, for the soundtrack
    let living = 0, alive = 0, best = null;
    for (let s = FIRST_LIFE; s < MAXK; s++) {
      const p = pop[s];
      if (!p) continue;
      living += p;
      alive++;
      let sp = life.reg.get(genomeSerial(c.genomeU32, s));
      const g = sp ? sp.genome : readGenome(c.genomeU32, c.genomeF32, s);
      if (!sp) sp = register(g);
      audio.push([s, g]);
      sp.slot = s;
      sp.genome = g;
      sp.pop = p;
      sp.alive = true;
      if (p > sp.peak) sp.peak = p;
      seen.add(g.serial);
      if (g.depth > life.maxDepth) life.maxDepth = g.depth;
      if (!sp.established && sp.peak >= life.estThreshold) {
        sp.established = true;
        sp.establishedAt = t;
        const gen = life.genera.get(sp.genus);
        if (t > 20) {
          if (gen && gen.from && !gen.announced) {
            gen.announced = true;
            pushEvent(`New genus <b>${esc(gen.name)}</b> splits from ${esc(gen.from)}: ${spLink(sp.serial, sp.name)} · ${describe(g, K)}`, g.col, 'genus');
          } else {
            const anc = sp.ancestor && life.reg.get(sp.ancestor);
            const origin = sp.founder ? originWord(sp) : anc ? `from ${spLink(anc.serial, anc.name)}` : 'from an unrecorded ancestor';
            pushEvent(`${spLink(sp.serial, sp.name)} established · ${describe(g, K)} · ${origin}`, g.col, 'est');
          }
        }
        if (gen) gen.announced = true;
        if (t > 20) director.spotlight(s, g.serial);
      }
      if (sp.established && (!best || p > best.pop)) best = sp;
    }
    life.counts[3] = living;
    life.alive = alive;
    for (const sp of life.reg.values()) {
      if (sp.alive && !seen.has(sp.serial)) {
        sp.alive = false;
        sp.pop = 0;
        if (sp.established) {
          sp.extinct = t;
          if (sp.peak >= life.estThreshold * 3) pushEvent(`${spLink(sp.serial, sp.name)} extinct after ${fmtDur(t - (sp.born || 0))} · peak ${fmt(sp.peak)}`, sp.genome.col, 'ext');
        } else {
          life.reg.delete(sp.serial);
        }
      }
    }
    let thriving = 0;
    let H = 0;
    for (const sp of life.reg.values()) {
      if (!sp.alive) continue;
      if (sp.established) thriving++;
      const q = sp.pop / Math.max(1, living);
      if (q > 0) H -= q * Math.log(q);
    }
    life.thriving = thriving;
    if (best && best.serial !== life.top) {
      const prev = life.reg.get(life.top);
      if (!prev || !prev.alive || best.pop > prev.pop * 1.25) {
        if (prev && t > 30) pushEvent(`${spLink(best.serial, best.name)} is now the most numerous · ${fmt(best.pop)} cells`, best.genome.col, 'top');
        life.top = best.serial;
      }
    }
    eng.abio = abioRate(pop[1]);
    feedSound(pop, audio);

    if (t - life.lastHist >= life.histEvery) {
      const G = Array.from(c.globals);
      const rate = (i) => (life.prevG && t > life.prevT ? ((G[i] - life.prevG[i]) / (t - life.prevT)) * 60 : 0);
      const sp = [];
      for (const s of life.reg.values()) if (s.alive && s.established) sp.push([s.serial, s.pop]);
      life.history.push({
        t, silt: pop[0], glint: pop[1], husk: pop[2], living, sp,
        alive, thriving, diversity: Math.exp(H),
        births: rate(2), starve: rate(5), old: rate(6), eaten: rate(7), graze: rate(9), scav: rate(10), prey: rate(7), bite: rate(11),
        mut: rate(3), ext: rate(8), ambient: eng.ambient, season: eng.season,
      });
      life.prevG = G;
      life.prevT = t;
      life.lastHist = t;
      if (life.history.length > 480) { life.history = life.history.filter((_, i) => i % 2 === 0); life.histEvery *= 2; }
      if (state.census) drawChart();
    }
    if (focus.key && focus.pred) pushFocus();
    renderCensus();
    lab.render(false);
    if (sel || spView) dirty = true;
  };

  // ------------------------------------------------------------ census panel
  const classRows = $('classes');
  function renderCensus() {
    const N = Math.max(1, eng.count);
    const [silt, glint, husk, living, stone] = life.counts;
    const rows = [
      ['Living', living, 'var(--warm)', 'living', 'class:living'],
      ['Glint', glint, MATTER[1].css, 'glint', 'class:glint'],
      ['Husk', husk, MATTER[2].css, 'husk', 'class:husk'],
      ['Stone', stone, MATTER[3].css, 'stone', 'class:stone'],
      ['Silt', silt, MATTER[0].css, 'silt', 'class:silt'],
    ];
    if (!classRows.firstChild) {
      classRows.innerHTML = rows.map(([label, , col, tip, key]) => `<button type="button" class="crow" data-focus="${key}" title="Highlight ${label.toLowerCase()}"><i style="background:${col}"></i>${term(tip, label)}<b></b><em></em></button>`).join('');
    }
    rows.forEach(([, v, , , key], i) => {
      const b = classRows.children[i];
      b.classList.toggle('on', focus.key === key);
      b.children[2].textContent = fmt(v);
      b.children[3].textContent = `${((v / N) * 100).toFixed(1)}%`;
    });
    $('species').textContent = fmt(life.alive);
    $('arisen').textContent = fmt(life.arisen);
    $('depth').textContent = fmt(life.maxDepth);
    $('established').textContent = fmt(life.thriving);
    $('sum-living').textContent = `${fmt(living)} living`;
    $('sum-thriving').textContent = `${fmt(life.thriving)} thriving`;
  }
  classRows.addEventListener('click', (e) => { const b = e.target.closest('[data-focus]'); if (b) { focusFacet(b.dataset.focus); renderCensus(); } });

  const chart = $('chart');
  const cctx = chart.getContext('2d');
  function drawChart() {
    const r = Math.min(devicePixelRatio || 1, 2);
    const w = chart.clientWidth || 260, h = chart.clientHeight || 56;
    if (!w) return;
    if (chart.width !== Math.round(w * r)) { chart.width = Math.round(w * r); chart.height = Math.round(h * r); }
    cctx.setTransform(r, 0, 0, r, 0, 0);
    cctx.clearRect(0, 0, w, h);
    const hist = life.history;
    if (hist.length < 2) return;
    const N = Math.max(1, eng.count);
    const bySerial = new Map(); // serial -> { vals: population at each sample, a, b: the samples it spans }
    hist.forEach((s, i) => {
      for (const [k, p] of s.sp) {
        let e = bySerial.get(k);
        if (!e) bySerial.set(k, (e = { vals: new Float32Array(hist.length), a: i, b: i }));
        e.vals[i] = p; e.b = i;
      }
    });
    const order = [...bySerial.keys()].sort((a, b) => a - b);
    const x = (i) => (i / (hist.length - 1)) * w;
    const base = new Float32Array(hist.length);
    // a band over samples a..b (it is zero elsewhere)
    const band = (vals, fill, a = 0, b = hist.length - 1) => {
      cctx.beginPath();
      for (let i = a; i <= b; i++) cctx.lineTo(x(i), h - ((base[i] + vals[i]) / N) * h);
      for (let i = b; i >= a; i--) cctx.lineTo(x(i), h - (base[i] / N) * h);
      cctx.closePath();
      cctx.fillStyle = fill;
      cctx.fill();
      for (let i = a; i <= b; i++) base[i] += vals[i];
    };
    band(hist.map((s) => s.silt), 'rgba(86,96,121,0.35)');
    band(hist.map((s) => s.husk), 'rgba(138,98,71,0.6)');
    band(hist.map((s) => s.glint), 'rgba(185,230,255,0.45)');
    for (const serial of order) {
      const sp = life.reg.get(serial), e = bySerial.get(serial);
      band(e.vals, sp ? cssCol(sp.genome.col) : 'rgba(255,200,140,0.8)', Math.max(0, e.a - 1), Math.min(hist.length - 1, e.b + 1));
    }
    band(hist.map((s) => Math.max(0, s.living - s.sp.reduce((a, q) => a + q[1], 0))), 'rgba(255,220,190,0.35)');
    $('histspan').textContent = fmtDur(hist[hist.length - 1].t - hist[0].t);
  }

  function renderEvents() {
    if (uiHeld()) { eventsPending = true; return; }
    eventsPending = false;
    const el = $('events');
    if (!life || !life.chronicle.length) { el.innerHTML = '<li class="quiet">Events appear as species rise and fall.</li>'; return; }
    el.innerHTML = life.chronicle.slice(0, 80).map((e) => `<li><i style="background:${cssCol(e.col)}"></i><time>${fmtClock(e.t)}</time><span>${e.html}</span></li>`).join('');
  }
  function renderCensusOpen() {
    $('census').classList.toggle('closed', !state.census);
    $('census-toggle').setAttribute('aria-expanded', String(state.census));
    if (state.census) drawChart();
  }
  $('census-toggle').addEventListener('click', () => { state.census = !state.census; renderCensusOpen(); });
  $('events-expand').addEventListener('click', () => lab.open('chronicle'));
  renderCensusOpen();

  // ------------------------------------------------------------ inspector state
  let sel = null;
  let spView = null;
  let dirty = false;
  let lastRender = 0;
  let lastHtml = '';
  const ins = $('inspector');
  const insBody = $('ins-body');
  function deselect() {
    sel = null;
    spView = null;
    eng.trackId = NONE;
    state.follow = false;
    ins.hidden = true;
    ins.classList.remove('species-mode');
    lastHtml = '';
    $('ins-follow').setAttribute('aria-pressed', 'false');
    setMembers(null);
  }
  $('ins-close').addEventListener('click', deselect);
  $('ins-follow').addEventListener('click', () => toggleFollow());
  function toggleFollow() {
    if (!sel) return;
    state.follow = !state.follow;
    if (state.follow) takeOver();
    $('ins-follow').setAttribute('aria-pressed', String(state.follow));
    flash(state.follow ? 'Following' : 'Stopped following');
  }
  function story(text) {
    if (!sel) return;
    sel.story.unshift({ t: eng.simTime, text });
    if (sel.story.length > 14) sel.story.length = 14;
    dirty = true;
  }

  function genomeFor(kind) {
    const c = life.lastCensus;
    if (!c) return null;
    if (kind < FIRST_LIFE) return life.matter[kind] || null;
    const sp = life.reg.get(genomeSerial(c.genomeU32, kind));
    const g = sp ? sp.genome : readGenome(c.genomeU32, c.genomeF32, kind);
    return g.serial ? g : null;
  }

  async function selectAt(sx, sy, pxPerWorld, world) {
    if (state.phase !== 'running') return;
    const [wx, wy] = world || toWorld(sx, sy);
    const p = pxPerWorld || cssPPU();
    const radius = Math.max(3, 40 / p);
    const res = await eng.requestPick([wx, wy], radius, NONE);
    if (!res) return;
    const [W, H] = eng.grid;
    let bestLife = null, bl = Infinity, bestAny = null, ba = Infinity;
    for (const e of res.entries) {
      const d = Math.hypot(wrapD(e.x - wx, W) * p, wrapD(e.y - wy, H) * p);
      if (e.kind >= FIRST_LIFE && d < bl) { bl = d; bestLife = e; }
      if (d < ba) { ba = d; bestAny = e; }
    }
    // a click anywhere on a cell's body counts, however far in the view is zoomed
    // a stone grain is a cobble ~0.17 across (vsStone); other matter is a small chip
    const anyR = bestAny && bestAny.kind === 3 ? 0.17 : 0.05;
    const chosen = bestLife && bl < Math.max(22, 0.2 * p) ? bestLife : bestAny && ba < Math.max(14, anyR * p) ? bestAny : null;
    if (!chosen) { deselect(); return; }
    beginTracking(chosen, res);
    if (state.keys) { state.keys = false; renderKeys(); }
  }

  function beginTracking(p, res, keepStory) {
    const oldStory = keepStory && sel ? sel.story : [];
    spView = null;
    ins.classList.remove('species-mode');
    sel = { id: p.id, particle: p, sampleT: res.simTime ?? eng.simTime, nbr: res, disp: [p.x, p.y], lost: false, story: oldStory, memory: null, org: null, orgFirst: null, orgNear: null, members: null, rehome: null, diedAt: null, lastOrg: -1e9, lastNbr: -1e9 };
    eng.trackId = p.id;
    ins.hidden = false;
    lastHtml = '';
    setMembers(null);
    if (p.kind >= FIRST_LIFE) {
      const g = genomeFor(p.kind);
      const sp = g ? life.reg.get(g.serial) : null;
      sel.org = { cells: 1, roles: [0, 0, 0].map((_, i) => (i === p.role ? 1 : 0)), span: 0, speed: Math.hypot(p.vx, p.vy), meanE: p.energy, partial: false, touching: 0, pending: true };
      remember();
      story(`${keepStory ? 'Now watching' : 'Observed'} a ${ROLE[p.role]}-cell${sp ? ` of ${spLink(sp.serial, sp.name)}` : ''}, age ${fmtDur(p.age)}.`);
    } else {
      story(`Observed a grain of ${MATTER[p.kind].name.toLowerCase()}.`);
    }
    gatherTick(true);
    renderInspector(true);
  }

  function speciesSnapshot(g) {
    const sp = g ? life.reg.get(g.serial) : null;
    return sp ? { name: sp.name, genus: sp.genus, parentName: sp.parentName, founder: sp.founder, born: sp.born, serial: sp.serial, ancestor: sp.ancestor } : null;
  }
  function remember() {
    if (!sel || !sel.particle || sel.particle.kind < FIRST_LIFE) return;
    const g = genomeFor(sel.particle.kind);
    if (!g) return;
    sel.memory = { p: sel.particle, g, sp: speciesSnapshot(g), serial: g.serial, kind: sel.particle.kind, role: sel.particle.role, t: eng.simTime, org: sel.org };
  }

  function followRelative() {
    if (!sel || !sel.nbr || !sel.memory) return;
    const [W, H] = eng.grid;
    const me = sel.particle;
    let best = null, bd = Infinity;
    for (const e of sel.nbr.entries) {
      if (e.kind !== sel.memory.kind || e.id === sel.id) continue;
      const d = Math.hypot(wrapD(e.x - me.x, W), wrapD(e.y - me.y, H));
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) { flash('No surviving relatives nearby'); return; }
    beginTracking(best, sel.nbr, true);
  }

  function transitionText(a, b) {
    if (a.kind >= FIRST_LIFE && b.kind === 2) return `Died: ${b.cause === 2 ? 'old age' : b.cause === 3 ? 'killed by a hunter or grazed away' : 'starved'} at age ${fmtDur(a.age)}. Its body is now a husk.`;
    if (a.kind >= FIRST_LIFE && b.kind === 0) return 'Was eaten. What remained is silt.';
    if (a.kind >= FIRST_LIFE && b.kind >= FIRST_LIFE) return 'Changed species.';
    if (a.kind >= FIRST_LIFE && b.kind === 3) return `Died: ${b.cause === 2 ? 'old age' : 'starved'} at age ${fmtDur(a.age)}. Its skeleton is now stone.`;
    if (a.kind === 3 && b.kind === 0) return 'The stone wore away into silt.';
    if (a.kind === 2 && b.kind === 0) return b.cause === 3 ? 'The husk was eaten by a scavenger.' : 'The husk crumbled into silt.';
    if (a.kind === 0 && b.kind === 1) return 'Charged into glint by the Tide.';
    if (a.kind === 1 && b.kind === 0) return b.cause === 3 ? 'The glint was eaten by a cell.' : 'The glint faded back into silt.';
    return `Became ${b.kind < FIRST_LIFE ? MATTER[b.kind].name.toLowerCase() : 'a living cell'}.`;
  }

  function applySample(cur, t) {
    if (!sel || t < sel.sampleT) return;
    // The watched cell died inside a body: keep its last living sample until the next trace
    // moves the watch to another cell of the body (or finds none left).
    if (sel.rehome) return;
    const prev = sel.particle;
    if (prev.kind !== cur.kind) {
      if (prev.kind >= FIRST_LIFE && cur.kind < FIRST_LIFE && sel.members && sel.members.size > 1) {
        sel.rehome = { cell: cur, t };
        sel.members.delete(sel.id);
        sel.lastOrg = -1e9;
        dirty = true;
        return;
      }
      story(transitionText(prev, cur));
      if (prev.kind >= FIRST_LIFE && cur.kind < FIRST_LIFE) { sel.diedAt = t; setMembers(null); }
    } else if (cur.kind >= FIRST_LIFE && prev.energy - cur.energy > 0.2 && cur.energy < prev.energy * 0.8 && cur.age >= prev.age) {
      story(`Divided, passing ${Math.round((1 - cur.energy / prev.energy) * 100)}% of its energy to a child.`);
    }
    sel.particle = cur;
    sel.sampleT = t;
    if (cur.kind >= FIRST_LIFE && sel.memory) sel.memory.p = cur;
    dirty = true;
  }

  eng.onTrack = (r) => {
    if (director.active && r.id === director.trackId) director.onTrack(r);
    if (!sel || r.id !== sel.id || sel.lost) return;
    if (!r.found) {
      sel.lost = true;
      eng.trackId = NONE;
      setMembers(null);
      story(sel.particle && sel.particle.kind === 0 ? 'Built into a new cell by a parent nearby. Lost track.' : 'Lost track.');
      return;
    }
    applySample(r.tracked, r.simTime);
  };

  // ------------------------------------------------------------ organism tracing
  // One GPU pass copies every cell of the selected species and its bond partner IDs.
  // On the CPU a BFS traces the body through those bonds, treating either direction as a connection.
  let gatherBusy = false;
  function gatherTick(force) {
    if (!sel || sel.lost || gatherBusy || state.phase !== 'running') return;
    const now = performance.now();
    const p = sel.particle;
    const id = sel.id;
    const g = p.kind >= FIRST_LIFE ? genomeFor(p.kind) : null;
    const multi = g && (g.adhesion || 0) > K.adhMin;
    const o = sel.org;
    const orgEvery = o && o.cells > 20000 ? 2000 : 1000;
    if (multi && (force || now - sel.lastOrg > orgEvery)) {
      gatherBusy = true;
      sel.lastOrg = now;
      const pop = (life.lastCensus && life.lastCensus.pop[p.kind]) || 4096;
      const [W, H] = eng.grid;
      // Once the body is known, gather only around it, with room for growth and drift since the
      // last trace; a species too numerous for one readback is then still traced whole.
      let center = [W / 2, H / 2], radius = Math.hypot(W, H);
      if (o && o.mid) {
        const r = o.span * 0.75 + 6 + o.speed * orgEvery * 0.003;
        if (r * 2 < Math.min(W, H)) { center = o.mid; radius = r; }
      }
      eng.requestPick(center, radius, id, { kind: p.kind, maxOut: pop * 1.25 + 2048, raw: true }).then((res) => {
        gatherBusy = false;
        if (!res || !sel || sel.id !== id) return;
        if (res.found) applySample(res.tracked, res.simTime);
        if (sel.particle.kind !== p.kind) return;
        traceOrganism(res);
      });
    } else if (now - sel.lastNbr > 1000 || force) {
      gatherBusy = true;
      sel.lastNbr = now;
      eng.requestPick([sel.disp[0], sel.disp[1]], 2.5, id, { maxOut: 4096 }).then((res) => {
        gatherBusy = false;
        if (!res || !sel || sel.id !== id) return;
        if (res.found) applySample(res.tracked, res.simTime);
        sel.nbr = res;
        if (!multi && sel.particle.kind >= FIRST_LIFE) {
          sel.org = { cells: 1, roles: [0, 1, 2].map((i) => (i === sel.particle.role ? 1 : 0)), span: 0, speed: Math.hypot(sel.particle.vx, sel.particle.vy), meanE: sel.particle.energy, partial: false, touching: touchingCount([sel.particle]) };
          remember();
        } else if (sel.org) sel.org.touching = touchingCount(sel.orgNear || [sel.particle]);
        dirty = true;
      });
    }
  }

  function touchingCount(cells) {
    if (!sel.nbr || !cells.length) return 0;
    const [W, H] = eng.grid;
    const LR = K.linkR;
    const kind = sel.particle.kind;
    const others = new Set();
    const near = sel.nbr.entries.filter((e) => e.kind >= FIRST_LIFE && e.kind !== kind);
    for (const o of near) {
      for (const c of cells) {
        if (Math.hypot(wrapD(o.x - c.x, W), wrapD(o.y - c.y, H)) < LR) { others.add(o.kind); break; }
      }
    }
    return others.size;
  }

  // The body is followed as a whole: its members persist across traces (settleMembers), the
  // watch moves to another member when the watched cell dies or drifts out, and a split follows
  // the larger part.
  const ORG_GRACE = 3;
  function traceOrganism(res) {
    const t0 = performance.now();
    const [W, H] = eng.grid;
    const { u32, f32, count: n } = res.raw;
    const tb = retraceBody(u32, f32, n, sel.members, sel.id);
    if (!tb) {
      if (sel.rehome) organismGone();
      else { sel.org = { ...(sel.org || {}), pending: true }; dirty = true; }
      return;
    }
    const { body, X, Y, index } = tb;
    const idAt = (i) => u32[i * PICK_WORDS + 7];
    const loose = [];
    if (sel.members) for (const id of sel.members.keys()) { const i = index.get(id); if (i !== undefined) loose.push(i); }
    const touching = new Set([...nearBody(X, Y, body, loose, K.linkR * K.bondBreak, W, H)].map(idAt));
    const members = settleMembers(sel.members || new Map(), body.map(idAt), res.truncated ? null : index, ORG_GRACE, touching);
    sel.members = members;
    const cells = [];
    for (const id of members.keys()) { const i = index.get(id); if (i !== undefined) cells.push(i); }
    // body statistics, measured relative to one cell so wrap-around bodies stay whole
    const ai = index.get(sel.id);
    const rx = ai !== undefined ? X[ai] : sel.particle.x, ry = ai !== undefined ? Y[ai] : sel.particle.y;
    let cx = 0, cy = 0, eSum = 0, vx = 0, vy = 0;
    const roles = [0, 0, 0];
    const rel = new Float32Array(cells.length * 2);
    cells.forEach((i, k) => {
      const dx = wrapD(X[i] - rx, W), dy = wrapD(Y[i] - ry, H);
      rel[k * 2] = dx; rel[k * 2 + 1] = dy;
      cx += dx; cy += dy;
      eSum += f32[i * PICK_WORDS + 5]; vx += f32[i * PICK_WORDS + 2]; vy += f32[i * PICK_WORDS + 3];
      roles[(u32[i * PICK_WORDS + 9] >> 4) & 3]++;
    });
    const m = Math.max(1, cells.length);
    cx /= m; cy /= m;
    let span = 0;
    for (let k = 0; k < cells.length; k++) span = Math.max(span, Math.hypot(rel[k * 2] - cx, rel[k * 2 + 1] - cy));

    if (sel.rehome || !members.has(sel.id)) {
      // Watch the traced cell nearest the body's middle, favouring young ones so the watch lasts.
      const g = genomeFor(sel.particle.kind);
      const lifespan = g ? g.lifespan : 100;
      let best = -1, bs = Infinity;
      for (const i of body) {
        if (idAt(i) === sel.id) continue;
        const d = Math.hypot(wrapD(X[i] - rx, W) - cx, wrapD(Y[i] - ry, H) - cy);
        const s = d / Math.max(1, span) + f32[i * PICK_WORDS + 6] / lifespan;
        if (s < bs) { bs = s; best = i; }
      }
      if (best < 0) { if (sel.rehome) organismGone(); return; }
      if (sel.rehome) {
        story(`${transitionText(sel.particle, sel.rehome.cell).replace(/ Its (body|skeleton) is now .*$/, '').replace(/ What remained is silt\.$/, '')} Its organism lives on; now watching another of its cells.`);
      } else story('Its organism split: following the larger part.');
      sel.rehome = null;
      sel.id = idAt(best);
      sel.particle = parseParticle(u32, f32, best * PICK_WORDS);
      sel.sampleT = res.simTime;
    }

    // the cells of the body near the watched one, for "touching"
    const near = [];
    for (let k = 0; k < cells.length && near.length < 400; k++) {
      const i = cells[k];
      if (Math.hypot(wrapD(X[i] - sel.particle.x, W), wrapD(Y[i] - sel.particle.y, H)) < 2) near.push({ x: X[i], y: Y[i] });
    }
    sel.orgNear = near;
    const prev = sel.org;
    const mid = [((rx + cx) % W + W) % W, ((ry + cy) % H + H) % H];
    sel.org = { cells: members.size, roles, span: span * 2, mid, speed: Math.hypot(vx / m, vy / m), meanE: eSum / m, partial: res.truncated, touching: prev ? prev.touching : 0, at: res.simTime, ms: performance.now() - t0 };
    if (sel.orgFirst == null) {
      sel.orgFirst = members.size;
      if (members.size > 1) story(`It is one cell of a ${fmt(members.size)}-cell organism. Following the whole body.`);
    }
    const ids = Uint32Array.from(members.keys()).sort();
    setMembers(ids.length > 1 ? ids : null, sel.particle.kind);
    remember();
    dirty = true;
  }

  function organismGone() {
    const { cell, t } = sel.rehome;
    sel.rehome = null;
    sel.members = null;
    story(transitionText(sel.particle, cell));
    story('None of its organism survived.');
    sel.diedAt = t;
    sel.particle = cell;
    sel.sampleT = Math.max(sel.sampleT, t);
    setMembers(null);
    dirty = true;
  }

  // ------------------------------------------------------------ inspector rendering
  const bar = (frac, col) => `<span class="bar"><i style="width:${(clamp(frac, 0, 1) * 100).toFixed(1)}%;background:${col}"></i></span>`;
  const dbar = (v) => {
    const w = (Math.abs(v) * 50).toFixed(1);
    const left = v < 0 ? (50 - Math.abs(v) * 50).toFixed(1) : 50;
    return `<span class="dbar"><i style="left:${left}%;width:${w}%;background:${v >= 0 ? 'var(--warm)' : 'var(--cool)'}"></i></span>`;
  };
  const row = (label, value, tip) => `<div class="kv"><span>${tip ? term(tip, label) : label}</span><b>${value}</b></div>`;
  const traitRow = (label, v, lo, hi, text, tip) => `<div class="trait"><span>${tip ? term(tip, label) : label}</span>${bar((v - lo) / (hi - lo), 'var(--ink-dim)')}<b>${text}</b></div>`;
  // A two-line row: label and figures above, a full-width proportion bar below.
  const compRow = (label, tip, shares, g, text) => `<div class="trait two"><div class="tl"><span>${term(tip, label)}</span><b>${shares.map((v, r) => (v > 0.02 ? text(v, r) : '')).filter(Boolean).join(' · ')}</b></div><span class="compbar">${shares.map((v, r) => (v > 0.02 ? `<i style="flex:${v};background:${cssRgb(roleColor(g, r))}"></i>` : '')).join('')}</span></div>`;
  const tagHTML = (g) => `<div class="tags">${tagsOf(g, K).map(([t, k]) => `<span class="term" data-tip="${k}">${t}</span>`).join('')}</div>`;

  function storyHTML() {
    if (!sel || !sel.story.length) return '';
    return `<div class="sect"><div class="eyebrow">Life story</div><ol class="story">${sel.story.map((s) => `<li><time>${fmtClock(s.t)}</time><span>${s.text}</span></li>`).join('')}</ol></div>`;
  }

  function cellSection(p, g, past, inBody) {
    const [W, H] = eng.grid;
    let html = `<div class="sect"><div class="eyebrow">${past ? 'This cell, last seen alive' : inBody ? 'The cell being watched' : 'This cell'}</div>`;
    if (g) {
      html += row('Energy', `${p.energy.toFixed(2)} of ${g.reproE.toFixed(2)} to divide ${bar(p.energy / g.reproE, 'var(--warm)')}`, 'energy');
      html += row('Age', `${fmtDur(p.age)} of ${fmtDur(g.lifespan)} ${bar(p.age / g.lifespan, 'var(--ink-dim)')}`, 'lifespan');
    }
    html += row('Cell type', `<span class="greek">${ROLE[p.role]}</span>-cell`, 'celltype');
    html += row('Origin', `${CAUSE[p.cause] || 'a founder of this world'}`, 'origin');
    html += row('Lineage', `generation ${fmt(p.gen)} · id ${fmt(p.id)}`, 'generation');
    html += row('Speed', `${Math.hypot(p.vx, p.vy).toFixed(2)} cells/s`, 'speed');
    if (!past) {
      const lightHere = Math.round((eng.ambient + (1 - eng.ambient) * tideAt(p.x, p.y, W, H, eng.simTime, eng.tide, eng.tidePh) * eng.season) * 100);
      html += row('Light here', `${lightHere}%`, 'lighthere');
    }
    return html + '</div>';
  }

  function organismSection(o, g, past) {
    if (!o) return '';
    let html = `<div class="sect"><div class="eyebrow">${past ? 'Its organism, last seen' : term('organism', 'Organism')}</div>`;
    if (g && (g.adhesion || 0) <= K.adhMin) {
      html += row('Body', 'single cell · this species does not bond', 'adhesion');
    } else {
      const count = o.pending ? 'counting…' : `${o.partial ? '≥ ' : ''}${fmt(o.cells)} cell${o.cells === 1 ? '' : 's'}`;
      const first = past || o.pending ? null : sel && sel.orgFirst;
      const delta = first != null && o.cells !== first ? ` <em class="delta">${o.cells > first ? '+' : '−'}${fmt(Math.abs(o.cells - first))} since selected</em>` : '';
      html += row('Body', count + delta, 'organism');
      if (!o.pending) html += row('Span', `${o.span.toFixed(1)} grid cells${past ? '' : ' · recounted every second'}`);
      html += row('Moving', `${o.speed.toFixed(2)} cells/s · mean energy ${o.meanE.toFixed(2)}`, 'speed');
      if (g) {
        const tot = o.roles[0] + o.roles[1] + o.roles[2] || 1;
        html += compRow('Cell types', 'celltype', o.roles.map((c) => c / tot), g, (v, r) => `${ROLE[r]} ${fmt(o.roles[r])}`);
      }
    }
    html += row('Touching', o.touching ? `${o.touching} other species` : 'no other species', 'touching');
    return html + '</div>';
  }

  function speciesSection(g, spSnap) {
    const sp = life.reg.get(g.serial);
    let html = `<div class="sect"><div class="eyebrow">${term('species', 'Species')}</div>`;
    if (sp && sp.alive) {
      const share = sp.pop / Math.max(1, life.counts[3]);
      html += row('Population', `${fmt(sp.pop)} · peak ${fmt(sp.peak)}`);
      html += row('Share of life', `${(share * 100).toFixed(1)}%`, 'share');
    } else {
      html += row('Population', sp ? `extinct · peak ${fmt(sp.peak)}` : 'never established');
      html += row('Share of life', '–', 'share');
    }
    const src = sp || spSnap;
    if (src) {
      const anc = src.ancestor && life.reg.get(src.ancestor);
      html += row('Arose', `${fmtClock(src.born || 0)} into the epoch${src.founder ? ` · ${originWord(src)}` : anc ? ` · from ${spLink(anc.serial, anc.name)}` : ''}`);
      const gen = life.genera.get(src.genus);
      html += row('Genus', gen ? `${esc(gen.name)}${gen.from ? ` · split from ${esc(gen.from)}` : ''}` : '–', 'genus');
    }
    const kids = [...life.reg.values()].filter((s) => s.ancestor === g.serial && s.established);
    html += row('Descendants', kids.length ? kids.slice(0, 6).map((k) => spLink(k.serial, k.name)).join(', ') + (kids.length > 6 ? ` +${kids.length - 6}` : '') : 'none established');
    return html + '</div>';
  }

  function genomeSection(g, role) {
    let html = `<div class="sect"><div class="eyebrow">Genome</div>`;
    html += `<div class="diet">
      <div><span>${term('photosynth', 'Light')}</span>${bar(g.photo, '#d9f27a')}<b>${Math.round(g.photo * 100)}%</b></div>
      <div><span>${term('glint', 'Glint')}</span>${bar(g.dGlint * (1 - 0.6 * g.photo), MATTER[1].css)}<b>${Math.round(g.dGlint * 100)}%</b></div>
      <div><span>${term('husk', 'Husk')}</span>${bar(g.dHusk * (1 - 0.6 * g.photo), MATTER[2].css)}<b>${Math.round(g.dHusk * 100)}%</b></div>
      <div><span>${term('flesh', 'Flesh')}</span>${bar(g.dFlesh * (1 - 0.6 * g.photo), '#ff6b6b')}<b>${Math.round(g.dFlesh * 100)}%</b></div>
    </div>`;
    const sh = roleShares(g);
    html += compRow('Body plan', 'bodyplan', sh, g, (v, r) => `${ROLE[r]} ${Math.round(v * 100)}%`);
    html += traitRow('Adhesion', g.adhesion || 0, 0, 1, `${Math.round((g.adhesion || 0) * 100)}%${(g.adhesion || 0) > K.adhMin ? ' · bonds' : ' · no bonds'}`, 'adhesion');
    if (g.calcify > 0.005) html += traitRow('Calcifying', g.calcify, 0, 1, `${Math.round(g.calcify * 100)}%`, 'calcify');
    html += traitRow('Swimming', g.swim * (1 - g.photo), 0, 3, (g.swim * (1 - g.photo)).toFixed(2), 'swimming');
    html += traitRow('Schooling', g.align, 0, 1, `${Math.round(g.align * 100)}%`, 'schooling');
    html += traitRow('Reach', g.radius, 0.4, 1, g.radius.toFixed(2), 'reach');
    html += traitRow('Personal space', g.beta, 0.12, 0.5, g.beta.toFixed(2), 'personalspace');
    html += traitRow('Thrust', g.force, 1, 16, g.force.toFixed(1), 'thrust');
    html += traitRow('Glide', g.drag, 0.015, 0.4, `${(g.drag * 1000).toFixed(0)} ms`, 'glide');
    html += traitRow('Current pull', g.advect, 0.03, 1, `${Math.round(g.advect * 100)}%`, 'currentpull');
    html += traitRow('Lifespan', g.lifespan, 20, 500, fmtDur(g.lifespan), 'lifespan');
    html += traitRow('Divides at', g.reproE, 0.6, 4, g.reproE.toFixed(2), 'dividesat');
    html += traitRow('Child share', g.share, 0.2, 0.7, `${Math.round(g.share * 100)}%`, 'childshare');
    html += traitRow('Upkeep', g.metab, 0.01, 0.15, `${g.metab.toFixed(3)}/s`, 'upkeep');
    html += traitRow('Mutation', g.mutRate, 0.002, 0.08, `${(g.mutRate * 100).toFixed(1)}%`, 'mutation');
    html += traitRow('Size', g.size, 0.45, 2.6, `${g.size.toFixed(2)} · ${CELL_SHAPES[cellShape(g, role)]}`, 'size');
    html += '</div>';

    const others = [];
    for (const s of life.reg.values()) if (s.alive && s.established && s.serial !== g.serial) others.push(s);
    others.sort((a, b) => b.pop - a.pop);
    const list = [];
    for (let r = 0; r < 3; r++) if (sh[r] > 0.05) list.push({ name: `Own ${ROLE[r]}-cells`, v: affinity(g, role, g, r, K), css: cssRgb(roleColor(g, r)) });
    for (const s2 of others.slice(0, 4)) list.push({ name: spLink(s2.serial, s2.name), raw: true, v: affinity(g, role, s2.genome, 0, K), css: cssCol(s2.genome.col) });
    for (let m = 0; m < 4; m++) if (life.matter[m]) list.push({ name: MATTER[m].name, v: affinity(g, role, life.matter[m], 0, K) * K.matterPull, css: MATTER[m].css });
    html += `<div class="sect"><div class="eyebrow">${ROLE[role]}-cells pull toward · flee</div><div class="aff">`;
    for (const it of list) html += `<div><i style="background:${it.css}"></i><span>${it.raw ? it.name : esc(it.name)}</span>${dbar(it.v)}<b>${it.v >= 0 ? '+' : ''}${it.v.toFixed(2)}</b></div>`;
    return html + '</div></div>';
  }

  function sparkSVG(serial, w, h) {
    const hist = life.history;
    if (hist.length < 2) return '<p class="muted">Population history will appear after a few census samples.</p>';
    let max = 1;
    const vals = hist.map((s) => { const e = s.sp.find((q) => q[0] === serial); const v = e ? e[1] : 0; if (v > max) max = v; return v; });
    const d = vals.map((v, i) => `${i ? 'L' : 'M'}${((i / (vals.length - 1)) * w).toFixed(1)},${(h - 1 - (v / max) * (h - 4)).toFixed(1)}`).join('');
    return `<svg class="popchart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Population over time"><path d="${d}"/></svg><div class="chart-cap"><span>${fmtClock(hist[0].t)}</span><span>peak ${fmt(max)}</span><span>${fmtClock(hist[hist.length - 1].t)}</span></div>`;
  }

  function renderInspector(force) {
    const now = performance.now();
    if (uiHeld()) { dirty = true; return; }
    if (!force && now - lastRender < 250) return;
    lastRender = now;
    dirty = false;
    let html = '';
    if (spView != null) {
      const sp = life.reg.get(spView);
      if (!sp) { deselect(); return; }
      const g = sp.genome;
      $('ins-kind').textContent = sp.alive ? (sp.established ? 'Species · thriving' : 'Species · rare') : 'Species · extinct';
      $('ins-name').textContent = sp.name;
      $('ins-sub').textContent = `species ${fmt(sp.serial)} · ${g.depth ? `${g.depth} mutation${g.depth === 1 ? '' : 's'} from its founder` : originWord(sp)}`;
      drawGlyph(cellShape(g), g.col);
      const hl = focus.key === `sp:${sp.serial}`;
      html += `<div class="ins-row">${sp.alive ? '<button type="button" data-act="find">Find a living cell</button>' : ''}${sp.alive ? `<button type="button" data-act="hl" aria-pressed="${hl}">${hl ? 'Highlighted' : 'Highlight'}</button>` : ''}</div>`;
      html += tagHTML(g);
      html += `<div class="sect"><div class="eyebrow">Population</div>${sparkSVG(sp.serial, 300, 48)}</div>`;
      html += speciesSection(g, null);
      html += genomeSection(g, 0);
    } else if (sel) {
      const p = sel.particle;
      const kind = p.kind;
      const [W, H] = eng.grid;
      const mem = sel.memory;
      if (kind < FIRST_LIFE) {
        const m = MATTER[kind];
        const lightHere = Math.round((eng.ambient + (1 - eng.ambient) * tideAt(p.x, p.y, W, H, eng.simTime, eng.tide, eng.tidePh) * eng.season) * 100);
        $('ins-kind').textContent = mem ? `Now ${m.name.toLowerCase()} · once a cell of` : kind === 2 ? 'Remains' : kind === 3 ? 'Structure' : 'Matter';
        $('ins-name').textContent = mem && mem.sp ? mem.sp.name : m.name;
        $('ins-sub').textContent = sel.lost ? 'Lost track of this particle.' : mem && sel.diedAt != null ? `died ${fmtDur(eng.simTime - sel.diedAt)} ago · particle ${fmt(p.id)}` : `particle ${fmt(p.id)}${CAUSE[p.cause] ? ` · ${CAUSE[p.cause]}` : ''}`;
        drawGlyph(kind === 1 ? 13 : kind === 2 ? 12 : 14, kind === 0 ? 0xff796056 : kind === 1 ? 0xffffe6b9 : kind === 3 ? 0xff9faeb8 : 0xff47628a);
        html += storyHTML();
        if (mem) html += '<button type="button" class="wide" data-act="relative">Watch a surviving relative</button>';
        html += `<div class="sect"><div class="eyebrow">Now: ${term(m.name.toLowerCase(), m.name.toLowerCase())}</div><p class="note">${m.blurb}</p>`;
        if (kind === 1) {
          html += row('Charge', `${p.energy.toFixed(2)} ${bar(p.energy, MATTER[1].css)}`, 'glint');
          html += row('Fades in', `~${fmtDur(Math.max(0, (p.energy - K.glintMin) / K.leak))}`);
        } else if (kind === 2) {
          html += row('Energy left', `${p.energy.toFixed(2)} ${bar(p.energy / 1.2, MATTER[2].css)}`, 'husk');
          html += row('Crumbles in', `~${fmtDur(Math.max(0, (p.energy - K.huskMin) / K.decay))}`);
          html += row('Cause of death', CAUSE[p.cause] || 'unknown');
        }
        if (kind === 3) html += row('Wears away in', `~${fmtDur(Math.max(0, p.energy))}`, 'stone');
        html += row(kind === 2 ? 'Dead for' : kind === 3 ? 'Stone for' : 'In this state', fmtDur(p.age));
        html += row('Light here', `${lightHere}%`, 'lighthere');
        html += '</div>';
        if (mem) {
          html += `<div class="past">${tagHTML(mem.g)}${cellSection(mem.p, mem.g, true)}${organismSection(mem.org, mem.g, true)}${speciesSection(mem.g, mem.sp)}${genomeSection(mem.g, mem.role)}</div>`;
        }
      } else {
        const g = genomeFor(kind);
        const sp = g ? life.reg.get(g.serial) : null;
        const gr = `<span class="greek">${ROLE[p.role]}</span>`;
        const o = sel.org;
        const inBody = !!(o && !o.pending && o.cells > 1 && g && (g.adhesion || 0) > K.adhMin);
        $('ins-kind').innerHTML = inBody ? `${o.partial ? '≥ ' : ''}${fmt(o.cells)}-cell organism · watching a ${gr}-cell` : `${gr}-cell`;
        $('ins-name').innerHTML = sp ? spLink(sp.serial, sp.name) : 'Unsequenced species';
        $('ins-sub').textContent = sel.lost ? 'Lost track of this cell.' : g ? `species ${fmt(g.serial)} · ${g.depth ? `${g.depth} mutation${g.depth === 1 ? '' : 's'} from its founder` : originWord(sp || g)}` : 'This species arose moments ago. Sequencing…';
        drawGlyph(g ? cellShape(g, p.role) : 0, p.col);
        if (g) html += tagHTML(g);
        html += storyHTML();
        html += inBody ? organismSection(o, g, false) + cellSection(p, g, false, true) : cellSection(p, g, false) + organismSection(o, g, false);
        if (g) html += speciesSection(g, null) + genomeSection(g, p.role);
      }
    }
    if (html !== lastHtml) { insBody.innerHTML = html; lastHtml = html; }
  }

  insBody.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'relative') followRelative();
    else if (act.dataset.act === 'find') findMember(spView);
    else if (act.dataset.act === 'hl') {
      const sp = life.reg.get(spView);
      if (!sp) return;
      if (focus.key === `sp:${sp.serial}`) clearFocus(); else focusSpecies(sp);
      lastHtml = '';
      renderInspector(true);
    }
  });

  function openSpecies(serial) {
    const sp = life.reg.get(serial);
    if (!sp) { flash('That species is no longer on record'); return; }
    sel = null;
    eng.trackId = NONE;
    state.follow = false;
    setMembers(null);
    spView = serial;
    ins.hidden = false;
    ins.classList.add('species-mode');
    lastHtml = '';
    if (sp.alive) focusSpecies(sp);
    renderInspector(true);
  }

  // Jump to a living member: for a bonded species, a cell of its largest body; otherwise one in its densest patch.
  async function findMember(serial) {
    const sp = life.reg.get(serial);
    if (!sp || !sp.alive) return;
    const [W, H] = eng.grid;
    const res = await eng.requestPick([W / 2, H / 2], Math.hypot(W, H), NONE, { kind: sp.slot, maxOut: sp.pop * 1.25 + 2048, raw: true });
    if (!res || !res.raw.count) { flash('No living cells found'); return; }
    const { u32, f32, count: n } = res.raw;
    let bestI = 0;
    if ((sp.genome.adhesion || 0) > K.adhMin) {
      const claimed = new Uint8Array(n);
      let bestN = 0;
      const t0 = performance.now();
      for (let tries = 0; tries < 60 && performance.now() - t0 < 60; tries++) {
        const i = Math.floor(Math.random() * n);
        if (claimed[i]) continue;
        const tb = traceBody(u32, f32, n, u32[i * PICK_WORDS + 7]);
        if (!tb) continue;
        for (const k of tb.body) claimed[k] = 1;
        if (tb.body.length > bestN) { bestN = tb.body.length; bestI = i; }
      }
    } else {
      const step = Math.max(1, Math.floor(n / 200));
      let bestN = -1;
      for (let i = 0; i < n; i += step) {
        let c = 0;
        for (let j = 0; j < n; j += step) if (Math.hypot(wrapD(f32[j * PICK_WORDS] - f32[i * PICK_WORDS], W), wrapD(f32[j * PICK_WORDS + 1] - f32[i * PICK_WORDS + 1], H)) < 2) c++;
        if (c > bestN) { bestN = c; bestI = i; }
      }
    }
    const best = parseParticle(u32, f32, bestI * PICK_WORDS);
    takeOver();
    cam.x = best.x; cam.y = best.y;
    if (cssPPU() < 18) { cam.zoomTarget = clamp((18 * dpr) / fitPPU(), 1, maxZoom()); cam.anchor = null; }
    beginTracking(best, { entries: [], simTime: res.simTime });
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a.sp');
    if (!a) return;
    e.preventDefault();
    openSpecies(+a.dataset.serial);
  });

  const glyph = $('glyph');
  let glyphKey = '';
  function drawGlyph(shape, col) {
    const k = `${shape}:${col}`;
    if (k === glyphKey) return;
    glyphKey = k;
    const r = Math.min(devicePixelRatio || 1, 2);
    const s = 44;
    glyph.width = s * r; glyph.height = s * r;
    const g = glyph.getContext('2d');
    g.setTransform(r, 0, 0, r, 0, 0);
    g.clearRect(0, 0, s, s);
    const c = cssCol(col);
    const cx = s / 2, cy = s / 2, R = 16;
    g.fillStyle = c; g.strokeStyle = c;
    g.shadowColor = c; g.shadowBlur = 8;
    // Small polygonal emblems; the live specimen below shows the actual individual.
    const outlines = [
      'M-.8,-.3 L-.4,-.8 L.2,-.7 L.7,-.3 L.6,.4 L.1,.9 L-.6,.6 Z',
      'M-.9,-.4 L-.3,-.3 L-.2,-.9 L.1,-.3 L.8,-.6 L.4,-.1 L.9,.3 L.3,.3 L.1,.9 L-.2,.3 L-.8,.6 L-.4,0 Z',
      'M-.3,-.8 L0,-.5 L.2,-.1 L.9,.1 L.6,.4 L.1,.3 L-.4,.9 L-.5,.6 L-.2,.1 L-.5,-.4 Z',
      'M-.1,0 L-.3,-.8 L-.6,-.5 L-.9,-.6 L-.8,0 L-.9,.4 L-.4,.7 L-.1,.1 L.1,.1 L.4,.8 L.7,.5 L.9,.6 L.8,0 L.9,-.3 L.3,-.7 L.1,0 Z',
      'M-.6,-.2 L-.3,-.6 L-.1,-1 L.2,-.5 L.5,-.3 L.5,.2 L.7,.8 L.2,.5 L-.1,.9 L-.2,.3 L-.6,.2 Z',
      'M-1,.1 L-.4,-.5 L.1,-.3 L.5,-.4 L1,-.1 L.5,.3 L0,.2 L-.5,.4 Z',
      'M-.9,-.2 L-.6,-.5 L.2,-.5 L.8,-.2 L.9,.2 L.5,.4 L.2,.1 L-.2,.5 L-.7,.3 Z',
      'M-.7,0 L-.5,-.5 L0,-.7 L.5,-.5 L.8,0 L.6,.5 L.2,.6 L0,.3 L-.4,.5 Z',
      'M-.8,-.3 L-.4,-.8 L.4,-.6 L.8,-.1 L.7,.6 L0,.8 L-.6,.5 Z M-.1,-.3 L.4,-.3 L.5,.2 L.2,.5 L-.1,.2 Z',
      'M-.9,.3 L-.7,0 L-.2,-.1 L.3,-.8 L.8,-.6 L.6,0 L.8,.7 L.2,.5 L-.2,.1 L-.6,.2 Z',
      'M-1,-.1 L-.8,-.4 L-.4,-.3 L-.2,-.5 L.1,-.4 L.3,-.1 L.7,-.3 L1,0 L.8,.4 L.5,.3 L.2,.2 L-.1,.4 L-.4,.2 L-.7,.3 Z',
      'M-1,.2 L-.3,-.6 L.1,-.4 L.9,-.2 L.4,.3 L-.2,.7 Z',
    ];
    g.translate(cx, cy); g.scale(R, R);
    if (shape < 12) { g.fill(new Path2D(outlines[shape]), 'evenodd'); }
    else {
      g.beginPath();
      if (shape === 12) { g.lineWidth = 0.22; g.ellipse(0, 0, 0.65, 0.5, 0.4, 0, TAU); g.stroke(); }
      else if (shape === 13) { g.fill(new Path2D('M0,-1 L.15,-.15 L1,0 L.15,.15 L0,1 L-.15,.15 L-1,0 L-.15,-.15 Z')); }
      else { g.fill(new Path2D('M-.7,-.5 L.2,-.8 L.8,-.2 L.5,.6 L-.5,.8 L-.9,.1 Z')); }
    }
  }

  // ------------------------------------------------------------ live specimen view
  const spec = $('specimen');
  const specUI = $('spec-ui');
  let specKey = '';
  function specimenParams() {
    if (!sel || ins.hidden || spView != null) return null;
    const r = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(spec.clientWidth * r), h = Math.round(spec.clientHeight * r);
    if (!w || !h) return null;
    if (spec.width !== w || spec.height !== h) { spec.width = w; spec.height = h; }
    const key = `${w}x${h}:${state.specCells}`;
    if (key !== specKey) { specKey = key; drawSpecUI(); }
    const [px, py] = sel.disp;
    return { target: specCtx.getCurrentTexture().createView(), w, h, cx: px, cy: py, ppu: h / state.specCells, dpr: r };
  }
  function drawSpecUI() {
    const r = Math.min(devicePixelRatio || 1, 2);
    const w = specUI.clientWidth, h = specUI.clientHeight;
    specUI.width = Math.round(w * r); specUI.height = Math.round(h * r);
    const g = specUI.getContext('2d');
    g.setTransform(r, 0, 0, r, 0, 0);
    g.clearRect(0, 0, w, h);
    const pxPerCell = h / state.specCells;
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 1;
    g.beginPath(); g.arc(w / 2, h / 2, Math.max(8, pxPerCell * 0.16), 0, TAU); g.stroke();
    const half = pxPerCell * 0.5;
    g.fillStyle = 'rgba(236,230,245,0.75)';
    g.fillRect(8, h - 10, half, 1.5);
    g.font = '9px ui-monospace, monospace';
    g.fillText('½ cell', 12 + half, h - 6);
    $('spec-cap').textContent = `live view · ${((state.specCells * w) / h).toFixed(1)} × ${state.specCells.toFixed(1)} grid cells · scroll to zoom`;
  }
  spec.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.specCells = clamp(state.specCells * Math.exp(e.deltaY * 0.0015), 0.8, 14);
  }, { passive: false });

  // ------------------------------------------------------------ hover hints
  const tip = $('tip');
  let tipFor = null;
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el || el === tipFor) return;
    const text = GLOSSARY[el.dataset.tip];
    if (!text) return;
    tipFor = el;
    tip.textContent = text;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const tw = Math.min(300, innerWidth - 16);
    tip.style.maxWidth = `${tw}px`;
    const left = clamp(r.left, 8, innerWidth - tw - 8);
    const below = r.bottom + 8 + 120 < innerHeight;
    tip.style.left = `${left}px`;
    tip.style.top = below ? `${r.bottom + 6}px` : '';
    tip.style.bottom = below ? '' : `${innerHeight - r.top + 6}px`;
  });
  document.addEventListener('mouseout', (e) => {
    if (!tipFor) return;
    if (e.relatedTarget && tipFor.contains(e.relatedTarget)) return;
    if (e.target.closest && e.target.closest('[data-tip]') === tipFor) { tipFor = null; tip.hidden = true; }
  });

  // ------------------------------------------------------------ lab
  const lab = createLab({
    $, fmt, fmtClock, fmtDur, esc, cssCol, ROLE, MATTER, eng, state,
    life: () => life, facets: (g) => facets(g, K), groups, climate: () => climate, held: uiHeld,
    openSpecies, focusFacet,
    focusKey: () => focus.key,
    focusPredicate: (label, pred) => setFocus(`pred:${label}`, label, { pred }),
    setTide: (m) => { eng.settings.tide = m; },
    toggleCurrents: () => { state.currents = !state.currents; },
  });
  $('lab-open').addEventListener('click', () => lab.toggle());
  $('snd').addEventListener('click', toggleSound);
  $('vol').addEventListener('input', (e) => sound.setVolume(Number(e.target.value) / 100));
  renderSound();
  // On by default. Where the browser allows autoplay it starts right away; elsewhere it waits for a
  // click or key press, and the intro asks for one before the world starts (see begin()).
  if (sound.wantsOn) sound.setOn(true);
  addEventListener('pointerup', sound.unlock, true); addEventListener('keydown', sound.unlock, true);

  // ------------------------------------------------------------ input
  const ptr = { pointers: new Map(), down: null, dragging: false, pinch: null };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    ptr.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptr.pointers.size === 1) { ptr.down = { x: e.clientX, y: e.clientY, loupe: loupeGeom() }; ptr.dragging = false; }
    if (ptr.pointers.size === 2) {
      const [a, b] = [...ptr.pointers.values()];
      ptr.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      ptr.dragging = true;
      takeOver();
    }
    hideIntro();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { hover.x = e.clientX; hover.y = e.clientY; hover.on = true; }
    const prev = ptr.pointers.get(e.pointerId);
    if (!prev) return;
    const dxs = e.clientX - prev.x, dys = e.clientY - prev.y;
    prev.x = e.clientX; prev.y = e.clientY;
    if (ptr.pinch && ptr.pointers.size === 2) {
      const [a, b] = [...ptr.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const p = ppu();
      cam.x -= ((cx - ptr.pinch.cx) * dpr) / p; cam.y -= ((cy - ptr.pinch.cy) * dpr) / p;
      zoomAt(d / Math.max(1, ptr.pinch.d), cx, cy);
      ptr.pinch = { d, cx, cy };
      state.follow = false;
      return;
    }
    if (ptr.down && !ptr.dragging && Math.hypot(e.clientX - ptr.down.x, e.clientY - ptr.down.y) > 5) { ptr.dragging = true; takeOver(); }
    if (ptr.dragging) {
      const p = ppu();
      cam.x -= (dxs * dpr) / p; cam.y -= (dys * dpr) / p;
      if (state.follow) { state.follow = false; $('ins-follow').setAttribute('aria-pressed', 'false'); }
      canvas.classList.add('grabbing');
    }
  });
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hover.on = false; });
  const up = (e) => {
    ptr.pointers.delete(e.pointerId);
    if (ptr.pointers.size < 2) ptr.pinch = null;
    if (ptr.pointers.size === 0) {
      if (ptr.down && !ptr.dragging && e.type === 'pointerup') {
        const L = ptr.down.loupe;
        if (L && Math.hypot(e.clientX - L.sx, e.clientY - L.sy) < L.R) {
          const wx = L.cx + (e.clientX - L.sx) / L.cssPPU, wy = L.cy + (e.clientY - L.sy) / L.cssPPU;
          selectAt(e.clientX, e.clientY, L.cssPPU, [wx, wy]);
        } else selectAt(e.clientX, e.clientY);
      }
      ptr.down = null;
      ptr.dragging = false;
      canvas.classList.remove('grabbing');
    }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const f = Math.exp(-dy * 0.0016);
    takeOver();
    if (e.shiftKey && loupeGeom()) { state.loupeMag = clamp(state.loupeMag * f, 1.5, 20); return; }
    if (state.follow && sel) zoomAt(f, innerWidth / 2, innerHeight / 2);
    else zoomAt(f, e.clientX, e.clientY);
  }, { passive: false });

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') { if (e.key === 'Escape') e.target.blur(); return; }
    if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
    const k = e.key;
    let handled = true;
    if (k === 'R' && e.shiftKey) {
      if (state.phase !== 'running') return;
      const now = performance.now();
      if (now - state.confirmReset < 2500) { state.confirmReset = 0; seedWorld(eng.count); flash('A new universe begins'); }
      else { state.confirmReset = now; flash('Press Shift+R again to discard this epoch'); }
    }
    else if (k === 't' || k === 'T') { trailIdx = (trailIdx + 1) % trailLevels.length; eng.settings.trails = trailLevels[trailIdx]; flash(trailNames[trailIdx]); }
    else if (k === 'l' || k === 'L') { eng.settings.links = !eng.settings.links; flash(eng.settings.links ? 'Bonds shown' : 'Bonds hidden'); }
    else if (k === 'n' || k === 'N') { eng.settings.nodes = !eng.settings.nodes; flash(eng.settings.nodes ? 'Particles on' : 'Particles off'); }
    else if (k === 'b' || k === 'B') { eng.settings.bloom = eng.settings.bloom > 0 ? 0 : 0.012; flash(eng.settings.bloom ? 'Bloom on' : 'Bloom off'); }
    else if (k === 'o' || k === 'O') { eng.settings.optics = eng.settings.optics > 0 ? 0 : 1; flash(eng.settings.optics ? 'Microscope optics on' : 'Microscope optics off'); }
    else if (k === 'g' || k === 'G') { eng.settings.tide = (eng.settings.tide + 1) % 3; flash(['Tide hidden', 'Faint tide', 'Light map'][eng.settings.tide]); lab.render(true); }
    else if (k === 'v' || k === 'V') { state.currents = !state.currents; flash(state.currents ? 'Currents shown' : 'Currents hidden'); lab.render(true); }
    else if (k === 'k' || k === 'K') { lab.toggle(); }
    else if (k === 'm' || k === 'M') { state.loupe = !state.loupe; flash(state.loupe ? 'Loupe on' : 'Loupe off'); }
    else if (k === '[') { state.loupeMag = clamp(state.loupeMag / 1.25, 1.5, 20); flash(`Loupe ×${state.loupeMag.toFixed(1)}`); }
    else if (k === ']') { state.loupeMag = clamp(state.loupeMag * 1.25, 1.5, 20); flash(`Loupe ×${state.loupeMag.toFixed(1)}`); }
    else if (k === 'c' || k === 'C') { if (sel) toggleFollow(); }
    else if (k === 'a' || k === 'A') { toggleAuto(); }
    else if (k === 's' || k === 'S') { toggleSound(); }
    else if (k === '-' || k === '_') { nudgeVolume(-0.1); }
    else if (k === '=' || k === '+') { nudgeVolume(0.1); }
    else if (k === 'Escape') {
      if (sel || spView != null) deselect();
      else if (focus.key) clearFocus();
      else if (lab.isOpen()) lab.close();
      else if (state.keys) { state.keys = false; renderKeys(); }
    }
    else if (k === ' ') togglePause();
    else if (k === ',') setSpeed(state.speedIdx - 1);
    else if (k === '.') setSpeed(state.speedIdx + 1);
    else if (k === '/' || k === '<') setSpeed(SPEEDS.indexOf(1));
    else if (k === '>') setSpeed(SPEEDS.length - 1);
    else if (k === 'h' || k === 'H' || k === '?') { state.keys = !state.keys; renderKeys(); }
    else if (k === 'i' || k === 'I') { state.hud = !state.hud; $('hud').classList.toggle('off', !state.hud); }
    else if (k === 'f' || k === 'F') { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); else document.exitFullscreen?.(); }
    else if (k === '0') { takeOver(); cam.zoomTarget = 1; cam.anchor = null; }
    else handled = false;
    if (handled) { e.preventDefault(); hideIntro(); }
  });

  // ------------------------------------------------------------ HUD bits
  const flashEl = $('flash');
  let flashTimer = 0;
  function flash(msg) {
    flashEl.textContent = msg;
    flashEl.classList.add('on');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => flashEl.classList.remove('on'), 1400);
  }
  function renderTime() {
    const s = SPEEDS[state.speedIdx];
    $('time-play').textContent = state.paused ? '▶' : '❚❚';
    $('time-play').setAttribute('aria-label', state.paused ? 'Resume' : 'Pause');
    $('time-speed').textContent = fmtSpeed(s);
    $('time-slower').disabled = state.speedIdx === 0;
    $('time-faster').disabled = state.speedIdx === SPEEDS.length - 1;
    $('time-max').setAttribute('aria-pressed', String(s === Infinity));
    $('time').classList.toggle('fast', s > 1);
  }
  function setSpeed(i) {
    state.speedIdx = clamp(i, 0, SPEEDS.length - 1);
    stepAcc = 0;
    perf.rafDt.length = 0;
    perf.lastAdjust = performance.now();
    flash(`Time ${fmtSpeed(SPEEDS[state.speedIdx])}`);
    renderTime();
  }
  function togglePause() {
    state.paused = !state.paused;
    flash(state.paused ? 'Paused' : 'Running');
    renderTime();
  }
  $('time-play').addEventListener('click', togglePause);
  $('time-slower').addEventListener('click', () => setSpeed(state.speedIdx - 1));
  $('time-faster').addEventListener('click', () => setSpeed(state.speedIdx + 1));
  $('time-speed').addEventListener('click', () => setSpeed(SPEEDS.indexOf(1)));
  $('time-max').addEventListener('click', () => setSpeed(SPEEDS[state.speedIdx] === Infinity ? SPEEDS.indexOf(1) : SPEEDS.length - 1));

  function renderKeys() { $('keys').hidden = !state.keys; $('keys-hint').hidden = state.keys; }
  renderKeys();
  renderTime();
  $('keys-hint').addEventListener('click', () => { state.keys = true; renderKeys(); });
  $('keys-close').addEventListener('click', () => { state.keys = false; renderKeys(); });

  let introHidden = false;
  function hideIntro() { if (introHidden || state.phase !== 'running') return; introHidden = true; $('intro').classList.add('gone'); }
  // The browser blocks the soundtrack until a gesture: hold the new world still until one, so its
  // first moments are heard.
  function begin() {
    if (sound.on && !sound.playing) {
      state.paused = true; renderTime();
      $('intro').classList.add('ask');
      const go = (e) => {
        removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true);
        if (e.type === 'keydown') e.stopPropagation(); // the key only starts the world
        sound.unlock();
        state.paused = false; renderTime();
        hideIntro();
      };
      addEventListener('pointerdown', go, true); addEventListener('keydown', go, true);
    } else setTimeout(hideIntro, 4500);
  }

  let hudT = 0;
  function updateHud(now) {
    if (now - hudT < 250) return;
    hudT = now;
    $('epoch').textContent = fmtClock(eng.simTime);
    $('lab-epoch').textContent = fmtClock(eng.simTime);
    $('era').textContent = climate.name;
    const s0 = seasonAt(eng.simTime), s1 = seasonAt(eng.simTime + 5);
    const lt = `Light ${Math.round(eng.ambient * 100)}%`, tt = `tide ${s1 >= s0 ? 'rising' : 'ebbing'}`;
    if ($('hud-light').textContent !== lt) $('hud-light').textContent = lt;
    if ($('hud-tide').textContent !== tt) $('hud-tide').textContent = tt;
    if (tipFor && !tipFor.isConnected) { tipFor = null; tip.hidden = true; }
    $('count').textContent = fmt(eng.count);
    const want = SPEEDS[state.speedIdx];
    const actual = state.paused ? '' : want === Infinity || perf.rate < want * 0.9 ? `×${perf.rate < 10 ? perf.rate.toFixed(1) : Math.round(perf.rate)}` : '';
    if ($('time-actual').textContent !== actual) $('time-actual').textContent = actual;
    $('perf').textContent = `${perf.fps ? perf.fps.toFixed(0) : '–'} fps · ${perf.gpu ? perf.gpu.toFixed(1) : '–'} ms${renderScale < 1 ? ` · render ${Math.round(renderScale * 100)}%` : ''}`;
  }

  function adaptResolution(now) {
    // Running fast spends the frame on simulation on purpose; only adapt at real time or slower.
    if (state.phase !== 'running' || state.paused || SPEEDS[state.speedIdx] > 1 || now - perf.lastAdjust < 2000 || perf.rafDt.length < 60) return;
    const m = median(perf.rafDt);
    perf.rafDt.length = 0;
    perf.lastAdjust = now;
    if (m > 18.8 && renderScale > 0.5) { renderScale = Math.max(0.5, renderScale * 0.85); perf.goodWindows = 0; fit(); }
    else if (m < 17.2) {
      perf.goodWindows++;
      if (perf.goodWindows >= 3 && renderScale < 1) { renderScale = Math.min(1, renderScale * 1.12); perf.goodWindows = 0; fit(); }
    } else perf.goodWindows = 0;
  }

  // Where the tracked particle is now: last GPU sample advanced by its own velocity plus the current it rides.
  function predicted() { return predictAt(sel.particle, sel.sampleT); }
  function predictAt(p, sampleT) {
    const dtS = state.paused ? 0 : Math.max(0, Math.min(0.25, eng.simTime - sampleT));
    let adv = 1;
    if (p.kind >= FIRST_LIFE) { const g = genomeFor(p.kind); adv = g ? g.advect : 0.5; }
    const [fx, fy] = flowAt(p.x, p.y, eng.simTime, eng.waves);
    return [p.x + (p.vx + fx * adv) * dtS, p.y + (p.vy + fy * adv) * dtS];
  }

  function drawCurrents() {
    const step = 48;
    const p = cssPPU();
    let maxV = 1e-3;
    const pts = [];
    for (let sy = step / 2; sy < innerHeight; sy += step) {
      for (let sx = step / 2; sx < innerWidth; sx += step) {
        const [wx, wy] = toWorld(sx, sy);
        const [vx, vy] = flowAt(wx, wy, eng.simTime, eng.waves);
        const m = Math.hypot(vx, vy);
        if (m > maxV) maxV = m;
        pts.push([sx, sy, vx, vy, m]);
      }
    }
    octx.lineWidth = 1.1;
    for (const [sx, sy, vx, vy, m] of pts) {
      const len = 6 + 16 * (m / maxV);
      const ux = vx / (m || 1), uy = vy / (m || 1);
      const ex = sx + ux * len, ey = sy + uy * len;
      octx.strokeStyle = `rgba(150,220,255,${0.25 + 0.45 * (m / maxV)})`;
      octx.beginPath();
      octx.moveTo(sx - ux * len * 0.3, sy - uy * len * 0.3); octx.lineTo(ex, ey);
      octx.lineTo(ex - ux * 4 - uy * 3, ey - uy * 4 + ux * 3);
      octx.moveTo(ex, ey);
      octx.lineTo(ex - ux * 4 + uy * 3, ey - uy * 4 - ux * 3);
      octx.stroke();
    }
    void p;
  }

  function drawOverlay(dt, L) {
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    const r = overlay.width / innerWidth;
    octx.setTransform(r, 0, 0, r, 0, 0);
    if (state.currents) drawCurrents();
    if (sel && sel.particle) {
      const [W, H] = eng.grid;
      const [px, py] = predicted();
      const k = Math.min(1, dt / 40);
      sel.disp[0] += wrapD(px - sel.disp[0], W) * k;
      sel.disp[1] += wrapD(py - sel.disp[1], H) * k;
      let [sx, sy] = toScreen(sel.disp[0], sel.disp[1]);
      let inLens = false;
      if (L && Math.hypot(sx - L.sx, sy - L.sy) < L.R) {
        sx = L.sx + wrapD(sel.disp[0] - L.cx, W) * L.cssPPU;
        sy = L.sy + wrapD(sel.disp[1] - L.cy, H) * L.cssPPU;
        inLens = true;
      }
      const visible = !inLens || Math.hypot(sx - L.sx, sy - L.sy) < L.R - 8;
      if (visible) {
        octx.strokeStyle = sel.lost ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.9)';
        octx.lineWidth = 1.25;
        const ring = 10;
        octx.beginPath(); octx.arc(sx, sy, ring, 0, TAU); octx.stroke();
        octx.beginPath();
        for (let i = 0; i < 4; i++) { const a = (i * TAU) / 4 + Math.PI / 4; octx.moveTo(sx + Math.cos(a) * (ring + 3), sy + Math.sin(a) * (ring + 3)); octx.lineTo(sx + Math.cos(a) * (ring + 8), sy + Math.sin(a) * (ring + 8)); }
        octx.stroke();
      }
    }
    if (L) {
      const { sx, sy } = L;
      octx.lineCap = 'round';
      for (const [w, c] of [[3, 'rgba(0,0,0,0.55)'], [1.2, 'rgba(255,255,255,0.95)']]) {
        octx.strokeStyle = c;
        octx.lineWidth = w;
        octx.beginPath();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { octx.moveTo(sx + dx * 5, sy + dy * 5); octx.lineTo(sx + dx * 14, sy + dy * 14); }
        octx.stroke();
      }
      octx.fillStyle = 'rgba(255,255,255,0.95)';
      octx.beginPath(); octx.arc(sx, sy, 1.2, 0, TAU); octx.fill();
    }
  }

  // ------------------------------------------------------------ auto camera
  // Left alone for a minute (three with the inspector or the Lab open), the view is handed to the
  // director (director.js), which films the world until the user clicks, drags or scrolls the view.
  const AUTO_KEY = 'tidemote.autoCamera';
  const AUTO_IDLE = 60e3, AUTO_IDLE_READING = 180e3;
  state.auto = (() => { try { return localStorage.getItem(AUTO_KEY) !== 'off'; } catch { return true; } })();
  let lastInput = performance.now();
  const lastPtr = { x: -1, y: -1, moved: performance.now() };
  const poke = () => { lastInput = performance.now(); };
  addEventListener('pointerdown', poke, true);
  addEventListener('keydown', poke, true);
  addEventListener('wheel', poke, { capture: true, passive: true });
  addEventListener('pointermove', (e) => {
    if (Math.abs(e.clientX - lastPtr.x) + Math.abs(e.clientY - lastPtr.y) > 3) { lastPtr.x = e.clientX; lastPtr.y = e.clientY; lastPtr.moved = performance.now(); poke(); }
  }, true);
  // the closest and widest view widths the director uses, in world units
  const viewWidths = () => {
    const wMax = canvas.width / fitPPU();
    return [Math.min(wMax, Math.max(canvas.width / (MAX_PPU * dpr), innerWidth / 360)), wMax];
  };
  const director = new Director({
    world: () => eng.grid,
    widths: viewWidths,
    pick: (center, radius, opts) => eng.requestPick(center, radius, NONE, opts),
    predict: predictAt,
    species: (slot) => {
      const c = life.lastCensus;
      if (!c || !c.pop[slot]) return null;
      return { serial: genomeSerial(c.genomeU32, slot), pop: c.pop[slot] };
    },
    lifespan: (slot) => { const g = genomeFor(slot); return g ? g.lifespan : 0; },
    now: () => performance.now() / 1000,
  });
  let surveyT = 0;
  eng.onSurvey = (s) => {
    const t = performance.now();
    director.survey(s, surveyT ? (t - surveyT) / 1000 : 1);
    surveyT = t;
  };
  function resetDirector() {
    if (director.active) renderAuto(false);
    director.reset();
    surveyT = 0;
  }
  // Auto · A arms the takeover after idling; the play button beside it starts the camera now and,
  // while the camera is filming, shows pause to stop it.
  function renderAuto(live) {
    eng.survey = state.auto || live ? { every: 45 } : null;
    $('auto').setAttribute('aria-pressed', String(state.auto));
    const play = $('auto-play'), label = live ? 'Stop the auto camera' : 'Start the auto camera now';
    play.textContent = live ? '❚❚' : '▶';
    play.setAttribute('aria-pressed', String(!!live));
    play.setAttribute('aria-label', label);
    play.title = label;
  }
  // the user takes the camera back where it is
  function takeOver() {
    poke();
    if (!director.active) return;
    director.stop();
    cam.zoomTarget = cam.zoom; cam.anchor = null;
    renderAuto(false);
  }
  function startAuto(idle) {
    if (idle && (sel || spView != null)) deselect();
    if (idle && lab.isOpen()) lab.close();
    director.start({ x: cam.x, y: cam.y, w: viewWidths()[1] / cam.zoom });
    renderAuto(true);
  }
  function toggleAuto() {
    state.auto = !state.auto;
    try { localStorage.setItem(AUTO_KEY, state.auto ? 'on' : 'off'); } catch { /* storage unavailable */ }
    if (state.auto) flash('Auto camera on · takes over after a minute alone');
    else { takeOver(); flash('Auto camera off'); }
    renderAuto(director.active);
  }
  function playAuto() {
    if (director.active) { takeOver(); flash('Auto camera stopped'); }
    else if (state.phase === 'running') { startAuto(false); flash('Auto camera · drag or scroll to take over'); }
  }
  $('auto').addEventListener('click', toggleAuto);
  $('auto-play').addEventListener('click', playAuto);
  renderAuto(false);
  // What the auto camera is showing and why, as a caption: where it is heading while it flies,
  // what is in view once it arrives (from the director's shot.why).
  const REASON = {
    mutations: ['where new variants are being born', 'mutants are appearing here'],
    sparks: ['where life is sparking from glint', 'life is sparking from glint'],
    kills: ['a hunting ground', 'kills are frequent'],
    births: ['a crowd of births', 'many are being born'],
    deaths: ['a die-off', 'many are dying'],
    diverse: ['a meeting of many species', (div) => (div >= 3 ? `about ${div} species meet` : 'several species meet')],
    bodies: ['a gathering of bodies', 'many-celled bodies gather'],
    swift: ['swift swimmers', 'the cells here move fast'],
    dense: ['the thickest crowd of life', 'life is crowded here'],
  };
  const upper = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const spName = (serial) => { const sp = life.reg.get(serial); return sp ? spLink(serial, sp.name) : 'an unnamed species'; };
  const spDesc = (serial) => { const sp = life.reg.get(serial); return sp ? describe(sp.genome, K) : ''; };
  const article = (serial) => { const sp = life.reg.get(serial); return sp && /^[AEIOU]/i.test(sp.name) ? 'an' : 'a'; };
  // "an 8-cell", "an 11-cell", "a 12-cell"
  const numArticle = (n) => (/^8/.test(String(n)) || (String(n).length % 3 === 2 && /^1[18]/.test(String(n))) ? 'an' : 'a');
  const organism = (w, the) => (w.cells > 1 ? `${the ? 'the' : numArticle(w.cells)} ${fmt(w.cells)}-cell ${spName(w.serial)}` : `${the ? 'the' : article(w.serial)} ${spName(w.serial)} cell`);
  function fateOf(f) {
    if (!f) return ['vanished', 'perhaps built into a new cell'];
    if (f.kind === 0) return ['was eaten', 'what remained is silt'];
    if (f.kind === 3) return [f.cause === 2 ? 'died of old age' : 'starved', 'its skeleton is now stone'];
    return [f.cause === 2 ? 'died of old age' : f.cause === 3 ? 'was killed' : 'starved', 'its body is now a husk'];
  }
  function captionHtml(w, going) {
    const r = (w.reasons || []).map((x) => REASON[x.key]);
    const note = (x) => upper(typeof x[1] === 'function' ? x[1](w.div) : x[1]);
    let eyebrow, main, sub = '';
    if (w.kind === 'wide') {
      if (going) { eyebrow = 'Rising'; main = 'For a view of the whole tide'; }
      else { eyebrow = 'The whole tide'; main = `${fmt(life.counts[3])} living cells in ${fmt(life.alive)} species`; sub = `${esc(climate.name)} · light ${Math.round(eng.ambient * 100)}%`; }
    } else if (w.kind === 'scene') {
      if (going && w.lost) {
        const [verb] = fateOf(w.lost.fate);
        eyebrow = 'Heading on'; main = `To where ${w.lost.cells > 1 ? `a cell of ${organism(w.lost)}` : organism(w.lost)} ${verb}`; sub = 'It was gone before the camera arrived';
      } else if (going) {
        eyebrow = 'Heading to'; main = upper(r[0] ? r[0][0] : 'somewhere quieter'); sub = r[1] ? note(r[1]) : '';
      } else {
        eyebrow = 'In view';
        const sp = (w.species || []).filter((x) => life.reg.has(x.serial)).map((x) => spName(x.serial));
        main = sp.length ? (sp.length > 1 ? `${sp.slice(0, -1).join(', ')} and ${sp[sp.length - 1]}` : sp[0]) : upper(r[0] ? r[0][0] : 'a quiet stretch of water');
        sub = r.slice(0, 2).map(note).join(' · ');
      }
    } else if (w.kind === 'follow') {
      if (w.spotlight) { eyebrow = going ? 'A new species' : 'Following a new species'; main = going ? spName(w.serial) : upper(organism(w)); }
      else { eyebrow = going ? 'Picking out' : 'Following'; main = upper(organism(w)); }
      sub = going && r[0] && !w.spotlight ? note(r[0]) : spDesc(w.serial);
    } else if (w.kind === 'linger') {
      const [verb, after] = fateOf(w.fate);
      eyebrow = 'Lingering';
      main = `${w.cells > 1 ? `A cell of ${organism(w, true)}` : upper(organism(w, true))} ${verb}`;
      sub = upper(after);
    } else return '';
    return `<div class="eyebrow">${eyebrow}</div><div class="cap-main">${main}</div>${sub ? `<div class="cap-sub">${sub}</div>` : ''}`;
  }
  const capEl = $('caption');
  const cap = { key: '', html: '', swapAt: 0, swapped: true };
  function renderCaption(now) {
    const sh = director.active ? director.shot : null;
    const going = sh && sh.t < sh.flight - 0.5;
    const key = sh ? `${sh.id}:${going}:${sh.whyVer}` : '';
    if (key !== cap.key) {
      cap.key = key;
      const html = sh ? captionHtml(sh.why, going) : '';
      if (html !== cap.html) {
        cap.html = html;
        // fade the old words out before the new ones come in
        cap.swapAt = capEl.classList.contains('on') ? now + 800 : now;
        cap.swapped = false;
      }
    }
    if (!cap.swapped) {
      if (now < cap.swapAt) { capEl.classList.remove('on'); return; }
      capEl.innerHTML = cap.html;
      cap.swapped = true;
    }
    capEl.classList.toggle('on', !!(sh && cap.html && sh.t < sh.dur - 2.5));
  }

  function autoCamera(now, dt) {
    if (state.phase !== 'running') return;
    if (!director.active) {
      if (!state.auto) return;
      const reading = sel || spView != null || lab.isOpen();
      if (state.paused || !introHidden || ptr.pointers.size || now - lastInput < (reading ? AUTO_IDLE_READING : AUTO_IDLE)) return;
      startAuto(true);
    }
    const v = director.update(dt / 1000);
    if (!v) return;
    const wMax = viewWidths()[1];
    cam.x = v.x; cam.y = v.y;
    cam.zoom = cam.zoomTarget = clamp(wMax / v.w, 1, maxZoom());
    cam.anchor = null;
  }

  // ------------------------------------------------------------ loop
  let last = performance.now();
  let frameCount = 0;
  let inflight = 0;
  let stepAcc = 0;
  // Steps this frame and their length: whole steps above 1× (fractions carried over), capped so a
  // frame's GPU time stays near MAX_FRAME_MS; one shortened step below 1×.
  function plan() {
    const s = SPEEDS[state.speedIdx];
    if (state.paused || state.phase !== 'running') return { steps: 1, dt: 1 / 60 };
    if (s <= 1) return { steps: 1, dt: s / 60 };
    const cap = perf.stepMs ? clamp(Math.floor(MAX_FRAME_MS / perf.stepMs), 1, 512) : 1;
    if (s === Infinity) return { steps: cap, dt: 1 / 60 };
    stepAcc += s;
    const steps = Math.min(Math.floor(stepAcc), cap);
    stepAcc = Math.min(stepAcc - steps, 1);
    return { steps: Math.max(1, steps), dt: 1 / 60 };
  }
  function frame(now) {
    const dt = Math.min(100, now - last);
    last = now;
    frameCount++;
    if (!state.paused) perf.rafDt.push(dt);
    if (now - perf.fpsT > 500) { perf.fps = (perf.frames * 1000) / (now - perf.fpsT); perf.frames = 0; perf.fpsT = now; }
    if (now - perf.rateT > 1000) {
      const r = (eng.simTime - perf.rateSim) / ((now - perf.rateT) / 1000);
      perf.rate = r >= 0 ? r : perf.rate;
      perf.rateSim = eng.simTime; perf.rateT = now;
    }
    for (let i = frameWaiters.length - 1; i >= 0; i--) if (--frameWaiters[i].n <= 0) { frameWaiters[i].res(); frameWaiters.splice(i, 1); }

    if (!state.busy && inflight < 3) {
      perf.frames++;
      eng.season = seasonAt(eng.simTime);
      const step = plan();
      if (state.phase === 'running' && !state.paused) climate.tick(step.steps * step.dt);
      autoCamera(now, dt);
      renderCaption(now);
      // while filming, the readouts step back to the epoch, the camera and the sound, until the
      // inspector or the Lab is opened
      document.body.classList.toggle('filming', director.active && ins.hidden && !lab.isOpen());
      // and the pointer hides once the mouse has rested a few seconds
      document.body.classList.toggle('cursor-off', director.active && now - lastPtr.moved > 3000);
      if (state.follow && sel) {
        const [px, py] = predicted();
        const k = Math.min(1, dt / 70);
        cam.x += wrapD(px - cam.x, eng.grid[0]) * k;
        cam.y += wrapD(py - cam.y, eng.grid[1]) * k;
      }
      if (Math.abs(cam.zoom - cam.zoomTarget) > 1e-4) {
        const a = cam.anchor || [innerWidth / 2, innerHeight / 2];
        const before = toWorld(a[0], a[1]);
        cam.zoom += (cam.zoomTarget - cam.zoom) * Math.min(1, dt / 90);
        const after = toWorld(a[0], a[1]);
        if (!(state.follow && sel)) { cam.x += before[0] - after[0]; cam.y += before[1] - after[1]; }
      }
      wrapCam();
      const L = loupeGeom();
      canvas.classList.toggle('lens', !!L);
      eng.trackId = sel && !sel.lost ? sel.id : NONE;
      eng.trackId2 = director.active ? director.trackId : NONE;
      drawOverlay(dt, L);
      eng.frame({
        target: ctx.getCurrentTexture().createView(),
        cam: { x: cam.x, y: cam.y, ppu: ppu() },
        paused: state.paused,
        simDt: step.dt,
        steps: step.steps,
        time: now / 1000,
        dpr,
        selId: sel ? sel.id : NONE,
        loupe: L ? { x: L.sx * dpr, y: L.sy * dpr, r: L.R * dpr, ppu: L.cssPPU * dpr, cx: L.cx, cy: L.cy } : null,
        specimen: specimenParams(),
      });
      inflight++;
      device.queue.onSubmittedWorkDone().then(() => { inflight--; }, () => { inflight--; });
      if (sel && frameCount % 10 === 0 && !state.paused) gatherTick(false);
    }
    if (dirty && (sel || spView != null)) renderInspector(false);
    if (eventsPending) renderEvents();
    lab.flush();
    adaptResolution(now);
    if (state.phase === 'running') updateHud(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => { perf.rafDt.length = 0; perf.lastAdjust = performance.now() + 1500; });

  calibrate().then(() => {
    state.phase = 'running';
    renderCensus();
    updateHud(performance.now() + 1000);
    $('intro').classList.add('ready');
    begin();
  }).catch((e) => fail('Could not start the simulation', String(e.message || e)));
}

boot().catch((e) => fail('Something went wrong starting the GPU', String((e && e.message) || e)));
