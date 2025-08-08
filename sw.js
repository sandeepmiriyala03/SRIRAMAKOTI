const CACHE_NAME = 'sri-rama-koti-cache-v1';

// Precache URLs including your app shell and AI model files from CDN
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/main.js',
  '/sriramainsert.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',

  // Add the exact AI model asset URLs your ai.js requests here:
  'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/distilgpt2/onnx/model.onnx',
  'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/distilgpt2/generation_config.json',
  // Add any additional files your AI model requires
];

// Install event: cache necessary files including AI model files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[ServiceWorker] Caching app shell and AI model files');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event: delete old caches and immediately become active
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch event: try cache first, then network; dynamically cache new GET requests
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        // Cache both same-origin ('basic') and cross-origin ('cors') responses (to include CDN AI models)
        if (networkResponse.type === 'basic' || networkResponse.type === 'cors') {
          const responseClone = networkResponse.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            })
          );
        }

        return networkResponse;
      }).catch(() => {
        // Offline fallback: if navigation request, serve cached index.html for SPA routing
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        // You can add fallback for other resources (images, scripts) if desired here
      });
    })
  );
});
