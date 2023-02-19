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

  const { url, text } = JSON.parse(event.data.text());

  let title = 'snd.one';
  let body = text;
  try {
    const jsonBody = JSON.parse(text);
    title = jsonBody.title;
    body = jsonBody.text ?? jsonBody.contents ?? jsonBody.body ?? jsonBody.message ?? jsonBody;
  } catch (_e) {
    // Assuming this is a JSON parse error
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      tag: url,
      body,
      data: { url },
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
  const url = new URL(notification.data.url);

  for (const client of clients) {
    const clientURL = new URL(client.url, 'https://snd.one');
    if (clientURL.pathname === url.pathname) {
      return client.focus();
    }
  }

  return self.clients.openWindow(url.pathname);
}