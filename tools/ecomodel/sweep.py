"""Sweeps knobs through the fitted food-web model (meas/model.json) from the default's measured 7-minute
state, and ranks the outcomes at 30 and 60 minutes by the smallest animal guild (thriving needs all of
grazers, hunters and scavengers at 5%+ of the awake).

  tools/ecomodel/.venv/bin/python tools/ecomodel/sweep.py
Knobs as the model holds them: bite (K.bite), light (photo: scales per-area light), ia (interfereAll),
kmax (hunters' kill ceiling: ~1/killEvery), eK (energy per kill: ~1 - carcassKeep), dung.
"""
import itertools, json, sys
import numpy as np
sys.path.insert(0, 'tools/ecomodel')
import web

F = json.load(open('tools/ecomodel/meas/model.json'))
pts = [{k: (np.nan if v is None else v) for k, v in p.items()} for p in json.load(open('tools/ecomodel/meas/points.json'))]
start = [np.nanmedian([p[k] for p in pts if p['set'] == 'trD30' and p['t'] == 7]) for k in 'PGHSD']


def outcome(bite=0.2, light=1.0, ia=0, kmax=1.0, eK=1.0, dung=1, shade=1.0, xh=1.0, T=(30, 60)):
    p = web.params(bite=bite, perArea=1, dung=dung, ia=ia)
    p.update({k: v for k, v in F.items() if k not in ('bite', 'perArea', 'dung', 'ia')})
    p['light'] = list(p['light']); p['light'][3] *= light; p['light'][4] *= shade
    p['hunt'] = [p['hunt'][0] * kmax, p['hunt'][1] * xh]
    p['eK'] *= eK
    sol = web.simulate(p, start, T=max(T) - 7 + 0.01)
    out = {}
    for t in T:
        x = np.maximum(sol.sol(t - 7)[:4], 0)
        L = x.sum()
        out[t] = dict(zip('PGHS', x / L), awake=L)
    return out


def fmt(o):
    return f"P{100 * o['P']:3.0f} G{100 * o['G']:3.0f} H{100 * o['H']:3.0f} S{100 * o['S']:3.0f} awake{100 * o['awake']:3.0f}"


if __name__ == '__main__':
    grid = dict(bite=[0.2, 0.3], light=[1.0, 1.5, 2.0, 3.0], shade=[1.0, 2.0, 4.0, 8.0], ia=[0, 1])
    if '--grid' in sys.argv:
        grid = json.loads(sys.argv[sys.argv.index('--grid') + 1])
    rows = []
    for combo in itertools.product(*grid.values()):
        kw = dict(zip(grid, combo))
        try:
            o = outcome(**kw)
        except Exception:
            continue
        score = min(min(o[t]['G'], o[t]['H'], o[t]['S']) for t in o)
        rows.append((score, kw, o))
    rows.sort(key=lambda r: -r[0])
    base = outcome()
    print(f"default                                          30m {fmt(base[30])}   60m {fmt(base[60])}")
    for score, kw, o in rows[:15]:
        print(f"{json.dumps(kw):48s} 30m {fmt(o[30])}   60m {fmt(o[60])}   min animal {100 * score:4.1f}%")
