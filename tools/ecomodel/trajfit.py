"""Fits the food-web model (web.py) to ensembles' median trajectories, and tests it on held-out ensembles.

Each ensemble's median awake densities at 5-minute windows (tools/ecomodel/meas/points.json, from
responses.mjs) are the data. The model starts from a set's measured 7-minute state under that set's rules
(fit.py RULES) and is integrated forward; least squares adjusts a few parameters (births' efficiency,
the background killing among animals, each guild's correction for cysts and drift, husk decay) so the
simulated densities match the measured ones at every later window of every fitted set. The process curves
(light, grazing, hunting, scavenging) stay as fit.py measured them.

  tools/ecomodel/.venv/bin/python tools/ecomodel/trajfit.py [--hold iaA6,rBb15]
Writes tools/ecomodel/meas/model.json (the fitted model) and prints fit and held-out predictions.
"""
import json, sys
import numpy as np
from scipy.optimize import least_squares
sys.path.insert(0, 'tools/ecomodel')
from fit import rules, RULES
import web

FREE = [  # (name, key path, initial, lower, upper)
    ('betaP', ('birthP', 0), None, 0.05, 3), ('betaG', ('birthG', 0), None, 0.05, 3),
    ('betaH', ('birthH', 0), None, 0.05, 3), ('betaS', ('birthS', 0), None, 0.05, 3),
    ('bgG', ('eatenG', 1), None, 0, 20), ('bgS', ('eatenS', 1), None, 0, 20), ('bgH', ('eatenH', 1), None, 0, 20),
    ('hrG', ('eatenG', 0), None, 0, 5), ('hrS', ('eatenS', 0), None, 0, 5), ('hrH', ('eatenH', 0), None, 0, 5),
    ('cP', ('corr', 'P', 0), 0.0, -1, 1), ('cG', ('corr', 'G', 0), 0.0, -1, 1),
    ('cH', ('corr', 'H', 0), 0.0, -1, 1), ('cS', ('corr', 'S', 0), 0.0, -1, 1),
    ('decay', ('huskDecay',), 0.4, 0.01, 5),
]


def trajectories(pts, sets):
    out = {}
    for s in sets:
        sp = [p for p in pts if p['set'] == s]
        ts = sorted(set(p['t'] for p in sp))
        med = {t: {k: np.nanmedian([p[k] for p in sp if p['t'] == t]) for k in 'PGHSD'} for t in ts}
        out[s] = med
    return out


def get(F, path):
    v = F
    for k in path:
        v = v[k]
    return v


def put(F, path, val):
    v = F
    for k in path[:-1]:
        v = v[k]
    v[path[-1]] = val


def simulate_set(F, s, traj):
    ts = sorted(traj)
    t0 = min((t for t in ts if t >= 7), default=None)
    if t0 is None:
        return None
    x0 = [traj[t0][k] for k in 'PGHSD']
    p = web.params(**rules(s))
    p.update({k: v for k, v in F.items() if k not in ('bite', 'perArea', 'dung', 'ia')})
    later = [t for t in ts if t > t0]
    if not later:
        return None
    sol = web.simulate(p, x0, T=max(later) - t0 + 0.01)
    return {t: sol.sol(t - t0) for t in later}


def residuals(theta, F0, trajs):
    F = json.loads(json.dumps(F0))
    for (name, path, *_), v in zip(FREE, theta):
        put(F, path, v)
    res = []
    for s, traj in trajs.items():
        try:
            sim = simulate_set(F, s, traj)
        except Exception:
            sim = None
        for t in sorted(traj):
            if t < 8:
                continue
            m = np.array([traj[t][k] for k in 'PGHS'])
            if sim is None or t not in sim or not np.all(np.isfinite(sim[t][:4])):
                res.extend([1.0] * 4)
                continue
            # errors in density, weighted so a guild's share counts whatever its size (sqrt scale)
            res.extend(np.sqrt(np.maximum(sim[t][:4], 0)) - np.sqrt(np.maximum(m, 0)))
    return np.array(res)


def fmt(x):
    x = np.maximum(np.asarray(x[:4], float), 0)
    L = x.sum()
    return ' '.join(f'{k}{100 * v / L:3.0f}%' for k, v in zip('PGHS', x)) + f'  awake{100 * L:3.0f}%'


def main():
    hold = []
    if '--hold' in sys.argv:
        hold = sys.argv[sys.argv.index('--hold') + 1].split(',')
    pts = [{k: (np.nan if v is None else v) for k, v in p.items()} for p in json.load(open('tools/ecomodel/meas/points.json'))]
    known = [s for s in sorted(set(p['set'] for p in pts)) if s in RULES or s in ('feE2b', 'feE2', 'lgD60', 's10base')]
    fitSets = [s for s in known if s not in hold]
    trajs = trajectories(pts, known)
    F0 = json.load(open('tools/ecomodel/meas/fit.json'))
    F0.setdefault('corr', {g: [0.0, 0.0, 0.0] for g in 'PGHS'})
    F0.setdefault('huskDecay', 0.4)
    theta0 = [get(F0, path) if init is None else init for (name, path, init, lo, hi) in FREE]
    theta0 = [min(max(v, lo + 1e-6), hi - 1e-6) for v, (_, _, _, lo, hi) in zip(theta0, FREE)]
    lo = [f[3] for f in FREE]; hi = [f[4] for f in FREE]
    fitT = {s: trajs[s] for s in fitSets}
    r0 = residuals(theta0, F0, fitT)
    print(f'fitting {len(FREE)} parameters to {len(fitSets)} ensembles ({len(r0) // 4} windows); start cost {np.sum(r0 ** 2):.4f}')
    sol = least_squares(residuals, theta0, args=(F0, fitT), bounds=(lo, hi), diff_step=1e-3, max_nfev=400, verbose=0)
    print(f'end cost {np.sum(sol.fun ** 2):.4f}')
    F = json.loads(json.dumps(F0))
    for (name, path, *_), v in zip(FREE, sol.x):
        put(F, path, float(v))
        print(f'  {name:6s} {v:+.4f}')
    json.dump(F, open('tools/ecomodel/meas/model.json', 'w'), indent=1)
    print(f"\n{'set':10s} {'min':>4s}  {'measured':36s} {'model':36s}")
    for s in known:
        sim = simulate_set(F, s, trajs[s])
        tag = ' (held out)' if s in hold else ''
        for t in sorted(trajs[s]):
            if t < 8 or sim is None or t not in sim:
                continue
            if t not in (12, 22, 27, 42, 52) and t != max(trajs[s]):
                continue
            print(f'{s:10s} {t:4.0f}  {fmt([trajs[s][t][k] for k in "PGHS"]):36s} {fmt(sim[t]):36s}{tag}')


if __name__ == '__main__':
    main()
