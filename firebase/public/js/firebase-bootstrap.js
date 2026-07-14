(function (window) {
  "use strict";

  const FIREBASE_SDK_VERSION = "12.16.0";
  let servicesPromise = null;

  function getConfig() {
    return window.LOGIFLOW_FIREBASE_CONFIG || {};
  }

  function hasRequiredConfig(config) {
    return Boolean(
      config.enabled === true &&
      config.apiKey && !config.apiKey.startsWith("YOUR_") &&
      config.projectId && !config.projectId.startsWith("YOUR_") &&
      config.appId && !config.appId.startsWith("YOUR_") &&
      config.vapidKey && !config.vapidKey.startsWith("YOUR_")
    );
  }

  async function loadServices() {
    const config = getConfig();
    if (!hasRequiredConfig(config)) {
      return { enabled: false, reason: "not-configured" };
    }

    if (!servicesPromise) {
      servicesPromise = Promise.all([
        import("https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION + "/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION + "/firebase-messaging.js")
      ]).then(async function (modules) {
        const appModule = modules[0];
        const messagingModule = modules[1];
        const supported = await messagingModule.isSupported();

        if (!supported) {
          return { enabled: false, reason: "messaging-not-supported" };
        }

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

        return {
          enabled: true,
          config: config,
          messaging: messagingModule.getMessaging(app),
          getToken: messagingModule.getToken,
          onMessage: messagingModule.onMessage
        };
      });
    }

    return servicesPromise;
  }

  async function getRegistrationToken(serviceWorkerRegistration) {
    const services = await loadServices();
    if (!services.enabled) return services;

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
    services.onMessage(services.messaging, listener);
    return { enabled: true };
  }

  window.LOGIFLOW_FIREBASE = Object.freeze({
    initialize: loadServices,
    getRegistrationToken: getRegistrationToken,
    listenForeground: listenForeground,
    isConfigured: function () {
      return hasRequiredConfig(getConfig());
    }
  });
})(window);
