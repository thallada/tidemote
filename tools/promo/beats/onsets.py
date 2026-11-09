# The track's attacks, from the audio alone: for the low end (30-400 Hz: kicks, booms, the bass's notes) and the mids
# (400-4000 Hz: stabs, piano), how sharply each band rises at every 2.5 ms (its loudness over the next 25 ms against the
# 40 ms before; the 25 ms window rides over the sub's wobble). JSON {hop, low, mid} for beats/check.mjs.
import json, sys, wave, numpy as np
w = wave.open(sys.argv[1]); sr = w.getframerate()
x = np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, w.getnchannels()).mean(1) / 32768
X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / sr)
hop = int(sr * 0.0025)
def attack(lo, hi):
    Y = X.copy(); Y[(f < lo) | (f >= hi)] = 0; e = np.abs(np.fft.irfft(Y, len(x)))
    e = e[:len(e) // hop * hop].reshape(-1, hop).max(1)
    n = len(e); after = np.array([e[i:i + 10].max() for i in range(n)]); before = np.array([e[max(0, i - 16):max(1, i - 2)].mean() for i in range(n)])
    a = np.maximum(0, after - before); return a / np.percentile(a, 99.5)
print(json.dumps({'hop': hop / sr, 'low': [round(float(v), 3) for v in attack(30, 400)], 'mid': [round(float(v), 3) for v in attack(400, 4000)]}))
