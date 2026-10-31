#!/usr/bin/env python3
"""A body's stiff link (a bond, or a tree's bend) in a coarse step: a chain of N cells, each linked to its
neighbors with stiffness K (per s^2) under drag (half-life 0.2 s), linear. Each scheme's map over 0.1 s (6 ticks
of 1/60 s, or one 6-tick step) as a matrix; its spectral radius over the non-rigid modes (below 1: the
body settles; above: it rings and tears). docs/fast-forward.md, Bodies.

  hold    the link's pull at the step's start, held for its ticks
  sub     reckoned afresh each tick toward partners carried on their start velocities (bonds before 2026-10-31)
  mirror  as sub, the partners moving back as far as this cell strays (two-body)
  imp     as mirror, each tick implicit in this cell's own stiffness
  corr    held, with the stiffness correction (two-body backward Euler, cellWGSL): the scheme kept

  python3 tools/fastforward/chain.py
"""
import numpy as np

h = 1 / 60

def step(x, v, m, K, drag, scheme):
    N = len(x); fr0 = 0.5 ** (h / drag); T = m * h
    nx, nv = x.copy(), v.copy()
    for i in range(N):
        nb = [j for j in (i - 1, i + 1) if 0 <= j < N]
        a0 = sum(x[j] - x[i] for j in nb) * K
        stiff = 0.0
        if scheme == 'corr' and m > 1:
            D = K * len(nb); vNear = np.mean([v[j] for j in nb]); Mn = len(nb)
            frT = 0.5 ** (T / drag); G = (1 - frT) * drag / np.log(2); kk = D * (1 + 1 / Mn)
            vr = ((v[i] - vNear) * frT + a0 * G * (1 + 1 / Mn)) / (1 + G * T * kk)
            vEnd = (v[i] + vNear * Mn) / (1 + Mn) * frT + vr * Mn / (1 + Mn)
            stiff = (vEnd - v[i] * frT) / G - a0
        pos, vel = x[i], v[i]
        for k in range(m):
            t = k * h
            if scheme in ('hold', 'corr') or m == 1: F = a0 + stiff
            else:
                w = 1.0 if scheme in ('mirror', 'imp') else 0.0
                dev = pos - (x[i] + v[i] * t)
                F = sum((x[j] + v[j] * t - w * dev) - pos for j in nb) * K
            if scheme == 'imp' and m > 1: vel = (vel * fr0 + F * h) / (1 + 2 * K * len(nb) * h * h)
            else: vel = vel * fr0 + F * h
            pos += vel * h
        nx[i], nv[i] = pos, vel
    return nx, nv

def radius(m, K, scheme, drag=0.2, N=10):
    M = np.zeros((2 * N, 2 * N))
    for c in range(2 * N):
        s = np.zeros(2 * N); s[c] = 1; x, v = s[:N].copy(), s[N:].copy()
        for _ in range(6 // m): x, v = step(x, v, m, K, drag, scheme)
        M[:, c] = np.concatenate([x, v])
    return np.sort(np.abs(np.linalg.eigvals(M)))[::-1][1]  # [0]: the chain drifting as one

if __name__ == '__main__':
    print('K/s^2   1/60 s ' + ''.join(f'{s + str(m):>9}' for m in (3, 6) for s in ('hold', 'sub', 'mirror', 'imp', 'corr')))
    for K in (60, 120, 200, 400, 800, 1600):
        print(f'{K:5}  {radius(1, K, "sub"):7.3f} ' + ''.join(f'{radius(m, K, s):9.3f}' for m in (3, 6) for s in ('hold', 'sub', 'mirror', 'imp', 'corr')))
