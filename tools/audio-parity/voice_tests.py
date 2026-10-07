import json
bd = 64 / 48000
def T(sec): return (round(sec / bd) + 0.5) * bd   # mid-block, unambiguous start block
ev, segs, t = [], [], 0.5
def note(defn, dur, **p):
    global t
    ev.append({'t': T(t), 'def': defn, 'params': p}); segs.append({'name': defn + ' ' + ','.join(f'{k}={v}' for k, v in p.items() if k in ('freq','bright','fold','index','ratio','dec','rise','atk')), 't0': T(t), 'dur': dur}); t += dur + 0.4
for f, br, fo, ix, ra in [(294, 0.5, 1.2, 1.0, 2), (587, 0.9, 2.6, 2.0, 3), (147, 0.2, 3.5, 0.5, 1.5), (1175, 1.0, 2.0, 1.5, 2)]:
    note('cplx', 1.0, freq=f, amp=0.5, bright=br, fold=fo, index=ix, ratio=ra, dec=0.35, pan=-0.3)
for f, br in [(294, 0.5), (880, 0.9), (196, 0.3)]:
    note('swell', 2.6, freq=f, amp=0.5, bright=br, fold=1.8, index=1.2, ratio=2, atk=0.4, hold=0.4, rel=1.6, pan=0.2)
for f, br in [(587, 0.6), (1175, 1.0)]:
    note('tine', 2.0, freq=f, amp=0.5, bright=br, dec=1.3, pan=0.4)
for f in [147, 98]:
    note('wood', 1.0, freq=f, amp=0.5, bright=0.7, dec=0.6)
for f, br, co in [(220, 0.5, 0.35), (587, 0.9, 0.15), (110, 0.2, 0.6), (73.4, 0.4, -0.2)]:
    note('pluck', 1.6, freq=f, amp=0.5, bright=br, dec=1.2, coef=co, pan=0.2)
for f in [147, 73]:
    note('bite', 0.8, freq=f, amp=0.5, bright=0.6, dec=0.4)
for f, r in [(900, 1.7), (1400, 2.2)]:
    note('drop', 0.3, freq=f, amp=0.5, dec=0.07, rise=r)
for f in [2349, 4699]:
    note('glint', 0.4, freq=f, amp=0.5, dec=0.2)
for f, fe in [(110, 0.8), (220, 0.6), (440, 0.4), (880, 0.2)]:
    note('piano', 3.0, freq=f, amp=0.5, dec=3.0, felt=fe, pan=-0.2)
for f, br in [(147, 0.4), (440, 0.8)]:
    note('strings', 4.0, freq=f, amp=0.5, bright=br, atk=1.0, sus=0.8, rel=1.5, pan=0.3)
for f, br in [(587, 0.5), (1175, 0.9)]:
    note('vibe', 2.0, freq=f, amp=0.5, bright=br, dec=1.6, trem=5.0, depth=0.35, pan=-0.4)
json.dump(ev, open('voices.json', 'w')); json.dump({'tail': 2.0}, open('voices.meta.json', 'w'))
json.dump(segs, open('voices.segs.json', 'w'))
print(len(ev), 'notes, ends at', round(t, 1), 's')
