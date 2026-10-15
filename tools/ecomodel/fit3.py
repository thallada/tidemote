"""Fits the patch model's own parameters (web3.py: local attack aH, handling hH, movement, taxis, the
tide's light swing) to ensembles' median trajectories, noise-free from each set's 7-minute state, then
checks held-out sets with noise: 32 worlds each, median shares and the share of worlds where each guild
lives at the end, against the GPU's.

  tools/ecomodel/.venv/bin/python tools/ecomodel/fit3.py [--fit A,B,..] [--hold C,D,..]
Writes tools/ecomodel/meas/model3.json.
"""
import json, sys
import numpy as np
from scipy.optimize import least_squares
sys.path.insert(0, 'tools/ecomodel')
from fit import rules
import web, web3

arg = lambda k, d: sys.argv[sys.argv.index(k) + 1].split(',') if k in sys.argv else d
FIT = arg('--fit', ['defL2', 'flsatabL', 'b25L', 'pr25L', 'iaA60', 'fl5L'])
HOLD = arg('--hold', ['nd2L', 'sa13L', 'sa2L'])
FREE = [('aH', 40, 2, 400), ('hH', 0.28, 0.05, 2), ('move', 0.5, 0.01, 5), ('taxG', 1, 0, 10), ('taxH', 2, 0, 20), ('taxS', 1, 0, 10), ('tideAmp', 0.6, 0, 1.5)]
M = json.load(open('tools/ecomodel/meas/model.json'))
web.F.clear(); web.F.update(M)
pts = [{k: (np.nan if v is None else v) for k, v in p.items()} for p in json.load(open('tools/ecomodel/meas/points.json'))]
extra = 'tools/ecomodel/meas/points_extra.json'
try:
    pts += [{k: (np.nan if v is None else v) for k, v in p.items()} for p in json.load(open(extra))]
except FileNotFoundError:
    pass


def med(s, t, k):
    v = [p.get(k, np.nan) for p in pts if p['set'] == s and p['t'] == t]
    return float(np.nanmedian(v)) if v else np.nan


def setp(s, theta):
    r = rules(s)
    p = web3.params(**r)
    p.update({k: v for k, v in M.items() if k not in ('bite', 'perArea', 'dung', 'ia', 'flee', 'satiety', 'satietyAt')})
    for (name, *_), v in zip(FREE, theta):
        p[name] = v
    return p


def times(s):
    return [t for t in sorted(set(p['t'] for p in pts if p['set'] == s)) if t > 7]


def resid(theta):
    res = []
    for s in FIT:
        x0 = [med(s, 7, k) for k in 'PGHSD']
        ts = times(s)
        out = web3.run(setp(s, theta), x0, T=max(ts) - 7 + 0.1, noise=False, sample=[t - 7 for t in ts], seed=1)
        for t in ts:
            m = np.array([med(s, t, k) for k in 'PGHS'])
            x = out.get(t - 7)
            if x is None or not np.all(np.isfinite(x)):
                res.extend([1.0] * 4); continue
            res.extend(np.sqrt(np.maximum(x[:4], 0)) - np.sqrt(np.maximum(m, 0)))
    return np.array(res)


def survival(s, theta, runs=32):
    x0 = [med(s, 7, k) for k in 'PGHSD']
    ts = times(s)
    T = max(ts)
    ends, alive = [], []
    for seed in range(runs):
        out = web3.run(setp(s, theta), x0, T=T - 7 + 0.1, noise=True, sample=[T - 7], seed=100 + seed)
        x = out[T - 7][:4]
        ends.append(x)
        alive.append(x / max(x.sum(), 1e-12) >= 0.01)
    return np.median(np.array(ends), axis=0), np.mean(np.array(alive), axis=0), T


if __name__ == '__main__':
    theta0 = [f[1] for f in FREE]
    lo = [f[2] for f in FREE]; hi = [f[3] for f in FREE]
    r0 = resid(theta0)
    print(f'fitting {len(FREE)} patch parameters to {FIT}: start cost {np.sum(r0 ** 2):.4f}')
    sol = least_squares(resid, theta0, bounds=(lo, hi), diff_step=1e-2, max_nfev=120)
    print(f'end cost {np.sum(sol.fun ** 2):.4f}')
    for (name, *_), v in zip(FREE, sol.x):
        print(f'  {name:7s} {v:.4f}')
    json.dump({f[0]: float(v) for f, v in zip(FREE, sol.x)}, open('tools/ecomodel/meas/model3.json', 'w'), indent=1)
    sh = lambda x: '/'.join(f'{100 * v:2.0f}' for v in np.maximum(x, 0) / max(np.maximum(x, 0).sum(), 1e-12))
    print('\nwith noise, 32 worlds each: median shares P/G/H/S at the end, and worlds where each guild lives (>= 1%)')
    for s in FIT + HOLD:
        if not times(s):
            continue
        medx, alive, T = survival(s, sol.x)
        m = np.array([med(s, max(times(s)), k) for k in 'PGHS'])
        tag = ' (held out)' if s in HOLD else ''
        print(f'{s:9s} {T:3.0f}m  GPU {sh(m):14s} patch model {sh(medx):14s} alive P/G/H/S {"/".join(f"{100 * a:3.0f}" for a in alive)}{tag}')
