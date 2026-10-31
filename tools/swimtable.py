# Read tools/swimtable.sh's logs: per label and body, each step's speed and bend as shares of the same genotype's
# 1-tick run (medians over the genotypes, and the worst), with the share of samples past bond breaking.
#   python3 tools/swimtable.py OUTDIR
import glob, json, os, re, sys, statistics as st
out = sys.argv[1]
runs = {}
for f in glob.glob(os.path.join(out, '*.log')):
    m = re.match(r'(.+)-(.+)-s(\d+)\.log$', os.path.basename(f))
    if not m: continue
    label, body, step = m.group(1), m.group(2), int(m.group(3))
    for line in open(f):
        if line.startswith('{"beat"'):
            g, r = line.split(' ', 1)
            runs.setdefault((label, body), {}).setdefault(step, {})[g] = json.loads(r)
for (label, body), steps in sorted(runs.items()):
    base = steps.get(1) or runs.get(('base', body), {}).get(1)
    if not base: continue
    print(f'{label} {body}')
    print('  ticks  speed med  worst   bend med  worst  broken')
    for s in sorted(steps):
        sp, bd, br = [], [], []
        for g, r in steps[s].items():
            b = base.get(g)
            if not b or b['speed'] < 0.01: continue
            sp.append(r['speed'] / b['speed'])
            mb = st.mean(b['bendAmp']) or 1e-9
            bd.append(st.mean(r['bendAmp']) / mb)
            br.append(r['brokenShare'])
        if sp:
            print(f'  {s:5d}  {st.median(sp):9.2f}  {min(sp):5.2f}   {st.median(bd):8.2f}  {max(bd):5.2f}  {max(br):6.2f}')
