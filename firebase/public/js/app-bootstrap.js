(function (window, document) {
  "use strict";

  const config = window.LOGIFLOW_APP_CONFIG || {};
  const launchShell = document.getElementById("launchShell");
  const appFrame = document.getElementById("logiflowAppFrame");
  const statusElement = document.getElementById("launchStatus");
  const versionElement = document.getElementById("appVersion");

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

  function buildTargetUrl(baseUrl) {
    const target = new URL(baseUrl);
    target.searchParams.set("source", "firebase-hosting");
    target.searchParams.set("appVersion", config.version || "unknown");
    return target.href;
  }

  function showEmbeddedApp(serviceWorkerRegistration) {
    if (!appFrame || !config.apiUrl) {
      setStatus("앱 연결 주소가 설정되지 않았습니다.", true);
      return;
    }

    if (config.launchMode !== "embed") {
      setStatus("지원하지 않는 실행 방식입니다.", true);
      return;
    }

    appFrame.addEventListener("load", function () {
      appFrame.hidden = false;
      if (launchShell) launchShell.hidden = true;
      if (window.LOGIFLOW_NOTIFICATION_SERVICE) {
        window.LOGIFLOW_NOTIFICATION_SERVICE.attach(appFrame, serviceWorkerRegistration);
      }
    }, { once: true });

    appFrame.src = buildTargetUrl(config.apiUrl);
  }

  async function start() {
    if (versionElement) {
      versionElement.textContent = "Version " + (config.version || "-") + " · Build " + (config.buildNumber || "-");
    }

    const serviceWorkerRegistration = await registerServiceWorker();
    if (window.LOGIFLOW_FIREBASE) {
      await window.LOGIFLOW_FIREBASE.initialize().catch(function () { return null; });
    }
    showEmbeddedApp(serviceWorkerRegistration);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})(window, document);
