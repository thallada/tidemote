# Dump POST_WGSL with the main view drawing only the water's slope as grey (the chop and raindrops' shading alone,
# exaggerated), for tools/looklab.mjs to hot-swap in and photograph; gpucheck.py measures the shots.
#   python3 tools/waterlook/dbg.py runs/look/dbg.wgsl [slope|light]
# then a looklab cmd.json like {"id":"d","wgsl":"runs/look/dbg.wgsl","scenes":[{"name":"z200","rain":1,"zoom":200}]}
# (a looklab started on the current build: the sea itself comes from the page, SEA_WGSL).
import subprocess, sys
out = sys.argv[1]
mode = sys.argv[2] if len(sys.argv) > 2 else 'slope'  # slope: the sheen's tilt; light: the caustics
subprocess.run(['node', 'tools/looklab.mjs', '--dump', out], check=True)
s = open(out).read()
a = 'let surf = surfaceAt(wp, post.ppu, post.cam);'
assert s.count(a) == 1
shown = '0.5 + 2.5 * dot(surf.slope, LAMP_L)' if mode == 'slope' else '0.25 * surf.light'
s = s.replace(a, a + f'\n  return vec4f(vec3f(clamp({shown}, 0.0, 1.0)), 1.0);')
open(out, 'w').write(s)
