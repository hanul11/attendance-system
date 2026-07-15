(function (window, document) {
  "use strict";

  const config = window.LOGIFLOW_APP_CONFIG || {};
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

  function redirectToApp() {
    if (!config.apiUrl) {
      setStatus("연결 주소가 설정되지 않았습니다.", true);
      return;
    }

    if (config.launchMode !== "redirect") {
      setStatus("지원하지 않는 실행 방식입니다.", true);
      return;
    }

    window.location.replace(buildTargetUrl(config.apiUrl));
  }

  async function start() {
    if (versionElement) {
      versionElement.textContent = "Version " + (config.version || "-") + " · Build " + (config.buildNumber || "-");
    }

    await registerServiceWorker();
    redirectToApp();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})(window, document);
