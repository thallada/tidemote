import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
// The soundtrack's AudioWorklet runs in its own global scope: bundle it on its own and
// inline it as a string, loaded at runtime from a Blob URL (works from file:// too).
const worklet = await build({
  absWorkingDir: root,
  entryPoints: ['src/audio/worklet.js'],
  bundle: true,
  write: false,
  minify: false,
  target: 'es2022',
  format: 'esm',
  charset: 'utf8',
});
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/main.js'],
  bundle: true,
  write: false,
  minify: false,
  target: 'es2022',
  format: 'iife',
  charset: 'utf8',
  define: { __TIDEMOTE_WORKLET__: JSON.stringify(worklet.outputFiles[0].text) },
});
const template = await readFile(new URL('src/page.html', import.meta.url), 'utf8');
const style = await readFile(new URL('src/page.css', import.meta.url), 'utf8');
const html = template.replace('/*__STYLE__*/', () => style).replace('/*__SCRIPT__*/', () => result.outputFiles[0].text);
await mkdir(new URL('dist/', import.meta.url), { recursive: true });
await writeFile(new URL('dist/tidemote.html', import.meta.url), html);
console.log(`wrote dist/tidemote.html (${Buffer.byteLength(html).toLocaleString('en-US')} bytes)`);
