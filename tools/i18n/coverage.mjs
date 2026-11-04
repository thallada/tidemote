#!/usr/bin/env node
// What a pseudo-locale tour (node build.mjs --locale en-XA, then tools/i18n/tour.mjs --page dist/tidemote.en-XA.html)
// showed that is not pseudo: words in plain letters that no message reached. Names (translate="no"), numbers,
// units and symbols are not words. Also lists the messages whose pseudo text was cut short (an overflow).
//   node tools/i18n/coverage.mjs runs/i18n/XA
import fs from 'node:fs'; import path from 'node:path';
const dir = process.argv[2];
const { states } = JSON.parse(fs.readFileSync(path.join(dir, 'texts.json'), 'utf8'));
const NOT_WORDS = /^(Tidemote|GPU|WebGPU|fps|ms|px|res|µm|mm|MB|GB|kB|PNG|WAV|QR|GPL-3\.0|SuperCollider|α|β|γ|[A-Z]|×\d+|Esc|⇧)$/;
const vocab = new Set();
for (const m of Object.values(JSON.parse(fs.readFileSync(new URL('../../locales/en.json', import.meta.url), 'utf8')))) for (const w of m.match(/[A-Za-z][A-Za-z'’-]+/g) || []) vocab.add(w.toLowerCase());
const plain = new Map();
for (const [st, rows] of Object.entries(states)) {
  for (const r of rows) {
    if (r.name) continue;
    // take out what pseudo text there is, and names drawn in species links
    const rest = r.s.replace(/⟦[^⟧]*⟧?/g, ' ').replace(/~+/g, ' ');
    // (a word no message holds is a name: species and genera are made up)
    const words = (rest.match(/[A-Za-z][A-Za-z'’-]+/g) || []).filter((w) => !NOT_WORDS.test(w) && vocab.has(w.toLowerCase()));
    if (!words.length) continue;
    const k = `${r.attr ? `[${r.attr}] ` : ''}${r.s.slice(0, 120)}`;
    if (!plain.has(k)) plain.set(k, { states: new Set(), el: r.el, words });
    plain.get(k).states.add(st);
  }
}
for (const [k, v] of plain) console.log(`${k}\n    at ${v.el} (${[...v.states].slice(0, 3).join(', ')}${v.states.size > 3 ? '…' : ''})`);
console.log(`\n${plain.size} strings shown in plain English`);
process.exit(plain.size ? 1 : 0);
