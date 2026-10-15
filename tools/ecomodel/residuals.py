"""Net growth per cell at the measured states, model against measured, per set and guild: births and
each death (old age, eaten, starved). A guild the model drives extinct shows up as a negative bias here."""
import json, sys
import numpy as np
sys.path.insert(0, 'tools/ecomodel')
from fit import rules
from web import params, rates
pts = [{k: (np.nan if v is None else v) for k, v in p.items()} for p in json.load(open('tools/ecomodel/meas/points.json')) if p['t'] >= 7]
sets = sorted(set(p['set'] for p in pts))
print(f"{'set':8s} guild  births m/mod     eaten m/mod     old m/mod    starved m/mod |  net m / mod")
for s in sets:
    sp = [p for p in pts if p['set'] == s]
    pr = params(**rules(s))
    for g in 'GHS':
        rows = []
        for q in sp:
            if not np.isfinite(q.get('birth' + g, np.nan)):
                continue
            x = [q[k] for k in 'PGHSD']
            inc, kills, _, _, silt = rates(x, pr)
            beta, ks = pr['birth' + g]
            sur = (inc[g] - pr['u' + g]) / pr['b' + g]
            b = beta * max(sur, 0) * silt / (silt + ks)
            prey = q['G'] + q['S'] + q['H']
            hr = kills * q['H'] / prey if prey > 0 else 0
            al, be, ga = pr['eaten' + g]
            e = al * hr + be * prey + ga
            rows.append([q['birth' + g], b, q['eaten' + g], e, q['old' + g], pr['old' + g], q['starved' + g], max(-sur, 0)])
        if not rows:
            continue
        r = np.nanmedian(np.array(rows), axis=0)
        net_m = r[0] - r[2] - r[4] - r[6]; net_mod = r[1] - r[3] - r[5] - r[7]
        print(f"{s:8s} {g}    {r[0]:5.2f}/{r[1]:5.2f}     {r[2]:5.2f}/{r[3]:5.2f}     {r[4]:5.2f}/{r[5]:5.2f}    {r[6]:5.2f}/{r[7]:5.2f}   | {net_m:+5.2f} / {net_mod:+5.2f}")
