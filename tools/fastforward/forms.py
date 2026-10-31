#!/usr/bin/env python3
"""Matched forks by body form: whether a step length (or tunable) favors one form of body over another.
Run the forks with K.diag 2, so the per-guild ledgers count producers by form (guild slots: producer =
packed producers, grazer = tree producers, predator = lone producers, scavenger = every animal):

  tools/gpu-node.sh tools/fork.mjs --warm 600 --horizon 60 --reps 4 --seed 1 --k '{"diag":2}' \\
    --variants '[{"name":"m1","step":1},{"name":"m6","step":6}]' --out runs/ff/w1.json

Per form, each variant against the first, paired by rep and pooled over files (mean of the paired
differences, its 95% interval, * where it excludes 0): growth over the fork (%/min, from the census),
births and deaths by cause per capita (%/min), energy by channel per capita, K.diag's samples (packing,
light, overlaps), torn bonds per cell-second and displacement over the first second (disp1s.*). A form
that grows faster at one step length than at 1/60 s is selected by the step itself: the body mix of long
runs follows it (docs/fast-forward.md).

  python3 tools/fastforward/forms.py runs/ff/w*.json [--keys=grow,P.tree.births,torn]
"""
import json, sys, math
from collections import defaultdict

files = [a for a in sys.argv[1:] if a.endswith('.json')]
want = next((a[7:].split(',') for a in sys.argv if a.startswith('--keys=')), None)
# the per-guild ledgers' slots under K.diag 2
LG = {'producer': 'P.packed', 'grazer': 'P.tree', 'predator': 'P.lone', 'scavenger': 'animal'}
SAMPLED = ('crowd', 'silt', 'pack', 'kin', 'speed', 'photo', 'light', 'energy', 'overlap', 'force', 'foodInReach', 'hungry', 'deepOther')

def classes(forms):
    """The census forms (diet.body) as the ledgers' classes: producers by body, animals all and by body."""
    o = defaultdict(float)
    for k, n in forms.items():
        diet, body = k.split('.')
        if diet == 'producer':
            o['P.' + ('packed' if body in ('packed', 'tailed') else body)] += n
            if body == 'tailed': o['P.tailedOnly'] += n
        else:
            o['animal'] += n
            o['A.' + body] += n
    return o

def stats(f):
    c0, c1 = classes(f['forms0']), classes(f['forms1'])
    T = f['span'] / 60
    o = {}
    for c in set(c0) | set(c1):
        if c0.get(c, 0) >= 30: o[f'grow%/min.{c}'] = 100 * math.log(max(c1.get(c, 0), 1) / c0[c]) / T
    for g, name in LG.items():
        pop = 0.5 * (c0.get(name, 0) + c1.get(name, 0))
        if pop < 30: continue
        for k in ('births', 'starved', 'oldAge', 'eaten'):
            o[f'{name}.{k}/cap'] = 100 * f['rates'].get(f'{g}.{k}', 0) / pop
        for k, x in f['rates'].items():
            if k.startswith(g + '.E.'): o[f'{name}.E.{k.split(".E.")[1]}/cap'] = x / pop
        for k, x in ((f.get('diag') or {}).get(g) or {}).items():
            if k == 'torn': o[f'{name}.torn/cap.s'] = x / pop / f['span']
            elif k in SAMPLED: o[f'{name}.{k}'] = x
    for k, x in (f.get('disp') or {}).items():
        if x['n'] >= 30: o[f'disp1s.{k}'] = x['d'] / x['n']
    return o

acc = defaultdict(lambda: defaultdict(list))  # variant -> stat -> [(paired difference, base)]
variants = None
for fn in files:
    r = json.load(open(fn))
    names = [v['name'] for v in r['config']['variants']]
    variants = variants or names
    for rep in sorted(set(f['rep'] for f in r['forks'])):
        F = {f['variant']: f for f in r['forks'] if f['rep'] == rep}
        if names[0] not in F: continue
        sb = stats(F[names[0]])
        for v in names[1:]:
            if v not in F: continue
            sv = stats(F[v])
            for k in sb:
                if k in sv: acc[v][k].append((sv[k] - sb[k], sb[k]))

for v in (variants or [])[1:]:
    print(f'\n{v} vs {variants[0]} ({len(files)} worlds)')
    print(f"{'stat':34}{'n':>4}{'base':>10}{'diff':>10}{'±95':>8}{'rel%':>8}")
    for k in sorted(acc[v]):
        if want and not any(w in k for w in want): continue
        xs = acc[v][k]; n = len(xs)
        d = [x for x, _ in xs]; bm = sum(b for _, b in xs) / n; mu = sum(d) / n
        sd = math.sqrt(sum((x - mu) ** 2 for x in d) / max(1, n - 1))
        h = 2.0 * sd / math.sqrt(n) if n > 1 else float('nan')
        rel = 100 * mu / bm if abs(bm) > 1e-12 else float('nan')
        print(f'{k:34}{n:>4}{bm:>10.4g}{mu:>+10.3g}{h:>8.2g}{rel:>+8.1f}' + ('*' if n > 1 and abs(mu) > h else ' '))
