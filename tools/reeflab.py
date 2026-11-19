#!/usr/bin/env python3
"""The reef lab's report (tools/reeflab.mjs records): how reefs are spaced and shaped.

  python3 tools/reeflab.py runs/reef/A [runs/reef/B ...] [--png]
  python3 tools/reeflab.py --summary runs/reef/A [runs/reef/B ...]

For each run and recorded moment: reef grains, bedrock, calcifiers; reef patches (connected cells of a fine grid
holding reef), their sizes and how regularly they are spaced. Spacing: the coefficient of variation of each patch's
distance to its nearest neighbour (a lattice ~0.1-0.2, scattered at random ~0.52, clumped higher), and the
radial distribution's first peak g(r) height (a lattice of islands shows a tall peak at its spacing). Shape:
patch size CV and the mean outline ratio perimeter / (2 sqrt(pi area)) (1 a disc, larger ragged or lobed).
--png draws each run's last moment (reef white, bedrock grey, calcifiers orange, over the reef ground: green takes reefs,
blue does not) to RUN/seedS.png. --summary pools each run's worlds (see summary()).
"""
import json, sys, glob, os, math
import numpy as np

def patches(xy, grid, res=0.5, minArea=2):
    W, H = int(math.ceil(grid[0] / res)), int(math.ceil(grid[1] / res))
    occ = np.zeros((H, W), np.int32)
    if len(xy):
        ix = np.clip((xy[:, 0] / res).astype(int) % W, 0, W - 1)
        iy = np.clip((xy[:, 1] / res).astype(int) % H, 0, H - 1)
        np.add.at(occ, (iy, ix), 1)
    m = occ > 0
    # close one-cell gaps (grains sit ~0.3 apart): dilate then label, wrapping
    d = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
    lab = -np.ones((H, W), np.int32)
    out = []
    for y0 in range(H):
        for x0 in range(W):
            if not d[y0, x0] or lab[y0, x0] >= 0: continue
            k = len(out); stack = [(y0, x0)]; lab[y0, x0] = k; cells = []
            while stack:
                y, x = stack.pop(); cells.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    yy, xx = (y + dy) % H, (x + dx) % W
                    if d[yy, xx] and lab[yy, xx] < 0: lab[yy, xx] = k; stack.append((yy, xx))
            out.append(cells)
    res_ = []
    for k, cells in enumerate(out):
        c = np.array(cells)
        grains = occ[c[:, 0], c[:, 1]].sum()
        if grains < minArea * 4: continue
        area = len(cells) * res * res
        per = 0
        for y, x in cells:
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if lab[(y + dy) % H, (x + dx) % W] != k: per += 1
        per *= res
        # centroid on a torus
        ang = c[:, ::-1] * res / np.array(grid) * 2 * math.pi
        cen = (np.arctan2(np.sin(ang).mean(0), np.cos(ang).mean(0)) % (2 * math.pi)) / (2 * math.pi) * np.array(grid)
        res_.append(dict(grains=int(grains), area=area, outline=per / (2 * math.sqrt(math.pi * area)), c=cen))
    return res_

def spacing(cs, grid):
    if len(cs) < 4: return None, None
    P = np.array(cs); G = np.array(grid, float)
    d = P[:, None, :] - P[None, :, :]; d -= G * np.round(d / G)
    r = np.sqrt((d ** 2).sum(-1)); np.fill_diagonal(r, np.inf)
    nn = r.min(1)
    cv = nn.std() / nn.mean()
    # g(r) peak: pair density in rings against a uniform density
    dens = len(P) / (G[0] * G[1]); rmax = min(G) / 2; edges = np.linspace(0, rmax, 30)
    rr = r[np.isfinite(r)]
    h, _ = np.histogram(rr, edges)
    ring = math.pi * (edges[1:] ** 2 - edges[:-1] ** 2) * dens * len(P)
    g = h / ring
    return cv, float(g.max())

def report(run, png=False):
    for f in sorted(glob.glob(os.path.join(run, 'seed*.json'))):
        D = json.load(open(f)); grid = D['grid']
        for fr in D['frames']:
            reef = np.array(fr['reef']).reshape(-1, 2)
            ps = patches(reef, grid)
            big = [p for p in ps if p['grains'] >= 20]
            cv, gpk = spacing([p['c'] for p in big], grid)
            sizes = np.array([p['grains'] for p in big]) if big else np.zeros(1)
            outl = np.mean([p['outline'] for p in big]) if big else float('nan')
            print(f"{os.path.basename(run):>12} {os.path.basename(f)[:-5]:>7} t={fr['t']:>5} reef {len(reef):>6} bed {len(fr['bed'])//2:>5} calc {len(fr['calc'])//2:>5}"
                  f" | patches {len(big):>3} size mean {sizes.mean():6.0f} cv {sizes.std()/max(sizes.mean(),1):4.2f} max {sizes.max():5.0f}"
                  f" | nnCV {cv if cv is not None else float('nan'):4.2f} g(r)pk {gpk if gpk is not None else float('nan'):4.1f} | outline {outl:4.2f}")
        if png: draw(D, f[:-5] + '.png')

M32 = 0xffffffff
def pcg(v):
    v = np.asarray(v, np.uint64) & M32
    s = (v * 747796405 + 2891336453) & M32
    w = (((s >> ((s >> 28) + 4)) ^ s) * 277803737) & M32
    return (w >> 22) ^ w

def rock_noise(p, size, world, seed, salt):
    """rockNoise in src/shaders.js (gradient noise that wraps with the world)."""
    cells = np.maximum(1.0, np.round(np.array(world) / size))
    q = p / np.array(world) * cells; c = np.floor(q); f = q - c
    w = f * f * f * (f * (f * 6 - 15) + 10)
    def grad(c, f):
        m = (c - cells * np.floor(c / cells)).astype(np.uint64)
        h = (pcg(seed ^ pcg(m[..., 0] * 7919 + m[..., 1] * 104729 + salt)) >> 8).astype(np.float64) / 16777216.0
        return ((h * 2 - 1) * f[..., 0] + (np.mod(h * 37.17, 1.0) * 2 - 1) * f[..., 1]) * 1.3
    e = np.array([1.0, 0.0]); n_ = np.array([0.0, 1.0])
    a = grad(c, f) * (1 - w[..., 0]) + grad(c + e, f - e) * w[..., 0]
    b = grad(c + n_, f - n_) * (1 - w[..., 0]) + grad(c + e + n_, f - e - n_) * w[..., 0]
    return np.clip(0.5 + 0.9 * (a * (1 - w[..., 1]) + b * w[..., 1]), 0, 1)

def reef_ground(p, L, world, seed):
    """reefGround in src/shaders.js, -1 to 1."""
    w = p + (np.stack([rock_noise(p, 0.7 * L, world, seed, 21), rock_noise(p, 0.7 * L, world, seed, 22)], -1) - 0.5) * 1.2 * L
    x = 0.7 * rock_noise(w, L, world, seed, 23) + 0.3 * rock_noise(w, 0.35 * L, world, seed, 24)
    t = np.clip((x - 0.25) / 0.5, 0, 1)
    return 2 * t * t * (3 - 2 * t) - 1

def draw(D, out, scale=6):
    from PIL import Image
    grid = D['grid']; fr = D['frames'][-1]
    W, H = int(grid[0] * scale), int(grid[1] * scale)
    img = np.full((H, W, 3), 18, np.uint8)
    L = D.get('ground')
    if L:
        yy, xx = np.mgrid[0:H, 0:W]
        g = reef_ground(np.stack([(xx + 0.5) / scale, (yy + 0.5) / scale], -1), L, grid, int(D['rockSeed']))
        img[..., 1] = (18 + 40 * np.clip(g, 0, 1)).astype(np.uint8)
        img[..., 2] = (18 + 40 * np.clip(-g, 0, 1)).astype(np.uint8)
    def put(arr, col, r=1):
        a = np.array(arr).reshape(-1, 2)
        if not len(a): return
        x = np.clip((a[:, 0] * scale).astype(int), 0, W - 1); y = np.clip((a[:, 1] * scale).astype(int), 0, H - 1)
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                img[np.clip(y + dy, 0, H - 1), np.clip(x + dx, 0, W - 1)] = col
    put(fr['calc'], (230, 130, 40), 0)
    put(fr['bed'], (110, 110, 120))
    put(fr['reef'], (240, 240, 230))
    Image.fromarray(img).save(out)

def summary(runs):
    """Pooled over each run's worlds: per moment, mean and max reef grains; over moments past 20 min with 4+ patches,
    the patch spacing CV and g(r) peak, patch size CV, outline, and the share of patches over 300 grains."""
    for run in runs:
        rows = {}
        for f in sorted(glob.glob(os.path.join(run, 'seed*.json'))):
            D = json.load(open(f)); grid = D['grid']
            for fr in D['frames']:
                reef = np.array(fr['reef']).reshape(-1, 2)
                big = [p for p in patches(reef, grid) if p['grains'] >= 20]
                cv, gpk = spacing([p['c'] for p in big], grid)
                rows.setdefault(fr['t'], []).append(dict(reef=len(reef), n=D['n'], calc=len(fr['calc']) // 2, cv=cv, gpk=gpk,
                    outl=[p['outline'] for p in big], sizes=[p['grains'] for p in big]))
        peaks, rpeaks = [], []
        for f in sorted(glob.glob(os.path.join(run, 'seed*.json'))):
            D = json.load(open(f))
            peaks.append(max((len(fr['reef']) + len(fr['bed'])) / 2 / D['n'] for fr in D['frames']))
            rpeaks.append(max(len(fr['reef']) / 2 / D['n'] for fr in D['frames']))
        print(f"== {run}  ({len(peaks)} worlds)  peak stone share mean {np.mean(peaks):.1%} worst {max(peaks):.1%}"
              f"  (reef alone: mean {np.mean(rpeaks):.1%} worst {max(rpeaks):.1%})")
        print('   t   reef mean  med   max   calc mean')
        for t in sorted(rows):
            r = np.array([x['reef'] for x in rows[t]])
            print(f"{t:>5} {r.mean():9.0f} {np.median(r):5.0f} {r.max():6d} {np.mean([x['calc'] for x in rows[t]]):9.0f}")
        late = [x for t in rows if t >= 1200 for x in rows[t]]
        cvs = [x['cv'] for x in late if x['cv'] is not None]; gp = [x['gpk'] for x in late if x['gpk'] is not None]
        outl = [o for x in late for o in x['outl']]; sz = np.array([s for x in late for s in x['sizes']] or [0])
        wsz = [o for x in late for o, s in zip(x['outl'], x['sizes']) if s >= 300]
        print(f"   late: spacing CV {np.mean(cvs) if cvs else float('nan'):.2f} (n={len(cvs)})  g(r) peak {np.mean(gp) if gp else float('nan'):.1f}"
              f"  patch size cv {sz.std() / max(sz.mean(), 1):.2f}  outline {np.mean(outl) if outl else float('nan'):.2f}"
              f"  outline of big ones {np.mean(wsz) if wsz else float('nan'):.2f} (n={len(wsz)})  big share {np.mean(sz >= 300):.2f}")

if __name__ == '__main__':
    runs = [a for a in sys.argv[1:] if not a.startswith('--')]
    if '--summary' in sys.argv: summary(runs)
    else:
        for r in runs: report(r, '--png' in sys.argv)
