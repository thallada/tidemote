# Desktop build (Steam)

`desktop/` wraps the built page in Electron, its own npm package so the sim's dependencies stay as
they are. `scripts/stage.mjs` runs `build.mjs` and copies `dist/tidemote.html` to
`desktop/page/index.html`, which `main.js` serves from `app://tidemote/` (an origin of its own, so
localStorage settings persist in Electron's userData directory).

The page finds the shell as `window.tidemoteDesktop` (`preload.cjs`; every call goes to the main
process) and is otherwise the same page as on the web:

- `worlds`: the saved-world store (list/put/get/remove, as `createWorldStore` in `src/worlds.js`),
  as files (`desktop/worlds.js`), with the Workshop's subscribed worlds listed among them.
- `steam()`: `{ on, appId, cloud, user }`; without Steam the page hides what needs it.
- `achieve(id)`, `workshop.share(id, { title, description })`, `workshop.browse()`, `workshop.open(item)`.

## Saves and Steam Cloud

Each save is three files in `userData/worlds/`: `ID.tidemote` (the world, as `encodeWorld` writes it),
`ID.jpg` (a 1024² picture of the view, drawn offscreen by the card portrait's renderer, `takeView`
in `src/main.js`) and `ID.json` (its meta, written last so a list never shows a save half written).
Each is written to `.part` and renamed.

A save keeps about 8.5 bytes a particle, a third of what the plain buffers gzip to (`compactState`
in `src/engine.js`, `toColumns` in `src/worlds.js`):

- Particles and intents go by columns, most in byte planes.
- Positions are kept as the grid cell each lies in (the change from the particle before: particles
  lie sorted by cell, so it is nearly always 0) and the place within it to 2^-10 of a unit (0.06 µm;
  a cell is about 10 µm across). Velocity, energy and age are cut to 10 mantissa bits.
- Silt takes new ids, in the order it lies, after every id given so far. An id seeds only a grain's
  random draws and how it is drawn up close, so an opened world is the same but for the outlines and
  turns of its silt grains at full zoom (`runs/idlook/compare-close.png`); ids in order cost almost
  nothing where 3 million in no order cost 9 MB. Each load uses up as many ids as there is silt
  (the u32 counter lasts about 15 simulated days of births at 3.4M particles).
- Intents keep their action words only for cells with a claim pending; genera with no species left
  in the registry drop their founder's genome.
- Of the heat buffer, temperatures and relief (which eras move) are kept; deposits and husk piles
  last a step, and the ice order is built again from the seed (`writeState`, which also takes the
  CPU's relief from the save).

A young 3.4M world: 75–80 MB at first, 39 MB by columns, 27.5–28.8 MB now. 48 paired forks
(`tools/fork.mjs`, a `kept` variant, 60 s at 32k) found a saved world runs on like the original
(1 of 72 rates past its 95% interval, none of the guilds' populations). Left in a save is mostly
randomness: velocities (Brownian, about 11 MB) and the places within cells (about 8 MB). zstd-19
would take 5% more off at ten times the time, and browsers do not read it.

## Save versions

`SAVE_VERSION` in `src/worlds.js` is semver, kept in every file's head and in its meta (so a list
can tell before reading the world). A save opens only in a version of its own major:

- major: anything older versions cannot read, or that makes older saves unreadable (a buffer's
  layout or `P_BYTES`, what `readState` keeps, `compactState`'s columns, what the page's record means).
  4.0.0: positions by cell, silt ids, the heat buffer trimmed.
- minor: additions a version of the same major can do without (a head field, a buffer it does not
  know; `openWorld` keeps only the buffers it knows). A newer version must give old saves of its
  major a default for what it added.
- patch: fixes that change nothing a reader sees.

Settings → Worlds lists a save of another major as "Needs a newer Tidemote" or "From an older
Tidemote", without Load or Share. Files from before versions ('TMW1', 'TMW2') count as older.

Steam Cloud keeps that folder by Auto-Cloud, with no API calls. In Steamworks → Application →
Steam Cloud, set a quota (a few GB, a few hundred files: saves are large) and, under Auto-Cloud,
one root per OS, subdirectory `Tidemote/worlds`, patterns `*.tidemote`, `*.json`, `*.jpg`:

| OS | Root |
| --- | --- |
| Windows | `WinAppDataRoaming` (`%APPDATA%\Tidemote\worlds`) |
| Linux | `LinuxXdgConfigHome` (`~/.config/Tidemote/worlds`) |
| macOS | `MacAppSupport` (`~/Library/Application Support/Tidemote/worlds`) |

The Worlds tab says "Kept on this computer and in Steam Cloud" when Cloud is on for the account and
the app.

## Workshop

A save's share button (Settings → Worlds, shown with Steam running) asks first, then makes a Workshop
item (public) holding `world.tidemote` and `world.json`, the save's preview as its picture, and opens
its page in Steam (where the sharer can change its words and visibility, and accepts the Workshop
agreement if Steam asks). The save remembers its item (`meta.workshop`), so sharing it again updates
it. Worlds subscribed to list under "From the Workshop" once Steam has downloaded them (the tab
follows a download), to load or unsubscribe. Steamworks → Workshop → General must enable
ISteamUGC file transfer. Workshop pages open in the Steam client (`steam://url/...`), not the
overlay: steamworks.js's Electron overlay forces in-process GPU and turns off direct composition,
not measured yet.

## Achievements

`src/achievements.js` lists them (ids are Steam API names; names and descriptions to enter in
Steamworks → Stats & Achievements, each with an achieved and an unachieved icon). Most come from the stories the chronicler
tells (`earned(story)` on each one `tellStories` logs: firsts by `key`, dramas by `kind`, the
return after a collapse and a guild's return by `moment`); the rest from the viewer (a species named,
a world shared, fifty stories read, counted in localStorage). Since stories are told under a
budget, an achievement comes with the story the viewer reads, not with every candidate.
`test/achievements.test.js` and the chronicler tests check the mapping.

## Steam app id

`APP_ID` in `desktop/steam.js` is 0 until Steamworks gives Tidemote one; then a release build
relaunches through Steam when started directly. Until then Steam starts only when the app is launched
by Steam or with `TIDEMOTE_STEAM_APPID` (480, Valve's Spacewar, for testing).

```
cd desktop && npm install
npm start                                            # build, stage, run in Electron
npm run package -- --platform win32 --arch x64       # out/Tidemote-win32-x64/, a Steam depot's contents
tools/gpu-node.sh desktop/scripts/smoke.mjs --exe 'C:\...\Tidemote.exe'   # adapter, fps, screenshot
tools/gpu-node.sh desktop/scripts/smoke.mjs --exe '...' --steam 480          # and the shell, as Spacewar
```

Under WSL, copy a Windows package to a Windows path (`%LOCALAPPDATA%\tidemote-desktop`) before
running it; the smoke check drives it with Playwright's Electron launcher and writes
`runs/desktop/smoke/{report.json,window.png}`. With `--steam APPID` it also checks Steam's status, a
save through Settings → Worlds (its files and preview, read back, deleted), an achievement call and
the subscribed list; it publishes nothing.

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

- Windows x64: packaged with Electron 45.0.0 (Chrome 156) and run on the RTX 4070 Ti: WebGPU on
  NVIDIA, 3.35M particles by the page's own calibration, no console errors. The unpacked app is
  about 370 MB (the executable alone 236 MB); Steam compresses depots.
- Linux and macOS: not yet built or run. Linux needs a test on a real Steam Deck (AMD, RADV), as a
  native build rather than the Windows one under Proton. macOS needs signing and notarization.
- Steam (steamworks.js 0.4.0), checked as Spacewar on Windows: status (Cloud on), a save as files
  with its preview, read back and deleted, the achievement call refused for an id Spacewar lacks.
  Not yet run: a Workshop upload or download, an achievement Steam accepts (both need Tidemote's
  own app id and its Steamworks setup above).
- Timed against Chrome (2026-10-26, `tools/perf/bench.mjs --electron EXE`, the baseline plan, three
  alternating rounds each on an RTX 4070 Ti at the same canvas size): the same within noise, frame
  rates, GPU time, the step and every pass, in both the 1M and 4M worlds. The desktop app neither gains
  nor loses anything over the browser. One load in three of the 4M world, in either, runs a step half
  as slow again (`matterMain` 1.8 → 6.8 ms, `lifeMain` 6 → 7.7), whatever the climate: not yet traced.
- Not yet: an icon.
