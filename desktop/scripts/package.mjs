// Packages the desktop shell into out/Tidemote-PLATFORM-ARCH/, an unpacked app directory, which is
// what a Steam depot holds (Steam installs and updates it; no installer).
//   node scripts/package.mjs [--platform win32|linux|darwin] [--arch x64|arm64|universal]
//                            [--app-version 1.2.3] [--build-version 1.2.3.45]
// The release workflow (.github/workflows/desktop.yml, docs/release.md) passes the versions from the git
// tag; without them the app takes package.json's.
import { packager } from '@electron/packager';
import { fileURLToPath } from 'node:url';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const platform = arg('platform', process.platform);
// steamworks.js ships its addon and Steam API library for every OS; each build keeps only its own
// (Windows' DLLs have no place in a Mac bundle, where every Mach-O file must be signed).
const steamDir = { win32: 'win64', linux: 'linux64', darwin: 'osx' }[platform];
const otherSteam = new RegExp(`^/node_modules/steamworks\\.js/dist/(?!${steamDir}(/|$))`);
const paths = await packager({
  dir: fileURLToPath(new URL('..', import.meta.url)),
  out: fileURLToPath(new URL('../out', import.meta.url)),
  name: 'Tidemote',
  executableName: 'Tidemote',
  platform,
  arch: arg('arch', process.arch),
  appVersion: arg('app-version'),
  buildVersion: arg('build-version'),
  appBundleId: 'io.github.thallada.tidemote',
  appCategoryType: 'public.app-category.simulation-games',
  overwrite: true,
  // steamworks.js's native addon and the Steam API library load from real files, not the archive
  asar: { unpack: '**/node_modules/steamworks.js/dist/**' },
  ignore: [/^\/out($|\/)/, /^\/scripts($|\/)/, /^\/\.gitignore$/, otherSteam],
  appCopyright: 'Copyright Tyler Hallada. GPL-3.0-or-later.',
  // a universal Mac app merges an x64 and an arm64 build; steamworks.js's addons for both arches and its
  // already-universal dylib are the same files in each, which the merge must keep rather than lipo
  osxUniversal: { x64ArchFiles: '**/node_modules/steamworks.js/dist/osx/**' },
  win32metadata: { CompanyName: 'Tyler Hallada', ProductName: 'Tidemote', FileDescription: 'Tidemote' },
});
console.log(paths.join('\n'));
