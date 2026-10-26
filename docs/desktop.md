# Desktop build (Steam)

`desktop/` wraps the built page in Electron, its own npm package so the sim's dependencies stay as
they are. The page is unchanged: `scripts/stage.mjs` runs `build.mjs` and copies
`dist/tidemote.html` to `desktop/page/index.html`, which `main.js` serves from `app://tidemote/`
(an origin of its own, so IndexedDB worlds and localStorage settings persist in Electron's userData
directory).

```
cd desktop && npm install
npm start                                            # build, stage, run in Electron
npm run package -- --platform win32 --arch x64       # out/Tidemote-win32-x64/, a Steam depot's contents
tools/gpu-node.sh desktop/scripts/smoke.mjs --exe 'C:\...\Tidemote.exe'   # adapter, fps, screenshot
```

Under WSL, copy a Windows package to a Windows path (`%LOCALAPPDATA%\tidemote-desktop`) before
running it; the smoke check drives it with Playwright's Electron launcher and writes
`runs/desktop/smoke/{report.json,window.png}`.

## Why Electron

Electron ships its own Chromium, so WebGPU (Dawn, DXC on D3D12) behaves the same on every machine
as in Chrome. Tauri uses the system webview, and WebKitGTK has no WebGPU, which rules out Linux and
the Steam Deck. The simulation runs no faster than in Chrome; what the shell adds is a fixed browser
version, its own switches, real fullscreen and saves the browser cannot evict.

## Switches

- `enable-unsafe-webgpu` everywhere: the page is local and never loads remote content, so WebGPU
  skips Chrome's GPU blocklist.
- Linux: `enable-features=Vulkan` and `ignore-gpu-blocklist`, since Chrome has not turned WebGPU on
  by default for every Linux GPU (the same path the headless gate uses).

`electron . -- --k '{...}'` passes `DEFAULT_K` overrides as the page's `#k=` hash.

## Status (2026-10-26)

- Windows x64: packaged with Electron 44.9.3 (Chrome 152) and run on the RTX 4070 Ti: WebGPU on
  NVIDIA, 3.35M particles by the page's own calibration, no console errors. The unpacked app is
  about 370 MB (the executable alone 236 MB); Steam compresses depots.
- Linux and macOS: not yet built or run. Linux needs a test on a real Steam Deck (AMD, RADV), as a
  native build rather than the Windows one under Proton. macOS needs signing and notarization.
- Not yet: steamworks.js (achievements, Steam Cloud, Workshop for `.tidemote` worlds), an icon,
  timing against Chrome with `tools/perf/bench.mjs`.
