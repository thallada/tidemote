"""The food web in space: a grid of patches (NX x NY over the torus world), each running the mean-field
web (web.py) on its own counts, with its own silt, husks and light, and cells moving between neighbours.

  light      the tide's moving bands (tideAt's shape: a few integer-wavenumber waves drifting at the
             world's speed) over the per-area rule, so meadows bloom and fade patch by patch
  hunting    local: kills per hunter = aH x prey / (1 + aH hH prey) on the patch's own prey, so hunters
             saturate only where prey is dense; satiety's attack share as in web.py
  movement   every guild spreads to the four neighbours at its own rate; grazers drift toward
             producers, scavengers toward husks, hunters toward prey (clustering emerges)
  chance     with noise, births, deaths and moves are whole cells drawn at random per patch (tau-leaping),
             so a run is one world and many runs give the share of worlds where each guild lives;
             abiogenesis sparks a few cells a minute somewhere

Other processes (births against surplus, being eaten by the rest, old age, dung, husks) are web.py's,
calibrated by trajfit (meas/model.json); the patch's own parameters (aH, hH, movement) are fitted here.

  tools/ecomodel/.venv/bin/python tools/ecomodel/web3.py
"""
import json, sys
import numpy as np
sys.path.insert(0, 'tools/ecomodel')
import web

NX, NY = 16, 8
SLOTS = 32768 / (NX * NY)          # particle slots per patch
CYST = 0.06


def params(**kw):
    p = web.params(**kw)
    p.update(dict(aH=40.0, hH=0.28, move=0.5, taxG=1.0, taxH=2.0, taxS=1.0, tideAmp=0.6, abio=2.0))
    return p


def tide_field(rng, speed=1.0):
    """three tide waves as the engine draws them: integer wavenumbers, a slow drift, random phases"""
    a = rng.integers(-3, 4, size=(3, 2))
    a[np.all(a == 0, axis=1)] = [1, 0]
    v = rng.choice([-1, 1], 3) * rng.uniform(0.008, 0.03, 3) * 60 * speed   # radians per minute
    amp = rng.uniform(0.6, 1.1, 3)
    ph = rng.uniform(0, 2 * np.pi, 3)
    ux = (np.arange(NX) + 0.5) / NX * 2 * np.pi
    uy = (np.arange(NY) + 0.5) / NY * 2 * np.pi
    UX, UY = np.meshgrid(ux, uy, indexing='ij')

    def at(t):
        s = sum(amp[k] * np.sin(a[k, 0] * UX + a[k, 1] * UY + v[k] * t + ph[k]) for k in range(3))
        x = np.clip((s * 2.7 / amp.sum() - 0.35) / (1.9 - 0.35), 0, 1)
        return x * x * (3 - 2 * x)                  # smoothstep, as tideAt
    return at


def neighbours(X):
    return [np.roll(X, 1, 0), np.roll(X, -1, 0), np.roll(X, 1, 1), np.roll(X, -1, 1)]


def local_rates(c, p, light_rel):
    """per-patch incomes and rates; c: dict of densities per slot (arrays NX x NY)"""
    P, G, H, S, D = c['P'], c['G'], c['H'], c['S'], c['D']
    L = P + G + H + S
    silt = np.maximum(1 - L - D - CYST, 1e-6)
    g0, ks, s, gB, sP = p['light']
    nut = silt / (silt + ks)
    light = gB * nut / (1 + sP * P) * light_rel
    a, h, e = p['graze']
    intakeG = p['grazeMul'] * (p['bite'] / 0.1) ** e * a * P / (1 + a * h * P)
    prey = G + S + p.get('hunterPrey', 1.0) * H
    kills = p['aH'] * prey / (1 + p['aH'] * p['hH'] * prey)
    if p.get('flee', 0):
        kills = kills * p.get('fleeMul', 1.0)
    if p.get('satiety', 0):
        _, att = web.hunterCycle(np.mean(kills), p['eK'], p['uH'], p['bH'], p['satiety'], p.get('satietyAt', 1.0))
        kills = kills * att
    fmax, dh = p['scav']
    intakeS = p['scavMul'] * fmax * D / (D + dh)
    return dict(P=light, G=intakeG, H=kills * p['eK'], S=intakeS), kills, intakeG, intakeS, silt


def step(n, p, light_rel, dt, rng=None):
    """one step of the whole grid: n is a dict of counts per patch (floats without noise)"""
    c = {k: n[k] / SLOTS for k in 'PGHSD'}
    inc, kills, intakeG, intakeS, silt = local_rates(c, p, light_rel)
    rate = {}
    deadHusk = np.zeros((NX, NY))
    for g in 'PGHS':
        beta, ksl = p['birth' + g]
        sur = (inc[g] - p['u' + g]) / p['b' + g]
        births = beta * np.maximum(sur, 0) * silt / (silt + ksl)
        starve = np.maximum(-sur, 0)
        death = starve + p['old' + g]
        if g != 'P':
            alpha, bt, ga = p['eaten' + g]
            prey = c['G'] + c['S'] + c['H']
            hr = np.where(prey > 0, kills * c['H'] / np.maximum(prey, 1e-12), 0)
            death = death + alpha * hr + bt * prey + ga
        else:
            death = death + np.where(c['P'] > 0, intakeG * c['G'] / 0.8 / p['eP'] / np.maximum(c['P'], 1e-12), 0)
        corr = p['corr'][g][0] if p.get('corr') else 0.0
        rate[g] = (births + np.maximum(corr, 0), death + np.maximum(-corr, 0))
        deadHusk += n[g] * (starve + p['old' + g])
    out = {}
    for g in 'PGHS':
        b, d = rate[g]
        if rng is None:
            out[g] = np.maximum(n[g] + (b - d) * n[g] * dt, 0)
        else:
            nb = rng.poisson(np.maximum(b * n[g] * dt, 0))
            nd = np.minimum(rng.poisson(np.maximum(d * n[g] * dt, 0)), n[g] + nb)
            out[g] = n[g] + nb - nd
    huskE = p['huskE'] or 7.0
    dD = deadHusk + 0.3 * kills * n['H'] + p['dung'] * 0.25 * intakeG * n['G'] / huskE - intakeS * n['S'] / huskE - p['huskDecay'] * n['D']
    out['D'] = np.maximum(n['D'] + dD * dt, 0)
    # movement: diffusion to the four neighbours, plus drift toward each guild's food
    food = {'G': c['P'], 'H': c['G'] + c['S'] + c['H'], 'S': c['D'], 'P': None}
    for g in 'PGHS':
        X = out[g]
        rate_out = np.full((4, NX, NY), p['move'] / 4)
        if food[g] is not None:
            F = food[g]
            for k, Fn in enumerate(neighbours(F)):
                rate_out[k] += p['tax' + g] * np.maximum(Fn - F, 0) / (Fn + F + 1e-3)
        frac = np.minimum(rate_out * dt, 0.25)
        if rng is None:
            moved = frac * X
        else:
            moved = np.zeros_like(frac)
            left = X.copy()
            for k in range(4):
                moved[k] = rng.binomial(left.astype(np.int64), np.clip(frac[k] / np.maximum(1 - frac[:k].sum(0), 1e-9), 0, 1))
                left = left - moved[k]
        X = X - moved.sum(0)
        # a cell leaving toward neighbour k arrives there: roll back the other way
        X = X + np.roll(moved[0], -1, 0) + np.roll(moved[1], 1, 0) + np.roll(moved[2], -1, 1) + np.roll(moved[3], 1, 1)
        out[g] = X
    # abiogenesis: a few cells a minute, somewhere in the light
    if rng is not None and p['abio'] > 0:
        for _ in range(rng.poisson(p['abio'] * dt)):
            i, j = rng.integers(NX), rng.integers(NY)
            g = rng.choice(list('PGHS'), p=[0.55, 0.15, 0.15, 0.15])
            out[g][i, j] += 1
    return out


def run(p, x0, T=53, dt=0.05, seed=0, noise=True, tideSpeed=3.0, sample=(5, 15, 23, 35, 45)):
    """one world from densities x0 (P, G, H, S, D per slot), spread with a little patchiness;
    returns world-wide densities at the sample times (minutes after the start)"""
    rng = np.random.default_rng(seed)
    tide = tide_field(rng, tideSpeed)
    n = {}
    for k, v in zip('PGHSD', x0):
        w = rng.gamma(2.0, 0.5, (NX, NY))
        n[k] = v * SLOTS * w / w.mean()
        if noise and k != 'D':
            n[k] = rng.poisson(n[k]).astype(float)
    out = {}
    t = 0.0
    for i in range(int(T / dt) + 1):
        tr = tide(t)
        light_rel = 1 + p['tideAmp'] * (tr - tr.mean())
        n = step(n, p, light_rel, dt, rng if noise else None)
        t += dt
        for s in sample:
            if abs(t - s) < dt / 2:
                out[s] = np.array([n[k].sum() / 32768 for k in 'PGHSD'])
    return out


if __name__ == '__main__':
    import time
    sys.path.insert(0, 'tools/ecomodel')
    from fit import rules
    M = json.load(open('tools/ecomodel/meas/model.json'))
    web.F.clear(); web.F.update(M)
    p = params(**rules('nd2L'))
    p.update({k: v for k, v in M.items() if k not in ('bite', 'perArea', 'dung', 'ia', 'flee', 'satiety', 'satietyAt')})
    x0 = [0.2, 0.17, 0.02, 0.06, 0.05]
    t = time.time(); r = run(p, x0, noise=False); print(f'deterministic: {time.time() - t:.2f} s', {k: v.round(3) for k, v in r.items()})
    t = time.time(); r = run(p, x0, noise=True); print(f'with noise: {time.time() - t:.2f} s', {k: v.round(3) for k, v in r.items()})
