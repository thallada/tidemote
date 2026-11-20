#!/usr/bin/env python3
"""Measure what tools/heatlook.mjs recorded (docs/look.md, Heat haze).
Pairs: for each NAME-on.png, its mean absolute difference (0-255) from NAME-off.png, and the control's (NAME-off2.png:
the haze off twice, what changes without it). Clips: how far textured 16 px blocks move from the clip's mean frame
(sub-pixel, by phase correlation; median and 95th percentile) and how fast (median, pixels a frame).
  python3 tools/heatlook.py DIR [DIR ...]
  python3 tools/heatlook.py --encode DIR   (MP4s from the clips' frames, by ffmpeg)
"""
import sys, glob, os, subprocess
import numpy as np
from PIL import Image


def load(p):
    return np.asarray(Image.open(p).convert('L'), dtype=np.float32)


def shift(a, b):
    """b's displacement from a (x, y), to a fraction of a pixel."""
    r = np.fft.fft2(a - a.mean()) * np.conj(np.fft.fft2(b - b.mean()))
    r = np.fft.fftshift(np.real(np.fft.ifft2(r / (np.abs(r) + 1e-6))))
    n = r.shape[0]
    i, j = np.unravel_index(np.argmax(r), r.shape)
    def peak(c, m, p):
        d = m - 2 * c + p
        return 0.0 if abs(d) < 1e-9 else 0.5 * (m - p) / d
    return np.array([j - n // 2 + peak(r[i, j], r[i, (j - 1) % n], r[i, (j + 1) % n]),
                     i - n // 2 + peak(r[i, j], r[(i - 1) % n, j], r[(i + 1) % n, j])])


def motion(clip, bs=16):
    st = np.stack([load(f) for f in sorted(glob.glob(f'{clip}/f*.jpg'))[:120:2]])
    ref, win = st.mean(0), np.outer(np.hanning(bs), np.hanning(bs))
    h, w = ref.shape
    o = np.array([[shift(ref[y:y + bs, x:x + bs] * win, f[y:y + bs, x:x + bs] * win) for f in st]
                  for y in range(0, h - bs, bs) for x in range(0, w - bs, bs) if ref[y:y + bs, x:x + bs].std() >= 8])
    if not len(o):
        return None
    disp = np.linalg.norm(o - o.mean(1, keepdims=True), axis=2)
    speed = np.linalg.norm(np.diff(o, axis=1), axis=2) / 2
    return np.median(disp), np.percentile(disp, 95), np.median(speed)


if sys.argv[1] == '--encode':
    for d in sorted(glob.glob(os.path.join(sys.argv[2], 'clip-*/'))):
        d = d.rstrip('/')
        fps = open(f'{d}/fps.txt').read().strip()
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', fps, '-i', f'{d}/f%04d.jpg', '-pix_fmt', 'yuv420p',
                        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', f'{d}.mp4'], check=True)
    sys.exit()

for d in sys.argv[1:]:
    print(f'== {d}\n{"pair":<16} {"on|d|":>7} {"ctl|d|":>7}')
    for on in sorted(glob.glob(os.path.join(d, '*-on.png'))):
        off = load(on.replace('-on.png', '-off.png'))
        print(f'{os.path.basename(on)[:-7]:<16} {np.abs(load(on) - off).mean():7.2f} {np.abs(load(on.replace("-on.png", "-off2.png")) - off).mean():7.2f}')
    print(f'{"clip":<16} {"disp50":>7} {"disp95":>7} {"px/frame":>8}')
    for clip in sorted(glob.glob(os.path.join(d, 'clip-*/'))):
        m = motion(clip.rstrip('/'))
        print(f'{os.path.basename(clip.rstrip("/"))[5:]:<16} ' + ('no texture' if m is None else f'{m[0]:7.2f} {m[1]:7.2f} {m[2]:8.2f}'))
