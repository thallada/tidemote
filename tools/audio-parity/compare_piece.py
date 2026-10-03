import sys, subprocess, re, numpy as np, soundfile as sf
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
a, sr = sf.read(sys.argv[1]); b, _ = sf.read(sys.argv[2]); n = min(len(a), len(b)); a, b = a[:n], b[:n]
def ebu(x):
    sf.write('/tmp/_p.wav', x, sr, subtype='FLOAT')
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', '/tmp/_p.wav', '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    s = r[r.rfind('Summary'):]
    return [float(re.search(p, s).group(1)) for p in [r'I:\s+(-?[\d.]+)', r'LRA:\s+(-?[\d.]+)', r'Peak:\s+(-?[\d.]+)']]
A, B = ebu(a), ebu(b)
print(f"whole piece   SC: {A[0]} LUFS, LRA {A[1]}, true peak {A[2]}   JS: {B[0]} LUFS, LRA {B[1]}, true peak {B[2]}")
cent = 1000 * 2 ** (np.arange(-15, 13, 3) / 3)
def bands(x):
    m = x.mean(1); S = np.abs(np.fft.rfft(m * np.hanning(len(m)))) ** 2; f = np.fft.rfftfreq(len(m), 1 / sr)
    return np.array([S[(f >= c / 2 ** 0.5) & (f < c * 2 ** 0.5)].sum() for c in cent])
print('minute  LUFS SC  LUFS JS   Δ    octave-band Δ dB (63 Hz .. 16 kHz)')
for m0 in range(0, n // sr // 60):
    x, y = a[m0 * 60 * sr:(m0 + 1) * 60 * sr], b[m0 * 60 * sr:(m0 + 1) * 60 * sr]
    la, lb = ebu(x)[0], ebu(y)[0]; Ba, Bb = bands(x), bands(y)
    d = 10 * np.log10((Bb + 1e-30) / (Ba + 1e-30))
    print(f"{m0:5d}  {la:7.1f}  {lb:7.1f}  {lb-la:+5.1f}   " + ' '.join(f'{v:+5.1f}' for v in d))
import librosa, librosa.display
fig, ax = plt.subplots(2, 1, figsize=(18, 8), sharex=True)
for i, (x, t) in enumerate([(a, 'SuperCollider 3.13'), (b, 'JS engine (Web Audio port)')]):
    yd = librosa.resample(x.mean(1)[:sr * 1200], orig_sr=sr, target_sr=22050)
    S = librosa.amplitude_to_db(np.abs(librosa.stft(yd, n_fft=4096, hop_length=2048)), ref=1.0)
    librosa.display.specshow(S, sr=22050, hop_length=2048, x_axis='time', y_axis='log', ax=ax[i], vmin=-90, vmax=-10, cmap='magma'); ax[i].set_ylim(40, 11000); ax[i].set_title(t)
plt.tight_layout(); plt.savefig('/home/claude/parity_piece.png', dpi=55)
