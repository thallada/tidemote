"""Fits the food web's processes to per-window measurements of many ensembles (tools/ecomodel/responses.mjs
--json): producers' light per cell, grazers' intake, hunters' kills, scavengers' intake, and births against
surplus. Each set is tagged with the rules it ran under (bite, light per area or per cell, dung).

  tools/ecomodel/.venv/bin/python tools/ecomodel/fit.py [tools/ecomodel/meas/points.json]
Writes tools/ecomodel/meas/fit.json, the fitted processes the model (model.py) is assembled from.
"""
import json, sys
import numpy as np
from scipy.optimize import curve_fit

# the rules each ensemble ran under (anything not listed: the old default, bite 0.1, light per cell)
RULES = {
    'rBb2dL': dict(bite=0.2, perArea=1, dung=1), 'rBb2L': dict(bite=0.2, perArea=1, dung=0),
    'rBb2d': dict(bite=0.2, perArea=1, dung=1), 'rBb2': dict(bite=0.2, perArea=1, dung=0),
    'rBb15': dict(bite=0.15, perArea=1, dung=0), 'rB': dict(bite=0.1, perArea=1, dung=0),
    'rAb15': dict(bite=0.15, perArea=0, dung=0),
    'iaA6': dict(bite=0.2, perArea=1, dung=1, ia=1), 'iaA6b': dict(bite=0.2, perArea=1, dung=1, ia=1), 'iaA60': dict(bite=0.2, perArea=1, dung=1, ia=1),
    'trD30': dict(bite=0.2, perArea=1, dung=1),
}
OLD = dict(bite=0.1, perArea=0, dung=0)
for v in RULES.values():
    v.setdefault('ia', 0)
OLD['ia'] = 0


def rules(s):
    for k, v in RULES.items():
        if s == k or s.startswith(k + '_'):
            return v
    return RULES.get(s, OLD)


def load(path, tmin=7):
    pts = [{k: (np.nan if v is None else v) for k, v in p.items()} for p in json.load(open(path)) if p['t'] >= tmin]
    for p in pts:
        p.update(rules(p['set']))
    return pts


def fit(f, xs, y, p0, name, bounds=(-np.inf, np.inf)):
    ok = np.isfinite(y) & np.all([np.isfinite(x) for x in xs], axis=0)
    X = tuple(np.asarray(x)[ok] for x in xs)
    par, _ = curve_fit(f, X, np.asarray(y)[ok], p0=p0, bounds=bounds, maxfev=20000)
    pred = f(X, *par)
    yy = np.asarray(y)[ok]
    r2 = 1 - np.sum((yy - pred) ** 2) / np.sum((yy - yy.mean()) ** 2)
    print(f'{name:28s} n {ok.sum():5d}  R2 {r2:5.2f}  params {np.round(par, 4).tolist()}')
    return par.tolist(), r2


def main(path):
    pts = load(path)
    A = lambda k: np.array([p.get(k, np.nan) for p in pts], dtype=float)
    P, G, H, S, D, L, silt = A('P'), A('G'), A('H'), A('S'), A('D'), A('living'), A('silt')
    bite, area = A('bite'), A('perArea')
    out = {}

    # producers' light per cell: g0 * nutrients / shading, shading by all living (per cell) or by producers (per area)
    def light(X, g0, ks, s, gB, sP):
        P, L, silt, area = X
        nut = silt / (silt + ks)
        return np.where(area > 0, gB * nut / (1 + sP * P), g0 * nut / (1 + s * L))
    out['light'], _ = fit(light, (P, L, silt, area), A('incP'), [10, 0.05, 1, 20, 5], 'producer light per cell', bounds=(0, 200))

    # grazers' intake: type II in producer density, its ceiling and slope scaling with the bite
    def graze(X, a, h, e):
        P, bite = X
        k = (bite / 0.1) ** e
        return k * a * P / (1 + a * h * P)
    out['graze'], _ = fit(graze, (P, bite), A('intakeG'), [100, 0.1, 0.7], 'grazer intake per cell', bounds=(0, [1e4, 10, 2]))

    # hunters' kills per cell: type II in prey density (aggregation makes it saturate early)
    prey = G + S + H
    def hunt(X, kmax, xh):
        return kmax * X[0] / (X[0] + xh)
    out['hunt'], _ = fit(hunt, (prey,), A('killsH'), [3, 0.03], 'hunter kills per cell', bounds=(0, [50, 1]))
    out['eK'] = float(np.nanmedian(A('incH') / A('killsH')))   # energy a hunter gains per kill

    # scavengers' intake: type II in husk density
    def scav(X, fmax, dh):
        return fmax * X[0] / (X[0] + dh)
    out['scav'], _ = fit(scav, (D,), A('intakeS'), [12, 0.05], 'scavenger husk intake', bounds=(0, [100, 2]))

    # births per cell: beta * room(silt) * surplus / b, per guild
    for g in 'PGHS':
        sur = (A('inc' + g) - A('u' + g)) / A('b' + g)
        def births(X, beta, ks):
            sur, silt = X
            return beta * np.maximum(sur, 0) * silt / (silt + ks)
        out['birth' + g], _ = fit(births, (sur, silt), A('birth' + g), [0.5, 0.1], f'births per cell {g}', bounds=(0, [5, 5]))
    # deaths by being eaten, per cell: hunters' pressure (their kills shared over prey by density) plus
    # killing by everyone else with a taste for flesh, rising with the animals about (self-limitation)
    hunterRisk = A('killsH') * H / np.maximum(prey, 1e-9)
    for g in 'GSH':
        def eaten(X, alpha, beta, gamma):
            hr, an = X
            return alpha * hr + beta * an + gamma
        out['eaten' + g], _ = fit(eaten, (hunterRisk, G + S + H), A('eaten' + g), [1, 1, 0.1], f'eaten per cell {g}', bounds=(0, [10, 100, 5]))
    # costs and lifespans: medians (they are the genomes' and move slowly)
    for g in 'PGHS':
        for k in ('u', 'b', 'old'):
            out[k + g] = float(np.nanmedian(A(k + g)))
    # grazed producers: cells grazed to death per unit of energy taken
    out['eP'] = float(np.nanmedian(A('intakeG') * G / 0.8 / (A('eatenP') * P)))
    # where kills fall: share of kills on grazers, scavengers and hunters relative to their densities
    out['husk'] = 0.4
    json.dump(out, open('tools/ecomodel/meas/fit.json', 'w'), indent=1)
    # the gray-box step: each guild's measured growth rate (d ln X / dt between windows) against the model's
    # net growth at the window's state; a correction c0 + c1 X + c2 * ia * H per guild (cysts, guild drift
    # by mutation, everything the processes miss), fitted by least squares
    import web
    web.F.clear(); web.F.update(out)
    corr = {}
    for g in 'PGHS':
        X, Y = [], []
        for q in pts:
            if not np.isfinite(q.get('r' + g, np.nan)) or q[g] < 0.003:
                continue
            pr = web.params(**{k: q[k] for k in ('bite', 'perArea', 'dung', 'ia')})
            net = web.netGrowth([q[k] for k in 'PGHSD'], pr)[g]
            X.append([1.0, q[g], q['ia'] * q['H']]); Y.append(q['r' + g] - net)
        X, Y = np.array(X), np.array(Y)
        c, *_ = np.linalg.lstsq(X, Y, rcond=None)
        res = Y - X @ c
        print(f'correction {g}: c0 {c[0]:+.3f} c1 {c[1]:+.3f} c2 {c[2]:+.3f}   residual sd {res.std():.3f} (raw {Y.std():.3f}), n {len(Y)}')
        corr[g] = c.tolist()
    out['corr'] = corr
    json.dump(out, open('tools/ecomodel/meas/fit.json', 'w'), indent=1)
    print('wrote tools/ecomodel/meas/fit.json')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'tools/ecomodel/meas/points.json')
