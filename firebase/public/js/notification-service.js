(function (window) {
  "use strict";

  const INSTALL_ID_KEY = "logiflow.nativeInstallId";
  const REGISTRATION_TIMEOUT_MS = 4000;
  let memoryInstallId = null;

  function withTimeout(operation, state) {
    let timeoutId = null;
    const timeout = new Promise(function (resolve) {
      timeoutId = window.setTimeout(function () {
        state.active = false;
        resolve(null);
      }, REGISTRATION_TIMEOUT_MS);
    });
    const result = Promise.resolve().then(operation).catch(function () {
      return null;
    });
    return Promise.race([result, timeout]).finally(function () {
      window.clearTimeout(timeoutId);
    });
  }

  function getFirebaseConfig() {
    return window.LOGIFLOW_FIREBASE_CONFIG || {};
  }

  function isRegistrationUrlConfigured(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.href.includes("YOUR_");
    } catch (error) {
      return false;
    }
  }

  function isNativePlatform() {
    return window.Capacitor?.isNativePlatform?.() === true;
  }

  function getNativeMessagingPlugin() {
    if (!isNativePlatform()) return null;
    return window.Capacitor?.Plugins?.FirebaseMessaging || null;
  }

  function readInstallId() {
    try {
      return window.localStorage?.getItem(INSTALL_ID_KEY) || null;
    } catch (error) {
      return null;
    }
  }

  function writeInstallId(value) {
    try {
      window.localStorage?.setItem(INSTALL_ID_KEY, value);
    } catch (error) {
      return;
    }
  }

  function getOrCreateInstallId() {
    if (memoryInstallId) return memoryInstallId;
    const stored = readInstallId();
    if (stored) {
      memoryInstallId = stored;
      return stored;
    }
    if (typeof window.crypto?.randomUUID !== "function") return null;
    memoryInstallId = window.crypto.randomUUID();
    writeInstallId(memoryInstallId);
    return memoryInstallId;
  }

  async function getNativeToken(plugin) {
    let permission = await plugin.checkPermissions();
    if (["prompt", "prompt-with-rationale"].includes(permission?.receive)) {
      permission = await plugin.requestPermissions();
    }
    if (permission?.receive !== "granted") return null;
    const result = await plugin.getToken();
    return result?.token || null;
  }

  function supportsWebPush() {
    return Boolean(
      "Notification" in window &&
      "serviceWorker" in window.navigator &&
      window.LOGIFLOW_FIREBASE?.isWebMessagingConfigured?.()
    );
  }

  async function getWebToken(options) {
    if (!supportsWebPush()) return null;
    let permission = window.Notification.permission;
    if (permission === "default" && options.userInitiated === true) {
      permission = await window.Notification.requestPermission();
    }
    if (permission !== "granted") return null;
    const registration = options.serviceWorkerRegistration || await window.navigator.serviceWorker.ready;
    const result = await window.LOGIFLOW_FIREBASE.getRegistrationToken(registration);
    return result?.enabled ? result.token || null : null;
  }

  async function registerInstallation(input) {
    const config = getFirebaseConfig();
    const response = await window.fetch(config.registrationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + input.idToken
      },
      body: JSON.stringify({
        installId: input.installId,
        token: input.token,
        platform: input.platform,
        appVersion: window.LOGIFLOW_APP_CONFIG?.version || "unknown"
      })
    });
    if (!response.ok) throw new Error("Notification installation registration failed");
  }

  async function registerWithinTimeout(options, state) {
    try {
      const config = getFirebaseConfig();
      if (!window.LOGIFLOW_FIREBASE?.isConfigured?.()) return null;
      if (!isRegistrationUrlConfigured(config.registrationUrl)) return null;

      const native = isNativePlatform();
      const nativeMessaging = getNativeMessagingPlugin();
      if (native && !nativeMessaging) return null;
      if (!native && !supportsWebPush()) return null;

      const authentication = await window.LOGIFLOW_FIREBASE.getAnonymousIdToken();
      if (!state.active) return null;
      if (!authentication?.enabled || !authentication.idToken) return null;

      const launchOptions = options || {};
      const token = native
        ? await getNativeToken(nativeMessaging)
        : await getWebToken(launchOptions);
      if (!state.active) return null;
      if (!token) return null;

      const installId = getOrCreateInstallId();
      if (!installId) return null;
      await registerInstallation({
        idToken: authentication.idToken,
        installId: installId,
        token: token,
        platform: native ? window.Capacitor.getPlatform() : "web"
      });
      return state.active ? installId : null;
    } catch (error) {
      return null;
    }
  }

  function registerForLaunch(options) {
    const state = { active: true };
    return withTimeout(function () {
      return registerWithinTimeout(options, state);
    }, state);
  }

  window.LOGIFLOW_NOTIFICATION_SERVICE = Object.freeze({
    registerForLaunch: registerForLaunch
  });
})(window);
