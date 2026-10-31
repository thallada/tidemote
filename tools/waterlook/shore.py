# Photograph a low-water shore in a storm through a running tools/looklab.mjs (the water's edge, where the sea's bending
# must ease out without smearing): python3 tools/waterlook/shore.py runs/look NAME [composite.wgsl]
import json, os, sys, time
lab, name = sys.argv[1], sys.argv[2]
wgsl = sys.argv[3] if len(sys.argv) > 3 else None
os.makedirs(os.path.join(lab, 'shore'), exist_ok=True)
cid = f'{name}-{time.time()}'
scenes = [{'name': f'shore/{name}_z{z}_{i}', 'level': 0.55, 'rain': 0, 'at': 'shore', 'zoom': z, 'wait': 250, 'run': 0.3 if i else 0}
          for z in (60, 200, 600) for i in range(2)]
cmd = {'id': cid, 'scenes': scenes, 'eval': '(globalThis.__tidemote.eng.seaTune.rough = 1)'}
if wgsl: cmd['wgsl'] = wgsl
json.dump(cmd, open(os.path.join(lab, 'cmd.json'), 'w'))
for _ in range(900):
    try:
        if json.load(open(os.path.join(lab, 'done.json')))['id'] == cid: break
    except Exception: pass
    time.sleep(0.3)
print('done', name)
