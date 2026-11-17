// Foreground website alerts only. No cache, push subscription, or customer data storage.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL('./login.html', self.location.href);
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = tabs.find(tab => new URL(tab.url).origin === target.origin && new URL(tab.url).pathname === target.pathname);
    if (existing) return existing.focus();
    return self.clients.openWindow(target.href);
  })());
});
