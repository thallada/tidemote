// Writes the SteamPipe app build script that steamcmd's run_app_build uploads (docs/release.md): one depot
// per OS, each the unpacked build in a folder of the content root, set live on a branch when it is done.
//   node desktop/scripts/steam-build.mjs --app 1234560 --depots '{"windows":1234561,"mac":1234562,"linux":1234563}' \
//     --content /abs/content --output /abs/output --branch dev --desc 'v0.2.0 abc1234' > app_build.vdf
// A depot whose folder is missing from the content root is left out of the build (Steam keeps the one it
// has). Valve does not let a build script set the default branch live: that is done by hand in Steamworks.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"`;

/** The app build script as VDF text. depots: { folder: depotId }, in the order they are listed. */
export function appBuildVdf({ app, depots, content, output, branch = '', desc = '', preview = false }) {
  if (!/^\d+$/.test(String(app))) throw new Error(`app id ${app} is not a number`);
  if (branch === 'default' || branch === 'public') throw new Error('Steam does not let a build set the default branch live');
  const entries = Object.entries(depots);
  if (!entries.length) throw new Error('no depots');
  const lines = ['"AppBuild"', '{', `\t"AppID" ${q(app)}`, `\t"Desc" ${q(desc)}`, `\t"ContentRoot" ${q(content)}`,
    `\t"BuildOutput" ${q(output)}`, `\t"SetLive" ${q(branch)}`, `\t"Preview" ${q(preview ? 1 : 0)}`, '\t"Depots"', '\t{'];
  for (const [folder, id] of entries) {
    if (!/^\d+$/.test(String(id))) throw new Error(`depot id ${id} for ${folder} is not a number`);
    if (!/^[\w.-]+$/.test(folder)) throw new Error(`depot folder ${folder}`);
    lines.push(`\t\t${q(id)}`, '\t\t{', '\t\t\t"FileMapping"', '\t\t\t{',
      `\t\t\t\t"LocalPath" ${q(`${folder}/*`)}`, '\t\t\t\t"DepotPath" "."', '\t\t\t\t"Recursive" "1"', '\t\t\t}',
      // the Mac bundle's metadata files Finder leaves are never shipped
      '\t\t\t"FileExclusion" "*.DS_Store"', '\t\t}');
  }
  lines.push('\t}', '}', '');
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : fallback;
  };
  const content = arg('content');
  const depots = Object.fromEntries(Object.entries(JSON.parse(arg('depots', '{}')))
    .filter(([folder, id]) => id && existsSync(join(content, folder))));
  process.stdout.write(appBuildVdf({
    app: arg('app'), depots, content, output: arg('output'),
    branch: arg('branch', ''), desc: arg('desc', ''), preview: process.argv.includes('--preview'),
  }));
}
