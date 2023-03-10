self.addEventListener('push', function(event) {
  const icons = {
    icon: '/favicon.svg',
    badge: '/badge.svg',
  };

  if (!event.data) {
    event.waitUntil(
      self.registration.showNotification('Event with no data?', {
        body: 'Received an empty event via snd.one. Tap to unsubscribe.',
        ...icons,
      })
    );
    return;
  }

  const payload = JSON.parse(event.data.text());

  let title = 'snd.one';
  let body = payload.text;
  try {
    const jsonBody = JSON.parse(payload.text);
    title = jsonBody.title;
    body = jsonBody.text ?? jsonBody.contents ?? jsonBody.body ?? jsonBody.message ?? jsonBody;
  } catch (_e) {
    // Assuming this is a JSON parse error
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      tag: payload.url ?? 'snd.one',
      body,
      data: { url: payload.url, link: payload.link },
      ...icons,
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.waitUntil(openLink(event.notification));
});

async function openLink(notification) {
  const clients = await self.clients.matchAll({
    includeUncontrolled: true,
    type: 'window'
  });

  notification.close();
  if (!notification.data.url) return;

  const url = new URL(notification.data.url);
  const link = notification.data.link;

  for (const client of clients) {
    const clientURL = new URL(client.url, 'https://snd.one');
    if (clientURL.pathname === url.pathname && client.navigate) {
      if (link) {
        client.postMessage({ link: link });
      } else {
        client.navigate(url.toString());
      }
      return client.focus();
    }
  }

  const client = await self.clients.openWindow(url.toString());
  if (link) {
    client.postMessage({ link: link });
  }
}