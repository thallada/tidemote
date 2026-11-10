import { createSound, songClip } from './audio/sound.js';
import { voiceOf } from './audio/mapping.js';
import { signalAt } from './audio/motif.js';
import { V_SCALE } from './audio/listen.js';
import { createEngine, MAXK, FIRST_LIFE, MAX_STEPS, compactState } from './engine.js';
import { genomeSerial, readGenome, writeGenome, parseParticle, thermalGuild, dietGuild } from './genome.js';
import { seasonAt, createClimate, abioRate, EVENT_TYPES, EVENT_NAME, excursionAt, eraName } from './climate.js';
import { countPools } from './geography.js';
import { createLab } from './lab.js';
import { createSpecimen } from './specimen.js';
import { section, block, wireTabRow } from './ui.js';
import { setText as setLive, setHTML } from './live.js';
import { createTips } from './tip.js';
import { drawLiving, chartPointer } from './charts.js';
import { genusName, speciesEpithet, roman } from './names.js';
import { record, seal } from './lineage/model.js';
import { createWorldStore, encodeWorld, decodeWorld, SAVE_VERSION, openable, WHY_NOT } from './worlds.js';
import { facets, describe, DIET_COL, MOB_COL, FACET_NAME } from './facets.js';
import { retraceBody, settleMembers, nearBody, largestBody, bodyPatch } from './trace.js';
import { PICK_WORDS, WATCH_MAX, stoneGrain, MAX_CELLS, SIM_CLOCK, G_WORDS, DEFAULT_K, P_BYTES, TUBE_N, TUBE_K, STUDIO_N, PIPETTE_DOF, CYST, NOTE_TG } from './shaders.js';
import { flowAt, tideAt, duckShade } from './flow.js';
import { DARKFIELD, packLook } from './look.js';
import { MIX as SOUND_MIX, defaultMix } from './audio/mix.js';
import { startLoader } from './loader.js';
import { Director } from './director.js';
import { Notes } from './notes.js';
import { createNoteView } from './noteview.js';
import { createChronicler, watchMap, durWords } from './chronicler.js';
import { earned } from './achievements.js';
import { createCards, strangerCard, PORTRAIT_BOX, PORTRAIT_SHOWN, CARD_SCALE, CARD_W, CARD_H } from './card.js';
import { createFilm, clearFilms } from './film.js';
import { parseMind, interpretMind, settleMind } from './mind.js';
import { createHand, REACH, reachStep, toolOf, TOOLS, works, INSTRUMENTS } from './hand.js';
import { createBench } from './bench.js';
import { createLadder } from './ladder.js';
import { createPipette, setDownJob, mergeJobs, bodiesOf, PIPE_LIMIT } from './pipette.js';
import { miniCard, setThumb, hasThumb, dropThumb } from './minicard.js';
import { stage, bodyOf, portraitCells } from './studio.js';
import { studioPortrait } from './studiorender.js';
import { encodeImages, encodeBytes } from './encode.js';
import { KNOBS, decide, costOf } from './tuner.js';
import { trackGlass } from './glass.js';
import { isRideKey, keyWay, pointerWay, createThrottle, stepThrottle, throttleGrip, createRideCam, stepRideCam, willSpeed } from './ride.js';
import { createCabinetStore, encodeCard, decodeCard, cardLink, cardFromHash, cardFromPng, cardIntoPng } from './cabinet.js';
import { fmt, fmtClock, fmtDur, kfmt, when, esc, cssCol, clamp, term, spLink, saveFile, ROLE, MATTER, LIVING_CSS, cellRadius, fmtLen, NICE_UM, UM_PER_UNIT } from './fmt.js';
import { tr, LOCALE } from './i18n.js';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const overlay = $('overlay');
const octx = overlay.getContext('2d');
const isCoarse = matchMedia('(pointer: coarse)').matches;
// a touch screen with no mouse: no pointer hovers, so the loupe goes where a tap sets it, and the page opens with no
// tool in hand
const touchOnly = !matchMedia('(any-hover: hover)').matches;
// A phone or tablet: its GPU slows by a third or more once it has run hot for a few minutes (thermal
// throttling), and shares the GPU with the screen's compositor.
const throttles = navigator.userAgentData?.mobile ?? (/Android|iPhone|iPad|Mobile/.test(navigator.userAgent) || (isCoarse && !matchMedia('(any-pointer: fine)').matches));
// the tuner's knobs as Settings → Performance names them, and each level's name (cheapest first, as KNOBS' ladders)
// i18n: Settings → Perf → Detail: each choice's title, and its levels from least to most (the sea's waves worked out never, every fourth or second frame, or every frame; the stone lit again every 2, 1 or ½ seconds)
const TUNE_TITLES = { sea: tr('settings.perf.tune.sea', 'Water motion'), bloom: tr('settings.perf.tune.bloom', 'Bloom'), specks: tr('settings.perf.tune.specks', 'Specks'), stone: tr('settings.perf.tune.stone', 'Stone light'), finish: tr('settings.perf.tune.finish', 'Finish'), interiors: tr('settings.perf.tune.interiors', 'Cell insides') };
const TUNE_OFF = tr('settings.off', 'Off'), TUNE_ON = tr('settings.on', 'On'), TUNE_FULL = tr('settings.perf.tune.full', 'Full');
const TUNE_NAMES = { sea: [TUNE_OFF, tr('settings.perf.tune.sea.quarter', '¼'), tr('settings.perf.tune.sea.half', '½'), TUNE_FULL], bloom: [TUNE_OFF, TUNE_ON], specks: [TUNE_OFF, TUNE_ON],
  stone: [tr('settings.perf.tune.stone.2s', '2 s'), tr('settings.perf.tune.stone.1s', '1 s'), tr('settings.perf.tune.stone.half-s', '½ s')],
  finish: [tr('settings.perf.tune.finish.plain', 'Plain'), tr('settings.perf.tune.finish.still', 'Still'), TUNE_FULL], interiors: [TUNE_OFF, TUNE_ON] };
const NONE = 0xffffffff;
const TAU = Math.PI * 2;
const genomeOfWords = (w) => { const u = Uint32Array.from(w); return readGenome(u, new Float32Array(u.buffer), 0); };
// a key of its own for a saved world (w) or card (c)
const newKey = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const genomeWords = (g) => { const u = new Uint32Array(G_WORDS); writeGenome(u, new Float32Array(u.buffer), 0, g); return [...u]; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const phone = () => innerWidth <= 720;
// the intro's animation while the shaders compile and the GPU is measured (drawn on the CPU)
const stopLoader = startLoader($('intro-anim'));

// The screen for a world that cannot go on: why, then what can be done. With actions (buttons, each
// { label, run(button) }) it covers the page and leaves it as it was, for a way back; without, it is a
// browser that cannot run Tidemote at all, and says what Tidemote is instead.
const RELOAD = { label: tr('err.reload', 'Reload the page'), run: () => location.reload() };
function fail(title, detail, actions = []) {
  $('nogpu-title').textContent = title;
  $('nogpu-detail').textContent = detail;
  const act = $('nogpu-act');
  act.replaceChildren(...actions.map(({ label, run }) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.onclick = () => run(b);
    return b;
  }));
  act.hidden = !actions.length;
  $('nogpu').classList.toggle('stopped', actions.length > 0);
  $('nogpu').hidden = false;
  if (actions.length) { act.firstChild.focus(); return; }
  $('hud').hidden = true;
  $('intro').hidden = true;
  stopLoader();
  $('spec').hidden = true;
  $('lab').hidden = true;
}

// A reload can begin before the GPU has let go of the last page's world (Android's browsers especially): the new
// device is then lost while the shaders compile ("Instance dropped"). Boot tries again on a fresh device a few
// times before saying anything; a real shader error is reported at once.
// how long the page took to start, in ms from navigation: the GPU device, the engine (its shaders
// compiled, or found in the browser's shader cache), and the world running (Settings → Performance → Copy profile)
const bootTimes = {};
// A workaround for a Chrome bug: its WebGPU shader cache (one 6 MiB in memory per profile, every site
// shared) is filled at startup newest first, older entries pushing newer ones out, and the disk copy keeps
// an old version's: after an update every visit compiled the largest pipelines again (lifeMain..., about 3
// s rather than 0.6), indefinitely. So the first visit with changed shaders has the site clear its cache
// (fresh-shaders.txt answers with Clear-Site-Data: "cache", site/_headers). That visit still runs on what
// the GPU process had loaded before the page could act, and the next one compiles what the clear took; from
// the third on, loads find everything (docs/desktop.md "Shader cache"). The clear also empties other sites'
// shader caches in that Chrome profile (Chrome ignores the origin there) and this site's HTTP cache, once
// per shader change; saves and settings stay. The desktop app empties its cache itself (desktop/main.js); a
// failed fetch (offline, a file:// page) is ignored.
/* global __TIDEMOTE_SHADERS__ */
async function freshShaders() {
  const key = 'tidemote.shaders';
  try {
    if (globalThis.tidemoteDesktop || !/^https?:$/.test(location.protocol) || typeof __TIDEMOTE_SHADERS__ === 'undefined') return;
    if (localStorage.getItem(key) === __TIDEMOTE_SHADERS__) return;
    const res = await Promise.race([fetch('fresh-shaders.txt', { cache: 'no-store' }), new Promise((r) => setTimeout(r, 2000))]);
    if (res) localStorage.setItem(key, __TIDEMOTE_SHADERS__); // asked (a server without the file: nothing to clear)
  } catch { /* storage or network unavailable: compile as usual */ }
}
async function boot(tries = 4) {
  if (tries === 4) await freshShaders();
  if (!navigator.gpu) {
    // Safari offers WebGPU only on macOS/iOS/iPadOS 26 and later; on earlier systems even Safari 26+ has
    // no navigator.gpu and no feature flag brings it (its "WebGPU support for HDR" flag is something else)
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const safari = /AppleWebKit/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|OPR\/|Android/.test(ua);
    if (safari && ios) fail(tr('err.no-webgpu.safari-ios', 'Safari has WebGPU from iOS 26'), tr('err.no-webgpu.safari-ios.detail', 'Tidemote simulates its world on your graphics card through WebGPU, which Safari offers from iOS and iPadOS 26. Update the system to run it here.'));
    else if (safari) fail(tr('err.no-webgpu.safari-mac', 'Safari has WebGPU from macOS 26'), tr('err.no-webgpu.safari-mac.detail', 'Tidemote simulates its world on your graphics card through WebGPU, which Safari offers only on macOS 26 Tahoe and later, whatever its own version. On an earlier macOS, open Tidemote in Chrome or Edge, or update macOS.'));
    else fail(tr('err.no-webgpu', 'This browser has no WebGPU'), tr('err.no-webgpu.detail', 'Tidemote simulates its world on your graphics card through WebGPU. Try a current Chrome or Edge, Safari on macOS 26 or iOS 26, or Firefox on Windows.'));
    return;
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) { fail(tr('err.no-adapter', 'No GPU adapter available'), tr('err.no-adapter.detail', 'WebGPU is present but no graphics adapter was offered. Hardware acceleration may be turned off in your browser settings.')); return; }
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
  bootTimes.device = Math.round(performance.now());
  let started = false;
  device.lost.then((info) => { if (started && info.reason !== 'destroyed') fail(tr('err.device-lost', 'The GPU device was lost'),
    // i18n: {why} is the driver's own words (English, from the browser) or err.device-lost.reset
    tr('err.device-lost.detail', '{why} The world was on it and is gone; reload the page to start a new one.', { why: info.message || tr('err.device-lost.reset', 'The driver reset the device.') }), [RELOAD]); });
  device.addEventListener('uncapturederror', (e) => console.error('[tidemote]', e.error.message));

  const format = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext('webgpu');
  // (the panels' glass is blurred from a copy of the frame: Engine.setGlass)
  ctx.configure({ device, format, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  const specCtx = $('specimen').getContext('webgpu');
  specCtx.configure({ device, format, alphaMode: 'opaque' });
  // #k={"shade":0.1} opens the page with tunables overridden (DEFAULT_K), to watch a variant live
  let K = {};
  const kHash = /[#&]k=([^&]*)/.exec(location.hash);
  if (kHash) { try { K = JSON.parse(decodeURIComponent(kHash[1])); } catch { console.warn('[tidemote] ignoring a #k= that is not JSON'); } }
  let eng;
  // a device lost mid-compile may leave getCompilationInfo waiting forever
  const lostWhile = device.lost.then((info) => { throw new Error(`device lost while compiling: ${info.message || info.reason}`); });
  lostWhile.catch(() => {});
  // the shaders' compile fills the first half of the loading bar (calibrate the rest)
  const bar = document.querySelector('.intro-rule i');
  const onProgress = (f) => { $('calib').textContent = tr('intro.compiling', 'Compiling shaders'); bar.style.width = `${Math.round(f * 50)}%`; };
  try { eng = await Promise.race([createEngine(device, format, { hasTimestamps: hasTS, K, onProgress, late: true }), lostWhile]); }
  catch (e) {
    const msg = String(e.message || e);
    if (tries > 1 && !/^(Shader compile failed|unknown tunables)/.test(msg)) {
      console.warn('[tidemote] starting the GPU again:', msg);
      device.destroy();
      await new Promise((r) => setTimeout(r, 600));
      return boot(tries - 1);
    }
    fail(tr('err.compile', 'The simulation failed to compile'), msg);
    return;
  }
  started = true;
  bootTimes.engine = Math.round(performance.now());
  run(eng, device, ctx, specCtx, hasTS);
}

// Time multipliers of real time. Infinity is "Max": as fast as the GPU goes. Speeds above 1× are
// offered only up to what the GPU can sustain (sustainable()).
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4, 8, 16, 32, 64, 128, 256, 512, Infinity];
const MAX_FRAME_MS = 30; // GPU time a frame may take when running fast (about 30 fps)
const MAX_STEP_MS = 40; // GPU time one step may take at Max (its ticks chosen to fit: updateTicks)
// A fast speed the GPU can't reach in 1/60 s steps takes coarse steps instead, of up to MAX_TICKS/60 s:
// as many steps a second, each covering more time (docs/fast-forward.md: to 6 they keep the ecology;
// at 8 beating bodies tear).
// Fast speeds that can't afford to draw the world every display frame, coarse ones and Max draw it about
// every MAX_FRAME_MS; the camera keeps the display's rate.
const MAX_TICKS = 6;
const SIGNAL_AFTER = 60; // seconds a species singing the five tones must live before it is heard
const H = 1 / 60; // the simulation's step, as in the headless runs
// Past the speeds on offer, two ways to run as fast as the GPU goes: "Fast" draws the world every frame, in
// between steps (LERP_WGSL), "Max" about every MAX_FRAME_MS, which leaves the steps more of the GPU (faster
// where drawing costs much: big worlds, big screens). Both are speed Infinity; fastMode tells them apart.
let fastMode = false;
// a stop on the speed ladder: a speed, or 'fast' (Infinity drawn every frame)
// i18n: a stop on the speed ladder: as fast as the GPU goes drawn every frame (Fast) or seldom (Max), or {v} times real time
const fmtStop = (v) => (v === 'fast' ? tr('speed.fast', 'Fast') : v === Infinity ? tr('speed.max', 'Max') : tr('speed.times', '×{v}', { v }));
// A new world opens with little life, a few colonies in open water (docs/founding.md): its first WARM_UNTIL
// seconds run at Fast (as fast as the GPU goes, the world drawn every frame, so the colonies spreading show
// smoothly), with a notice saying why, then real time. Choosing a speed with the time controls ends the warm-up
// (Max to hurry it, real time to skip it); a pause only holds it. A loaded world never warms up.
const WARM_UNTIL = 120;
// The fewest particles a world is made with (Auto's measure and Settings' smallest): 8k for the weakest phones (4k
// worlds collapse, docs/performance.md)
const MIN_PARTICLES = 8192;
const PARTICLE_SIZES = [8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576, 2097152, 4194304, 8388608].filter((n) => n >= MIN_PARTICLES);
// the pool's events as a fresh page has them (Settings → Climate): all on
const EVENTS_ON = () => ({ on: true, ...Object.fromEntries(EVENT_TYPES.map((x) => [x, true])) });

// view preferences that outlive the page
const PREFS_KEY = 'tidemote.view';
const CELL_MARK = 'rgba(241,227,160,0.95)'; // the watched cell, inside its organism's (orange) brackets
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { return {}; } };
const savePrefs = (p) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ } };

function run(eng, device, ctx, specCtx, hasTS) {
  const K = eng.K;
  const prefs = loadPrefs();
  let lab = null, specimen = null, view = null; // panels, created below
  let dockTop = innerHeight, railBottom = 0;
  // The Field Lab's right edge and the specimen panel's inset, read once a page frame (pageFrame): the lens's readout,
  // the labels, the caption, the annotations and the follow camera each ask, and every getBoundingClientRect after the
  // panels' writes in a frame forces a layout of its own (they see a panel moved since the frame's first read a frame on)
  let pageFrame = 0, edgesAt = -1, labEdge = 0, specEdge = null;
  function readEdges() { if (edgesAt === pageFrame) return; edgesAt = pageFrame; labEdge = $('lab').getBoundingClientRect().right; specEdge = specimen.inset(); }
  const labRight = () => { readEdges(); return labEdge; };
  const specInset = () => { readEdges(); return specEdge; };
  const state = {
    phase: 'calibrating', busy: true, paused: false, speed: 1, warm: false,
    hud: true, follow: false, confirmReset: 0,
    ui: isCoarse || (prefs.ui ?? true), // the interface shown (U hides everything but the world and the loupe)
    loupeMag: 3.5, loupeR: prefs.loupeR ?? null, currents: prefs.currents ?? false, specCells: 3,
    // the Field Lab's column, open or folded to its header ("world": its name when it was the census)
    labOpen: prefs.labOpen ?? prefs.world ?? (innerWidth > 1100 && innerHeight > 600),
    closeup: prefs.closeup ?? true,
    // the pool's events (docs/catastrophes.md): all on, or off, or some of them
    events: { ...EVENTS_ON(), ...prefs.events },
    songMarks: prefs.songMarks ?? 1, // mark the cells that sing: 0 off, 1 the picked species, 2 all
    notes: prefs.notes ?? 1, // live annotations (docs/annotations.md): 0 off, 1 with the auto camera, 2 always
    water: prefs.water ?? 2, // the water's surface: 0 off, 1 subtle, 2 normal, 3 strong (applyWater)
    waves: prefs.waves ?? 1, // its waves' motion: 0 slow, 1 normal, 2 lively
    look: prefs.look ?? 2, // the microscope's look (applyLook): 0 off, 1 subtle, 2 normal, 3 strong
    grain: prefs.grain ?? 1, // its film grain: 0 off, 1 fine, 2 heavy
    // what the page may spend: render scale ('auto' adapts between floor and 1), the most device
    // pixels per CSS pixel ('auto' by default, and for prefs saved before v3, which stored the old
    // default 1.5 without anyone choosing it), the frame rate aimed for ('auto' by default, and for
    // prefs saved before v4 with the old default 60 or before v2; 0: the display's), and a fixed
    // particle count
    perf: { scale: prefs.scale ?? 'auto', floor: prefs.floor ?? 0.5, density: !(prefs.v >= 3) && prefs.density === 1.5 ? 'auto' : prefs.density ?? 'auto',
      fps: prefs.v >= 4 || (prefs.v >= 2 && prefs.fps !== 60) ? prefs.fps ?? 'auto' : 'auto', particles: prefs.particles ?? null, scan: prefs.scan ?? null,
      // the tuner's knobs (src/tuner.js): each 'auto' or a level of its own (an index into its ladder)
      tune: Object.fromEntries(Object.entries(KNOBS).filter(([id]) => id in TUNE_TITLES).map(([id, k]) => [id, Number.isInteger(prefs.tune?.[id]) && prefs.tune[id] >= 0 && prefs.tune[id] < k.levels.length ? prefs.tune[id] : 'auto'])) },
  };
  // the viewer's hand (hand.js, docs/hand.md): the tool in hand and what it does to the world; its record of acts is
  // the world's (life.hand), kept in saves
  const hand = createHand(eng.hand, eng.handU, { reach: clamp(prefs.reach ?? REACH.def, REACH.min, REACH.max), drops: eng.drops });
  if (touchOnly) hand.set('none');
  let handSeen = 0;
  // the pipette's contents (pipette.js), the world's (life.pipette, kept in saves)
  let pipette = createPipette();
  // what it draws up (startPull: pressed, what it took, the cells bonded to those still coming, a word by the tip),
  // Dispense on (armed: a press sets down), and what it sets down (startSpit)
  const pull = { on: false, at: 0, until: 0, tip: [0, 0], got: [], taken: new Set(), drawn: new Set(), last: 0, quiet: 0, armed: false, shake: 0, note: null };
  const spit = { on: false, held: false, busy: false, sp: null, org: null, at: 0, next: 0, owed: 0, last: 0, fails: 0, dir: 0, pt: null, tip: [0, 0] };
  // riding the specimen (toggleRide, ride.js): where a held pointer steers it (at), the keys held (KeyboardEvent.code),
  // the throttle they build, the camera's dive and breathing (cam; manual once the viewer zooms), the body sent
  // (top: the will's full speed for it, world units a second)
  const ride = { on: false, keys: new Set(), at: null, warned: false, slept: false, th: createThrottle(), cam: null, body: undefined, top: 1 };
  // While a pointer is held down on a panel, nothing re-renders under it: replacing the element
  // between pointerdown and pointerup swallows the click.
  let uiHoldUntil = 0;
  const panelSel = '.panel, .rail, .dock, .floats';
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
  // i18n: how long the trails last (Settings → Display, Trails)
  const trailNames = [tr('settings.off', 'Off'), tr('settings.display.trails-short', 'Short'), tr('settings.display.trails-long', 'Long'), tr('settings.display.trails-exposure', 'Exposure')];
  let trailIdx = prefs.trails ?? 1;
  const defaults = { ...eng.settings }; // the engine's own, for Settings' reset
  eng.settings.trails = trailLevels[trailIdx];
  for (const k of ['links', 'nodes', 'bloom', 'optics', 'specks', 'lod', 'tide', 'heat', 'bands']) if (prefs[k] !== undefined) eng.settings[k] = prefs[k];
  // (before 5 the light map was off, faint or full: the faint tint is gone, the scene itself lit by the light)
  if (!(prefs.v >= 5) && prefs.tide !== undefined) eng.settings.tide = prefs.tide === 2 ? 1 : 0;
  eng.maxScan = state.perf.scan ?? K.maxScan;
  document.body.classList.toggle('no-closeup', !state.closeup);
  const persist = () => {
    const s = eng.settings;
    savePrefs({ v: 5, trails: trailIdx, links: s.links, nodes: s.nodes, bloom: s.bloom, optics: s.optics, specks: s.specks, lod: s.lod, tide: s.tide, heat: s.heat, bands: s.bands, labOpen: state.labOpen, auto: state.auto, loupeR: state.loupeR, currents: state.currents, closeup: state.closeup, songMarks: state.songMarks, notes: state.notes, water: state.water, waves: state.waves, look: state.look, grain: state.grain, events: state.events, ui: state.ui, reach: hand.reach, ...state.perf });
    document.body.classList.toggle('no-closeup', !state.closeup);
  };
  // the look (src/look.js, docs/look.md): Darkfield as the Display settings ask, how strong as a whole and how much
  // grain; or, from the tools (T.look), any tunables
  const applyLook = (p = { ...DARKFIELD, grain: [0, 0.25, 0.5][state.grain] }, strength = [0, 0.6, 1, 1.35][state.look]) => eng.look.set(packLook(p, strength));
  applyLook();
  // the sea (src/sea.js) as the Display settings ask: how high its waves (none: no sea at all, its passes skipped, for
  // anyone who would rather the view held still) and how quickly they move
  const applyWater = () => {
    const t = eng.seaTune;
    t.height = [0, 0.5, 1, 1.8][state.water];
    t.view = state.water === 0 ? 3 : 0;
    t.pace = [0.5, 1, 1.7][state.waves];
  };
  applyWater();

  // ------------------------------------------------------------ sizing
  let renderScale = state.perf.scale === 'auto' ? 1 : state.perf.scale;
  // the tuner's knobs (src/tuner.js): each one's level (an index into its ladder, cheapest first; Auto's start at their
  // best), what it cost at that level and at its best when last measured (tuneProfile), and until when a climb that
  // just failed is not tried again
  const tune = Object.fromEntries(Object.entries(KNOBS).map(([id, k]) => [id, { level: k.levels.length - 1, cost: null, full: null, hold: 0 }]));
  // (the neighbors are on Auto while Settings → Neighbors is left at its default, and have their own row there)
  const tuneAuto = (id) => (id === 'neighbors' ? state.perf.scan == null : state.perf.tune[id] === 'auto');
  function applyTune() {
    for (const id of Object.keys(tune)) if (!tuneAuto(id) && id !== 'neighbors') tune[id].level = state.perf.tune[id];
    const at = (id) => KNOBS[id].levels[tune[id].level];
    Object.assign(eng.fx, { seaEvery: at('sea'), bloom: at('bloom'), specks: at('specks'), stoneEvery: at('stone'), finish: at('finish'), interiors: at('interiors') });
    eng.maxScan = tuneAuto('neighbors') ? at('neighbors') : state.perf.scan;
  }
  applyTune();
  // Auto pixel density draws the scene at 1 device pixel per CSS pixel, always: above 1 the extra pixels are the
  // costliest sharpness the page could give (an M1 at 1.5× spent 18 ms a frame drawing), so only a density chosen
  // in Settings draws more. The one exception is a film begun with Auto (filmRaise): its frames are the screen's
  // own size, so the scene draws at up to 1.5 while it rolls (filmDense) and drops back to 1 when it ends.
  let filmDense = false;
  const density = () => Math.min(devicePixelRatio || 1, 2, state.perf.density === 'auto' ? (filmDense ? 1.5 : 1) : state.perf.density);
  let dpr = 1;
  // The scene renders at no more than state.perf.density (Auto: 1, rising to 1.5) device pixels per CSS pixel:
  // its per-pixel shading is heavy, and a 2x display would quadruple it for little visible gain.
  // Overlay text and lines stay native.
  function fit() {
    const base = Math.min(devicePixelRatio || 1, 2);
    dpr = density() * renderScale;
    const maxDim = device.limits.maxTextureDimension2D;
    canvas.width = Math.min(maxDim, Math.max(1, Math.round(innerWidth * dpr)));
    canvas.height = Math.min(maxDim, Math.max(1, Math.round(innerHeight * dpr)));
    overlay.width = Math.round(innerWidth * base);
    overlay.height = Math.round(innerHeight * base);
    eng.resize(canvas.width, canvas.height);
    dockTop = $('dock').getBoundingClientRect().top;
    railBottom = $('rail').getBoundingClientRect().bottom;
  }
  fit();
  addEventListener('resize', () => { fit(); if (lab) drawWorldChart(); });

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
  // Where a world point shows in the main view: the water bends the view (Engine.seaShift), so what marks a cell (the
  // followed cell's brackets, song marks) sits where the cell shows rather than where it lies.
  function toShown(wx, wy) {
    const [sx, sy] = toScreen(wx, wy), [dx, dy] = eng.seaShift(wx, wy, { ppu: ppu() });
    return [sx + dx / dpr, sy + dy / dpr];
  }
  // ...and in the loupe (L), as an offset in its pixels: its own bend, taken about its center as the main view's is
  // about the view's (the main view's bend here less at the loupe's center)
  function lensShift(wx, wy, L) {
    const p = ppu(), [ax, ay] = eng.seaShift(wx, wy, { ppu: p }), [bx, by] = eng.seaShift(L.cx, L.cy, { ppu: p });
    return [((ax - bx) / p) * L.cssPPU, ((ay - by) / p) * L.cssPPU];
  }
  // The world point the main view shows at screen point (sx, sy), where the water bends the view to show it
  function toWorldShown(sx, sy) {
    const [wx, wy] = toWorld(sx, sy), [dx, dy] = eng.seaShift(wx, wy, { ppu: ppu() });
    return toWorld(sx - dx / dpr, sy - dy / dpr);
  }
  function wrapCam() { const [W, H] = eng.grid; cam.x = ((cam.x % W) + W) % W; cam.y = ((cam.y % H) + H) % H; }
  function zoomAt(factor, sx, sy) {
    cam.zoomTarget = clamp(cam.zoomTarget * factor, 1, maxZoom());
    cam.anchor = [sx, sy];
  }
  // The middle of the part of the screen the panels leave open, as a world offset from the camera:
  // a followed specimen sits there rather than behind the panel.
  function viewOffset() {
    const ins = specInset();
    const top = phone() ? 48 : 52, bot = phone() ? 62 : 56;
    const left = lab && lab.isOpen() && !phone() && state.ui ? labRight() : 0;
    const cx = (left + innerWidth - ins.right) / 2, cy = (top + innerHeight - Math.max(bot, ins.bottom)) / 2;
    const p = cssPPU();
    return [(innerWidth / 2 - cx) / p, (innerHeight / 2 - cy) / p];
  }

  // ------------------------------------------------------------ loupe
  const hover = { x: 0, y: 0, on: false };
  // (where a tap set the lens, on a touch screen: a world point, so it goes with the world as the view pans, off the
  // screen and back; dragged, it moves)
  let lensAt = null;
  // the lens's radius (px): the viewer's (Reach, with the loupe in hand), or a fifth of the screen
  const LOUPE_R = { min: 50, max: 320 };
  const loupeMax = () => Math.min(LOUPE_R.max, Math.min(innerWidth, innerHeight) * 0.46);
  const loupeR = () => Math.round(clamp(state.loupeR ?? clamp(Math.min(innerWidth, innerHeight) * 0.2, 90, 170), LOUPE_R.min, loupeMax()));
  function loupeGeom() {
    let at = hover.on ? hover : null;
    if (!at && lensAt) { const [x, y] = toScreen(...lensAt); at = { x, y }; }
    // (the lens that follows the mouse hides while the view is dragged; one set in the world by a tap stays, and goes
    // with the world as it pans)
    if (!at || hand.tool !== 'loupe' || (ptr.dragging && hover.on) || state.phase !== 'running' || ride.on) return null;
    // filming, the loupe hides with the pointer once the mouse rests
    if (director.active && hover.on && performance.now() - lastPtr.moved > CURSOR_REST) return null;
    const base = cssPPU();
    // the loupe magnifies until the view itself is as close as the old zoom limit allowed (40 of 220 px per unit)
    if (base >= 40 * MAX_PPU / 220) return null;
    const R = loupeR();
    if (at.x < -R || at.y < -R || at.x > innerWidth + R || at.y > innerHeight + R) return null;
    const lp = clamp(base * state.loupeMag, 8, MAX_PPU);
    const [cx, cy] = toWorld(at.x, at.y);
    return { sx: at.x, sy: at.y, R, cssPPU: lp, cx, cy, mouse: hover.on };
  }

  // ------------------------------------------------------------ perf
  const perf = { samples: [], gpu: 0, fps: 0, frames: 0, worldFps: 0, worldFrames: 0, fpsT: performance.now(), frameDt: [], lastSubmit: 0, rafMs: 0, rafLonger: 0, mainMs: 0, goodWindows: 0, ceiling: 1, ceilingUntil: 0, lastAdjust: performance.now(),
    stepMs: 0, simS: 0, renderR: 0, presentR: 0, worldAt: 0, stepCredit: 0, ticks: 1, held: false, ticksAt: 0, rate: 1, rateT: performance.now(), rateSim: 0, stepsS: 0, rateSteps: 0,
    slow: 1, slowCeiling: 0, why: '', raisedAt: 0, hold: 0, raised: null, profAt: performance.now(), calmUntil: 0 };
  let calibWait = null;
  const frameWaiters = [];
  const ema = (a, v, k) => (a ? a + (v - a) * k : v);
  eng.onGpuTime = (ms, n, steps, simMs, drew) => {
    // Per-step cost, render included (an overestimate that shrinks as more steps share one render). Each rises at once
    // toward a dearer step and falls slowly: what plans fast speeds' steps (stepCost) must never run low, or a frame
    // packs more steps than its budget (on a slow phone, the kind of frame its driver judges a hung GPU)
    const rise = (a, v, k) => ema(a, v, v > a ? 0.5 : k);
    if (steps > 0 && drew) perf.stepMs = rise(perf.stepMs, ms / steps, 0.15);
    // with GPU timestamps, the cost of a step and of drawing a frame (or, at Max between draws, of
    // carrying the held image), apart
    if (steps > 0 && simMs != null) {
      perf.simS = rise(perf.simS, simMs / steps, 0.1);
      // and the dearest step lately (fading 3% a frame): a step's cost swings with what lives, which an average follows
      // too late for planning fast speeds (fastCost)
      perf.stepPeak = Math.max((perf.stepPeak || 0) * 0.97, simMs / steps);
      if (drew) perf.renderR = ema(perf.renderR, ms - simMs, 0.1);
      else perf.presentR = ema(perf.presentR, ms - simMs, 0.1);
    }
    perf.gpu = perf.gpu ? perf.gpu * 0.9 + ms * 0.1 : ms;
    if (drew) overload(ms);
    perf.samples.push(ms);
    if (perf.samples.length > 240) perf.samples.shift();
    if (calibWait && perf.samples.length >= calibWait.need) { const w = calibWait; calibWait = null; w.res(median(perf.samples)); }
  };
  // Frames far over budget at once, not judged every two seconds (adaptQuality): a GPU kept on frames of 80 ms or more
  // can be judged hung by its driver and its context lost (a Pixel 3's Adreno 630). Three drawn frames running over
  // max(50 ms, three intervals) take Auto's knobs to their floors and its render scale down by the overrun at once, and
  // hold them there a minute. With nothing left above the floors, the render scale goes below its floor, a step at a
  // time to a quarter: a soft view rather than a lost one.
  let overN = 0;
  function overload(ms) {
    const T = frameTarget();
    // (not in the first seconds of a world, which its loading's frames take: resetAdapt marks them; nor at fast speeds,
    // whose frames are full of steps on purpose, held to their budget by the steps' planning, fastCost, not by pixels)
    if (!(ms > Math.max(50, 3 * T)) || state.phase !== 'running' || state.speed > 1 || performance.now() < perf.calmUntil) { overN = 0; return; }
    if (++overN < 3) return;
    overN = 0;
    const now = performance.now();
    const spent = Object.keys(tune).every((id) => !tuneAuto(id) || tune[id].level === 0);
    for (const id of Object.keys(tune)) if (tuneAuto(id)) { if (tune[id].level) tune[id].since = now; tune[id].level = 0; tune[id].hold = now + 60000; }
    applyTune();
    if (state.perf.scale === 'auto') {
      const floor = Math.max(state.perf.floor, filmScale());
      const want = renderScale * clamp(Math.sqrt(T / ms), 0.35, 0.9);
      const next = Math.max(floor, SCALES.find((s) => s <= want + 0.01) ?? floor);
      if (next < renderScale - 0.01) { renderScale = next; resizeDue = true; }
      else if (spent) {
        const below = SCALES.find((s) => s < renderScale - 0.01);
        if (below != null && below >= filmScale()) { renderScale = below; resizeDue = true; }
      }
    }
    if (filmDense) { filmDense = false; resizeDue = true; }
    perf.why = 'GPU overloaded'; /* i18n-ignore (a key, shown through WHY_WORDS) */ perf.goodWindows = 0; perf.lastAdjust = now; perf.frameDt.length = 0;
    perf.hold = 60000; perf.ceiling = renderScale; perf.ceilingUntil = now + perf.hold;
  }
  const waitFrames = (n) => new Promise((res) => frameWaiters.push({ n, res }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // The menu cuts the measuring short when a count or a saved world is chosen while it runs (calibrate
  // then returns the world it has, which the choice replaces).
  let calibCut = false, cutNow = () => {}, cut = null;
  const armCut = () => { calibCut = false; cut = new Promise((r) => { cutNow = () => { calibCut = true; r(); }; }); };
  armCut();
  async function measure(need = 36, warm = 16) {
    await Promise.race([waitFrames(warm), sleep(2500), cut]);
    perf.samples.length = 0;
    return new Promise((res) => {
      calibWait = { need, res };
      cut.then(() => { if (calibWait?.res === res) { calibWait = null; res(1000); } });
      setTimeout(() => {
        if (calibWait?.res !== res) return; // (a later measure's wait is not this one's to end)
        const w = calibWait;
        calibWait = null;
        w.res(perf.samples.length ? median(perf.samples) : 1000);
      }, 4500);
    });
  }

  // ------------------------------------------------------------ climate eras
  let climate;
  // the pool's events the climate may draw (Settings → Climate)
  function applyEvents() {
    if (climate) climate.allowed = new Set(state.events.on ? EVENT_TYPES.filter((x) => state.events[x]) : []);
  }
  function resetClimate() {
    climate = createClimate(eng);
    applyEvents();
    climate.music = (Math.random() * 2 ** 32) >>> 0; // the world's soundtrack seed (kept with a saved world)
    climate.onEra = (era, prevAmb, prevTemp) => {
      const light = era.ambient > prevAmb + 0.05 ? 'rises' : era.ambient < prevAmb - 0.05 ? 'dims' : 'holds';
      const water = !K.heat ? 'none' : era.temp > prevTemp + 1 ? 'warms' : era.temp < prevTemp - 1 ? 'cools' : 'holds';
      // the era's water level: low eras bare the highest ground as islands and sandbars (the first era is full)
      const prev = climate.history.at(-2), wasLow = (prev?.level ?? 1) < 1, low = era.level < 1;
      const level = !K.pond || (!low && !wasLow) ? 'none' : !low ? 'rises' : wasLow ? 'stays' : 'falls';
      // i18n: the log, a new climate era: {name} its name; {light} the light's level now (%); {temp} the water's
      // temperature (°C, when the world has heat); {bare} how much of the floor lies dry (%, in a low era)
      pushEvent(tr('log.era', 'A new era: <b>{name}</b> · {dir, select, rises {light rises} dims {light dims} other {light holds}} to {light}%{water, select, warms { · water warms to {temp}°} cools { · water cools to {temp}°} holds { · water holds to {temp}°} other {}}{level, select, rises { · the water rises over the islands} stays { · the water stays low: {bare}% of the floor lies bare} falls { · the water falls: {bare}% of the floor lies bare} other {}} · currents shift',
        { name: esc(eraName(climate.name)), dir: light, light: Math.round(era.ambient * 100), water, temp: Math.round(era.temp), level, bare: Math.round((1 - era.level) * 100) }), 0xffa0e3f1, 'era');
      chron.note('era', { t: eng.simTime, name: climate.name, prev: prev && prev.name, reg: life.reg, living: life.counts[3] });
      flash(eraName(climate.name));
      sound.era(climate.name);
    };
    // the pool's events (docs/catastrophes.md): announced as they begin and turn, and tallied once they have passed
    climate.onEvent = (ev, phase) => {
      chron.note('event', { t: eng.simTime, type: ev.type, phase, reg: life.reg, living: life.counts[3] });
      const tally = () => {
        const was = ev.before;
        if (!was) return '';
        const kept = was.cells ? life.counts[3] / was.cells : 1;
        const lost = [...was.species].filter((k) => !life.reg.get(k)?.alive).length;
        // i18n: added to the log's line that an event has passed: how much life there is to what there was before it
        // ({pct}, %), and how many species it cost ({lost})
        return tr('log.event-tally', ' · {pct}% as much life as before{lost, plural, =0 {} other {, {lost} species lost}}', { pct: Math.round(Math.min(kept, 9.99) * 100), lost });
      };
      const begin = () => { ev.before = { cells: life.counts[3], species: new Set([...life.reg.entries()].filter(([, s]) => s.alive && s.established).map(([k]) => k)) }; };
      const col = 0xff9ad6e8;
      if (ev.type === 'drought') {
        if (phase === 'drying') {
          begin();
          // i18n: the log: {dur} how long the water falls (a duration); {pct} how much of the floor will lie dry (%)
          pushEvent(tr('log.drought-drying', '<b>The pool is drying</b>: over {dur} the water will fall until {pct}% of the floor lies dry', { dur: fmtDur(ev.fall), pct: Math.round((1 - ev.low) * 100) }), col, 'pond');
          flash(tr('flash.drought-drying', 'The pool is drying'));
        } else if (phase === 'dry') {
          const p = eng.relief ? countPools(eng.relief, eng.grid[0], eng.grid[1], eng.level) : null;
          pushEvent(p && p.pools > 1 ? tr('log.drought-dry-parted', 'The water has fallen: the pool has parted into <b>{pools} pools</b>; stranded cells rest as cysts and spores', { pools: p.pools })
            : tr('log.drought-dry', 'The water has fallen; stranded cells rest as cysts and spores'), col, 'pond');
          // i18n: the drought at its lowest: the pool parted into {n} pools, or not
          flash(p && p.pools > 1 ? tr('flash.drought-pools', '{n} pools', { n: p.pools }) : tr('flash.drought-dry', 'Low water'));
        } else if (phase === 'rain') {
          pushEvent(tr('log.drought-rain', '<b>Rain</b>: the pool refills, cold under the cloud, and the cysts on the drying mud wake'), col, 'pond');
          flash(tr('flash.drought-rain', 'Rain'));
        // i18n: {tally} is log.event-tally, or nothing
        } else if (!phase) pushEvent(tr('log.drought-passed', 'The drought has passed{tally}', { tally: tally() }), col, 'pond');
      } else if (ev.type === 'storm') {
        if (phase === 'storm') {
          begin();
          pushEvent(tr('log.storm', '<b>A storm</b>: cold rain, raindrops ringing the surface, the water rough and the light dim'), col, 'pond');
          flash(tr('flash.storm', 'A storm'));
        // i18n: {tally} is log.event-tally, or nothing
        } else if (!phase) pushEvent(tr('log.storm-passed', 'The storm has passed{tally}', { tally: tally() }), col, 'pond');
      } else if (ev.type === 'frost') {
        if (phase === 'cooling') {
          begin();
          pushEvent(tr('log.frost', '<b>A frost</b>: night falls and the water chills toward freezing'), col, 'pond');
          flash(tr('flash.frost', 'A frost'));
        } else if (phase === 'freezing') {
          // i18n: {pct} how much of the pool will freeze (%)
          pushEvent(tr('log.frost-ice', 'Ice grows over the pool: grains spreading from the shallows will freeze {pct}% of it, pushing cells into the veins of water between them', { pct: Math.round(ev.max * 100) }), col, 'pond');
          flash(tr('flash.frost-ice', 'Ice'));
        } else if (phase === 'thaw') {
          pushEvent(tr('log.frost-thaw', 'The ice thaws'), col, 'pond');
        // i18n: {tally} is log.event-tally, or nothing
        } else if (!phase) pushEvent(tr('log.frost-passed', 'The frost has passed{tally}', { tally: tally() }), col, 'pond');
      } else if (ev.type === 'duckweed') {
        if (phase === 'duckweed') {
          begin();
          // i18n: {n} how many fronds
          pushEvent(tr('log.duckweed', '<b>Duckweed drifts onto the pool</b>: {n} fronds, the water under them in their shade, their roots trailing below', { n: ev.buds + 1 }), col, 'pond');
          flash(tr('flash.duckweed', 'Duckweed'));
        // i18n: {tally} is log.event-tally, or nothing
        } else if (!phase) pushEvent(tr('log.duckweed-passed', 'The duckweed has drifted off{tally}', { tally: tally() }), col, 'pond');
      }
    };
    climate.onExcursion = (x) => {
      if (!K.heat) return;
      chron.note('excursion', { t: eng.simTime, dT: x.dT, dur: x.dur, reg: life.reg, living: life.counts[3] });
      const wave = x.dT > 0;
      // i18n: the log: {deg} how many degrees (°C) the water rises or falls; {dur} for how long (a duration)
      const deg = Math.abs(x.dT).toFixed(0), dur = fmtDur(x.dur);
      pushEvent(wave ? tr('log.heat-wave', 'A heat wave: the water rises {deg}° for {dur}', { deg, dur }) : tr('log.cold-snap', 'A cold snap: the water falls {deg}° for {dur}', { deg, dur }), wave ? 0xff3a8aff : 0xffd68a3d, 'heat');
      flash(wave ? tr('flash.heat-wave', 'A heat wave') : tr('flash.cold-snap', 'A cold snap'));
    };
  }

  // ------------------------------------------------------------ world + life bookkeeping
  let life;
  // the chronicler (chronicler.js): natural history from the census and the species ledger, told rarely
  const chron = createChronicler({ K, link: spLink, tune: { debug: (t, all, live) => all.length && globalThis.__tidemote?.chronDebug?.push({ t, all: all.map((c) => [c.kind, +c.rank.toFixed(2), c.html.replace(/<[^>]+>/g, '').slice(0, 90)]), live: live.length }) } });
  let watchVer = -1;
  const watchSlots = new Uint32Array(MAXK);
  function resetLife() {
    life = {
      reg: new Map(), genera: new Map(), orphan: new Map(), chronicle: [], history: [], histEvery: 3, lastHist: -1e9,
      counts: [0, 0, 0, 0, 0], roles: [0, 0, 0], alive: 0, thriving: 0, arisen: 0, maxDepth: 0, top: 0, lastCensus: null, matter: [],
      estThreshold: 30, births: 0, prevG: null, prevD: null, prevT: 0, prunedAt: 0, chartSp: new Map(),
      // the hand's acts on this world (hand.js): a world touched says so wherever its record goes; what the
      // pipette holds
      hand: [], pipette: { species: [] }, rode: [], // (rode: the species ridden, marked in the lineage view)
      carried: {}, // slot -> { name, home }: a stranger set down, its name and home water for when the census meets it
    };
    hand.reset(life.hand);
    pipette = createPipette(life.pipette);
    // (serials start again: this world's species' portraits and names drawn up go)
    dropPortraits(); drawnNames.clear();
    eng.setDrawn([]);
    Object.assign(pull, { on: false, until: 0, got: [] }); pull.drawn.clear(); pull.taken.clear();
    spit.on = false;
    handSeen = 0;
    feedKey = '';
    chron.reset();
    watchVer = -1;
    renderFeed();
  }

  function seedWorld(n) {
    eng.seed(n, { aspect: innerWidth / Math.max(1, innerHeight) });
    // (its first frames are its seeding's, not the GPU's measure: overload waits them out)
    perf.calmUntil = performance.now() + 2000;
    const g = eng.grid;
    cam.x = g[0] / 2; cam.y = g[1] / 2; cam.zoom = cam.zoomTarget = 1; cam.anchor = null;
    resetDirector();
    resetLife();
    resetClimate();
    sound.reset(climate.music);
    // species serials (and the names drawn from them) start over: drop what the panels built from the last world's
    if (lab) lab.reset();
    if (specimen) specimen.reset();
    cards.reset();
    life.estThreshold = Math.max(30, Math.round(n * 0.00025));
    deselect();
    clearFocus();
    warmDue = true;
  }

  async function allocDown(n) {
    state.busy = true;
    await device.queue.onSubmittedWorkDone();
    n = Math.max(MIN_PARTICLES, Math.floor(n / 4096) * 4096);
    while (n >= MIN_PARTICLES) {
      if (await eng.allocate(n)) return n;
      n = Math.floor((n * 0.75) / 4096) * 4096;
    }
    throw new Error(tr('err.alloc', 'Could not allocate particle memory on this GPU.'));
  }

  const calText = $('calib');
  const calBar = document.querySelector('.intro-rule i');
  const calStep = (text, frac) => { calText.textContent = text; calBar.style.width = `${Math.round(frac * 100)}%`; };
  function maxParticles() {
    const lim = device.limits;
    const hardCap = Math.floor(Math.min(lim.maxStorageBufferBindingSize, lim.maxBufferSize) / 40 / 4096) * 4096;
    return Math.min(hardCap, 8388608, Math.floor(MAX_CELLS * K.density * 0.95), window.__MC_MAX || Infinity);
  }
  // the count measured this session (the menu's Auto offers it again without measuring)
  let measuredN = null;
  // A new world starts K.foundLife of its particles alive and blooms within minutes to about half (a 143k world on an
  // M1: 50% living at five minutes; saves 15-45%, the gate's 32k worlds 33% at thirty): what the measure of a new
  // world leaves out is the living cells' passes for the rest. Their cost per living cell differs most between GPUs
  // (lifeMain, register-bound: about 3 ns a cell on an RTX 4070 Ti, 85 on an M1), so it is measured: the step dispatch
  // by dispatch, with no frame drawn beside it (frames overlap a tiled GPU's timestamps), over the new world's
  // founders. ms of those passes, or 0 without timestamps.
  const MATURE_LIVING = 0.5;
  const LIVING_PASSES = new Set(['lifeMain', 'contactMain', 'bondBackMain', 'bodyTick']);
  async function livingMs() {
    if (!hasTS) return 0;
    state.busy = true;
    try {
      await device.queue.onSubmittedWorkDone();
      const runs = [];
      for (let i = 0; i < 5; i++) {
        let ms = 0;
        for (const [k, t] of await eng.profileStep(1 / 60)) if (LIVING_PASSES.has(k)) ms += t;
        runs.push(ms);
      }
      return median(runs);
    } catch { return 0; } finally { state.busy = false; }
  }

  async function calibrate() {
    const maxN = maxParticles();
    // a count chosen in Settings skips the measuring
    if (state.perf.particles) {
      const n = await allocDown(Math.min(state.perf.particles, maxN));
      seedWorld(n);
      state.busy = false;
      // i18n: the intro's loading line: the world's particle count
      calStep(tr('intro.particles', '{n, plural, other {# particles}}', { n }), 1);
      return n;
    }
    // GPU ms a frame of the new world may take: a mature world costs about what it measures at the
    // start (life fills it within minutes, then swings ±30% with the climate), drawn at 60 fps that
    // leaves room for zooming and swings, and the adaptive frame rate covers the rest. Phones keep
    // more in hand: their GPU is shared with the screen, and is measured here cool, before it
    // throttles. Without timestamps the measure overstates.
    armCut();
    const target = (!hasTS ? 9 : 10) * (throttles ? 0.55 : 1);
    const clampN = (x) => clamp(Math.round(x / 4096) * 4096, Math.min(MIN_PARTICLES, maxN), maxN);
    let n = await allocDown(Math.min(isCoarse ? 131072 : 262144, maxN));
    seedWorld(n);
    state.busy = false;
    // i18n: the intro's loading line, while the GPU is timed on a world of {n} particles
    calStep(tr('intro.measuring', 'Measuring the GPU · {n, plural, other {# particles}}', { n }), 0.6);
    let t = await measure();
    if (calibCut) return n;
    // the frame as the world will cost once life fills it: what was measured, and the living cells' passes for the
    // share still to come (livingMs, per founder)
    const founders = (m) => Math.max(1, m * K.foundLife);
    const ms1 = await livingMs();
    let perCell = ms1 / founders(n);
    // A GPU with room for more is measured again nearer its count. Too few founders to fill a large GPU take about
    // as long as one cell's work (an RTX 4070 Ti, 262k particles: 35 ns a founder against 5 in a grown world, which
    // sized its worlds at half), so there the cost a cell is the difference between the two worlds' (about 2.6 ns).
    const room = clampN((n * target) / t);
    if (room > n * 1.2) {
      const m = await allocDown(room);
      seedWorld(m);
      state.busy = false;
      calStep(tr('intro.measuring', 'Measuring the GPU · {n, plural, other {# particles}}', { n: m }), 0.8);
      const t2 = await measure();
      if (calibCut) return m;
      const ms2 = await livingMs();
      const slope = (ms2 - ms1) / (founders(m) - founders(n)), each = ms2 / founders(m);
      perCell = slope > 0 ? Math.min(slope, each) : each;
      n = m;
      t = t2;
    }
    const grown = t + perCell * n * Math.max(0, MATURE_LIVING - K.foundLife);
    const next = Math.min(clampN((n * target) / grown), clampN(n * 1.3));
    const final = next === n ? n : await allocDown(next);
    seedWorld(final);
    state.busy = false;
    calStep(tr('intro.particles', '{n, plural, other {# particles}}', { n: final }), 1);
    measuredN = final;
    return final;
  }

  // A new world with another particle count ('auto' measures the GPU again, as on the first visit).
  async function setParticles(n) {
    if (state.phase !== 'running') return;
    state.perf.particles = n === 'auto' ? null : n;
    persist();
    state.phase = 'calibrating';
    flash(n === 'auto' ? tr('flash.measuring', 'Measuring the GPU') : tr('flash.particles', '{n, plural, other {# particles}}', { n }));
    try { await calibrate(); } catch (e) { fail(tr('err.start', 'Could not start the simulation'), String(e.message || e), [RELOAD]); return; }
    state.phase = 'running';
    renderWorld();
    view.render();
    sound.overture();
    flash(tr('flash.new-world', 'A new world begins'));
  }

  // ------------------------------------------------------------ the desktop app
  // In the desktop app (desktop/preload.cjs), saves are files Steam Cloud keeps, Steam is there for
  // achievements and the Workshop (docs/desktop.md); in a browser, desk is null.
  const desk = globalThis.tidemoteDesktop || null;
  let steamOn = { on: false };
  desk?.steam().then((x) => { steamOn = x; if (view?.isOpen()) view.render(); }).catch(() => {});
  // achievements earned (each asked of Steam once a session), and the stories read in all
  const unlocked = new Set();
  function unlock(ids) {
    if (!desk) return;
    for (const id of ids) if (!unlocked.has(id)) { unlocked.add(id); desk.achieve(id).catch(() => {}); }
  }
  function storiesRead() {
    let n = 0;
    try { n = (+localStorage.getItem('tidemote.storiesRead') || 0) + 1; localStorage.setItem('tidemote.storiesRead', String(n)); } catch { /* storage unavailable */ }
    return n;
  }

  // ------------------------------------------------------------ saved worlds
  // The engine's state with the page's record of the world (names, lineages, chronicle, history,
  // eras and the camera), kept in this browser (worlds.js) or, in the desktop app, as files.
  const worldStore = desk ? desk.worlds : createWorldStore();
  async function saveWorld(name) {
    // the page's record and the GPU's copy are taken together, before anything awaits
    const { lastCensus, genera, ...keepLife } = life;
    // a genus none of whose species is still in the registry no longer needs its founder's genome
    // (register() compares a newcomer only with its parent's genus); most genera of an old world
    const listed = new Set([...life.reg.values()].map((s) => s.genus));
    keepLife.genera = new Map([...genera].map(([k, g]) => [k, listed.has(k) ? g : { ...g, founder: null }]));
    // which events may happen is the page's setting (Settings → Climate), not the world's
    const keepClimate = Object.fromEntries(Object.entries(climate).filter(([k, v]) => typeof v !== 'function' && k !== 'allowed'));
    const page = { life: keepLife, climate: keepClimate, cam: { x: cam.x, y: cam.y, zoom: cam.zoomTarget }, chron: chron.save() };
    const top = [...life.reg.values()].filter((s) => s.alive && s.established).sort((a, b) => b.pop - a.pop);
    const meta = { id: newKey('w'), name, savedAt: Date.now(), version: SAVE_VERSION,
      simTime: eng.simTime, count: eng.count, thriving: life.thriving, cols: top.slice(0, 4).map((s) => s.genome.col), touched: hand.touched };
    const st = await eng.readState();
    const bytes = await encodeWorld({ meta, cpu: st.cpu, ...compactState(st), page });
    // in the desktop app, a picture of the view for the Workshop
    const preview = desk ? await takeView().then((px) => px && encodeBytes(px, 'image/jpeg', 0.88)).catch(() => null) : null;
    await worldStore.put({ ...meta, bytes: bytes.byteLength }, bytes, preview || undefined);
  }
  // a world as file bytes, read and checked before the one running is touched
  async function openWorld(bytes) {
    const w = await decodeWorld(bytes);
    // the buffers this version keeps, each its size (a buffer it does not know, from a newer minor
    // version, is left out; decodeWorld has already refused another major)
    const want = eng.stateSizes(w.cpu.count);
    if (Object.entries(want).some(([k, size]) => w.gpu[k]?.byteLength !== size)) throw new Error(tr('worlds.err.mismatch', 'This world’s file does not match its version.'));
    w.gpu = Object.fromEntries(Object.keys(want).map((k) => [k, w.gpu[k]]));
    if (w.cpu.count > maxParticles()) throw new Error(tr('worlds.err.too-big', 'Its {n, plural, other {# particles}} are more than this GPU can hold.', { n: w.cpu.count }));
    return w;
  }
  // Put a world in place of this one (perf tools pass only { cpu, gpu }: its record starts afresh).
  function applyWorld({ cpu, gpu, page }) {
    eng.writeState({ cpu, gpu });
    warmDue = false;
    if (state.warm) { endWarm(); applySpeed(1); }
    // a new world, a fresh judgment of what the device sustains: a frame rate cut for the last one's moment is not kept
    resetAdapt();
    resetDirector();
    resetLife();
    resetClimate();
    torpidPrev = null;
    if (page) {
      Object.assign(life, page.life, { lastCensus: null });
      hand.reset(life.hand);
      pipette = createPipette(life.pipette);
      handSeen = life.hand.length;
      Object.assign(climate, page.climate);
      chron.load(page.chron);
      cam.x = page.cam.x; cam.y = page.cam.y;
      cam.zoom = cam.zoomTarget = page.cam.zoom; cam.anchor = null;
    }
    sound.reset(climate.music, climate.name); lab.reset(); specimen.reset(); cards.reset(); deselect(); clearFocus();
    feedKey = '';
    renderFeed();
    drawWorldChart();
    renderWorld();
  }
  async function loadWorld(w) {
    state.phase = 'calibrating';
    state.busy = true;
    try {
      await device.queue.onSubmittedWorkDone();
      if (eng.capacity !== w.cpu.count && !(await eng.allocate(w.cpu.count))) {
        // this world's memory went with the attempt: start a new one
        flash(tr('flash.no-memory', 'Not enough GPU memory for that world'));
        await calibrate();
        state.phase = 'running';
        renderWorld();
        return false;
      }
      applyWorld(w);
    } catch (e) {
      console.error('[tidemote] loading a world:', e);
      // the world being replaced may be half overwritten: a new one, or a reload
      fail(tr('err.load', 'Could not load the world'), String(e.message || e), [
        { label: tr('err.new-world', 'Start a new world'), run: () => { $('nogpu').hidden = true; seedWorld(eng.count); state.busy = false; state.phase = 'running'; sound.overture(); } },
        RELOAD]);
      return false;
    }
    state.busy = false;
    state.phase = 'running';
    // i18n: {name} is the saved world's name
    flash(tr('flash.world-loaded', '{name} loaded', { name: w.meta.name }));
    return true;
  }

  // a species' facets and preferred temperature, worked out once per genome (the Lab filters and
  // counts every species on each update; a species' genome is replaced, never changed)
  const facetCache = new WeakMap();
  function facetsOf(g) {
    let f = facetCache.get(g);
    if (!f) facetCache.set(g, (f = { ...facets(g, K), temp: thermalGuild(g).pref }));
    return f;
  }
  function groups() {
    const out = { diet: {}, mobility: {}, body: {}, types: {}, temp: {} };
    for (const sp of life.reg.values()) {
      if (!sp.alive) continue;
      const f = facetsOf(sp.genome);
      out.diet[f.diet] = (out.diet[f.diet] || 0) + sp.pop;
      out.mobility[f.mobility] = (out.mobility[f.mobility] || 0) + sp.pop;
      out.body[f.body] = (out.body[f.body] || 0) + sp.pop;
      out.types[f.types] = (out.types[f.types] || 0) + sp.pop;
      out.temp[f.temp] = (out.temp[f.temp] || 0) + sp.pop;
    }
    return {
      diet: Object.keys(DIET_COL).map((k) => ({ name: k, n: out.diet[k] || 0, col: DIET_COL[k] })),
      mobility: Object.keys(MOB_COL).map((k) => ({ name: k, n: out.mobility[k] || 0, col: MOB_COL[k] })),
      body: [{ name: 'multicellular', n: out.body.multicellular || 0, col: '#ffb45e' }, { name: 'single-cell', n: out.body['single-cell'] || 0, col: '#9aa3b8' }],
      types: ['1', '2', '3'].map((k, i) => ({ name: k, n: out.types[k] || 0, col: ['#9aa3b8', '#b38cff', '#5fd4c4'][i] })),
      temp: [['cold-loving', '#6f9cff'], ['temperate', '#62c6a8'], ['warmth-loving', '#f0b04a'], ['thermophile', '#ff5f3a']].map(([k, col]) => ({ name: k, n: out.temp[k] || 0, col })),
    };
  }

  // ------------------------------------------------------------ focus (dim everything outside a filter)
  const focus = { key: null, label: '', pred: null, roleMask: 7, stateMode: 0, matter: [false, false, false, false, false] };
  let members = null;
  let memberKind = NONE;
  function pushFocus() {
    let kinds = null;
    if (focus.key) {
      kinds = new Uint32Array(MAXK / 32);
      for (let m = 0; m < FIRST_LIFE; m++) if (focus.matter[m]) kinds[0] |= 1 << m;
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
    setLive($('focus-label'), focus.label);
  }
  function setFocus(key, label, { pred = null, roleMask = 7, stateMode = 0, matter = [false, false, false, false, false] } = {}) {
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

  // ------------------------------------------------------------ maps (what a gauge opens)
  // Tapping a gauge maps what it reads, alone: Light the light map, Temp the thermal camera, Tide the
  // tide map (on phones, where the Tide rides under the era name, the era opens it). A bar beside the
  // highlight names the map with its scale and closes it back to the plain view.
  // i18n: the map bar: the map's name, and the words at the ends of its scale ({t}: a temperature, °C)
  const MAPS = [
    { gauge: 'g-light', name: tr('maps.light', 'Light'), on: (s) => s.tide > 0, open: (s) => { s.tide = 1; }, close: (s) => { s.tide = defaults.tide; }, ramp: () => ['', tr('maps.light.lo', 'dark'), tr('maps.light.hi', 'full light')] },
    { gauge: 'g-heat', name: tr('maps.heat', 'Temperature'), on: (s) => s.heat === 2, open: (s) => { s.heat = 2; }, close: (s) => { s.heat = defaults.heat; }, ramp: () => ['heat', tr('maps.heat.deg', '{t}°', { t: Math.round(eng.tbg - 2) }), tr('maps.heat.deg', '{t}°', { t: Math.round(eng.tbg + 10) })] },
    { gauge: 'g-tide', name: tr('maps.tide', 'Tide'), on: (s) => s.bands > 0, open: (s) => { s.bands = 1; }, close: (s) => { s.bands = 0; }, ramp: () => ['tide', tr('maps.tide.lo', 'dim'), tr('maps.tide.hi', 'bright')] },
  ];
  const rampHtml = (m) => { const [cls, lo, hi] = m.ramp(); return `<div class="ramp ${cls}"><span>${lo}</span><i></i><span>${hi}</span></div>`; };
  const mapsOn = () => MAPS.filter((m) => m.on(eng.settings));
  function clearMaps() {
    for (const m of mapsOn()) m.close(eng.settings);
    mapsChanged();
  }
  function toggleMap(m) {
    const only = mapsOn().length === 1 && m.on(eng.settings);
    for (const o of mapsOn()) o.close(eng.settings);
    if (!only) m.open(eng.settings);
    mapsChanged();
  }
  function mapsChanged() { persist(); renderMaps(); view.render(); }
  // the bar and the gauges' lit state, updated in place
  function renderMaps() {
    const on = mapsOn();
    for (const m of MAPS) $(m.gauge).classList.toggle('on', on.includes(m));
    $('maps').hidden = !on.length;
    if (!on.length) return;
    const html = on.length === 1 ? rampHtml(on[0]) : '';
    const label = on.map((m) => m.name).join(' · ');
    setLive($('maps-label'), label);
    setHTML($('maps-ramp'), html);
    $('maps-ramp').hidden = !html;
  }
  for (const m of MAPS) {
    const g = $(m.gauge);
    g.setAttribute('role', 'button');
    g.addEventListener('click', () => toggleMap(m));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMap(m); } });
  }
  // on phones the Tide gauge is hidden and the season rides under the era name, so the era opens it
  $('era-box').addEventListener('click', () => { if (phone()) toggleMap(MAPS[2]); });
  $('maps-clear').addEventListener('click', clearMaps);
  const allLiving = () => true;
  function focusFacet(key) {
    if (focus.key === key) { clearFocus(); return; }
    const [kind, val] = key.split(':');
    if (kind === 'class') {
      // i18n: the highlight bar names what is highlighted (the rest of the world dimmed)
      if (val === 'living') setFocus(key, tr('highlight.living', 'All living cells'), { pred: allLiving });
      else setFocus(key, MATTER[{ silt: 0, glint: 1, husk: 2, stone: 3, framboid: 4 }[val]].name, { matter: ['silt', 'glint', 'husk', 'stone', 'framboid'].map((m) => m === val) });
    // i18n: {role} is a cell type's letter (α, β, γ)
    } else if (kind === 'role') setFocus(key, tr('highlight.role', '{role}-cells', { role: ROLE[+val] }), { pred: allLiving, roleMask: 1 << +val });
    else if (kind === 'state') setFocus(key, ['', tr('highlight.hungry', 'Hungry cells'), tr('highlight.ready', 'Cells ready to divide'), tr('highlight.elderly', 'Elderly cells'), tr('highlight.heat-stressed', 'Heat-stressed cells'), tr('highlight.torpid', 'Torpid cells')][+val], { pred: allLiving, stateMode: +val });
    // i18n: {val} is a facet's name (facet.*): the temperature a species prefers, its diet, its way of moving
    else if (kind === 'temp') setFocus(key, tr('highlight.temp', 'Prefers: {val}', { val: FACET_NAME[val] ?? val }), { pred: (g) => facetsOf(g).temp === val });
    else if (kind === 'diet') setFocus(key, tr('highlight.diet', 'Diet: {val}', { val: FACET_NAME[val] ?? val }), { pred: (g) => facetsOf(g).diet === val });
    else if (kind === 'mobility') setFocus(key, tr('highlight.mobility', 'Movement: {val}', { val: FACET_NAME[val] ?? val }), { pred: (g) => facetsOf(g).mobility === val });
    else if (kind === 'body') setFocus(key, val === 'multicellular' ? tr('highlight.multicellular', 'Multicellular species') : tr('highlight.single-cell', 'Single-cell species'), { pred: (g) => facetsOf(g).body === val });
    else if (kind === 'types') setFocus(key, tr('highlight.types', '{n, plural, one {# cell type} other {# cell types}}', { n: +val }), { pred: (g) => String(facetsOf(g).types) === val });
  }
  function focusSpecies(sp) {
    const key = `sp:${sp.serial}`;
    if (focus.key !== key) setFocus(key, sp.name, { pred: (g) => g.serial === sp.serial });
  }
  function setMembers(ids, kind) {
    members = ids && ids.length ? ids : null;
    if (!members && sel) sel.box = null;
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
    let name = genusName(g.serial, life.genera);
    // its tries all taken (likely only after weeks of a world): a numbered name, never another genus's record
    for (let n = 2; life.genera.has(name); n++) name = `${name.replace(/ [IVXLCDM]+$/, '')} ${roman(n)}`;
    life.genera.set(name, { name, founder: g, from, born: g.born, announced: false });
    return name;
  }
  function register(g) {
    let genus;
    const parent = life.reg.get(g.parent);
    if (parent) {
      const gen = life.genera.get(parent.genus);
      genus = gen && (!gen.founder || gdist(g, gen.founder) < 0.5) ? parent.genus : null;
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
      signal: signalAt(voiceOf(g).motif) >= 0, // its song is the five tones
      series: { t: [], v: [] }, // its population at each census, for the Lineage view
    };
    // a species carried in from another world keeps its name and its home water; the rest of it in the pipette is now
    // of this world's serial
    const c = g.parent === 0 && life.carried[g.slot];
    if (c) {
      delete life.carried[g.slot];
      Object.assign(sp, { name: c.name, given: true, home: c.home, carried: true });
      for (const ps of pipette.species) if (ps.pending === g.slot) { ps.words = [...ps.words]; ps.words[41] = g.serial; Object.assign(ps, { serial: g.serial, stranger: false, pending: null }); }
    }
    life.reg.set(g.serial, sp);
    return sp;
  }
  // A world left running for days keeps making species and genera; kept forever they grew without end (at
  // 32k particles 5,500 genera and 460 species a simulated hour, each with its genome: the heap, every save
  // and every census's scans over them grew with it). Every PRUNE_EVERY simulated seconds the records keep
  // what can still be shown or reached: the living; species the viewer named, the log links to or a panel
  // shows; the extinct of the last PRUNE_KEEP seconds; and the established ancestors
  // of what is kept, PRUNE_LINEAGE generations back (the specimen panel shows six, a card four: a whole
  // lineage lengthens as long as the world runs). Genera and orphan lines none of them belongs to go too. The
  // history chart's samples span the whole world, so the species it stacks are many and keep turning over:
  // of those it keeps only what the chart draws (life.chartSp: name and color).
  const PRUNE_EVERY = 600, PRUNE_KEEP = 6 * 3600, PRUNE_LINEAGE = 8;
  const pruned = { at: 0, kept: 0, removed: 0, why: {} }; // the last pass, for tools (__tidemote.pruned)
  // the species the history chart stacks: those on record, else what pruning kept of them for it
  const chartReg = { get: (serial) => life.reg.get(serial) || life.chartSp.get(serial) };
  function pruneRecords(t) {
    if (t - life.prunedAt < PRUNE_EVERY && t >= life.prunedAt) return;
    life.prunedAt = t;
    const keep = new Set(), why = { living: 0, named: 0, recent: 0, log: 0, shown: 0, lineage: 0 };
    const add = (serial, k) => { if (!keep.has(serial) && life.reg.has(serial)) { keep.add(serial); why[k]++; } };
    for (const sp of life.reg.values()) if (sp.alive) add(sp.serial, 'living'); else if (sp.given) add(sp.serial, 'named'); else if (sp.extinct != null && t - sp.extinct < PRUNE_KEEP) add(sp.serial, 'recent');
    for (const e of life.chronicle) for (const m of e.html.matchAll(/data-serial="(\d+)"/g)) add(+m[1], 'log');
    if (spView != null) add(spView, 'shown');
    for (const s of [...keep]) {
      let a = life.reg.get(s)?.ancestor;
      for (let n = 0; a != null && n < PRUNE_LINEAGE; n++) { add(a, 'lineage'); a = life.reg.get(a)?.ancestor; }
    }
    const charted = new Set();
    for (const h of life.history) for (const [serial] of h.sp || []) charted.add(serial);
    for (const serial of [...life.chartSp.keys()]) if (!charted.has(serial)) life.chartSp.delete(serial);
    const before = life.reg.size;
    for (const [serial, sp] of life.reg) {
      if (keep.has(serial)) continue;
      if (charted.has(serial)) life.chartSp.set(serial, { name: sp.name, genome: { col: sp.genome.col }, alive: false });
      life.reg.delete(serial);
    }
    Object.assign(pruned, { at: t, kept: life.reg.size, removed: before - life.reg.size, why });
    const used = new Set();
    for (const sp of life.reg.values()) used.add(sp.genus);
    for (const [parent, genus] of life.orphan) if (!used.has(genus)) life.orphan.delete(parent);
    for (const name of life.genera.keys()) if (!used.has(name)) life.genera.delete(name);
  }
  function originWord(sp) {
    // i18n: where a species without a recorded parent came from (the log, the specimen panel)
    return sp.serial > eng.founders ? tr('origin.silt', 'sparked from silt') : tr('origin.founder', 'a founding lineage');
  }
  function pushEvent(html, col, type = 'misc') {
    const text = html.replace(/<[^>]+>/g, '');
    life.chronicle.unshift({ t: eng.simTime, html, text, col, type });
    if (life.chronicle.length > 3000) life.chronicle.length = 3000;
    renderFeed();
  }

  // ------------------------------------------------------------ soundtrack
  // the motif notes the soundtrack is about to play (sound.js onSang), for the song panel and marks
  const songEvents = [];
  const sound = createSound({
    onChange: renderSound,
    // i18n: {why} is the browser's own message (English)
    onError: (m) => flash(tr('flash.sound-error', 'Sound unavailable: {why}', { why: String(m).split('\n')[0].slice(0, 80) })),
    onSang: (list) => {
      // a whole song stops the last one (Field.phrase): its notes still to come won't sound
      if (list.some((e) => e.whole)) { const now = performance.now(); for (let i = songEvents.length - 1; i >= 0; i--) if (songEvents[i].whole && songEvents[i].at > now) songEvents.splice(i, 1); }
      songEvents.push(...list);
      if (songEvents.length > 800) songEvents.splice(0, songEvents.length - 800);
    },
  });
  // the hand heard (hearHand): its acts, where the pointer is (pan), the rod, and the last state sent
  const heard = { pan: 0, tip: null, dipped: false, rung: 0, sent: '', water: null, temps: null, tAt: 0, tRead: 0, freezing: 0, ice: 0 };
  const hear = (ev, m = {}) => sound.hand({ ev, pan: heard.pan, ...m });
  const panAt = (sx) => clamp((sx / innerWidth) * 2 - 1, -1, 1) * 0.6;
  // the picked species' slot (-1 for none): a picked cell's, or the living species open in the panel
  function pickedSlot() {
    if (sel && !sel.film && sel.particle && sel.particle.kind >= FIRST_LIFE && !sel.lost) return sel.particle.kind;
    const sp = spView != null && life.reg.get(spView);
    return sp && sp.alive && genomeFor(sp.genome.slot)?.serial === sp.serial ? sp.genome.slot : -1;
  }
  function playSong(serial) {
    const sp = life.reg.get(serial);
    if (!sp) return;
    const was = sound.on;
    // while it lives, its cells keep quiet as the song plays
    const living = sp.alive && genomeFor(sp.genome.slot)?.serial === sp.serial;
    sound.audition(sp.genome, `sp${serial}`, living ? sp.genome.slot : -1).then(() => { if (!was && sound.on) flash(tr('flash.sound-on', 'Sound on')); });
  }
  let litSlots = null;
  function renderSound() {
    // the GPU only listens while the soundtrack plays
    if (sound.on && !eng.listen) eng.listen = { every: 6, keep: null, vscale: V_SCALE };
    else if (!sound.on) eng.listen = null;
    const b = $('snd'), v = $('vol'), pct = Math.round(sound.volume * 100);
    b.setAttribute('aria-pressed', String(sound.on));
    v.hidden = !sound.on;
    v.value = String(pct);
    // Settings follows in place: rebuilt, its slider would drop out from under a drag
    const sv = $('set-vol');
    if (sv) { sv.value = String(pct); sv.nextElementSibling.textContent = tr('settings.audio.volume-pct', '{pct}%', { pct }); }
    for (const c of document.querySelectorAll('#opts [data-o="sound"]')) c.setAttribute('aria-pressed', String(!!+c.dataset.v === sound.on));
  }
  function feedSound(pop, species) {
    if (!sound.on) return;
    litSlots = focus.key && focus.pred ? species.filter(([, g]) => focus.pred(g)).map(([s]) => s) : null;
    let ampSum = 0;
    for (let k = 0; k < 4; k++) ampSum += eng.tide[k * 4 + 3];
    const tide = eng.season * Math.min(1, ampSum / 3);
    sound.census({ species, pop, world: { light: Math.min(1.2, eng.ambient * 1.2 + 0.85 * tide), tide, warm: K.heat ? clamp((eng.tbg - 16) / 12, -1, 1) : 0 } });
  }
  eng.onListen = (d) => {
    if (state.phase !== 'running') return;
    const selSlot = pickedSlot();
    const keep = sound.listen(d, { selSlot, lit: litSlots });
    if (keep && eng.listen) { eng.listen.keep = keep; eng.listen.selKind = selSlot >= 0 ? selSlot : 0xffffffff; }
  };
  function toggleSound() {
    sound.toggle().then(() => flash(sound.on ? tr('flash.sound-on', 'Sound on') : tr('flash.sound-off', 'Sound off')));
  }
  function nudgeVolume(d) {
    if (!sound.on) { toggleSound(); return; }
    sound.setVolume(sound.volume + d);
    flash(tr('flash.volume', 'Volume {pct}%', { pct: Math.round(sound.volume * 100) }));
  }

  eng.onCensus = (c) => {
    if (state.phase !== 'running') return;
    life.lastCensus = c;
    const pop = c.pop;
    const t = c.simTime;
    life.counts = [pop[0], pop[1], pop[2], 0, pop[3], pop[4]];
    life.roles = [c.globals[12], c.globals[13], c.globals[14]];
    life.matter = [0, 1, 2, 3, 4].map((s) => readGenome(c.genomeU32, c.genomeF32, s));
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
      if (!sp) {
        // its birth as the GPU keeps it, modulo SIM_CLOCK (shaders.js): the latest such moment not after now
        const at = Math.floor(t / SIM_CLOCK) * SIM_CLOCK + g.born;
        g.born = at > t + 1 ? at - SIM_CLOCK : at;
        sp = register(g);
      }
      // heard only once its singer has lived a minute, as most mutants do not (about one signal in 7 hours)
      if (sp.signal && !sp.heard && t - (sp.born || 0) >= SIGNAL_AFTER) {
        sp.heard = true;
        // i18n: the log: {name} is a species (a link) whose song is the five tones
        pushEvent(tr('log.signal', '{name} appears to be trying to communicate', { name: spLink(sp.serial, sp.name) }), g.col, 'est');
        director.spotlight(s, g.serial, { signal: true });
      }
      audio.push([s, g]);
      sp.slot = s;
      sp.genome = g;
      sp.pop = p;
      sp.alive = true;
      if (p > sp.peak) sp.peak = p;
      record(sp.series, t, p);
      seen.add(g.serial);
      if (g.depth > life.maxDepth) life.maxDepth = g.depth;
      if (!sp.established && sp.peak >= life.estThreshold) {
        sp.established = true;
        sp.establishedAt = t;
        const gen = life.genera.get(sp.genus);
        if (t > 20) {
          if (gen && gen.from && !gen.announced) {
            gen.announced = true;
            // i18n: the log: {genus} the new genus, {from} the genus it split from, {name} its first species (a link),
            // {desc} a short description of the species (its body, diet, movement)
            pushEvent(tr('log.genus', 'New genus <b>{genus}</b> splits from {from}: {name} · {desc}', { genus: esc(gen.name), from: esc(gen.from), name: spLink(sp.serial, sp.name), desc: describe(g, K) }), g.col, 'genus');
          } else {
            const anc = sp.ancestor && life.reg.get(sp.ancestor);
            const name = spLink(sp.serial, sp.name), desc = describe(g, K);
            // i18n: the log: a species {name} (a link) has become established; {desc} a short description of it; {origin}
            // where it came from (origin.silt or origin.founder), {parent} the species it descends from (a link)
            pushEvent(sp.founder ? tr('log.established', '{name} established · {desc} · {origin}', { name, desc, origin: originWord(sp) })
              : anc ? tr('log.established-from', '{name} established · {desc} · from {parent}', { name, desc, parent: spLink(anc.serial, anc.name) })
                : tr('log.established-unrecorded', '{name} established · {desc} · from an unrecorded ancestor', { name, desc }), g.col, 'est');
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
          record(sp.series, t, 0);
          sp.series = seal(sp.series);
          // i18n: the log: {name} a species (a link), {dur} how long it lived (a duration), {peak} its most cells at once
          if (sp.peak >= life.estThreshold * 3) pushEvent(tr('log.extinct', '{name} extinct after {dur} · peak {peak, number}', { name: spLink(sp.serial, sp.name), dur: fmtDur(t - (sp.born || 0)), peak: sp.peak }), sp.genome.col, 'ext');
        } else if (sp.heard) { // kept, so the log's link still opens it
          sp.extinct = t;
          // i18n: the log: a species that sang the five tones ({name}, a link) is gone after {dur}
          pushEvent(tr('log.silent', '{name} fell silent after {dur}', { name: spLink(sp.serial, sp.name), dur: fmtDur(t - (sp.born || 0)) }), sp.genome.col, 'ext');
        } else {
          life.reg.delete(sp.serial);
        }
      }
    }
    pruneRecords(t);
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
        // i18n: the log: {name} a species (a link), {n} its living cells
        if (prev && t > 30) pushEvent(tr('log.top', '{name} is now the most numerous · {n, plural, other {# cells}}', { name: spLink(best.serial, best.name), n: best.pop }), best.genome.col, 'top');
        life.top = best.serial;
      }
    }
    eng.abio = abioRate(pop[0]);
    feedSound(pop, audio);

    if (t - life.lastHist >= life.histEvery) {
      const G = Array.from(c.globals);
      // the GPU's counters are u32 and wrap (births at 3.4M particles about every 15 simulated days): differences mod 2^32
      const rate = (i) => (life.prevG && t > life.prevT ? (((G[i] - life.prevG[i]) >>> 0) / (t - life.prevT)) * 60 : 0);
      const sp = [];
      for (const s of life.reg.values()) if (s.alive && s.established) sp.push([s.serial, s.pop]);
      life.history.push({
        t, husk: pop[2], living, sp,
        alive, thriving, diversity: Math.exp(H),
        // (eaten: the kills, globals[7]: deaths in one chart, meals in another)
        births: rate(2), starve: rate(5), old: rate(6), eaten: rate(7), scav: rate(10), bite: rate(11),
        mut: rate(3), ext: rate(8), ambient: eng.ambient, season: eng.season,
        temp: eng.tbg, scald: [20, 21, 22, 23, 24].reduce((a, i) => a + (life.prevD ? (c.demography[i] - life.prevD[i]) >>> 0 : 0), 0) / Math.max(1e-6, t - life.prevT) * 60,
        torpid: torpidShare(c),
      });
      life.prevD = Array.from(c.demography);
      life.prevG = G;
      life.prevT = t;
      life.lastHist = t;
      if (life.history.length > 480) { life.history = life.history.filter((_, i) => i % 2 === 0); life.histEvery *= 2; }
      drawWorldChart();
    }
    tellStories(c);
    if (focus.key && focus.pred) pushFocus();
    renderWorld();
    lab.render(false);
    if (sel || spView != null) dirty = true;
  };

  // The chronicler reads every census (every third carries the species ledger) and now and then
  // writes a story into the log; the auto camera goes to see its subject. Its watch list (the species
  // whose meals the ledger counts) goes to the GPU when it changes.
  const slotSerial = new Uint32Array(MAXK);
  // the species the specimen panel shows (its own, or the selected cell's), or null
  const viewedSerial = () => (spView != null ? spView : sel && sel.particle && sel.particle.kind >= FIRST_LIFE ? genomeFor(sel.particle.kind)?.serial : null);
  function tellStories(c) {
    if (c.spl) for (let s = FIRST_LIFE; s < MAXK; s++) slotSerial[s] = c.pop[s] ? genomeSerial(c.genomeU32, s) : 0;
    const x = climate.excursion, t = c.simTime;
    const told = chron.observe({
      t, now: performance.now(), reg: life.reg, genera: life.genera, living: life.counts[3], stone: life.counts[4], count: eng.count,
      est: life.estThreshold, founders: eng.founders, slotSerial: c.spl ? slotSerial : null, spl: c.spl || null,
      temp: eng.tbg, light: eng.ambient, world: eng.grid, era: climate.name,
      event: climate.event && climate.phase ? { type: climate.event.type, phase: climate.phase } : null,
      excursion: x && t >= x.t && t <= x.t + x.dur ? x : null,
      focus: viewedSerial(),
    });
    for (const s of told) {
      pushEvent(s.html, s.col, 'story');
      if (desk) unlock(earned(s, storiesRead()));
      const sp = s.subjects.map((k) => life.reg.get(k)).find((k) => k && k.alive);
      if (sp) director.spotlight(sp.slot, sp.serial, { story: s.text });
    }
    const w = chron.watch();
    if (w.version !== watchVer) { watchVer = w.version; eng.setWatch(w.version, watchMap(w, life.reg, watchSlots)); }
  }

  // the share of the living that were torpid since the last census that read it (the ledger samples
  // each living cell once a second)
  let torpidPrev = null;
  function torpidShare(c) {
    const now = Array.from(c.energy.slice(40, 57)), prev = torpidPrev;
    torpidPrev = now;
    if (!prev) return 0;
    // u32 counters, each differenced mod 2^32 (they wrap in long worlds)
    let all = 0;
    for (let k = 0; k < 16; k++) all += (now[k] - prev[k]) >>> 0;
    return all > 0 ? ((now[16] - prev[16]) >>> 0) / all : 0;
  }

  // ------------------------------------------------------------ world column
  // i18n: the census's matter rows (the Field Lab)
  const MIX = [
    [tr('census.mix.living', 'Living'), 3, LIVING_CSS, 'living', 'class:living'],
    [tr('census.mix.husk', 'Husk'), 2, MATTER[2].css, 'husk', 'class:husk'],
    [tr('census.mix.stone', 'Stone'), 4, MATTER[3].css, 'stone', 'class:stone'],
    ...(K.heat ? [[tr('census.mix.framboids', 'Framboids'), 5, MATTER[4].css, 'framboid', 'class:framboid']] : []),
    [tr('census.mix.silt', 'Silt'), 0, MATTER[0].css, 'silt', 'class:silt'],
  ];
  const mixEl = $('mix');
  mixEl.innerHTML = `<div class="mix-bar" aria-hidden="true">${MIX.map(([, , col]) => `<i style="background:${col}"></i>`).join('')}</div>`
    + MIX.map(([label, , col, tip, key]) => `<button type="button" class="mix-row" data-focus="${key}" aria-pressed="false"><i style="background:${col}"></i><span><span class="term" data-tip="${tip}">${label}</span></span><b></b><em></em></button>`).join('');
  mixEl.addEventListener('click', (e) => { const b = e.target.closest('[data-focus]'); if (b) focusFacet(b.dataset.focus); });
  function renderWorld() {
    const N = Math.max(1, eng.count);
    const segs = mixEl.firstChild.children;
    const rows = mixEl.querySelectorAll('.mix-row');
    MIX.forEach(([, i, , , key], k) => {
      const v = life.counts[i];
      segs[k].style.flex = String(Math.max(v, N * 0.004));
      rows[k].setAttribute('aria-pressed', String(focus.key === key));
      setLive(rows[k].children[2], fmt(v));
      setLive(rows[k].children[3], tr('census.mix.pct', '{pct}%', { pct: ((v / N) * 100).toFixed(1) }));
    });
    setText('n-alive', fmt(life.alive));
    setText('n-thriving', fmt(life.thriving));
    setText('n-ever', fmt(life.arisen));
    setText('n-depth', fmt(life.maxDepth));
    setText('r-living', fmt(life.counts[3]));
    setText('r-species', fmt(life.alive));
    // i18n: the Field Lab's header, folded: living cells and living species
    setText('world-sum', tr('census.sum', '{living, number} living · {species, number} species', { living: life.counts[3], species: life.alive }));
  }
  function drawWorldChart() {
    if (!lab || !lab.isOpen() || lab.tab() !== 'census' || !life) return;
    drawLiving($('chart'), life.history, chartReg, climate && climate.history, focus.key && focus.key.startsWith('sp:') ? +focus.key.slice(3) : null);
  }
  // Pointing at any chart names what is under it (a species on the plate the world view gives a
  // picked cell, or the values at that moment); a click on a species (on touch, a second tap) opens it,
  // and a click on the species already open closes it and its highlight.
  const charts = chartPointer($('plate'), (serial) => {
    if (spView !== serial) { openSpecies(serial); return; }
    deselect();
    if (focus.key === `sp:${serial}`) clearFocus();
  });
  let feedKey = '';
  function renderFeed() {
    if (!life || uiHeld()) return;
    const ch = life.chronicle;
    const key = `${ch.length}:${ch[0] ? ch[0].t : 0}`;
    if (key === feedKey) return;
    feedKey = key;
    const feedEl = $('feed');
    setHTML(feedEl, ch.length ? ch.slice(0, 40).map((e) => `<li${e.type === 'story' ? ' class="story"' : ''}><i style="background:${cssCol(e.col)}"></i><time>${fmtClock(e.t)}</time><span>${e.html}</span></li>`).join('') : `<li class="quiet">${tr('log.empty', 'New species, extinctions and eras are logged here, and now and then the chronicler’s stories.')}</li>`);
    relabel(feedEl);
  }
  $('feed-all').addEventListener('click', () => lab.open('log'));

  // ------------------------------------------------------------ selection
  let sel = null;
  let spView = null;
  let dirty = false;
  function deselect() {
    if (ride.on) toggleRide(false, false);
    sel = null;
    spView = null;
    eng.trackId = NONE;
    state.follow = false;
    if (specimen) specimen.close();
    setMembers(null);
  }
  // ------------------------------------------------------------ riding (docs/hand.md)
  // The specimen ridden: the camera follows it, diving to it (ride.js), and WASD, the arrows or a held click or finger
  // steer it, a will among its drives (hand.steer) that its whole body takes on. Untouched, a ride is a follow.
  // Coarse steps cannot be steered: above ×2 the ride goes on as a follow. Selecting another cell, panning, taking
  // up a tool or Esc gets off; so does its death, unless it was one cell of a body that lives on (it rides on in another).
  // The shorter side of the view, in world units
  const viewShort = () => Math.min(canvas.width, canvas.height) / ppu();
  function toggleRide(on = !ride.on, say = true) {
    if (on && !(sel && sel.particle.kind >= FIRST_LIFE && !sel.lost)) return;
    ride.on = on;
    ride.at = null;
    ride.th = createThrottle();
    if (sel) sel.rideEnded = false;
    if (on) {
      if (inHand()) pickTool('none');
      // (the auto camera's subject, ridden, becomes the viewer's own)
      if (sel.film) { sel.film = false; sel.filmFor = null; specimen.open(); }
      takeOver();
      state.follow = true;
      ride.cam = createRideCam(viewShort());
    } else {
      hand.steer(NONE);
      state.follow = false;
      ride.cam = null;
      rideBody(null);
    }
    dirty = true;
    if (say) flash(on ? tr('flash.ride-on', 'Ride On · WASD to steer') : tr('flash.ride-off', 'Ride Off'));
  }
  // the ride over by itself (why: 'died' or 'lost' track of it, after which the panel offers Ride a relative)
  function endRide(why) {
    if (!ride.on) return;
    toggleRide(false, false);
    if (why && sel) sel.rideEnded = true;
    // i18n: the flash when a ride ends by itself: the ridden cell died, or the view lost track of it
    flash(why ? tr('flash.ride-ended', 'Ride Off · {why, select, died {it died} other {lost track of it}}', { why }) : tr('flash.ride-off', 'Ride Off'));
  }
  // the ridden body's cells, sent to the steps when they change (the trace's members: setMembers)
  function rideBody(ids) {
    if (ids === ride.body) return;
    ride.body = ids;
    eng.setRideBody(ids);
  }
  // where the ridden cell is steered this frame, and how hard (nothing held: it goes its own way)
  function steerRide(dt) {
    if (!ride.on) return;
    if (!sel || sel.lost) { endRide('lost'); return; }
    // (one cell of a body died: until the next trace rehomes the watch it rides on in the body, which keeps the will)
    if (sel.particle.kind < FIRST_LIFE && !sel.rehome) { endRide('died'); return; }
    const fast = state.speed > 2, live = !fast && !state.paused;
    const [px, py] = predicted(), [W, H] = eng.grid;
    const way = ride.at ? pointerWay(wrapD(ride.at[0] - px, W), wrapD(ride.at[1] - py, H)) : keyWay(ride.keys);
    const held = way[0] !== 0 || way[1] !== 0;
    if (fast && held && !ride.warned) { ride.warned = true; flash(tr('flash.ride-too-fast', 'Steering only at ×2 or slower')); }
    if (!fast) ride.warned = false;
    const u = stepThrottle(ride.th, live ? way : [0, 0], dt / 1000);
    const s = live ? throttleGrip(u) : 0;
    // (a cyst sleeps: it will not move however it is steered, and says so once)
    const cyst = sel.particle.cause === CYST;
    if (cyst && held && !ride.slept) { ride.slept = true; flash(tr('flash.ride-cyst', 'Dormant, a cyst · it moves when it wakes')); }
    if (!cyst) ride.slept = false;
    const g = genomeFor(sel.particle.kind), v = (ride.top = willSpeed(g, K));
    if (s > 0 && g?.serial && !life.rode.includes(g.serial)) life.rode.push(g.serial);
    hand.steer(sel.id, u[0] * v, u[1] * v, s, eng.simTime, [px, py]);
    rideBody(members);
  }
  // the ride's camera: into a mid-to-close zoom on it, then a little wider as it nears its top speed (until the viewer zooms)
  function rideCamera(dt) {
    if (!ride.on || !ride.cam || ride.cam.manual || !sel) return;
    const w = stepRideCam(ride.cam, Math.hypot(sel.particle.vx, sel.particle.vy) / ride.top, sel.box ? sel.org.span : 0, dt / 1000);
    cam.zoomTarget = clamp(Math.min(canvas.width, canvas.height) / (w * fitPPU()), 1, maxZoom());
  }
  // the viewer zoomed: the ride's camera keeps the zoom they chose for the rest of the ride
  const zoomedByHand = () => { if (ride.cam) ride.cam.manual = true; };
  // The nearest living cells of a kind about a point: the youngest within reach of it (a child just budded), else the nearest
  async function nearestKin(kind, at, not) {
    const res = await eng.requestPick(at, 4, NONE, { kind });
    const [W, H] = eng.grid;
    const kin = (res?.entries || []).filter((c) => c.id !== not && c.kind === kind)
      .map((c) => ({ c, d: Math.hypot(wrapD(c.x - at[0], W), wrapD(c.y - at[1], H)) }));
    const young = kin.filter((k) => k.d < 1.2).sort((a, b) => a.c.age - b.c.age)[0];
    return { res, young: !!young, next: (young || kin.sort((a, b) => a.d - b.d)[0])?.c };
  }
  // Tab: on to the ridden cell's newest kin near it (a child just budded, or the nearest of its kind)
  async function hopRide() {
    if (!ride.on || !sel) return;
    const { res, young, next } = await nearestKin(sel.particle.kind, predicted(), sel.id);
    if (!next) { flash(tr('flash.ride-none-near', 'None of its kind near')); return; }
    if (!ride.on) return;
    beginTracking(next, res, true);
    dirty = true;
    flash(young ? tr('flash.ride-newest', 'On to its newest kin') : tr('flash.ride-nearest', 'On to the nearest of its kind'));
  }
  // After a ride ended in its death: ride the nearest of its kind
  async function rideRelative() {
    if (!sel || !sel.memory) return;
    const kind = sel.memory.kind, at = [sel.particle.x, sel.particle.y];
    const { res, next } = await nearestKin(kind, at, sel.id);
    if (!next) { flash(tr('flash.ride-none-nearby', 'None of its kind nearby')); return; }
    beginTracking(next, res, true);
    toggleRide(true, false);
    flash(tr('flash.ride-relative', 'Ride On · a relative'));
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

  // (riding: a click on nothing, on matter or on the ridden body does nothing; on another living cell it gets off and selects it)
  async function selectAt(sx, sy, pxPerWorld, world, riding = false) {
    if (state.phase !== 'running') return;
    const [wx, wy] = world || toWorldShown(sx, sy);
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
    // a stone grain is a cobble ~0.17 across (vsStone), a framboid about half that; other matter is a small chip
    const anyR = bestAny && bestAny.kind === 3 ? 0.17 : bestAny && bestAny.kind === 4 ? 0.09 : 0.05;
    const touchR = isCoarse ? 30 : 22;
    const chosen = bestLife && bl < Math.max(touchR, 0.2 * p) ? bestLife : bestAny && ba < Math.max(isCoarse ? 20 : 14, anyR * p) ? bestAny : null;
    if (riding) {
      if (!chosen || chosen.kind < FIRST_LIFE || !ride.on || !sel || chosen.id === sel.id || sel.members?.has(chosen.id)) return;
      endRide();
    }
    if (!chosen) { deselect(); return; }
    beginTracking(chosen, res);
    closeMenus();
  }

  // film: the auto camera's subject, marked and traced like a pick but without opening the panel
  function beginTracking(p, res, keepStory, film = false) {
    const oldStory = keepStory && sel ? sel.story : [];
    spView = null;
    sel = { id: p.id, particle: p, sampleT: res.simTime ?? eng.simTime, nbr: res, disp: [p.x, p.y], err: [0, 0], dispT: null, box: null, boxD: null, lost: false, story: oldStory, memory: null, org: null, orgFirst: null, orgNear: null, members: null, rehome: null, diedAt: null, lastOrg: -1e9, lastNbr: -1e9, film, filmFor: film ? p.id : null };
    eng.trackId = p.id;
    if (film) specimen.close(); else specimen.open();
    setMembers(null);
    if (p.kind >= FIRST_LIFE) {
      const g = genomeFor(p.kind);
      const sp = g ? life.reg.get(g.serial) : null;
      sel.org = { cells: 1, roles: [0, 0, 0].map((_, i) => (i === p.role ? 1 : 0)), span: 0, speed: Math.hypot(p.vx, p.vy), meanE: p.energy, partial: false, touching: 0, pending: true };
      remember();
      // i18n: the specimen's story, a cell picked (or watched on from one before it): {role} its type's letter (α, β, γ),
      // {name} its species (a link), {age} its age (a duration)
      story(tr('story.picked-cell', '{how, select, watch {Now watching} other {Picked}} a {role}-cell{known, select, yes { of {name}} other {}}, age {age}.',
        { how: keepStory ? 'watch' : 'pick', role: ROLE[p.role], known: sp ? 'yes' : 'no', name: sp ? spLink(sp.serial, sp.name) : '', age: fmtDur(p.age) }));
    } else {
      // i18n: the specimen's story, a grain of matter picked
      story(tr('story.picked-matter', '{kind, select, 0 {Picked a grain of silt.} 2 {Picked a grain of husk.} 3 {Picked a grain of stone.} other {Picked a framboid.}}', { kind: p.kind }));
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
    if (!best) { flash(tr('flash.no-relatives', 'No surviving relatives nearby')); return; }
    beginTracking(best, sel.nbr, true);
  }

  function transitionText(a, b) {
    // i18n: the specimen's story, what the watched particle became: {age} its age (a duration)
    if (a.kind >= FIRST_LIFE && b.kind === 2) return tr('story.died-husk', 'Died: {cause, select, old {old age} killed {killed by a hunter or grazed away} other {starved}} at age {age}. Its body is now a husk.', { cause: b.cause === 2 ? 'old' : b.cause === 3 ? 'killed' : 'starved', age: fmtDur(a.age) });
    if (a.kind >= FIRST_LIFE && b.kind === 0) return tr('story.eaten', 'Was eaten. What remained is silt.');
    if (a.kind >= FIRST_LIFE && b.kind >= FIRST_LIFE) return tr('story.changed-species', 'Changed species.');
    if (a.kind >= FIRST_LIFE && b.kind === 3) return tr('story.died-stone', 'Died: {cause, select, old {old age} other {starved}} at age {age}. Its skeleton is now stone.', { cause: b.cause === 2 ? 'old' : 'starved', age: fmtDur(a.age) });
    if (a.kind === 3 && b.kind === 0) return tr('story.stone-wore', 'The stone wore away into silt.');
    if (a.kind === 4 && b.kind === 0) return tr('story.framboid-spent', 'The framboid was spent and crumbled into silt.');
    if (a.kind === 2 && b.kind === 4) return tr('story.husk-framboid', 'The husk rotted in a pile, and its sulfide crystallized as a framboid.');
    if (a.kind === 2 && b.kind === 0) return b.cause === 3 ? tr('story.husk-eaten', 'The husk was eaten by a scavenger.') : tr('story.husk-crumbled', 'The husk crumbled into silt.');
    return tr('story.became', 'Became {kind, select, 0 {silt} 2 {husk} 3 {stone} 4 {framboid} other {a living cell}}.', { kind: b.kind < FIRST_LIFE ? b.kind : 'life' });
  }
  // the watched cell of a body died (a to b) and the watch moves on to another of its cells
  function rehomeText(a, b) {
    // i18n: the specimen's story: the watched cell of an organism died: {age} its age (a duration)
    if (a.kind >= FIRST_LIFE && (b.kind === 2 || b.kind === 3)) return tr('story.died-body-lives', 'Died: {cause, select, old {old age} killed {killed by a hunter or grazed away} other {starved}} at age {age}. Its organism lives on; now watching another of its cells.', { cause: b.cause === 2 ? 'old' : b.cause === 3 && b.kind === 2 ? 'killed' : 'starved', age: fmtDur(a.age) });
    if (a.kind >= FIRST_LIFE && b.kind === 0) return tr('story.eaten-body-lives', 'Was eaten. Its organism lives on; now watching another of its cells.');
    // i18n: {was} is what became of the watched cell (story.became...)
    return tr('story.body-lives', '{was} Its organism lives on; now watching another of its cells.', { was: transitionText(a, b) });
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
      // i18n: the specimen's story: {pct} the share of its energy (%) it gave its child
      story(tr('story.divided', 'Divided, passing {pct}% of its energy to a child.', { pct: Math.round((1 - cur.energy / prev.energy) * 100) }));
    }
    sel.particle = cur;
    sel.sampleT = t;
    if (cur.kind >= FIRST_LIFE && sel.memory) sel.memory.p = cur;
    dirty = true;
  }

  eng.onTrack = (r) => {
    if (director.active && r.id === director.trackId) {
      director.onTrack(r);
      // the camera picked a new subject to follow: mark it as if it had been clicked
      const sh = director.shot;
      if (r.found && sh && sh.why && sh.why.kind === 'follow' && spView == null && (!sel || (sel.film && sel.filmFor !== r.id))) {
        beginTracking(r.tracked, { entries: [], simTime: r.simTime }, false, true);
      }
    }
    if (!sel || r.id !== sel.id || sel.lost) return;
    if (!r.found) {
      sel.lost = true;
      eng.trackId = NONE;
      setMembers(null);
      story(sel.particle && sel.particle.kind === 0 ? tr('story.lost-built', 'Built into a new cell by a parent nearby. Lost track.') : tr('story.lost', 'Lost track.'));
      return;
    }
    applySample(r.tracked, r.simTime);
  };

  // What the watched cell is doing: a replay of its last decision (mind.js), steadied so the headline holds.
  eng.onMind = (r) => {
    if (!sel || r.id !== sel.id || sel.lost) return;
    const m = parseMind(r.u32, r.f32);
    const kind = sel.particle.kind;
    const g = m && kind >= FIRST_LIFE ? genomeFor(kind) : null;
    if (!g) { sel.mind = null; return; }
    const it = interpretMind(m, g, kind, { K, genomeOf: genomeFor, ridden: ride.on });
    sel.mindMemo = settleMind(sel.mindMemo, it);
    sel.mind = { ...it, head: sel.mindMemo.cur, m, kind };
    specimen.mindUpdate();
    dirty = true;
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
      // Watch the traced cell nearest the body's middle, favoring young ones so the watch lasts.
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
        story(rehomeText(sel.particle, sel.rehome.cell));
        if (ride.on) flash(tr('flash.ride-rehome', 'Its cell died · riding on in its body'));
      } else story(tr('story.organism-split', 'Its organism split: following the larger part.'));
      sel.rehome = null;
      sel.id = idAt(best);
      sel.mind = null;
      sel.mindMemo = null;
      sel.particle = parseParticle(u32, f32, best * PICK_WORDS);
      sel.sampleT = res.simTime;
    }

    // the cells of the body near the watched one, for "touching", and the body's extent around it,
    // which the marker frames
    const near = [];
    const box = [0, 0, 0, 0];
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k];
      const dx = wrapD(X[i] - sel.particle.x, W), dy = wrapD(Y[i] - sel.particle.y, H);
      if (near.length < 400 && Math.hypot(dx, dy) < 2) near.push({ x: X[i], y: Y[i] });
      box[0] = Math.min(box[0], dx); box[1] = Math.min(box[1], dy); box[2] = Math.max(box[2], dx); box[3] = Math.max(box[3], dy);
    }
    sel.orgNear = near;
    sel.box = members.size > 1 ? box : null;
    const prev = sel.org;
    const mid = [((rx + cx) % W + W) % W, ((ry + cy) % H + H) % H];
    sel.org = { cells: members.size, roles, span: span * 2, mid, speed: Math.hypot(vx / m, vy / m), meanE: eSum / m, partial: res.truncated, touching: prev ? prev.touching : 0, at: res.simTime, ms: performance.now() - t0 };
    if (sel.orgFirst == null) {
      sel.orgFirst = members.size;
      // the camera moved on to another cell after its subject died, perhaps of another organism of
      // the species: its caption counts the body it now follows
      const sh = sel.film && director.shot;
      if (sh && sh.rehomed && sh.subject && sh.subject.id === sel.filmFor) {
        sh.rehomed = false;
        if (sh.why.cells !== members.size) { sh.why.cells = members.size; sh.whyVer++; }
      }
      // i18n: the specimen's story: {n} the cells of the organism the picked cell belongs to
      if (members.size > 1) story(tr('story.organism', 'It is one cell of a {n, number}-cell organism. Following the whole body.', { n: members.size }));
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
    story(tr('story.organism-gone', 'None of its organism survived.'));
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
    focusKey: () => focus.key, riding: () => ride.on, rideEnded: () => !!(sel && sel.rideEnded && sel.memory),
    onRide: () => toggleRide(),
    onRideRelative: rideRelative,
    onRelative: followRelative,
    onFind: () => findMember(spView),
    onHighlight: () => {
      const serial = spView != null ? spView : sel && genomeFor(sel.particle.kind)?.serial;
      const sp = serial != null && life.reg.get(serial);
      if (!sp) return;
      if (focus.key === `sp:${sp.serial}`) clearFocus(); else focusSpecies(sp);
    },
    onClose: deselect,
    onPlaySong: playSong,
    onCard: () => {
      const serial = viewedSerial();
      if (serial != null && life.reg.has(serial)) cards.open(serial);
    },
    // a species not yet in the cabinet offers Save; once saved, its Card
    saved: (serial) => !!savedCard(serial),
    onSave: () => { const serial = viewedSerial(); if (serial != null) saveCard(serial); },
  });

  // ------------------------------------------------------------ portraits
  // A species' portrait, one for each, on its mini-card and (more of it) its card: its cells drawn alone in the
  // close-up, in place of the world (the studio, src/studio.js), framed to fill what a mini-card shows, so it never
  // misses its subject, wherever (or whether) the species is in the water. A frame of the close-up draws it into a
  // texture of its own, read back as pixels ({ data, w, h, bgra }: encode.js makes them pictures, off this thread).
  let portraitJob = null;
  const PORTRAIT = 1280, THUMB = 192; // (a row of a portrait's pixels a multiple of 256 bytes, as a texture copy needs)
  // its species' cells (genome words; cells [{ e, a, col, info, partners }]) laid out still: its pixels
  // (cells with a place, at: [x, y], as they lay in the water, keep it; the rest are laid out by their bonds)
  function takeStudio(words, cells) {
    const [W, H] = eng.grid, { parts, ppu } = stage(genomeOfWords(words), cells, PORTRAIT, [W / 2, H / 2]);
    eng.setStudio(parts, cells.length, Uint32Array.from(words));
    if (portraitJob) portraitJob.resolve(null);
    return new Promise((resolve) => { portraitJob = { studio: true, cx: W / 2, cy: H / 2, size: PORTRAIT, ppu, resolve, at: performance.now() }; });
  }
  // A picture of what the view shows (the screen's shorter side, square): a save's preview.
  function takeView() {
    if (portraitJob) portraitJob.resolve(null);
    const span = Math.min(innerWidth, innerHeight) / cssPPU();
    return new Promise((resolve) => { portraitJob = { cx: cam.x, cy: cam.y, size: PORTRAIT, ppu: PORTRAIT / span, resolve, at: performance.now() }; });
  }
  // the job's frame: drawn in place of the close-up (the frame loop), then copied out once the GPU is done
  function portraitParams() {
    const j = portraitJob;
    if (!j || j.drawn) return null;
    // (the close-up's pipelines land in the engine's second wave: until then the job waits, its time not counted)
    if (!eng.closeupReady(j.studio)) { j.at = performance.now(); return null; }
    if (performance.now() - j.at > 4000) { portraitJob = null; j.resolve(null); return null; }
    j.tex = device.createTexture({ size: [j.size, j.size], format: eng.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    j.drawn = true;
    return { target: j.tex.createView(), w: j.size, h: j.size, cx: j.cx, cy: j.cy, ppu: j.ppu, dpr: 1, studio: !!j.studio };
  }
  async function readPortrait() {
    const j = portraitJob;
    portraitJob = null;
    const S = j.size, row = S * 4, buf = device.createBuffer({ size: row * S, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: j.tex }, { buffer: buf, bytesPerRow: row }, [S, S]);
    device.queue.submit([enc.finish()]);
    try {
      await buf.mapAsync(GPUMapMode.READ);
      j.resolve({ data: buf.getMappedRange().slice(0), w: S, h: S, bgra: eng.format.startsWith('bgra') });
      buf.unmap();
    } catch { j.resolve(null); }
    buf.destroy(); j.tex.destroy();
  }
  // a name of the viewer's own (cleared: its own again); the log's older entries follow (relabel)
  function renameSpecies(serial, name) {
    const sp = life.reg.get(serial);
    if (!sp) return;
    sp.binomial ??= sp.name;
    sp.name = name || sp.binomial;
    sp.given = !!name;
    if (name) unlock(['NAMED']);
    specimen.invalidate(); dirty = true; feedKey = ''; renderFeed(); lab.render(true);
    // i18n: a species named by the viewer ({name}: the name given), or its own name ({name}) again
    flash(name ? tr('flash.named', 'Named {name}', { name }) : tr('flash.named-again', '{name} again', { name: sp.name }));
  }
  function relabel(root) {
    for (const a of root.querySelectorAll('a.sp[data-serial]')) {
      const sp = life.reg.get(+a.dataset.serial);
      if (sp && sp.binomial && a.textContent !== sp.name) a.textContent = sp.name;
    }
  }
  // ------------------------------------------------------------ the cabinet (cabinet.js): every card saved, in every world
  // A card keeps its species' genome (its PNG's text chunk, its QR code's link), so it can be carried to any world:
  // loaded into the pipette as a colony made when it is set down. A world is known by its seed.
  const cabinet = { store: createCabinetStore(), cards: [], removed: null }, UNDO_MS = 12000;
  cabinet.store.list().then((c) => { cabinet.cards = c; lab?.render(true); }).catch(() => {});
  const worldId = () => eng.seedValue;
  const cardFacets = new WeakMap();
  const savedCard = (serial) => cabinet.cards.find((c) => c.world === worldId() && c.serial === serial) || null;
  // what a species' card carries: its genome's words (exact from the census while it lives), its home water, its
  // body as its portrait shows it (its card's kept one, if it has a card)
  function carry(serial) {
    const sp = life.reg.get(serial), slot = sp?.alive ? sp.slot : -1;
    const words = slot >= FIRST_LIFE && life.lastCensus && genomeSerial(life.lastCensus.genomeU32, slot) === serial ? wordsOf(slot) : genomeWords(sp.genome);
    const home = sp.home || climate.name, touched = hand.touched || !!sp.carried;
    const body = savedCard(serial)?.body ?? fulls.get(`s${serial}`)?.body ?? null;
    const bytes = encodeCard({ words, name: sp.name, home, touched, body });
    return { words, home, touched, body, bytes, link: cardLink(bytes) };
  }
  // the card as a PNG that carries its genome (null if its species has left the records meanwhile: an open card's
  // species can die unestablished or be pruned, and carry() needs its genome)
  async function cardPng(cv, serial) {
    const png = await encodeBytes(cv, 'image/png').catch(() => null);
    return png && life.reg.has(serial) ? new Blob([cardIntoPng(png, carry(serial).bytes)], { type: 'image/png' }) : null;
  }
  // (quiet: one of many, the cabinet drawn once they are all in)
  async function keepCard(card, quiet = false) {
    await cabinet.store.put(card);
    cabinet.cards = [...cabinet.cards.filter((c) => c.id !== card.id), card];
    if (!quiet) lab.render(true);
  }
  // ---- each species' portrait, by key ('s' + its serial, of this world's; 'c' + a card's id, of another world's):
  // its mini-card's (a small JPEG, minicard.js), shown when it comes, and the picture itself for its card (the last
  // FULL_KEEP, with both as JPEGs). A card in the cabinet keeps both (thumb, portrait), so its species' is the same
  // when the page is opened again; another world's card keeps its thumb, else (a card that came by its link alone)
  // its species is drawn alone from its genome
  const FULL_KEEP = 8, fulls = new Map(); // key -> { bmp (ImageBitmap), thumb, full (JPEG bytes) }
  const portraitQ = new Map(); // key -> { words, serial, stored, wait: [resolve], tries }
  let portraitBusy = false, portraitGen = 0;
  // a portrait asked for (words: the genome's; serial: its species of this world; stored: a card's kept portrait,
  // JPEG bytes; body: the body a card carries, studio.js bodyOf): its mini-card's shown when it comes; resolves to the
  // picture (full: taken again if only the mini-card's is kept) or null
  function portrait(key, words, serial = null, full = false, stored = null) {
    if (fulls.has(key) || (!full && hasThumb(key))) return Promise.resolve(fulls.get(key)?.bmp ?? null);
    const w = ask(key, words, serial, stored);
    return new Promise((r) => w.wait.push(r));
  }
  function ask(key, words, serial = null, stored = null, body = null) {
    let w = portraitQ.get(key);
    if (!w) { portraitQ.set(key, (w = { words, serial, stored, body, wait: [], tries: 0 })); setTimeout(pumpPortraits, 0); }
    return w;
  }
  // this world's species' (its card's kept one, if it has a card): the picture, for its card
  const speciesPortrait = (serial) => (life.reg.has(serial) ? portrait(`s${serial}`, carry(serial).words, serial, true, savedCard(serial)?.portrait) : Promise.resolve(null));
  // and the key of its mini-card's
  function speciesThumb(serial, words) {
    const key = `s${serial}`;
    if (!hasThumb(key)) ask(key, words, serial, savedCard(serial)?.portrait);
    return key;
  }
  // a cabinet card's portrait key: its species', of this world; else its own
  function cabThumb(c) {
    if (c.world === worldId()) return speciesThumb(c.serial, c.words);
    const key = `c${c.id}`;
    if (!hasThumb(key)) { if (c.thumb?.length) setThumb(key, c.thumb); else ask(key, c.words, null, null, c.body); }
    return key;
  }
  // a card's PNG's portrait, as a mini-card's (the square the card shows the middle of, cut by the browser as it
  // decodes, off the page's thread)
  const PORTRAIT_CUT = (() => { const { x, y, w, h } = PORTRAIT_BOX, side = w / PORTRAIT_SHOWN; return [x + w / 2 - side / 2, y + h / 2 - side / 2, side, side].map((v) => v * CARD_SCALE); })();
  async function pngThumb(png) {
    const bmp = await createImageBitmap(new Blob([png], { type: 'image/png' }), ...PORTRAIT_CUT, { resizeWidth: THUMB, resizeHeight: THUMB, resizeQuality: 'high' });
    try { return await encodeBytes(bmp, 'image/jpeg', 0.82); } finally { bmp.close(); }
  }
  // a pipette run's: its species', else (a stranger) its card's
  function pipThumb(sp) {
    if (!sp.stranger) return speciesThumb(sp.serial, sp.words);
    const c = pipCard(sp);
    return c ? cabThumb(c) : '';
  }
  // What a species' portrait shows, as it looks in the water: its largest body there (a patch of STUDIO_N of its
  // cells about the body's middle, as they lie), or, single-celled, a few of its densest crowd as they float; null
  // when it is not in the water. One readback of its cells (bestMember).
  async function worldCells(serial) {
    const sp = life.reg.get(serial), c = life.lastCensus;
    if (!sp?.alive || !c || genomeSerial(c.genomeU32, sp.slot) !== serial) return null;
    const m = await bestMember(sp, Math.min(4096, sp.pop * 1.25 + 256));
    if (!m) return null;
    const { u32, f32, mid, dist } = m, [W, H] = eng.grid;
    // (a single-celled species: as close as they float, but few enough to be seen: a portrait, not a census)
    const set = m.body ? bodyPatch(m.edges, mid, STUDIO_N)
      : Array.from({ length: m.n }, (_, j) => j).filter((j) => dist(mid, j) < 0.8).sort((a, b) => dist(mid, a) - dist(mid, b)).slice(0, 5);
    const local = new Map(set.map((k, i) => [k, i])), at = (k, w, D) => wrapD(f32[k * PICK_WORDS + w] - f32[mid * PICK_WORDS + w], D);
    return set.map((k) => ({ e: f32[k * PICK_WORDS + 5], a: f32[k * PICK_WORDS + 6], col: u32[k * PICK_WORDS + 8], info: u32[k * PICK_WORDS + 9],
      partners: m.body ? m.edges[k].filter((j) => local.has(j)).map((j) => local.get(j)) : [], at: [at(k, 0, W), at(k, 1, H)] }));
  }
  // What a species' portrait shows from what is to hand: its largest body in the pipette (the first STUDIO_N of its
  // cells, as they hold together), else a few of its single cells there, else (none held) the body its card carries,
  // else a few newborns of its genome: [{ e, a, col, info, partners }]
  function heldCells(words, serial, body = null) {
    const orgs = serial == null ? [] : [...pipette.species.filter((x) => !x.stranger && x.serial === serial).flatMap((x) => x.orgs),
      ...(pull.got.length ? incoming().filter((x) => x.g.serial === serial).flatMap((x) => bodiesOf(x.recs)) : [])];
    const cell = (c, n) => ({ e: c[0], a: c[1], col: c[2], info: c[3], partners: c.slice(4).filter((j) => j >= 0 && j < n) });
    const big = orgs.reduce((a, o) => (!a || o.cells.length > a.cells.length ? o : a), null);
    if (big && big.cells.length > 1) { const n = Math.min(STUDIO_N, big.cells.length); return big.cells.slice(0, n).map((c) => cell(c, n)); }
    if (orgs.length) return orgs.slice(0, 5).map((o) => cell(o.cells[0], 0));
    return portraitCells(genomeOfWords(words), body);
  }
  // one at a time (a frame each), a few tries each
  async function pumpPortraits() {
    if (portraitBusy || !portraitQ.size) return;
    // (a pick of the pointer's or the selection's under way, or a view being taken: after it)
    if (portraitJob || eng.pickReq || state.phase !== 'running') { setTimeout(pumpPortraits, 300); return; }
    const [key, w] = portraitQ.entries().next().value, gen = portraitGen;
    portraitBusy = true;
    let p = null;
    try {
      const bytes = async (b) => new Uint8Array(await b.arrayBuffer());
      const thumbOut = { type: 'image/jpeg', quality: 0.82, size: THUMB };
      if (w.stored) {
        const { files, bitmap } = await encodeImages(await createImageBitmap(new Blob([w.stored], { type: 'image/jpeg' })), [thumbOut], true);
        p = { bmp: bitmap, thumb: await bytes(files[0]), full: w.stored };
      } else {
        // (as it looks in the water, where it lives; else from what is to hand)
        const seen = w.serial != null ? await worldCells(w.serial).catch(() => null) : null;
        const cells = seen || heldCells(w.words, w.serial, w.body);
        const px = !portraitJob && gen === portraitGen ? await takeStudio(w.words, cells) : null;
        const got = px && await encodeImages(px, [thumbOut, { type: 'image/jpeg', quality: 0.85 }], true);
        // (and the body it shows, for its card to carry)
        if (got) p = { bmp: got.bitmap, thumb: await bytes(got.files[0]), full: await bytes(got.files[1]), body: bodyOf(cells) };
      }
    } catch { p = null; }
    portraitBusy = false;
    if (gen === portraitGen && portraitQ.get(key) === w) {
      portraitQ.delete(key);
      if (p) {
        setThumb(key, p.thumb);
        fulls.delete(key); fulls.set(key, p);
        if (fulls.size > FULL_KEEP) fulls.delete(fulls.keys().next().value);
        for (const r of w.wait) r(p.bmp);
      } else if (++w.tries < 3 && !w.stored) portraitQ.set(key, w);
      else if (w.stored) { w.stored = null; portraitQ.set(key, w); } // (a kept one that cannot be read: one taken)
      else for (const r of w.wait) r(null);
    }
    setTimeout(pumpPortraits, 30);
  }
  // a new world reuses serials: its species' portraits go
  function dropPortraits() {
    portraitGen++;
    dropThumb('s', true);
    for (const [key, w] of portraitQ) if (key[0] === 's') { portraitQ.delete(key); for (const r of w.wait) r(null); }
    for (const key of fulls.keys()) if (key[0] === 's') fulls.delete(key);
  }
  // how a cabinet card's species does here
  const cardStatus = (c) => { const sp = c.world === worldId() && life.reg.get(c.serial); return c.world !== worldId() ? ['from', c.home] : sp?.alive ? ['live', sp.pop] : ['gone']; };

  // Save: the card drawn, kept, and seen to go: it presents itself at the center for a beat, then shrinks to the
  // Field Lab's edge, where the Lab's button (or its Cabinet tab) flashes. It keeps its species' portrait with it.
  async function saveCard(serial, quiet = false) {
    const sp = life.reg.get(serial);
    if (!sp || savedCard(serial)) return;
    if (!quiet) flash(tr('flash.card-drawing', 'Drawing its card…'));
    const cv = await cards.render(serial), p = fulls.get(`s${serial}`);
    // (a frame between drawing it and reading it, so the two are not one long task)
    await new Promise(requestAnimationFrame);
    const blob = cv && await cardPng(cv, serial);
    if (!blob || !life.reg.has(serial)) { flash(tr('flash.card-failed', 'Could not draw its card')); return; }
    const c = carry(serial);
    await keepCard({ id: newKey('c'), serial, name: sp.name, words: c.words, home: c.home, body: c.body, world: worldId(),
      savedAt: Date.now(), touched: c.touched, png: new Uint8Array(await blob.arrayBuffer()), thumb: p?.thumb ?? null, portrait: p?.full ?? null }, quiet);
    if (quiet) return;
    // i18n: {name} is a species' name
    flyCard(cv); flash(tr('flash.card-kept', '{name} is in the cabinet', { name: sp.name }));
    cards.refresh();
    dirty = true;
  }
  // (drawn small on a canvas of its own, in memory as the card is: no image of the whole card to decode as it first
  // shows, and no first raster on the GPU, which held the world's frames)
  function flyCard(cv) {
    const img = document.createElement('canvas');
    img.width = CARD_W; img.height = CARD_H;
    img.getContext('2d', { willReadFrequently: true }).drawImage(cv, 0, 0, CARD_W, CARD_H);
    img.className = 'card-fly';
    document.body.append(img);
    const to = lab.isOpen() && !phone() ? $('lab').getBoundingClientRect() : $('lab-open').getBoundingClientRect();
    const tx = phone() ? to.left + to.width / 2 : to.right - 30, ty = phone() ? to.top : Math.min(innerHeight - 120, to.top + 140);
    img.animate([
      { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.25 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.6 },
      { transform: `translate(calc(-50% + ${tx - innerWidth / 2}px), calc(-50% + ${ty - innerHeight / 2}px)) scale(0.08)`, opacity: 0.4 },
    ], { duration: 1500, easing: 'cubic-bezier(.4,0,.2,1)' }).finished.then(() => {
      img.remove();
      const target = lab.isOpen() ? document.querySelector('#lab-tabs [data-tab="cabinet"]') : $('lab-open');
      target?.animate([{ boxShadow: 'inset 0 -2px 0 #f1e3a0', color: '#f1e3a0' }, { boxShadow: 'none' }], { duration: 900 });
    });
  }
  // a card in the cabinet shown: the Lab opened to it, the card flashing
  function showInCabinet(card) {
    lab.open('cabinet');
    requestAnimationFrame(() => {
      const el = document.querySelector(`#lab .minicard[data-key="${CSS.escape(card.id)}"]`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      el?.animate([{ boxShadow: '0 0 0 2px #f1e3a0, 0 0 24px rgba(241,227,160,.5)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 1100, easing: 'ease-out' }); // i18n-ignore (CSS)
    });
  }
  // a card into the pipette: a colony of it, as a founding colony is, made when it is set down; or (at: where on the
  // page it was dropped on the world, from the cabinet) set down there at once, a run of its own
  function loadCard(x, at = null) {
    const card = typeof x === 'object' ? x : savedCard(x);
    const sp = typeof x === 'object' ? null : life.reg.get(x);
    if (!card && !sp) return; // (an open card's species gone from the records, with no card in the cabinet)
    const words = card ? card.words : carry(x).words, name = card ? card.name : sp.name;
    const ours = card ? card.world === worldId() && life.reg.has(card.serial) : true;
    const serial = card ? card.serial : x, n = clamp(Math.round((K.foundLife * eng.count) / K.foundColonies), 12, 96);
    const live = ours && life.reg.get(serial);
    const run = pipette.load({ card: card?.id, serial, words, name, home: ours ? undefined : card.home, slot: live?.alive ? live.slot : null, stranger: !ours }, n, !!at);
    // i18n: {n} the most cells the pipette holds
    if (!run) { flash(tr('flash.pipette-full', 'The pipette is full · {n, plural, other {# cells}} · set some down', { n: PIPE_LIMIT })); return; }
    // i18n: {name} is a species' name
    if (at) { startSpit(...at, run); flash(tr('flash.colony-set-down', 'A colony of {name} set down', { name })); } else flash(tr('flash.colony-loaded', 'A colony of {name} in the pipette · Dispense sets it down', { name }));
    bench.render();
  }
  // a card arriving from elsewhere: a link's #c=, or a card's PNG dropped on the page
  async function receiveCard(bytes, png = null) {
    let c;
    try { c = decodeCard(bytes); } catch (e) { flash(e.message); return; }
    const dup = cabinet.cards.find((x) => x.words.every((w, i) => w === c.words[i]));
    if (dup) { flash(tr('flash.card-dup', '{name} is already in the cabinet', { name: dup.name })); showInCabinet(dup); return; }
    // its mini-card's portrait cut from its card's; a card that came by its link alone is drawn here, from its
    // genome, without one (its species drawn alone stands in)
    const thumb = png && await pngThumb(png).catch(() => null);
    png ??= await strangerPng(bytes).catch(() => null);
    await keepCard({ id: newKey('c'), serial: 0, name: c.name, words: c.words, home: c.home, body: c.body, world: null,
      savedAt: Date.now(), touched: c.touched, png, thumb });
    lab.open('cabinet');
    // i18n: a card from elsewhere kept: {name} its species, {home} the world it came from
    flash(tr('flash.card-received', '{name}, from {home}, is in the cabinet', { name: c.name, home: eraName(c.home) }));
  }
  const hashCard = cardFromHash(location.hash);
  if (hashCard) { history.replaceState(null, '', location.pathname + location.search); setTimeout(() => receiveCard(hashCard, linkedPng), 0); }
  addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.type === 'image/png')) e.preventDefault(); });
  addEventListener('drop', async (e) => {
    const f = [...(e.dataTransfer?.files || [])].find((x) => x.type === 'image/png');
    if (!f) return;
    e.preventDefault();
    const png = new Uint8Array(await f.arrayBuffer()), bytes = cardFromPng(png);
    if (!bytes) { flash(tr('flash.card-not-card', 'That image is not a Tidemote species card')); return; }
    receiveCard(bytes, png);
  });

  const cards = createCards({
    life: () => life, K, chron, eng, flash,
    portrait: speciesPortrait, portrayed: (serial) => fulls.has(`s${serial}`), rename: renameSpecies,
    songClip: (g) => songClip(g, { seed: climate.music, era: climate.name }),
    carry, saved: savedCard, world: worldId, png: cardPng,
    save: saveCard,
    load: loadCard,
    remove: removeCard,
    // this world's species the card is of: its own here, or (carried from elsewhere) the one set down from it
    inspectable: (x) => (typeof x === 'object' ? cardSerial(x) : life.reg.has(x) ? x : null),
    inspect: openSpecies,
    play: (g, tag, serial) => {
      if (serial != null) { playSong(serial); return; }
      const was = sound.on;
      sound.audition(g, tag).then(() => { if (!was && sound.on) flash(tr('flash.sound-on', 'Sound on')); });
    },
  });
  // a cabinet card: of this world's species, its live card (to rename it); another world's, as it was drawn
  function openCard(c) {
    if (c.world === worldId() && life.reg.has(c.serial)) cards.open(c.serial);
    else cards.openSaved({ ...c, genome: genomeOfWords(c.words) });
  }
  // a card out of the cabinet: the last taken out can be put back for a while (the cabinet's Undo)
  async function removeCard(card) {
    await cabinet.store.remove(card.id);
    cabinet.cards = cabinet.cards.filter((c) => c.id !== card.id);
    cabinet.removed = { card, at: performance.now() };
    lab.render(true); bench.render(); cards.refresh();
    flash(tr('flash.card-removed', '{name} is out of the cabinet', { name: card.name }));
  }
  async function undoRemove() {
    const r = cabinet.removed;
    if (!r) return;
    cabinet.removed = null;
    await keepCard(r.card);
    bench.render(); cards.refresh();
    flash(tr('flash.card-restored', '{name} is back in the cabinet', { name: r.card.name }));
  }
  function cardSerial(c) {
    if (c.world === worldId()) return life.reg.has(c.serial) ? c.serial : null;
    const gid = c.words.join();
    for (const sp of life.reg.values()) if (sp.carried && (genomeWords(sp.genome).join() === gid || (sp.home === c.home && sp.name === c.name))) return sp.serial;
    return null;
  }

  function renderSpecimen(force) {
    if ((!sel && spView == null) || (sel && sel.film)) return;
    dirty = !specimen.render(force);
    tips.check();
  }

  function openSpecies(serial) {
    const sp = life.reg.get(serial);
    if (!sp) { flash(tr('flash.species-gone', 'That species is no longer on record')); return; }
    if (ride.on) toggleRide(false, false);
    sel = null;
    eng.trackId = NONE;
    state.follow = false;
    setMembers(null);
    spView = serial;
    specimen.open();
    if (sp.alive) focusSpecies(sp);
    renderSpecimen(true);
  }

  // A species' subject in the water, from one readback of its cells (up to maxOut): the cell at the middle of its
  // largest body (nearest the body's mean), else the one at the heart of its densest crowd. { best (that cell),
  // simTime, mid (its index), cx, cy (the body's mean), span (how far the body reaches from mid), body, edges (its bonds,
  // trace.js), u32, f32, n, dist(i, j) (world units, wrapped) }, null if none was found.
  async function bestMember(sp, maxOut = sp.pop * 1.25 + 2048) {
    const [W, H] = eng.grid;
    const res = await eng.requestPick([W / 2, H / 2], Math.hypot(W, H), NONE, { kind: sp.slot, maxOut, raw: true });
    if (!res || !res.raw.count) return null;
    const { u32, f32, count: n } = res.raw, x = (k) => f32[k * PICK_WORDS], y = (k) => f32[k * PICK_WORDS + 1];
    const dist = (i, j) => Math.hypot(wrapD(x(j) - x(i), W), wrapD(y(j) - y(i), H));
    const lb = largestBody(u32, f32, n), body = lb && lb.body.length > 1 ? lb.body : null;
    let mid, cx, cy;
    if (body) {
      // (its mean, about its first cell across the wrap)
      const o = body[0];
      let mx = 0, my = 0;
      for (const k of body) { mx += wrapD(x(k) - x(o), W); my += wrapD(y(k) - y(o), H); }
      cx = x(o) + mx / body.length; cy = y(o) + my / body.length;
      const off = (k) => Math.hypot(wrapD(x(k) - cx, W), wrapD(y(k) - cy, H));
      mid = body.reduce((m, k) => (off(k) < off(m) ? k : m), o);
    } else {
      const step = Math.max(1, Math.floor(n / 200));
      let bestN = -1;
      for (let i = 0; i < n; i += step) {
        let c = 0;
        for (let j = 0; j < n; j += step) if (dist(i, j) < 2) c++;
        if (c > bestN) { bestN = c; mid = i; }
      }
      cx = x(mid); cy = y(mid);
    }
    const span = body ? body.reduce((m, k) => Math.max(m, dist(mid, k)), 0) : 0;
    return { best: parseParticle(u32, f32, mid * PICK_WORDS), simTime: res.simTime, mid, cx, cy, span, body, edges: lb?.edges, u32, f32, n, dist };
  }
  // Jump to a living member: for a bonded species, a cell of its largest body; otherwise one in its densest patch.
  async function findMember(serial) {
    const sp = life.reg.get(serial);
    if (!sp || !sp.alive) return;
    const m = await bestMember(sp);
    if (!m) { flash(tr('flash.no-living', 'No living cells found')); return; }
    takeOver();
    if (cssPPU() < 18) { cam.zoomTarget = clamp((18 * dpr) / fitPPU(), 1, maxZoom()); cam.anchor = null; }
    beginTracking(m.best, { entries: [], simTime: m.simTime });
    // (kept in view: a ride, untouched until the viewer steers)
    toggleRide(true, false);
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
    if (!sel || !specimen.isOpen() || !state.ui || spView != null || !state.closeup) return null;
    const r = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(spec.clientWidth * r), h = Math.round(spec.clientHeight * r);
    if (!w || !h) return null;
    if (spec.width !== w || spec.height !== h) { spec.width = w; spec.height = h; }
    const [px, py] = sel.disp;
    return { target: specCtx.getCurrentTexture().createView(), w, h, cx: px, cy: py, ppu: h / state.specCells, dpr: r, live: true };
  }
  spec.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.specCells = clamp(state.specCells * Math.exp(e.deltaY * 0.0015), 0.8, 14);
  }, { passive: false });

  // ------------------------------------------------------------ hints
  const tips = pageTips();

  // ------------------------------------------------------------ lab
  lab = createLab({
    eng, state, held: uiHeld,
    // a phone starts with it folded away: there it covers the world
    startOpen: state.labOpen && !phone(),
    // keep: folded for the auto camera, not by the reader, so the preference stands
    onFold: (on, keep) => { if (!phone() && !keep) { state.labOpen = on; persist(); } drawWorldChart(); },
    onCensusShown: drawWorldChart,
    life: () => life, facets: facetsOf, groups, climate: () => climate,
    openSpecies, focusFacet,
    focusKey: () => focus.key,
    focusPredicate: (label, pred) => setFocus(`pred:${label}`, label, { pred }),
    relabel,
    cabinet: {
      cards: () => cabinet.cards, world: worldId,
      facets: (c) => { let f = cardFacets.get(c); if (!f) cardFacets.set(c, (f = facets(genomeOfWords(c.words), K))); return f; },
      mini: (c) => miniCard(genomeOfWords(c.words), K, { gid: c.words.join(), key: c.id, name: c.name, status: cardStatus(c), thumb: cabThumb(c) }),
      status: cardStatus,
      open: openCard,
      load: loadCard,
      // dropped on the world: set down there
      place: (c, x, y) => loadCard(c, [x, y]),
      remove: removeCard, undo: undoRemove,
      // the card last taken out, while it can still be put back
      removed: () => (cabinet.removed && performance.now() - cabinet.removed.at < UNDO_MS ? cabinet.removed.card : null),
    },
  });
  $('lab-open').addEventListener('click', () => { closeMenus(); lab.toggle(); });

  // ------------------------------------------------------------ settings
  // Display: what is drawn. Performance: what it costs (resolution, frame rate, particles, effects),
  // with a live readout so the effect of each choice can be seen. Worlds: saving this world and
  // loading one saved. About: what this is and who made it (the rail's wordmark opens it).
  view = (() => {
    const el = $('settings'), opts = $('opts'), btn = $('set-open'), tabs = [...el.querySelectorAll('#set-tabs [data-tab]')];
    let tab = 'display';
    let pendingN = null;
    // one row per option: its name and key on the left, the choices on the right. With Auto chosen
    // (and autoNow(id) known), the Auto chip shows what it is using now and the choice nearest it is
    // marked; readout() keeps both current in place.
    const choice = (id, title, key, items, cur, tip) => {
      const now = String(cur) === 'auto' ? autoNow(id) : null;
      const label = (v, l) => (v === 'auto' && now ? `${l} <span class="auto-now" data-auto="${id}">${now.text}</span>` : l);
      return `<div class="opt"><span class="lbl">${tip ? term(tip, title) : title}${key ? ` <kbd>${key}</kbd>` : ''}</span><div class="row segs${items.length > 7 ? ' many' : ''}" role="group" aria-label="${title}">${items.map(([v, l, dis]) => `<button type="button" class="chip${now && String(v) === now.pick ? ' auto-pick' : ''}" data-o="${id}" data-v="${v}" aria-pressed="${String(v) === String(cur)}"${dis ? ' disabled' : ''}>${label(v, l)}</button>`).join('')}</div></div>`;
    };
    // what an Auto option is using now ({ text, pick: the data-v of the choice it matches, if any }):
    // the render scale, the pixel density, the frame rate aimed for, and a measured world's particle count
    function autoNow(id) {
      if (id === 'fps') { const f = Math.round(1000 / frameTarget()); return { text: String(f), pick: String([30, 60].find((v) => Math.abs(v - f) <= 3) ?? '') }; }
      if (id === 'scale') return { text: pctOf(Math.round(renderScale * 100)), pick: String(+renderScale.toFixed(2)) };
      if (id === 'density') { const d = +density().toFixed(2); return { text: timesOf(d), pick: String(d) }; }
      if (id.startsWith('tune-')) { const k = id.slice(5), l = tune[k].level; return { text: TUNE_NAMES[k][l], pick: String(l) }; }
      if (id === 'n' && !state.perf.particles) return { text: kfmt(eng.count), pick: String(eng.count) };
      if (id === 'scan') return { text: String(eng.maxScan), pick: String(eng.maxScan) };
      return null;
    }
    const autoLive = () => {
      for (const sp of opts.querySelectorAll('[data-auto]')) {
        const now = autoNow(sp.dataset.auto);
        if (!now) continue;
        setLive(sp, now.text);
        for (const b of sp.closest('.segs').children) b.classList.toggle('auto-pick', b.dataset.v === now.pick);
      }
    };
    const onoff = (id, title, key, on, tip) => choice(id, title, key, [[1, tr('settings.on', 'On')], [0, tr('settings.off', 'Off')]], on ? 1 : 0, tip);
    // i18n: a choice in Settings: {n} percent (a render scale), or {n} times (device pixels per CSS pixel)
    const pctOf = (n) => tr('settings.pct', '{n}%', { n }), timesOf = (n) => tr('settings.times', '{n}×', { n });
    // i18n: Settings' choices, shared by its options
    const OFF = tr('settings.off', 'Off'), NORMAL = tr('settings.normal', 'Normal'), AUTO = tr('settings.auto', 'Auto');
    const SUBTLE = tr('settings.subtle', 'Subtle'), STRONG = tr('settings.strong', 'Strong');
    // a group of option rows, under a heading or (text '') none
    const group = (id, text, rows) => section(id, text, block('', rows));
    let confirming = false; // the reset button asked to confirm
    // Display: the picture (how the world is drawn and lit), what is drawn over it, and the view around it
    function display() {
      const s = eng.settings;
      const filmL = tr('settings.display.film', 'Film');
      return group('picture', tr('settings.display.picture', 'Picture'), choice('microlook', tr('settings.display.microscope', 'Microscope'), '', [[0, OFF], [1, SUBTLE], [2, NORMAL], [3, STRONG]], state.look, 'microlook')
        + (state.look ? choice('grain', tr('settings.display.grain', 'Film grain'), '', [[0, OFF], [1, tr('settings.display.grain-fine', 'Fine')], [2, tr('settings.display.grain-heavy', 'Heavy')]], state.grain, 'filmgrain') : '')
        + onoff('optics', tr('settings.display.optics', 'Optics'), 'O', s.optics > 0, 'optics')
        + onoff('bloom', tr('settings.display.bloom', 'Bloom'), 'Y', s.bloom > 0, 'bloom')
        + choice('water', tr('settings.display.water', 'Water surface'), '', [[0, OFF], [1, SUBTLE], [2, NORMAL], [3, STRONG]], state.water, 'watersurface')
        + (state.water ? choice('waves', tr('settings.display.waves', 'Wave motion'), '', [[0, tr('settings.display.waves-slow', 'Slow')], [1, NORMAL], [2, tr('settings.display.waves-lively', 'Lively')]], state.waves, 'wavemotion') : '')
        + choice('trails', tr('settings.display.trails', 'Trails'), 'T', trailNames.map((n, i) => [i, n]), trailIdx)
        + onoff('specks', tr('settings.display.specks', 'Suspension'), '', s.specks, 'specks')
        + onoff('lod', tr('settings.display.lod', 'Zoom detail'), '', s.lod, 'lod'))
        + group('overlays', tr('settings.display.overlays', 'Overlays'), onoff('tide', tr('settings.display.light-map', 'Light map'), 'G', s.tide > 0, 'light')
        + (s.tide ? rampHtml(MAPS[0]) : '')
        + (K.heat ? choice('heat', tr('settings.display.heat-map', 'Heat map'), 'E', [[0, OFF], [1, tr('settings.display.heat-shimmer', 'Shimmer')], [2, tr('settings.display.heat-full', 'Full')]], s.heat, 'heatmap') : '')
        + (K.heat && s.heat === 2 ? rampHtml(MAPS[1]) : '')
        + onoff('bands', tr('settings.display.tide-map', 'Tide map'), 'H', s.bands > 0, 'tidemap')
        + (s.bands ? rampHtml(MAPS[2]) : '')
        + onoff('currents', tr('settings.display.currents', 'Currents'), 'C', state.currents)
        + onoff('links', tr('settings.display.bonds', 'Bonds'), 'L', s.links, 'bond')
        + onoff('nodes', tr('settings.display.particles', 'Particles'), 'N', s.nodes)
        + choice('songmarks', tr('settings.display.song-marks', 'Song marks'), '', [[0, OFF], [1, tr('settings.display.song-marks-picked', 'Picked')], [2, tr('settings.display.song-marks-all', 'All')]], state.songMarks, 'songmarks')
        // i18n: Settings → Display → Annotations: live notes over the view shown with the auto camera only, always, or never
        + choice('notes', tr('settings.display.annotations', 'Annotations'), '', [[1, tr('settings.display.annotations-auto', 'Auto camera')], [2, tr('settings.display.annotations-always', 'Always')], [0, OFF]], state.notes, 'annotations'))
        + group('view', tr('settings.display.view', 'View'), (isCoarse ? '' : onoff('ui', tr('settings.display.interface', 'Interface'), 'U', state.ui, 'interface'))
        + onoff('closeup', tr('settings.display.closeup', 'Live close-up'), '', state.closeup, 'closeup')
        + onoff('auto', tr('settings.display.auto-idle', 'Auto when idle'), '', state.auto, 'autoidle')
        + (film.supported ? `<div class="opt"><span class="lbl">${term('film', filmL)} <kbd>R</kbd></span><div class="row segs" role="group" aria-label="${filmL}">${film.state === 'idle' ? `<button type="button" class="chip" data-o="film" data-v="now">${tr('settings.display.film-now', 'Now')}</button><button type="button" class="chip" data-o="film" data-v="scene">${tr('settings.display.film-scene', 'Next scene')}</button>` : `<button type="button" class="chip" data-o="film" data-v="stop">${tr('settings.display.film-stop', 'Stop filming')}</button>`}</div></div>` : ''));
    }
    // Audio: the soundtrack on or off and its volume (the dock's slider is only on wide screens), what it does while
    // the page is hidden, its layers' levels and its space and tone (src/audio/mix.js), each by what it sounds like
    function audio_() {
      const m = sound.mix, mix = (k) => choice(`mix-${k}`, SOUND_MIX[k].name, '', SOUND_MIX[k].choices.map(([label], i) => [i, label]), m[k], `audio${k}`);
      const vol = Math.round(sound.volume * 100);
      return group('sound', tr('settings.audio.playback', 'Playback'), onoff('sound', tr('settings.audio.soundtrack', 'Soundtrack'), 'M', sound.on)
        + `<div class="opt"><span class="lbl">${tr('settings.audio.volume', 'Volume <kbd>− =</kbd>')}</span><div class="vol-row"><input type="range" id="set-vol" min="0" max="100" step="1" value="${vol}" aria-label="${tr('settings.audio.volume.aria', 'Volume')}"><b id="set-vol-v">${tr('settings.audio.volume-pct', '{pct}%', { pct: vol })}</b></div></div>`
        + mix('background'))
        + group('mix', tr('settings.audio.mix', 'Mix'), ['music', 'cells', 'water', 'tools'].map(mix).join(''))
        + group('character', tr('settings.audio.character', 'Character'), mix('space') + mix('tone'));
    }
    // the neighbor budgets offered: Auto's (the tuner's levels), 1½ and 2 times the default, and one chosen before
    const scanChoices = () => [...new Set([...KNOBS.neighbors.levels, ...[1.5, 2].map((f) => Math.round((K.maxScan * f) / 8) * 8), state.perf.scan ?? K.maxScan])].sort((a, b) => a - b);
    function performance_() {
      const P = state.perf;
      const dev = Math.min(devicePixelRatio || 1, 2);
      const sizes = PARTICLE_SIZES.filter((n) => n <= maxParticles());
      const nowN = pendingN ?? (P.particles || 'auto');
      return group('res', tr('settings.perf.resolution', 'Resolution'), choice('scale', tr('settings.perf.scale', 'Render scale'), '', [['auto', AUTO], [1, pctOf(100)], [0.75, pctOf(75)], [0.5, pctOf(50)], [0.25, pctOf(25)]], P.scale, 'renderscale')
        + (P.scale === 'auto' ? choice('floor', tr('settings.perf.floor', 'Auto lowest'), '', [[0.75, pctOf(75)], [0.5, pctOf(50)], [0.35, pctOf(35)], [0.25, pctOf(25)]], P.floor, 'autofloor') : '')
        + choice('density', tr('settings.perf.density', 'Pixel density'), '', [['auto', AUTO], [1, timesOf(1)], [1.5, timesOf(1.5), dev < 1.5], [2, timesOf(2), dev < 2]], P.density, 'density')
        + choice('fps', tr('settings.perf.fps', 'Target fps'), '', [['auto', AUTO], [30, '30'], [60, '60'], [0, tr('settings.perf.fps-display', 'Display')]], P.fps, 'targetfps'))
        + group('detail', tr('settings.perf.detail', 'Detail'), Object.keys(TUNE_TITLES).map((k) => choice(`tune-${k}`, TUNE_TITLES[k], '', [['auto', AUTO], ...TUNE_NAMES[k].map((n, i) => [i, n]).reverse()], P.tune[k], `tune${k}`)).join(''))
        + group('world', tr('settings.perf.world', 'World'), choice('n', tr('settings.perf.particles', 'Particles'), '', [['auto', AUTO], ...sizes.map((n) => [n, kfmt(n)])], nowN, 'particles')
        + choice('scan', tr('settings.perf.neighbors', 'Neighbors'), '', [['auto', AUTO], ...scanChoices().map((n) => [n, String(n)])], P.scan ?? 'auto', 'neighbors')
        + (pendingN != null && String(pendingN) !== String(P.particles || 'auto')
          // i18n: a new world with {n} particles, or as many as the GPU is measured to draw smoothly
          ? `<div class="opt"><span></span><button type="button" class="btn hot-btn" data-o="apply" data-v="0">${pendingN === 'auto' ? tr('settings.perf.apply-auto', 'Start a new world with a measured count') : tr('settings.perf.apply', 'Start a new world with {n, number}', { n: pendingN })}</button></div>` : '')
        + (hasTS ? `<div class="opt"><span class="lbl">${term('profile', tr('settings.perf.profile', 'Profile'))}</span><div class="row segs"><button type="button" class="chip" data-o="profile" data-v="1">${tr('settings.perf.copy-profile', 'Copy profile')}</button></div></div>` : ''));
    }
    // the pool's events: on or off, each kind on or off, and one started now
    function climate_() {
      const E = state.events;
      const kinds = E.on ? EVENT_TYPES.map((x) => onoff(`ev-${x}`, EVENT_NAME[x], '', E[x], `ev${x}`)).join('') : '';
      const now = !K.pond ? '' : state.phase === 'running' && !climate.event && E.on && EVENT_TYPES.some((x) => E[x])
        ? ((on) => `<div class="opt"><span class="lbl">${term('evstart', tr('settings.climate.start-now', 'Start one now'))}</span><div class="row segs${on.length > 3 ? ' many" style="--cols: 2' : ''}">${on.map((x) => `<button type="button" class="chip" data-o="ev-start" data-v="${x}">${EVENT_NAME[x]}</button>`).join('')}</div></div>`)(EVENT_TYPES.filter((x) => E.on && E[x]))
        // i18n: the event under way ({name}, climate.event.drought...) and the stage it has reached
        : climate?.event ? `<div class="opt"><span class="lbl">${tr('settings.climate.under-way', 'Under way')}</span><span class="note">${tr('settings.climate.event-now', '{name}{phase, select, none {} drying { · drying} dry { · dry} rain { · rain} after { · after} cooling { · cooling} freezing { · freezing} frozen { · frozen} thaw { · thaw} other { · {phase}}}', { name: EVENT_NAME[climate.event.type], phase: climate.phase && climate.phase !== climate.event.type ? climate.phase : 'none' })}</span></div>` : '';
      return group('events', tr('settings.climate.events', 'Pool events'), onoff('ev-on', tr('settings.climate.events-on', 'Events'), '', E.on, 'poolevents') + kinds + now);
    }
    // the saves kept in this browser (null until read; in the desktop app, with the Workshop's worlds
    // subscribed to, m.from 'workshop'), the name being typed, a load, delete or share waiting to be
    // confirmed ({ kind, id }), and what is under way ('save', 'load', 'open', 'share')
    let saves = null, used = 0, wName = '', ask = null, wBusy = '', wPoll = 0;
    // i18n: a save's name unless the viewer gives one: the era's name and the world's age (a duration)
    const defaultName = () => tr('worlds.default-name', '{era} · {age}', { era: eraName(climate.name), age: fmtDur(eng.simTime) });
    const mb = (n) => tr('worlds.mb', '{n} MB', { n: (n / 1048576).toFixed(n < 10485760 ? 1 : 0) });
    const mini = (o, v, text, cls = '') => `<button type="button" class="btn mini${cls}" data-o="${o}" data-v="${esc(v)}"${wBusy ? ' disabled' : ''}>${text}</button>`;
    const ghost = (o, v, icon, label, hint) => `<button type="button" class="ghost" data-o="${o}" data-v="${esc(v)}" aria-label="${label}" data-hint="${hint}"${wBusy ? ' disabled' : ''}><svg><use href="#i-${icon}"/></svg></button>`;
    function saveRow(m) {
      const sw = [0, 1, 2, 3].map((i) => `<i${m.cols?.[i] != null ? ` style="background:${cssCol(m.cols[i])}"` : ''}></i>`).join('');
      const a = ask && ask.id === m.id ? ask.kind : null, ws = m.from === 'workshop';
      // a save of another major version lists, but does not open (worlds.js SAVE_VERSION)
      const can = m.downloading != null ? 'ok' : openable(m.version);
      // i18n: a saved world's line under its name (Settings → Worlds): a question while an act waits to be confirmed,
      // why it cannot open, or {age} its world time, {count} its particles (64k), {species} its species thriving, {when} when saved
      const line = a === 'load' ? `<em>${tr('worlds.ask-load', 'Discard this world?')}</em>`
        : can !== 'ok' ? tr('worlds.cannot-open', '<em>{why, select, newer {Needs a newer Tidemote} other {From an older Tidemote}}</em> · {when}', { why: can, when: when(m.savedAt) }) : a === 'del' ? `<em>${ws ? tr('worlds.ask-unsubscribe', 'Unsubscribe from it?') : tr('worlds.ask-delete', 'Delete this save?')}</em>`
        : a === 'share' ? `<em>${m.workshop ? tr('worlds.ask-update', 'Update it on the Steam Workshop?') : tr('worlds.ask-share', 'Share it on the Steam Workshop for anyone to see?')}</em>`
        : m.downloading != null ? tr('worlds.downloading', 'Downloading · {pct}%', { pct: Math.round(m.downloading * 100) })
        : tr('worlds.row', '{age} · {count} · {species, plural, other {{species} species}} · {when}', { age: fmtDur(m.simTime), count: kfmt(m.count), species: +m.thriving || 0, when: when(m.savedAt) });
      const CANCEL = tr('worlds.cancel', 'Cancel'), LOAD = tr('worlds.load', 'Load'), UNSUB = tr('worlds.unsubscribe', 'Unsubscribe'), DEL = tr('worlds.delete', 'Delete');
      const acts = a === 'load' ? mini('w-no', m.id, CANCEL) + mini('w-first', m.id, tr('worlds.save-first', 'Save first')) + mini('w-yes', m.id, wBusy === 'load' ? tr('worlds.loading', 'Loading') : LOAD, ' hot-btn')
        : a === 'del' ? mini('w-no', m.id, CANCEL) + mini('w-yes', m.id, ws ? UNSUB : DEL, ' hot-btn')
        : a === 'share' ? mini('w-no', m.id, CANCEL) + mini('w-yes', m.id, wBusy === 'share' ? tr('worlds.sharing', 'Sharing') : m.workshop ? tr('worlds.update', 'Update') : tr('worlds.share', 'Share'), ' hot-btn')
        : ws ? (m.downloading != null || can !== 'ok' ? '' : mini('w-load', m.id, LOAD)) + ghost('w-page', m.id, 'share', tr('worlds.on-steam', 'On Steam'), tr('worlds.on-steam.hint', 'Its page on the Steam Workshop'))
          + ghost('w-del', m.id, 'close', UNSUB, UNSUB)
        : (can !== 'ok' ? '' : mini('w-load', m.id, LOAD) + (steamOn.on ? ghost('w-share', m.id, 'share', tr('worlds.share', 'Share'), m.workshop ? tr('worlds.share.hint-update', 'Update it on the Steam Workshop') : tr('worlds.share.hint', 'Share on the Steam Workshop')) : ''))
          + ghost('w-dl', m.id, 'down', tr('worlds.download', 'Download'), desk ? tr('worlds.download.hint-desktop', 'Save a copy as a file') : tr('worlds.download.hint', 'Download a file to open on another device'))
          + ghost('w-del', m.id, 'close', DEL, DEL);
      return `<div class="w-row"><span class="w-sw" aria-hidden="true">${sw}</span><div class="w-txt"><b>${esc(m.name)}</b><span>${line}</span></div><div class="w-act">${acts}</div></div>`;
    }
    function worlds_() {
      const off = wBusy || state.phase !== 'running' ? ' disabled' : '';
      const save = `<div class="w-save"><input type="text" id="w-name" maxlength="60" autocomplete="off" spellcheck="false" placeholder="${esc(defaultName())}" value="${esc(wName)}" aria-label="${tr('worlds.name.aria', 'Name this save')}"${off}>`
        + `<button type="button" class="btn hot-btn" data-o="w-save" data-v="0"${off}>${wBusy === 'save' ? tr('worlds.saving', 'Saving') : tr('worlds.save', 'Save')}</button></div>`;
      const own = saves && saves.filter((m) => m.from !== 'workshop'), ws = saves && saves.filter((m) => m.from === 'workshop');
      const list = saves == null ? `<p class="note">${tr('worlds.reading', 'Reading the saved worlds…')}</p>`
        : own.length ? own.map(saveRow).join('')
        : `<p class="note">${tr('worlds.none', 'No saved worlds yet. A save keeps everything: every particle, each species and its name, the chronicle and the history.')}</p>`;
      const browse = `<div class="w-more"><button type="button" class="link" data-o="w-browse" data-v="0">${tr('worlds.browse', 'Browse the Workshop')}</button></div>`;
      const wsList = !steamOn.on || saves == null ? '' : section('w-ws', tr('worlds.workshop', 'From the Workshop'), block('', (ws.length ? ws.map(saveRow).join('')
        : `<p class="note">${tr('worlds.workshop-none', 'Worlds others have shared. Subscribe to one on the Steam Workshop and it appears here, ready to load.')}</p>`) + browse));
      // i18n: beside "Saved worlds": {n} how many, {size} the space they take (worlds.mb)
      return group('w-save', tr('worlds.save-heading', 'Save this world'), save) + section('w-list', tr('worlds.saved-heading', 'Saved worlds'), block('', list, { aside: own && own.length ? tr('worlds.used', '{n} · {size}', { n: own.length, size: mb(used) }) : '', tip: 'saves' })) + wsList;
    }
    async function refreshSaves() {
      try { saves = await worldStore.list(); } catch { saves = []; }
      used = saves.reduce((a, m) => a + (m.from !== 'workshop' && m.bytes || 0), 0);
      render();
      // the Workshop's downloads, followed while the tab is open
      clearTimeout(wPoll);
      if (saves.some((m) => m.downloading != null)) wPoll = setTimeout(() => { if (!el.hidden && tab === 'worlds') refreshSaves(); }, 2000);
    }
    // a shared world's words on the Workshop (the sharer may change them there)
    // i18n: a world shared on the Steam Workshop, its description there: {age} how long it has run (in words), {count}
    // its particles (64k), {species} its species thriving
    const wsDescription = (m) => tr('worlds.ws-description', 'A Tidemote world after {age}: {count} particles, {species, plural, other {{species} species}} thriving.', { age: durWords(m.simTime), count: kfmt(m.count), species: +m.thriving || 0 });
    // i18n: a saved world's file name when its name has no letters to keep
    const download = (m, bytes) => saveFile(new Blob([bytes], { type: 'application/gzip' }), `${m.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || tr('worlds.file-name', 'world')}.tidemote`);
    async function worldAct(id, v) {
      const busy = async (what, fn) => {
        wBusy = what; render();
        try { await fn(); } catch (e) { flash(String(e.message || e)); }
        wBusy = ''; render();
      };
      if (id === 'w-save') {
        if (wBusy || state.phase !== 'running') return;
        await busy('save', async () => {
          await saveWorld(wName.trim() || defaultName());
          wName = '';
          flash(tr('flash.world-saved', 'World saved'));
          await refreshSaves();
        });
      } else if (id === 'w-load' || id === 'w-del' || id === 'w-share') { ask = { kind: { 'w-load': 'load', 'w-del': 'del', 'w-share': 'share' }[id], id: v }; render(); }
      else if (id === 'w-no') { ask = null; render(); }
      else if (id === 'w-yes' && ask?.kind === 'share') {
        const m = saves.find((x) => x.id === v);
        ask = null;
        if (!m || wBusy) return;
        await busy('share', async () => {
          const r = await desk.workshop.share(v, { title: m.name, description: wsDescription(m) });
          unlock(['SHARED']);
          flash(r.agreement ? tr('flash.ws-agreement', 'Accept the Workshop agreement on Steam to make it public') : m.workshop ? tr('flash.ws-updated', 'Updated on the Workshop') : tr('flash.ws-shared', 'Shared on the Workshop'));
          desk.workshop.open(r.id);
          await refreshSaves();
        });
      } else if (id === 'w-page') { const m = saves.find((x) => x.id === v); if (m) desk.workshop.open(m.workshop); }
      else if (id === 'w-browse') desk?.workshop.browse();
      else if (id === 'w-yes' && ask?.kind === 'del') {
        ask = null;
        await worldStore.remove(v).catch((e) => flash(String(e.message || e)));
        await refreshSaves();
      } else if (id === 'w-yes' || id === 'w-first') {
        if (wBusy || state.phase !== 'running') return;
        let loaded = false;
        await busy('load', async () => {
          // checked before anything is discarded: a world that cannot open leaves this one running
          const w = await openWorld(await worldStore.get(v));
          if (id === 'w-first') await saveWorld(defaultName());
          ask = null;
          loaded = await loadWorld(w);
        });
        if (loaded) toggle(false); else refreshSaves();
      } else if (id === 'w-dl') {
        const m = saves.find((x) => x.id === v);
        if (m) download(m, await worldStore.get(v));
      } else if (id === 'w-open') $('w-file').click();
    }
    // a file downloaded from here (on any device): kept with the saves, then offered to load
    $('w-file').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      wBusy = 'open'; render();
      try {
        const bytes = await f.arrayBuffer();
        const { meta } = await openWorld(bytes);
        await worldStore.put({ ...meta, bytes: bytes.byteLength }, bytes);
        ask = { kind: 'load', id: meta.id };
      // i18n: {file} the file's name, {why} what went wrong
      } catch (err) { flash(tr('flash.open-failed', 'Could not open {file}: {why}', { file: f.name, why: String(err.message || err) })); }
      wBusy = '';
      await refreshSaves();
    });
    const ext = (href, text) => `<a class="sp" target="_blank" rel="noopener" href="${href}">${text}</a>`;
    function about_() {
      const link = (href) => (c) => ext(href, c.join(''));
      return group('intro', '', `<div class="about"><p>${tr('settings.about.p1', "A sealed biosphere of up to millions of particles, and all of them live, eat, breed, and die in your browser, simulated on the GPU with WebGPU. Some cells drink the moving light of the tide. Others graze on the photosynthesizers, and others hunt the grazers. Scavengers break down the dead and return them to the water as silt, and from that silt the next generation builds its children. Children mutate into new species. Species that bond grow into bodies: filaments, branched fronds, spirals, packed tissues. Some of these bodies grow beating tails and swim. Every 10 to 18 minutes the climate turns, and the world has to begin again in its own way. It makes its own music, too: each cell sings its species' song, over a chorus of the births, kills, and deaths in view.")}</p>
<p>${tr('settings.about.p2', "No hand steers any of this: every ecological rule is local. The complex interacting colonies emerge from simple rules acting on the mutating genome each cell carries. The Field Lab's <guide>Guide</guide> explains how it works.", { guide: (c) => `<button type="button" class="link" data-o="guide" data-v="0">${c.join('')}</button>` })}</p></div>`)
        // i18n: the credits: <a1> a link to the director's site, <a2> to Claude's page, <a3> to SuperCollider's
        + group('made', tr('settings.about.made-by', 'Made by'), `<div class="about"><p>${tr('settings.about.credits', "Directed by <a1>Tyler Hallada</a1> and implemented mostly by <a2>Claude</a2>, Anthropic's AI model. The soundtrack is procedurally generated using a port of <a3>SuperCollider</a3> to the browser.", { a1: link('https://www.hallada.net'), a2: link('https://www.anthropic.com/claude'), a3: link('https://supercollider.github.io/') })}</p></div>`)
        + group('src', tr('settings.about.source', 'Source'), `<div class="about"><p>${tr('settings.about.license', 'Free software under the <a1>GPL-3.0</a1>: the code, the design notes and the headless tools used to balance the ecology are on <a2>GitHub</a2>, where bugs and ideas are welcome as issues.', { a1: link('https://www.gnu.org/licenses/gpl-3.0.html'), a2: link('https://github.com/thallada/tidemote') })}</p>
<p>${tr('settings.about.privacy', 'Everything runs on this device: there is no account and no analytics, and saved worlds stay in this browser.')}</p></div>`);
    }
    // the keyboard note, and this tab's reset (which asks first)
    const keysNote = `<span class="keys-note">${tr('settings.keys-note', 'Keyboard: <kbd>?</kbd> lists every shortcut.')}</span>`;
    function foot() {
      if (tab === 'about') return `<div class="set-foot">${keysNote}</div>`;
      // i18n: where saved worlds are kept (Settings → Worlds, at the foot)
      const kept = !desk ? tr('settings.worlds.kept-browser', 'Kept in this browser.') : steamOn.cloud ? tr('settings.worlds.kept-cloud', 'Kept on this computer and in Steam Cloud.') : tr('settings.worlds.kept-computer', 'Kept on this computer.');
      if (tab === 'worlds') return `<div class="set-foot"><span class="keys-note">${kept}</span><button type="button" class="link set-reset" data-o="w-open" data-v="0"${wBusy ? ' disabled' : ''}>${tr('settings.worlds.open-file', 'Open a file')}</button></div>`;
      const reset = confirming
        // i18n: {tab} is the Settings tab whose options are reset
        ? `<span class="set-reset"><span>${tr('settings.reset-ask', 'Reset every {tab, select, display {display} audio {audio} performance {performance} climate {climate} other {{tab}}} setting?', { tab })}</span><button type="button" class="link" data-o="reset-no" data-v="0">${tr('settings.reset-cancel', 'Cancel')}</button><button type="button" class="btn hot-btn" data-o="reset-yes" data-v="0">${tr('settings.reset-yes', 'Reset')}</button></span>`
        : `<button type="button" class="link set-reset" data-o="reset" data-v="0">${tr('settings.reset', 'Reset to defaults')}</button>`;
      return `<div class="set-foot">${confirming ? '' : keysNote}${reset}</div>`;
    }
    // this tab's settings as a fresh page opens them (a particle count waits for its own new world)
    function resetTab() {
      const s = eng.settings, P = state.perf;
      if (tab === 'climate') {
        state.events = EVENTS_ON();
        applyEvents();
      } else if (tab === 'display') {
        trailIdx = 1; s.trails = trailLevels[trailIdx];
        for (const k of ['tide', 'heat', 'bands', 'links', 'nodes', 'bloom', 'optics', 'specks', 'lod']) s[k] = defaults[k];
        state.currents = false; state.songMarks = 1; state.notes = 1; state.closeup = true;
        state.water = 2; state.waves = 1; applyWater();
        state.look = 2; state.grain = 1; applyLook();
        state.auto = true; renderAuto(director.active);
      } else if (tab === 'audio') {
        // (the soundtrack stays on or off as it was)
        sound.setVolume(0.7);
        sound.setMix(defaultMix());
      } else {
        Object.assign(P, { scale: 'auto', floor: 0.5, density: 'auto', fps: 'auto', scan: null });
        for (const k of Object.keys(tune)) { if (k in P.tune) P.tune[k] = 'auto'; tune[k].level = KNOBS[k].levels.length - 1; tune[k].hold = 0; }
        applyTune();
        renderScale = Math.max(renderScale, P.floor); resetAdapt(); fit();
        pendingN = P.particles ? 'auto' : null;
      }
    }
    function render() {
      if (el.hidden) return;
      tabs.forEach((b) => { const on = b.dataset.tab === tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
      $('readout').hidden = tab !== 'performance';
      const typing = document.activeElement?.id === 'w-name';
      setHTML(opts, (tab === 'display' ? display() : tab === 'audio' ? audio_() : tab === 'performance' ? performance_() : tab === 'climate' ? climate_() : tab === 'about' ? about_() : worlds_()) + foot());
      if (typing && !$('w-name').disabled) { const i = $('w-name'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
      if (tab === 'worlds' && saves == null) refreshSaves();
      readout(true);
    }
    let roAt = 0;
    // i18n: the readout: why the page lowered its frame rate or resolution
    const WHY_WORDS = { 'GPU overloaded': tr('readout.why-overloaded', 'GPU overloaded'), 'under pressure': tr('readout.why-pressure', 'under pressure'), 'GPU busy': tr('readout.why-busy', 'GPU busy'), 'frames late': tr('readout.why-late', 'frames late'), 'browser pace': tr('readout.why-pace', 'browser pace') };
    function readout(force) {
      if (el.hidden || tab !== 'performance') return;
      const now = performance.now();
      if (!force && now - roAt < 500) return;
      roAt = now;
      setText('ro-fps', perf.fps ? perf.fps.toFixed(0) : '–');
      setText('ro-ms', perf.gpu ? perf.gpu.toFixed(1) : '–');
      setText('ro-res', pctOf(Math.round(renderScale * 100)));
      setText('ro-dens', timesOf(+density().toFixed(2)));
      autoLive();
      setText('ro-px', `${canvas.width}×${canvas.height}`);
      // (in millions past a million, to fit its cell: the status bar has every one)
      // i18n: the readout's particle count, in millions
      setText('ro-n', eng.count >= 1e6 ? tr('readout.millions', '{n}M', { n: (eng.count / 1e6).toFixed(2) }) : fmt(eng.count));
      const al = sound.load;
      setText('ro-audio', al != null ? pctOf(Math.round(al * 100)) : '–');
      // where the GPU time goes: a step, a drawn world, the time a step covers, and the speed reached
      const S = perf.simS || perf.stepMs;
      setText('ro-step', S ? S.toFixed(S < 1 ? 3 : 2) : '–');
      setText('ro-draw', perf.simS ? perf.renderR.toFixed(1) : '–');
      // (the step last taken: at real time a slow frame rate takes longer ones too, stepTicks)
      // i18n: the readout: the simulated time one step covers, {n} sixtieths of a second
      setText('ro-ceil', state.paused ? '–' : tr('readout.step', '{n}/60 s', { n: eng.ticks }));
      setText('ro-steps', state.phase === 'running' && !state.paused ? fmt(Math.round(perf.stepsS)) : '–');
      // i18n: the readout: the speed reached, {n} times real time
      setText('ro-rate', state.phase === 'running' && !state.paused ? tr('readout.rate', '×{n}', { n: perf.rate < 10 ? perf.rate.toFixed(1) : Math.round(perf.rate) }) : '–');
      // how often the world itself is redrawn: every frame, but at Max and held fast speeds only every
      // MAX_FRAME_MS (the camera and loupe keep the full rate)
      setText('ro-world', perf.fps ? perf.worldFps.toFixed(0) : '–');
      setText('ro-why', state.speed > 1 ? tr('readout.why-fast', 'running fast') : WHY_WORDS[perf.why] ?? (perf.why || '–'));
    }
    function set(id, v) {
      const s = eng.settings, P = state.perf;
      if (id.startsWith('w-')) { worldAct(id, v); return; }
      if (id === 'trails') { trailIdx = +v; s.trails = trailLevels[trailIdx]; }
      else if (id === 'tide') s.tide = +v;
      else if (id === 'heat') s.heat = +v;
      else if (id === 'bands') s.bands = +v;
      else if (id === 'currents') state.currents = !!+v;
      else if (id === 'links') s.links = !!+v;
      else if (id === 'nodes') s.nodes = !!+v;
      else if (id === 'bloom') s.bloom = +v ? 0.012 : 0;
      else if (id === 'optics') s.optics = +v ? 1 : 0;
      else if (id === 'specks') s.specks = !!+v;
      else if (id === 'lod') s.lod = !!+v;
      else if (id === 'closeup') state.closeup = !!+v;
      else if (id === 'songmarks') state.songMarks = +v;
      else if (id === 'notes') state.notes = +v;
      else if (id === 'water') { state.water = +v; applyWater(); }
      else if (id === 'waves') { state.waves = +v; applyWater(); }
      else if (id === 'microlook') { state.look = +v; applyLook(); }
      else if (id.startsWith('mix-')) sound.setMix({ [id.slice(4)]: +v });
      else if (id === 'grain') { state.grain = +v; applyLook(); }
      else if (id === 'ev-start') { if (!climate.event) climate.force(v); toggle(false); return; }
      else if (id === 'film') { toggle(false); filmAct(v === 'stop' ? undefined : v); return; }
      else if (id.startsWith('ev-')) { state.events[id.slice(3)] = !!+v; applyEvents(); }
      else if (id === 'ui') { setInterface(!!+v); return; }
      else if (id === 'auto') { state.auto = !!+v; renderAuto(director.active); }
      else if (id === 'scale') { P.scale = v === 'auto' ? 'auto' : +v; if (P.scale !== 'auto') renderScale = P.scale; else renderScale = Math.max(renderScale, P.floor); resetAdapt(); fit(); }
      else if (id === 'floor') { P.floor = +v; renderScale = Math.max(renderScale, P.floor); resetAdapt(); fit(); }
      else if (id === 'density') { P.density = v === 'auto' ? 'auto' : +v; resetAdapt(); fit(); }
      else if (id === 'fps') { P.fps = v === 'auto' ? 'auto' : +v; resetAdapt(); }
      else if (id.startsWith('tune-')) { const k = id.slice(5); P.tune[k] = v === 'auto' ? 'auto' : +v; if (v === 'auto') tune[k].level = KNOBS[k].levels.length - 1; applyTune(); resetAdapt(); }
      else if (id === 'scan') { P.scan = v === 'auto' ? null : +v; if (v === 'auto') tune.neighbors.level = KNOBS.neighbors.levels.length - 1; applyTune(); }
      else if (id === 'n') pendingN = v === 'auto' ? 'auto' : +v;
      else if (id === 'apply') { const n = pendingN; pendingN = null; setParticles(n); }
      else if (id === 'profile') { copyProfile(); return; }
      else if (id === 'sound') { if (!!+v !== sound.on) toggleSound(); return; }
      else if (id === 'guide') { toggle(false); lab.open('guide'); return; }
      else if (id === 'reset' || id === 'reset-no') { confirming = id === 'reset'; render(); return; }
      else if (id === 'reset-yes') { confirming = false; resetTab(); }
      persist();
      renderMaps();
      render();
    }
    opts.addEventListener('click', (e) => { const b = e.target.closest('[data-o]'); if (b && !b.disabled) set(b.dataset.o, b.dataset.v); });
    opts.addEventListener('input', (e) => {
      if (e.target.id === 'w-name') wName = e.target.value;
      else if (e.target.id === 'set-vol') { if (!sound.on) toggleSound(); sound.setVolume(Number(e.target.value) / 100); }
    });
    opts.addEventListener('keydown', (e) => { if (e.target.id === 'w-name' && e.key === 'Enter') { e.preventDefault(); worldAct('w-save'); } });
    tabs.forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; confirming = false; ask = null; render(); }));
    $('set-tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = tabs.findIndex((b) => b.dataset.tab === tab);
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      e.preventDefault(); n.click(); n.focus();
    });
    // open on a tab (the wordmark opens About), or close if that tab is already showing
    function toggle(on = el.hidden, to) {
      if (to) { on = el.hidden || tab !== to; if (on) { tab = to; confirming = false; ask = null; } }
      el.hidden = !on;
      btn.setAttribute('aria-expanded', String(on));
      if (on) { $('help').hidden = true; if (phone()) lab.close(); saves = null; render(); } else { pendingN = null; confirming = false; ask = null; }
    }
    btn.addEventListener('click', () => toggle());
    $('brand').addEventListener('click', () => toggle(true, 'about'));
    $('set-close').addEventListener('click', () => toggle(false));
    return { render, toggle, readout, isOpen: () => !el.hidden };
  })();
  // How the page runs on this device, to report it: three seconds of frames timed pass by pass on the
  // GPU and one simulation step dispatch by dispatch, with what was drawn, copied as JSON.
  async function copyProfile() {
    flash(tr('flash.profiling', 'Profiling for three seconds'));
    const passes = {};
    let frames = 0, gpu = 0;
    // (beside any other listener, the tuner's own profile, handed back as found)
    const other = eng.onPassTimes, was = eng.passProfile;
    const mine = (times, f) => { if (other) other(times, f); frames++; gpu += f.ms; for (const [k, ms] of times) passes[k] = (passes[k] || 0) + ms; };
    eng.passProfile = true;
    eng.onPassTimes = mine;
    await sleep(3000);
    if (eng.onPassTimes === mine) { eng.onPassTimes = other; eng.passProfile = was; }
    const per = (x) => +(x / Math.max(1, frames)).toFixed(3);
    const step = Object.fromEntries((await eng.profileStep(1 / 60)).map(([k, ms]) => [k, +ms.toFixed(3)]));
    const a = device.adapterInfo || {};
    // the state that picks which work a step does: a pool below full (level < 1) or frost runs the shore's
    // work for every particle, an event its own, a coarse step several ticks' worth
    const ev = climate?.event;
    const world = { simTime: Math.round(eng.simTime), ticks: eng.ticks, grid: eng.grid, level: +eng.level.toFixed(4), frost: +eng.frost.toFixed(3),
      rain: +eng.rain.toFixed(3), temp: +eng.temp.toFixed(1), era: climate?.name, eraLevel: climate?.levelTo,
      event: ev ? { type: ev.type, phase: climate.phase, since: Math.round(eng.simTime - ev.t) } : null };
    const json = JSON.stringify({ ua: navigator.userAgent, gpu: [a.vendor, a.architecture, a.description].filter(Boolean).join(' / '),
      canvas: [canvas.width, canvas.height], dpr: devicePixelRatio, scale: renderScale, particles: eng.count, neighbors: eng.maxScan, living: life.counts[3],
      // the tuner's knobs: each one's level, Auto or fixed, and what it has learned of its cost on this device
      tune: Object.fromEntries(Object.entries(tune).map(([id, k]) => [id, { level: k.level, auto: tuneAuto(id), cost: k.cost == null ? null : +k.cost.toFixed(3),
        ...(k.rel ? { rel: k.rel.map((r) => (r == null ? null : +r.toFixed(3))) } : {}), ...(k.ratio ? { ratio: +k.ratio.toFixed(3) } : {}) }])),
      cssPPU: +cssPPU().toFixed(1), speed: state.speed, boot: bootTimes, fps: +perf.fps.toFixed(1), aim: Math.round(1000 / frameTarget()), why: perf.why, audio: sound.load,
      world, frameMs: per(gpu), passes: Object.fromEntries(Object.entries(passes).sort((x, y) => y[1] - x[1]).map(([k, x]) => [k, per(x)])), step });
    try { await navigator.clipboard.writeText(json); flash(tr('flash.profile-copied', 'Profile copied')); } catch { prompt(tr('settings.perf.profile-prompt', 'The profile, to copy:'), json); }
  }
  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  }
  // full screen from the rail, where the browser allows it (not on iPhone)
  const fsBtn = $('fs');
  fsBtn.hidden = !document.fullscreenEnabled;
  fsBtn.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', () => {
    const on = !!document.fullscreenElement;
    fsBtn.setAttribute('aria-pressed', String(on));
    fsBtn.setAttribute('aria-label', on ? tr('rail.fs.aria-exit', 'Exit full screen') : tr('rail.fs.aria', 'Full screen'));
    fsBtn.dataset.hint = on ? tr('rail.fs.hint-exit', 'Exit full screen · F') : tr('rail.fs.hint', 'Full screen · F');
    fsBtn.innerHTML = `<svg><use href="#i-${on ? 'unfull' : 'full'}"/></svg>`;
  });
  for (const row of document.querySelectorAll('.tabs')) wireTabRow(row);
  function toggleHelp(on = $('help').hidden) { $('help').hidden = !on; if (on) view.toggle(false); }
  $('help-close').addEventListener('click', () => toggleHelp(false));
  function closeMenus() { view.toggle(false); toggleHelp(false); }
  // The interface hidden (U, or Display → Interface; U or Esc brings it back): only the world shows.
  // The loupe still follows the mouse (it has its own setting) and the auto camera still films, without
  // its captions. Not on a touch screen, which has no key to bring it back.
  const UI_PARTS = ['hud', 'spec', 'lab', 'help', 'card', 'tip', 'plate'];
  function setInterface(on, say = true) {
    state.ui = on;
    document.body.classList.toggle('ui-off', !on);
    for (const id of UI_PARTS) $(id).inert = !on;
    if (!on) { if (cards.isOpen()) cards.close(); closeMenus(); document.activeElement?.blur?.(); }
    if (say) flash(on ? tr('flash.ui-shown', 'Interface shown') : tr('flash.ui-hidden', 'Interface hidden · U'));
    persist();
  }
  if (!state.ui) setInterface(false, false);

  $('snd').addEventListener('click', toggleSound);
  $('vol').addEventListener('input', (e) => sound.setVolume(Number(e.target.value) / 100));
  renderSound();
  // On by default. Where the browser allows autoplay it starts right away; elsewhere it waits for a
  // click or key press, and the intro asks for one before the world starts (see the menu).
  if (sound.wantsOn) sound.setOn(true);
  addEventListener('pointerup', sound.unlock, true); addEventListener('keydown', sound.unlock, true);

  // ------------------------------------------------------------ the bench (bench.js): the tools, their reach
  // (a tool that acts on the world: not none, not the loupe)
  const inHand = () => works(hand.tool);
  // Take up a tool (a working one stops the auto camera); the one in hand taken up again is put down: Pan.
  function pickTool(id) {
    if (id === hand.tool) id = 'none';
    hand.set(id, eng.simTime);
    hear('pick', { tool: hand.tool });
    if (id !== 'loupe') lensAt = null;
    if (inHand()) { takeOver(); endRide(); state.follow = false; }
    bench.render();
    view.render();
  }
  // Reach, for the tool in hand: the loupe's is the lens's radius (px), every other tool's a world distance
  // i18n: the loupe's reach: its lens's width, {n} CSS pixels
  const reachOf = () => (hand.tool === 'loupe' ? { min: LOUPE_R.min, max: loupeMax(), v: loupeR(), text: tr('bench.reach-px', '{n} px', { n: 2 * loupeR() }) }
    : { min: REACH.min, max: REACH.max, v: hand.reach, text: fmtLen(hand.reach) });
  function setReach(r, say = false) {
    if (hand.tool === 'loupe') state.loupeR = Math.round(clamp(r, LOUPE_R.min, loupeMax()));
    else hand.reach = clamp(r, REACH.min, REACH.max);
    persist();
    bench.render();
    // i18n: {reach} is a length (12 µm) or the loupe's width (bench.reach-px)
    if (say) flash(tr('flash.reach', 'Reach {reach}', { reach: reachOf().text }));
  }
  // the pipette's strip: its runs from the tip, the last in, each a mini-card keyed by its id
  const pipSp = (key) => pipette.run(+key);
  // its card in the cabinet, if there is one
  const pipCard = (sp) => cabinet.cards.find((c) => c.id === sp.card) || (!sp.stranger ? savedCard(sp.serial) : null);
  // what it holds of a species: its cells, and its bodies of more than one
  const heldOf = (sp) => [pipette.cells(sp), sp.orgs.filter((o) => o.cells.length - o.out > 1).length];
  // The strip's runs: the pipette's, and while it draws up, what has come in so far as it will be kept (each species
  // at the tip, joining the tip's run if it is of its kind), so a card comes with its first cells, not when the draw
  // is done: [{ sp, held: [cells, bodies], key }] (a run still coming in keyed 'in' and its serial, not to be moved)
  let runs = [];
  function pipRuns() {
    runs = pipette.species.map((sp) => ({ sp, held: heldOf(sp), key: String(sp.id) }));
    for (const { kind, g, recs } of pull.got.length ? incoming() : []) {
      const t = runs[0], bodies = bodiesOf(recs).filter((o) => o.cells.length > 1).length;
      if (t && !t.sp.stranger && t.sp.serial === g.serial) t.held = [t.held[0] + recs.length, t.held[1] + bodies];
      else runs.unshift({ sp: { serial: g.serial, words: wordsOf(kind), name: drawnName(g) }, held: [recs.length, bodies], key: `in${g.serial}` });
    }
    return runs;
  }
  const bench = createBench({ hand, pick: pickTool, reach: setReach, size: reachOf, onToggle: (on) => { if (on && phone()) { view.toggle(false); lab.close(); } },
    pip: {
      view: () => ({ count: pipette.count + pull.got.length, limit: PIPE_LIMIT, armed: pull.armed, keys: pipRuns().map((r) => { const c = pipCard(r.sp); return r.key + (c ? '*' : ''); }), held: runs.map((r) => r.held), mixed: pipette.mixed }),
      // (after view, its runs)
      cards: (flat) => runs.map(({ sp, held: [n, bodies], key }, i) => miniCard(genomeOfWords(sp.words), K, { gid: sp.words.join(), key, name: (!sp.stranger && life.reg.get(sp.serial)?.name) || sp.name, home: sp.home || '',
        n, bodies, tip: i === 0, flat, kept: !!pipCard(sp), thumb: pipThumb(sp) })).join(''),
      move: (key, i) => { const sp = pipSp(key); if (sp) pipette.move(sp, i); },
      // its card: this world's species live, a carried one's from the cabinet
      open: (key) => {
        const sp = pipSp(key), c = sp && pipCard(sp);
        if (sp && !sp.stranger && life.reg.has(sp.serial)) cards.open(sp.serial);
        else if (c) openCard(c);
      },
      drop: (key, x, y) => { const sp = pipSp(key); if (sp) startSpit(x, y, sp); },
      // (dragged onto the Lab: its card kept, or, kept already, its card in the cabinet shown)
      save: (key) => {
        const sp = pipSp(key), c = sp && pipCard(sp);
        if (c) showInCabinet(c);
        else if (sp && life.reg.has(sp.serial)) saveCard(sp.serial);
      },
      cabinet: () => lab.open('cabinet'),
      arm: (on) => { pull.armed = on; },
      saveAll,
      sort: () => pipette.sort(),
    } });
  // every species in the pipette whose card is not saved yet: its card into the cabinet, one after another (each
  // drawn with its portrait), the button counting them; the cabinet drawn once at the end
  async function saveAll() {
    const todo = [...new Map(pipette.species.filter((sp) => !pipCard(sp) && !sp.stranger && life.reg.has(sp.serial)).map((sp) => [sp.serial, sp])).values()];
    if (!todo.length) return;
    const btn = $('pip-keep');
    btn.disabled = true;
    try {
      // i18n: the pipette's Save all button while it saves: card {i} of {n}
      for (const [i, sp] of todo.entries()) { btn.textContent = tr('bench.saving-cards', 'Saving {i} / {n}', { i: i + 1, n: todo.length }); await saveCard(sp.serial, true); }
    } finally {
      btn.disabled = false;
      btn.textContent = tr('bench.save-all', 'Save all');
    }
    lab.render(true);
    cards.refresh();
    flash(todo.length > 1 ? tr('flash.cards-kept', '{n, plural, other {{n} cards into the cabinet}}', { n: todo.length }) : tr('flash.card-kept', '{name} is in the cabinet', { name: todo[0].name }));
    bench.render();
  }
  // The hand's acts for the chronicler, told as weather: the species within an act's reach counted (the pick pass)
  // as it begins and again a few minutes after it ends (handSeen: the acts already counted as they began).
  const HAND_AFTER = 180;
  let handBusy = false;
  async function nearCounts(a) {
    if (eng.pickReq) return null; // (never in the way of a click's pick)
    const res = await eng.requestPick([a.x, a.y], Math.max(2 * a.r, 3), NONE);
    if (!res) return null;
    const m = new Map();
    for (const c of res.entries) {
      const g = c.kind >= FIRST_LIFE && genomeFor(c.kind);
      if (g) m.set(g.serial, (m.get(g.serial) || 0) + 1);
    }
    return m;
  }
  async function handNews() {
    const acts = hand.acts;
    if (handBusy || state.phase !== 'running' || !acts.length) return;
    handBusy = true;
    try {
      // (the acts told go from the record, so it never grows as a world runs)
      handSeen -= hand.forget(handSeen);
      if (handSeen < acts.length) {
        const m = await nearCounts(acts[handSeen]);
        // (a species of one or two cells there could not have bloomed or been driven out: not kept)
        if (m) acts[handSeen++].near = [...m].filter(([, n]) => n > 2);
        return;
      }
      const a = acts.find((x) => x.near && !x.told && eng.simTime - x.end > HAND_AFTER && !(hand.held && x === acts.at(-1)));
      if (!a) return;
      const after = await nearCounts(a);
      if (!after) return;
      a.told = true;
      chron.note('hand', { t: eng.simTime, act: a, before: new Map(a.near), after, world: eng.grid });
    } finally { handBusy = false; }
  }
  // ------------------------------------------------------------ the pipette (pipette.js, docs/hand.md)
  // Drawing up: pressed (even for a moment: a pulse), the tip draws the living cells about it toward it, from
  // farther and faster the longer it is held, out to its reach (the engine's hand.suck: a click takes a cell or
  // a few, at its tip), and takes in what reaches it; let go, it stops, but for
  // the cells bonded to one it took, which follow it in unless it is pulled away from them faster than they come.
  // Setting down (Dispense, or ⇧): the tip species' cells leave it at a rate that rises the longer it is held, owed by
  // the time and set down each frame as they come due (what a set-down could not hold comes the next frame), each
  // keeping its bonds, so a body comes out as it went in and the flow is even, never a trickle and then a gush.
  const PRESSURE = 1.5; // seconds held to full pressure
  const SUCK = [1.5, 16]; // how fast the tip draws what is in its reach (world units a second), pressed and at full pressure
  const SIP = 0.35; // how far the tip draws from, pressed (world units; at full pressure, its reach)
  const SPIT = [10, 600]; // cells a second leaving, pressed and at full pressure (eased by the pressure squared)
  const OWED = [0.25, 0.02]; // seconds of cells a frame may owe for at most (a stall never dumps), and left over from
  // a set-down that could hold fewer than were due
  const pressed = (t0, now) => Math.min(1, (now - t0) / 1000 / PRESSURE);
  const lerp2 = ([a, b], u) => a + (b - a) * u;
  const wordsOf = (kind) => Array.from(life.lastCensus.genomeU32.subarray(kind * G_WORDS, (kind + 1) * G_WORDS));
  function startPull(sx, sy) {
    const now = performance.now();
    if (!pipette.fits(1)) { pull.shake = now; hear('full'); return; }
    Object.assign(pull, { on: true, at: now, until: now + 150, tip: toWorld(sx, sy) });
    hand.note('pipette', ...pull.tip, eng.simTime);
  }
  // What the pipette holds, seen in its bore: a column of its cells up the glass, out of view, in the order they will
  // leave (the tip's run first, as `next` takes them), what is being drawn up nearest the tip as it will be kept. Drawn
  // up, the column rises as cells come in; set down, it slides down and out of the tip as they leave. The engine draws
  // them as the cells they are, as out of focus as the glass about them (setTube, vsTube).
  const BORE = 0.2; // world units between the cells in the column, at least (more for big cells: a diameter)
  const sizes = new WeakMap(); // a genome's words: its cells' radius (world units)
  const radiusOf = (w) => { if (!sizes.has(w)) sizes.set(w, cellRadius({}, genomeOfWords(w), 1)); return sizes.get(w); };
  // (bore: how many it held when last drawn, the column's offset in cells still to ease away, when last drawn, the last
  // to leave, in the order they left; in: what is coming in, as it will be kept, for how many taken; the genomes the
  // engine has; the records written for it)
  const bore = { n: 0, g: 0, at: 0, gone: [], in: [], of: 0, genomes: [], rec: new ArrayBuffer(TUBE_N * P_BYTES) };
  // a cell for the bore: its genome's words, energy, age, color and info
  const boreCell = (w, c) => ({ w, e: c[0], a: c[1], col: c[2], info: c[3] });
  const madeCell = (sp) => { const [e, col, info] = newborn(sp); return { w: sp.words, e, a: 0, col, info }; };
  // the column's first N cells
  function boreCells(N) {
    if (bore.of !== pull.got.length) {
      bore.in = incoming().map(({ kind, recs }) => ({ w: wordsOf(kind), orgs: bodiesOf(recs) }));
      bore.of = pull.got.length;
    }
    // (from the tip: what is coming in, the last species first, each's last body in first; then each run's)
    const seq = [];
    const put = (orgs, w, sp) => {
      for (let k = orgs.length - 1; k >= 0 && seq.length < N; k--) for (let c = orgs[k].out; c < orgs[k].cells.length && seq.length < N; c++) seq.push(boreCell(w, orgs[k].cells[c]));
      for (let m = 0; sp && m < sp.made && seq.length < N; m++) seq.push(madeCell(sp));
    };
    for (let i = bore.in.length - 1; i >= 0; i--) put(bore.in[i].orgs, bore.in[i].w);
    for (const sp of pipette.species) put(sp.orgs, sp.words, sp);
    return seq;
  }
  // each frame, with the pipette in hand over the world (R), else nothing in the bore
  function drawBore(R, dt) {
    if (!R || hand.tool !== 'pipette') { if (eng.tubeN) eng.setTube(null, 0); bore.at = 0; return; }
    const [dx, dy] = INSTRUMENTS.pipette.dir, p = cssPPU(), now = performance.now();
    // (how far the glass runs, from its tip to the edge of the view, in cells)
    const len = Math.min(dx > 0 ? (innerWidth - R.sx) / dx : -R.sx / dx, dy > 0 ? (innerHeight - R.sy) / dy : -R.sy / dy);
    const gap = Math.max(BORE, 2.1 * Math.max(0, ...bore.genomes.map(radiusOf))) * p, N = Math.min(TUBE_N, Math.ceil(len / gap) + 1);
    const seq = boreCells(N + Math.max(0, Math.ceil(bore.g)));
    const n = pipette.count + bore.in.reduce((a, x) => a + x.orgs.reduce((b, o) => b + o.cells.length, 0), 0);
    bore.g = now - bore.at > 200 ? 0 : clamp((bore.g + n - bore.n) * Math.exp(-dt / 60), -N, N);
    Object.assign(bore, { n, at: now });
    // (the cell i from the tip; below it, i < 0, those just gone; each faces the way it goes)
    const at = (i) => (i < 0 ? bore.gone[bore.gone.length + i] : seq[i]);
    const f = new Float32Array(bore.rec), u = new Uint32Array(bore.rec), face = bore.g < 0 ? -1 : 1;
    const genomes = [];
    let m = 0;
    for (let i = Math.floor(bore.g); i < Math.min(n, N + Math.ceil(bore.g)) && m < TUBE_N; i++) {
      const d = (i - bore.g + 0.5) * gap, c = at(i);
      if (d < 0 || d > len || !c) continue;
      let k = genomes.indexOf(c.w);
      if (k < 0) { if (genomes.length >= TUBE_K) continue; k = genomes.push(c.w) - 1; }
      // (its bore as the composite's toolAt draws it; each cell a little off its middle, the same as it moves)
      const w = clamp(d / p / 12, 0, 1), half = 0.68 * lerp2([0.34, 1.1], w * w * (3 - 2 * w)) * p;
      const j = n - 1 - i, lat = 1.1 * ((Math.sin(j * 12.9898) * 43758.5453) % 1);
      const [x, y] = toWorld(R.sx + dx * d - dy * lat * 0.5 * half, R.sy + dy * d + dx * lat * 0.5 * half);
      // (as out of focus as the glass there: raised over the water, and up from the tip, which is in it)
      const blur = Math.max(1e-4, (1 - toolFocus) * PIPETTE_DOF.raised + Math.max(0, d / p - PIPETTE_DOF.wet) * PIPETTE_DOF.rate);
      const o = m++ * (P_BYTES / 4);
      f.set([x, y, dx * face * blur, dy * face * blur], o);
      u[o + 4] = FIRST_LIFE + k; f[o + 5] = c.e; f[o + 6] = c.a; u[o + 7] = j >>> 0; u[o + 8] = c.col; u[o + 9] = c.info;
    }
    // (the genomes when they are not the ones the engine has)
    const fresh = genomes.length !== bore.genomes.length || genomes.some((w, k) => w !== bore.genomes[k]);
    if (fresh) bore.genomes = genomes;
    eng.setTube(bore.rec, m, fresh ? Uint32Array.from(genomes.flatMap((w) => [...w])) : null);
  }
  eng.onCut = (n) => hear('cut', { n });
  eng.onTaken = (recs) => {
    for (const r of recs) { pull.got.push(r); pull.taken.add(r.id); pull.drawn.delete(r.id); }
    for (const r of recs) for (const q of r.partners) if (q !== NONE && !pull.taken.has(q)) pull.drawn.add(q);
    eng.setDrawn(pull.drawn);
    pull.last = performance.now();
    if (life.lastCensus) hand.note('pipette', ...pull.tip, eng.simTime, recs.length);
    hear('cells', { n: recs.length });
    bench.render();
  };
  // what came in, kept once nothing more is coming: each species' cells, as bodies
  function pullDone() {
    hand.suck = null;
    eng.setDrawn([]);
    pull.drawn.clear(); pull.taken.clear();
    for (const { kind, g, recs } of incoming()) pipette.add({ serial: g.serial, words: wordsOf(kind), slot: kind, name: drawnName(g) }, recs);
    pull.got = [];
    bench.render();
  }
  // A species' name as it is drawn up: the registry's, or, for one the census never counted (a newborn mutant taken
  // whole, its only cells now in the pipette), its own registered here as the census would (the census lets it go
  // again, unseen and unestablished, so its name is kept here for the pipette's run)
  const drawnNames = new Map();
  function drawnName(g) {
    const sp = life.reg.get(g.serial);
    if (sp) return sp.name;
    let name = drawnNames.get(g.serial);
    if (!name) {
      const t = eng.simTime, at = Math.floor(t / SIM_CLOCK) * SIM_CLOCK + g.born;
      name = register({ ...g, born: at > t + 1 ? at - SIM_CLOCK : at }).name;
      drawnNames.set(g.serial, name);
      if (drawnNames.size > 256) drawnNames.delete(drawnNames.keys().next().value);
    }
    return name;
  }
  // what has come in, by species: [{ kind, g (its genome), recs }] (none of a species not known)
  function incoming() {
    const by = new Map();
    for (const r of pull.got) { if (!by.has(r.kind)) by.set(r.kind, []); by.get(r.kind).push(r); }
    return [...by].map(([kind, recs]) => ({ kind, recs, g: life.lastCensus && genomeFor(kind) })).filter((x) => x.g);
  }
  // each frame: the tip follows the pointer while it draws, and sets down while pressed
  function pullTick(now) {
    const R = reticleAt();
    if (R && (pull.on || hand.suck)) pull.tip = toWorld(R.sx, R.sy);
    const pressing = (pull.on || now < pull.until) && pipette.fits(pull.got.length + 1);
    if (pull.on && !pressing) { pull.on = false; pull.shake = now; }
    if (pressing || (pull.drawn.size && now - pull.last < 1500)) {
      const u = pressed(pull.at, now) ** 2;
      hand.suck = [...pull.tip, lerp2([SIP, Math.max(hand.reach, SIP)], u), pressing && !state.paused ? lerp2(SUCK, u) : 0];
      pull.quiet = now;
    } else if (hand.suck || pull.got.length) {
      hand.suck = null;
      // (the last cells taken come back a frame or two after)
      if (now - Math.max(pull.quiet, pull.last) > 250) pullDone();
    }
    if (spit.on && !spit.busy && now >= spit.next) spitNext(now, R);
  }
  // the chance each grain of silt in the world (from the last census) is taken to make n cells set down: about half
  // again as many as are needed (those over are left; those short are made next time)
  const setDownTake = (n) => Math.min(1, (1.5 * n + 2) / Math.max(1, life.counts[0] || eng.count * 0.5));
  // a newborn of a card's species: its energy and color, its first cell type
  const newborn = (sp) => { const g = genomeOfWords(sp.words); return [0.5 * (g.reproE || 1), g.col, 0]; };
  // Setting down: pressed (held: until let go; a click: one body), or a strip's card dragged onto the world (all of
  // that species, there)
  function startSpit(sx, sy, sp = null) {
    if (!pipette.count) return;
    // (org true: a whole to come out, whichever comes first)
    const now = performance.now();
    // (the first cell comes at once)
    Object.assign(spit, { on: true, held: !sp, sp, org: true, at: now, next: 0, owed: 1, last: now, fails: 0, pt: sp ? toWorld(sx, sy) : null, tip: toWorld(sx, sy) });
  }
  async function spitNext(now, R) {
    const sp = spit.sp || pipette.tip;
    // (held, one after another)
    if (!sp || (!spit.held && !spit.sp && !spit.org)) { spit.on = false; return; }
    // (a stranger's first cells found its lineage here: the rest waits for the census to name its serial, a few
    // seconds at most: cells all dead before a census was ever taken found none)
    if (sp.pending != null) {
      if (Math.abs(eng.simTime - sp.pendingAt) < 5) return;
      delete life.carried[sp.pending];
      sp.pending = null;
    }
    // (the cells come due as the time passes, faster the longer it is held, a little unevenly; a click's body, or a
    // card's colonies, come out whole, one at a time)
    const u = pressed(spit.at, now);
    const rate = lerp2(SPIT, u * u), dt = Math.min(OWED[0], (now - spit.last) / 1000);
    spit.owed = Math.min(spit.owed + rate * (0.8 + 0.4 * Math.random()) * dt, Math.max(1, rate * (dt + OWED[1])));
    spit.last = now;
    if (spit.owed < 1) return;
    // (held at the tip, on from one run to the next as each empties, so a stack of short runs flows as evenly as one
    // long one; a stranger waiting for its lineage holds back what is behind it)
    let items = [], due = Math.floor(spit.owed);
    for (const run of spit.held && !spit.sp ? pipette.species : [sp]) {
      if (run !== sp && (run.pending != null || run.stranger)) break;
      const its = pipette.next(run, due);
      items.push(...its);
      due -= its.reduce((m, x) => m + (x.n || x.made), 0);
      if (due <= 0) break;
    }
    if (!spit.held && !spit.sp) items = items.slice(0, 1);
    if (!items.length) { spit.on = false; return; }
    const it = items[0], whole = it.org || sp;
    if (whole !== spit.org) { spit.org = whole; spit.dir = Math.random() * TAU; }
    // (at the pointer, or with none over the world, where it last was)
    if (R) spit.tip = toWorld(R.sx, R.sy);
    const at = spit.pt || spit.tip;
    // each cell squeezed out at the tip, pushed on its way (a batch spread over a little more water)
    const spread = 0.05 * Math.sqrt(items.reduce((m, x) => m + (x.n || x.made), 0));
    const placed = () => { const a = spit.dir + (Math.random() - 0.5) * 0.9, v = 1.2 + Math.random() * 0.6, d = spread * Math.sqrt(Math.random()); return [Math.cos(a) * d, Math.sin(a) * d, Math.cos(a) * v, Math.sin(a) * v]; };
    const { job, used } = mergeJobs(items.map((x) => setDownJob(x, placed, newborn)));
    items = items.slice(0, used);
    spit.busy = true;
    const res = await eng.setDown({ at, take: setDownTake(job.cells.length), ...job });
    spit.busy = false;
    if (!res) return;
    // (each of the batch's organisms its share of what was placed, in turn, if its species found a slot)
    let got = 0, off = 0;
    for (const x of items) {
      const m = x.n || x.made, slot = res.slots[job.of.indexOf(x.sp)], k = slot === NONE ? 0 : Math.max(0, Math.min(m, res.placed - off));
      off += m;
      if (!k) continue;
      const run = x.sp;
      if (run.stranger) { life.carried[slot] = { name: run.name, home: run.home }; Object.assign(run, { pending: slot, pendingAt: eng.simTime }); }
      run.slot = slot;
      // (the column's cells that left, in the order they did, to be seen sliding out)
      for (let j = 0; j < k; j++) bore.gone.push(x.org ? boreCell(run.words, x.org.cells[x.from + j]) : madeCell(run));
      pipette.left(x, k, res.ids.slice(off - m, off - m + k));
      got += k;
    }
    if (got) {
      bore.gone.splice(0, Math.max(0, bore.gone.length - 400));
      spit.owed = Math.max(0, spit.owed - got);
      hand.note('setdown', ...at, eng.simTime, got);
      hear('cells', { n: got, out: true });

      if (it.org ? it.org.out >= it.org.cells.length : !it.sp.made) spit.org = null;
      spit.fails = 0;
    } else if (++spit.fails > 2) {
      // (none placed: again the next frame, as a few grains of silt may just not have been taken; failing again and
      // again, there is no silt left in all the world to make them of: a word by the tip, a click's or a card's work
      // ends, and a moment between tries)
      pull.note = { text: tr('hand.pipette.no-silt', 'No silt left to make them of'), t: now };
      if (!spit.held) spit.on = false;
      spit.next = now + 200;
    }
    bench.render();
  }
  // a press with the pipette in hand: Load draws up, Dispense sets down (⇧: the other)
  function pipettePress(e) {
    const down = pull.armed !== e.shiftKey;
    if (down) startSpit(e.clientX, e.clientY); else startPull(e.clientX, e.clientY);
  }
  function pipetteUp() { pull.on = false; spit.held = false; }
  // what a press would do now, or is doing: Load or Dispense (⇧ held, the other, before the press too)
  let shiftHeld = false;
  for (const ev of ['keydown', 'keyup']) addEventListener(ev, (e) => { shiftHeld = e.shiftKey; }, true);
  addEventListener('blur', () => { shiftHeld = false; ride.keys.clear(); });
  const pipDispensing = () => (spit.on ? true : pull.on || hand.suck ? false : pull.armed !== shiftHeld);
  // The hand heard (audio/handsound.js): its acts as they happen, and every frame while it does something, the
  // tool's state (its level; how fast the rod or the needle in the water moves on the screen, 0..4, 300 px a second
  // to the unit; the water under the stage or the probe; riding and how hard it is steered; the pointer's side of
  // the screen)
  function hearHand(R, dt) {
    if (R) heard.pan = panAt(R.sx);
    const tip = hand.tool === 'touch' && hand.held ? hand.rodAt : hand.tool === 'needle' && hand.held ? hand.last : null, was = heard.tip;
    heard.tip = tip ? [...tip] : null;
    const v = tip && was && dt > 0 ? Math.min(4, (Math.hypot(tip[0] - was[0], tip[1] - was[1]) * cssPPU()) / dt / 300) : 0;
    hearWater();
    // (the rod dipped in past halfway is heard going in, and coming out: a tap is a tap)
    if (hand.dip > 0.5 !== heard.dipped) { heard.dipped = !heard.dipped; hear(heard.dipped ? 'dip' : 'lift'); }
    if (hand.rung !== heard.rung) { heard.rung = hand.rung; hear('ring'); }
    const held = hand.held || pull.on || spit.on, will = ride.on && hand.will ? hand.will[2] : 0;
    const st = { tool: hand.tool, level: Math.round(hand.level * 100) / 100, move: Math.round(v * 10) / 10, held, ride: ride.on, will,
      water: heard.water, freezing: heard.freezing, ice: heard.ice };
    const key = JSON.stringify(st);
    // (recorded only once sent: a state that changed while sound was off is sent when it comes back on)
    if ((key !== heard.sent || v) && hear('state', st)) heard.sent = key;
  }
  // The water under the stage or the probe, read a few times a second at its center and eight points about it: the
  // center's temperature, how fast the water near freezing in its reach freezes (0..1, 8° a second and more), and how
  // much of it is ice
  function hearWater() {
    const on = (hand.tool === 'warm' || hand.tool === 'cold') && hand.at && K.heat;
    if (!on) { Object.assign(heard, { water: null, temps: null, freezing: 0, ice: 0 }); return; }
    const now = performance.now();
    if (now - heard.tAt < 150) return;
    const { x, y, r } = hand.stage, pts = [[x, y]];
    for (let k = 0; k < 8; k++) pts.push([x + 0.7 * r * Math.cos((k * Math.PI) / 4), y + 0.7 * r * Math.sin((k * Math.PI) / 4)]);
    eng.tempsAt(pts).then((T) => {
      if (!T) return;
      const t = performance.now(), prev = heard.temps, dt = (t - heard.tRead) / 1000;
      let f = 0;
      if (prev && dt > 0 && dt < 1) for (let k = 0; k < T.length; k++) if (T[k] < 2 && T[k] > -6) f += Math.max(0, (prev[k] - T[k]) / dt);
      Object.assign(heard, { temps: T, tRead: t, water: Math.round(T[0]), freezing: Math.round(Math.min(1, f / T.length / 8) * 100) / 100, ice: T.filter((u) => u < 0).length / T.length });
    });
    heard.tAt = now;
  }
  // A tap with a tool in hand: Touch rings the water, the needle pricks the cell under its tip.
  async function tapTool(sx, sy) {
    const [wx, wy] = toWorld(sx, sy);
    if (hand.tool === 'touch') { hand.tap(wx, wy, eng.simTime); hear('tap'); }
    else if (hand.tool === 'needle') {
      const p = cssPPU(), res = await eng.requestPick([wx, wy], Math.max(0.5, 30 / p), NONE);
      if (!res) return;
      const [W, H] = eng.grid;
      let best = null, bd = Math.max(isCoarse ? 36 : 14, 0.12 * p);
      for (const c of res.entries) {
        const d = Math.hypot(wrapD(c.x - wx, W), wrapD(c.y - wy, H)) * p;
        if (c.kind >= FIRST_LIFE && d < bd) { bd = d; best = c; }
      }
      if (best) { hand.prick(best.id, best.x, best.y, eng.simTime); hear('prick'); }
    }
  }

  // ------------------------------------------------------------ input
  // (down.apply: the tool in hand applied by this press: the left button, or one finger; right-drag, the middle
  // button and two fingers pan and zoom as ever)
  const ptr = { pointers: new Map(), down: null, dragging: false, pinch: null };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    ptr.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // (on a phone a tap on the world folds the bench and does nothing else)
    const folds = phone() && bench.isOpen();
    if (ptr.pointers.size === 1) {
      const apply = inHand() && !folds && state.phase === 'running' && (e.pointerType !== 'mouse' || e.button === 0);
      const pip = hand.tool === 'pipette' && apply;
      const L = loupeGeom();
      ptr.down = { x: e.clientX, y: e.clientY, loupe: L, apply, pip };
      ptr.dragging = false;
      // (on a touch screen a drag that starts on the lens moves it)
      if (L && e.pointerType !== 'mouse' && !folds && Math.hypot(e.clientX - L.sx, e.clientY - L.sy) < L.R) ptr.down.lens = { x: L.sx, y: L.sy };
      if (pip) { pipettePress(e); takeOver(); }
      else if (apply) { hand.down(...toWorld(e.clientX, e.clientY), eng.simTime); takeOver(); }
      // riding, a press steers (and pans nothing); a quick click on another cell selects it (up, below)
      else if (ride.on && !folds && (e.pointerType !== 'mouse' || e.button === 0)) { ptr.down.steer = true; ptr.down.t = performance.now(); ride.at = toWorld(e.clientX, e.clientY); }
    }
    if (ptr.pointers.size === 2) {
      const [a, b] = [...ptr.pointers.values()];
      ptr.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      ptr.dragging = true;
      // a second finger puts the tool's work aside for the pinch
      if (ptr.down?.apply) { ptr.down.apply = false; hand.up(eng.simTime); }
      if (ptr.down?.pip) { ptr.down.pip = false; pipetteUp(); }
      if (ptr.down?.steer) { ptr.down.steer = false; ride.at = null; }
      takeOver();
    }
    if (phone() && view.isOpen()) view.toggle(false);
    if (folds) bench.toggle(false);
    hideIntro();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { hover.x = e.clientX; hover.y = e.clientY; hover.on = true; }
    const prev = ptr.pointers.get(e.pointerId);
    if (!prev) return;
    if (ptr.down?.steer) {
      prev.x = e.clientX; prev.y = e.clientY; ride.at = toWorld(e.clientX, e.clientY);
      if (Math.hypot(e.clientX - ptr.down.x, e.clientY - ptr.down.y) > (e.pointerType === 'mouse' ? 6 : 12)) ptr.down.moved = true;
      return;
    }
    if (ptr.down?.apply) {
      prev.x = e.clientX; prev.y = e.clientY;
      hand.move(...toWorld(e.clientX, e.clientY));
      if (Math.hypot(e.clientX - ptr.down.x, e.clientY - ptr.down.y) > (e.pointerType === 'mouse' ? 5 : 10)) ptr.dragging = true;
      return;
    }
    const dxs = e.clientX - prev.x, dys = e.clientY - prev.y;
    prev.x = e.clientX; prev.y = e.clientY;
    if (ptr.down?.lens && ptr.pointers.size === 1) {
      if (Math.hypot(e.clientX - ptr.down.x, e.clientY - ptr.down.y) > 10) ptr.dragging = true;
      if (ptr.dragging) lensAt = toWorld(ptr.down.lens.x + e.clientX - ptr.down.x, ptr.down.lens.y + e.clientY - ptr.down.y);
      return;
    }
    if (ptr.pinch && ptr.pointers.size === 2) {
      const [a, b] = [...ptr.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const p = ppu();
      if (!state.follow) { cam.x -= ((cx - ptr.pinch.cx) * dpr) / p; cam.y -= ((cy - ptr.pinch.cy) * dpr) / p; }
      zoomAt(d / Math.max(1, ptr.pinch.d), cx, cy);
      zoomedByHand();
      ptr.pinch = { d, cx, cy };
      return;
    }
    if (ptr.down && !ptr.dragging && Math.hypot(e.clientX - ptr.down.x, e.clientY - ptr.down.y) > (e.pointerType === 'mouse' ? 5 : 10)) { ptr.dragging = true; takeOver(); }
    if (ptr.dragging) {
      const p = ppu();
      cam.x -= (dxs * dpr) / p; cam.y -= (dys * dpr) / p;
      endRide();
      if (state.follow) { state.follow = false; dirty = true; }
      canvas.classList.add('grabbing');
    }
  });
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hover.on = false; });
  const up = (e) => {
    ptr.pointers.delete(e.pointerId);
    if (ptr.pointers.size < 2) ptr.pinch = null;
    if (ptr.pointers.size === 0) {
      if (ptr.down?.steer) {
        ride.at = null;
        // (a quick click that did not steer anywhere: selecting another cell gets off; the ridden body's own, nothing)
        if (!ptr.down.moved && e.type === 'pointerup' && performance.now() - ptr.down.t < 280) selectAt(e.clientX, e.clientY, undefined, undefined, true);
      }
      if (ptr.down?.pip) pipetteUp();
      else if (ptr.down?.apply) {
        if (!ptr.dragging && e.type === 'pointerup') tapTool(e.clientX, e.clientY);
        hand.up(eng.simTime);
      } else if (ptr.down && !ptr.down.steer && !ptr.dragging && e.type === 'pointerup' && !inHand()) {
        const L = ptr.down.loupe;
        // (with the loupe on a touch screen, the lens goes where the tap was, centered on what it picked)
        const setLens = hand.tool === 'loupe' && e.pointerType !== 'mouse';
        if (L && Math.hypot(e.clientX - L.sx, e.clientY - L.sy) < L.R) {
          const wx = L.cx + (e.clientX - L.sx) / L.cssPPU, wy = L.cy + (e.clientY - L.sy) / L.cssPPU;
          selectAt(e.clientX, e.clientY, L.cssPPU, [wx, wy]);
          if (setLens) lensAt = [wx, wy];
        } else {
          selectAt(e.clientX, e.clientY);
          if (setLens) lensAt = toWorld(e.clientX, e.clientY);
        }
        if (setLens) hear('lens', { pan: panAt(e.clientX) });
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
    if (e.shiftKey && inHand()) { setReach(hand.reach * f); return; }
    if (e.shiftKey && loupeGeom()) { state.loupeMag = clamp(state.loupeMag * f, 1.5, 20); return; }
    zoomAt(f, e.clientX, e.clientY);
    zoomedByHand();
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
    // the species card open (a modal dialog): Esc closes it before anything else, and no other shortcut acts behind it
    if (cards.isOpen()) { if (k === 'Escape') { e.preventDefault(); cards.close(); } return; }
    let handled = true;
    // riding, WASD and the arrows steer (whatever they do otherwise); a living cell selected, they start a ride
    if (isRideKey(e.code) && (ride.on || (sel && !sel.lost && sel.particle.kind >= FIRST_LIFE && state.phase === 'running'))) {
      if (!ride.on) toggleRide(true);
      ride.keys.add(e.code);
    }
    else if (k === 'R' && e.shiftKey) {
      if (state.phase !== 'running') return;
      const now = performance.now();
      if (now - state.confirmReset < 2500) { state.confirmReset = 0; seedWorld(eng.count); sound.overture(); flash(tr('flash.new-world', 'A new world begins')); }
      else { state.confirmReset = now; flash(tr('flash.reset-confirm', 'Press Shift+R again to discard this world')); }
    }
    else if (k === 't' || k === 'T') { trailIdx = (trailIdx + 1) % trailLevels.length; eng.settings.trails = trailLevels[trailIdx]; flash(tr('flash.trails', 'Trails {level, select, 0 {off} 1 {short} 2 {long} other {exposure}}', { level: trailIdx })); persist(); view.render(); }
    else if (k === 'l' || k === 'L') { eng.settings.links = !eng.settings.links; flash(eng.settings.links ? tr('flash.bonds-on', 'Bonds shown') : tr('flash.bonds-off', 'Bonds hidden')); persist(); view.render(); }
    else if (k === 'n' || k === 'N') { eng.settings.nodes = !eng.settings.nodes; flash(eng.settings.nodes ? tr('flash.particles-on', 'Particles on') : tr('flash.particles-off', 'Particles off')); persist(); view.render(); }
    else if (k === 'y' || k === 'Y') { eng.settings.bloom = eng.settings.bloom > 0 ? 0 : 0.012; flash(eng.settings.bloom ? tr('flash.bloom-on', 'Bloom on') : tr('flash.bloom-off', 'Bloom off')); persist(); view.render(); }
    else if (k === 'b' || k === 'B') bench.toggle();
    else if (/^[0-8]$/.test(k)) {
      // a digit takes up its tool (0: none), or puts down the one in hand; held down past a moment, a tool taken up
      // is only for as long as it is held
      if (!e.repeat) { const id = TOOLS[+k].id; quasi = id !== hand.tool && id !== 'none' ? { key: k, prev: hand.tool, at: performance.now() } : null; pickTool(id); }
    }
    else if (k === 'o' || k === 'O') { eng.settings.optics = eng.settings.optics > 0 ? 0 : 1; flash(eng.settings.optics ? tr('flash.optics-on', 'Microscope optics on') : tr('flash.optics-off', 'Microscope optics off')); persist(); view.render(); }
    else if (k === 'g' || k === 'G') { eng.settings.tide = eng.settings.tide ? 0 : 1; flash(eng.settings.tide ? tr('flash.light-map-on', 'Light map') : tr('flash.light-map-off', 'Light map off')); mapsChanged(); }
    else if ((k === 'e' || k === 'E') && K.heat) { eng.settings.heat = (eng.settings.heat + 1) % 3; flash([tr('flash.heat-off', 'Heat map off'), tr('flash.heat-shimmer', 'Heat shimmer'), tr('flash.heat-camera', 'Thermal camera')][eng.settings.heat]); mapsChanged(); }
    else if (k === 'h' || k === 'H') { eng.settings.bands = eng.settings.bands ? 0 : 1; flash(eng.settings.bands ? tr('flash.tide-map-on', 'Tide map') : tr('flash.tide-map-off', 'Tide map off')); mapsChanged(); }
    else if (k === 'c' || k === 'C') { state.currents = !state.currents; flash(state.currents ? tr('flash.currents-on', 'Currents shown') : tr('flash.currents-off', 'Currents hidden')); persist(); view.render(); }
    else if (k === 'v' || k === 'V') view.toggle();
    else if (k === 'k' || k === 'K') { closeMenus(); lab.toggle(); }
    else if ((k === '[' || k === ']') && inHand()) setReach(reachStep(hand.reach, k === ']' ? 1 : -1), true);
    // i18n: the loupe's magnification, {n} times
    else if (k === '[') { state.loupeMag = clamp(state.loupeMag / 1.25, 1.5, 20); flash(tr('flash.loupe', 'Loupe ×{n}', { n: state.loupeMag.toFixed(1) })); }
    else if (k === ']') { state.loupeMag = clamp(state.loupeMag * 1.25, 1.5, 20); flash(tr('flash.loupe', 'Loupe ×{n}', { n: state.loupeMag.toFixed(1) })); }
    else if ((k === 'Enter' || k === 'Tab') && sel && !ride.on && sel.rideEnded && sel.memory) rideRelative();
    else if (k === 'Enter' && sel) toggleRide();
    else if (k === 'Tab' && ride.on) hopRide();
    else if (k === 'p' || k === 'P') playAuto();
    else if ((k === 'x' || k === 'X') && director.active) nextScene();
    else if (k === 'r' || k === 'R') filmAct();
    else if (k === 'm' || k === 'M') toggleSound();
    else if (k === '-' || k === '_') nudgeVolume(-0.1);
    else if (k === '=' || k === '+') nudgeVolume(0.1);
    else if (k === 'u' || k === 'U') setInterface(!state.ui);
    else if (k === 'Escape') {
      if (!state.ui) setInterface(true);
      else if (ladder.isOpen()) ladder.toggle(false);
      else if (inHand()) pickTool('none');
      else if (ride.on) toggleRide(false);
      else if (!$('help').hidden) toggleHelp(false);
      else if (view.isOpen()) view.toggle(false);
      else if (bench.isOpen()) bench.toggle(false);
      else if (sel || spView != null) deselect();
      else if (focus.key) clearFocus();
      else if (mapsOn().length) clearMaps();
      else if (lab.back()) {} // the Lineage view back the way it came, before the Lab goes back to its census
      else if (lab.isWide() && !phone()) lab.narrow();
      else if (lab.isOpen() && phone()) lab.close();
      else handled = false;
    }
    else if (k === 'Backspace' && lab.back()) {}
    else if (k === ' ') togglePause();
    else if (k === ',') stepSpeed(-1);
    else if (k === '.') stepSpeed(1);
    else if (k === '/' || k === '<') setSpeed(1);
    else if (k === '>') setSpeed(Infinity);
    else if (k === '?') toggleHelp();
    else if (k === 'i' || k === 'I') { state.hud = !state.hud; $('hud').classList.toggle('off', !state.hud); document.body.classList.toggle('hud-off', !state.hud); flash(state.hud ? tr('flash.readouts-on', 'Readouts shown') : tr('flash.readouts-off', 'Readouts hidden')); }
    else if (k === 'f' || k === 'F') toggleFullscreen();
    else if (k === 'z' || k === 'Z') { takeOver(); cam.zoomTarget = 1; cam.anchor = null; zoomedByHand(); }
    else handled = false;
    if (handled) { e.preventDefault(); hideIntro(); }
  });
  // a tool's key held down past a moment (a quasimode): let go, the tool that was in hand before
  let quasi = null;
  addEventListener('keyup', (e) => {
    ride.keys.delete(e.code);
    if (!quasi || e.key !== quasi.key) return;
    if (performance.now() - quasi.at > 450 && quasi.prev !== hand.tool) pickTool(quasi.prev);
    quasi = null;
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
  // The ladder's stops, the speeds on offer: everything up to ×1, faster ones the GPU can sustain (within
  // GPU_BUDGET, in the coarsest steps), then Fast and Max.
  let speedCap = Infinity, speedCapAt = 0;
  const speedStops = () => [...SPEEDS.filter((v) => v <= 1 || (v !== Infinity && v <= speedCap)), 'fast', Infinity];
  const speedStop = () => (state.speed === Infinity && fastMode ? 'fast' : state.speed);
  // the speed chip opens the ladder of every speed on offer
  const ladder = createLadder({ chip: $('t-speed'), el: $('ladder'), choices: speedStops, current: speedStop, fmt: fmtStop, pick: setSpeed, real: () => setSpeed(1), coarse: coarseFrom });
  // one notch along the speeds on offer
  const stepSpeed = (d) => setSpeed(ladder.along(speedStop(), d));
  $('t-slower').addEventListener('click', () => stepSpeed(-1));
  $('t-faster').addEventListener('click', () => stepSpeed(1));
  // Slower and Faster beside the speed chip wherever the dock has room for them (its width less all it holds, measured
  // without them, so nothing is squeezed); always on a phone
  const dock = $('dock');
  function fitSteps() {
    dock.classList.remove('roomy');
    const cs = getComputedStyle(dock), kids = [...dock.children].filter((e) => e.offsetParent);
    const used = kids.reduce((m, e) => m + e.getBoundingClientRect().width, 0) + (kids.length - 1) * (parseFloat(cs.columnGap) || 0);
    // (the two take about 106 px with their gaps; a little more, so what they push along keeps some air)
    dock.classList.toggle('roomy', dock.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - used >= 130);
  }
  new ResizeObserver(fitSteps).observe(dock);
  function renderTime() {
    const s = state.speed;
    const play = $('t-play');
    $('t-play-i').setAttribute('href', `#i-${state.paused ? 'play' : 'pause'}`);
    // (on a phone its label says Paused, lit, and the speed chip beside it keeps showing the speed)
    $('t-play-l').textContent = state.paused ? tr('dock.play-label-paused', 'Paused') : tr('dock.play-label', 'Pause');
    play.classList.toggle('paused', state.paused);
    play.setAttribute('aria-label', state.paused ? tr('dock.t-play.aria-resume', 'Resume') : tr('dock.t-play.aria', 'Pause'));
    play.dataset.hint = state.paused ? tr('dock.t-play.hint-resume', 'Resume · Space') : tr('dock.t-play.hint', 'Pause · Space');
    setLive($('t-speed-v'), state.paused && !phone() ? tr('dock.speed-paused', 'Paused') : fmtStop(speedStop()));
    // i18n: {speed} is a stop on the speed ladder (speed.times, speed.fast, speed.max)
    $('t-speed').setAttribute('aria-label', tr('dock.speed.aria', 'Speed {speed}', { speed: fmtStop(speedStop()) }));
    $('t-speed').classList.toggle('fast', s > 1 && s !== Infinity);
    $('t-speed').classList.toggle('max', s === Infinity);
    $('t-slower').disabled = s <= SPEEDS[0];
    $('t-faster').disabled = speedStop() === Infinity;
    ladder.render();
  }
  function applySpeed(v, fast = false) {
    state.speed = v;
    fastMode = v === Infinity && fast;
    perf.ticksAt = 0;
    perf.stepCredit = 0;
    clock.owed = 0;
    perf.frameDt.length = 0;
    perf.lastAdjust = performance.now();
    renderTime();
  }
  // a speed chosen, or a stop (it ends the warm-up)
  function setSpeed(v, quiet = false) {
    endWarm();
    if (state.paused) state.paused = false;
    applySpeed(v === 'fast' ? Infinity : v, v === 'fast');
    // i18n: {speed} is a stop on the speed ladder (speed.times, speed.fast, speed.max)
    if (!quiet) flash(tr('flash.speed', 'Speed {speed}', { speed: fmtStop(speedStop()) }));
  }
  // The warm-up (WARM_UNTIL): due once a new world is seeded, begun when it is first seen (the intro gone).
  let warmDue = false;
  const warmEl = $('warm');
  function updateWarm() {
    if (state.phase !== 'running') return;
    if (warmDue && introHidden) {
      warmDue = false;
      if (eng.simTime < WARM_UNTIL) { state.warm = true; applySpeed(Infinity, true); warmEl.hidden = false; sound.warm(true); }
    }
    if (!state.warm) return;
    if (eng.simTime >= WARM_UNTIL) { endWarm(); applySpeed(1); flash(tr('flash.real-time', 'Real time')); return; }
    setText('warm-t', `${fmtClock(eng.simTime)} / ${fmtClock(WARM_UNTIL)}`);
  }
  // (a speed chosen before the warm-up begins cancels it too)
  function endWarm() { if (state.warm) sound.warm(false); warmDue = false; state.warm = false; warmEl.hidden = true; }
  $('warm-end').addEventListener('click', () => setSpeed(1));
  // A step's GPU cost (a coarse step costs about what a 1/60 s one does: one scan of the neighbors)
  const stepCost = () => perf.simS || perf.stepMs;
  // what fast speeds plan a step at: no less than most of the dearest step lately, so a swing up in a step's cost never
  // packs a frame with more steps than its budget
  const fastCost = () => Math.max(stepCost() || 0, 0.8 * (perf.stepPeak || 0)) || stepCost();
  // GPU ms a second of real time takes at speed s in steps of m ticks: the steps, plus drawing the
  // world every display frame, or (held) about every MAX_FRAME_MS, carrying the image between.
  function gpuLoad(s, m, held = true) {
    const fps = 1000 / frameTarget();
    const draw = held ? (1000 / MAX_FRAME_MS) * perf.renderR + fps * (perf.presentR || 0.3) : fps * perf.renderR;
    return ((s * 60) / m) * stepCost() + draw;
  }
  // GPU time a second may take when running fast, with room for what the estimate misses
  const GPU_BUDGET = 800;
  // What the GPU can sustain: the speed that fills the budget in the coarsest steps.
  function sustainable() {
    const S = stepCost();
    if (!S) return Infinity;
    return (Math.max(0, GPU_BUDGET - gpuLoad(0, MAX_TICKS)) / S) * MAX_TICKS / 60;
  }
  // the ways a fast speed can be run, as updateTicks tries them
  const WAYS = [[1, false]];
  // (coarse steps with the world drawn every frame, in between steps (LERP_WGSL), before holding it)
  for (let m = 2; m <= MAX_TICKS; m++) WAYS.push([m, false]);
  for (let m = 1; m <= MAX_TICKS; m++) WAYS.push([m, true]);
  // the slowest speed on offer that the first way to fit (updateTicks' choice, short of its hysteresis) runs in coarse
  // steps: the ladder marks it; none until a step's cost is known
  function coarseFrom() {
    if (!stepCost()) return null;
    return speedStops().find((s) => typeof s === 'number' && s > 1 && s !== Infinity && (WAYS.find(([m, h]) => gpuLoad(s, m, h) <= GPU_BUDGET) || WAYS.at(-1))[0] > 1) ?? null;
  }
  // How the chosen speed is run, cheapest first: 1/60 s steps with the world drawn every display
  // frame; the same with it drawn only about every MAX_FRAME_MS (held); then the shortest coarse step the
  // GPU fits (Max: the coarsest). Re-judged each second; a cheaper way is taken back only with room to spare.
  function updateTicks(now) {
    if (now - perf.ticksAt < 1000) return;
    perf.ticksAt = now;
    const s = state.speed;
    if (!(s > 1) || !stepCost()) { perf.ticks = 1; perf.held = false; return; }
    if (s === Infinity) {
      // the coarsest step that still fits MAX_STEP_MS of the GPU (a step of m ticks costs about 1 + 0.45 (m - 1) of a
      // 1/60 s one): a slow phone's 6-tick steps make frames like those its driver judges a hung GPU
      const S1 = fastCost() / (1 + 0.45 * (perf.ticks - 1));
      let m = MAX_TICKS;
      while (m > 1 && S1 * (1 + 0.45 * (m - 1)) > MAX_STEP_MS) m--;
      perf.ticks = m; perf.held = true; return;
    }
    const ways = WAYS;
    const rank = ways.findIndex(([m, h]) => m === perf.ticks && h === perf.held);
    let i = ways.findIndex(([m, h]) => gpuLoad(s, m, h) <= GPU_BUDGET);
    if (i < 0) i = ways.length - 1;
    // a cheaper way is taken back only with room to spare: the first that leaves it (not just the cheapest,
    // or from held 6-tick steps nothing between them and 1/60 s steps was ever tried)
    // (and only while the way it has still fits: one that no longer does is left at once)
    if (i < rank && gpuLoad(s, ...ways[i]) > GPU_BUDGET * 0.8 && gpuLoad(s, ...ways[rank]) <= GPU_BUDGET) { const j = ways.findIndex((w) => gpuLoad(s, ...w) <= GPU_BUDGET * 0.8); i = j >= 0 && j < rank ? j : rank; }
    [perf.ticks, perf.held] = ways[i];
  }
  // Re-judged every few seconds. The cap moves only when the estimate leaves a band around it, so
  // the choices don't flicker; a chosen speed that no longer fits becomes Max.
  function updateSpeedCap(now) {
    if (state.phase !== 'running' || now - speedCapAt < 2000) return;
    speedCapAt = now;
    const m = sustainable();
    if (!Number.isFinite(m)) return;
    if (!(m > speedCap * 0.87 && m < speedCap * 1.15)) speedCap = m;
    if (state.speed > 1 && state.speed !== Infinity && state.speed > speedCap) { applySpeed(Infinity); flash(tr('flash.speed', 'Speed {speed}', { speed: tr('speed.max', 'Max') })); }
    renderTime();
  }
  function togglePause() {
    state.paused = !state.paused;
    flash(state.paused ? tr('flash.paused', 'Paused') : tr('flash.running', 'Running'));
    renderTime();
  }
  $('t-play').addEventListener('click', togglePause);
  renderTime();
  matchMedia('(max-width: 720px)').addEventListener('change', renderTime);

  let introHidden = false;
  function hideIntro() { if (introHidden || state.phase !== 'running') return; introHidden = true; $('intro').classList.add('gone'); setTimeout(stopLoader, 1300); document.body.classList.add('live'); }
  // ------------------------------------------------------------ the menu
  // The intro is the main menu. Begin starts the new world, as a click or a key anywhere else does; under it,
  // for those who know Tidemote, the new world's particle count and the saved worlds, each opening a framed
  // panel (opened, the reticle folds away). They are there once the shaders have compiled, while the GPU is
  // measured: a choice then cuts the measuring short. A count chosen seeds a new world at once (Begin then
  // starts it) and is kept as Settings → Performance keeps it; a saved world chosen is loaded and begins
  // (its click is the gesture the soundtrack waits for). The world is held still until it begins, so its
  // first moments are seen and heard. In an automated browser (navigator.webdriver: the headless tools) the
  // intro goes by itself as it used to, unless the soundtrack waits on a key.
  const menu = (() => {
    const el = $('menu'), panel = $('menu-panel'), tabN = $('menu-n'), tabW = $('menu-w');
    let open = null, saves = null, busy = '', err = '', go = false, startAfter = false;
    let whenStarted = null;
    const startedP = new Promise((r) => { whenStarted = r; });
    const P = state.perf;
    const countText = () => (P.particles ? kfmt(P.particles) : measuredN ? kfmt(measuredN) : tr('menu.auto', 'Auto'));
    const listed = () => (saves || []).filter((m) => m.downloading == null);
    // what each count means, as hints (hover, keyboard focus); a count well past what this GPU drew smoothly
    // is also marked, for touch screens, which show no hint on a button
    const heavy = (n) => measuredN && n > measuredN * 1.4;
    function nPanel() {
      const off = busy ? ' disabled' : '';
      const sizes = PARTICLE_SIZES.filter((n) => n <= maxParticles());
      const chip = (v, label, on, hint, cls = '') => `<button type="button" class="chip${cls}" data-n="${v}" aria-pressed="${on}" data-hint="${esc(hint)}"${off}>${label}</button>`;
      // i18n: the menu's particle counts, their hints (two lines): Auto, {n} the count measured; a count {n}, past what
      // the GPU drew smoothly ({measured}, short: 64k) or not
      const autoHint = measuredN ? tr('menu.auto.hint-measured', 'As many as this GPU draws smoothly\nMeasured just now: {n, number}', { n: measuredN }) : tr('menu.auto.hint', 'As many as this GPU draws smoothly\nMeasured as the world starts');
      const hint = (n) => (heavy(n) ? tr('menu.count.hint-heavy', '{n, plural, other {# particles}}\nMore than this GPU drew smoothly ({measured}): a richer world, in slower frames', { n, measured: kfmt(measuredN) }) : tr('menu.count.hint', '{n, plural, other {# particles}}\nKept for later visits', { n }));
      return `<div class="menu-h"><span>${tr('menu.new-world', 'The new world')}</span><b>${busy === 'n' ? tr('menu.seeding', 'Seeding') : fmt(eng.count)}</b></div>`
        // i18n: the Auto count, with the count measured ({n}, short: 64k)
        + `<div class="menu-chips" role="group" aria-label="${tr('menu.particles.aria', 'Particles')}">${chip('auto', measuredN ? tr('menu.auto-measured', 'Auto <b>{n}</b>', { n: kfmt(measuredN) }) : tr('menu.auto', 'Auto'), !P.particles, autoHint, ' auto')}`
        + sizes.map((n) => chip(n, kfmt(n), P.particles === n, hint(n), heavy(n) ? ' heavy' : '')).join('') + '</div>'
        + (err ? `<p class="menu-note"><em>${esc(err)}</em></p>` : '');
    }
    function row(m) {
      const sw = [0, 1, 2, 3].map((i) => `<i${m.cols?.[i] != null ? ` style="background:${cssCol(m.cols[i])}"` : ''}></i>`).join('');
      const can = openable(m.version);
      const line = can !== 'ok' ? tr('worlds.cannot-open', '<em>{why, select, newer {Needs a newer Tidemote} other {From an older Tidemote}}</em> · {when}', { why: can, when: when(m.savedAt) })
        : tr('worlds.row', '{age} · {count} · {species, plural, other {{species} species}} · {when}', { age: fmtDur(m.simTime), count: kfmt(m.count), species: +m.thriving || 0, when: when(m.savedAt) });
      return `<button type="button" class="w-row" data-w="${esc(m.id)}"${can !== 'ok' || busy ? ' disabled' : ''}${can !== 'ok' ? ` aria-description="${esc(WHY_NOT[can])}"` : ''}>`
        + `<span class="w-sw" aria-hidden="true">${sw}</span><span class="w-txt"><b>${esc(m.name)}</b><span>${line}</span></span>`
        + `<span class="w-go">${busy === `w:${m.id}` ? tr('menu.opening', 'Opening') : can === 'ok' ? tr('menu.open', 'Open') : ''}</span></button>`;
    }
    function wPanel() {
      const ws = listed();
      const list = saves == null ? `<p class="menu-note">${tr('worlds.reading', 'Reading the saved worlds…')}</p>`
        : ws.length ? `<div class="menu-list">${ws.map(row).join('')}</div>`
        : `<p class="menu-note">${tr('menu.no-saves', 'No saved worlds yet. Save one from Settings → Worlds.')}</p>`;
      return `<div class="menu-h"><span>${tr('menu.open-saved', 'Open a saved world')}</span><b>${ws.length || ''}</b></div>${list}`
        + (err ? `<p class="menu-note"><em>${esc(err)}</em></p>` : '')
        + `<div class="menu-foot"><span class="lbl">${desk ? tr('menu.kept-computer', 'On this computer') : tr('menu.kept-browser', 'In this browser')}</span><button type="button" class="btn" data-m="file" data-hint="${tr('menu.file.hint', 'Open a .tidemote file\nSaved from Settings → Worlds, on any device')}"${busy ? ' disabled' : ''}>${busy === 'file' ? tr('menu.opening', 'Opening') : tr('menu.file', 'Open a file')}</button></div>`;
    }
    function render() {
      $('menu-n-v').textContent = countText();
      $('menu-w-v').textContent = saves == null ? '' : String(listed().length);
      tabN.setAttribute('aria-expanded', String(open === 'n'));
      tabW.setAttribute('aria-expanded', String(open === 'w'));
      $('intro').classList.toggle('menu-open', !!open);
      panel.hidden = !open;
      if (!open) return;
      // (the control under the pointer is replaced: focus kept on the same one)
      const at = document.activeElement && panel.contains(document.activeElement) ? document.activeElement.dataset : null;
      panel.innerHTML = open === 'n' ? nPanel() : wPanel();
      if (at) panel.querySelector(at.n != null ? `[data-n="${at.n}"]` : at.w != null ? `[data-w="${CSS.escape(at.w)}"]` : at.m ? `[data-m="${at.m}"]` : 'x')?.focus({ preventScroll: true });
    }
    function toggle(which) {
      open = open === which ? null : which;
      err = '';
      if (open === 'w') refresh();
      render();
    }
    async function refresh() {
      try { saves = await worldStore.list(); } catch { saves = []; }
      render();
    }
    // a choice: the measuring cut short, then (once the world first runs) fn, the panel showing what is under way
    async function take(what, fn) {
      if (busy || introHidden) return;
      busy = what; err = ''; render();
      cutNow();
      await startedP;
      try { await fn(); } catch (e) { console.error('[tidemote] the menu:', e); err = String(e.message || e); startAfter = false; }
      busy = ''; render();
      // Begin pressed while a count was being seeded
      if (startAfter) start();
    }
    const pickN = (v) => take('n', async () => {
      P.particles = v === 'auto' ? null : +v;
      persist();
      const want = v === 'auto' ? measuredN : Math.min(+v, maxParticles());
      if (want === eng.count && eng.simTime < 1) return;
      state.phase = 'calibrating';
      // Auto, never measured this session (a count was kept, or the measuring was cut short): measured now
      if (want == null) { $('intro').classList.remove('ready'); await calibrate(); $('intro').classList.add('ready'); }
      else { const n = await allocDown(want); seedWorld(n); state.busy = false; calStep(tr('intro.particles', '{n, plural, other {# particles}}', { n }), 1); }
      state.phase = 'running';
      renderWorld();
      sound.overture();
    });
    async function openIt(w) {
      // i18n: the intro's loading line: a saved world ({name}) opening, then open with {n} particles
      calStep(tr('intro.opening', 'Opening {name}', { name: w.meta.name }), 1);
      if (!(await loadWorld(w))) return;
      calStep(tr('intro.opened', '{name} · {n, plural, other {# particles}}', { name: w.meta.name, n: eng.count }), 1);
      start();
    }
    const pickW = (id) => take(`w:${id}`, async () => openIt(await openWorld(await worldStore.get(id))));
    // a .tidemote file (downloaded from Settings → Worlds on any device): kept with the saves, then opened
    $('menu-file').addEventListener('change', (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      take('file', async () => {
        const bytes = await f.arrayBuffer();
        let w;
        // i18n: {file} the file's name, {why} what went wrong
        try { w = await openWorld(bytes); } catch (x) { throw new Error(tr('flash.open-failed', 'Could not open {file}: {why}', { file: f.name, why: String(x.message || x) })); }
        await worldStore.put({ ...w.meta, bytes: bytes.byteLength }, bytes);
        await openIt(w);
      });
    });
    tabN.addEventListener('click', () => toggle('n'));
    tabW.addEventListener('click', () => toggle('w'));
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.n != null) pickN(b.dataset.n);
      else if (b.dataset.w != null) pickW(b.dataset.w);
      else if (b.dataset.m === 'file') $('menu-file').click();
    });
    // the world begins (once it runs: a count being seeded holds it)
    function start() {
      startAfter = false;
      if (!go) return;
      removeEventListener('pointerdown', onAny, true); removeEventListener('keydown', onAny, true);
      go = false;
      sound.unlock();
      state.paused = false; renderTime();
      $('begin').blur();
      const hide = () => (state.phase === 'running' ? hideIntro() : setTimeout(hide, 150));
      hide();
    }
    const MODS = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'ContextMenu']); // i18n-ignore (key names)
    // A click anywhere but the menu begins (a click outside an open panel closes it first); so does a key,
    // but those a menu control uses (Enter, Space, arrows), Escape (closes the panel) and Tab. While the
    // menu waits, no key reaches the page's shortcuts (one would hide the intro with the world held).
    function onAny(e) {
      if (!$('nogpu').hidden || introHidden) return;
      if (e.type === 'pointerdown') {
        if (e.target instanceof Node && el.contains(e.target)) return;
        if (open && !$('begin').contains(e.target)) { toggle(null); return; }
      } else {
        e.stopPropagation();
        if (e.key === 'Escape') {
          if (!open) return;
          e.preventDefault();
          const inside = panel.contains(document.activeElement);
          toggle(null);
          if (inside) tabN.focus({ preventScroll: true }); // (a keyboard user's focus, not lost with the panel)
          return;
        }
        if (e.target instanceof Node && el.contains(e.target) && (e.key === 'Enter' || e.key === ' ' || /^Arrow/.test(e.key))) return;
        if (!navigator.webdriver && MODS.has(e.key)) return;
        e.preventDefault(); // the key only starts the world
      }
      if (busy) { startAfter = true; return; }
      start();
    }
    el.hidden = false;
    refresh();
    render();
    return {
      // the world runs for the first time (calibrate done): hold it on the menu, or let it go
      ready() {
        whenStarted();
        sound.overture();
        render();
        if (navigator.webdriver && !(sound.on && !sound.playing)) {
          const later = () => (state.phase === 'running' && !busy ? hideIntro() : setTimeout(later, 250));
          setTimeout(later, 3500);
          return;
        }
        state.paused = true; renderTime();
        $('intro').classList.add('ask');
        go = true;
        if (!busy) $('begin').focus({ preventScroll: true });
        addEventListener('pointerdown', onAny, true); addEventListener('keydown', onAny, true);
      },
    };
  })();

  // ------------------------------------------------------------ rail
  const segs = $('light-seg');
  segs.innerHTML = '<i></i>'.repeat(10);
  // the water gauge: a thermometer of ten segments from the climate's coldest (4°) to its warmest (28°)
  // the temperature gauge: a thermometer whose tube fills with ten bars from the climate's coldest
  // (4°) to its warmest (28°), each lit in its own temperature's color, the bulb in the current one;
  // on phones a small upright thermometer whose level rises
  const THERMO = ['#3d6fd6', '#3f86d8', '#3fa0d0', '#41b7c2', '#62c6a8', '#9bcd86', '#d2c865', '#f0b04a', '#ff8a3a', '#ff5f3a'];
  // a big bulb joined to a slim tube, as a real thermometer is
  $('thermo').innerHTML = `<rect class="tube" x="11" y="5.5" width="56" height="7" rx="3.5"/><circle class="bulb-o" cx="8" cy="9" r="7.5"/>${THERMO.map((c, k) => `<rect class="bar" x="${17.5 + k * 4.8}" y="7" width="3" height="4" style="--c:${c}"/>`).join('')}<circle class="bulb" cx="8" cy="9" r="5"/>`;
  $('thermo-i').innerHTML = '<rect class="tube" x="4" y="1" width="4" height="12" rx="2"/><circle class="bulb-o" cx="6" cy="15" r="4.2"/><rect class="lvl" x="5" y="2" width="2" height="12"/><circle class="bulb" cx="6" cy="15" r="2.8"/>';
  const heatBars = [...$('thermo').querySelectorAll('.bar')], heatBulbs = [...document.querySelectorAll('#g-heat .bulb')], heatLvl = $('thermo-i').querySelector('.lvl');
  $('g-heat').hidden = !K.heat;
  const wave = $('tide-wave');
  wave.querySelector('.wave').setAttribute('d', Array.from({ length: 31 }, (_, i) => `${i ? 'L' : 'M'}${i * 2},${(8 - 6 * Math.sin((i / 30) * TAU)).toFixed(2)}`).join(''));
  const eraTide = $('era-tide');
  eraTide.querySelector('path').setAttribute('d', Array.from({ length: 61 }, (_, i) => `${i ? 'L' : 'M'}${i},${(3 - 2.6 * Math.sin((i / 60) * TAU)).toFixed(2)}`).join(''));
  // Why the water stands off the era's usual temperature (more than half a degree), or '' if it doesn't: an era's
  // heat wave or cold snap, and an event's own warmth or chill (a storm's lingers a few minutes after its rain).
  function heatCause() {
    const d = eng.excursion;
    if (!(Math.abs(d) > 0.5)) return '';
    const ex = excursionAt(climate.excursion, eng.simTime), ev = d - ex, causes = [];
    // i18n: why the water is warmer or colder than the era's usual (the temperature gauge's hint; rail.heat.off)
    if (Math.abs(ex) > 0.5) causes.push(ex > 0 ? tr('rail.heat.cause-wave', 'a heat wave') : tr('rail.heat.cause-snap', 'a cold snap'));
    if (Math.abs(ev) > 0.5) {
      const e = climate.event;
      causes.push(e?.type === 'storm' ? tr('rail.heat.cause-storm', 'the storm’s cold rain, lingering a few minutes after it stops')
        : e?.type === 'drought' ? (ev > 0 ? tr('rail.heat.cause-drought', 'the drought’s warm, dry weather') : tr('rail.heat.cause-drought-rain', 'the cold rain that ends the drought'))
          : e?.type === 'frost' ? tr('rail.heat.cause-frost', 'the frost’s night, chilling the water toward freezing')
            : ev > 0 ? tr('rail.heat.cause-warmth', 'passing warmth') : tr('rail.heat.cause-chill', 'a passing chill'));
    }
    // i18n: two causes of rail.heat.off, both at once
    const because = causes.length > 1 ? tr('rail.heat.causes', '{a}, and {b}', { a: causes[0], b: causes[1] }) : causes.join('');
    // i18n: the temperature gauge's hint: the water is {deg} degrees (°C) warmer or colder than usual, {because} why
    return tr('rail.heat.off', 'The water is {deg}° {dir, select, warmer {warmer} other {colder}} than the era’s usual: {because}.', { deg: Math.abs(d).toFixed(1), dir: d > 0 ? 'warmer' : 'colder', because });
  }
  // The rail's event chip: the pool's event under way (with its turn), else the climate's heat wave or cold snap;
  // hidden when there is none (and on phones, by the stylesheet). Phases go by the climate's names but for these.
  // i18n: the rail's event chip: the turn the event has taken
  const PHASE_NAMES = { storm: tr('rail.event.phase-storm', 'raining'), thaw: tr('rail.event.phase-thaw', 'thawing'), after: tr('rail.event.phase-after', 'passing'), duckweed: '',
    drying: tr('rail.event.phase-drying', 'drying'), dry: tr('rail.event.phase-dry', 'dry'), rain: tr('rail.event.phase-rain', 'rain'), cooling: tr('rail.event.phase-cooling', 'cooling'),
    freezing: tr('rail.event.phase-freezing', 'freezing'), frozen: tr('rail.event.phase-frozen', 'frozen') };
  function updateEventChip() {
    const chip = $('g-event'), ev = climate.event, t = eng.simTime, x = climate.excursion;
    const ex = x && t >= x.t && t <= x.t + x.dur ? (x.dT > 0 ? 'hot' : 'cold') : '';
    let name = '', extra = '', icon = '', tip = '', tone = '', label = '';
    if (ev && t >= ev.t) {
      name = EVENT_NAME[ev.type]; icon = `#i-ev-${ev.type}`; tip = `ev${ev.type}`;
      label = PHASE_NAMES[climate.phase] ?? climate.phase ?? '';
      // i18n: beside the event, the climate's heat wave or cold snap at the same time
      if (ex) extra = tr('rail.event.and-excursion', ' · {ex, select, hot {heat wave} other {cold snap}}', { ex });
    } else if (ex) {
      tone = ex;
      name = ex === 'hot' ? tr('rail.event.heat-wave', 'Heat wave') : tr('rail.event.cold-snap', 'Cold snap'); icon = tone === 'hot' ? '#i-ev-heat' : '#i-ev-cold'; tip = 'heatwave';
    }
    chip.hidden = !name;
    if (!name) return;
    setText('event-v', name);
    setText('event-x', extra);
    setText('event-l', label || (tone ? tr('rail.event-l-climate', 'Climate') : tr('rail.event-l', 'Event')));
    const use = $('event-i');
    if (use.getAttribute('href') !== icon) use.setAttribute('href', icon);
    if (chip.dataset.tip !== tip) chip.dataset.tip = tip;
    chip.classList.toggle('hot', tone === 'hot');
    chip.classList.toggle('cold', tone === 'cold');
    // i18n: the event chip's label: {name} the event, {extra} rail.event.and-excursion or nothing, {phase} its turn
    chip.setAttribute('aria-label', label ? tr('rail.event.aria-phase', '{name}{extra}, {phase}', { name, extra, phase: label }) : tr('rail.event.aria', '{name}{extra}', { name, extra }));
  }
  let hudT = 0;
  // (compared with what was last written, not with what the element holds: a translator changes that)
  const setText = (id, v) => setLive($(id), v);
  function updateHud(now) {
    if (now - hudT < 250) return;
    hudT = now;
    setText('epoch', fmtClock(eng.simTime));
    // (the hand's acts told by the chronicler)
    if (hand.touched) handNews();
    setText('era', eraName(climate.name));
    // i18n: the era's number, two digits (01)
    setText('era-n', tr('rail.era-n-v', 'Era {n}', { n: String(climate.index).padStart(2, '0') }));
    const L = Math.round(eng.ambient * 100);
    // i18n: a gauge's reading, {n} percent
    setText('light-v', tr('rail.pct', '{n}%', { n: L }));
    [...segs.children].forEach((s, i) => s.classList.toggle('on', i < Math.round(eng.ambient * 20)));
    const ph = ((eng.simTime % 300) + 300) % 300 / 300;
    const dot = wave.querySelector('.dot');
    dot.setAttribute('cx', (ph * 60).toFixed(1));
    dot.setAttribute('cy', (8 - 6 * Math.sin(ph * TAU)).toFixed(2));
    eraTide.style.setProperty('--x', ph.toFixed(3)); eraTide.style.setProperty('--y', Math.sin(ph * TAU).toFixed(3));
    setText('tide-v', tr('rail.pct', '{n}%', { n: Math.round(eng.season * 100) }));
    $('g-tide').setAttribute('aria-label', tr('rail.tide.aria', 'Tide {n}%, {dir, select, rising {rising} other {ebbing}}', { n: Math.round(eng.season * 100), dir: seasonAt(eng.simTime + 5) >= seasonAt(eng.simTime) ? 'rising' : 'ebbing' }));
    $('g-light').setAttribute('aria-label', tr('rail.light.aria', 'Light {n}%', { n: L }));
    if (K.heat) {
      const T = eng.tbg, trend = climate.tempTo - eng.temp + (climate.excursion && eng.excursion ? Math.sign(climate.excursion.dT) * (eng.simTime < climate.excursion.t + climate.excursion.dur / 2 ? 1 : -1) : 0);
      const arrow = trend > 0.4 ? '↑' : trend < -0.4 ? '↓' : '';
      // i18n: the water's temperature (°C), with an arrow if it is rising or falling
      setText('heat-v', tr('rail.heat.v', '{t}°{arrow}', { t: Math.round(T), arrow }));
      const frac = clamp((T - 4) / 24, 0, 1), c = THERMO[Math.min(9, Math.floor(frac * 10))];
      heatBars.forEach((s, i) => s.classList.toggle('on', i < Math.round(frac * 10)));
      heatBulbs.forEach((b) => b.style.setProperty('fill', c));
      heatLvl.setAttribute('y', (2 + 10 * (1 - frac)).toFixed(2)); heatLvl.setAttribute('height', (10 * frac + 3).toFixed(2)); heatLvl.style.setProperty('fill', c);
      // the water pushed off the era's usual: the gauge flashes, hot or cold, and its hint says why
      const why = heatCause();
      const g = $('g-heat');
      g.classList.toggle('exc', !!why);
      g.classList.toggle('cold', eng.excursion < 0);
      if (why) g.dataset.live = why; else delete g.dataset.live;
      // i18n: the temperature gauge's label: {why} (rail.heat.off) when the water is off its usual, {t} its temperature (°C)
      const shown = Math.round(T), dir = arrow ? (arrow === '↑' ? 'up' : 'down') : 'none';
      g.setAttribute('aria-label', why ? tr('rail.heat.aria-off', '{why} Temperature {t}°{trend, select, up { and rising} down { and falling} other {}}', { why, t: shown, trend: dir }) : tr('rail.heat.aria', 'Temperature {t}°{trend, select, up { and rising} down { and falling} other {}}', { t: shown, trend: dir }));
    }
    updateEventChip();
    renderMaps();
    tips.check();
    // Max shows what it reaches; every other speed is exact
    setText('t-rate', state.speed > 1 && !state.paused ? tr('readout.rate', '×{n}', { n: perf.rate < 10 ? perf.rate.toFixed(1) : Math.round(perf.rate) }) : '');
    // fixed-width cells: a figure changing length never moves anything else in the dock
    setText('sys-n', fmt(eng.count));
    setText('sys-fps', perf.fps ? perf.fps.toFixed(0) : '–');
    setText('sys-ms', perf.gpu ? perf.gpu.toFixed(1) : '–');
    // i18n: the dock's render scale, {n} percent
    setText('sys-res', tr('dock.res-v', '{n}%', { n: Math.round(renderScale * 100) }));
    charts.check();
    view.readout();
  }

  // The frame rate aimed for, as the interval between submitted frames in ms: a whole number of the
  // display's frames (measured from requestAnimationFrame), so frames stay evenly spaced. The target
  // (60 by default) is met as closely as that allows: every second frame of a 144 Hz display (72 fps),
  // every third of a 175 Hz one (58). With Auto (60), while the device can't keep up frames take
  // perf.slow times longer (30, 20, 15 fps); a rate chosen is held. At real time steps grow to match
  // (stepTicks).
  const displayMs = () => perf.rafMs || 16.7;
  // (Fast speeds fill whatever time a frame has with steps: they keep the full rate.)
  const aimFps = () => (state.perf.fps === 'auto' ? 60 : state.perf.fps);
  // (rounded with a bias of 0.15 of a frame toward the faster rate: a display near 150 Hz sits on the edge between every
  // second frame and every third, 2.5, and the interval measured there, 6.6 to 7 ms with the load, flipped the target
  // between 75 fps and 50 and back; the adaptation, judging frames against a target that had just halved, found them
  // late and halved the frame rate itself, an RTX 4070 Ti at 36 fps with its GPU busy 4 ms a frame. 60, 120, 144,
  // 165, 175 and 240 Hz keep their rates; the bias only where the faster rate stays within 1.3 times the aim, so a 90 Hz
  // display keeps every second frame, 45 fps, rather than doubling its work)
  const displayFrames = () => {
    const x = (aimFps() ? 1000 / aimFps() : 0) / displayMs(), fast = Math.max(1, Math.round(x - 0.15));
    return !aimFps() || 1000 / (fast * displayMs()) <= 1.3 * aimFps() ? fast : Math.max(1, Math.round(x));
  };
  const frameEvery = () => displayFrames() * (state.speed > 1 ? 1 : perf.slow);
  const frameTarget = () => frameEvery() * displayMs();
  // At real time or slower a step covers up to one frame of the rate aimed for, in whole 1/60 s ticks
  // (at most MAX_TICKS): below about 45 fps the world takes coarse steps, which cost far less than the
  // 1/60 s steps they stand for and keep its ecology (docs/fast-forward.md), so a slow device keeps real time.
  const ticksFor = (ms) => clamp(Math.ceil(ms * 60 / 1000 - 0.1), 1, MAX_TICKS);
  const stepTicks = () => ticksFor(frameTarget());
  // render scales the auto resolution steps between (down to the floor chosen in Settings)
  const SCALES = [1, 0.85, 0.7, 0.6, 0.5, 0.42, 0.35, 0.25];
  function resetAdapt() {
    perf.frameDt.length = 0; perf.goodWindows = 0; perf.ceiling = 1; perf.ceilingUntil = 0; perf.lastAdjust = performance.now();
    perf.slow = 1; perf.why = ''; perf.raisedAt = 0; perf.hold = 0; perf.raised = null; perf.calmUntil = performance.now() + 2000;
    for (const k of Object.values(tune)) k.hold = 0;
  }
  // where the browser reports it (Compute Pressure), a device under serious pressure, hot or busy,
  // backs off before its frames start to miss
  let pressure = 'nominal';
  try { new PressureObserver((r) => { pressure = r.at(-1).state; }).observe('cpu').catch(() => {}); } catch { /* unsupported */ }
  const stressed = () => pressure === 'serious' || pressure === 'critical';
  // Adapt what a frame costs to what the device sustains, every two seconds at real time or slower,
  // paused too (running fast spends the frame on simulation on purpose). Behind (frames late, or with GPU
  // timestamps the GPU busy for nearly the whole interval, or the device under pressure): a lower
  // render scale, then a lower frame rate, or the frame rate first when the simulation is most of the
  // cost (resolution would barely help); with Auto pixel density, a film's scene drawn at more than 1 device
  // pixel per CSS pixel drops to 1 before any of them. With room again: the frame rate back first, then
  // the scale.
  function adaptQuality(now) {
    // fast speeds are never judged, so their frames are not kept (a day held at ×64 kept millions)
    if (state.phase !== 'running' || state.speed > 1) { perf.frameDt.length = 0; return; }
    if (now - perf.lastAdjust < 2000 || perf.frameDt.length < 6) return;
    // (a world's first seconds are its loading's: resetAdapt and seedWorld mark them)
    if (now < perf.calmUntil) { perf.frameDt.length = 0; perf.lastAdjust = now; return; }
    // Judged by the interval between submitted frames, not requestAnimationFrame's: while the GPU
    // lags, rAF keeps its cadence and the frames are skipped (inflight), so rAF alone looks smooth.
    // The mean, not the median: on a 60 Hz display each interval is 16.7 or 33.3 ms, and the median
    // stays at 16.7 until more than half the frames are missed.
    const m = perf.frameDt.reduce((a, b) => a + b, 0) / perf.frameDt.length;
    perf.frameDt.length = 0;
    perf.lastAdjust = now;
    const T = frameTarget(), auto = state.perf.scale === 'auto', autoD = state.perf.density === 'auto', autoF = state.perf.fps === 'auto';
    // while a film rolls, the canvas keeps at least the film's size (filmScale): its frames would be
    // stretched up otherwise, and a film's cost is mostly its encoder's, which pixels don't change
    const floor = auto ? Math.max(state.perf.floor, filmScale()) : renderScale;
    // without timestamps perf.gpu is the time from submit to done, which overstates the GPU's share
    const busy = perf.gpu > T * (hasTS ? 0.92 : 1);
    const behind = m > T * 1.125 || busy || stressed();
    // (paused, a frame is all drawing)
    const simBound = hasTS && !state.paused && perf.simS > 2 * perf.renderR;
    if (behind) {
      perf.why = stressed() ? 'under pressure' : busy ? 'GPU busy' : 'frames late'; // i18n-ignore (keys, shown through WHY_WORDS; the profile keeps them)
      perf.goodWindows = 0;
      // a level that just proved too slow is not tried again for a while, so the view doesn't keep
      // climbing back into the same stutter: 30 s, twice as long each time a climb back fails at once
      perf.hold = now - perf.raisedAt < 6000 ? Math.min(240000, (perf.hold || 30000) * 2) : 30000;
      perf.ceilingUntil = now + perf.hold;
      // The browser's own pace: it hands out frames at most every second vblank while this page's work, the
      // GPU's and the script's, fills under 30% of that (Firefox's vsync ran at 31 ms for minutes with 4 ms
      // frames). Fewer pixels can't bring its frames back, and cut the view to half resolution for nothing;
      // only a lower frame rate is tried (which also lightens the browser's compositing, if that's the cause).
      const pace = perf.rafMed > 1.8 * displayMs() && perf.gpu + perf.mainMs < 0.3 * perf.rafMed && !busy && !stressed();
      if (pace) perf.why = 'browser pace'; // i18n-ignore (a key, shown through WHY_WORDS)
      if (pace) { if (autoF && perf.slow < 4) { perf.slowCeiling = perf.slow; perf.slow = Math.min(4, perf.slow + 1); } }
      else if (autoD && density() > 1.01 && !(film.state === 'recording' && filmScale(1) > renderScale)) {
        filmDense = false; resizeDue = true;
      } else if (!(autoF && simBound && perf.slow < 4) && tuneSteps(true, now, T, floor, m > 2 * T ? 3 : m > 1.4 * T ? 2 : 1)) {
        // (the tuner's: the steps that save the most for the least lost to the eye, src/tuner.js; a climb just made
        // and failed at once is held)
      // (a lower frame rate only for frames actually late: a GPU busy a hair over 92% with frames on time, halved to 30
      // fps, took coarser and dearer steps for nothing)
      } else if (autoF && perf.slow < 4 && (m > T * 1.125 || stressed())) { perf.slowCeiling = perf.slow; perf.slow = Math.min(4, perf.slow + (m > 2 * T ? 2 : 1)); }
      return;
    }
    // A frame rate or scale cut is won back by frames on time; frames a little late (the browser's pace, as
    // a fast display delivers the page's frames unevenly) count as on time while the page's own work, the
    // GPU's and the script's, fills under a quarter of the interval: no cut could help them, and judged
    // against 1.03 they held the slowest rung forever (15 fps, its frames 4% late on a 175 Hz display).
    const cheap = perf.gpu + perf.mainMs * frameEvery() < T / 4;
    if ((m > T * 1.03 && !cheap) || stressed()) { perf.goodWindows = 0; return; }
    perf.goodWindows++;
    if (perf.goodWindows < 3) return;
    const held = now < perf.ceilingUntil;
    // A faster frame rate costs a drawing and a shorter step per frame, in less time. A coarse step
    // of m ticks costs about 1 + 0.45 (m - 1) of a 1/60 s one (docs/performance.md): judged by this
    // frame's cost alone, 30 fps in 2-tick steps never looked able to return to 60.
    if (perf.slow > 1) {
      const faster = (T * (perf.slow - 1)) / perf.slow;
      const cost = (m) => 1 + 0.45 * (m - 1);
      const est = hasTS && perf.simS && perf.renderR ? perf.renderR + perf.simS * cost(ticksFor(faster)) / cost(stepTicks()) : perf.gpu;
      if (!(held && perf.slow - 1 <= perf.slowCeiling) && (!est || est < faster * 0.75)) { perf.slow--; perf.goodWindows = 0; perf.raisedAt = now; }
      if (perf.slow === 1) perf.why = '';
      return;
    }
    const best = Object.keys(tune).every((k) => !tuneAuto(k) || tune[k].level === KNOBS[k].levels.length - 1);
    // the tuner's: the step that brings back the most for its cost, if it fits (src/tuner.js)
    if (tuneSteps(false, now, T, auto ? state.perf.floor : renderScale, 1, held)) { perf.goodWindows = 0; perf.raisedAt = now; }
    if ((!auto || renderScale >= 1) && best) perf.why = '';
  }
  // Up to n of the tuner's steps (src/tuner.js), behind or with room: render scale or a knob on Auto. Behind just after
  // a climb (within 6 s), that climb's knob is held: not tried again for perf.hold.
  function tuneSteps(behind, now, T, floor, n = 1, held = false) {
    // the neighbors' cost: the step's, measured at each of their levels once it has settled there (three windows on),
    // each against the top's what fewer save on this device (rel)
    const nb = tune.neighbors;
    if (perf.simS && now - (nb.since || 0) > 6000) {
      (nb.at ||= [])[nb.level] = perf.simS;
      nb.cost = perf.simS;
      const top = nb.at[KNOBS.neighbors.levels.length - 1];
      if (top) nb.rel = KNOBS.neighbors.levels.map((_, i) => (nb.at[i] ? clamp(nb.at[i] / top, 0.2, 1) : null));
    }
    if (behind && perf.raised && now - perf.raisedAt < 6000) { const k = perf.raised; if (tune[k]) tune[k].hold = now + perf.hold; perf.raised = null; }
    let acted = false;
    for (let i = 0; i < n; i++) {
      const knobs = {};
      for (const [id, k] of Object.entries(tune)) knobs[id] = { level: k.level, auto: tuneAuto(id), cost: k.cost, full: k.full, ratio: k.ratio, rel: k.rel };
      const heldK = Object.fromEntries(Object.entries(tune).map(([id, k]) => [id, now < k.hold]));
      heldK.scale = held;
      const draw = hasTS && perf.renderR ? perf.renderR : perf.gpu * 0.6;
      const d = decide({ behind, T, gpu: perf.gpu, draw, knobs, held: heldK,
        scale: { cur: renderScale, ladder: SCALES, floor, auto: state.perf.scale === 'auto' } });
      if (!d) break;
      if (d.id === 'scale') {
        if (behind) perf.ceiling = renderScale;
        // (what the drawing costs follows the pixels, so the estimate holds for the next of these steps)
        if (hasTS && perf.renderR) perf.renderR *= (d.to / renderScale) ** 2;
        renderScale = d.to; resizeDue = true;
      } else {
        const k = tune[d.id];
        if (k.cost != null) { const def = KNOBS[d.id], top = def.levels.at(-1); k.cost = (k.full ?? k.cost / Math.max(1e-6, def.share(top, def.levels[k.level]))) * def.share(top, def.levels[d.to]); }
        k.level = d.to; k.since = now; applyTune();
      }
      perf.raised = behind ? null : d.id;
      acted = true;
    }
    return acted;
  }
  // Every 10 s at real time or slower (with GPU timestamps), 20 frames timed pass by pass, for what each knob costs
  // at its level (tuner.js costOf); sharing the engine's profile with any other listener (a bench, Copy profile)
  let prof = null;
  function tuneProfile(now) {
    // (a window another listener cut off, as one taking the engine's callback alone would, is let go after 15 s)
    if (prof && now - perf.profAt > 15000) prof = null;
    if (!hasTS || prof || state.speed > 1 || state.phase !== 'running' || now - perf.profAt < 10000) return;
    perf.profAt = now;
    const other = eng.onPassTimes, was = eng.passProfile;
    prof = { n: 0, passes: {} };
    eng.passProfile = true;
    const mine = (times, f) => {
      if (other) other(times, f);
      if (!f.drew) return;
      for (const [k, ms] of times) prof.passes[k] = (prof.passes[k] || 0) + ms;
      if (++prof.n < 20) return;
      const c = costOf(Object.entries(prof.passes).map(([k, ms]) => [k, ms / prof.n]));
      for (const [id, ms] of Object.entries(c)) {
        // (the neighbors' cost is the step's, learned in tuneSteps: no pass is theirs alone)
        if (!KNOBS[id].passes) continue;
        const k = tune[id], def = KNOBS[id], share = def.share(def.levels.at(-1), def.levels[k.level]);
        k.cost = ms;
        if (share > 0) k.full = ms / share;
      }
      // the finish's cost: the composite's, per pixel at each of its levels once its fade has run (rel: against the top's)
      const fin = tune.finish, comp = (prof.passes.fsComposite || 0) / prof.n;
      if (comp > 0) {
        fin.cost = comp;
        if (performance.now() - (fin.since || 0) > 2500) {
          (fin.at ||= [])[fin.level] = comp / (renderScale * renderScale);
          const top = fin.at[KNOBS.finish.levels.length - 1];
          if (top) fin.rel = KNOBS.finish.levels.map((_, i) => (fin.at[i] ? fin.at[i] / top : null));
        }
      }
      // the insides' cost: the cells' pass, at each level at a like zoom (ratio: off against on, per pixel); nothing
      // where cells are drawn too small for insides (under 6 pixels a unit of size)
      const ins = tune.interiors, ps = new Float32Array(eng.viewData)[7];
      const cells = Object.entries(prof.passes).reduce((a, [k, ms]) => a + (k.startsWith('fsReproj') ? ms : 0), 0) / prof.n;
      ins.cost = ps > 6 ? cells : 0;
      if (ps > 6 && cells > 0 && performance.now() - (ins.since || 0) > 1500) {
        (ins.at ||= [])[ins.level] = { ms: cells / (renderScale * renderScale), ps };
        const [a, b] = ins.at;
        if (a && b && Math.abs(a.ps / b.ps - 1) < 0.25) ins.ratio = clamp(a.ms / b.ms, 0.2, 1);
      }
      // (handed back as found, unless another took it meanwhile: another's profile runs on)
      if (eng.onPassTimes === mine) { eng.passProfile = was; eng.onPassTimes = other; }
      prof = null;
    };
    eng.onPassTimes = mine;
  }
  /** The least render scale at which the canvas holds the film's frame (at pixel density d), 0 when not filming. */
  function filmScale(d = density()) {
    const sz = film.state === 'recording' && film.size();
    return sz ? Math.min(1, Math.max(sz[0] / (innerWidth * d), sz[1] / (innerHeight * d))) : 0;
  }
  // A new render scale is applied at the start of the next frame, before it takes the canvas's
  // texture: resizing the canvas after a frame is drawn into it discards that frame (a black flash).
  let resizeDue = false;

  // Where the tracked particle is now: last GPU sample advanced by its own velocity plus the current it rides.
  // the simulated time the frame being drawn shows (after this frame's steps)
  let viewSimTime = 0;
  function predicted() { return predictAt(sel.particle, sel.sampleT); }
  // How far a sample is carried on: at most a quarter of a real second's simulated time (at fast speeds a
  // sample is a few frames, but seconds of simulated time, old when it arrives; held to 0.25 s, the marks trailed)
  const carryMax = () => 0.25 * Math.max(1, state.speed === Infinity ? perf.rate || 1 : state.speed);
  function predictAt(p, sampleT, at = viewSimTime || eng.simTime) {
    const dtS = Math.max(0, Math.min(carryMax(), at - sampleT));
    // a cell's velocity leaves out the current, which carries it by its advect; matter's already
    // includes it (stone and framboids hold still), so adding it again would walk the marker off them
    let adv = 0;
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

  // a scale bar and ticks along the bottom of the view: how long things are right now, in µm or mm
  function drawScale() {
    if (!state.hud || !state.ui || director.active && !phone()) return;
    const p = cssPPU();
    const y = dockTop - 1;
    // ticks at round lengths along the dock's top edge
    const unit = (NICE_UM.find((u) => (u / UM_PER_UNIT) * p >= 14) || 50000) / UM_PER_UNIT;
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
    const len = (NICE_UM.find((u) => (u / UM_PER_UNIT) * p >= 50) || 50000) / UM_PER_UNIT;
    const w = len * p, x1 = innerWidth - 24 - (specimen.isOpen() ? specInset().right : 0), x0 = x1 - w, by = y - 16;
    octx.fillStyle = 'rgba(226,241,240,0.85)';
    octx.fillRect(x0, by, w, 1);
    octx.fillRect(x0, by - 4, 1, 5); octx.fillRect(x1 - 1, by - 4, 1, 5);
    octx.font = '500 11px Saira, system-ui, sans-serif'; // i18n-ignore (a CSS font)
    octx.textAlign = 'right';
    octx.fillText(fmtLen(len), x0 - 8, by + 3);
    octx.textAlign = 'left';
  }

  // the overlay as last drawn when it held only the scale: redrawn only when that changes (a canvas drawn
  // afresh each frame is rasterized and composited afresh, the whole window of it)
  let overlayKey = null;
  function drawOverlay(dt, L) {
    const now = performance.now();
    const marking = markSlot() !== -2 && songEvents.some((e) => now - e.at < MARK_MS);
    const R = reticleAt();
    const key = state.currents || (sel && sel.particle) || L || R || marking || notesShown ? null
      : `${state.hud}|${state.ui}|${director.active}|${cssPPU()}|${cam.x}|${dockTop}|${innerWidth}|${overlay.width}|${specimen.isOpen() && specInset().right}|${document.fonts.status}`;
    if (key !== null && key === overlayKey) return;
    overlayKey = key;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    const r = overlay.width / innerWidth;
    octx.setTransform(r, 0, 0, r, 0, 0);
    if (state.currents) drawCurrents();
    drawScale();
    filmMarked = false;
    plateRect = null;
    if (sel && sel.particle) {
      const [W, H] = eng.grid;
      // The marker sits on the prediction for this very frame. A new GPU sample that corrects the
      // prediction would make it jump, so the jump becomes an offset that fades within ~0.1 s.
      const [px, py] = predicted();
      if (sel.dispT !== sel.sampleT) {
        // (against where the last sample's prediction puts it now, not where the marker was a frame ago:
        // that took the cell's own motion over the frame for a correction, and the eased offset kept the
        // marker trailing it, by several frames of its motion, by far more at fast speeds)
        if (sel.dispT != null && sel.shown) {
          const [ox, oy] = predictAt(sel.shown.p, sel.shown.t);
          sel.err[0] = wrapD(ox + sel.err[0] - px, W); sel.err[1] = wrapD(oy + sel.err[1] - py, H);
        }
        sel.dispT = sel.sampleT;
        sel.shown = { p: sel.particle, t: sel.sampleT };
      }
      const fade = Math.exp(-dt / 45);
      sel.err[0] *= fade; sel.err[1] *= fade;
      sel.disp[0] = px + sel.err[0];
      sel.disp[1] = py + sel.err[1];
      let [sx, sy] = toShown(sel.disp[0], sel.disp[1]);
      let inLens = false;
      if (L && Math.hypot(sx - L.sx, sy - L.sy) < L.R) {
        const [lx, ly] = lensShift(sel.disp[0], sel.disp[1], L);
        sx = L.sx + wrapD(sel.disp[0] - L.cx, W) * L.cssPPU + lx;
        sy = L.sy + wrapD(sel.disp[1] - L.cy, H) * L.cssPPU + ly;
        inLens = true;
      }
      const visible = !inLens || Math.hypot(sx - L.sx, sy - L.sy) < L.R - 8;
      // the auto camera's subject is marked and named once it is in view, after the camera's flight
      const sh = filmShot();
      if (sh && !sh.why.seen && sh.t >= sh.flight - 0.5 && sx > innerWidth * 0.1 && sx < innerWidth * 0.9 && sy > innerHeight * 0.1 && sy < innerHeight * 0.9) {
        sh.why.seen = true;
        if (sel.org && sel.org.cells && !sel.org.pending) sh.why.cells = sel.org.cells;
        sh.whyVer++;
      }
      // (with the interface hidden the subject is not marked, but its song marks still show)
      filmMarked = !!(visible && (!sh || sh.why.seen) && (!state.ui || drawMarker(sx, sy, inLens, dt))) && !!sh;
      // riding: the will, a line from the cell the way it is steered, as long as the throttle is open
      if (ride.on && hand.will && hand.will[2] > 0 && state.ui) {
        const [wx, wy] = easeWill(dt);
        drawWill(sx, sy, sx + wx, sy + wy);
      }
    }
    // (the mouse at the lens's center; a lens set by a tap has no pointer to mark)
    if (L?.mouse) {
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
    if (R) drawReticle(R);
    drawSongMarks(now, L);
    if (notesShown) drawNotes(dt, L);
  }
  // The will as drawn, from the ridden cell (screen px: WILL_PX at the throttle full open), eased as the specimen's
  // compass eases its arrows: a new way turns to over a moment, the shorter way round, and its length follows, never snapping.
  const WILL_EASE = 80; // ms
  const WILL_PX = 120;
  const willShown = { a: 0, l: 0 };
  function easeWill(dt) {
    const u = ride.th.u, a = Math.atan2(u[1], u[0] + 1e-9), l = Math.hypot(u[0], u[1]) * WILL_PX, w = willShown;
    const k = 1 - Math.exp(-dt / WILL_EASE);
    w.a += (a - w.a - TAU * Math.round((a - w.a) / TAU)) * k;
    w.l += (l - w.l) * k;
    return [Math.cos(w.a) * w.l, Math.sin(w.a) * w.l];
  }
  function drawWill(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d < 16) return;
    const ux = (x1 - x0) / d, uy = (y1 - y0) / d;
    octx.save();
    octx.strokeStyle = 'rgba(241,227,160,0.85)'; octx.lineWidth = 1; octx.setLineDash([4, 5]);
    octx.beginPath(); octx.moveTo(x0 + ux * 14, y0 + uy * 14); octx.lineTo(x1 - ux * 7, y1 - uy * 7); octx.stroke();
    octx.setLineDash([]);
    octx.beginPath(); octx.arc(x1, y1, 6, 0, TAU); octx.stroke();
    octx.restore();
  }
  // The tool in hand's reticle: where the pointer is (a finger while it is down), its reach a ticked ring (the
  // needle's a point), a cross at its center, and a readout naming the tool and what it is doing.
  function reticleAt() {
    if (!inHand() || state.phase !== 'running' || !state.ui) return null;
    const f = ptr.down?.apply && ptr.pointers.size === 1 ? [...ptr.pointers.values()][0] : null;
    if (!f && !hover.on) return null;
    const [sx, sy] = f ? [f.x, f.y] : [hover.x, hover.y];
    const r = hand.tool === 'needle' ? 7 : clamp(hand.reach * cssPPU(), 10, Math.hypot(innerWidth, innerHeight));
    return { sx, sy, r };
  }
  const RETICLE_COL = { warm: '255,138,58', cold: '90,168,255' };
  function drawReticle({ sx: x0, sy, r }) {
    const t = hand.tool, col = RETICLE_COL[t] || '241,227,160';
    // a full pipette shakes its tip when asked for more
    const sk = performance.now() - pull.shake, sx = x0 + (sk < 400 ? Math.sin(sk / 22) * 5 * (1 - sk / 400) : 0);
    octx.save();
    octx.lineCap = 'butt';
    for (const [w, c] of [[3, 'rgba(0,0,0,0.5)'], [1, `rgba(${col},0.95)`]]) {
      octx.strokeStyle = c; octx.lineWidth = w;
      octx.beginPath(); octx.arc(sx, sy, r, 0, TAU); octx.stroke();
      // ticks every 15°, longer at the quarters; inward, so a large ring still reads at the screen's edge
      octx.beginPath();
      const n = r < 24 ? 4 : 24;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, q = i % (n / 4) === 0, l = r < 24 ? 4 : q ? 9 : 4;
        octx.moveTo(sx + Math.cos(a) * (r + (q ? 3 : 0)), sy + Math.sin(a) * (r + (q ? 3 : 0)));
        octx.lineTo(sx + Math.cos(a) * (r - l), sy + Math.sin(a) * (r - l));
      }
      octx.moveTo(sx - 5, sy); octx.lineTo(sx + 5, sy); octx.moveTo(sx, sy - 5); octx.lineTo(sx, sy + 5);
      octx.stroke();
    }
    // the readout, beside the ring (inside the screen)
    // i18n: the tool's readout by the pointer: its name, in capitals (hand.readout.pipette, hand.readout.reach)
    const tool = tr('hand.readout.tool', '{t, select, loupe {LOUPE} touch {TOUCH} lamp {LAMP} shade {SHADE} warm {WARM} cold {COLD} needle {NEEDLE} pipette {PIPETTE} other {PAN}}', { t: toolOf(t).id });
    // i18n: the tool's readout by the pointer: {tool} its name (hand.readout.tool), and what the pipette holds ({n} cells of
    // {max}) or the tool's reach ({reach}, a length)
    const lines = [t === 'pipette' ? tr('hand.readout.pipette', '{tool} · {n, number} / {max, number}', { tool, n: pipette.count, max: PIPE_LIMIT }) : t === 'needle' ? tool : tr('hand.readout.reach', '{tool} · {reach}', { tool, reach: fmtLen(hand.reach) }), handDoing()];
    const mode = t === 'pipette' && modeChip(pipDispensing());
    const chip = mode ? mode.w + 8 : 0;
    octx.font = '500 11px Saira, system-ui, sans-serif'; // i18n-ignore (a CSS font)
    octx.letterSpacing = '1.5px';
    const w = Math.max(...lines.map((l, i) => octx.measureText(l).width + (i ? chip : 0))) + 12;
    // beside the ring, within the water the panels leave open
    const left = lab.isOpen() && !phone() && state.ui ? labRight() : 0, right = innerWidth - specInset().right;
    let x = sx + Math.min(r, 160) + 16;
    if (x + w > right - 8) x = sx - Math.min(r, 160) - 16 - w;
    x = clamp(x, left + 8, right - 8 - w);
    const y = clamp(sy - 12, 60, innerHeight - 90);
    octx.fillStyle = 'rgba(6,9,10,0.62)';
    octx.fillRect(x, y - 4, w + 4, 34);
    octx.fillStyle = `rgba(${col},0.95)`;
    octx.fillRect(x, y - 4, 1, 34);
    lines.forEach((l, i) => { octx.fillStyle = i ? 'rgba(163,189,190,0.95)' : `rgba(${col},1)`; octx.fillText(l, x + 8 + (i ? chip : 0), y + 9 + i * 15); });
    if (mode) drawMode(mode, x + 8, y + 14);
    octx.restore();
  }
  // The pipette's mode in its readout: a chip of solid color, its word cut out of it in the readout's dark, with
  // corner ticks; while it draws up or sets down, a bar under it fills with the pressure.
  // (Load with no room left: Full)
  const MODE_COL = { LOAD: '241,227,160', DISPENSE: '120,226,214', FULL: '232,116,98' };
  // i18n: the pipette's mode, in capitals on a chip in its readout
  const MODE_WORD = { LOAD: tr('hand.pipette.mode-load', 'LOAD'), DISPENSE: tr('hand.pipette.mode-dispense', 'DISPENSE'), FULL: tr('hand.pipette.mode-full', 'FULL') };
  function modeChip(dispensing) {
    const mode = dispensing ? 'DISPENSE' : pipette.fits(1) ? 'LOAD' : 'FULL', word = MODE_WORD[mode];
    octx.font = '600 9px Saira, system-ui, sans-serif'; // i18n-ignore (a CSS font)
    octx.letterSpacing = '2px';
    return { word, col: MODE_COL[mode], w: octx.measureText(word).width + 8, at: spit.on ? spit.at : pull.on || hand.suck ? pull.at : null };
  }
  function drawMode({ word, col, w, at }, x, y) {
    const h = 13;
    octx.fillStyle = `rgba(${col},0.92)`;
    octx.fillRect(x, y, w, h);
    octx.fillStyle = 'rgba(6,9,10,0.95)';
    octx.font = '600 9px Saira, system-ui, sans-serif'; // i18n-ignore (a CSS font)
    octx.letterSpacing = '2px';
    octx.fillText(word, x + 5, y + 9.5);
    octx.strokeStyle = `rgba(${col},0.9)`;
    octx.lineWidth = 1;
    octx.beginPath();
    for (const [cx, cy, sx, sy] of [[x - 2, y - 2, 1, 1], [x + w + 2, y - 2, -1, 1], [x - 2, y + h + 2, 1, -1], [x + w + 2, y + h + 2, -1, -1]]) {
      octx.moveTo(cx + sx * 3, cy); octx.lineTo(cx, cy); octx.lineTo(cx, cy + sy * 3);
    }
    octx.stroke();
    if (at != null) { octx.fillStyle = `rgba(${col},0.95)`; octx.fillRect(x, y + h + 1, w * pressed(at, performance.now()), 1); }
  }
  // The instrument in hand seen in the water (eng.tool; the composite's instrument): the needle, the pipette's glass,
  // the cold probe, out of focus over the water as the pointer moves, let down into it (in focus) while pressed.
  let toolFocus = 0;
  function showInstrument(R, dt) {
    const it = INSTRUMENTS[hand.tool];
    const pressed = !!(ptr.down?.apply || ptr.down?.pip);
    toolFocus += ((pressed ? 1 : 0) - toolFocus) * (1 - Math.exp(-dt / 0.12));
    if (!it || !R) { eng.tool.fill(0); toolFocus = 0; return; }
    // (the rod comes into focus as it dips into the water, and lifts out under the pointer)
    eng.tool.set([...toWorld(R.sx, R.sy), ...it.dir, it.kind, hand.tool === 'touch' ? hand.dip : toolFocus, hand.tool === 'cold' ? hand.level : 0, hand.reach]);
  }
  // what the tool in hand is doing, in a few words
  function handDoing() {
    const t = hand.tool;
    // i18n: the tool's readout, what it is doing: the lamp, shade, warm or cold, held down or over the water, at {pct}
    // percent of its strength (more while held)
    if (t === 'lamp' || t === 'shade' || t === 'warm' || t === 'cold') return tr('hand.doing.level', '{doing, select, lamp {Brightening} shade {Darkening} warm {Warming toward a boil} cold {Chilling toward ice} other {Over the water}} · {pct}%{held, select, yes {} other { · hold for more}}', { doing: hand.held ? t : 'over', pct: Math.min(100, Math.round(hand.level * 100)), held: hand.held ? 'yes' : 'no' });
    if (t === 'touch') return !hand.held ? tr('hand.doing.touch-over', 'Press: the rod into the water') : ptr.dragging ? tr('hand.doing.touch-drag', 'Plowing') : tr('hand.doing.touch-in', 'In the water · pushing aside');
    if (t === 'needle') return !hand.held ? tr('hand.doing.needle-over', 'Press: into the water') : ptr.dragging ? tr('hand.doing.needle-drag', 'Cutting through') : tr('hand.doing.needle-in', 'In the water · its point pricks');
    if (t === 'pipette') {
      const tip = pipette.tip, now = performance.now();
      // i18n: the pipette drawing up, {n} cells in so far
      if (pull.on || hand.suck) return tr('hand.doing.drawing-up', 'Drawing up · {n, number} in', { n: pull.got.length });
      // i18n: {name} the species being set down
      if (spit.on) return tr('hand.doing.setting-down', 'Setting down {name}', { name: (spit.sp || tip)?.name ?? '' });
      if (pull.note && now - pull.note.t < 2000) return pull.note.text;
      // i18n: the pipette's readout: {act} how it is used (a tap on a touch screen, else a click), {shift} the key
      // that turns it to its other mode (none on a touch screen or while Shift is held)
      const d = pipDispensing(), act = isCoarse ? 'tap' : 'click', shift = isCoarse || shiftHeld ? 'none' : d ? 'load' : 'dispense';
      if (!d) return pipette.fits(1) ? tr('hand.doing.load', '{act, select, tap {a tap} other {a click}}: a few at the tip · held: all in reach{shift, select, dispense { · ⇧ dispense} load { · ⇧ load} other {}}', { act, shift })
        : tr('hand.doing.full', 'no room for more{shift, select, dispense { · ⇧ dispense} load { · ⇧ load} other {}}', { shift });
      // i18n: {name} the species at the pipette's tip
      return tip ? tr('hand.doing.dispense', '{act, select, tap {a tap} other {a click}} sets down {name}{shift, select, dispense { · ⇧ dispense} load { · ⇧ load} other {}}', { act, name: tip.name, shift })
        : tr('hand.doing.empty', 'nothing in it to set down{shift, select, dispense { · ⇧ dispense} load { · ⇧ load} other {}}', { shift });
    }
  }
  // Song marks: a faint ring spreads from each cell as it sings its species' note (the picked
  // species', or every species'). Like the followed cell's brackets, a mark sits where its cell
  // is: the cells about to sing are found by id on the GPU every frame (eng.watch) and carried the
  // last few frames on by their velocity and the current. A cell not found yet falls back to where
  // the listening scan saw it, carried on, and is not drawn once that guess has drifted too far.
  const MARK_MS = 650;
  // particle id -> its last sample { x, y, vx, vy, t (sim time) }, and where its mark was last
  // drawn (disp) with the correction still being eased out (err), as the brackets do
  const watched = new Map();
  let marksAt = 0;
  eng.onWatch = ({ simTime, seen }) => {
    if (notesShown) notes.watchSeen({ simTime, seen });
    for (const w of seen) { const o = watched.get(w.id); watched.set(w.id, { x: w.x, y: w.y, vx: w.vx, vy: w.vy, t: simTime, disp: o && o.disp, err: o ? o.err : [0, 0], fresh: true, shown: o && o.shown }); }
  };
  // the auto camera's follow shot of the marked subject, and whether it has come into view
  function filmShot() {
    const sh = sel && sel.film && director.active ? director.shot : null;
    return sh && sh.why && sh.why.kind === 'follow' && sh.subject && sh.subject.id === sel.filmFor ? sh : null;
  }
  // whether the subject's brackets were drawn this frame (drawOverlay): its song is marked only then
  let filmMarked = false;
  // (the camera can drop its subject between the overlay's draw and this check)
  const filmShown = () => filmMarked && sel && !sel.lost && sel.particle.kind >= FIRST_LIFE;
  function markSlot() { // -1: every species; -2: none
    if (!state.songMarks || !sound.on) return -2;
    if (state.songMarks === 2) return -1;
    const slot = pickedSlot();
    if (slot >= 0) return slot;
    // the auto camera's subject, once it is marked in view
    return filmShown() ? sel.particle.kind : -2;
  }
  // which cells to find this frame: those whose marks are about to show or showing
  function watchMarks(now) {
    const only = markSlot(), ids = [], cells = [];
    if (only !== -2) {
      for (const e of songEvents) {
        if (!e.cell || (only >= 0 && e.slot !== only) || e.at < now - MARK_MS || e.at > now + 1500) continue;
        if (ids.includes(e.cell.id)) continue;
        ids.push(e.cell.id);
        // where it was last found, else where the listening scan saw it
        const w = watched.get(e.cell.id);
        cells.push(w ? { id: e.cell.id, x: w.x, y: w.y, vx: w.vx, vy: w.vy, t: w.t } : e.cell);
        if (ids.length >= WATCH_MAX) break;
      }
    }
    // and the cells the annotations mark
    eng.watch = notesShown ? cells.concat(notes.wantWatch(WATCH_MAX - cells.length).filter((c) => !ids.includes(c.id))) : cells;
    for (const id of watched.keys()) if (!ids.includes(id)) watched.delete(id);
  }
  function drawSongMarks(now, L) {
    // kept a while: the song panel's playhead runs on from the last note to the end of its song
    while (songEvents.length && songEvents[0].at < now - 8000) songEvents.shift();
    const only = markSlot();
    if (only === -2 || !songEvents.length) return;
    const p = cssPPU(), simNow = viewSimTime || eng.simTime, [W, H] = eng.grid;
    const fade = Math.exp(-Math.max(0, now - (marksAt || now)) / 45);
    marksAt = now;
    // each found cell once a frame: its prediction, with a new sample's correction eased out
    const placed = new Map();
    const place = (w, g) => {
      let q = placed.get(w);
      if (q) return q;
      const carry = (s) => { const dts = Math.max(0, Math.min(carryMax(), simNow - s.t)), [fx, fy] = flowAt(s.x, s.y, eng.simTime, eng.waves); return [s.x + (s.vx + fx * g.advect) * dts, s.y + (s.vy + fy * g.advect) * dts]; };
      const [px, py] = carry(w);
      // (the correction against where the last sample puts it now, not where it was marked a frame ago, as
      // the selection's marker)
      if (w.fresh && w.disp && w.shown) { const [ox, oy] = carry(w.shown); w.err = [wrapD(ox + w.err[0] - px, W), wrapD(oy + w.err[1] - py, H)]; }
      if (w.fresh) w.shown = { x: w.x, y: w.y, vx: w.vx, vy: w.vy, t: w.t };
      w.fresh = false;
      w.err[0] *= fade; w.err[1] *= fade;
      q = [px + w.err[0], py + w.err[1]];
      w.disp = q;
      placed.set(w, q);
      return q;
    };
    octx.lineWidth = 1;
    for (const e of songEvents) {
      const t = now - e.at;
      if (t < 0 || t >= MARK_MS || !e.cell || (only >= 0 && e.slot !== only)) continue;
      const g = genomeFor(e.slot);
      if (!g) continue;
      const c = e.cell, w = watched.get(c.id);
      let x, y;
      if (w) [x, y] = place(w, g); // found this frame or the last few: as exact as the brackets
      else {
        const dts = Math.max(0, Math.min(3, simNow - c.t));
        if (0.25 * Math.hypot(c.vx, c.vy) * dts * p > 30) continue;
        const [fx, fy] = flowAt(c.x, c.y, eng.simTime, eng.waves);
        x = c.x + (c.vx + fx * g.advect) * dts; y = c.y + (c.vy + fy * g.advect) * dts;
      }
      x = ((x % W) + W) % W; y = ((y % H) + H) % H;
      let [sx, sy] = toShown(x, y), scale = p;
      if (L && Math.hypot(sx - L.sx, sy - L.sy) < L.R) { // inside the loupe: where the lens shows it
        const [lx, ly] = lensShift(x, y, L);
        sx = L.sx + wrapD(x - L.cx, W) * L.cssPPU + lx; sy = L.sy + wrapD(y - L.cy, H) * L.cssPPU + ly; scale = L.cssPPU;
        if (Math.hypot(sx - L.sx, sy - L.sy) > L.R - 8) continue;
      }
      if (sx < -20 || sy < -20 || sx > innerWidth + 20 || sy > innerHeight + 20) continue;
      const u = t / MARK_MS, R = Math.max(4, 0.09 * scale) * (1 + 1.4 * u);
      octx.strokeStyle = cssCol(g.col);
      octx.globalAlpha = 0.5 * (1 - u) * (1 - u);
      octx.beginPath(); octx.arc(sx, sy, R, 0, TAU); octx.stroke();
    }
    octx.globalAlpha = 1;
  }

  // the picked particle: orange corner brackets and a leader to its name
  // The picked particle: orange corner brackets around it, or around its whole organism (the
  // body's extent from the last trace, riding on the watched cell), and a leader to its name.
  // A cell's own brackets, inside its organism's (also drawn by the specimen viewer), hugging the cell as drawn.
  // Corner brackets over a dark halo, so they hold up over a bright crowd. A large frame gets longer,
  // heavier corners: four small ticks around half the screen are easy to lose.
  function brackets(g, l, t, r, b, col, minC = 2.5, frac = 0.16) {
    const m = Math.min(r - l, b - t);
    const c = Math.min(clamp(m * frac, minC, 64), (r - l) / 3, (b - t) / 3);
    const w = 1.25 + 1.25 * clamp((m - 120) / 480, 0, 1);
    g.beginPath();
    for (const [x, y, dx, dy] of [[l, t, 1, 1], [r, t, -1, 1], [l, b, 1, -1], [r, b, -1, -1]]) { g.moveTo(x, y + dy * c); g.lineTo(x, y); g.lineTo(x + dx * c, y); }
    g.lineCap = 'square';
    g.lineWidth = w + 2; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.stroke();
    g.lineWidth = w; g.strokeStyle = col; g.stroke();
    g.lineCap = 'butt';
  }
  // the watched cell's own brackets, hugging the cell as drawn
  const cellMarkR = (p) => Math.max(5, cellRadius(p, genomeFor(p.kind), cssPPU()) * 1.4 + 3);
  function drawMarker(sx, sy, inLens, dt) {
    const lost = sel.lost;
    // the camera's subject died while the camera finds another cell of its body: mark nothing yet
    const dead = sel.particle.kind < FIRST_LIFE;
    if (sel.film && dead && !(director.shot && director.shot.why && director.shot.why.kind === 'linger')) return false;
    const R = 11;
    let l = sx - R, t = sy - R, r = sx + R, b = sy + R;
    const cr = sel.box && !inLens && !dead ? cellMarkR(sel.particle) : 0;
    if (cr) {
      // ease toward each new trace so the frame doesn't jump once a second
      if (!sel.boxD) sel.boxD = sel.box.slice();
      const k = 1 - Math.exp(-dt / 150);
      for (let i = 0; i < 4; i++) sel.boxD[i] += (sel.box[i] - sel.boxD[i]) * k;
      // room around the outermost cells for a cell's own brackets, so the organism's frame always holds them
      const p = cssPPU(), pad = Math.max(6, 0.12 * p, cr + 6);
      l = Math.min(l, sx + sel.boxD[0] * p - pad); t = Math.min(t, sy + sel.boxD[1] * p - pad);
      r = Math.max(r, sx + sel.boxD[2] * p + pad); b = Math.max(b, sy + sel.boxD[3] * p + pad);
    } else sel.boxD = null;
    brackets(octx, l, t, r, b, lost ? 'rgba(255,255,255,0.35)' : 'rgba(255,95,58,0.95)', 10);
    // framing a body, the brackets are the organism's; the watched cell gets its own, in the panel's cell color
    if (sel.boxD && !lost) brackets(octx, sx - cr, sy - cr, sx + cr, sy + cr, CELL_MARK, 2.5, 0.225);
    if (inLens || lost) return true;
    const p = sel.particle;
    const g = p.kind >= FIRST_LIFE ? genomeFor(p.kind) : null;
    const sp = g && life.reg.get(g.serial);
    // the camera lingering on a death keeps the species' name on its remains
    const name = sp ? sp.name : sel.film && sel.memory && sel.memory.sp ? sel.memory.sp.name : p.kind === 3 ? stoneGrain(p.id, p.info).name : '';
    // in capitals: a species' or a grain's name upper-cased (generated, not messages), other matter by its kind
    // i18n: the label by a picked grain of matter, its kind in capitals
    const label = name ? name.toLocaleUpperCase(LOCALE) : p.kind < FIRST_LIFE ? tr('stage.plate.matter', '{kind, select, 0 {SILT} 2 {HUSK} other {FRAMBOID}}', { kind: p.kind }) : '';
    if (!label) return true;
    octx.font = '500 11px Saira, system-ui, sans-serif'; // i18n-ignore (a CSS font)
    octx.letterSpacing = '1.5px';
    const tw = octx.measureText(label).width;
    // the label goes to whichever side of the frame has room inside the area the panels leave open
    const lo = lab.isOpen() && !phone() ? labRight() : 0;
    const hi = innerWidth - specInset().right;
    const left = r + 38 + tw > hi - 8 && l - 38 - tw >= lo + 8;
    const ex = (left ? l - 14 : r + 14), ey = Math.max(t - 14, 64);
    octx.strokeStyle = 'rgba(255,95,58,0.75)';
    octx.lineWidth = 1;
    octx.beginPath(); octx.moveTo(left ? l : r, t); octx.lineTo(ex, ey); octx.lineTo(ex + (left ? -1 : 1) * 10, ey); octx.stroke();
    const tx = clamp(left ? ex - 14 - tw : ex + 14, lo + 8, hi - tw - 8);
    octx.fillStyle = 'rgba(6,9,10,0.7)';
    octx.fillRect(tx - 4, ey - 9, tw + 8, 16);
    octx.fillStyle = 'rgba(226,241,240,0.95)';
    octx.fillText(label, tx, ey + 3.5);
    octx.letterSpacing = '0px';
    plateRect = { l: tx - 10, t: ey - 14, r: tx + tw + 10, b: ey + 10 };
    // with the annotations, the subject's own data under its name: its diet, its body, the water it bears
    if (notesShown && g && sp) {
      // i18n: Live annotations: the selected cell's line under its name: its diet in capitals, its body ({n} cells), how it bears the water ({lo}–{hi} degrees Celsius)
      const cells = sel.org && sel.org.cells > 1 ? tr('notes.subject.body', '{n}-CELL BODY', { n: fmt(sel.org.cells) }) : tr('notes.subject.one-cell', 'ONE CELL');
      const clo = Math.round((g.topt ?? 19) - Math.max(g.tol ?? 7, 0.5)), chi = Math.round((g.topt ?? 19) + Math.max(g.tol ?? 7, 0.5));
      const guild = tr('notes.guild', '{g, select, producer {PRODUCER} grazer {GRAZER} predator {PREDATOR} scavenger {SCAVENGER} other {}}', { g: dietGuild(g) });
      const comfort = tr('notes.comfort', 'COMFORT {lo}–{hi}°C', { lo: clo, hi: chi });
      // (on a narrow screen without its body, and always inside the open area)
      let line = `${guild} · ${cells} · ${comfort}`;
      if (noteView.width('data', line) > hi - lo - 16) line = `${guild} · ${comfort}`;
      const dw = noteView.width('data', line), dx = clamp(left ? Math.min(tx + tw - dw, tx) : tx, lo + 8, Math.max(lo + 8, hi - dw - 8));
      noteView.text('data', line, dx, ey + 20, 'rgba(163,189,190,0.95)');
      octx.letterSpacing = '0px'; octx.fontStretch = 'normal';
      plateRect = { l: Math.min(tx, dx) - 10, t: ey - 14, r: Math.max(tx + tw, dx + dw) + 10, b: ey + 26 };
    }
    return true;
  }

  // ------------------------------------------------------------ auto camera
  // Left alone for a minute (three with the specimen or the Lab open), the view is handed to the
  // director (director.js), which films the world until the user clicks, drags or scrolls the view.
  const AUTO_IDLE = 60e3, AUTO_IDLE_READING = 180e3;
  const CURSOR_REST = 3000; // filming, the pointer and the loupe hide once the mouse rests this long
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
    // where the pool's event shows best (docs/catastrophes.md): a stretch of shore while the water falls or returns,
    // the duckweed, the last raindrop
    event: () => {
      const ev = climate && climate.event, ph = climate && climate.phase;
      if (!ev || !ph || ph === 'after') return null;
      const [W, H] = eng.grid;
      if (ev.type === 'duckweed') return { type: 'duckweed', phase: ph, x: eng.duck[0], y: eng.duck[1], w: eng.duck[2] * (Math.random() < 0.5 ? 3.2 : 1.5) };
      if (ev.type === 'storm' || ph === 'rain') {
        const k = climate.dropSlot ?? 0;
        if (eng.drops[k * 4 + 3] > 0 && Math.random() < 0.5) return { type: ev.type, phase: ph, x: eng.drops[k * 4], y: eng.drops[k * 4 + 1], w: 40 };
      }
      if (ev.type === 'frost' && ph !== 'cooling' && eng.relief) {
        // the ice's front, or a vein of water, near the middle of the view the director picks
        return { type: 'frost', phase: ph, x: W * Math.random(), y: H * Math.random(), w: Math.random() < 0.5 ? 12 : 35 };
      }
      if (ev.type === 'drought' && eng.relief) {
        // a point of the water's edge, chosen at random
        for (let tries = 0; tries < 400; tries++) {
          const i = Math.floor(Math.random() * W), j = Math.floor(Math.random() * H);
          if (Math.abs(eng.relief[j * W + i] - eng.level) < 0.006) return { type: 'drought', phase: ph, x: i + 0.5, y: j + 0.5, w: Math.random() < 0.6 ? 14 : 40 };
        }
      }
      return { type: ev.type, phase: ph, x: W * Math.random(), y: H * Math.random(), w: Math.min(W, H) * 0.6 };
    },
  });
  let surveyT = 0;
  eng.onSurvey = (s) => {
    const t = performance.now();
    director.survey(s, surveyT ? (t - surveyT) / 1000 : 1);
    surveyT = t;
  };
  function resetDirector() {
    notes.reset();
    if (director.active) renderAuto(false);
    director.reset();
    surveyT = 0;
  }
  function renderAuto(live) {
    eng.survey = state.auto || live ? { every: 45 } : null;
    const b = $('auto-play');
    b.setAttribute('aria-pressed', String(!!live));
    b.setAttribute('aria-label', live ? tr('dock.auto-play.aria-stop', 'Stop the auto camera') : tr('dock.auto-play.aria-start', 'Start the auto camera'));
    $('auto-next').hidden = !live;
  }
  // the user takes the camera back where it is
  function takeOver() {
    poke();
    if (sel && sel.film) deselect();
    if (!director.active) return;
    director.stop();
    cam.zoomTarget = cam.zoom; cam.anchor = null;
    renderAuto(false);
  }
  function startAuto(idle) {
    if (idle && (sel || spView != null)) deselect();
    // the Lab folds to its tab while the camera films (it may be opened again without stopping it)
    lab.close({ keep: true });
    closeMenus();
    director.start({ x: cam.x, y: cam.y, w: viewWidths()[1] / cam.zoom }, { now: !idle });
    renderAuto(true);
  }
  function playAuto() {
    if (director.active) { takeOver(); flash(tr('flash.auto-off', 'Auto camera off')); }
    else if (state.phase === 'running') { startAuto(false); flash(tr('flash.auto-on', 'Auto camera')); }
  }
  // the camera leaves what it is showing for a new scene
  function nextScene() {
    if (director.next()) flash(tr('flash.next-scene', 'Next scene'));
  }
  $('auto-play').addEventListener('click', playAuto);
  $('auto-next').addEventListener('click', nextScene);
  renderAuto(false);
  // What the auto camera is showing and why, as a caption: where it is heading while it flies,
  // what is in view once it arrives (from the director's shot.why).
  // i18n: the auto camera's captions: why it went where it is (heading there), and a note on it once there
  const REASON = {
    mutations: [tr('caption.reason.mutations', 'Where new variants are being born'), tr('caption.reason.mutations-note', 'Mutants are appearing here')],
    sparks: [tr('caption.reason.sparks', 'Where life is sparking from silt'), tr('caption.reason.sparks-note', 'Life is sparking from silt')],
    kills: [tr('caption.reason.kills', 'A hunting ground'), tr('caption.reason.kills-note', 'Kills are frequent')],
    births: [tr('caption.reason.births', 'A crowd of births'), tr('caption.reason.births-note', 'Many are being born')],
    deaths: [tr('caption.reason.deaths', 'A die-off'), tr('caption.reason.deaths-note', 'Many are dying')],
    // i18n: {n} about how many species meet
    diverse: [tr('caption.reason.diverse', 'A meeting of many species'), (div) => (div >= 3 ? tr('caption.reason.diverse-note-n', 'About {n} species meet', { n: div }) : tr('caption.reason.diverse-note', 'Several species meet'))],
    bodies: [tr('caption.reason.bodies', 'A gathering of bodies'), tr('caption.reason.bodies-note', 'Many-celled bodies gather')],
    swift: [tr('caption.reason.swift', 'Swift swimmers'), tr('caption.reason.swift-note', 'The cells here move fast')],
    dense: [tr('caption.reason.dense', 'The thickest crowd of life'), tr('caption.reason.dense-note', 'Life is crowded here')],
  };
  const spName = (serial) => { const sp = life.reg.get(serial); return sp ? spLink(serial, sp.name) : tr('caption.unnamed', 'an unnamed species'); };
  const spDesc = (serial) => { const sp = life.reg.get(serial); return sp ? describe(sp.genome, K) : ''; };
  // how a species' name and a count begin, for the messages' articles (English's an or a): yes when the name begins
  // with a vowel, or the count is said with one ("an 8-cell", "an 11-cell", "a 12-cell")
  const vowelName = (serial) => { const sp = life.reg.get(serial); return sp && /^[AEIOU]/i.test(sp.name) ? 'yes' : 'no'; };
  const vowelCount = (n) => (/^8/.test(String(n)) || (String(n).length % 3 === 2 && /^1[18]/.test(String(n))) ? 'yes' : 'no');
  // what a message about an organism is given: {body} one cell or many, {n} its cells, {name} its species (a link),
  // {vowel} yes when its name begins with a vowel (one cell), {nvowel} yes when its count is said with one (many)
  const organism = (w) => ({ body: w.cells > 1 ? 'many' : 'one', n: fmt(w.cells), name: spName(w.serial), vowel: vowelName(w.serial), nvowel: vowelCount(w.cells) });
  // what became of a cell: its fate (the verb's key), and what is left of it
  function fateOf(f) {
    if (!f) return ['vanished', tr('caption.after.vanished', 'Perhaps built into a new cell')];
    if (f.kind === 0) return ['eaten', tr('caption.after.eaten', 'What remained is silt')];
    if (f.kind === 3) return [f.cause === 2 ? 'old' : 'starved', tr('caption.after.stone', 'Its skeleton is now stone')];
    return [f.cause === 2 ? 'old' : f.cause === 3 ? 'killed' : 'starved', tr('caption.after.husk', 'Its body is now a husk')];
  }
  // a chronicler's story as a caption's line: its first sentence, cut at a word near 140 characters
  const storyLine = (text) => {
    const first = text.match(/^.*?\.(?=\s|$)/)?.[0] || text;
    return first.length <= 140 ? first : `${first.slice(0, first.lastIndexOf(' ', 136))}…`;
  };
  function captionHtml(w, going) {
    const r = (w.reasons || []).map((x) => REASON[x.key]);
    const note = (x) => (typeof x[1] === 'function' ? x[1](w.div) : x[1]);
    // i18n: the caption's main line following an organism: "A 12-cell {name}" ({nvowel}: yes when the count is said
    // with a vowel), or "A {name} cell" ({vowel}: yes when the name begins with one)
    const named = () => tr('caption.organism', '{body, select, many {{nvowel, select, yes {An} other {A}} {n}-cell {name}} other {{vowel, select, yes {An} other {A}} {name} cell}}', organism(w));
    let eyebrow, main, sub = '';
    if (w.kind === 'wide') {
      if (going) { eyebrow = tr('caption.wide.going', 'Rising'); main = tr('caption.wide.going-main', 'For a view of the whole world'); }
      else {
        eyebrow = tr('caption.wide', 'The whole world');
        // i18n: {n} living cells, {species} living species
        main = tr('caption.wide.main', '{n, plural, other {# living cells}} in {species, plural, other {# species}}', { n: life.counts[3], species: life.alive });
        // i18n: {era} the era's name, {pct} the light (%)
        sub = tr('caption.wide.sub', '{era} · light {pct}%', { era: esc(eraName(climate.name)), pct: Math.round(eng.ambient * 100) });
      }
    } else if (w.kind === 'scene') {
      if (going && w.lost) {
        const [fate] = fateOf(w.lost.fate);
        eyebrow = tr('caption.lost', 'Heading on');
        // i18n: the camera heads to where the cell it was going to show died: {name} its species (a link); with a body of
        // {n} cells ({nvowel}: yes when the count is said with a vowel) or alone ({vowel}: yes when the name begins with one); {fate} what became of it
        main = tr('caption.lost.main', 'To where {body, select, many {a cell of {nvowel, select, yes {an} other {a}} {n}-cell {name}} other {{vowel, select, yes {an} other {a}} {name} cell}} {fate, select, vanished {vanished} eaten {was eaten} old {died of old age} killed {was killed} other {starved}}', { ...organism(w.lost), fate });
        sub = tr('caption.lost.sub', 'It was gone before the camera arrived');
      } else if (going) {
        eyebrow = tr('caption.heading', 'Heading to'); main = r[0] ? r[0][0] : tr('caption.quieter', 'Somewhere quieter'); sub = r[1] ? note(r[1]) : '';
      } else {
        eyebrow = tr('caption.in-view', 'In view');
        const sp = (w.species || []).filter((x) => life.reg.has(x.serial)).map((x) => spName(x.serial));
        // i18n: species in view (links): {rest} all but the last, with commas, and {last}
        main = sp.length ? (sp.length > 1 ? tr('caption.species-list', '{rest} and {last}', { rest: sp.slice(0, -1).join(', '), last: sp[sp.length - 1] }) : sp[0]) : r[0] ? r[0][0] : tr('caption.quiet', 'A quiet stretch of water');
        sub = r.slice(0, 2).map(note).join(' · ');
      }
    } else if (w.kind === 'follow') {
      // named only once it is in view (w.seen): on the way, where the camera is going
      if (!w.seen && w.signal) { eyebrow = tr('caption.searching', 'Searching'); main = tr('caption.searching-signal', 'For the source of a signal'); }
      else if (!w.seen && w.story) { eyebrow = tr('caption.searching', 'Searching'); main = tr('caption.searching-story', 'For a species in the chronicle'); }
      else if (!w.seen) { eyebrow = w.spotlight ? tr('caption.searching', 'Searching') : tr('caption.exploring', 'Exploring'); main = w.spotlight ? tr('caption.searching-new', 'For a new species') : tr('caption.exploring-main', 'Moving to a new area'); sub = w.spotlight ? '' : tr('caption.exploring-sub', 'To discover the life there'); }
      else if (w.signal) { eyebrow = tr('caption.signal', 'Answering a signal'); main = named(); sub = spDesc(w.serial); }
      else if (w.story) { eyebrow = tr('caption.story', 'From the chronicle'); main = named(); sub = esc(storyLine(w.story)); }
      else if (w.spotlight) { eyebrow = tr('caption.new-species', 'Following a new species'); main = named(); sub = spDesc(w.serial); }
      else { eyebrow = tr('caption.following', 'Following'); main = named(); sub = spDesc(w.serial); }
    } else if (w.kind === 'event') {
      // i18n: the auto camera at the pool's event: a title, and a line on what happens
      const EV = { drought: { drying: [tr('caption.drought.drying', 'The pool is drying'), tr('caption.drought.drying-sub', 'Cells crowd the shrinking water; the edge drags stragglers with it')],
        dry: [tr('caption.drought.dry', 'Low water'), tr('caption.drought.dry-sub', 'Stranded on the mud, cells rest as cysts and spores')], rain: [tr('caption.drought.rain', 'Rain'), tr('caption.drought.rain-sub', 'The water returns, and the cysts on the mud wake')] },
        storm: { storm: [tr('caption.storm', 'A storm'), tr('caption.storm-sub', 'Raindrops ring the surface and the water runs rough')] },
        duckweed: { duckweed: [tr('caption.duckweed', 'Duckweed'), tr('caption.duckweed-sub', 'In the shade of its fronds the producers go hungry')] },
        frost: { cooling: [tr('caption.frost.cooling', 'Nightfall'), tr('caption.frost.cooling-sub', 'The water chills toward freezing')], freezing: [tr('caption.frost.freezing', 'Ice'), tr('caption.frost.freezing-sub', 'Its fronts push cells into the veins of water between the grains')],
          frozen: [tr('caption.frost.frozen', 'Frozen'), tr('caption.frost.frozen-sub', 'Life waits in the veins of water between the ice grains')], thaw: [tr('caption.frost.thaw', 'Thaw'), tr('caption.frost.thaw-sub', 'The ice gives the pool back')] } };
      const [m, sb] = (EV[w.type] || {})[w.phase] || [tr('caption.pool', 'The pool'), ''];
      eyebrow = going ? tr('caption.heading', 'Heading to') : tr('caption.watching', 'Watching'); main = m; sub = going ? '' : sb;
    } else if (w.kind === 'linger') {
      const [fate, after] = fateOf(w.fate);
      eyebrow = tr('caption.linger', 'Lingering');
      // i18n: the camera stays where the cell it followed died: {name} its species (a link), {n} the cells of its body;
      // {fate} what became of it
      main = tr('caption.linger.main', '{body, select, many {A cell of the {n}-cell {name}} other {The {name} cell}} {fate, select, vanished {vanished} eaten {was eaten} old {died of old age} killed {was killed} other {starved}}', { body: w.cells > 1 ? 'many' : 'one', n: fmt(w.cells), name: spName(w.serial), fate });
      sub = after;
    } else return '';
    return `<div class="cap-eye">${eyebrow}</div><div class="cap-rule" aria-hidden="true"></div><div class="cap-main">${main}</div>${sub ? `<div class="cap-sub">${sub}</div>` : ''}`;
  }
  const capEl = $('caption');

  // ------------------------------------------------------------ live annotations
  // Notes on what is happening in view (src/notes.js says what, src/noteview.js draws it; docs/annotations.md): with
  // the auto camera (Settings → Display → Annotations), always, or never. While they show, the steps write each event
  // in view where it happens (eng.watchRect, sim.watch) and the view's cells are read back every few frames
  // (eng.notes); the notes are drawn on the overlay with the brackets, so a film keeps them.
  const noteSp = (slot) => {
    const g = genomeFor(slot);
    const sp = g && life.reg.get(g.serial);
    return sp ? { name: sp.name, guild: dietGuild(g), topt: g.topt ?? 19, tol: Math.max(g.tol ?? 7, 0.5), serial: g.serial, genus: sp.genus, genusName: sp.name.split(' ')[0], col: cssCol(g.col),
      // (its beat: how hard its cells beat, how often a second; and whether its bodies grow tails)
      beat: g.beat?.[0] ?? 0, beatHz: g.beat?.[1] ?? 0, tail: (g.tail?.[0] ?? 0) > 0 } : null;
  };
  const notes = new Notes({ species: noteSp, world: () => eng.grid });
  const noteView = createNoteView(octx);
  let notesShown = false, notesSince = 0, noteGridL = null, noteOpen = { l: 0, t: 0, r: innerWidth, b: innerHeight }, plateRect = null;
  eng.onNotes = (scan) => { if (!notesShown) return; const t0 = performance.now(); notes.ingest(scan); const ms = performance.now() - t0; notes.ms.ingest += ms; notes.worst('ingest', ms, { n: scan.n }); };
  const notesOn = () => state.ui && state.phase === 'running' && (state.notes === 2 || (state.notes === 1 && director.active));
  // the part of the window the world shows clear of the panels (CSS px)
  function openArea() {
    const top = railBottom;
    const l = lab.isOpen() && !phone() ? labRight() : phone() ? 0 : 40;
    return { l: l + 8, t: top + 8, r: innerWidth - specInset().right - 8, b: dockTop - 8 };
  }
  // each frame: the stretch of world to watch (the view and a margin), or none
  function watchNotes() {
    const on = notesOn();
    if (on !== notesShown) { notesShown = on; notes.reset(); notesSince = performance.now() / 1000; }
    if (!on) { eng.watchRect.fill(0); eng.notes = null; return; }
    const [W, H] = eng.grid, p = cssPPU(), m = 40 / p;
    const w = Math.min(W, innerWidth / p + 2 * m), h = Math.min(H, innerHeight / p + 2 * m);
    eng.watchRect.set([cam.x - w / 2, cam.y - h / 2, w, h]);
    // and its water, by squares fixed in the world (so they hold still as the view moves): a power of two units on a
    // side, 7 to 14 across the view's longer side, changed with a margin so a zoom that hovers at a step keeps them
    const need = Math.log2(Math.max(innerWidth, innerHeight) / p / 14);
    if (!(noteGridL >= need && noteGridL < need + 1.07)) noteGridL = Math.ceil(need);
    const s = 2 ** noteGridL;
    eng.noteGrid.set([(Math.floor(cam.x / s) - NOTE_TG / 2) * s, (Math.floor(cam.y / s) - NOTE_TG / 2) * s, s]);
    // (a wide view needs only a sample of its cells: its stories are its water's)
    eng.notes = { every: 6, cap: p < notes.T.wide ? 3000 : 16384 };
    eng.watchEv = notes.eventMask(p);
    eng.watchBites = Math.min(0xffffffff, Math.round(notes.biteKeep * 4294967296));
  }
  // where a cell last seen as s shows now: carried on by its own motion and (the living) the current, then through the water
  function noteProject(s, kind) {
    const [W, H] = eng.grid, g = kind >= FIRST_LIFE ? genomeFor(kind) : null;
    const dts = clamp((viewSimTime || eng.simTime) - s.t, -0.5, carryMax());
    const [fx, fy] = g ? flowAt(s.x, s.y, eng.simTime, eng.waves) : [0, 0], a = g ? g.advect : 0;
    const x = s.x + (s.vx + fx * a) * dts, y = s.y + (s.vy + fy * a) * dts;
    return toShown(((x % W) + W) % W, ((y % H) + H) % H);
  }
  const noteRadius = (kind) => { const g = kind >= FIRST_LIFE ? genomeFor(kind) : null; return Math.max(6, cellRadius({ role: 0 }, g, cssPPU()) * 1.25 + 2); };
  function noteVisible(x, y, m = 12) {
    const [sx, sy] = toScreen(x, y), o = noteOpen;
    return sx > o.l + m && sx < o.r - m && sy > o.t + m && sy < o.b - m;
  }
  // well inside the view: what a new note points at, so it stays in view long enough to read
  const noteInner = (x, y) => noteVisible(x, y, Math.min(90, 0.12 * Math.min(noteOpen.r - noteOpen.l, noteOpen.b - noteOpen.t)));
  // the view's middle half: what a note may begin on while the view zooms in (the rest will soon be out of it)
  const noteCentral = (x, y) => noteVisible(x, y, 0.25 * Math.min(noteOpen.r - noteOpen.l, noteOpen.b - noteOpen.t));
  const noteFlow = (x, y) => flowAt(x, y, eng.simTime, eng.waves);
  // the light at a world point, as the cells have it (lightAt in the shaders: the tide's bands under the sky and duckweed)
  const noteLight = (x, y) => { const [W, H] = eng.grid; return (eng.ambient + (1 - eng.ambient) * tideAt(x, y, W, H, eng.simTime, eng.tide, eng.tidePh) * eng.season) * eng.sky * (1 - duckShade(x, y, eng.duck, W, H)); };
  // how the camera moves, as the notes see it (eased): world units a real second, and how fast it zooms in
  const noteCam = { x: null, y: null, zoom: null, vel: [0, 0], zoomIn: 0 };
  // the duckweed's shade at a world point (0..1), when there is any
  const noteShade = (x, y) => { const [W, H] = eng.grid; return duckShade(x, y, eng.duck, W, H); };
  // raindrops fallen in the last moment and a half (eng.drops: x, y, when, size, four at a time), and how many in 30 s
  const noteDropsSeen = new Map();
  const noteDrops = () => {
    const out = [], t = eng.simTime;
    for (let k = 0; k < 4; k++) {
      const x = eng.drops[k * 4], y = eng.drops[k * 4 + 1], at = eng.drops[k * 4 + 2], sz = eng.drops[k * 4 + 3];
      if (!(sz > 0) || t - at < 0 || t - at > 1.5) continue;
      noteDropsSeen.set(at, t);
      out.push({ x, y, t: at, s: sz });
    }
    for (const [at] of noteDropsSeen) if (t - at > 30) noteDropsSeen.delete(at);
    return out;
  };
  let noteCap = null;
  // i18n: Live annotations: the tag on the frame's corner, what the camera is doing (the auto camera's kind of shot, or the viewer's own hand)
  const NOTE_MODE = { follow: tr('notes.mode.follow', 'FOLLOW'), linger: tr('notes.mode.linger', 'LINGER'), scene: tr('notes.mode.scene', 'SURVEY'), wide: tr('notes.mode.wide', 'WIDE'), event: tr('notes.mode.event', 'EVENT'),
    auto: tr('notes.mode.auto', 'AUTO'), observe: tr('notes.mode.observe', 'OBSERVE') };
  // the loupe on the screen while it shows (the annotations' marks under it are drawn magnified within it)
  let noteLens = null;
  function drawNotes(dtMs, L) {
    // (its middle, its radius, the main view's point under its middle, its magnification over the main view's)
    noteLens = L ? { x: L.sx, y: L.sy, r: L.R, c: toShown(L.cx, L.cy), k: L.cssPPU / cssPPU() } : null;
    const now = performance.now() / 1000, t0 = performance.now();
    noteOpen = openArea();
    const speed = state.paused ? 0 : state.speed === Infinity ? perf.rate || 16 : state.speed;
    const shot = director.active ? director.shot : null, flying = !!(shot && shot.t < shot.flight);
    const dts = Math.max(dtMs / 1000, 1e-3), [W, H] = eng.grid, C = noteCam;
    C.x ??= cam.x; C.y ??= cam.y; C.zoom ??= cam.zoom;
    const f = 1 - Math.exp(-dts / 0.2);
    C.vel = [C.vel[0] + (wrapD(cam.x - C.x, W) / dts - C.vel[0]) * f, C.vel[1] + (wrapD(cam.y - C.y, H) / dts - C.vel[1]) * f];
    C.zoomIn += (Math.log(cam.zoom / C.zoom) / dts - C.zoomIn) * f;
    C.x = cam.x; C.y = cam.y; C.zoom = cam.zoom;
    const list = notes.update({ now, speed, ppu: cssPPU(), phone: phone(), visible: noteVisible, inner: noteInner,
      camVel: C.vel, zoomIn: C.zoomIn, central: noteCentral, leaving: flying, flow: noteFlow, light: noteLight, shade: noteShade, drops: noteDrops, dropsIn30: () => noteDropsSeen.size,
      ahead: shot ? shot.dur - shot.t : Infinity,
      // (where the auto camera is flying to: the world it will show)
      dest: flying && shot.target ? { x: shot.target.x, y: shot.target.y, w: shot.target.w, h: shot.target.w * (noteOpen.b - noteOpen.t) / Math.max(1, noteOpen.r - noteOpen.l) } : null });
    const avoid = [];
    // (the caption's place, while it shows and while it is between one caption and the next)
    const cr = capEl.classList.contains('on') ? capEl.getBoundingClientRect() : null;
    if (cr && cr.width) noteCap = { l: cr.left - 8, t: cr.top - 8, r: cr.right + 8, b: cr.bottom + 8, at: now };
    if (noteCap && (cr?.width || (director.active && now - noteCap.at < 30))) avoid.push(noteCap);
    if (plateRect) avoid.push(plateRect);
    const sh = director.active ? director.shot : null;
    const mode = director.active ? NOTE_MODE[sh && sh.why && sh.why.kind] || NOTE_MODE.auto : NOTE_MODE.observe;
    noteView.draw({ now, dt: dtMs / 1000, ppu: cssPPU(), world: eng.grid, flow: noteFlow, shade: noteShade, lens: noteLens, notes: list, model: notes, species: noteSp, project: noteProject, radius: noteRadius,
      open: noteOpen, avoid, mode, pool: eng.tbg, phone: phone(), roster: true, since: notesSince, cap: cssPPU() >= notes.T.close ? 400 : 220 });
    const ms = performance.now() - t0;
    notes.ms.draw += ms;
    notes.worst('draw', ms, { ...(notes.ms.lastParts || {}) });
  }
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
    // centered in the part of the view the panels leave open
    const l = lab.isOpen() && !phone() && state.ui ? labRight() : 0;
    const r = specInset().right;
    const x = `${Math.round((l + innerWidth - r) / 2)}px`;
    if (capEl.style.left !== x) capEl.style.left = x;
  }

  function autoCamera(now, dt) {
    if (state.phase !== 'running') return;
    if (!director.active) {
      if (!state.auto) return;
      const reading = sel || spView != null || lab.isWide();
      if (state.paused || !introHidden || ptr.pointers.size || now - lastInput < (reading ? AUTO_IDLE_READING : AUTO_IDLE)) return;
      startAuto(true);
    }
    const v = director.update(dt / 1000);
    // the camera's subject stays marked through a follow and the linger after its death; other
    // shots drop it
    if (sel && sel.film) {
      const kind = director.shot && director.shot.why && director.shot.why.kind;
      if (!director.active || (kind !== 'follow' && kind !== 'linger')) deselect();
    }
    if (!v) return;
    const wMax = viewWidths()[1];
    cam.x = v.x; cam.y = v.y;
    cam.zoom = cam.zoomTarget = clamp(wMax / v.w, 1, maxZoom());
    cam.anchor = null;
  }

  // ------------------------------------------------------------ film
  // Filmed until stopped (R, the dock's button, the strip's Stop) or the film's limit (src/film.js, docs/
  // film.md); while it rolls, the strip under the rail counts its time and size and a red frame rings the
  // world (neither is in the film: it records the canvases only).
  const filmBtn = $('film'), recBar = $('recbar'), recFrame = $('recframe');
  const film = createFilm({
    canvas, overlay, caption: capEl,
    // the view at its full density, whatever the render scale is for the moment
    source: () => { const d = Math.min(devicePixelRatio || 1, 2); return [Math.round(innerWidth * d), Math.round(innerHeight * d)]; },
    audio: () => (sound.playing ? sound.stream() : null),
    // i18n: the film's title, burned in: the world's time (h:mm:ss) and its era
    title: () => tr('film.title', 'TIDEMOTE · {time} · {era}', { time: fmtClock(eng.simTime), era: eraName(climate.name) }),
    name: () => `tidemote-${fmtClock(eng.simTime).replace(/:/g, '-')}`,
    desktop: desk?.film || null,
    onChange: renderFilm,
    onSaved: (f) => {
      if (f.blob) saveFile(f.blob, f.name);
      // i18n: a film saved (or stopped at its limit), in the desktop app into its Videos folder; {size} its size
      flash(tr('flash.film-saved', '{why, select, limit {Film stopped at its limit} other {Film saved}}{where, select, videos { in Videos › Tidemote} other {}} · {size}', { why: f.why === 'limit' ? 'limit' : 'done', where: f.path ? 'videos' : 'download', size: fmtBytes(f.bytes) }));
    },
    onError: (m) => flash(m),
  });
  // the panels whose glass shows the view through it (the floating ones are opaque)
  const glass = trackGlass(['lab', 'spec', 'bench', 'held'].map($), canvas);
  let glassFilming = false;
  let filmArmedShot = null;
  // record now, or (the auto camera on) from the start of its next shot; again: stop
  function filmAct(how = director.active ? 'scene' : 'now') {
    if (!film.supported) { flash(tr('flash.film-unsupported', 'This browser cannot record the view')); return; }
    if (film.state === 'saving') return;
    if (film.state !== 'idle') { const was = film.state; film.stop(); if (was === 'armed') flash(tr('flash.film-called-off', 'Filming called off')); return; }
    if (how === 'scene') {
      if (!director.active) startAuto(false);
      filmArmedShot = director.shot ? director.shot.id : null;
      film.arm();
      flash(tr('flash.film-armed', 'Filming the camera’s next scene'));
    } else if (film.start()) { filmRaise(); flash(tr('flash.filming', 'Filming')); }
  }
  // a film begun with the canvas below its size: the canvas back up to it (and the full density, if need be)
  function filmRaise() {
    if (state.perf.scale !== 'auto') return;
    if (filmScale() > 1 - 1e-6) filmDense = true;
    const need = filmScale();
    if (need > renderScale + 0.01) { renderScale = SCALES.slice().reverse().find((x) => x >= need - 0.01) ?? 1; resetAdapt(); resizeDue = true; }
  }
  /** h:mm:ss, or m:ss under an hour. */
  const filmClock = (t) => { t = Math.floor(t); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`; };
  // i18n: a film's size, in megabytes or gigabytes
  function fmtBytes(b) { return b < 1e9 ? tr('film.mb', '{n} MB', { n: (b / 1e6).toFixed(b < 1e7 ? 1 : 0) }) : tr('film.gb', '{n} GB', { n: (b / 1e9).toFixed(b < 1e10 ? 2 : 1) }); }
  let recShown = '';
  function renderFilm() {
    const s = film.state;
    if (filmBtn) {
      filmBtn.classList.toggle('armed', s === 'armed');
      filmBtn.classList.toggle('rolling', s === 'recording' || s === 'saving');
      filmBtn.setAttribute('aria-pressed', String(s !== 'idle'));
      filmBtn.setAttribute('aria-label', s === 'idle' ? tr('dock.film.aria', 'Film') : s === 'armed' ? tr('dock.film.aria-armed', 'Waiting for the next scene: stop') : tr('dock.film.aria-rolling', 'Filming: stop'));
      filmBtn.dataset.hint = s === 'idle' ? (director.active ? tr('dock.film.hint-scene', 'Film from the next scene · R') : tr('dock.film.hint', 'Film · R')) : tr('dock.film.hint-stop', 'Stop · R');
      setLive($('film-v'), s === 'recording' || s === 'saving' ? filmClock(film.elapsed()) : s === 'armed' ? tr('dock.film-label-armed', 'Wait') : tr('dock.film-label', 'Film'));
    }
    if (!recBar) return;
    recBar.hidden = s === 'idle';
    recFrame.hidden = s !== 'recording';
    recBar.classList.toggle('standby', s === 'armed');
    recBar.classList.toggle('saving', s === 'saving');
    if (s !== recShown) {
      recShown = s;
      setLive($('rec-l'), s === 'armed' ? tr('film.state-armed', 'Standby') : s === 'saving' ? tr('film.state-saving', 'Saving') : tr('film.state', 'Recording'));
      setLive($('rec-stop-l'), s === 'armed' ? tr('film.stop-label-armed', 'Cancel') : tr('film.stop-label', 'Stop'));
      $('rec-stop').disabled = s === 'saving';
      $('rec-stop').setAttribute('aria-label', s === 'armed' ? tr('film.stop.aria-armed', 'Stop waiting for the next scene') : tr('film.stop.aria', 'Stop filming'));
    }
    if (s === 'idle') { if (filmDense) { filmDense = false; resizeDue = true; } return; }
    setLive($('rec-t'), s === 'armed' ? tr('film.next-scene', 'Next scene') : filmClock(film.elapsed()));
    const b = film.bytes(), cap = film.limit(), left = film.left();
    setLive($('rec-mb'), s === 'armed' ? '' : fmtBytes(b));
    const near = s === 'recording' && left < 300;
    $('rec-left').hidden = !near;
    // i18n: the film stops itself at its limit in {t} (m:ss)
    if (near) setLive($('rec-left'), tr('film.limit-in', 'Limit in {t}', { t: filmClock(left) }));
    recBar.classList.toggle('near', s === 'recording' && left < 60);
    if (s === 'recording' && Number.isFinite(cap)) {
      // i18n: the film's size's hint: where it goes as it is made, the size it stops itself at ({cap}), and when ({left}, a duration)
      $('rec-mb').dataset.hint = tr('film.size.hint-limit', "The film's size so far, {sink, select, desktop {written to Videos › Tidemote as it is made} disk {written to disk as it is made, downloaded when it ends} memory {kept in memory until it ends} other {}}. It stops itself at {cap}{soon, select, yes {, about {left} from now} other {}}.",
        { sink: film.sink() || 'none', cap: fmtBytes(cap), soon: Number.isFinite(left) ? 'yes' : 'no', left: Number.isFinite(left) ? fmtDur(left) : '' });
    }
  }
  if (film.supported && filmBtn) { filmBtn.hidden = false; filmBtn.addEventListener('click', () => filmAct()); renderFilm(); }
  $('rec-stop')?.addEventListener('click', () => filmAct());
  // the private files may hold a film from before (being downloaded, or cut off by a closed tab)
  clearFilms();
  // each frame: an armed film starts with the camera's next shot, and a rolling one counts up
  let filmShownAt = 0;
  function filmTick() {
    if (film.state === 'armed') {
      const sh = director.active ? director.shot : null;
      if (!director.active || (sh && sh.id !== filmArmedShot && sh.type !== 'settle')) { if (film.start()) filmRaise(); }
    }
    const now = performance.now();
    if (film.state !== 'idle' && now - filmShownAt > 250) { filmShownAt = now; renderFilm(); }
  }

  // ------------------------------------------------------------ loop
  let last = performance.now();
  let frameCount = 0;
  let lastPanels = 0;
  let inflight = 0;
  // Firefox learns that GPU work is done only when the page submits again or on a 100 ms timer (bug 1870699):
  // with two frames in flight the next frame waits on the last, so it waited for that timer, and frames done in
  // 4 ms were seen done after 19 (p90 32; at Max p90 87, p99 113), which held real time at 51 fps and Max at
  // 30. While frames are in flight it is nudged with empty submits every few ms. Other browsers see their work
  // done at once and are left alone.
  const nudgeGPU = /Firefox\//.test(navigator.userAgent);
  let nudging = false;
  const nudge = () => {
    if (!nudgeGPU || nudging) return;
    nudging = true;
    const tick = () => {
      if (!inflight) { nudging = false; return; }
      try { device.queue.submit([]); } catch { nudging = false; return; }
      setTimeout(tick, 2);
    };
    setTimeout(tick, 2);
  };
  let shownFrame = null; // the camera and moment of the world frame the GPU finished last
  // The simulation clock, after Glenn Fiedler's "Fix Your Timestep!": real time, from the vsync-aligned
  // requestAnimationFrame timestamps, times the speed is owed to the simulation, and each drawn frame
  // pays all of it in equal steps of at most about 1/60 s (his semi-fixed variant: the renderer draws
  // only the current state, so whole steps alone would judder). So ×1 is real time at any refresh or
  // frame rate, and motion stays smooth. A tick owes at most 0.1 s (a stalled or hidden tab is
  // skipped, not replayed), and what a frame's budget cannot fit is dropped, not carried, so a slow
  // GPU runs slow instead of spiralling.
  const clock = { owed: 0, lastT: 0 };
  function tickClock(now) {
    const real = clock.lastT ? Math.min(0.1, (now - clock.lastT) / 1000) : 0;
    clock.lastT = now;
    if (state.phase === 'running' && !state.paused && !state.busy && state.speed !== Infinity) clock.owed += real * state.speed;
  }
  // steps a frame may take within ms of GPU time
  const stepCap = (ms) => {
    const S = perf.simS || perf.stepMs, R = perf.simS ? perf.renderR : 0;
    return S ? clamp(Math.floor((ms - R) / S), 1, 512) : 4;
  };
  // Max: the world is drawn about every MAX_FRAME_MS, but the camera, loupe and HUD keep the display's
  // rate. Each display frame's GPU time, the whole display interval, goes to steps of m ticks, less the
  // cost of drawing the world when it is due (else of carrying the last drawn image with the camera).
  // Up to two frames queue, so the GPU never waits on the page between them.
  function maxPlan(now, m) {
    const world = fastMode || now - perf.worldAt >= MAX_FRAME_MS;
    if (world) perf.worldAt = now;
    const dt = m * H, S = fastCost();
    const cost = world ? perf.renderR : perf.presentR || 0.3;
    if (!S) return { steps: 4, dt, world };
    // whole steps only; the fraction left over carries to the next frame, so a step that costs a good
    // part of the interval doesn't leave the GPU idle for the rest of it
    perf.stepCredit = Math.min(perf.stepCredit + ((perf.budget || frameTarget()) - cost) / S, MAX_STEPS);
    const steps = clamp(Math.floor(perf.stepCredit), 1, MAX_STEPS);
    perf.stepCredit = clamp(perf.stepCredit - steps, 0, 1);
    return { steps, dt, world };
  }
  // A fast speed held (drawn as at Max), in steps of m ticks: the steps owed, whole ones (the remainder
  // carries), as many as the frame's budget fits; the speed falls short when even that is too little.
  function coarsePlan(now, m) {
    const world = now - perf.worldAt >= MAX_FRAME_MS;
    if (world) perf.worldAt = now;
    const dt = m * H, S = fastCost();
    // the frame's budget in steps, its fraction carried as at Max
    perf.stepCredit = S ? Math.min(perf.stepCredit + ((perf.budget || frameTarget()) - (world ? perf.renderR : perf.presentR || 0.3)) / S, MAX_STEPS) : 4;
    const cap = Math.max(1, Math.floor(perf.stepCredit));
    let steps = Math.floor(clock.owed / dt);
    // beyond the budget a couple of steps stay owed, to even out whole steps; the rest is dropped
    if (steps > cap) { steps = cap; clock.owed = Math.min(clock.owed - steps * dt, 2 * dt); } else clock.owed -= steps * dt;
    // what the budget left unused is not saved up: only its fraction carries (saved up, it once came
    // due all at once on a switch to Max, hundreds of steps in one submit)
    perf.stepCredit = clamp(perf.stepCredit - steps, 0, 1);
    return { steps, dt, world };
  }
  // This frame's steps, or null to only draw (too little owed to be worth a step)
  function plan(now) {
    if (state.paused || state.phase !== 'running') { clock.owed = 0; return { steps: 1, dt: H }; }
    if (state.speed === Infinity) return maxPlan(now, perf.ticks);
    if (perf.held) return coarsePlan(now, perf.ticks);
    // at real time or slower a frame's steps fit in its own interval, so a late frame can't overrun the next
    const cap = stepCap(state.speed > 1 ? MAX_FRAME_MS : frameTarget());
    if (clock.owed < H * 0.2) return null;
    // slower than real time: one short step a frame, so slow motion stays smooth
    if (state.speed < 1) {
      const n = Math.min(cap, Math.ceil(clock.owed / H - 0.05));
      const dt = Math.min(clock.owed / n, H);
      clock.owed = 0;
      return { steps: n, dt };
    }
    // Whole steps, the remainder carried: split evenly, a frame a vsync late (175 Hz: 1.37 ticks) took
    // two steps of 0.69 ticks, twice the GPU time for the same time simulated, which made the next
    // frame late too. A step stretches by up to a tenth to keep the motion with the clock (58.3 fps
    // frames on a 60 Hz tick); a frame takes two only once it owes 1.75.
    const most = H * (state.speed === 1 ? stepTicks() : state.speed > 1 ? perf.ticks : 1);
    let n = Math.floor(clock.owed / most + 0.25);
    if (n === 0) return null;
    n = Math.min(n, cap);
    // (coarse steps keep their length, the remainder carried: stretched, 6 ticks became 7)
    const dt = most > H * 1.5 ? most : clamp(clock.owed / n, most * 0.9, most * 1.1);
    clock.owed = clamp(clock.owed - n * dt, -0.25 * most, most);
    return { steps: n, dt };
  }
  const rafDt = [];
  function frameWork(now) {
    const t0 = performance.now();
    const dt = Math.min(100, now - last);
    last = now;
    frameCount++;
    if (resizeDue) { resizeDue = false; fit(); }
    // the display's own frame interval, for the "Display" target and for pacing: the median of the
    // intervals near the shortest, as requestAnimationFrame can skip vsyncs but never beat them, and a
    // longer one only once it has held for several windows (a display's rate rarely changes). While
    // the GPU or the page lags, rAF fires every other vsync for seconds at a time, and the median of
    // them all read a 175 Hz display as 88 Hz: the frame rate aimed for became 88 fps (16.7 / 11.4
    // rounds to one frame), and the adaptation, judging 60 fps frames late against it, cut the frame rate.
    // Firefox at times runs two callbacks back to back (0.02 ms apart): no display refreshes within 2 ms,
    // and taken for its interval they had the frame rate cut to 10 fps.
    if (dt >= 2) rafDt.push(dt);
    if (rafDt.length >= 60) {
      rafDt.sort((a, b) => a - b);
      perf.rafMed = rafDt[rafDt.length >> 1]; // the pace the browser hands out frames at (adaptQuality)
      const lo = rafDt[Math.floor(rafDt.length * 0.1)];
      const ms = median(rafDt.filter((x) => x < lo * 1.4));
      // A longer interval is the display's only while the page could have kept the shorter one: when
      // the GPU, or this page's own work on the main thread, fills most of it, the browser slows
      // requestAnimationFrame to the page's pace, and taken for the display's rate that pace became
      // the rate aimed for (a 60 Hz display read as 20 Hz after the warm-up's fast steps aimed for 20 fps,
      // and 20 fps at full resolution never looked late). Fast speeds fill every frame on purpose.
      const loaded = state.speed > 1 || perf.gpu > ms * 0.75 || perf.mainMs > ms * 0.75;
      if (!perf.rafMs || ms < perf.rafMs * 1.2) { perf.rafMs = ms; perf.rafLonger = 0; }
      else if (loaded) perf.rafLonger = 0;
      else if (++perf.rafLonger >= 5) { perf.rafMs = ms; perf.rafLonger = 0; }
      rafDt.length = 0;
    }
    tickClock(now);
    updateSpeedCap(now);
    updateWarm();
    updateTicks(now);
    // a frame every frameEvery() display frames (half a display frame's slack absorbs the jitter)
    const due = !perf.lastSubmit || now - perf.lastSubmit >= frameTarget() - displayMs() / 2;
    if (now - perf.fpsT > 500) { perf.fps = (perf.frames * 1000) / (now - perf.fpsT); perf.worldFps = (perf.worldFrames * 1000) / (now - perf.fpsT); perf.frames = perf.worldFrames = 0; perf.fpsT = now; }
    if (now - perf.rateT > 1000) {
      const r = (eng.simTime - perf.rateSim) / ((now - perf.rateT) / 1000);
      perf.rate = r >= 0 ? r : perf.rate;
      // steps taken a second (a world loaded meanwhile starts its count again)
      const st = (eng.frameNo - perf.rateSteps) / ((now - perf.rateT) / 1000);
      perf.stepsS = st >= 0 ? st : perf.stepsS;
      perf.rateSim = eng.simTime; perf.rateSteps = eng.frameNo; perf.rateT = now;
    }
    for (let i = frameWaiters.length - 1; i >= 0; i--) if (--frameWaiters[i].n <= 0) { frameWaiters[i].res(); frameWaiters.splice(i, 1); }

    // Two frames in flight keep the GPU fed without queueing more of its time ahead of everything else
    // (on a phone the compositor shares the GPU: a deep queue of long frames starves the whole screen).
    if (due && inflight >= 2) perf.gpuHeld = true;
    if (!state.busy && inflight < 2 && due) {
      perf.frames++;
      if (perf.lastSubmit) perf.frameDt.push(Math.min(Math.max(50, frameTarget() * 2.5), now - perf.lastSubmit));
      // Fast speeds fill a frame with the GPU time it has. When the browser hands out frames more slowly than
      // the display's rate (Firefox's vsync ran every second vblank, 31 ms, for minutes at a time), a frame
      // planned for one interval left the GPU idle for the next and Max ran at 60% of its speed: a frame
      // that comes over 1.5 intervals after the last, while the GPU wasn't what held it, has the time that
      // passed (at most two intervals).
      const T = frameTarget(), gap = perf.lastSubmit ? now - perf.lastSubmit : T;
      perf.budget = !perf.gpuHeld && gap > 1.5 * T ? Math.min(gap, 2 * T) : T;
      // (the time since the last frame drawn, not the last display frame: below the display's rate, or with the GPU
      // behind, display frames go by undrawn, and what eases by the frame's time here eased at half speed)
      const fdt = Math.min(100, gap);
      perf.gpuHeld = false;
      perf.lastSubmit = now;
      eng.season = seasonAt(eng.simTime);
      const step = plan(now) || { steps: 0, dt: H };
      // the census (naming and lineage) at most about five times a real second, however fast the world runs
      eng.censusEvery = Math.max(20, Math.round((step.steps * 1000) / frameTarget() / 5));
      // Coarse steps drawn every frame are drawn in between (LERP_WGSL): one step behind, part way along the
      // last step, as far as the time owed to the clock has reached into the next one, or at Fast (paced by
      // the GPU, not the clock) the share of the next step the frame's budget has already earned.
      if (step.steps > 0) { perf.lerpDt = step.dt; perf.lerpTicks = Math.round(step.dt * 60); }
      const lerpOn = !state.paused && state.phase === 'running' && perf.lerpTicks > 1
        && (state.speed === Infinity ? fastMode : !perf.held);
      eng.lerp = lerpOn ? clamp(state.speed === Infinity ? perf.stepCredit : clock.owed / perf.lerpDt, 0, 1) : null;
      // (the moment the frame shows: behind the steps' end when drawn in between)
      viewSimTime = eng.simTime + (state.paused ? 0 : step.steps * step.dt) - (eng.lerp != null ? (1 - eng.lerp) * perf.lerpDt : 0);
      if (state.phase === 'running' && !state.paused) climate.tick(step.steps * step.dt);
      autoCamera(now, dt);
      renderCaption(now);
      // and the pointer hides once the mouse has rested a few seconds
      document.body.classList.toggle('cursor-off', director.active && now - lastPtr.moved > CURSOR_REST);
      rideCamera(fdt);
      if (state.follow && sel) {
        const [px, py] = predicted();
        const [ox, oy] = viewOffset();
        // (a ride's first second pans in more gently, as its zoom dives)
        const k = Math.min(1, fdt / (ride.cam && ride.cam.t < 1 ? 70 + 130 * (1 - ride.cam.t) : 70));
        cam.x += wrapD(px + ox - cam.x, eng.grid[0]) * k;
        cam.y += wrapD(py + oy - cam.y, eng.grid[1]) * k;
      }
      if (Math.abs(cam.zoom - cam.zoomTarget) > 1e-4) {
        const a = state.follow && sel ? toScreen(sel.disp[0], sel.disp[1]) : cam.anchor || [innerWidth / 2, innerHeight / 2];
        const before = toWorld(a[0], a[1]);
        cam.zoom += (cam.zoomTarget - cam.zoom) * Math.min(1, fdt / 90);
        const after = toWorld(a[0], a[1]);
        cam.x += before[0] - after[0]; cam.y += before[1] - after[1];
      }
      wrapCam();
      const L = loupeGeom();
      const R = reticleAt();
      canvas.classList.toggle('lens', !!L || !!R);
      steerRide(fdt);
      pullTick(now);
      // (the lamp, shade, stage and probe follow the pointer over the world, a little of them, until pressed)
      if (R) hand.hover(...toWorld(R.sx, R.sy)); else hand.hover(null);
      hand.update(dt / 1000, eng.simTime);
      hearHand(R, dt / 1000);
      showInstrument(R, dt / 1000);
      drawBore(R, dt);
      // the warm stage and the cold probe show the water's warmth inside their reach
      if (R && (hand.tool === 'warm' || hand.tool === 'cold') && K.heat) eng.lens.set([...toWorld(R.sx, R.sy), (1.5 * R.r) / cssPPU(), 1]);
      else eng.lens.fill(0);
      eng.trackId = sel && !sel.lost ? sel.id : NONE;
      eng.trackId2 = director.active ? director.trackId : NONE;
      watchNotes();
      watchMarks(performance.now());
      eng.mindId = sel && !sel.lost && !sel.film && sel.particle.kind >= FIRST_LIFE && specimen.isOpen() && state.ui ? sel.id : NONE;
      // The overlay is drawn now, but the world it marks reaches the screen only when the GPU has drawn
      // it, frames behind while frames queue (and the camera may be moving, following a cell). So while
      // frames are in flight it is drawn with the camera and moment of the world frame last finished.
      const cur = { x: cam.x, y: cam.y, zoom: cam.zoom, t: viewSimTime };
      const seen = inflight && shownFrame ? shownFrame : cur;
      Object.assign(cam, { x: seen.x, y: seen.y, zoom: seen.zoom }); viewSimTime = seen.t;
      drawOverlay(dt, inflight && shownFrame ? loupeGeom() : L);
      Object.assign(cam, { x: cur.x, y: cur.y, zoom: cur.zoom }); viewSimTime = cur.t;
      specimen.drawViewerUI(now);
      specimen.mindTick(now);
      // Max and coarse speeds draw the world only when due (step.world), carrying it with the camera between
      const hold = (state.speed === Infinity || perf.held) && !state.paused && state.phase === 'running' ? !!step.world : null;
      if (hold !== false) perf.worldFrames++;
      // the translucent panels' frosted glass (src/glass.js), none in a film, which copies the view without the panels
      const filming = film.state === 'recording';
      if (filming !== glassFilming) { glassFilming = filming; glass.mark(); }
      const g = glass.poll();
      if (g) eng.setGlass(filming ? [] : g.rects, g.sigma);
      const frameTex = ctx.getCurrentTexture();
      eng.frame({
        target: frameTex.createView(),
        targetTex: frameTex,
        cam: { x: cam.x, y: cam.y, ppu: ppu() },
        paused: state.paused || !step.steps,
        simDt: step.dt,
        steps: step.steps,
        time: now / 1000,
        dpr,
        selId: sel ? sel.id : NONE,
        loupe: L ? { x: L.sx * dpr, y: L.sy * dpr, r: L.R * dpr, ppu: L.cssPPU * dpr, cx: L.cx, cy: L.cy } : null,
        // the close-up only when the world is drawn: a canvas not given a new texture keeps its last image
        // (a portrait takes the close-up's place for one frame)
        specimen: hold === false ? null : portraitParams() || specimenParams(),
        hold,
      });
      // (the needle and the rod sweep from here on)
      if (step.steps && !state.paused) hand.stepped();
      if (portraitJob?.drawn) readPortrait();
      // a film copies the world's canvas while its texture is current
      film.frame();
      inflight++;
      nudge();
      const sent = cur;
      device.queue.onSubmittedWorkDone().then(() => { inflight--; shownFrame = sent; }, () => { inflight--; });
      if (sel && frameCount % 10 === 0 && !state.paused) gatherTick(false);
    }
    filmTick();
    // The panels at most 60 times a second, whatever the GPU's pace: on a fast display (144, 175 Hz) each
    // update had the browser restyle, lay out, repaint and composite the page three times a frame of the
    // world, which on some machines delayed the display's frames enough to hold the frame rate at 15 fps.
    if (now - lastPanels >= 15) {
      lastPanels = now;
      if (dirty && (sel || spView != null)) renderSpecimen(false);
      if (specimen.isOpen()) specimen.songTick(performance.now(), songEvents);
      if (cards.isOpen()) cards.songTick(performance.now(), songEvents);
      renderFeed();
      lab.render(false);
      if (state.phase === 'running') updateHud(now);
    }
    adaptQuality(now);
    tuneProfile(now);
    perf.mainMs += (performance.now() - t0 - perf.mainMs) * 0.1;
  }
  // An error in a frame used to end the loop without a word: the world froze and the music played on.
  // Now it says so and offers what can be done. The world itself lives on the GPU, untouched, so going
  // on often works (an error in the page's bookkeeping), and saving it first keeps it either way.
  let lastStop = -Infinity;
  function frame(now) {
    pageFrame++;
    try { frameWork(now); } catch (e) { stopped(e); return; }
    requestAnimationFrame(frame);
  }
  function stopped(e) {
    console.error('[tidemote] the world stopped:', e);
    const again = performance.now() - lastStop < 15000; // going on failed at once: don't offer it again
    lastStop = performance.now();
    const go = () => { $('nogpu').hidden = true; last = performance.now(); requestAnimationFrame(frame); };
    // (a report for the developers, in English whatever the page's language)
    const report = () => `${e && e.stack || e}\n\nTidemote ${SAVE_VERSION} · world time ${fmtClock(eng.simTime)} · ${eng.count} particles · ${navigator.userAgent}`; // i18n-ignore
    // i18n: the error screen: {why} what went wrong (the browser's or the code's words, English), {time} the world's time (h:mm:ss)
    fail(tr('err.stopped', 'The world stopped'), tr('err.stopped.detail', 'Something went wrong while running it: {why}. It stopped at {time} of world time.', { why: String(e && e.message || e), time: fmtClock(eng.simTime) }), [
      ...(again ? [] : [{ label: tr('err.go-on', 'Try to go on'), run: go }]),
      { label: tr('err.save', 'Save this world'), run: async (b) => {
        b.disabled = true; b.textContent = tr('err.saving', 'Saving…');
        // i18n: the name of a world saved from the error screen: its era's name and its age (a duration)
        try { await saveWorld(tr('err.saved-name', '{era} · {age} (stopped)', { era: eraName(climate.name), age: fmtDur(eng.simTime) })); b.textContent = tr('err.saved', 'Saved to Settings → Worlds'); }
        catch (err) { console.error('[tidemote] saving the stopped world:', err); b.textContent = tr('err.save-failed', 'Could not save: {why}', { why: String(err.message || err) }); }
      } },
      { label: tr('err.new-world', 'Start a new world'), run: () => { seedWorld(eng.count); sound.overture(); go(); } },
      { label: tr('err.copy', 'Copy details'), run: (b) => navigator.clipboard.writeText(report()).then(() => { b.textContent = tr('err.copied', 'Copied'); }, () => { b.textContent = tr('err.copy-failed', 'Could not copy'); }) },
    ]);
  }

  resetLife();
  resetClimate();
  requestAnimationFrame(frame);

  // Hidden, the page draws nothing (requestAnimationFrame stops) and the soundtrack fades out.
  document.addEventListener('visibilitychange', () => {
    perf.frameDt.length = 0; perf.lastSubmit = 0; perf.lastAdjust = performance.now() + 1500;
    sound.away(document.hidden);
  });
  // a handle for tools/perf, which profiles the page in a real browser
  globalThis.__tidemote = { state, cam, perf, eng, notes, noteView, sound, lab, life: () => life, climate: () => climate, renderScale: () => renderScale, maxZoom, setSpeed, findMember, deselect,
    chron, cards, film, filmAct, openSpecies, director, saveWorld, worlds: worldStore, boot: bootTimes, pruned,
    setScale(v) { state.perf.scale = v; if (v !== 'auto') renderScale = v; resetAdapt(); fit(); },
    // the tuner's knobs' levels; setEffects('low' | 'high' | 'auto') fixes them all cheapest or best, or leaves them to Auto
    effects: () => Object.entries(tune).map(([id, k]) => `${id}:${k.level}`).join(' '),
    setEffects(v) {
      // (the dressing's: the neighbors are Settings → Neighbors')
      for (const id of Object.keys(TUNE_TITLES)) state.perf.tune[id] = v === 'auto' ? 'auto' : v === 'low' ? 0 : KNOBS[id].levels.length - 1;
      for (const id of Object.keys(TUNE_TITLES)) if (v === 'auto') tune[id].level = KNOBS[id].levels.length - 1;
      applyTune(); resetAdapt();
    },
    // knobs fixed at levels of their own ({ id: index | 'auto' }; the rest as they are)
    setTune(o) {
      for (const [id, v] of Object.entries(o)) { if (id in state.perf.tune) state.perf.tune[id] = v; if (v !== 'auto') tune[id].level = v; }
      applyTune(); resetAdapt();
    },
    // as the adaptive scale does it: applied when the next frame begins
    queueScale(v) { renderScale = v; resizeDue = true; },
    // a world saved by eng.readState(), in place of this one
    loadWorld: applyWorld, hand, loadCard, saveCard, cabinet,
    // the look, for the tools (until the Display settings next set it): tunables over Darkfield's at a strength, or off
    look: { set: (p = {}, strength = 1) => applyLook({ ...DARKFIELD, ...p }, strength), off: () => applyLook(DARKFIELD, 0) },
    // a .tidemote file's bytes, as Settings → Worlds opens one
    openWorld: async (bytes) => loadWorld(await openWorld(bytes)),
    // riding, for tools/ridelab.mjs: its state, the specimen, the body traced
    ride: { state: ride, sel: () => sel, members: () => members, viewShort } };

  calibrate().then(() => {
    state.phase = 'running';
    bootTimes.running = Math.round(performance.now());
    renderWorld();
    updateHud(performance.now() + 1000);
    $('intro').classList.add('ready');
    menu.ready();
  }).catch((e) => fail(tr('err.start', 'Could not start the simulation'), String(e.message || e), [RELOAD]));
}

// A card's link opened (a phone's camera on a card's QR code): the card first, drawn without the GPU, its sigil for
// its portrait; then, where there is a GPU, its species drawn alone in the studio (studiorender.js: a few pipelines
// of the page's, on a device of its own) and the card drawn again with it. The world starts, its shaders compiling,
// only once the card is put aside, and the card goes into the cabinet then (run), as it was drawn by then.
// (its PNG kept for the cabinet)
let linkedPng = null;
// a card from another world (its payload's bytes) drawn from its genome alone, as a PNG that carries it (portrait:
// its species drawn alone, else its sigil stands in)
async function strangerPng(bytes, portrait = null) {
  const c = decodeCard(bytes);
  const cv = await strangerCard({ ...c, genome: genomeOfWords(c.words) }, cardLink(bytes), DEFAULT_K, portrait);
  const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
  return cardIntoPng(new Uint8Array(await blob.arrayBuffer()), bytes);
}
// the card page's word on its portrait (under the card, never on it): each stage as it goes, then a moment of
// done; or why it is drawn with its sigil, the error in its hint
// i18n: a card's link opened: the stages of drawing its species' portrait, shown under the card as each begins (linked.portrait.step)
const PORTRAIT_STEPS = { gpu: tr('linked.portrait.gpu', 'Looking for a GPU'), compile: tr('linked.portrait.compile', 'Compiling the studio'), draw: tr('linked.portrait.draw', 'Drawing its portrait') };
function portraitStatus(state, text, hint = '') {
  const el = $('linked-status');
  el.dataset.state = state;
  el.querySelector('span').textContent = text;
  // (a term: its hint opens on a hover, a tap or focus)
  if (hint) el.dataset.hint = hint; else delete el.dataset.hint;
  el.classList.toggle('term', !!hint);
  el.tabIndex = hint ? 0 : -1;
}
async function linkedCard(bytes) {
  const c = decodeCard(bytes);
  const img = $('linked-img');
  let url = null, left = false;
  const show = (png) => {
    linkedPng = png;
    if (url) URL.revokeObjectURL(url);
    img.src = url = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
  };
  show(await strangerPng(bytes));
  // i18n: a card's link opened: {name} its species
  img.alt = tr('linked.img.alt', 'The species card of {name}', { name: c.name });
  $('linked-h').textContent = c.name;
  $('linked-note').textContent = tr('linked.note', 'A species from {home}. Open Tidemote to keep its card in your cabinet and set it down in a world of your own.', { home: eraName(c.home) });
  // i18n: a card's file name when its species' name has no letters to keep
  $('linked-png').onclick = () => saveFile(new Blob([linkedPng], { type: 'image/png' }), `${c.name.replace(/[^\w -]+/g, '').trim() || tr('linked.file-name', 'species')}.png`);
  pageTips();
  $('linked').hidden = false;
  // (its portrait, while the card is shown; what comes after it is put aside is let go)
  const g = genomeOfWords(c.words), steps = Object.keys(PORTRAIT_STEPS);
  studioPortrait(Uint32Array.from(c.words), g, portraitCells(g, c.body), (k) => { if (!left) portraitStatus('busy', tr('linked.portrait.step', '{step} ({n} of {of})', { step: PORTRAIT_STEPS[k], n: steps.indexOf(k) + 1, of: steps.length })); })
    .then(async (px) => {
      if (left) return;
      const bmp = await createImageBitmap(new ImageData(px.data, px.w, px.h));
      const png = await strangerPng(bytes, bmp);
      bmp.close();
      if (left) return;
      show(png);
      portraitStatus('done', tr('linked.portrait.done', 'Portrait drawn'));
    })
    .catch((e) => {
      console.warn('[tidemote] the linked card\'s portrait:', e);
      // i18n: a card's link opened and its portrait not drawn: why its sigil stands in, and in its hint, how a portrait is drawn and the error ({error})
      if (!left) portraitStatus('fail', e?.noGpu ? tr('linked.portrait.no-gpu', 'Its sigil stands in: no GPU here to draw its portrait') : tr('linked.portrait.failed', 'Its sigil stands in: its portrait could not be drawn'),
        tr('linked.portrait.fail-hint', 'Its portrait is drawn on the GPU, through WebGPU.\n{error}', { error: e?.message || e }));
    });
  await new Promise((res) => { $('linked-go').onclick = res; });
  left = true;
  $('linked').hidden = true;
  URL.revokeObjectURL(url);
}
// the page's hints (tip.js), made once: the card page's before the world runs, then the world's
let tipsMade = null;
const pageTips = () => (tipsMade ??= createTips($('tip')));
async function start() {
  const bytes = cardFromHash(location.hash);
  if (bytes) {
    // (a card refused, or not drawn, says why once the world runs)
    try { await linkedCard(bytes); } catch (e) { console.warn('[tidemote] the linked card:', e); $('linked').hidden = true; }
  }
  await boot();
}
start().catch((e) => fail(tr('err.boot', 'Something went wrong starting the GPU'), String((e && e.message) || e)));
