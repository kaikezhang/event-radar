self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);
  const title = payload.title || 'Event Radar';
  const body = payload.body || 'A new alert is available.';
  const url = payload.url || '/';

  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag: payload.tag || 'event-radar',
    data: {
      url,
      eventId: payload.eventId || null,
      source: payload.source || null,
      severity: payload.severity || null,
      ticker: payload.ticker || null,
    },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const relativeUrl = event.notification.data?.url || '/';
  const targetUrl = new URL(relativeUrl, self.location.origin).toString();

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    for (const client of windowClients) {
      if ('focus' in client) {
        if ('navigate' in client) {
          await client.navigate(targetUrl);
        }
        await client.focus();
        return;
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});

function parsePushPayload(event) {
  if (!event.data) {
    return {};
  }

  try {
    return event.data.json();
  } catch (_error) {
    return {
      body: event.data.text(),
    };
  }
}
