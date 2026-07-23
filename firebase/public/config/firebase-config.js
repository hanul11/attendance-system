"use strict";

globalThis.LOGIFLOW_FIREBASE_CONFIG = Object.freeze({
  enabled: false,
  features: Object.freeze({
    authentication: false,
    messaging: false,
    firestore: false
  }),
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_FIREBASE_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_FIREBASE_PROJECT_ID",
  storageBucket: "YOUR_FIREBASE_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
  appId: "YOUR_FIREBASE_APP_ID",
  vapidKey: "YOUR_FIREBASE_WEB_PUSH_VAPID_KEY",
  registrationUrl: "https://asia-northeast3-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/registerNotificationInstallation"
});
