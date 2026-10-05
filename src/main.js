import { createSound } from './audio/sound.js';
import { V_SCALE } from './audio/listen.js';
import { createEngine, MAXK, FIRST_LIFE } from './engine.js';
import { genomeSerial, readGenome, parseParticle } from './genome.js';
import { seasonAt, createClimate, abioRate } from './climate.js';
import { createLab } from './lab.js';
import { createSpecimen } from './specimen.js';
import { createTips } from './tip.js';
import { drawLiving } from './charts.js';
import { genusName, speciesEpithet } from './names.js';
import { facets, describe, DIET_COL, MOB_COL } from './facets.js';
import { traceBody, retraceBody, settleMembers, nearBody } from './trace.js';
import { PICK_WORDS } from './shaders.js';
import { flowAt } from './flow.js';
import { Director } from './director.js';
import { fmt, fmtClock, fmtDur, esc, cssCol, clamp, term, spLink, ROLE, MATTER, LIVING_CSS } from './fmt.js';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const overlay = $('overlay');
const octx = overlay.getContext('2d');
const isCoarse = matchMedia('(pointer: coarse)').matches;
const NONE = 0xffffffff;
const TAU = Math.PI * 2;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const phone = () => innerWidth <= 720;

function fail(title, detail) {
  $('nogpu-title').textContent = title;
  $('nogpu-detail').textContent = detail;
  $('nogpu').hidden = false;
  $('hud').hidden = true;
  $('intro').hidden = true;
  $('spec').hidden = true;
  $('lab').hidden = true;
}

async function boot() {
  if (!navigator.gpu) {
    fail('This browser has no WebGPU', 'Tidemote simulates its world on your graphics card through WebGPU. Try a current Chrome, Edge or Safari, or Firefox on Windows.');
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
  device.lost.then((info) => { if (info.reason !== 'destroyed') fail('The GPU device was lost', `${info.message || 'The driver reset the device.'} Reload the page to start a new world.`); });
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

// view preferences that outlive the page
const PREFS_KEY = 'tidemote.view';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { return {}; } };
const savePrefs = (p) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ } };

function run(eng, device, ctx, specCtx, hasTS) {
  const K = eng.K;
  const prefs = loadPrefs();
  let lab = null, specimen = null, view = null; // panels, created below
  let dockTop = innerHeight;
  const state = {
    phase: 'calibrating', busy: true, paused: false, speedIdx: SPEEDS.indexOf(1),
    hud: true, follow: false, confirmReset: 0,
    loupe: !isCoarse, loupeMag: 3.5, currents: false, specCells: 3,
    world: prefs.world ?? (innerWidth > 1100 && innerHeight > 600),
  };
  // While a pointer is held down on a panel, nothing re-renders under it: replacing the element
  // between pointerdown and pointerup swallows the click.
  let uiHoldUntil = 0;
  const panelSel = '.panel, .rail, .dock, .focus';
  document.addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest(panelSel)) uiHoldUntil = Infinity; }, true);
  const releaseHold = () => { if (uiHoldUntil === Infinity) uiHoldUntil = performance.now() + 150; };
  document.addEventListener('pointerup', releaseHold, true);
  document.addEventListener('pointercancel', releaseHold, true);
  const uiHeld = () => performance.now() < uiHoldUntil;
  // A button or link clicked with the pointer gives its focus back, so the keyboard shortcuts keep
  // working; keyboard users keep their focus where it is.
  document.addEventListener('click', (e) => {
    if (e.detail === 0) return;
    const el = e.target.closest && e.target.closest('button, a, [tabindex]');
    if (el && !el.matches('input, select, textarea')) setTimeout(() => { if (document.activeElement === el) el.blur(); }, 0);
  }, true);

  const trailLevels = [0, 0.45, 0.7, 0.88];
  const trailNames = ['Off', 'Short', 'Long', 'Exposure'];
  let trailIdx = prefs.trails ?? 1;
  eng.settings.trails = trailLevels[trailIdx];
  for (const k of ['links', 'nodes', 'bloom', 'optics', 'tide']) if (prefs[k] !== undefined) eng.settings[k] = prefs[k];
  const persist = () => {
    savePrefs({ trails: trailIdx, links: eng.settings.links, nodes: eng.settings.nodes, bloom: eng.settings.bloom, optics: eng.settings.optics, tide: eng.settings.tide, world: state.world, auto: state.auto, loupe: state.loupe });
  };
  if (prefs.loupe !== undefined && !isCoarse) state.loupe = prefs.loupe;

  // ------------------------------------------------------------ sizing
  let renderScale = 1;
  let dpr = 1;
  // The scene renders at no more than 1.5 device pixels per CSS pixel: its per-pixel shading is heavy,
  // and a 2x display would quadruple it for little visible gain. Overlay text and lines stay native.
  const SCENE_DPR = 1.5;
  function fit() {
    const base = Math.min(devicePixelRatio || 1, 2);
    dpr = Math.min(base, SCENE_DPR) * renderScale;
    const maxDim = device.limits.maxTextureDimension2D;
    canvas.width = Math.min(maxDim, Math.max(1, Math.round(innerWidth * dpr)));
    canvas.height = Math.min(maxDim, Math.max(1, Math.round(innerHeight * dpr)));
    overlay.width = Math.round(innerWidth * base);
    overlay.height = Math.round(innerHeight * base);
    eng.resize(canvas.width, canvas.height);
    dockTop = $('dock').getBoundingClientRect().top;
  }
  fit();
  addEventListener('resize', () => { fit(); drawWorldChart(); });

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
  // The middle of the part of the screen the panels leave open, as a world offset from the camera:
  // a followed specimen sits there rather than behind the panel.
  function viewOffset() {
    const ins = specimen.inset();
    const top = phone() ? 48 : 52, bot = phone() ? 62 : 56;
    const cx = (innerWidth - ins.right) / 2, cy = (top + innerHeight - Math.max(bot, ins.bottom)) / 2;
    const p = cssPPU();
    return [(innerWidth / 2 - cx) / p, (innerHeight / 2 - cy) / p];
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
  const perf = { samples: [], gpu: 0, fps: 0, frames: 0, fpsT: performance.now(), frameDt: [], lastSubmit: 0, goodWindows: 0, ceiling: 1, ceilingUntil: 0, lastAdjust: performance.now(),
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
      pushEvent(`A new era: <b>${esc(climate.name)}</b> · ${lightWord} to ${Math.round(era.ambient * 100)}% · glint ×${era.charge.toFixed(1)} · currents shift`, 0xffa0e3f1, 'era');
      flash(climate.name, 'New era');
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
    feedKey = '';
    renderFeed();
  }

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
  const calBar = document.querySelector('.intro-rule i');
  const calStep = (text, frac) => { calText.textContent = text; calBar.style.width = `${Math.round(frac * 100)}%`; };
  async function calibrate() {
    const lim = device.limits;
    const hardCap = Math.floor(Math.min(lim.maxStorageBufferBindingSize, lim.maxBufferSize) / 40 / 4096) * 4096;
    const maxN = Math.min(hardCap, 4194304, Math.floor(262144 * K.density * 0.95), window.__MC_MAX || Infinity);
    const target = hasTS ? 7.5 : 9;
    const clampN = (x) => clamp(Math.round(x / 4096) * 4096, Math.min(32768, maxN), maxN);
    let n = await allocDown(Math.min(isCoarse ? 131072 : 262144, maxN));
    seedWorld(n);
    state.busy = false;
    calStep(`Measuring the GPU · ${fmt(n)} particles`, 0.2);
    let t = await measure();
    let next = clampN((n * target) / t);
    if (next > n * 1.2) {
      next = await allocDown(next);
      seedWorld(next);
      state.busy = false;
      calStep(`Measuring the GPU · ${fmt(next)} particles`, 0.6);
      const t2 = await measure();
      n = next;
      t = t2;
      next = clampN((n * target) / t);
      if (next > n) next = Math.min(next, clampN(n * 1.3));
    }
    const final = next === n ? n : await allocDown(next);
    seedWorld(final);
    state.busy = false;
    calStep(`${fmt(final)} particles`, 1);
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
    $('focus').hidden = !focus.key;
    $('focus-label').textContent = focus.label;
  }
  function setFocus(key, label, { pred = null, roleMask = 7, stateMode = 0, matter = [false, false, false] } = {}) {
    Object.assign(focus, { key, label, pred, roleMask, stateMode, matter });
    pushFocus();
    afterFocus();
  }
  function clearFocus() {
    if (!focus.key) return;
    focus.key = null; focus.pred = null;
    pushFocus();
    afterFocus();
  }
  function afterFocus() {
    if (lab) lab.render(true);
    if (specimen) { specimen.invalidate(); dirty = true; }
    renderWorld();
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
    else if (kind === 'mobility') setFocus(key, `Movement: ${val}`, { pred: (g) => facets(g, K).mobility === val });
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
    renderFeed();
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
    if (view) view.render();
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
      drawWorldChart();
    }
    if (focus.key && focus.pred) pushFocus();
    renderWorld();
    lab.render(false);
    if (sel || spView != null) dirty = true;
  };

  // ------------------------------------------------------------ world column
  const MIX = [
    ['Living', 3, LIVING_CSS, 'living', 'class:living'],
    ['Glint', 1, MATTER[1].css, 'glint', 'class:glint'],
    ['Husk', 2, MATTER[2].css, 'husk', 'class:husk'],
    ['Stone', 4, MATTER[3].css, 'stone', 'class:stone'],
    ['Silt', 0, MATTER[0].css, 'silt', 'class:silt'],
  ];
  const mixEl = $('mix');
  mixEl.innerHTML = `<div class="mix-bar" aria-hidden="true">${MIX.map(([, , col]) => `<i style="background:${col}"></i>`).join('')}</div>`
    + MIX.map(([label, , col, , key]) => `<button type="button" class="mix-row" data-focus="${key}" aria-pressed="false"><i style="background:${col}"></i><span>${label}</span><b></b><em></em></button>`).join('');
  mixEl.addEventListener('click', (e) => { const b = e.target.closest('[data-focus]'); if (b) focusFacet(b.dataset.focus); });
  function renderWorld() {
    const N = Math.max(1, eng.count);
    const segs = mixEl.firstChild.children;
    const rows = mixEl.querySelectorAll('.mix-row');
    MIX.forEach(([, i, , , key], k) => {
      const v = life.counts[i];
      segs[k].style.flex = String(Math.max(v, N * 0.004));
      rows[k].setAttribute('aria-pressed', String(focus.key === key));
      rows[k].children[2].textContent = fmt(v);
      rows[k].children[3].textContent = `${((v / N) * 100).toFixed(1)}%`;
    });
    $('n-alive').textContent = fmt(life.alive);
    $('n-thriving').textContent = fmt(life.thriving);
    $('n-ever').textContent = fmt(life.arisen);
    $('n-depth').textContent = fmt(life.maxDepth);
    $('r-living').textContent = fmt(life.counts[3]);
    $('r-species').textContent = fmt(life.alive);
    $('world-sum').textContent = `${fmt(life.counts[3])} living · ${fmt(life.alive)} species`;
  }
  function drawWorldChart() {
    if (!state.world || phone() || !life) return;
    drawLiving($('chart'), life.history, life.reg, climate && climate.history);
    const h = life.history;
    $('hist-span').textContent = h.length > 1 ? `${fmtClock(h[0].t)} – ${fmtClock(h[h.length - 1].t)}` : '';
  }
  let feedKey = '';
  function renderFeed() {
    if (!life || uiHeld()) return;
    const ch = life.chronicle;
    const key = `${ch.length}:${ch[0] ? ch[0].t : 0}`;
    if (key === feedKey) return;
    feedKey = key;
    $('feed').innerHTML = ch.length ? ch.slice(0, 12).map((e) => `<li><i style="background:${cssCol(e.col)}"></i><time>${fmtClock(e.t)}</time><span>${e.html}</span></li>`).join('') : '<li class="quiet">New species, extinctions and eras are logged here.</li>';
  }
  function renderWorldOpen() {
    $('world').classList.toggle('closed', !state.world);
    $('world-toggle').setAttribute('aria-expanded', String(state.world));
    $('world-toggle').setAttribute('aria-label', state.world ? 'Collapse census' : 'Expand census');
    drawWorldChart();
  }
  $('world-toggle').addEventListener('click', () => { state.world = !state.world; persist(); renderWorldOpen(); });
  $('feed-all').addEventListener('click', () => lab.open('log'));
  renderWorldOpen();

  // ------------------------------------------------------------ selection
  let sel = null;
  let spView = null;
  let dirty = false;
  function deselect() {
    sel = null;
    spView = null;
    eng.trackId = NONE;
    state.follow = false;
    if (specimen) specimen.close();
    setMembers(null);
  }
  function toggleFollow() {
    if (!sel) return;
    state.follow = !state.follow;
    if (state.follow) takeOver();
    dirty = true;
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
    const touchR = isCoarse ? 30 : 22;
    const chosen = bestLife && bl < Math.max(touchR, 0.2 * p) ? bestLife : bestAny && ba < Math.max(isCoarse ? 20 : 14, anyR * p) ? bestAny : null;
    if (!chosen) { deselect(); return; }
    beginTracking(chosen, res);
    closeMenus();
  }

  function beginTracking(p, res, keepStory) {
    const oldStory = keepStory && sel ? sel.story : [];
    spView = null;
    sel = { id: p.id, particle: p, sampleT: res.simTime ?? eng.simTime, nbr: res, disp: [p.x, p.y], lost: false, story: oldStory, memory: null, org: null, orgFirst: null, orgNear: null, members: null, rehome: null, diedAt: null, lastOrg: -1e9, lastNbr: -1e9 };
    eng.trackId = p.id;
    specimen.open();
    setMembers(null);
    if (p.kind >= FIRST_LIFE) {
      const g = genomeFor(p.kind);
      const sp = g ? life.reg.get(g.serial) : null;
      sel.org = { cells: 1, roles: [0, 0, 0].map((_, i) => (i === p.role ? 1 : 0)), span: 0, speed: Math.hypot(p.vx, p.vy), meanE: p.energy, partial: false, touching: 0, pending: true };
      remember();
      story(`${keepStory ? 'Now watching' : 'Picked'} a ${ROLE[p.role]}-cell${sp ? ` of ${spLink(sp.serial, sp.name)}` : ''}, age ${fmtDur(p.age)}.`);
    } else {
      story(`Picked a grain of ${MATTER[p.kind].name.toLowerCase()}.`);
    }
    gatherTick(true);
    renderSpecimen(true);
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

  // ------------------------------------------------------------ specimen panel
  specimen = createSpecimen({
    eng, K, state, held: uiHeld,
    life: () => life, sel: () => sel, spView: () => spView, genomeFor, originWord,
    focusKey: () => focus.key, follow: () => state.follow,
    onFollow: toggleFollow,
    onRelative: followRelative,
    onFind: () => findMember(spView),
    onHighlight: () => {
      const serial = spView != null ? spView : sel && genomeFor(sel.particle.kind)?.serial;
      const sp = serial != null && life.reg.get(serial);
      if (!sp) return;
      if (focus.key === `sp:${sp.serial}`) clearFocus(); else focusSpecies(sp);
    },
    onClose: deselect,
  });
  function renderSpecimen(force) {
    if (!sel && spView == null) return;
    dirty = !specimen.render(force);
  }

  function openSpecies(serial) {
    const sp = life.reg.get(serial);
    if (!sp) { flash('That species is no longer on record'); return; }
    sel = null;
    eng.trackId = NONE;
    state.follow = false;
    setMembers(null);
    spView = serial;
    specimen.open();
    if (sp.alive) focusSpecies(sp);
    renderSpecimen(true);
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
    if (cssPPU() < 18) { cam.zoomTarget = clamp((18 * dpr) / fitPPU(), 1, maxZoom()); cam.anchor = null; }
    beginTracking(best, { entries: [], simTime: res.simTime });
    state.follow = true;
    if (phone()) lab.close();
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a.sp');
    if (!a) return;
    e.preventDefault();
    openSpecies(+a.dataset.serial);
  });

  const spec = $('specimen');
  function specimenParams() {
    if (!sel || !specimen.isOpen() || spView != null) return null;
    const r = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(spec.clientWidth * r), h = Math.round(spec.clientHeight * r);
    if (!w || !h) return null;
    if (spec.width !== w || spec.height !== h) { spec.width = w; spec.height = h; }
    const [px, py] = sel.disp;
    return { target: specCtx.getCurrentTexture().createView(), w, h, cx: px, cy: py, ppu: h / state.specCells, dpr: r };
  }
  spec.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.specCells = clamp(state.specCells * Math.exp(e.deltaY * 0.0015), 0.8, 14);
  }, { passive: false });

  // ------------------------------------------------------------ hints
  const tips = createTips($('tip'));

  // ------------------------------------------------------------ lab
  lab = createLab({
    eng, state, held: uiHeld,
    life: () => life, facets: (g) => facets(g, K), groups, climate: () => climate,
    openSpecies, focusFacet,
    focusKey: () => focus.key,
    focusPredicate: (label, pred) => setFocus(`pred:${label}`, label, { pred }),
  });
  $('lab-open').addEventListener('click', () => { closeMenus(); lab.toggle(); });

  // ------------------------------------------------------------ view options
  view = (() => {
    const el = $('view'), opts = $('opts'), btn = $('view-open');
    // one row per option: its name and key on the left, the choices on the right
    const choice = (id, title, key, items, cur, tip) => `<div class="opt"><span class="lbl">${tip ? term(tip, title) : title}${key ? ` <kbd>${key}</kbd>` : ''}</span><div class="row" role="group" aria-label="${title}">${items.map(([v, l]) => `<button type="button" class="chip" data-o="${id}" data-v="${v}" aria-pressed="${String(v) === String(cur)}">${l}</button>`).join('')}</div></div>`;
    const onoff = (id, title, key, on, tip) => choice(id, title, key, [[1, 'On'], [0, 'Off']], on ? 1 : 0, tip);
    function render() {
      if (el.hidden) return;
      const s = eng.settings;
      opts.innerHTML = choice('trails', 'Trails', 'T', trailNames.map((n, i) => [i, n]), trailIdx)
        + choice('tide', 'Light map', 'G', [[0, 'Off'], [1, 'Faint'], [2, 'Full']], s.tide, 'light')
        + (s.tide === 2 ? '<div class="ramp"><span>dark</span><i></i><span>full light</span></div>' : '')
        + onoff('currents', 'Currents', 'W', state.currents)
        + onoff('links', 'Bonds', 'L', s.links, 'bond')
        + onoff('nodes', 'Particles', 'N', s.nodes)
        + onoff('bloom', 'Bloom', 'B', s.bloom > 0)
        + onoff('optics', 'Optics', 'O', s.optics > 0)
        + (isCoarse ? '' : onoff('loupe', 'Loupe', 'M', state.loupe, 'loupe'))
        + onoff('auto', 'Auto when idle', '', state.auto, 'autoidle')
        + (document.fullscreenEnabled && !isCoarse ? onoff('fs', 'Full screen', 'F', !!document.fullscreenElement) : '');
    }
    function set(id, v) {
      const s = eng.settings;
      if (id === 'trails') { trailIdx = v; s.trails = trailLevels[v]; }
      else if (id === 'tide') s.tide = v;
      else if (id === 'currents') state.currents = !!v;
      else if (id === 'links') s.links = !!v;
      else if (id === 'nodes') s.nodes = !!v;
      else if (id === 'bloom') s.bloom = v ? 0.012 : 0;
      else if (id === 'optics') s.optics = v ? 1 : 0;
      else if (id === 'loupe') state.loupe = !!v;
      else if (id === 'auto') { state.auto = !!v; renderAuto(director.active); }
      else if (id === 'fs') toggleFullscreen();
      persist();
      render();
    }
    opts.addEventListener('click', (e) => { const b = e.target.closest('[data-o]'); if (b) set(b.dataset.o, +b.dataset.v); });
    function toggle(on = el.hidden) {
      el.hidden = !on;
      btn.setAttribute('aria-expanded', String(on));
      if (on) { $('help').hidden = true; if (phone()) lab.close(); render(); }
    }
    btn.addEventListener('click', () => toggle());
    $('view-close').addEventListener('click', () => toggle(false));
    return { render, toggle, isOpen: () => !el.hidden };
  })();
  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  }
  document.addEventListener('fullscreenchange', () => view.render());
  function toggleHelp(on = $('help').hidden) { $('help').hidden = !on; if (on) view.toggle(false); }
  $('help-close').addEventListener('click', () => toggleHelp(false));
  function closeMenus() { view.toggle(false); toggleHelp(false); }

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
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    ptr.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptr.pointers.size === 1) { ptr.down = { x: e.clientX, y: e.clientY, loupe: loupeGeom() }; ptr.dragging = false; }
    if (ptr.pointers.size === 2) {
      const [a, b] = [...ptr.pointers.values()];
      ptr.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      ptr.dragging = true;
      takeOver();
    }
    if (view.isOpen() && phone()) view.toggle(false);
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
      if (!state.follow) { cam.x -= ((cx - ptr.pinch.cx) * dpr) / p; cam.y -= ((cy - ptr.pinch.cy) * dpr) / p; }
      zoomAt(d / Math.max(1, ptr.pinch.d), cx, cy);
      ptr.pinch = { d, cx, cy };
      return;
    }
    if (ptr.down && !ptr.dragging && Math.hypot(e.clientX - ptr.down.x, e.clientY - ptr.down.y) > (e.pointerType === 'mouse' ? 5 : 10)) { ptr.dragging = true; takeOver(); }
    if (ptr.dragging) {
      const p = ppu();
      cam.x -= (dxs * dpr) / p; cam.y -= (dys * dpr) / p;
      if (state.follow) { state.follow = false; dirty = true; }
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
    zoomAt(f, e.clientX, e.clientY);
  }, { passive: false });

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    const tag = t && t.tagName;
    if (tag === 'INPUT' && t.type !== 'range' || tag === 'SELECT' || tag === 'TEXTAREA') { if (e.key === 'Escape') t.blur(); return; }
    // a focused control keeps its own keys; everything else is a shortcut
    if ((tag === 'BUTTON' || tag === 'A' || t.getAttribute?.('role') === 'tab' || t.tabIndex >= 0 && t !== document.body) && (e.key === ' ' || e.key === 'Enter')) return;
    if (tag === 'INPUT' && /^Arrow/.test(e.key)) return;
    const k = e.key;
    let handled = true;
    if (k === 'R' && e.shiftKey) {
      if (state.phase !== 'running') return;
      const now = performance.now();
      if (now - state.confirmReset < 2500) { state.confirmReset = 0; seedWorld(eng.count); flash('A new world begins'); }
      else { state.confirmReset = now; flash('Press Shift+R again to discard this world'); }
    }
    else if (k === 't' || k === 'T') { trailIdx = (trailIdx + 1) % trailLevels.length; eng.settings.trails = trailLevels[trailIdx]; flash(`Trails ${trailNames[trailIdx].toLowerCase()}`); persist(); view.render(); }
    else if (k === 'l' || k === 'L') { eng.settings.links = !eng.settings.links; flash(eng.settings.links ? 'Bonds shown' : 'Bonds hidden'); persist(); view.render(); }
    else if (k === 'n' || k === 'N') { eng.settings.nodes = !eng.settings.nodes; flash(eng.settings.nodes ? 'Particles on' : 'Particles off'); persist(); view.render(); }
    else if (k === 'b' || k === 'B') { eng.settings.bloom = eng.settings.bloom > 0 ? 0 : 0.012; flash(eng.settings.bloom ? 'Bloom on' : 'Bloom off'); persist(); view.render(); }
    else if (k === 'o' || k === 'O') { eng.settings.optics = eng.settings.optics > 0 ? 0 : 1; flash(eng.settings.optics ? 'Microscope optics on' : 'Microscope optics off'); persist(); view.render(); }
    else if (k === 'g' || k === 'G') { eng.settings.tide = (eng.settings.tide + 1) % 3; flash(['Light map off', 'Faint light map', 'Light map'][eng.settings.tide]); persist(); view.render(); }
    else if (k === 'w' || k === 'W') { state.currents = !state.currents; flash(state.currents ? 'Currents shown' : 'Currents hidden'); view.render(); }
    else if (k === 'v' || k === 'V') view.toggle();
    else if (k === 'k' || k === 'K') { closeMenus(); lab.toggle(); }
    else if (k === 'm' || k === 'M') { state.loupe = !state.loupe; flash(state.loupe ? 'Loupe on' : 'Loupe off'); persist(); view.render(); }
    else if (k === '[') { state.loupeMag = clamp(state.loupeMag / 1.25, 1.5, 20); flash(`Loupe ×${state.loupeMag.toFixed(1)}`); }
    else if (k === ']') { state.loupeMag = clamp(state.loupeMag * 1.25, 1.5, 20); flash(`Loupe ×${state.loupeMag.toFixed(1)}`); }
    else if (k === 'c' || k === 'C') { if (sel) toggleFollow(); }
    else if (k === 'a' || k === 'A') playAuto();
    else if (k === 's' || k === 'S') toggleSound();
    else if (k === '-' || k === '_') nudgeVolume(-0.1);
    else if (k === '=' || k === '+') nudgeVolume(0.1);
    else if (k === 'Escape') {
      if (!$('help').hidden) toggleHelp(false);
      else if (view.isOpen()) view.toggle(false);
      else if (sel || spView != null) deselect();
      else if (focus.key) clearFocus();
      else if (lab.isOpen()) lab.close();
      else handled = false;
    }
    else if (k === ' ') togglePause();
    else if (k === ',') setSpeed(state.speedIdx - 1);
    else if (k === '.') setSpeed(state.speedIdx + 1);
    else if (k === '/' || k === '<') setSpeed(SPEEDS.indexOf(1));
    else if (k === '>') setSpeed(SPEEDS.length - 1);
    else if (k === 'h' || k === 'H' || k === '?') toggleHelp();
    else if (k === 'i' || k === 'I') { state.hud = !state.hud; $('hud').classList.toggle('off', !state.hud); flash(state.hud ? 'Readouts shown' : 'Readouts hidden'); }
    else if (k === 'f' || k === 'F') toggleFullscreen();
    else if (k === '0') { takeOver(); cam.zoomTarget = 1; cam.anchor = null; }
    else handled = false;
    if (handled) { e.preventDefault(); hideIntro(); }
  });

  // ------------------------------------------------------------ dock and messages
  const flashEl = $('flash');
  let flashTimer = 0;
  function flash(msg) {
    flashEl.textContent = msg;
    flashEl.classList.add('on');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => flashEl.classList.remove('on'), 1500);
  }
  function renderTime() {
    const s = SPEEDS[state.speedIdx];
    const play = $('t-play');
    play.innerHTML = `<svg><use href="#i-${state.paused ? 'play' : 'pause'}"/></svg>`;
    play.setAttribute('aria-label', state.paused ? 'Resume' : 'Pause');
    play.dataset.hint = state.paused ? 'Resume · Space' : 'Pause · Space';
    $('t-speed-v').textContent = state.paused ? 'Paused' : fmtSpeed(s);
    $('t-speed').setAttribute('aria-label', `Speed ${fmtSpeed(s)}${s !== 1 ? ', back to real time' : ''}`);
    $('t-slower').disabled = state.speedIdx === 0;
    $('t-faster').disabled = state.speedIdx === SPEEDS.length - 1;
    $('t-speed').classList.toggle('fast', s > 1 && s !== Infinity);
    $('t-speed').classList.toggle('max', s === Infinity);
  }
  function setSpeed(i) {
    state.speedIdx = clamp(i, 0, SPEEDS.length - 1);
    if (state.paused) state.paused = false;
    stepAcc = 0;
    perf.frameDt.length = 0;
    perf.lastAdjust = performance.now();
    flash(`Speed ${fmtSpeed(SPEEDS[state.speedIdx])}`);
    renderTime();
  }
  function togglePause() {
    state.paused = !state.paused;
    flash(state.paused ? 'Paused' : 'Running');
    renderTime();
  }
  $('t-play').addEventListener('click', togglePause);
  $('t-slower').addEventListener('click', () => setSpeed(state.speedIdx - 1));
  $('t-faster').addEventListener('click', () => setSpeed(state.speedIdx + 1));
  $('t-speed').addEventListener('click', () => (state.paused ? togglePause() : setSpeed(SPEEDS.indexOf(1))));
  renderTime();

  let introHidden = false;
  function hideIntro() { if (introHidden || state.phase !== 'running') return; introHidden = true; $('intro').classList.add('gone'); document.body.classList.add('live'); }
  // The browser blocks the soundtrack until a gesture: hold the new world still until one, so its
  // first moments are heard.
  function begin() {
    if (sound.on && !sound.playing) {
      state.paused = true; renderTime();
      $('intro').classList.add('ask');
      $('begin').focus({ preventScroll: true });
      const go = (e) => {
        removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true);
        if (e.type === 'keydown') { e.stopPropagation(); e.preventDefault(); } // the key only starts the world
        sound.unlock();
        state.paused = false; renderTime();
        $('begin').blur();
        hideIntro();
      };
      addEventListener('pointerdown', go, true); addEventListener('keydown', go, true);
    } else setTimeout(hideIntro, 3500);
  }

  // ------------------------------------------------------------ rail
  const segs = $('light-seg');
  segs.innerHTML = '<i></i>'.repeat(10);
  const wave = $('tide-wave');
  wave.querySelector('.wave').setAttribute('d', Array.from({ length: 31 }, (_, i) => `${i ? 'L' : 'M'}${i * 2},${(8 - 6 * Math.sin((i / 30) * TAU)).toFixed(2)}`).join(''));
  let hudT = 0;
  const setText = (id, v) => { const el = $(id); if (el.textContent !== v) el.textContent = v; };
  function updateHud(now) {
    if (now - hudT < 250) return;
    hudT = now;
    setText('epoch', fmtClock(eng.simTime));
    setText('era', climate.name);
    setText('era-n', `Era ${String(climate.index).padStart(2, '0')}`);
    const L = Math.round(eng.ambient * 100);
    setText('light-v', `${L}%`);
    [...segs.children].forEach((s, i) => s.classList.toggle('on', i < Math.round(eng.ambient * 20)));
    const ph = ((eng.simTime % 300) + 300) % 300 / 300;
    const dot = wave.querySelector('.dot');
    dot.setAttribute('cx', (ph * 60).toFixed(1));
    dot.setAttribute('cy', (8 - 6 * Math.sin(ph * TAU)).toFixed(2));
    setText('tide-v', `${Math.round(eng.season * 100)}%`);
    $('g-tide').setAttribute('aria-label', `Tide ${Math.round(eng.season * 100)}%, ${seasonAt(eng.simTime + 5) >= seasonAt(eng.simTime) ? 'rising' : 'ebbing'}`);
    $('g-light').setAttribute('aria-label', `Light ${L}%`);
    tips.check();
    const want = SPEEDS[state.speedIdx];
    const actual = state.paused ? '' : want === Infinity || perf.rate < want * 0.9 ? `×${perf.rate < 10 ? perf.rate.toFixed(1) : Math.round(perf.rate)} actual` : '';
    setText('t-rate', actual);
    setText('sys', `${fmt(eng.count)} particles · ${perf.fps ? perf.fps.toFixed(0) : '–'} fps · ${perf.gpu ? perf.gpu.toFixed(1) : '–'} ms${renderScale < 1 ? ` · render ${Math.round(renderScale * 100)}%` : ''}`);
  }

  function adaptResolution(now) {
    // Running fast spends the frame on simulation on purpose; only adapt at real time or slower.
    // Judged by the interval between submitted frames, not requestAnimationFrame's: while the GPU
    // lags, rAF keeps its cadence and the frames are skipped (inflight), so rAF alone looks smooth.
    if (state.phase !== 'running' || SPEEDS[state.speedIdx] > 1 || now - perf.lastAdjust < 2000 || perf.frameDt.length < 30) return;
    // the mean, not the median: on a 60 Hz display each interval is 16.7 or 33.3 ms, and the median
    // stays at 16.7 until more than half the frames are missed
    const m = perf.frameDt.reduce((a, b) => a + b, 0) / perf.frameDt.length;
    perf.frameDt.length = 0;
    perf.lastAdjust = now;
    // the further behind, the larger the step: pixel cost scales with the square of the scale
    if (m > 18.8 && renderScale > 0.5) {
      // a scale that just proved too slow is not tried again for a while, so the view doesn't
      // keep climbing back into the same stutter
      perf.ceiling = renderScale; perf.ceilingUntil = now + 30000;
      renderScale = Math.max(0.5, renderScale * clamp(Math.sqrt(16.7 / m), 0.7, 0.9)); perf.goodWindows = 0; fit();
    } else if (m < 17.2) {
      perf.goodWindows++;
      const cap = now < perf.ceilingUntil ? perf.ceiling * 0.95 : 1;
      const next = Math.min(1, renderScale * 1.12, cap);
      if (perf.goodWindows >= 3 && next > renderScale + 0.01) { renderScale = next; perf.goodWindows = 0; fit(); }
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

  // ------------------------------------------------------------ overlay
  function drawCurrents() {
    const step = 48;
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
      octx.strokeStyle = `rgba(127,214,223,${0.25 + 0.45 * (m / maxV)})`;
      octx.beginPath();
      octx.moveTo(sx - ux * len * 0.3, sy - uy * len * 0.3); octx.lineTo(ex, ey);
      octx.lineTo(ex - ux * 4 - uy * 3, ey - uy * 4 + ux * 3);
      octx.moveTo(ex, ey);
      octx.lineTo(ex - ux * 4 + uy * 3, ey - uy * 4 - ux * 3);
      octx.stroke();
    }
  }

  // a scale bar and coordinate ticks along the bottom of the view: how big a grid cell is right now
  const NICE = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50];
  function drawScale() {
    if (!state.hud || director.active && !phone()) return;
    const p = cssPPU();
    const y = dockTop - 1;
    // ticks at whole grid cells (or coarser) along the dock's top edge
    const unit = NICE.find((u) => u * p >= 14) || 50;
    const [wx0] = toWorld(0, 0);
    const first = Math.ceil(wx0 / unit) * unit;
    octx.fillStyle = 'rgba(150,222,230,0.45)';
    for (let wx = first, i = 0; i < 400; wx += unit, i++) {
      const sx = innerWidth / 2 + (wx - cam.x) * p;
      if (sx > innerWidth) break;
      const major = Math.abs(Math.round(wx / (unit * 5)) * unit * 5 - wx) < unit * 0.01;
      octx.fillRect(Math.round(sx), y - (major ? 6 : 3), 1, major ? 6 : 3);
    }
    if (phone()) return;
    const len = NICE.find((u) => u * p >= 50) || 50;
    const w = len * p, x1 = innerWidth - 24 - (specimen.isOpen() ? specimen.inset().right : 0), x0 = x1 - w, by = y - 16;
    octx.fillStyle = 'rgba(226,241,240,0.85)';
    octx.fillRect(x0, by, w, 1);
    octx.fillRect(x0, by - 4, 1, 5); octx.fillRect(x1 - 1, by - 4, 1, 5);
    octx.font = '500 10px Saira, system-ui, sans-serif';
    octx.textAlign = 'right';
    octx.fillText(`${len < 1 ? len : fmt(len)} cell${len === 1 ? '' : 's'}`, x0 - 8, by + 3);
    octx.textAlign = 'left';
  }

  function drawOverlay(dt, L) {
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    const r = overlay.width / innerWidth;
    octx.setTransform(r, 0, 0, r, 0, 0);
    if (state.currents) drawCurrents();
    drawScale();
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
      if (visible) drawMarker(sx, sy, inLens);
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
      octx.lineCap = 'butt';
    }
  }
  // the picked particle: orange corner brackets and a leader to its name
  function drawMarker(sx, sy, inLens) {
    const lost = sel.lost;
    const R = 11, c = 5;
    octx.lineWidth = 1.25;
    octx.strokeStyle = lost ? 'rgba(255,255,255,0.35)' : 'rgba(255,95,58,0.95)';
    octx.beginPath();
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { octx.moveTo(sx + dx * R, sy + dy * (R - c)); octx.lineTo(sx + dx * R, sy + dy * R); octx.lineTo(sx + dx * (R - c), sy + dy * R); }
    octx.stroke();
    if (inLens || lost) return;
    const p = sel.particle;
    const g = p.kind >= FIRST_LIFE ? genomeFor(p.kind) : null;
    const sp = g && life.reg.get(g.serial);
    const name = sp ? sp.name : p.kind < FIRST_LIFE ? MATTER[p.kind].name : '';
    if (!name) return;
    const left = sx > innerWidth * 0.62 && !phone() || sx > innerWidth - 160;
    const ex = sx + (left ? -1 : 1) * (R + 14), ey = sy - R - 14;
    octx.strokeStyle = 'rgba(255,95,58,0.75)';
    octx.lineWidth = 1;
    octx.beginPath(); octx.moveTo(sx + (left ? -R : R), sy - R); octx.lineTo(ex, ey); octx.lineTo(ex + (left ? -1 : 1) * 10, ey); octx.stroke();
    octx.font = '500 11px Saira, system-ui, sans-serif';
    const label = name.toUpperCase();
    octx.letterSpacing = '1.5px';
    const tw = octx.measureText(label).width;
    const tx = left ? ex - 14 - tw : ex + 14;
    octx.fillStyle = 'rgba(6,9,10,0.7)';
    octx.fillRect(tx - 4, ey - 9, tw + 8, 16);
    octx.fillStyle = 'rgba(226,241,240,0.95)';
    octx.fillText(label, tx, ey + 3.5);
    octx.letterSpacing = '0px';
  }

  // ------------------------------------------------------------ auto camera
  // Left alone for a minute (three with the specimen or the Lab open), the view is handed to the
  // director (director.js), which films the world until the user clicks, drags or scrolls the view.
  const AUTO_IDLE = 60e3, AUTO_IDLE_READING = 180e3;
  state.auto = prefs.auto ?? (() => { try { return localStorage.getItem('tidemote.autoCamera') !== 'off'; } catch { return true; } })();
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
  function renderAuto(live) {
    eng.survey = state.auto || live ? { every: 45 } : null;
    const b = $('auto-play');
    b.setAttribute('aria-pressed', String(!!live));
    b.setAttribute('aria-label', live ? 'Stop the auto camera' : 'Start the auto camera');
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
    if (phone() && lab.isOpen()) lab.close();
    closeMenus();
    director.start({ x: cam.x, y: cam.y, w: viewWidths()[1] / cam.zoom });
    renderAuto(true);
  }
  function playAuto() {
    if (director.active) { takeOver(); flash('Auto camera off'); }
    else if (state.phase === 'running') { startAuto(false); flash('Auto camera'); }
  }
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
      if (going) { eyebrow = 'Rising'; main = 'For a view of the whole world'; }
      else { eyebrow = 'The whole world'; main = `${fmt(life.counts[3])} living cells in ${fmt(life.alive)} species`; sub = `${esc(climate.name)} · light ${Math.round(eng.ambient * 100)}%`; }
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
    return `<div class="cap-eye">${eyebrow}</div><div class="cap-rule" aria-hidden="true"></div><div class="cap-main">${main}</div>${sub ? `<div class="cap-sub">${sub}</div>` : ''}`;
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
    // centred in the part of the view the panels leave open
    const l = lab.isOpen() && !phone() ? $('lab').getBoundingClientRect().right : 0;
    const r = specimen.inset().right;
    const x = `${Math.round((l + innerWidth - r) / 2)}px`;
    if (capEl.style.left !== x) capEl.style.left = x;
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
    const capN = perf.stepMs ? clamp(Math.floor(MAX_FRAME_MS / perf.stepMs), 1, 512) : 1;
    if (s === Infinity) return { steps: capN, dt: 1 / 60 };
    stepAcc += s;
    const steps = Math.min(Math.floor(stepAcc), capN);
    stepAcc = Math.min(stepAcc - steps, 1);
    return { steps: Math.max(1, steps), dt: 1 / 60 };
  }
  function frame(now) {
    const dt = Math.min(100, now - last);
    last = now;
    frameCount++;
    if (now - perf.fpsT > 500) { perf.fps = (perf.frames * 1000) / (now - perf.fpsT); perf.frames = 0; perf.fpsT = now; }
    if (now - perf.rateT > 1000) {
      const r = (eng.simTime - perf.rateSim) / ((now - perf.rateT) / 1000);
      perf.rate = r >= 0 ? r : perf.rate;
      perf.rateSim = eng.simTime; perf.rateT = now;
    }
    for (let i = frameWaiters.length - 1; i >= 0; i--) if (--frameWaiters[i].n <= 0) { frameWaiters[i].res(); frameWaiters.splice(i, 1); }

    if (!state.busy && inflight < 3) {
      perf.frames++;
      if (perf.lastSubmit) perf.frameDt.push(Math.min(50, now - perf.lastSubmit));
      perf.lastSubmit = now;
      eng.season = seasonAt(eng.simTime);
      const step = plan();
      if (state.phase === 'running' && !state.paused) climate.tick(step.steps * step.dt);
      autoCamera(now, dt);
      renderCaption(now);
      // while filming, the readouts step back to the clock, the caption and the dock, until the
      // specimen or the Lab is opened
      document.body.classList.toggle('filming', director.active && !specimen.isOpen() && !lab.isOpen());
      // and the pointer hides once the mouse has rested a few seconds
      document.body.classList.toggle('cursor-off', director.active && now - lastPtr.moved > 3000);
      if (state.follow && sel) {
        const [px, py] = predicted();
        const [ox, oy] = viewOffset();
        const k = Math.min(1, dt / 70);
        cam.x += wrapD(px + ox - cam.x, eng.grid[0]) * k;
        cam.y += wrapD(py + oy - cam.y, eng.grid[1]) * k;
      }
      if (Math.abs(cam.zoom - cam.zoomTarget) > 1e-4) {
        const a = state.follow && sel ? toScreen(sel.disp[0], sel.disp[1]) : cam.anchor || [innerWidth / 2, innerHeight / 2];
        const before = toWorld(a[0], a[1]);
        cam.zoom += (cam.zoomTarget - cam.zoom) * Math.min(1, dt / 90);
        const after = toWorld(a[0], a[1]);
        cam.x += before[0] - after[0]; cam.y += before[1] - after[1];
      }
      wrapCam();
      const L = loupeGeom();
      canvas.classList.toggle('lens', !!L);
      eng.trackId = sel && !sel.lost ? sel.id : NONE;
      eng.trackId2 = director.active ? director.trackId : NONE;
      drawOverlay(dt, L);
      specimen.drawViewerUI(now);
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
    if (dirty && (sel || spView != null)) renderSpecimen(false);
    renderFeed();
    lab.render(false);
    adaptResolution(now);
    if (state.phase === 'running') updateHud(now);
    requestAnimationFrame(frame);
  }

  resetLife();
  resetClimate();
  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => { perf.frameDt.length = 0; perf.lastSubmit = 0; perf.lastAdjust = performance.now() + 1500; });

  calibrate().then(() => {
    state.phase = 'running';
    renderWorld();
    updateHud(performance.now() + 1000);
    $('intro').classList.add('ready');
    begin();
  }).catch((e) => fail('Could not start the simulation', String(e.message || e)));
}

boot().catch((e) => fail('Something went wrong starting the GPU', String((e && e.message) || e)));
