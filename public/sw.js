// Service Worker to enable native Android Chrome push notification support
self.addEventListener('push', function(event) {
  // Can be expanded to handle Push API notifications later if needed
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  // Focus or open the Admin Dashboard when notification is clicked
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
