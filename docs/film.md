# Film

Film (R, the dock's camera button, Settings → Film) records what the view shows as a video, the auto
camera's captions burned in and the soundtrack with it, until the viewer stops it (R again, or Stop
on the strip). It starts at once, the auto camera on or off.

## How a film is made

`src/film.js`. At most 30 times a second (`requestFrame` on a `captureStream(0)`: no copy the stream
would drop) the world's canvas and the overlay of marks are drawn onto a canvas of the film's own, with
the caption and a small title in a corner. The film's size is the view's at its full density, at most
1920×1080 (`source` in `src/main.js`), not the canvas's, which the render scale may have shrunk; and
while it rolls the page's adaptive quality keeps the canvas at least that size (`filmScale`, `filmRaise`
in `src/main.js`), giving up frame rate first. That canvas is recorded by `MediaRecorder`: H.264 in MP4
where the browser offers it (AAC where it has it, else Opus), else VP9 in WebM (Firefox), asked for 0.3
bits a pixel a frame at 30 fps (`filmBitrate`; 1080p: 18.7 Mb/s, at most 24). See Quality below. The
browser encodes as it goes and hands over what it has encoded each second (`start(1000)`), so nothing
is left to encode when the film stops: what remains is to finish the file.

Where those seconds go (a sink), the first that works:

| sink | where | limit (`filmLimit`) |
|---|---|---|
| `desktop` | the desktop app: `Videos/Tidemote/NAME.part`, renamed when it closes (`window.tidemoteDesktop.film`, docs/desktop.md) | half the free disk, at most 8 GB |
| `disk` | the browser's private files (OPFS, `createWritable`), downloaded when the film ends; the copy goes at the next film or ten minutes later | half the origin's free quota, at most 8 GB |
| `memory` | the recorder's chunks kept as Blobs until it ends | 1 GB; 300 MB on a phone or a machine with 4 GB or less |

The film stops itself when it is two seconds' writing from its limit (and says so); the strip warns
five minutes before, in red the last minute.

### Why not keep it in memory

Kept in memory, a film is the browser's to hold. Chrome keeps Blobs in the browser process up to 2 GiB
on 64-bit desktops (`CalculateBlobStorageLimitsImpl`, `storage/browser/blob/blob_memory_controller.cc`),
then pages them to disk, up to a tenth of the disk; in a private window it has no disk, so 2 GiB is the
end. On Android it pages past 1% of RAM. Firefox moves a recorder's blob to a file past 1 MB
(`media.recorder.max_memory`, Mozilla bugs 1304910 and 1511006), but a one-second chunk is smaller than
that, so the chunks would stay in memory (not measured here).
iOS kills a tab long before any of that. And everything is lost if the tab or the browser goes.

Measured with `tools/film-check.mjs` (symphony, RTX 2080 Super, 4 cores, headless Chrome 153 on the
GPU through Vulkan, 16k particles, 2026-11-02; `runs/film/`). First the old recorder's VP9 at 0.12 bits a
pixel, then the H.264 MP4 at 0.3 it has now (`runs/film/after2`):

| window | film | codec, asked | written | kept | sink | the browser's memory as it filmed |
|---|---|---|---|---|---|---|
| phone 390×844 at 3× | 500×1080 | VP9 1.9 Mb/s | 16.4 MB/min | 30/s | disk | +65 → +110 MB over 5 min, not climbing |
| laptop 1440×900 | 1440×900 | VP9 4.7 Mb/s | 30–36 MB/min | 25/s | disk | flat |
| laptop 1440×900 | 1440×900 | VP9 4.7 Mb/s | 30 MB/min | 25/s | memory | +155 → +220–260 MB over 5 min (148 MB filmed) |
| 4K 1920×1080 at 2× | 1920×1080 | VP9 7.5 Mb/s | 36.7 MB/min | 18.6/s | disk | +95 MB, flat for 20 min (738 MB filmed) |
| phone 390×844 at 3× | 500×1080 | H.264 4.9 Mb/s | 16.1 MB/min | 27/s | disk | +26 MB |
| laptop 1440×900 | 1440×900 | H.264 11.7 Mb/s | 42.9 MB/min | 30/s | disk | +62 MB, flat over 5 min |
| laptop 1440×900 | 1440×900 | H.264 11.7 Mb/s | 42.1 MB/min | 30/s | memory | climbing with the film |
| 4K 1920×1080 at 2× | 1920×1080 | H.264 18.7 Mb/s | 64–69 MB/min | 30/s | disk | flat |

Software encoders write less than they are asked: here VP9 about two thirds, H.264 (OpenH264) about
half. A hardware encoder (Chrome on Windows and macOS, Safari) comes nearer: at 18.7 Mb/s a 1080p film
is about 140 MB a minute, 8.4 GB an hour, so the 8 GB limit is about an hour; at what this machine
writes, two. The phone's portrait film is a quarter of that. Kept on disk, the browser's memory stays
where it was however long the film runs; kept in memory it climbs with the film. (The old build's
in-memory recorder, filming 4K, died at 6 minutes and 208 MB in a 900 MB cgroup it shared with another
run; not a clean measure, but where that goes.)

## Quality

`tools/film-quality.mjs` measures it: the film canvas carries each frame's number as a barcode in a
corner and keeps every 30th frame as a lossless PNG (`__FILM_PROBE`, a tool's only); the film is decoded,
those frames found by their barcode and compared with their originals (SSIM and PSNR of luma). Variants
run in alternating rounds with the auto camera moving, so each meets the world at several moments;
differences of 0.005 in SSIM between rounds are the scenes, not the settings.

What made films look bad, in order:

1. **Their size.** The film took the canvas's size when it began, and the page's adaptive quality had
   often lowered the render scale (filming itself makes frames late: the encoder takes CPU, which fewer
   pixels can't give back). Films came out 960×540 or 1344×756 and were stretched up; SSIM against the
   film's own canvas cannot see it. Now the film is sized from the view and the canvas kept up to it.
2. **VP9 in software.** At 1080p on four cores it kept 18–20 of 30 frames a second and took the page to
   17–22 fps; more bitrate barely helped (asked 7.5 Mb/s: SSIM 0.943, 16 Mb/s: 0.946, both starved).
   H.264 (software here too) kept all 30 with the page at 50–60 fps.
3. **Bitrate.** The world is fine rims, thin bodies and the look's grain (random each frame, so the
   costliest thing to keep: at the same rate the look off gained 3 dB PSNR). Four H.264 recorders on
   the same frames at once (all starved, so all low) gave, asked: 8 Mb/s 28.3 dB, 16 Mb/s 30.6, 30 Mb/s
   32.9, 50 Mb/s 34.4; the gain shrinks past about 30 asked, 15 written.

The old film against the new, at 1080p, the canvas kept up for both (`runs/film/q5`, 3 rounds of 30 s):

| | written | kept | page | SSIM | PSNR |
|---|---|---|---|---|---|
| VP9, 0.12 bits a pixel (7.5 Mb/s asked) | 5.1 Mb/s, 38 MB/min | 18.8/s | 19.5 fps | 0.923 | 34.5 dB |
| H.264 MP4, 0.3 (18.7 Mb/s asked) | 9.2 Mb/s, 69 MB/min | 30/s | 60 fps | 0.958 | 39.0 dB |

A keyframe a second (`videoKeyFrameIntervalDuration`): Chrome's MP4 comes a fragment per keyframe, every
100 frames (3.4 s) by itself, so the strip's size stepped every 3.4 s; at one a second it counts each
second, and a seek lands within one. It cost nothing measurable (`runs/film/q6`, 3 rounds: SSIM 0.963
by itself, 0.961 at 1 s, 0.960 at 2 s, the same size).

`runs/film/q5/cmp.png` shows a crop of each beside its original. Chrome's MP4 is fragmented, with a
duration ffprobe reads and fragments a player seeks by (a seek to 90% of five minutes read 5 MB), so
it needs no mending; `src/webm.js` mends the WebM that Firefox makes.

## The file

MediaRecorder writes WebM live: a segment of unknown size, clusters of unknown size, no duration and
no Cues. Players then show no length (ffprobe: `duration=N/A`) and seek by reading the file up to the
time asked. `src/webm.js` (`createWebmFix`, tested in `test/webm.test.js`) mends it as it streams:

- the head (EBML header to the first cluster) is rewritten once: a SeekHead pointing at Info, Tracks
  and (when it ends) Cues, and Info with room for a Duration. The room is Void until the end, so a film
  cut off partway is still a live WebM that plays.
- every later byte passes as it came, while it is read for clusters, their timecodes and the video's
  keyframes (one cue per keyframe, at most two a second; Chrome makes a keyframe and a cluster about
  every 3.5 s).

Before, the 20-minute film above would have had no duration and a seek to 90% read 90% of it; now
ffprobe gives 1207.8 s and the seek reads 3.2 MB of 738 (a one-minute film: 35 MB read before, 3.3 MB
now).
- `end()`: Cues to write after the last byte, and the Duration and the Cues' Seek to write over the
  head (positional writes on disk; the head's bytes in memory). The segment keeps its unknown size:
  its clusters have unknown sizes, which a sized segment may not hold (ffmpeg warns).

MP4 (Chrome, Safari) is written as the recorder gives it.

## The strip

While it rolls, the strip under the rail (first of `.floats`) shows a blinking red square, RECORDING,
the time filmed, the size written so far (the file's size exactly, once saved) and Stop; its hint says
where the film is going and when it will stop itself. Between Stop and the download it reads SAVING. A hairline red frame with heavier
corners rings the world between the side panels. Neither is in the film: it records the canvases only.

The rail itself has no room for it: at 1366 px the strip there squeezed the era's name and the gauges,
and on a phone the rail overflowed (430 px in 390) onto the clock (`runs/film/ui`).

## Checking it

`TIDEMOTE_VK=1 tools/capped.sh -m 900M node tools/film-check.mjs --size laptop|phone|4k --minutes N --out runs/film/NAME`
films the built page headless (`--opts '{"mime":...,"bps":...}'` another format or rate) and prints, every ten seconds, the bytes written, the size the strip
shows, the browser's memory (PSS of its processes) and what it put on disk; then probes the film with
ffprobe (duration, frames a second) and times a seek to 90% (and how many bytes ffmpeg read for it).
`--memory` takes the private files away (the memory sink), `--cap BYTES` lowers the limit to see it
stop itself, `--page FILE` films an older build. `tools/ui-check.mjs` checks R, the strip, the frame
and the strip's Stop at laptop and phone sizes. `tools/film-quality.mjs` (Quality above) scores how a film
looks against its originals; check a change to the format, the bitrate or how frames reach the film with it.
