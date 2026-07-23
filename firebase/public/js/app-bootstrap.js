(function (window, document) {
  "use strict";

  const config = window.LOGIFLOW_APP_CONFIG || {};
  const statusElement = document.getElementById("launchStatus");
  const versionElement = document.getElementById("appVersion");
  const launchButton = document.getElementById("launchButton");
  const launchLoader = document.getElementById("launchLoader");
  const NOTIFICATION_TIMEOUT_MS = 4000;
  let serviceWorkerRegistration = null;
  let launching = false;
  let redirected = false;

  function setStatus(message, isError) {
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.classList.toggle("is-error", Boolean(isError));
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || !config.serviceWorkerPath) {
      return Promise.resolve(null);
    }
    return navigator.serviceWorker.register(config.serviceWorkerPath).catch(function () {
      return null;
    });
  }

  function buildTargetUrl(baseUrl, installId) {
    const target = new URL(baseUrl);
    if (installId) target.searchParams.set("nativeInstallId", installId);
    return target.href;
  }

  function registerNotificationsWithTimeout(userInitiated) {
    let timeoutId = null;
    const timeout = new Promise(function (resolve) {
      timeoutId = window.setTimeout(function () {
        resolve(null);
      }, NOTIFICATION_TIMEOUT_MS);
    });
    const registration = Promise.resolve().then(function () {
      return window.LOGIFLOW_NOTIFICATION_SERVICE?.registerForLaunch({
        serviceWorkerRegistration: serviceWorkerRegistration,
        userInitiated: userInitiated === true
      });
    }).catch(function () {
      return null;
    });
    return Promise.race([registration, timeout]).finally(function () {
      window.clearTimeout(timeoutId);
    });
  }

  function moveToApp(installId) {
    if (redirected) return;
    redirected = true;
    window.location.replace(buildTargetUrl(config.apiUrl, installId));
  }

  async function redirectToApp(userInitiated) {
    if (launching) return;
    if (!config.apiUrl) {
      setStatus("연결 주소가 설정되지 않았습니다.", true);
      return;
    }
    if (config.launchMode !== "redirect") {
      setStatus("지원하지 않는 실행 방식입니다.", true);
      return;
    }

    launching = true;
    if (launchButton) launchButton.disabled = true;
    if (launchLoader) launchLoader.hidden = false;
    setStatus("앱을 준비하고 있습니다.", false);

    let installId = null;
    try {
      installId = await registerNotificationsWithTimeout(userInitiated);
    } catch (error) {
      installId = null;
    }
    moveToApp(installId);
  }

  function isStandalone() {
    return Boolean(
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      navigator.standalone === true
    );
  }

  function isNativePlatform() {
    return window.Capacitor?.isNativePlatform?.() === true;
  }

  function showLaunchScreen() {
    if (launchLoader) launchLoader.hidden = true;
    if (launchButton) {
      launchButton.hidden = false;
      launchButton.addEventListener("click", function () {
        return redirectToApp(true);
      }, { once: true });
    }
    setStatus(isNativePlatform()
      ? "알림 설정 후 근태 앱으로 이동합니다."
      : "홈 화면에 추가한 뒤 아이콘으로 실행해 주세요.", false);
  }

  async function start() {
    if (versionElement) {
      versionElement.textContent = "Version " + (config.version || "-") + " · Build " + (config.buildNumber || "-");
    }
    serviceWorkerRegistration = await registerServiceWorker();
    if (isNativePlatform()) {
      showLaunchScreen();
      return;
    }
    if (isStandalone()) {
      await redirectToApp(false);
      return;
    }
    showLaunchScreen();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})(window, document);
