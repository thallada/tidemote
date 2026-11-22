// Tidemote's service worker (registered by src/pwa.js on tidemote.com): the page installs as an app and opens offline.
// The page is one unversioned file, so it is fetched from the network first (a cheap 304 when unchanged, site/_headers)
// and kept here for when the network is gone; a network slower than NET_WAIT with a copy kept serves the copy and
// keeps the new one for next time. The icons and manifest are served from here and refreshed behind. Everything else
// (fresh-shaders.txt and its Clear-Site-Data header most of all) goes to the network untouched.
const CACHE = 'tidemote-1';
const PAGE = '/';
const SHELL = ['/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png'];
const NET_WAIT = 4000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([PAGE, ...SHELL])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tidemote-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// the page from the network, kept when it came whole
async function fetchPage(req) {
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') {
    const c = await caches.open(CACHE);
    await c.put(PAGE, res.clone());
  }
  return res;
}

async function page(e) {
  const kept = await caches.match(PAGE);
  const net = fetchPage(e.request);
  if (!kept) return net;
  e.waitUntil(net.catch(() => {}));
  // the network's answer, unless it fails or is slow (then the copy kept); an error page from it (a 5xx) gives way to the copy
  const timeout = new Promise((res) => setTimeout(() => res(null), NET_WAIT));
  const res = await Promise.race([net.catch(() => null), timeout]);
  return res && res.status < 500 ? res : kept;
}

async function shell(e) {
  const kept = await caches.match(e.request, { ignoreSearch: true });
  const net = fetch(e.request).then(async (res) => {
    if (res.ok) await (await caches.open(CACHE)).put(e.request, res.clone());
    return res;
  });
  if (kept) { e.waitUntil(net.catch(() => {})); return kept; }
  return net;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) e.respondWith(page(e));
  else if (SHELL.includes(url.pathname)) e.respondWith(shell(e));
});
