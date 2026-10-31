# Read tools/waterlook/windcheck.mjs's output: the direction the sea's light drifts against the tide's wind, and the
# wind's turn across a change of era.   python3 tools/waterlook/windreport.py runs/look/wind
import json, sys, base64, io, math
import numpy as np
from PIL import Image
d = sys.argv[1]
img = lambda b: np.asarray(Image.open(io.BytesIO(base64.b64decode(b))).convert('L'), float)
def shift(a, b):
    """how far b is moved from a (pixels, x right and y down), by phase correlation"""
    # (windowed: an image's edges otherwise put strong horizontal and vertical lines in its spectrum, which pull the
    # peak onto the axes whatever way the light runs)
    h, w = a.shape
    win = np.hanning(h)[:, None] * np.hanning(w)[None, :]
    A = np.fft.fft2((a - a.mean()) * win); B = np.fft.fft2((b - b.mean()) * win)
    R = B * np.conj(A); R /= np.abs(R) + 1e-9
    r = np.real(np.fft.ifft2(R))
    y, x = np.unravel_index(np.argmax(r), r.shape)
    h, w = r.shape
    return (x - w if x > w // 2 else x), (y - h if y > h // 2 else y)
def travel(a, b):
    """which way the waves in a run between frames a and b (degrees): for each wavevector k, how its phase moved
    (a wave running along +k advances it by -w dt), each as its velocity -dphase k/|k|^2, weighted by its power"""
    h, w = a.shape
    win = np.hanning(h)[:, None] * np.hanning(w)[None, :]
    A = np.fft.fft2((a - a.mean()) * win); B = np.fft.fft2((b - b.mean()) * win)
    ky = np.fft.fftfreq(h)[:, None]; kx = np.fft.fftfreq(w)[None, :]
    k2 = kx * kx + ky * ky
    dph = np.angle(B * np.conj(A))
    p = np.abs(A) * np.abs(B)
    m = (k2 > 0) & (k2 < 0.02 ** 2)  # wavelengths over 50 pixels: the sea's (or the tide's), not the specks'
    vx = (p * -dph * kx / np.where(k2 > 0, k2, 1))[m].sum(); vy = (p * -dph * ky / np.where(k2 > 0, k2, 1))[m].sum()
    return math.degrees(math.atan2(vy, vx))
print('which way the waves run, spectrally (screen y is world y):')
for p in json.load(open(f'{d}/pairs.json')):
    run = travel(img(p['a']), img(p['b'])); sea = math.degrees(p['wind']['sea'])
    print(f'  toward {run:7.1f}°; the sea\'s wind {sea:7.1f}°: off by {(run - sea + 180) % 360 - 180:+.0f}°')
print('which way the waves run (screen y is world y):')
for p in json.load(open(f'{d}/pairs.json')):
    dx, dy = shift(img(p['a']), img(p['b']))
    run = math.degrees(math.atan2(dy, dx)); tide = math.degrees(p['wind']['tide']); sea = math.degrees(p['wind']['sea'])
    off = (run - sea + 180) % 360 - 180
    print(f'  moved ({dx:+d},{dy:+d}) px, toward {run:7.1f}°; the sea\'s wind {sea:7.1f}° (tide {tide:7.1f}°): off by {off:+.0f}°')
import os
if not os.path.exists(f'{d}/turn.json'): sys.exit(0)
turn = json.load(open(f'{d}/turn.json'))
frames = json.load(open(f'{d}/turnframes.json'))
print('across the change of era (every ~10 samples):')
steps = [np.abs(img(b) - img(a)).mean() for a, b in frames]
for i, w in enumerate(turn):
    if i % 10 == 0 or i == len(turn) - 1:
        print(f"  t+{w['t'] - turn[0]['t']:5.1f} s  tide {math.degrees(w['tide']) if w['tide'] is not None else float('nan'):7.1f}°  sea {math.degrees(w['sea']) % 360:7.1f}°  frame change {steps[i]:.2f}")
sea = np.unwrap([w['sea'] for w in turn])
rate = np.abs(np.diff(sea)) / np.maximum(np.diff([w['t'] for w in turn]), 1e-6)
print(f'  turned {math.degrees(sea[-1] - sea[0]):+.1f}° in all; fastest {math.degrees(rate.max()):.1f}°/s; frame change mean {np.mean(steps):.2f} max {np.max(steps):.2f}')
