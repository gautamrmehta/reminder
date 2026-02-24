const CACHE_NAME = 'pill-reminder-v9';
const TAKEN_CACHE = 'pill-taken-flags';
const ASSETS = ['./index.html', './manifest.json'];

// Helper: get today's date key
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Helper: check if pill was taken today
function wasPillTakenToday() {
  return caches.open(TAKEN_CACHE).then((cache) => {
    return cache.match('/pill-taken-' + todayKey()).then((r) => !!r);
  }).catch(() => false);
}

// Helper: mark pill as taken today
function markPillTaken() {
  return caches.open(TAKEN_CACHE).then((cache) => {
    return cache.put('/pill-taken-' + todayKey(), new Response('true'));
  }).catch(() => {});
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== TAKEN_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Handle incoming push messages — only show if pill NOT taken today
self.addEventListener('push', (event) => {
  event.waitUntil(
    wasPillTakenToday().then((taken) => {
      if (taken) {
        // Already took pill today — show and immediately close
        // (Chrome requires every push to show a notification)
        return self.registration.showNotification('', {
          tag: 'pill-reminder-done',
          silent: true
        }).then(() => {
          return self.registration.getNotifications({ tag: 'pill-reminder-done' });
        }).then((notifications) => {
          notifications.forEach((n) => n.close());
        });
      }
      return self.registration.showNotification('\uD83D\uDC8A Take your pill!', {
        body: "Tap this notification to confirm you took it.",
        requireInteraction: true,
        tag: 'pill-reminder',
        renotify: true
      });
    })
  );
});

// Any tap on the notification → mark as taken + open the page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    markPillTaken().then(() => {
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        for (const client of clients) {
          if ('navigate' in client) {
            return client.navigate('./index.html?taken=true').then((c) => c ? c.focus() : null);
          }
        }
        return self.clients.openWindow('./index.html?taken=true');
      });
    })
  );
});

// Network first for all requests
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
