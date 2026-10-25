"""A mean-field model of the Tidemote food web, calibrated to the measured default world.

Densities are cells per particle slot (32768 slots): P producers, G grazers, H hunters, S scavengers,
D husks. Energy is in the ledger's units per minute per cell. Every rate is taken from the measured late
steady state of the default (runs/feE2b, 32 seeds x 30 min): per-cell incomes, upkeep, energy per birth,
lifetimes, kill and bite rates.

  producers  earn light. Rule A (now): g0 / (1 + s * living), every living neighbor shading a little,
             so a patch's light grows with its producers. Rule B: light per area, shared by the
             producers in a patch: g0 / (1 + sP * P) with a strong sP (a patch's total saturates at g0 / sP).
  grazers    bite producers, type II and nearly saturated at the measured density (they are fully fed:
             their intake is capped by the bite rule, FmaxG).
  hunters    catch grazers, scavengers and each other by mass action (encounter-limited).
  scavengers eat husks, type II.
A guild's births are beta * room * (income - upkeep) / b (room: silt left), it starves at the rate its
income falls short of upkeep (/ b), and dies of age at 1 / tau. Producers lose the cells grazed to death.

  tools/ecomodel/.venv/bin/python tools/ecomodel/model.py
"""
import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import fsolve

N0 = 32768
MEAS = dict(P=12942 / N0, G=1576 / N0, H=415 / N0, S=1694 / N0, D=1443 / N0, silt=12139 / N0,
            incP=7.61, incG=8.85, incH=10.52, incS=7.44,
            uP=3.10, uG=3.98, uH=5.60, uS=3.71, bP=3.24, bG=4.61, bH=6.39, bS=4.73,
            birthP=0.577, birthG=0.752, birthH=0.626, birthS=0.701,
            oldP=0.364, oldG=0.191, oldH=0.100, oldS=0.144,
            eatenP=0.129, eatenG=0.444, eatenH=0.428, eatenS=0.417)
OTHER = 0.06  # slots held by stone, glint and framboids


def calibrate(m=MEAS):
    L = m['P'] + m['G'] + m['H'] + m['S']
    s = 0.507 / L  # rule A: 1 + s * living = 1.507 measured (shade 0.07 x crowd 7.25)
    prey = m['G'] + m['S'] + m['H']
    kills = m['eatenG'] * m['G'] + m['eatenS'] * m['S'] + m['eatenH'] * m['H']
    room = m['silt'] / (m['silt'] + 0.2)
    p = dict(rule='A', g0=m['incP'] * (1 + s * L), s=s, sP=0.0, kSilt=0.2,
             epsG=0.8, PhG=m['P'] / 10, FmaxG=m['incG'] / 0.8 * 1.1,
             eP=m['incG'] / 0.8 * m['G'] / (m['eatenP'] * m['P']),
             aH=kills / m['H'] / prey, eK=m['incH'] * m['H'] / kills,
             FmaxS=m['incS'] * 2, DhS=m['D'], husk=0.4)
    for g in 'PGHS':
        p['u' + g], p['b' + g], p['tau' + g] = m['u' + g], m['b' + g], 1 / m['old' + g]
        p['beta' + g] = m['birth' + g] / ((m['inc' + g] - m['u' + g]) / m['b' + g] * room)
    deaths = sum(m['old' + g] * m[g] for g in 'PGHS')
    p['body'] = m['incS'] * m['S'] / deaths
    return p


def rule_b(p, sP):
    """Light per area: only producers shade, strongly; g0 rescaled so the measured world earns what it does now."""
    q = dict(p, rule='B', sP=sP)
    m = MEAS
    q['g0'] = m['incP'] * (1 + sP * m['P'])
    return q


def rhs(t, x, p):
    P, G, H, S, D = np.maximum(x, 0)
    L = P + G + H + S
    silt = max(0.0, 1 - L - D - OTHER)
    room = silt / (silt + p['kSilt'])
    light = p['g0'] / (1 + p['s'] * L) if p['rule'] == 'A' else p['g0'] / (1 + p['sP'] * P)
    FG = p['FmaxG'] * P / (P + p['PhG'])
    prey = G + S + H
    # kills per hunter: type II with handling hH (killEvery's cap), and interference cH among hunters (Beddington-DeAngelis)
    kill = p['aH'] * prey / (1 + p['aH'] * p.get('hH', 0) * prey + p.get('cH', 0) * H)
    FS = p['FmaxS'] * D / (D + p['DhS'])
    inc = dict(P=light, G=p['epsG'] * FG, H=kill * p['eK'], S=FS)

    def net(X, g):
        sur = inc[g] - p['u' + g]
        births = p['beta' + g] * room * sur / p['b' + g] if sur > 0 else 0.0
        starve = -sur / p['b' + g] if sur < 0 else 0.0
        return X * (births - starve - 1 / p['tau' + g])

    dP = net(P, 'P') - FG * G / p['eP']
    dG, dH, dS = net(G, 'G'), net(H, 'H'), net(S, 'S')
    kills = kill * H
    if prey > 0:
        dG -= kills * G / prey; dS -= kills * S / prey; dH -= kills * H / prey
    deaths = P / p['tauP'] + G / p['tauG'] + H / p['tauH'] + S / p['tauS']
    # dung: what grazers could not assimilate is dropped as husks (p['dung'] 1)
    dung = p.get('dung', 0) * (1 - p['epsG']) * FG * G / p['body']
    dD = deaths + dung - FS * S / p['body'] - p['husk'] * D
    return np.array([dP, dG, dH, dS, dD])


def x0():
    m = MEAS
    return np.array([m['P'], m['G'], m['H'], m['S'], m['D']])


def simulate(p, T=400):
    """Integrate from the measured state; the late mean and how far each guild swings (cycles)."""
    floor = 3e-5  # a cell or so always drifts in (abiogenesis, waking cysts)

    def f(t, x):
        d = rhs(t, x, p)
        d[:4] = np.where((x[:4] <= floor) & (d[:4] < 0), 0.0, d[:4])
        return d
    sol = solve_ivp(f, (0, T), x0(), method='LSODA', max_step=0.5, rtol=1e-6, atol=1e-9, dense_output=True)
    ts = np.linspace(T * 0.6, T, 400)
    xs = sol.sol(ts)
    mean = xs.mean(axis=1)
    swing = (xs.max(axis=1) - xs.min(axis=1)) / np.maximum(mean, 1e-9)
    return mean, swing


def steady(p, guess):
    """The exact steady state near guess, and the largest real part of the Jacobian's eigenvalues there."""
    x = fsolve(lambda x: rhs(0, x, p), guess, xtol=1e-12)
    J = np.zeros((5, 5))
    h = 1e-7
    for j in range(5):
        e = np.zeros(5); e[j] = h
        J[:, j] = (rhs(0, x + e, p) - rhs(0, x - e, p)) / (2 * h)
    return x, np.max(np.linalg.eigvals(J).real)


def line(name, p):
    mean, swing = simulate(p)
    P, G, H, S = mean[:4]
    L = P + G + H + S
    x, lam = steady(p, mean)
    stab = 'stable' if lam < 0 else 'cycles' if swing[1] > 0.05 else 'unstable'
    pc = lambda v: f'{100 * v / L:3.0f}%'
    return (f'{name:44s} living {100 * L:3.0f}%  P{pc(P)} G{pc(G)} H{pc(H)} S{pc(S)}  '
            f'animals/producers {(G + H + S) / P:4.2f}  swing G {swing[1]:4.2f}  {stab} (eig {lam:+.3f})')


if __name__ == '__main__':
    C = calibrate()
    m = MEAS
    L = m['P'] + m['G'] + m['H'] + m['S']
    print(f"{'measured default':44s} living {100 * L:3.0f}%  P{100 * m['P'] / L:3.0f}% G{100 * m['G'] / L:3.0f}% "
          f"H{100 * m['H'] / L:3.0f}% S{100 * m['S'] / L:3.0f}%  animals/producers {(m['G'] + m['H'] + m['S']) / m['P']:4.2f}")
    v = lambda **o: dict(C, **o)
    print('\nrule A: light per cell (as now)')
    print(line('model default', C))
    print(line('hunters catch 2x (lean predation)', v(aH=C['aH'] * 2)))
    print(line('grazer and scavenger young cheaper (provisionFlesh)', v(bG=C['bG'] * 0.6, bS=C['bS'] * 0.6)))
    print(line('scavengers find husks 2x (forage)', v(FmaxS=C['FmaxS'] * 2)))
    print(line('animal upkeep -30%', v(uG=C['uG'] * 0.7, uH=C['uH'] * 0.7, uS=C['uS'] * 0.7)))
    for k in (1.5, 2, 3):
        print(line(f'grazers bite {k}x', v(FmaxG=C['FmaxG'] * k)))
    print('\nrule B: light per area (only producers shade, strongly)')
    for sP in (5, 20, 60):
        B = rule_b(C, sP)
        print(line(f'rule B sP {sP}', B))
        for k in (1.5, 2, 3):
            print(line(f'rule B sP {sP}, grazers bite {k}x', dict(B, FmaxG=C['FmaxG'] * k)))
    B = rule_b(C, 20)
    print('\nrule B sP 20 with dung')
    for k in (1.5, 2):
        print(line(f'rule B sP 20, grazers bite {k}x, dung', dict(B, FmaxG=C['FmaxG'] * k, dung=1)))
