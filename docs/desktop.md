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
- Of the heat buffer, temperatures and relief (which eras move) are kept; the ice order is built
  again from the seed (`writeState`, which also takes the CPU's relief from the save).

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
  5.0.0: the heat buffer's two unused blocks gone (temperature, floor, ice order).
  6.0.0: the head keeps Sets, Infinity/NaN/-0, undefined and shared objects exactly (pack refuses what it cannot keep); a Set saved as {} had frozen loaded worlds at their next climate event.
  7.0.0: a genome's born is on the GPU's clock (simulated time modulo SIM_CLOCK, shaders.js), raindrops' times kept in f64.
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

## Shader cache

Chromium keeps compiled WebGPU pipelines per profile (`DawnWebGPUCache`), so a load after the first
starts the world in about 0.6–0.8 s instead of 4.4 (RTX 4070 Ti; the page's own `boot` times, in
Settings → Performance → Copy profile). Why an update undid that (Chromium source, October 2026):

- The GPU process looks pipelines up only in an in-memory cache of 6 MiB
  (`kDefaultMaxProgramCacheMemoryBytes`), one for the whole profile, every site's WebGPU shared.
  `--gpu-disk-cache-size-kb` never reaches the GPU process; `--enable-features=AggressiveShaderCacheLimits`
  doubles it.
- At startup the browser hands it every entry on disk, newest first, and each one past 6 MiB pushes out
  the earliest loaded: with more than 6 MiB on disk, the newest entries lose to old ones.
- The disk cache (blockfile, also 6 MiB, no entry over 768 KiB) trims only after five minutes of
  browser uptime, so an old version's pipelines stay.

Tidemote's compiled set is about 5–6 MiB of that (47 entries, the largest `lifeMain` at 550 KiB), so
after an update old plus new no longer fit, and every load compiled the newest, largest pipelines again
(about 3 s), indefinitely. Measure it with `runs/perf/cpu/cache-probe.mjs` (fresh Chrome per load, one
profile; `STEPS` of builds and `#k=` hashes, the cache folder after each).

- The desktop app empties `DawnWebGPUCache` when the page's hash differs from the last launch's
  (`shader-cache-page` in userData), before Chromium opens it: the first launch of each version
  compiles, the rest find everything.
- The web page keeps the hash of its shader sources (`__TIDEMOTE_SHADERS__`, `build.mjs`); when it
  changes, it fetches `fresh-shaders.txt`, which answers `Clear-Site-Data: "cache"` (`site/_headers`).
  That empties the profile's shader caches (every site's; Chromium ignores the origin there) and
  Tidemote's HTTP cache, not its saves or settings. The GPU process keeps what it loaded at startup,
  before any page or header can act, so the first visit after an update compiles what changed (about
  3 s), the second what the clear took (about 3.5 s), and loads are back to 0.6 s from the third.
  Measured: without it 4.6, 3.1, 3.0 s on, never better.
- Not done: keeping the compiled set well under 6 MiB (fewer inlined call sites in the largest
  kernels) would leave room for an update and for other sites' WebGPU.

Measure the desktop app with `runs/perf/cpu/boot-read.mjs` (an app started with
`--remote-debugging-port`, read after it started: Playwright's own launch attaches DevTools early and
changes the cache's keys).

## Switches

- `enable-unsafe-webgpu` everywhere: the page is local and never loads remote content, so WebGPU
  skips Chrome's GPU blocklist.
- Linux: `enable-features=Vulkan` and `ignore-gpu-blocklist`, since Chrome has not turned WebGPU on
  by default for every Linux GPU (the same path the headless gate uses).

`electron . -- --k '{...}'` passes `DEFAULT_K` overrides as the page's `#k=` hash.

## Status (2026-10-26)

- Windows x64: packaged with Electron 45.1.0 (Chrome 156) and run on the RTX 4070 Ti: WebGPU on
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
- Not yet: an icon (see Releasing on Steam below for everything else open).

## Releasing on Steam: what is left, in order

What the code needs is above; this is the path from here to a store page and a release, with what is
still open on our side. Valve's own pages are the authority for their rules and timings (checked
2026-10-27): [Onboarding](https://partner.steamgames.com/doc/gettingstarted/onboarding),
[Release Process](https://partner.steamgames.com/doc/store/releasing),
[Coming Soon](https://partner.steamgames.com/doc/store/coming_soon),
[Review Process](https://partner.steamgames.com/doc/store/review_process),
[Uploading to Steam](https://partner.steamgames.com/doc/sdk/uploading).

1. **Steamworks account and app id.** Join the Steamworks partner program (identity, bank and tax
   forms; onboarding takes a few weeks) and pay the Steam Direct fee for Tidemote ($100, recouped
   once the game has earned $1,000). There is a 30-day wait between paying it and the first release,
   so this starts the clock. The fee gives the app id.
2. **Wire in the app id.** `APP_ID` in `desktop/steam.js`; run `smoke.mjs --steam APPID` against a
   packaged build. Then the parts only a real app id can check: a Workshop upload and download, and an
   achievement Steam accepts.
3. **Steamworks configuration**, each described above: Steam Cloud (quota, the Auto-Cloud roots),
   Workshop (ISteamUGC file transfer on), Stats & Achievements (the list in `src/achievements.js`,
   names, descriptions, an achieved and an unachieved icon for each), the depots (one per OS) and a
   launch option per OS pointing at the executable.
4. **Builds through SteamPipe.** Install the Steamworks SDK's `steamcmd` and write
   `app_build_APPID.vdf` and one `depot_build_DEPOTID.vdf` per OS (content root:
   `desktop/out/Tidemote-win32-x64/`, and the Linux build's folder). Upload with
   `steamcmd +login ... +run_app_build app_build_APPID.vdf +quit`; set the build live on a beta branch
   first, then on the default branch from Steamworks. Neither the scripts nor a script that runs
   them are in the repo yet.
5. **What the app still lacks** (our work, before the build review):
   - An icon: the window and executable icon (`.ico` for Windows, `.png` for Linux; Electron
     Packager's `--icon`), plus Steam's library and client icons.
   - Linux, for the Steam Deck: a native Linux package (Vulkan switches already set, see Switches),
     run on a real Deck (AMD, RADV): controls without a mouse (trackpads, touch, the on-screen
     keyboard for naming), text legible at 1280×800, the frame rate the page picks there. Steam Deck
     Verified review follows from that.
   - Known performance issues, not blockers: one load in three of the 4M world steps slower
     (Status); `life.genera` grows without bound in long runs (about 5,000 genera an hour, 67,000 at
     12 hours: the save and the heap grow with it).
   - macOS last: signing and notarization.
6. **Store page.** Description, short description, tags, the content survey (age ratings), system
   requirements (a WebGPU-capable GPU: D3D12 on Windows, Vulkan on Linux), price (decided: free or
   $1–2), screenshots, the capsule images in Valve's sizes, and a trailer (`runs/promo` has the
   tab-capture pipeline and the chosen track). Mark it ready for review: Valve takes 3–5 business days
   and asks for at least 7. The store page must pass before the build can be submitted.
7. **Coming Soon.** Once the page is approved, publish it as Coming Soon. A new game's page must be
   public at least two weeks before release, and a release date within 14 days can no longer be moved
   without asking Valve. Wishlists start here.
8. **Build review.** Upload a mostly final build to the default branch, finish the build checklist,
   and mark it ready for review (3–5 business days; plan for 7). Updates can still go up during and
   after the review.
9. **Release.** Approved games do not release themselves: press Release App, then Publish Now, in
   Steamworks. Later updates go up through SteamPipe the same way; the web version at tidemote.com
   stays free alongside.
