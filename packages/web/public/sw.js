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

  const targetUrl = resolveNotificationTargetUrl(event.notification.data);

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    const exactMatch = windowClients.find((client) => client.url === targetUrl);
    if (exactMatch && 'focus' in exactMatch) {
      await exactMatch.focus();
      return;
    }

    const appClient = windowClients.find((client) => {
      try {
        return new URL(client.url).origin === self.location.origin;
      } catch (_error) {
        return false;
      }
    });

    if (appClient && 'focus' in appClient) {
      if ('navigate' in appClient && appClient.url !== targetUrl) {
        await appClient.navigate(targetUrl);
      }
      await appClient.focus();
      return;
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

function resolveNotificationTargetUrl(data) {
  const relativeUrl = data?.url || (data?.eventId ? `/event/${data.eventId}` : '/');

  try {
    return new URL(relativeUrl, self.location.origin).toString();
  } catch (_error) {
    return new URL('/', self.location.origin).toString();
  }
}
