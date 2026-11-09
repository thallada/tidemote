# A virtual camera over a master: each frame cropped to its box (sub-pixel, OpenCV) and scaled to --size. The boxes, one a
# frame in the decoded frame's pixels, come from edlcore.vcamPath (render.mjs vcam), so the render frames as the editor shows.
#   ~/.venvs/promo/bin/python tools/promo/vcam.py IN.mp4 OUT.mp4 --start S --path BOXES.json [--size 3840x2160] [--decode 1920x1080] [--x264]
# --decode: the master decoded smaller (the editor's preview); --x264: a quick near-lossless H.264 intermediate (else HEVC on the GPU)
import json, subprocess, argparse
import numpy as np, cv2

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('out')
ap.add_argument('--start', type=float, default=0); ap.add_argument('--path', required=True)
ap.add_argument('--size', default='3840x2160'); ap.add_argument('--decode'); ap.add_argument('--x264', action='store_true')
a = ap.parse_args()
boxes = json.load(open(a.path)); n = len(boxes)
OW, OH = map(int, a.size.split('x'))
probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', a.src], capture_output=True, text=True, check=True)
SW, SH = map(int, (a.decode.split('x') if a.decode else probe.stdout.strip().split(',')))
dec = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-hwaccel', 'cuda', '-ss', f'{a.start:.4f}', '-i', a.src, *(['-vf', f'scale={SW}:{SH}'] if a.decode else []), '-frames:v', str(n), '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], stdout=subprocess.PIPE)
enc = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{OW}x{OH}', '-r', '60', '-i', '-',
                        *(['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '8'] if a.x264 else ['-c:v', 'hevc_nvenc', '-preset', 'p7', '-tune', 'hq', '-rc', 'constqp', '-qp', '14']),
                        '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', a.out], stdin=subprocess.PIPE)
fb = SW * SH * 3
for x, y, w, h in boxes:
    buf = dec.stdout.read(fb)
    if len(buf) < fb: break
    img = np.frombuffer(buf, np.uint8).reshape(SH, SW, 3)
    s = OW / w
    out = img if (w, h, x, y) == (OW, OH, 0, 0) else cv2.warpAffine(img, np.float32([[s, 0, -x * s], [0, s, -y * s]]), (OW, OH), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    enc.stdin.write(out.tobytes())
enc.stdin.close(); enc.wait(); dec.terminate()
