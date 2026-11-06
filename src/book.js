// A Natural History (Lab → Log → Book): the chronicler's stories of this world as a book to keep, one self-contained
// HTML file. A title page with the world's span and its eras; a chapter for each era in which the chronicler spoke,
// each story under the moment it was told, the species it tells of drawn in the margin as their sigils; then an index
// of every species the book names, with what it was and what became of it. Pure: the page hands it the chronicle,
// the registry, the eras and a sigil function, and saves what comes back (src/main.js, saveFile).
import { esc, fmtClock, fmtDur } from './fmt.js';

const css = (col) => `#${[col & 255, (col >>> 8) & 255, (col >>> 16) & 255].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
// the species a story's markup links to (spLink: data-serial="N"), in order, once each
export const serialsIn = (html) => [...new Set([...String(html).matchAll(/data-serial="(\d+)"/g)].map((m) => +m[1]))];

/**
 * chronicleBook({ title, chronicle, reg, eras, now, sigil, words }) -> html
 *   chronicle: the page's log, newest first ([{ t, html, text, col, type }]; only the chronicler's, type 'story', are
 *   told); reg: serial -> species record; eras: [{ t, name }] in order; now: the world's time; sigil(sp) -> svg markup;
 *   words(sp) -> a few words on what it is ("photosynth · drifter · single cells").
 */
export function chronicleBook({ title = 'A Natural History of the Pool', world = '', chronicle = [], reg = new Map(), eras = [], now = 0, sigil = () => '', words = () => '' }) {
  const stories = chronicle.filter((e) => e.type === 'story').slice().reverse();
  const named = new Map();
  const nameOf = (serial) => reg.get(serial)?.name;
  // a story's links become the species' names in their own colors (the book is read away from the world)
  const body = (html) => String(html).replace(/<a [^>]*data-serial="(\d+)"[^>]*>(.*?)<\/a>/g, (_, s, name) => {
    const sp = reg.get(+s);
    if (sp) named.set(+s, sp);
    return `<span class="sp" style="--c:${sp ? css(sp.genome.col) : '#888'}">${name}</span>`;
  });
  const eraAt = (t) => { let e = null; for (const x of eras) if (x.t <= t) e = x; return e; };
  const chapters = [];
  for (const s of stories) {
    const e = eraAt(s.t), key = e ? `${e.t}` : 'first';
    if (!chapters.length || chapters.at(-1).key !== key) chapters.push({ key, era: e, stories: [] });
    chapters.at(-1).stories.push(s);
  }
  const margin = (s) => serialsIn(s.html).slice(0, 3).map((n) => reg.get(n)).filter(Boolean)
    .map((sp) => `<figure title="${esc(sp.name)}">${sigil(sp)}</figure>`).join('');
  const roman = (n) => { let r = '', x = n; for (const [v, l] of [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (x >= v) { r += l; x -= v; } return r; };
  const chapterHtml = chapters.map((c, i) => `<section class="chapter">
  <h2><small>Chapter ${roman(i + 1)}</small>${c.era ? esc(c.era.name) : 'The First Tides'}</h2>
  ${c.stories.map((s) => `<article><time>${fmtClock(s.t)}</time><div class="m">${margin(s)}</div><p>${body(s.html)}</p></article>`).join('\n  ')}
</section>`).join('\n');
  const index = [...named.values()].sort((a, b) => a.name.localeCompare(b.name)).map((sp) => {
    const fate = sp.alive ? `living, ${(sp.pop ?? 0).toLocaleString('en-US')} cells` : sp.extinct != null ? `extinct at ${fmtClock(sp.extinct)}, after ${fmtDur(sp.extinct - (sp.born || 0))}` : 'lost to the record';
    const host = sp.symbiont && nameOf(sp.symbiont);
    return `<li><figure>${sigil(sp)}</figure><div><b style="--c:${css(sp.genome.col)}">${esc(sp.name)}</b><span>${esc(words(sp))}</span><span>arose ${fmtClock(sp.born || 0)}${sp.given ? ' · named by the viewer' : ''}${host ? ` · born of a union with ${esc(host)}` : ''} · ${fate}</span></div></li>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root { --paper: #f4efe4; --ink: #2a2622; --ink2: #6b6258; --rule: #cfc5b4; }
@media (prefers-color-scheme: dark) { :root { --paper: #16140f; --ink: #e8e0d0; --ink2: #9c9284; --rule: #3a342b; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 18px/1.65 Georgia, 'Iowan Old Style', 'Palatino Linotype', serif; }
main { max-width: 42rem; margin: 0 auto; padding: 4rem 1.25rem 6rem; }
.title { text-align: center; min-height: 70vh; display: flex; flex-direction: column; justify-content: center; border-bottom: 1px solid var(--rule); margin-bottom: 3rem; }
.title h1 { font-weight: normal; font-size: 2.4rem; line-height: 1.15; margin: 0 0 1rem; letter-spacing: 0.01em; }
.title p { color: var(--ink2); font-style: italic; margin: 0.25rem 0; }
.title ol { list-style: none; padding: 0; margin: 2rem 0 0; color: var(--ink2); font-size: 0.85rem; }
h2 { font-weight: normal; font-size: 1.6rem; margin: 3.5rem 0 1.5rem; text-align: center; }
h2 small { display: block; font-size: 0.75rem; letter-spacing: 0.25em; text-transform: uppercase; color: var(--ink2); margin-bottom: 0.4rem; }
article { display: grid; grid-template-columns: 4.2rem 1fr; gap: 0 1rem; margin: 0 0 1.6rem; }
article time { grid-column: 1; font-size: 0.75rem; color: var(--ink2); padding-top: 0.35rem; font-variant-numeric: tabular-nums; }
article .m { grid-column: 1; grid-row: 2; display: flex; flex-wrap: wrap; gap: 0.2rem; }
article p { grid-column: 2; grid-row: 1 / span 2; margin: 0; text-align: justify; hyphens: auto; }
article p::first-letter { font-size: 1.1em; }
figure { margin: 0; width: 1.9rem; height: 1.9rem; }
figure svg { width: 100%; height: 100%; }
.sp { font-variant: small-caps; letter-spacing: 0.02em; border-bottom: 2px solid var(--c); }
.index { margin-top: 4rem; border-top: 1px solid var(--rule); padding-top: 1rem; }
.index ul { list-style: none; padding: 0; columns: 2 18rem; column-gap: 2rem; }
.index li { display: flex; gap: 0.6rem; break-inside: avoid; margin-bottom: 0.9rem; font-size: 0.82rem; line-height: 1.4; }
.index b { display: block; font-weight: normal; font-variant: small-caps; font-size: 1rem; border-bottom: 2px solid var(--c); width: fit-content; }
.index span { display: block; color: var(--ink2); }
.end { text-align: center; color: var(--ink2); margin-top: 3rem; font-style: italic; }
@media (max-width: 30rem) { body { font-size: 16px; } article { grid-template-columns: 1fr; } article time, article .m, article p { grid-column: 1; grid-row: auto; } article .m { margin: 0.2rem 0; } }
@media print { body { background: #fff; color: #000; } .title { min-height: auto; padding: 30vh 0; page-break-after: always; } .chapter { page-break-before: always; } }
</style></head><body><main>
<header class="title"><h1>${esc(title)}</h1>${world ? `<p>${esc(world)}</p>` : ''}<p>as told by the chronicler, over ${fmtDur(now)} of its life</p>
${eras.length ? `<ol>${eras.map((e) => `<li>${fmtClock(e.t)} · ${esc(e.name)}</li>`).join('')}</ol>` : ''}</header>
${stories.length ? chapterHtml : '<p class="end">The chronicler has not yet spoken: it tells only of what is notable, a few times an hour at most.</p>'}
${named.size ? `<section class="index"><h2><small>Index</small>The Species</h2><ul>${index}</ul></section>` : ''}
<p class="end">Written in Tidemote. The world goes on.</p>
</main></body></html>`;
}
