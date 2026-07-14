(function (window, document) {
  "use strict";

  const MESSAGE_VERSION = 1;
  let appFrame = null;
  let appTargetOrigin = "*";
  let serviceWorkerRegistration = null;
  let pendingRequest = null;

  function isTrustedOrigin(origin) {
    const trusted = window.LOGIFLOW_APP_CONFIG?.trustedAppOrigins || [];
    return trusted.includes(origin);
  }

  function postToApp(type, payload) {
    if (!appFrame?.contentWindow) return;
    appFrame.contentWindow.postMessage({
      source: "logiflow-host",
      version: MESSAGE_VERSION,
      type: type,
      payload: payload || {}
    }, appTargetOrigin);
  }

  function normalizePreferences(preferences) {
    const source = preferences || {};
    return {
      checkin: source.checkin !== false,
      checkout: source.checkout !== false
    };
  }

  function setPermissionPromptVisible(visible) {
    const prompt = document.getElementById("notificationPermissionPrompt");
    if (prompt) prompt.hidden = !visible;
  }

  function getNativeMessagingPlugin() {
    return window.Capacitor?.Plugins?.FirebaseMessaging || null;
  }

  async function issueNativeToken(request, plugin) {
    let permission = await plugin.checkPermissions();
    if (permission.receive === "prompt") {
      permission = await plugin.requestPermissions();
    }
    if (permission.receive !== "granted") {
      postToApp("LOGIFLOW_NOTIFICATION_STATUS", { status: "permission-denied" });
      return;
    }

    const result = await plugin.getToken();
    if (!result?.token) {
      postToApp("LOGIFLOW_NOTIFICATION_STATUS", { status: "token-unavailable" });
      return;
    }

    postToApp("LOGIFLOW_NOTIFICATION_TOKEN", {
      employeeId: request.employeeId,
      token: result.token,
      preferences: normalizePreferences(request.preferences),
      platform: window.Capacitor?.getPlatform?.() || "native",
      appVersion: window.LOGIFLOW_APP_CONFIG?.version || "unknown"
    });
  }

  async function issueToken(request) {
    const preferences = normalizePreferences(request.preferences);
    if (!preferences.checkin && !preferences.checkout) {
      postToApp("LOGIFLOW_NOTIFICATION_PREFERENCES", {
        employeeId: request.employeeId,
        preferences: preferences
      });
      return;
    }

    const nativeMessaging = getNativeMessagingPlugin();
    if (nativeMessaging) {
      await issueNativeToken(request, nativeMessaging);
      return;
    }

    if (!window.LOGIFLOW_FIREBASE?.isConfigured()) {
      postToApp("LOGIFLOW_NOTIFICATION_STATUS", { status: "not-configured" });
      return;
    }

    if (!("Notification" in window)) {
      postToApp("LOGIFLOW_NOTIFICATION_STATUS", { status: "not-supported" });
      return;
    }

    if (Notification.permission === "default") {
      pendingRequest = request;
      setPermissionPromptVisible(true);
      return;
    }

    if (Notification.permission !== "granted") {
      postToApp("LOGIFLOW_NOTIFICATION_STATUS", { status: "permission-denied" });
      return;
    }

    const result = await window.LOGIFLOW_FIREBASE.getRegistrationToken(serviceWorkerRegistration);
    if (!result.enabled || !result.token) {
      postToApp("LOGIFLOW_NOTIFICATION_STATUS", { status: result.reason || "token-unavailable" });
      return;
    }

    postToApp("LOGIFLOW_NOTIFICATION_TOKEN", {
      employeeId: request.employeeId,
      token: result.token,
      preferences: preferences,
      platform: navigator.userAgent,
      appVersion: window.LOGIFLOW_APP_CONFIG?.version || "unknown"
    });
  }

  async function requestPermissionFromPrompt() {
    setPermissionPromptVisible(false);
    const request = pendingRequest;
    pendingRequest = null;
    if (!request) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      postToApp("LOGIFLOW_NOTIFICATION_STATUS", { status: "permission-denied" });
      return;
    }
    await issueToken(request);
  }

  function handleMessage(event) {
    if (!appFrame || event.source !== appFrame.contentWindow || !isTrustedOrigin(event.origin)) return;
    appTargetOrigin = event.origin;
    const message = event.data || {};
    if (message.source !== "logiflow-app" || message.version !== MESSAGE_VERSION) return;

    if (message.type === "LOGIFLOW_NOTIFICATION_REGISTER") {
      issueToken(message.payload || {}).catch(function () {
        postToApp("LOGIFLOW_NOTIFICATION_STATUS", { status: "registration-failed" });
      });
    }
  }

  function attach(frame, registration) {
    appFrame = frame;
    serviceWorkerRegistration = registration;
    postToApp("LOGIFLOW_NOTIFICATION_READY", {
      configured: Boolean(window.LOGIFLOW_FIREBASE?.isConfigured()),
      version: window.LOGIFLOW_APP_CONFIG?.version || "unknown",
      buildNumber: window.LOGIFLOW_APP_CONFIG?.buildNumber || "unknown"
    });

    window.LOGIFLOW_FIREBASE?.listenForeground(function (payload) {
      postToApp("LOGIFLOW_NOTIFICATION_FOREGROUND", payload?.data || {});
    }).catch(function () { return null; });

    const nativeMessaging = getNativeMessagingPlugin();
    nativeMessaging?.addListener("notificationReceived", function (event) {
      postToApp("LOGIFLOW_NOTIFICATION_FOREGROUND", event?.notification?.data || {});
    });
  }

  window.addEventListener("message", handleMessage);
  document.getElementById("notificationPermissionBtn")?.addEventListener("click", function () {
    requestPermissionFromPrompt().catch(function () {
      postToApp("LOGIFLOW_NOTIFICATION_STATUS", { status: "permission-failed" });
    });
  });
  document.getElementById("notificationPermissionCancelBtn")?.addEventListener("click", function () {
    pendingRequest = null;
    setPermissionPromptVisible(false);
  });

  window.LOGIFLOW_NOTIFICATION_SERVICE = Object.freeze({ attach: attach });
})(window, document);
