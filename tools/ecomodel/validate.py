"""Checks the models against measured ensembles: each started from the set's measured 7-minute state under
its rules (fit.py RULES), compared at later windows. Prints guild shares (measured / mean-field web.py /
energy-structured web2.py), hunters' births per cell, and an overall error per model.

  tools/ecomodel/.venv/bin/python tools/ecomodel/validate.py [sets...]
"""
import json, sys
import numpy as np
sys.path.insert(0, 'tools/ecomodel')
from fit import rules
import web, web2

pts = [{k: (np.nan if v is None else v) for k, v in p.items()} for p in json.load(open('tools/ecomodel/meas/points.json'))]
F = json.load(open('tools/ecomodel/meas/fit.json'))
web.F.clear(); web.F.update(F)
sets = sys.argv[1:] or ['lgD60', 'b25L', 'iaA60', 'defL2', 'pr25L', 'fl5L', 'flsatL', 'flsatabL']


def med(s, t, k):
    v = [p.get(k, np.nan) for p in pts if p['set'] == s and p['t'] == t]
    return np.nanmedian(v) if v else np.nan


def shares(x):
    x = np.maximum(np.asarray(x[:4], float), 0)
    return x / max(x.sum(), 1e-12)


err = {'web': [], 'web2': []}
print(f"{'set':9s} {'min':>4s}  {'measured P/G/H/S':22s} {'mean-field':22s} {'structured':22s}  hunter births/cell m / mf / st")
for s in sets:
    ts = sorted(set(p['t'] for p in pts if p['set'] == s))
    if 7 not in ts:
        continue
    x0 = [med(s, 7, k) for k in 'PGHSD']
    r = rules(s)
    p1 = web.params(**r)
    p2 = web2.params(**r)
    T = max(ts) - 7 + 0.01
    s1 = web.simulate(p1, x0, T=T)
    s2 = web2.simulate(p2, x0, T=T)
    for t in ts:
        if t < 12:
            continue
        m = [med(s, t, k) for k in 'PGHS']
        a = s1.sol(t - 7)
        b = web2.totals(s2.sol(t - 7))
        ms, as_, bs = shares(m), shares(a), shares(b)
        err['web'].append(np.abs(ms - as_).sum()); err['web2'].append(np.abs(ms - bs).sum())
        bm = med(s, t, 'birthH')
        b1 = (web.netGrowth(a, p1)['H'] + p1['oldH'])  # rough: net + old age as births proxy
        b2 = web2.birthsPerCell(s2.sol(t - 7), p2)['H']
        if t in (12, 22, 32, 42, 52) or t == max(ts):
            f = lambda v: '/'.join(f'{100 * x:2.0f}' for x in v)
            print(f"{s:9s} {t:4.0f}  {f(ms):22s} {f(as_):22s} {f(bs):22s}  {bm:4.2f} / {b1:4.2f} / {b2:4.2f}")
print(f"\nmean absolute share error (sum over guilds): mean-field {np.mean(err['web']):.3f}, structured {np.mean(err['web2']):.3f}")
