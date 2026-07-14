"use strict";

importScripts("/config/firebase-config.js");

const firebaseConfig = self.LOGIFLOW_FIREBASE_CONFIG || {};
const firebaseConfigured = firebaseConfig.enabled === true &&
  firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("YOUR_") &&
  firebaseConfig.projectId && !firebaseConfig.projectId.startsWith("YOUR_") &&
  firebaseConfig.appId && !firebaseConfig.appId.startsWith("YOUR_");

if (firebaseConfigured) {
  importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js");

  firebase.initializeApp({
    apiKey: firebaseConfig.apiKey,
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId
  });

  firebase.messaging().onBackgroundMessage((payload) => {
    if (payload.notification) return;
    const data = payload.data || {};
    self.registration.showNotification(data.title || "LOGIFLOW", {
      body: data.body || "근태 기록을 확인해 주세요.",
      icon: "/assets/icons/icon-192.png",
      badge: "/assets/icons/icon-192.png",
      tag: data.notificationKey || "logiflow-attendance",
      renotify: false,
      data: {
        url: data.url || "/?route=home&source=notification"
      }
    });
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = event.notification.data?.url || "/?route=home&source=notification";
  const targetUrl = new URL(requestedUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existingWindow = windows.find((client) => client.url.startsWith(self.location.origin));
      if (existingWindow) {
        existingWindow.navigate(targetUrl);
        return existingWindow.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});
