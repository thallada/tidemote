"""Checks each process of web.py at the measured states: model rate against measured rate, per set (medians)."""
import json, sys
import numpy as np
sys.path.insert(0, 'tools/ecomodel')
from fit import rules
from web import params, rates, F
pts = [{k: (np.nan if v is None else v) for k, v in p.items()} for p in json.load(open('tools/ecomodel/meas/points.json'))]
sets = sorted(set(p['set'] for p in pts))
rows = []
print(f"{'set':8s} {'incP m/model':>13s} {'incG':>12s} {'killsH':>12s} {'incS':>12s} | {'birthG':>12s} {'eatenG':>12s} {'eatenS':>12s} {'eatenH':>12s}")
for s in sets:
    sp = [p for p in pts if p['set'] == s and p['t'] >= 7]
    pr = params(**rules(s))
    def col(meas_key, model_fn):
        m = np.nanmedian([q.get(meas_key, np.nan) for q in sp])
        mod = np.nanmedian([model_fn(q) for q in sp])
        return f'{m:5.2f}/{mod:5.2f}'
    def inc(q, g):
        x = [q[k] for k in 'PGHSD']
        return rates(x, pr)[0][g]
    def kills(q):
        return rates([q[k] for k in 'PGHSD'], pr)[1]
    def birth(q, g):
        x = [q[k] for k in 'PGHSD']
        inc_, _, _, _, silt = rates(x, pr)
        beta, ks = pr['birth' + g]
        sur = (inc_[g] - pr['u' + g]) / pr['b' + g]
        return beta * max(sur, 0) * silt / (silt + ks)
    def eaten(q, g):
        prey = q['G'] + q['S'] + q['H']
        return kills(q) * q['H'] / prey if prey > 0 else np.nan
    print(f"{s:8s} {col('incP', lambda q: inc(q, 'P')):>13s} {col('incG', lambda q: inc(q, 'G')):>12s} {col('killsH', kills):>12s} {col('incS', lambda q: inc(q, 'S')):>12s} | "
          f"{col('birthG', lambda q: birth(q, 'G')):>12s} {col('eatenG', lambda q: eaten(q, 'G')):>12s} {col('eatenS', lambda q: eaten(q, 'S')):>12s} {col('eatenH', lambda q: eaten(q, 'H')):>12s}")
