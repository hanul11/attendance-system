(function (window) {
  "use strict";

  function hasRequiredConfig(config) {
    return Boolean(
      config &&
      config.enabled === true &&
      config.apiKey &&
      config.projectId &&
      config.appId
    );
  }

  function initialize() {
    const config = window.LOGIFLOW_FIREBASE_CONFIG;

    if (!hasRequiredConfig(config)) {
      return Promise.resolve({ enabled: false, reason: "not-configured" });
    }

    return Promise.resolve({ enabled: true, reason: "sdk-not-connected" });
  }

  window.LOGIFLOW_FIREBASE = Object.freeze({
    initialize: initialize,
    isConfigured: function () {
      return hasRequiredConfig(window.LOGIFLOW_FIREBASE_CONFIG);
    }
  });
})(window);
