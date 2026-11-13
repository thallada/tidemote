// Renders the app icon (icon/icon.svg) into the files the packager and the window use, all committed:
// icon.png (512, Linux's window), icon.ico (Windows' executable and window) and icon.icns (macOS).
//   node scripts/icon.mjs
// Each size is rendered from the SVG itself, not scaled from a large one, so the small ones stay sharp.
// ICO and ICNS both hold PNGs here (Windows since Vista, macOS since 10.7).
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../icon/', import.meta.url);
const svg = readFileSync(new URL('icon.svg', dir));
const png = (size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

writeFileSync(new URL('icon.png', dir), png(512));

// ICO: a 6-byte header, a 16-byte entry per image (256 written as 0), then the images
const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const icoImages = icoSizes.map(png);
const head = Buffer.alloc(6 + 16 * icoSizes.length);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(icoSizes.length, 4);
let offset = head.length;
icoSizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s % 256, e);
  head.writeUInt8(s % 256, e + 1);
  head.writeUInt16LE(1, e + 4); // planes
  head.writeUInt16LE(32, e + 6); // bits per pixel
  head.writeUInt32LE(icoImages[i].length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += icoImages[i].length;
});
writeFileSync(new URL('icon.ico', dir), Buffer.concat([head, ...icoImages]));

// ICNS: 'icns' and the file's length, then each image as its type, its length (with these 8 bytes), its PNG
const icnsTypes = { icp4: 16, icp5: 32, ic11: 32, icp6: 64, ic12: 64, ic07: 128, ic13: 256, ic08: 256, ic14: 512, ic09: 512, ic10: 1024 };
const chunks = Object.entries(icnsTypes).map(([type, s]) => {
  const data = png(s);
  const h = Buffer.alloc(8);
  h.write(type, 0, 'latin1');
  h.writeUInt32BE(data.length + 8, 4);
  return Buffer.concat([h, data]);
});
const icnsHead = Buffer.alloc(8);
icnsHead.write('icns', 0, 'latin1');
icnsHead.writeUInt32BE(8 + chunks.reduce((n, c) => n + c.length, 0), 4);
writeFileSync(new URL('icon.icns', dir), Buffer.concat([icnsHead, ...chunks]));
