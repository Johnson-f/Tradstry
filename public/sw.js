self.addEventListener('push', (event) => {
  let payload = {};
  try {
    if (event.data) payload = event.data.json();
  } catch {}
  const title = payload.title || 'Tradstry';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    data: { url: payload.url || '/', ...payload.data },
    tag: payload.tag || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification && event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      let client = allClients.find((c) => 'focus' in c && c.url.includes(self.registration.scope));
      if (client) {
        await client.focus();
        client.navigate(url).catch(() => {});
      } else {
        await clients.openWindow(url);
      }
    })()
  );
});


