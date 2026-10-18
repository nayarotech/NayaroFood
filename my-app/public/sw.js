/**
 * Nayaro Food service worker.
 *
 * This is what makes a new order reach a restaurant when the dashboard is
 * closed. The browser's push service wakes this worker even with no tab open,
 * which is precisely what a WebSocket cannot do — a socket dies with the page.
 */

self.addEventListener('install', () => {
  // Take over immediately rather than waiting for existing tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Nayaro Food', body: event.data ? event.data.text() : 'New activity' };
  }

  const title = payload.title || 'New order';
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    // Same tag replaces an earlier alert for the same order instead of stacking.
    tag: payload.tag || 'nayaro-order',
    renotify: true,
    requireInteraction: true,
    data: { url: payload.url || '/dashboard/orders', orderId: payload.orderId },
    actions: [{ action: 'open', title: 'View order' }],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/dashboard/orders';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reuse an open tab of this app (dashboard, rider app …) rather than opening a duplicate.
      const area = new URL(target, self.location.origin).pathname.split('/')[1];
      for (const client of clients) {
        const path = new URL(client.url).pathname;
        if (path.split('/')[1] === area && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
