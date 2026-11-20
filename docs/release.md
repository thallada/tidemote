# Releasing the desktop app

`.github/workflows/desktop.yml` builds `desktop/` (docs/desktop.md) for Windows, macOS and Linux on their
own GitHub runners, checks each build launches, and ships it:

| Trigger | Builds | Steam | itch.io | GitHub |
| --- | --- | --- | --- | --- |
| push to `main` | `0.1.0-dev.N`, artifacts kept 14 days | live on the private `dev` branch | — | — |
| tag `v1.2.3` | `1.2.3`, kept 90 days | live on the private `staging` branch | `windows`, `mac`, `linux` channels | draft release with the three archives |
| tag `v1.2.3-beta.1` | `1.2.3-beta.1` | `staging` | — (no pre-releases) | draft pre-release |
| Run workflow (Actions tab) | as for its ref | the branch typed in, or the usual one | — | — |

Each run's **Artifacts** (at the foot of its page in the Actions tab, for anyone signed in to GitHub) are
the three archives themselves: `Tidemote-VERSION-windows-x64.zip`, `-mac-universal.zip` and
`-linux-x64.tar.gz`, each one folder holding the app.

A release, then: `git tag v1.2.3 && git push origin v1.2.3`, try the build on Steam's `staging` branch,
then in Steamworks → SteamPipe → Builds set that BuildID live on `default`. Valve does not let a build
script set `default` live, so going public on Steam is always that click. To roll back, set an earlier
BuildID live; Steam keeps them all.

The version comes from the tag (main's builds count up from `desktop/package.json`'s); it is the app's
version (`app.getVersion()`, the user agent), the Steam build's description, and itch's `--userversion`.

## Why every commit builds

The repository is public, so GitHub's standard runners cost nothing and have no minute limit. (Private,
2026: Linux $0.006, Windows $0.010, macOS $0.062 a minute; macOS minutes count ten times against an
included quota.) Packaging alone takes about 6 s on Linux; a run's jobs are mostly installing and
Electron's download (cached). A build is 287 MB unpacked, about 128 MB archived.

Steam studios mostly work this way: CI uploads every mainline build to a private branch (game-ci's
`steam-deploy`, Valve's own SteamPipe docs on branches), testers and the developer play that, and a
release promotes a build already played instead of building again. SteamPipe uploads only the chunks that
changed, so a commit that changes the page sends little more than `app.asar`. itch.io gets only tagged
releases: its channels are public downloads, so whatever is pushed is what players get at once.

## The checks

- **Launch check** (every OS, every run): `desktop/scripts/launch-check.mjs` starts the packaged app with
  Playwright and fails unless the page is served from `app://tidemote`, the `tidemoteDesktop` bridge is
  there, the Steam helper process started and loaded steamworks.js's native addon (`status().loaded`; Steam
  itself is not running on a runner, so Steam stays off with the reason) while the app's own process never
  loaded it (Linux), and WebGPU compiled the world and stepped it (`--need-gpu`; each outcome is also an annotation on the
  run's page).
  On Linux, whose runner has no GPU, the app gets Chromium's software adapter (SwiftShader, allowed by
  `--enable-unsafe-swiftshader`) and a 4096-particle world (a count chosen in Settings), so every
  pipeline compiles and runs in seconds; the macOS runner has a GPU of its own. Windows' runner is
  offered no adapter at all (SwiftShader, its Vulkan and ANGLE's WARP were each tried), so there WebGPU
  is reported but not required: the Windows build's shaders are proven only on a real machine
  (`smoke.mjs`). Each OS's result is a line
  in the run's summary; its report and screenshot are kept as an artifact only when it fails.
- **macOS**: an ad-hoc signature, verified with `codesign --verify --deep --strict`, and `lipo -archs`
  shows the universal binary's two arches.
- **Steam job**: fails unless steamcmd prints `Successfully finished AppID ... (BuildID ...)` (it can exit
  0 on a failed build); the BuildID and branch go in the run's summary.
- **Unpacking**: refuses an archive without one top folder, and a Mac build whose symlinks did not survive.
- Before going live on `default`, `desktop/scripts/smoke.mjs --steam APPID` on a machine with a GPU and
  Steam (docs/desktop.md), and a play on the Steam Deck for Linux.

## Setting up Steam

1. In Steamworks, the app and three depots, one per OS, each with its OS set (Depots: Operating System).
   Set `APP_ID` in `desktop/steam.js` to the app's id (until then the shell starts Steam only with
   `TIDEMOTE_STEAM_APPID`).
2. Installation → General: a launch option for each OS: `Tidemote.exe` (Windows), `Tidemote.app` (macOS),
   `Tidemote` (Linux).
3. SteamPipe → Builds → branches: `dev` and `staging`, each with a password, so only you (and anyone
   given it) see them.
4. A **build account**: a separate Steam account added to the partner group with only Edit App Metadata
   and Publish App Changes To Steam, so the secret in CI cannot do anything else. Its Steam Guard by email,
   not the mobile authenticator.
5. Log the build account in once, by hand, with steamcmd (Linux tarball or `apt install steamcmd`):
   `steamcmd +login BUILDUSER +quit`, entering the password and the code mailed to it. steamcmd keeps the
   login in `config/config.vdf` under its directory (`~/.steam/steamcmd` or `~/Steam`). Encode it:
   `base64 -w0 config/config.vdf`.
6. GitHub → Settings → Environments: an environment `steam` limited to `main` and tags `v*`
   (Deployment branches and tags), holding the secrets `STEAM_USERNAME` (the build account) and
   `STEAM_CONFIG_VDF` (step 5). Repository variables (Settings → Secrets and variables → Variables):
   `STEAM_APP_ID`, `STEAM_DEPOT_WINDOWS`, `STEAM_DEPOT_MAC`, `STEAM_DEPOT_LINUX`, and if wanted
   `STEAM_DEV_BRANCH`/`STEAM_RELEASE_BRANCH` (default `dev`/`staging`). The Steam job runs once
   `STEAM_APP_ID` exists.

The saved login lasts until Steam ends it (a password change, Steam Guard changes, a long idle). The job
then fails asking for a Steam Guard code: log in by hand again (step 5) and replace the secret.

`desktop/scripts/steam-build.mjs` writes the app build script (`test/steambuild.test.js`); `--preview`
makes one Steam checks without uploading, for trying the setup.

On Linux, Steam installs without setting `chrome-sandbox` setuid, and Electron then needs unprivileged user
namespaces, which some distributions and the Steam Linux Runtime's container withhold: if the Linux build
will not start from Steam, add `--no-sandbox` to the Linux launch option's arguments. Check on a Deck.

## Setting up itch.io

1. Create the project (Kind: Downloadable), then an API key at itch.io → Settings → API keys.
2. GitHub: an environment `itch` limited to tags `v*`, with the secret `BUTLER_API_KEY`; the repository
   variable `ITCH_GAME` set to `user/project` (from the project's URL).

The job installs butler from itch's own distribution (broth) and pushes each OS's folder to a channel
(`windows`, `mac`, `linux`; itch tags a channel's platform from its name). butler uploads only the
difference from the channel's last build (wharf), and the itch app patches installs the same way;
browser downloads get the whole archive itch makes. `butler status user/project` lists each channel's
build and version.

## Signing (not yet)

- **macOS**: today an ad-hoc signature, which Steam's installs run (Steam does not quarantine what it
  downloads) but which Gatekeeper stops when downloaded in a browser (itch.io, GitHub): the player must
  right-click → Open, or allow it in System Settings → Privacy & Security. A Developer ID (the Apple
  Developer Program, $99 a year) lets `package.mjs` sign and notarize with the packager's `osxSign` and
  `osxNotarize` options; the workflow then imports the certificate into a keychain on the runner in place
  of the ad-hoc step.
- **Windows**: unsigned, SmartScreen warns on a browser download ("Windows protected your PC"); Steam's
  installs do not. Azure Artifact Signing (formerly Trusted Signing, a monthly fee, open to individuals in
  some countries) or an OV/EV certificate signs `Tidemote.exe` in the Windows job.

## License

Tidemote is GPL-3.0-or-later, and not all of it is the owner's to relicense. The soundtrack's synthesis
(`src/audio/ugens.js`, parts of `src/audio/voices.js`) is translated from SuperCollider, GPL code by other
copyright holders. Valve says that copyleft code must not be combined with the proprietary Steamworks SDK
([Distributing Open Source Applications on Steam](https://partner.steamgames.com/doc/sdk/uploading/distributing_opensource)).
A GPL section 7 additional permission from the owner would cover only the owner's own code, not
SuperCollider's. So the SDK is kept out of the GPL program altogether, as in icculus's
[steamshim](https://github.com/icculus/steamshim):

- `desktop/steam-helper/` is a separate program, MIT licensed (its own `LICENSE`, copyright Tyler Hallada),
  holding no GPL code and requiring only Node's built-ins and steamworks.js (MIT). It alone loads
  steamworks.js's addon and Valve's `steam_api` library.
- The GPL app starts it as its own OS process and talks to it only in plain JSON messages over a pipe,
  through a narrow, generic protocol (achievements, status, the Workshop's file calls, the Deck, its
  keyboard; `desktop/steam-helper/README.md`). No code or data structures are shared, and nothing GPL is
  loaded into the helper's process. `test/steamhelper.test.js` checks the helper's imports, and the
  launch check checks (on Linux) that `steam_api` never loads in the app's process.
- The two ship side by side in one depot, an aggregate. The helper and steamworks.js sit unpacked in
  `resources/app.asar.unpacked/`, outside the GPL app's archive.

Caveats. The helper runs on the app's own executable (Electron's binary as plain Node, which is MIT and
BSD-licensed Electron, Node and Chromium, not GPL). That binary is the same file that runs the GPL app in
another process, but no GPL code runs in the helper's. The GPL FAQ on mere aggregation treats programs that
talk through pipes or sockets as separate unless they exchange intimate, complex internal data
structures, which is why the protocol stays narrow and generic. That is the reading this arrangement
relies on, and it is the arrangement steamshim was written for, but no court
or Valve has ruled on it here. GPL binaries must still come with their source: the public repository and
its tags provide it, the helper's included. Not legal advice.
