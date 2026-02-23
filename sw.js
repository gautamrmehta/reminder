const CACHE_NAME = 'pill-reminder-v7';
const ASSETS = ['./index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Handle incoming push messages from GitHub Actions
self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('💊 Take your pill!', {
      body: "Tap this notification to confirm you took it.",
      requireInteraction: true,
      tag: 'pill-reminder',
      renotify: true
    })
  );
});

// Any tap on the notification → open the page with ?taken=true
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      // If page is open, navigate it
      for (const client of clients) {
        if ('navigate' in client) {
          return client.navigate('./index.html?taken=true').then((c) => c ? c.focus() : null);
        }
      }
      // Otherwise open new window
      return self.clients.openWindow('./index.html?taken=true');
    })
  );
});

// Network first for all requests
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
