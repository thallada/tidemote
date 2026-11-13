// Summarize a Chrome trace and JS profile that bench.mjs took (a scenario's `trace`): the page's main thread frame by
// frame (requestAnimationFrame callbacks, other tasks, GC, style/layout/paint), its longest tasks and what ran in them,
// the GPU process's main thread, Chrome's frames presented or dropped, and the JS functions that took the most time.
//
//   node tools/perf/trace.mjs runs/perf/x-w32k-fit.trace.json [--top 25]
//
// (the .cpuprofile beside it, of the same stem, is read too when there)
import fs from 'node:fs';
import { parseArgs } from 'node:util';

const { values: v, positionals } = parseArgs({ allowPositionals: true, options: { top: { type: 'string', default: '25' }, json: { type: 'boolean' } } });
const TOP = +v.top;
const q = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f1 = (x) => +x.toFixed(2);
const dist = (a) => ({ n: a.length, mean: f1(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)), p50: f1(q(a, 0.5)), p95: f1(q(a, 0.95)), p99: f1(q(a, 0.99)), max: f1(q(a, 1)) });

for (const file of positionals) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ev = raw.traceEvents || raw;
  const names = new Map(), procs = new Map();
  for (const e of ev) if (e.ph === 'M') {
    if (e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
    if (e.name === 'process_name') procs.set(e.pid, e.args.name);
  }
  // complete events by thread (B/E pairs folded into X)
  const byThread = new Map(), open = new Map();
  for (const e of ev) {
    const k = `${e.pid}:${e.tid}`;
    let x = null;
    if (e.ph === 'X') x = { name: e.name, ts: e.ts, dur: e.dur || 0, args: e.args };
    else if (e.ph === 'B') { (open.get(k) || open.set(k, []).get(k)).push(e); continue; } else if (e.ph === 'E') {
      const b = open.get(k)?.pop(); if (!b) continue; x = { name: b.name, ts: b.ts, dur: e.ts - b.ts, args: b.args };
    } else continue;
    (byThread.get(k) || byThread.set(k, []).get(k)).push(x);
  }
  const threadsNamed = (n) => [...byThread.keys()].filter((k) => names.get(k) === n).sort((a, b) => byThread.get(b).length - byThread.get(a).length);
  const mainK = threadsNamed('CrRendererMain')[0];
  if (!mainK) { console.log(`${file}: no renderer main thread`); continue; }
  const all = byThread.get(mainK).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const t0 = all[0].ts, t1 = all.reduce((m, e) => Math.max(m, e.ts + e.dur), 0), span = (t1 - t0) / 1e3;
  const TOPLEVEL = new Set(['ThreadControllerImpl::RunTask', 'RunTask', 'ThreadPool_RunTask']);
  // (the outermost of nested task events: RunTask and ThreadControllerImpl::RunTask wrap the same task)
  const tasks = [];
  { let end = -1; for (const e of all) if (TOPLEVEL.has(e.name) && e.ts >= end) { tasks.push(e); end = e.ts + e.dur; } }
  // each task's children: the events within it on the thread
  const kids = (t) => {
    let lo = 0, hi = all.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (all[mid].ts < t.ts) lo = mid + 1; else hi = mid; }
    const out = [];
    for (let i = lo; i < all.length && all[i].ts <= t.ts + t.dur; i++) { const e = all[i]; if (e !== t && e.ts + e.dur <= t.ts + t.dur + 1 && !TOPLEVEL.has(e.name)) out.push(e); }
    return out;
  };
  const CLASS = [
    ['raf', (n) => n === 'FireAnimationFrame'], ['timer', (n) => n === 'TimerFire'], ['event', (n) => n === 'EventDispatch'],
    ['gc', (n) => /^(MinorGC|MajorGC|V8\.GC_(SCAVENGER|MARK_COMPACTOR|MC_)|BlinkGC\.|ThreadState::)/.test(n) && !/_BACKGROUND/.test(n)],
    ['style', (n) => n === 'UpdateLayoutTree' || n === 'RecalculateStyles'], ['layout', (n) => n === 'Layout'],
    ['paint', (n) => n === 'Paint' || n === 'PrePaint' || n === 'Layerize' || n === 'PaintImage' || n === 'Commit' || n === 'UpdateLayer'],
    ['microtasks', (n) => n === 'RunMicrotasks' || n === 'v8.runMicrotasks'], ['js', (n) => n === 'FunctionCall' || n === 'v8.callFunction'],
  ];
  // inclusive time per class, counting an event only when no ancestor of the same class encloses it
  const incl = Object.fromEntries(CLASS.map(([c]) => [c, 0]));
  const perTask = [];
  for (const t of tasks) {
    const ks = kids(t), mine = Object.fromEntries(CLASS.map(([c]) => [c, 0]));
    for (const [c, test] of CLASS) {
      let end = -1;
      for (const e of ks) if (test(e.name) && e.ts >= end) { mine[c] += e.dur / 1e3; end = e.ts + e.dur; }
    }
    for (const c in mine) incl[c] += mine[c];
    const kind = mine.raf ? 'raf' : mine.timer ? 'timer' : mine.event ? 'event' : mine.paint || mine.style || mine.layout ? 'render' : mine.microtasks || mine.js ? 'promise/js' : 'other';
    perTask.push({ t: (t.ts - t0) / 1e3, ms: t.dur / 1e3, kind, mine, top: Object.entries(ks.reduce((m, e) => (m[e.name] = (m[e.name] || 0) + e.dur / 1e3, m), {})).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, ms]) => `${n} ${f1(ms)}`) });
  }
  // main-thread busy time in each 16.7 ms slot, and per display frame: the rAF callback with whatever else ran since the last
  const slot = 1000 / 60, slots = new Float64Array(Math.ceil(span / slot) + 1);
  for (const t of perTask) {
    const a = t.t, b = t.t + t.ms, i0 = Math.floor(a / slot), i1 = Math.floor(b / slot);
    for (let i = i0; i <= i1 && i < slots.length; i++) slots[i] += Math.max(0, Math.min(b, (i + 1) * slot) - Math.max(a, i * slot));
  }
  const rafs = perTask.filter((t) => t.kind === 'raf');
  const between = [];
  for (let i = 1; i < rafs.length; i++) between.push(perTask.filter((t) => t.t >= rafs[i - 1].t && t.t < rafs[i].t).reduce((s, t) => s + t.ms, 0));
  const kinds = {};
  for (const t of perTask) { const k = (kinds[t.kind] ||= { n: 0, ms: 0, max: 0 }); k.n++; k.ms += t.ms; k.max = Math.max(k.max, t.ms); }
  // GC events wherever they ran on the main thread (scavenges inside tasks)
  const gcAll = all.filter((e) => CLASS[3][1](e.name)), gcs = [];
  { let end = -1; for (const e of gcAll) if (e.ts >= end) { gcs.push(e); end = e.ts + e.dur; } }
  // the GPU process's main thread and the compositor
  const gpuK = threadsNamed('CrGpuMain')[0], vizK = threadsNamed('VizCompositorThread')[0];
  const busy = (k) => {
    if (!k) return null;
    const ts = [];
    { let end = -1; for (const e of byThread.get(k).sort((a, b) => a.ts - b.ts || b.dur - a.dur)) if (TOPLEVEL.has(e.name) && e.ts >= end) { ts.push(e); end = e.ts + e.dur; } }
    const ms = ts.map((e) => e.dur / 1e3);
    return { busyPerS: f1(ms.reduce((a, b) => a + b, 0) / (span / 1000)), task: dist(ms), longest: ts.sort((a, b) => b.dur - a.dur).slice(0, 5).map((e) => [f1((e.ts - t0) / 1e3), f1(e.dur / 1e3)]) };
  };
  // Chrome's frames as its pipeline reported them (presented, dropped, ...)
  const frames = {};
  for (const e of ev) if (e.name === 'PipelineReporter' && (e.ph === 'b' || e.ph === 'X') && (e.args?.frame_reporter || e.args?.chrome_frame_reporter)) {
    const s = (e.args?.frame_reporter || e.args?.chrome_frame_reporter)?.state || 'unknown'; frames[s] = (frames[s] || 0) + 1;
  }
  const out = {
    file, spanMs: Math.round(span),
    main: { busyPerS: f1(perTask.reduce((s, t) => s + t.ms, 0) / (span / 1000)), task: dist(perTask.map((t) => t.ms)), rafCallback: dist(rafs.map((t) => t.ms)), perFrameAll: dist(between),
      slot16: dist([...slots]), slotsOver8: [...slots].filter((x) => x > 8).length, slotsOver12: [...slots].filter((x) => x > 12).length,
      byKind: Object.fromEntries(Object.entries(kinds).map(([k, x]) => [k, { n: x.n, perS: f1(x.ms / (span / 1000)), max: f1(x.max) }])),
      inclusivePerS: Object.fromEntries(Object.entries(incl).map(([k, x]) => [k, f1(x / (span / 1000))])),
      gc: { n: gcs.length, perS: f1(gcs.reduce((s, e) => s + e.dur / 1e3, 0) / (span / 1000)), max: f1(gcs.reduce((m, e) => Math.max(m, e.dur / 1e3), 0)), longest: gcs.sort((a, b) => b.dur - a.dur).slice(0, 5).map((e) => [e.name, f1((e.ts - t0) / 1e3), f1(e.dur / 1e3)]) },
      longest: perTask.sort((a, b) => b.ms - a.ms).slice(0, 12).map((t) => ({ t: Math.round(t.t), ms: f1(t.ms), kind: t.kind, top: t.top })) },
    gpuMain: busy(gpuK), viz: busy(vizK), frames,
  };
  // the JS profile: self time by function
  const prof = file.replace(/\.trace\.json$/, '.cpuprofile');
  if (fs.existsSync(prof)) {
    const p = JSON.parse(fs.readFileSync(prof, 'utf8'));
    const byId = new Map(p.nodes.map((n) => [n.id, n]));
    const self = new Map();
    let total = 0;
    for (let i = 0; i < p.samples.length; i++) {
      const n = byId.get(p.samples[i]), dt = (p.timeDeltas[i + 1] ?? p.timeDeltas[i]) / 1e3;
      const cf = n.callFrame, key = `${cf.functionName || '(anon)'} ${cf.url ? `${cf.url.split('/').pop()}:${cf.lineNumber + 1}` : ''}`.trim();
      self.set(key, (self.get(key) || 0) + dt); total += dt;
    }
    const idle = (self.get('(idle)') || 0) + (self.get('(program)') || 0);
    out.js = { profiledMs: Math.round(total), idleOrProgramMs: Math.round(idle), topSelfPerS: [...self].filter(([k]) => k !== '(idle)').sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([k, ms]) => [k, f1(ms / (total / 1000))]) };
  }
  if (v.json) { console.log(JSON.stringify(out, null, 1)); continue; }
  const m = out.main;
  console.log(`\n${file} (${(span / 1000).toFixed(1)} s)`);
  console.log(`main thread: busy ${m.busyPerS} ms/s; tasks ${JSON.stringify(m.task)}`);
  console.log(`  rAF callback ${JSON.stringify(m.rafCallback)}; all main-thread work between frames ${JSON.stringify(m.perFrameAll)}`);
  console.log(`  per 16.7 ms slot ${JSON.stringify(m.slot16)}; slots over 8 ms: ${m.slotsOver8}, over 12 ms: ${m.slotsOver12}`);
  console.log(`  by task kind ${JSON.stringify(m.byKind)}`);
  console.log(`  inclusive ms/s ${JSON.stringify(m.inclusivePerS)}`);
  console.log(`  GC ${JSON.stringify(m.gc)}`);
  console.log('  longest tasks:'); for (const t of m.longest) console.log(`    @${t.t} ms ${t.ms} ms ${t.kind}: ${t.top.join(', ')}`);
  console.log(`GPU process main ${JSON.stringify(out.gpuMain)}`);
  console.log(`viz compositor ${JSON.stringify(out.viz)}`);
  console.log(`Chrome frames ${JSON.stringify(out.frames)}`);
  if (out.js) { console.log(`JS profile: ${out.js.profiledMs} ms profiled, idle/program ${out.js.idleOrProgramMs}; self ms/s:`); for (const [k, ms] of out.js.topSelfPerS) console.log(`    ${ms}  ${k}`); }
}
