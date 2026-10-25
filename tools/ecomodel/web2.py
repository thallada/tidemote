"""The food web with energy-structured animals: each of grazers G, hunters H and scavengers S is a
histogram over its cells' energy, from 0 to the energy to divide (NB bins), instead of one number.

Per guild, energy moves through the bins: upkeep drains every cell down; grazers and scavengers gain
energy smoothly (small bites and husks); hunters gain it in jumps, one kill at a time, attacking with
probability p(e) = clamp((1 - e / satietyAt) / satiety) when K.satiety is on. A cell reaching the top
divides as silt allows (parent and child both restart at E0, about half: each keeps or gets half of what
it held); a cell falling below 0 starves to a husk; old age and being eaten remove cells from every bin.
Energy is scaled by the climb: a cell gains its energy per birth b between divisions, so the span from 0
to the threshold is b / (1 - E0).

Producers, the feeding curves (light, grazing, hunters' kills, scavenging) and deaths by being eaten are
those of web.py (fitted to the ensembles, fit.py); births and starvation come out of the histograms.

  tools/ecomodel/.venv/bin/python tools/ecomodel/web2.py      (checks against the measured ensembles)
"""
import json, sys
import numpy as np
from scipy.integrate import solve_ivp
sys.path.insert(0, 'tools/ecomodel')
import web

NB = 40
E0 = 0.5
EDGE = np.linspace(0, 1, NB + 1)
MID = 0.5 * (EDGE[1:] + EDGE[:-1])
DE = 1.0 / NB
I0 = int(E0 * NB)
ANIMALS = 'GHS'
BIRTHS = {}   # the last rhs call's births per minute per guild (for birthsPerCell)


def params(**kw):
    p = web.params(**kw)
    p.setdefault('divRate', 20.0)    # how fast a cell at the threshold divides when silt is to hand
    return p


def unpack(x):
    P = max(x[0], 0.0)
    h = {g: np.maximum(x[1 + i * NB: 1 + (i + 1) * NB], 0.0) for i, g in enumerate(ANIMALS)}
    D = max(x[-1], 0.0)
    return P, h, D


def pack(P, h, D):
    return np.concatenate([[P], h['G'], h['H'], h['S'], [D]])


def totals(x):
    P, h, D = unpack(x)
    return np.array([P, h['G'].sum(), h['H'].sum(), h['S'].sum(), D])


_JUMPS = {}


def jumpMatrix(k):
    """Where a kill moves a hunter, as a matrix over energy bins (a jump of k bins, split between the
    two bins it falls between), and the share of each bin's kills that carry it past the threshold:
    those divide at once, parent and child sharing all it holds."""
    if k in _JUMPS:
        return _JUMPS[k]
    lo, fr = int(np.floor(k)), k - np.floor(k)
    M = np.zeros((NB, NB))
    ob = np.zeros(NB)
    for i in range(NB):
        for tgt, w in ((i + lo, 1 - fr), (i + lo + 1, fr)):
            if w <= 0:
                continue
            if tgt < NB:
                M[tgt, i] += w
            else:
                half = min(int((tgt + 0.5) * DE / 2 / DE), NB - 1)
                M[half, i] += 2 * w
                ob[i] += w
    _JUMPS[k] = (M, ob)
    return M, ob


def attack(p):
    """hunters' chance to attack in each energy bin (satiety)"""
    if not p.get('satiety', 0):
        return np.ones(NB)
    raw = np.clip((1 - MID / p.get('satietyAt', 1.0)) / p['satiety'], 0, 1)
    # satEff: how strongly satiety acts on the GPU, fitted (meals lumpier, energy shared in bodies)
    return 1 - p.get('satEff', 1.0) * (1 - raw)


def costsAt(p, t):
    """each guild's upkeep and energy per birth at minute t of the run, as the guilds evolve
    (meas/evolve.json: an exponential relaxation from the 7-minute value), when p['evolve'] is set"""
    if not p.get('evolve'):
        return p
    q = dict(p)
    for k, (a, b, tau) in p['evolve'].items():
        q[k] = b + (a - b) * np.exp(-(max(t + p.get('t0', 7.0), 7.0) - 7.0) / tau)
    return q


def rhs(t, x, p):
    p = costsAt(p, t)
    P, h, D = unpack(x)
    G, H, S = h['G'].sum(), h['H'].sum(), h['S'].sum()
    tot = np.array([P, G, H, S, D])
    inc, kills, intakeG, intakeS, silt = web.rates(tot, dict(p, satiety=0))  # kills when attacking
    room = silt / (silt + p['birthG'][1])
    dh = {}
    deadHusk = 0.0
    att = attack(p)
    realized = (h['H'] * att).sum() / H * kills if H > 0 else 0.0   # kills per hunter per minute, on average
    for g in ANIMALS:
        n = h[g]
        span = p['b' + g] / (1 - E0)                      # energy from 0 to the threshold
        drain = p['u' + g] / span / DE                    # bins per minute, downward
        d = np.zeros(NB)
        # upkeep: flow down one bin; out of the bottom bin is starvation
        out = n * drain
        d -= out
        d[:-1] += out[1:]
        starve = out[0]
        overshoot_births = [0.0]
        if g == 'H':
            # kills: jumps of eK / span, each bin attacking with its satiety share
            jump = p['eK'] / span
            rate = kills * att                             # kills per minute per hunter in each bin
            k = jump / DE
            lo, fr = int(np.floor(k)), k - np.floor(k)
            moved = n * rate
            d -= moved
            M, ob = jumpMatrix(round(k, 2))   # quantised: costs drift as guilds evolve, and an exact key per step would grow without bound
            d += M @ moved
            overshoot_births[0] += ob @ moved
        else:
            gain = (intakeG if g == 'G' else intakeS) / span / DE
            up = n * gain
            d -= up
            d[1:] += up[:-1]
            d[-1] += up[-1]                                # held at the threshold until it divides
        # division from the top bin: two cells at E0
        div = n[-1] * p['divRate'] * room
        d[-1] -= div
        d[I0] += 2 * div
        BIRTHS[g] = div + overshoot_births[0]
        # old age and being eaten, from every bin
        alpha, beta_, gamma = p['eaten' + g]
        w = p.get('hunterPrey', 1.0)
        prey = G + S + w * H
        hr = realized * H / prey if prey > 0 else 0.0
        eaten = alpha * hr * (w if g == 'H' else 1.0) + beta_ * (G + S + H) + gamma
        old = p['old' + g]
        corr = p['corr'][g][0] if p.get('corr') else 0.0
        d -= n * (eaten + old)
        d += n * corr
        dh[g] = d
        deadHusk += starve + old * n.sum()
    # producers and husks as in web.py
    beta, ksl = p['birthP']
    sur = (inc['P'] - p['uP']) / p['bP']
    dP = P * (beta * max(sur, 0) * silt / (silt + ksl) - max(-sur, 0) - p['oldP']) - intakeG * G / 0.8 / p['eP']
    if p.get('corr'):
        dP += P * p['corr']['P'][0]
    deadHusk += P * p['oldP']
    huskE = p['huskE'] or 7.0
    dD = deadHusk + 0.3 * realized * H + p['dung'] * 0.25 * intakeG * G / huskE - intakeS * S / huskE - p['huskDecay'] * D
    return pack(dP, dh, dD)


def start(x0):
    """the measured densities spread over the upper half of the energy bins"""
    P, G, H, S, D = x0
    shape = np.where(MID >= E0, 1.0, 0.25)
    shape /= shape.sum()
    return pack(P, {'G': G * shape, 'H': H * shape, 'S': S * shape}, D)


def simulate(p, x0, T=30):
    floor = 3e-6
    def f(t, x):
        dx = rhs(t, x, p)
        dx = np.where((x <= floor) & (dx < 0), 0.0, dx)
        return dx
    return solve_ivp(f, (0, T), start(x0), method='RK23', max_step=0.5, rtol=1e-4, atol=1e-8, dense_output=True)


def birthsPerCell(x, p):
    """each guild's births per cell per minute at state x (from the top bin and from meals past it)"""
    _, h, _ = unpack(x)
    rhs(0, x, p)
    return {g: BIRTHS[g] / max(h[g].sum(), 1e-12) for g in ANIMALS}
