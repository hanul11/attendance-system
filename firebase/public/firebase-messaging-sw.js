"use strict";

// FCM initialization is intentionally deferred until Firebase credentials and
// notification consent rules are approved. The main service worker imports
// this file so future messaging support uses a single worker scope.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL("/?source=notification", self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existingWindow = windows.find((client) => client.url.startsWith(self.location.origin));
      return existingWindow ? existingWindow.focus() : clients.openWindow(targetUrl);
    })
  );
});
