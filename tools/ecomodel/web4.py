"""The patch food web (web3.py) with species: each guild is NS species sharing the guild's processes,
so a run shows takeovers, booms and die-offs within guilds as well as the guilds' fates. It is for
rough guesses about new rules before they are built (nothing species-level here is fitted).

A birth is a new species with chance MU (it takes an empty species slot, or the rarest). Species of a
guild are alike unless a rule gives them traits. Rules, each off at 0:

  plague     a species-specific contagion (SIS): a cell catches it from sick cells of its own species
             in its patch (density-dependent), sick cells die at plagueKill/min, recover at plagueCure;
             a few sparks a minute anywhere. A species that booms crosses the epidemic threshold.
  pack       hunters kill more with hunters about: kills x (1 + pack H / (H + packH0)) in the patch
  roam       hungry animals move more: movement x (1 + roam x hunger), hunger = 1 - income / upkeep
  rk         species carry a trait r in [0, 1] (mutating): children cost (1 - 0.6 r) as much, so
             births come faster, and starvation hits (1 + 2 r) as hard
  rps        producers come in three chemistries (species mod 3); each poisons the next locally:
             extra death rps x P(previous chemistry) per slot
  storm      disturbances: storms a minute (Poisson), each kills stormKill of the living in a 3x3 block

Metrics (32 worlds, 60 min): worlds with all four guilds at 1%+ and 5%+ of the living (from 10 min on
the 5%+ must hold at 60), leader changes within guilds per hour, booms (a species x3 within 5 min from
0.3%+ of the slots), die-offs (to a third within 5 min from 0.5%+), the patches' swings (CV of each
patch's animals over 10-60 min), the effective number of species.

  tools/ecomodel/.venv/bin/python tools/ecomodel/web4.py [--runs 32] [--only name,name]
"""
import json, sys
import numpy as np
sys.path.insert(0, 'tools/ecomodel')
import web, web3
from web3 import NX, NY, SLOTS, CYST
from fit import rules

NS = 8
MU = 0.02
G4 = 'PGHS'


def params(**kw):
    M = json.load(open('tools/ecomodel/meas/model.json'))
    web.F.clear(); web.F.update(M)
    p = web3.params(**dict(rules('nd2L'), satietyAt=1.2))
    p.update({k: v for k, v in M.items() if k not in ('bite', 'perArea', 'dung', 'ia', 'flee', 'satiety', 'satietyAt')})
    p.update(json.load(open('tools/ecomodel/meas/model3.json')))
    p.update(plague=0, plagueKill=0.6, plagueCure=0.4, plagueSpark=3.0, pack=0, packH0=0.01, roam=0, rk=0, rps=0,
             storm=0, stormKill=0.6)
    p.update(kw)
    return p


def roll4(m):
    return np.roll(m[0], -1, 0) + np.roll(m[1], 1, 0) + np.roll(m[2], -1, 1) + np.roll(m[3], 1, 1)


def run(p, x0, T=60, dt=0.05, seed=0, tideSpeed=3.0):
    rng = np.random.default_rng(seed)
    tide = web3.tide_field(rng, tideSpeed)
    n, sick, r = {}, {}, {}
    for k, v in zip(G4, x0[:4]):
        w = rng.gamma(2.0, 0.5, (NS, NX, NY)) * rng.dirichlet(np.ones(NS) * 0.7)[:, None, None]
        n[k] = rng.poisson(v * SLOTS * NS * w / w.sum(0, keepdims=True).mean() / NS).astype(float)
        sick[k] = np.zeros_like(n[k])
        r[k] = rng.uniform(0, 1, NS) if p['rk'] else np.zeros(NS)
    D = np.full((NX, NY), x0[4] * SLOTS)
    chem = np.arange(NS) % 3
    rec = []   # (t, counts per guild per species)
    patchA = []
    t = 0.0
    steps = int(T / dt)
    for it in range(steps):
        tr = tide(t)
        light_rel = 1 + p['tideAmp'] * (tr - tr.mean())
        tot = {g: n[g].sum(0) for g in G4}
        c = {g: tot[g] / SLOTS for g in G4}
        c['D'] = D / SLOTS
        inc, kills, intakeG, intakeS, silt = web3.local_rates(c, p, light_rel)
        if p['pack']:
            boost = 1 + p['pack'] * c['H'] / (c['H'] + p['packH0'])
            kills = kills * boost
            inc['H'] = kills * p['eK']
        prey = c['G'] + c['S'] + c['H']
        hr = np.where(prey > 0, kills * c['H'] / np.maximum(prey, 1e-12), 0)
        deadHusk = np.zeros((NX, NY))
        new = {}
        for g in G4:
            beta, ksl = p['birth' + g]
            bg = p['b' + g] * (1 - 0.6 * r[g])[:, None, None]
            sur = (inc[g][None] - p['u' + g]) / bg
            births = beta * np.maximum(sur, 0) * (silt / (silt + ksl))[None]
            starve = np.maximum(-sur, 0) * (1 + 2 * r[g])[:, None, None]
            death = starve + p['old' + g]
            if g != 'P':
                alpha, bt, ga = p['eaten' + g]
                death = death + (alpha * hr + bt * prey + ga)[None]
            else:
                death = death + np.where(c['P'] > 0, intakeG * c['G'] / 0.8 / p['eP'] / np.maximum(c['P'], 1e-12), 0)[None]
                if p['rps']:
                    Pc = np.stack([n['P'][chem == k].sum(0) for k in range(3)]) / SLOTS
                    death = death + p['rps'] * Pc[(chem - 1) % 3]
            corr = p['corr'][g][0]
            births = births + max(corr, 0)
            death = death + max(-corr, 0)
            X = n[g]
            if p['plague']:
                Sk = sick[g]
                births = births * np.where(X > 0, 1 - Sk / np.maximum(X, 1), 1)   # the sick do not divide
            nb = rng.poisson(np.maximum(births * X * dt, 0))
            # mutants: a share of births found new species (placed below)
            mut = rng.binomial(nb, MU)
            nb = nb - mut
            nd = np.minimum(rng.poisson(np.maximum(death * X * dt, 0)), X + nb)
            if p['plague']:
                # the sick: caught from one's own species in the patch, killed, cured; deaths shared fairly
                frac = np.where(X > 0, sick[g] / np.maximum(X, 1), 0)
                ndS = np.minimum(rng.binomial(nd.astype(np.int64), np.clip(frac, 0, 1)), sick[g])
                healthy = np.maximum(X - sick[g], 0)
                force = p['plague'] * sick[g] / SLOTS
                caught = rng.binomial(healthy.astype(np.int64), np.clip(1 - np.exp(-force * dt), 0, 1))
                died = rng.binomial((sick[g] - ndS).astype(np.int64), np.clip(p['plagueKill'] * dt, 0, 1))
                cured = rng.binomial((sick[g] - ndS - died).astype(np.int64), np.clip(p['plagueCure'] * dt, 0, 1))
                sick[g] = sick[g] - ndS + caught - died - cured
                nd = np.minimum(nd + died, X + nb)
                deadHusk += died.sum(0)
            X = X + nb - nd
            if mut.sum():
                totS = X.sum((1, 2))
                for s, i, j in zip(*np.nonzero(mut)):
                    for _ in range(int(mut[s, i, j])):
                        d = int(np.argmin(totS))
                        if totS[d] > 0:
                            X[d] = 0; sick[g][d] = 0
                        X[d, i, j] += 1; totS[d] = X[d].sum()
                        if p['rk']:
                            r[g][d] = np.clip(r[g][s] + rng.normal(0, 0.15), 0, 1)
            new[g] = X
            deadHusk += (X * 0 + n[g] * (starve + p['old' + g])).sum(0)
        huskE = p['huskE'] or 7.0
        dD = deadHusk + 0.3 * kills * tot['H'] + p['dung'] * 0.25 * intakeG * tot['G'] / huskE - intakeS * tot['S'] / huskE - p['huskDecay'] * D
        D = np.maximum(D + dD * dt, 0)
        # storms
        if p['storm']:
            for _ in range(rng.poisson(p['storm'] * dt)):
                i, j = rng.integers(NX), rng.integers(NY)
                for g in G4:
                    for di in (-1, 0, 1):
                        for dj in (-1, 0, 1):
                            a, b = (i + di) % NX, (j + dj) % NY
                            k = rng.binomial(new[g][:, a, b].astype(np.int64), p['stormKill'])
                            new[g][:, a, b] -= k
                            if p['plague']:
                                sick[g][:, a, b] = np.minimum(sick[g][:, a, b], new[g][:, a, b])
                            D[a, b] += k.sum()
        # movement: as web3, per species; roam: hungry animals move more
        food = {'G': c['P'], 'H': c['G'] + c['S'] + c['H'], 'S': c['D'], 'P': None}
        for g in G4:
            X = new[g]
            base = np.full((4, NX, NY), p['move'] / 4)
            if p['roam'] and g != 'P':
                hunger = np.clip(1 - inc[g] / p['u' + g], 0, 1)
                base = base * (1 + p['roam'] * hunger)[None]
            if food[g] is not None:
                F = food[g]
                for k, Fn in enumerate(web3.neighbours(F)):
                    base[k] += p['tax' + g] * np.maximum(Fn - F, 0) / (Fn + F + 1e-3)
            fr = np.minimum(base * dt, 0.2)
            moved = np.zeros((4,) + X.shape)
            mS = np.zeros((4,) + X.shape)
            left = X.copy(); leftS = sick[g].copy()
            for k in range(4):
                q = np.clip(fr[k] / np.maximum(1 - fr[:k].sum(0), 1e-9), 0, 1)[None]
                moved[k] = rng.binomial(left.astype(np.int64), q)
                if p['plague']:
                    mS[k] = np.minimum(rng.binomial(leftS.astype(np.int64), q), moved[k])
                    leftS = leftS - mS[k]
                left = left - moved[k]
            X = X - moved.sum(0) + np.stack([roll4(moved[:, s]) for s in range(NS)])
            if p['plague']:
                sick[g] = np.minimum(sick[g] - mS.sum(0) + np.stack([roll4(mS[:, s]) for s in range(NS)]), X)
            n[g] = X
        # abiogenesis (as web3) and plague sparks
        for _ in range(rng.poisson(p['abio'] * dt)):
            g = rng.choice(list(G4), p=[0.55, 0.15, 0.15, 0.15])
            s = int(np.argmin(n[g].sum((1, 2))))
            n[g][s, rng.integers(NX), rng.integers(NY)] += 1
        if p['plague']:
            for _ in range(rng.poisson(p['plagueSpark'] * dt)):
                g = rng.choice(list('GHS')); s = rng.integers(NS); i, j = rng.integers(NX), rng.integers(NY)
                if n[g][s, i, j] > sick[g][s, i, j]:
                    sick[g][s, i, j] += 1
        t += dt
        if it % 10 == 0:
            rec.append((t, {g: n[g].sum((1, 2)).copy() for g in G4}, {g: float(sick[g].sum()) for g in G4}))
            if t >= 10:
                patchA.append(sum(n[g].sum(0) for g in 'GHS'))
    return rec, np.array(patchA)


def metrics(rec, patchA, T=60):
    ts = np.array([q[0] for q in rec])
    out = {}
    tot = np.array([[q[1][g].sum() for g in G4] for q in rec])
    L = tot.sum(1, keepdims=True)
    sh = tot / np.maximum(L, 1)
    out['shares'] = sh[-1]
    out['all4'] = bool(np.all(sh[-1] >= 0.01))
    out['thrive'] = bool(np.all(sh[-1] >= 0.05))
    lead = 0; boom = 0; die = 0
    w = int(round(5 / (ts[1] - ts[0])))
    for gi, g in enumerate(G4):
        C = np.array([q[1][g] for q in rec])           # time x species
        # leader changes (the new leader 20% ahead), from 5 min on
        cur = None
        for k in range(len(ts)):
            if ts[k] < 5:
                continue
            top = int(np.argmax(C[k]))
            if cur is None:
                cur = top
            elif top != cur and C[k, top] > 1.2 * C[k, cur]:
                lead += 1; cur = top
        # booms and die-offs, one per species per 5-minute window
        for s in range(NS):
            x = C[:, s]
            k = 0
            while k + w < len(x):
                if x[k] >= 0.003 * 32768 and x[k + w] >= 3 * x[k]:
                    boom += 1; k += w
                elif x[k] >= 0.005 * 32768 and x[k + w] <= x[k] / 3:
                    die += 1; k += w
                else:
                    k += 1
    hrs = (ts[-1] - 5) / 60
    out['leader/h'] = lead / hrs / 4
    out['booms/h'] = boom / hrs
    out['dieoffs/h'] = die / hrs
    m = patchA.mean(0)
    out['patchCV'] = float(np.nanmedian(np.where(m > 5, patchA.std(0) / np.maximum(m, 1e-9), np.nan)))
    allS = np.concatenate([rec[-1][1][g] for g in G4])
    q = allS / max(allS.sum(), 1)
    out['effSp'] = float(1 / max((q * q).sum(), 1e-12))
    return out


VARIANTS = {
    'base': {},
    'plague300': dict(plague=300),
    'plague800': dict(plague=800),
    'pack': dict(pack=1.0),
    'pack3': dict(pack=3.0),
    'roam': dict(roam=4.0),
    'rk': dict(rk=1),
    'rps': dict(rps=3.0),
    'rps10': dict(rps=10.0),
    'storm': dict(storm=0.5),
    'storm2': dict(storm=2.0),
    'plague+roam': dict(plague=300, roam=4.0),
    'plague+rk+roam': dict(plague=300, rk=1, roam=4.0),
    'all': dict(plague=300, rk=1, roam=4.0, pack=1.0, rps=3.0, storm=0.5),
}

if __name__ == '__main__':
    import time
    runs = int(sys.argv[sys.argv.index('--runs') + 1]) if '--runs' in sys.argv else 32
    only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else list(VARIANTS)
    x0 = [0.095, 0.21, 0.022, 0.07, 0.07]
    print(f"{'variant':16s} all4 thrive  P/G/H/S median %       leader/h booms/h dieoffs/h patchCV effSp")
    for name in only:
        t0 = time.time()
        res = [metrics(*run(params(**VARIANTS[name]), x0, seed=100 + s)) for s in range(runs)]
        med = lambda k: np.median([r[k] for r in res])
        shm = np.median([r['shares'] for r in res], axis=0)
        print(f"{name:16s} {100 * np.mean([r['all4'] for r in res]):3.0f}% {100 * np.mean([r['thrive'] for r in res]):4.0f}%   "
              f"{'/'.join(f'{100 * v:2.0f}' for v in shm):18s}  {med('leader/h'):7.1f} {med('booms/h'):7.1f} {med('dieoffs/h'):8.1f} {med('patchCV'):7.2f} {med('effSp'):5.1f}"
              f"   ({time.time() - t0:.0f} s)", flush=True)
