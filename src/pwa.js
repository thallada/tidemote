// The page as an installable web app on tidemote.com (site/manifest.webmanifest, site/sw.js; README, "Installing as
// an app"): its service worker registered where the page is served over http(s) (never from a file or in the desktop
// app), and the browser's offer to install kept for the menu's Install row. Chromium browsers offer it themselves
// (beforeinstallprompt, held back from their own banner so it never covers the world as it opens); iPhones and iPads
// install from Share → Add to Home Screen, which the menu explains.

/** The address the page opened at, before anything rewrote it (a card's #c= is cut off once read). */
export const openedAt = location.href;

/** Whether the page runs as an installed app (from its icon), not in a browser's tab. */
function installed() {
  return matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;
}

/** An iPhone, iPad or iPod (an iPad says it is a Mac, but has touch). */
export function appleTouch() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// The browser's offer, listened for from the first moment: Chrome may make it while the GPU is still starting, long
// before the page's menu exists
let offer = null, changed = () => {}, done = () => {};
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); offer = e; changed(); });
addEventListener('appinstalled', () => { offer = null; changed(); done(); });

/** onChange() is called whenever what can() answers may have changed; onInstalled() once the browser has installed it. */
export function createPwa({ onChange = () => {}, onInstalled = () => {} } = {}) {
  const served = !globalThis.tidemoteDesktop && /^https?:$/.test(location.protocol) && globalThis.isSecureContext;
  changed = onChange; done = onInstalled;
  if (served && 'serviceWorker' in navigator) {
    // after the page has loaded, so its first fetches and the shaders' compile come first
    const register = () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[tidemote] service worker:', e));
    if (document.readyState === 'complete') register(); else addEventListener('load', register, { once: true });
  }
  return {
    /** How this browser installs it: 'prompt' (its own dialog), 'share' (Share → Add to Home Screen), or null (it
     *  cannot, or it already runs installed). */
    can() {
      if (!served || installed()) return null;
      return offer ? 'prompt' : appleTouch() ? 'share' : null;
    },
    /** The browser's install dialog (an offer opens it once; appinstalled says when it was accepted). */
    async prompt() {
      const e = offer;
      offer = null;
      try { await e?.prompt(); } finally { changed(); }
    },
  };
}
