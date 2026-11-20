# Tidemote Steam helper

MIT licensed (`LICENSE`), unlike the rest of Tidemote (GPL-3.0-or-later).

`helper.cjs` is a small program that runs as its own process and is the only part of the Tidemote desktop
app that loads [steamworks.js](https://github.com/ceifa/steamworks.js) (MIT) and, through it, Valve's
proprietary `steam_api` library. The GPL game (`desktop/main.js`, through the client in `desktop/steam.js`)
never loads either: it starts this helper and exchanges plain JSON messages with it over a pipe. The
helper holds no GPL code and requires nothing but Node's built-ins and `steamworks.js`
(`test/steamhelper.test.js` checks its imports). The arrangement follows icculus's
[steamshim](https://github.com/icculus/steamshim): a small non-GPL program alone links the Steamworks SDK
and talks to the GPL game over a pipe through a narrow, generic protocol. Unlike steamshim, the game starts
the helper rather than the other way around (see Steam and the helper's process below). Keep this
directory free of code copied from the rest of the repository.

## How it runs

`desktop/steam.js` starts it with `child_process.fork`: the app's own executable (`process.execPath`)
with `ELECTRON_RUN_AS_NODE=1`, so it runs as plain Node. No Chromium, Electron APIs or app code is
loaded. stdin is closed, stdout and stderr go to the app's (the Steam API prints to stdout), and the
messages travel on a separate IPC pipe that Node opens (`NODE_CHANNEL_FD`, `serialization: 'json'`: one
JSON object per line).

Why this and not Electron's `utilityProcess`: a forked process is an ordinary OS process, started the same
way on every OS, whose only link to the app is the pipe and its plain messages. A `utilityProcess` is a
Chromium child that Electron's service manager starts and supervises, with Electron's own message ports.
That works too, but it ties the helper to Electron's process model for no benefit. The helper needs only
Node, and it can be run and tested under plain `node` (the tests do). It works when packaged:
`scripts/package.mjs` unpacks `steam-helper/` and `steamworks.js` into `resources/app.asar.unpacked/`, so
the helper runs from real files beside the GPL app's archive, not inside it. It needs Electron's
`RunAsNode` fuse, which is on by default. If the fuses are ever hardened, switch to `utilityProcess`.

When the pipe closes because the app quit or crashed, the helper exits, so Steam does not see the game as
still running.

## Protocol (version 1)

Every message is a JSON object.

- Requests, from app to helper: `{ "id": N, "op": "NAME", "args": { ... } }`. `id` is a positive integer
  the app chooses.
- Responses: `{ "id": N, "ok": true, "value": ... }` or `{ "id": N, "ok": false, "error": "text" }`, one
  per request, possibly out of order (some calls wait on Steam).
- Events carry no `id`. Today there is one: `{ "event": "hello", "protocol": 1, "pid": N }` on start.

Workshop item ids are 64-bit, so they travel as decimal strings.

| op | args | value |
| --- | --- | --- |
| `init` | `appId?`, `restartAppId?` | `{ protocol, loaded, on, why?, restart?, appId?, cloud?, user? }`. `loaded`: steamworks.js loaded. `on`: Steam answered. `restart`: Steam is relaunching the game (`SteamAPI_RestartAppIfNecessary`), so the app should quit. |
| `status` | | `{ loaded, on, why?, appId?, cloud?, user? }`. `cloud`: Steam Cloud on for the account and the app. |
| `achieve` | `name` | whether the achievement is now unlocked (stats stored at once) |
| `deck` | | whether Steam runs on a Steam Deck |
| `keyboard` | `x`, `y`, `w`, `h` | whether Steam's floating gamepad keyboard showed, kept clear of that rect (window pixels) |
| `ugc.subscribed` | | `[itemId, ...]` |
| `ugc.installInfo` | `item` | `{ folder, timestamp, size }` or `null` |
| `ugc.download` | `item`, `high` | whether the download was queued |
| `ugc.downloadInfo` | `item` | `{ current, total }` (bytes) or `null` |
| `ugc.create` | | `{ item, needsToAcceptAgreement }` |
| `ugc.update` | `item`, `title?`, `description?`, `changeNote?`, `contentPath?`, `previewPath?`, `visibility?` | `{ item, needsToAcceptAgreement }` |
| `ugc.unsubscribe` | `item` | `null` |
| `quit` | | `null`, then the helper exits |

Calls other than `init`, `status`, `deck`, `keyboard` and `quit` fail with `Steam is not running` until
`init` succeeds. Paths are files the app has already written (a Workshop item's staged folder and its
preview). The helper reads nothing else of the app's.

## Steam and the helper's process

`SteamAPI_Init` runs in the helper, a child of the game's process. A game launched by Steam passes its
environment, which includes `SteamAppId`/`SteamGameId`, down to the helper. Outside Steam, the app passes
the app id (`TIDEMOTE_STEAM_APPID` for testing). docs/desktop.md, "Steam in a helper process", lists what
this changes and what has yet to be checked against a real app id and Steam client.
