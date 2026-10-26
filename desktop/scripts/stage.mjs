// Builds the page (../build.mjs) and stages it as page/index.html, the file the desktop shell serves.
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
execFileSync(process.execPath, ['build.mjs'], { cwd: repo, stdio: 'inherit' });
await mkdir(new URL('../page/', import.meta.url), { recursive: true });
await copyFile(new URL('../../dist/tidemote.html', import.meta.url), new URL('../page/index.html', import.meta.url));
