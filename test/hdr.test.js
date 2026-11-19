// The display's plan (src/hdr.js, docs/hdr.md): how the canvas is configured for what the screen shows and the viewer
// asks, the headroom slider's scale, and the float readback.
import test from 'node:test';
import assert from 'node:assert/strict';
import { displayPlan, PEAK, WIDE, WIDE_DEF, peakToSlider, sliderToPeak, clampPeak, halfToFloat, halfsToRGBA8 } from '../src/hdr.js';

const HDR_SCREEN = { toneMapping: true, hdrScreen: true, p3Screen: true };
const SDR_SCREEN = { toneMapping: true, hdrScreen: false, p3Screen: false };

test('an SDR screen keeps the 8-bit sRGB canvas the page always had', () => {
  const p = displayPlan({}, SDR_SCREEN, { preferred: 'bgra8unorm', format: 'bgra8unorm' });
  assert.equal(p.hdr, false);
  assert.equal(p.format, 'bgra8unorm');
  assert.deepEqual(p.config, { colorSpace: 'srgb', toneMapping: { mode: 'standard' } });
  assert.deepEqual(p.display, { peak: 1, wide: WIDE[WIDE_DEF], p3: false });
});

test('an HDR screen gets a float canvas in extended range, P3, at the headroom asked', () => {
  const p = displayPlan({ hdr: true, peak: 5, wide: 3 }, HDR_SCREEN, { preferred: 'bgra8unorm', format: 'bgra8unorm' });
  assert.equal(p.hdr, true);
  assert.equal(p.format, 'rgba16float');
  assert.deepEqual(p.config, { colorSpace: 'display-p3', toneMapping: { mode: 'extended' } });
  assert.deepEqual(p.display, { peak: 5, wide: 1, p3: true });
});

test('HDR waits for the browser and the screen both, and for the viewer', () => {
  for (const caps of [{ ...HDR_SCREEN, toneMapping: false }, { ...HDR_SCREEN, hdrScreen: false }]) assert.equal(displayPlan({ hdr: true }, caps).hdr, false);
  assert.equal(displayPlan({ hdr: false }, HDR_SCREEN).hdr, false);
});

test('HDR switched off shows SDR in the float canvas it already has rather than compiling back', () => {
  const p = displayPlan({ hdr: false }, HDR_SCREEN, { preferred: 'bgra8unorm', format: 'rgba16float' });
  assert.equal(p.format, 'rgba16float');
  assert.equal(p.config.toneMapping.mode, 'standard');
  assert.equal(p.display.peak, 1);
});

test('wide color only where the screen has the gamut', () => {
  assert.equal(displayPlan({ wide: 2 }, { ...SDR_SCREEN, p3Screen: true }).p3, true);
  assert.equal(displayPlan({ wide: 2 }, SDR_SCREEN).p3, false);
  assert.equal(displayPlan({ wide: 0 }, HDR_SCREEN).p3, false);
  // (an HDR screen composites wider than sRGB whatever it reports)
  assert.equal(displayPlan({ wide: 2 }, { ...HDR_SCREEN, p3Screen: false }).p3, true);
});

test('a film is SDR in sRGB colors, on whatever canvas the view has', () => {
  const p = displayPlan({ hdr: true, peak: 6, wide: 3 }, HDR_SCREEN, { filming: true, format: 'rgba16float' });
  assert.equal(p.format, 'rgba16float');
  assert.deepEqual(p.display, { peak: 1, wide: 0, p3: true });
});

test('the headroom slider is logarithmic, spans PEAK and comes back where it was', () => {
  assert.equal(sliderToPeak(0), PEAK.min);
  assert.equal(sliderToPeak(1000), PEAK.max);
  assert.ok(Math.abs(sliderToPeak(500) - Math.sqrt(PEAK.min * PEAK.max)) < 0.01);
  for (const p of [1.5, 2, 3, 4, 7.5, 16]) assert.ok(Math.abs(sliderToPeak(peakToSlider(p)) - p) / p < 0.005, String(p));
  assert.equal(clampPeak(100), PEAK.max);
  assert.equal(clampPeak('junk'), PEAK.def);
});

test('half floats read back as an HDR canvas holds them', () => {
  assert.equal(halfToFloat(0x3c00), 1);
  assert.equal(halfToFloat(0x3800), 0.5);
  assert.equal(halfToFloat(0x4000), 2);
  assert.equal(halfToFloat(0xc000), -2);
  assert.equal(halfToFloat(0x0001), 2 ** -24);
  assert.equal(halfToFloat(0x7c00), Infinity);
  assert.deepEqual([...halfsToRGBA8(Uint16Array.of(0x0000, 0x3800, 0x3c00, 0x4000, 0xbc00))], [0, 128, 255, 255, 0]);
});
