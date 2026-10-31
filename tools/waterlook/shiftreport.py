# Measure where the scene moved between tools/waterlook/shiftcheck.mjs's two shots (water off, on) around each point,
# against Engine.seaShift's prediction there: python3 tools/waterlook/shiftreport.py runs/look/shift
import json, sys
import numpy as np
from PIL import Image
d = sys.argv[1]
off = np.asarray(Image.open(f'{d}/off.png').convert('L'), float)
on = np.asarray(Image.open(f'{d}/on.png').convert('L'), float)
P = json.load(open(f'{d}/pred.json'))['out']
def local(cx, cy, r=64):
    a = off[cy - r:cy + r, cx - r:cx + r]; b = on[cy - r:cy + r, cx - r:cx + r]
    win = np.hanning(2 * r)[:, None] * np.hanning(2 * r)[None, :]
    A = np.fft.fft2((a - a.mean()) * win); B = np.fft.fft2((b - b.mean()) * win)
    R = B * np.conj(A); R /= np.abs(R) + 1e-9
    c = np.real(np.fft.ifft2(R)); y, x = np.unravel_index(np.argmax(c), c.shape)
    n = 2 * r
    return (x - n if x > r else x), (y - n if y > r else y), c.max()
QMIN = float(sys.argv[2]) if len(sys.argv) > 2 else 0.05
errs, raw = [], []
for p in P:
    cx, cy = int(round(p['sx'])), int(round(p['sy']))
    if cy + 64 > off.shape[0] - 90 or cy < 64 or cx < 64 or cx + 64 > off.shape[1]: continue
    mx, my, q = local(cx, cy)
    if q < QMIN: continue  # too little in the patch to match
    errs.append(np.hypot(mx - p['dx'], my - p['dy'])); raw.append(np.hypot(mx, my))
    print(f"  q {q:.2f} ({cx:4d},{cy:4d}) moved ({mx:+3d},{my:+3d}) predicted ({p['dx']:+6.1f},{p['dy']:+6.1f})")
print(f'points {len(errs)}: the water moved them {np.median(raw):.1f} px (median), the prediction is off by {np.median(errs):.1f} px (median), {np.max(errs):.1f} at most')
