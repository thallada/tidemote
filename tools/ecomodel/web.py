"""The food web assembled from measured processes (tools/ecomodel/fit.py -> meas/fit.json).

State: awake densities P, G, H, S and husks D (per particle slot). Every term is a fitted curve:
  light per producer   light(P, living, silt) under the world's light rule
  grazer intake        graze(P, bite) (energy per grazer per minute, assimilated)
  hunter kills         hunt(prey) kills per hunter per minute (saturating early: hunters find their prey)
  scavenger intake     scav(D)
  births               beta * room(silt) * (income - upkeep) / b per guild; starving below upkeep
  deaths               old age (measured rate), being eaten (kills shared over prey by density), starving
  husks                every death but a kill leaves one; a kill leaves a carcass; dung; scavengers eat them
Knobs act on the curves they touch (e.g. bite scales grazing, interference divides hunters' kills).

  tools/ecomodel/.venv/bin/python tools/ecomodel/web.py      (validates against every measured ensemble)
"""
import json
import numpy as np
from scipy.integrate import solve_ivp

F = json.load(open('tools/ecomodel/meas/fit.json'))
CYST = 0.06       # slots held by cysts, stone, glint and framboids
CARCASS = 0.3     # a kill leaves a carcass (carcassKeep)


def params(bite=0.1, perArea=0, dung=0, ia=0, **over):
    p = dict(F, bite=bite, perArea=perArea, dung=dung, ia=ia, huntMul=1.0, cH=0.0, grazeMul=1.0, scavMul=1.0,
             huskDecay=0.4, huskE=None)
    p.update(over)
    return p


def rates(x, p):
    P, G, H, S, D = np.maximum(x, 0)
    L = P + G + H + S + CYST * 0.5
    silt = max(1e-6, 1 - (P + G + H + S) - D - CYST)
    g0, ks, s, gB, sP = p['light']
    nut = silt / (silt + ks)
    light = gB * nut / (1 + sP * P) if p['perArea'] else g0 * nut / (1 + s * L)
    a, h, e = p['graze']
    intakeG = p['grazeMul'] * (p['bite'] / 0.1) ** e * a * P / (1 + a * h * P)
    prey = G + S + H
    kmax, xh = p['hunt']
    kills = p['huntMul'] * kmax * prey / (prey + xh) / (1 + p['cH'] * H)
    # interference (K.interfere 0.6): a hunter's rivals are its kin close by (about 14 H neighbours of every
    # kind, over ~5 hunter species) or, with interfereAll (ia), every hunter close by
    if p.get('ia', 0):
        nb = 14.0 * H
        kills *= (1 + 0.6 * nb / 5) / (1 + 0.6 * p['ia'] * nb)
    fmax, dh = p['scav']
    intakeS = p['scavMul'] * fmax * D / (D + dh)
    inc = dict(P=light, G=intakeG, H=kills * p['eK'], S=intakeS)
    return inc, kills, intakeG, intakeS, silt


def netGrowth(x, p):
    """Per-capita net growth of each guild at state x, from the processes (no correction)."""
    P, G, H, S, D = np.maximum(x, 1e-9)
    d = rhs(0, x, dict(p, corr=None))
    return dict(P=d[0] / P, G=d[1] / G, H=d[2] / H, S=d[3] / S)


def rhs(t, x, p):
    P, G, H, S, D = np.maximum(x, 0)
    inc, kills, intakeG, intakeS, silt = rates(x, p)
    d = {}
    deadHusk = 0.0
    for g, X in zip('PGHS', (P, G, H, S)):
        beta, ksl = p['birth' + g]
        sur = (inc[g] - p['u' + g]) / p['b' + g]
        births = beta * max(sur, 0) * silt / (silt + ksl)
        starve = max(-sur, 0)
        old = p['old' + g]
        d[g] = X * (births - starve - old)
        deadHusk += X * (starve + old)
    # deaths by being eaten: the hunters' pressure plus killing that rises with the animals about (fit.py)
    prey = G + S + H
    K = kills * H
    hr = K / prey if prey > 0 else 0.0
    for g, X in (('G', G), ('S', S), ('H', H)):
        alpha, beta, gamma = p['eaten' + g]
        d[g] -= X * (alpha * hr + beta * prey + gamma)
    # gray-box corrections (fit.py): cysts, guild drift, what the processes miss
    if p.get('corr'):
        for g, X in zip('PGHS', (P, G, H, S)):
            c0, c1, c2 = p['corr'][g]
            d[g] += X * c0
    # producers grazed to death
    d['P'] -= intakeG * G / 0.8 / p['eP']
    # husks: deaths, carcasses, dung (in husk-equivalents), eaten by scavengers, decaying to silt
    huskE = p['huskE'] or 7.0
    dungN = p['dung'] * 0.25 * intakeG * G / huskE
    dD = deadHusk + CARCASS * K + dungN - intakeS * S / huskE - p['huskDecay'] * D
    return np.array([d['P'], d['G'], d['H'], d['S'], dD])


def simulate(p, x0=(0.3, 0.06, 0.04, 0.04, 0.04), T=30, floor=3e-5):
    def f(t, x):
        dx = rhs(t, x, p)
        dx[:4] = np.where((x[:4] <= floor) & (dx[:4] < 0), 0.0, dx[:4])
        return dx
    sol = solve_ivp(f, (0, T), np.array(x0, float), method='LSODA', max_step=0.05, rtol=1e-6, atol=1e-9, dense_output=True)
    return sol


def shares(x):
    P, G, H, S = x[:4]
    L = P + G + H + S
    return dict(P=P / L, G=G / L, H=H / L, S=S / L, living=L)


def fmt(sh):
    return f"P{100 * sh['P']:3.0f}% G{100 * sh['G']:3.0f}% H{100 * sh['H']:3.0f}% S{100 * sh['S']:3.0f}%  awake {100 * sh['living']:3.0f}%"


if __name__ == '__main__':
    import sys
    sys.path.insert(0, 'tools/ecomodel')
    from fit import rules
    pts = [{k: (np.nan if v is None else v) for k, v in p.items()} for p in json.load(open('tools/ecomodel/meas/points.json'))]
    sets = sorted(set(p['set'] for p in pts))
    print(f"{'set':12s} {'minute':>6s}   {'measured':42s} {'model':42s}")
    for s in sets:
        sp = [p for p in pts if p['set'] == s]
        p = params(**rules(s))
        early = [q for q in sp if 7 <= q['t'] <= 8]
        x0 = [np.median([q[k] for q in early]) for k in 'PGHSD'] if early else (0.3, 0.06, 0.04, 0.04, 0.04)
        Tmax = max(q['t'] for q in sp) + 5
        sol = simulate(p, x0, T=Tmax - 7)
        at = lambda m: sol.sol(m - 7)
        for m in (12, 20, 27, 45, 57):
            win = [q for q in sp if abs(q['t'] + 2.5 - m) <= 2.5]
            if not win:
                continue
            meas = {k: np.median([q[k] for q in win]) for k in 'PGHS'}
            print(f"{s:12s} {m:6d}   {fmt(shares([meas[k] for k in 'PGHS'])):42s} {fmt(shares(at(m))):42s}")
