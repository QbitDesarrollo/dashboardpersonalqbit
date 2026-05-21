const CACHE_NAME = 'tiusdei-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return;
  if (event.request.url.includes('/socket.io/')) return;

  event.respondWith(
    fetch(event.request).then((response) => {
      if (response && response.status === 200) return response;
      return response;
    }).catch(() => {
      // For navigation requests (SPA), fallback to index.html
      if (event.request.mode === 'navigate') {
        return caches.match('/index.html') || fetch('/index.html');
      }
      return caches.match(event.request);
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if (event.notification.data?.type === 'chat') {
            client.postMessage({ type: 'open-desk-chat', deskName: event.notification.data.deskName || '' });
          }
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
