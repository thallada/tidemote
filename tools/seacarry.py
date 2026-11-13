# SSIM of the sea carried along its drift and held, each against the sea turned afresh (tools/seacarry.mjs), on
# luminance with a Gaussian window (sigma 1.5), numpy only:   python3 -I tools/seacarry.py DIR
import sys, os, glob
import numpy as np
from PIL import Image

def blur(a, k):
    a = np.apply_along_axis(lambda v: np.convolve(v, k, mode='same'), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode='same'), 1, a)

def ssim(a, b):
    x = np.arange(-5, 6); k = np.exp(-x * x / 4.5); k /= k.sum()
    C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    ma, mb = blur(a, k), blur(b, k)
    va, vb, cov = blur(a * a, k) - ma * ma, blur(b * b, k) - mb * mb, blur(a * b, k) - ma * mb
    s = ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2))
    return float(s[8:-8, 8:-8].mean())

def lum(p):
    a = np.asarray(Image.open(p).convert('RGB')).astype(np.float64)
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]

d = sys.argv[1]
for f in sorted(glob.glob(os.path.join(d, '*-full.png'))):
    tag = os.path.basename(f)[:-9]
    ref = lum(f)
    out = {k: ssim(ref, lum(os.path.join(d, f'{tag}-{k}.png'))) for k in ('again', 'carried', 'held')}
    print(tag, '  '.join(f'{k} {1 - v:.4f}' for k, v in out.items()), '(1 - SSIM)')
