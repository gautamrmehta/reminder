const CACHE_NAME = 'pill-reminder-v4';
const ASSETS = ['./index.html', './manifest.json'];

// --- IndexedDB helpers (service workers can't use localStorage) ---
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('pillReminderSW', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('actions', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function recordPillTaken() {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('actions', 'readwrite');
      const store = tx.objectStore('actions');
      const now = new Date();
      const dateKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      store.add({ type: 'took-pill', date: dateKey, time: timeStr, timestamp: now.toISOString() });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  });
}

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

// Fetch: network first for HTML (to get latest), cache for others
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  } else {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});

// Handle notification clicks — including action buttons
self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  event.notification.close();

  if (action === 'took-pill') {
    // Try IndexedDB first, then ALWAYS open/focus the page as reliable fallback
    event.waitUntil(
      recordPillTaken()
        .then(() => openOrFocusPage(true))
        .catch(() => openOrFocusPage(true))
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
    // Tapped the notification body — open the app
    event.waitUntil(openOrFocusPage(false));
  }
});

// Helper: open or focus the app page
function openOrFocusPage(markTaken) {
  return self.clients.matchAll({ type: 'window' }).then((clients) => {
    const url = markTaken ? './index.html?taken=true' : './index.html';
    if (clients.length > 0) {
      // Page is open — send message and focus it
      if (markTaken) {
        clients[0].postMessage({ action: 'took-pill' });
      }
      return clients[0].focus();
    }
    // Page not open — open it (this briefly shows Chrome but ensures data saves)
    return self.clients.openWindow(url);
  });
}
