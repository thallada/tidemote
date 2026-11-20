// The rose (docs/controller.md, The roses): a ring of eight choices held open on a controller's bumper, the stick's
// angle lighting one, letting go of the bumper taking it. The tools on LB, the view's toggles on RB.
//
// sectorOf is the pure part: which octant a stick points at, with a band of hysteresis at the borders so a stick held
// near one doesn't flicker between neighbors. The rest draws the ring and keeps the choice for a moment after the
// stick springs back, since letting go of the stick a moment before the bumper is the commonest slip.
const ROSE_DZ = 0.4;        // the stick past this picks (inside: nothing, and letting go cancels)
const ROSE_HYST = 10 * Math.PI / 180; // a border's band of hysteresis
export const ROSE_GRACE = 120;     // ms a choice outlasts the stick's return to rest

/**
 * The octant (0..n−1, 0 at the top, clockwise) stick (x, y) points at, or −1 within the dead zone. prev, the octant
 * lit before, is kept until the stick is past its border by ROSE_HYST.
 */
export function sectorOf(x, y, n = 8, prev = -1, dz = ROSE_DZ, hyst = ROSE_HYST) {
  if (Math.hypot(x, y) < dz) return -1;
  const w = (2 * Math.PI) / n;
  const a = (Math.atan2(x, -y) + 2 * Math.PI) % (2 * Math.PI); // 0 up, clockwise
  if (prev >= 0) {
    let d = Math.abs(a - prev * w) % (2 * Math.PI);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d <= w / 2 + hyst) return prev;
  }
  return Math.round(a / w) % n;
}

/**
 * The ring's DOM. items: [{ id, label, icon? (svg markup) }]. open(items, x, y) shows it about a screen point;
 * steer(stick, now) lights the octant; shown, whether it is open; close() hides it and returns the id taken (null: none).
 */
export function createRose(el) {
  let items = [], lit = -1, litAt = 0, isOpen = false;
  el.hidden = true;
  const draw = () => {
    for (const [i, b] of [...el.querySelectorAll('.rose-it')].entries()) b.classList.toggle('on', i === lit);
    el.style.setProperty('--lit', `${Math.max(0, lit) * 45}deg`);
    el.classList.toggle('lit', lit >= 0);
  };
  return {
    get shown() { return isOpen; },
    open(list, x, y, label) {
      items = list; lit = -1; isOpen = true;
      el.setAttribute('aria-label', label);
      el.innerHTML = '<div class="rose-wedge"></div>' + list.map((it, i) => {
        const a = (i * Math.PI) / 4;
        return `<div class="rose-it" role="menuitem" style="--x:${(Math.sin(a) * 0.36).toFixed(3)};--y:${(-Math.cos(a) * 0.36).toFixed(3)}">${it.icon || ''}<span>${it.label}</span></div>`;
      }).join('');
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      el.hidden = false;
      draw();
    },
    steer([x, y], now) {
      if (!isOpen) return;
      const s = sectorOf(x, y, items.length, lit);
      if (s >= 0) { lit = s; litAt = now; }
      else if (lit >= 0 && now - litAt > ROSE_GRACE) lit = -1;
      draw();
    },
    close() {
      const id = isOpen && lit >= 0 ? items[lit].id : null;
      isOpen = false; el.hidden = true; lit = -1;
      return id;
    },
  };
}
