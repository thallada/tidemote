// The translucent panels' frosted glass, drawn by the engine (Engine.setGlass) rather than by CSS's backdrop-filter:
// Chrome redrew that blur of the live view under a panel at the screen's resolution every frame (on an M1, 1.5 ms of
// its compositor's GPU work a frame for the Field Lab alone, against 0.2 ms for the whole page without it). The engine
// blurs only the strips under the panels, at the view's resolution, after its frame.
//
// trackGlass(panels, canvas) follows where the panels lie over the view and how opaque they are, reading the layout
// only when something may have moved them: a resize, a panel's size or display (ResizeObserver), a class or hidden
// attribute changing on one or on the body (the page hides and fades them by class), every frame while one of
// their own transitions runs, and when the canvas's pixel size changes (the render scale and pixel density resize it
// with its CSS box unchanged, which no observer sees, and the rects are in its pixels). poll() returns the rects in
// the canvas's pixels and the blur's sigma there, or null when nothing changed.

export const GLASS_BLUR = 6; // CSS pixels, as the panels' backdrop-filter: blur(6px) had it

export function trackGlass(panels, canvas) {
  let dirty = true;
  let moving = 0;
  let cw = 0, ch = 0; // the canvas's pixel size the rects were last measured at
  const mark = () => { dirty = true; };
  const ro = new ResizeObserver(mark);
  const mo = new MutationObserver(mark);
  ro.observe(canvas);
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  for (const el of panels) {
    ro.observe(el);
    mo.observe(el, { attributes: true, attributeFilter: ['class', 'hidden', 'style', 'data-tab'] });
    el.addEventListener('transitionrun', (e) => { if (e.target === el) moving++; });
    const done = (e) => { if (e.target === el) { moving = Math.max(0, moving - 1); dirty = true; } };
    el.addEventListener('transitionend', done);
    el.addEventListener('transitioncancel', done);
  }
  addEventListener('resize', mark);
  return {
    poll() {
      if (!dirty && !moving && canvas.width === cw && canvas.height === ch) return null;
      dirty = false; cw = canvas.width; ch = canvas.height;
      const view = canvas.getBoundingClientRect();
      if (!view.width || !view.height) return { rects: [], sigma: 0 };
      const sx = canvas.width / view.width, sy = canvas.height / view.height;
      const rects = [];
      for (const el of panels) {
        if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const o = +getComputedStyle(el).opacity;
        const r = el.getBoundingClientRect();
        if (!(o > 0) || !r.width || !r.height) continue;
        rects.push({ x: (r.left - view.left) * sx, y: (r.top - view.top) * sy, w: r.width * sx, h: r.height * sy, o });
      }
      return { rects, sigma: GLASS_BLUR * sx };
    },
    /** Read the layout again at the next poll (a film starting or stopping). */
    mark,
  };
}
