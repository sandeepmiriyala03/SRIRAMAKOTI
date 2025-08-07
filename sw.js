const CACHE_NAME = 'sri-rama-koti-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/main.js',
  '/sriramainsert.js',  // Make sure this matches your exact worker filename
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Install event to cache essential app shell files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())  // Activate immediately after install
  );
});

// Activate event: delete outdated caches and take control immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
          return Promise.resolve();
        })
      )
    )
    .then(() => self.clients.claim())
  );
});

// Fetch event: Cache-first with network fallback and dynamic caching
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then(networkResponse => {
        // Only cache successful same-origin responses
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseClone = networkResponse.clone();

        // Use waitUntil to ensure caching completes
        event.waitUntil(
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone))
        );

        return networkResponse;
      }).catch(() => {
        // Offline fallback for navigation requests (SPA)
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        // Optionally you can add fallback for images/scripts here
      });
    })
  );
});
