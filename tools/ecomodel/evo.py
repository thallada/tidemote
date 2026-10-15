"""Adaptive dynamics on the mean-field food web (web.py): each animal guild's mean swim s and lifespan l
evolve by the canonical equation, dz/dt = V_g x births_g x d(fitness of a rare mutant)/dz.

A guild's traits set its costs and benefits:
  upkeep      u_g + cs_g (s - s0_g) + cl_g (l - l0_g)       (slopes measured: traits.json, regression)
  old age     old_g x l0_g / l                              (a longer life, fewer old-age deaths)
  grazers     intake x (1 + bG (s - s0)); risk from hunters / (1 + flee x eG (s - s0))
  hunters     kills x (1 + bH (sH - s0H)) / (1 + flee x eG (sG - s0G))   (speed meets prey's escape)
  scavengers  intake x (1 + bS (s - s0))
A rare mutant's fitness is its births minus deaths in the residents' world; its derivative in each trait
is the selection gradient. V (one per guild), the benefit strengths b, e are fitted with the population
and trait trajectories (evofit below); s0, l0 are the traits at the 7-minute start.

  tools/ecomodel/.venv/bin/python tools/ecomodel/evo.py      (fit and held-out check)
"""
import json, sys
import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import least_squares
sys.path.insert(0, 'tools/ecomodel')
import web
from fit import rules

AN = 'GHS'
COST = {'G': (0.767, 0.006), 'H': (1.071, 0.009), 'S': (0.884, 0.007)}   # upkeep per unit swim, per unit lifespan


def fitness(g, s, l, x, p, Z):
    """per-capita growth of a rare guild-g cell with swim s and lifespan l among residents at state x
    with traits Z (dict g -> (s, l))"""
    P, G, H, S, D = np.maximum(x[:5], 0)
    inc, kills, intakeG, intakeS, silt = web.rates(x[:5], p)
    s0, l0 = p['z0'][g]
    sG = Z['G'][0]
    fl = p.get('flee', 0)
    if g == 'G':
        income = intakeG * (1 + p['bG'] * (s - p['z0']['G'][0]))
    elif g == 'H':
        income = kills * p['eK'] * (1 + p['bH'] * (s - s0)) / (1 + fl * p['eG'] * (sG - p['z0']['G'][0]))
    else:
        income = intakeS * (1 + p['bS'] * (s - s0))
    cs, cl = COST[g]
    u = p['u' + g] + cs * (s - s0) + cl * (l - l0)
    beta, ksl = p['birth' + g]
    sur = (income - u) / p['b' + g]
    births = beta * max(sur, 0) * silt / (silt + ksl)
    starve = max(-sur, 0)
    old = p['old' + g] * l0 / max(l, 1.0)
    alpha, bt, ga = p['eaten' + g]
    prey = G + S + H
    hr = kills * H / prey if prey > 0 else 0.0
    risk = alpha * hr
    if g == 'G':
        risk = risk / (1 + fl * p['eG'] * (s - s0))
    return births - starve - old - risk - bt * prey - ga


def rhs(t, y, p):
    x = y[:5]
    Z = {g: (y[5 + 2 * i], y[6 + 2 * i]) for i, g in enumerate(AN)}
    # the residents' traits set their guild's costs and benefits in the web
    q = dict(p)
    for g in AN:
        s, l = Z[g]; s0, l0 = p['z0'][g]; cs, cl = COST[g]
        q['u' + g] = p['u' + g] + cs * (s - s0) + cl * (l - l0)
        q['old' + g] = p['old' + g] * l0 / max(l, 1.0)
    fl = p.get('flee', 0)
    dsG = Z['G'][0] - p['z0']['G'][0]
    q['grazeMul'] = p.get('grazeMul', 1.0) * (1 + p['bG'] * dsG)
    q['huntMul'] = p.get('huntMul', 1.0) * (1 + p['bH'] * (Z['H'][0] - p['z0']['H'][0])) / (1 + fl * p['eG'] * dsG)
    q['scavMul'] = p.get('scavMul', 1.0) * (1 + p['bS'] * (Z['S'][0] - p['z0']['S'][0]))
    dx = web.rhs(t, x, q)
    dz = []
    inc, *_ = web.rates(x, q)
    for g in AN:
        s, l = Z[g]
        hs, hl = 0.02, 2.0
        gs = (fitness(g, s + hs, l, x, q, Z) - fitness(g, s - hs, l, x, q, Z)) / (2 * hs)
        gl = (fitness(g, s, l + hl, x, q, Z) - fitness(g, s, l - hl, x, q, Z)) / (2 * hl)
        n = x[1 + AN.index(g)]
        supply = n / (n + 0.005)          # a guild of few cells mutates rarely
        dz += [p['V'][g] * supply * gs, p['V'][g] * supply * gl * p.get('lscale', 400.0)]
    return np.concatenate([dx, dz])


def simulate(p, x0, z0, T):
    y0 = np.concatenate([x0, [v for g in AN for v in z0[g]]])
    def f(t, y):
        d = rhs(t, y, p)
        d[:4] = np.where((y[:4] <= 3e-5) & (d[:4] < 0), 0.0, d[:4])
        d[5::2] = np.where((y[5::2] <= 0.02) & (d[5::2] < 0), 0.0, d[5::2])
        return d
    return solve_ivp(f, (0, T), y0, method='RK23', max_step=0.5, rtol=1e-4, atol=1e-8, dense_output=True)


# ------------------------------------------------------------------ fitting against the ensembles
pts = [{k: (np.nan if v is None else v) for k, v in q.items()} for q in json.load(open('tools/ecomodel/meas/traits.json'))]
M = json.load(open('tools/ecomodel/meas/model.json'))


def med(s, t, k):
    v = [q.get(k, np.nan) for q in pts if q['set'] == s and q['t'] == t]
    return float(np.nanmedian(v)) if v else np.nan


def setup(s, theta):
    web.F.clear(); web.F.update(M)
    p = web.params(**rules(s))
    p.update({k: v for k, v in M.items() if k not in ('bite', 'perArea', 'dung', 'ia', 'flee', 'satiety', 'satietyAt')})
    V = dict(zip(AN, theta[:3])); bG, bH, bS, eG = theta[3:7]
    p.update(V=V, bG=bG, bH=bH, bS=bS, eG=eG)
    z0 = {g: (med(s, 7, f'z{g}_swim'), med(s, 7, f'z{g}_lifespan')) for g in AN}
    p['z0'] = z0
    return p, z0


FREE = [('VG', 0.05, 0, 5), ('VH', 0.05, 0, 5), ('VS', 0.05, 0, 5), ('bG', 0.3, 0, 3), ('bH', 0.2, 0, 3), ('bS', 0.2, 0, 3), ('eG', 1.0, 0, 10)]


def times(s):
    return [t for t in sorted(set(q['t'] for q in pts if q['set'] == s)) if t > 7]


def resid(theta, sets):
    res = []
    for s in sets:
        p, z0 = setup(s, theta)
        x0 = [med(s, 7, k) for k in 'PGHSD']
        ts = times(s)
        try:
            sol = simulate(p, x0, z0, max(ts) - 7 + 0.01)
        except Exception:
            sol = None
        for t in ts:
            y = sol.sol(t - 7) if sol is not None and sol.success else None
            m = np.array([med(s, t, k) for k in 'PGHS'])
            mz = np.array([med(s, t, f'z{g}_swim') for g in AN])
            if y is None or not np.all(np.isfinite(y)):
                res.extend([1.0] * 7); continue
            res.extend(np.sqrt(np.maximum(y[:4], 0)) - np.sqrt(np.maximum(m, 0)))
            res.extend(0.3 * np.nan_to_num(y[5::2] - mz))
    return np.array(res)


if __name__ == '__main__':
    FIT = ['b25L', 'pr25L', 'defL2', 'fl5L', 'flsatL', 'flsatabL', 'iaA60', 'ts3L']
    HOLD = ['nd2L', 'sa13L', 'sa2L', 'ndts3L']
    FIT = [s for s in FIT if times(s)]
    th0 = [f[1] for f in FREE]
    r0 = resid(th0, FIT)
    print(f'fitting {len(FREE)} parameters to {FIT}: start cost {np.sum(r0 ** 2):.3f}')
    sol = least_squares(resid, th0, args=(FIT,), bounds=([f[2] for f in FREE], [f[3] for f in FREE]), diff_step=1e-2, max_nfev=150)
    print(f'end cost {np.sum(sol.fun ** 2):.3f}')
    for (n, *_), v in zip(FREE, sol.x):
        print(f'  {n:3s} {v:.4f}')
    json.dump({f[0]: float(v) for f, v in zip(FREE, sol.x)}, open('tools/ecomodel/meas/evo.json', 'w'), indent=1)
    sh = lambda x: '/'.join(f'{100 * v:2.0f}' for v in np.maximum(x, 0) / max(np.maximum(x, 0).sum(), 1e-12))
    print(f"\n{'set':9s} min  GPU P/G/H/S   model         | swim G/H/S: GPU            model")
    for s in FIT + HOLD:
        ts = times(s)
        if not ts:
            continue
        p, z0 = setup(s, sol.x)
        y = simulate(p, [med(s, 7, k) for k in 'PGHSD'], z0, max(ts) - 7 + 0.01)
        for t in (22, 42, 52):
            if t not in ts:
                continue
            yy = y.sol(t - 7)
            m = [med(s, t, k) for k in 'PGHS']
            mz = '/'.join(f'{med(s, t, f"z{g}_swim"):.2f}' for g in AN)
            print(f"{s:9s} {t:3d}  {sh(m):13s} {sh(yy[:4]):13s} | {mz:14s} {'/'.join(f'{v:.2f}' for v in yy[5::2])}{'  (held out)' if s in HOLD else ''}")
