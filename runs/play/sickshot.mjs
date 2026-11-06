// Grow a world, read its cells back, count the eaters sick of a toxic species (search image, docs/signals.md),
// and photograph the densest knot of them close up.
//   tools/gpu-node.sh runs/play/sickshot.mjs --out runs/play/sick --mature 900 --n 65536
import fs from 'node:fs'; import path from 'node:path';
import { cliArgs, openPage } from '../../tools/pagelab.mjs';
const v = { out: 'runs/play/sick', mature: 900, zoom: 10, frames: 12, n: 65536, k: '{}', w: 1280, h: 800, ...cliArgs() };
fs.mkdirSync(v.out, { recursive: true });
const { page, evalCode, close } = await openPage({ ...v, tmp: 'sick-' });
const r = await evalCode(`(async () => {
  const st = await T.eng.readState();
  const P = new Float32Array(st.gpu.parts), U = new Uint32Array(st.gpu.parts), n = st.cpu.count;
  const G = new Float32Array(st.gpu.genomes), GU = new Uint32Array(st.gpu.genomes), W = ${60};
  const tox = (k) => G[k * W + 56], res = (k) => G[k * W + 57], photo = (k) => G[k * W + 16 + 22];
  let eaters = 0, sick = 0, imaged = 0; const pts = [];
  for (let i = 0; i < n; i++) {
    const k = U[i * 10 + 4]; if (k < 5 || k >= 1024 || photo(k) > 0.55) continue;
    eaters++;
    const img = (U[i * 10 + 9] >>> 6) & 1023; if (img >= 5) imaged++;
    if (img >= 5 && tox(img) - res(k) > 0.05) { sick++; pts.push([P[i * 10], P[i * 10 + 1]]); }
  }
  let best = null, bn = 0;
  for (const [x, y] of pts) { let c = 0; for (const [a, b] of pts) if ((a - x) ** 2 + (b - y) ** 2 < 36) c++; if (c > bn) { bn = c; best = [x, y]; } }
  const l = T.life(); const sp = [...l.reg.values()].filter((s) => s.alive && s.established);
  const share = (f) => { let a = 0, b = 0; for (const s of sp) { b += s.pop; if (f(s.genome)) a += s.pop; } return +(a / (b || 1)).toFixed(3); };
  return { t: T.eng.simTime, n, eaters, imaged, sick, best, bn, grid: T.eng.grid,
    toxicProducers: share((g) => g.photo > 0.55 && g.toxin > 0.3), toxicEaters: share((g) => g.photo <= 0.55 && g.toxin > 0.3), resistantEaters: share((g) => g.photo <= 0.55 && g.resist > 0.3) };
})()`);
console.log(JSON.stringify(r));
if (r.best) {
  await evalCode(`T.cam.x = ${r.best[0]}; T.cam.y = ${r.best[1]}; T.cam.anchor = null; T.cam.zoomTarget = Math.min(T.maxZoom(), ${+v.zoom})`);
  await page.addStyleTag({ content: '#specimen{display:none!important}' });
  await evalCode('T.setSpeed(1)');
  await page.waitForTimeout(3000);
  for (let k = 0; k < +v.frames; k++) { await page.screenshot({ path: path.join(v.out, `f${String(k).padStart(2, '0')}.png`) }); await page.waitForTimeout(400); }
}
// the same view with every sick eater ringed (where it was a moment ago), to tell them from the rest
if (r.best) {
  await page.evaluate(async () => {
    const T = globalThis.__tidemote;
    const st = await T.eng.readState();
    const P = new Float32Array(st.gpu.parts), U = new Uint32Array(st.gpu.parts), G = new Float32Array(st.gpu.genomes), W = 60;
    const fit = Math.max(innerWidth * devicePixelRatio / T.eng.grid[0], innerHeight * devicePixelRatio / T.eng.grid[1]);
    const p = fit * T.cam.zoom / devicePixelRatio;
    const cv = document.createElement('canvas'); cv.width = innerWidth; cv.height = innerHeight;
    cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;pointer-events:none';
    document.body.appendChild(cv); const c = cv.getContext('2d'); c.strokeStyle = '#ff2'; c.lineWidth = 1.5;
    for (let i = 0; i < st.cpu.count; i++) {
      const k = U[i * 10 + 4]; if (k < 5 || k >= 1024 || G[k * W + 38] > 0.55) continue;
      const img = (U[i * 10 + 9] >>> 6) & 1023;
      if (!(img >= 5 && G[img * W + 56] - G[k * W + 57] > 0.05)) continue;
      const x = innerWidth / 2 + (P[i * 10] - T.cam.x) * p, y = innerHeight / 2 + (P[i * 10 + 1] - T.cam.y) * p;
      if (x > -20 && y > -20 && x < innerWidth + 20 && y < innerHeight + 20) { c.beginPath(); c.arc(x, y, 14, 0, 7); c.stroke(); }
    }
  });
  await page.screenshot({ path: path.join(v.out, 'ringed.png') });
}
await close();
