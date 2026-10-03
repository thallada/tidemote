"""Statistical comparison for noise-driven material: loudness (LUFS) and 1/3-octave band levels."""
import json, sys, subprocess, re, numpy as np, soundfile as sf
a, sr = sf.read(sys.argv[1]); b, _ = sf.read(sys.argv[2]); segs = json.load(open(sys.argv[3]))
def lufs(x):
    sf.write('/tmp/_s.wav', x, sr, subtype='FLOAT')
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', '/tmp/_s.wav', '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', r)[-1])
cent = 1000 * 2 ** (np.arange(-17, 14) / 3)  # 20 Hz .. 20 kHz
def bands(x):
    m = x.mean(1); S = np.abs(np.fft.rfft(m * np.hanning(len(m)))) ** 2; f = np.fft.rfftfreq(len(m), 1 / sr)
    return np.array([S[(f >= c / 2 ** (1 / 6)) & (f < c * 2 ** (1 / 6))].sum() for c in cent])
worst_l, worst_b = 0, 0
print(f"{'segment':22s} {'LUFS SC':>8s} {'LUFS JS':>8s} {'Δ':>6s}  {'band Δ (energy-weighted, dB)':>28s} {'max band Δ':>10s}")
for s in segs:
    i0, i1 = int(s['t0'] * sr), int((s['t0'] + s['dur']) * sr)
    x, y = a[i0:i1], b[i0:i1]
    la, lb = lufs(x), lufs(y)
    A, B = bands(x), bands(y)
    sig = A > A.max() * 1e-4  # bands within 40 dB of the strongest
    d = 10 * np.log10((B[sig] + 1e-30) / (A[sig] + 1e-30))
    w = A[sig] / A[sig].sum()
    print(f"{s['name'][:22]:22s} {la:8.2f} {lb:8.2f} {lb-la:+6.2f}  {np.sqrt((w*d*d).sum()):28.2f} {np.abs(d).max():10.2f}")
    worst_l = max(worst_l, abs(lb - la)); worst_b = max(worst_b, np.sqrt((w * d * d).sum()))
print('WORST loudness Δ', round(worst_l, 2), 'LU;  worst weighted band Δ', round(worst_b, 2), 'dB')
