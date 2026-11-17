// === SimpliTex Service Worker v4 (Network-First + Safe Cache Refresh) ===
const CACHE_NAME = 'simplitex-live-v4';

const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './db.js',
  './app.js',
  './mod-inward.js',
  './mod-order.js',
  './mod-barcode.js',
  './mod-challan.js',
  './mod-daybook.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(CORE_ASSETS);
      try {
        await cache.add('./JsBarcode.all.min.js');
      } catch (_) {}
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;

  const url = new URL(req.url);

  // LAN API requests kabhi cache na karein
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-First Strategy (Online = Fresh Files, Offline = Cached Files)
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (
          res &&
          res.status === 200 &&
          (url.origin === self.location.origin || url.hostname.includes('cdnjs.cloudflare.com'))
        ) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
  );
});
