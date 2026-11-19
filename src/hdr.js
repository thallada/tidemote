// The display the world is shown on: HDR and wide color (docs/hdr.md). The canvas is configured for what the screen
// can show and the viewer asks (displayPlan), and the composite's last step (displayOut in POST_WGSL) makes the view
// for it: SDR as it always was, an HDR display's highlights brighter than SDR white up to its headroom, a P3 display's
// most saturated colors out toward its gamut's edge. Pure but for displayCaps and the calibration guide.

/**
 * The headroom the viewer may set, the brightest the view goes over SDR white (×): the slider's ends, and the default.
 * No web API tells a display's headroom (nor its brightness, on which it depends), so the default is a common one: an
 * HDR monitor of 400-600 nits with SDR white at 200-300 has about 1.5-3×. Set too high, the brightest highlights clip
 * flat; too low, they are only dimmer.
 */
export const PEAK = { min: 1.5, max: 16, def: 2 };
/** How far saturated colors reach toward the wide gamut's edge, by Settings → Display's choices (0: sRGB's colors). */
export const WIDE = [0, 0.35, 0.65, 1];
export const WIDE_DEF = 2;

/** The peak slider's position (0..1000) for a headroom, and back: logarithmic, as brightness is seen. */
export const peakToSlider = (p) => Math.round((1000 * Math.log(clampPeak(p) / PEAK.min)) / Math.log(PEAK.max / PEAK.min));
export const sliderToPeak = (t) => +(PEAK.min * (PEAK.max / PEAK.min) ** (Math.min(1000, Math.max(0, t)) / 1000)).toFixed(2);
export const clampPeak = (p) => Math.min(PEAK.max, Math.max(PEAK.min, Number(p) || PEAK.def));

/**
 * What this browser and screen can show: toneMapping (the canvas takes `toneMapping: { mode: 'extended' }`, Chrome 129
 * on: probed by configuring a canvas and reading its configuration back), hdrScreen (the screen shows more than SDR:
 * `(dynamic-range: high)`), p3Screen (a wide gamut: `(color-gamut: p3)`; every WebGPU canvas takes `display-p3`). The
 * screen's answers change as a window moves or the system's HDR is switched: onChange is told.
 */
export function displayCaps(device, onChange) {
  const hdrQ = matchMedia('(dynamic-range: high)'), p3Q = matchMedia('(color-gamut: p3)'); // i18n-ignore (media queries)
  const ctx = document.createElement('canvas').getContext('webgpu');
  ctx.configure({ device, format: 'rgba16float', toneMapping: { mode: 'extended' } });
  const caps = { toneMapping: ctx.getConfiguration?.()?.toneMapping?.mode === 'extended', hdrScreen: hdrQ.matches, p3Screen: p3Q.matches };
  ctx.unconfigure();
  hdrQ.addEventListener('change', (e) => { caps.hdrScreen = e.matches; onChange(caps); });
  p3Q.addEventListener('change', (e) => { caps.p3Screen = e.matches; onChange(caps); });
  return caps;
}

/**
 * How the canvas is configured and what the composite is told, from the viewer's choices ({ hdr: on, peak: headroom,
 * wide: WIDE's index }), what the browser and screen can show (displayCaps), whether a film is being made (a film is
 * SDR in sRGB: the canvas is copied into a 2D canvas, where HDR's highlights would clip), the format the canvas has
 * now and the 8-bit one the browser prefers. A float canvas, once made, stays (HDR switched off shows SDR in it; going
 * back would compile every pipeline that draws into the canvas again).
 * Returns { hdr: shown, p3, format, config: { colorSpace, toneMapping }, display: Engine.display }.
 */
export function displayPlan({ hdr = true, peak = PEAK.def, wide = WIDE_DEF } = {}, caps = {}, { filming = false, format = 'bgra8unorm', preferred = 'bgra8unorm' } = {}) {
  const hdrOn = !!(hdr && caps.toneMapping && caps.hdrScreen);
  const amount = WIDE[wide] ?? 0;
  // (on an HDR screen the system composites in a gamut wider than sRGB, whatever it says of its primaries)
  const p3 = !!(amount > 0 && (caps.p3Screen || hdrOn));
  return {
    hdr: hdrOn, p3,
    format: hdrOn || format === 'rgba16float' ? 'rgba16float' : preferred,
    config: { colorSpace: p3 ? 'display-p3' : 'srgb', toneMapping: { mode: hdrOn ? 'extended' : 'standard' } },
    display: { peak: hdrOn && !filming ? clampPeak(peak) : 1, wide: filming ? 0 : amount, p3 },
  };
}

/** A half float's value (IEEE 754 binary16, as a Uint16). */
export function halfToFloat(h) {
  const e = (h >> 10) & 31, m = h & 1023, s = h & 32768 ? -1 : 1;
  if (e === 0) return s * m * 2 ** -24;
  if (e === 31) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * 2 ** (e - 15);
}

/** An rgba16float image's pixels (Uint16Array of halves) as RGBA8 bytes, each value clamped to [0, 1]. */
export function halfsToRGBA8(halves) {
  const out = new Uint8ClampedArray(halves.length);
  for (let i = 0; i < halves.length; i++) out[i] = Math.round(halfToFloat(halves[i]) * 255);
  return out;
}

// sRGB's transfer curves (extended past 1, as a float canvas in an sRGB-encoded color space takes them) and the
// colorimetric step from linear sRGB to linear Display P3 (the same white, D65): WGSL for the composite (POST_WGSL),
// the notes (gpunotes.js) and the calibration guide.
export const SRGB_WGSL = /* wgsl */ ` // i18n-ignore (WGSL)
fn srgbDecode(v: vec3f) -> vec3f {
  let x = max(v, vec3f(0.0));
  return select(pow((x + 0.055) / 1.055, vec3f(2.4)), x / 12.92, x <= vec3f(0.04045));
}
fn srgbEncode(l: vec3f) -> vec3f {
  let x = max(l, vec3f(0.0));
  return select(1.055 * pow(x, vec3f(1.0 / 2.4)) - 0.055, x * 12.92, x <= vec3f(0.0031308));
}
fn srgbToP3(l: vec3f) -> vec3f {
  return mat3x3f(0.8224621, 0.0331941, 0.0170827, 0.1775380, 0.9668058, 0.0723974, 0.0, 0.0, 0.9105199) * l;
}
`;

// The calibration guide: on black, a disc at the headroom chosen inside a thin ring brighter than any display shows
// (it clips at the display's brightest), a grey (the same in P3). Raised until the disc vanishes into its ring, the
// headroom meets the display's own. (A ring, not a field: little of the panel at its brightest beside the words.)
const CAL_WGSL = SRGB_WGSL + /* wgsl */ ` // i18n-ignore (WGSL)
struct U { peak: f32, w: f32, h: f32, _p: f32 }
@group(0) @binding(0) var<uniform> u: U;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let d = length(pos.xy - vec2f(u.w, u.h) * 0.5);
  let r = u.h * 0.24;
  let ring = max(2.0, u.h * 0.1);
  // (edges a pixel wide; the ring 64 times SDR white, touching the disc so their edge goes with the difference)
  let inRing = clamp(r + ring - d + 0.5, 0.0, 1.0);
  let l = mix(0.0, mix(u.peak, 64.0, clamp(d - r + 0.5, 0.0, 1.0)), inRing);
  return vec4f(srgbEncode(vec3f(l)), 1.0);
}
`;

/** The calibration guide: draw(canvas, peak) draws it on a canvas (configured for extended range when new to it). */
export function createCalibration(device) {
  const mod = device.createShaderModule({ code: CAL_WGSL, label: 'hdrCalibration' });
  const pipe = device.createRenderPipeline({ layout: 'auto', label: 'hdrCalibration', primitive: { topology: 'triangle-list' },
    vertex: { module: mod, entryPoint: 'vs' }, fragment: { module: mod, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] } });
  const ubuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bg = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubuf } }] });
  const configured = new WeakSet();
  return (canvas, peak) => {
    const ctx = canvas.getContext('webgpu');
    if (!configured.has(canvas)) { ctx.configure({ device, format: 'rgba16float', alphaMode: 'opaque', toneMapping: { mode: 'extended' } }); configured.add(canvas); }
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    device.queue.writeBuffer(ubuf, 0, new Float32Array([clampPeak(peak), w, h, 0]));
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    pass.setPipeline(pipe); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
    device.queue.submit([enc.finish()]);
  };
}
