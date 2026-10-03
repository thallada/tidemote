"""Compare SC and JS renders segment by segment.
Deterministic mode: sample error relative to signal (dB), correlation, level difference."""
import json, sys, numpy as np, soundfile as sf
a, sr = sf.read(sys.argv[1]); b, _ = sf.read(sys.argv[2]); segs = json.load(open(sys.argv[3]))
n = min(len(a), len(b)); a, b = a[:n], b[:n]
worst = -999
print(f"{'segment':48s} {'err dB':>7s} {'corr':>8s} {'level Δ':>8s} {'peak SC':>8s}")
for s in segs:
    i0, i1 = int(s['t0'] * sr) - 64, int((s['t0'] + s['dur']) * sr)
    x, y = a[i0:i1].ravel(), b[i0:i1].ravel()
    p = np.sqrt((x ** 2).mean()) + 1e-20
    err = 20 * np.log10(np.sqrt(((x - y) ** 2).mean()) / p + 1e-20)
    corr = np.corrcoef(x, y)[0, 1] if p > 1e-12 else 1
    lv = 20 * np.log10((np.sqrt((y ** 2).mean()) + 1e-20) / p)
    worst = max(worst, err)
    print(f"{s['name'][:48]:48s} {err:7.1f} {corr:8.5f} {lv:+8.2f} {20*np.log10(np.abs(x).max()+1e-12):8.1f}")
print('WORST error vs signal:', round(worst, 1), 'dB')
