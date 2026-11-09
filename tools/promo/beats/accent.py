# How hard the song hits at each 16th step of its grid, from the audio itself (beats/onsets.py's attacks: the low end's,
# or the mids' at 0.7 for stabs and chords), taken from a frame before the step to 50 ms after (the track sounds 21 ms
# late on its grid: one 1024-sample block). Writes accent.json {steps} beside the track: what the editor's hit ticks,
# its "strong hits" snap and beats/retime.mjs go by (edlcore hitMap), on the scale beats/check.mjs judges with.
import json, sys, subprocess, numpy as np, os
D = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get('PROMO_ROOT', '/mnt/d/tidemote-promo'), 'track')
L = json.loads(subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), 'onsets.py'), f'{D}/track.wav'], capture_output=True, text=True, check=True).stdout)
A = np.maximum(np.array(L['low']), 0.7 * np.array(L['mid'])); hop = L['hop']
times = json.load(open(f'{D}/times.json'))
acc = [float(A[max(0, int((t - 0.017) / hop)):int((t + 0.05) / hop) + 1].max()) for t in times['steps']]
json.dump({'steps': [round(v, 3) for v in acc]}, open(f'{D}/accent.json', 'w'))
acc = np.array(acc)
print('percentiles 50/75/90/95:', np.round(np.percentile(acc, [50, 75, 90, 95]), 2))
for s in times['sections']:
    b0, nb = s['bar'], s['bars']; M = acc[b0 * 16:(b0 + nb) * 16].reshape(nb, 16)
    print(f"{s['name']:6}", ' '.join(f'{v:4.2f}' for v in M.mean(0)))
