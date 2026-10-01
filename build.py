#!/usr/bin/env python3
"""Bundle the ES modules in src/ into one self-contained page: dist/tidemote.html.

The modules share a single top-level scope once bundled, so imports and export
keywords are stripped and top-level names must not collide across files.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / 'src'
ORDER = ['shaders.js', 'engine.js', 'guide.js', 'lab.js', 'main.js']

parts = []
for name in ORDER:
    s = (SRC / name).read_text()
    s = re.sub(r'^import [\s\S]*?;\n', '', s, flags=re.M)
    s = re.sub(r'^export \{[^}]*\};\n', '', s, flags=re.M)
    s = re.sub(r'^export (const|function|async function|class) ', r'\1 ', s, flags=re.M)
    parts.append(f'// ---- {name}\n' + s)
js = '\n'.join(parts)

html = (SRC / 'page.html').read_text().replace('/*__SCRIPT__*/', js)
out = ROOT / 'dist' / 'tidemote.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html)
print(f'wrote {out.relative_to(ROOT)} ({len(html):,} bytes)')
