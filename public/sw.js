/* CONSISTO service worker
 * - Offline app shell (network-first navigation with cached fallback)
 * - Runtime caching for static files and Google Fonts
 * - Never intercepts Firebase / Google API traffic (Firestore handles its own offline cache)
 * - Notification click + snooze actions
 * - Update flow: a waiting worker activates only after the user confirms (SKIP_WAITING)
 */
const VERSION = 'v1.1.0';
const SHELL_CACHE = 'consisto-shell-' + VERSION;
const RUNTIME_CACHE = 'consisto-runtime';
const FONT_CACHE = 'consisto-fonts';
const SHELL_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  './icons/badge-72.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.all(SHELL_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => null)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('consisto-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isFontRequest(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Only handle same-origin files and Google Fonts. Firebase, Firestore, Auth and Analytics pass straight through.
  if (url.origin !== self.location.origin && !isFontRequest(url)) return;
  // Firebase Auth helper pages (/__/auth/*, /__/firebase/*) — e.g. when proxied through this domain for
  // Google sign-in — must never be intercepted or cached.
  if (url.pathname.includes('/__/')) return;
  // Version checks always go to the network.
  if (url.searchParams.has('__v')) return;

  if (req.mode === 'navigate') {
    // Only the app shell itself is served from cache; any other page navigation goes straight to the network.
    const scope = new URL(self.registration.scope).pathname;
    if (url.pathname === scope || url.pathname === scope + 'index.html') event.respondWith(networkFirstShell(req));
    return;
  }
  if (isFontRequest(url)) {
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }
  if (url.pathname.includes('/logo/')) {
    // User-uploaded logo: prefer the network so a newly uploaded file shows immediately.
    event.respondWith(networkFirst(req, RUNTIME_CACHE));
    return;
  }
  event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
});

async function networkFirstShell(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok && (res.headers.get('content-type') || '').includes('text/html')) cache.put('./index.html', res.clone());
    return res;
  } catch (err) {
    const cached = (await cache.match('./index.html')) || (await cache.match('./'));
    if (cached) return cached;
    return new Response(
      '<!doctype html><meta name="viewport" content="width=device-width"><title>Offline</title>' +
        '<body style="background:#0b0a12;color:#ecebf5;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">' +
        '<div style="text-align:center"><h1>CONSISTO is offline</h1><p>Open the app once while online to enable offline mode.</p></div></body>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req)) || new Response('', { status: 504 });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || new Response('', { status: 504 });
}

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = notification.data || {};
  notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = all.find((c) => 'focus' in c) || all[0];
      if (event.action === 'snooze') {
        if (client) {
          client.postMessage({ type: 'SNOOZE', eventId: data.eventId || '' });
          return;
        }
        await self.clients.openWindow('./#/home?snooze=' + encodeURIComponent(data.eventId || ''));
        return;
      }
      const link = data.link || '/home';
      if (client) {
        try {
          await client.focus();
        } catch (e) {}
        client.postMessage({ type: 'NAVIGATE', link: link });
        return;
      }
      await self.clients.openWindow('./#' + link);
    })()
  );
});
