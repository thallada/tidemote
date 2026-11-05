// Riding (docs/hand.md, Riding): how the viewer's keys or held pointer become the ridden cell's will, and how the
// camera dives to it and breathes with its speed. Pure (test/ride.test.js); the page runs both once a frame.
//
// The throttle is a vector (length at most 1, the share of the will's full speed) that follows the way held through
// a critically damped spring: slowly toward a way held (a tap barely moves the cell, a second and a half held reaches
// top speed), quicker back to rest when let go or turned against its motion. The camera's zoom is the same kind of
// spring on the log of the view's span: into the ride's zoom within about a second, then a little wider as it nears
// its top speed, and back in as it slows.

export const RIDE = {
  up: 0.4, // s: the throttle's time constant toward a way held (90% of top speed after 3.9 of these, 1.56 s)
  down: 0.14, // s: back to rest, let go, or turned against the way it goes (it stops quicker than it starts)
  reach: 0.5, // world units: a held pointer nearer the cell than this steers it slower, to a stop on it
  grip: 2, // the will's hold on the cell by the throttle: full from half of top speed, so a light touch nudges
};

export const RIDE_CAM = {
  short: 3.4, // world units the view's shorter side spans at the ride's zoom (mid-to-close)
  body: 1.3, // ...or this many of the body's spans (across), if more...
  bodyMax: 2, // ...up to this many times short: a big body is framed about the ridden cell, not whole
  keep: [0.75, 1.5], // a view already within these of it is kept as it is
  dive: 6.5, // the spring's rate (1/s) into the ride's zoom: settled within about a second...
  maxRate: 4, // ...never zooming faster than this (log of the span a second: 7% a 60th of a second), so a dive from
  // the whole world (40 times) takes about 1.5 s
  diveFor: 1.1, // s: then it eases to...
  breathe: 2, // ...this rate, following the speed
  wide: 0.22, // how much wider the view is at its top speed
  slow: 0.1, // the share of its top speed below which it is closest
  smooth: 0.6, // s: the speed is smoothed over this
};

// one step of a critically damped spring at rate w toward x1 (exact, so it holds at any frame rate)
function spring(x, v, x1, w, dt) {
  const c1 = x - x1, c2 = v + w * c1, e = Math.exp(-w * dt);
  return [x1 + (c1 + c2 * dt) * e, (c2 - w * (c1 + c2 * dt)) * e];
}
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const KEY_WAY = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};
/** Whether a KeyboardEvent.code steers a ride. */
export const isRideKey = (code) => code in KEY_WAY;
/** The way the held keys (KeyboardEvent.code) point, as a unit vector (a diagonal no faster), or [0, 0]. */
export function keyWay(codes) {
  let x = 0, y = 0;
  for (const c of codes) { const w = KEY_WAY[c]; if (w) { x += w[0]; y += w[1]; } }
  const l = Math.hypot(x, y);
  return l > 0 ? [x / l, y / l] : [0, 0];
}
/** The way a pointer held at offset (dx, dy) from the cell points: full beyond RIDE.reach, slower nearer. */
export function pointerWay(dx, dy, reach = RIDE.reach) {
  const l = Math.hypot(dx, dy);
  return l > 1e-9 ? [dx / Math.max(l, reach), dy / Math.max(l, reach)] : [0, 0];
}

export function createThrottle() { return { u: [0, 0], v: [0, 0] }; }
/** Step the throttle th toward the way held (a vector of length at most 1) over dt seconds; returns th.u. */
export function stepThrottle(th, way, dt, o = RIDE) {
  if (!(dt > 0)) return th.u;
  const held = way[0] !== 0 || way[1] !== 0;
  const against = held && way[0] * th.u[0] + way[1] * th.u[1] < 0;
  const w = 1 / (held && !against ? o.up : o.down);
  for (let k = 0; k < 2; k++) [th.u[k], th.v[k]] = spring(th.u[k], th.v[k], way[k], w, dt);
  const l = Math.hypot(th.u[0], th.u[1]);
  if (l > 1) { th.u[0] /= l; th.u[1] /= l; }
  // (at rest it rests: no residue left steering the cell)
  if (!held && l < 1e-3 && Math.hypot(th.v[0], th.v[1]) < 1e-2) th.u = [0, 0], th.v = [0, 0];
  return th.u;
}
/** The will's hold on the cell for throttle u: 0 at rest, so a cell let go goes its own way. */
export const throttleGrip = (u, o = RIDE) => Math.min(1, o.grip * Math.hypot(u[0], u[1]));

/**
 * The ride's camera from a view whose shorter side spans `now` world units: the span it dives to (a mid-to-close
 * zoom, or the view as it is if it is near that already).
 */
export function createRideCam(now, o = RIDE_CAM) {
  const keep = now >= o.short * o.keep[0] && now <= o.short * o.keep[1];
  return { base: keep ? now : o.short, z: Math.log(now), zv: 0, t: 0, sp: 0, manual: false };
}
/**
 * Step the ride's camera over dt seconds, the ridden cell going at `speed` (the share of its top speed, willSpeed), its
 * body `span` across; returns the span the view's shorter side should show.
 */
export function stepRideCam(c, speed, span, dt, o = RIDE_CAM) {
  if (!(dt > 0)) return Math.exp(c.z);
  c.t += dt;
  c.sp += (speed - c.sp) * (1 - Math.exp(-dt / o.smooth));
  // (the body's span taken once, when first known: its changing shape does not move the zoom)
  if (span > 0 && c.span == null) c.span = span;
  const base = Math.max(c.base, Math.min((c.span || 0) * o.body, o.short * o.bodyMax));
  const to = Math.log(base * (1 + o.wide * smoothstep(o.slow, 1, c.sp)));
  const w = c.t < o.diveFor ? o.dive : o.breathe + (o.dive - o.breathe) * Math.exp(-(c.t - o.diveFor) / 0.5);
  const z0 = c.z;
  [c.z, c.zv] = spring(c.z, c.zv, to, w, dt);
  // (a long dive, from the whole world, goes at a steady pace rather than lurching: at most maxRate)
  if (Math.abs(c.z - z0) > o.maxRate * dt) { const sg = Math.sign(c.z - z0); c.z = z0 + sg * o.maxRate * dt; c.zv = sg * o.maxRate; }
  return Math.exp(c.z);
}

/**
 * The will's full speed for a ridden cell of genome g (world units a second): K.will for a full swimmer, K.willDrift
 * of it adrift, K.willAnchored of that again for one anchored. The page sends the whole body this one velocity, so
 * its cells go together.
 */
export function willSpeed(g, K) {
  if (!g) return K.will * K.willDrift;
  const swim = Math.min(1, Math.max(0, g.swim || 0));
  return K.will * (K.willDrift + (1 - K.willDrift) * swim) * (1 + (K.willAnchored - 1) * smoothstep(0.35, 0.1, g.advect ?? 1));
}
