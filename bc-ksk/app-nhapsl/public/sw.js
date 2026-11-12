/* Service Worker chỉ xử lý thông báo đẩy (Web Push).
 * TUYỆT ĐỐI KHÔNG cài fetch listener và KHÔNG lưu cache dữ liệu người dân trên thiết bị.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json() || {};
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = typeof payload.title === 'string' && payload.title ? payload.title : 'Rà soát hồ sơ KSK';
  const body = typeof payload.body === 'string' ? payload.body : 'Có cập nhật đề nghị chuyển hồ sơ';
  const tag = typeof payload.tag === 'string' && payload.tag ? payload.tag : 'de-nghi-ksk';
  const url = typeof payload.url === 'string' && payload.url ? payload.url : '/kho?tab=de_nghi';

  const showTask = self.registration.showNotification(title, {
    body,
    tag,
    renotify: true,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    vibrate: [200, 100, 200],
    data: { url },
  });

  const notifyClientsTask = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((windowClients) => {
      for (const client of windowClients) {
        try {
          client.postMessage({ type: 'de-nghi-moi', url, tag });
        } catch {
          // ignore
        }
      }
    });

  event.waitUntil(Promise.all([showTask, notifyClientsTask]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification && event.notification.data && event.notification.data.url) || '/kho?tab=de_nghi';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          try {
            await client.focus();
          } catch {
            // ignore focus error
          }
          if ('navigate' in client && typeof client.navigate === 'function') {
            try {
              await client.navigate(targetUrl);
              return;
            } catch {
              // fallback postMessage
            }
          }
          try {
            client.postMessage({ type: 'dieu-huong', url: targetUrl });
            return;
          } catch {
            // ignore
          }
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
