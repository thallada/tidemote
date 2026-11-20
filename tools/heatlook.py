#!/usr/bin/env python3
"""How far the heat haze moves the view: for each NAME-off.png / NAME-on.png pair tools/heatlook.mjs wrote, the mean
absolute difference (0-255), the share of pixels that differ by more than 8 and 24, and the haze's displacement in
pixels, estimated by block matching (the median and 95th percentile shift of the 16 px blocks that have texture), and the control pair's mean
difference (the haze off twice: what changes without it).
  python3 tools/heatlook.py runs/heatlook/A [runs/heatlook/B ...]
"""
import sys, glob, os
import numpy as np
from PIL import Image


def load(p):
    return np.asarray(Image.open(p).convert('L'), dtype=np.float32)


def shifts(a, b, bs=16, r=6):
    h, w = a.shape
    out = []
    for y in range(r, h - bs - r, bs):
        for x in range(r, w - bs - r, bs):
            blk = a[y:y + bs, x:x + bs]
            if blk.std() < 6:
                continue
            best, bd = 1e18, (0, 0)
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    e = np.abs(b[y + dy:y + dy + bs, x + dx:x + dx + bs] - blk).sum()
                    if e < best:
                        best, bd = e, (dx, dy)
            out.append(np.hypot(*bd))
    return np.array(out) if out else np.zeros(1)


for d in sys.argv[1:]:
    print(f'== {d}')
    print(f'{"scene":<16} {"mean|d|":>8} {">8":>7} {">24":>7} {"shift50":>8} {"shift95":>8} {"ctl|d|":>7}')
    for off in sorted(glob.glob(os.path.join(d, '*-off.png'))):
        name = os.path.basename(off)[:-8]
        a, b = load(off), load(off.replace('-off.png', '-on.png'))
        diff = np.abs(a - b)
        s = shifts(a, b)
        c2 = off.replace('-off.png', '-off2.png')
        ctl = np.abs(a - load(c2)).mean() if os.path.exists(c2) else float('nan')
        print(f'{name:<16} {diff.mean():8.2f} {(diff > 8).mean():7.3f} {(diff > 24).mean():7.3f} {np.median(s):8.2f} {np.percentile(s, 95):8.2f} {ctl:7.2f}')
