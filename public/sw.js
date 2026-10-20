// Bump this whenever the deployed app shell changes so browsers discard an
// older cached index and load the current hashed JavaScript bundles.
const CACHE_NAME = 'invoiceflow-app-shell-v7';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([
        '/',
        '/index.html',
        '/manifest.webmanifest?v=7',
        '/app-icon.svg',
        '/app-icon-192.png',
        '/app-icon-512.png',
        '/fonts/NotoSans-Regular.ttf',
        '/fonts/NotoSans-Bold.ttf'
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Never intercept Vite source-module requests on localhost.
  if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') return;

  // Firestore/Auth/API requests must always reach Firebase and are handled by
  // the SDK's own offline cache and write queue.
  if (url.pathname.startsWith('/__/') || url.pathname.includes('/googleapis/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    }))
  );
});
