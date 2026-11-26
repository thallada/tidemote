#!/usr/bin/env python3
"""The jelly gene's share by guild over an ensemble's runs (docs/ecosystem.md, Jelly): for each run directory, the
median and 10-90% across seeds of the share of producers living in jelly and of each eating guild able to pierce it,
at a few times, and the guilds' shares of the living beside them.
  python3 tools/jellyshare.py runs/A runs/B [--at 5,10,20,30]"""
import json, sys, glob, os, statistics as st

args = [a for a in sys.argv[1:] if not a.startswith('--')]
at = [5, 10, 20, 30]
for i, a in enumerate(sys.argv):
    if a == '--at': at = [float(x) for x in sys.argv[i + 1].split(',')]
args = [a for a in args if not all(c in '0123456789.,' for c in a)]

def q(xs):
    xs = sorted(xs)
    if not xs: return '   -   '
    p = lambda f: xs[min(len(xs) - 1, int(f * (len(xs) - 1) + 0.5))]
    return f'{st.median(xs):.2f} [{p(0.1):.2f}-{p(0.9):.2f}]'

for d in args:
    runs = []
    for f in sorted(glob.glob(os.path.join(d, 'seed*.json'))):
        try: runs.append(json.load(open(f)))
        except Exception: pass
    print(f'{d}: {len(runs)} runs')
    for m in at:
        row = {}
        for r in runs:
            s = min(r['samples'], key=lambda x: abs(x['t'] - m * 60))
            j = s.get('jelly') or {}
            for g in ('producer', 'grazer', 'predator', 'scavenger'):
                if g in j: row.setdefault(g, []).append(j[g]['share'])
                row.setdefault('n_' + g, []).append((s.get('diet') or {}).get(g, 0))
        print(f'  {m:>4.0f} min  ' + '  '.join(f"{g[:5]} {q(row.get(g, []))} (of living {q(row.get('n_' + g, []))})" for g in ('producer', 'grazer', 'predator', 'scavenger')))
