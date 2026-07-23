import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");
const notificationSource = read("firebase/public/js/notification-service.js");
const bootstrapSource = read("firebase/public/js/app-bootstrap.js");
const firebaseSource = read("firebase/public/js/firebase-bootstrap.js");
const firebaseConfigSource = read("firebase/public/config/firebase-config.js");
const html = read("firebase/public/index.html");
const mobilePackage = JSON.parse(read("mobile/package.json"));
const passes = [];
const failures = [];

async function check(name, test) {
  try {
    await test();
    passes.push(name);
  } catch (error) {
    failures.push({ name, detail: error.message });
  }
}

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

function runBrowserScript(source, additions = {}) {
  const context = {
    URL,
    console,
    Promise,
    setTimeout,
    clearTimeout,
    ...additions
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "browser-script.js" });
  return context;
}

function createNativeNotificationContext({ configured = true, fetchOk = true, getAnonymousIdToken, timers } = {}) {
  const calls = [];
  const installId = "123e4567-e89b-42d3-a456-426614174000";
  const context = runBrowserScript(notificationSource, {
    LOGIFLOW_APP_CONFIG: { version: "1.0.0" },
    LOGIFLOW_FIREBASE_CONFIG: {
      enabled: configured,
      registrationUrl: configured
        ? "https://asia-northeast3-example.cloudfunctions.net/registerNotificationInstallation"
        : "https://asia-northeast3-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/registerNotificationInstallation"
    },
    LOGIFLOW_FIREBASE: {
      isConfigured: () => configured,
      getAnonymousIdToken: getAnonymousIdToken || (async () => {
        calls.push("anonymous-auth");
        return { enabled: true, idToken: "firebase-id-token" };
      })
    },
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => "android",
      Plugins: {
        FirebaseMessaging: {
          checkPermissions: async () => {
            calls.push("check-permission");
            return { receive: "prompt" };
          },
          requestPermissions: async () => {
            calls.push("request-permission");
            return { receive: "granted" };
          },
          getToken: async () => {
            calls.push("get-token");
            return { token: "fcm-token" };
          }
        }
      }
    },
    crypto: { randomUUID: () => installId },
    localStorage: createStorage(),
    navigator: { userAgent: "qa-browser" },
    fetch: async (url, options) => {
      calls.push("register-installation");
      return {
        ok: fetchOk,
        status: fetchOk ? 200 : 503,
        json: async () => ({ ok: fetchOk })
      };
    },
    ...(timers || {})
  });
  return { context, calls, installId };
}

function createBootstrapContext(registerForLaunch, timers = {}) {
  const listeners = {};
  const redirects = [];
  const elements = {
    launchStatus: { textContent: "", classList: { toggle() {} } },
    appVersion: { textContent: "" },
    launchButton: {
      hidden: true,
      disabled: false,
      addEventListener(type, listener) { listeners[type] = listener; }
    },
    launchLoader: { hidden: false }
  };
  const context = runBrowserScript(bootstrapSource, {
    LOGIFLOW_APP_CONFIG: {
      apiUrl: "https://script.google.com/macros/s/example/exec",
      version: "1.0.0",
      buildNumber: "1",
      launchMode: "redirect"
    },
    LOGIFLOW_NOTIFICATION_SERVICE: { registerForLaunch },
    Capacitor: { isNativePlatform: () => true },
    document: {
      readyState: "complete",
      getElementById: (id) => elements[id] || null,
      addEventListener() {}
    },
    navigator: {},
    location: { replace: (url) => redirects.push(url) },
    ...timers
  });
  return { context, elements, listeners, redirects };
}

const settleBootstrap = () => new Promise((resolve) => setTimeout(resolve, 0));

await check("Native registration follows auth, permission, token and API order", async () => {
  const { context, calls, installId } = createNativeNotificationContext();
  const result = await context.LOGIFLOW_NOTIFICATION_SERVICE.registerForLaunch();
  assert.equal(result, installId);
  assert.deepEqual(calls, [
    "anonymous-auth",
    "check-permission",
    "request-permission",
    "get-token",
    "register-installation"
  ]);
});

await check("Native registration sends UUID install ID and bearer token", async () => {
  const { context, installId } = createNativeNotificationContext();
  let request;
  context.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ ok: true }) };
  };
  assert.equal(await context.LOGIFLOW_NOTIFICATION_SERVICE.registerForLaunch(), installId);
  assert.equal(request.options.headers.Authorization, "Bearer firebase-id-token");
  assert.deepEqual(JSON.parse(request.options.body), {
    installId,
    token: "fcm-token",
    platform: "android",
    appVersion: "1.0.0"
  });
});

await check("Placeholder Firebase config skips registration without blocking", async () => {
  const { context, calls } = createNativeNotificationContext({ configured: false });
  assert.equal(await context.LOGIFLOW_NOTIFICATION_SERVICE.registerForLaunch(), null);
  assert.deepEqual(calls, []);
});

await check("Registration failure returns a fail-open result", async () => {
  const { context } = createNativeNotificationContext({ fetchOk: false });
  assert.equal(await context.LOGIFLOW_NOTIFICATION_SERVICE.registerForLaunch(), null);
});

await check("Notification registration has a bounded timeout", async () => {
  const pendingTimers = [];
  const context = createNativeNotificationContext({
    getAnonymousIdToken: () => new Promise(() => {}),
    timers: {
      setTimeout: (callback, delay) => {
        pendingTimers.push({ callback, delay });
        return pendingTimers.length;
      },
      clearTimeout() {}
    }
  }).context;
  const registration = context.LOGIFLOW_NOTIFICATION_SERVICE.registerForLaunch();
  assert.equal(pendingTimers.length, 1);
  assert.equal(pendingTimers[0].delay, 4000);
  pendingTimers[0].callback();
  assert.equal(await registration, null);
});

await check("Unsupported browser quietly skips Web Push", async () => {
  let fetched = false;
  const context = runBrowserScript(notificationSource, {
    LOGIFLOW_APP_CONFIG: { version: "1.0.0" },
    LOGIFLOW_FIREBASE_CONFIG: {
      enabled: true,
      registrationUrl: "https://example.test/register"
    },
    LOGIFLOW_FIREBASE: {
      isConfigured: () => true,
      isWebMessagingConfigured: () => true
    },
    navigator: {},
    localStorage: createStorage(),
    crypto: { randomUUID: () => "123e4567-e89b-42d3-a456-426614174000" },
    fetch: async () => { fetched = true; }
  });
  assert.equal(await context.LOGIFLOW_NOTIFICATION_SERVICE.registerForLaunch(), null);
  assert.equal(fetched, false);
});

await check("Native permission is requested only after the launch click", async () => {
  let registrations = 0;
  const shell = createBootstrapContext(async () => {
    registrations += 1;
    return "123e4567-e89b-42d3-a456-426614174000";
  });
  await settleBootstrap();
  assert.equal(registrations, 0);
  assert.equal(shell.elements.launchButton.hidden, false);
  await shell.listeners.click();
  assert.equal(registrations, 1);
});

await check("Apps Script redirect carries only nativeInstallId", async () => {
  const installId = "123e4567-e89b-42d3-a456-426614174000";
  const shell = createBootstrapContext(async () => installId);
  await settleBootstrap();
  await shell.listeners.click();
  const target = new URL(shell.redirects[0]);
  assert.equal(target.searchParams.get("nativeInstallId"), installId);
  assert.deepEqual([...target.searchParams.keys()], ["nativeInstallId"]);
});

await check("Firebase failure still redirects to Apps Script", async () => {
  const shell = createBootstrapContext(async () => { throw new Error("firebase unavailable"); });
  await settleBootstrap();
  await shell.listeners.click();
  assert.equal(shell.redirects.length, 1);
  assert.equal(new URL(shell.redirects[0]).search, "");
});

await check("Never-resolving registration times out to one fail-open redirect", async () => {
  const pendingTimers = [];
  const shell = createBootstrapContext(
    () => new Promise(() => {}),
    {
      setTimeout: (callback, delay) => {
        pendingTimers.push({ callback, delay });
        return pendingTimers.length;
      },
      clearTimeout() {}
    }
  );
  await settleBootstrap();
  const launch = shell.listeners.click();
  await Promise.resolve();
  assert.equal(shell.redirects.length, 0);
  assert.equal(pendingTimers.length, 1);
  assert.equal(pendingTimers[0].delay, 4000);
  pendingTimers[0].callback();
  await launch;
  assert.equal(shell.redirects.length, 1);
  assert.equal(new URL(shell.redirects[0]).search, "");
});

await check("Late registration completion cannot trigger a second redirect", async () => {
  const pendingTimers = [];
  let completeRegistration;
  const registration = new Promise((resolve) => { completeRegistration = resolve; });
  const shell = createBootstrapContext(
    () => registration,
    {
      setTimeout: (callback, delay) => {
        pendingTimers.push({ callback, delay });
        return pendingTimers.length;
      },
      clearTimeout() {}
    }
  );
  await settleBootstrap();
  const launch = shell.listeners.click();
  await Promise.resolve();
  assert.equal(pendingTimers[0].delay, 4000);
  pendingTimers[0].callback();
  await launch;
  completeRegistration("123e4567-e89b-42d3-a456-426614174000");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(shell.redirects.length, 1);
  assert.equal(new URL(shell.redirects[0]).search, "");
});

await check("Firebase bootstrap supports anonymous authentication", async () => {
  assert.match(firebaseSource, /signInAnonymously/);
  assert.match(firebaseSource, /getIdToken/);
});

await check("Client contains no iframe or postMessage notification bridge", async () => {
  const activeClient = [html, notificationSource, bootstrapSource].join("\n");
  assert.doesNotMatch(activeClient, /<iframe\b|postMessage\s*\(|addEventListener\s*\(\s*["']message["']/i);
});

await check("Client config contains no bridge secret", async () => {
  const clientSource = [firebaseConfigSource, notificationSource, bootstrapSource, html].join("\n");
  assert.doesNotMatch(clientSource, /LOGIFLOW_BRIDGE_SECRET|x-logiflow-secret|bridgeSecret/i);
});

await check("Mobile package exposes the bundled Node QA command", async () => {
  assert.equal(mobilePackage.scripts["qa:notifications"], "node ../release/scripts/qa-notification-client.mjs");
});

for (const name of passes) console.log(`[PASS] ${name}`);
for (const failure of failures) console.error(`[FAIL] ${failure.name}: ${failure.detail}`);
console.log(`${passes.length} passed, ${failures.length} failed`);
if (failures.length) process.exitCode = 1;
