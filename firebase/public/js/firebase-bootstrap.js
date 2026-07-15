(function (window) {
  "use strict";

  const FIREBASE_SDK_VERSION = "12.16.0";
  let servicesPromise = null;

  function getConfig() {
    return window.LOGIFLOW_FIREBASE_CONFIG || {};
  }

  function featureEnabled(config, feature) {
    return config.features?.[feature] === true;
  }

  function hasBaseConfig(config) {
    return Boolean(
      config.enabled === true &&
      config.apiKey && !config.apiKey.startsWith("YOUR_") &&
      config.projectId && !config.projectId.startsWith("YOUR_") &&
      config.appId && !config.appId.startsWith("YOUR_")
    );
  }

  function hasMessagingConfig(config) {
    return Boolean(
      hasBaseConfig(config) &&
      featureEnabled(config, "messaging") &&
      config.vapidKey && !config.vapidKey.startsWith("YOUR_")
    );
  }

  async function loadServices() {
    const config = getConfig();
    if (!hasBaseConfig(config)) {
      return { enabled: false, reason: "not-configured" };
    }

    if (!servicesPromise) {
      servicesPromise = Promise.all([
        import("https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION + "/firebase-app.js"),
        featureEnabled(config, "authentication")
          ? import("https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION + "/firebase-auth.js")
          : null,
        featureEnabled(config, "firestore")
          ? import("https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION + "/firebase-firestore.js")
          : null,
        hasMessagingConfig(config)
          ? import("https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION + "/firebase-messaging.js")
          : null
      ]).then(async function (modules) {
        const appModule = modules[0];
        const authModule = modules[1];
        const firestoreModule = modules[2];
        const messagingModule = modules[3];
        const app = appModule.getApps().length
          ? appModule.getApp()
          : appModule.initializeApp({
              apiKey: config.apiKey,
              authDomain: config.authDomain,
              projectId: config.projectId,
              storageBucket: config.storageBucket,
              messagingSenderId: config.messagingSenderId,
              appId: config.appId
            });
        const messagingSupported = messagingModule
          ? await messagingModule.isSupported()
          : false;

        return {
          enabled: true,
          config: config,
          app: app,
          auth: authModule ? authModule.getAuth(app) : null,
          firestore: firestoreModule ? firestoreModule.getFirestore(app) : null,
          messagingEnabled: messagingSupported,
          messaging: messagingSupported ? messagingModule.getMessaging(app) : null,
          getToken: messagingSupported ? messagingModule.getToken : null,
          onMessage: messagingSupported ? messagingModule.onMessage : null
        };
      });
    }

    return servicesPromise;
  }

  async function getRegistrationToken(serviceWorkerRegistration) {
    const services = await loadServices();
    if (!services.enabled) return services;
    if (!services.messagingEnabled) return { enabled: false, reason: "messaging-not-configured" };

    const token = await services.getToken(services.messaging, {
      vapidKey: services.config.vapidKey,
      serviceWorkerRegistration: serviceWorkerRegistration
    });

    return token
      ? { enabled: true, token: token }
      : { enabled: false, reason: "token-unavailable" };
  }

  async function listenForeground(listener) {
    const services = await loadServices();
    if (!services.enabled) return services;
    if (!services.messagingEnabled) return { enabled: false, reason: "messaging-not-configured" };
    services.onMessage(services.messaging, listener);
    return { enabled: true };
  }

  window.LOGIFLOW_FIREBASE = Object.freeze({
    initialize: loadServices,
    getServices: loadServices,
    getRegistrationToken: getRegistrationToken,
    listenForeground: listenForeground,
    isConfigured: function () {
      return hasMessagingConfig(getConfig());
    }
  });
})(window);
