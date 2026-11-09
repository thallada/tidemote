# Promo video

`tools/promo/` films a library of shots of the page, catalogues them, and edits them into the promo against its
soundtrack in a browser editor, which renders drafts and the 4K master. The code is here. The media and the edits
live outside the repository, under `PROMO_ROOT` (`/mnt/d/tidemote-promo` by default; `tools/promo/paths.mjs`):

| Path | What |
| --- | --- |
| `lib2/<world>/<shot>.mp4`, `.json` | the library: 4K masters (8K for the interface), each shot's log (meta, the world, every frame's camera and sim time, the tracked panels' rects, the sound's messages); `world.json` per world (climate, count, the build filmed) |
| `lib2/catalog.json`, `_proxy/` | the catalogue (`catalog.mjs`): 540p proxies, posters, filmstrips, QC |
| `lib2/_preview/`, `_renders/` | the editor's rendered preview segments, and drafts and masters |
| `track/` | the song: `track.wav`, its grid (`times.json`), its notes (`events.json`), its hits (`accent.json`) |
| `titles/*.png` | title cards, 3840×2160 with alpha |
| `edl/*.json`, `ratings.json` | the edits, and the library's stars and rejects |

The tools run under WSL: filming in Windows Chrome on the GPU (`tools/gpu-node.sh`), ffmpeg (NVENC, CUDA) in WSL.
The virtual camera needs a Python with numpy and OpenCV at `~/.venvs/promo` (`python3 -m venv ~/.venvs/promo &&
~/.venvs/promo/bin/pip install numpy opencv-python-headless`).

## Filming

`olab.mjs` films the built page frame-exactly: its clock is faked to move 1/60 s a frame, each frame waits on the
GPU and is screenshot (4K, or 7680×4320 for the interface so the edit can push in) and piped to ffmpeg. The
soundtrack's messages are logged on the same clock, so the master can play them under the track. A world is grown at
Max to `--mature` simulated seconds first. Shots carry `meta` (category, zoom, speed, move) for the catalogue.

| Script | Shots |
| --- | --- |
| `shoot.mjs` | one world, clean: macro pull-backs, the dive, close-ups at a ladder of zooms, deep holds, pans, push-ins and pull-outs, swimmers dancing on the beat (filmed at the speed that puts their strokes on 112 or 116 bpm), long exposures, the auto camera, time-lapses, a catastrophe through its stages, the pull-back to the whole (`--parts`) |
| `ui.mjs` | the interface at 8K: overview, loupe, the mind compass, the inspector's tabs, the species card, the Field Lab and Lineage, the maps, the bench's tools, riding, the speed ladder |
| `notes.mjs` | the live annotations over a still camera, paced for reading on film |
| `hand.mjs` | the glass rod: tap, swirl, plow, zigzag, figure eight |
| `pick.mjs` | a many-celled body picked and kept in frame |

`queue.sh` films the worlds in `queue.txt` one after another (those not done yet), stops when the disk falls under
25 GB, and catalogues each world as it finishes. It films `PROMO_HTML`, the build pinned for the library: a worktree
of main (`git worktree add ../tidemote-wt/promo2 main`), so every shot is of one build; `world.json` records each
world's commit and whether main has it.

```
setsid nohup tools/promo/queue.sh >> /mnt/d/tidemote-promo/lib2/queue.log 2>&1 &
tools/gpu-node.sh tools/promo/pick.mjs --out /mnt/d/tidemote-promo/lib2/p09 --mature 1500 --takes 2   # one world by hand
node tools/promo/catalog.mjs --only p09
```

`catalog.mjs` is incremental and leaves out worlds whose names begin with `_` (tests). Its QC reads each shot's log:
even sim steps, one frame a step, no jerk in the camera's path; a shot that fails is still usable up to its first fault
(`qc.cleanTo`).

## Editing

```
node tools/promo/editor/server.mjs [--port 8642]    # then http://localhost:8642
```

The editor (`editor/editor.html`, its arithmetic in `editor/edlcore.mjs`) shows the library (filter, rate 0-5 and
reject, scrub a shot's strip), a viewer, and the timeline over the song's waveform and hits. Cuts sit on the song's
16th-note grid (`at: "bar:step"`) and last until the next; each has a shot, an in-point, an optional virtual camera
(a reframe from box to box, or a push-in on a tracked panel of an interface shot, followed by a spring), fades and a
flash; a swimmer's cut can dance (start on a stroke). Ratings save as they are made; Save writes the EDL. The marks on
the cuts say whether each lands on a hit (`edlcore.onHit`) and the snap can be "strong hits". On a phone (or under
760 px) the layout stacks the viewer, the timeline and a Library/Cut tab, and the keys become buttons.

The viewer plays the rendered preview (`editor/preview.mjs`): every cut a 540p segment rendered as the master frames
it, named by what is in it (`edlcore.segKey`), so an edit renders again only the cuts it changed and the browser keeps
the rest; segments are appended to one video element through Media Source Extensions. The preview stays under about
5 Mbit/s so it plays across a slow link (the editor is used across the tailnet), and the viewer waits once for enough
to play through rather than stuttering. Cuts not rendered yet play live from their proxies. What the viewer meets
(each wait, why it began, the link's rate) is logged to `lib2/editor-client.log`.

Renders (the editor's buttons, or by hand):

- `draft.mjs EDL.json OUTDIR`: the preview's segments joined, the titles over them and the track under them; a minute or two.
- `master.mjs EDL.json OUTDIR`: every cut at 4K from its master (an intermediate kept per cut, so a re-render makes only
  what changed), graded and titled; the shots' sound messages placed on the edit's timeline and the track rendered over
  them; `tidemote-promo-4k.mp4` and `-1080p.mp4`. The track renders on the audio engine the soundtrack was approved on
  (`track/track.mjs --src`): a worktree at 35b2655 beside the main checkout (`git worktree add ../tidemote-wt/musicpin
  35b2655`, or `PROMO_MUSIC`).

`render.mjs` holds what the three renders share (a cut's filters, its virtual camera through `vcam.py`, the titles),
and `edlcore.vcamPath` computes the camera for the editor and the renders alike, so they frame the same.

## The song

`track/song.mjs` is the soundtrack ("lc_held"); `track/track.mjs --out DIR` renders it with the field mix under it,
writing `times.json` and `events.json`. `beats/accent.py` measures from the audio how hard each 16th step hits
(`accent.json`, what the editor's marks go by); `beats/retime.mjs` moves an EDL's cuts onto the hits (keeping its shots,
order and each section's number of cuts); `beats/check.mjs` joins the preview's segments and checks each cut against
the audio's attacks.

## Checks

Run with the server up, under `tools/gpu-node.sh` (Windows Chrome):

- `edcheck.mjs [--edl NAME] [--throttle MBPS] [--latency MS] [--passes 2]`: plays the whole program from a cold browser and
  counts black and stale frames and waits against what the master will show; `--live` without the rendered preview.
- `tlcheck.mjs`: every cut hovered and clicked on the timeline, a pinch zoom, moving a cut by the snap.
- `mobcheck.mjs [--w 412 --h 915]`: the phone layout with touch: a cut tapped, its start moved, a card's "→ cut", a pinch.
