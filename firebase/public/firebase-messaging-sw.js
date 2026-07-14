"use strict";

// Firebase Messaging initialization and background delivery are connected in
// the next sprint after a Firebase project and VAPID key have been issued.
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
