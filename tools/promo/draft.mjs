// A draft of an EDL in a minute or two: the editor's rendered preview segments (editor/preview.mjs, made here if the
// editor hasn't made them yet) joined, the titles over them, the track under them: what the editor plays, as one file.
//   node tools/promo/draft.mjs EDL.json OUTDIR
import fs from 'node:fs'; import path from 'node:path';
import { makePreview, plan } from './editor/preview.mjs';
import { ffmpeg, overlays } from './render.mjs';
import { TRACK, readJson, times } from './paths.mjs';

const [edlF, OUT] = process.argv.slice(2);
const edl = readJson(edlF), preview = makePreview();
fs.mkdirSync(OUT, { recursive: true });
for (let v = preview.request(edl); v.state === 'segments'; v = preview.status()) { console.log(`segments ${v.done}/${v.total}`); await new Promise((r) => setTimeout(r, 2000)); }
const st = preview.status(); if (st.state !== 'ready') { console.log(st.errors.join('\n')); process.exit(1); }
fs.writeFileSync(path.join(OUT, 'list.txt'), plan(edl).map((s) => `file '${s.file}'`).join('\n'));
await ffmpeg(['-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'list.txt'), '-c', 'copy', path.join(OUT, 'cut.mp4')]);
const o = overlays(edl, times(), 960, 540, { grade: false }); // (the segments are graded)
await ffmpeg(['-i', path.join(OUT, 'cut.mp4'), ...o.inputs, '-i', TRACK + '/track.wav', ...o.map, '-map', `${1 + (edl.titles || []).length}:a`, '-t', o.end.toFixed(3),
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', path.join(OUT, 'draft.mp4')]);
console.log('wrote', path.join(OUT, 'draft.mp4'));
