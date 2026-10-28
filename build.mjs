import { build } from 'esbuild';
import { createHash } from 'node:crypto';
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
// what the page's WGSL is made from: when it changes, the page clears Chrome's shader cache once (main.js)
const shaders = createHash('sha256');
for (const f of ['src/shaders.js', 'src/engine.js']) shaders.update(await readFile(new URL(f, import.meta.url)));
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/main.js'],
  bundle: true,
  write: false,
  minify: false,
  target: 'es2022',
  format: 'iife',
  charset: 'utf8',
  define: { __TIDEMOTE_WORKLET__: JSON.stringify(worklet.outputFiles[0].text), __TIDEMOTE_SHADERS__: JSON.stringify(shaders.digest('hex').slice(0, 16)) },
});
const template = await readFile(new URL('src/page.html', import.meta.url), 'utf8');
const style = await readFile(new URL('src/page.css', import.meta.url), 'utf8');
const html = template.replace('/*__STYLE__*/', () => style).replace('/*__SCRIPT__*/', () => result.outputFiles[0].text);
await mkdir(new URL('dist/', import.meta.url), { recursive: true });
await writeFile(new URL('dist/tidemote.html', import.meta.url), html);
console.log(`wrote dist/tidemote.html (${Buffer.byteLength(html).toLocaleString('en-US')} bytes)`);
