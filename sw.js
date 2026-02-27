// Service Worker v12 — Pill Reminder
const CACHE_NAME = 'pill-reminder-v12';
const TAKEN_CACHE = 'pill-taken-flags';
const ASSETS = ['./index.html', './manifest.json'];

// Helper: get today's date key in LOCAL time
function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Helper: check if pill was taken today via cache flag
function wasPillTakenToday() {
    return caches.open(TAKEN_CACHE).then((cache) => {
        return cache.match('/pill-taken-' + todayKey()).then((r) => !!r);
    }).catch(() => false);
}

// Helper: mark pill as taken today in cache
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
            Promise.all(
                keys.filter((k) => k !== CACHE_NAME && k !== TAKEN_CACHE)
                    .map((k) => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// =============================================================
// Push handler
// Chrome Android REQUIRES every push to show a visible notification.
// If pill is already taken, show a brief "already logged" notification
// instead of trying to suppress (which causes "updated in background").
// =============================================================
self.addEventListener('push', (event) => {
    event.waitUntil(
        wasPillTakenToday().then((taken) => {
            if (taken) {
                // Pill already taken — show a real but low-priority notification
                // This satisfies Chrome's requirement without being annoying
                return self.registration.showNotification('Pill already taken today', {
                    body: 'No action needed.',
                    tag: 'pill-reminder-done',
                    silent: true,
                    requireInteraction: false
                });
            }

            // Pill NOT taken — show the real reminder
            return self.registration.showNotification('\uD83D\uDC8A Take your pill!', {
                body: 'Tap this notification to confirm you took it.',
                requireInteraction: true,
                tag: 'pill-reminder',
                renotify: true,
                actions: [
                    { action: 'took-pill', title: 'Took it!' }
                ]
            });
        })
    );
});

// =============================================================
// Notification click — mark as taken + open/navigate the app
// =============================================================
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    // If it's the "already done" notification, just close it
    if (event.notification.tag === 'pill-reminder-done') {
        return;
    }

    event.waitUntil(
        markPillTaken().then(() => {
            return self.clients.matchAll({ type: 'window' }).then((clients) => {
                // Try to reuse an existing window
                for (const client of clients) {
                    if ('navigate' in client) {
                        return client.navigate('./index.html?taken=true').then((c) => c ? c.focus() : null);
                    }
                }
                // No existing window — open a new one
                return self.clients.openWindow('./index.html?taken=true');
            });
        })
    );
});

// Network first, fall back to cache
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
