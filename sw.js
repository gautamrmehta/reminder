const CACHE_NAME = 'pill-reminder-v6';
const ASSETS = ['./index.html', './manifest.json'];

// Install: cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches and take control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Listen for skip-waiting message from page
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Handle incoming push messages (from GitHub Actions cron)
self.addEventListener('push', (event) => {
  let body = "Time to take your pill! Tap 'Took it!' when done.";
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

// Fetch: network first for everything (ensures latest files)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  event.notification.close();

  if (action === 'took-pill') {
    // Write a flag to the Cache API (works reliably in service workers)
    event.waitUntil(
      writePillTakenFlag().then(() => {
        // Try to tell the page via BroadcastChannel
        try {
          const bc = new BroadcastChannel('pill-channel');
          bc.postMessage({ action: 'took-pill' });
          bc.close();
        } catch(e) {}

        // Also try postMessage to open clients
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
          if (clients.length > 0) {
            clients[0].postMessage({ action: 'took-pill' });
            return clients[0].focus();
          }
          // No page open — open it with ?taken=true
          return self.clients.openWindow('./index.html?taken=true');
        });
      }).catch(() => {
        // If cache write failed, still try to open the page
        return self.clients.openWindow('./index.html?taken=true');
      })
    );
  } else if (action === 'snooze') {
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
  } else {
    // Tapped notification body — just open the app (don't mark as taken)
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        if (clients.length > 0) {
          return clients[0].focus();
        }
        return self.clients.openWindow('./index.html');
      })
    );
  }
});

// Write a flag to Cache API so the page can detect "Took it!" was tapped
function writePillTakenFlag() {
  const now = new Date();
  const dateKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const data = JSON.stringify({ date: dateKey, time: timeStr });
  return caches.open('pill-taken-flags').then((cache) => {
    return cache.put('/pill-taken-today', new Response(data));
  });
}
