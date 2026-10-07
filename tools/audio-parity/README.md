# Audio parity

The page's soundtrack (`src/audio/`) is a sample-level port of a SuperCollider 3.13 score: the
UGens in `ugens.js` follow scsynth's block structure (64-sample blocks, control-rate ramps,
biquad slope ramping, EnvGen and Decay2 start-up behaviour), and `voices.js` translates each
SynthDef in `voices.scd` line for line. These scripts render the same events in both and compare.

Requires SuperCollider 3.13 (`sclang`, run headless with `QT_QPA_PLATFORM=offscreen`), Python
with numpy and soundfile, and ffmpeg for loudness.

```sh
cd tools/audio-parity
python3 voice_tests.py                                  # writes voices.json, .meta.json, .segs.json
python3 make_scd.py voices.json sc.wav --nonoise --dry && sclang sc.scd   # make_scd also writes sc.scd
node js_render.mjs voices.json js.wav --nonoise --dry
python3 compare.py sc.wav js.wav voices.segs.json       # error relative to signal, per note
python3 noise_tests.py                                  # noise voices: compare_stats.py (LUFS, third-octave bands)
node js_score.mjs score.json piece.wav                  # a whole SC score dump through the JS engine
python3 compare_piece.py sc_piece.wav piece.wav         # loudness per minute, band balance
```

sclang refuses to start as root inside a container unless Qt WebEngine's sandbox is off:
`QTWEBENGINE_DISABLE_SANDBOX=1 QT_QPA_PLATFORM=offscreen sclang sc.scd`.

Results when the port was made: deterministic voices match to between −85 and −145 dB of
error (the float noise floor), the full chain (ping-pong delay, FDN reverb, master) to −71 dB,
and noise voices sit within the spread between two JS seeds. A 20 minute SC score rendered
through the JS engine lands within 0.2 LU per minute and ±0.75 dB per third-octave band.

The felt piano, strings, vibraphone, swarm (with a `Formlet` port) and wave voices added later were checked the same way:
piano and vibraphone match to −120 dB or better; strings to −57 dB, because the JS `Saw`
computes its band-limited pulse with exact sines where scsynth interpolates sine and cosecant
tables (0.14% of the signal); the noise-driven swarm, waves and the sea and drone fades sit within
the spread between two JS seeds. The plucked string (a port of `Pluck`, the Karplus-Strong UGen)
matches to between −102 and −143 dB.

