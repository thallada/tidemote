// Photograph grafts (docs/symbiosis.md) in the built page: grow a world, find cells whose bond partner is another
// species, and shoot the densest few spots close up.
//   TIDEMOTE_VK=1 ~/.local/bin/capped node tools/night/graftshot.mjs --out runs/night/shots --n 32768 --mature 400
import fs from 'node:fs'; import path from 'node:path'; import { PNG } from 'pngjs';
import { cliArgs, openPage, aim } from '../pagelab.mjs';

const v = { out: 'runs/night/shots', n: 32768, mature: 400, zoom: '220', k: '{}', shots: 4, html: 'dist/tidemote.html', w: 1280, h: 800, ...cliArgs() };
fs.mkdirSync(v.out, { recursive: true });
const { page, setSpeed, close } = await openPage({ ...v, tmp: 'graft-' });
const spots = await page.evaluate(async (shots) => {
  const T = globalThis.__tidemote, e = T.eng;
  const st = await e.readState();
  const n = st.cpu.count, pf = new Float32Array(st.gpu.parts), pu = new Uint32Array(st.gpu.parts), it = new Uint32Array(st.gpu.intent);
  const gf = new Float32Array(st.gpu.genomes), gu = new Uint32Array(st.gpu.genomes);
  const G = 56, kindOf = (i) => pu[i * 10 + 4];
  const gene = (k) => ({ graft: +gf[k * G + 55].toFixed(2), photo: +gf[k * G + 38].toFixed(2), flesh: +gf[k * G + 26].toFixed(2), glint: +gf[k * G + 24].toFixed(2), husk: +gf[k * G + 25].toFixed(2), adh: +gf[k * G + 44].toFixed(2), serial: gu[k * G + 41] });
  const grafts = [];
  for (let i = 0; i < n; i++) {
    const k = kindOf(i); if (k < 5) continue;
    for (const j of [it[i * 4 + 2], it[i * 4 + 3]]) {
      if (j >= n || j === i) continue;
      const kj = kindOf(j); if (kj < 5 || kj === k) continue;
      grafts.push({ x: pf[i * 10], y: pf[i * 10 + 1], k, kj, e: +pf[i * 10 + 5].toFixed(2), ej: +pf[j * 10 + 5].toFixed(2) });
    }
  }
  const pairs = {};
  for (const g of grafts) { const key = `${g.k}>${g.kj}`; pairs[key] = (pairs[key] || 0) + 1; }
  const top = Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key, c]) => { const [a, b] = key.split('>').map(Number); return { c, grafter: gene(a), host: gene(b), names: [T.life().species?.get?.(a)?.name, T.life().species?.get?.(b)?.name] }; });
  // the densest spots, apart from each other
  const picked = [];
  const score = (g) => grafts.filter((h) => Math.hypot(h.x - g.x, h.y - g.y) < 3).length;
  const ranked = grafts.map((g) => [score(g), g]).sort((a, b) => b[0] - a[0]);
  for (const [s, g] of ranked) { if (picked.length >= shots) break; if (picked.every((p) => Math.hypot(p.x - g.x, p.y - g.y) > 8)) picked.push({ ...g, s }); }
  return { all: grafts.map((g) => [g.x, g.y, g.k, g.kj]), total: grafts.length, living: Array.from({ length: n }, (_, i) => kindOf(i) >= 5).filter(Boolean).length, top, picked };
}, +v.shots);
fs.writeFileSync(path.join(v.out, 'grafts.json'), JSON.stringify({ total: spots.total, living: spots.living, top: spots.top, picked: spots.picked }, null, 1));
console.log(JSON.stringify({ total: spots.total, living: spots.living, top: spots.top.map((t) => [t.c, t.grafter, t.host]) }));
for (const [i, s] of spots.picked.entries()) {
  for (const z of String(v.zoom).split(',')) {
    await aim(page, [s.x, s.y], z);
    await setSpeed(1); await page.waitForTimeout(700); await setSpeed(0);
    const f = path.join(v.out, `graft${i}_z${z}.png`);
    await page.screenshot({ path: f });
    // ring each grafter in view (--rings 1)
    if (+v.rings) {
      const cam = await page.evaluate(() => { const T = globalThis.__tidemote; return { x: T.cam.x, y: T.cam.y, w: T.eng.grid[0], h: T.eng.grid[1] }; });
      const png = PNG.sync.read(fs.readFileSync(f));
      for (const [gx, gy] of spots.all) {
        let dx = gx - cam.x, dy = gy - cam.y; dx -= cam.w * Math.round(dx / cam.w); dy -= cam.h * Math.round(dy / cam.h);
        const sx = png.width / 2 + dx * +z, sy = png.height / 2 + dy * +z, R = Math.max(6, 0.25 * +z);
        if (sx < -R || sy < -R || sx > png.width + R || sy > png.height + R) continue;
        for (let a = 0; a < 360; a += 0.5) {
          const px = Math.round(sx + R * Math.cos(a * Math.PI / 180)), py = Math.round(sy + R * Math.sin(a * Math.PI / 180));
          if (px < 0 || py < 0 || px >= png.width || py >= png.height) continue;
          const o = (py * png.width + px) * 4; png.data[o] = 255; png.data[o + 1] = 60; png.data[o + 2] = 60;
        }
      }
      fs.writeFileSync(f.replace('.png', '_rings.png'), PNG.sync.write(png));
    }
    console.log(f, s.s, `${s.k}>${s.kj}`);
  }
}
await close();
