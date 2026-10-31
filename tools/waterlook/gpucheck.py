# The sea's zoom and time checks on the GPU's own frames, through a running tools/looklab.mjs (started on the current
# build, its composite swapped for dbg.py's slope view):
#   python3 tools/waterlook/gpucheck.py runs/look runs/look/dbg.wgsl [zoom|time]
# zoom: the view at 2z averaged down 2x against the middle of the view at z (the same waves: near 1);
# time: frame-to-frame correlation with the sea's clock stepped 1/60 s (smooth: steady and near 1, no dips).
import json, os, sys, time
import numpy as np
from PIL import Image
lab, wgsl = sys.argv[1], sys.argv[2]
n = [0]
def shoot(scenes, ev=None):
    n[0] += 1
    cid = f'gc{n[0]}-{time.time()}'
    cmd = {'id': cid, 'wgsl': wgsl, 'scenes': scenes}
    if ev: cmd['eval'] = ev
    json.dump(cmd, open(os.path.join(lab, 'cmd.json'), 'w'))
    for _ in range(600):
        try:
            if json.load(open(os.path.join(lab, 'done.json')))['id'] == cid: return
        except Exception: pass
        time.sleep(0.3)
    raise SystemExit('looklab did not answer')
def img(name):
    return np.asarray(Image.open(os.path.join(lab, name + '.png')).convert('L'), float)
def corr(a, b):
    a = a - a.mean(); b = b - b.mean()
    return float((a * b).sum() / np.sqrt((a * a).sum() * (b * b).sum()))
os.makedirs(os.path.join(lab, 'gc'), exist_ok=True)
at = [50.3, 50.7]
only = sys.argv[3] if len(sys.argv) > 3 else None
print('zoom consistency:')
for z in (() if only == 'time' else (40, 200, 700)):
    # (the sea's clock pinned for each: the page runs on between shots)
    for zz in (z, 2 * z):
        shoot([{'name': f'gc/z{zz}', 'rain': 1, 'zoom': zz, 'at': at, 'wait': 250}], 'globalThis.__tidemote.eng.simTime = 300')
    a, b = img(f'gc/z{z}'), img(f'gc/z{2 * z}')
    h, w = (b.shape[0] // 2) * 2, (b.shape[1] // 2) * 2
    bd = 0.25 * (b[0:h:2, 0:w:2] + b[1:h:2, 0:w:2] + b[0:h:2, 1:w:2] + b[1:h:2, 1:w:2])
    # the view at z's middle, the same world as all of the view at 2z (both centered on at)
    H, W = a.shape
    cy, cx = H // 2, W // 2
    am = a[cy - bd.shape[0] // 2: cy - bd.shape[0] // 2 + bd.shape[0], cx - bd.shape[1] // 2: cx - bd.shape[1] // 2 + bd.shape[1]]
    # (above the scale bar, at the bottom right)
    k = bd.shape[0] * 3 // 4
    print(f'  z {z} vs {2 * z}: corr {corr(am[:k], bd[:k]):.3f}')
print('time (the sea clock stepped 1/60 s; step: the mean change a frame in grey levels, a jump a step far above the rest):')
for z in (() if only == 'zoom' else (200, 1500)):
    cs, ds, prev = [], [], None
    for i in range(24):
        shoot([{'name': f'gc/t{z}', 'rain': 1, 'zoom': z, 'at': at, 'wait': 250}], f'globalThis.__tidemote.eng.simTime = {300 + i / 60}')
        v = img(f'gc/t{z}')[:-80]
        if prev is not None: cs.append(corr(prev, v)); ds.append(np.abs(v - prev).mean())
        prev = v
    cs, ds = np.array(cs), np.array(ds)
    print(f'  z {z}: corr mean {cs.mean():.4f} min {cs.min():.4f}; step mean {ds.mean():.3f} max {ds.max():.3f} (image std {v.std():.2f})')
