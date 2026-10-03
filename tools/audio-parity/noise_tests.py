import json
bd = 64 / 48000
def T(sec): return (round(sec / bd) + 0.5) * bd
ev, segs, t = [], [], 0.5
def group(name, defn, n, dur, gap, **p):
    global t
    t0 = t
    for k in range(n):
        q = dict(p); q.update({kk: v[k % len(v)] for kk, v in p.items() if isinstance(v, list)})
        ev.append({'t': T(t), 'def': defn, 'params': q}); t += gap
    segs.append({'name': name, 't0': T(t0), 'dur': t - t0 + dur}); t += dur + 0.5
group('glass x6', 'glass', 6, 6.0, 1.5, freq=[294, 440, 587], amp=0.5, bright=[0.4, 0.9], atk=1.2, sus=1.5, rel=3)
group('breath x6', 'breath', 6, 4.0, 1.2, freq=[220, 330, 294], amp=0.5, bright=[0.3, 0.8], atk=0.8, sus=0.8, rel=1.6, glide=[0.03, -0.03])
group('tick x40', 'tick', 40, 0.3, 0.12, freq=[2400, 3600, 5200], amp=0.6, dec=[0.02, 0.05])
group('wood+click x12', 'wood', 12, 0.8, 0.3, freq=[147, 220], amp=0.5, bright=0.9, dec=0.5)
group('bite+click x12', 'bite', 12, 0.6, 0.3, freq=[110, 147], amp=0.5, bright=0.9, dec=0.35)
group('cplx noise x24', 'cplx', 24, 0.6, 0.18, freq=[294, 440, 587, 880], amp=0.5, bright=0.7, fold=2.0, index=1.5, ratio=2, dec=0.3)
# persistent sea and drone, with parameter changes
ev.append({'t': T(t), 'def': 'sea', 'id': 'sea', 'params': {'amp': 0.3, 'tide': 0.4, 'light': 0.5, 'f1': 38, 'f2': 50, 'f3': 57, 'f4': 64, 'f5': 69}})
ev.append({'t': T(t + 6), 'set': 'sea', 'params': {'tide': 0.9, 'light': 0.9}})
segs.append({'name': 'sea 12s', 't0': T(t), 'dur': 12.0}); t += 12.5
ev.append({'t': T(t), 'def': 'drone', 'id': 'drone', 'params': {'amp': 0.3, 'note': 38, 'light': 0.6}})
ev.append({'t': T(t + 5), 'set': 'drone', 'params': {'note': 45}})
segs.append({'name': 'drone 12s (glide)', 't0': T(t), 'dur': 12.0}); t += 12.5
json.dump(ev, open('noise.json', 'w')); json.dump({'tail': 1.0}, open('noise.meta.json', 'w')); json.dump(segs, open('noise.segs.json', 'w'))
print(len(ev), 'events, ends', round(t, 1))
