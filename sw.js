const CACHE_NAME = 'sri-rama-koti-cache-v1';

// Precache application shell and AI model files
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/main.js',
  '/sriramainsert.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.ico',
];

// Install event - cache files individually with error handling
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[ServiceWorker] Caching app shell and AI model files');
      for (const url of urlsToCache) {
        try {
          await cache.add(url);
          console.log(`[ServiceWorker] Cached: ${url}`);
        } catch (err) {
          console.warn(`[ServiceWorker] Failed to cache ${url}:`, err);
          // Continue caching other files without failing entire install
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log(`[ServiceWorker] Deleting old cache: ${name}`);
            return caches.delete(name);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch event - serve cache first, then network; cache new GET requests dynamically
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Return cached response if found
        return cachedResponse;
      }

      // Otherwise, fetch from network
      return fetch(event.request).then(networkResponse => {
        // Only cache successful responses
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (networkResponse.type === 'basic' || networkResponse.type === 'cors') // same-origin or CORS
        ) {
          // Clone response so we can cache it without consuming it
          const responseClone = networkResponse.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone))
          );
        }

        return networkResponse;
      }).catch(() => {
        // If fetch fails (offline), and navigation request, serve cached index.html for SPA routing fallback
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        // Optionally add fallback for images or other file types here
      });
    })
  );
});
