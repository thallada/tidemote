// Packages the desktop shell into out/Tidemote-PLATFORM-ARCH/, an unpacked app directory, which is
// what a Steam depot holds (Steam installs and updates it; no installer).
//   node scripts/package.mjs [--platform win32|linux|darwin] [--arch x64|arm64]
import { packager } from '@electron/packager';
import { fileURLToPath } from 'node:url';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const paths = await packager({
  dir: fileURLToPath(new URL('..', import.meta.url)),
  out: fileURLToPath(new URL('../out', import.meta.url)),
  name: 'Tidemote',
  executableName: 'Tidemote',
  platform: arg('platform', process.platform),
  arch: arg('arch', process.arch),
  overwrite: true,
  // steamworks.js's native addon and the Steam API library load from real files, not the archive
  asar: { unpack: '**/node_modules/steamworks.js/dist/**' },
  ignore: [/^\/out($|\/)/, /^\/scripts($|\/)/, /^\/\.gitignore$/],
  appCopyright: 'Copyright Tyler Hallada. GPL-3.0-or-later.',
  win32metadata: { CompanyName: 'Tyler Hallada', ProductName: 'Tidemote', FileDescription: 'Tidemote' },
});
console.log(paths.join('\n'));
