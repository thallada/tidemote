#!/usr/bin/env python3
"""A sweep of the jelly tunables (docs/ecosystem.md, Jelly), one gate run directory each: for every directory, its K,
the gate's diversity and food web against a baseline report (tools/ensemble.mjs), and from its runs at --at minutes
the share of producers living in jelly and of grazers able to pierce it (median, 10-90%, and how many worlds it took
over: past --over), and the bond kinds bodies are drawn with (the effective number of kinds, exp of their entropy, and
jelly's share among them), where the runs record them.
  python3 tools/jellysweep.py runs/sweep/* [--baseline runs/sweep/main64/report.json] [--at 30] [--over 0.8]"""
import json, sys, glob, os, math, subprocess, statistics as st

args = [a for a in sys.argv[1:]]
opt = {'--baseline': 'runs/sweep/main64/report.json', '--at': '30', '--over': '0.8'}
dirs = []
i = 0
while i < len(args):
    if args[i] in opt: opt[args[i]] = args[i + 1]; i += 2
    else: dirs.append(args[i]); i += 1
at, over = float(opt['--at']) * 60, float(opt['--over'])
KINDS = ['tissue', 'bridge', 'cord', 'calcite', 'tree', 'swimmer', 'strand', 'jelly']

def q(xs, f):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(f * (len(xs) - 1) + 0.5))] if xs else float('nan')

def compare(d):
    """the gated diversity numbers and the food web against the baseline: {metric: (base, this, p)}"""
    out = {}
    try:
        txt = subprocess.run(['node', 'tools/ensemble.mjs', '--from', d, '--baseline', opt['--baseline']], capture_output=True, text=True, timeout=300).stdout
    except Exception:
        return out
    for line in txt.splitlines():
        parts = line.replace('*', ' ').split()
        if len(parts) >= 5 and parts[0] in ('foodWeb', 'lateGuilds', 'lateEffSpecies', 'lateHill2', 'outcomes', 'modalOutcome') and parts[2] == '→':
            p = next((x[2:] for x in parts if x.startswith('p=')), 'nan')
            out[parts[0]] = (parts[1], parts[3], p)
    return out

rows = []
for d in dirs:
    runs = []
    for f in sorted(glob.glob(os.path.join(d, 'seed*.json'))):
        try: runs.append(json.load(open(f)))
        except Exception: pass
    if not runs: continue
    k = runs[0].get('config', {}).get('k', {})
    jp, jg, eff, jb, bs = [], [], [], [], []
    for r in runs:
        s = min(r['samples'], key=lambda x: abs(x['t'] - at))
        j = s.get('jelly') or {}
        if 'producer' in j: jp.append(j['producer']['share'])
        if 'grazer' in j: jg.append(j['grazer']['share'])
        b = s.get('bonds')
        if b and sum(b) > 0:
            eff.append(math.exp(-sum(x * math.log(x) for x in b if x > 0)))
            jb.append(b[7]); bs.append(b)
    c = compare(d)
    rows.append((d, k, len(runs), jp, jg, eff, jb, c))

print(f'at {at / 60:.0f} min; took over: share past {over}; diversity against {opt["--baseline"]}')
for d, k, n, jp, jg, eff, jb, c in rows:
    kk = {x: v for x, v in k.items() if x not in ('lowEras', 'eventPlan')}
    print(f'\n{os.path.basename(d.rstrip("/"))}  {json.dumps(kk)}  ({n} runs)')
    if jp: print(f'  producers in jelly   {st.median(jp):.2f} [{q(jp, .1):.2f}-{q(jp, .9):.2f}]  took over {sum(x > over for x in jp)}/{len(jp)}')
    if jg: print(f'  grazers piercing     {st.median(jg):.2f} [{q(jg, .1):.2f}-{q(jg, .9):.2f}]  took over {sum(x > over for x in jg)}/{len(jg)}')
    if eff:
        print(f'  bond kinds           {st.median(eff):.2f} effective [{q(eff, .1):.2f}-{q(eff, .9):.2f}], jelly {st.median(jb):.2f} of bonded'
              f' (mean {st.mean(jb):.2f}; present past 0.05 in {sum(x > 0.05 for x in jb)}/{len(jb)}, past 0.5 in {sum(x > 0.5 for x in jb)})')
        print('  mean mix             ' + '  '.join(f'{KINDS[i]} {st.mean(b[i] for b in bs):.2f}' for i in range(8)))
    for m, (a, b, p) in c.items(): print(f'  {m:14} {a:>7} -> {b:<7} p={p}')
