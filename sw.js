const CACHE_NAME = 'sri-rama-koti-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/main.js',
  '/SriramaInsert.js',   // rename if your actual worker filename differs
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install event: cache essential app shell files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())  // Activate worker immediately after install
  );
});

// Activate event: remove outdated caches
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
  );
  self.clients.claim(); // Take control of pages immediately
});

// Fetch event: serve requests from cache first, then network fallback, with dynamic caching
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }

      // Attempt network fetch, update cache with the response if successful
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse; // Don't cache opaque or error responses
        }

        // Clone response so it's safe to consume
        const responseToCache = networkResponse.clone();

        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Fallback to offline page for navigation requests when offline
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        // You may add fallback for other requests (images, scripts) if needed
      });
    })
  );
});
