# Desktop build (Steam)

Releases (CI builds for every OS, Steam branches, itch.io) are in docs/release.md.

`desktop/` wraps the built page in Electron, its own npm package so the sim's dependencies stay as
they are. `scripts/stage.mjs` runs `build.mjs` and copies `dist/tidemote.html` to
`desktop/page/index.html`, which `main.js` serves from `app://tidemote/` (an origin of its own, so
localStorage settings persist in Electron's userData directory).

The page finds the shell as `window.tidemoteDesktop` (`preload.cjs`; every call goes to the main
process, which passes Steam's on to the Steam helper, below) and is otherwise the same page as on the web:

- `worlds`: the saved-world store (list/put/get/remove, as `createWorldStore` in `src/worlds.js`),
  as files (`desktop/worlds.js`), with the Workshop's subscribed worlds listed among them.
- `steam()`: `{ on, appId, cloud, user }`; without Steam the page hides what needs it.
- `achieve(id)`, `workshop.share(id, { title, description })`, `workshop.browse()`, `workshop.open(item)`.
- `film`: a film written as it is made into `Videos/Tidemote` (`open(name)` → `{ id, free }`, `write`,
  `patch`, `close` → its path, `abort`), as `NAME.part` until it is closed (docs/film.md).
- `fullscreen`: `toggle()`, `get()`, `on(fn)` and `forced()` (true under gamescope, where the page hides its
  full-screen button).

The window opens full screen, and windowed (1600×900) only when the player last left it windowed
(F11, F or the top bar's button); `main.js` keeps that in `userData/window.json`. `--windowed` opens a
window whatever was kept and keeps nothing, for the scripts that drive the app (`smoke.mjs`,
`launch-check.mjs`).

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
  8.0.0: the heat buffer keeps the water's ice (a fourth block, each cell's frozen share, then how many cells hold ice).
  9.0.0: a genome holds the signal genes (`call`, `ear`: two vec4s more, `G_BYTES` 256).
- minor: additions to the head a version of the same major can do without (a field, a part of the
  page's record). A newer version must give old saves of its major a default for what it added.
  Buffers are never minor: `openWorld` wants every buffer it knows at exactly the size
  `stateSizes` gives, so a buffer added, removed or resized is a major change.
  7.1.0: the page's record keeps the hand's acts and the pipette's contents (`life.hand`, `life.pipette`; empty
  when absent) and a save's meta whether its world was touched.
  8.1.0: the engine's record keeps a floor shift under way (`cpu.floor`, as `snapshot` keeps it: the era and drift
  of one still being worked out, or the floor it eases from and to; none when absent), so a world saved during a
  shift goes on shifting.
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
and it would need the SDK in the app's own process, which the helper rules out (below).

## Achievements

`src/achievements.js` lists them (ids are Steam API names; names and descriptions to enter in
Steamworks → Stats & Achievements, each with an achieved and an unachieved icon). Most come from the stories the chronicler
tells (`earned(story)` on each one `tellStories` logs: firsts by `key`, dramas by `kind`, the
return after a collapse and a guild's return by `moment`); the rest from the viewer (a species named,
a world shared, fifty stories read, counted in localStorage). Since stories are told under a
budget, an achievement comes with the story the viewer reads, not with every candidate.
`test/achievements.test.js` and the chronicler tests check the mapping.

## Steam in a helper process

The Steamworks SDK never loads in the app. `desktop/steam-helper/helper.cjs` is a small program of its own
(MIT, with its own `LICENSE`; docs/release.md, License) and the only code that loads steamworks.js and
Valve's `steam_api`. `desktop/steam.js` starts it as a separate process with `child_process.fork`: the
app's own executable run as plain Node (`ELECTRON_RUN_AS_NODE=1`). The two exchange plain JSON messages
over Node's IPC pipe: `init`, `status`, `achieve`, `deck`, `keyboard`, the Workshop's `ugc.*` calls and
`quit`, with item ids as decimal strings. `desktop/steam-helper/README.md` documents the protocol and why
the helper is a forked process rather than a `utilityProcess`. The packager unpacks the helper and
steamworks.js into `resources/app.asar.unpacked/`, so the helper runs from real files.

- **Starting.** The helper starts while Electron gets ready. Every Steam call from the page waits until
  `init` has answered, so the first `steam()` gets the real status. A build with an app id of its own
  waits for that answer before opening its window, in case Steam relaunches it
  (`SteamAPI_RestartAppIfNecessary`, run in the helper: on `restart` the app quits).
- **Without Steam.** If the helper cannot start, its `init` times out (20 s), or Steam is not running,
  Steam is off with the reason (`status()` → `{ on: false, loaded, why }`) and the helper is stopped. The
  app runs exactly as before. `loaded` says whether the helper loaded steamworks.js's addon (the launch
  check needs it).
- **Failures later.** If the helper crashes, every pending call fails and Steam turns off for the rest of
  the session (the page's calls answer `false`, the Workshop's list shows only the own saves). There is no
  restart. Each call has a time-out: 10 s, longer for Workshop uploads (30 min) and the keyboard (an hour).
- **Quitting.** On `will-quit` the app sends `quit` and closes the pipe. The helper also exits on its own
  whenever the pipe closes, so a crashed app does not leave Steam counting it as running.
- `test/steamhelper.test.js` drives the client against fake helpers (Steam off, no start, a crash on `init`
  and later, a hang, a relaunch), runs the real helper under Node, and checks that the helper imports
  nothing but steamworks.js and Node built-ins. `scripts/launch-check.mjs` checks on Linux that the app's
  own process never maps `steam_api`.

What a separate process changes, and what is still unchecked because it needs Tidemote's own app id and a
Steam client:

- **Who calls `SteamAPI_Init`.** The helper does, as a child of the process Steam launched. That process
  passes down its environment, which includes `SteamAppId` and `SteamGameId`. This is the usual launcher
  pattern: Steam starts one program, and a child of it initializes the API. steamshim inverts it (its
  helper is the parent Steam launches and the game is its child), but either way the process that holds
  the SDK is not the GPL program. Not yet verified: that Steam shows Tidemote as running and counts its
  playtime for the whole session, that achievements unlock under its app id, and that the floating
  keyboard shows on the Deck. It all worked in-process as Spacewar (Status below). Playtime should follow
  the launched process (the app) rather than the helper, but that is unconfirmed.
- **`RestartAppIfNecessary`.** It now runs in the helper. It reads the same inherited environment, and
  Steam relaunches the app's configured executable, not the helper. Unverified until `APP_ID` is set.
- **The overlay.** Unchanged. It was never in use: Chromium renders in its GPU process, not the process
  that called `SteamAPI_Init`, and the in-process-GPU workaround was never turned on. Steam injects its
  overlay into processes it launches whatever the helper does. Whether it draws over Chromium's GPU
  process is as unmeasured as before.
- **Steam Cloud.** Unaffected: Auto-Cloud syncs the saves folder with no SDK calls.

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
Settings → Perf → Copy profile). Why an update undid that (Chromium source, October 2026):

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
(about 3 s), indefinitely. It was measured with `runs/perf/cpu/cache-probe.mjs`, a one-off kept outside the
repo (fresh Chrome per load, one profile; `STEPS` of builds and `#k=` hashes, the cache folder after each).

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

The desktop app was measured with `runs/perf/cpu/boot-read.mjs`, also a one-off outside the repo (it reads
`__tidemote.boot` from an app started with `--remote-debugging-port`, attaching after it started:
Playwright's own launch attaches DevTools early and changes the cache's keys).

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
- Steam (steamworks.js 0.4.0), checked as Spacewar on Windows when the SDK still loaded in the main
  process: status (Cloud on), a save as files with its preview, read back and deleted, the achievement
  call refused for an id Spacewar lacks. Not yet run: a Workshop upload or download, an achievement Steam
  accepts (both need Tidemote's own app id and its Steamworks setup above).
- The Steam helper (2026-11-20): a Linux package's launch check passes. The helper starts as its own
  process from `app.asar.unpacked`, loads the addon and reports Steam not running, and the app's process
  never maps `steam_api`. Not yet run with Steam: `smoke.mjs --steam 480` on Windows, and Steam
  in a helper process above.
- Timed against Chrome (2026-10-26, `tools/perf/bench.mjs --electron EXE`, the baseline plan, three
  alternating rounds each on an RTX 4070 Ti at the same canvas size): the same within noise, frame
  rates, GPU time, the step and every pass, in both the 1M and 4M worlds. The desktop app neither gains
  nor loses anything over the browser. One load in three of the 4M world, in either, runs a step half
  as slow again (`matterMain` 1.8 → 6.8 ms, `lifeMain` 6 → 7.7), whatever the climate: not yet traced.
- The icon (2026-11-12): the page's favicon, two waves on the dark tile, drawn as an app icon in
  `desktop/icon/icon.svg`. `npm run icon` in `desktop/` renders `icon.png` (512, the window's on
  Linux), `icon.ico` (16 to 256, the executable's and the window's on Windows) and `icon.icns` (16 to
  1024, the Mac bundle's) from it; all four are committed, so builds need no renderer. The packager
  embeds the `.ico`/`.icns` (`icon` in `scripts/package.mjs`), `main.js` hands the window its own.
  Steam's library and client art is still to make (Releasing on Steam below, with everything else
  open).

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
   - Steam's library and client art (capsules, the library's hero and logo, the client's icon, for
     which `desktop/icon/icon.ico` can serve; Steamworks → Store Assets and Library Assets). The
     window and executable icon is done (Status).
   - Steam Deck Touchscreen: **Touch API Pass-through**, or the Deck's touchscreen reaches the game as one emulated
     mouse pointer (docs/controller.md, Touch on the Deck).
   - Linux, for the Steam Deck: a native Linux package (Vulkan switches already set, see Switches),
     run on a real Deck (AMD, RADV): controls without a mouse (trackpads, touch, the on-screen
     keyboard for naming), text legible at 1280×800, the frame rate the page picks there. Steam Deck
     Verified review follows from that.
   - Known performance issues, not blockers: one load in three of the 4M world steps slower
     (Status). (`life.genera` no longer grows with a long run: `pruneRecords` in `src/main.js` drops
     the genera and orphan lines no kept species belongs to.)
   - macOS last: signing and notarization.
6. **Store page.** Description, short description, tags, the content survey (age ratings), system
   requirements (a WebGPU-capable GPU: D3D12 on Windows, Vulkan on Linux), price (decided: free or
   $1–2), screenshots, the capsule images in Valve's sizes, and a trailer (`tools/promo`, docs/promo.md, has the
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
