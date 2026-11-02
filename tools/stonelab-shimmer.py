# How much stone shimmers as the view moves (tools/stonelab.mjs --shift): each frame, taken with the camera moved by
# a fraction of a pixel, is moved back by its offset (a Fourier shift, exact for a picture with nothing finer than
# its pixels), and what still differs between them is aliasing: detail finer than a pixel, flickering. The two
# unmoved frames give what changes anyway (the water, cells), taken off.
#   python3 tools/stonelab-shimmer.py OUT/shift [OTHER/shift ...]
# Per spot, zoom and look: shimmer (RMS, 0..255 levels), mean level, shimmer over level.
import sys, json, glob, os
import numpy as np
from PIL import Image

def load(f): return np.asarray(Image.open(f).convert('RGB')).astype(np.float64)
def back(img, dx, dy):
    fy, fx = np.fft.fftfreq(img.shape[0])[:, None], np.fft.fftfreq(img.shape[1])[None, :]
    ph = np.exp(-2j * np.pi * (fx * dx + fy * dy))
    return np.stack([np.real(np.fft.ifft2(np.fft.fft2(img[..., c]) * ph)) for c in range(3)], -1)

for d in sys.argv[1:]:
    print(d)
    for j in sorted(glob.glob(os.path.join(d, '*.json'))):
        J = json.load(open(j))
        fr = [(load(os.path.join(d, m['f'])), m) for m in J['frames']]
        al = np.stack([back(f, m['dx'], m['dy']) for f, m in fr[1:]])[:, 16:-16, 16:-16]
        still = ((fr[0][0] - fr[1][0]) ** 2)[16:-16, 16:-16].mean() / 2
        sh = np.sqrt(max(al.var(0).mean() - still, 0.0))
        lv = al.mean()
        print(f'  {os.path.basename(j)[:-5]:<28} shimmer {sh:5.2f}  level {lv:5.1f}  ratio {sh / max(lv, 1e-6):.3f}')
