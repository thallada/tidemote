// Where the promo's media and edits live: outside the repository, on a disk with room (4K and 8K masters run to a
// gigabyte a shot). PROMO_ROOT moves it.
//   ROOT/lib2/<world>/<shot>.mp4|.json   the filmed library (olab.mjs), catalog.json, _proxy, _preview, _renders
//   ROOT/track/                          the song: track.wav, times.json (its grid), events.json, accent.json
//   ROOT/titles/*.png                    title cards (3840x2160, alpha)
//   ROOT/edl/*.json, ROOT/ratings.json   the editor's edits and the library's stars
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = process.env.PROMO_ROOT || '/mnt/d/tidemote-promo';
export const LIB = ROOT + '/lib2', TRACK = ROOT + '/track', TITLES = ROOT + '/titles', EDLS = ROOT + '/edl', RATINGS = ROOT + '/ratings.json';
export const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.resolve(HERE, '../..');
// the soundtrack is rendered on the audio engine it was approved on: a worktree at that commit (docs/promo.md)
// (beside the main checkout in tidemote-wt/, or beside this worktree there)
export const MUSIC = process.env.PROMO_MUSIC || [path.resolve(REPO, '../tidemote-wt/musicpin'), path.resolve(REPO, '../musicpin')].find((d) => fs.existsSync(d));
export const PY = process.env.HOME + '/.venvs/promo/bin/python';

export const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
export const times = () => readJson(TRACK + '/times.json');
export const catalog = () => new Map(readJson(LIB + '/catalog.json').clips.map((c) => [c.id, c]));
export { cliArgs } from '../pagelab.mjs';
