import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { catalogFor, SOURCE } from './tools/i18n/locale.mjs';
import { scanHtml, bakeHtml } from './tools/i18n/html.mjs';
import { mark } from './src/i18n.js';

const root = fileURLToPath(new URL('.', import.meta.url));

/** The page as one HTML file (a string): src bundled, its worklet and styles inlined; in `locale`'s words
 *  (locales/L.json; en-XA the pseudo-locale), each message marked with its id when `marked` (the text
 *  editor's page, tools/i18n/textlab.mjs). docs/i18n.md */
export async function buildPage({ locale = SOURCE, marked = false } = {}) {
  const { catalog } = catalogFor(locale);
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
    define: { __TIDEMOTE_MESSAGES__: JSON.stringify(catalog), __TIDEMOTE_LOCALE__: JSON.stringify(locale), __TIDEMOTE_I18N_MARK__: String(!!marked), __TIDEMOTE_WORKLET__: JSON.stringify(worklet.outputFiles[0].text), __TIDEMOTE_SHADERS__: JSON.stringify(shaders.digest('hex').slice(0, 16)) },
  });
  let template = await readFile(new URL('src/page.html', import.meta.url), 'utf8');
  // the page's own words in the locale (the source's are already there, unless marked)
  if (locale !== SOURCE || marked) {
    const items = scanHtml(template);
    template = bakeHtml(template, items, (id) => catalog[id], marked ? mark : undefined)
      .replace('<html lang="en">', `<html lang="${locale}">`);
  }
  const style = await readFile(new URL('src/page.css', import.meta.url), 'utf8');
  return template.replace('/*__STYLE__*/', () => style).replace('/*__SCRIPT__*/', () => result.outputFiles[0].text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // --locale L builds the page in locales/L.json's words to dist/tidemote.L.html; --mark marks every message
  const { values: opt } = parseArgs({ options: { locale: { type: 'string', default: process.env.TIDEMOTE_LOCALE || SOURCE }, mark: { type: 'boolean' }, out: { type: 'string' } } });
  const html = await buildPage({ locale: opt.locale, marked: !!opt.mark });
  await mkdir(new URL('dist/', import.meta.url), { recursive: true });
  const out = opt.out || (opt.locale === SOURCE && !opt.mark ? 'dist/tidemote.html' : `dist/tidemote.${opt.mark ? 'marked.' : ''}${opt.locale}.html`);
  await writeFile(new URL(out, import.meta.url), html);
  console.log(`wrote ${out} (${Buffer.byteLength(html).toLocaleString('en-US')} bytes)`);
}
