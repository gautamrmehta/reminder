const CACHE_NAME = 'pill-reminder-v2';
const ASSETS = ['./index.html', './manifest.json'];

// Install: cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Handle incoming push messages (from GitHub Actions cron)
self.addEventListener('push', (event) => {
  let body = "Time to take your pill!";
  if (event.data) {
    try {
      const payload = event.data.json();
      body = payload.body || body;
    } catch(e) {
      body = event.data.text() || body;
    }
  }

  event.waitUntil(
    self.registration.showNotification('💊 Take your pill!', {
      body: body,
      requireInteraction: true,
      tag: 'pill-reminder',
      renotify: true,
      actions: [
        { action: 'took-pill', title: '✅ Took it!' },
        { action: 'snooze', title: '⏰ Snooze 10min' }
      ]
    })
  );
});

// Fetch: serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// Handle notification clicks — including action buttons
self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  event.notification.close();

  if (action === 'took-pill') {
    // User tapped "Took it!" — mark pill as taken
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        if (clients.length > 0) {
          // Page is open — tell it to mark pill as taken
          clients[0].postMessage({ action: 'took-pill' });
          return clients[0].focus();
        } else {
          // Page not open — open it with ?taken=true so it auto-marks
          return self.clients.openWindow('./index.html?taken=true');
        }
      })
    );
  } else if (action === 'snooze') {
    // User tapped "Snooze" — show another notification in 10 minutes
    event.waitUntil(
      new Promise((resolve) => {
        setTimeout(() => {
          self.registration.showNotification('💊 Take your pill!', {
            body: "Snooze is up! Don't forget your pill.",
            requireInteraction: true,
            tag: 'pill-reminder',
            renotify: true,
            actions: [
              { action: 'took-pill', title: '✅ Took it!' },
              { action: 'snooze', title: '⏰ Snooze 10min' }
            ]
          }).then(resolve);
        }, 10 * 60 * 1000);
      })
    );
    // Also notify the page if it's open
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      clients.forEach((c) => c.postMessage({ action: 'snooze' }));
    });
  } else {
    // Tapped the notification body (not an action button) — just open the app
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        if (clients.length > 0) {
          return clients[0].focus();
        }
        return self.clients.openWindow('./index.html');
      })
    );
  }
});
